import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EstadoCargo,
  MetodoPago,
  Prisma,
  TipoCuenta,
  TipoMovimientoFinanciero,
  TipoRubro,
} from '@prisma/client';
import {
  anioActual,
  hoyUtc,
  parsearFechaOperacion,
} from '../common/utils/fechas.util.js';
import {
  assertUnidadEnAlcance,
  esRolEducadorEfectivo,
  filtroUsuariosPorAlcance,
  tipoMiembroEfectivo,
} from '../common/scope/alcance.util.js';
import { CLAVES_FAMILIARES_ESTANDAR } from '../common/utils/plantillas.util.js';
import type { AlcanceAcceso, AuthUser } from '../common/types/auth.types.js';
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
import { PrismaService } from '../prisma/prisma.service.js';
import {
  NOMBRES_MESES,
  aCentavos,
  asTrimmedString,
  assertSaldoCuentaDisponibleEnTx,
  calcularEstadoCargo,
  calcularMontosCargo,
  calcularResumenRecaudacion,
  centavosADecimal,
  construirFiltroRol,
  deCentavos,
  descontarMontoCargoEnTx,
  extraerExcepcionIds,
  liberarMontoPagadoDeCargoEnTx,
  lockFilasPorIds,
  redondearDosDecimales,
  serializarConceptoCompat,
  serializarPlanCompat,
} from './tesoreria-shared.js';

@Injectable()
export class TesoreriaCuotasService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizarIdsExcepcion(ids?: number[]): number[] {
    if (!Array.isArray(ids)) return [];
    return Array.from(new Set(ids.filter((id) => Number.isInteger(id) && id > 0)));
  }

  private async reemplazarExcepcionesPlanEnTx(
    tx: Prisma.TransactionClient,
    planCuotaMensualId: number,
    excepcionesIds: number[],
  ) {
    const ids = this.normalizarIdsExcepcion(excepcionesIds);
    if ((tx as any).planCuotaExcepcion?.deleteMany) {
      await (tx as any).planCuotaExcepcion.deleteMany({ where: { planCuotaMensualId } });
    }
    if (ids.length > 0 && (tx as any).planCuotaExcepcion?.createMany) {
      await (tx as any).planCuotaExcepcion.createMany({
        data: ids.map((usuarioId) => ({ planCuotaMensualId, usuarioId })),
        skipDuplicates: true,
      });
    }
  }

  private async reemplazarExcepcionesConceptoEnTx(
    tx: Prisma.TransactionClient,
    conceptoId: number,
    excepcionesIds: number[],
  ) {
    const ids = this.normalizarIdsExcepcion(excepcionesIds);
    if ((tx as any).conceptoExcepcion?.deleteMany) {
      await (tx as any).conceptoExcepcion.deleteMany({ where: { conceptoId } });
    }
    if (ids.length > 0 && (tx as any).conceptoExcepcion?.createMany) {
      await (tx as any).conceptoExcepcion.createMany({
        data: ids.map((usuarioId) => ({ conceptoId, usuarioId })),
        skipDuplicates: true,
      });
    }
  }

  private async obtenerMetricasPorConcepto(
    conceptoIds: number[],
    cargosWhere: Prisma.CargoMiembroWhereInput,
  ): Promise<Map<number, { totalCount: number; resumen: ReturnType<typeof calcularResumenRecaudacion> }> | null> {
    if (typeof (this.prisma.cargoMiembro as any)?.groupBy !== 'function') {
      return null;
    }
    const mapa = new Map<
      number,
      {
        totalCount: number;
        totalCargos: number;
        cargosPagados: number;
        cargosParciales: number;
        cargosPendientes: number;
        totalFacturadoCts: number;
        totalRecaudadoCts: number;
      }
    >();
    if (conceptoIds.length === 0) return new Map();

    const rows = await this.prisma.cargoMiembro.groupBy({
      by: ['conceptoId', 'estado'],
      where: {
        AND: [{ conceptoId: { in: conceptoIds } }, cargosWhere],
      },
      _count: { _all: true },
      _sum: { montoFinal: true, montoPagado: true },
    });

    for (const r of rows) {
      const entry = mapa.get(r.conceptoId) ?? {
        totalCount: 0,
        totalCargos: 0,
        cargosPagados: 0,
        cargosParciales: 0,
        cargosPendientes: 0,
        totalFacturadoCts: 0,
        totalRecaudadoCts: 0,
      };
      const cnt = r._count._all;
      entry.totalCount += cnt;
      if (r.estado !== EstadoCargo.ANULADO) {
        entry.totalCargos += cnt;
        entry.totalFacturadoCts += aCentavos(r._sum.montoFinal);
        entry.totalRecaudadoCts += aCentavos(r._sum.montoPagado);
        if (r.estado === EstadoCargo.PAGADO) entry.cargosPagados += cnt;
        else if (r.estado === EstadoCargo.PARCIAL) entry.cargosParciales += cnt;
        else if (r.estado === EstadoCargo.PENDIENTE) entry.cargosPendientes += cnt;
      }
      mapa.set(r.conceptoId, entry);
    }

    const resultado = new Map<
      number,
      { totalCount: number; resumen: ReturnType<typeof calcularResumenRecaudacion> }
    >();
    for (const [cid, e] of mapa.entries()) {
      const totalPendienteCts = Math.max(0, e.totalFacturadoCts - e.totalRecaudadoCts);
      const porcentajeCobrado =
        e.totalFacturadoCts > 0 ? Math.round((e.totalRecaudadoCts / e.totalFacturadoCts) * 100) : 0;
      resultado.set(cid, {
        totalCount: e.totalCount,
        resumen: {
          totalCargos: e.totalCargos,
          cargosPagados: e.cargosPagados,
          cargosParciales: e.cargosParciales,
          cargosPendientes: e.cargosPendientes,
          totalFacturado: deCentavos(e.totalFacturadoCts),
          totalRecaudado: deCentavos(e.totalRecaudadoCts),
          totalPendiente: deCentavos(totalPendienteCts),
          porcentajeCobrado,
        },
      });
    }
    return resultado;
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
        await liberarMontoPagadoDeCargoEnTx(tx, cg.id, cg.usuarioId, pagado);
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
  async sincronizarCargosDeConceptoEnTx(tx: Prisma.TransactionClient, concepto: any) {
    if (!concepto || concepto.destinatarioTipo === 'INDIVIDUAL') return;

    let excepciones = extraerExcepcionIds(concepto);
    if (
      excepciones.length === 0 &&
      !Array.isArray(concepto.excepciones) &&
      !Array.isArray(concepto.excepcionesJson) &&
      (tx as any).conceptoExcepcion?.findMany
    ) {
      const rows = await (tx as any).conceptoExcepcion.findMany({
        where: { conceptoId: concepto.id },
        select: { usuarioId: true },
      });
      excepciones = rows.map((r: { usuarioId: number }) => r.usuarioId);
    }

    const rolFiltro = construirFiltroRol(concepto.destinatarioTipo, concepto.esParaEducadores);
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
                rol: { tipoMiembro: 'PROTAGONISTA' },
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
      // Si el cargo estaba ANULADO manualmente o ya estaba PAGADO al 100%, se respeta y no se toca
      if (cargo.estado === EstadoCargo.ANULADO || cargo.estado === EstadoCargo.PAGADO) {
        candidatosMap.delete(cargo.usuarioId);
        continue;
      }

      const candidato = candidatosMap.get(cargo.usuarioId);

      if (!candidato) {
        // El miembro fue excluido (becado) o dejó de pertenecer a los destinatarios
        const pagado = Number(cargo.montoPagado);
        if (pagado > 0) {
          await liberarMontoPagadoDeCargoEnTx(tx, cargo.id, cargo.usuarioId, pagado);
        }
        await tx.cargoMiembro.delete({ where: { id: cargo.id } });
        continue;
      }

      candidatosMap.delete(cargo.usuarioId);

      // Recalcular cargo PENDIENTE o PARCIAL
      const { montoOriginal, montoDescuento, montoFinal } = calcularMontosCargo(
        montoBaseNum,
        concepto.permiteDescuentoHermanos ?? true,
        concepto.porcentajeDescuentoHermanos,
        candidato.grupoFamiliar,
      );

      const pagadoActualCts = aCentavos(cargo.montoPagado);
      const nuevoFinalCts = aCentavos(montoFinal);

      if (pagadoActualCts > nuevoFinalCts) {
        const excesoCts = pagadoActualCts - nuevoFinalCts;
        await liberarMontoPagadoDeCargoEnTx(tx, cargo.id, cargo.usuarioId, deCentavos(excesoCts));
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
        const nuevoEstado = calcularEstadoCargo(cargo.estado, cargo.montoPagado, montoFinal);
        const cambioCargo =
          aCentavos(cargo.montoOriginal) !== aCentavos(montoOriginal) ||
          aCentavos(cargo.montoDescuento) !== aCentavos(montoDescuento) ||
          aCentavos(cargo.montoFinal) !== nuevoFinalCts ||
          cargo.estado !== nuevoEstado;

        if (cambioCargo) {
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

    // Crear cargos para candidatos que aún no tenían cargo en este concepto
    const nuevosCargos: Prisma.CargoMiembroCreateManyInput[] = [];
    for (const u of candidatosMap.values()) {
      const { montoOriginal, montoDescuento, montoFinal } = calcularMontosCargo(
        montoBaseNum,
        concepto.permiteDescuentoHermanos ?? true,
        concepto.porcentajeDescuentoHermanos,
        u.grupoFamiliar,
      );
      const nuevoFinalNum = Number(montoFinal);
      const estadoInicial = nuevoFinalNum <= 0 ? EstadoCargo.PAGADO : EstadoCargo.PENDIENTE;

      nuevosCargos.push({
        usuarioId: u.id,
        conceptoId: concepto.id,
        montoOriginal,
        montoDescuento,
        montoFinal,
        montoPagado: new Prisma.Decimal(0),
        estado: estadoInicial,
      });
    }

    if (nuevosCargos.length > 0) {
      if (tx.cargoMiembro?.createMany) {
        await tx.cargoMiembro.createMany({ data: nuevosCargos });
      } else {
        for (const data of nuevosCargos) {
          await tx.cargoMiembro.create({ data });
        }
      }
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
        const { montoOriginal, montoDescuento, montoFinal } = calcularMontosCargo(
          montoBaseNum,
          cargo.concepto.permiteDescuentoHermanos ?? true,
          cargo.concepto.porcentajeDescuentoHermanos,
          u.grupoFamiliar,
        );

        const pagadoActualCts = aCentavos(cargo.montoPagado);
        const nuevoFinalCts = aCentavos(montoFinal);

        if (pagadoActualCts > nuevoFinalCts) {
          const excesoCts = pagadoActualCts - nuevoFinalCts;
          await liberarMontoPagadoDeCargoEnTx(tx, cargo.id, u.id, deCentavos(excesoCts));
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
          const nuevoEstado = calcularEstadoCargo(cargo.estado, cargo.montoPagado, montoFinal);
          const cambioCargo =
            aCentavos(cargo.montoOriginal) !== aCentavos(montoOriginal) ||
            aCentavos(cargo.montoDescuento) !== aCentavos(montoDescuento) ||
            aCentavos(cargo.montoFinal) !== nuevoFinalCts ||
            cargo.estado !== nuevoEstado;

          if (cambioCargo) {
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
  }

  /**
   * Asigna automáticamente las cuotas vigentes del ciclo actual a un miembro recién dado de alta o reactivado,
   * desde el mes indicado en adelante.
   */
  async sincronizarCuotasMiembroActivoEnTx(
    tx: Prisma.TransactionClient,
    usuarioId: number,
    mesDesde?: number,
    cicloAnio?: number,
  ) {
    const hoyArg = hoyUtc();
    const mesEfectivo = mesDesde ?? hoyArg.getUTCMonth() + 1;
    const cicloEfectivo = cicloAnio ?? anioActual();

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
      (a) => tipoMiembroEfectivo(a.rol, a.alcanceOverride) === 'PROTAGONISTA',
    );
    // Regla de Prevalencia Multirrol: Protagonista prevalece sobre Educador para cuotas
    const esEducador =
      !esProtagonista &&
      usuario.asignaciones.some((a) => esRolEducadorEfectivo(a.rol, a.alcanceOverride));

    const conceptosVigentes = await tx.conceptoCuota.findMany({
      where: {
        cicloAnio: cicloEfectivo,
        destinatarioTipo: { not: 'INDIVIDUAL' },
      },
      include: {
        excepciones: { select: { usuarioId: true } },
      },
    });

    // Anular cuotas pendientes futuras de unidad anterior si el miembro dejó esa unidad y no hubo pagos
    if (tx.cargoMiembro?.updateMany) {
      const conceptosPorId = new Map(conceptosVigentes.map((c) => [c.id, c]));
      const idsCargosAAnular: number[] = [];
      for (const c of usuario.cargos) {
        if (c.estado !== EstadoCargo.PENDIENTE || Number(c.montoPagado) > 0) continue;
        const concepto = conceptosPorId.get(c.conceptoId);
        if (!concepto || concepto.destinatarioTipo === 'INDIVIDUAL') continue;
        if (concepto.unidadId && !unidadesMiembro.has(concepto.unidadId)) {
          if (concepto.planCuotaMensualId === null || concepto.mes === null || concepto.mes >= mesEfectivo) {
            idsCargosAAnular.push(c.id);
          }
        }
      }
      if (idsCargosAAnular.length > 0) {
        await tx.cargoMiembro.updateMany({
          where: { id: { in: idsCargosAAnular }, estado: EstadoCargo.PENDIENTE, montoPagado: 0 },
          data: { estado: EstadoCargo.ANULADO },
        });
      }
    }

    const hoy = hoyArg;

    for (const concepto of conceptosVigentes) {
      // Si es cuota mensual, solo asignar desde mesDesde en adelante
      if (concepto.planCuotaMensualId !== null && concepto.mes !== null && concepto.mes < mesEfectivo) {
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
      const excepciones = extraerExcepcionIds(concepto);
      if (excepciones.includes(usuario.id)) continue;

      const cargoExistente = usuario.cargos.find((c) => c.conceptoId === concepto.id);
      const { montoOriginal, montoDescuento, montoFinal } = calcularMontosCargo(
        Number(concepto.montoBase),
        concepto.permiteDescuentoHermanos ?? true,
        concepto.porcentajeDescuentoHermanos,
        usuario.grupoFamiliar,
      );

      if (cargoExistente) {
        if (cargoExistente.estado === EstadoCargo.ANULADO) {
          const nuevoFinalNum = Number(montoFinal);
          const estadoReactivado = nuevoFinalNum <= 0 ? EstadoCargo.PAGADO : EstadoCargo.PENDIENTE;
          await tx.cargoMiembro.update({
            where: { id: cargoExistente.id },
            data: {
              montoOriginal,
              montoDescuento,
              montoFinal,
              montoPagado: new Prisma.Decimal(0),
              estado: estadoReactivado,
            },
          });
        }
      } else {
        const nuevoFinalNum = Number(montoFinal);
        const estadoInicial = nuevoFinalNum <= 0 ? EstadoCargo.PAGADO : EstadoCargo.PENDIENTE;
        await tx.cargoMiembro.create({
          data: {
            usuarioId: usuario.id,
            conceptoId: concepto.id,
            montoOriginal,
            montoDescuento,
            montoFinal,
            montoPagado: new Prisma.Decimal(0),
            estado: estadoInicial,
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

    const cargosWhere: Prisma.CargoMiembroWhereInput =
      alcance.tipo === 'UNIDAD' ? { usuario: filtroUsuariosPorAlcance(alcance) } : {};
    const usarGroupBy = typeof (this.prisma.cargoMiembro as any)?.groupBy === 'function';

    const planes = await this.prisma.planCuotaMensual.findMany({
      where,
      orderBy: [{ cicloAnio: 'desc' }, { id: 'desc' }],
      take: 200,
      include: {
        unidad: { select: { id: true, nombre: true } },
        rubro: { select: { id: true, nombre: true } },
        excepciones: { select: { usuarioId: true } },
        conceptos: {
          orderBy: { mes: 'asc' },
          include: {
            excepciones: { select: { usuarioId: true } },
            _count: { select: { cargos: { where: cargosWhere } } },
            ...(usarGroupBy
              ? {}
              : {
                  cargos: {
                    where: cargosWhere,
                    select: {
                      id: true,
                      montoFinal: true,
                      montoPagado: true,
                      estado: true,
                    },
                  },
                }),
          },
        },
      },
    });

    const metricasPorConcepto = usarGroupBy
      ? await this.obtenerMetricasPorConcepto(
          planes.flatMap((p) => p.conceptos.map((c) => c.id)),
          cargosWhere,
        )
      : null;

    return planes.map((p) => {
      const conceptosConResumen = p.conceptos.map((c: any) => {
        const metrica = metricasPorConcepto?.get(c.id);
        const resumenMes = metrica
          ? metrica.resumen
          : calcularResumenRecaudacion(c.cargos || []);
        return {
          ...serializarConceptoCompat(c),
          resumenMes,
        };
      });

      const resumenRecaudacion = usarGroupBy
        ? this.combinarResumenesRecaudacion(conceptosConResumen.map((c) => c.resumenMes))
        : calcularResumenRecaudacion(p.conceptos.flatMap((c: any) => c.cargos || []));

      return {
        ...serializarPlanCompat(p),
        resumenRecaudacion,
        conceptos: conceptosConResumen,
      };
    });
  }

  private combinarResumenesRecaudacion(
    resumenes: Array<ReturnType<typeof calcularResumenRecaudacion>>,
  ) {
    let totalCargos = 0;
    let cargosPagados = 0;
    let cargosParciales = 0;
    let cargosPendientes = 0;
    let totalFacturadoCts = 0;
    let totalRecaudadoCts = 0;

    for (const r of resumenes) {
      totalCargos += r.totalCargos;
      cargosPagados += r.cargosPagados;
      cargosParciales += r.cargosParciales;
      cargosPendientes += r.cargosPendientes;
      totalFacturadoCts += aCentavos(r.totalFacturado);
      totalRecaudadoCts += aCentavos(r.totalRecaudado);
    }

    const totalPendienteCts = Math.max(0, totalFacturadoCts - totalRecaudadoCts);
    const porcentajeCobrado =
      totalFacturadoCts > 0 ? Math.round((totalRecaudadoCts / totalFacturadoCts) * 100) : 0;

    return {
      totalCargos,
      cargosPagados,
      cargosParciales,
      cargosPendientes,
      totalFacturado: deCentavos(totalFacturadoCts),
      totalRecaudado: deCentavos(totalRecaudadoCts),
      totalPendiente: deCentavos(totalPendienteCts),
      porcentajeCobrado,
    };
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
      let rubroIdPlan = dto.rubroId ?? null;
      if (!rubroIdPlan) {
        const rubroCuota = await tx.rubroContable.findFirst({
          where: {
            tipo: TipoRubro.INGRESO,
            OR: [
              { nombre: { contains: 'Cuota', mode: 'insensitive' } },
              { nombre: { contains: 'Social', mode: 'insensitive' } },
            ],
          },
        });
        if (rubroCuota) rubroIdPlan = rubroCuota.id;
      }

      const excepcionesIds = this.normalizarIdsExcepcion(dto.excepcionesIds);
      const plan = await tx.planCuotaMensual.create({
        data: {
          nombre: dto.nombre,
          cicloAnio: dto.cicloAnio,
          montoMensual: redondearDosDecimales(dto.montoMensual),
          diaVencimiento: dto.diaVencimiento,
          mesesHabilitadosJson: mesesUnicos,
          destinatarioTipo: dto.destinatarioTipo,
          unidadId: dto.unidadId ?? null,
          rubroId: rubroIdPlan,
          permiteDescuentoHermanos: dto.permiteDescuentoHermanos ?? true,
          porcentajeDescuentoHermanos:
            dto.porcentajeDescuentoHermanos !== undefined && dto.porcentajeDescuentoHermanos !== null
              ? redondearDosDecimales(dto.porcentajeDescuentoHermanos)
              : null,
          ...(excepcionesIds.length > 0
            ? {
                excepciones: {
                  create: excepcionesIds.map((usuarioId) => ({ usuarioId })),
                },
              }
            : {}),
        },
        include: {
          unidad: true,
          excepciones: { select: { usuarioId: true } },
        },
      });

      for (const m of mesesUnicos) {
        await this.sincronizarMesDePlanEnTx(tx, plan, m);
      }

      return serializarPlanCompat(plan);
    }, { timeout: 20000 });
  }

  async sincronizarMesesPlan(alcance: AlcanceAcceso, planId: number, dto: SincronizarMesesPlanDto) {
    if (alcance.tipo === 'PROPIO') throw new ForbiddenException();
    const plan = await this.prisma.planCuotaMensual.findUnique({
      where: { id: planId },
      include: {
        unidad: true,
        conceptos: true,
        excepciones: { select: { usuarioId: true } },
      },
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
        include: {
          unidad: true,
          excepciones: { select: { usuarioId: true } },
        },
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

      return serializarPlanCompat(planActualizado);
    }, { timeout: 20000 });
  }

  async editarPlanCuotaMensual(alcance: AlcanceAcceso, id: number, dto: EditarPlanCuotaMensualDto) {
    if (alcance.tipo === 'PROPIO') throw new ForbiddenException();
    const actual = await this.prisma.planCuotaMensual.findUnique({
      where: { id },
      include: {
        conceptos: true,
        excepciones: { select: { usuarioId: true } },
      },
    });
    if (!actual) throw new NotFoundException('Plan no encontrado');

    if (actual.unidadId) {
      assertUnidadEnAlcance(alcance, actual.unidadId);
    } else if (alcance.tipo !== 'GLOBAL') {
      throw new ForbiddenException();
    }

    if (dto.unidadId !== undefined) {
      assertUnidadEnAlcance(alcance, dto.unidadId);
    }

    const mesesFinales: number[] = dto.mesesHabilitados
      ? [...new Set(dto.mesesHabilitados)].sort((a, b) => a - b)
      : Array.isArray(actual.mesesHabilitadosJson)
        ? (actual.mesesHabilitadosJson as number[])
        : [];
    const mesesFinalesSet = new Set(mesesFinales);

    return this.prisma.$transaction(async (tx) => {
      if (dto.excepcionesIds !== undefined) {
        await this.reemplazarExcepcionesPlanEnTx(tx, id, dto.excepcionesIds);
      }

      const planActualizado = await tx.planCuotaMensual.update({
        where: { id },
        data: {
          nombre: dto.nombre,
          cicloAnio: dto.cicloAnio,
          montoMensual: dto.montoMensual !== undefined ? redondearDosDecimales(dto.montoMensual) : undefined,
          diaVencimiento: dto.diaVencimiento,
          mesesHabilitadosJson: mesesFinales,
          destinatarioTipo: dto.destinatarioTipo,
          unidadId: dto.unidadId !== undefined ? dto.unidadId : undefined,
          rubroId: dto.rubroId !== undefined ? dto.rubroId : undefined,
          permiteDescuentoHermanos: dto.permiteDescuentoHermanos,
          porcentajeDescuentoHermanos:
            dto.porcentajeDescuentoHermanos !== undefined
              ? dto.porcentajeDescuentoHermanos !== null
                ? redondearDosDecimales(dto.porcentajeDescuentoHermanos)
                : null
              : undefined,
        },
        include: {
          unidad: true,
          excepciones: { select: { usuarioId: true } },
        },
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

      return serializarPlanCompat(planActualizado);
    }, { timeout: 20000 });
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
    }, { timeout: 20000 });
  }

  async sincronizarMesDePlanEnTx(tx: Prisma.TransactionClient, plan: any, mesNum: number) {
    const nombreMes = NOMBRES_MESES[mesNum - 1] || `Mes ${mesNum}`;
    const ultimoDiaDelMes = new Date(Date.UTC(plan.cicloAnio, mesNum, 0)).getUTCDate();
    const diaReal = Math.min(plan.diaVencimiento || 10, ultimoDiaDelMes);
    const fechaVto = new Date(Date.UTC(plan.cicloAnio, mesNum - 1, diaReal));

    let concepto = await tx.conceptoCuota.findFirst({
      where: {
        planCuotaMensualId: plan.id,
        mes: mesNum,
      },
    });

    const excepcionesPlan = extraerExcepcionIds(plan);
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

    await this.reemplazarExcepcionesConceptoEnTx(tx, concepto.id, excepcionesPlan);

    await this.sincronizarCargosDeConceptoEnTx(tx, {
      ...concepto,
      excepciones: excepcionesPlan.map((usuarioId) => ({ usuarioId })),
    });
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

    const cargosWhere: Prisma.CargoMiembroWhereInput =
      alcance.tipo === 'UNIDAD' ? { usuario: filtroUsuariosPorAlcance(alcance) } : {};
    const usarGroupBy = typeof (this.prisma.cargoMiembro as any)?.groupBy === 'function';

    const conceptos = await this.prisma.conceptoCuota.findMany({
      where,
      orderBy: [{ cicloAnio: 'desc' }, { id: 'desc' }],
      take: 200,
      include: {
        unidad: { select: { id: true, nombre: true } },
        rubro: { select: { id: true, nombre: true } },
        excepciones: { select: { usuarioId: true } },
        _count: { select: { cargos: { where: cargosWhere } } },
        ...(usarGroupBy
          ? {}
          : {
              cargos: {
                where: cargosWhere,
                select: {
                  id: true,
                  montoFinal: true,
                  montoPagado: true,
                  estado: true,
                },
              },
            }),
      },
    });

    const metricasPorConcepto = usarGroupBy
      ? await this.obtenerMetricasPorConcepto(
          conceptos.map((c) => c.id),
          cargosWhere,
        )
      : null;

    return conceptos.map((c: any) => {
      const metrica = metricasPorConcepto?.get(c.id);
      return {
        ...serializarConceptoCompat(c),
        resumenRecaudacion: metrica ? metrica.resumen : calcularResumenRecaudacion(c.cargos || []),
      };
    });
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
    const excepcionesIds = this.normalizarIdsExcepcion(dto.excepcionesIds);
    const dataCreacion: Prisma.ConceptoCuotaCreateInput = {
      nombre: dto.nombre,
      tipo: dto.tipo ?? 'CAMPAMENTO',
      montoBase: redondearDosDecimales(dto.montoBase),
      cicloAnio: dto.cicloAnio,
      fechaVencimiento: dto.fechaVencimiento ? parsearFechaOperacion(dto.fechaVencimiento) : null,
      permiteDescuentoHermanos: dto.permiteDescuentoHermanos ?? true,
      porcentajeDescuentoHermanos:
        dto.porcentajeDescuentoHermanos !== undefined && dto.porcentajeDescuentoHermanos !== null
          ? redondearDosDecimales(dto.porcentajeDescuentoHermanos)
          : null,
      esParaEducadores: dto.esParaEducadores ?? destinatarioTipo === 'EDUCADORES',
      destinatarioTipo,
      mes: dto.mes ?? null,
      ...(dto.planCuotaMensualId ? { planCuotaMensual: { connect: { id: dto.planCuotaMensualId } } } : {}),
      ...(dto.unidadId ? { unidad: { connect: { id: dto.unidadId } } } : {}),
      ...(dto.rubroId ? { rubro: { connect: { id: dto.rubroId } } } : {}),
      ...(excepcionesIds.length > 0
        ? {
            excepciones: {
              create: excepcionesIds.map((usuarioId) => ({ usuarioId })),
            },
          }
        : {}),
    };
    const includeConcepto = {
      unidad: { select: { id: true, nombre: true } },
      excepciones: { select: { usuarioId: true } },
    };

    if (this.prisma.$transaction && dto.generarCargosInmediatos !== false && destinatarioTipo !== 'INDIVIDUAL') {
      return this.prisma.$transaction(async (tx) => {
        const concepto = await tx.conceptoCuota.create({
          data: dataCreacion,
          include: includeConcepto,
        });

        await this.sincronizarCargosDeConceptoEnTx(tx, concepto);
        return serializarConceptoCompat(concepto);
      });
    }

    const creado = await this.prisma.conceptoCuota.create({
      data: dataCreacion,
      include: includeConcepto,
    });
    return serializarConceptoCompat(creado);
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

    if (dto.unidadId !== undefined) {
      if (dto.unidadId === null) {
        if (alcance.tipo !== 'GLOBAL') {
          throw new ForbiddenException('Solo usuarios globales pueden convertir un concepto en general');
        }
      } else {
        assertUnidadEnAlcance(alcance, dto.unidadId);
      }
    }

    const data: Prisma.ConceptoCuotaUpdateInput = {};
    if (dto.nombre !== undefined) data.nombre = dto.nombre;
    if (dto.tipo !== undefined) data.tipo = dto.tipo;
    if (dto.montoBase !== undefined) data.montoBase = redondearDosDecimales(dto.montoBase);
    if (dto.cicloAnio !== undefined) data.cicloAnio = dto.cicloAnio;
    if (dto.fechaVencimiento !== undefined) {
      data.fechaVencimiento = dto.fechaVencimiento ? parsearFechaOperacion(dto.fechaVencimiento) : null;
    }
    if (dto.permiteDescuentoHermanos !== undefined) {
      data.permiteDescuentoHermanos = dto.permiteDescuentoHermanos;
    }
    if (dto.porcentajeDescuentoHermanos !== undefined) {
      data.porcentajeDescuentoHermanos =
        dto.porcentajeDescuentoHermanos !== null
          ? redondearDosDecimales(dto.porcentajeDescuentoHermanos)
          : null;
    }
    if (dto.esParaEducadores !== undefined) {
      data.esParaEducadores = dto.esParaEducadores;
    }
    if (dto.destinatarioTipo !== undefined) {
      data.destinatarioTipo = dto.destinatarioTipo;
      data.esParaEducadores = dto.destinatarioTipo === 'EDUCADORES';
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

    const includeConcepto = {
      unidad: { select: { id: true, nombre: true } },
      excepciones: { select: { usuarioId: true } },
    };

    if (this.prisma.$transaction && dto.sincronizarCargos !== false) {
      return this.prisma.$transaction(async (tx) => {
        if (dto.excepcionesIds !== undefined) {
          await this.reemplazarExcepcionesConceptoEnTx(tx, id, dto.excepcionesIds);
        }
        const actualizado = await tx.conceptoCuota.update({
          where: { id },
          data,
          include: includeConcepto,
        });
        await this.sincronizarCargosDeConceptoEnTx(tx, actualizado);
        return serializarConceptoCompat(actualizado);
      });
    }

    if (dto.excepcionesIds !== undefined) {
      await this.reemplazarExcepcionesConceptoEnTx(this.prisma as unknown as Prisma.TransactionClient, id, dto.excepcionesIds);
    }
    const actualizado = await this.prisma.conceptoCuota.update({
      where: { id },
      data,
      include: includeConcepto,
    });
    return serializarConceptoCompat(actualizado);
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

  async listarGruposFamiliares(alcance?: AlcanceAcceso) {
    if (alcance?.tipo === 'PROPIO') {
      throw new ForbiddenException('No tiene permisos para ver grupos familiares');
    }
    const where: Prisma.GrupoFamiliarWhereInput =
      alcance?.tipo === 'UNIDAD'
        ? {
            miembros: {
              some: {
                asignaciones: {
                  some: { activo: true, unidadId: { in: alcance.unidadIds } },
                },
              },
            },
          }
        : {};

    return this.prisma.grupoFamiliar.findMany({
      where,
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

  async actualizarDescuentoFamilia(alcance: AlcanceAcceso, id: number, dto: ActualizarDescuentoFamiliaDto) {
    if (alcance.tipo === 'PROPIO') throw new ForbiddenException('No puede modificar grupos familiares');

    const familiar = await this.prisma.grupoFamiliar.findUnique({
      where: { id },
      include: {
        miembros: {
          select: {
            id: true,
            asignaciones: { where: { activo: true }, select: { unidadId: true } },
          },
        },
      },
    });
    if (!familiar) throw new NotFoundException('Grupo familiar no encontrado');

    if (alcance.tipo === 'UNIDAD') {
      const tieneMiembroEnAlcance = familiar.miembros.some((m) =>
        m.asignaciones.some((a) => alcance.unidadIds.includes(a.unidadId)),
      );
      if (!tieneMiembroEnAlcance) {
        throw new ForbiddenException('El grupo familiar no tiene miembros dentro de su unidad');
      }
      const tieneMiembroFueraDeAlcance = familiar.miembros.some(
        (m) =>
          m.asignaciones.length > 0 &&
          !m.asignaciones.some((a) => alcance.unidadIds.includes(a.unidadId)),
      );
      if (tieneMiembroFueraDeAlcance) {
        throw new ForbiddenException(
          'El grupo familiar incluye integrantes de otras secciones; requiere alcance global',
        );
      }
    }

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

  async vincularHermano(alcance: AlcanceAcceso, dto: VincularHermanoDto) {
    if (alcance.tipo === 'PROPIO') throw new ForbiddenException('No puede vincular hermanos');

    const usuario = await this.prisma.usuario.findUnique({
      where: { id: dto.usuarioId },
      select: {
        id: true,
        activo: true,
        apellido: true,
        grupoFamiliarId: true,
        datosFijosJson: true,
        asignaciones: { where: { activo: true }, select: { unidadId: true } },
      },
    });
    if (!usuario) throw new NotFoundException('Miembro no encontrado');
    if (usuario.activo === false) {
      throw new BadRequestException('No se puede vincular a un miembro dado de baja o inactivo');
    }

    if (alcance.tipo === 'UNIDAD') {
      const enUnidad = usuario.asignaciones.some((a) => alcance.unidadIds.includes(a.unidadId));
      if (!enUnidad) throw new ForbiddenException('El miembro no pertenece a su unidad');
    }

    const hermano = await this.prisma.usuario.findUnique({
      where: { dni: dto.hermanoDni },
      select: {
        id: true,
        activo: true,
        apellido: true,
        grupoFamiliarId: true,
        datosFijosJson: true,
        asignaciones: { where: { activo: true }, select: { unidadId: true } },
      },
    });
    if (!hermano) throw new NotFoundException(`No existe un miembro registrado con el DNI ${dto.hermanoDni}`);
    if (hermano.activo === false) {
      throw new BadRequestException(`El miembro con DNI ${dto.hermanoDni} se encuentra inactivo`);
    }
    if (alcance.tipo === 'UNIDAD' && hermano.asignaciones?.length) {
      const hermanoEnUnidad = hermano.asignaciones.some((a) => alcance.unidadIds.includes(a.unidadId));
      if (!hermanoEnUnidad) {
        throw new ForbiddenException(
          'Solo usuarios con alcance global pueden vincular hermanos de distintas secciones',
        );
      }
    }
    if (hermano.id === usuario.id) throw new BadRequestException('No puede vincular a un miembro consigo mismo');
    if (usuario.grupoFamiliarId && usuario.grupoFamiliarId === hermano.grupoFamiliarId) {
      throw new BadRequestException('Este miembro ya pertenece a ese grupo familiar');
    }

    const datosUsuario = ((usuario.datosFijosJson ?? {}) as Record<string, unknown>);
    const datosHermano = ((hermano.datosFijosJson ?? {}) as Record<string, unknown>);
    const mergedUsuario = { ...datosUsuario };
    const mergedHermano = { ...datosHermano };

    for (const clave of CLAVES_FAMILIARES_ESTANDAR) {
      const valU = asTrimmedString(mergedUsuario[clave]);
      const valH = asTrimmedString(mergedHermano[clave]);
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
        if (tx.grupoFamiliar?.findMany && tx.grupoFamiliar?.update) {
          const grupos = await tx.grupoFamiliar.findMany({
            where: { id: { in: [usuario.grupoFamiliarId, hermano.grupoFamiliarId] } },
            select: { id: true, porcentajeDescuentoHermanos: true },
          });
          const gUsuario = grupos.find((g) => g.id === usuario.grupoFamiliarId);
          const gHermano = grupos.find((g) => g.id === hermano.grupoFamiliarId);
          const pctUsuario = Number(gUsuario?.porcentajeDescuentoHermanos ?? 0);
          const pctHermano = Number(gHermano?.porcentajeDescuentoHermanos ?? 0);
          if (pctHermano > pctUsuario) {
            await tx.grupoFamiliar.update({
              where: { id: usuario.grupoFamiliarId },
              data: { porcentajeDescuentoHermanos: new Prisma.Decimal(pctHermano) },
            });
          }
        }
        await tx.usuario.updateMany({
          where: { grupoFamiliarId: hermano.grupoFamiliarId },
          data: { grupoFamiliarId: usuario.grupoFamiliarId },
        });
        if (tx.grupoFamiliar?.deleteMany) {
          await tx.grupoFamiliar.deleteMany({ where: { id: hermano.grupoFamiliarId } });
        } else {
          await tx.grupoFamiliar.delete({ where: { id: hermano.grupoFamiliarId } });
        }
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

  async desvincularHermano(alcance: AlcanceAcceso, dto: DesvincularHermanoDto) {
    if (alcance.tipo === 'PROPIO') throw new ForbiddenException('No puede desvincular hermanos');

    const usuario = await this.prisma.usuario.findUnique({
      where: { id: dto.usuarioId },
      select: {
        id: true,
        grupoFamiliarId: true,
        asignaciones: { where: { activo: true }, select: { unidadId: true } },
      },
    });
    if (!usuario) throw new NotFoundException('Miembro no encontrado');
    if (!usuario.grupoFamiliarId) {
      throw new BadRequestException('El miembro no pertenece a ningún grupo familiar');
    }

    if (alcance.tipo === 'UNIDAD') {
      const enUnidad = usuario.asignaciones.some((a) => alcance.unidadIds.includes(a.unidadId));
      if (!enUnidad) throw new ForbiddenException('El miembro no pertenece a su unidad');
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
        if (tx.grupoFamiliar?.deleteMany) {
          await tx.grupoFamiliar.deleteMany({ where: { id: grupoIdAnterior } });
        } else {
          await tx.grupoFamiliar.delete({ where: { id: grupoIdAnterior } });
        }
      }

      return { mensaje: 'Miembro desvinculado del grupo familiar y cuotas recalculadas.' };
    });
  }

  async eliminarGrupoFamiliar(alcance: AlcanceAcceso, id: number) {
    if (alcance.tipo === 'PROPIO') throw new ForbiddenException('No puede eliminar grupos familiares');

    const grupo = await this.prisma.grupoFamiliar.findUnique({
      where: { id },
      include: {
        miembros: {
          select: {
            id: true,
            asignaciones: { where: { activo: true }, select: { unidadId: true } },
          },
        },
      },
    });
    if (!grupo) throw new NotFoundException('Grupo familiar no encontrado');

    if (alcance.tipo === 'UNIDAD') {
      const tieneMiembroEnAlcance = grupo.miembros.some((m) =>
        m.asignaciones.some((a) => alcance.unidadIds.includes(a.unidadId)),
      );
      if (!tieneMiembroEnAlcance) {
        throw new ForbiddenException('El grupo familiar no tiene miembros dentro de su unidad');
      }
      const tieneMiembroFueraDeAlcance = grupo.miembros.some(
        (m) =>
          m.asignaciones.length > 0 &&
          !m.asignaciones.some((a) => alcance.unidadIds.includes(a.unidadId)),
      );
      if (tieneMiembroFueraDeAlcance) {
        throw new ForbiddenException(
          'El grupo familiar incluye integrantes de otras secciones; requiere alcance global',
        );
      }
    }

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
      include: {
        unidad: true,
        excepciones: { select: { usuarioId: true } },
      },
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

    const excepcionesConcepto = extraerExcepcionIds(concepto);
    const excluirIds = [...new Set([...(dto.excluirUsuarioIds ?? []), ...excepcionesConcepto])];

    const rolFiltro = construirFiltroRol(concepto.destinatarioTipo, concepto.esParaEducadores);
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
                rol: { tipoMiembro: 'PROTAGONISTA' },
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
        const { montoOriginal, montoDescuento, montoFinal } = calcularMontosCargo(
          montoBaseNum,
          permiteDesc,
          concepto.porcentajeDescuentoHermanos,
          u.grupoFamiliar,
        );
        const nuevoFinalNum = Number(montoFinal);
        const estadoInicial = nuevoFinalNum <= 0 ? EstadoCargo.PAGADO : EstadoCargo.PENDIENTE;

        const cargo = await tx.cargoMiembro.create({
          data: {
            usuarioId: u.id,
            conceptoId: concepto.id,
            montoOriginal,
            montoDescuento,
            montoFinal,
            montoPagado: new Prisma.Decimal(0),
            estado: estadoInicial,
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
    }, { timeout: 20000 });
  }

  async generarCargoIndividual(actor: AuthUser, alcance: AlcanceAcceso, dto: GenerarCargoIndividualDto) {
    if (alcance.tipo === 'PROPIO') {
      throw new ForbiddenException('No tiene permisos para generar cargos');
    }

    if (dto.montoDescuento !== undefined && dto.montoDescuento > dto.monto) {
      throw new BadRequestException('El descuento no puede superar el monto original');
    }

    const usuario = await this.prisma.usuario.findUnique({
      where: { id: dto.usuarioId },
      include: { asignaciones: { where: { activo: true }, select: { unidadId: true } } },
    });
    if (!usuario) throw new NotFoundException('Miembro no encontrado');
    if (usuario.activo === false) {
      throw new BadRequestException('No se pueden generar cargos para un miembro inactivo');
    }

    if (alcance.tipo === 'UNIDAD') {
      const unidadesMiembro = usuario.asignaciones.map((a) => a.unidadId);
      const tieneUnidad = unidadesMiembro.some((uId) => alcance.unidadIds.includes(uId));
      if (!tieneUnidad) throw new ForbiddenException('El miembro no pertenece a su unidad');
    }

    if (dto.conceptoId) {
      const conceptoExistente = await this.prisma.conceptoCuota.findUnique({
        where: { id: dto.conceptoId },
      });
      if (!conceptoExistente) throw new NotFoundException('Concepto no encontrado');
      if (conceptoExistente.unidadId) {
        assertUnidadEnAlcance(alcance, conceptoExistente.unidadId);
      }
    }

    const originalCts = aCentavos(dto.monto);
    const descuentoCts = aCentavos(dto.montoDescuento ?? 0);
    const nuevoFinalCts = Math.max(0, originalCts - descuentoCts);
    const montoOriginal = centavosADecimal(originalCts);
    const montoDescuento = centavosADecimal(descuentoCts);
    const montoFinal = centavosADecimal(nuevoFinalCts);
    const estadoInicial = nuevoFinalCts <= 0 ? EstadoCargo.PAGADO : EstadoCargo.PENDIENTE;

    return this.prisma.$transaction(async (tx) => {
      let conceptoId = dto.conceptoId;
      if (!conceptoId) {
        const nombreConcepto = dto.nombreConcepto?.trim() || 'Cargo Individual Extraordinario';
        const unidadIdConcepto =
          alcance.tipo === 'UNIDAD'
            ? (usuario.asignaciones.find((a) => alcance.unidadIds.includes(a.unidadId))?.unidadId ??
              alcance.unidadIds[0])
            : undefined;

        const conceptoNuevo = await tx.conceptoCuota.create({
          data: {
            nombre: nombreConcepto,
            tipo: dto.tipo ?? 'OTRO',
            montoBase: new Prisma.Decimal(dto.monto),
            cicloAnio: dto.cicloAnio ?? anioActual(),
            fechaVencimiento: dto.fechaVencimiento ? parsearFechaOperacion(dto.fechaVencimiento) : null,
            permiteDescuentoHermanos: false,
            destinatarioTipo: 'INDIVIDUAL',
            ...(unidadIdConcepto ? { unidadId: unidadIdConcepto } : {}),
          },
        });
        conceptoId = conceptoNuevo.id;
      }

      return tx.cargoMiembro.create({
        data: {
          usuarioId: dto.usuarioId,
          conceptoId,
          montoOriginal,
          montoDescuento,
          montoFinal,
          montoPagado: new Prisma.Decimal(0),
          estado: estadoInicial,
        },
        include: {
          concepto: true,
          usuario: { select: { id: true, nombre: true, apellido: true, dni: true } },
        },
      });
    });
  }

  async editarCargoIndividual(alcance: AlcanceAcceso, id: number, dto: EditarCargoIndividualDto) {
    if (alcance.tipo === 'PROPIO') throw new ForbiddenException();
    if (dto.montoDescuento > dto.montoOriginal) {
      throw new BadRequestException('El descuento no puede superar el monto original');
    }

    const originalCts = aCentavos(dto.montoOriginal);
    const descuentoCts = aCentavos(dto.montoDescuento);
    const nuevoFinalCts = Math.max(0, originalCts - descuentoCts);
    const montoOriginal = centavosADecimal(originalCts);
    const montoDescuento = centavosADecimal(descuentoCts);
    const montoFinal = centavosADecimal(nuevoFinalCts);

    return this.prisma.$transaction(async (tx) => {
      await lockFilasPorIds(tx, 'cargos_miembro', [id]);

      const cargo = await tx.cargoMiembro.findUnique({
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
              ? { fechaVencimiento: dto.fechaVencimiento ? parsearFechaOperacion(dto.fechaVencimiento) : null }
              : {}),
          },
        });
      }

      const pagadoActualCts = aCentavos(cargo.montoPagado);
      const nuevoFinalCts = aCentavos(montoFinal);
      let montoPagadoFinal = cargo.montoPagado;
      let nuevoEstado = cargo.estado;

      if (cargo.estado !== EstadoCargo.ANULADO) {
        if (pagadoActualCts > nuevoFinalCts) {
          const excesoCts = pagadoActualCts - nuevoFinalCts;
          await liberarMontoPagadoDeCargoEnTx(tx, cargo.id, cargo.usuarioId, deCentavos(excesoCts));
          montoPagadoFinal = montoFinal;
          nuevoEstado = EstadoCargo.PAGADO;
        } else {
          nuevoEstado = calcularEstadoCargo(cargo.estado, cargo.montoPagado, montoFinal);
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

    const ejecutar = async (tx: Prisma.TransactionClient | PrismaService) => {
      await lockFilasPorIds(tx as Prisma.TransactionClient, 'cargos_miembro', [id]);

      const cargo = await tx.cargoMiembro.findUnique({
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

      if (cargo.estado === EstadoCargo.ANULADO) {
        throw new ConflictException('El cargo ya se encuentra anulado');
      }

      const pagado = Number(cargo.montoPagado);
      if (pagado > 0) {
        await liberarMontoPagadoDeCargoEnTx(tx as Prisma.TransactionClient, cargo.id, cargo.usuario.id, pagado);
      }

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
    };

    return this.prisma.$transaction ? this.prisma.$transaction(ejecutar) : ejecutar(this.prisma);
  }

  /**
   * Reactiva un cargo que había sido anulado, volviéndolo a estado PENDIENTE (o PAGADO si su monto final es 0).
   */
  async reactivarCargo(alcance: AlcanceAcceso, id: number) {
    if (alcance.tipo === 'PROPIO') throw new ForbiddenException();

    const ejecutar = async (tx: Prisma.TransactionClient | PrismaService) => {
      await lockFilasPorIds(tx as Prisma.TransactionClient, 'cargos_miembro', [id]);

      const cargo = await tx.cargoMiembro.findUnique({
        where: { id },
        include: {
          concepto: true,
          usuario: {
            select: {
              id: true,
              activo: true,
              grupoFamiliar: true,
              asignaciones: { where: { activo: true }, select: { unidadId: true } },
            },
          },
        },
      });
      if (!cargo) throw new NotFoundException('Cargo no encontrado');
      if (cargo.usuario.activo === false) {
        throw new BadRequestException('No se pueden reactivar cargos de un miembro inactivo');
      }

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
        const calc = calcularMontosCargo(
          Number(cargo.concepto.montoBase),
          cargo.concepto.permiteDescuentoHermanos ?? true,
          cargo.concepto.porcentajeDescuentoHermanos,
          cargo.usuario.grupoFamiliar,
        );
        montoOriginal = calc.montoOriginal;
        montoDescuento = calc.montoDescuento;
        montoFinal = calc.montoFinal;
      }

      const nuevoEstado = Number(montoFinal) <= 0 ? EstadoCargo.PAGADO : EstadoCargo.PENDIENTE;

      return tx.cargoMiembro.update({
        where: { id },
        data: {
          montoOriginal,
          montoDescuento,
          montoFinal,
          montoPagado: new Prisma.Decimal(0),
          estado: nuevoEstado,
        },
        include: {
          concepto: true,
          usuario: { select: { id: true, nombre: true, apellido: true, dni: true } },
        },
      });
    };

    return this.prisma.$transaction ? this.prisma.$transaction(ejecutar) : ejecutar(this.prisma);
  }

  /**
   * Elimina definitivamente un cargo individual. Si tenía pagos, pasan a Saldo a Favor.
   */
  async eliminarCargo(alcance: AlcanceAcceso, id: number) {
    if (alcance.tipo === 'PROPIO') throw new ForbiddenException();

    return this.prisma.$transaction(async (tx) => {
      await lockFilasPorIds(tx, 'cargos_miembro', [id]);

      const cargo = await tx.cargoMiembro.findUnique({
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

      const pagado = Number(cargo.montoPagado);
      if (pagado > 0) {
        await liberarMontoPagadoDeCargoEnTx(tx, cargo.id, cargo.usuario.id, pagado);
      }

      // Si el miembro pertenece a un concepto grupal y se elimina su cargo, registrarlo como excepción relacional atómicamente
      if (cargo.concepto && cargo.concepto.destinatarioTipo !== 'INDIVIDUAL') {
        if ((tx as any).conceptoExcepcion?.createMany) {
          await (tx as any).conceptoExcepcion.createMany({
            data: [{ conceptoId: cargo.conceptoId, usuarioId: cargo.usuario.id }],
            skipDuplicates: true,
          });
        }
      }

      await tx.cargoMiembro.delete({ where: { id } });

      // Si era un concepto individual exclusivo, borrar también el concepto huérfano sin ocultar errores en tx
      if (cargo.concepto?.destinatarioTipo === 'INDIVIDUAL') {
        if (tx.conceptoCuota?.deleteMany) {
          await tx.conceptoCuota.deleteMany({
            where: { id: cargo.conceptoId, cargos: { none: {} } },
          });
        } else {
          await tx.conceptoCuota.delete({ where: { id: cargo.conceptoId } });
        }
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

    let totalOriginalCts = 0;
    let totalDescuentoCts = 0;
    let totalFinalCts = 0;
    let totalPagadoCts = 0;

    for (const c of cargos) {
      totalOriginalCts += aCentavos(c.montoOriginal);
      totalDescuentoCts += aCentavos(c.montoDescuento);
      totalFinalCts += aCentavos(c.montoFinal);
      totalPagadoCts += aCentavos(c.montoPagado);
    }

    const saldoPendienteCts = Math.max(0, totalFinalCts - totalPagadoCts);

    return {
      usuario,
      resumen: {
        totalCargos: cargos.length,
        totalAnulados: cargosAnulados.length,
        totalOriginal: deCentavos(totalOriginalCts),
        totalDescuento: deCentavos(totalDescuentoCts),
        totalFinal: deCentavos(totalFinalCts),
        totalPagado: deCentavos(totalPagadoCts),
        saldoPendiente: deCentavos(saldoPendienteCts),
        saldoAFavor: deCentavos(aCentavos(usuario.saldoAFavor ?? 0)),
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

    const cargoIds = dto.imputaciones.map((i) => i.cargoId);
    if (new Set(cargoIds).size !== cargoIds.length) {
      throw new BadRequestException('No se permiten cargos duplicados en las imputaciones');
    }

    const sumaImputacionesCts = dto.imputaciones.reduce((acc, curr) => acc + aCentavos(curr.monto), 0);
    const montoTotalCts = aCentavos(dto.montoTotal);
    const montoTotalRedondeado = deCentavos(montoTotalCts);

    return this.prisma.$transaction(async (tx) => {
      await lockFilasPorIds(tx, 'cargos_miembro', cargoIds);

      let targetUsuarioId = dto.usuarioId;
      if (!targetUsuarioId && dto.imputaciones.length > 0) {
        const primerCargo = await tx.cargoMiembro.findUnique({
          where: { id: dto.imputaciones[0].cargoId },
          select: { usuarioId: true },
        });
        if (primerCargo) {
          targetUsuarioId = primerCargo.usuarioId;
        }
      }

      if (targetUsuarioId) {
        await lockFilasPorIds(tx, 'usuarios', [targetUsuarioId]);
      }

      let saldoDisponibleCts = 0;
      let targetUsuario: any = null;

      if (targetUsuarioId && tx.usuario?.findUnique) {
        targetUsuario = await tx.usuario.findUnique({
          where: { id: targetUsuarioId },
          include: {
            asignaciones: { where: { activo: true }, select: { unidadId: true } },
          },
        });
        if (targetUsuario) {
          saldoDisponibleCts = aCentavos(targetUsuario.saldoAFavor);
          if (alcance.tipo === 'UNIDAD') {
            const uIds = targetUsuario.asignaciones.map((a: any) => a.unidadId);
            if (!uIds.some((uid: number) => alcance.unidadIds.includes(uid))) {
              throw new ForbiddenException('El miembro no pertenece a su unidad');
            }
          }
        }
      }

      // Calcular cuánto saldo a favor se usa en este cobro unificado
      let saldoAAplicarCts = 0;
      if (dto.usarSaldoAFavor && sumaImputacionesCts > 0) {
        const pedidoCts =
          dto.montoSaldoAFavor !== undefined
            ? aCentavos(dto.montoSaldoAFavor)
            : Math.min(saldoDisponibleCts, sumaImputacionesCts);
        saldoAAplicarCts = Math.max(0, Math.min(pedidoCts, saldoDisponibleCts, sumaImputacionesCts));
      }

      const requeridoEnCajaCts = Math.max(0, sumaImputacionesCts - saldoAAplicarCts);
      const requeridoEnCaja = deCentavos(requeridoEnCajaCts);

      if (montoTotalCts < requeridoEnCajaCts) {
        throw new BadRequestException(
          `El monto recibido ($${montoTotalRedondeado}) no puede ser inferior al saldo a cubrir ($${requeridoEnCaja})`,
        );
      }

      if (sumaImputacionesCts === 0 && montoTotalCts <= 0) {
        throw new BadRequestException('Debe indicar un monto a pagar o seleccionar al menos una cuota a cancelar');
      }
      if (dto.imputaciones.length === 0 && !targetUsuarioId) {
        throw new BadRequestException('Debe indicar un miembro titular o al menos una cuota a imputar');
      }

      const excedenteCts = Math.max(0, montoTotalCts - requeridoEnCajaCts);
      const saldoAAplicar = deCentavos(saldoAAplicarCts);
      const excedente = deCentavos(excedenteCts);

      // 1. Si se aplicó Saldo a Favor, descontarlo atómicamente antes de mutar cargos
      if (saldoAAplicarCts > 0 && targetUsuarioId) {
        let count = 1;
        const saldoDec = centavosADecimal(saldoAAplicarCts);
        if (tx.usuario?.updateMany) {
          const resSaldo = await tx.usuario.updateMany({
            where: {
              id: targetUsuarioId,
              saldoAFavor: { gte: saldoDec },
            },
            data: {
              saldoAFavor: { decrement: saldoDec },
            },
          });
          count = resSaldo.count;
        } else if (tx.usuario?.update) {
          await tx.usuario.update({
            where: { id: targetUsuarioId },
            data: { saldoAFavor: { decrement: saldoDec } },
          });
        }
        if (count === 0) {
          throw new BadRequestException('Saldo a favor insuficiente para aplicar a este cobro');
        }
      }

      // Validar y actualizar cada cargo imputado
      const imputacionesSaldo: Array<{ cargoId: number; montoCts: number }> = [];
      const imputacionesCaja: Array<{ cargoId: number; montoCts: number }> = [];
      let saldoRestanteCts = saldoAAplicarCts;

      for (const imp of dto.imputaciones) {
        const cargo = await tx.cargoMiembro.findUnique({
          where: { id: imp.cargoId },
          include: {
            usuario: {
              select: {
                id: true,
                grupoFamiliarId: true,
                asignaciones: { where: { activo: true }, select: { unidadId: true } },
              },
            },
          },
        });
        if (!cargo) throw new NotFoundException(`Cargo con ID ${imp.cargoId} no encontrado`);

        if (!targetUsuarioId) {
          targetUsuarioId = cargo.usuario.id;
        }

        if (targetUsuarioId) {
          const mismoUsuario = cargo.usuario.id === targetUsuarioId;
          const mismaFamilia =
            Boolean(targetUsuario?.grupoFamiliarId) &&
            Boolean(cargo.usuario.grupoFamiliarId) &&
            cargo.usuario.grupoFamiliarId === targetUsuario.grupoFamiliarId;

          if (!mismoUsuario && !mismaFamilia) {
            throw new BadRequestException(
              `El cargo #${imp.cargoId} no pertenece al titular ni a su grupo familiar`,
            );
          }
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

        const saldoPendienteCts = Math.max(0, aCentavos(cargo.montoFinal) - aCentavos(cargo.montoPagado));
        const impCts = aCentavos(imp.monto);

        if (impCts > saldoPendienteCts) {
          throw new BadRequestException(
            `El monto a imputar ($${deCentavos(impCts)}) supera el saldo pendiente ($${deCentavos(saldoPendienteCts)}) del cargo #${cargo.id}`,
          );
        }

        const nuevoPagadoCts = aCentavos(cargo.montoPagado) + impCts;
        const nuevoEstado =
          nuevoPagadoCts >= aCentavos(cargo.montoFinal) ? EstadoCargo.PAGADO : EstadoCargo.PARCIAL;

        await tx.cargoMiembro.update({
          where: { id: cargo.id },
          data: {
            montoPagado: centavosADecimal(nuevoPagadoCts),
            estado: nuevoEstado,
          },
        });

        // Distribuir entre el pago por Saldo a Favor y el pago en Caja
        if (saldoRestanteCts > 0) {
          const porSaldoCts = Math.min(saldoRestanteCts, impCts);
          if (porSaldoCts > 0) {
            imputacionesSaldo.push({ cargoId: imp.cargoId, montoCts: porSaldoCts });
            saldoRestanteCts -= porSaldoCts;
          }
          const porCajaCts = impCts - porSaldoCts;
          if (porCajaCts > 0) {
            imputacionesCaja.push({ cargoId: imp.cargoId, montoCts: porCajaCts });
          }
        } else {
          imputacionesCaja.push({ cargoId: imp.cargoId, montoCts: impCts });
        }
      }

      // 2. Si se aplicó Saldo a Favor, registrar el comprobante de pago interno
      let pagoSaldoCreado: any = null;
      if (saldoAAplicarCts > 0 && targetUsuarioId) {
        pagoSaldoCreado = await tx.pago.create({
          data: {
            montoTotal: centavosADecimal(saldoAAplicarCts),
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
                montoImputado: centavosADecimal(imp.montoCts),
              })),
            },
          },
        });
      }

      // 2. Si hubo excedente (o pago a cuenta / adelanto), acreditarlo en el saldo a favor
      if (excedenteCts > 0 && targetUsuarioId) {
        await tx.usuario.update({
          where: { id: targetUsuarioId },
          data: {
            saldoAFavor: { increment: centavosADecimal(excedenteCts) },
          },
        });
      }

      // 3. Crear el registro de pago de caja (si montoTotalRedondeado > 0 o si no hubo uso de saldo)
      if (montoTotalCts > 0 || !pagoSaldoCreado) {
        const pago = await tx.pago.create({
          data: {
            montoTotal: centavosADecimal(montoTotalCts),
            metodoPago: dto.metodoPago,
            referenciaComprobante: dto.referenciaComprobante,
            observaciones:
              imputacionesCaja.length === 0 && excedenteCts > 0
                ? dto.observaciones || 'Pago a cuenta (Adelanto a Saldo a Favor)'
                : dto.observaciones,
            registradoPorUsuarioId: actor.sub,
            usuarioId: targetUsuarioId ?? null,
            imputaciones: {
              create: imputacionesCaja.map((imp) => ({
                cargoId: imp.cargoId,
                montoImputado: centavosADecimal(imp.montoCts),
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
                montoIngreso: centavosADecimal(montoTotalCts),
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
      const fechaOp = dto.fechaPago !== undefined ? parsearFechaOperacion(dto.fechaPago) : undefined;
      const pagoActualizado = await tx.pago.update({
        where: { id },
        data: {
          ...(dto.metodoPago !== undefined ? { metodoPago: dto.metodoPago } : {}),
          ...(dto.referenciaComprobante !== undefined ? { referenciaComprobante: dto.referenciaComprobante } : {}),
          ...(dto.observaciones !== undefined ? { observaciones: dto.observaciones } : {}),
          ...(fechaOp !== undefined ? { fechaPago: fechaOp } : {}),
        },
      });

      if (fechaOp !== undefined) {
        await tx.movimientoFinanciero.updateMany({
          where: { pagoId: id },
          data: {
            fecha: fechaOp,
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

    return this.prisma.$transaction(async (tx) => {
      await lockFilasPorIds(tx, 'pagos', [id]);

      const findPago = tx.pago?.findUnique
        ? tx.pago.findUnique.bind(tx.pago)
        : this.prisma.pago.findUnique.bind(this.prisma.pago);

      const pago = await findPago({
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
        const uIds = titular.asignaciones.map((a: any) => a.unidadId);
        if (!uIds.some((uId: number) => alcance.unidadIds.includes(uId))) {
          throw new ForbiddenException('El pago pertenece a un miembro fuera de su unidad');
        }
      }

      const targetUsuarioId = titular?.id;
      await lockFilasPorIds(tx, 'usuarios', [targetUsuarioId]);
      await lockFilasPorIds(
        tx,
        'cargos_miembro',
        pago.imputaciones.map((imp: any) => imp.cargoId),
      );

      let sumaImputadaCts = 0;

      // 1. Revertir cada imputación sobre los cargos
      for (const imp of pago.imputaciones) {
        const montoImpCts = aCentavos(imp.montoImputado);
        sumaImputadaCts += montoImpCts;
        await descontarMontoCargoEnTx(tx, imp.cargoId, deCentavos(montoImpCts));
      }

      const pagoTotalCts = aCentavos(pago.montoTotal);

      // 2. Revertir impacto en Saldo a Favor
      if (targetUsuarioId) {
        if (pago.referenciaComprobante === 'APLICACION_SALDO_A_FAVOR') {
          const devolverASaldoCts = Math.max(sumaImputadaCts, pagoTotalCts);
          if (devolverASaldoCts > 0) {
            await tx.usuario.update({
              where: { id: targetUsuarioId },
              data: {
                saldoAFavor: { increment: centavosADecimal(devolverASaldoCts) },
              },
            });
          }
        } else {
          const excedenteGeneradoCts = Math.max(0, pagoTotalCts - sumaImputadaCts);
          if (excedenteGeneradoCts > 0) {
            const usuarioFresca = await tx.usuario.findUnique({ where: { id: targetUsuarioId } });
            const saldoActualCts = aCentavos(usuarioFresca?.saldoAFavor ?? 0);

            if (saldoActualCts >= excedenteGeneradoCts) {
              await tx.usuario.update({
                where: { id: targetUsuarioId },
                data: {
                  saldoAFavor: { decrement: centavosADecimal(excedenteGeneradoCts) },
                },
              });
            } else {
              // El miembro ya había usado parte de ese excedente en otra cuota:
              // dejamos su saldoAFavor en 0 y revertimos la diferencia de sus aplicaciones de saldo más recientes
              let faltanteRevertirCts = excedenteGeneradoCts - saldoActualCts;
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
                if (faltanteRevertirCts <= 0) break;
                for (const impApp of app.imputaciones) {
                  if (faltanteRevertirCts <= 0) break;
                  const impAppCts = aCentavos(impApp.montoImputado);
                  const quitarCts = Math.min(faltanteRevertirCts, impAppCts);
                  await descontarMontoCargoEnTx(tx, impApp.cargoId, deCentavos(quitarCts));

                  if (quitarCts >= impAppCts) {
                    await tx.pagoImputacion.delete({ where: { id: impApp.id } });
                  } else {
                    await tx.pagoImputacion.update({
                      where: { id: impApp.id },
                      data: { montoImputado: centavosADecimal(impAppCts - quitarCts) },
                    });
                  }
                  faltanteRevertirCts -= quitarCts;
                }

                const impsRestantes = await tx.pagoImputacion.findMany({ where: { pagoId: app.id } });
                if (impsRestantes.length === 0) {
                  await tx.pago.delete({ where: { id: app.id } });
                } else {
                  const nuevoTotalAppCts = impsRestantes.reduce(
                    (acc, cur) => acc + aCentavos(cur.montoImputado),
                    0,
                  );
                  await tx.pago.update({
                    where: { id: app.id },
                    data: { montoTotal: centavosADecimal(nuevoTotalAppCts) },
                  });
                }
              }
            }
          }
        }
      }

      // 3. Validar y eliminar movimientos financieros asociados al pago
      if (tx.movimientoFinanciero) {
        if (tx.movimientoFinanciero.findMany) {
          const movsFinancieros = await tx.movimientoFinanciero.findMany({
            where: { pagoId: pago.id },
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
            const impactoEgreso = Number(mov.montoIngreso);
            if (impactoEgreso > 0) {
              await assertSaldoCuentaDisponibleEnTx(
                tx,
                mov.cuentaId,
                impactoEgreso,
                (saldoDisponible) =>
                  `No se puede revertir el pago porque la cuenta ${mov.cuenta?.nombre ?? mov.cuentaId} no tiene saldo suficiente para devolver los fondos ($${saldoDisponible} disponibles vs $${impactoEgreso} a revertir).`,
              );
            }
          }
        }

        if (tx.movimientoFinanciero.deleteMany) {
          await tx.movimientoFinanciero.deleteMany({
            where: { pagoId: pago.id },
          });
        }
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

    const cargoIds = dto.imputaciones.map((i) => i.cargoId);
    if (new Set(cargoIds).size !== cargoIds.length) {
      throw new BadRequestException('No se permiten cargos duplicados en las imputaciones');
    }

    const sumaCts = dto.imputaciones.reduce((acc, curr) => acc + aCentavos(curr.monto), 0);
    const sumaRedondeada = deCentavos(sumaCts);

    return this.prisma.$transaction(async (tx) => {
      await lockFilasPorIds(tx, 'usuarios', [dto.usuarioId]);
      await lockFilasPorIds(tx, 'cargos_miembro', cargoIds);

      const findUsuario = tx.usuario?.findUnique
        ? tx.usuario.findUnique.bind(tx.usuario)
        : this.prisma.usuario.findUnique.bind(this.prisma.usuario);

      const usuario = await findUsuario({
        where: { id: dto.usuarioId },
        include: { asignaciones: { where: { activo: true }, select: { unidadId: true } } },
      });
      if (!usuario) throw new NotFoundException('Miembro no encontrado');

      if (alcance.tipo === 'UNIDAD') {
        const unidadesMiembro = usuario.asignaciones.map((a: any) => a.unidadId);
        const tieneUnidad = unidadesMiembro.some((uId: number) => alcance.unidadIds.includes(uId));
        if (!tieneUnidad) throw new ForbiddenException('El miembro no pertenece a su unidad');
      }

      const saldoDisponibleCts = aCentavos(usuario.saldoAFavor);
      const saldoDisponible = deCentavos(saldoDisponibleCts);
      if (sumaCts > saldoDisponibleCts) {
        throw new BadRequestException(
          `Saldo a favor insuficiente. Disponible: $${saldoDisponible.toFixed(2)}, Requerido: $${sumaRedondeada.toFixed(2)}`,
        );
      }

      let count = 1;
      const sumaDec = centavosADecimal(sumaCts);
      if (tx.usuario?.updateMany) {
        const resSaldo = await tx.usuario.updateMany({
          where: {
            id: dto.usuarioId,
            saldoAFavor: { gte: sumaDec },
          },
          data: {
            saldoAFavor: { decrement: sumaDec },
          },
        });
        count = resSaldo.count;
      } else if (tx.usuario?.update) {
        await tx.usuario.update({
          where: { id: dto.usuarioId },
          data: { saldoAFavor: { decrement: sumaDec } },
        });
      }
      if (count === 0) {
        throw new BadRequestException('Saldo a favor insuficiente para aplicar a las cuotas seleccionadas');
      }

      const cargosMap = new Map<number, any>();
      if (tx.cargoMiembro?.findMany) {
        const cargosExistentes = await tx.cargoMiembro.findMany({
          where: { id: { in: cargoIds } },
          include: { usuario: { select: { id: true, grupoFamiliarId: true } } },
        });
        for (const c of cargosExistentes) {
          cargosMap.set(c.id, c);
        }
      }

      for (const imp of dto.imputaciones) {
        const cargo = cargosMap.has(imp.cargoId)
          ? cargosMap.get(imp.cargoId)
          : await tx.cargoMiembro.findUnique({
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

        const impCts = aCentavos(imp.monto);
        const finalCts = aCentavos(cargo.montoFinal);
        const pagadoCts = aCentavos(cargo.montoPagado);
        const saldoPendienteCts = Math.max(0, finalCts - pagadoCts);
        if (impCts > saldoPendienteCts) {
          throw new BadRequestException(
            `El monto $${deCentavos(impCts)} excede el saldo pendiente de $${deCentavos(saldoPendienteCts).toFixed(2)} en cargo #${cargo.id}`,
          );
        }

        const nuevoPagadoCts = pagadoCts + impCts;
        const nuevoEstado = nuevoPagadoCts >= finalCts ? EstadoCargo.PAGADO : EstadoCargo.PARCIAL;

        await tx.cargoMiembro.update({
          where: { id: cargo.id },
          data: {
            montoPagado: centavosADecimal(nuevoPagadoCts),
            estado: nuevoEstado,
          },
        });
      }

      const pago = await tx.pago.create({
        data: {
          montoTotal: sumaDec,
          metodoPago: MetodoPago.OTRO,
          referenciaComprobante: 'APLICACION_SALDO_A_FAVOR',
          observaciones: 'Imputación de saldo a favor del miembro para cancelación de deuda',
          registradoPorUsuarioId: actor.sub,
          usuarioId: dto.usuarioId,
          imputaciones: {
            create: dto.imputaciones.map((imp) => ({
              cargoId: imp.cargoId,
              montoImputado: centavosADecimal(aCentavos(imp.monto)),
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

    return this.prisma.$transaction(async (tx) => {
      await lockFilasPorIds(tx, 'usuarios', [dto.usuarioId]);

      const usuario = await tx.usuario.findUnique({
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

      const saldoActualCts = aCentavos(usuario.saldoAFavor);
      const montoAjusteCts = aCentavos(dto.monto);
      let nuevoSaldoCts = saldoActualCts;

      if (dto.tipoAjuste === 'CARGAR') {
        if (montoAjusteCts <= 0) throw new BadRequestException('El monto a acreditar debe ser mayor a 0');
        nuevoSaldoCts = saldoActualCts + montoAjusteCts;
        await tx.usuario.update({
          where: { id: dto.usuarioId },
          data: { saldoAFavor: { increment: centavosADecimal(montoAjusteCts) } },
        });
      } else if (dto.tipoAjuste === 'DESCONTAR') {
        if (montoAjusteCts <= 0) throw new BadRequestException('El monto a descontar debe ser mayor a 0');
        const dec = centavosADecimal(montoAjusteCts);
        const res = await tx.usuario.updateMany({
          where: {
            id: dto.usuarioId,
            saldoAFavor: { gte: dec },
          },
          data: {
            saldoAFavor: { decrement: dec },
          },
        });
        if (res.count === 0) {
          throw new BadRequestException(
            `El monto a descontar ($${deCentavos(montoAjusteCts)}) supera el saldo actual ($${deCentavos(saldoActualCts)})`,
          );
        }
        nuevoSaldoCts = Math.max(0, saldoActualCts - montoAjusteCts);
      } else if (dto.tipoAjuste === 'FIJAR') {
        nuevoSaldoCts = Math.max(0, montoAjusteCts);
        await tx.usuario.update({
          where: { id: dto.usuarioId },
          data: { saldoAFavor: centavosADecimal(nuevoSaldoCts) },
        });
      }

      const actualizado = await tx.usuario.findUnique({
        where: { id: dto.usuarioId },
        select: { id: true, nombre: true, apellido: true, saldoAFavor: true },
      });

      return {
        mensaje: `Saldo a favor actualizado a $${deCentavos(nuevoSaldoCts).toFixed(2)}`,
        usuario: actualizado,
      };
    });
  }

  async listarPagos(alcance: AlcanceAcceso, usuarioId?: number) {
    const conditions: Prisma.PagoWhereInput[] = [];

    if (usuarioId) {
      conditions.push({
        OR: [{ usuarioId }, { imputaciones: { some: { cargo: { usuarioId } } } }],
      });
    }

    if (alcance.tipo === 'UNIDAD') {
      conditions.push({
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
      });
    } else if (alcance.tipo === 'PROPIO') {
      conditions.push({
        OR: [
          { usuarioId: alcance.usuarioId },
          { imputaciones: { some: { cargo: { usuarioId: alcance.usuarioId } } } },
        ],
      });
    }

    const where: Prisma.PagoWhereInput = conditions.length > 0 ? { AND: conditions } : {};

    return this.prisma.pago.findMany({
      where,
      orderBy: { fechaPago: 'desc' },
      take: 500,
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
