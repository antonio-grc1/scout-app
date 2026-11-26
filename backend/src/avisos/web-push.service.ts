import { Injectable, Logger } from '@nestjs/common';
import * as webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.service.js';
import type { SuscripcionPushDto } from './avisos.dto.js';

export interface PayloadPushAviso {
  avisoId: number;
  titulo: string;
  mensaje: string;
  prioridad: string;
  url?: string;
}

@Injectable()
export class WebPushService {
  private readonly logger = new Logger(WebPushService.name);
  private ultimaClaveConfigurada = '';

  constructor(private readonly prisma: PrismaService) {}

  private leerConfigVapid(): {
    publicKey?: string;
    privateKey?: string;
    subject: string;
  } {
    const publicKey = process.env.VAPID_PUBLIC_KEY?.trim() || undefined;
    const privateKey = process.env.VAPID_PRIVATE_KEY?.trim() || undefined;
    const subject =
      process.env.VAPID_SUBJECT?.trim() || 'mailto:contacto@scoutjuanxxiii.org';
    return { publicKey, privateKey, subject };
  }

  estaHabilitado(): boolean {
    const { publicKey, privateKey } = this.leerConfigVapid();
    return Boolean(publicKey && privateKey);
  }

  obtenerEstadoPublico(): { habilitado: boolean; publicKey: string | null } {
    const { publicKey, privateKey } = this.leerConfigVapid();
    const habilitado = Boolean(publicKey && privateKey);
    return {
      habilitado,
      publicKey: habilitado ? publicKey! : null,
    };
  }

  private asegurarVapidConfigurado(): boolean {
    const { publicKey, privateKey, subject } = this.leerConfigVapid();
    if (!publicKey || !privateKey) return false;
    const firma = `${subject}|${publicKey}|${privateKey}`;
    if (this.ultimaClaveConfigurada !== firma) {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      this.ultimaClaveConfigurada = firma;
    }
    return true;
  }

  async contarSuscripcionesUsuario(usuarioId: number): Promise<number> {
    if (!this.prisma?.suscripcionPush?.count) return 0;
    return this.prisma.suscripcionPush.count({ where: { usuarioId } });
  }

  async suscribir(usuarioId: number, dto: SuscripcionPushDto, userAgent?: string) {
    const ua = userAgent ? userAgent.slice(0, 255) : null;
    const reg = await this.prisma.suscripcionPush.upsert({
      where: { endpoint: dto.endpoint },
      create: {
        usuarioId,
        endpoint: dto.endpoint,
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
        userAgent: ua,
      },
      update: {
        usuarioId,
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
        userAgent: ua,
      },
      select: { id: true },
    });
    return { ok: true, id: reg.id };
  }

  async desuscribir(usuarioId: number, endpoint: string) {
    const res = await this.prisma.suscripcionPush.deleteMany({
      where: { usuarioId, endpoint },
    });
    return { ok: true, eliminadas: res.count };
  }

  async enviarAUsuarios(
    usuarioIds: readonly number[],
    payload: PayloadPushAviso,
  ): Promise<{ enviados: number; fallidos: number; eliminadas: number }> {
    if (usuarioIds.length === 0 || !this.asegurarVapidConfigurado()) {
      return { enviados: 0, fallidos: 0, eliminadas: 0 };
    }

    const suscripciones = await this.prisma.suscripcionPush.findMany({
      where: { usuarioId: { in: [...new Set(usuarioIds)] } },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    });

    if (suscripciones.length === 0) {
      return { enviados: 0, fallidos: 0, eliminadas: 0 };
    }

    const bodyCompacto =
      payload.mensaje.length > 180
        ? `${payload.mensaje.slice(0, 177).trimEnd()}…`
        : payload.mensaje;

    const dataJson = JSON.stringify({
      title: payload.titulo,
      body: bodyCompacto,
      tag: `aviso-${payload.avisoId}`,
      url: payload.url ?? '/avisos',
      avisoId: payload.avisoId,
      requireInteraction: payload.prioridad === 'URGENTE',
    });

    let enviados = 0;
    let fallidos = 0;
    const idsVencidos: number[] = [];

    const LOTE = 20;
    for (let i = 0; i < suscripciones.length; i += LOTE) {
      const bloque = suscripciones.slice(i, i + LOTE);
      const resultados = await Promise.allSettled(
        bloque.map((sub) =>
          webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            dataJson,
          ),
        ),
      );

      resultados.forEach((res, idx) => {
        if (res.status === 'fulfilled') {
          enviados += 1;
        } else {
          fallidos += 1;
          const statusCode = (res.reason as { statusCode?: number } | undefined)?.statusCode;
          if (statusCode === 404 || statusCode === 410) {
            idsVencidos.push(bloque[idx].id);
          } else {
            this.logger.warn(
              `Error enviando push a suscripción #${bloque[idx].id}: ${String((res.reason as Error | undefined)?.message ?? res.reason)}`,
            );
          }
        }
      });
    }

    if (idsVencidos.length > 0 && this.prisma.suscripcionPush?.deleteMany) {
      await this.prisma.suscripcionPush.deleteMany({
        where: { id: { in: idsVencidos } },
      });
    }

    return { enviados, fallidos, eliminadas: idsVencidos.length };
  }
}
