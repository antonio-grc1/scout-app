import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { PermisoSistema } from '../scope/permisos-catalogo.js';
import type { AlcanceAcceso, AuthenticatedRequest, AuthUser } from '../types/auth.types.js';

export const IS_PUBLIC_KEY = 'auth:isPublic';
export const PERMITIR_CLAVE_PENDIENTE_KEY = 'auth:permitirClavePendiente';
export const REQUIRED_PERMISSION_KEY = 'rbac:requiredPermission';
export const PERMITIR_AUTOGESTION_PROPIA_KEY = 'rbac:permitirAutogestionPropia';

/** Marca un endpoint como accesible sin JWT. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Permite el acceso aunque el usuario aún deba cambiar su clave inicial. */
export const PermitirClavePendiente = () => SetMetadata(PERMITIR_CLAVE_PENDIENTE_KEY, true);

/** Exige un permiso (clave del catálogo) y calcula el alcance en `req.alcance`. */
export const RequirePermission = (clave: PermisoSistema) =>
  SetMetadata(REQUIRED_PERMISSION_KEY, clave);

/** Permite el acceso si el usuario cuenta con cualquiera de los permisos indicados. */
export const RequireAnyPermission = (...claves: PermisoSistema[]) =>
  SetMetadata(REQUIRED_PERMISSION_KEY, claves);

/**
 * Habilita explícitamente el alcance `PROPIO` (recursos del propio usuario) cuando la
 * operación requiere autogestión personal aun sin tener el permiso asignado en el rol.
 */
export const PermitirAutogestionPropia = () => SetMetadata(PERMITIR_AUTOGESTION_PROPIA_KEY, true);

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
