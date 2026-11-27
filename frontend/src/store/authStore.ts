import { create } from 'zustand';
import { api, setOnAuthError, setOnRequirePasswordChange } from '../api/client';
import { limpiarCacheApi } from '../lib/offlineCache';
import { obtenerSuscripcionPushActual, leerSuscripcionPushActual } from '../lib/webPush';
import { desuscribirPushAviso, suscribirPushAviso } from '../services/avisos.service';
import type { TipoUnidad } from '../types/miembro';

// localStorage puede estar bloqueado (Safari privado, cookies deshabilitadas): nunca debe romper la app.
const almacen = {
  getItem: (k: string): string | null => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setItem: (k: string, v: string): void => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* sin persistencia */
    }
  },
  removeItem: (k: string): void => {
    try {
      localStorage.removeItem(k);
    } catch {
      /* sin persistencia */
    }
  },
};

function safeJsonParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export interface AsignacionUsuario {
  unidadId: number;
  unidadNombre: string;
  rolId?: number;
  rol: string;
  tipoMiembro?: string;
  requiereRama?: boolean;
  tipoUnidad?: TipoUnidad;
  alcance: 'PROPIO' | 'UNIDAD' | 'GLOBAL';
  permisos: string[];
  permisosAlcance?: Record<string, 'PROPIO' | 'UNIDAD' | 'GLOBAL'>;
}

export interface UsuarioSesion {
  id: number;
  dni: string;
  nombre: string;
  apellido: string;
  tipoMiembro?: 'PROTAGONISTA' | 'EDUCADOR' | string;
}

function normalizarListaPermisos(permiso: string | readonly string[]): readonly string[] {
  return typeof permiso === 'string' ? [permiso] : permiso;
}

export function clavesQueSatisfacenPermisoUI(
  permisosAsignacion: readonly string[],
  requerido: string,
): string[] {
  if (!Array.isArray(permisosAsignacion)) return [];
  const res: string[] = [];
  if (permisosAsignacion.includes(requerido)) res.push(requerido);
  if (requerido.endsWith('.ver')) {
    const base = requerido.slice(0, -4);
    const editClave = `${base}.editar`;
    if (permisosAsignacion.includes(editClave)) res.push(editClave);
    if (requerido === 'legajos.ver') {
      if (permisosAsignacion.includes('plantillas.ver')) res.push('plantillas.ver');
      if (permisosAsignacion.includes('plantillas.editar')) res.push('plantillas.editar');
    }
    if (
      requerido === 'cobranzas.ver' ||
      requerido === 'planes.ver' ||
      requerido === 'eventos.ver'
    ) {
      if (permisosAsignacion.includes('caja.editar')) res.push('caja.editar');
    }
    if (requerido === 'roles.ver') {
      if (permisosAsignacion.includes('organizacion.ver')) res.push('organizacion.ver');
      if (permisosAsignacion.includes('organizacion.editar')) res.push('organizacion.editar');
    }
    if (requerido === 'organizacion.ver') {
      if (permisosAsignacion.includes('roles.ver')) res.push('roles.ver');
      if (permisosAsignacion.includes('roles.editar')) res.push('roles.editar');
    }
  }
  return res;
}

export function asignacionOtorgaPermisoUI(
  permisosAsignacion: readonly string[],
  requerido: string,
): boolean {
  return clavesQueSatisfacenPermisoUI(permisosAsignacion, requerido).length > 0;
}

const PESO_ALCANCE_STORE: Record<'PROPIO' | 'UNIDAD' | 'GLOBAL', number> = {
  PROPIO: 1,
  UNIDAD: 2,
  GLOBAL: 3,
};

export function obtenerAlcancePermisoEnAsignacionUI(
  asig: {
    alcance: 'PROPIO' | 'UNIDAD' | 'GLOBAL';
    permisos?: readonly string[];
    permisosAlcance?: Record<string, 'PROPIO' | 'UNIDAD' | 'GLOBAL'>;
  },
  requerido: string,
): 'PROPIO' | 'UNIDAD' | 'GLOBAL' | null {
  const claves = clavesQueSatisfacenPermisoUI(asig.permisos ?? [], requerido);
  if (claves.length === 0) return null;
  let mejor: 'PROPIO' | 'UNIDAD' | 'GLOBAL' = 'PROPIO';
  let mejorPeso = 0;
  for (const c of claves) {
    const alc = asig.permisosAlcance?.[c] ?? asig.alcance;
    const peso = PESO_ALCANCE_STORE[alc] ?? 1;
    if (peso > mejorPeso) {
      mejor = alc;
      mejorPeso = peso;
    }
  }
  return mejor;
}

interface AuthState {
  autenticado: boolean;
  usuario: UsuarioSesion | null;
  requiereCambioClave: boolean;
  asignaciones: AsignacionUsuario[];
  setSesion: (data: {
    usuario: UsuarioSesion;
    requiereCambioClave: boolean;
    asignaciones: AsignacionUsuario[];
    accessToken?: string;
  }) => void;
  setRequiereCambioClave: (val: boolean) => void;
  refrescarSesionDesdeServidor: () => Promise<void>;
  limpiarSesionLocal: () => void;
  logout: () => void;
  // Helpers de alcance y capacidades
  tieneGlobal: () => boolean;
  tieneUnidad: () => boolean;
  tienePropio: () => boolean;
  tienePermiso: (permiso: string) => boolean;
  tienePermisoGlobal: (permiso: string | readonly string[]) => boolean;
  tienePermisoUnidadOGlobal: (permiso: string | readonly string[]) => boolean;
  obtenerUnidadesConPermiso: (permiso: string | readonly string[]) => number[];
  puedeVerPadron: () => boolean;
  puedeAccederPanelGestion: () => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => {
  almacen.removeItem('scout_token');
  const savedUser = almacen.getItem('scout_user');
  const savedAsignaciones = almacen.getItem('scout_asignaciones');
  const savedCambioClave = almacen.getItem('scout_cambio_clave');
  const initialUser = safeJsonParse<UsuarioSesion | null>(savedUser, null);

  return {
    autenticado: initialUser !== null,
    usuario: initialUser,
    requiereCambioClave: savedCambioClave === 'true',
    asignaciones: safeJsonParse<AsignacionUsuario[]>(savedAsignaciones, []),

    setSesion: ({ usuario, requiereCambioClave, asignaciones }) => {
      const prev = get();
      const prevUsuario = prev.usuario;
      if (prevUsuario && prevUsuario.id !== usuario.id) {
        limpiarCacheApi();
      }
      // Recién entra (o terminó de cambiar la clave): si el dispositivo ya tenía las alertas
      // activadas, se asocian a este usuario sin que tenga que volver a activarlas.
      const entraAhora =
        !prev.autenticado || prevUsuario?.id !== usuario.id || prev.requiereCambioClave;
      if (entraAhora && !requiereCambioClave) {
        void (async () => {
          try {
            const suscripcion = await leerSuscripcionPushActual();
            if (suscripcion) await suscribirPushAviso(suscripcion);
          } catch {
            // Best effort: si falla, la persona puede activarlas desde la app.
          }
        })();
      }
      almacen.removeItem('scout_token');
      almacen.setItem('scout_user', JSON.stringify(usuario));
      almacen.setItem('scout_asignaciones', JSON.stringify(asignaciones));
      almacen.setItem('scout_cambio_clave', String(requiereCambioClave));
      set({
        autenticado: true,
        usuario,
        requiereCambioClave,
        asignaciones,
      });
    },

    setRequiereCambioClave: (val) => {
      almacen.setItem('scout_cambio_clave', String(val));
      set({ requiereCambioClave: val });
    },

    refrescarSesionDesdeServidor: async () => {
      if (!get().autenticado) return;
      try {
        const res = await api.get('/auth/me');
        if (res.headers?.['x-from-cache'] === 'true') {
          return;
        }
        const data = res.data;
        if (data?.usuario && Array.isArray(data?.asignaciones)) {
          const cambioClave =
            data.requiereCambioClave === undefined
              ? get().requiereCambioClave
              : Boolean(data.requiereCambioClave);
          // Si nada cambió, no crear objetos nuevos: las vistas dependen de usuario/asignaciones
          // y cada foco de ventana disparaba recargas completas (p. ej. Inicio) sin motivo.
          const actual = get();
          if (
            cambioClave === actual.requiereCambioClave &&
            JSON.stringify(data.usuario) === JSON.stringify(actual.usuario) &&
            JSON.stringify(data.asignaciones) === JSON.stringify(actual.asignaciones)
          ) {
            return;
          }
          get().setSesion({
            usuario: data.usuario,
            requiereCambioClave: cambioClave,
            asignaciones: data.asignaciones,
          });
        }
      } catch {
        // Ignorar errores transitorios de red
      }
    },

    limpiarSesionLocal: () => {
      limpiarCacheApi();
      almacen.removeItem('scout_token');
      almacen.removeItem('scout_user');
      almacen.removeItem('scout_asignaciones');
      almacen.removeItem('scout_cambio_clave');
      set({
        autenticado: false,
        usuario: null,
        requiereCambioClave: false,
        asignaciones: [],
      });
    },

    logout: () => {
      const estabaAutenticado = get().autenticado;
      get().limpiarSesionLocal();
      if (estabaAutenticado) {
        void (async () => {
          // Primero se borra la suscripción en el servidor (la cookie de sesión aún es válida),
          // para que el dispositivo no siga recibiendo avisos de este usuario. La del navegador
          // se conserva: al volver a entrar se asocia sola a quien inicie sesión (ver setSesion).
          try {
            const sub = await obtenerSuscripcionPushActual();
            if (sub) await desuscribirPushAviso(sub.endpoint);
          } catch {
            // Best effort: una suscripción huérfana se limpia sola al fallar el próximo envío.
          }
          await api.post('/auth/logout').catch(() => {});
        })();
      }
    },

    tieneGlobal: () => {
      return get().asignaciones.some(
        (a) =>
          a.alcance === 'GLOBAL' ||
          Object.values(a.permisosAlcance ?? {}).includes('GLOBAL'),
      );
    },

    tieneUnidad: () => {
      return get().asignaciones.some(
        (a) =>
          a.alcance === 'UNIDAD' ||
          Object.values(a.permisosAlcance ?? {}).includes('UNIDAD'),
      );
    },

    tienePropio: () => {
      return get().asignaciones.length > 0;
    },

    tienePermiso: (permiso: string) => {
      return get().asignaciones.some((a) => asignacionOtorgaPermisoUI(a.permisos, permiso));
    },

    tienePermisoGlobal: (permiso: string | readonly string[]) => {
      const lista = normalizarListaPermisos(permiso);
      return get().asignaciones.some((a) =>
        lista.some((p) => obtenerAlcancePermisoEnAsignacionUI(a, p) === 'GLOBAL'),
      );
    },

    tienePermisoUnidadOGlobal: (permiso: string | readonly string[]) => {
      const lista = normalizarListaPermisos(permiso);
      return get().asignaciones.some((a) =>
        lista.some((p) => {
          const alc = obtenerAlcancePermisoEnAsignacionUI(a, p);
          return alc === 'GLOBAL' || alc === 'UNIDAD';
        }),
      );
    },

    obtenerUnidadesConPermiso: (permiso: string | readonly string[]) => {
      const lista = normalizarListaPermisos(permiso);
      const ids = new Set<number>();
      for (const a of get().asignaciones) {
        if (
          typeof a.unidadId === 'number' &&
          Number.isFinite(a.unidadId) &&
          lista.some((p) => obtenerAlcancePermisoEnAsignacionUI(a, p) === 'UNIDAD')
        ) {
          ids.add(a.unidadId);
        }
      }
      return Array.from(ids);
    },

    puedeVerPadron: () => {
      return get().tienePermisoUnidadOGlobal(['padron.ver', 'padron.editar']);
    },

    puedeAccederPanelGestion: () => {
      const { asignaciones, tienePermisoUnidadOGlobal, tienePermisoGlobal } = get();
      const tieneAsignacionGestion = asignaciones.some(
        (a) => a.alcance === 'UNIDAD' || a.alcance === 'GLOBAL',
      );
      if (!tieneAsignacionGestion) return false;

      const permisosPanelUnidadOGlobal = [
        'padron.ver',
        'padron.editar',
        'legajos.ver',
        'legajos.editar',
        'plantillas.ver',
        'pases.ver',
        'pases.editar',
        'cobranzas.ver',
        'cobranzas.editar',
        'planes.ver',
        'planes.editar',
        'caja.ver',
        'caja.editar',
        'eventos.ver',
        'eventos.editar',
        'organizacion.ver',
        'roles.ver',
      ];
      const permisosPanelSoloGlobal = [
        'organizacion.editar',
        'roles.editar',
        'plantillas.editar',
      ];
      return (
        tienePermisoUnidadOGlobal(permisosPanelUnidadOGlobal) ||
        tienePermisoGlobal(permisosPanelSoloGlobal)
      );
    },
  };
});

// Sincronizar cierre de sesión local y cambio obligatorio de clave con el cliente HTTP
setOnAuthError(() => {
  useAuthStore.getState().limpiarSesionLocal();
});

setOnRequirePasswordChange(() => {
  useAuthStore.getState().setRequiereCambioClave(true);
});
