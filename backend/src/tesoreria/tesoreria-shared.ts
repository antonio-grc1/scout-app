import { BadRequestException } from '@nestjs/common';
import { EstadoCargo, Prisma } from '@prisma/client';
import { validarFechaCalendarioIso } from '../common/utils/fechas.util.js';
import type { PrismaService } from '../prisma/prisma.service.js';

export type MontoDecimal = Prisma.Decimal | number | string | null | undefined;

export type TablaBloqueable =
  | 'usuarios'
  | 'cargos_miembro'
  | 'cuentas_financieras'
  | 'pedidos_evento'
  | 'pagos'
  | 'eventos';

export const NOMBRES_MESES = [
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

export function asTrimmedString(valor: unknown): string {
  if (typeof valor === 'string') return valor.trim();
  if (typeof valor === 'number' || typeof valor === 'bigint') return String(valor).trim();
  return '';
}

/**
 * Convierte un monto decimal (string, Decimal o number) a enteros de centavos exactos,
 * evitando deriva de punto flotante IEEE-754.
 */
export function aCentavos(valor: MontoDecimal): number {
  if (valor === null || valor === undefined) return 0;
  if (typeof valor === 'number') {
    if (!Number.isFinite(valor)) return 0;
    return Math.round(valor * 100);
  }
  const str = typeof valor === 'string' ? valor.trim() : valor.toString().trim();
  if (!str) return 0;
  const match = /^([+-])?(\d+)(?:\.(\d+))?$/.exec(str);
  if (!match) {
    const parsed = Number(str);
    return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
  }
  const sign = match[1] === '-' ? -1 : 1;
  const entero = Number(match[2]);
  const fracRaw = (match[3] ?? '').padEnd(3, '0');
  const dosDecimales = Number(fracRaw.slice(0, 2));
  const redondeo = Number(fracRaw[2]) >= 5 ? 1 : 0;
  return sign * (entero * 100 + dosDecimales + redondeo);
}

export function deCentavos(centavos: number): number {
  return Math.trunc(centavos) / 100;
}

export function centavosADecimal(centavos: number): Prisma.Decimal {
  const c = Math.trunc(centavos);
  const negativo = c < 0;
  const abs = Math.abs(c);
  const pesos = Math.floor(abs / 100);
  const resto = String(abs % 100).padStart(2, '0');
  return new Prisma.Decimal(`${negativo ? '-' : ''}${pesos}.${resto}`);
}

export function calcularDescuentoCentavos(montoBaseCentavos: number, porcentaje: MontoDecimal): number {
  const pctCentavos = aCentavos(porcentaje);
  if (pctCentavos <= 0 || montoBaseCentavos <= 0) return 0;
  return Math.round((montoBaseCentavos * pctCentavos) / 10000);
}

export function round2(n: MontoDecimal): number {
  return deCentavos(aCentavos(n));
}

export function redondearDosDecimales(n: MontoDecimal): Prisma.Decimal {
  return centavosADecimal(aCentavos(n));
}

export function extraerExcepcionIds(
  registro:
    | {
        excepciones?: Array<{ usuarioId: number }> | null;
        excepcionesJson?: unknown;
      }
    | null
    | undefined,
): number[] {
  if (!registro) return [];
  if (Array.isArray(registro.excepciones)) {
    return Array.from(
      new Set(
        registro.excepciones
          .map((e) => Number(e.usuarioId))
          .filter((id) => Number.isInteger(id) && id > 0),
      ),
    );
  }
  if (Array.isArray(registro.excepcionesJson)) {
    return Array.from(
      new Set(
        (registro.excepcionesJson as unknown[])
          .map((x) => Number(x))
          .filter((id) => Number.isInteger(id) && id > 0),
      ),
    );
  }
  return [];
}

export function serializarConceptoCompat<T extends Record<string, any>>(
  concepto: T,
): T & { excepcionesJson: number[] } {
  const excepcionesJson = extraerExcepcionIds(concepto);
  return { ...concepto, excepcionesJson };
}

export function serializarPlanCompat<T extends Record<string, any>>(
  plan: T,
): T & { excepcionesJson: number[] } {
  const excepcionesJson = extraerExcepcionIds(plan);
  return {
    ...plan,
    excepcionesJson,
    ...(Array.isArray(plan.conceptos)
      ? { conceptos: plan.conceptos.map((c: any) => serializarConceptoCompat(c)) }
      : {}),
  };
}

export function parsearLimiteDia(fechaStr: string, finDelDia: boolean): Date {
  const limpio = fechaStr.trim();
  if (!limpio.includes('T')) {
    validarFechaCalendarioIso(limpio);
    const sufijo = finDelDia ? 'T23:59:59.999-03:00' : 'T00:00:00.000-03:00';
    return new Date(`${limpio}${sufijo}`);
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(limpio)) {
    validarFechaCalendarioIso(limpio.slice(0, 10));
  }
  const d = new Date(limpio);
  if (isNaN(d.getTime())) {
    throw new BadRequestException(`Fecha inválida: "${fechaStr}"`);
  }
  return d;
}

/** Adquiere locks pesimistas (`FOR UPDATE`) en orden ascendente de ID para serializar mutaciones concurrentes. */
export async function lockFilasPorIds(
  tx: any,
  tabla: TablaBloqueable,
  ids: Array<number | null | undefined>,
): Promise<void> {
  const uniqueIds = Array.from(
    new Set(ids.filter((id): id is number => typeof id === 'number' && Number.isInteger(id) && id > 0)),
  ).sort((a, b) => a - b);

  if (uniqueIds.length === 0 || typeof tx?.$queryRaw !== 'function') {
    return;
  }

  const joinedIds = Prisma.join(uniqueIds);
  switch (tabla) {
    case 'usuarios':
      await tx.$queryRaw(Prisma.sql`SELECT id FROM usuarios WHERE id IN (${joinedIds}) ORDER BY id ASC FOR UPDATE`);
      break;
    case 'cargos_miembro':
      await tx.$queryRaw(Prisma.sql`SELECT id FROM cargos_miembro WHERE id IN (${joinedIds}) ORDER BY id ASC FOR UPDATE`);
      break;
    case 'cuentas_financieras':
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM cuentas_financieras WHERE id IN (${joinedIds}) ORDER BY id ASC FOR UPDATE`,
      );
      break;
    case 'pedidos_evento':
      await tx.$queryRaw(Prisma.sql`SELECT id FROM pedidos_evento WHERE id IN (${joinedIds}) ORDER BY id ASC FOR UPDATE`);
      break;
    case 'pagos':
      await tx.$queryRaw(Prisma.sql`SELECT id FROM pagos WHERE id IN (${joinedIds}) ORDER BY id ASC FOR UPDATE`);
      break;
    case 'eventos':
      await tx.$queryRaw(Prisma.sql`SELECT id FROM eventos WHERE id IN (${joinedIds}) ORDER BY id ASC FOR UPDATE`);
      break;
  }
}

export async function runInTransaction<T>(
  prisma: PrismaService,
  fn: (tx: any) => Promise<T>,
): Promise<T> {
  if (typeof (prisma as any)?.$transaction === 'function') {
    return prisma.$transaction(fn);
  }
  return fn(prisma);
}

export async function obtenerSaldoCuentaEnTx(tx: any, cuentaId: number): Promise<number | null> {
  await lockFilasPorIds(tx, 'cuentas_financieras', [cuentaId]);
  if (typeof tx?.movimientoFinanciero?.aggregate !== 'function') {
    return null;
  }
  const agg = await tx.movimientoFinanciero.aggregate({
    where: { cuentaId },
    _sum: { montoIngreso: true, montoEgreso: true },
  });
  const saldoCentavos = aCentavos(agg?._sum?.montoIngreso) - aCentavos(agg?._sum?.montoEgreso);
  return deCentavos(saldoCentavos);
}

export async function assertSaldoCuentaDisponibleEnTx(
  tx: any,
  cuentaId: number,
  montoRequerido: MontoDecimal,
  buildMessage: (saldoActual: number) => string,
): Promise<number | null> {
  const saldoDisponible = await obtenerSaldoCuentaEnTx(tx, cuentaId);
  if (saldoDisponible !== null && aCentavos(saldoDisponible) < aCentavos(montoRequerido)) {
    throw new BadRequestException(buildMessage(saldoDisponible));
  }
  return saldoDisponible;
}

export function construirFiltroRol(destinatarioTipo?: string | null, esParaEducadores?: boolean) {
  const tipo = destinatarioTipo || (esParaEducadores ? 'EDUCADORES' : 'TODOS');
  if (tipo === 'EDUCADORES') {
    return { tipoMiembro: 'EDUCADOR' };
  }
  if (tipo === 'PROTAGONISTAS') {
    return { tipoMiembro: 'PROTAGONISTA' };
  }
  return undefined;
}

export function calcularEstadoCargo(
  estadoActual: EstadoCargo,
  montoPagado: MontoDecimal,
  montoFinal: MontoDecimal,
): EstadoCargo {
  if (estadoActual === EstadoCargo.ANULADO) return EstadoCargo.ANULADO;
  const pagadoCts = aCentavos(montoPagado);
  const finalCts = aCentavos(montoFinal);
  if (finalCts <= 0 || pagadoCts >= finalCts) {
    return EstadoCargo.PAGADO;
  }
  return pagadoCts > 0 ? EstadoCargo.PARCIAL : EstadoCargo.PENDIENTE;
}

export async function descontarMontoCargoEnTx(
  tx: Prisma.TransactionClient,
  cargoId: number,
  montoARevertir: MontoDecimal,
): Promise<void> {
  const cargoActual = await tx.cargoMiembro.findUnique({ where: { id: cargoId } });
  if (!cargoActual) return;
  const nuevoPagadoCts = Math.max(0, aCentavos(cargoActual.montoPagado) - aCentavos(montoARevertir));
  const nuevoEstado = calcularEstadoCargo(
    cargoActual.estado,
    deCentavos(nuevoPagadoCts),
    cargoActual.montoFinal,
  );
  await tx.cargoMiembro.update({
    where: { id: cargoActual.id },
    data: {
      montoPagado: centavosADecimal(nuevoPagadoCts),
      estado: nuevoEstado,
    },
  });
}

export function calcularMontosCargo(
  montoBase: MontoDecimal,
  permiteDescuentoHermanos: boolean,
  porcentajeConcepto: Prisma.Decimal | number | null | undefined,
  grupoFamiliar: { porcentajeDescuentoHermanos: Prisma.Decimal | number } | null | undefined,
) {
  const montoBaseCts = aCentavos(montoBase);
  let descuentoCts = 0;
  if (permiteDescuentoHermanos && grupoFamiliar) {
    const pct =
      porcentajeConcepto !== null && porcentajeConcepto !== undefined
        ? porcentajeConcepto
        : (grupoFamiliar.porcentajeDescuentoHermanos ?? 0);
    descuentoCts = calcularDescuentoCentavos(montoBaseCts, pct);
  }

  const montoOriginal = centavosADecimal(montoBaseCts);
  const montoDescuento = centavosADecimal(descuentoCts);
  const montoFinal = centavosADecimal(Math.max(0, montoBaseCts - descuentoCts));

  return { montoOriginal, montoDescuento, montoFinal };
}

export function calcularResumenRecaudacion(
  cargos: Array<{ montoFinal: Prisma.Decimal | number | string; montoPagado: Prisma.Decimal | number | string; estado: EstadoCargo }>,
) {
  const activos = cargos.filter((c) => c.estado !== EstadoCargo.ANULADO);
  let totalFacturadoCts = 0;
  let totalRecaudadoCts = 0;
  let cargosPagados = 0;
  let cargosParciales = 0;
  let cargosPendientes = 0;

  for (const c of activos) {
    totalFacturadoCts += aCentavos(c.montoFinal);
    totalRecaudadoCts += aCentavos(c.montoPagado);
    if (c.estado === EstadoCargo.PAGADO) cargosPagados++;
    else if (c.estado === EstadoCargo.PARCIAL) cargosParciales++;
    else if (c.estado === EstadoCargo.PENDIENTE) cargosPendientes++;
  }

  const totalPendienteCts = Math.max(0, totalFacturadoCts - totalRecaudadoCts);
  const porcentajeCobrado =
    totalFacturadoCts > 0 ? Math.round((totalRecaudadoCts / totalFacturadoCts) * 100) : 0;

  return {
    totalCargos: activos.length,
    cargosPagados,
    cargosParciales,
    cargosPendientes,
    totalFacturado: deCentavos(totalFacturadoCts),
    totalRecaudado: deCentavos(totalRecaudadoCts),
    totalPendiente: deCentavos(totalPendienteCts),
    porcentajeCobrado,
  };
}

/**
 * Libera un monto abonado en un cargo (por anulación, baja de mes, beca o reducción de monto)
 * y lo acredita íntegramente en el `saldoAFavor` del miembro manteniendo consistencia con `PagoImputacion`.
 */
export async function liberarMontoPagadoDeCargoEnTx(
  tx: Prisma.TransactionClient,
  cargoId: number,
  usuarioId: number,
  montoALiberar: MontoDecimal,
) {
  const montoCts = aCentavos(montoALiberar);
  if (montoCts <= 0) return;

  const imputaciones = await tx.pagoImputacion.findMany({
    where: { cargoId },
    orderBy: { id: 'desc' },
    include: { pago: true },
  });

  let restanteCts = montoCts;
  const liberadoPorUsuarioCts = new Map<number, number>();

  for (const imp of imputaciones) {
    if (restanteCts <= 0) break;
    const impCts = aCentavos(imp.montoImputado);
    const quitarCts = Math.min(restanteCts, impCts);

    if (quitarCts >= impCts) {
      await tx.pagoImputacion.delete({ where: { id: imp.id } });
    } else {
      await tx.pagoImputacion.update({
        where: { id: imp.id },
        data: { montoImputado: centavosADecimal(impCts - quitarCts) },
      });
    }

    if (imp.pago?.referenciaComprobante === 'APLICACION_SALDO_A_FAVOR') {
      const nuevoTotalCts = aCentavos(imp.pago.montoTotal) - quitarCts;
      if (nuevoTotalCts <= 0) {
        if (tx.pago?.deleteMany) {
          await tx.pago.deleteMany({ where: { id: imp.pago.id } });
        } else {
          await tx.pago.delete({ where: { id: imp.pago.id } });
        }
      } else {
        await tx.pago.update({
          where: { id: imp.pago.id },
          data: { montoTotal: centavosADecimal(nuevoTotalCts) },
        });
      }
    }

    const pagadorId = imp.pago?.usuarioId ?? usuarioId;
    liberadoPorUsuarioCts.set(pagadorId, (liberadoPorUsuarioCts.get(pagadorId) ?? 0) + quitarCts);

    restanteCts -= quitarCts;
  }

  if (restanteCts > 0) {
    liberadoPorUsuarioCts.set(usuarioId, (liberadoPorUsuarioCts.get(usuarioId) ?? 0) + restanteCts);
  }

  for (const [uid, montoUsuarioCts] of liberadoPorUsuarioCts.entries()) {
    if (montoUsuarioCts > 0) {
      await tx.usuario.update({
        where: { id: uid },
        data: {
          saldoAFavor: { increment: centavosADecimal(montoUsuarioCts) },
        },
      });
    }
  }
}
