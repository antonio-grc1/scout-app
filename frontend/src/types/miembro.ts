export type TipoUnidad = 'SECCION_RAMA' | 'JEFATURA' | 'SIN_RAMA_APOYO';

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
  tipo: TipoUnidad | string;
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
  tipoUnidad?: TipoUnidad | string;
  esSistema?: boolean;
  activo?: boolean;
  permisos?: string[];
  permisosAlcance?: Record<string, 'PROPIO' | 'UNIDAD' | 'GLOBAL'>;
}

export interface AsignacionHistorial {
  id: number;
  unidadId: number;
  rolId: number;
  cicloAnio: number;
  fechaInicio: string;
  fechaFin?: string | null;
  activo: boolean;
  unidad: UnidadDetalle;
  rol: RolDetalle;
}
