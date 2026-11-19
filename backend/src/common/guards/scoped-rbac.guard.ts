import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  PERMITIR_AUTOGESTION_PROPIA_KEY,
  REQUIRED_PERMISSION_KEY,
} from '../decorators/auth.decorators.js';
import { resolverAlcance } from '../scope/alcance.util.js';
import type { AuthenticatedRequest } from '../types/auth.types.js';

/**
 * Guard global de RBAC con alcance (AGENTS.md §6.1).
 * Si el endpoint declara @RequirePermission('x'), verifica que alguna asignación
 * activa otorgue 'x' (o habilita alcance `PROPIO` únicamente cuando el endpoint
 * declara explícitamente @PermitirAutogestionPropia()) y deja en `req.alcance`
 * el alcance efectivo que los servicios DEBEN aplicar a sus consultas.
 */
@Injectable()
export class ScopedRbacGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const targets = [ctx.getHandler(), ctx.getClass()];
    const permiso = this.reflector.getAllAndOverride<string | string[] | undefined>(
      REQUIRED_PERMISSION_KEY,
      targets,
    );
    if (!permiso || (Array.isArray(permiso) && permiso.length === 0)) return true;

    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!req.user) throw new UnauthorizedException();

    let alcance = resolverAlcance(req.user, permiso);
    if (!alcance) {
      const permiteAutogestion = this.reflector.getAllAndOverride<boolean>(
        PERMITIR_AUTOGESTION_PROPIA_KEY,
        targets,
      );
      if (permiteAutogestion && Array.isArray(req.user.asignaciones) && req.user.asignaciones.length > 0) {
        alcance = { tipo: 'PROPIO', usuarioId: req.user.sub };
      }
    }

    if (!alcance) {
      const desc = Array.isArray(permiso) ? permiso.join(' | ') : permiso;
      throw new ForbiddenException(`Permiso requerido: ${desc}`);
    }

    req.alcance = alcance;
    return true;
  }
}
