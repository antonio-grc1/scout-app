import { useMemo } from 'react';
import { create } from 'zustand';
import {
  type AsignacionUsuario,
  asignacionOtorgaPermisoUI,
  useAuthStore,
} from '../store/authStore';
import {
  calcularPermisosPanelGlobal,
  obtenerUnidadesEnAlcanceIds,
  tienePermisoConAlcance,
} from '../lib/permisos';

export type ScopeNivel = 'PROPIO' | 'UNIDAD' | 'GLOBAL';

export interface AssignedUnitSummary {
  id: number;
  nombre: string;
  alcance: 'PROPIO' | 'UNIDAD' | 'GLOBAL';
}

export interface Capabilities {
  scope: ScopeNivel;
  esGlobal: boolean;
  esUnidad: boolean;
  esPropio: boolean;
  esMultiRol: boolean;
  permisos: readonly string[];
  unidadesAsignadasIds: number[];
  unidadesAsignadas: AssignedUnitSummary[];
  rolPrincipalLabel: string;
  hasPermiso: (permiso: string) => boolean;
  hasAnyPermiso: (...permisos: string[]) => boolean;

  // Navegación & Módulos principales
  canViewInicio: boolean;
  canViewMiEspacio: boolean;

  // Padrón & Personas
  canViewMiembros: boolean;
  canCreateMiembros: boolean;
  canEditMiembros: boolean;
  canEditIdentidad: boolean;
  canBajaMiembros: boolean;
  canResetClave: boolean;

  // Legajos & Plantillas PDF
  canViewLegajosModule: boolean;
  canCompleteLegajos: boolean;
  canValidateQr: boolean;
  canManagePlantillas: boolean;

  // Pases & Progresión
  canViewPases: boolean;
  canExecutePases: boolean;
  canExecuteEgreso: boolean;

  // Tesorería
  canSeeTesoreriaGestion: boolean;
  canViewFamiliasTesoreria: boolean;
  canViewCuotas: boolean;
  canCobrar: boolean;
  canAjustarCuotas: boolean;
  canGestionarPlanes: boolean;
  canSeeCajaContabilidad: boolean;
  canRegistrarGastos: boolean;
  canSeeBalance: boolean;
  canGestionarRubros: boolean;

  // Eventos Económicos
  canViewEventos: boolean;
  canSellEventos: boolean;
  canConfigureEventos: boolean;
  canCreateGlobalEventos: boolean;

  // Organización, Roles RBAC y SMTP
  canViewOrganizacion: boolean;
  canEditOrganizacion: boolean;
  canViewRoles: boolean;
  canEditRoles: boolean;
  canEditCorreo: boolean;

  // Atajos transversales
  canUseQrScanner: boolean;
}

export function computeCapabilities(asignaciones: readonly AsignacionUsuario[]): Capabilities {
  const esGlobal = asignaciones.some(
    (a) =>
      a.alcance === 'GLOBAL' ||
      Object.values(a.permisosAlcance ?? {}).includes('GLOBAL'),
  );
  const esUnidad =
    !esGlobal &&
    asignaciones.some(
      (a) =>
        a.alcance === 'UNIDAD' ||
        Object.values(a.permisosAlcance ?? {}).includes('UNIDAD'),
    );
  const scope: ScopeNivel = esGlobal ? 'GLOBAL' : esUnidad ? 'UNIDAD' : 'PROPIO';
  const esPropio = scope === 'PROPIO';

  const permisosSet = new Set<string>();
  const unitsMap = new Map<number, AssignedUnitSummary>();

  for (const a of asignaciones) {
    for (const p of a.permisos ?? []) {
      permisosSet.add(p);
      if (p.endsWith('.editar')) {
        permisosSet.add(`${p.slice(0, -7)}.ver`);
      }
    }
    if (typeof a.unidadId === 'number' && Number.isFinite(a.unidadId) && !unitsMap.has(a.unidadId)) {
      const alcanceUnidadVis =
        a.alcance === 'UNIDAD' || Object.values(a.permisosAlcance ?? {}).includes('UNIDAD')
          ? 'UNIDAD'
          : a.alcance;
      unitsMap.set(a.unidadId, {
        id: a.unidadId,
        nombre: a.unidadNombre || `Unidad #${a.unidadId}`,
        alcance: alcanceUnidadVis,
      });
    }
  }

  const permisos = Array.from(permisosSet);
  const hasPermiso = (permiso: string): boolean =>
    asignacionOtorgaPermisoUI(permisos, permiso);
  const hasAnyPermiso = (...reqs: string[]): boolean =>
    reqs.some((p) => asignacionOtorgaPermisoUI(permisos, p));

  const unidadesAsignadasIds = obtenerUnidadesEnAlcanceIds(asignaciones);
  const unidadesAsignadas = Array.from(unitsMap.values());

  const esMultiRol =
    asignaciones.length > 0 &&
    asignaciones.some(
      (a) => a.tipoMiembro === 'EDUCADOR' || a.alcance === 'UNIDAD' || a.alcance === 'GLOBAL',
    );

  const rolPrincipal =
    asignaciones.find((a) => a.alcance === 'GLOBAL')?.rol ||
    asignaciones.find((a) => a.alcance === 'UNIDAD')?.rol ||
    asignaciones[0]?.rol ||
    'Miembro';

  const panelGlobal = calcularPermisosPanelGlobal({
    esGlobal,
    tienePermiso: hasPermiso,
    asignaciones,
  });

  // 1. Panel Padrón y Ficha de Miembro (evaluado por permiso + alcance real ARQ-02)
  const canViewMiembros = tienePermisoConAlcance(
    asignaciones,
    ['padron.ver', 'padron.editar'],
    'UNIDAD',
  );
  const canEditMiembros = tienePermisoConAlcance(asignaciones, ['padron.editar'], 'UNIDAD');
  const canCreateMiembros = canEditMiembros;
  const canEditIdentidad = canEditMiembros;
  const canBajaMiembros = canEditMiembros;
  const canResetClave = canEditMiembros;

  // 2 & 3. Panel Legajos y Panel Plantillas PDF
  const canManagePlantillas = tienePermisoConAlcance(
    asignaciones,
    ['plantillas.editar'],
    'GLOBAL',
  );
  const canViewLegajosModule =
    tienePermisoConAlcance(asignaciones, ['legajos.ver', 'legajos.editar', 'plantillas.ver'], 'UNIDAD') ||
    canManagePlantillas;
  const canCompleteLegajos = tienePermisoConAlcance(asignaciones, ['legajos.editar'], 'PROPIO');
  const canValidateQr = tienePermisoConAlcance(asignaciones, ['legajos.editar'], 'UNIDAD');

  // 4. Panel Pases y Progresión
  const canViewPases = tienePermisoConAlcance(
    asignaciones,
    ['pases.ver', 'pases.editar'],
    'UNIDAD',
  );
  const canExecutePases = tienePermisoConAlcance(asignaciones, ['pases.editar'], 'UNIDAD');
  const canExecuteEgreso = tienePermisoConAlcance(asignaciones, ['pases.editar'], 'GLOBAL');

  // 5, 6 & 7. Paneles de Tesorería (Cobranzas, Planes y Caja/Bancos/Balance por rama A2)
  const canSeeCajaContabilidad = panelGlobal.puedeVerCaja;
  const canRegistrarGastos = tienePermisoConAlcance(asignaciones, ['caja.editar'], 'UNIDAD');
  const canSeeBalance = panelGlobal.puedeVerBalance;
  const canGestionarRubros = tienePermisoConAlcance(asignaciones, ['caja.editar'], 'UNIDAD');

  const canViewCuotas = tienePermisoConAlcance(
    asignaciones,
    ['cobranzas.ver', 'cobranzas.editar', 'planes.ver', 'planes.editar', 'caja.ver', 'caja.editar'],
    'UNIDAD',
  );
  const canCobrar = tienePermisoConAlcance(
    asignaciones,
    ['cobranzas.editar', 'caja.editar'],
    'UNIDAD',
  );
  const canAjustarCuotas = canCobrar;
  const canGestionarPlanes = tienePermisoConAlcance(
    asignaciones,
    ['planes.editar', 'caja.editar'],
    'UNIDAD',
  );
  const canViewFamiliasTesoreria =
    panelGlobal.puedeVerFamilias || canViewCuotas || canCobrar;

  const canSeeTesoreriaGestion =
    canSeeCajaContabilidad ||
    canRegistrarGastos ||
    canSeeBalance ||
    canViewCuotas ||
    canGestionarPlanes ||
    canViewFamiliasTesoreria;

  // 8. Panel Eventos Económicos (A1, A3)
  const canViewEventos = tienePermisoConAlcance(
    asignaciones,
    ['eventos.ver', 'eventos.editar', 'caja.editar'],
    'PROPIO',
  );
  const canSellEventos = tienePermisoConAlcance(
    asignaciones,
    ['eventos.editar', 'caja.editar'],
    'UNIDAD',
  );
  const canCreateGlobalEventos = tienePermisoConAlcance(
    asignaciones,
    ['eventos.editar', 'caja.editar'],
    'GLOBAL',
  );
  // Crear, editar, eliminar y acreditar ganancias de eventos es solo GLOBAL en el backend
  // (tesoreria-eventos.service.ts); con alcance UNIDAD esas acciones siempre daban 403.
  const canConfigureEventos = canCreateGlobalEventos;

  // 9 & 10. Panel Organización, Roles y Correo (A5)
  const canViewOrganizacion = panelGlobal.puedeVerOrganizacion;
  const canEditOrganizacion = tienePermisoConAlcance(
    asignaciones,
    ['organizacion.editar'],
    'GLOBAL',
  );
  const canViewRoles = panelGlobal.puedeVerRoles;
  const canEditRoles = tienePermisoConAlcance(asignaciones, ['roles.editar'], 'GLOBAL');
  const canEditCorreo = panelGlobal.puedeVerCorreo;

  const canUseQrScanner = canValidateQr || canSellEventos;

  return {
    scope,
    esGlobal,
    esUnidad,
    esPropio,
    esMultiRol,
    permisos,
    unidadesAsignadasIds,
    unidadesAsignadas,
    rolPrincipalLabel: rolPrincipal,
    hasPermiso,
    hasAnyPermiso,
    canViewInicio: asignaciones.length > 0,
    canViewMiEspacio: asignaciones.length > 0,
    canViewMiembros,
    canCreateMiembros,
    canEditMiembros,
    canEditIdentidad,
    canBajaMiembros,
    canResetClave,
    canViewLegajosModule,
    canCompleteLegajos,
    canValidateQr,
    canManagePlantillas,
    canViewPases,
    canExecutePases,
    canExecuteEgreso,
    canSeeTesoreriaGestion,
    canViewFamiliasTesoreria,
    canViewCuotas,
    canCobrar,
    canAjustarCuotas,
    canGestionarPlanes,
    canSeeCajaContabilidad,
    canRegistrarGastos,
    canSeeBalance,
    canGestionarRubros,
    canViewEventos,
    canSellEventos,
    canConfigureEventos,
    canCreateGlobalEventos,
    canViewOrganizacion,
    canEditOrganizacion,
    canViewRoles,
    canEditRoles,
    canEditCorreo,
    canUseQrScanner,
  };
}

interface ActiveUnitState {
  activeUnitId: 'ALL' | number;
  setActiveUnitId: (unitId: 'ALL' | number) => void;
  resetActiveUnit: () => void;
}

export const useActiveUnitStore = create<ActiveUnitState>((set) => ({
  activeUnitId: 'ALL',
  setActiveUnitId: (unitId) => set({ activeUnitId: unitId }),
  resetActiveUnit: () => set({ activeUnitId: 'ALL' }),
}));

let ultimoUsuarioId = useAuthStore.getState().usuario?.id ?? null;
useAuthStore.subscribe((state) => {
  const nextId = state.usuario?.id ?? null;
  if (nextId !== ultimoUsuarioId) {
    ultimoUsuarioId = nextId;
    useActiveUnitStore.getState().resetActiveUnit();
  }
});

export interface VisibleUnitOption {
  id: number;
  nombre: string;
  /** Rama o categoría a la que pertenece (para agrupar el selector). */
  grupo?: string;
  /** Cantidad de asignaciones activas, si el backend la informa. */
  miembrosActivos?: number;
}

interface UnidadOrgLike {
  id: number | string;
  nombre: string;
  activa?: boolean;
  tipo?: string;
  rama?: { nombre?: string | null } | null;
  _count?: { asignaciones?: number };
}

function grupoDeUnidad(u: UnidadOrgLike): string {
  if (u.rama?.nombre) return `Rama ${u.rama.nombre}`;
  if (u.tipo === 'JEFATURA') return 'Jefatura';
  if (u.tipo === 'SIN_RAMA_APOYO') return 'Sin rama / Apoyo';
  return 'Otras unidades';
}

/**
 * Devuelve las unidades visibles para el selector de vista según las capacidades del usuario.
 */
export function obtenerUnidadesVisibles(
  caps: Pick<Capabilities, 'esGlobal' | 'unidadesAsignadas'>,
  unidadesOrg?: readonly UnidadOrgLike[],
): VisibleUnitOption[] {
  if (caps.esGlobal && Array.isArray(unidadesOrg) && unidadesOrg.length > 0) {
    return unidadesOrg
      .filter((u) => u.activa !== false)
      .map((u) => ({
        id: Number(u.id),
        nombre: String(u.nombre),
        grupo: grupoDeUnidad(u),
        miembrosActivos:
          typeof u._count?.asignaciones === 'number' ? u._count.asignaciones : undefined,
      }));
  }
  const unidadesGestion = caps.unidadesAsignadas.filter((u) => u.alcance === 'UNIDAD');
  const lista = unidadesGestion.length > 0 ? unidadesGestion : caps.unidadesAsignadas;
  return lista.map((u) => ({ id: u.id, nombre: u.nombre }));
}

/**
 * Resuelve la etiqueta visible de la unidad o grupo activo para el usuario.
 */
export function obtenerNombreUnidadActiva(
  activeUnitId: 'ALL' | number,
  caps: Pick<Capabilities, 'esGlobal' | 'unidadesAsignadas'>,
  unidadesOrg?: readonly { id: number | string; nombre: string; activa?: boolean }[],
  etiquetaMultiUnidad = 'Todas tus unidades',
): string {
  if (activeUnitId === 'ALL') {
    if (caps.esGlobal) return 'Todo el grupo';
    const visibles = obtenerUnidadesVisibles(caps);
    if (visibles.length === 1) return visibles[0].nombre;
    return etiquetaMultiUnidad;
  }
  const enOrg = Array.isArray(unidadesOrg)
    ? unidadesOrg.find((u) => Number(u.id) === activeUnitId)
    : undefined;
  if (enOrg?.nombre) return String(enOrg.nombre);
  const enAsignadas = caps.unidadesAsignadas.find((u) => u.id === activeUnitId);
  return enAsignadas?.nombre || 'Sección seleccionada';
}

export function useCapabilities(): Capabilities {
  const asignaciones = useAuthStore((s) => s.asignaciones);
  return useMemo(() => computeCapabilities(asignaciones), [asignaciones]);
}
