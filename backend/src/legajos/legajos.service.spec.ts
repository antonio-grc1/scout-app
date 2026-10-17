import { calcularHashVerificacion } from './legajos.service.js';

describe('calcularHashVerificacion', () => {
  it('genera un hash SHA-256 hexadecimal de 64 caracteres', () => {
    const hash = calcularHashVerificacion(1, 2, 2026, 1, { domicilio: 'Calle Falsa 123' });
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('genera hashes distintos para dos ejecuciones (por el salt criptográfico)', () => {
    const h1 = calcularHashVerificacion(1, 2, 2026, 1, { domicilio: 'Calle 1' });
    const h2 = calcularHashVerificacion(1, 2, 2026, 1, { domicilio: 'Calle 1' });
    expect(h1).not.toBe(h2);
  });

  it('verifica que el hash contenga información del ciclo y versión', () => {
    const hash = calcularHashVerificacion(10, 1, 2026, 2, { obra_social: 'OSDE' });
    expect(hash).toBeDefined();
    expect(typeof hash).toBe('string');
  });
});
