import type { AlcanceRol } from '@prisma/client';
import type { Request } from 'express';

/** Asignación activa tal como viaja dentro del JWT (AGENTS.md §6.1). */
export interface AsignacionToken {
  unidadId: number;
  unidadNombre: string;
  rolId?: number;
  rol: string;
  tipoMiembro?: string;
  requiereRama?: boolean;
  alcance: AlcanceRol;
  permisos: string[];
}

/** Payload firmado en el JWT. */
export interface JwtPayload {
  sub: number;
  dni: string;
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
