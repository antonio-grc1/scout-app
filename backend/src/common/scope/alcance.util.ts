import { ForbiddenException } from '@nestjs/common';
import { AlcanceRol, type Prisma } from '@prisma/client';
import type { AlcanceAcceso, AuthUser } from '../types/auth.types.js';
import { maximoAlcance } from './permisos-catalogo.js';

/**
 * Devuelve todas las claves presentes en `permisosAsignacion` que satisfacen `requerido`.
 * Poseer `<panel>.editar` implica automáticamente `<panel>.ver`.
 */
export function clavesQueSatisfacenPermiso(
  permisosAsignacion: readonly string[],
  requerido: string,
): string[] {
  if (!Array.isArray(permisosAsignacion)) return [];
  const res: string[] = [];
  if (permisosAsignacion.includes(requerido)) {
    res.push(requerido);
  }
  if (requerido.endsWith('.ver')) {
    const base = requerido.slice(0, -4);
    const editClave = `${base}.editar`;
    if (permisosAsignacion.includes(editClave)) res.push(editClave);
    if (requerido === 'legajos.ver') {
      if (permisosAsignacion.includes('plantillas.ver')) res.push('plantillas.ver');
      if (permisosAsignacion.includes('plantillas.editar')) res.push('plantillas.editar');
    }
    if (requerido === 'cobranzas.ver' || requerido === 'planes.ver' || requerido === 'eventos.ver') {
      if (permisosAsignacion.includes('caja.editar')) res.push('caja.editar');
    }
    if (requerido === 'roles.ver') {
      if (permisosAsignacion.includes('organizacion.ver')) res.push('organizacion.ver');
      if (permisosAsignacion.includes('organizacion.editar')) res.push('organizacion.editar');
    }
    if (requerido === 'organizacion.ver') {
      if (permisosAsignacion.includes('roles.ver')) res.push('roles.ver');
      if (permisosAsignacion.includes('roles.editar')) res.push('roles.editar');
    }
  }
  return res;
}

/**
 * Evalúa si una lista de permisos de una asignación satisface el permiso requerido.
 * Poseer `<panel>.editar` implica automáticamente `<panel>.ver`.
 */
export function asignacionOtorgaPermiso(permisosAsignacion: readonly string[], requerido: string): boolean {
  return clavesQueSatisfacenPermiso(permisosAsignacion, requerido).length > 0;
}

export function obtenerAlcancePermisoEnAsignacion(
  asig: {
    alcance: AlcanceRol;
    permisos: readonly string[];
    permisosAlcance?: Record<string, AlcanceRol>;
  },
  requerido: string,
): AlcanceRol | null {
  const claves = clavesQueSatisfacenPermiso(asig.permisos, requerido);
  if (claves.length === 0) return null;
  const alcances = claves.map((c) => asig.permisosAlcance?.[c] ?? asig.alcance);
  return maximoAlcance(alcances);
}

/**
 * Calcula el alcance efectivo de un usuario para un permiso dado,
 * combinando todas sus asignaciones activas que otorgan ese permiso.
 * Devuelve `null` si ninguna asignación lo otorga.
 */
export function resolverAlcance(user: AuthUser, permiso: string | string[]): AlcanceAcceso | null {
  if (!user?.asignaciones?.length) return null;
  const listaPermisos = Array.isArray(permiso) ? permiso : [permiso];

  let tieneGlobal = false;
  const unidadIds = new Set<number>();
  let tienePropio = false;

  for (const a of user.asignaciones) {
    if (!Array.isArray(a.permisos)) continue;
    const alcancesParaReq = listaPermisos
      .map((req) => obtenerAlcancePermisoEnAsignacion(a, req))
      .filter((x): x is AlcanceRol => x !== null);
    if (alcancesParaReq.length === 0) continue;

    const maxEnAsig = maximoAlcance(alcancesParaReq);
    if (maxEnAsig === AlcanceRol.GLOBAL) {
      tieneGlobal = true;
    } else if (maxEnAsig === AlcanceRol.UNIDAD) {
      unidadIds.add(a.unidadId);
    } else {
      tienePropio = true;
    }
  }

  if (tieneGlobal) {
    return { tipo: 'GLOBAL' };
  }
  if (unidadIds.size > 0) {
    return { tipo: 'UNIDAD', unidadIds: [...unidadIds], usuarioIdPropio: user.sub };
  }
  if (tienePropio) {
    return { tipo: 'PROPIO', usuarioId: user.sub };
  }
  return null;
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
export function assertUnidadEnAlcance(alcance: AlcanceAcceso, unidadId: number | null | undefined): void {
  if (alcance.tipo === 'GLOBAL') return;
  if (unidadId !== null && unidadId !== undefined && alcance.tipo === 'UNIDAD' && alcance.unidadIds.includes(unidadId)) return;
  throw new ForbiddenException('La unidad está fuera de su alcance');
}

/** Alcance efectivo de una asignación según su rol. */
export function alcanceEfectivo(a: { rol: { alcancePorDefecto: AlcanceRol } }): AlcanceRol {
  return a.rol.alcancePorDefecto;
}

/** Determina el tipo de miembro efectivo priorizando `usuario.tipoMiembro`, luego `rol.tipoMiembro` y por último `alcancePorDefecto`. */
export function tipoMiembroEfectivo(
  rol: { tipoMiembro?: string | null; alcancePorDefecto?: AlcanceRol | null },
  usuario?: { tipoMiembro?: string | null } | null,
): 'PROTAGONISTA' | 'EDUCADOR' {
  if (usuario?.tipoMiembro === 'PROTAGONISTA' || usuario?.tipoMiembro === 'EDUCADOR') {
    return usuario.tipoMiembro;
  }
  if (rol?.tipoMiembro === 'PROTAGONISTA' || rol?.tipoMiembro === 'EDUCADOR') {
    return rol.tipoMiembro;
  }
  return rol?.alcancePorDefecto === AlcanceRol.PROPIO ? 'PROTAGONISTA' : 'EDUCADOR';
}

/** Indica si una asignación corresponde a un rol de educador. */
export function esRolEducadorEfectivo(
  rol: { tipoMiembro?: string | null; alcancePorDefecto?: AlcanceRol | null },
): boolean {
  return tipoMiembroEfectivo(rol) === 'EDUCADOR';
}

export type RolPermisoRelLike =
  | { permiso?: { clave: string } | null; alcance?: AlcanceRol | null }
  | string;

export type RolConPermisosLike = {
  activo?: boolean;
  alcancePorDefecto: AlcanceRol;
  tipoMiembro?: string | null;
  permisos?: ReadonlyArray<RolPermisoRelLike>;
};

export type AsignacionObjetivoLike = {
  unidadId?: number | null;
  rol: RolConPermisosLike;
};

/** Extrae las claves de permisos declaradas en un rol (soporta relaciones Prisma o strings). */
export function extraerClavesPermisosRol(rol: RolConPermisosLike | null | undefined): string[] {
  if (!rol?.permisos) return [];
  return rol.permisos
    .map((p) => (typeof p === 'string' ? p : p.permiso?.clave))
    .filter((c): c is string => typeof c === 'string' && c.length > 0);
}

/** Extrae cada permiso con su alcance efectivo dentro del rol. */
export function extraerPermisosConAlcanceRol(
  rol: RolConPermisosLike | null | undefined,
): Array<{ clave: string; alcance: AlcanceRol }> {
  if (!rol?.permisos) return [];
  const res: Array<{ clave: string; alcance: AlcanceRol }> = [];
  for (const p of rol.permisos) {
    if (typeof p === 'string') {
      if (p.length > 0) res.push({ clave: p, alcance: rol.alcancePorDefecto });
    } else if (p.permiso?.clave) {
      res.push({ clave: p.permiso.clave, alcance: p.alcance ?? rol.alcancePorDefecto });
    }
  }
  return res;
}

/** Indica si un rol activo posee la clave de permiso con alcance GLOBAL. */
export function rolTienePermisoConAlcanceGlobal(
  rol: RolConPermisosLike | null | undefined,
  clavePermiso: string,
): boolean {
  if (!rol || rol.activo === false) return false;
  return extraerPermisosConAlcanceRol(rol).some(
    (p) => p.clave === clavePermiso && p.alcance === AlcanceRol.GLOBAL,
  );
}

/** Verifica que el actor posea alcance GLOBAL y todos los permisos indicados con alcance GLOBAL. */
export function assertActorCubrePermisosGlobales(
  actor: AuthUser,
  permisos: readonly string[],
  mensaje = 'No puede otorgar o modificar permisos que usted no posee con alcance global',
): void {
  const tieneGlobal = Boolean(
    actor?.asignaciones?.some(
      (a) =>
        a.alcance === AlcanceRol.GLOBAL ||
        Object.values(a.permisosAlcance ?? {}).includes(AlcanceRol.GLOBAL),
    ),
  );
  if (!tieneGlobal) {
    throw new ForbiddenException(mensaje);
  }
  for (const p of permisos) {
    if (resolverAlcance(actor, p)?.tipo !== 'GLOBAL') {
      throw new ForbiddenException(mensaje);
    }
  }
}

/** Verifica que el actor domine cada par (permiso, alcance) otorgado o editado en un rol. */
export function assertActorCubrePermisosConAlcance(
  actor: AuthUser,
  permisosAlcance: Record<string, AlcanceRol>,
  mensaje = 'No puede otorgar o modificar permisos con alcance superior al suyo',
): void {
  if (!actor?.asignaciones?.length) {
    throw new ForbiddenException(mensaje);
  }
  for (const [clave, alcanceRequerido] of Object.entries(permisosAlcance)) {
    const alcActor = resolverAlcance(actor, clave);
    if (!alcActor) {
      throw new ForbiddenException(mensaje);
    }
    if (alcanceRequerido === AlcanceRol.GLOBAL && alcActor.tipo !== 'GLOBAL') {
      throw new ForbiddenException(mensaje);
    }
    if (alcanceRequerido === AlcanceRol.UNIDAD && alcActor.tipo === 'PROPIO') {
      throw new ForbiddenException(mensaje);
    }
  }
}

/** Verifica que el actor domine en alcance y permisos a una asignación objetivo. */
export function assertActorDominaAsignacion(
  actor: AuthUser,
  asig: AsignacionObjetivoLike,
  mensaje = 'No posee permisos suficientes sobre el miembro o rol objetivo',
): void {
  if (!actor?.asignaciones?.length) {
    throw new ForbiddenException(mensaje);
  }

  const permisosTarget = extraerPermisosConAlcanceRol(asig.rol);
  const alcanceMaximo =
    permisosTarget.length > 0
      ? maximoAlcance(permisosTarget.map((p) => p.alcance))
      : asig.rol.alcancePorDefecto;

  const esProtagonista =
    alcanceMaximo === AlcanceRol.PROPIO &&
    tipoMiembroEfectivo(asig.rol) === 'PROTAGONISTA';

  const tieneGlobal = actor.asignaciones.some(
    (a) =>
      a.alcance === AlcanceRol.GLOBAL ||
      Object.values(a.permisosAlcance ?? {}).includes(AlcanceRol.GLOBAL),
  );
  const unidadIdsActor = new Set(
    actor.asignaciones
      .filter(
        (a) =>
          a.alcance === AlcanceRol.UNIDAD ||
          Object.values(a.permisosAlcance ?? {}).includes(AlcanceRol.UNIDAD),
      )
      .map((a) => a.unidadId),
  );

  if (esProtagonista) {
    if (tieneGlobal) return;
    if (unidadIdsActor.size === 0) {
      throw new ForbiddenException(mensaje);
    }
    if (asig.unidadId != null && !unidadIdsActor.has(asig.unidadId)) {
      throw new ForbiddenException(mensaje);
    }
    return;
  }

  if (alcanceMaximo === AlcanceRol.GLOBAL && !tieneGlobal) {
    throw new ForbiddenException(mensaje);
  }

  if (!tieneGlobal) {
    const cubiertoPorUnidad =
      asig.unidadId != null ? unidadIdsActor.has(asig.unidadId) : unidadIdsActor.size > 0;
    if (!cubiertoPorUnidad) {
      throw new ForbiddenException(mensaje);
    }
  }

  for (const p of permisosTarget) {
    const alcP = resolverAlcance(actor, p.clave);
    if (!alcP) {
      throw new ForbiddenException(mensaje);
    }
    if (p.alcance === AlcanceRol.GLOBAL) {
      if (alcP.tipo !== 'GLOBAL') throw new ForbiddenException(mensaje);
    } else if (p.alcance === AlcanceRol.UNIDAD) {
      if (alcP.tipo === 'PROPIO') throw new ForbiddenException(mensaje);
      if (alcP.tipo === 'UNIDAD' && asig.unidadId != null && !alcP.unidadIds.includes(asig.unidadId)) {
        throw new ForbiddenException(mensaje);
      }
    }
  }
}

/** Verifica que el actor domine todas las asignaciones activas del usuario objetivo. */
export function assertActorDominaObjetivo(
  actor: AuthUser,
  asignacionesObjetivo: readonly AsignacionObjetivoLike[],
  mensaje = 'No posee asignaciones activas suficientes',
): void {
  if (!actor?.asignaciones?.length) {
    throw new ForbiddenException(mensaje);
  }
  for (const asig of asignacionesObjetivo) {
    assertActorDominaAsignacion(actor, asig, mensaje);
  }
}

/**
 * Evita escalada de privilegios: solo quien opera con alcance GLOBAL puede
 * otorgar (o modificar a alguien que tenga) alcance GLOBAL y nadie puede
 * otorgar un rol con permisos superiores a los propios.
 */
export function assertPuedeOtorgar(
  alcance: AlcanceAcceso,
  rol: RolConPermisosLike,
  actor?: AuthUser,
  unidadDestinoId?: number | null,
): void {
  if (alcance.tipo !== 'GLOBAL' && rol.alcancePorDefecto === AlcanceRol.GLOBAL) {
    throw new ForbiddenException('Solo un usuario con alcance global puede otorgar alcance global');
  }
  if (actor) {
    assertActorDominaAsignacion(
      actor,
      { rol, unidadId: unidadDestinoId },
      'No puede otorgar un rol con permisos superiores a los suyos',
    );
  }
}
