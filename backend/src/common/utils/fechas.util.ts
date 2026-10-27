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
