import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { AlcanceAcceso, AuthenticatedRequest, AuthUser } from '../types/auth.types.js';

export const IS_PUBLIC_KEY = 'auth:isPublic';
export const PERMITIR_CLAVE_PENDIENTE_KEY = 'auth:permitirClavePendiente';
export const REQUIRED_PERMISSION_KEY = 'rbac:requiredPermission';

/** Marca un endpoint como accesible sin JWT. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Permite el acceso aunque el usuario aún deba cambiar su clave inicial. */
export const PermitirClavePendiente = () => SetMetadata(PERMITIR_CLAVE_PENDIENTE_KEY, true);

/** Exige un permiso (clave de la tabla `permisos`) y calcula el alcance en `req.alcance`. */
export const RequirePermission = (clave: string) => SetMetadata(REQUIRED_PERMISSION_KEY, clave);

/** Inyecta el usuario autenticado (`req.user`). */
export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthUser =>
    ctx.switchToHttp().getRequest<AuthenticatedRequest>().user,
);

/** Inyecta el alcance calculado por ScopedRbacGuard para el permiso del endpoint. */
export const Alcance = createParamDecorator((_: unknown, ctx: ExecutionContext): AlcanceAcceso => {
  const alcance = ctx.switchToHttp().getRequest<AuthenticatedRequest>().alcance;
  if (!alcance) {
    throw new Error('@Alcance() requiere que el endpoint tenga @RequirePermission()');
  }
  return alcance;
});
