import { useMemo } from 'react';
import { create } from 'zustand';
import { type AsignacionUsuario, useAuthStore } from '../store/authStore';
import {
  calcularPermisosPanelGlobal,
  obtenerUnidadesEnAlcanceIds,
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
  const esGlobal = asignaciones.some((a) => a.alcance === 'GLOBAL');
  const esUnidad = !esGlobal && asignaciones.some((a) => a.alcance === 'UNIDAD');
  const scope: ScopeNivel = esGlobal ? 'GLOBAL' : esUnidad ? 'UNIDAD' : 'PROPIO';
  const esPropio = scope === 'PROPIO';

  const permisosSet = new Set<string>();
  const unitsMap = new Map<number, AssignedUnitSummary>();

  for (const a of asignaciones) {
    for (const p of a.permisos ?? []) {
      permisosSet.add(p);
    }
    if (typeof a.unidadId === 'number' && Number.isFinite(a.unidadId) && !unitsMap.has(a.unidadId)) {
      unitsMap.set(a.unidadId, {
        id: a.unidadId,
        nombre: a.unidadNombre || `Unidad #${a.unidadId}`,
        alcance: a.alcance,
      });
    }
  }

  const permisos = Array.from(permisosSet);
  const hasPermiso = (permiso: string): boolean => permisosSet.has(permiso);
  const hasAnyPermiso = (...reqs: string[]): boolean => reqs.some((p) => permisosSet.has(p));

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

  // Miembros / Padrón
  const canViewMiembros = (esGlobal || esUnidad) && hasPermiso('miembros.ver');
  const canCreateMiembros = !esPropio && hasPermiso('miembros.crear');
  const canEditMiembros = !esPropio && hasPermiso('miembros.editar');
  const canEditIdentidad = !esPropio && hasPermiso('miembros.editar_identidad');
  const canBajaMiembros = !esPropio && hasPermiso('miembros.baja');
  const canResetClave = !esPropio && hasPermiso('auth.resetear_clave');

  // Legajos
  const canViewLegajosModule =
    !esPropio && hasAnyPermiso('legajos.ver', 'legajos.validar_fisico', 'legajos.plantillas_gestionar');
  const canCompleteLegajos = hasPermiso('legajos.completar');
  const canValidateQr = !esPropio && hasPermiso('legajos.validar_fisico');
  const canManagePlantillas = esGlobal && hasPermiso('legajos.plantillas_gestionar');

  // Pases
  const canViewPases = !esPropio && hasAnyPermiso('pases.ver', 'pases.ejecutar');
  const canExecutePases = !esPropio && hasPermiso('pases.ejecutar');
  const canExecuteEgreso = esGlobal && hasPermiso('pases.ejecutar');

  // Tesorería (Caja / Gastos / Balance requieren alcance GLOBAL en backend)
  const canSeeCajaContabilidad = panelGlobal.puedeVerCaja;
  const canRegistrarGastos = panelGlobal.puedeVerGastos;
  const canSeeBalance = panelGlobal.puedeVerBalance;
  const canGestionarRubros = esGlobal && hasPermiso('tesoreria.gestionar');

  const canViewCuotas =
    !esPropio &&
    hasAnyPermiso('cuotas.ver', 'cuotas.cobrar', 'cuotas.ajustar', 'tesoreria.gestionar');
  const canCobrar = !esPropio && hasAnyPermiso('cuotas.cobrar', 'tesoreria.gestionar');
  const canAjustarCuotas = !esPropio && hasAnyPermiso('cuotas.ajustar', 'tesoreria.gestionar');
  const canGestionarPlanes =
    !esPropio && hasAnyPermiso('tesoreria.conceptos_planes', 'tesoreria.gestionar');
  const canViewFamiliasTesoreria =
    !esPropio && (panelGlobal.puedeVerFamilias || canViewCuotas || canCobrar || canAjustarCuotas);

  const canSeeTesoreriaGestion =
    canSeeCajaContabilidad ||
    canRegistrarGastos ||
    canSeeBalance ||
    canViewCuotas ||
    canGestionarPlanes ||
    canViewFamiliasTesoreria;

  // Eventos económicos
  const canViewEventos = hasAnyPermiso(
    'eventos.ver',
    'eventos.vender',
    'eventos.gestionar',
    'tesoreria.gestionar',
  );
  const canSellEventos =
    !esPropio && hasAnyPermiso('eventos.vender', 'eventos.gestionar', 'tesoreria.gestionar');
  const canConfigureEventos =
    !esPropio && hasAnyPermiso('eventos.gestionar', 'tesoreria.gestionar');
  const canCreateGlobalEventos =
    esGlobal && hasAnyPermiso('eventos.gestionar', 'tesoreria.gestionar');

  // Organización, Roles y SMTP
  const canViewOrganizacion =
    !esPropio && hasAnyPermiso('organizacion.ver', 'organizacion.gestionar', 'roles.gestionar');
  const canEditOrganizacion = esGlobal && hasPermiso('organizacion.gestionar');
  const canViewRoles =
    !esPropio && hasAnyPermiso('organizacion.ver', 'roles.gestionar', 'organizacion.gestionar');
  const canEditRoles = esGlobal && hasAnyPermiso('roles.gestionar', 'organizacion.gestionar');
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
    rolPrincipalLabel: `${rolPrincipal} · Alcance ${scope}`,
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

export function useCapabilities(): Capabilities {
  const asignaciones = useAuthStore((s) => s.asignaciones);
  return useMemo(() => computeCapabilities(asignaciones), [asignaciones]);
}
