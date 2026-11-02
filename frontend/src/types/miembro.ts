export interface RamaDetalle {
  id: number;
  nombre: string;
  ordenProgresion?: number;
  edadMinima?: number;
  edadMaxima?: number;
  activa?: boolean;
}

export interface UnidadDetalle {
  id: number;
  nombre: string;
  tipo: 'SECCION_RAMA' | 'JEFATURA' | 'SIN_RAMA_APOYO' | string;
  activa?: boolean;
  ramaId?: number | null;
  rama?: RamaDetalle | null;
}

export interface RolDetalle {
  id: number;
  nombre: string;
  alcancePorDefecto?: string;
  tipoMiembro?: 'PROTAGONISTA' | 'EDUCADOR' | 'COLABORADOR' | string;
  requiereRama?: boolean;
  activo?: boolean;
}

export interface AsignacionHistorial {
  id: number;
  unidadId: number;
  rolId: number;
  cicloAnio: number;
  fechaInicio: string;
  fechaFin?: string | null;
  activo: boolean;
  alcanceOverride?: string | null;
  unidad: UnidadDetalle;
  rol: RolDetalle;
}
