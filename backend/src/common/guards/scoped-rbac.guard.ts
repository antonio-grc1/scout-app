import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRED_PERMISSION_KEY } from '../decorators/auth.decorators.js';
import { resolverAlcance } from '../scope/alcance.util.js';
import type { AuthenticatedRequest } from '../types/auth.types.js';

/**
 * Guard global de RBAC con alcance (AGENTS.md §6.1).
 * Si el endpoint declara @RequirePermission('x'), verifica que alguna asignación
 * activa otorgue 'x' y deja en `req.alcance` el alcance efectivo
 * (GLOBAL / UNIDAD / PROPIO) que los servicios DEBEN aplicar a sus consultas.
 */
@Injectable()
export class ScopedRbacGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const permiso = this.reflector.getAllAndOverride<string | undefined>(REQUIRED_PERMISSION_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!permiso) return true;

    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!req.user) throw new UnauthorizedException();

    const alcance = resolverAlcance(req.user, permiso);
    if (!alcance) throw new ForbiddenException(`Permiso requerido: ${permiso}`);

    req.alcance = alcance;
    return true;
  }
}
