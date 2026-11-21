import {
  asignacionOtorgaPermisoUI,
  obtenerAlcancePermisoEnAsignacionUI,
  useAuthStore,
} from '../store/authStore';
import {
  esRolAlcanceGlobal,
  esRolDeEducador,
  esRolDeProtagonista,
  esRolJefe,
  esRolRama,
  esRolSinRama,
} from './formatters';

export type AlcanceRolUI = 'PROPIO' | 'UNIDAD' | 'GLOBAL';

const PESO_ALCANCE: Record<AlcanceRolUI, number> = {
  PROPIO: 1,
  UNIDAD: 2,
  GLOBAL: 3,
};

/**
 * Mapa central de qué permiso de panel habilita ver/editar cada módulo de la UI.
 * Basado en los 10 paneles con niveles Sin acceso | Solo lectura (.ver) | Edición (.editar).
 */
const PERMISOS_EDICION: Record<string, Record<string, string[]>> = {
  miembro: {
    identidad: ['padron.editar'],
    contacto: ['padron.editar'],
    estado: ['padron.editar'],
    familia: ['padron.editar', 'cobranzas.editar', 'caja.editar'],
    descuentoFamiliar: ['cobranzas.editar', 'planes.editar', 'caja.editar'],
    disolverFamilia: ['cobranzas.editar', 'caja.editar'],
    clave: ['padron.editar'],
    pase: ['pases.editar'],
  },
  cuotas: {
    cobrar: ['cobranzas.editar', 'caja.editar'],
    cargoIndividual: ['cobranzas.editar', 'planes.editar', 'caja.editar'],
    editarCargo: ['cobranzas.editar', 'caja.editar'],
    anularCargo: ['cobranzas.editar', 'caja.editar'],
    editarPago: ['cobranzas.editar', 'caja.editar'],
    revertirPago: ['cobranzas.editar', 'caja.editar'],
    ajustarSaldo: ['cobranzas.editar', 'caja.editar'],
  },
  ficha: {
    completar: ['legajos.editar'],
    validarFisico: ['legajos.editar'],
    plantillas: ['plantillas.editar'],
  },
  organizacion: {
    gestionar: ['organizacion.editar'],
  },
  roles: {
    gestionar: ['roles.editar'],
  },
  tesoreria: {
    gestionar: ['caja.editar'],
    caja: ['caja.ver', 'caja.editar'],
    gastos: ['caja.editar'],
    conceptos: ['planes.editar', 'caja.editar'],
  },
  eventos: {
    ver: ['eventos.ver', 'eventos.editar', 'caja.editar'],
    vender: ['eventos.editar', 'caja.editar'],
    gestionar: ['eventos.editar', 'caja.editar'],
  },
};

const PERMISOS_LECTURA: Record<string, string[]> = {
  miembro: ['padron.ver', 'padron.editar'],
  cuotas: ['cobranzas.ver', 'cobranzas.editar', 'caja.ver', 'caja.editar'],
  // Ver la ficha de un miembro (salud, retiro, familiares) exige permiso de legajos:
  // diseñar plantillas (plantillas.*) no habilita leer datos sensibles.
  ficha: ['legajos.ver', 'legajos.editar'],
  plantillas: ['plantillas.ver', 'plantillas.editar'],
  pase: ['pases.ver', 'pases.editar'],
  clave: ['padron.editar'],
  organizacion: ['organizacion.ver', 'organizacion.editar'],
  roles: ['roles.ver', 'roles.editar', 'organizacion.ver', 'organizacion.editar'],
  tesoreria: ['cobranzas.ver', 'cobranzas.editar', 'planes.ver', 'planes.editar', 'caja.ver', 'caja.editar'],
  eventos: ['eventos.ver', 'eventos.editar', 'caja.editar'],
};

export interface AsignacionScopeLike {
  alcance: 'PROPIO' | 'UNIDAD' | 'GLOBAL';
  unidadId?: number | null;
  permisosAlcance?: Record<string, AlcanceRolUI>;
}

export interface AsignacionPermisosLike extends AsignacionScopeLike {
  permisos?: readonly string[];
}

export function tienePermisoConAlcance(
  asignaciones: readonly AsignacionPermisosLike[],
  permisosRequeridos: string | readonly string[],
  alcanceMinimo: AlcanceRolUI = 'PROPIO',
): boolean {
  const lista =
    typeof permisosRequeridos === 'string' ? [permisosRequeridos] : permisosRequeridos;
  const pesoMin = PESO_ALCANCE[alcanceMinimo] ?? 1;
  return asignaciones.some((a) =>
    lista.some((p) => {
      const alc = obtenerAlcancePermisoEnAsignacionUI(a, p);
      if (!alc) return false;
      return (PESO_ALCANCE[alc] ?? 1) >= pesoMin;
    }),
  );
}

export function obtenerUnidadesConPermiso(
  asignaciones: readonly AsignacionPermisosLike[],
  permisosRequeridos: string | readonly string[],
): number[] {
  const lista =
    typeof permisosRequeridos === 'string' ? [permisosRequeridos] : permisosRequeridos;
  const ids = new Set<number>();
  for (const a of asignaciones) {
    if (
      typeof a.unidadId === 'number' &&
      Number.isFinite(a.unidadId) &&
      lista.some((p) => obtenerAlcancePermisoEnAsignacionUI(a, p) === 'UNIDAD')
    ) {
      ids.add(a.unidadId);
    }
  }
  return Array.from(ids);
}

export function actorDominaPermisosRol(
  asignacionesActor: readonly AsignacionPermisosLike[],
  rol: {
    alcance?: string;
    alcancePorDefecto?: string;
    tipoMiembro?: string;
    permisos?: readonly string[];
    permisosAlcance?: Record<string, AlcanceRolUI>;
  },
  unidadDestinoId?: number | null,
): boolean {
  if (!asignacionesActor.length) return false;
  const alcanceRol = (
    String(rol.alcancePorDefecto || rol.alcance || 'PROPIO').toUpperCase()
  ) as AlcanceRolUI;
  const esProtagonista = alcanceRol === 'PROPIO' && esRolDeProtagonista(rol);

  const tieneGlobal = asignacionesActor.some(
    (a) =>
      a.alcance === 'GLOBAL' ||
      Object.values(a.permisosAlcance ?? {}).includes('GLOBAL'),
  );
  if (esProtagonista) {
    if (tieneGlobal) return true;
    const unidadesActor = obtenerUnidadesEnAlcanceIds(asignacionesActor);
    if (unidadesActor.length === 0) return false;
    return unidadDestinoId == null || unidadesActor.includes(unidadDestinoId);
  }

  if (alcanceRol === 'GLOBAL' && !tieneGlobal) return false;

  if (!Array.isArray(rol.permisos)) {
    return true;
  }

  for (const p of rol.permisos) {
    const alcPerm = (rol.permisosAlcance?.[p] ?? alcanceRol) as AlcanceRolUI;
    if (!tienePermisoConAlcance(asignacionesActor, p, alcPerm)) {
      return false;
    }
    if (
      alcPerm === 'UNIDAD' &&
      unidadDestinoId != null &&
      !tienePermisoConAlcance(asignacionesActor, p, 'GLOBAL') &&
      !obtenerUnidadesConPermiso(asignacionesActor, p).includes(unidadDestinoId)
    ) {
      return false;
    }
  }
  return true;
}

export function tienePermisoEdicion(
  modulo: string,
  campo: string,
  permisosUsuario: readonly string[],
): boolean {
  return (PERMISOS_EDICION[modulo]?.[campo] ?? []).some((p) =>
    asignacionOtorgaPermisoUI(permisosUsuario, p),
  );
}

export const usePermisosUI = () => {
  const tienePermiso = useAuthStore((s) => s.tienePermiso);
  const asignaciones = useAuthStore((s) => s.asignaciones);

  const canEdit = (modulo: string, campo: string) =>
    (PERMISOS_EDICION[modulo]?.[campo] ?? []).some((p) => tienePermiso(p));

  const canEditInScope = (
    modulo: string,
    campo: string,
    alcanceMinimo: AlcanceRolUI = 'UNIDAD',
  ) =>
    tienePermisoConAlcance(
      asignaciones,
      PERMISOS_EDICION[modulo]?.[campo] ?? [],
      alcanceMinimo,
    );

  const canView = (modulo: string) =>
    (PERMISOS_LECTURA[modulo] ?? []).some((p) => tienePermiso(p));

  const canViewInScope = (modulo: string, alcanceMinimo: AlcanceRolUI = 'UNIDAD') =>
    tienePermisoConAlcance(asignaciones, PERMISOS_LECTURA[modulo] ?? [], alcanceMinimo);

  return { canEdit, canEditInScope, canView, canViewInScope };
};

export function obtenerRutaInicialUsuario(opts: {
  autenticado?: boolean;
  token?: string | null;
  requiereCambioClave: boolean;
  puedeVerPadron?: () => boolean;
  puedeAccederPanelGestion?: () => boolean;
}): string {
  const estaAutenticado = opts.autenticado ?? Boolean(opts.token);
  if (!estaAutenticado) return '/login';
  if (opts.requiereCambioClave) return '/cambiar-clave';
  return '/inicio';
}

/**
 * Devuelve los IDs de unidades habilitadas explícitamente por asignaciones de alcance UNIDAD.
 */
export function obtenerUnidadesEnAlcanceIds(asignaciones: readonly AsignacionScopeLike[]): number[] {
  const ids = new Set<number>();
  for (const a of asignaciones) {
    const tieneAlcanceUnidad =
      a.alcance === 'UNIDAD' ||
      Object.values(a.permisosAlcance ?? {}).includes('UNIDAD');
    if (tieneAlcanceUnidad && typeof a.unidadId === 'number' && Number.isFinite(a.unidadId)) {
      ids.add(a.unidadId);
    }
  }
  return Array.from(ids);
}

/**
 * Filtra un listado de unidades para mostrar solo las del alcance efectivo del usuario.
 */
export function filtrarUnidadesPorAlcance<T extends { id: number }>(
  unidades: readonly T[],
  opts: { esGlobal: boolean; asignaciones: readonly AsignacionScopeLike[] },
): T[] {
  if (opts.esGlobal) return [...unidades];
  const idsPermitidos = new Set(obtenerUnidadesEnAlcanceIds(opts.asignaciones));
  return unidades.filter((u) => idsPermitidos.has(u.id));
}

/**
 * Un recurso global (unidadId == null) solo se modifica con alcance GLOBAL.
 * Un recurso de rama requiere estar dentro de las unidades asignadas al usuario.
 */
export function puedeModificarPorAlcanceUnidad(
  unidadId: number | null | undefined,
  opts: { esGlobal: boolean; unidadesEnAlcanceIds: readonly number[] },
): boolean {
  if (opts.esGlobal) return true;
  if (typeof unidadId === 'number') {
    return opts.unidadesEnAlcanceIds.includes(unidadId);
  }
  return false;
}

/**
 * Espejo de tesoreria-cuotas.service.ts#actualizarDescuentoFamilia:
 * con alcance UNIDAD solo puede editar si tiene integrantes en su unidad y ninguno en otras secciones.
 */
export function puedeEditarFamiliaPorAlcance(
  familia: {
    miembros?: Array<{
      asignaciones?: Array<{ unidadId?: number | null; unidad?: { id: number } | null }>;
    }>;
  },
  opts: { esGlobal: boolean; unidadesEnAlcanceIds: readonly number[] },
): boolean {
  if (opts.esGlobal) return true;
  const miembros = familia.miembros ?? [];
  const unidadIdDe = (a: { unidadId?: number | null; unidad?: { id: number } | null }) =>
    typeof a.unidadId === 'number' ? a.unidadId : (a.unidad?.id ?? null);

  const tieneEnAlcance = miembros.some((m) =>
    (m.asignaciones ?? []).some((a) => {
      const uid = unidadIdDe(a);
      return uid !== null && opts.unidadesEnAlcanceIds.includes(uid);
    }),
  );
  if (!tieneEnAlcance) return false;

  const tieneFueraDeAlcance = miembros.some((m) => {
    const asigs = m.asignaciones ?? [];
    if (asigs.length === 0) return false;
    return !asigs.some((a) => {
      const uid = unidadIdDe(a);
      return uid !== null && opts.unidadesEnAlcanceIds.includes(uid);
    });
  });

  return !tieneFueraDeAlcance;
}

export interface PermisosPanelGlobal {
  puedeVerCaja: boolean;
  puedeVerGastos: boolean;
  puedeVerBalance: boolean;
  puedeVerEventos: boolean;
  puedeVerPlanes: boolean;
  puedeVerCampamentos: boolean;
  puedeVerFamilias: boolean;
  puedeVerTesoreria: boolean;
  puedeVerColaboradores: boolean;
  puedeVerOrganizacion: boolean;
  puedeVerRoles: boolean;
  puedeVerPases: boolean;
  puedeVerPlantillas: boolean;
  puedeVerCorreo: boolean;
}

/**
 * Calcula qué módulos/pestañas puede operar el usuario según permiso + alcance (A2, A5, ARQ-02).
 */
export function calcularPermisosPanelGlobal(opts: {
  asignaciones: readonly AsignacionPermisosLike[];
  esGlobal?: boolean;
  tienePermiso?: (p: string) => boolean;
}): PermisosPanelGlobal {
  const { asignaciones } = opts;

  // Caja, Gastos y Balance operan por rama para UNIDAD o sobre todo el grupo para GLOBAL (A2)
  const puedeVerCaja = tienePermisoConAlcance(
    asignaciones,
    ['caja.ver', 'caja.editar'],
    'UNIDAD',
  );
  const puedeVerGastos = tienePermisoConAlcance(
    asignaciones,
    ['caja.ver', 'caja.editar'],
    'UNIDAD',
  );
  const puedeVerBalance = tienePermisoConAlcance(
    asignaciones,
    ['caja.ver', 'caja.editar'],
    'UNIDAD',
  );

  const puedeVerEventos = tienePermisoConAlcance(
    asignaciones,
    ['eventos.ver', 'eventos.editar', 'caja.editar'],
    'UNIDAD',
  );

  const puedeVerPlanes = tienePermisoConAlcance(
    asignaciones,
    ['planes.ver', 'planes.editar', 'cobranzas.ver', 'caja.editar'],
    'UNIDAD',
  );

  const puedeVerCampamentos = puedeVerPlanes;

  const puedeVerFamilias = tienePermisoConAlcance(
    asignaciones,
    ['cobranzas.ver', 'cobranzas.editar', 'padron.editar', 'caja.editar'],
    'UNIDAD',
  );

  const puedeVerTesoreria =
    puedeVerCaja ||
    puedeVerGastos ||
    puedeVerBalance ||
    puedeVerEventos ||
    puedeVerPlanes ||
    puedeVerCampamentos ||
    puedeVerFamilias;

  const puedeVerColaboradores = tienePermisoConAlcance(
    asignaciones,
    ['legajos.ver', 'legajos.editar'],
    'UNIDAD',
  );
  const puedeVerOrganizacion =
    tienePermisoConAlcance(asignaciones, ['organizacion.ver'], 'UNIDAD') ||
    tienePermisoConAlcance(asignaciones, ['organizacion.editar'], 'GLOBAL');
  const puedeVerRoles =
    tienePermisoConAlcance(asignaciones, ['roles.ver', 'organizacion.ver'], 'UNIDAD') ||
    tienePermisoConAlcance(asignaciones, ['roles.editar'], 'GLOBAL');
  const puedeVerPases = tienePermisoConAlcance(
    asignaciones,
    ['pases.ver', 'pases.editar'],
    'UNIDAD',
  );
  const puedeVerPlantillas =
    tienePermisoConAlcance(asignaciones, ['plantillas.ver'], 'UNIDAD') ||
    tienePermisoConAlcance(asignaciones, ['plantillas.editar'], 'GLOBAL');
  const puedeVerCorreo = tienePermisoConAlcance(
    asignaciones,
    ['organizacion.editar'],
    'GLOBAL',
  );

  return {
    puedeVerCaja,
    puedeVerGastos,
    puedeVerBalance,
    puedeVerEventos,
    puedeVerPlanes,
    puedeVerCampamentos,
    puedeVerFamilias,
    puedeVerTesoreria,
    puedeVerColaboradores,
    puedeVerOrganizacion,
    puedeVerRoles,
    puedeVerPases,
    puedeVerPlantillas,
    puedeVerCorreo,
  };
}

export const esUnidadRama = (u: { tipo?: string; ramaId?: number | null } | null | undefined): boolean =>
  Boolean(u && (u.tipo === 'SECCION_RAMA' || u.ramaId != null));

export const esUnidadJefatura = (u: { tipo?: string } | null | undefined): boolean =>
  Boolean(u && u.tipo === 'JEFATURA');

export const esUnidadSinRama = (u: { tipo?: string } | null | undefined): boolean =>
  Boolean(u && u.tipo === 'SIN_RAMA_APOYO');

/**
 * Filtra roles asignables en altas o importaciones según el alcance del actor,
 * su dominio de permisos (SEG-01), el estado activo y el tipo de unidad (ARQ-05).
 */
export function filtrarRolesAsignablesPorAlcance<
  T extends {
    activo?: boolean;
    alcance?: string;
    alcancePorDefecto?: string;
    requiereRama?: boolean;
    tipoUnidad?: string;
    permisos?: readonly string[];
    permisosAlcance?: Record<string, AlcanceRolUI>;
    ambito?: string;
    categoria?: string;
    codigo?: string;
    nombre?: string;
    tipoMiembro?: string;
  },
>(
  roles: readonly T[],
  unidadesPermitidas: readonly { tipo?: string; ramaId?: number | null }[],
  esGlobal: boolean,
  asignacionesActor?: readonly AsignacionPermisosLike[],
): T[] {
  const rolesActivos = roles.filter((r) => r.activo !== false);

  if (esGlobal) {
    return asignacionesActor
      ? rolesActivos.filter((r) => actorDominaPermisosRol(asignacionesActor, r))
      : [...rolesActivos];
  }

  const tieneUnidadRama = unidadesPermitidas.some(esUnidadRama);
  const tieneUnidadJefatura = unidadesPermitidas.some(esUnidadJefatura);
  const tieneUnidadSinRama = unidadesPermitidas.some((u) => !esUnidadRama(u));

  return rolesActivos.filter((r) => {
    if (esRolAlcanceGlobal(r)) return false;
    // A3: roles creados con permisosAlcance por panel se asignan libremente a cualquier unidad en alcance
    if (!r.permisosAlcance) {
      if (esRolRama(r) && !tieneUnidadRama) return false;
      if (esRolJefe(r) && !tieneUnidadJefatura) return false;
      if (esRolSinRama(r) && !tieneUnidadSinRama) return false;
    }
    if (asignacionesActor && !actorDominaPermisosRol(asignacionesActor, r)) return false;
    return true;
  });
}

/**
 * Indica si un miembro posee alguna asignación activa de alcance GLOBAL.
 */
export function miembroTieneAlcanceGlobal(miembro: {
  alcance?: string;
  asignaciones?: Array<{
    activo?: boolean;
    alcance?: string;
    permisosAlcance?: Record<string, AlcanceRolUI>;
    rol?: { alcance?: string; ambito?: string; categoria?: string; codigo?: string; nombre?: string } | null;
  }>;
} | null | undefined): boolean {
  if (!miembro) return false;
  if (miembro.alcance === 'GLOBAL') return true;
  return (miembro.asignaciones ?? []).some(
    (a) =>
      a.activo !== false &&
      (a.alcance === 'GLOBAL' ||
        Object.values(a.permisosAlcance ?? {}).includes('GLOBAL') ||
        esRolAlcanceGlobal(a.rol)),
  );
}

/**
 * Indica si el miembro pertenece a categoría EDUCADOR / adulto (prioriza `miembro.tipoMiembro` sobre `rol`).
 */
export function miembroEsEducador(miembro: {
  tipoMiembro?: string | null;
  asignaciones?: Array<{
    activo?: boolean;
    alcance?: string;
    rol?: {
      alcance?: string;
      ambito?: string;
      categoria?: string;
      codigo?: string;
      nombre?: string;
      tipoMiembro?: string;
    } | null;
  }>;
} | null | undefined): boolean {
  if (!miembro) return false;
  if (miembro.tipoMiembro === 'EDUCADOR') return true;
  if (miembro.tipoMiembro === 'PROTAGONISTA') return false;
  return (miembro.asignaciones ?? []).some(
    (a) =>
      a.activo !== false &&
      (a.alcance === 'GLOBAL' || esRolAlcanceGlobal(a.rol) || esRolDeEducador(a.rol)),
  );
}

/**
 * Sin alcance GLOBAL, solo se puede pasar a la misma rama o a la rama
 * inmediatamente siguiente según ordenProgresion.
 */
export function obtenerRamasPermitidasParaPase<
  T extends { id: number; ordenProgresion?: number | null; activa?: boolean },
>(opts: {
  esGlobal: boolean;
  ramas: readonly T[];
  ramaOrigenId?: number | null;
}): T[] {
  const ordenadas = [...opts.ramas]
    .filter((r) => r.activa !== false)
    .sort((a, b) => (a.ordenProgresion ?? 0) - (b.ordenProgresion ?? 0));
  if (opts.esGlobal) return ordenadas;
  if (opts.ramaOrigenId == null) return [];
  const idx = ordenadas.findIndex((r) => r.id === opts.ramaOrigenId);
  if (idx < 0) return [];
  return ordenadas.filter((_, i) => i === idx || i === idx + 1);
}

/**
 * Espejo de miembros.service.ts#desasignarRol:
 * sin alcance GLOBAL no puede cerrar asignaciones propias, globales, de educadores ni de otra unidad.
 */
export function puedeCerrarAsignacionPorAlcance(
  asignacion: {
    alcance?: string;
    unidadId?: number | null;
    unidad?: { id: number } | null;
    rol?: {
      alcance?: string;
      ambito?: string;
      categoria?: string;
      codigo?: string;
      nombre?: string;
      tipoMiembro?: string;
    } | null;
  } | null | undefined,
  opts: {
    esGlobal: boolean;
    unidadesEnAlcanceIds: readonly number[];
    esMismoUsuario: boolean;
  },
): boolean {
  if (!asignacion) return false;
  if (opts.esGlobal) return true;
  if (opts.esMismoUsuario) return false;
  if (asignacion.alcance === 'GLOBAL' || esRolAlcanceGlobal(asignacion.rol) || esRolDeEducador(asignacion.rol)) {
    return false;
  }
  const uid =
    typeof asignacion.unidadId === 'number'
      ? asignacion.unidadId
      : (asignacion.unidad?.id ?? null);
  return uid !== null && opts.unidadesEnAlcanceIds.includes(uid);
}

/**
 * Filtra los roles elegibles en PestanaPaseRol según categoría y alcance:
 * solo un actor GLOBAL puede otorgar o pasar a roles de EDUCADOR o JEFATURA/SIN_RAMA.
 */
export function filtrarRolesParaPase<
  T extends {
    alcance?: string;
    alcancePorDefecto?: string;
    ambito?: string;
    categoria?: string;
    codigo?: string;
    nombre?: string;
    tipoMiembro?: string;
    permisosAlcance?: Record<string, AlcanceRolUI>;
  },
>(opts: {
  categoriaDestino: 'RAMA' | 'SIN_RAMA' | 'JEFATURA';
  modoAccion: 'MUDAR' | 'AGREGAR';
  esGlobal: boolean;
  unidadDestinoEnAlcance: boolean;
  rolesRama: readonly T[];
  rolesSinRama: readonly T[];
  rolesJefatura: readonly T[];
  todosRoles?: readonly T[];
}): T[] {
  if (opts.esGlobal && opts.todosRoles) {
    return [...opts.todosRoles];
  }
  if (!opts.esGlobal) {
    if (opts.categoriaDestino !== 'RAMA') return [];
    return opts.rolesRama.filter((r) => esRolDeProtagonista(r));
  }
  if (opts.categoriaDestino === 'JEFATURA') {
    return [...opts.rolesJefatura];
  }
  if (opts.categoriaDestino === 'SIN_RAMA') {
    return [...opts.rolesSinRama];
  }
  return [...opts.rolesRama];
}

/**
 * Determina si el actor puede desvincular a un integrante de su grupo familiar
 * sin violar el alcance UNIDAD (tesoreria-cuotas.service.ts#desvincularHermano).
 */
export function puedeDesvincularIntegrantePorAlcance(
  integrante: {
    id?: number;
    asignaciones?: Array<{ unidadId?: number | null; unidad?: { id: number } | null }>;
  },
  opts: {
    esGlobal: boolean;
    unidadesEnAlcanceIds: readonly number[];
    miembroActualId?: number;
  },
): boolean {
  if (opts.esGlobal) return true;
  const asigs = integrante?.asignaciones;
  if (!Array.isArray(asigs) || asigs.length === 0) {
    return Boolean(opts.miembroActualId && integrante?.id === opts.miembroActualId);
  }
  return asigs.some((a) => {
    const uid = typeof a?.unidadId === 'number' ? a.unidadId : a?.unidad?.id;
    return typeof uid === 'number' && opts.unidadesEnAlcanceIds.includes(uid);
  });
}

/** IDs de las unidades donde el miembro tiene asignaciones activas. */
export function unidadesActivasDeMiembro(miembro: any): number[] {
  if (!miembro || !Array.isArray(miembro.asignaciones)) return [];
  const ids = new Set<number>();
  for (const a of miembro.asignaciones) {
    if (a?.activo === false) continue;
    const id = Number(a?.unidadId ?? a?.unidad?.id);
    if (Number.isFinite(id) && id > 0) ids.add(id);
  }
  return Array.from(ids);
}

/**
 * ¿El actor tiene alguno de estos permisos sobre al menos una de las unidades indicadas?
 * Con alcance GLOBAL alcanza siempre; con UNIDAD, la unidad debe estar entre las suyas.
 * Sirve para acciones por fila (validar legajo, pasar camada, cobrar) en vez de booleanos globales.
 */
export function tienePermisoSobreUnidades(
  asignaciones: readonly AsignacionPermisosLike[],
  permisos: string | readonly string[],
  unidadIds: readonly (number | null | undefined)[],
): boolean {
  if (tienePermisoConAlcance(asignaciones, permisos, 'GLOBAL')) return true;
  const propias = obtenerUnidadesConPermiso(asignaciones, permisos);
  return unidadIds.some((id) => typeof id === 'number' && propias.includes(id));
}

/** Atajo de `tienePermisoSobreUnidades` usando las unidades activas de un miembro. */
export function tienePermisoSobreMiembro(
  asignaciones: readonly AsignacionPermisosLike[],
  permisos: string | readonly string[],
  miembro: any,
): boolean {
  return tienePermisoSobreUnidades(asignaciones, permisos, unidadesActivasDeMiembro(miembro));
}
