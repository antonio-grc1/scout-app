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
  });
});
