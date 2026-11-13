import crypto from 'node:crypto';

let ephemeralTestSecret: string | null = null;

function getQrHmacSecret(): string {
  const configured = process.env.QR_HMAC_SECRET?.trim();
  if (configured && configured.length >= 32) {
    return configured;
  }

  // En pruebas unitarias aisladas que no cargan env.ts ni .env, usar un secreto efímero por proceso.
  if (process.env.VITEST === 'true' || process.env.NODE_ENV === 'test') {
    if (!ephemeralTestSecret) {
      ephemeralTestSecret = crypto.randomBytes(32).toString('hex');
    }
    return ephemeralTestSecret;
  }

  throw new Error('QR_HMAC_SECRET debe estar configurado con al menos 32 caracteres');
}

export interface QrTokenContext {
  eventoId?: number;
  pedidoId?: number;
}

export interface QrTokenVerificationResult {
  valid: boolean;
  uuid: string;
  eventoId?: number;
  pedidoId?: number;
}

export function generateTokenQR(context?: { eventoId: number; pedidoId: number }): string {
  const uuid = crypto.randomUUID();
  const payload =
    context !== undefined ? `${uuid}:${context.eventoId}:${context.pedidoId}` : uuid;
  const secret = getQrHmacSecret();
  const signature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return `${payload}.${signature}`;
}

export function verifyTokenQR(
  token: string,
  expectedContext?: QrTokenContext,
): QrTokenVerificationResult {
  if (!token || typeof token !== 'string') {
    return { valid: false, uuid: '' };
  }

  const parts = token.trim().split('.');
  if (parts.length !== 2) {
    return { valid: false, uuid: '' };
  }

  const [payload, signature] = parts;
  if (!payload || !signature || !/^[a-f0-9]{64}$/i.test(signature)) {
    return { valid: false, uuid: '' };
  }

  const payloadSegments = payload.split(':');
  let uuid = payload;
  let eventoId: number | undefined;
  let pedidoId: number | undefined;

  if (payloadSegments.length === 3) {
    const [rawUuid, rawEventoId, rawPedidoId] = payloadSegments;
    const evId = Number(rawEventoId);
    const pedId = Number(rawPedidoId);
    if (
      !rawUuid ||
      !/^\d+$/.test(rawEventoId) ||
      !/^\d+$/.test(rawPedidoId) ||
      !Number.isInteger(evId) ||
      evId <= 0 ||
      !Number.isInteger(pedId) ||
      pedId <= 0
    ) {
      return { valid: false, uuid: '' };
    }
    uuid = rawUuid;
    eventoId = evId;
    pedidoId = pedId;
  } else if (payloadSegments.length !== 1) {
    return { valid: false, uuid: '' };
  }

  const secret = getQrHmacSecret();
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  const providedSignature = Buffer.from(signature, 'hex');
  const expectedSignatureBuffer = Buffer.from(expectedSignature, 'hex');

  if (providedSignature.length !== expectedSignatureBuffer.length) {
    return { valid: false, uuid: '' };
  }

  const valid = crypto.timingSafeEqual(providedSignature, expectedSignatureBuffer);
  if (!valid) {
    return { valid: false, uuid: '' };
  }

  if (
    expectedContext?.eventoId !== undefined &&
    eventoId !== undefined &&
    eventoId !== expectedContext.eventoId
  ) {
    return { valid: false, uuid: '' };
  }
  if (
    expectedContext?.pedidoId !== undefined &&
    pedidoId !== undefined &&
    pedidoId !== expectedContext.pedidoId
  ) {
    return { valid: false, uuid: '' };
  }

  return {
    valid: true,
    uuid,
    ...(eventoId !== undefined ? { eventoId } : {}),
    ...(pedidoId !== undefined ? { pedidoId } : {}),
  };
}
