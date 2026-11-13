import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  Prisma,
  TipoCuenta,
  TipoMovimientoFinanciero,
  TipoRubro,
} from '@prisma/client';
import {
  anioActual,
  parsearFechaOperacion,
} from '../common/utils/fechas.util.js';
import { assertUnidadEnAlcance } from '../common/scope/alcance.util.js';
import type { AlcanceAcceso, AuthUser } from '../common/types/auth.types.js';
import type {
  ActualizarCuentaFinancieraDto,
  ActualizarGastoDto,
  ActualizarIngresoDto,
  ActualizarRubroContableDto,
  ConsultaCuadroResultadosQueryDto,
  ConsultaLibroDiarioQueryDto,
  CrearCuentaFinancieraDto,
  CrearRubroContableDto,
  CrearTransferenciaDto,
  ListarGastosQueryDto,
  ListarIngresosQueryDto,
  ListarRubrosQueryDto,
  RegistrarGastoDto,
  RegistrarIngresoDto,
} from './tesoreria.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  NOMBRES_MESES,
  aCentavos,
  assertSaldoCuentaDisponibleEnTx,
  centavosADecimal,
  deCentavos,
  lockFilasPorIds,
  obtenerSaldoCuentaEnTx,
  parsearLimiteDia,
  runInTransaction,
} from './tesoreria-shared.js';

@Injectable()
export class TesoreriaCajaService {
  constructor(private readonly prisma: PrismaService) {}

  // ===========================================================================
  // 7. MOTOR FINANCIERO: CUENTAS, LIBRO DIARIO Y TRANSFERENCIAS (FASE 1)
  // ===========================================================================

  async listarCuentasFinancieras(alcance: AlcanceAcceso, incluirInactivas?: boolean) {
    if (alcance.tipo !== 'GLOBAL') {
      throw new ForbiddenException('Solo usuarios con alcance global pueden ver las cuentas de tesorería');
    }

    const cuentas = await this.prisma.cuentaFinanciera.findMany({
      where: incluirInactivas ? {} : { activa: true },
      orderBy: { id: 'asc' },
    });

    const agregados = await this.prisma.movimientoFinanciero.groupBy({
      by: ['cuentaId'],
      _sum: { montoIngreso: true, montoEgreso: true },
      _count: { id: true },
    });

    const aggMap = new Map(
      agregados.map((a) => [
        a.cuentaId,
        {
          ingresoCts: aCentavos(a._sum.montoIngreso ?? 0),
          egresoCts: aCentavos(a._sum.montoEgreso ?? 0),
          cantidad: a._count.id,
        },
      ]),
    );

    return cuentas.map((c) => {
      const agg = aggMap.get(c.id) ?? { ingresoCts: 0, egresoCts: 0, cantidad: 0 };
      const saldoCts = agg.ingresoCts - agg.egresoCts;
      const totalIngresos = deCentavos(agg.ingresoCts);
      const totalEgresos = deCentavos(agg.egresoCts);
      const saldoActual = deCentavos(saldoCts);

      return {
        id: c.id,
        nombre: c.nombre,
        tipo: c.tipo,
        activa: c.activa,
        saldoActual,
        saldoActualConsolidado: saldoActual,
        totalIngresos,
        totalEgresos,
        cantidadMovimientos: agg.cantidad,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      };
    });
  }

  async crearCuentaFinanciera(actor: AuthUser, alcance: AlcanceAcceso, dto: CrearCuentaFinancieraDto) {
    if (alcance.tipo !== 'GLOBAL') {
      throw new ForbiddenException('Solo usuarios con alcance global pueden administrar cuentas financieras');
    }

    const existe = await this.prisma.cuentaFinanciera.findFirst({
      where: { nombre: { equals: dto.nombre, mode: 'insensitive' } },
    });
    if (existe) {
      throw new ConflictException(`Ya existe una cuenta con el nombre "${dto.nombre}"`);
    }

    return this.prisma.cuentaFinanciera.create({
      data: {
        nombre: dto.nombre,
        tipo: dto.tipo,
        activa: true,
      },
    });
  }

  async actualizarCuentaFinanciera(
    actor: AuthUser,
    alcance: AlcanceAcceso,
    id: number,
    dto: ActualizarCuentaFinancieraDto,
  ) {
    if (alcance.tipo !== 'GLOBAL') {
      throw new ForbiddenException('Solo usuarios con alcance global pueden administrar cuentas financieras');
    }

    return runInTransaction(this.prisma, async (tx) => {
      await lockFilasPorIds(tx, 'cuentas_financieras', [id]);

      const cuenta = await tx.cuentaFinanciera.findUnique({ where: { id } });
      if (!cuenta) {
        throw new NotFoundException(`Cuenta con ID ${id} no encontrada`);
      }

      if (dto.activa === false && cuenta.activa) {
        const saldo = (await obtenerSaldoCuentaEnTx(tx, id)) ?? 0;
        if (aCentavos(saldo) !== 0) {
          throw new BadRequestException(
            'No se puede desactivar una cuenta con saldo no nulo. Transfiera los fondos antes de desactivarla',
          );
        }
      }

      if (dto.nombre && dto.nombre.toLowerCase() !== cuenta.nombre.toLowerCase()) {
        const existe = await tx.cuentaFinanciera.findFirst({
          where: { id: { not: id }, nombre: { equals: dto.nombre, mode: 'insensitive' } },
        });
        if (existe) {
          throw new ConflictException(`Ya existe otra cuenta con el nombre "${dto.nombre}"`);
        }
      }

      return tx.cuentaFinanciera.update({
        where: { id },
        data: {
          ...(dto.nombre ? { nombre: dto.nombre } : {}),
          ...(dto.tipo ? { tipo: dto.tipo } : {}),
          ...(dto.activa !== undefined ? { activa: dto.activa } : {}),
        },
      });
    });
  }

  async eliminarCuentaFinanciera(
    actor: AuthUser,
    alcance: AlcanceAcceso,
    id: number,
  ) {
    if (alcance.tipo !== 'GLOBAL') {
      throw new ForbiddenException('Solo usuarios con alcance global pueden administrar cuentas financieras');
    }

    return runInTransaction(this.prisma, async (tx) => {
      await lockFilasPorIds(tx, 'cuentas_financieras', [id]);

      const cuenta = await tx.cuentaFinanciera.findUnique({
        where: { id },
        include: {
          _count: {
            select: { movimientos: true },
          },
        },
      });
      if (!cuenta) {
        throw new NotFoundException(`Cuenta con ID ${id} no encontrada`);
      }

      const saldo = (await obtenerSaldoCuentaEnTx(tx, id)) ?? 0;
      if (aCentavos(saldo) !== 0) {
        throw new BadRequestException(
          `No se puede eliminar una cuenta con saldo no nulo ($${deCentavos(aCentavos(saldo)).toFixed(2)}). Transfiera los fondos antes de eliminarla`,
        );
      }

      if (cuenta._count.movimientos > 0) {
        const desactivada = await tx.cuentaFinanciera.update({
          where: { id },
          data: { activa: false },
        });
        return { ...desactivada, eliminadoPermanente: false };
      }

      const eliminada = await tx.cuentaFinanciera.delete({
        where: { id },
      });
      return { ...eliminada, eliminadoPermanente: true };
    });
  }

  async restaurarCuentaFinanciera(
    _actor: AuthUser,
    alcance: AlcanceAcceso,
    id: number,
  ) {
    if (alcance.tipo !== 'GLOBAL') {
      throw new ForbiddenException('Solo usuarios con alcance global pueden restaurar cuentas financieras');
    }

    const cuenta = await this.prisma.cuentaFinanciera.findUnique({ where: { id } });
    if (!cuenta) {
      throw new NotFoundException(`Cuenta con ID ${id} no encontrada`);
    }

    return this.prisma.cuentaFinanciera.update({
      where: { id },
      data: { activa: true },
    });
  }

  async obtenerLibroDiario(alcance: AlcanceAcceso, cuentaId: number, query: ConsultaLibroDiarioQueryDto) {
    if (alcance.tipo !== 'GLOBAL') {
      throw new ForbiddenException('Solo usuarios con alcance global pueden ver el libro diario');
    }

    const cuenta = await this.prisma.cuentaFinanciera.findUnique({ where: { id: cuentaId } });
    if (!cuenta) {
      throw new NotFoundException(`Cuenta con ID ${cuentaId} no encontrada`);
    }

    const fechaDesdeStr = query.fecha || query.desde;
    const fechaHastaStr = query.fecha || query.hasta;

    let fechaDesde: Date | undefined;
    let fechaHasta: Date | undefined;

    if (fechaDesdeStr) {
      fechaDesde = parsearLimiteDia(fechaDesdeStr, false);
    }

    if (fechaHastaStr) {
      fechaHasta = parsearLimiteDia(fechaHastaStr, true);
    }

    let saldoAnteriorCts = 0;
    if (fechaDesde) {
      const aggAnterior = await this.prisma.movimientoFinanciero.aggregate({
        where: {
          cuentaId,
          fecha: { lt: fechaDesde },
        },
        _sum: { montoIngreso: true, montoEgreso: true },
      });
      saldoAnteriorCts =
        aCentavos(aggAnterior._sum.montoIngreso ?? 0) - aCentavos(aggAnterior._sum.montoEgreso ?? 0);
    }
    const saldoAnterior = deCentavos(saldoAnteriorCts);

    const fechaFilter: Prisma.DateTimeFilter = {};
    if (fechaDesde) fechaFilter.gte = fechaDesde;
    if (fechaHasta) fechaFilter.lte = fechaHasta;

    const movimientos = await this.prisma.movimientoFinanciero.findMany({
      where: {
        cuentaId,
        ...(fechaDesde || fechaHasta ? { fecha: fechaFilter } : {}),
      },
      orderBy: [{ fecha: 'asc' }, { id: 'asc' }],
      include: {
        creadoPor: { select: { id: true, nombre: true, apellido: true } },
        rubro: { select: { id: true, nombre: true, tipo: true } },
        gasto: { select: { id: true, descripcion: true, anulado: true, comprobanteNro: true } },
        pago: {
          select: {
            id: true,
            usuarioId: true,
            usuario: { select: { id: true, nombre: true, apellido: true } },
            imputaciones: {
              select: {
                cargo: {
                  select: {
                    concepto: { select: { nombre: true } },
                    usuario: { select: { id: true, nombre: true, apellido: true } },
                  },
                },
              },
            },
          },
        },
        pedidoEvento: {
          select: {
            id: true,
            compradorNombre: true,
            evento: { select: { titulo: true } },
            vendedorUsuario: { select: { id: true, nombre: true, apellido: true } },
          },
        },
      },
    });

    let saldoAcumuladoCts = saldoAnteriorCts;
    let totalIngresosPeriodoCts = 0;
    let totalEgresosPeriodoCts = 0;

    const movimientosConSaldo = movimientos.map((m: any) => {
      const ingresoCts = aCentavos(m.montoIngreso);
      const egresoCts = aCentavos(m.montoEgreso);
      saldoAcumuladoCts += ingresoCts - egresoCts;
      totalIngresosPeriodoCts += ingresoCts;
      totalEgresosPeriodoCts += egresoCts;
      const ingreso = deCentavos(ingresoCts);
      const egreso = deCentavos(egresoCts);
      const saldoAcumulado = deCentavos(saldoAcumuladoCts);

      let conceptoTextoFinal = m.conceptoTexto;
      let miembroNombre: string | null = null;
      if (m.pago?.usuario?.nombre) {
        miembroNombre = `${m.pago.usuario.nombre} ${m.pago.usuario.apellido ?? ''}`.trim();
      } else if (m.pago?.imputaciones?.[0]?.cargo?.usuario?.nombre) {
        const cu = m.pago.imputaciones[0].cargo.usuario;
        miembroNombre = `${cu.nombre} ${cu.apellido ?? ''}`.trim();
      } else if (m.pedidoEvento?.vendedorUsuario?.nombre) {
        const vu = m.pedidoEvento.vendedorUsuario;
        miembroNombre = `${vu.nombre} ${vu.apellido ?? ''}`.trim();
      }

      if (miembroNombre) {
        if (/Miembro ID #\d+/i.test(conceptoTextoFinal)) {
          conceptoTextoFinal = conceptoTextoFinal.replace(/Miembro ID #\d+/gi, miembroNombre);
        } else if (/ID #\d+/i.test(conceptoTextoFinal)) {
          conceptoTextoFinal = conceptoTextoFinal.replace(/ID #\d+/gi, miembroNombre);
        }
      }

      return {
        id: m.id,
        cuentaId: m.cuentaId,
        fecha: m.fecha instanceof Date ? m.fecha.toISOString() : String(m.fecha),
        tipo: m.tipo,
        montoIngreso: ingreso,
        montoEgreso: egreso,
        conceptoTexto: conceptoTextoFinal,
        miembroNombre,
        pagoId: m.pagoId,
        gastoId: m.gastoId,
        creadoPorUsuarioId: m.creadoPorUsuarioId,
        creadoPor: m.creadoPor,
        saldoAcumulado,
      };
    });

    const saldoFinalPeriodo = deCentavos(saldoAcumuladoCts);
    const totalIngresosPeriodo = deCentavos(totalIngresosPeriodoCts);
    const totalEgresosPeriodo = deCentavos(totalEgresosPeriodoCts);

    const aggConsolidado = await this.prisma.movimientoFinanciero.aggregate({
      where: { cuentaId },
      _sum: { montoIngreso: true, montoEgreso: true },
    });
    const saldoActualConsolidado = deCentavos(
      aCentavos(aggConsolidado._sum.montoIngreso ?? 0) - aCentavos(aggConsolidado._sum.montoEgreso ?? 0),
    );

    return {
      cuenta: {
        id: cuenta.id,
        nombre: cuenta.nombre,
        tipo: cuenta.tipo,
        activa: cuenta.activa,
      },
      saldoAnterior,
      movimientos: movimientosConSaldo,
      totalIngresosPeriodo,
      totalEgresosPeriodo,
      saldoFinalPeriodo,
      saldoActualConsolidado,
    };
  }

  async transferirEntreCuentas(actor: AuthUser, alcance: AlcanceAcceso, dto: CrearTransferenciaDto) {
    if (alcance.tipo !== 'GLOBAL') {
      throw new ForbiddenException('Solo usuarios con alcance global pueden transferir fondos entre cuentas');
    }

    if (dto.origenCuentaId === dto.destinoCuentaId) {
      throw new BadRequestException('La cuenta de origen y destino deben ser distintas');
    }

    const montoCts = aCentavos(dto.monto);
    if (montoCts <= 0) {
      throw new BadRequestException('El monto a transferir debe ser mayor a 0');
    }
    const monto = deCentavos(montoCts);
    const montoDecimal = centavosADecimal(montoCts);

    return this.prisma.$transaction(async (tx) => {
      await lockFilasPorIds(tx, 'cuentas_financieras', [dto.origenCuentaId, dto.destinoCuentaId]);

      const [origen, destino] = await Promise.all([
        tx.cuentaFinanciera.findUnique({ where: { id: dto.origenCuentaId } }),
        tx.cuentaFinanciera.findUnique({ where: { id: dto.destinoCuentaId } }),
      ]);

      if (!origen || !destino) {
        throw new NotFoundException('Una o ambas cuentas no existen');
      }

      if (!origen.activa || !destino.activa) {
        throw new BadRequestException('Ambas cuentas deben estar activas para realizar la transferencia');
      }

      const saldoOrigen =
        (await assertSaldoCuentaDisponibleEnTx(
          tx,
          origen.id,
          monto,
          (saldo) => `Saldo insuficiente en ${origen.nombre}. Saldo disponible: $${saldo}`,
        )) ?? 0;

      const fechaOperacion = parsearFechaOperacion(dto.fecha);
      const transferenciaGrupoId = randomUUID();

      const movSalida = await tx.movimientoFinanciero.create({
        data: {
          cuentaId: origen.id,
          fecha: fechaOperacion,
          tipo: TipoMovimientoFinanciero.TRANSFERENCIA_SALIDA,
          montoIngreso: 0,
          montoEgreso: montoDecimal,
          conceptoTexto: `Transferencia a ${destino.nombre}: ${dto.concepto}`,
          transferenciaGrupoId,
          creadoPorUsuarioId: actor.sub,
        },
      });

      const movEntrada = await tx.movimientoFinanciero.create({
        data: {
          cuentaId: destino.id,
          fecha: fechaOperacion,
          tipo: TipoMovimientoFinanciero.TRANSFERENCIA_ENTRADA,
          montoIngreso: montoDecimal,
          montoEgreso: 0,
          conceptoTexto: `Transferencia desde ${origen.nombre}: ${dto.concepto}`,
          transferenciaGrupoId,
          creadoPorUsuarioId: actor.sub,
        },
      });

      const aggDestino = await tx.movimientoFinanciero.aggregate({
        where: { cuentaId: destino.id },
        _sum: { montoIngreso: true, montoEgreso: true },
      });
      const saldoDestino = deCentavos(
        aCentavos(aggDestino._sum.montoIngreso ?? 0) - aCentavos(aggDestino._sum.montoEgreso ?? 0),
      );

      return {
        mensaje: 'Transferencia realizada exitosamente',
        monto,
        saldoOrigen: deCentavos(aCentavos(saldoOrigen) - montoCts),
        saldoDestino,
        movimientos: [movSalida.id, movEntrada.id],
      };
    });
  }

  // ===========================================================================
  // RUBROS CONTABLES (PLAN DE CUENTAS / CATEGORÍAS DE COBRO Y GASTO - FASE 2)
  // ===========================================================================

  async listarRubrosContables(alcance: AlcanceAcceso, query: ListarRubrosQueryDto) {
    if (alcance.tipo === 'PROPIO') {
      throw new ForbiddenException('No tiene permisos para ver rubros contables');
    }

    const where: Prisma.RubroContableWhereInput = {
      ...(query.tipo ? { tipo: query.tipo } : {}),
      ...(query.incluirInactivos ? {} : { activo: true }),
      ...(alcance.tipo === 'UNIDAD'
        ? { OR: [{ unidadId: null }, { unidadId: { in: alcance.unidadIds } }] }
        : {}),
    };

    return this.prisma.rubroContable.findMany({
      where,
      orderBy: [{ tipo: 'asc' }, { nombre: 'asc' }],
      include: {
        unidad: { select: { id: true, nombre: true } },
        _count: { select: { conceptos: true, planesCuota: true, gastos: true } },
      },
    });
  }

  async crearRubroContable(alcance: AlcanceAcceso, dto: CrearRubroContableDto) {
    if (alcance.tipo === 'PROPIO') {
      throw new ForbiddenException('No tiene permisos para crear rubros contables');
    }
    if (dto.unidadId) {
      assertUnidadEnAlcance(alcance, dto.unidadId);
    } else if (alcance.tipo !== 'GLOBAL') {
      throw new ForbiddenException('Solo usuarios con alcance global pueden crear rubros generales');
    }

    const existente = await this.prisma.rubroContable.findUnique({
      where: {
        nombre_tipo: {
          nombre: dto.nombre,
          tipo: dto.tipo,
        },
      },
    });
    if (existente) {
      if (!existente.activo) {
        return this.prisma.rubroContable.update({
          where: { id: existente.id },
          data: {
            activo: true,
            unidadId: dto.unidadId ?? null,
            permiteDescuentoDefault: dto.permiteDescuentoDefault ?? existente.permiteDescuentoDefault,
          },
          include: { unidad: { select: { id: true, nombre: true } } },
        });
      }
      throw new ConflictException(`Ya existe un rubro de ${dto.tipo.toLowerCase()} llamado "${dto.nombre}"`);
    }

    return this.prisma.rubroContable.create({
      data: {
        nombre: dto.nombre,
        tipo: dto.tipo,
        unidadId: dto.unidadId ?? null,
        permiteDescuentoDefault: dto.permiteDescuentoDefault ?? false,
        activo: dto.activo ?? true,
      },
      include: { unidad: { select: { id: true, nombre: true } } },
    });
  }

  async actualizarRubroContable(alcance: AlcanceAcceso, id: number, dto: ActualizarRubroContableDto) {
    if (alcance.tipo === 'PROPIO') {
      throw new ForbiddenException('No tiene permisos para editar rubros contables');
    }

    const rubro = await this.prisma.rubroContable.findUnique({ where: { id } });
    if (!rubro) throw new NotFoundException('Rubro contable no encontrado');

    if (rubro.unidadId) {
      assertUnidadEnAlcance(alcance, rubro.unidadId);
    } else if (alcance.tipo !== 'GLOBAL') {
      throw new ForbiddenException('Solo usuarios con alcance global pueden editar rubros generales');
    }

    if (dto.unidadId !== undefined) {
      assertUnidadEnAlcance(alcance, dto.unidadId);
    }

    return this.prisma.rubroContable.update({
      where: { id },
      data: {
        ...(dto.nombre !== undefined ? { nombre: dto.nombre } : {}),
        ...(dto.unidadId !== undefined ? { unidadId: dto.unidadId } : {}),
        ...(dto.permiteDescuentoDefault !== undefined
          ? { permiteDescuentoDefault: dto.permiteDescuentoDefault }
          : {}),
        ...(dto.activo !== undefined ? { activo: dto.activo } : {}),
      },
      include: { unidad: { select: { id: true, nombre: true } } },
    });
  }

  async eliminarRubroContable(alcance: AlcanceAcceso, id: number) {
    if (alcance.tipo === 'PROPIO') {
      throw new ForbiddenException('No tiene permisos para eliminar rubros contables');
    }

    const rubro = await this.prisma.rubroContable.findUnique({
      where: { id },
      include: {
        _count: { select: { conceptos: true, planesCuota: true, gastos: true, movimientos: true } },
      },
    });
    if (!rubro) throw new NotFoundException('Rubro contable no encontrado');

    if (rubro.unidadId) {
      assertUnidadEnAlcance(alcance, rubro.unidadId);
    } else if (alcance.tipo !== 'GLOBAL') {
      throw new ForbiddenException('Solo usuarios con alcance global pueden eliminar rubros generales');
    }

    const tieneRelaciones =
      (rubro._count.conceptos ?? 0) > 0 ||
      (rubro._count.planesCuota ?? 0) > 0 ||
      (rubro._count.gastos ?? 0) > 0 ||
      (rubro._count.movimientos ?? 0) > 0;

    if (tieneRelaciones) {
      const desactivado = await this.prisma.rubroContable.update({
        where: { id },
        data: { activo: false },
      });
      return { ...desactivado, eliminadoPermanente: false };
    }

    const eliminado = await this.prisma.rubroContable.delete({ where: { id } });
    return { ...eliminado, eliminadoPermanente: true };
  }

  async restaurarRubroContable(alcance: AlcanceAcceso, id: number) {
    if (alcance.tipo === 'PROPIO') {
      throw new ForbiddenException('No tiene permisos para restaurar rubros contables');
    }

    const rubro = await this.prisma.rubroContable.findUnique({ where: { id } });
    if (!rubro) throw new NotFoundException('Rubro contable no encontrado');

    if (rubro.unidadId) {
      assertUnidadEnAlcance(alcance, rubro.unidadId);
    } else if (alcance.tipo !== 'GLOBAL') {
      throw new ForbiddenException('Solo usuarios con alcance global pueden restaurar rubros generales');
    }

    return this.prisma.rubroContable.update({
      where: { id },
      data: { activo: true },
    });
  }

  // ===========================================================================
  // GASTOS Y EGRESOS OPERATIVOS (FASE 2)
  // ===========================================================================

  async listarGastos(alcance: AlcanceAcceso, query: ListarGastosQueryDto) {
    if (alcance.tipo === 'PROPIO') {
      throw new ForbiddenException('No tiene permisos para ver gastos');
    }

    const where: Prisma.GastoWhereInput = {
      ...(query.cuentaId ? { cuentaId: query.cuentaId } : {}),
      ...(query.rubroId ? { rubroId: query.rubroId } : {}),
      ...(query.incluirAnulados ? {} : { anulado: false }),
      ...(alcance.tipo === 'UNIDAD' ? { rubro: { unidadId: { in: alcance.unidadIds } } } : {}),
      ...(query.desde || query.hasta
        ? {
            fecha: {
              ...(query.desde ? { gte: parsearLimiteDia(query.desde, false) } : {}),
              ...(query.hasta ? { lte: parsearLimiteDia(query.hasta, true) } : {}),
            },
          }
        : {}),
    };

    return this.prisma.gasto.findMany({
      where,
      orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
      take: 500,
      include: {
        rubro: { select: { id: true, nombre: true, tipo: true } },
        cuenta: { select: { id: true, nombre: true, tipo: true } },
        registradoPor: { select: { id: true, nombre: true, apellido: true } },
      },
    });
  }

  async registrarGasto(actor: AuthUser, alcance: AlcanceAcceso, dto: RegistrarGastoDto) {
    if (alcance.tipo === 'PROPIO') {
      throw new ForbiddenException('No tiene permisos para registrar gastos');
    }

    const montoCts = aCentavos(dto.monto);
    if (montoCts <= 0) {
      throw new BadRequestException('El monto del gasto debe ser mayor a 0');
    }
    const monto = deCentavos(montoCts);
    const montoDecimal = centavosADecimal(montoCts);

    return this.prisma.$transaction(async (tx) => {
      await lockFilasPorIds(tx, 'cuentas_financieras', [dto.cuentaId]);

      const [cuenta, rubro] = await Promise.all([
        tx.cuentaFinanciera.findUnique({ where: { id: dto.cuentaId } }),
        tx.rubroContable.findUnique({ where: { id: dto.rubroId } }),
      ]);

      if (!cuenta) throw new NotFoundException('La cuenta financiera especificada no existe');
      if (!cuenta.activa) throw new BadRequestException('La cuenta financiera se encuentra inactiva');
      if (!rubro) throw new NotFoundException('El rubro de gasto especificado no existe');
      if (!rubro.activo) throw new BadRequestException('El rubro contable se encuentra inactivo');
      if (rubro.tipo !== TipoRubro.EGRESO) {
        throw new BadRequestException('El rubro seleccionado debe ser de tipo EGRESO');
      }
      assertUnidadEnAlcance(alcance, rubro.unidadId);

      // Validar saldo disponible en la cuenta
      await assertSaldoCuentaDisponibleEnTx(
        tx,
        cuenta.id,
        monto,
        (saldoDisponible) => `Saldo insuficiente en ${cuenta.nombre}. Saldo actual: $${saldoDisponible}, Gasto solicitado: $${monto}`,
      );

      const fechaOperacion = parsearFechaOperacion(dto.fecha);

      const gasto = await tx.gasto.create({
        data: {
          fecha: fechaOperacion,
          monto: montoDecimal,
          descripcion: dto.descripcion,
          rubroId: rubro.id,
          cuentaId: cuenta.id,
          comprobanteNro: dto.comprobanteNro ?? null,
          comprobanteUrl: dto.comprobanteUrl ?? null,
          anulado: false,
          registradoPorId: actor.sub,
        },
        include: {
          rubro: { select: { id: true, nombre: true } },
          cuenta: { select: { id: true, nombre: true, tipo: true } },
          registradoPor: { select: { id: true, nombre: true, apellido: true } },
        },
      });

      const refTexto = dto.comprobanteNro ? ` (Comp. #${dto.comprobanteNro})` : '';
      await tx.movimientoFinanciero.create({
        data: {
          cuentaId: cuenta.id,
          fecha: fechaOperacion,
          tipo: TipoMovimientoFinanciero.EGRESO_GASTO,
          montoIngreso: 0,
          montoEgreso: montoDecimal,
          conceptoTexto: `Gasto: ${dto.descripcion} - ${rubro.nombre}${refTexto}`,
          gastoId: gasto.id,
          rubroId: rubro.id,
          creadoPorUsuarioId: actor.sub,
        },
      });

      return gasto;
    });
  }

  async actualizarGasto(
    actor: AuthUser,
    alcance: AlcanceAcceso,
    id: number,
    dto: ActualizarGastoDto,
  ) {
    if (alcance.tipo === 'PROPIO') {
      throw new ForbiddenException('No tiene permisos para modificar gastos');
    }

    return this.prisma.$transaction(async (tx) => {
      const findGasto = (tx as any).gasto?.findUnique
        ? (tx as any).gasto.findUnique.bind((tx as any).gasto)
        : this.prisma.gasto.findUnique.bind(this.prisma.gasto);

      const gasto = await findGasto({
        where: { id },
        include: { rubro: true, cuenta: true },
      });
      if (!gasto) throw new NotFoundException('Gasto no encontrado');
      if (gasto.anulado) throw new BadRequestException('No se puede modificar un gasto anulado');

      assertUnidadEnAlcance(alcance, gasto.rubro?.unidadId);

      let nuevoRubro = gasto.rubro;
      if (dto.rubroId && dto.rubroId !== gasto.rubroId) {
        const findRubro = (tx as any).rubroContable?.findUnique
          ? (tx as any).rubroContable.findUnique.bind((tx as any).rubroContable)
          : this.prisma.rubroContable.findUnique.bind(this.prisma.rubroContable);
        const rubroEncontrado = await findRubro({ where: { id: dto.rubroId } });
        if (!rubroEncontrado || !rubroEncontrado.activo || rubroEncontrado.tipo !== TipoRubro.EGRESO) {
          throw new BadRequestException('El rubro contable de egreso no es válido o está inactivo');
        }
        assertUnidadEnAlcance(alcance, rubroEncontrado.unidadId);
        nuevoRubro = rubroEncontrado;
      }

      let nuevaCuenta = gasto.cuenta;
      if (dto.cuentaId && dto.cuentaId !== gasto.cuentaId) {
        const findCuenta = (tx as any).cuentaFinanciera?.findUnique
          ? (tx as any).cuentaFinanciera.findUnique.bind((tx as any).cuentaFinanciera)
          : this.prisma.cuentaFinanciera.findUnique.bind(this.prisma.cuentaFinanciera);
        const cuentaEncontrada = await findCuenta({ where: { id: dto.cuentaId } });
        if (!cuentaEncontrada || !cuentaEncontrada.activa) {
          throw new BadRequestException('La cuenta financiera seleccionada no está activa');
        }
        nuevaCuenta = cuentaEncontrada;
      }

      const nuevaFecha = dto.fecha ? parsearFechaOperacion(dto.fecha) : gasto.fecha;
      const gastoActualCts = aCentavos(gasto.monto);
      const nuevoMontoCts = dto.monto !== undefined ? aCentavos(dto.monto) : gastoActualCts;
      const nuevoMonto = centavosADecimal(nuevoMontoCts);
      const nuevaDescripcion = dto.descripcion !== undefined ? dto.descripcion : gasto.descripcion;
      const nuevoComprobanteNro = dto.comprobanteNro !== undefined ? dto.comprobanteNro : gasto.comprobanteNro;
      const nuevoComprobanteUrl = dto.comprobanteUrl !== undefined ? dto.comprobanteUrl : gasto.comprobanteUrl;

      if (!nuevaCuenta.activa) {
        throw new BadRequestException('La cuenta financiera seleccionada no está activa');
      }

      await lockFilasPorIds(tx, 'cuentas_financieras', [gasto.cuentaId, nuevaCuenta.id]);

      if (nuevaCuenta.id === gasto.cuentaId) {
        const deltaCts = nuevoMontoCts - gastoActualCts;
        if (deltaCts > 0) {
          const delta = deCentavos(deltaCts);
          await assertSaldoCuentaDisponibleEnTx(
            tx,
            nuevaCuenta.id,
            delta,
            (saldoDisponible) =>
              `Saldo insuficiente en ${nuevaCuenta.nombre}. Saldo actual: $${saldoDisponible}, incremento solicitado: $${delta}`,
          );
        }
      } else {
        const nuevoMontoPesos = deCentavos(nuevoMontoCts);
        await assertSaldoCuentaDisponibleEnTx(
          tx,
          nuevaCuenta.id,
          nuevoMontoPesos,
          (saldoDisponible) =>
            `Saldo insuficiente en ${nuevaCuenta.nombre}. Saldo actual: $${saldoDisponible}, gasto solicitado: $${nuevoMontoPesos}`,
        );
      }

      const gastoActualizado = await tx.gasto.update({
        where: { id },
        data: {
          fecha: nuevaFecha,
          monto: nuevoMonto,
          descripcion: nuevaDescripcion,
          rubroId: nuevoRubro.id,
          cuentaId: nuevaCuenta.id,
          comprobanteNro: nuevoComprobanteNro,
          comprobanteUrl: nuevoComprobanteUrl,
        },
        include: {
          rubro: { select: { id: true, nombre: true } },
          cuenta: { select: { id: true, nombre: true, tipo: true } },
          registradoPor: { select: { id: true, nombre: true, apellido: true } },
        },
      });

      const refTexto = nuevoComprobanteNro ? ` (Comp. #${nuevoComprobanteNro})` : '';
      await tx.movimientoFinanciero.updateMany({
        where: { gastoId: gasto.id },
        data: {
          cuentaId: nuevaCuenta.id,
          fecha: nuevaFecha,
          montoEgreso: nuevoMonto,
          conceptoTexto: `Gasto: ${nuevaDescripcion} - ${nuevoRubro.nombre}${refTexto}`,
          rubroId: nuevoRubro.id,
        },
      });

      return gastoActualizado;
    });
  }

  async anularGasto(actor: AuthUser, alcance: AlcanceAcceso, id: number) {
    if (alcance.tipo === 'PROPIO') {
      throw new ForbiddenException('No tiene permisos para anular gastos');
    }

    return this.prisma.$transaction(async (tx) => {
      const findGasto = (tx as any).gasto?.findUnique
        ? (tx as any).gasto.findUnique.bind((tx as any).gasto)
        : this.prisma.gasto.findUnique.bind(this.prisma.gasto);

      const gasto = await findGasto({
        where: { id },
        include: { cuenta: true, rubro: true },
      });
      if (!gasto) throw new NotFoundException('Gasto no encontrado');
      if (gasto.anulado) throw new BadRequestException('El gasto ya se encuentra anulado');

      assertUnidadEnAlcance(alcance, gasto.rubro?.unidadId);

      await tx.movimientoFinanciero.deleteMany({
        where: { gastoId: gasto.id },
      });

      return tx.gasto.update({
        where: { id: gasto.id },
        data: { anulado: true },
        include: {
          rubro: { select: { id: true, nombre: true } },
          cuenta: { select: { id: true, nombre: true, tipo: true } },
          registradoPor: { select: { id: true, nombre: true, apellido: true } },
        },
      });
    });
  }

  async restaurarGasto(actor: AuthUser, alcance: AlcanceAcceso, id: number) {
    if (alcance.tipo === 'PROPIO') {
      throw new ForbiddenException('No tiene permisos para restaurar gastos');
    }

    return this.prisma.$transaction(async (tx) => {
      const findGasto = (tx as any).gasto?.findUnique
        ? (tx as any).gasto.findUnique.bind((tx as any).gasto)
        : this.prisma.gasto.findUnique.bind(this.prisma.gasto);

      const gasto = await findGasto({
        where: { id },
        include: { cuenta: true, rubro: true },
      });
      if (!gasto) throw new NotFoundException('Gasto no encontrado');
      if (!gasto.anulado) throw new BadRequestException('El gasto no se encuentra anulado');

      if (!gasto.cuenta.activa) {
        throw new BadRequestException('La cuenta financiera se encuentra inactiva');
      }

      assertUnidadEnAlcance(alcance, gasto.rubro?.unidadId);

      await assertSaldoCuentaDisponibleEnTx(
        tx,
        gasto.cuentaId,
        Number(gasto.monto),
        (saldoDisponible) =>
          `Saldo insuficiente en ${gasto.cuenta.nombre} para restaurar el gasto. Saldo actual: $${saldoDisponible}, gasto: $${Number(gasto.monto)}`,
      );

      const gastoRestaurado = await tx.gasto.update({
        where: { id: gasto.id },
        data: { anulado: false },
        include: {
          rubro: { select: { id: true, nombre: true } },
          cuenta: { select: { id: true, nombre: true, tipo: true } },
          registradoPor: { select: { id: true, nombre: true, apellido: true } },
        },
      });

      const refTexto = gasto.comprobanteNro ? ` (Comp. #${gasto.comprobanteNro})` : '';
      await tx.movimientoFinanciero.create({
        data: {
          cuentaId: gasto.cuentaId,
          fecha: gasto.fecha,
          tipo: TipoMovimientoFinanciero.EGRESO_GASTO,
          montoIngreso: 0,
          montoEgreso: centavosADecimal(aCentavos(gasto.monto)),
          conceptoTexto: `Gasto: ${gasto.descripcion} - ${gasto.rubro.nombre}${refTexto}`,
          gastoId: gasto.id,
          rubroId: gasto.rubroId,
          creadoPorUsuarioId: actor.sub,
        },
      });

      return gastoRestaurado;
    });
  }

  // ===========================================================================
  // INGRESOS DIRECTOS / MANUALES
  // ===========================================================================

  async registrarIngreso(actor: AuthUser, alcance: AlcanceAcceso, dto: RegistrarIngresoDto) {
    if (alcance.tipo === 'PROPIO') {
      throw new ForbiddenException('No tiene permisos para registrar ingresos');
    }

    const montoCts = aCentavos(dto.monto);
    if (montoCts <= 0) {
      throw new BadRequestException('El monto del ingreso debe ser mayor a 0');
    }

    return this.prisma.$transaction(async (tx) => {
      const [cuenta, rubro] = await Promise.all([
        tx.cuentaFinanciera.findUnique({ where: { id: dto.cuentaId } }),
        tx.rubroContable.findUnique({ where: { id: dto.rubroId } }),
      ]);

      if (!cuenta) throw new NotFoundException('La cuenta financiera especificada no existe');
      if (!cuenta.activa) throw new BadRequestException('La cuenta financiera se encuentra inactiva');
      if (!rubro) throw new NotFoundException('El rubro de ingreso especificado no existe');
      if (!rubro.activo) throw new BadRequestException('El rubro contable se encuentra inactivo');
      if (rubro.tipo !== TipoRubro.INGRESO) {
        throw new BadRequestException('El rubro seleccionado debe ser de tipo INGRESO');
      }
      assertUnidadEnAlcance(alcance, rubro.unidadId);

      const fechaOperacion = parsearFechaOperacion(dto.fecha);
      const refTexto = dto.comprobanteNro ? ` (Comp. #${dto.comprobanteNro})` : '';

      const movimiento = await tx.movimientoFinanciero.create({
        data: {
          cuentaId: cuenta.id,
          fecha: fechaOperacion,
          tipo: TipoMovimientoFinanciero.INGRESO_OTRO,
          montoIngreso: centavosADecimal(montoCts),
          montoEgreso: 0,
          conceptoTexto: `Ingreso: ${dto.descripcion} - ${rubro.nombre}${refTexto}`,
          rubroId: rubro.id,
          creadoPorUsuarioId: actor.sub,
        },
        include: {
          rubro: { select: { id: true, nombre: true, tipo: true } },
          cuenta: { select: { id: true, nombre: true, tipo: true } },
          creadoPor: { select: { id: true, nombre: true, apellido: true } },
        },
      });

      return movimiento;
    });
  }

  async actualizarIngreso(actor: AuthUser, alcance: AlcanceAcceso, id: number, dto: ActualizarIngresoDto) {
    if (alcance.tipo === 'PROPIO') {
      throw new ForbiddenException('No tiene permisos para modificar ingresos');
    }

    return this.prisma.$transaction(async (tx) => {
      const findMov = (tx as any).movimientoFinanciero?.findUnique
        ? (tx as any).movimientoFinanciero.findUnique.bind((tx as any).movimientoFinanciero)
        : this.prisma.movimientoFinanciero.findUnique.bind(this.prisma.movimientoFinanciero);

      const movimiento = await findMov({
        where: { id },
        include: { rubro: true, cuenta: true },
      });

      if (!movimiento) {
        throw new NotFoundException(`Movimiento con ID ${id} no encontrado`);
      }

      if (movimiento.tipo !== TipoMovimientoFinanciero.INGRESO_OTRO) {
        throw new BadRequestException('Solo se pueden modificar ingresos manuales registrados directamente');
      }

      assertUnidadEnAlcance(alcance, movimiento.rubro?.unidadId);

      let cuentaId = movimiento.cuentaId;
      if (dto.cuentaId !== undefined && dto.cuentaId !== movimiento.cuentaId) {
        const c = await tx.cuentaFinanciera.findUnique({ where: { id: dto.cuentaId } });
        if (!c) throw new NotFoundException('Cuenta destino no encontrada');
        if (!c.activa) throw new BadRequestException('La cuenta seleccionada está inactiva');
        cuentaId = c.id;

        await lockFilasPorIds(tx, 'cuentas_financieras', [movimiento.cuentaId, cuentaId]);

        // Validar que la cuenta origen no quede en saldo negativo al transferir el ingreso
        const montoViejo = Number(movimiento.montoIngreso);
        await assertSaldoCuentaDisponibleEnTx(
          tx,
          movimiento.cuentaId,
          montoViejo,
          (saldoOrigen) =>
            `Saldo insuficiente en ${movimiento.cuenta?.nombre ?? movimiento.cuentaId} para transferir el ingreso a otra cuenta ($${saldoOrigen} disponibles vs $${montoViejo} requeridos).`,
        );
      } else {
        if (movimiento.cuenta && 'activa' in movimiento.cuenta && !movimiento.cuenta.activa) {
          throw new BadRequestException(`La cuenta financiera ${movimiento.cuenta.nombre} se encuentra inactiva.`);
        }
      }

      let rubroId = movimiento.rubroId;
      let rubroNombre = movimiento.rubro?.nombre || 'Ingreso';
      if (dto.rubroId !== undefined && dto.rubroId !== movimiento.rubroId) {
        const r = await tx.rubroContable.findUnique({ where: { id: dto.rubroId } });
        if (!r) throw new NotFoundException('Rubro no encontrado');
        if (!r.activo) throw new BadRequestException('El rubro seleccionado se encuentra inactivo');
        if (r.tipo !== TipoRubro.INGRESO) throw new BadRequestException('El rubro debe ser de tipo INGRESO');
        assertUnidadEnAlcance(alcance, r.unidadId);
        rubroId = r.id;
        rubroNombre = r.nombre;
      }

      const ingresoActualCts = aCentavos(movimiento.montoIngreso);
      const montoCts = dto.monto !== undefined ? aCentavos(dto.monto) : ingresoActualCts;
      if (montoCts <= 0) {
        throw new BadRequestException('El monto debe ser mayor a 0');
      }

      // Si se mantiene en la misma cuenta y el nuevo monto es menor, verificar saldo disponible
      if (cuentaId === movimiento.cuentaId) {
        const deltaReduccionCts = ingresoActualCts - montoCts;
        if (deltaReduccionCts > 0) {
          const deltaReduccion = deCentavos(deltaReduccionCts);
          await assertSaldoCuentaDisponibleEnTx(
            tx,
            movimiento.cuentaId,
            deltaReduccion,
            (saldoDisponible) =>
              `Saldo insuficiente en ${movimiento.cuenta?.nombre ?? movimiento.cuentaId} para reducir el ingreso ($${saldoDisponible} disponibles vs $${deltaReduccion} de reducción).`,
          );
        }
      }

      const fechaOperacion = dto.fecha ? parsearFechaOperacion(dto.fecha) : movimiento.fecha;

      let conceptoTexto = movimiento.conceptoTexto;
      if (dto.descripcion !== undefined || dto.comprobanteNro !== undefined || dto.rubroId !== undefined) {
        let desc = dto.descripcion;
        if (!desc) {
          const sinPrefijo = movimiento.conceptoTexto.replace(/^Ingreso:\s*/, '');
          const partes = sinPrefijo.split(' - ');
          desc = partes[0] || movimiento.conceptoTexto;
        }
        const refTexto = dto.comprobanteNro ? ` (Comp. #${dto.comprobanteNro})` : '';
        conceptoTexto = `Ingreso: ${desc} - ${rubroNombre}${refTexto}`;
      }

      return tx.movimientoFinanciero.update({
        where: { id },
        data: {
          cuentaId,
          rubroId,
          fecha: fechaOperacion,
          montoIngreso: centavosADecimal(montoCts),
          conceptoTexto,
        },
        include: {
          rubro: { select: { id: true, nombre: true, tipo: true } },
          cuenta: { select: { id: true, nombre: true, tipo: true } },
          creadoPor: { select: { id: true, nombre: true, apellido: true } },
        },
      });
    });
  }

  async eliminarIngreso(actor: AuthUser, alcance: AlcanceAcceso, id: number) {
    if (alcance.tipo === 'PROPIO') {
      throw new ForbiddenException('No tiene permisos para eliminar ingresos');
    }

    return runInTransaction(this.prisma, async (tx) => {
      const findMov = tx.movimientoFinanciero?.findUnique
        ? tx.movimientoFinanciero.findUnique.bind(tx.movimientoFinanciero)
        : this.prisma.movimientoFinanciero.findUnique.bind(this.prisma.movimientoFinanciero);

      const movimiento = await findMov({
        where: { id },
        include: { rubro: true, cuenta: true },
      });

      if (!movimiento) {
        throw new NotFoundException(`Ingreso con ID ${id} no encontrado`);
      }

      if (movimiento.tipo !== TipoMovimientoFinanciero.INGRESO_OTRO) {
        throw new BadRequestException('Solo se pueden eliminar ingresos manuales registrados directamente');
      }

      assertUnidadEnAlcance(alcance, movimiento.rubro?.unidadId);

      if (movimiento.cuenta && 'activa' in movimiento.cuenta && !movimiento.cuenta.activa) {
        throw new BadRequestException(`La cuenta financiera ${movimiento.cuenta.nombre} se encuentra inactiva.`);
      }

      if (movimiento.cuentaId) {
        const impacto = Number(movimiento.montoIngreso);
        await assertSaldoCuentaDisponibleEnTx(
          tx,
          movimiento.cuentaId,
          impacto,
          (saldoDisponible) =>
            `No se puede eliminar el ingreso porque la cuenta ${movimiento.cuenta?.nombre ?? movimiento.cuentaId} no tiene saldo suficiente ($${saldoDisponible} disponibles vs $${impacto} a revertir).`,
        );
      }

      await tx.movimientoFinanciero.delete({
        where: { id },
      });

      return { exito: true, mensaje: 'Ingreso eliminado correctamente' };
    });
  }

  async listarIngresos(alcance: AlcanceAcceso, query: ListarIngresosQueryDto) {
    if (alcance.tipo === 'PROPIO') {
      throw new ForbiddenException('No tiene permisos para listar ingresos');
    }

    const where: Prisma.MovimientoFinancieroWhereInput = {
      tipo: TipoMovimientoFinanciero.INGRESO_OTRO,
      ...(alcance.tipo === 'UNIDAD' ? { rubro: { unidadId: { in: alcance.unidadIds } } } : {}),
    };

    if (query.cuentaId) where.cuentaId = query.cuentaId;
    if (query.rubroId) where.rubroId = query.rubroId;
    if (query.desde || query.hasta) {
      where.fecha = {};
      if (query.desde) where.fecha.gte = parsearLimiteDia(query.desde, false);
      if (query.hasta) where.fecha.lte = parsearLimiteDia(query.hasta, true);
    }

    return this.prisma.movimientoFinanciero.findMany({
      where,
      orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
      take: 500,
      include: {
        rubro: { select: { id: true, nombre: true, tipo: true } },
        cuenta: { select: { id: true, nombre: true, tipo: true } },
        creadoPor: { select: { id: true, nombre: true, apellido: true } },
      },
    });
  }

  // ===========================================================================
  // CUADRO DE RESULTADOS / BALANCE CONTABLE (FASE 3)
  // ===========================================================================

  private crearMesesVacios(): Record<number, number> {
    return {
      1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0, 11: 0, 12: 0,
    };
  }

  private resolverRubroCobranza(
    ingresosMap: Map<string, { rubroId: number | null; rubroNombre: string; mesesCts: Record<number, number> }>,
    concepto: {
      nombre?: string | null;
      tipo?: string | null;
      rubroId?: number | null;
      rubroNombre?: string | null;
    },
  ): { rubroId: number | null; rubroNombre: string } {
    let rubroId = concepto.rubroId ?? null;
    let rubroNombre = concepto.rubroNombre ?? undefined;

    if (!rubroNombre) {
      const nomLower = (concepto.nombre || '').toLowerCase();
      const tipoConcepto = (concepto.tipo || '').toUpperCase();
      if (nomLower.includes('campa') || tipoConcepto === 'CAMPAMENTO') {
        const rCampa = Array.from(ingresosMap.values()).find((r) =>
          r.rubroNombre.toLowerCase().includes('campa'),
        );
        rubroNombre = rCampa ? rCampa.rubroNombre : 'Campamento';
      } else if (nomLower.includes('afilia') || tipoConcepto === 'AFILIACION') {
        const rAfilia = Array.from(ingresosMap.values()).find((r) =>
          r.rubroNombre.toLowerCase().includes('afilia'),
        );
        rubroNombre = rAfilia ? rAfilia.rubroNombre : 'Afiliación Nacional';
      } else if (nomLower.includes('bono') || nomLower.includes('evento')) {
        const rBono = Array.from(ingresosMap.values()).find(
          (r) =>
            r.rubroNombre.toLowerCase().includes('bono') ||
            r.rubroNombre.toLowerCase().includes('evento'),
        );
        rubroNombre = rBono ? rBono.rubroNombre : 'Bono Contribución';
      } else if (
        nomLower.includes('pañuelo') ||
        nomLower.includes('insignia') ||
        nomLower.includes('uniforme') ||
        nomLower.includes('indumentaria') ||
        tipoConcepto === 'MATERIALES'
      ) {
        const rInd = Array.from(ingresosMap.values()).find(
          (r) =>
            r.rubroNombre.toLowerCase().includes('indumentaria') ||
            r.rubroNombre.toLowerCase().includes('insignia'),
        );
        rubroNombre = rInd ? rInd.rubroNombre : 'Indumentaria e Insignias';
      } else if (nomLower.includes('inscri') || nomLower.includes('matricula')) {
        const rInsc = Array.from(ingresosMap.values()).find(
          (r) =>
            r.rubroNombre.toLowerCase().includes('inscri') ||
            r.rubroNombre.toLowerCase().includes('matr'),
        );
        rubroNombre = rInsc ? rInsc.rubroNombre : 'Inscripción y Matrícula';
      } else {
        const rCuota = Array.from(ingresosMap.values()).find((r) =>
          r.rubroNombre.toLowerCase().includes('cuota'),
        );
        rubroNombre = rCuota ? rCuota.rubroNombre : 'Cuota Social';
      }
    }

    if (!rubroId && ingresosMap.has(rubroNombre)) {
      rubroId = ingresosMap.get(rubroNombre)!.rubroId;
    }

    return { rubroId, rubroNombre };
  }

  private acumularMesCts(
    mapa: Map<string, { rubroId: number | null; rubroNombre: string; mesesCts: Record<number, number> }>,
    rubroNombre: string,
    rubroId: number | null,
    mes: number,
    montoCts: number,
  ) {
    if (mes < 1 || mes > 12 || montoCts === 0) return;
    if (!mapa.has(rubroNombre)) {
      mapa.set(rubroNombre, {
        rubroId,
        rubroNombre,
        mesesCts: this.crearMesesVacios(),
      });
    }
    const item = mapa.get(rubroNombre)!;
    item.mesesCts[mes] += montoCts;
  }

  async obtenerCuadroResultados(
    alcance: AlcanceAcceso,
    query: ConsultaCuadroResultadosQueryDto,
  ) {
    if (alcance.tipo !== 'GLOBAL') {
      throw new ForbiddenException('Solo usuarios con alcance global pueden consultar el cuadro de resultados consolidado');
    }

    const anio = query.anio || anioActual();
    const mesFiltro = query.mes ?? null;

    const desdeAnio = new Date(Date.UTC(anio, 0, 1, 3, 0, 0, 0));
    const hastaAnio = new Date(Date.UTC(anio + 1, 0, 1, 2, 59, 59, 999));

    const ingresosMap = new Map<
      string,
      { rubroId: number | null; rubroNombre: string; mesesCts: Record<number, number> }
    >();
    const egresosMap = new Map<
      string,
      { rubroId: number | null; rubroNombre: string; mesesCts: Record<number, number> }
    >();

    const inicializarRubros = (rubrosDb: Array<{ id: number; nombre: string; tipo: TipoRubro }>) => {
      for (const r of rubrosDb) {
        const targetMap = r.tipo === TipoRubro.INGRESO ? ingresosMap : egresosMap;
        targetMap.set(r.nombre, {
          rubroId: r.id,
          rubroNombre: r.nombre,
          mesesCts: this.crearMesesVacios(),
        });
      }
    };

    let cuentas: Awaited<ReturnType<TesoreriaCajaService['listarCuentasFinancieras']>>;
    const queryRawFn = (this.prisma as { $queryRaw?: PrismaService['$queryRaw'] }).$queryRaw;

    if (typeof queryRawFn === 'function') {
      const [
        rubrosDb,
        cuentasRes,
        imputacionesSql,
        remanentesSql,
        ingresosMovSql,
        gastosSql,
      ] = await Promise.all([
        this.prisma.rubroContable.findMany({
          select: { id: true, nombre: true, tipo: true },
          orderBy: [{ tipo: 'asc' }, { nombre: 'asc' }],
        }),
        this.listarCuentasFinancieras(alcance, false),
        this.prisma.$queryRaw<
          Array<{
            mes: number;
            conceptoNombre: string;
            conceptoTipo: string;
            conceptoRubroId: number | null;
            rubroId: number | null;
            rubroNombre: string | null;
            total: Prisma.Decimal;
          }>
        >`
          SELECT
            EXTRACT(MONTH FROM (p."fecha_pago" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Argentina/Buenos_Aires')::int AS mes,
            c."nombre" AS "conceptoNombre",
            c."tipo"::text AS "conceptoTipo",
            c."rubro_id" AS "conceptoRubroId",
            r."id" AS "rubroId",
            r."nombre" AS "rubroNombre",
            COALESCE(SUM(pi."monto_imputado"), 0) AS total
          FROM "pago_imputaciones" pi
          INNER JOIN "pagos" p ON p."id" = pi."pago_id"
          INNER JOIN "cargos_miembro" cm ON cm."id" = pi."cargo_id"
          INNER JOIN "conceptos_cuota" c ON c."id" = cm."concepto_id"
          LEFT JOIN "rubros_contables" r ON r."id" = c."rubro_id"
          WHERE p."fecha_pago" >= ${desdeAnio}
            AND p."fecha_pago" <= ${hastaAnio}
            AND (p."referencia_comprobante" IS NULL OR p."referencia_comprobante" <> 'APLICACION_SALDO_A_FAVOR')
          GROUP BY 1, c."nombre", c."tipo", c."rubro_id", r."id", r."nombre"
        `,
        this.prisma.$queryRaw<Array<{ mes: number; total: Prisma.Decimal }>>`
          SELECT
            sub.mes,
            COALESCE(SUM(GREATEST(0, sub."monto_total" - sub."total_imputado")), 0) AS total
          FROM (
            SELECT
              p."id",
              EXTRACT(MONTH FROM (p."fecha_pago" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Argentina/Buenos_Aires')::int AS mes,
              p."monto_total",
              COALESCE(SUM(pi."monto_imputado"), 0) AS "total_imputado"
            FROM "pagos" p
            LEFT JOIN "pago_imputaciones" pi ON pi."pago_id" = p."id"
            WHERE p."fecha_pago" >= ${desdeAnio}
              AND p."fecha_pago" <= ${hastaAnio}
              AND (p."referencia_comprobante" IS NULL OR p."referencia_comprobante" <> 'APLICACION_SALDO_A_FAVOR')
            GROUP BY p."id", p."fecha_pago", p."monto_total"
          ) sub
          GROUP BY sub.mes
          HAVING COALESCE(SUM(GREATEST(0, sub."monto_total" - sub."total_imputado")), 0) > 0
        `,
        this.prisma.$queryRaw<
          Array<{
            mes: number;
            movRubroId: number | null;
            movRubroNombre: string | null;
            esEvento: boolean;
            eventoRubroId: number | null;
            eventoRubroNombre: string | null;
            total: Prisma.Decimal;
          }>
        >`
          SELECT
            EXTRACT(MONTH FROM (mf."fecha" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Argentina/Buenos_Aires')::int AS mes,
            mf."rubro_id" AS "movRubroId",
            rm."nombre" AS "movRubroNombre",
            (mf."pedido_evento_id" IS NOT NULL) AS "esEvento",
            ev."rubro_id" AS "eventoRubroId",
            re."nombre" AS "eventoRubroNombre",
            COALESCE(SUM(mf."monto_ingreso"), 0) AS total
          FROM "movimientos_financieros" mf
          LEFT JOIN "rubros_contables" rm ON rm."id" = mf."rubro_id"
          LEFT JOIN "pedidos_evento" pe ON pe."id" = mf."pedido_evento_id"
          LEFT JOIN "eventos" ev ON ev."id" = pe."evento_id"
          LEFT JOIN "rubros_contables" re ON re."id" = ev."rubro_id"
          WHERE (mf."tipo" = 'INGRESO_OTRO'::"TipoMovimientoFinanciero" OR mf."pedido_evento_id" IS NOT NULL)
            AND mf."fecha" >= ${desdeAnio}
            AND mf."fecha" <= ${hastaAnio}
          GROUP BY 1, mf."rubro_id", rm."nombre", (mf."pedido_evento_id" IS NOT NULL), ev."rubro_id", re."nombre"
        `,
        this.prisma.$queryRaw<
          Array<{
            mes: number;
            rubroId: number | null;
            rubroNombre: string;
            total: Prisma.Decimal;
          }>
        >`
          SELECT
            EXTRACT(MONTH FROM (g."fecha" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Argentina/Buenos_Aires')::int AS mes,
            g."rubro_id" AS "rubroId",
            r."nombre" AS "rubroNombre",
            COALESCE(SUM(g."monto"), 0) AS total
          FROM "gastos" g
          INNER JOIN "rubros_contables" r ON r."id" = g."rubro_id"
          WHERE g."anulado" = false
            AND g."fecha" >= ${desdeAnio}
            AND g."fecha" <= ${hastaAnio}
          GROUP BY 1, g."rubro_id", r."nombre"
        `,
      ]);

      cuentas = cuentasRes;
      inicializarRubros(rubrosDb);

      for (const row of imputacionesSql) {
        const { rubroId, rubroNombre } = this.resolverRubroCobranza(ingresosMap, {
          nombre: row.conceptoNombre,
          tipo: row.conceptoTipo,
          rubroId: row.rubroId ?? row.conceptoRubroId,
          rubroNombre: row.rubroNombre,
        });
        this.acumularMesCts(ingresosMap, rubroNombre, rubroId, Number(row.mes), aCentavos(row.total));
      }

      for (const row of remanentesSql) {
        this.acumularMesCts(
          ingresosMap,
          'Adelanto / Saldo a Favor',
          null,
          Number(row.mes),
          aCentavos(row.total),
        );
      }

      for (const row of ingresosMovSql) {
        let rubroNombre = row.movRubroNombre;
        let rubroId = row.movRubroId;
        if (!rubroNombre && row.esEvento) {
          rubroNombre = row.eventoRubroNombre || 'Eventos y Festivales';
          rubroId = row.eventoRubroId ?? null;
        }
        if (!rubroNombre) {
          rubroNombre = 'Otros Ingresos';
        }
        this.acumularMesCts(ingresosMap, rubroNombre, rubroId, Number(row.mes), aCentavos(row.total));
      }

      for (const row of gastosSql) {
        this.acumularMesCts(
          egresosMap,
          row.rubroNombre,
          row.rubroId,
          Number(row.mes),
          aCentavos(row.total),
        );
      }
    } else {
      // Fallback en memoria para mocks unitarios sin $queryRaw
      const [rubrosDb, pagos, ingresosMovimientos, gastos, cuentasRes] = await Promise.all([
        this.prisma.rubroContable.findMany({
          select: { id: true, nombre: true, tipo: true },
          orderBy: [{ tipo: 'asc' }, { nombre: 'asc' }],
        }),
        this.prisma.pago.findMany({
          where: {
            fechaPago: { gte: desdeAnio, lte: hastaAnio },
            OR: [
              { referenciaComprobante: null },
              { referenciaComprobante: { not: 'APLICACION_SALDO_A_FAVOR' } },
            ],
          },
          select: {
            id: true,
            fechaPago: true,
            montoTotal: true,
            imputaciones: {
              select: {
                montoImputado: true,
                cargo: {
                  select: {
                    concepto: {
                      select: {
                        id: true,
                        nombre: true,
                        tipo: true,
                        rubroId: true,
                        rubro: { select: { id: true, nombre: true } },
                      },
                    },
                  },
                },
              },
            },
          },
        }),
        this.prisma.movimientoFinanciero.findMany({
          where: {
            OR: [
              { tipo: TipoMovimientoFinanciero.INGRESO_OTRO },
              { pedidoEventoId: { not: null } },
            ],
            fecha: { gte: desdeAnio, lte: hastaAnio },
          },
          select: {
            fecha: true,
            montoIngreso: true,
            rubroId: true,
            rubro: { select: { nombre: true } },
            pedidoEvento: {
              select: {
                evento: {
                  select: {
                    rubroId: true,
                    rubro: { select: { nombre: true } },
                  },
                },
              },
            },
          },
        }),
        this.prisma.gasto.findMany({
          where: {
            anulado: false,
            fecha: { gte: desdeAnio, lte: hastaAnio },
          },
          select: {
            fecha: true,
            monto: true,
            rubroId: true,
            rubro: { select: { nombre: true } },
          },
        }),
        this.listarCuentasFinancieras(alcance, false),
      ]);

      cuentas = cuentasRes;
      inicializarRubros(rubrosDb);

      const obtenerMesYAnioArg = (fecha: Date) => {
        const str = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'America/Argentina/Buenos_Aires',
          year: 'numeric',
          month: '2-digit',
        }).format(fecha);
        const [y, m] = str.split('-').map(Number);
        return { anio: y, mes: m };
      };

      for (const pago of pagos) {
        const { anio: a, mes: m } = obtenerMesYAnioArg(pago.fechaPago);
        if (a === anio && m >= 1 && m <= 12) {
          let totalImputadoCts = 0;
          for (const imp of pago.imputaciones) {
            const montoImpCts = aCentavos(imp.montoImputado);
            totalImputadoCts += montoImpCts;
            const concepto = imp.cargo?.concepto;
            const { rubroId, rubroNombre } = this.resolverRubroCobranza(ingresosMap, {
              nombre: concepto?.nombre,
              tipo: concepto?.tipo,
              rubroId: concepto?.rubro?.id ?? concepto?.rubroId ?? null,
              rubroNombre: concepto?.rubro?.nombre ?? null,
            });
            this.acumularMesCts(ingresosMap, rubroNombre, rubroId, m, montoImpCts);
          }

          const remanenteCts = aCentavos(pago.montoTotal) - totalImputadoCts;
          if (remanenteCts > 0) {
            this.acumularMesCts(ingresosMap, 'Adelanto / Saldo a Favor', null, m, remanenteCts);
          }
        }
      }

      for (const aj of ingresosMovimientos) {
        const { anio: a, mes: m } = obtenerMesYAnioArg(aj.fecha);
        if (a === anio && m >= 1 && m <= 12) {
          let rubroNombre = aj.rubro?.nombre;
          let rubroId = aj.rubroId;

          if (!rubroNombre && aj.pedidoEvento) {
            rubroNombre = aj.pedidoEvento.evento.rubro?.nombre || 'Eventos y Festivales';
            rubroId = aj.pedidoEvento.evento.rubroId ?? null;
          }
          if (!rubroNombre) {
            rubroNombre = 'Otros Ingresos';
          }
          this.acumularMesCts(ingresosMap, rubroNombre, rubroId, m, aCentavos(aj.montoIngreso));
        }
      }

      for (const g of gastos) {
        const { anio: a, mes: m } = obtenerMesYAnioArg(g.fecha);
        if (a === anio && m >= 1 && m <= 12) {
          this.acumularMesCts(egresosMap, g.rubro.nombre, g.rubroId, m, aCentavos(g.monto));
        }
      }
    }

    let totalCajaCts = 0;
    let totalBancoCts = 0;
    for (const c of cuentas) {
      if (c.tipo === TipoCuenta.CAJA_EFECTIVO) {
        totalCajaCts += aCentavos(c.saldoActual);
      } else if (c.tipo === TipoCuenta.BANCO) {
        totalBancoCts += aCentavos(c.saldoActual);
      }
    }
    const totalCaja = deCentavos(totalCajaCts);
    const totalBanco = deCentavos(totalBancoCts);
    const totalDisponible = deCentavos(totalCajaCts + totalBancoCts);

    // Evolución Mensual (Ene .. Dic)
    const evolucionMensual = Array.from({ length: 12 }, (_, i) => {
      const mesNum = i + 1;
      let ingMesCts = 0;
      for (const item of ingresosMap.values()) {
        ingMesCts += item.mesesCts[mesNum] || 0;
      }
      let egrMesCts = 0;
      for (const item of egresosMap.values()) {
        egrMesCts += item.mesesCts[mesNum] || 0;
      }
      return {
        mes: mesNum,
        nombreMes: NOMBRES_MESES[i],
        ingresos: deCentavos(ingMesCts),
        egresos: deCentavos(egrMesCts),
        resultadoNeto: deCentavos(ingMesCts - egrMesCts),
      };
    });

    const serializarMesesPesos = (mesesCts: Record<number, number>): Record<number, number> => {
      const out: Record<number, number> = {};
      for (let m = 1; m <= 12; m++) {
        out[m] = deCentavos(mesesCts[m] || 0);
      }
      return out;
    };

    // Calcular totales de período según filtro mensual o año completo
    let totalIngresosPeriodoCts = 0;
    let totalEgresosPeriodoCts = 0;

    const ingresosPorRubro = Array.from(ingresosMap.values()).map((item) => {
      const totalCts = mesFiltro
        ? item.mesesCts[mesFiltro] || 0
        : Object.values(item.mesesCts).reduce((acc, v) => acc + v, 0);
      totalIngresosPeriodoCts += totalCts;
      return {
        rubroId: item.rubroId,
        rubroNombre: item.rubroNombre,
        meses: serializarMesesPesos(item.mesesCts),
        total: deCentavos(totalCts),
        _totalCts: totalCts,
        porcentaje: 0,
      };
    });

    const egresosPorRubro = Array.from(egresosMap.values()).map((item) => {
      const totalCts = mesFiltro
        ? item.mesesCts[mesFiltro] || 0
        : Object.values(item.mesesCts).reduce((acc, v) => acc + v, 0);
      totalEgresosPeriodoCts += totalCts;
      return {
        rubroId: item.rubroId,
        rubroNombre: item.rubroNombre,
        meses: serializarMesesPesos(item.mesesCts),
        total: deCentavos(totalCts),
        _totalCts: totalCts,
        porcentaje: 0,
      };
    });

    const calcularPorcentaje = (parteCts: number, totalCts: number): number =>
      totalCts > 0 ? Math.round((parteCts / totalCts) * 10000) / 100 : 0;

    // Asignar porcentajes relativos
    const ingresosFinal = ingresosPorRubro
      .map(({ _totalCts, ...rest }) => ({
        ...rest,
        porcentaje: calcularPorcentaje(_totalCts, totalIngresosPeriodoCts),
      }))
      .sort((a, b) => b.total - a.total);

    const egresosFinal = egresosPorRubro
      .map(({ _totalCts, ...rest }) => ({
        ...rest,
        porcentaje: calcularPorcentaje(_totalCts, totalEgresosPeriodoCts),
      }))
      .sort((a, b) => b.total - a.total);

    const resultadoNetoCts = totalIngresosPeriodoCts - totalEgresosPeriodoCts;
    const totalIngresosPeriodo = deCentavos(totalIngresosPeriodoCts);
    const totalEgresosPeriodo = deCentavos(totalEgresosPeriodoCts);
    const resultadoNeto = deCentavos(resultadoNetoCts);
    const margenOperativoPorcentaje =
      totalIngresosPeriodoCts > 0
        ? Math.round((resultadoNetoCts / totalIngresosPeriodoCts) * 10000) / 100
        : 0;

    return {
      anio,
      mesFiltro,
      resumen: {
        totalIngresos: totalIngresosPeriodo,
        totalEgresos: totalEgresosPeriodo,
        resultadoNeto,
        margenOperativoPorcentaje,
      },
      ingresosPorRubro: ingresosFinal,
      egresosPorRubro: egresosFinal,
      evolucionMensual,
      disponibilidadActual: {
        totalCaja,
        totalBanco,
        totalDisponible,
      },
    };
  }
}
