import { api } from '../api/client';

export interface PersonaHistorialUnidad {
  id: number;
  nombre: string;
  apellido: string;
  dni: string;
  activo: boolean;
}

export interface RolHistorialUnidad {
  id: number;
  nombre: string;
  tipoMiembro?: string;
  alcancePorDefecto?: string;
}

export interface AsignacionHistorialUnidad {
  id: number;
  cicloAnio: number;
  fechaInicio: string;
  fechaFin?: string | null;
  activo: boolean;
  alcanceOverride?: string | null;
  miembro?: PersonaHistorialUnidad;
  usuario?: PersonaHistorialUnidad;
  rol: RolHistorialUnidad;
}

export interface RamaHistorialUnidad {
  id: number;
  nombre: string;
  edadMinima?: number;
  edadMaxima?: number;
  ordenProgresion?: number;
  activa?: boolean;
}

export interface ResumenHistorialUnidad {
  totalAsignaciones: number;
  totalEducadoresUnicos?: number;
  totalEducadores?: number;
  totalProtagonistasUnicos?: number;
  totalProtagonistas?: number;
  totalMiembros?: number;
  ciclosOperativos?: number[];
  ciclos?: number[];
  totalCiclos?: number;
}

export interface HistorialUnidadResponse {
  id: number;
  nombre: string;
  tipo: string;
  activa: boolean;
  ramaId: number | null;
  rama?: RamaHistorialUnidad | null;
  resumen?: ResumenHistorialUnidad;
  asignaciones: AsignacionHistorialUnidad[];
}

/**
 * Obtiene el historial completo de una unidad organizativa/sección del grupo (activa o inactiva).
 * Requiere permiso 'organizacion.ver'.
 */
export async function obtenerHistorialUnidad(id: number): Promise<HistorialUnidadResponse> {
  const response = await api.get<HistorialUnidadResponse>(`/organizacion/unidades/${id}/historial`);
  return response.data;
}
