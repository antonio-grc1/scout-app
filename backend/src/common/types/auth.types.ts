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
  tokenVersion?: number;
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

export const PERMISOS_SISTEMA = [
  'organizacion.ver',
  'organizacion.gestionar',
  'roles.gestionar',
  'miembros.ver',
  'miembros.crear',
  'miembros.editar',
  'miembros.editar_identidad',
  'miembros.baja',
  'auth.resetear_clave',
  'pases.ver',
  'pases.ejecutar',
  'legajos.ver',
  'legajos.completar',
  'legajos.validar_fisico',
  'legajos.plantillas_gestionar',
  'cuotas.ver',
  'cuotas.cobrar',
  'cuotas.ajustar',
  'tesoreria.conceptos_planes',
  'tesoreria.caja_ver',
  'tesoreria.gastos_registrar',
  'tesoreria.gestionar',
  'eventos.ver',
  'eventos.vender',
  'eventos.gestionar',
] as const;

export type PermisoSistema = (typeof PERMISOS_SISTEMA)[number];
