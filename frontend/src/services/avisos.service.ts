import { api } from '../api/client';

export type PrioridadAviso = 'NORMAL' | 'IMPORTANTE' | 'URGENTE';
export type DestinatarioAvisoTipo = 'TODOS' | 'PROTAGONISTAS' | 'EDUCADORES' | 'USUARIOS';

export interface PersonaResumenAviso {
  id: number;
  nombre: string;
  apellido: string;
}

export interface AvisoBandejaItem {
  id: number;
  titulo: string;
  mensaje: string;
  prioridad: PrioridadAviso;
  destinatarioTipo: DestinatarioAvisoTipo;
  unidadId: number | null;
  unidadNombre: string | null;
  creadoPor: PersonaResumenAviso;
  fechaExpiracion: string | null;
  createdAt: string;
  leidoAt: string | null;
  leido: boolean;
}

export interface BandejaAvisosResponse {
  items: AvisoBandejaItem[];
  total: number;
  noLeidos: number;
}

export interface AvisoEnviadoItem {
  id: number;
  titulo: string;
  mensaje: string;
  prioridad: PrioridadAviso;
  destinatarioTipo: DestinatarioAvisoTipo;
  unidadId: number | null;
  unidadNombre: string | null;
  creadoPor: PersonaResumenAviso;
  fechaExpiracion: string | null;
  createdAt: string;
  enviarPush: boolean;
  enviarEmail: boolean;
  pushEnviados: number;
  emailsEnviados: number;
  totalDestinatarios: number;
  totalLeidos: number;
}

export interface EnviadosAvisosResponse {
  items: AvisoEnviadoItem[];
  total: number;
}

export interface AvisoLecturaDestinatario {
  usuarioId: number;
  nombre: string;
  apellido: string;
  dni: string;
  leidoAt: string | null;
  leido: boolean;
}

export interface AvisoLecturasResponse {
  aviso: Omit<
    AvisoEnviadoItem,
    'totalDestinatarios' | 'totalLeidos' | 'enviarPush' | 'enviarEmail' | 'pushEnviados' | 'emailsEnviados'
  >;
  resumen: {
    total: number;
    leidos: number;
    pendientes: number;
  };
  destinatarios: AvisoLecturaDestinatario[];
}

export interface CrearAvisoPayload {
  titulo: string;
  mensaje: string;
  prioridad: PrioridadAviso;
  destinatarioTipo: DestinatarioAvisoTipo;
  unidadId?: number | null;
  usuariosIds?: number[];
  excepcionesIds?: number[];
  fechaExpiracion?: string | null;
  enviarPush?: boolean;
  enviarEmail?: boolean;
}

export interface CanalesAvisosEstado {
  pushHabilitado: boolean;
  pushPublicKey: string | null;
  pushSuscripcionesUsuario: number;
  emailHabilitado: boolean;
}

export interface SuscripcionPushPayload {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface BandejaAvisosParams {
  soloNoLeidos?: boolean;
  incluirExpirados?: boolean;
  pagina?: number;
  porPagina?: number;
}

export interface EnviadosAvisosParams {
  unidadId?: number;
  pagina?: number;
  porPagina?: number;
}

export async function obtenerBandejaAvisos(
  params: BandejaAvisosParams = {},
): Promise<BandejaAvisosResponse> {
  const res = await api.get<BandejaAvisosResponse>('/avisos/bandeja', { params });
  return res.data;
}

export async function obtenerCountNoLeidos(): Promise<{ count: number }> {
  const res = await api.get<{ count: number }>('/avisos/no-leidos/count');
  return res.data;
}

export async function marcarAvisoLeido(avisoId: number): Promise<{ avisoId: number; leidoAt: string }> {
  const res = await api.patch<{ avisoId: number; leidoAt: string }>(`/avisos/${avisoId}/leer`);
  return res.data;
}

export async function marcarTodosAvisosLeidos(): Promise<{ actualizados: number }> {
  const res = await api.post<{ actualizados: number }>('/avisos/leer-todos');
  return res.data;
}

export async function obtenerAvisosEnviados(
  params: EnviadosAvisosParams = {},
): Promise<EnviadosAvisosResponse> {
  const res = await api.get<EnviadosAvisosResponse>('/avisos/enviados', { params });
  return res.data;
}

export async function obtenerLecturasAviso(avisoId: number): Promise<AvisoLecturasResponse> {
  const res = await api.get<AvisoLecturasResponse>(`/avisos/${avisoId}/lecturas`);
  return res.data;
}

export async function crearAviso(payload: CrearAvisoPayload): Promise<AvisoEnviadoItem> {
  const res = await api.post<AvisoEnviadoItem>('/avisos', payload);
  return res.data;
}

export async function eliminarAviso(avisoId: number): Promise<{ eliminado: boolean; id: number }> {
  const res = await api.delete<{ eliminado: boolean; id: number }>(`/avisos/${avisoId}`);
  return res.data;
}

export async function obtenerEstadoCanalesAvisos(): Promise<CanalesAvisosEstado> {
  const res = await api.get<CanalesAvisosEstado>('/avisos/canales-estado');
  return res.data;
}

export async function suscribirPushAviso(
  payload: SuscripcionPushPayload,
): Promise<{ ok: boolean; id: number }> {
  const res = await api.post<{ ok: boolean; id: number }>('/avisos/push/suscribir', payload);
  return res.data;
}

export async function desuscribirPushAviso(
  endpoint: string,
): Promise<{ ok: boolean; eliminadas: number }> {
  const res = await api.post<{ ok: boolean; eliminadas: number }>('/avisos/push/desuscribir', {
    endpoint,
  });
  return res.data;
}
