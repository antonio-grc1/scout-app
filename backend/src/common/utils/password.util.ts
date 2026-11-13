import { randomInt } from 'crypto';

const ALFABETO_CLAVE_TEMPORAL = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

/**
 * Genera una contraseña temporal aleatoria sin caracteres ambiguos (0/O/1/l/I)
 * usando CSPRNG (`crypto.randomInt`) para evitar el uso del DNI como clave inicial.
 */
export function generarClaveTemporal(longitud = 10): string {
  const largo = Math.max(8, Math.floor(longitud));
  let resultado = '';
  for (let i = 0; i < largo; i++) {
    resultado += ALFABETO_CLAVE_TEMPORAL[randomInt(ALFABETO_CLAVE_TEMPORAL.length)];
  }
  return resultado;
}
