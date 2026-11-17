import { useAuthStore } from '../store/authStore';
import {
  esRolAlcanceGlobal,
  esRolDeEducador,
  esRolDeProtagonista,
  rolRequiereRama,
} from './formatters';

/**
 * Mapa central de qué permiso de panel habilita ver/editar cada módulo de la UI.
 * Basado en los 9 paneles con niveles Sin acceso | Solo lectura (.ver) | Edición (.editar).
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
    gestionar: ['organizacion.editar'],
  },
  tesoreria: {
    gestionar: ['caja.editar'],
    caja: ['caja.ver', 'caja.editar'],
    gastos: ['caja.editar'],
    conceptos: ['planes.editar', 'caja.editar'],
  },
  eventos: {
    ver: ['eventos.ver', 'eventos.editar'],
    vender: ['eventos.editar', 'caja.editar'],
    gestionar: ['eventos.editar', 'caja.editar'],
  },
};

const PERMISOS_LECTURA: Record<string, string[]> = {
  miembro: ['padron.ver', 'padron.editar'],
  cuotas: ['cobranzas.ver', 'cobranzas.editar', 'caja.ver', 'caja.editar'],
  ficha: ['legajos.ver', 'legajos.editar', 'plantillas.ver', 'plantillas.editar'],
  plantillas: ['plantillas.ver', 'plantillas.editar'],
  pase: ['pases.ver', 'pases.editar'],
  clave: ['padron.editar'],
  organizacion: ['organizacion.ver', 'organizacion.editar'],
  roles: ['organizacion.ver', 'organizacion.editar'],
  tesoreria: ['cobranzas.ver', 'cobranzas.editar', 'planes.ver', 'planes.editar', 'caja.ver', 'caja.editar'],
  eventos: ['eventos.ver', 'eventos.editar', 'caja.editar'],
};

export function tienePermisoEdicion(
  modulo: string,
  campo: string,
  permisosUsuario: readonly string[],
): boolean {
  return (PERMISOS_EDICION[modulo]?.[campo] ?? []).some((p) =>
    permisosUsuario.includes(p),
  );
}

export const usePermisosUI = () => {
  const tienePermiso = useAuthStore((s) => s.tienePermiso);
  // Suscribirse a asignaciones para re-renderizar cuando cambian los permisos del rol
  useAuthStore((s) => s.asignaciones);

  const canEdit = (modulo: string, campo: string) =>
    (PERMISOS_EDICION[modulo]?.[campo] ?? []).some((p) => tienePermiso(p));

  const canView = (modulo: string) => (PERMISOS_LECTURA[modulo] ?? []).some((p) => tienePermiso(p));

  return { canEdit, canView };
};

export function obtenerRutaInicialUsuario(opts: {
  token: string | null;
  requiereCambioClave: boolean;
  puedeVerPadron?: () => boolean;
  puedeAccederPanelGestion?: () => boolean;
}): string {
  if (!opts.token) return '/login';
  if (opts.requiereCambioClave) return '/cambiar-clave';
  return '/inicio';
}

export interface AsignacionScopeLike {
  alcance: 'PROPIO' | 'UNIDAD' | 'GLOBAL';
  unidadId?: number | null;
}

/**
 * Devuelve los IDs de unidades habilitadas explícitamente por asignaciones de alcance UNIDAD.
 */
export function obtenerUnidadesEnAlcanceIds(asignaciones: readonly AsignacionScopeLike[]): number[] {
  const ids = new Set<number>();
  for (const a of asignaciones) {
    if (a.alcance === 'UNIDAD' && typeof a.unidadId === 'number' && Number.isFinite(a.unidadId)) {
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
 * Calcula qué pestañas y subpestañas del panel /global puede operar el usuario según permiso + alcance.
 */
export function calcularPermisosPanelGlobal(opts: {
  esGlobal: boolean;
  tienePermiso: (p: string) => boolean;
  asignaciones: readonly (AsignacionScopeLike & { permisos: readonly string[] })[];
}): PermisosPanelGlobal {
  const { esGlobal, tienePermiso, asignaciones } = opts;

  // Caja, Gastos y Balance operan sobre cuentas financieras centrales -> requieren alcance GLOBAL en backend
  const puedeVerCaja =
    esGlobal && (tienePermiso('caja.ver') || tienePermiso('caja.editar'));
  const puedeVerGastos =
    esGlobal && (tienePermiso('caja.ver') || tienePermiso('caja.editar'));
  const puedeVerBalance =
    esGlobal && (tienePermiso('caja.ver') || tienePermiso('caja.editar'));

  const puedeVerEventos =
    tienePermiso('eventos.ver') ||
    tienePermiso('eventos.editar') ||
    tienePermiso('caja.editar');

  const puedeVerPlanes =
    tienePermiso('planes.ver') ||
    tienePermiso('planes.editar') ||
    tienePermiso('cobranzas.ver') ||
    tienePermiso('caja.editar');

  const puedeVerCampamentos = puedeVerPlanes;

  const puedeVerFamilias =
    tienePermiso('cobranzas.ver') ||
    tienePermiso('cobranzas.editar') ||
    tienePermiso('padron.editar') ||
    tienePermiso('caja.editar');

  const puedeVerTesoreria =
    puedeVerCaja ||
    puedeVerGastos ||
    puedeVerBalance ||
    puedeVerEventos ||
    puedeVerPlanes ||
    puedeVerCampamentos ||
    puedeVerFamilias;

  const puedeVerColaboradores = tienePermiso('legajos.ver') || tienePermiso('legajos.editar');
  const puedeVerOrganizacion =
    tienePermiso('organizacion.ver') || tienePermiso('organizacion.editar');
  const puedeVerRoles =
    tienePermiso('organizacion.ver') || tienePermiso('organizacion.editar');
  const puedeVerPases = tienePermiso('pases.ver') || tienePermiso('pases.editar');
  const puedeVerPlantillas =
    esGlobal && (tienePermiso('plantillas.ver') || tienePermiso('plantillas.editar'));
  const puedeVerCorreo = asignaciones.some(
    (a) => a.alcance === 'GLOBAL' && a.permisos.includes('organizacion.editar'),
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
 * Filtra roles asignables en altas o importaciones según el alcance del actor
 * y el tipo de unidades disponibles dentro de su alcance.
 */
export function filtrarRolesAsignablesPorAlcance<
  T extends {
    alcance?: string;
    alcancePorDefecto?: string;
    requiereRama?: boolean;
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
): T[] {
  if (esGlobal) return [...roles];

  const tieneUnidadRama = unidadesPermitidas.some(esUnidadRama);
  const tieneUnidadSinRama = unidadesPermitidas.some((u) => !esUnidadRama(u));

  return roles.filter((r) => {
    if (esRolAlcanceGlobal(r)) return false;
    const reqRama = rolRequiereRama(r);
    if (reqRama && !tieneUnidadRama) return false;
    if (!reqRama && !tieneUnidadSinRama) return false;
    return true;
  });
}

/**
 * Indica si un miembro posee alguna asignación activa de alcance GLOBAL.
 * En backend, un usuario sin alcance GLOBAL no puede modificar/resetear/pasar a un usuario GLOBAL.
 */
export function miembroTieneAlcanceGlobal(miembro: {
  alcance?: string;
  asignaciones?: Array<{
    activo?: boolean;
    alcance?: string;
    rol?: { alcance?: string; ambito?: string; categoria?: string; codigo?: string; nombre?: string } | null;
  }>;
} | null | undefined): boolean {
  if (!miembro) return false;
  if (miembro.alcance === 'GLOBAL') return true;
  return (miembro.asignaciones ?? []).some(
    (a) => a.activo !== false && (a.alcance === 'GLOBAL' || esRolAlcanceGlobal(a.rol)),
  );
}

/**
 * Indica si el miembro tiene alguna asignación activa con rol de educador.
 * Solo un actor GLOBAL puede gestionar pases/asignaciones de educadores.
 */
export function miembroEsEducador(miembro: {
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
    ambito?: string;
    categoria?: string;
    codigo?: string;
    nombre?: string;
    tipoMiembro?: string;
  },
>(opts: {
  categoriaDestino: 'RAMA' | 'SIN_RAMA' | 'JEFATURA';
  modoAccion: 'MUDAR' | 'AGREGAR';
  esGlobal: boolean;
  unidadDestinoEnAlcance: boolean;
  rolesRama: readonly T[];
  rolesSinRama: readonly T[];
  rolesJefatura: readonly T[];
}): T[] {
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
