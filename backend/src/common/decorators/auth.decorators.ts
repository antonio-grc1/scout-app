import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { AlcanceAcceso, AuthenticatedRequest, AuthUser } from '../types/auth.types.js';

export const IS_PUBLIC_KEY = 'auth:isPublic';
export const PERMITIR_CLAVE_PENDIENTE_KEY = 'auth:permitirClavePendiente';
export const REQUIRED_PERMISSION_KEY = 'rbac:requiredPermission';

/** Marca un endpoint como accesible sin JWT. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Permite el acceso aunque el usuario aún deba cambiar su clave inicial. */
export const PermitirClavePendiente = () => SetMetadata(PERMITIR_CLAVE_PENDIENTE_KEY, true);

/** Exige un permiso o array de permisos alternativos (claves de la tabla `permisos`) y calcula el alcance en `req.alcance`. */
export const RequirePermission = (claveOClaves: string | string[], ...resto: string[]) => {
  const lista = Array.isArray(claveOClaves)
    ? claveOClaves
    : resto.length > 0
      ? [claveOClaves, ...resto]
      : claveOClaves;
  return SetMetadata(REQUIRED_PERMISSION_KEY, lista);
};

/** Permite el acceso si el usuario cuenta con cualquiera de los permisos indicados. */
export const RequireAnyPermission = (...claves: (string | string[])[]) =>
  SetMetadata(REQUIRED_PERMISSION_KEY, claves.flat());

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
