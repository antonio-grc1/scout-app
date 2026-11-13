import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

const WINDOW_MS = 60_000;
const MAX_INTENTOS_POR_IP_Y_DNI = 10;
const MAX_INTENTOS_POR_IP = 30;
const MAX_CLAVES_TRACKED = 10_000;

/**
 * Protección básica contra fuerza bruta en `POST /api/auth/login`.
 * Ventana deslizante en memoria por combinación IP+DNI e IP origen.
 */
@Injectable()
export class LoginRateLimitGuard implements CanActivate {
  private readonly intentosPorClave = new Map<string, number[]>();

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request & { body?: { dni?: unknown } }>();
    const ahora = Date.now();
    const ip = this.extraerIp(req);
    const dni = typeof req.body?.dni === 'string' ? req.body.dni.trim() : '';

    if (this.superaLimite(`ip:${ip}`, MAX_INTENTOS_POR_IP, ahora)) {
      throw new HttpException(
        'Demasiados intentos de inicio de sesión desde esta dirección. Intente nuevamente en un minuto.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (dni && this.superaLimite(`ip-dni:${ip}:${dni}`, MAX_INTENTOS_POR_IP_Y_DNI, ahora)) {
      throw new HttpException(
        'Demasiados intentos para este DNI. Intente nuevamente en un minuto.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  private extraerIp(req: Request): string {
    const forwarded = req.headers?.['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) {
      return forwarded.split(',')[0].trim();
    }
    if (Array.isArray(forwarded) && forwarded.length > 0) {
      return String(forwarded[0]).trim();
    }
    return req.ip || req.socket?.remoteAddress || 'unknown';
  }

  private superaLimite(clave: string, maxIntentos: number, ahora: number): boolean {
    const corte = ahora - WINDOW_MS;
    const previos = (this.intentosPorClave.get(clave) ?? []).filter((ts) => ts > corte);
    if (previos.length >= maxIntentos) {
      this.intentosPorClave.set(clave, previos);
      return true;
    }

    previos.push(ahora);
    if (this.intentosPorClave.size >= MAX_CLAVES_TRACKED) {
      for (const [k, timestamps] of this.intentosPorClave.entries()) {
        if (!timestamps.some((ts) => ts > corte)) {
          this.intentosPorClave.delete(k);
        }
      }
    }
    this.intentosPorClave.set(clave, previos);
    return false;
  }
}
