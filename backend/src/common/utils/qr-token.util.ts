import crypto from 'node:crypto';

const DEFAULT_SECRET = 'scout-app-default-secret-key-change-in-prod';

export function generateTokenQR(): string {
  const uuid = crypto.randomUUID();
  const secret = process.env.QR_HMAC_SECRET || DEFAULT_SECRET;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(uuid)
    .digest('hex');
  return `${uuid}.${signature}`;
}

export function verifyTokenQR(token: string): { valid: boolean; uuid: string } {
  if (!token || typeof token !== 'string') {
    return { valid: false, uuid: '' };
  }

  const [uuid, signature] = token.trim().split('.');
  if (!uuid || !signature || !/^[a-f0-9]{64}$/i.test(signature)) {
    return { valid: false, uuid: '' };
  }

  const secret = process.env.QR_HMAC_SECRET || DEFAULT_SECRET;
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(uuid)
    .digest('hex');

  const providedSignature = Buffer.from(signature, 'hex');
  const expectedSignatureBuffer = Buffer.from(expectedSignature, 'hex');

  if (providedSignature.length !== expectedSignatureBuffer.length) {
    return { valid: false, uuid: '' };
  }

  const valid = crypto.timingSafeEqual(providedSignature, expectedSignatureBuffer);
  return { valid, uuid };
}
