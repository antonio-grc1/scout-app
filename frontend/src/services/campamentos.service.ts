import { api } from '../api/client';

export type EstadoCampamento = 'BORRADOR' | 'PUBLICADO' | 'CERRADO' | 'FINALIZADO' | 'CANCELADO';
export type EstadoInscripcionCampamento = 'PENDIENTE' | 'CONFIRMADO' | 'NO_ASISTE' | 'CANCELADO';
export type DestinatarioCampamentoTipo = 'TODOS' | 'PROTAGONISTAS' | 'EDUCADORES' | 'USUARIOS';

export interface CampamentoResumenPersona {
  id: number;
  nombre: string;
  apellido: string;
}

export interface MiCampamentoItem {
  inscripcionId: number;
  estadoInscripcion: EstadoInscripcionCampamento;
  observaciones: string | null;
  confirmadoAt: string | null;
  fichaValidada: boolean;
  estadoFicha: string;
  limiteVencido: boolean;
  puedeConfirmar: boolean;
  puedeCancelar: boolean;
  montoEstimado: {
    montoOriginal: number;
    montoDescuento: number;
    montoFinal: number;
  };
  cargo: {
    id: number;
    montoOriginal: number;
    montoDescuento: number;
    montoFinal: number;
    montoPagado: number;
    estado: 'PENDIENTE' | 'PARCIAL' | 'PAGADO' | 'ANULADO';
  } | null;
  campamento: {
    id: number;
    titulo: string;
    descripcion: string | null;
    lugar: string;
    fechaInicio: string;
    fechaFin: string;
    fechaLimiteConfirmacion: string | null;
    estado: EstadoCampamento;
    cicloAnio: number;
    costoBase: number;
    permiteDescuentoHermanos: boolean;
    porcentajeDescuentoHermanos: number | null;
    unidadId: number | null;
    unidadNombre: string | null;
    unidades: Array<{ id: number; nombre: string }>;
    unidadesIds: number[];
    creadoPor: CampamentoResumenPersona;
  };
}

export interface CampamentoGestionItem {
  id: number;
  titulo: string;
  descripcion: string | null;
  lugar: string;
  fechaInicio: string;
  fechaFin: string;
  fechaLimiteConfirmacion: string | null;
  estado: EstadoCampamento;
  destinatarioTipo: DestinatarioCampamentoTipo;
  unidadId: number | null;
  unidadNombre: string | null;
  unidades: Array<{ id: number; nombre: string }>;
  unidadesIds: number[];
  usuariosInvitados?: Array<{ id: number; nombre: string; apellido: string; dni: string }>;
  cicloAnio: number;
  costoBase: number;
  permiteDescuentoHermanos: boolean;
  porcentajeDescuentoHermanos: number | null;
  rubroId: number | null;
  rubroNombre: string | null;
  creadoPor: CampamentoResumenPersona;
  createdAt: string;
  resumen: {
    totalInvitados: number;
    confirmados: number;
    pendientes: number;
    noAsisten: number;
    cancelados: number;
    totalFacturado: number;
    totalRecaudado: number;
  };
}

export interface CampamentoInscripcionDetalle {
  id: number;
  usuarioId: number;
  estado: EstadoInscripcionCampamento;
  observaciones: string | null;
  confirmadoAt: string | null;
  fichaValidada: boolean;
  estadoFicha: string;
  usuario: {
    id: number;
    nombre: string;
    apellido: string;
    dni: string;
    tipoMiembro: string;
    unidadNombre: string | null;
  };
  cargo: {
    id: number;
    montoOriginal: number;
    montoDescuento: number;
    montoFinal: number;
    montoPagado: number;
    estado: 'PENDIENTE' | 'PARCIAL' | 'PAGADO' | 'ANULADO';
  } | null;
}

export interface CampamentoDetalleResponse {
  campamento: Omit<CampamentoGestionItem, 'createdAt' | 'resumen'>;
  resumen: CampamentoGestionItem['resumen'];
  inscripciones: CampamentoInscripcionDetalle[];
}

export interface CrearCampamentoPayload {
  titulo: string;
  descripcion?: string | null;
  lugar: string;
  fechaInicio: string;
  fechaFin: string;
  fechaLimiteConfirmacion?: string | null;
  estado?: 'BORRADOR' | 'PUBLICADO';
  destinatarioTipo: DestinatarioCampamentoTipo;
  unidadId?: number | null;
  unidadesIds?: number[];
  usuariosIds?: number[];
  excepcionesIds?: number[];
  cicloAnio?: number;
  costoBase: number;
  permiteDescuentoHermanos?: boolean;
  porcentajeDescuentoHermanos?: number | null;
  rubroId?: number | null;
  notificarAviso?: boolean;
  notificarPush?: boolean;
  notificarEmail?: boolean;
}

export interface EditarCampamentoPayload {
  titulo?: string;
  descripcion?: string | null;
  lugar?: string;
  fechaInicio?: string;
  fechaFin?: string;
  fechaLimiteConfirmacion?: string | null;
  estado?: EstadoCampamento;
  destinatarioTipo?: DestinatarioCampamentoTipo;
  unidadId?: number | null;
  unidadesIds?: number[];
  usuariosIds?: number[];
  costoBase?: number;
  permiteDescuentoHermanos?: boolean;
  porcentajeDescuentoHermanos?: number | null;
  rubroId?: number | null;
  notificarAviso?: boolean;
  notificarPush?: boolean;
  notificarEmail?: boolean;
}

export async function obtenerMisCampamentos(): Promise<MiCampamentoItem[]> {
  const res = await api.get<MiCampamentoItem[]>('/campamentos/mios');
  return Array.isArray(res.data) ? res.data : [];
}

export async function responderCampamento(
  campamentoId: number,
  accion: 'CONFIRMAR' | 'NO_ASISTE',
  observaciones?: string | null,
) {
  const res = await api.post(`/campamentos/${campamentoId}/responder`, {
    accion,
    observaciones,
  });
  return res.data;
}

export async function obtenerCampamentosGestion(params?: {
  unidadId?: number;
  cicloAnio?: number;
  estado?: EstadoCampamento;
}): Promise<CampamentoGestionItem[]> {
  const res = await api.get<CampamentoGestionItem[]>('/campamentos', { params });
  return Array.isArray(res.data) ? res.data : [];
}

export async function obtenerDetalleCampamento(
  campamentoId: number,
): Promise<CampamentoDetalleResponse> {
  const res = await api.get<CampamentoDetalleResponse>(`/campamentos/${campamentoId}`);
  return res.data;
}

export async function crearCampamento(payload: CrearCampamentoPayload) {
  const res = await api.post('/campamentos', payload);
  return res.data;
}

export async function editarCampamento(
  campamentoId: number,
  payload: EditarCampamentoPayload,
) {
  const res = await api.patch(`/campamentos/${campamentoId}`, payload);
  return res.data;
}

export async function gestionarInscripcionCampamento(
  campamentoId: number,
  usuarioId: number,
  estado: EstadoInscripcionCampamento,
  observaciones?: string | null,
) {
  const res = await api.patch(`/campamentos/${campamentoId}/inscripciones/${usuarioId}`, {
    estado,
    observaciones,
  });
  return res.data as { inscripcion: unknown; saldoLiberado: number };
}

export async function eliminarCampamento(campamentoId: number) {
  const res = await api.delete(`/campamentos/${campamentoId}`);
  return res.data;
}
