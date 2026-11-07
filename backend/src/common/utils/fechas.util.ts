/** Fecha de hoy (calendario local) como medianoche UTC, igual que las columnas @db.Date. */
export function hoyUtc(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

/** Edad cumplida a la fecha de referencia (ambas fechas interpretadas en UTC). */
export function calcularEdad(fechaNacimiento: Date, referencia: Date = hoyUtc()): number {
  let edad = referencia.getUTCFullYear() - fechaNacimiento.getUTCFullYear();
  const m = referencia.getUTCMonth() - fechaNacimiento.getUTCMonth();
  if (m < 0 || (m === 0 && referencia.getUTCDate() < fechaNacimiento.getUTCDate())) edad--;
  return edad;
}

export function anioActual(): number {
  return new Date().getFullYear();
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

