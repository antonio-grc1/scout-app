import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AlcanceRol, EstadoCargo, MetodoPago, Prisma } from '@prisma/client';
import { assertUnidadEnAlcance, filtroUsuariosPorAlcance } from '../common/scope/alcance.util.js';
import type { AlcanceAcceso, AuthUser } from '../common/types/auth.types.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  ActualizarDescuentoFamiliaDto,
  AjustarSaldoAFavorDto,
  AplicarSaldoAFavorDto,
  CrearConceptoDto,
  CrearPlanCuotaMensualDto,
  DesvincularHermanoDto,
  EditarCargoIndividualDto,
  EditarConceptoDto,
  EditarPagoDto,
  EditarPlanCuotaMensualDto,
  GenerarCargoIndividualDto,
  GenerarCargosDto,
  ListarCargosQueryDto,
  RegistrarPagoDto,
  SincronizarMesesPlanDto,
  VincularHermanoDto,
} from './tesoreria.dto.js';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function redondearDosDecimales(n: number): Prisma.Decimal {
  return new Prisma.Decimal(round2(n));
}

const NOMBRES_MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

@Injectable()
export class TesoreriaService {
  constructor(private readonly prisma: PrismaService) {}

  // ===========================================================================
  // HELPERS DE CÁLCULO, REVERSIÓN Y SINCRONIZACIÓN TRANSACCIONAL
  // ===========================================================================

  private construirFiltroRol(destinatarioTipo?: string | null, esParaEducadores?: boolean) {
    const tipo = destinatarioTipo || (esParaEducadores ? 'EDUCADORES' : 'TODOS');
    if (tipo === 'EDUCADORES') {
      return {
        OR: [
          { alcancePorDefecto: { not: AlcanceRol.PROPIO } },
          { nombre: { contains: 'Educador', mode: 'insensitive' as const } },
          { nombre: { contains: 'Jefe', mode: 'insensitive' as const } },
        ],
      };
    }
    if (tipo === 'PROTAGONISTAS') {
      return {
        OR: [
          { alcancePorDefecto: AlcanceRol.PROPIO },
          { nombre: { equals: 'Protagonista', mode: 'insensitive' as const } },
        ],
      };
    }
    return undefined;
  }

  private calcularMontosCargo(
    montoBaseNum: number,
    permiteDescuentoHermanos: boolean,
    porcentajeConcepto: Prisma.Decimal | number | null | undefined,
    grupoFamiliar: { porcentajeDescuentoHermanos: Prisma.Decimal | number } | null | undefined,
  ) {
    let descuentoNum = 0;
    if (permiteDescuentoHermanos && grupoFamiliar) {
      let pct = 0;
      if (porcentajeConcepto !== null && porcentajeConcepto !== undefined) {
        pct = Number(porcentajeConcepto);
      } else {
        pct = Number(grupoFamiliar.porcentajeDescuentoHermanos ?? 0);
      }
      if (pct > 0) {
        descuentoNum = (montoBaseNum * pct) / 100;
      }
    }

    const montoOriginal = redondearDosDecimales(montoBaseNum);
    const montoDescuento = redondearDosDecimales(descuentoNum);
    const montoFinal = redondearDosDecimales(Math.max(0, montoBaseNum - descuentoNum));

    return { montoOriginal, montoDescuento, montoFinal };
  }

  private calcularResumenRecaudacion(
    cargos: Array<{ montoFinal: Prisma.Decimal | number | string; montoPagado: Prisma.Decimal | number | string; estado: EstadoCargo }>,
  ) {
    const activos = cargos.filter((c) => c.estado !== EstadoCargo.ANULADO);
    let totalFacturado = 0;
    let totalRecaudado = 0;
    let cargosPagados = 0;
    let cargosParciales = 0;
    let cargosPendientes = 0;

    for (const c of activos) {
      totalFacturado += Number(c.montoFinal);
      totalRecaudado += Number(c.montoPagado);
      if (c.estado === EstadoCargo.PAGADO) cargosPagados++;
      else if (c.estado === EstadoCargo.PARCIAL) cargosParciales++;
      else if (c.estado === EstadoCargo.PENDIENTE) cargosPendientes++;
    }

    totalFacturado = round2(totalFacturado);
    totalRecaudado = round2(totalRecaudado);
    const totalPendiente = round2(Math.max(0, totalFacturado - totalRecaudado));
    const porcentajeCobrado = totalFacturado > 0 ? Math.round((totalRecaudado / totalFacturado) * 100) : 0;

    return {
      totalCargos: activos.length,
      cargosPagados,
      cargosParciales,
      cargosPendientes,
      totalFacturado,
      totalRecaudado,
      totalPendiente,
      porcentajeCobrado,
    };
  }

  /**
   * Libera un monto abonado en un cargo (por anulación, baja de mes, beca o reducción de monto)
   * y lo acredita íntegramente en el `saldoAFavor` del miembro manteniendo consistencia con `PagoImputacion`.
   */
  private async liberarMontoPagadoDeCargoEnTx(
    tx: Prisma.TransactionClient,
    cargoId: number,
    usuarioId: number,
    montoALiberar: number,
  ) {
    const montoRedondeado = round2(montoALiberar);
    if (montoRedondeado <= 0) return;

    const imputaciones = await tx.pagoImputacion.findMany({
      where: { cargoId },
      orderBy: { id: 'desc' },
      include: { pago: true },
    });

    let restante = montoRedondeado;

    for (const imp of imputaciones) {
      if (restante <= 0.001) break;
      const impMonto = Number(imp.montoImputado);
      const quitar = round2(Math.min(restante, impMonto));

      if (quitar >= impMonto - 0.001) {
        await tx.pagoImputacion.delete({ where: { id: imp.id } });
      } else {
        await tx.pagoImputacion.update({
          where: { id: imp.id },
          data: { montoImputado: redondearDosDecimales(impMonto - quitar) },
        });
      }

      if (imp.pago?.referenciaComprobante === 'APLICACION_SALDO_A_FAVOR') {
        const nuevoTotalPago = round2(Number(imp.pago.montoTotal) - quitar);
        if (nuevoTotalPago <= 0.001) {
          await tx.pago.delete({ where: { id: imp.pago.id } }).catch(() => null);
        } else {
          await tx.pago
            .update({
              where: { id: imp.pago.id },
              data: { montoTotal: redondearDosDecimales(nuevoTotalPago) },
            })
            .catch(() => null);
        }
      }

      restante = round2(restante - quitar);
    }

    await tx.usuario.update({
      where: { id: usuarioId },
      data: {
        saldoAFavor: { increment: redondearDosDecimales(montoRedondeado) },
      },
    });
  }

  /**
   * Elimina todos los cargos de un concepto y el concepto mismo.
   * Si algún cargo tenía pagos, devuelve automáticamente ese dinero al `saldoAFavor` del miembro.
   */
  private async eliminarConceptoConCargosEnTx(tx: Prisma.TransactionClient, conceptoId: number) {
    const cargos = tx.cargoMiembro?.findMany
      ? await tx.cargoMiembro.findMany({ where: { conceptoId } })
      : [];

    for (const cg of cargos) {
      const pagado = Number(cg.montoPagado);
      if (pagado > 0) {
        await this.liberarMontoPagadoDeCargoEnTx(tx, cg.id, cg.usuarioId, pagado);
      }
    }

    await tx.cargoMiembro.deleteMany({ where: { conceptoId } });
    return tx.conceptoCuota.delete({ where: { id: conceptoId } });
  }

  /**
   * Sincroniza los cargos de un concepto grupal (o mes de plan) con sus destinatarios actuales:
   * - Quita cargos de miembros excluidos o que ya no pertenecen al alcance (pasando lo pagado a Saldo a Favor).
   * - Recalcula montos y descuentos de cargos PENDIENTE o PARCIAL (respetando los ya PAGADO al 100%).
   * - Crea cargos para los nuevos miembros alcanzados.
   */
  private async sincronizarCargosDeConceptoEnTx(tx: Prisma.TransactionClient, concepto: any) {
    if (!concepto || concepto.destinatarioTipo === 'INDIVIDUAL') return;

    const excepciones: number[] = Array.isArray(concepto.excepcionesJson)
      ? (concepto.excepcionesJson as number[]).map((x) => Number(x))
      : [];

    const rolFiltro = this.construirFiltroRol(concepto.destinatarioTipo, concepto.esParaEducadores);

    const usuariosWhere: Prisma.UsuarioWhereInput = {
      activo: true,
      ...(excepciones.length > 0 ? { id: { notIn: excepciones } } : {}),
      asignaciones: {
        some: {
          activo: true,
          ...(concepto.unidadId ? { unidadId: concepto.unidadId } : {}),
          ...(rolFiltro ? { rol: rolFiltro } : {}),
        },
      },
    };

    const candidatos = await tx.usuario.findMany({
      where: usuariosWhere,
      include: { grupoFamiliar: true },
    });

    const candidatosMap = new Map<number, any>(candidatos.map((u) => [u.id, u]));

    const cargosExistentes = tx.cargoMiembro?.findMany
      ? await tx.cargoMiembro.findMany({
          where: { conceptoId: concepto.id },
        })
      : [];

    const montoBaseNum = Number(concepto.montoBase);

    for (const cargo of cargosExistentes) {
      const candidato = candidatosMap.get(cargo.usuarioId);

      if (!candidato) {
        // El miembro fue excluido (becado) o dejó de pertenecer a los destinatarios
        const pagado = Number(cargo.montoPagado);
        if (pagado > 0) {
          await this.liberarMontoPagadoDeCargoEnTx(tx, cargo.id, cargo.usuarioId, pagado);
        }
        await tx.cargoMiembro.delete({ where: { id: cargo.id } });
        continue;
      }

      candidatosMap.delete(cargo.usuarioId);

      // Si el cargo estaba ANULADO manualmente o ya estaba PAGADO al 100%, se respeta
      if (cargo.estado === EstadoCargo.ANULADO || cargo.estado === EstadoCargo.PAGADO) {
        continue;
      }

      // Recalcular cargo PENDIENTE o PARCIAL
      const { montoOriginal, montoDescuento, montoFinal } = this.calcularMontosCargo(
        montoBaseNum,
        concepto.permiteDescuentoHermanos ?? true,
        concepto.porcentajeDescuentoHermanos,
        candidato.grupoFamiliar,
      );

      const pagadoActual = Number(cargo.montoPagado);
      const nuevoFinalNum = Number(montoFinal);

      if (pagadoActual > nuevoFinalNum + 0.001) {
        const exceso = round2(pagadoActual - nuevoFinalNum);
        await this.liberarMontoPagadoDeCargoEnTx(tx, cargo.id, cargo.usuarioId, exceso);
        await tx.cargoMiembro.update({
          where: { id: cargo.id },
          data: {
            montoOriginal,
            montoDescuento,
            montoFinal,
            montoPagado: montoFinal,
            estado: EstadoCargo.PAGADO,
          },
        });
      } else {
        const nuevoEstado =
          pagadoActual >= nuevoFinalNum - 0.001 && nuevoFinalNum > 0
            ? EstadoCargo.PAGADO
            : pagadoActual > 0
              ? EstadoCargo.PARCIAL
              : EstadoCargo.PENDIENTE;

        await tx.cargoMiembro.update({
          where: { id: cargo.id },
          data: {
            montoOriginal,
            montoDescuento,
            montoFinal,
            estado: nuevoEstado,
          },
        });
      }
    }

    // Crear cargos para candidatos que aún no tenían cargo en este concepto
    for (const u of candidatosMap.values()) {
      const { montoOriginal, montoDescuento, montoFinal } = this.calcularMontosCargo(
        montoBaseNum,
        concepto.permiteDescuentoHermanos ?? true,
        concepto.porcentajeDescuentoHermanos,
        u.grupoFamiliar,
      );

      await tx.cargoMiembro.create({
        data: {
          usuarioId: u.id,
          conceptoId: concepto.id,
          montoOriginal,
          montoDescuento,
          montoFinal,
          montoPagado: new Prisma.Decimal(0),
          estado: EstadoCargo.PENDIENTE,
        },
      });
    }
  }

  /**
   * Recalcula automáticamente todas las cuotas PENDIENTE o PARCIAL de los miembros indicados
   * cuando cambia su Grupo Familiar o el porcentaje de descuento familiar.
   */
  async recalcularCargosPendientesDeUsuariosEnTx(tx: Prisma.TransactionClient, usuarioIds: number[]) {
    if (usuarioIds.length === 0) return;

    const usuarios = await tx.usuario.findMany({
      where: { id: { in: usuarioIds } },
      include: {
        grupoFamiliar: true,
        cargos: {
          where: {
            estado: { in: [EstadoCargo.PENDIENTE, EstadoCargo.PARCIAL] },
          },
          include: { concepto: true },
        },
      },
    });

    for (const u of usuarios) {
      for (const cargo of u.cargos) {
        if (!cargo.concepto || cargo.concepto.destinatarioTipo === 'INDIVIDUAL') continue;

        const montoBaseNum = Number(cargo.concepto.montoBase);
        const { montoOriginal, montoDescuento, montoFinal } = this.calcularMontosCargo(
          montoBaseNum,
          cargo.concepto.permiteDescuentoHermanos ?? true,
          cargo.concepto.porcentajeDescuentoHermanos,
          u.grupoFamiliar,
        );

        const pagadoActual = Number(cargo.montoPagado);
        const nuevoFinalNum = Number(montoFinal);

        if (pagadoActual > nuevoFinalNum + 0.001) {
          const exceso = round2(pagadoActual - nuevoFinalNum);
          await this.liberarMontoPagadoDeCargoEnTx(tx, cargo.id, u.id, exceso);
          await tx.cargoMiembro.update({
            where: { id: cargo.id },
            data: {
              montoOriginal,
              montoDescuento,
              montoFinal,
              montoPagado: montoFinal,
              estado: EstadoCargo.PAGADO,
            },
          });
        } else {
          const nuevoEstado =
            pagadoActual >= nuevoFinalNum - 0.001 && nuevoFinalNum > 0
              ? EstadoCargo.PAGADO
              : pagadoActual > 0
                ? EstadoCargo.PARCIAL
                : EstadoCargo.PENDIENTE;

          await tx.cargoMiembro.update({
            where: { id: cargo.id },
            data: {
              montoOriginal,
              montoDescuento,
              montoFinal,
              estado: nuevoEstado,
            },
          });
        }
      }
    }
  }

  /**
   * Asigna automáticamente las cuotas vigentes del ciclo actual a un miembro recién dado de alta o reactivado,
   * desde el mes indicado en adelante.
   */
  async sincronizarCuotasMiembroActivoEnTx(
    tx: Prisma.TransactionClient,
    usuarioId: number,
    mesDesde: number = new Date().getMonth() + 1,
    cicloAnio: number = new Date().getFullYear(),
  ) {
    const usuario = await tx.usuario.findUnique({
      where: { id: usuarioId },
      include: {
        grupoFamiliar: true,
        asignaciones: {
          where: { activo: true },
          include: { rol: true, unidad: true },
        },
        cargos: true,
      },
    });
    if (!usuario || !usuario.activo) return;

    const unidadesMiembro = new Set(usuario.asignaciones.map((a) => a.unidadId));
    const esEducador = usuario.asignaciones.some(
      (a) =>
        a.rol.alcancePorDefecto !== AlcanceRol.PROPIO ||
        a.rol.nombre.toLowerCase().includes('educador') ||
        a.rol.nombre.toLowerCase().includes('jefe'),
    );
    const esProtagonista = usuario.asignaciones.some(
      (a) =>
        a.rol.alcancePorDefecto === AlcanceRol.PROPIO ||
        a.rol.nombre.toLowerCase() === 'protagonista',
    );

    const conceptosVigentes = await tx.conceptoCuota.findMany({
      where: {
        cicloAnio,
        destinatarioTipo: { not: 'INDIVIDUAL' },
      },
    });

    const hoy = new Date();
    hoy.setUTCHours(0, 0, 0, 0);

    for (const concepto of conceptosVigentes) {
      // Si es cuota mensual, solo asignar desde mesDesde en adelante
      if (concepto.planCuotaMensualId !== null && concepto.mes !== null && concepto.mes < mesDesde) {
        continue;
      }
      // Si es evento suelto con fecha de vencimiento ya pasada, no asignar retroactivamente
      if (
        concepto.planCuotaMensualId === null &&
        concepto.fechaVencimiento &&
        new Date(concepto.fechaVencimiento) < hoy
      ) {
        continue;
      }

      // Verificar unidad
      if (concepto.unidadId && !unidadesMiembro.has(concepto.unidadId)) {
        continue;
      }

      // Verificar rol destinatario
      const tipoDest = concepto.destinatarioTipo || (concepto.esParaEducadores ? 'EDUCADORES' : 'TODOS');
      if (tipoDest === 'EDUCADORES' && !esEducador) continue;
      if (tipoDest === 'PROTAGONISTAS' && !esProtagonista) continue;

      // Verificar excepciones
      const excepciones: number[] = Array.isArray(concepto.excepcionesJson)
        ? (concepto.excepcionesJson as number[]).map((x) => Number(x))
        : [];
      if (excepciones.includes(usuario.id)) continue;

      const cargoExistente = usuario.cargos.find((c) => c.conceptoId === concepto.id);
      const { montoOriginal, montoDescuento, montoFinal } = this.calcularMontosCargo(
        Number(concepto.montoBase),
        concepto.permiteDescuentoHermanos ?? true,
        concepto.porcentajeDescuentoHermanos,
        usuario.grupoFamiliar,
      );

      if (cargoExistente) {
        if (cargoExistente.estado === EstadoCargo.ANULADO) {
          await tx.cargoMiembro.update({
            where: { id: cargoExistente.id },
            data: {
              montoOriginal,
              montoDescuento,
              montoFinal,
              montoPagado: new Prisma.Decimal(0),
              estado: EstadoCargo.PENDIENTE,
            },
          });
        }
      } else {
        await tx.cargoMiembro.create({
          data: {
            usuarioId: usuario.id,
            conceptoId: concepto.id,
            montoOriginal,
            montoDescuento,
            montoFinal,
            montoPagado: new Prisma.Decimal(0),
            estado: EstadoCargo.PENDIENTE,
          },
        });
      }
    }
  }

  /**
   * Al dar de baja a un miembro (`activo = false`), anula automáticamente todas sus cuotas impagas (`PENDIENTE`).
   */
  async anularCargosImpagosDeMiembroEnTx(tx: Prisma.TransactionClient, usuarioId: number) {
    await tx.cargoMiembro.updateMany({
      where: {
        usuarioId,
        estado: EstadoCargo.PENDIENTE,
        montoPagado: 0,
      },
      data: {
        estado: EstadoCargo.ANULADO,
      },
    });
  }

  // ===========================================================================
  // 1. PLANES DE CUOTA MENSUAL (CUADROS ANUALES)
  // ===========================================================================

  async listarPlanesCuotaMensual(alcance: AlcanceAcceso, cicloAnio?: number) {
    const where: Prisma.PlanCuotaMensualWhereInput = {
      ...(cicloAnio ? { cicloAnio } : {}),
      ...(alcance.tipo === 'UNIDAD'
        ? { OR: [{ unidadId: null }, { unidadId: { in: alcance.unidadIds } }] }
        : {}),
    };

    const planes = await this.prisma.planCuotaMensual.findMany({
      where,
      orderBy: [{ cicloAnio: 'desc' }, { id: 'desc' }],
      include: {
        unidad: { select: { id: true, nombre: true } },
        conceptos: {
          orderBy: { mes: 'asc' },
          include: {
            _count: { select: { cargos: true } },
            cargos: {
              select: {
                id: true,
                montoFinal: true,
                montoPagado: true,
                estado: true,
              },
            },
          },
        },
      },
    });

    return planes.map((p) => {
      const todosLosCargos = p.conceptos.flatMap((c) => c.cargos || []);
      const resumenRecaudacion = this.calcularResumenRecaudacion(todosLosCargos);
      return {
        ...p,
        resumenRecaudacion,
        conceptos: p.conceptos.map((c) => ({
          ...c,
          resumenMes: this.calcularResumenRecaudacion(c.cargos || []),
        })),
      };
    });
  }

  async crearPlanCuotaMensual(alcance: AlcanceAcceso, dto: CrearPlanCuotaMensualDto) {
    if (alcance.tipo === 'PROPIO') throw new ForbiddenException();
    if (dto.unidadId) {
      assertUnidadEnAlcance(alcance, dto.unidadId);
    } else if (alcance.tipo !== 'GLOBAL') {
      throw new ForbiddenException('Solo usuarios con alcance global pueden crear planes generales');
    }

    const mesesUnicos = [...new Set(dto.mesesHabilitados)].sort((a, b) => a - b);

    return this.prisma.$transaction(async (tx) => {
      const plan = await tx.planCuotaMensual.create({
        data: {
          nombre: dto.nombre,
          cicloAnio: dto.cicloAnio,
          montoMensual: new Prisma.Decimal(dto.montoMensual),
          diaVencimiento: dto.diaVencimiento,
          mesesHabilitadosJson: mesesUnicos,
          destinatarioTipo: dto.destinatarioTipo,
          unidadId: dto.unidadId ?? null,
          permiteDescuentoHermanos: dto.permiteDescuentoHermanos ?? true,
          porcentajeDescuentoHermanos:
            dto.porcentajeDescuentoHermanos !== undefined && dto.porcentajeDescuentoHermanos !== null
              ? new Prisma.Decimal(dto.porcentajeDescuentoHermanos)
              : null,
          excepcionesJson: dto.excepcionesIds ?? [],
        },
        include: { unidad: true },
      });

      for (const m of mesesUnicos) {
        await this.sincronizarMesDePlanEnTx(tx, plan, m);
      }

      return plan;
    });
  }

  async sincronizarMesesPlan(alcance: AlcanceAcceso, planId: number, dto: SincronizarMesesPlanDto) {
    if (alcance.tipo === 'PROPIO') throw new ForbiddenException();
    const plan = await this.prisma.planCuotaMensual.findUnique({
      where: { id: planId },
      include: { unidad: true, conceptos: true },
    });
    if (!plan) throw new NotFoundException('Plan no encontrado');

    if (plan.unidadId) {
      assertUnidadEnAlcance(alcance, plan.unidadId);
    } else if (alcance.tipo !== 'GLOBAL') {
      throw new ForbiddenException();
    }

    const nuevosMeses = [...new Set(dto.mesesHabilitados)].sort((a, b) => a - b);
    const nuevosMesesSet = new Set(nuevosMeses);

    return this.prisma.$transaction(async (tx) => {
      const planActualizado = await tx.planCuotaMensual.update({
        where: { id: planId },
        data: {
          mesesHabilitadosJson: nuevosMeses,
        },
        include: { unidad: true },
      });

      // 1. Eliminar los meses que fueron desmarcados (acreditando pagos previos a Saldo a Favor)
      for (const conceptoExistente of plan.conceptos) {
        if (conceptoExistente.mes !== null && !nuevosMesesSet.has(conceptoExistente.mes)) {
          await this.eliminarConceptoConCargosEnTx(tx, conceptoExistente.id);
        }
      }

      // 2. Crear o sincronizar los meses habilitados
      for (const m of nuevosMeses) {
        await this.sincronizarMesDePlanEnTx(tx, planActualizado, m);
      }

      return planActualizado;
    });
  }

  async editarPlanCuotaMensual(alcance: AlcanceAcceso, id: number, dto: EditarPlanCuotaMensualDto) {
    if (alcance.tipo === 'PROPIO') throw new ForbiddenException();
    const actual = await this.prisma.planCuotaMensual.findUnique({
      where: { id },
      include: { conceptos: true },
    });
    if (!actual) throw new NotFoundException('Plan no encontrado');

    if (actual.unidadId) {
      assertUnidadEnAlcance(alcance, actual.unidadId);
    } else if (alcance.tipo !== 'GLOBAL') {
      throw new ForbiddenException();
    }

    if (dto.unidadId !== undefined && dto.unidadId !== null) {
      assertUnidadEnAlcance(alcance, dto.unidadId);
    }

    const mesesFinales: number[] = dto.mesesHabilitados
      ? [...new Set(dto.mesesHabilitados)].sort((a, b) => a - b)
      : Array.isArray(actual.mesesHabilitadosJson)
        ? (actual.mesesHabilitadosJson as number[])
        : [];
    const mesesFinalesSet = new Set(mesesFinales);

    return this.prisma.$transaction(async (tx) => {
      const planActualizado = await tx.planCuotaMensual.update({
        where: { id },
        data: {
          nombre: dto.nombre,
          cicloAnio: dto.cicloAnio,
          montoMensual: dto.montoMensual !== undefined ? new Prisma.Decimal(dto.montoMensual) : undefined,
          diaVencimiento: dto.diaVencimiento,
          mesesHabilitadosJson: mesesFinales,
          destinatarioTipo: dto.destinatarioTipo,
          unidadId: dto.unidadId !== undefined ? dto.unidadId : undefined,
          permiteDescuentoHermanos: dto.permiteDescuentoHermanos,
          porcentajeDescuentoHermanos:
            dto.porcentajeDescuentoHermanos !== undefined
              ? dto.porcentajeDescuentoHermanos !== null
                ? new Prisma.Decimal(dto.porcentajeDescuentoHermanos)
                : null
              : undefined,
          excepcionesJson: dto.excepcionesIds !== undefined ? dto.excepcionesIds : undefined,
        },
        include: { unidad: true },
      });

      // 1. Eliminar conceptos/cargos de meses que hayan sido desmarcados
      for (const conceptoExistente of actual.conceptos) {
        if (conceptoExistente.mes !== null && !mesesFinalesSet.has(conceptoExistente.mes)) {
          await this.eliminarConceptoConCargosEnTx(tx, conceptoExistente.id);
        }
      }

      // 2. Actualizar y recalcular todos los meses habilitados del plan
      for (const m of mesesFinales) {
        await this.sincronizarMesDePlanEnTx(tx, planActualizado, m);
      }

      return planActualizado;
    });
  }

  async eliminarPlanCuotaMensual(alcance: AlcanceAcceso, id: number) {
    if (alcance.tipo === 'PROPIO') throw new ForbiddenException();
    const plan = await this.prisma.planCuotaMensual.findUnique({
      where: { id },
      include: {
        conceptos: true,
      },
    });
    if (!plan) throw new NotFoundException('Plan no encontrado');

    if (plan.unidadId) {
      assertUnidadEnAlcance(alcance, plan.unidadId);
    } else if (alcance.tipo !== 'GLOBAL') {
      throw new ForbiddenException();
    }

    return this.prisma.$transaction(async (tx) => {
      for (const c of plan.conceptos) {
        await this.eliminarConceptoConCargosEnTx(tx, c.id);
      }
      return tx.planCuotaMensual.delete({ where: { id } });
    });
  }

  private async sincronizarMesDePlanEnTx(tx: Prisma.TransactionClient, plan: any, mesNum: number) {
    const nombreMes = NOMBRES_MESES[mesNum - 1] || `Mes ${mesNum}`;
    const fechaVto = new Date(Date.UTC(plan.cicloAnio, mesNum - 1, plan.diaVencimiento || 10));

    let concepto = await tx.conceptoCuota.findFirst({
      where: {
        planCuotaMensualId: plan.id,
        mes: mesNum,
      },
    });

    const datosConcepto = {
      nombre: `${plan.nombre} - ${nombreMes}`,
      tipo: 'CUOTA_MENSUAL',
      montoBase: plan.montoMensual,
      cicloAnio: plan.cicloAnio,
      mes: mesNum,
      fechaVencimiento: fechaVto,
      planCuotaMensualId: plan.id,
      destinatarioTipo: plan.destinatarioTipo,
      unidadId: plan.unidadId,
      permiteDescuentoHermanos: plan.permiteDescuentoHermanos,
      porcentajeDescuentoHermanos: plan.porcentajeDescuentoHermanos,
      excepcionesJson: plan.excepcionesJson,
      esParaEducadores: plan.destinatarioTipo === 'EDUCADORES',
    };

    if (!concepto) {
      concepto = await tx.conceptoCuota.create({
        data: datosConcepto,
      });
    } else {
      concepto = await tx.conceptoCuota.update({
        where: { id: concepto.id },
        data: datosConcepto,
      });
    }

    await this.sincronizarCargosDeConceptoEnTx(tx, concepto);
  }

  // ===========================================================================
  // 2. CONCEPTOS DE CUOTA (CAMPAMENTOS, EVENTOS Y COBROS EXTRAORDINARIOS)
  // ===========================================================================

  async listarConceptos(alcance: AlcanceAcceso, cicloAnio?: number) {
    const where: Prisma.ConceptoCuotaWhereInput = {
      ...(cicloAnio ? { cicloAnio } : {}),
      destinatarioTipo: { not: 'INDIVIDUAL' },
      ...(alcance.tipo === 'UNIDAD'
        ? { OR: [{ unidadId: null }, { unidadId: { in: alcance.unidadIds } }] }
        : {}),
    };

    const conceptos = await this.prisma.conceptoCuota.findMany({
      where,
      orderBy: [{ cicloAnio: 'desc' }, { id: 'desc' }],
      include: {
        unidad: { select: { id: true, nombre: true } },
        _count: { select: { cargos: true } },
        cargos: {
          select: {
            id: true,
            montoFinal: true,
            montoPagado: true,
            estado: true,
          },
        },
      },
    });

    return conceptos.map((c) => ({
      ...c,
      resumenRecaudacion: this.calcularResumenRecaudacion(c.cargos || []),
    }));
  }

  async crearConcepto(alcance: AlcanceAcceso, dto: CrearConceptoDto) {
    if (alcance.tipo === 'PROPIO') {
      throw new ForbiddenException('No tiene permisos para gestionar conceptos');
    }
    if (dto.unidadId) {
      assertUnidadEnAlcance(alcance, dto.unidadId);
    } else if (alcance.tipo !== 'GLOBAL') {
      throw new ForbiddenException('Solo usuarios con alcance global pueden crear conceptos generales');
    }

    const destinatarioTipo = dto.destinatarioTipo ?? (dto.esParaEducadores ? 'EDUCADORES' : 'TODOS');

    if (this.prisma.$transaction && dto.generarCargosInmediatos !== false && destinatarioTipo !== 'INDIVIDUAL') {
      return this.prisma.$transaction(async (tx) => {
        const concepto = await tx.conceptoCuota.create({
          data: {
            nombre: dto.nombre,
            tipo: dto.tipo ?? 'CAMPAMENTO',
            montoBase: new Prisma.Decimal(dto.montoBase),
            cicloAnio: dto.cicloAnio,
            fechaVencimiento: dto.fechaVencimiento ? new Date(dto.fechaVencimiento) : null,
            permiteDescuentoHermanos: dto.permiteDescuentoHermanos ?? true,
            porcentajeDescuentoHermanos:
              dto.porcentajeDescuentoHermanos !== undefined && dto.porcentajeDescuentoHermanos !== null
                ? new Prisma.Decimal(dto.porcentajeDescuentoHermanos)
                : null,
            esParaEducadores: dto.esParaEducadores ?? destinatarioTipo === 'EDUCADORES',
            destinatarioTipo,
            excepcionesJson: dto.excepcionesIds ?? [],
            mes: dto.mes ?? null,
            planCuotaMensualId: dto.planCuotaMensualId ?? null,
            unidadId: dto.unidadId ?? null,
          },
          include: { unidad: { select: { id: true, nombre: true } } },
        });

        await this.sincronizarCargosDeConceptoEnTx(tx, concepto);
        return concepto;
      });
    }

    return this.prisma.conceptoCuota.create({
      data: {
        nombre: dto.nombre,
        tipo: dto.tipo ?? 'CAMPAMENTO',
        montoBase: new Prisma.Decimal(dto.montoBase),
        cicloAnio: dto.cicloAnio,
        fechaVencimiento: dto.fechaVencimiento ? new Date(dto.fechaVencimiento) : null,
        permiteDescuentoHermanos: dto.permiteDescuentoHermanos ?? true,
        porcentajeDescuentoHermanos:
          dto.porcentajeDescuentoHermanos !== undefined && dto.porcentajeDescuentoHermanos !== null
            ? new Prisma.Decimal(dto.porcentajeDescuentoHermanos)
            : null,
        esParaEducadores: dto.esParaEducadores ?? destinatarioTipo === 'EDUCADORES',
        destinatarioTipo,
        excepcionesJson: dto.excepcionesIds ?? [],
        mes: dto.mes ?? null,
        planCuotaMensualId: dto.planCuotaMensualId ?? null,
        unidadId: dto.unidadId ?? null,
      },
      include: { unidad: { select: { id: true, nombre: true } } },
    });
  }

  async editarConcepto(alcance: AlcanceAcceso, id: number, dto: EditarConceptoDto) {
    if (alcance.tipo === 'PROPIO') throw new ForbiddenException();
    const actual = await this.prisma.conceptoCuota.findUnique({ where: { id } });
    if (!actual) throw new NotFoundException('Concepto no encontrado');

    if (actual.unidadId) {
      assertUnidadEnAlcance(alcance, actual.unidadId);
    } else if (alcance.tipo !== 'GLOBAL') {
      throw new ForbiddenException('Solo usuarios globales pueden editar conceptos generales');
    }

    if (dto.unidadId !== undefined && dto.unidadId !== null) {
      assertUnidadEnAlcance(alcance, dto.unidadId);
    }

    const data: Prisma.ConceptoCuotaUpdateInput = {};
    if (dto.nombre !== undefined) data.nombre = dto.nombre;
    if (dto.tipo !== undefined) data.tipo = dto.tipo;
    if (dto.montoBase !== undefined) data.montoBase = new Prisma.Decimal(dto.montoBase);
    if (dto.cicloAnio !== undefined) data.cicloAnio = dto.cicloAnio;
    if (dto.fechaVencimiento !== undefined) {
      data.fechaVencimiento = dto.fechaVencimiento ? new Date(dto.fechaVencimiento) : null;
    }
    if (dto.permiteDescuentoHermanos !== undefined) {
      data.permiteDescuentoHermanos = dto.permiteDescuentoHermanos;
    }
    if (dto.porcentajeDescuentoHermanos !== undefined) {
      data.porcentajeDescuentoHermanos =
        dto.porcentajeDescuentoHermanos !== null
          ? new Prisma.Decimal(dto.porcentajeDescuentoHermanos)
          : null;
    }
    if (dto.esParaEducadores !== undefined) {
      data.esParaEducadores = dto.esParaEducadores;
    }
    if (dto.destinatarioTipo !== undefined) {
      data.destinatarioTipo = dto.destinatarioTipo;
      data.esParaEducadores = dto.destinatarioTipo === 'EDUCADORES';
    }
    if (dto.excepcionesIds !== undefined) {
      data.excepcionesJson = dto.excepcionesIds;
    }
    if (dto.mes !== undefined) {
      data.mes = dto.mes;
    }
    if (dto.unidadId !== undefined) {
      data.unidad = dto.unidadId ? { connect: { id: dto.unidadId } } : { disconnect: true };
    }

    if (this.prisma.$transaction && dto.sincronizarCargos !== false) {
      return this.prisma.$transaction(async (tx) => {
        const actualizado = await tx.conceptoCuota.update({
          where: { id },
          data,
          include: { unidad: { select: { id: true, nombre: true } } },
        });
        await this.sincronizarCargosDeConceptoEnTx(tx, actualizado);
        return actualizado;
      });
    }

    return this.prisma.conceptoCuota.update({
      where: { id },
      data,
      include: { unidad: { select: { id: true, nombre: true } } },
    });
  }

  async eliminarConcepto(alcance: AlcanceAcceso, id: number) {
    if (alcance.tipo === 'PROPIO') throw new ForbiddenException();
    const actual = await this.prisma.conceptoCuota.findUnique({
      where: { id },
      include: {
        _count: {
          select: { cargos: true },
        },
      },
    });
    if (!actual) throw new NotFoundException('Concepto no encontrado');

    if (actual.unidadId) {
      assertUnidadEnAlcance(alcance, actual.unidadId);
    } else if (alcance.tipo !== 'GLOBAL') {
      throw new ForbiddenException('Solo usuarios globales pueden eliminar conceptos generales');
    }

    if (actual._count.cargos > 0) {
      return this.prisma.$transaction(async (tx) => {
        return this.eliminarConceptoConCargosEnTx(tx, id);
      });
    }

    return this.prisma.conceptoCuota.delete({ where: { id } });
  }

  // ===========================================================================
  // 3. GRUPOS FAMILIARES Y DESCUENTO POR HERMANOS
  // ===========================================================================

  async listarGruposFamiliares() {
    return this.prisma.grupoFamiliar.findMany({
      orderBy: { nombreFamilia: 'asc' },
      include: {
        miembros: {
          select: {
            id: true,
            dni: true,
            nombre: true,
            apellido: true,
            activo: true,
            asignaciones: {
              where: { activo: true },
              select: {
                unidad: { select: { id: true, nombre: true } },
                rol: { select: { id: true, nombre: true } },
              },
            },
          },
        },
      },
    });
  }

  async actualizarDescuentoFamilia(id: number, dto: ActualizarDescuentoFamiliaDto) {
    const familiar = await this.prisma.grupoFamiliar.findUnique({
      where: { id },
      include: { miembros: { select: { id: true } } },
    });
    if (!familiar) throw new NotFoundException('Grupo familiar no encontrado');

    return this.prisma.$transaction(async (tx) => {
      const actualizado = await tx.grupoFamiliar.update({
        where: { id },
        data: {
          nombreFamilia: dto.nombreFamilia,
          porcentajeDescuentoHermanos: new Prisma.Decimal(dto.porcentajeDescuentoHermanos),
        },
      });

      const miembroIds = familiar.miembros.map((m) => m.id);
      await this.recalcularCargosPendientesDeUsuariosEnTx(tx, miembroIds);

      return actualizado;
    });
  }

  async vincularHermano(dto: VincularHermanoDto) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: dto.usuarioId },
      select: { id: true, apellido: true, grupoFamiliarId: true, datosFijosJson: true },
    });
    if (!usuario) throw new NotFoundException('Miembro no encontrado');

    const hermano = await this.prisma.usuario.findUnique({
      where: { dni: dto.hermanoDni },
      select: { id: true, apellido: true, grupoFamiliarId: true, datosFijosJson: true },
    });
    if (!hermano) throw new NotFoundException(`No existe un miembro registrado con el DNI ${dto.hermanoDni}`);
    if (hermano.id === usuario.id) throw new BadRequestException('No puede vincular a un miembro consigo mismo');

    const CLAVES_FAMILIARES_COMPARTIDAS = [
      'domicilio',
      'obra_social',
      'madre_nombres',
      'madre_dni',
      'madre_domicilio',
      'madre_email',
      'madre_telefono',
      'madre_profesion',
      'padre_nombres',
      'padre_dni',
      'padre_domicilio',
      'padre_email',
      'padre_telefono',
      'padre_profesion',
      'tutor_nombres',
      'tutor_dni',
      'tutor_domicilio',
      'tutor_email',
      'tutor_telefono',
      'tutor_profesion',
      'telefono_urgencias',
      'emergencia_nombre',
      'emergencia_telefono',
    ];

    const datosUsuario = ((usuario.datosFijosJson ?? {}) as Record<string, unknown>);
    const datosHermano = ((hermano.datosFijosJson ?? {}) as Record<string, unknown>);
    const mergedUsuario = { ...datosUsuario };
    const mergedHermano = { ...datosHermano };

    for (const clave of CLAVES_FAMILIARES_COMPARTIDAS) {
      const valU = String(mergedUsuario[clave] ?? '').trim();
      const valH = String(mergedHermano[clave] ?? '').trim();
      if (!valU && valH) mergedUsuario[clave] = mergedHermano[clave];
      if (!valH && valU) mergedHermano[clave] = mergedUsuario[clave];
    }

    return this.prisma.$transaction(async (tx) => {
      let grupoId = usuario.grupoFamiliarId || hermano.grupoFamiliarId;

      if (
        usuario.grupoFamiliarId &&
        hermano.grupoFamiliarId &&
        usuario.grupoFamiliarId !== hermano.grupoFamiliarId
      ) {
        await tx.usuario.updateMany({
          where: { grupoFamiliarId: hermano.grupoFamiliarId },
          data: { grupoFamiliarId: usuario.grupoFamiliarId },
        });
        await tx.grupoFamiliar.delete({ where: { id: hermano.grupoFamiliarId } }).catch(() => null);
        grupoId = usuario.grupoFamiliarId;
      } else if (!grupoId) {
        const nuevoGrupo = await tx.grupoFamiliar.create({
          data: {
            nombreFamilia: `Familia ${hermano.apellido || usuario.apellido}`,
            porcentajeDescuentoHermanos: new Prisma.Decimal(0),
          },
        });
        grupoId = nuevoGrupo.id;
      }

      await tx.usuario.update({
        where: { id: usuario.id },
        data: {
          grupoFamiliarId: grupoId,
          datosFijosJson: mergedUsuario as Prisma.InputJsonObject,
        },
      });
      await tx.usuario.update({
        where: { id: hermano.id },
        data: {
          grupoFamiliarId: grupoId,
          datosFijosJson: mergedHermano as Prisma.InputJsonObject,
        },
      });

      const grupoActualizado = await tx.grupoFamiliar.findUnique({
        where: { id: grupoId },
        include: {
          miembros: {
            select: {
              id: true,
              dni: true,
              nombre: true,
              apellido: true,
              activo: true,
              asignaciones: {
                where: { activo: true },
                select: {
                  unidad: { select: { id: true, nombre: true } },
                  rol: { select: { id: true, nombre: true } },
                },
              },
            },
          },
        },
      });

      const miembroIds = (grupoActualizado?.miembros || []).map((m) => m.id);
      await this.recalcularCargosPendientesDeUsuariosEnTx(tx, miembroIds);

      return grupoActualizado;
    });
  }

  async desvincularHermano(dto: DesvincularHermanoDto) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: dto.usuarioId },
      select: { id: true, grupoFamiliarId: true },
    });
    if (!usuario) throw new NotFoundException('Miembro no encontrado');
    if (!usuario.grupoFamiliarId) {
      throw new BadRequestException('El miembro no pertenece a ningún grupo familiar');
    }

    const grupoIdAnterior = usuario.grupoFamiliarId;

    return this.prisma.$transaction(async (tx) => {
      await tx.usuario.update({
        where: { id: usuario.id },
        data: { grupoFamiliarId: null },
      });

      // Recalcular cuotas del miembro desvinculado (ahora sin descuento familiar)
      await this.recalcularCargosPendientesDeUsuariosEnTx(tx, [usuario.id]);

      // Si el grupo familiar quedó con 1 o 0 miembros, limpiar el grupo familiar
      const restantes = await tx.usuario.findMany({
        where: { grupoFamiliarId: grupoIdAnterior },
        select: { id: true },
      });

      if (restantes.length <= 1) {
        if (restantes.length === 1) {
          await tx.usuario.update({
            where: { id: restantes[0].id },
            data: { grupoFamiliarId: null },
          });
          await this.recalcularCargosPendientesDeUsuariosEnTx(tx, [restantes[0].id]);
        }
        await tx.grupoFamiliar.delete({ where: { id: grupoIdAnterior } }).catch(() => null);
      }

      return { mensaje: 'Miembro desvinculado del grupo familiar y cuotas recalculadas.' };
    });
  }

  async eliminarGrupoFamiliar(id: number) {
    const grupo = await this.prisma.grupoFamiliar.findUnique({
      where: { id },
      include: { miembros: { select: { id: true } } },
    });
    if (!grupo) throw new NotFoundException('Grupo familiar no encontrado');

    return this.prisma.$transaction(async (tx) => {
      const miembroIds = grupo.miembros.map((m) => m.id);
      await tx.usuario.updateMany({
        where: { grupoFamiliarId: id },
        data: { grupoFamiliarId: null },
      });
      await this.recalcularCargosPendientesDeUsuariosEnTx(tx, miembroIds);
      await tx.grupoFamiliar.delete({ where: { id } });
      return { mensaje: 'Grupo familiar eliminado y cuotas recalculadas.' };
    });
  }

  // ===========================================================================
  // 4. GENERACIÓN, EDICIÓN, ANULACIÓN Y REACTIVACIÓN DE CARGOS
  // ===========================================================================

  async generarCargos(alcance: AlcanceAcceso, dto: GenerarCargosDto) {
    const concepto = await this.prisma.conceptoCuota.findUnique({
      where: { id: dto.conceptoId },
      include: { unidad: true },
    });
    if (!concepto) throw new NotFoundException('Concepto no encontrado');

    if (concepto.unidadId) {
      assertUnidadEnAlcance(alcance, concepto.unidadId);
    } else if (alcance.tipo !== 'GLOBAL' && !dto.unidadId) {
      throw new ForbiddenException(
        'Para generar cargos de un concepto general con alcance de unidad, debe especificar su unidadId',
      );
    }

    const targetUnidadId = dto.unidadId ?? concepto.unidadId;
    if (targetUnidadId) {
      assertUnidadEnAlcance(alcance, targetUnidadId);
    }

    const excepcionesConcepto: number[] = Array.isArray(concepto.excepcionesJson)
      ? (concepto.excepcionesJson as number[])
      : [];
    const excluirIds = [...new Set([...(dto.excluirUsuarioIds ?? []), ...excepcionesConcepto])];

    const rolFiltro = this.construirFiltroRol(concepto.destinatarioTipo, concepto.esParaEducadores);

    const usuariosWhere: Prisma.UsuarioWhereInput = {
      activo: true,
      ...(dto.usuarioIds ? { id: { in: dto.usuarioIds } } : {}),
      ...(excluirIds.length > 0 ? { id: { notIn: excluirIds } } : {}),
      asignaciones: {
        some: {
          activo: true,
          ...(targetUnidadId ? { unidadId: targetUnidadId } : {}),
          ...(rolFiltro ? { rol: rolFiltro } : {}),
        },
      },
    };

    const candidatos = await this.prisma.usuario.findMany({
      where: usuariosWhere,
      include: {
        grupoFamiliar: true,
        cargos: {
          where: { conceptoId: concepto.id, estado: { not: EstadoCargo.ANULADO } },
        },
      },
    });

    if (candidatos.length === 0) {
      return { totalGenerados: 0, cargos: [] };
    }

    const montoBaseNum = Number(concepto.montoBase);

    return this.prisma.$transaction(async (tx) => {
      const cargosCreados = [];

      for (const u of candidatos) {
        if (u.cargos.length > 0) continue;

        const permiteDesc = Boolean(dto.aplicarDescuentoFamiliar && (concepto.permiteDescuentoHermanos ?? true));
        const { montoOriginal, montoDescuento, montoFinal } = this.calcularMontosCargo(
          montoBaseNum,
          permiteDesc,
          concepto.porcentajeDescuentoHermanos,
          u.grupoFamiliar,
        );

        const cargo = await tx.cargoMiembro.create({
          data: {
            usuarioId: u.id,
            conceptoId: concepto.id,
            montoOriginal,
            montoDescuento,
            montoFinal,
            montoPagado: new Prisma.Decimal(0),
            estado: EstadoCargo.PENDIENTE,
          },
          include: {
            usuario: { select: { id: true, nombre: true, apellido: true, dni: true } },
            concepto: { select: { id: true, nombre: true } },
          },
        });
        cargosCreados.push(cargo);
      }

      return {
        totalGenerados: cargosCreados.length,
        cargos: cargosCreados,
      };
    });
  }

  async generarCargoIndividual(actor: AuthUser, alcance: AlcanceAcceso, dto: GenerarCargoIndividualDto) {
    if (alcance.tipo === 'PROPIO') {
      throw new ForbiddenException('No tiene permisos para generar cargos');
    }

    const usuario = await this.prisma.usuario.findUnique({
      where: { id: dto.usuarioId },
      include: { asignaciones: { where: { activo: true }, select: { unidadId: true } } },
    });
    if (!usuario) throw new NotFoundException('Miembro no encontrado');

    if (alcance.tipo === 'UNIDAD') {
      const unidadesMiembro = usuario.asignaciones.map((a) => a.unidadId);
      const tieneUnidad = unidadesMiembro.some((uId) => alcance.unidadIds.includes(uId));
      if (!tieneUnidad) throw new ForbiddenException('El miembro no pertenece a su unidad');
    }

    let conceptoId = dto.conceptoId;
    if (!conceptoId) {
      const nombreConcepto = dto.nombreConcepto?.trim() || 'Cargo Individual Extraordinario';
      const conceptoNuevo = await this.prisma.conceptoCuota.create({
        data: {
          nombre: nombreConcepto,
          tipo: dto.tipo ?? 'OTRO',
          montoBase: new Prisma.Decimal(dto.monto),
          cicloAnio: dto.cicloAnio ?? new Date().getFullYear(),
          fechaVencimiento: dto.fechaVencimiento ? new Date(dto.fechaVencimiento) : null,
          permiteDescuentoHermanos: false,
          destinatarioTipo: 'INDIVIDUAL',
        },
      });
      conceptoId = conceptoNuevo.id;
    }

    const montoOriginal = redondearDosDecimales(dto.monto);
    const montoDescuento = redondearDosDecimales(dto.montoDescuento ?? 0);
    const montoFinal = redondearDosDecimales(Math.max(0, dto.monto - (dto.montoDescuento ?? 0)));

    return this.prisma.cargoMiembro.create({
      data: {
        usuarioId: dto.usuarioId,
        conceptoId,
        montoOriginal,
        montoDescuento,
        montoFinal,
        montoPagado: new Prisma.Decimal(0),
        estado: EstadoCargo.PENDIENTE,
      },
      include: {
        concepto: true,
        usuario: { select: { id: true, nombre: true, apellido: true, dni: true } },
      },
    });
  }

  async editarCargoIndividual(alcance: AlcanceAcceso, id: number, dto: EditarCargoIndividualDto) {
    if (alcance.tipo === 'PROPIO') throw new ForbiddenException();

    const cargo = await this.prisma.cargoMiembro.findUnique({
      where: { id },
      include: {
        concepto: true,
        usuario: { select: { id: true, asignaciones: { where: { activo: true }, select: { unidadId: true } } } },
      },
    });
    if (!cargo) throw new NotFoundException('Cargo no encontrado');

    if (alcance.tipo === 'UNIDAD') {
      const uIds = cargo.usuario.asignaciones.map((a) => a.unidadId);
      const enAlcance = uIds.some((uId) => alcance.unidadIds.includes(uId));
      if (!enAlcance) throw new ForbiddenException('El cargo pertenece a un miembro fuera de su unidad');
    }

    if (dto.montoDescuento > dto.montoOriginal) {
      throw new BadRequestException('El descuento no puede superar el monto original');
    }

    const montoOriginal = redondearDosDecimales(dto.montoOriginal);
    const montoDescuento = redondearDosDecimales(dto.montoDescuento);
    const nuevoFinalNum = round2(Math.max(0, dto.montoOriginal - dto.montoDescuento));
    const montoFinal = redondearDosDecimales(nuevoFinalNum);

    return this.prisma.$transaction(async (tx) => {
      // Si es un concepto INDIVIDUAL, permitir actualizar su nombre y vencimiento
      if (
        cargo.concepto?.destinatarioTipo === 'INDIVIDUAL' &&
        (dto.nombreConcepto !== undefined || dto.fechaVencimiento !== undefined)
      ) {
        await tx.conceptoCuota.update({
          where: { id: cargo.conceptoId },
          data: {
            ...(dto.nombreConcepto ? { nombre: dto.nombreConcepto } : {}),
            montoBase: montoOriginal,
            ...(dto.fechaVencimiento !== undefined
              ? { fechaVencimiento: dto.fechaVencimiento ? new Date(dto.fechaVencimiento) : null }
              : {}),
          },
        });
      }

      const pagadoActual = Number(cargo.montoPagado);
      let montoPagadoFinal = cargo.montoPagado;
      let nuevoEstado = cargo.estado;

      if (cargo.estado !== EstadoCargo.ANULADO) {
        if (pagadoActual > nuevoFinalNum + 0.001) {
          const exceso = round2(pagadoActual - nuevoFinalNum);
          await this.liberarMontoPagadoDeCargoEnTx(tx, cargo.id, cargo.usuarioId, exceso);
          montoPagadoFinal = montoFinal;
          nuevoEstado = EstadoCargo.PAGADO;
        } else {
          nuevoEstado =
            pagadoActual >= nuevoFinalNum - 0.001 && nuevoFinalNum > 0
              ? EstadoCargo.PAGADO
              : pagadoActual > 0
                ? EstadoCargo.PARCIAL
                : EstadoCargo.PENDIENTE;
        }
      }

      return tx.cargoMiembro.update({
        where: { id },
        data: {
          montoOriginal,
          montoDescuento,
          montoFinal,
          montoPagado: montoPagadoFinal,
          estado: nuevoEstado,
        },
        include: {
          concepto: true,
          usuario: { select: { id: true, nombre: true, apellido: true, dni: true } },
        },
      });
    });
  }

  /**
   * Anula un cargo. Si tenía pagos imputados (parciales o totales), libera lo pagado
   * acreditándolo automáticamente en el `saldoAFavor` del miembro.
   */
  async anularCargo(alcance: AlcanceAcceso, id: number) {
    if (alcance.tipo === 'PROPIO') throw new ForbiddenException();
    const cargo = await this.prisma.cargoMiembro.findUnique({
      where: { id },
      include: {
        imputaciones: true,
        usuario: { select: { id: true, asignaciones: { where: { activo: true }, select: { unidadId: true } } } },
      },
    });
    if (!cargo) throw new NotFoundException('Cargo no encontrado');

    if (alcance.tipo === 'UNIDAD') {
      const uIds = cargo.usuario.asignaciones.map((a) => a.unidadId);
      const enAlcance = uIds.some((uId) => alcance.unidadIds.includes(uId));
      if (!enAlcance) throw new ForbiddenException('El cargo pertenece a un miembro fuera de su unidad');
    }

    const pagado = Number(cargo.montoPagado);

    if (this.prisma.$transaction && pagado > 0) {
      return this.prisma.$transaction(async (tx) => {
        await this.liberarMontoPagadoDeCargoEnTx(tx, cargo.id, cargo.usuario.id, pagado);
        return tx.cargoMiembro.update({
          where: { id },
          data: {
            montoPagado: new Prisma.Decimal(0),
            estado: EstadoCargo.ANULADO,
          },
          include: {
            concepto: true,
            usuario: { select: { id: true, nombre: true, apellido: true, dni: true } },
          },
        });
      });
    }

    return this.prisma.cargoMiembro.update({
      where: { id },
      data: {
        montoPagado: new Prisma.Decimal(0),
        estado: EstadoCargo.ANULADO,
      },
      include: {
        concepto: true,
        usuario: { select: { id: true, nombre: true, apellido: true, dni: true } },
      },
    });
  }

  /**
   * Reactiva un cargo que había sido anulado, volviéndolo a estado PENDIENTE.
   */
  async reactivarCargo(alcance: AlcanceAcceso, id: number) {
    if (alcance.tipo === 'PROPIO') throw new ForbiddenException();
    const cargo = await this.prisma.cargoMiembro.findUnique({
      where: { id },
      include: {
        concepto: true,
        usuario: {
          select: {
            id: true,
            grupoFamiliar: true,
            asignaciones: { where: { activo: true }, select: { unidadId: true } },
          },
        },
      },
    });
    if (!cargo) throw new NotFoundException('Cargo no encontrado');

    if (alcance.tipo === 'UNIDAD') {
      const uIds = cargo.usuario.asignaciones.map((a) => a.unidadId);
      const enAlcance = uIds.some((uId) => alcance.unidadIds.includes(uId));
      if (!enAlcance) throw new ForbiddenException('El cargo pertenece a un miembro fuera de su unidad');
    }

    if (cargo.estado !== EstadoCargo.ANULADO) {
      throw new BadRequestException('Solo se pueden reactivar cargos que estén anulados');
    }

    let montoOriginal = cargo.montoOriginal;
    let montoDescuento = cargo.montoDescuento;
    let montoFinal = cargo.montoFinal;

    if (cargo.concepto && cargo.concepto.destinatarioTipo !== 'INDIVIDUAL') {
      const calc = this.calcularMontosCargo(
        Number(cargo.concepto.montoBase),
        cargo.concepto.permiteDescuentoHermanos ?? true,
        cargo.concepto.porcentajeDescuentoHermanos,
        cargo.usuario.grupoFamiliar,
      );
      montoOriginal = calc.montoOriginal;
      montoDescuento = calc.montoDescuento;
      montoFinal = calc.montoFinal;
    }

    return this.prisma.cargoMiembro.update({
      where: { id },
      data: {
        montoOriginal,
        montoDescuento,
        montoFinal,
        montoPagado: new Prisma.Decimal(0),
        estado: EstadoCargo.PENDIENTE,
      },
      include: {
        concepto: true,
        usuario: { select: { id: true, nombre: true, apellido: true, dni: true } },
      },
    });
  }

  /**
   * Elimina definitivamente un cargo individual. Si tenía pagos, pasan a Saldo a Favor.
   */
  async eliminarCargo(alcance: AlcanceAcceso, id: number) {
    if (alcance.tipo === 'PROPIO') throw new ForbiddenException();
    const cargo = await this.prisma.cargoMiembro.findUnique({
      where: { id },
      include: {
        concepto: true,
        usuario: { select: { id: true, asignaciones: { where: { activo: true }, select: { unidadId: true } } } },
      },
    });
    if (!cargo) throw new NotFoundException('Cargo no encontrado');

    if (alcance.tipo === 'UNIDAD') {
      const uIds = cargo.usuario.asignaciones.map((a) => a.unidadId);
      const enAlcance = uIds.some((uId) => alcance.unidadIds.includes(uId));
      if (!enAlcance) throw new ForbiddenException('El cargo pertenece a un miembro fuera de su unidad');
    }

    return this.prisma.$transaction(async (tx) => {
      const pagado = Number(cargo.montoPagado);
      if (pagado > 0) {
        await this.liberarMontoPagadoDeCargoEnTx(tx, cargo.id, cargo.usuario.id, pagado);
      }

      // Si el miembro pertenece a un concepto grupal y se elimina su cargo, agregarlo a excepcionesJson para que no se regenere solo
      if (cargo.concepto && cargo.concepto.destinatarioTipo !== 'INDIVIDUAL') {
        const excActuales: number[] = Array.isArray(cargo.concepto.excepcionesJson)
          ? (cargo.concepto.excepcionesJson as number[])
          : [];
        if (!excActuales.includes(cargo.usuario.id)) {
          await tx.conceptoCuota.update({
            where: { id: cargo.conceptoId },
            data: { excepcionesJson: [...excActuales, cargo.usuario.id] },
          });
        }
      }

      await tx.cargoMiembro.delete({ where: { id } });

      // Si era un concepto individual exclusivo, borrar también el concepto huérfano
      if (cargo.concepto?.destinatarioTipo === 'INDIVIDUAL') {
        await tx.conceptoCuota.delete({ where: { id: cargo.conceptoId } }).catch(() => null);
      }

      return { mensaje: 'Cargo eliminado correctamente.' };
    });
  }

  // ===========================================================================
  // 5. LISTADO DE CARGOS Y ESTADO DE CUENTA COMPLETO
  // ===========================================================================

  async listarCargos(alcance: AlcanceAcceso, q: ListarCargosQueryDto) {
    const where: Prisma.CargoMiembroWhereInput = {
      AND: [
        { usuario: filtroUsuariosPorAlcance(alcance) },
        q.usuarioId ? { usuarioId: q.usuarioId } : {},
        q.conceptoId ? { conceptoId: q.conceptoId } : {},
        q.planCuotaMensualId ? { concepto: { planCuotaMensualId: q.planCuotaMensualId } } : {},
        q.estado ? { estado: q.estado } : {},
        q.cicloAnio ? { concepto: { cicloAnio: q.cicloAnio } } : {},
        q.unidadId
          ? {
              usuario: {
                asignaciones: { some: { activo: true, unidadId: q.unidadId } },
              },
            }
          : {},
      ],
    };

    return this.prisma.cargoMiembro.findMany({
      where,
      orderBy: [{ estado: 'asc' }, { id: 'desc' }],
      include: {
        usuario: {
          select: {
            id: true,
            dni: true,
            nombre: true,
            apellido: true,
            asignaciones: {
              where: { activo: true },
              select: { unidad: { select: { id: true, nombre: true } } },
            },
          },
        },
        concepto: {
          select: {
            id: true,
            nombre: true,
            tipo: true,
            cicloAnio: true,
            mes: true,
            fechaVencimiento: true,
            destinatarioTipo: true,
          },
        },
      },
    });
  }

  async obtenerEstadoCuenta(alcance: AlcanceAcceso, usuarioId: number) {
    const usuario = await this.prisma.usuario.findFirst({
      where: { AND: [{ id: usuarioId }, filtroUsuariosPorAlcance(alcance)] },
      select: {
        id: true,
        dni: true,
        nombre: true,
        apellido: true,
        saldoAFavor: true,
        grupoFamiliar: {
          select: {
            id: true,
            nombreFamilia: true,
            porcentajeDescuentoHermanos: true,
            miembros: {
              where: { activo: true },
              select: { id: true, nombre: true, apellido: true, dni: true },
            },
          },
        },
      },
    });
    if (!usuario) throw new NotFoundException('Miembro no encontrado en su alcance');

    const todosLosCargos = await this.prisma.cargoMiembro.findMany({
      where: { usuarioId },
      orderBy: [{ concepto: { cicloAnio: 'desc' } }, { concepto: { mes: 'asc' } }, { id: 'desc' }],
      include: {
        concepto: {
          select: {
            id: true,
            nombre: true,
            tipo: true,
            cicloAnio: true,
            mes: true,
            fechaVencimiento: true,
            planCuotaMensualId: true,
            destinatarioTipo: true,
          },
        },
        imputaciones: {
          include: { pago: { select: { id: true, fechaPago: true, metodoPago: true, referenciaComprobante: true } } },
        },
      },
    });

    const cargos = todosLosCargos.filter((c) => c.estado !== EstadoCargo.ANULADO);
    const cargosAnulados = todosLosCargos.filter((c) => c.estado === EstadoCargo.ANULADO);

    const pagos = await this.prisma.pago.findMany({
      where: {
        OR: [{ usuarioId }, { imputaciones: { some: { cargo: { usuarioId } } } }],
      },
      orderBy: { fechaPago: 'desc' },
      take: 50,
      include: {
        registradoPor: { select: { id: true, nombre: true, apellido: true } },
        imputaciones: {
          include: {
            cargo: { select: { id: true, concepto: { select: { nombre: true } } } },
          },
        },
      },
    });

    let totalOriginal = 0;
    let totalDescuento = 0;
    let totalFinal = 0;
    let totalPagado = 0;

    for (const c of cargos) {
      totalOriginal += Number(c.montoOriginal);
      totalDescuento += Number(c.montoDescuento);
      totalFinal += Number(c.montoFinal);
      totalPagado += Number(c.montoPagado);
    }

    const saldoPendiente = Math.max(0, totalFinal - totalPagado);

    return {
      usuario,
      resumen: {
        totalCargos: cargos.length,
        totalAnulados: cargosAnulados.length,
        totalOriginal: round2(totalOriginal),
        totalDescuento: round2(totalDescuento),
        totalFinal: round2(totalFinal),
        totalPagado: round2(totalPagado),
        saldoPendiente: round2(saldoPendiente),
        saldoAFavor: Number(usuario.saldoAFavor ?? 0),
      },
      cargos,
      cargosAnulados,
      pagos,
    };
  }

  // ===========================================================================
  // 6. REGISTRO UNIFICADO, EDICIÓN Y REVERSIÓN DE PAGOS + SALDO A FAVOR
  // ===========================================================================

  async registrarPago(actor: AuthUser, alcance: AlcanceAcceso, dto: RegistrarPagoDto) {
    if (alcance.tipo === 'PROPIO') {
      throw new ForbiddenException('No tiene permisos para registrar pagos');
    }

    const sumaImputaciones = round2(dto.imputaciones.reduce((acc, curr) => acc + curr.monto, 0));
    const montoTotalRedondeado = round2(dto.montoTotal);

    return this.prisma.$transaction(async (tx) => {
      let targetUsuarioId = dto.usuarioId;
      let saldoDisponible = 0;

      if (targetUsuarioId && tx.usuario?.findUnique) {
        const u = await tx.usuario.findUnique({ where: { id: targetUsuarioId } });
        if (u) saldoDisponible = Number(u.saldoAFavor ?? 0);
      }

      // Calcular cuánto saldo a favor se usa en este cobro unificado
      let saldoAAplicar = 0;
      if (dto.usarSaldoAFavor && sumaImputaciones > 0) {
        const pedido =
          dto.montoSaldoAFavor !== undefined ? dto.montoSaldoAFavor : Math.min(saldoDisponible, sumaImputaciones);
        saldoAAplicar = round2(Math.min(pedido, saldoDisponible, sumaImputaciones));
      }

      const requeridoEnCaja = round2(Math.max(0, sumaImputaciones - saldoAAplicar));

      if (montoTotalRedondeado < requeridoEnCaja - 0.001) {
        throw new BadRequestException(
          `El monto recibido ($${montoTotalRedondeado}) no puede ser inferior al saldo a cubrir ($${requeridoEnCaja})`,
        );
      }

      if (sumaImputaciones === 0 && montoTotalRedondeado <= 0) {
        throw new BadRequestException('Debe indicar un monto a pagar o seleccionar al menos una cuota a cancelar');
      }

      const excedente = round2(Math.max(0, montoTotalRedondeado - requeridoEnCaja));

      // Validar y actualizar cada cargo imputado
      const imputacionesSaldo: Array<{ cargoId: number; monto: number }> = [];
      const imputacionesCaja: Array<{ cargoId: number; monto: number }> = [];
      let saldoRestanteParaDistribuir = saldoAAplicar;

      for (const imp of dto.imputaciones) {
        const cargo = await tx.cargoMiembro.findUnique({
          where: { id: imp.cargoId },
          include: {
            usuario: {
              select: {
                id: true,
                asignaciones: { where: { activo: true }, select: { unidadId: true } },
              },
            },
          },
        });
        if (!cargo) throw new NotFoundException(`Cargo con ID ${imp.cargoId} no encontrado`);

        if (!targetUsuarioId) {
          targetUsuarioId = cargo.usuario.id;
        }

        if (alcance.tipo === 'UNIDAD') {
          const unidadesMiembro = cargo.usuario.asignaciones.map((a) => a.unidadId);
          const tieneUnidad = unidadesMiembro.some((uId) => alcance.unidadIds.includes(uId));
          if (!tieneUnidad) {
            throw new ForbiddenException(`El cargo ${imp.cargoId} pertenece a un miembro fuera de su unidad`);
          }
        }

        if (cargo.estado === EstadoCargo.ANULADO) {
          throw new BadRequestException(`El cargo ${imp.cargoId} se encuentra anulado`);
        }
        if (cargo.estado === EstadoCargo.PAGADO) {
          throw new ConflictException(`El cargo ${imp.cargoId} ya se encuentra totalmente saldado`);
        }

        const saldoPendiente = round2(Number(cargo.montoFinal) - Number(cargo.montoPagado));

        if (imp.monto > saldoPendiente + 0.001) {
          throw new BadRequestException(
            `El monto a imputar ($${imp.monto}) supera el saldo pendiente ($${saldoPendiente}) del cargo #${cargo.id}`,
          );
        }

        const nuevoPagado = round2(Number(cargo.montoPagado) + imp.monto);
        const nuevoEstado = nuevoPagado >= Number(cargo.montoFinal) - 0.001 ? EstadoCargo.PAGADO : EstadoCargo.PARCIAL;

        await tx.cargoMiembro.update({
          where: { id: cargo.id },
          data: {
            montoPagado: redondearDosDecimales(nuevoPagado),
            estado: nuevoEstado,
          },
        });

        // Distribuir entre el pago por Saldo a Favor y el pago en Caja
        if (saldoRestanteParaDistribuir > 0.001) {
          const porSaldo = round2(Math.min(saldoRestanteParaDistribuir, imp.monto));
          if (porSaldo > 0) {
            imputacionesSaldo.push({ cargoId: imp.cargoId, monto: porSaldo });
            saldoRestanteParaDistribuir = round2(saldoRestanteParaDistribuir - porSaldo);
          }
          const porCaja = round2(imp.monto - porSaldo);
          if (porCaja > 0) {
            imputacionesCaja.push({ cargoId: imp.cargoId, monto: porCaja });
          }
        } else {
          imputacionesCaja.push({ cargoId: imp.cargoId, monto: imp.monto });
        }
      }

      // 1. Si se aplicó Saldo a Favor, descontarlo y registrar el movimiento de aplicación
      let pagoSaldoCreado: any = null;
      if (saldoAAplicar > 0 && targetUsuarioId) {
        await tx.usuario.update({
          where: { id: targetUsuarioId },
          data: {
            saldoAFavor: { decrement: redondearDosDecimales(saldoAAplicar) },
          },
        });

        pagoSaldoCreado = await tx.pago.create({
          data: {
            montoTotal: redondearDosDecimales(saldoAAplicar),
            metodoPago: MetodoPago.OTRO,
            referenciaComprobante: 'APLICACION_SALDO_A_FAVOR',
            observaciones: dto.observaciones
              ? `${dto.observaciones} (Aplicación de saldo a favor)`
              : 'Imputación de saldo a favor del miembro',
            registradoPorUsuarioId: actor.sub,
            usuarioId: targetUsuarioId,
            imputaciones: {
              create: imputacionesSaldo.map((imp) => ({
                cargoId: imp.cargoId,
                montoImputado: redondearDosDecimales(imp.monto),
              })),
            },
          },
        });
      }

      // 2. Si hubo excedente (o pago a cuenta / adelanto), acreditarlo en el saldo a favor
      if (excedente > 0 && targetUsuarioId) {
        await tx.usuario.update({
          where: { id: targetUsuarioId },
          data: {
            saldoAFavor: { increment: redondearDosDecimales(excedente) },
          },
        });
      }

      // 3. Crear el registro de pago de caja (si montoTotalRedondeado > 0 o si no hubo uso de saldo)
      if (montoTotalRedondeado > 0 || !pagoSaldoCreado) {
        const pago = await tx.pago.create({
          data: {
            montoTotal: redondearDosDecimales(montoTotalRedondeado),
            metodoPago: dto.metodoPago,
            referenciaComprobante: dto.referenciaComprobante,
            observaciones:
              imputacionesCaja.length === 0 && excedente > 0
                ? dto.observaciones || 'Pago a cuenta (Adelanto a Saldo a Favor)'
                : dto.observaciones,
            registradoPorUsuarioId: actor.sub,
            usuarioId: targetUsuarioId ?? null,
            imputaciones: {
              create: imputacionesCaja.map((imp) => ({
                cargoId: imp.cargoId,
                montoImputado: redondearDosDecimales(imp.monto),
              })),
            },
          },
          include: {
            registradoPor: { select: { id: true, nombre: true, apellido: true } },
            imputaciones: {
              include: {
                cargo: {
                  select: {
                    id: true,
                    montoOriginal: true,
                    montoFinal: true,
                    montoPagado: true,
                    estado: true,
                    concepto: { select: { id: true, nombre: true } },
                    usuario: { select: { id: true, nombre: true, apellido: true, dni: true } },
                  },
                },
              },
            },
          },
        });

        return {
          ...pago,
          saldoAFavorAplicado: saldoAAplicar,
          excedenteAcreditado: excedente,
        };
      }

      return {
        ...pagoSaldoCreado,
        saldoAFavorAplicado: saldoAAplicar,
        excedenteAcreditado: excedente,
      };
    });
  }

  async editarPago(alcance: AlcanceAcceso, id: number, dto: EditarPagoDto) {
    if (alcance.tipo === 'PROPIO') throw new ForbiddenException();

    const pago = await this.prisma.pago.findUnique({
      where: { id },
      include: {
        usuario: { select: { id: true, asignaciones: { where: { activo: true }, select: { unidadId: true } } } },
        imputaciones: {
          include: {
            cargo: {
              include: {
                usuario: { select: { id: true, asignaciones: { where: { activo: true }, select: { unidadId: true } } } },
              },
            },
          },
        },
      },
    });
    if (!pago) throw new NotFoundException('Pago no encontrado');

    if (alcance.tipo === 'UNIDAD') {
      const targetUser = pago.usuario || pago.imputaciones[0]?.cargo?.usuario;
      if (targetUser) {
        const uIds = targetUser.asignaciones.map((a) => a.unidadId);
        if (!uIds.some((uId) => alcance.unidadIds.includes(uId))) {
          throw new ForbiddenException('El pago pertenece a un miembro fuera de su unidad');
        }
      }
    }

    return this.prisma.pago.update({
      where: { id },
      data: {
        ...(dto.metodoPago !== undefined ? { metodoPago: dto.metodoPago } : {}),
        ...(dto.referenciaComprobante !== undefined ? { referenciaComprobante: dto.referenciaComprobante } : {}),
        ...(dto.observaciones !== undefined ? { observaciones: dto.observaciones } : {}),
        ...(dto.fechaPago !== undefined ? { fechaPago: new Date(dto.fechaPago) } : {}),
      },
    });
  }

  /**
   * Revierte y elimina un pago registrado:
   * - Descuenta los montos imputados de cada cuota (volviéndolas a PENDIENTE o PARCIAL).
   * - Si fue una APLICACION_SALDO_A_FAVOR, devuelve ese monto al `saldoAFavor` del miembro.
   * - Si fue un pago común que había generado excedente (o pago a cuenta), descuenta ese excedente del `saldoAFavor`
   *   (y si parte de ese excedente ya se había aplicado a otra cuota mediante APLICACION_SALDO_A_FAVOR, revierte también esa aplicación).
   */
  async revertirPago(alcance: AlcanceAcceso, id: number) {
    if (alcance.tipo === 'PROPIO') throw new ForbiddenException();

    const pago = await this.prisma.pago.findUnique({
      where: { id },
      include: {
        usuario: { select: { id: true, saldoAFavor: true, asignaciones: { where: { activo: true }, select: { unidadId: true } } } },
        imputaciones: {
          include: {
            cargo: {
              include: {
                usuario: {
                  select: {
                    id: true,
                    saldoAFavor: true,
                    asignaciones: { where: { activo: true }, select: { unidadId: true } },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!pago) throw new NotFoundException('Pago no encontrado');

    const titular = pago.usuario || pago.imputaciones[0]?.cargo?.usuario;
    if (alcance.tipo === 'UNIDAD' && titular) {
      const uIds = titular.asignaciones.map((a) => a.unidadId);
      if (!uIds.some((uId) => alcance.unidadIds.includes(uId))) {
        throw new ForbiddenException('El pago pertenece a un miembro fuera de su unidad');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      let sumaImputada = 0;

      // 1. Revertir cada imputación sobre los cargos
      for (const imp of pago.imputaciones) {
        const montoImp = Number(imp.montoImputado);
        sumaImputada += montoImp;

        const cargoActual = await tx.cargoMiembro.findUnique({ where: { id: imp.cargoId } });
        if (!cargoActual) continue;

        const nuevoPagado = round2(Math.max(0, Number(cargoActual.montoPagado) - montoImp));
        const nuevoEstado =
          cargoActual.estado === EstadoCargo.ANULADO
            ? EstadoCargo.ANULADO
            : nuevoPagado >= Number(cargoActual.montoFinal) - 0.001 && Number(cargoActual.montoFinal) > 0
              ? EstadoCargo.PAGADO
              : nuevoPagado > 0
                ? EstadoCargo.PARCIAL
                : EstadoCargo.PENDIENTE;

        await tx.cargoMiembro.update({
          where: { id: cargoActual.id },
          data: {
            montoPagado: redondearDosDecimales(nuevoPagado),
            estado: nuevoEstado,
          },
        });
      }

      sumaImputada = round2(sumaImputada);
      const targetUsuarioId = titular?.id;

      // 2. Revertir impacto en Saldo a Favor
      if (targetUsuarioId) {
        if (pago.referenciaComprobante === 'APLICACION_SALDO_A_FAVOR') {
          const devolverASaldo = round2(Math.max(sumaImputada, Number(pago.montoTotal)));
          if (devolverASaldo > 0) {
            await tx.usuario.update({
              where: { id: targetUsuarioId },
              data: {
                saldoAFavor: { increment: redondearDosDecimales(devolverASaldo) },
              },
            });
          }
        } else {
          const excedenteGenerado = round2(Math.max(0, Number(pago.montoTotal) - sumaImputada));
          if (excedenteGenerado > 0) {
            const usuarioFresca = await tx.usuario.findUnique({ where: { id: targetUsuarioId } });
            const saldoActual = Number(usuarioFresca?.saldoAFavor ?? 0);

            if (saldoActual >= excedenteGenerado - 0.001) {
              await tx.usuario.update({
                where: { id: targetUsuarioId },
                data: {
                  saldoAFavor: redondearDosDecimales(Math.max(0, saldoActual - excedenteGenerado)),
                },
              });
            } else {
              // El miembro ya había usado parte de ese excedente en otra cuota:
              // dejamos su saldoAFavor en 0 y revertimos la diferencia de sus aplicaciones de saldo más recientes
              let faltanteRevertir = round2(excedenteGenerado - saldoActual);
              await tx.usuario.update({
                where: { id: targetUsuarioId },
                data: { saldoAFavor: new Prisma.Decimal(0) },
              });

              const aplicacionesSaldo = await tx.pago.findMany({
                where: {
                  usuarioId: targetUsuarioId,
                  referenciaComprobante: 'APLICACION_SALDO_A_FAVOR',
                  id: { not: pago.id },
                },
                orderBy: { id: 'desc' },
                include: { imputaciones: true },
              });

              for (const app of aplicacionesSaldo) {
                if (faltanteRevertir <= 0.001) break;
                for (const impApp of app.imputaciones) {
                  if (faltanteRevertir <= 0.001) break;
                  const quitar = round2(Math.min(faltanteRevertir, Number(impApp.montoImputado)));
                  const cg = await tx.cargoMiembro.findUnique({ where: { id: impApp.cargoId } });
                  if (cg) {
                    const np = round2(Math.max(0, Number(cg.montoPagado) - quitar));
                    const ne =
                      cg.estado === EstadoCargo.ANULADO
                        ? EstadoCargo.ANULADO
                        : np >= Number(cg.montoFinal) - 0.001
                          ? EstadoCargo.PAGADO
                          : np > 0
                            ? EstadoCargo.PARCIAL
                            : EstadoCargo.PENDIENTE;
                    await tx.cargoMiembro.update({
                      where: { id: cg.id },
                      data: { montoPagado: redondearDosDecimales(np), estado: ne },
                    });
                  }

                  if (quitar >= Number(impApp.montoImputado) - 0.001) {
                    await tx.pagoImputacion.delete({ where: { id: impApp.id } });
                  } else {
                    await tx.pagoImputacion.update({
                      where: { id: impApp.id },
                      data: { montoImputado: redondearDosDecimales(Number(impApp.montoImputado) - quitar) },
                    });
                  }
                  faltanteRevertir = round2(faltanteRevertir - quitar);
                }

                const impsRestantes = await tx.pagoImputacion.findMany({ where: { pagoId: app.id } });
                if (impsRestantes.length === 0) {
                  await tx.pago.delete({ where: { id: app.id } });
                } else {
                  const nuevoTotalApp = round2(
                    impsRestantes.reduce((acc, cur) => acc + Number(cur.montoImputado), 0),
                  );
                  await tx.pago.update({
                    where: { id: app.id },
                    data: { montoTotal: redondearDosDecimales(nuevoTotalApp) },
                  });
                }
              }
            }
          }
        }
      }

      // 3. Eliminar el pago (cascada borra sus PagoImputacion)
      await tx.pago.delete({ where: { id: pago.id } });

      return {
        mensaje: 'Pago revertido correctamente y estado de cuenta actualizado.',
      };
    });
  }

  async aplicarSaldoAFavor(actor: AuthUser, alcance: AlcanceAcceso, dto: AplicarSaldoAFavorDto) {
    if (alcance.tipo === 'PROPIO') {
      throw new ForbiddenException('No tiene permisos para aplicar saldo a favor');
    }

    const usuario = await this.prisma.usuario.findUnique({
      where: { id: dto.usuarioId },
      include: { asignaciones: { where: { activo: true }, select: { unidadId: true } } },
    });
    if (!usuario) throw new NotFoundException('Miembro no encontrado');

    if (alcance.tipo === 'UNIDAD') {
      const unidadesMiembro = usuario.asignaciones.map((a) => a.unidadId);
      const tieneUnidad = unidadesMiembro.some((uId) => alcance.unidadIds.includes(uId));
      if (!tieneUnidad) throw new ForbiddenException('El miembro no pertenece a su unidad');
    }

    const sumaAImputar = dto.imputaciones.reduce((acc, curr) => acc + curr.monto, 0);
    const sumaRedondeada = round2(sumaAImputar);
    const saldoDisponible = Number(usuario.saldoAFavor);

    if (sumaRedondeada > saldoDisponible + 0.001) {
      throw new BadRequestException(
        `Saldo a favor insuficiente. Disponible: $${saldoDisponible.toFixed(2)}, Requerido: $${sumaRedondeada.toFixed(2)}`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.usuario.update({
        where: { id: dto.usuarioId },
        data: {
          saldoAFavor: { decrement: redondearDosDecimales(sumaRedondeada) },
        },
      });

      for (const imp of dto.imputaciones) {
        const cargo = await tx.cargoMiembro.findUnique({
          where: { id: imp.cargoId },
          include: { usuario: { select: { id: true, grupoFamiliarId: true } } },
        });
        if (!cargo) {
          throw new BadRequestException(`El cargo #${imp.cargoId} no existe`);
        }
        const mismoUsuario = cargo.usuarioId === dto.usuarioId;
        const mismaFamilia =
          usuario.grupoFamiliarId !== null &&
          usuario.grupoFamiliarId !== undefined &&
          cargo.usuario?.grupoFamiliarId === usuario.grupoFamiliarId;

        if (!mismoUsuario && !mismaFamilia) {
          throw new BadRequestException(
            `El cargo #${imp.cargoId} no pertenece al miembro ni a su grupo familiar`,
          );
        }
        if (cargo.estado === EstadoCargo.PAGADO || cargo.estado === EstadoCargo.ANULADO) {
          throw new BadRequestException(`El cargo #${imp.cargoId} ya está saldado o anulado`);
        }

        const saldoPendiente = Number(cargo.montoFinal) - Number(cargo.montoPagado);
        if (imp.monto > saldoPendiente + 0.001) {
          throw new BadRequestException(
            `El monto $${imp.monto} excede el saldo pendiente de $${saldoPendiente.toFixed(2)} en cargo #${cargo.id}`,
          );
        }

        const nuevoPagado = Number(cargo.montoPagado) + imp.monto;
        const nuevoEstado = nuevoPagado >= Number(cargo.montoFinal) - 0.001 ? EstadoCargo.PAGADO : EstadoCargo.PARCIAL;

        await tx.cargoMiembro.update({
          where: { id: cargo.id },
          data: {
            montoPagado: redondearDosDecimales(nuevoPagado),
            estado: nuevoEstado,
          },
        });
      }

      const pago = await tx.pago.create({
        data: {
          montoTotal: redondearDosDecimales(sumaRedondeada),
          metodoPago: MetodoPago.OTRO,
          referenciaComprobante: 'APLICACION_SALDO_A_FAVOR',
          observaciones: 'Imputación de saldo a favor del miembro para cancelación de deuda',
          registradoPorUsuarioId: actor.sub,
          usuarioId: dto.usuarioId,
          imputaciones: {
            create: dto.imputaciones.map((imp) => ({
              cargoId: imp.cargoId,
              montoImputado: redondearDosDecimales(imp.monto),
            })),
          },
        },
      });

      return {
        mensaje: `Se imputaron $${sumaRedondeada.toFixed(2)} de saldo a favor exitosamente`,
        pagoId: pago.id,
      };
    });
  }

  /**
   * Permite ajustar manualmente el Saldo a Favor de un miembro (cargar saldo, descontar/devolver en efectivo, o fijar monto).
   */
  async ajustarSaldoAFavor(actor: AuthUser, alcance: AlcanceAcceso, dto: AjustarSaldoAFavorDto) {
    if (alcance.tipo === 'PROPIO') {
      throw new ForbiddenException('No tiene permisos para ajustar el saldo a favor');
    }

    const usuario = await this.prisma.usuario.findUnique({
      where: { id: dto.usuarioId },
      include: { asignaciones: { where: { activo: true }, select: { unidadId: true } } },
    });
    if (!usuario) throw new NotFoundException('Miembro no encontrado');

    if (alcance.tipo === 'UNIDAD') {
      const unidadesMiembro = usuario.asignaciones.map((a) => a.unidadId);
      if (!unidadesMiembro.some((uId) => alcance.unidadIds.includes(uId))) {
        throw new ForbiddenException('El miembro no pertenece a su unidad');
      }
    }

    const saldoActual = Number(usuario.saldoAFavor ?? 0);
    let nuevoSaldo = saldoActual;

    if (dto.tipoAjuste === 'CARGAR') {
      if (dto.monto <= 0) throw new BadRequestException('El monto a acreditar debe ser mayor a 0');
      nuevoSaldo = round2(saldoActual + dto.monto);
    } else if (dto.tipoAjuste === 'DESCONTAR') {
      if (dto.monto <= 0) throw new BadRequestException('El monto a descontar debe ser mayor a 0');
      if (dto.monto > saldoActual + 0.001) {
        throw new BadRequestException(`El monto a descontar ($${dto.monto}) supera el saldo actual ($${saldoActual})`);
      }
      nuevoSaldo = round2(Math.max(0, saldoActual - dto.monto));
    } else if (dto.tipoAjuste === 'FIJAR') {
      nuevoSaldo = round2(Math.max(0, dto.monto));
    }

    const actualizado = await this.prisma.usuario.update({
      where: { id: dto.usuarioId },
      data: {
        saldoAFavor: redondearDosDecimales(nuevoSaldo),
      },
      select: { id: true, nombre: true, apellido: true, saldoAFavor: true },
    });

    return {
      mensaje: `Saldo a favor actualizado a $${nuevoSaldo.toFixed(2)}`,
      usuario: actualizado,
    };
  }

  async listarPagos(alcance: AlcanceAcceso, usuarioId?: number) {
    const where: Prisma.PagoWhereInput = {
      ...(usuarioId ? { OR: [{ usuarioId }, { imputaciones: { some: { cargo: { usuarioId } } } }] } : {}),
      ...(alcance.tipo === 'UNIDAD'
        ? {
            OR: [
              {
                usuario: {
                  asignaciones: { some: { activo: true, unidadId: { in: alcance.unidadIds } } },
                },
              },
              {
                imputaciones: {
                  some: {
                    cargo: {
                      usuario: {
                        asignaciones: { some: { activo: true, unidadId: { in: alcance.unidadIds } } },
                      },
                    },
                  },
                },
              },
            ],
          }
        : {}),
      ...(alcance.tipo === 'PROPIO'
        ? {
            OR: [
              { usuarioId: alcance.usuarioId },
              { imputaciones: { some: { cargo: { usuarioId: alcance.usuarioId } } } },
            ],
          }
        : {}),
    };

    return this.prisma.pago.findMany({
      where,
      orderBy: { fechaPago: 'desc' },
      include: {
        registradoPor: { select: { id: true, nombre: true, apellido: true } },
        usuario: { select: { id: true, nombre: true, apellido: true, dni: true } },
        imputaciones: {
          include: {
            cargo: {
              select: {
                id: true,
                concepto: { select: { nombre: true } },
              },
            },
          },
        },
      },
    });
  }
}
