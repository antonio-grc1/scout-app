import { useAuthStore } from '../store/authStore';
import {
  esRolAlcanceGlobal,
  esRolDeEducador,
  esRolDeProtagonista,
  rolRequiereRama,
} from './formatters';

/**
 * Mapa central de qué permiso habilita ver/editar cada módulo y campo de la UI.
 * Debe mantenerse sincronizado con los @RequirePermission del backend.
 */
const PERMISOS_EDICION: Record<string, Record<string, string[]>> = {
  miembro: {
    identidad: ['miembros.editar_identidad'], // nombre, apellido, dni, fechaNacimiento
    contacto: ['miembros.editar'], // teléfonos, email, familiares, domicilio, salud
    estado: ['miembros.baja'], // activo / baja
    familia: ['miembros.editar', 'cuotas.ajustar', 'tesoreria.gestionar'], // vincular / quitar hermanos
    descuentoFamiliar: ['cuotas.ajustar', 'tesoreria.gestionar', 'tesoreria.conceptos_planes'],
    disolverFamilia: ['tesoreria.gestionar'],
    clave: ['auth.resetear_clave'],
    pase: ['pases.ejecutar'],
  },
  cuotas: {
    cobrar: ['cuotas.cobrar'],
    cargoIndividual: ['cuotas.cobrar', 'cuotas.ajustar', 'tesoreria.conceptos_planes'],
    editarCargo: ['cuotas.ajustar', 'tesoreria.gestionar'],
    anularCargo: ['cuotas.ajustar', 'tesoreria.gestionar'],
    editarPago: ['cuotas.ajustar', 'tesoreria.gestionar'],
    revertirPago: ['cuotas.ajustar', 'tesoreria.gestionar'],
    ajustarSaldo: ['cuotas.ajustar', 'tesoreria.gestionar'],
  },
  ficha: {
    completar: ['legajos.completar'],
    validarFisico: ['legajos.validar_fisico'],
    plantillas: ['legajos.plantillas_gestionar'],
  },
  organizacion: {
    gestionar: ['organizacion.gestionar'],
  },
  roles: {
    gestionar: ['roles.gestionar', 'organizacion.gestionar'],
  },
  tesoreria: {
    gestionar: ['tesoreria.gestionar'],
    caja: ['tesoreria.caja_ver', 'tesoreria.gestionar'],
    gastos: ['tesoreria.gastos_registrar', 'tesoreria.gestionar'],
    conceptos: ['tesoreria.conceptos_planes', 'tesoreria.gestionar'],
  },
  eventos: {
    ver: ['eventos.ver', 'eventos.vender', 'eventos.gestionar'],
    vender: ['eventos.vender', 'eventos.gestionar'],
    gestionar: ['eventos.gestionar'],
  },
};

const PERMISOS_LECTURA: Record<string, string[]> = {
  cuotas: ['cuotas.ver', 'cuotas.cobrar', 'cuotas.ajustar', 'tesoreria.gestionar'],
  ficha: ['legajos.ver', 'legajos.completar', 'legajos.validar_fisico', 'legajos.plantillas_gestionar'],
  plantillas: ['legajos.plantillas_gestionar', 'legajos.ver'],
  pase: ['pases.ver', 'pases.ejecutar'],
  clave: ['auth.resetear_clave'],
  organizacion: ['organizacion.ver', 'organizacion.gestionar'],
  roles: ['organizacion.ver', 'roles.gestionar', 'organizacion.gestionar'],
  tesoreria: ['tesoreria.caja_ver', 'tesoreria.gastos_registrar', 'tesoreria.conceptos_planes', 'tesoreria.gestionar'],
  eventos: ['eventos.ver', 'eventos.vender', 'eventos.gestionar'],
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
  puedeVerPadron: () => boolean;
  puedeAccederPanelGestion: () => boolean;
}): string {
  if (!opts.token) return '/login';
  if (opts.requiereCambioClave) return '/cambiar-clave';
  if (opts.puedeVerPadron()) return '/rama';
  if (opts.puedeAccederPanelGestion()) return '/global';
  return '/autogestion';
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
    esGlobal && (tienePermiso('tesoreria.caja_ver') || tienePermiso('tesoreria.gestionar'));
  const puedeVerGastos =
    esGlobal &&
    (tienePermiso('tesoreria.gastos_registrar') ||
      tienePermiso('tesoreria.caja_ver') ||
      tienePermiso('tesoreria.gestionar'));
  const puedeVerBalance =
    esGlobal && (tienePermiso('tesoreria.caja_ver') || tienePermiso('tesoreria.gestionar'));

  const puedeVerEventos =
    tienePermiso('eventos.ver') ||
    tienePermiso('eventos.vender') ||
    tienePermiso('eventos.gestionar') ||
    tienePermiso('tesoreria.gestionar');

  const puedeVerPlanes =
    tienePermiso('tesoreria.conceptos_planes') ||
    tienePermiso('tesoreria.gestionar') ||
    tienePermiso('cuotas.ver');

  const puedeVerCampamentos =
    tienePermiso('tesoreria.conceptos_planes') ||
    tienePermiso('tesoreria.gestionar') ||
    tienePermiso('cuotas.ver');

  const puedeVerFamilias =
    tienePermiso('tesoreria.gestionar') ||
    tienePermiso('cuotas.ajustar') ||
    tienePermiso('cuotas.ver') ||
    tienePermiso('miembros.editar');

  const puedeVerTesoreria =
    puedeVerCaja ||
    puedeVerGastos ||
    puedeVerBalance ||
    puedeVerEventos ||
    puedeVerPlanes ||
    puedeVerCampamentos ||
    puedeVerFamilias;

  const puedeVerColaboradores = tienePermiso('legajos.ver');
  const puedeVerOrganizacion =
    tienePermiso('organizacion.ver') || tienePermiso('organizacion.gestionar');
  const puedeVerRoles =
    tienePermiso('roles.gestionar') ||
    tienePermiso('organizacion.gestionar') ||
    tienePermiso('organizacion.ver');
  const puedeVerPases = tienePermiso('pases.ver');
  const puedeVerPlantillas = tienePermiso('legajos.ver');
  const puedeVerCorreo = asignaciones.some(
    (a) =>
      a.alcance === 'GLOBAL' &&
      (a.permisos.includes('organizacion.gestionar') || a.permisos.includes('roles.gestionar')),
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
