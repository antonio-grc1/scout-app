import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AlcanceRol,
  EstadoCargo,
  EstadoEvento,
  EstadoPedidoEvento,
  EstadoTicketEvento,
  MetodoPago,
  Prisma,
  TipoCuenta,
  TipoEvento,
  TipoMovimientoFinanciero,
  TipoRubro,
} from '@prisma/client';
import { generateTokenQR, verifyTokenQR } from '../common/utils/qr-token.util.js';
import { assertUnidadEnAlcance, filtroUsuariosPorAlcance } from '../common/scope/alcance.util.js';
import type { AlcanceAcceso, AuthUser } from '../common/types/auth.types.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  AcreditarGananciasEventoDto,
  ActualizarCuentaFinancieraDto,
  ActualizarDescuentoFamiliaDto,
  ActualizarEventoDto,
  ActualizarGastoDto,
  ActualizarPedidoEventoDto,
  ActualizarRubroContableDto,
  AjustarSaldoAFavorDto,
  AplicarSaldoAFavorDto,
  ConsultaCuadroResultadosQueryDto,
  ConsultaLibroDiarioQueryDto,
  CrearConceptoDto,
  CrearCuentaFinancieraDto,
  CrearEventoDto,
  CrearPedidoEventoDto,
  CrearPlanCuotaMensualDto,
  CrearRubroContableDto,
  CrearTransferenciaDto,
  DesvincularHermanoDto,
  EditarCargoIndividualDto,
  EditarConceptoDto,
  EditarPagoDto,
  EditarPlanCuotaMensualDto,
  GenerarCargoIndividualDto,
  GenerarCargosDto,
  ListarCargosQueryDto,
  ListarGastosQueryDto,
  ListarIngresosQueryDto,
  ListarRubrosQueryDto,
  RegistrarGastoDto,
  RegistrarIngresoDto,
  ActualizarIngresoDto,
  RegistrarPagoDto,
  SincronizarMesesPlanDto,
  ValidarTicketQrDto,
  VincularHermanoDto,
} from './tesoreria.dto.js';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function redondearDosDecimales(n: number): Prisma.Decimal {
  return new Prisma.Decimal(round2(n));
}

function parsearFechaOperacion(fechaStr?: string | null): Date {
  if (!fechaStr) return new Date();

  // Si ya es un ISO completo o incluye offset (por ej. termina en Z o -03:00):
  if (fechaStr.includes('Z') || /[+-]\d{2}:?\d{2}$/.test(fechaStr)) {
    const d = new Date(fechaStr);
    return isNaN(d.getTime()) ? new Date() : d;
  }

  // Si es solo YYYY-MM-DD:
  if (/^\d{4}-\d{2}-\d{2}$/.test(fechaStr)) {
    const hoyStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Argentina/Buenos_Aires',
    }).format(new Date());

    if (fechaStr === hoyStr) {
      return new Date();
    }
    // Para otro día: mediodía en Argentina (12:00 GMT-3 = 15:00 UTC)
    return new Date(`${fechaStr}T15:00:00.000Z`);
  }

  // Si es YYYY-MM-DDTHH:mm sin zona, asumir hora argentina (GMT-3)
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(fechaStr)) {
    return new Date(`${fechaStr}-03:00`);
  }

  const d = new Date(fechaStr);
  return isNaN(d.getTime()) ? new Date() : d;
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
          { tipoMiembro: 'EDUCADOR' },
          { alcancePorDefecto: { not: AlcanceRol.PROPIO } },
        ],
      };
    }
    if (tipo === 'PROTAGONISTAS') {
      return {
        OR: [
          { tipoMiembro: 'PROTAGONISTA' },
          { alcancePorDefecto: AlcanceRol.PROPIO },
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
    const esSoloEducadores =
      concepto.destinatarioTipo === 'EDUCADORES' ||
      (!concepto.destinatarioTipo && concepto.esParaEducadores);

    const usuariosWhere: Prisma.UsuarioWhereInput = {
      activo: true,
      ...(excepciones.length > 0 ? { id: { notIn: excepciones } } : {}),
      asignaciones: {
        some: {
          activo: true,
          ...(concepto.unidadId ? { unidadId: concepto.unidadId } : {}),
          ...(rolFiltro ? { rol: rolFiltro } : {}),
        },
        ...(esSoloEducadores
          ? {
              none: {
                activo: true,
                rol: {
                  OR: [
                    { tipoMiembro: 'PROTAGONISTA' },
                    { alcancePorDefecto: AlcanceRol.PROPIO },
                  ],
                },
              },
            }
          : {}),
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
    const esProtagonista = usuario.asignaciones.some(
      (a) => a.rol.tipoMiembro === 'PROTAGONISTA' || a.rol.alcancePorDefecto === AlcanceRol.PROPIO,
    );
    // Regla de Prevalencia Multirrol: Protagonista prevalece sobre Educador para cuotas
    const esEducador =
      !esProtagonista &&
      usuario.asignaciones.some(
        (a) => a.rol.tipoMiembro === 'EDUCADOR' || a.rol.alcancePorDefecto !== AlcanceRol.PROPIO,
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
    if (alcance.tipo === 'PROPIO') {
      throw new ForbiddenException('No tiene permisos para ver planes generales');
    }

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
        rubro: { select: { id: true, nombre: true } },
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
          rubroId: dto.rubroId ?? null,
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
          rubroId: dto.rubroId !== undefined ? dto.rubroId : undefined,
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
      rubroId: plan.rubroId ?? null,
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
    if (alcance.tipo === 'PROPIO') {
      throw new ForbiddenException('No tiene permisos para ver conceptos generales');
    }

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
        rubro: { select: { id: true, nombre: true } },
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
            rubroId: dto.rubroId ?? null,
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
        rubroId: dto.rubroId ?? null,
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
    if (dto.rubroId !== undefined) {
      data.rubro = dto.rubroId ? { connect: { id: dto.rubroId } } : { disconnect: true };
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
    if (usuario.grupoFamiliarId && usuario.grupoFamiliarId === hermano.grupoFamiliarId) {
      throw new BadRequestException('Este miembro ya pertenece a ese grupo familiar');
    }

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
    const esSoloEducadores =
      concepto.destinatarioTipo === 'EDUCADORES' ||
      (!concepto.destinatarioTipo && concepto.esParaEducadores);

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
        ...(esSoloEducadores
          ? {
              none: {
                activo: true,
                rol: {
                  OR: [
                    { tipoMiembro: 'PROTAGONISTA' },
                    { alcancePorDefecto: AlcanceRol.PROPIO },
                  ],
                },
              },
            }
          : {}),
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
        const u = await tx.usuario.findUnique({
          where: { id: targetUsuarioId },
          include: {
            asignaciones: { where: { activo: true }, select: { unidadId: true } },
          },
        });
        if (u) {
          saldoDisponible = Number(u.saldoAFavor ?? 0);
          if (alcance.tipo === 'UNIDAD') {
            const uIds = u.asignaciones.map((a) => a.unidadId);
            if (!uIds.some((uid) => alcance.unidadIds.includes(uid))) {
              throw new ForbiddenException('El miembro no pertenece a su unidad');
            }
          }
        }
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
                    concepto: { select: { id: true, nombre: true, rubroId: true } },
                    usuario: { select: { id: true, nombre: true, apellido: true, dni: true } },
                  },
                },
              },
            },
          },
        });

        // Generar movimiento financiero si ingresó dinero físico o bancario
        if (montoTotalRedondeado > 0 && tx.movimientoFinanciero?.create) {
          let targetCuentaId: number | null = null;
          if (tx.cuentaFinanciera?.findFirst) {
            if (dto.metodoPago === MetodoPago.EFECTIVO) {
              if (dto.cuentaId) {
                const c = await tx.cuentaFinanciera.findFirst({
                  where: { id: dto.cuentaId, activa: true, tipo: TipoCuenta.CAJA_EFECTIVO },
                });
                if (!c) throw new BadRequestException('La cuenta seleccionada no corresponde a una caja de efectivo activa');
                targetCuentaId = c.id;
              } else {
                let c = await tx.cuentaFinanciera.findFirst({
                  where: { activa: true, tipo: TipoCuenta.CAJA_EFECTIVO },
                  orderBy: { id: 'asc' },
                });
                if (!c && tx.cuentaFinanciera.create) {
                  c = await tx.cuentaFinanciera.create({
                    data: { nombre: 'Caja Chica Central', tipo: TipoCuenta.CAJA_EFECTIVO, activa: true },
                  });
                }
                if (c) targetCuentaId = c.id;
              }
            } else if (dto.metodoPago === MetodoPago.TRANSFERENCIA) {
              if (dto.cuentaId) {
                const c = await tx.cuentaFinanciera.findFirst({
                  where: { id: dto.cuentaId, activa: true, tipo: TipoCuenta.BANCO },
                });
                if (!c) throw new BadRequestException('La cuenta bancaria seleccionada no es válida o no está activa');
                targetCuentaId = c.id;
              } else {
                let c = await tx.cuentaFinanciera.findFirst({
                  where: { activa: true, tipo: TipoCuenta.BANCO },
                  orderBy: { id: 'asc' },
                });
                if (!c && tx.cuentaFinanciera.create) {
                  c = await tx.cuentaFinanciera.create({
                    data: { nombre: 'Banco Principal', tipo: TipoCuenta.BANCO, activa: true },
                  });
                }
                if (c) targetCuentaId = c.id;
              }
            } else {
              if (dto.cuentaId) {
                const c = await tx.cuentaFinanciera.findFirst({
                  where: { id: dto.cuentaId, activa: true },
                });
                if (!c) throw new BadRequestException('La cuenta seleccionada no es válida o no está activa');
                targetCuentaId = c.id;
              } else {
                const c = await tx.cuentaFinanciera.findFirst({
                  where: { activa: true, tipo: TipoCuenta.CAJA_EFECTIVO },
                  orderBy: { id: 'asc' },
                });
                if (c) targetCuentaId = c.id;
              }
            }
          }

          if (targetCuentaId) {
            let nombreMiembro = '';
            if (targetUsuarioId && tx.usuario?.findUnique) {
              const u = await tx.usuario.findUnique({
                where: { id: targetUsuarioId },
                select: { id: true, nombre: true, apellido: true },
              });
              if (u?.nombre) {
                nombreMiembro = `${u.nombre} ${u.apellido ?? ''}`.trim();
              }
            }

            const imputacionesList: any[] = Array.isArray(pago.imputaciones)
              ? pago.imputaciones
              : Array.isArray((pago.imputaciones as any)?.create)
              ? (pago.imputaciones as any).create
              : [];

            if (!nombreMiembro && imputacionesList[0]?.cargo?.usuario?.nombre) {
              const cu = imputacionesList[0].cargo.usuario;
              nombreMiembro = `${cu.nombre} ${cu.apellido ?? ''}`.trim();
            }

            const nombresConceptos = Array.from(
              new Set(
                imputacionesList
                  .map((imp: any) => imp.cargo?.concepto?.nombre)
                  .filter(Boolean),
              ),
            );

            const detalleConcepto =
              nombresConceptos.length > 0
                ? `Cobro: ${nombresConceptos.join(', ')}`
                : 'Cobro cuota';

            const titularTexto = nombreMiembro ? ` - ${nombreMiembro}` : '';
            const refTexto = dto.referenciaComprobante ? ` - Ref: ${dto.referenciaComprobante}` : '';
            await tx.movimientoFinanciero.create({
              data: {
                cuentaId: targetCuentaId,
                fecha: pago.fechaPago ?? new Date(),
                tipo: TipoMovimientoFinanciero.INGRESO_COBRANZA,
                montoIngreso: redondearDosDecimales(montoTotalRedondeado),
                montoEgreso: 0,
                conceptoTexto: `${detalleConcepto}${titularTexto}${refTexto}`,
                pagoId: pago.id,
                rubroId: imputacionesList[0]?.cargo?.concepto?.rubroId ?? null,
                creadoPorUsuarioId: actor.sub,
              },
            });
          }
        }

        return {
          ...pago,
          saldoAFavorAplicado: saldoAAplicar,
          saldoAFavorUsado: saldoAAplicar,
          excedenteAcreditado: excedente,
        };
      }

      return {
        ...pagoSaldoCreado,
        saldoAFavorAplicado: saldoAAplicar,
        saldoAFavorUsado: saldoAAplicar,
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

    return this.prisma.$transaction(async (tx) => {
      const pagoActualizado = await tx.pago.update({
        where: { id },
        data: {
          ...(dto.metodoPago !== undefined ? { metodoPago: dto.metodoPago } : {}),
          ...(dto.referenciaComprobante !== undefined ? { referenciaComprobante: dto.referenciaComprobante } : {}),
          ...(dto.observaciones !== undefined ? { observaciones: dto.observaciones } : {}),
          ...(dto.fechaPago !== undefined ? { fechaPago: new Date(dto.fechaPago) } : {}),
        },
      });

      if (dto.fechaPago !== undefined) {
        await tx.movimientoFinanciero.updateMany({
          where: { pagoId: id },
          data: {
            fecha: new Date(dto.fechaPago),
          },
        });
      }

      return pagoActualizado;
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

      // 3. Eliminar explícitamente cualquier movimiento financiero asociado al pago
      if (tx.movimientoFinanciero?.deleteMany) {
        await tx.movimientoFinanciero.deleteMany({
          where: { pagoId: pago.id },
        });
      }

      // 4. Eliminar el pago (cascada borra sus PagoImputacion)
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

  // ===========================================================================
  // 7. MOTOR FINANCIERO: CUENTAS, LIBRO DIARIO Y TRANSFERENCIAS (FASE 1)
  // ===========================================================================

  async listarCuentasFinancieras(alcance: AlcanceAcceso, incluirInactivas?: boolean) {
    if (alcance.tipo === 'PROPIO') {
      throw new ForbiddenException('No tiene permisos para ver las cuentas de tesorería');
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
          ingreso: Number(a._sum.montoIngreso ?? 0),
          egreso: Number(a._sum.montoEgreso ?? 0),
          cantidad: a._count.id,
        },
      ]),
    );

    return cuentas.map((c) => {
      const agg = aggMap.get(c.id) ?? { ingreso: 0, egreso: 0, cantidad: 0 };
      const totalIngresos = round2(agg.ingreso);
      const totalEgresos = round2(agg.egreso);
      const saldoActual = round2(totalIngresos - totalEgresos);

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
    if (alcance.tipo === 'PROPIO') {
      throw new ForbiddenException('No tiene permisos para administrar cuentas');
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
    if (alcance.tipo === 'PROPIO') {
      throw new ForbiddenException('No tiene permisos para administrar cuentas');
    }

    const cuenta = await this.prisma.cuentaFinanciera.findUnique({ where: { id } });
    if (!cuenta) {
      throw new NotFoundException(`Cuenta con ID ${id} no encontrada`);
    }

    if (dto.activa === false && cuenta.activa) {
      const agg = await this.prisma.movimientoFinanciero.aggregate({
        where: { cuentaId: id },
        _sum: { montoIngreso: true, montoEgreso: true },
      });
      const saldo = round2(Number(agg._sum.montoIngreso ?? 0) - Number(agg._sum.montoEgreso ?? 0));
      if (Math.abs(saldo) > 0.001) {
        throw new BadRequestException(
          'No se puede desactivar una cuenta con saldo no nulo. Transfiera los fondos antes de desactivarla',
        );
      }
    }

    if (dto.nombre && dto.nombre.toLowerCase() !== cuenta.nombre.toLowerCase()) {
      const existe = await this.prisma.cuentaFinanciera.findFirst({
        where: { id: { not: id }, nombre: { equals: dto.nombre, mode: 'insensitive' } },
      });
      if (existe) {
        throw new ConflictException(`Ya existe otra cuenta con el nombre "${dto.nombre}"`);
      }
    }

    return this.prisma.cuentaFinanciera.update({
      where: { id },
      data: {
        ...(dto.nombre ? { nombre: dto.nombre } : {}),
        ...(dto.tipo ? { tipo: dto.tipo } : {}),
        ...(dto.activa !== undefined ? { activa: dto.activa } : {}),
      },
    });
  }

  async eliminarCuentaFinanciera(
    actor: AuthUser,
    alcance: AlcanceAcceso,
    id: number,
  ) {
    if (alcance.tipo === 'PROPIO') {
      throw new ForbiddenException('No tiene permisos para administrar cuentas');
    }

    const cuenta = await this.prisma.cuentaFinanciera.findUnique({
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

    const agg = await this.prisma.movimientoFinanciero.aggregate({
      where: { cuentaId: id },
      _sum: { montoIngreso: true, montoEgreso: true },
    });
    const saldo = round2(Number(agg._sum.montoIngreso ?? 0) - Number(agg._sum.montoEgreso ?? 0));
    if (Math.abs(saldo) > 0.001) {
      throw new BadRequestException(
        `No se puede eliminar una cuenta con saldo no nulo ($${saldo.toFixed(2)}). Transfiera los fondos antes de eliminarla`,
      );
    }

    if (cuenta._count.movimientos > 0) {
      const desactivada = await this.prisma.cuentaFinanciera.update({
        where: { id },
        data: { activa: false },
      });
      return { ...desactivada, eliminadoPermanente: false };
    }

    const eliminada = await this.prisma.cuentaFinanciera.delete({
      where: { id },
    });
    return { ...eliminada, eliminadoPermanente: true };
  }

  async obtenerLibroDiario(alcance: AlcanceAcceso, cuentaId: number, query: ConsultaLibroDiarioQueryDto) {
    if (alcance.tipo === 'PROPIO') {
      throw new ForbiddenException('No tiene permisos para ver libro diario');
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
      fechaDesde = new Date(fechaDesdeStr.includes('T') ? fechaDesdeStr : `${fechaDesdeStr}T00:00:00.000Z`);
      if (isNaN(fechaDesde.getTime())) {
        throw new BadRequestException('Fecha desde no es válida');
      }
    }

    if (fechaHastaStr) {
      fechaHasta = new Date(fechaHastaStr.includes('T') ? fechaHastaStr : `${fechaHastaStr}T23:59:59.999Z`);
      if (isNaN(fechaHasta.getTime())) {
        throw new BadRequestException('Fecha hasta no es válida');
      }
    }

    let saldoAnterior = 0;
    if (fechaDesde) {
      const aggAnterior = await this.prisma.movimientoFinanciero.aggregate({
        where: {
          cuentaId,
          fecha: { lt: fechaDesde },
        },
        _sum: { montoIngreso: true, montoEgreso: true },
      });
      saldoAnterior = round2(
        Number(aggAnterior._sum.montoIngreso ?? 0) - Number(aggAnterior._sum.montoEgreso ?? 0),
      );
    }

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

    let saldoAcumulado = saldoAnterior;
    let totalIngresosPeriodo = 0;
    let totalEgresosPeriodo = 0;

    const movimientosConSaldo = movimientos.map((m: any) => {
      const ingreso = Number(m.montoIngreso);
      const egreso = Number(m.montoEgreso);
      saldoAcumulado = round2(saldoAcumulado + ingreso - egreso);
      totalIngresosPeriodo = round2(totalIngresosPeriodo + ingreso);
      totalEgresosPeriodo = round2(totalEgresosPeriodo + egreso);

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

    const saldoFinalPeriodo = saldoAcumulado;

    const aggConsolidado = await this.prisma.movimientoFinanciero.aggregate({
      where: { cuentaId },
      _sum: { montoIngreso: true, montoEgreso: true },
    });
    const saldoActualConsolidado = round2(
      Number(aggConsolidado._sum.montoIngreso ?? 0) - Number(aggConsolidado._sum.montoEgreso ?? 0),
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
    if (alcance.tipo === 'PROPIO') {
      throw new ForbiddenException('No tiene permisos para transferir fondos');
    }

    if (dto.origenCuentaId === dto.destinoCuentaId) {
      throw new BadRequestException('La cuenta de origen y destino deben ser distintas');
    }

    const monto = round2(dto.monto);
    if (monto <= 0) {
      throw new BadRequestException('El monto a transferir debe ser mayor a 0');
    }

    return this.prisma.$transaction(async (tx) => {
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

      const aggOrigen = await tx.movimientoFinanciero.aggregate({
        where: { cuentaId: origen.id },
        _sum: { montoIngreso: true, montoEgreso: true },
      });
      const saldoOrigen = round2(
        Number(aggOrigen._sum.montoIngreso ?? 0) - Number(aggOrigen._sum.montoEgreso ?? 0),
      );

      if (saldoOrigen < monto - 0.001) {
        throw new BadRequestException(
          `Saldo insuficiente en ${origen.nombre}. Saldo disponible: $${saldoOrigen}`,
        );
      }

      const fechaOperacion = parsearFechaOperacion(dto.fecha);

      const movSalida = await tx.movimientoFinanciero.create({
        data: {
          cuentaId: origen.id,
          fecha: fechaOperacion,
          tipo: TipoMovimientoFinanciero.TRANSFERENCIA_SALIDA,
          montoIngreso: 0,
          montoEgreso: redondearDosDecimales(monto),
          conceptoTexto: `Transferencia a ${destino.nombre}: ${dto.concepto}`,
          creadoPorUsuarioId: actor.sub,
        },
      });

      const movEntrada = await tx.movimientoFinanciero.create({
        data: {
          cuentaId: destino.id,
          fecha: fechaOperacion,
          tipo: TipoMovimientoFinanciero.TRANSFERENCIA_ENTRADA,
          montoIngreso: redondearDosDecimales(monto),
          montoEgreso: 0,
          conceptoTexto: `Transferencia desde ${origen.nombre}: ${dto.concepto}`,
          creadoPorUsuarioId: actor.sub,
        },
      });

      const aggDestino = await tx.movimientoFinanciero.aggregate({
        where: { cuentaId: destino.id },
        _sum: { montoIngreso: true, montoEgreso: true },
      });
      const saldoDestino = round2(
        Number(aggDestino._sum.montoIngreso ?? 0) - Number(aggDestino._sum.montoEgreso ?? 0),
      );

      return {
        mensaje: 'Transferencia realizada exitosamente',
        monto,
        saldoOrigen: round2(saldoOrigen - monto),
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

    if (dto.unidadId !== undefined && dto.unidadId !== null) {
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
      return this.prisma.rubroContable.update({
        where: { id },
        data: { activo: false },
      });
    }

    return this.prisma.rubroContable.delete({ where: { id } });
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
      ...(query.desde || query.hasta
        ? {
            fecha: {
              ...(query.desde ? { gte: new Date(query.desde) } : {}),
              ...(query.hasta ? { lte: new Date(query.hasta) } : {}),
            },
          }
        : {}),
    };

    return this.prisma.gasto.findMany({
      where,
      orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
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

    const monto = round2(dto.monto);
    if (monto <= 0) {
      throw new BadRequestException('El monto del gasto debe ser mayor a 0');
    }

    return this.prisma.$transaction(async (tx) => {
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

      // Validar saldo disponible en la cuenta
      const aggCuenta = await tx.movimientoFinanciero.aggregate({
        where: { cuentaId: cuenta.id },
        _sum: { montoIngreso: true, montoEgreso: true },
      });
      const saldoDisponible = round2(
        Number(aggCuenta._sum.montoIngreso ?? 0) - Number(aggCuenta._sum.montoEgreso ?? 0),
      );

      if (saldoDisponible < monto - 0.001) {
        throw new BadRequestException(
          `Saldo insuficiente en ${cuenta.nombre}. Saldo actual: $${saldoDisponible}, Gasto solicitado: $${monto}`,
        );
      }

      const fechaOperacion = parsearFechaOperacion(dto.fecha);

      const gasto = await tx.gasto.create({
        data: {
          fecha: fechaOperacion,
          monto: redondearDosDecimales(monto),
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
          montoEgreso: redondearDosDecimales(monto),
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

    const gasto = await this.prisma.gasto.findUnique({
      where: { id },
      include: { rubro: true, cuenta: true },
    });
    if (!gasto) throw new NotFoundException('Gasto no encontrado');
    if (gasto.anulado) throw new BadRequestException('No se puede modificar un gasto anulado');

    if (gasto.rubro.unidadId) {
      assertUnidadEnAlcance(alcance, gasto.rubro.unidadId);
    }

    let nuevoRubro = gasto.rubro;
    if (dto.rubroId && dto.rubroId !== gasto.rubroId) {
      const rubroEncontrado = await this.prisma.rubroContable.findUnique({ where: { id: dto.rubroId } });
      if (!rubroEncontrado || !rubroEncontrado.activo || rubroEncontrado.tipo !== TipoRubro.EGRESO) {
        throw new BadRequestException('El rubro contable de egreso no es válido o está inactivo');
      }
      if (rubroEncontrado.unidadId) {
        assertUnidadEnAlcance(alcance, rubroEncontrado.unidadId);
      }
      nuevoRubro = rubroEncontrado;
    }

    let nuevaCuenta = gasto.cuenta;
    if (dto.cuentaId && dto.cuentaId !== gasto.cuentaId) {
      const cuentaEncontrada = await this.prisma.cuentaFinanciera.findUnique({ where: { id: dto.cuentaId } });
      if (!cuentaEncontrada || !cuentaEncontrada.activa) {
        throw new BadRequestException('La cuenta financiera seleccionada no está activa');
      }
      nuevaCuenta = cuentaEncontrada;
    }

    const nuevaFecha = dto.fecha ? parsearFechaOperacion(dto.fecha) : gasto.fecha;
    const nuevoMonto = dto.monto !== undefined ? redondearDosDecimales(dto.monto) : Number(gasto.monto);
    const nuevaDescripcion = dto.descripcion !== undefined ? dto.descripcion : gasto.descripcion;
    const nuevoComprobanteNro = dto.comprobanteNro !== undefined ? dto.comprobanteNro : gasto.comprobanteNro;
    const nuevoComprobanteUrl = dto.comprobanteUrl !== undefined ? dto.comprobanteUrl : gasto.comprobanteUrl;

    return this.prisma.$transaction(async (tx) => {
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

    const gasto = await this.prisma.gasto.findUnique({
      where: { id },
      include: { cuenta: true, rubro: true },
    });
    if (!gasto) throw new NotFoundException('Gasto no encontrado');
    if (gasto.anulado) throw new BadRequestException('El gasto ya se encuentra anulado');

    return this.prisma.$transaction(async (tx) => {
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

    const gasto = await this.prisma.gasto.findUnique({
      where: { id },
      include: { cuenta: true, rubro: true },
    });
    if (!gasto) throw new NotFoundException('Gasto no encontrado');
    if (!gasto.anulado) throw new BadRequestException('El gasto no se encuentra anulado');

    return this.prisma.$transaction(async (tx) => {
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
          montoEgreso: redondearDosDecimales(Number(gasto.monto)),
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

    const monto = round2(dto.monto);
    if (monto <= 0) {
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

      const fechaOperacion = parsearFechaOperacion(dto.fecha);
      const refTexto = dto.comprobanteNro ? ` (Comp. #${dto.comprobanteNro})` : '';

      const movimiento = await tx.movimientoFinanciero.create({
        data: {
          cuentaId: cuenta.id,
          fecha: fechaOperacion,
          tipo: TipoMovimientoFinanciero.INGRESO_OTRO,
          montoIngreso: redondearDosDecimales(monto),
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

    const movimiento = await this.prisma.movimientoFinanciero.findUnique({
      where: { id },
      include: { rubro: true, cuenta: true },
    });

    if (!movimiento) {
      throw new NotFoundException(`Movimiento con ID ${id} no encontrado`);
    }

    if (movimiento.tipo !== TipoMovimientoFinanciero.INGRESO_OTRO) {
      throw new BadRequestException('Solo se pueden modificar ingresos manuales registrados directamente');
    }

    return this.prisma.$transaction(async (tx) => {
      let cuentaId = movimiento.cuentaId;
      if (dto.cuentaId !== undefined && dto.cuentaId !== movimiento.cuentaId) {
        const c = await tx.cuentaFinanciera.findUnique({ where: { id: dto.cuentaId } });
        if (!c) throw new NotFoundException('Cuenta destino no encontrada');
        if (!c.activa) throw new BadRequestException('La cuenta seleccionada está inactiva');
        cuentaId = c.id;
      }

      let rubroId = movimiento.rubroId;
      let rubroNombre = movimiento.rubro?.nombre || 'Ingreso';
      if (dto.rubroId !== undefined && dto.rubroId !== movimiento.rubroId) {
        const r = await tx.rubroContable.findUnique({ where: { id: dto.rubroId } });
        if (!r) throw new NotFoundException('Rubro no encontrado');
        if (!r.activo) throw new BadRequestException('El rubro seleccionado se encuentra inactivo');
        if (r.tipo !== TipoRubro.INGRESO) throw new BadRequestException('El rubro debe ser de tipo INGRESO');
        rubroId = r.id;
        rubroNombre = r.nombre;
      }

      const monto = dto.monto !== undefined ? round2(dto.monto) : Number(movimiento.montoIngreso);
      if (monto <= 0) {
        throw new BadRequestException('El monto debe ser mayor a 0');
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
          montoIngreso: redondearDosDecimales(monto),
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

    const movimiento = await this.prisma.movimientoFinanciero.findUnique({
      where: { id },
      include: { rubro: true, cuenta: true },
    });

    if (!movimiento) {
      throw new NotFoundException(`Ingreso con ID ${id} no encontrado`);
    }

    if (movimiento.tipo !== TipoMovimientoFinanciero.INGRESO_OTRO) {
      throw new BadRequestException('Solo se pueden eliminar ingresos manuales registrados directamente');
    }

    await this.prisma.movimientoFinanciero.delete({
      where: { id },
    });

    return { exito: true, mensaje: 'Ingreso eliminado correctamente' };
  }

  async listarIngresos(alcance: AlcanceAcceso, query: ListarIngresosQueryDto) {
    if (alcance.tipo === 'PROPIO') {
      throw new ForbiddenException('No tiene permisos para listar ingresos');
    }

    const where: Prisma.MovimientoFinancieroWhereInput = {
      tipo: TipoMovimientoFinanciero.INGRESO_OTRO,
    };

    if (query.cuentaId) where.cuentaId = query.cuentaId;
    if (query.rubroId) where.rubroId = query.rubroId;
    if (query.desde || query.hasta) {
      where.fecha = {};
      if (query.desde) where.fecha.gte = new Date(query.desde.includes('T') ? query.desde : `${query.desde}T00:00:00.000Z`);
      if (query.hasta) where.fecha.lte = new Date(query.hasta.includes('T') ? query.hasta : `${query.hasta}T23:59:59.999Z`);
    }

    return this.prisma.movimientoFinanciero.findMany({
      where,
      orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
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

  async obtenerCuadroResultados(
    alcance: AlcanceAcceso,
    query: ConsultaCuadroResultadosQueryDto,
  ) {
    if (alcance.tipo === 'PROPIO') {
      throw new ForbiddenException('No tiene permisos para consultar el cuadro de resultados');
    }

    const anio = query.anio || new Date().getFullYear();
    const mesFiltro = query.mes ?? null;

    const desdeAnio = new Date(Date.UTC(anio, 0, 1, 3, 0, 0, 0));
    const hastaAnio = new Date(Date.UTC(anio + 1, 0, 1, 2, 59, 59, 999));

    // 1. Obtener rubros contables
    const rubrosDb = await this.prisma.rubroContable.findMany({
      orderBy: [{ tipo: 'asc' }, { nombre: 'asc' }],
    });

    // 2. Obtener pagos reales del año
    const pagos = await this.prisma.pago.findMany({
      where: {
        fechaPago: { gte: desdeAnio, lte: hastaAnio },
        referenciaComprobante: { not: 'APLICACION_SALDO_A_FAVOR' },
      },
      include: {
        imputaciones: {
          include: {
            cargo: {
              include: {
                concepto: {
                  include: {
                    rubro: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    // 3. Obtener otros ingresos y cobros de eventos económicos registrados en cuentas
    const ingresosMovimientos = await this.prisma.movimientoFinanciero.findMany({
      where: {
        OR: [
          { tipo: TipoMovimientoFinanciero.INGRESO_OTRO },
          { pedidoEventoId: { not: null } },
        ],
        fecha: { gte: desdeAnio, lte: hastaAnio },
      },
      include: {
        rubro: true,
        pedidoEvento: {
          include: {
            evento: {
              include: { rubro: true },
            },
          },
        },
      },
    });

    // 4. Obtener gastos operativos del año
    const gastos = await this.prisma.gasto.findMany({
      where: {
        anulado: false,
        fecha: { gte: desdeAnio, lte: hastaAnio },
      },
      include: {
        rubro: true,
      },
    });

    // 5. Obtener saldos disponibles actuales en cuentas
    const cuentas = await this.listarCuentasFinancieras(alcance, false);
    let totalCaja = 0;
    let totalBanco = 0;
    for (const c of cuentas) {
      if (c.tipo === TipoCuenta.CAJA_EFECTIVO) {
        totalCaja = round2(totalCaja + c.saldoActual);
      } else if (c.tipo === TipoCuenta.BANCO) {
        totalBanco = round2(totalBanco + c.saldoActual);
      }
    }
    const totalDisponible = round2(totalCaja + totalBanco);

    // Helpers para meses en horario Argentina (GMT-3)
    const obtenerMesYAnioArg = (fecha: Date) => {
      const str = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Argentina/Buenos_Aires',
        year: 'numeric',
        month: '2-digit',
      }).format(fecha);
      const [y, m] = str.split('-').map(Number);
      return { anio: y, mes: m };
    };

    const emptyMeses = (): Record<number, number> => ({
      1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0, 11: 0, 12: 0,
    });

    interface RubroAcumulador {
      rubroId: number | null;
      rubroNombre: string;
      meses: Record<number, number>;
    }

    const ingresosMap = new Map<string, RubroAcumulador>();
    const egresosMap = new Map<string, RubroAcumulador>();

    // Inicializar mapas con los rubros contables registrados
    for (const r of rubrosDb) {
      if (r.tipo === TipoRubro.INGRESO) {
        ingresosMap.set(r.nombre, {
          rubroId: r.id,
          rubroNombre: r.nombre,
          meses: emptyMeses(),
        });
      } else {
        egresosMap.set(r.nombre, {
          rubroId: r.id,
          rubroNombre: r.nombre,
          meses: emptyMeses(),
        });
      }
    }

    // Procesar Cobranzas
    for (const pago of pagos) {
      const { anio: a, mes: m } = obtenerMesYAnioArg(pago.fechaPago);
      if (a === anio && m >= 1 && m <= 12) {
        let totalImputado = 0;
        for (const imp of pago.imputaciones) {
          const montoImp = Number(imp.montoImputado);
          totalImputado += montoImp;
          const concepto = imp.cargo?.concepto;
          const rubroId = concepto?.rubro?.id ?? concepto?.rubroId ?? null;
          let rubroNombre = concepto?.rubro?.nombre;

          if (!rubroNombre) {
            const nomLower = (concepto?.nombre || '').toLowerCase();
            if (nomLower.includes('campa')) {
              rubroNombre = 'Campamentos y Salidas';
            } else if (nomLower.includes('afilia')) {
              rubroNombre = 'Afiliación Nacional';
            } else if (nomLower.includes('bono') || nomLower.includes('evento')) {
              rubroNombre = 'Eventos y Festivales';
            } else {
              rubroNombre = 'Cuota Social';
            }
          }

          if (!ingresosMap.has(rubroNombre)) {
            ingresosMap.set(rubroNombre, {
              rubroId,
              rubroNombre,
              meses: emptyMeses(),
            });
          }
          const item = ingresosMap.get(rubroNombre)!;
          item.meses[m] = round2(item.meses[m] + montoImp);
        }

        // Remanente / pago a cuenta que ingresó a saldo a favor
        const remanente = round2(Number(pago.montoTotal) - totalImputado);
        if (remanente > 0) {
          const rubroNombre = 'Adelanto / Saldo a Favor';
          if (!ingresosMap.has(rubroNombre)) {
            ingresosMap.set(rubroNombre, {
              rubroId: null,
              rubroNombre,
              meses: emptyMeses(),
            });
          }
          const item = ingresosMap.get(rubroNombre)!;
          item.meses[m] = round2(item.meses[m] + remanente);
        }
      }
    }

    // Procesar otros ingresos directos y cobranzas de eventos
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

        if (!ingresosMap.has(rubroNombre)) {
          ingresosMap.set(rubroNombre, {
            rubroId,
            rubroNombre,
            meses: emptyMeses(),
          });
        }
        const item = ingresosMap.get(rubroNombre)!;
        item.meses[m] = round2(item.meses[m] + Number(aj.montoIngreso));
      }
    }

    // Procesar Gastos
    for (const g of gastos) {
      const { anio: a, mes: m } = obtenerMesYAnioArg(g.fecha);
      if (a === anio && m >= 1 && m <= 12) {
        const rubroNombre = g.rubro.nombre;
        if (!egresosMap.has(rubroNombre)) {
          egresosMap.set(rubroNombre, {
            rubroId: g.rubroId,
            rubroNombre,
            meses: emptyMeses(),
          });
        }
        const item = egresosMap.get(rubroNombre)!;
        item.meses[m] = round2(item.meses[m] + Number(g.monto));
      }
    }

    // Evolución Mensual (Ene .. Dic)
    const evolucionMensual = Array.from({ length: 12 }, (_, i) => {
      const mesNum = i + 1;
      let ingMes = 0;
      for (const item of ingresosMap.values()) {
        ingMes += item.meses[mesNum] || 0;
      }
      let egrMes = 0;
      for (const item of egresosMap.values()) {
        egrMes += item.meses[mesNum] || 0;
      }
      return {
        mes: mesNum,
        nombreMes: NOMBRES_MESES[i],
        ingresos: round2(ingMes),
        egresos: round2(egrMes),
        resultadoNeto: round2(ingMes - egrMes),
      };
    });

    // Calcular totales de período según filtro mensual o año completo
    let totalIngresosPeriodo = 0;
    let totalEgresosPeriodo = 0;

    const ingresosPorRubro = Array.from(ingresosMap.values()).map((item) => {
      const total = mesFiltro
        ? round2(item.meses[mesFiltro] || 0)
        : round2(Object.values(item.meses).reduce((acc, v) => acc + v, 0));
      totalIngresosPeriodo = round2(totalIngresosPeriodo + total);
      return {
        rubroId: item.rubroId,
        rubroNombre: item.rubroNombre,
        meses: item.meses,
        total,
        porcentaje: 0,
      };
    });

    const egresosPorRubro = Array.from(egresosMap.values()).map((item) => {
      const total = mesFiltro
        ? round2(item.meses[mesFiltro] || 0)
        : round2(Object.values(item.meses).reduce((acc, v) => acc + v, 0));
      totalEgresosPeriodo = round2(totalEgresosPeriodo + total);
      return {
        rubroId: item.rubroId,
        rubroNombre: item.rubroNombre,
        meses: item.meses,
        total,
        porcentaje: 0,
      };
    });

    // Asignar porcentajes relativos
    for (const r of ingresosPorRubro) {
      r.porcentaje = totalIngresosPeriodo > 0 ? round2((r.total / totalIngresosPeriodo) * 100) : 0;
    }
    for (const r of egresosPorRubro) {
      r.porcentaje = totalEgresosPeriodo > 0 ? round2((r.total / totalEgresosPeriodo) * 100) : 0;
    }

    // Ordenar de mayor a menor recaudación/gasto
    ingresosPorRubro.sort((a, b) => b.total - a.total);
    egresosPorRubro.sort((a, b) => b.total - a.total);

    const resultadoNeto = round2(totalIngresosPeriodo - totalEgresosPeriodo);
    const margenOperativoPorcentaje =
      totalIngresosPeriodo > 0 ? round2((resultadoNeto / totalIngresosPeriodo) * 100) : 0;

    return {
      anio,
      mesFiltro,
      resumen: {
        totalIngresos: totalIngresosPeriodo,
        totalEgresos: totalEgresosPeriodo,
        resultadoNeto,
        margenOperativoPorcentaje,
      },
      ingresosPorRubro,
      egresosPorRubro,
      evolucionMensual,
      disponibilidadActual: {
        totalCaja,
        totalBanco,
        totalDisponible,
      },
    };
  }

  // ===========================================================================
  // EVENTOS ECONÓMICOS, PEDIDOS Y TICKETS QR (FASE 4)
  // ===========================================================================

  async listarEventos(alcance: AlcanceAcceso, tipo?: TipoEvento) {
    const where: Prisma.EventoWhereInput = {
      ...(tipo ? { tipo } : {}),
      ...(alcance.tipo === 'PROPIO'
        ? { estado: { in: [EstadoEvento.PUBLICADO, EstadoEvento.FINALIZADO] } }
        : {}),
    };

    const eventos = await this.prisma.evento.findMany({
      where,
      include: {
        rubro: { select: { id: true, nombre: true } },
        cuenta: { select: { id: true, nombre: true, tipo: true } },
        creadoPor: { select: { id: true, nombre: true, apellido: true } },
        items: { orderBy: { id: 'asc' } },
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
      },
      orderBy: { fechaEvento: 'desc' },
    });

    return eventos.map((ev) => {
      let totalVenta = 0;
      let totalGanancia = 0;
      let totalTickets = 0;
      let ticketsRetirados = 0;

      for (const p of ev.pedidos) {
        if (p.estado !== EstadoPedidoEvento.CANCELADO) {
          totalVenta += Number(p.total);
          totalGanancia += Number(p.totalGanancia);
          for (const t of p.tickets) {
            totalTickets += t.cantidad;
            if (t.estado === EstadoTicketEvento.UTILIZADO) {
              ticketsRetirados += t.cantidad;
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
        cuenta: ev.cuenta,
        cuentaId: ev.cuentaId,
        creadoPor: ev.creadoPor,
        items: ev.items,
        metricas: {
          cantidadPedidos: ev.pedidos.length,
          totalVenta: round2(totalVenta),
          totalGanancia: round2(totalGanancia),
          totalTickets,
          ticketsRetirados,
          porcentajeRetirado: totalTickets > 0 ? round2((ticketsRetirados / totalTickets) * 100) : 0,
        },
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
          where: alcance.tipo === 'PROPIO' ? { vendedorUsuarioId: alcance.usuarioId } : {},
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
    return ev;
  }

  async crearEvento(actor: AuthUser, alcance: AlcanceAcceso, dto: CrearEventoDto) {
    if (alcance.tipo === 'PROPIO') {
      throw new ForbiddenException('No tiene permisos para crear eventos');
    }

    if (dto.rubroId) {
      const rubro = await this.prisma.rubroContable.findUnique({ where: { id: dto.rubroId } });
      if (!rubro) throw new NotFoundException('El rubro contable indicado no existe');
    }

    if (dto.cuentaId) {
      const cuenta = await this.prisma.cuentaFinanciera.findUnique({ where: { id: dto.cuentaId } });
      if (!cuenta) throw new NotFoundException('La cuenta financiera indicada no existe');
    }

    return this.prisma.evento.create({
      data: {
        titulo: dto.titulo,
        descripcion: dto.descripcion,
        tipo: dto.tipo as TipoEvento,
        estado: (dto.estado || EstadoEvento.PUBLICADO) as EstadoEvento,
        fechaEvento: new Date(dto.fechaEvento),
        fechaFin: dto.fechaFin ? new Date(dto.fechaFin) : null,
        lugarEntrega: dto.lugarEntrega,
        rubroId: dto.rubroId ?? null,
        cuentaId: dto.cuentaId ?? null,
        creadoPorUsuarioId: actor.sub,
        items: {
          create: dto.items.map((it) => ({
            nombre: it.nombre,
            descripcion: it.descripcion,
            precioVenta: redondearDosDecimales(Number(it.precioVenta)),
            costoUnitario: redondearDosDecimales(Number(it.costoUnitario ?? 0)),
            gananciaUnitaria: redondearDosDecimales(
              Number(it.gananciaUnitaria ?? (Number(it.precioVenta) - Number(it.costoUnitario ?? 0))),
            ),
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
    if (alcance.tipo === 'PROPIO') {
      throw new ForbiddenException('No tiene permisos para editar eventos');
    }

    const evento = await this.prisma.evento.findUnique({ where: { id } });
    if (!evento) throw new NotFoundException('Evento no encontrado');

    if (dto.items && dto.items.length > 0) {
      const tienePedidos = await this.prisma.pedidoEvento.count({ where: { eventoId: id } });
      if (tienePedidos === 0) {
        await this.prisma.itemEvento.deleteMany({ where: { eventoId: id } });
        await this.prisma.itemEvento.createMany({
          data: dto.items.map((it) => ({
            eventoId: id,
            nombre: it.nombre,
            descripcion: it.descripcion,
            precioVenta: redondearDosDecimales(Number(it.precioVenta)),
            costoUnitario: redondearDosDecimales(Number(it.costoUnitario ?? 0)),
            gananciaUnitaria: redondearDosDecimales(
              Number(it.gananciaUnitaria ?? (Number(it.precioVenta) - Number(it.costoUnitario ?? 0))),
            ),
            stockTotal: it.stockTotal ?? null,
            stockDisponible: it.stockTotal ?? null,
          })),
        });
      }
    }

    return this.prisma.evento.update({
      where: { id },
      data: {
        ...(dto.titulo ? { titulo: dto.titulo } : {}),
        ...(dto.descripcion !== undefined ? { descripcion: dto.descripcion } : {}),
        ...(dto.tipo ? { tipo: dto.tipo as TipoEvento } : {}),
        ...(dto.estado ? { estado: dto.estado as EstadoEvento } : {}),
        ...(dto.fechaEvento ? { fechaEvento: new Date(dto.fechaEvento) } : {}),
        ...(dto.fechaFin !== undefined ? { fechaFin: dto.fechaFin ? new Date(dto.fechaFin) : null } : {}),
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
  }

  async eliminarEvento(alcance: AlcanceAcceso, id: number) {
    if (alcance.tipo === 'PROPIO') {
      throw new ForbiddenException('No tiene permisos para eliminar eventos económicos');
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
      dto.vendedorUsuarioId = actor.sub;
      dto.cuentaId = undefined;
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
    let totalVentaNum = 0;
    let totalGananciaNum = 0;

    const itemsCalculados: Array<{
      item: (typeof evento.items)[0];
      cantidad: number;
      precioUnitario: number;
      subtotal: number;
      gananciaUnitaria: number;
      subtotalGanancia: number;
    }> = [];

    for (const pItem of dto.items) {
      const dbItem = itemsMap.get(pItem.itemId);
      if (!dbItem) {
        throw new BadRequestException(`El producto con ID ${pItem.itemId} no pertenece a este evento`);
      }
      if (dbItem.stockDisponible !== null && dbItem.stockDisponible < pItem.cantidad) {
        throw new BadRequestException(
          `Stock insuficiente para "${dbItem.nombre}". Disponibles: ${dbItem.stockDisponible}`,
        );
      }

      const pUnit = Number(dbItem.precioVenta);
      const sub = round2(pUnit * pItem.cantidad);
      const gUnit = Number(dbItem.gananciaUnitaria);
      const subG = round2(gUnit * pItem.cantidad);

      totalVentaNum = round2(totalVentaNum + sub);
      totalGananciaNum = round2(totalGananciaNum + subG);

      itemsCalculados.push({
        item: dbItem,
        cantidad: pItem.cantidad,
        precioUnitario: pUnit,
        subtotal: sub,
        gananciaUnitaria: gUnit,
        subtotalGanancia: subG,
      });
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Crear Pedido
      const pedido = await tx.pedidoEvento.create({
        data: {
          eventoId: evento.id,
          compradorNombre: dto.compradorNombre,
          compradorContacto: dto.compradorContacto,
          vendedorUsuarioId: dto.vendedorUsuarioId ?? null,
          total: redondearDosDecimales(totalVentaNum),
          totalGanancia: redondearDosDecimales(totalGananciaNum),
          estado: dto.cuentaId ? EstadoPedidoEvento.PAGADO : EstadoPedidoEvento.PENDIENTE,
          metodoPago: (dto.metodoPago as MetodoPago) ?? null,
          cuentaId: dto.cuentaId ?? null,
          registradoPorUsuarioId: actor.sub,
          observaciones: dto.observaciones,
          detalles: {
            create: itemsCalculados.map((it) => ({
              itemId: it.item.id,
              cantidad: it.cantidad,
              precioUnitario: redondearDosDecimales(it.precioUnitario),
              subtotal: redondearDosDecimales(it.subtotal),
              gananciaUnitaria: redondearDosDecimales(it.gananciaUnitaria),
              subtotalGanancia: redondearDosDecimales(it.subtotalGanancia),
            })),
          },
        },
      });

      // 2. Generar Tickets QR (1 ticket por cada item solicitado con su cantidad)
      for (const it of itemsCalculados) {
        await tx.ticketEvento.create({
          data: {
            pedidoId: pedido.id,
            itemId: it.item.id,
            tokenQr: generateTokenQR(),
            cantidad: it.cantidad,
            estado: EstadoTicketEvento.ACTIVO,
          },
        });

        // Actualizar stock si correspondiese
        if (it.item.stockDisponible !== null) {
          await tx.itemEvento.update({
            where: { id: it.item.id },
            data: { stockDisponible: { decrement: it.cantidad } },
          });
        }
      }

      // 3. Si se cobra en el acto en Caja o Banco, asentar en libro diario
      if (dto.cuentaId && totalVentaNum > 0) {
        await tx.movimientoFinanciero.create({
          data: {
            cuentaId: dto.cuentaId,
            fecha: new Date(),
            tipo: TipoMovimientoFinanciero.INGRESO_COBRANZA,
            montoIngreso: redondearDosDecimales(totalVentaNum),
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
    const pedido = await this.prisma.pedidoEvento.findUnique({
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
      if (dto.vendedorUsuarioId && dto.vendedorUsuarioId !== actor.sub) {
        throw new ForbiddenException('Solo puedes asignar pedidos a tu propio usuario');
      }
      dto.cuentaId = undefined;
    }

    const tieneTicketUtilizado = pedido.tickets.some((t) => t.estado === EstadoTicketEvento.UTILIZADO);
    if (dto.items && dto.items.length > 0) {
      const detallesMap = new Map(pedido.detalles.map((d) => [d.itemId, d.cantidad]));
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

    return this.prisma.$transaction(async (tx) => {
      let totalVentaNum = Number(pedido.total);
      let totalGananciaNum = Number(pedido.totalGanancia);

      if (dto.items && dto.items.length > 0) {
        // 1. Restaurar stock anterior si correspondía
        for (const det of pedido.detalles) {
          const itDb = pedido.evento.items.find((i) => i.id === det.itemId);
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
        const itemsMap = new Map(itemsDb.map((i) => [i.id, i]));

        totalVentaNum = 0;
        totalGananciaNum = 0;
        const itemsCalculados: Array<{
          item: (typeof itemsDb)[0];
          cantidad: number;
          precioUnitario: number;
          subtotal: number;
          gananciaUnitaria: number;
          subtotalGanancia: number;
        }> = [];

        for (const pItem of dto.items) {
          const dbItem = itemsMap.get(pItem.itemId);
          if (!dbItem) {
            throw new BadRequestException(`El producto con ID ${pItem.itemId} no pertenece a este evento`);
          }
          if (dbItem.stockDisponible !== null && dbItem.stockDisponible < pItem.cantidad) {
            throw new BadRequestException(
              `Stock insuficiente para "${dbItem.nombre}". Disponibles: ${dbItem.stockDisponible}`,
            );
          }

          const pUnit = Number(dbItem.precioVenta);
          const sub = round2(pUnit * pItem.cantidad);
          const gUnit = Number(dbItem.gananciaUnitaria);
          const subG = round2(gUnit * pItem.cantidad);

          totalVentaNum = round2(totalVentaNum + sub);
          totalGananciaNum = round2(totalGananciaNum + subG);

          itemsCalculados.push({
            item: dbItem,
            cantidad: pItem.cantidad,
            precioUnitario: pUnit,
            subtotal: sub,
            gananciaUnitaria: gUnit,
            subtotalGanancia: subG,
          });
        }

        // 4. Crear nuevos detalles y tickets
        for (const it of itemsCalculados) {
          await tx.detallePedidoEvento.create({
            data: {
              pedidoId: pedido.id,
              itemId: it.item.id,
              cantidad: it.cantidad,
              precioUnitario: redondearDosDecimales(it.precioUnitario),
              subtotal: redondearDosDecimales(it.subtotal),
              gananciaUnitaria: redondearDosDecimales(it.gananciaUnitaria),
              subtotalGanancia: redondearDosDecimales(it.subtotalGanancia),
            },
          });

          await tx.ticketEvento.create({
            data: {
              pedidoId: pedido.id,
              itemId: it.item.id,
              tokenQr: generateTokenQR(),
              cantidad: it.cantidad,
              estado: EstadoTicketEvento.ACTIVO,
            },
          });

          if (it.item.stockDisponible !== null) {
            await tx.itemEvento.update({
              where: { id: it.item.id },
              data: { stockDisponible: { decrement: it.cantidad } },
            });
          }
        }
      }

      const nuevaCuentaId = dto.cuentaId !== undefined ? dto.cuentaId : pedido.cuentaId;
      const nuevoTotal = dto.items ? redondearDosDecimales(totalVentaNum) : Number(pedido.total);
      const nuevoEstado = nuevaCuentaId ? EstadoPedidoEvento.PAGADO : EstadoPedidoEvento.PENDIENTE;

      // Sincronizar MovimientoFinanciero si el pedido fue cobrado o se le quitó la cuenta
      const movExistente = await tx.movimientoFinanciero.findFirst({
        where: { pedidoEventoId: pedido.id },
      });

      if (nuevaCuentaId) {
        if (movExistente) {
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
        await tx.movimientoFinanciero.delete({
          where: { id: movExistente.id },
        });
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
            totalGanancia: redondearDosDecimales(totalGananciaNum),
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
    const pedido = await this.prisma.pedidoEvento.findUnique({
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
    }

    const tieneTicketUtilizado = pedido.tickets.some((t) => t.estado === EstadoTicketEvento.UTILIZADO);
    if (tieneTicketUtilizado) {
      throw new BadRequestException('No se puede eliminar un pedido cuyos vales QR ya fueron utilizados');
    }

    if (pedido.gananciaAcreditada) {
      throw new BadRequestException('No se puede eliminar un pedido cuyas ganancias ya fueron acreditadas');
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Restaurar stock si correspondía
      for (const det of pedido.detalles) {
        const itDb = pedido.evento.items.find((i) => i.id === det.itemId);
        if (itDb && itDb.stockTotal !== null) {
          await tx.itemEvento.update({
            where: { id: det.itemId },
            data: { stockDisponible: { increment: det.cantidad } },
          });
        }
      }

      // 2. Eliminar movimientos financieros asociados
      await tx.movimientoFinanciero.deleteMany({
        where: { pedidoEventoId: pedido.id },
      });

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
    const verification = verifyTokenQR(dto.tokenQr);
    if (!verification.valid) {
      throw new BadRequestException('El código QR es inválido o no corresponde a una entrada auténtica');
    }

    return this.prisma.$transaction(async (tx) => {
      const ticket = await tx.ticketEvento.findUnique({
        where: { tokenQr: dto.tokenQr },
        include: {
          item: true,
          pedido: {
            include: {
              evento: true,
              vendedorUsuario: { select: { id: true, nombre: true, apellido: true } },
            },
          },
        },
      });

      if (!ticket) {
        throw new NotFoundException('Vale o entrada no encontrada en el sistema');
      }

      if (ticket.pedido.estado === EstadoPedidoEvento.CANCELADO || ticket.pedido.evento.estado === EstadoEvento.CANCELADO) {
        return {
          ok: false,
          estado: 'CANCELADO',
          mensaje: 'El pedido o el evento asociado se encuentra cancelado.',
        };
      }

      if (ticket.estado === EstadoTicketEvento.UTILIZADO) {
        return {
          ok: false,
          estado: 'YA_UTILIZADO',
          mensaje: `Este vale ya fue retirado/utilizado el ${ticket.fechaUso ? new Date(ticket.fechaUso).toLocaleString('es-AR') : 'previamente'}.`,
          ticket: {
            id: ticket.id,
            producto: ticket.item.nombre,
            cantidad: ticket.cantidad,
            comprador: ticket.pedido.compradorNombre,
            vendedor: ticket.pedido.vendedorUsuario
              ? `${ticket.pedido.vendedorUsuario.nombre} ${ticket.pedido.vendedorUsuario.apellido}`
              : null,
            evento: ticket.pedido.evento.titulo,
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

      return {
        ok: true,
        estado: 'VALIDADO',
        alertaPagoPendiente: esPagoPendiente,
        montoPendiente: esPagoPendiente ? montoTotalPedido : 0,
        mensaje: esPagoPendiente
          ? `¡Entrega confirmada! (ATENCIÓN: Pago PENDIENTE de $${montoTotalPedido.toLocaleString('es-AR')} en puerta). Entregar: ${ticket.cantidad}x ${ticket.item.nombre}`
          : `¡Entrega confirmada! Entregar: ${ticket.cantidad}x ${ticket.item.nombre}`,
        ticket: {
          id: ticket.id,
          producto: ticket.item.nombre,
          cantidad: ticket.cantidad,
          comprador: ticket.pedido.compradorNombre,
          vendedor: ticket.pedido.vendedorUsuario
            ? `${ticket.pedido.vendedorUsuario.nombre} ${ticket.pedido.vendedorUsuario.apellido}`
            : null,
          evento: ticket.pedido.evento.titulo,
          pedidoEstado: ticket.pedido.estado,
          pedidoTotal: montoTotalPedido,
          fechaUso: new Date(),
        },
      };
    });
  }

  async acreditarGananciasEvento(actor: AuthUser, alcance: AlcanceAcceso, dto: AcreditarGananciasEventoDto) {
    if (alcance.tipo === 'PROPIO') {
      throw new ForbiddenException('No tiene permisos para liquidar ganancias de eventos');
    }

    const evento = await this.prisma.evento.findUnique({
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

    const pedidosParaAcreditar = evento.pedidos.filter((p) => {
      if (Number(p.totalGanancia) < 0) return false;
      if (!dto.soloRetirados) return true;
      // Validar que todos sus tickets estén en estado UTILIZADO
      return p.tickets.length > 0 && p.tickets.every((t) => t.estado === EstadoTicketEvento.UTILIZADO);
    });

    return this.prisma.$transaction(async (tx) => {
      let totalGananciaAcreditada = 0;
      let pedidosAcreditadosCount = 0;

      for (const pedido of pedidosParaAcreditar) {
        const ganancia = Number(pedido.totalGanancia);
        if (pedido.vendedorUsuarioId) {
          if (ganancia > 0) {
            await tx.usuario.update({
              where: { id: pedido.vendedorUsuarioId },
              data: {
                saldoAFavor: { increment: redondearDosDecimales(ganancia) },
              },
            });
          }

          await tx.pedidoEvento.update({
            where: { id: pedido.id },
            data: {
              gananciaAcreditada: true,
              fechaAcreditacion: new Date(),
            },
          });

          totalGananciaAcreditada = round2(totalGananciaAcreditada + ganancia);
          pedidosAcreditadosCount++;
        }
      }

      return {
        eventoId: evento.id,
        pedidosAcreditados: pedidosAcreditadosCount,
        totalGananciaAcreditada: round2(totalGananciaAcreditada),
      };
    });
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
