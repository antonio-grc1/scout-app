import { afterEach, describe, expect, it, vi } from 'vitest';
import * as webpush from 'web-push';
import { WebPushService } from './web-push.service.js';

vi.mock('web-push', () => ({
  setVapidDetails: vi.fn(),
  sendNotification: vi.fn(),
}));

describe('WebPushService', () => {
  const prevPub = process.env.VAPID_PUBLIC_KEY;
  const prevPriv = process.env.VAPID_PRIVATE_KEY;
  const prevSubj = process.env.VAPID_SUBJECT;

  afterEach(() => {
    process.env.VAPID_PUBLIC_KEY = prevPub;
    process.env.VAPID_PRIVATE_KEY = prevPriv;
    process.env.VAPID_SUBJECT = prevSubj;
    vi.clearAllMocks();
  });

  it('informa deshabilitado si faltan claves VAPID y no intenta enviar', async () => {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;

    const prisma = {
      suscripcionPush: { findMany: vi.fn(), count: vi.fn() },
    };
    const service = new WebPushService(prisma as any);

    expect(service.obtenerEstadoPublico()).toEqual({ habilitado: false, publicKey: null });
    const res = await service.enviarAUsuarios([1, 2], {
      avisoId: 10,
      titulo: 'Prueba',
      mensaje: 'Hola',
      prioridad: 'NORMAL',
    });
    expect(res).toEqual({ enviados: 0, fallidos: 0, eliminadas: 0 });
    expect(prisma.suscripcionPush.findMany).not.toHaveBeenCalled();
  });

  it('envía notificaciones push con VAPID y limpia suscripciones vencidas (410/404)', async () => {
    process.env.VAPID_PUBLIC_KEY = 'BTestPublicKey';
    process.env.VAPID_PRIVATE_KEY = 'TestPrivateKey';
    process.env.VAPID_SUBJECT = 'mailto:test@scout.org';

    const prisma = {
      suscripcionPush: {
        findMany: vi.fn().mockResolvedValueOnce([
          { id: 101, endpoint: 'https://push.example/ok', p256dh: 'p1', auth: 'a1' },
          { id: 102, endpoint: 'https://push.example/gone', p256dh: 'p2', auth: 'a2' },
          { id: 103, endpoint: 'https://push.example/notfound', p256dh: 'p3', auth: 'a3' },
        ]),
        deleteMany: vi.fn().mockResolvedValueOnce({ count: 2 }),
      },
    };

    const sendMock = vi.mocked(webpush.sendNotification);
    sendMock
      .mockResolvedValueOnce({} as any)
      .mockRejectedValueOnce({ statusCode: 410 })
      .mockRejectedValueOnce({ statusCode: 404 });

    const service = new WebPushService(prisma as any);
    expect(service.obtenerEstadoPublico()).toEqual({
      habilitado: true,
      publicKey: 'BTestPublicKey',
    });

    const res = await service.enviarAUsuarios([5, 6], {
      avisoId: 77,
      titulo: 'Campamento urgente',
      mensaje: 'Se suspende la salida por tormenta.',
      prioridad: 'URGENTE',
    });

    expect(webpush.setVapidDetails).toHaveBeenCalledWith(
      'mailto:test@scout.org',
      'BTestPublicKey',
      'TestPrivateKey',
    );
    expect(sendMock).toHaveBeenCalledTimes(3);
    expect(prisma.suscripcionPush.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: [102, 103] } },
    });
    expect(res).toEqual({ enviados: 1, fallidos: 2, eliminadas: 2 });
  });
});
