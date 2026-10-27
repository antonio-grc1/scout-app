import { calcularAnioCamada, calcularEdad, fechaCorteCicloEscolar } from '../common/utils/fechas.util.js';

export { calcularAnioCamada, fechaCorteCicloEscolar };

export interface RamaLite {
  id: number;
  nombre: string;
  edadMinima: number;
  edadMaxima: number;
  ordenProgresion: number;
}

export type SugerenciaPase =
  | { tipo: 'PROGRESION'; ramaSugerida: RamaLite }
  /** Superó la edad máxima de la última rama: candidato a pasar a Educador. */
  | { tipo: 'EGRESO' };

/**
 * Decide si un protagonista debe pasar de rama según su camada / edad al corte escolar (30/06 inclusive)
 * o a la `fechaReferencia` indicada, y las ramas activas leídas de la BD.
 * Devuelve `null` si sigue dentro del rango de su rama actual.
 */
export function sugerirPase(
  fechaNacimiento: Date,
  ramaActual: RamaLite,
  ramas: RamaLite[],
  fechaReferencia: Date = fechaCorteCicloEscolar(),
): { edad: number; camada: number; sugerencia: SugerenciaPase } | null {
  const edad = calcularEdad(fechaNacimiento, fechaReferencia);
  const camada = calcularAnioCamada(fechaNacimiento);
  if (edad <= ramaActual.edadMaxima) return null;

  const superiores = ramas
    .filter((r) => r.ordenProgresion > ramaActual.ordenProgresion)
    .sort((a, b) => a.ordenProgresion - b.ordenProgresion);
  if (superiores.length === 0) return { edad, camada, sugerencia: { tipo: 'EGRESO' } };

  const queContiene = superiores.find((r) => edad >= r.edadMinima && edad <= r.edadMaxima);
  if (queContiene) return { edad, camada, sugerencia: { tipo: 'PROGRESION', ramaSugerida: queContiene } };

  // Ninguna rama superior contiene la edad: si ya superó todas, es egreso; si no, la siguiente.
  const ultima = superiores[superiores.length - 1];
  if (edad > ultima.edadMaxima) return { edad, camada, sugerencia: { tipo: 'EGRESO' } };
  return { edad, camada, sugerencia: { tipo: 'PROGRESION', ramaSugerida: superiores[0] } };
}
