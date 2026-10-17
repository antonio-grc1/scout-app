import { ForbiddenException } from '@nestjs/common';
import { AlcanceRol, type Prisma } from '@prisma/client';
import type { AlcanceAcceso, AuthUser } from '../types/auth.types.js';

/**
 * Calcula el alcance efectivo de un usuario para un permiso dado,
 * combinando todas sus asignaciones activas que otorgan ese permiso.
 * Devuelve `null` si ninguna asignación lo otorga.
 */
export function resolverAlcance(user: AuthUser, permiso: string): AlcanceAcceso | null {
  const conPermiso = user.asignaciones.filter((a) => a.permisos.includes(permiso));
  if (conPermiso.length === 0) return null;

  if (conPermiso.some((a) => a.alcance === AlcanceRol.GLOBAL)) {
    return { tipo: 'GLOBAL' };
  }

  const unidadIds = [
    ...new Set(conPermiso.filter((a) => a.alcance === AlcanceRol.UNIDAD).map((a) => a.unidadId)),
  ];
  const tienePropio = conPermiso.some((a) => a.alcance === AlcanceRol.PROPIO);

  if (unidadIds.length > 0) {
    return tienePropio
      ? { tipo: 'UNIDAD', unidadIds, usuarioIdPropio: user.sub }
      : { tipo: 'UNIDAD', unidadIds };
  }

  return { tipo: 'PROPIO', usuarioId: user.sub };
}

/**
 * Filtro Prisma que restringe consultas sobre `usuarios` al alcance permitido.
 * Debe combinarse SIEMPRE con el `where` del servicio: `{ AND: [where, filtroUsuariosPorAlcance(alcance)] }`.
 */
export function filtroUsuariosPorAlcance(alcance: AlcanceAcceso): Prisma.UsuarioWhereInput {
  switch (alcance.tipo) {
    case 'GLOBAL':
      return {};
    case 'UNIDAD': {
      const porUnidad: Prisma.UsuarioWhereInput = {
        asignaciones: { some: { activo: true, unidadId: { in: alcance.unidadIds } } },
      };
      return alcance.usuarioIdPropio !== undefined
        ? { OR: [porUnidad, { id: alcance.usuarioIdPropio }] }
        : porUnidad;
    }
    case 'PROPIO':
      return { id: alcance.usuarioId };
  }
}

/**
 * Filtro para recursos que pertenecen a un usuario (entregas, cargos, etc.)
 * mediante su relación `usuario`.
 */
export function filtroPorDuenioSegunAlcance(alcance: AlcanceAcceso): { usuario?: Prisma.UsuarioWhereInput } {
  return alcance.tipo === 'GLOBAL' ? {} : { usuario: filtroUsuariosPorAlcance(alcance) };
}

/** Lanza 403 si la unidad no está dentro del alcance (GLOBAL siempre pasa; PROPIO nunca). */
export function assertUnidadEnAlcance(alcance: AlcanceAcceso, unidadId: number): void {
  if (alcance.tipo === 'GLOBAL') return;
  if (alcance.tipo === 'UNIDAD' && alcance.unidadIds.includes(unidadId)) return;
  throw new ForbiddenException('La unidad está fuera de su alcance');
}

/** Alcance efectivo de una asignación: override o el del rol. */
export function alcanceEfectivo(a: { alcanceOverride: AlcanceRol | null; rol: { alcancePorDefecto: AlcanceRol } }): AlcanceRol {
  return a.alcanceOverride ?? a.rol.alcancePorDefecto;
}

/**
 * Evita escalada de privilegios: solo quien opera con alcance GLOBAL puede
 * otorgar (o modificar a alguien que tenga) alcance GLOBAL.
 */
export function assertPuedeOtorgar(
  alcance: AlcanceAcceso,
  rol: { alcancePorDefecto: AlcanceRol },
  alcanceOverride?: AlcanceRol | null,
): void {
  if (alcance.tipo === 'GLOBAL') return;
  if ((alcanceOverride ?? rol.alcancePorDefecto) === AlcanceRol.GLOBAL) {
    throw new ForbiddenException('Solo un usuario con alcance global puede otorgar alcance global');
  }
}
