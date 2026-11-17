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
      if (p.endsWith('.editar')) {
        permisosSet.add(`${p.slice(0, -7)}.ver`);
      }
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

  // 1. Panel Padrón y Ficha de Miembro (unifica ver/editar datos, identidad, baja y clave)
  const canViewMiembros = (esGlobal || esUnidad) && hasAnyPermiso('padron.ver', 'padron.editar');
  const canEditMiembros = !esPropio && hasPermiso('padron.editar');
  const canCreateMiembros = canEditMiembros;
  const canEditIdentidad = canEditMiembros;
  const canBajaMiembros = canEditMiembros;
  const canResetClave = canEditMiembros;

  // 2 & 3. Panel Legajos y Panel Plantillas PDF
  const canManagePlantillas = esGlobal && hasPermiso('plantillas.editar');
  const canViewLegajosModule =
    !esPropio &&
    (hasAnyPermiso('legajos.ver', 'legajos.editar') ||
      (esGlobal && hasAnyPermiso('plantillas.ver', 'plantillas.editar')));
  const canCompleteLegajos = hasPermiso('legajos.editar');
  const canValidateQr = !esPropio && hasPermiso('legajos.editar');

  // 4. Panel Pases y Progresión
  const canViewPases = !esPropio && hasAnyPermiso('pases.ver', 'pases.editar');
  const canExecutePases = !esPropio && hasPermiso('pases.editar');
  const canExecuteEgreso = esGlobal && hasPermiso('pases.editar');

  // 5, 6 & 7. Paneles de Tesorería (Cobranzas, Planes, y Caja/Bancos/Balance)
  const canSeeCajaContabilidad = panelGlobal.puedeVerCaja;
  const canRegistrarGastos = esGlobal && hasPermiso('caja.editar');
  const canSeeBalance = panelGlobal.puedeVerBalance;
  const canGestionarRubros = esGlobal && hasPermiso('caja.editar');

  const canViewCuotas =
    !esPropio &&
    hasAnyPermiso('cobranzas.ver', 'cobranzas.editar', 'planes.ver', 'planes.editar', 'caja.ver', 'caja.editar');
  const canCobrar = !esPropio && hasAnyPermiso('cobranzas.editar', 'caja.editar');
  const canAjustarCuotas = canCobrar;
  const canGestionarPlanes =
    !esPropio && hasAnyPermiso('planes.editar', 'caja.editar');
  const canViewFamiliasTesoreria =
    !esPropio && (panelGlobal.puedeVerFamilias || canViewCuotas || canCobrar);

  const canSeeTesoreriaGestion =
    canSeeCajaContabilidad ||
    canRegistrarGastos ||
    canSeeBalance ||
    canViewCuotas ||
    canGestionarPlanes ||
    canViewFamiliasTesoreria;

  // 8. Panel Eventos Económicos
  const canViewEventos = hasAnyPermiso('eventos.ver', 'eventos.editar', 'caja.editar');
  const canSellEventos = !esPropio && hasAnyPermiso('eventos.editar', 'caja.editar');
  const canConfigureEventos = canSellEventos;
  const canCreateGlobalEventos = esGlobal && hasAnyPermiso('eventos.editar', 'caja.editar');

  // 9. Panel Organización, Roles y Correo
  const canViewOrganizacion =
    !esPropio && hasAnyPermiso('organizacion.ver', 'organizacion.editar');
  const canEditOrganizacion = esGlobal && hasPermiso('organizacion.editar');
  const canViewRoles = canViewOrganizacion;
  const canEditRoles = canEditOrganizacion;
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
}

/**
 * Devuelve las unidades visibles para el selector de vista según las capacidades del usuario.
 */
export function obtenerUnidadesVisibles(
  caps: Pick<Capabilities, 'esGlobal' | 'unidadesAsignadas'>,
  unidadesOrg?: readonly { id: number | string; nombre: string; activa?: boolean }[],
): VisibleUnitOption[] {
  if (caps.esGlobal && Array.isArray(unidadesOrg) && unidadesOrg.length > 0) {
    return unidadesOrg
      .filter((u) => u.activa !== false)
      .map((u) => ({ id: Number(u.id), nombre: String(u.nombre) }));
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
