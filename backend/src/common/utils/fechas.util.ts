import { BadRequestException } from '@nestjs/common';

const TZ_AR = 'America/Argentina/Buenos_Aires';

/** Devuelve YYYY-MM-DD actual según el calendario oficial de Argentina (GMT-3). */
export function fechaIsoArgentinaHoy(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ_AR,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ahora);
}

/** Valida que YYYY-MM-DD corresponda a una fecha de calendario real (sin rollover, ej. 2026-02-30). */
export function validarFechaCalendarioIso(fechaStr: string): { anio: number; mes: number; dia: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fechaStr);
  if (!m) {
    throw new BadRequestException(`Fecha inválida: "${fechaStr}"`);
  }
  const anio = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  const probe = new Date(Date.UTC(anio, mes - 1, dia));
  if (
    probe.getUTCFullYear() !== anio ||
    probe.getUTCMonth() + 1 !== mes ||
    probe.getUTCDate() !== dia
  ) {
    throw new BadRequestException(`Fecha de calendario inexistente: "${fechaStr}"`);
  }
  return { anio, mes, dia };
}

/** Fecha de hoy (calendario Argentina GMT-3) como medianoche UTC, igual que las columnas @db.Date. */
export function hoyUtc(): Date {
  const [anio, mes, dia] = fechaIsoArgentinaHoy().split('-').map(Number);
  return new Date(Date.UTC(anio, mes - 1, dia));
}

/** Edad cumplida a la fecha de referencia (ambas fechas interpretadas en UTC). */
export function calcularEdad(fechaNacimiento: Date, referencia: Date = hoyUtc()): number {
  let edad = referencia.getUTCFullYear() - fechaNacimiento.getUTCFullYear();
  const m = referencia.getUTCMonth() - fechaNacimiento.getUTCMonth();
  if (m < 0 || (m === 0 && referencia.getUTCDate() < fechaNacimiento.getUTCDate())) edad--;
  return edad;
}

export function anioActual(): number {
  return Number(fechaIsoArgentinaHoy().slice(0, 4));
}

/**
 * Fecha de corte del ciclo escolar scout: 30 de junio inclusive (30/06) del año indicado.
 */
export function fechaCorteCicloEscolar(anio: number = anioActual()): Date {
  return new Date(Date.UTC(anio, 5, 30));
}

/**
 * Calcula el año de Camada (cohorte escolar con corte al 30 de junio inclusive).
 * - Nacidos entre el 1 de enero y el 30 de junio del año Y -> Camada Y.
 * - Nacidos entre el 1 de julio y el 31 de diciembre del año Y -> Camada Y + 1
 *   (comparten camada con los nacidos hasta el 30/06 del año Y + 1).
 */
export function calcularAnioCamada(fechaNacimiento: Date): number {
  const anioNac = fechaNacimiento.getUTCFullYear();
  const mesNac = fechaNacimiento.getUTCMonth(); // 0 = Enero .. 5 = Junio, 6 = Julio .. 11 = Diciembre
  return mesNac < 6 ? anioNac : anioNac + 1;
}

/**
 * Parsea una fecha de operación (YYYY-MM-DD o ISO) asegurando el huso horario oficial de Argentina (GMT-3).
 * Si es solo YYYY-MM-DD y coincide con hoy, usa la hora actual local. Si es otro día, usa mediodía GMT-3 (15:00 UTC)
 * para evitar desfases de día anterior al persistir o convertir.
 */
export function parsearFechaOperacion(fechaStr?: string | null): Date {
  if (!fechaStr || !fechaStr.trim()) return new Date();
  const limpio = fechaStr.trim();

  // Si es solo YYYY-MM-DD: validar calendario real primero
  if (/^\d{4}-\d{2}-\d{2}$/.test(limpio)) {
    validarFechaCalendarioIso(limpio);
    if (limpio === fechaIsoArgentinaHoy()) {
      return new Date();
    }
    // Para otro día: mediodía en Argentina (12:00 GMT-3 = 15:00 UTC)
    return new Date(`${limpio}T15:00:00.000Z`);
  }

  // Si ya es un ISO completo o incluye offset (por ej. termina en Z o -03:00):
  if (limpio.includes('Z') || /[+-]\d{2}:?\d{2}$/.test(limpio)) {
    const d = new Date(limpio);
    if (isNaN(d.getTime())) throw new BadRequestException(`Fecha inválida: "${fechaStr}"`);
    if (/^\d{4}-\d{2}-\d{2}/.test(limpio)) validarFechaCalendarioIso(limpio.slice(0, 10));
    return d;
  }

  // Si es YYYY-MM-DDTHH:mm sin zona, asumir hora argentina (GMT-3)
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(limpio)) {
    validarFechaCalendarioIso(limpio.slice(0, 10));
    const d = new Date(`${limpio}-03:00`);
    if (isNaN(d.getTime())) throw new BadRequestException(`Fecha inválida: "${fechaStr}"`);
    return d;
  }

  throw new BadRequestException(`Formato de fecha inválido: "${fechaStr}"`);
}

