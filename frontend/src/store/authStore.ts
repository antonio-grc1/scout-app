import { create } from 'zustand';
import { api } from '../api/client';

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
  tieneRama: () => boolean;
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
    usuario: savedUser ? JSON.parse(savedUser) : null,
    requiereCambioClave: savedCambioClave === 'true',
    asignaciones: savedAsignaciones ? JSON.parse(savedAsignaciones) : [],

    setSesion: ({ accessToken, usuario, requiereCambioClave, asignaciones }) => {
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
        const res = await api.get('/auth/perfil');
        const data = res.data;
        if (data?.usuario && Array.isArray(data?.asignaciones)) {
          const nuevoToken = data.accessToken || currentToken;
          get().setSesion({
            accessToken: nuevoToken,
            usuario: data.usuario,
            requiereCambioClave: Boolean(data.requiereCambioClave),
            asignaciones: data.asignaciones,
          });
        }
      } catch {
        // Ignorar errores transitorios de red
      }
    },

    logout: () => {
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
    },

    tieneGlobal: () => {
      return get().asignaciones.some((a) => a.alcance === 'GLOBAL');
    },

    tieneRama: () => {
      return get().asignaciones.some((a) => a.alcance === 'UNIDAD');
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
      const { tieneGlobal, tienePermiso } = get();
      if (!tieneGlobal()) return false;
      const permisosPanel = [
        'tesoreria.gestionar',
        'cuotas.ver',
        'organizacion.ver',
        'organizacion.gestionar',
        'pases.ver',
        'pases.ejecutar',
        'legajos.ver',
      ];
      return permisosPanel.some((p) => tienePermiso(p));
    },
  };
});
