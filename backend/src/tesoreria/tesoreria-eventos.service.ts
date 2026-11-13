import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AlcanceRol,
  EstadoEvento,
  EstadoPedidoEvento,
  EstadoTicketEvento,
  MetodoPago,
  Prisma,
  TipoCuenta,
  TipoEvento,
  TipoMovimientoFinanciero,
} from '@prisma/client';
import { generateTokenQR, verifyTokenQR } from '../common/utils/qr-token.util.js';
import { parsearFechaOperacion } from '../common/utils/fechas.util.js';
import { filtroUsuariosPorAlcance } from '../common/scope/alcance.util.js';
import type { AlcanceAcceso, AuthUser } from '../common/types/auth.types.js';
import type {
  AcreditarGananciasEventoDto,
  ActualizarEventoDto,
  ActualizarPedidoEventoDto,
  CrearEventoDto,
  CrearPedidoEventoDto,
  ValidarTicketQrDto,
} from './tesoreria.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  aCentavos,
  assertSaldoCuentaDisponibleEnTx,
  centavosADecimal,
  deCentavos,
  lockFilasPorIds,
  runInTransaction,
} from './tesoreria-shared.js';

@Injectable()
export class TesoreriaEventosService {
  constructor(private readonly prisma: PrismaService) {}

  // ===========================================================================
  // EVENTOS ECONÓMICOS, PEDIDOS Y TICKETS QR (FASE 4)
  // ===========================================================================

  private assertActorTienePermisoEvento(
    actor: AuthUser,
    alcance: AlcanceAcceso,
    permisosRequeridos: string[],
    message: string,
  ): void {
    if (!actor?.asignaciones || actor.asignaciones.length === 0) return;
    const tiene = actor.asignaciones.some((a) => {
      if (alcance.tipo === 'GLOBAL' && a.alcance !== undefined && a.alcance !== AlcanceRol.GLOBAL) return false;
      if (alcance.tipo === 'UNIDAD' && a.alcance !== undefined && a.alcance === AlcanceRol.PROPIO) return false;
      return a.permisos.some((p) => permisosRequeridos.includes(p));
    });
    if (!tiene) {
      throw new ForbiddenException(message);
    }
  }

  private sanitizeItemsEventoParaPropio<T extends Record<string, any>>(items: T[]): Omit<T, 'costoUnitario' | 'gananciaUnitaria' | 'stockTotal'>[] {
    return items.map(({ costoUnitario: _c, gananciaUnitaria: _g, stockTotal: _st, ...publico }) => publico);
  }

  private calcularPreciosItemEvento(it: {
    precioVenta: number | string;
    costoUnitario?: number | string;
    gananciaUnitaria?: number | string;
  }) {
    const precioCts = aCentavos(it.precioVenta);
    const costoCts = aCentavos(it.costoUnitario ?? 0);
    const gananciaCts =
      it.gananciaUnitaria !== undefined ? aCentavos(it.gananciaUnitaria) : precioCts - costoCts;
    return {
      precioVenta: centavosADecimal(precioCts),
      costoUnitario: centavosADecimal(costoCts),
      gananciaUnitaria: centavosADecimal(gananciaCts),
    };
  }

  private calcularItemsPedido<
    T extends {
      id: number;
      nombre: string;
      precioVenta: Prisma.Decimal | number | string;
      gananciaUnitaria: Prisma.Decimal | number | string;
      stockDisponible: number | null;
    },
  >(
    itemsDto: Array<{ itemId: number; cantidad: number }>,
    itemsMap: Map<number, T>,
  ) {
    let totalVentaCts = 0;
    let totalGananciaCts = 0;

    const itemsCalculados: Array<{
      item: T;
      cantidad: number;
      precioUnitario: Prisma.Decimal;
      subtotal: Prisma.Decimal;
      gananciaUnitaria: Prisma.Decimal;
      subtotalGanancia: Prisma.Decimal;
    }> = [];

    for (const pItem of itemsDto) {
      const dbItem = itemsMap.get(pItem.itemId);
      if (!dbItem) {
        throw new BadRequestException(`El producto con ID ${pItem.itemId} no pertenece a este evento`);
      }
      if (dbItem.stockDisponible !== null && dbItem.stockDisponible < pItem.cantidad) {
        throw new BadRequestException(
          `Stock insuficiente para "${dbItem.nombre}". Disponibles: ${dbItem.stockDisponible}`,
        );
      }

      const pUnitCts = aCentavos(dbItem.precioVenta);
      const subCts = pUnitCts * pItem.cantidad;
      const gUnitCts = aCentavos(dbItem.gananciaUnitaria);
      const subGCts = gUnitCts * pItem.cantidad;

      totalVentaCts += subCts;
      totalGananciaCts += subGCts;

      itemsCalculados.push({
        item: dbItem,
        cantidad: pItem.cantidad,
        precioUnitario: centavosADecimal(pUnitCts),
        subtotal: centavosADecimal(subCts),
        gananciaUnitaria: centavosADecimal(gUnitCts),
        subtotalGanancia: centavosADecimal(subGCts),
      });
    }

    return { itemsCalculados, totalVentaCts, totalGananciaCts };
  }

  async listarEventos(alcance: AlcanceAcceso, tipo?: TipoEvento) {
    const esPropio = alcance.tipo === 'PROPIO';
    const usarAgregadoSql =
      !esPropio &&
      typeof (this.prisma as { $queryRaw?: unknown }).$queryRaw === 'function' &&
      typeof this.prisma.pedidoEvento?.groupBy === 'function';

    const where: Prisma.EventoWhereInput = {
      ...(tipo ? { tipo } : {}),
      ...(esPropio
        ? { estado: { in: [EstadoEvento.PUBLICADO, EstadoEvento.FINALIZADO] } }
        : {}),
    };

    const eventos = await this.prisma.evento.findMany({
      where,
      take: 200,
      include: {
        rubro: { select: { id: true, nombre: true } },
        cuenta: { select: { id: true, nombre: true, tipo: true } },
        creadoPor: { select: { id: true, nombre: true, apellido: true } },
        items: { orderBy: { id: 'asc' } },
        ...(!esPropio && !usarAgregadoSql
          ? {
              pedidos: {
                select: {
                  id: true,
                  total: true,
                  totalGanancia: true,
                  gananciaAcreditada: true,
                  estado: true,
                  tickets: {
                    select: { id: true, estado: true, cantidad: true },
                  },
                },
              },
            }
          : {}),
      },
      orderBy: { fechaEvento: 'desc' },
    });

    const metricasSqlMap = new Map<
      number,
      {
        cantidadPedidos: number;
        totalVentaCts: number;
        totalGananciaCts: number;
        totalTickets: number;
        ticketsRetirados: number;
      }
    >();

    if (usarAgregadoSql && eventos.length > 0) {
      const eventoIds = eventos.map((e) => e.id);
      const [pedidosAgg, ticketsAgg] = await Promise.all([
        this.prisma.pedidoEvento.groupBy({
          by: ['eventoId', 'estado'],
          where: { eventoId: { in: eventoIds } },
          _count: { id: true },
          _sum: { total: true, totalGanancia: true },
        }),
        this.prisma.$queryRaw<
          Array<{
            eventoId: number;
            estado: string;
            cantidad: number;
          }>
        >`
          SELECT
            pe."evento_id" AS "eventoId",
            te."estado"::text AS estado,
            COALESCE(SUM(te."cantidad"), 0)::int AS cantidad
          FROM "tickets_evento" te
          INNER JOIN "pedidos_evento" pe ON pe."id" = te."pedido_id"
          WHERE pe."evento_id" IN (${Prisma.join(eventoIds)})
            AND pe."estado" <> 'CANCELADO'::"EstadoPedidoEvento"
          GROUP BY pe."evento_id", te."estado"
        `,
      ]);

      const ensureMetric = (eventoId: number) => {
        if (!metricasSqlMap.has(eventoId)) {
          metricasSqlMap.set(eventoId, {
            cantidadPedidos: 0,
            totalVentaCts: 0,
            totalGananciaCts: 0,
            totalTickets: 0,
            ticketsRetirados: 0,
          });
        }
        return metricasSqlMap.get(eventoId)!;
      };

      for (const row of pedidosAgg) {
        const m = ensureMetric(row.eventoId);
        m.cantidadPedidos += row._count.id;
        if (row.estado !== EstadoPedidoEvento.CANCELADO) {
          m.totalVentaCts += aCentavos(row._sum.total ?? 0);
          m.totalGananciaCts += aCentavos(row._sum.totalGanancia ?? 0);
        }
      }

      for (const tRow of ticketsAgg) {
        const m = ensureMetric(Number(tRow.eventoId));
        const cant = Number(tRow.cantidad);
        m.totalTickets += cant;
        if (tRow.estado === EstadoTicketEvento.UTILIZADO) {
          m.ticketsRetirados += cant;
        }
      }
    }

    return eventos.map((ev: any) => {
      let cantidadPedidos = 0;
      let totalVentaCts = 0;
      let totalGananciaCts = 0;
      let totalTickets = 0;
      let ticketsRetirados = 0;

      if (!esPropio) {
        if (usarAgregadoSql) {
          const m = metricasSqlMap.get(ev.id);
          if (m) {
            cantidadPedidos = m.cantidadPedidos;
            totalVentaCts = m.totalVentaCts;
            totalGananciaCts = m.totalGananciaCts;
            totalTickets = m.totalTickets;
            ticketsRetirados = m.ticketsRetirados;
          }
        } else {
          const pedidos = Array.isArray(ev.pedidos) ? ev.pedidos : [];
          cantidadPedidos = pedidos.length;
          for (const p of pedidos) {
            if (p.estado !== EstadoPedidoEvento.CANCELADO) {
              totalVentaCts += aCentavos(p.total);
              totalGananciaCts += aCentavos(p.totalGanancia);
              for (const t of p.tickets ?? []) {
                totalTickets += t.cantidad;
                if (t.estado === EstadoTicketEvento.UTILIZADO) {
                  ticketsRetirados += t.cantidad;
                }
              }
            }
          }
        }
      }

      return {
        id: ev.id,
        titulo: ev.titulo,
        descripcion: ev.descripcion,
        tipo: ev.tipo,
        estado: ev.estado,
        fechaEvento: ev.fechaEvento,
        fechaFin: ev.fechaFin,
        lugarEntrega: ev.lugarEntrega,
        rubro: ev.rubro,
        rubroId: ev.rubroId,
        cuenta: esPropio ? null : ev.cuenta,
        cuentaId: esPropio ? null : ev.cuentaId,
        creadoPor: ev.creadoPor,
        items: esPropio ? this.sanitizeItemsEventoParaPropio(ev.items) : ev.items,
        ...(esPropio
          ? {}
          : {
              metricas: {
                cantidadPedidos,
                totalVenta: deCentavos(totalVentaCts),
                totalGanancia: deCentavos(totalGananciaCts),
                totalTickets,
                ticketsRetirados,
                porcentajeRetirado:
                  totalTickets > 0 ? Math.round((ticketsRetirados / totalTickets) * 10000) / 100 : 0,
              },
            }),
      };
    });
  }

  async obtenerEventoPorId(alcance: AlcanceAcceso, id: number) {
    const ev = await this.prisma.evento.findUnique({
      where: { id },
      include: {
        rubro: { select: { id: true, nombre: true } },
        cuenta: { select: { id: true, nombre: true, tipo: true } },
        creadoPor: { select: { id: true, nombre: true, apellido: true } },
        items: { orderBy: { id: 'asc' } },
        pedidos: {
          where:
            alcance.tipo === 'PROPIO'
              ? { vendedorUsuarioId: alcance.usuarioId }
              : alcance.tipo === 'UNIDAD'
                ? { vendedorUsuario: filtroUsuariosPorAlcance(alcance) }
                : {},
          include: {
            vendedorUsuario: { select: { id: true, nombre: true, apellido: true, dni: true } },
            registradoPor: { select: { id: true, nombre: true, apellido: true } },
            detalles: { include: { item: true } },
            tickets: {
              include: {
                item: true,
                validador: { select: { id: true, nombre: true, apellido: true } },
              },
              orderBy: { id: 'asc' },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!ev) throw new NotFoundException('Evento no encontrado');
    if (
      alcance.tipo === 'PROPIO' &&
      ev.estado !== EstadoEvento.PUBLICADO &&
      ev.estado !== EstadoEvento.FINALIZADO
    ) {
      throw new NotFoundException('Evento no encontrado');
    }
    if (alcance.tipo === 'PROPIO') {
      return {
        ...ev,
        cuenta: null,
        cuentaId: null,
        items: this.sanitizeItemsEventoParaPropio(ev.items),
      };
    }
    return ev;
  }

  async crearEvento(actor: AuthUser, alcance: AlcanceAcceso, dto: CrearEventoDto) {
    if (alcance.tipo !== 'GLOBAL') {
      throw new ForbiddenException('Solo usuarios con alcance global pueden crear eventos');
    }

    if (dto.rubroId) {
      const rubro = await this.prisma.rubroContable.findUnique({ where: { id: dto.rubroId } });
      if (!rubro) throw new NotFoundException('El rubro contable indicado no existe');
    }

    if (dto.cuentaId) {
      const cuenta = await this.prisma.cuentaFinanciera.findUnique({ where: { id: dto.cuentaId } });
      if (!cuenta) throw new NotFoundException('La cuenta financiera indicada no existe');
      if (!cuenta.activa) throw new BadRequestException('La cuenta financiera se encuentra inactiva');
    }

    return this.prisma.evento.create({
      data: {
        titulo: dto.titulo,
        descripcion: dto.descripcion,
        tipo: dto.tipo as TipoEvento,
        estado: (dto.estado || EstadoEvento.PUBLICADO) as EstadoEvento,
        fechaEvento: parsearFechaOperacion(dto.fechaEvento),
        fechaFin: dto.fechaFin ? parsearFechaOperacion(dto.fechaFin) : null,
        lugarEntrega: dto.lugarEntrega,
        rubroId: dto.rubroId ?? null,
        cuentaId: dto.cuentaId ?? null,
        creadoPorUsuarioId: actor.sub,
        items: {
          create: dto.items.map((it) => ({
            nombre: it.nombre,
            descripcion: it.descripcion,
            ...this.calcularPreciosItemEvento(it),
            stockTotal: it.stockTotal ?? null,
            stockDisponible: it.stockTotal ?? null,
          })),
        },
      },
      include: {
        items: true,
        rubro: true,
        cuenta: true,
      },
    });
  }

  async actualizarEvento(actor: AuthUser, alcance: AlcanceAcceso, id: number, dto: ActualizarEventoDto) {
    if (alcance.tipo !== 'GLOBAL') {
      throw new ForbiddenException('Solo usuarios con alcance global pueden editar eventos');
    }

    return this.prisma.$transaction(async (tx) => {
      await lockFilasPorIds(tx, 'eventos', [id]);

      const evento = await tx.evento.findUnique({ where: { id } });
      if (!evento) throw new NotFoundException('Evento no encontrado');

      if (
        evento.estado === EstadoEvento.CANCELADO &&
        dto.estado &&
        dto.estado !== EstadoEvento.CANCELADO
      ) {
        throw new BadRequestException('No se puede reactivar un evento ya cancelado');
      }

      if (dto.rubroId) {
        const rubro = await tx.rubroContable.findUnique({ where: { id: dto.rubroId } });
        if (!rubro) throw new NotFoundException('El rubro contable indicado no existe');
      }

      if (dto.cuentaId) {
        const cuenta = await tx.cuentaFinanciera.findUnique({ where: { id: dto.cuentaId } });
        if (!cuenta) throw new NotFoundException('La cuenta financiera indicada no existe');
        if (!cuenta.activa) throw new BadRequestException('La cuenta financiera se encuentra inactiva');
      }

      if (dto.items && dto.items.length > 0) {
        if (evento.estado === EstadoEvento.FINALIZADO || evento.estado === EstadoEvento.CANCELADO) {
          throw new BadRequestException('No se pueden reemplazar los productos de un evento finalizado o cancelado');
        }
        const tienePedidos = await tx.pedidoEvento.count({ where: { eventoId: id } });
        if (tienePedidos > 0) {
          throw new ConflictException(
            'No se pueden reemplazar los productos de un evento que ya posee pedidos registrados',
          );
        }
        await tx.itemEvento.deleteMany({ where: { eventoId: id } });
        await tx.itemEvento.createMany({
          data: dto.items.map((it) => ({
            eventoId: id,
            nombre: it.nombre,
            descripcion: it.descripcion,
            ...this.calcularPreciosItemEvento(it),
            stockTotal: it.stockTotal ?? null,
            stockDisponible: it.stockTotal ?? null,
          })),
        });
      }

      return tx.evento.update({
        where: { id },
        data: {
          ...(dto.titulo ? { titulo: dto.titulo } : {}),
          ...(dto.descripcion !== undefined ? { descripcion: dto.descripcion } : {}),
          ...(dto.tipo ? { tipo: dto.tipo as TipoEvento } : {}),
          ...(dto.estado ? { estado: dto.estado as EstadoEvento } : {}),
          ...(dto.fechaEvento ? { fechaEvento: parsearFechaOperacion(dto.fechaEvento) } : {}),
          ...(dto.fechaFin !== undefined ? { fechaFin: dto.fechaFin ? parsearFechaOperacion(dto.fechaFin) : null } : {}),
          ...(dto.lugarEntrega !== undefined ? { lugarEntrega: dto.lugarEntrega } : {}),
          ...(dto.rubroId !== undefined ? { rubroId: dto.rubroId } : {}),
          ...(dto.cuentaId !== undefined ? { cuentaId: dto.cuentaId } : {}),
        },
        include: {
          items: true,
          rubro: true,
          cuenta: true,
        },
      });
    });
  }

  async eliminarEvento(alcance: AlcanceAcceso, id: number) {
    if (alcance.tipo !== 'GLOBAL') {
      throw new ForbiddenException('Solo usuarios con alcance global pueden eliminar eventos económicos');
    }

    const evento = await this.prisma.evento.findUnique({
      where: { id },
      include: {
        pedidos: {
          include: {
            tickets: true,
          },
        },
      },
    });

    if (!evento) {
      throw new NotFoundException(`Evento con ID ${id} no encontrado`);
    }

    const tieneGananciasAcreditadas = evento.pedidos.some((p) => p.gananciaAcreditada);
    if (tieneGananciasAcreditadas) {
      throw new BadRequestException(
        'No se puede eliminar un evento que ya tiene pedidos con ganancias liquidadas a las familias. Puede marcarlo como CANCELADO o FINALIZADO.',
      );
    }

    const tieneTicketsUtilizados = evento.pedidos.some((p) =>
      p.tickets.some((t) => t.estado === EstadoTicketEvento.UTILIZADO),
    );
    if (tieneTicketsUtilizados) {
      throw new BadRequestException(
        'No se puede eliminar un evento con vales o entradas ya canjeadas/utilizadas. Puede cambiar su estado a CANCELADO.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.movimientoFinanciero.deleteMany({
        where: { pedidoEvento: { eventoId: id } },
      });

      await tx.ticketEvento.deleteMany({
        where: { pedido: { eventoId: id } },
      });

      await tx.detallePedidoEvento.deleteMany({
        where: { pedido: { eventoId: id } },
      });

      await tx.pedidoEvento.deleteMany({
        where: { eventoId: id },
      });

      await tx.itemEvento.deleteMany({
        where: { eventoId: id },
      });

      return tx.evento.delete({
        where: { id },
      });
    });
  }

  async crearPedidoEvento(actor: AuthUser, alcance: AlcanceAcceso, dto: CrearPedidoEventoDto) {
    if (alcance.tipo === 'PROPIO') {
      if (dto.vendedorUsuarioId && dto.vendedorUsuarioId !== actor.sub) {
        throw new ForbiddenException('Solo puedes cargar pedidos a tu propio nombre');
      }
      if (dto.cuentaId) {
        throw new ForbiddenException('No tienes permisos para imputar cobros a cuentas financieras');
      }
      dto.vendedorUsuarioId = actor.sub;
      dto.cuentaId = undefined;
    } else {
      this.assertActorTienePermisoEvento(
        actor,
        alcance,
        ['eventos.vender', 'eventos.gestionar', 'tesoreria.gestionar'],
        'No tienes permisos para registrar ventas en este alcance',
      );
      if (alcance.tipo === 'UNIDAD' && dto.vendedorUsuarioId) {
        const vendedor = await this.prisma.usuario.findFirst({
          where: { AND: [{ id: dto.vendedorUsuarioId }, filtroUsuariosPorAlcance(alcance)] },
        });
        if (!vendedor) {
          throw new ForbiddenException('El vendedor asignado no pertenece a su unidad');
        }
      }
    }

    const evento = await this.prisma.evento.findUnique({
      where: { id: dto.eventoId },
      include: { items: true },
    });
    if (!evento) throw new NotFoundException('Evento no encontrado');
    if (evento.estado !== EstadoEvento.PUBLICADO) {
      throw new BadRequestException('El evento no está habilitado para recibir nuevos pedidos');
    }

    const itemsMap = new Map(evento.items.map((i) => [i.id, i]));
    const { itemsCalculados, totalVentaCts, totalGananciaCts } = this.calcularItemsPedido(
      dto.items,
      itemsMap,
    );

    return this.prisma.$transaction(async (tx) => {
      if (dto.cuentaId && tx.cuentaFinanciera?.findUnique) {
        const cuentaCobro = await tx.cuentaFinanciera.findUnique({ where: { id: dto.cuentaId } });
        if (!cuentaCobro) throw new NotFoundException('La cuenta financiera seleccionada no existe');
        if ('activa' in cuentaCobro && !cuentaCobro.activa) throw new BadRequestException('La cuenta financiera seleccionada se encuentra inactiva');
        if (dto.metodoPago === MetodoPago.EFECTIVO && cuentaCobro.tipo !== TipoCuenta.CAJA_EFECTIVO) {
          throw new BadRequestException('Los cobros en efectivo deben imputarse a una cuenta de Caja en efectivo');
        }
        if (dto.metodoPago === MetodoPago.TRANSFERENCIA && cuentaCobro.tipo !== TipoCuenta.BANCO) {
          throw new BadRequestException('Las transferencias deben imputarse a una cuenta bancaria');
        }
      }

      // 1. Crear Pedido
      const pedido = await tx.pedidoEvento.create({
        data: {
          eventoId: evento.id,
          compradorNombre: dto.compradorNombre,
          compradorContacto: dto.compradorContacto,
          vendedorUsuarioId: dto.vendedorUsuarioId ?? null,
          total: centavosADecimal(totalVentaCts),
          totalGanancia: centavosADecimal(totalGananciaCts),
          estado: dto.cuentaId ? EstadoPedidoEvento.PAGADO : EstadoPedidoEvento.PENDIENTE,
          metodoPago: (dto.metodoPago as MetodoPago) ?? null,
          cuentaId: dto.cuentaId ?? null,
          registradoPorUsuarioId: actor.sub,
          observaciones: dto.observaciones,
          detalles: {
            create: itemsCalculados.map((it) => ({
              itemId: it.item.id,
              cantidad: it.cantidad,
              precioUnitario: it.precioUnitario,
              subtotal: it.subtotal,
              gananciaUnitaria: it.gananciaUnitaria,
              subtotalGanancia: it.subtotalGanancia,
            })),
          },
        },
      });

      // 2. Generar Tickets QR y descontar stock de forma atómica
      for (const it of itemsCalculados) {
        await tx.ticketEvento.create({
          data: {
            pedidoId: pedido.id,
            itemId: it.item.id,
            tokenQr: generateTokenQR({ eventoId: evento.id, pedidoId: pedido.id }),
            cantidad: it.cantidad,
            estado: EstadoTicketEvento.ACTIVO,
          },
        });

        // Actualizar stock atómicamente si correspondiese
        if (it.item.stockDisponible !== null) {
          if (tx.itemEvento?.updateMany) {
            const resStock = await tx.itemEvento.updateMany({
              where: {
                id: it.item.id,
                stockDisponible: { gte: it.cantidad },
              },
              data: {
                stockDisponible: { decrement: it.cantidad },
              },
            });
            if (resStock.count === 0) {
              throw new BadRequestException(
                `Stock insuficiente para "${it.item.nombre}". No hay suficiente disponibilidad para completar el pedido.`,
              );
            }
          } else if (tx.itemEvento?.update) {
            await tx.itemEvento.update({
              where: { id: it.item.id },
              data: { stockDisponible: { decrement: it.cantidad } },
            });
          }
        }
      }

      // 3. Si se cobra en el acto en Caja o Banco, asentar en libro diario
      if (dto.cuentaId && totalVentaCts > 0) {
        await tx.movimientoFinanciero.create({
          data: {
            cuentaId: dto.cuentaId,
            fecha: new Date(),
            tipo: TipoMovimientoFinanciero.INGRESO_COBRANZA,
            montoIngreso: centavosADecimal(totalVentaCts),
            montoEgreso: 0,
            conceptoTexto: `Cobro Pedido #${pedido.id} (${evento.titulo}) - ${dto.compradorNombre}`,
            pedidoEventoId: pedido.id,
            rubroId: evento.rubroId ?? null,
            creadoPorUsuarioId: actor.sub,
          },
        });
      }

      return tx.pedidoEvento.findUnique({
        where: { id: pedido.id },
        include: {
          detalles: { include: { item: true } },
          tickets: { include: { item: true } },
          vendedorUsuario: { select: { id: true, nombre: true, apellido: true } },
        },
      });
    });
  }

  async actualizarPedidoEvento(
    actor: AuthUser,
    alcance: AlcanceAcceso,
    id: number,
    dto: ActualizarPedidoEventoDto,
  ) {
    return runInTransaction(this.prisma, async (tx) => {
      await lockFilasPorIds(tx, 'pedidos_evento', [id]);

      const findPedido = tx.pedidoEvento?.findUnique
        ? tx.pedidoEvento.findUnique.bind(tx.pedidoEvento)
        : this.prisma.pedidoEvento.findUnique.bind(this.prisma.pedidoEvento);

      const pedido = await findPedido({
        where: { id },
        include: {
          evento: { include: { items: true } },
          detalles: true,
          tickets: true,
        },
      });
      if (!pedido) throw new NotFoundException('Pedido no encontrado');

      if (alcance.tipo === 'PROPIO') {
        if (pedido.vendedorUsuarioId !== actor.sub && pedido.registradoPorUsuarioId !== actor.sub) {
          throw new ForbiddenException('No tienes permisos para modificar este pedido');
        }
        if (pedido.estado === EstadoPedidoEvento.PAGADO) {
          throw new ForbiddenException('No tienes permisos para modificar un pedido ya cobrado');
        }
        if (dto.vendedorUsuarioId && dto.vendedorUsuarioId !== actor.sub) {
          throw new ForbiddenException('Solo puedes asignar pedidos a tu propio usuario');
        }
        if (dto.cuentaId !== undefined && dto.cuentaId !== null) {
          throw new ForbiddenException('No tienes permisos para imputar cobros a cuentas financieras');
        }
        dto.cuentaId = undefined;
      } else {
        this.assertActorTienePermisoEvento(
          actor,
          alcance,
          ['eventos.vender', 'eventos.gestionar', 'tesoreria.gestionar'],
          'No tienes permisos para modificar pedidos en este alcance',
        );
        if (pedido.estado === EstadoPedidoEvento.PAGADO) {
          this.assertActorTienePermisoEvento(
            actor,
            alcance,
            ['eventos.gestionar', 'tesoreria.gestionar'],
            'No tienes permisos para modificar un pedido ya cobrado',
          );
        }

        if (alcance.tipo === 'UNIDAD') {
          const findUsuario = tx.usuario?.findFirst
            ? tx.usuario.findFirst.bind(tx.usuario)
            : this.prisma.usuario.findFirst.bind(this.prisma.usuario);
          if (pedido.vendedorUsuarioId) {
            const vendedorActual = await findUsuario({
              where: { AND: [{ id: pedido.vendedorUsuarioId }, filtroUsuariosPorAlcance(alcance)] },
            });
            if (!vendedorActual && pedido.registradoPorUsuarioId !== actor.sub) {
              throw new ForbiddenException('El pedido pertenece a un miembro fuera de su unidad');
            }
          }
          if (dto.vendedorUsuarioId) {
            const nuevoVendedor = await findUsuario({
              where: { AND: [{ id: dto.vendedorUsuarioId }, filtroUsuariosPorAlcance(alcance)] },
            });
            if (!nuevoVendedor) {
              throw new ForbiddenException('El vendedor asignado no pertenece a su unidad');
            }
          }
        }
      }

      const tieneTicketUtilizado = pedido.tickets.some((t: any) => t.estado === EstadoTicketEvento.UTILIZADO);
      if (dto.items && dto.items.length > 0) {
        const detallesMap = new Map(pedido.detalles.map((d: any) => [d.itemId, d.cantidad]));
        const cambiaronItems =
          dto.items.length !== pedido.detalles.length ||
          dto.items.some((it) => detallesMap.get(it.itemId) !== it.cantidad);

        if (tieneTicketUtilizado && cambiaronItems) {
          throw new BadRequestException('No se pueden modificar los productos ni cantidades de un pedido cuyos vales QR ya fueron retirados');
        }

        if (!cambiaronItems) {
          dto.items = undefined;
        }
      }

      if (pedido.gananciaAcreditada) {
        throw new BadRequestException('No se puede modificar un pedido cuyas ganancias ya fueron acreditadas');
      }

      let totalVentaCts = aCentavos(pedido.total);
      let totalGananciaCts = aCentavos(pedido.totalGanancia);

      if (dto.items && dto.items.length > 0) {
        // 1. Restaurar stock anterior si correspondía
        for (const det of pedido.detalles) {
          const itDb = pedido.evento.items.find((i: any) => i.id === det.itemId);
          if (itDb && itDb.stockTotal !== null) {
            await tx.itemEvento.update({
              where: { id: det.itemId },
              data: { stockDisponible: { increment: det.cantidad } },
            });
          }
        }

        // 2. Eliminar tickets y detalles existentes
        await tx.ticketEvento.deleteMany({ where: { pedidoId: pedido.id } });
        await tx.detallePedidoEvento.deleteMany({ where: { pedidoId: pedido.id } });

        // 3. Obtener items actualizados con su stock actual en DB
        const itemsDb = await tx.itemEvento.findMany({
          where: { eventoId: pedido.eventoId },
        });
        const itemsMap = new Map<number, any>(itemsDb.map((i: any) => [i.id, i]));

        const calc = this.calcularItemsPedido(dto.items, itemsMap);
        totalVentaCts = calc.totalVentaCts;
        totalGananciaCts = calc.totalGananciaCts;

        // 4. Crear nuevos detalles y tickets
        for (const it of calc.itemsCalculados) {
          await tx.detallePedidoEvento.create({
            data: {
              pedidoId: pedido.id,
              itemId: it.item.id,
              cantidad: it.cantidad,
              precioUnitario: it.precioUnitario,
              subtotal: it.subtotal,
              gananciaUnitaria: it.gananciaUnitaria,
              subtotalGanancia: it.subtotalGanancia,
            },
          });

          await tx.ticketEvento.create({
            data: {
              pedidoId: pedido.id,
              itemId: it.item.id,
              tokenQr: generateTokenQR({ eventoId: pedido.eventoId, pedidoId: pedido.id }),
              cantidad: it.cantidad,
              estado: EstadoTicketEvento.ACTIVO,
            },
          });

          if (it.item.stockDisponible !== null) {
            if (tx.itemEvento?.updateMany) {
              const resStock = await tx.itemEvento.updateMany({
                where: {
                  id: it.item.id,
                  stockDisponible: { gte: it.cantidad },
                },
                data: {
                  stockDisponible: { decrement: it.cantidad },
                },
              });
              if (resStock.count === 0) {
                throw new BadRequestException(
                  `Stock insuficiente para "${it.item.nombre}". No hay suficiente disponibilidad para completar el pedido.`,
                );
              }
            } else if (tx.itemEvento?.update) {
              await tx.itemEvento.update({
                where: { id: it.item.id },
                data: { stockDisponible: { decrement: it.cantidad } },
              });
            }
          }
        }
      }

      const nuevaCuentaId = dto.cuentaId !== undefined ? dto.cuentaId : pedido.cuentaId;
      const nuevoTotal = dto.items ? centavosADecimal(totalVentaCts) : centavosADecimal(aCentavos(pedido.total));
      const nuevoEstado = nuevaCuentaId ? EstadoPedidoEvento.PAGADO : EstadoPedidoEvento.PENDIENTE;

      // Sincronizar MovimientoFinanciero si el pedido fue cobrado o se le quitó la cuenta
      const movExistente = await tx.movimientoFinanciero.findFirst({
        where: { pedidoEventoId: pedido.id },
      });

      if (nuevaCuentaId) {
        if (tx.cuentaFinanciera?.findUnique) {
          const cuentaDestino = await tx.cuentaFinanciera.findUnique({ where: { id: nuevaCuentaId } });
          if (!cuentaDestino) throw new NotFoundException('Cuenta seleccionada no encontrada');
          if ('activa' in cuentaDestino && !cuentaDestino.activa) throw new BadRequestException('La cuenta seleccionada está inactiva');
        }

        if (movExistente) {
          await lockFilasPorIds(tx, 'cuentas_financieras', [movExistente.cuentaId, nuevaCuentaId]);
          if (movExistente.cuentaId !== nuevaCuentaId) {
            const impOld = deCentavos(aCentavos(movExistente.montoIngreso));
            await assertSaldoCuentaDisponibleEnTx(
              tx,
              movExistente.cuentaId,
              impOld,
              (saldoOld) =>
                `Saldo insuficiente en la cuenta para transferir el cobro del pedido ($${saldoOld} disponibles vs $${impOld} requeridos).`,
            );
          } else {
            const deltaReduccionCts = aCentavos(movExistente.montoIngreso) - aCentavos(nuevoTotal);
            if (deltaReduccionCts > 0) {
              const deltaReduccion = deCentavos(deltaReduccionCts);
              await assertSaldoCuentaDisponibleEnTx(
                tx,
                movExistente.cuentaId,
                deltaReduccion,
                (saldoDisp) =>
                  `Saldo insuficiente en la cuenta para reducir el cobro del pedido ($${saldoDisp} disponibles vs $${deltaReduccion} de reducción).`,
              );
            }
          }

          await tx.movimientoFinanciero.update({
            where: { id: movExistente.id },
            data: {
              cuentaId: nuevaCuentaId,
              montoIngreso: nuevoTotal,
              conceptoTexto: `Cobro Venta Evento: ${pedido.evento.titulo} (Pedido #${pedido.id})`,
              rubroId: pedido.evento.rubroId || undefined,
            },
          });
        } else {
          await tx.movimientoFinanciero.create({
            data: {
              cuentaId: nuevaCuentaId,
              tipo: TipoMovimientoFinanciero.INGRESO_COBRANZA,
              montoIngreso: nuevoTotal,
              montoEgreso: 0,
              conceptoTexto: `Cobro Venta Evento: ${pedido.evento.titulo} (Pedido #${pedido.id})`,
              rubroId: pedido.evento.rubroId || undefined,
              pedidoEventoId: pedido.id,
              creadoPorUsuarioId: actor.sub,
            },
          });
        }
      } else if (movExistente) {
        const impOld = Number(movExistente.montoIngreso);
        await assertSaldoCuentaDisponibleEnTx(
          tx,
          movExistente.cuentaId,
          impOld,
          (saldoOld) =>
            `Saldo insuficiente en la cuenta para desasociar el pago del pedido ($${saldoOld} disponibles vs $${impOld} a revertir).`,
        );

        if (tx.movimientoFinanciero.delete) {
          await tx.movimientoFinanciero.delete({
            where: { id: movExistente.id },
          });
        }
      }

      // 5. Actualizar cabecera del pedido
      return tx.pedidoEvento.update({
        where: { id: pedido.id },
        data: {
          estado: nuevoEstado,
          ...(dto.compradorNombre ? { compradorNombre: dto.compradorNombre } : {}),
          ...(dto.compradorContacto !== undefined ? { compradorContacto: dto.compradorContacto } : {}),
          ...(dto.vendedorUsuarioId !== undefined ? { vendedorUsuarioId: dto.vendedorUsuarioId } : {}),
          ...(dto.observaciones !== undefined ? { observaciones: dto.observaciones } : {}),
          ...(dto.metodoPago !== undefined ? { metodoPago: dto.metodoPago as MetodoPago } : {}),
          ...(dto.cuentaId !== undefined ? { cuentaId: dto.cuentaId } : {}),
          ...(dto.items ? {
            total: nuevoTotal,
            totalGanancia: centavosADecimal(totalGananciaCts),
          } : {}),
        },
        include: {
          detalles: { include: { item: true } },
          tickets: { include: { item: true } },
          vendedorUsuario: { select: { id: true, nombre: true, apellido: true } },
        },
      });
    });
  }

  async eliminarPedidoEvento(actor: AuthUser, alcance: AlcanceAcceso, id: number) {
    return runInTransaction(this.prisma, async (tx) => {
      await lockFilasPorIds(tx, 'pedidos_evento', [id]);

      const findPedido = tx.pedidoEvento?.findUnique
        ? tx.pedidoEvento.findUnique.bind(tx.pedidoEvento)
        : this.prisma.pedidoEvento.findUnique.bind(this.prisma.pedidoEvento);

      const pedido = await findPedido({
        where: { id },
        include: {
          evento: { include: { items: true } },
          detalles: true,
          tickets: true,
        },
      });
      if (!pedido) throw new NotFoundException('Pedido no encontrado');

      if (alcance.tipo === 'PROPIO') {
        if (pedido.vendedorUsuarioId !== actor.sub && pedido.registradoPorUsuarioId !== actor.sub) {
          throw new ForbiddenException('No tienes permisos para eliminar este pedido');
        }
        if (pedido.estado === EstadoPedidoEvento.PAGADO) {
          throw new ForbiddenException('No tienes permisos para eliminar un pedido ya cobrado');
        }
      } else {
        this.assertActorTienePermisoEvento(
          actor,
          alcance,
          ['eventos.vender', 'eventos.gestionar', 'tesoreria.gestionar'],
          'No tienes permisos para eliminar pedidos en este alcance',
        );
        if (pedido.estado === EstadoPedidoEvento.PAGADO) {
          this.assertActorTienePermisoEvento(
            actor,
            alcance,
            ['eventos.gestionar', 'tesoreria.gestionar'],
            'No tienes permisos para eliminar un pedido ya cobrado',
          );
        }

        if (alcance.tipo === 'UNIDAD' && pedido.vendedorUsuarioId) {
          const findUsuario = tx.usuario?.findFirst
            ? tx.usuario.findFirst.bind(tx.usuario)
            : this.prisma.usuario.findFirst.bind(this.prisma.usuario);
          const vendedorActual = await findUsuario({
            where: { AND: [{ id: pedido.vendedorUsuarioId }, filtroUsuariosPorAlcance(alcance)] },
          });
          if (!vendedorActual && pedido.registradoPorUsuarioId !== actor.sub) {
            throw new ForbiddenException('El pedido pertenece a un miembro fuera de su unidad');
          }
        }
      }

      const tieneTicketUtilizado = pedido.tickets.some((t: any) => t.estado === EstadoTicketEvento.UTILIZADO);
      if (tieneTicketUtilizado) {
        throw new BadRequestException('No se puede eliminar un pedido cuyos vales QR ya fueron utilizados');
      }

      if (pedido.gananciaAcreditada) {
        throw new BadRequestException('No se puede eliminar un pedido cuyas ganancias ya fueron acreditadas');
      }

      // 1. Restaurar stock si correspondía
      for (const det of pedido.detalles) {
        const itDb = pedido.evento.items.find((i: any) => i.id === det.itemId);
        if (itDb && itDb.stockTotal !== null) {
          await tx.itemEvento.update({
            where: { id: det.itemId },
            data: { stockDisponible: { increment: det.cantidad } },
          });
        }
      }

      // 2. Validar saldo disponible y cuenta activa antes de eliminar movimientos financieros asociados
      if (tx.movimientoFinanciero?.findMany) {
        const movsFinancieros = await tx.movimientoFinanciero.findMany({
          where: { pedidoEventoId: pedido.id },
          include: { cuenta: true },
        });
        await lockFilasPorIds(
          tx,
          'cuentas_financieras',
          movsFinancieros.map((m: any) => m.cuentaId),
        );
        for (const mov of movsFinancieros) {
          if (mov.cuenta && 'activa' in mov.cuenta && !mov.cuenta.activa) {
            throw new BadRequestException(`La cuenta financiera ${mov.cuenta.nombre} se encuentra inactiva.`);
          }
          const impacto = Number(mov.montoIngreso);
          await assertSaldoCuentaDisponibleEnTx(
            tx,
            mov.cuentaId,
            impacto,
            (saldoDisponible) =>
              `Saldo insuficiente en ${mov.cuenta?.nombre ?? mov.cuentaId} para revertir el cobro del pedido ($${saldoDisponible} disponibles vs $${impacto} a revertir).`,
          );
        }
      }

      if (tx.movimientoFinanciero?.deleteMany) {
        await tx.movimientoFinanciero.deleteMany({
          where: { pedidoEventoId: pedido.id },
        });
      }

      // 3. Eliminar tickets y detalles
      await tx.ticketEvento.deleteMany({
        where: { pedidoId: pedido.id },
      });

      await tx.detallePedidoEvento.deleteMany({
        where: { pedidoId: pedido.id },
      });

      return tx.pedidoEvento.delete({
        where: { id: pedido.id },
      });
    });
  }

  async validarTicketQr(actor: AuthUser, alcance: AlcanceAcceso, dto: ValidarTicketQrDto) {
    if (alcance.tipo === 'PROPIO') {
      throw new ForbiddenException('No tiene permisos para validar entradas QR');
    }
    this.assertActorTienePermisoEvento(
      actor,
      alcance,
      ['eventos.vender', 'eventos.gestionar', 'tesoreria.gestionar'],
      'No tienes permisos para validar entradas QR en este alcance',
    );

    const verification = verifyTokenQR(dto.tokenQr);
    if (!verification.valid) {
      throw new BadRequestException('El código QR es inválido o no corresponde a una auténtica');
    }

    return this.prisma.$transaction(async (tx) => {
      const ticket = await tx.ticketEvento.findUnique({
        where: { tokenQr: dto.tokenQr },
        include: {
          item: true,
          pedido: {
            include: {
              evento: true,
              vendedorUsuario: {
                select: {
                  id: true,
                  nombre: true,
                  apellido: true,
                  asignaciones: { where: { activo: true }, select: { unidadId: true } },
                },
              },
            },
          },
        },
      });

      if (!ticket) {
        throw new NotFoundException('Vale o entrada no encontrada en el sistema');
      }

      const pedidoIdReal = ticket.pedidoId ?? ticket.pedido?.id;
      const eventoIdReal = ticket.pedido?.eventoId ?? ticket.pedido?.evento?.id;
      if (
        (verification.eventoId !== undefined &&
          eventoIdReal !== undefined &&
          verification.eventoId !== eventoIdReal) ||
        (verification.pedidoId !== undefined &&
          pedidoIdReal !== undefined &&
          verification.pedidoId !== pedidoIdReal)
      ) {
        throw new BadRequestException('El código QR no coincide con el evento o pedido asociado');
      }

      await lockFilasPorIds(tx, 'pedidos_evento', [pedidoIdReal]);

      if (alcance.tipo === 'UNIDAD' && ticket.pedido.vendedorUsuarioId) {
        const uIds = ticket.pedido.vendedorUsuario?.asignaciones?.map((a: any) => a.unidadId) ?? [];
        const perteneceUnidad = uIds.some((uid: number) => alcance.unidadIds.includes(uid));
        if (!perteneceUnidad && ticket.pedido.registradoPorUsuarioId !== actor.sub) {
          throw new ForbiddenException('El vale pertenece a un pedido fuera de su unidad');
        }
      }

      if (ticket.pedido.estado === EstadoPedidoEvento.CANCELADO || ticket.pedido.evento.estado === EstadoEvento.CANCELADO) {
        return {
          ok: false,
          estado: 'CANCELADO',
          mensaje: 'El pedido o el evento asociado se encuentra cancelado.',
        };
      }

      if (ticket.pedido.evento?.estado && ticket.pedido.evento.estado !== EstadoEvento.PUBLICADO) {
        return {
          ok: false,
          estado: ticket.pedido.evento.estado,
          mensaje: `El evento no se encuentra abierto para entregas (Estado: ${ticket.pedido.evento.estado}).`,
        };
      }

      if (ticket.estado === EstadoTicketEvento.UTILIZADO) {
        const esPagoPendiente = ticket.pedido.estado === EstadoPedidoEvento.PENDIENTE;
        const montoTotalPedido = Number(ticket.pedido.total);
        const resolvedPedidoId = ticket.pedido?.id ?? ticket.pedidoId;
        return {
          ok: false,
          estado: 'YA_UTILIZADO',
          alertaPagoPendiente: esPagoPendiente,
          montoPendiente: esPagoPendiente ? montoTotalPedido : 0,
          pedidoId: resolvedPedidoId,
          mensaje: `Este vale ya fue retirado/utilizado el ${ticket.fechaUso ? new Date(ticket.fechaUso).toLocaleString('es-AR') : 'previamente'}.`,
          ticket: {
            id: ticket.id,
            pedidoId: resolvedPedidoId,
            producto: ticket.item.nombre,
            cantidad: ticket.cantidad,
            comprador: ticket.pedido.compradorNombre,
            vendedor: ticket.pedido.vendedorUsuario
              ? `${ticket.pedido.vendedorUsuario.nombre} ${ticket.pedido.vendedorUsuario.apellido}`
              : null,
            evento: ticket.pedido.evento.titulo,
            pedidoEstado: ticket.pedido.estado,
            pedidoTotal: montoTotalPedido,
            pedidoMetodoPago: ticket.pedido.metodoPago,
            fechaUso: ticket.fechaUso,
          },
        };
      }

      if (ticket.estado !== EstadoTicketEvento.ACTIVO) {
        return {
          ok: false,
          estado: ticket.estado,
          mensaje: `El vale no se encuentra activo (Estado actual: ${ticket.estado}).`,
        };
      }

      // Actualización atómica con control de concurrencia
      const updateRes = await tx.ticketEvento.updateMany({
        where: { id: ticket.id, estado: EstadoTicketEvento.ACTIVO },
        data: {
          estado: EstadoTicketEvento.UTILIZADO,
          fechaUso: new Date(),
          validadorUsuarioId: actor.sub,
        },
      });

      if (updateRes.count !== 1) {
        return {
          ok: false,
          estado: 'CONCURRENCIA',
          mensaje: 'El vale acaba de ser escaneado y procesado por otro dispositivo.',
        };
      }

      const esPagoPendiente = ticket.pedido.estado === EstadoPedidoEvento.PENDIENTE;
      const montoTotalPedido = Number(ticket.pedido.total);
      const resolvedPedidoId = ticket.pedido?.id ?? ticket.pedidoId;

      return {
        ok: true,
        estado: 'VALIDADO',
        alertaPagoPendiente: esPagoPendiente,
        montoPendiente: esPagoPendiente ? montoTotalPedido : 0,
        pedidoId: resolvedPedidoId,
        mensaje: esPagoPendiente
          ? `¡Entrega confirmada! (ATENCIÓN: Pago PENDIENTE de $${montoTotalPedido.toLocaleString('es-AR')} en puerta). Entregar: ${ticket.cantidad}x ${ticket.item.nombre}`
          : `¡Entrega confirmada! Entregar: ${ticket.cantidad}x ${ticket.item.nombre}`,
        ticket: {
          id: ticket.id,
          pedidoId: resolvedPedidoId,
          producto: ticket.item.nombre,
          cantidad: ticket.cantidad,
          comprador: ticket.pedido.compradorNombre,
          vendedor: ticket.pedido.vendedorUsuario
            ? `${ticket.pedido.vendedorUsuario.nombre} ${ticket.pedido.vendedorUsuario.apellido}`
            : null,
          evento: ticket.pedido.evento.titulo,
          pedidoEstado: ticket.pedido.estado,
          pedidoTotal: montoTotalPedido,
          pedidoMetodoPago: ticket.pedido.metodoPago,
          fechaUso: new Date(),
        },
      };
    });
  }

  async acreditarGananciasEvento(actor: AuthUser, alcance: AlcanceAcceso, dto: AcreditarGananciasEventoDto) {
    if (alcance.tipo !== 'GLOBAL') {
      throw new ForbiddenException('Solo usuarios con alcance global pueden liquidar ganancias de eventos');
    }

    return this.prisma.$transaction(
      async (tx) => {
        const findEvento = (tx as any).evento?.findUnique
          ? (tx as any).evento.findUnique.bind((tx as any).evento)
          : this.prisma.evento.findUnique.bind(this.prisma.evento);

        const evento = await findEvento({
          where: { id: dto.eventoId },
          include: {
            pedidos: {
              where: {
                vendedorUsuarioId: { not: null },
                gananciaAcreditada: false,
                estado: EstadoPedidoEvento.PAGADO,
              },
              include: {
                tickets: true,
                vendedorUsuario: true,
              },
            },
          },
        });

        if (!evento) throw new NotFoundException('Evento no encontrado');

        const pedidosParaAcreditar = evento.pedidos.filter((p: any) => {
          if (Number(p.totalGanancia) < 0) return false;
          if (!dto.soloRetirados) return true;
          // Validar que todos sus tickets estén en estado UTILIZADO
          return p.tickets.length > 0 && p.tickets.every((t: any) => t.estado === EstadoTicketEvento.UTILIZADO);
        });

        await lockFilasPorIds(
          tx,
          'pedidos_evento',
          pedidosParaAcreditar.map((p: any) => p.id),
        );

        let totalGananciaAcreditadaCts = 0;
        let pedidosAcreditadosCount = 0;

        for (const pedido of pedidosParaAcreditar) {
          const gananciaCts = aCentavos(pedido.totalGanancia);
          if (!pedido.vendedorUsuarioId) continue;

          if ((tx as any).pedidoEvento?.updateMany) {
            const claim = await (tx as any).pedidoEvento.updateMany({
              where: {
                id: pedido.id,
                gananciaAcreditada: false,
                estado: EstadoPedidoEvento.PAGADO,
              },
              data: {
                gananciaAcreditada: true,
                fechaAcreditacion: new Date(),
              },
            });
            if (claim.count !== 1) {
              continue;
            }
          } else {
            await tx.pedidoEvento.update({
              where: { id: pedido.id },
              data: {
                gananciaAcreditada: true,
                fechaAcreditacion: new Date(),
              },
            });
          }

          if (gananciaCts > 0) {
            await tx.usuario.update({
              where: { id: pedido.vendedorUsuarioId },
              data: {
                saldoAFavor: { increment: centavosADecimal(gananciaCts) },
              },
            });
          }

          totalGananciaAcreditadaCts += gananciaCts;
          pedidosAcreditadosCount++;
        }

        return {
          eventoId: evento.id,
          pedidosAcreditados: pedidosAcreditadosCount,
          totalGananciaAcreditada: deCentavos(totalGananciaAcreditadaCts),
        };
      },
      { timeout: 20000 },
    );
  }

  async obtenerMisTickets(actor: AuthUser) {
    return this.prisma.ticketEvento.findMany({
      where: {
        pedido: {
          OR: [
            { vendedorUsuarioId: actor.sub },
            { registradoPorUsuarioId: actor.sub },
          ],
        },
      },
      include: {
        item: true,
        pedido: {
          include: {
            evento: true,
            vendedorUsuario: { select: { id: true, nombre: true, apellido: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async obtenerMisPedidos(actor: AuthUser) {
    return this.prisma.pedidoEvento.findMany({
      where: {
        OR: [
          { vendedorUsuarioId: actor.sub },
          { registradoPorUsuarioId: actor.sub },
        ],
      },
      include: {
        evento: {
          select: {
            id: true,
            titulo: true,
            fechaEvento: true,
            lugarEntrega: true,
            estado: true,
            tipo: true,
            items: true,
          },
        },
        vendedorUsuario: { select: { id: true, nombre: true, apellido: true } },
        detalles: { include: { item: true } },
        tickets: {
          include: {
            item: true,
            validador: { select: { id: true, nombre: true, apellido: true } },
          },
          orderBy: { id: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
