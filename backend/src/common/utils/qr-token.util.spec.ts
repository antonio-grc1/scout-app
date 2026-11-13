import { describe, expect, it } from 'vitest';
import { generateTokenQR, verifyTokenQR } from './qr-token.util.js';

describe('QR Token HMAC Security Utility', () => {
  it('genera un token válido con UUID y firma HMAC de 64 caracteres hex', () => {
    const token = generateTokenQR();
    expect(token).toBeDefined();
    const parts = token.split('.');
    expect(parts.length).toBe(2);
    expect(parts[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(parts[1]).toMatch(/^[0-9a-f]{64}$/i);

    const verification = verifyTokenQR(token);
    expect(verification.valid).toBe(true);
    expect(verification.uuid).toBe(parts[0]);
  });

  it('rechaza tokens manipulados o firmas alteradas', () => {
    const token = generateTokenQR();
    const [uuid, signature] = token.split('.');
    const tamperedSignature = signature.slice(0, -1) + (signature.slice(-1) === 'a' ? 'b' : 'a');
    const tamperedToken = `${uuid}.${tamperedSignature}`;

    const res = verifyTokenQR(tamperedToken);
    expect(res.valid).toBe(false);
  });

  it('rechaza strings mal formados o vacíos', () => {
    expect(verifyTokenQR('').valid).toBe(false);
    expect(verifyTokenQR('invalido').valid).toBe(false);
    expect(verifyTokenQR('abc.123').valid).toBe(false);
    const valid = generateTokenQR();
    expect(verifyTokenQR(`${valid}.extra`).valid).toBe(false);
  });

  it('exige QR_HMAC_SECRET fuera de entorno de pruebas y rechaza firmas generadas con otro secreto', () => {
    const prevSecret = process.env.QR_HMAC_SECRET;
    const prevVitest = process.env.VITEST;
    const prevNodeEnv = process.env.NODE_ENV;
    try {
      delete process.env.QR_HMAC_SECRET;
      delete process.env.VITEST;
      process.env.NODE_ENV = 'production';
      expect(() => generateTokenQR()).toThrow(/QR_HMAC_SECRET/);

      process.env.QR_HMAC_SECRET = 'a'.repeat(32);
      const tokenConSecretoA = generateTokenQR();
      expect(verifyTokenQR(tokenConSecretoA).valid).toBe(true);

      process.env.QR_HMAC_SECRET = 'b'.repeat(32);
      expect(verifyTokenQR(tokenConSecretoA).valid).toBe(false);
    } finally {
      if (prevSecret === undefined) delete process.env.QR_HMAC_SECRET;
      else process.env.QR_HMAC_SECRET = prevSecret;
      if (prevVitest === undefined) delete process.env.VITEST;
      else process.env.VITEST = prevVitest;
      if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = prevNodeEnv;
    }
  });

  it('firma eventoId y pedidoId en tokens v2 y rechaza desajustes de contexto manteniendo compatibilidad legacy', () => {
    const tokenVinculado = generateTokenQR({ eventoId: 12, pedidoId: 45 });
    const verOk = verifyTokenQR(tokenVinculado, { eventoId: 12, pedidoId: 45 });
    expect(verOk.valid).toBe(true);
    expect(verOk.eventoId).toBe(12);
    expect(verOk.pedidoId).toBe(45);

    expect(verifyTokenQR(tokenVinculado, { eventoId: 99, pedidoId: 45 }).valid).toBe(false);
    expect(verifyTokenQR(tokenVinculado, { eventoId: 12, pedidoId: 999 }).valid).toBe(false);

    const tokenLegacy = generateTokenQR();
    expect(verifyTokenQR(tokenLegacy, { eventoId: 12, pedidoId: 45 }).valid).toBe(true);
  });
});
