import type { AlcanceRol, TipoUnidad } from '@prisma/client';
import type { Request } from 'express';
import { PERMISOS_SISTEMA, type PermisoSistema } from '../scope/permisos-catalogo.js';

/** Asignación activa tal como viaja dentro del JWT / sesión hidratada (AGENTS.md §6.1). */
export interface AsignacionToken {
  unidadId: number;
  unidadNombre: string;
  rolId?: number;
  rol: string;
  tipoMiembro?: string;
  requiereRama?: boolean;
  tipoUnidad?: TipoUnidad;
  alcance: AlcanceRol;
  permisos: string[];
  permisosAlcance?: Record<string, AlcanceRol>;
}

/** Claims mínimos firmados en el JWT liviano (el resto se hidrata desde BD). */
export interface JwtTokenClaims {
  sub: number;
  dni: string;
  tokenVersion?: number;
}

/** Payload de usuario autenticado hidratado en cada request. */
export interface JwtPayload extends JwtTokenClaims {
  requiereCambioClave: boolean;
  asignaciones: AsignacionToken[];
}

/** Usuario autenticado disponible en `req.user`. */
export type AuthUser = JwtPayload;

/**
 * Alcance efectivo calculado por el ScopedRbacGuard para el permiso requerido.
 * - GLOBAL: sin filtro por unidad.
 * - UNIDAD: filtrar por `unidadIds` (y opcionalmente incluir los recursos propios).
 * - PROPIO: solo recursos donde `usuarioId === req.user.sub`.
 */
export type AlcanceAcceso =
  | { tipo: 'GLOBAL' }
  | { tipo: 'UNIDAD'; unidadIds: number[]; usuarioIdPropio?: number }
  | { tipo: 'PROPIO'; usuarioId: number };

export interface AuthenticatedRequest extends Request {
  user: AuthUser;
  alcance?: AlcanceAcceso;
}

export { PERMISOS_SISTEMA, type PermisoSistema };
