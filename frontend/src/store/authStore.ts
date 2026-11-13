import { create } from 'zustand';
import { api, setOnAuthError, setOnRequirePasswordChange } from '../api/client';
import { limpiarCacheApi } from '../lib/offlineCache';

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
  alcance: 'PROPIO' | 'UNIDAD' | 'GLOBAL';
  permisos: string[];
}

export interface UsuarioSesion {
  id: number;
  dni: string;
  nombre: string;
  apellido: string;
}

interface AuthState {
  token: string | null;
  usuario: UsuarioSesion | null;
  requiereCambioClave: boolean;
  asignaciones: AsignacionUsuario[];
  setSesion: (data: {
    accessToken: string;
    usuario: UsuarioSesion;
    requiereCambioClave: boolean;
    asignaciones: AsignacionUsuario[];
  }) => void;
  setRequiereCambioClave: (val: boolean) => void;
  refrescarSesionDesdeServidor: () => Promise<void>;
  logout: () => void;
  // Helpers de alcance y capacidades
  tieneGlobal: () => boolean;
  tieneUnidad: () => boolean;
  tienePropio: () => boolean;
  tienePermiso: (permiso: string) => boolean;
  puedeVerPadron: () => boolean;
  puedeAccederPanelGestion: () => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => {
  const savedToken = localStorage.getItem('scout_token');
  const savedUser = localStorage.getItem('scout_user');
  const savedAsignaciones = localStorage.getItem('scout_asignaciones');
  const savedCambioClave = localStorage.getItem('scout_cambio_clave');

  return {
    token: savedToken,
    usuario: safeJsonParse<UsuarioSesion | null>(savedUser, null),
    requiereCambioClave: savedCambioClave === 'true',
    asignaciones: safeJsonParse<AsignacionUsuario[]>(savedAsignaciones, []),

    setSesion: ({ accessToken, usuario, requiereCambioClave, asignaciones }) => {
      const prevUsuario = get().usuario;
      if (prevUsuario && prevUsuario.id !== usuario.id) {
        limpiarCacheApi();
      }
      localStorage.setItem('scout_token', accessToken);
      localStorage.setItem('scout_user', JSON.stringify(usuario));
      localStorage.setItem('scout_asignaciones', JSON.stringify(asignaciones));
      localStorage.setItem('scout_cambio_clave', String(requiereCambioClave));
      set({
        token: accessToken,
        usuario,
        requiereCambioClave,
        asignaciones,
      });
    },

    setRequiereCambioClave: (val) => {
      localStorage.setItem('scout_cambio_clave', String(val));
      set({ requiereCambioClave: val });
    },

    refrescarSesionDesdeServidor: async () => {
      const currentToken = get().token;
      if (!currentToken) return;
      try {
        const res = await api.get('/auth/me');
        if (res.headers?.['x-from-cache'] === 'true') {
          return;
        }
        const data = res.data;
        if (data?.usuario && Array.isArray(data?.asignaciones)) {
          const nuevoToken = data.accessToken || currentToken;
          const cambioClave =
            data.requiereCambioClave === undefined
              ? get().requiereCambioClave
              : Boolean(data.requiereCambioClave);
          get().setSesion({
            accessToken: nuevoToken,
            usuario: data.usuario,
            requiereCambioClave: cambioClave,
            asignaciones: data.asignaciones,
          });
        }
      } catch {
        // Ignorar errores transitorios de red
      }
    },

    logout: () => {
      const hadToken = Boolean(get().token);
      limpiarCacheApi();
      localStorage.removeItem('scout_token');
      localStorage.removeItem('scout_user');
      localStorage.removeItem('scout_asignaciones');
      localStorage.removeItem('scout_cambio_clave');
      set({
        token: null,
        usuario: null,
        requiereCambioClave: false,
        asignaciones: [],
      });
      if (hadToken) {
        void api.post('/auth/logout').catch(() => {});
      }
    },

    tieneGlobal: () => {
      return get().asignaciones.some((a) => a.alcance === 'GLOBAL');
    },

    tieneUnidad: () => {
      return get().asignaciones.some((a) => a.alcance === 'UNIDAD');
    },

    tienePropio: () => {
      return get().asignaciones.length > 0;
    },

    tienePermiso: (permiso: string) => {
      return get().asignaciones.some((a) => a.permisos.includes(permiso));
    },

    puedeVerPadron: () => {
      const { tieneUnidad, tieneGlobal, tienePermiso } = get();
      return (tieneUnidad() || tieneGlobal()) && tienePermiso('miembros.ver');
    },

    puedeAccederPanelGestion: () => {
      const { asignaciones, tieneGlobal, tienePermiso } = get();
      // Beneficiarios (o usuarios sin asignaciones de gestión/educador) jamás acceden al panel de gestión
      const tieneAsignacionGestion = asignaciones.some(
        (a) => a.tipoMiembro === 'EDUCADOR' || a.alcance === 'UNIDAD' || a.alcance === 'GLOBAL',
      );
      if (!tieneAsignacionGestion) return false;

      const permisosPanelNoGlobal = [
        'tesoreria.gestionar',
        'tesoreria.conceptos_planes',
        'cuotas.ver',
        'cuotas.ajustar',
        'eventos.ver',
        'eventos.vender',
        'eventos.gestionar',
        'organizacion.ver',
        'organizacion.gestionar',
        'roles.gestionar',
        'pases.ver',
        'legajos.ver',
      ];
      return tieneGlobal() || permisosPanelNoGlobal.some((p) => tienePermiso(p));
    },
  };
});

// Sincronizar logout y cambio obligatorio de clave con el cliente HTTP
setOnAuthError(() => {
  useAuthStore.getState().logout();
});

setOnRequirePasswordChange(() => {
  useAuthStore.getState().setRequiereCambioClave(true);
});
