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
