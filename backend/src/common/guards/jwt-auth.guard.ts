import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC_KEY, PERMITIR_CLAVE_PENDIENTE_KEY } from '../decorators/auth.decorators.js';
import type { AuthenticatedRequest, JwtPayload } from '../types/auth.types.js';

/**
 * Guard global: valida el Bearer JWT y carga `req.user`.
 * Además bloquea a los usuarios con `requiereCambioClave` salvo en endpoints
 * marcados con @PermitirClavePendiente().
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    const [tipo, token] = req.headers.authorization?.split(' ') ?? [];
    if (tipo !== 'Bearer' || !token) throw new UnauthorizedException('Token ausente');

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Token inválido o vencido');
    }
    req.user = payload;

    const permitePendiente = this.reflector.getAllAndOverride<boolean>(PERMITIR_CLAVE_PENDIENTE_KEY, targets);
    if (payload.requiereCambioClave && !permitePendiente) {
      throw new ForbiddenException({
        code: 'REQUIERE_CAMBIO_CLAVE',
        message: 'Debe cambiar su clave antes de continuar',
      });
    }
    return true;
  }
}
