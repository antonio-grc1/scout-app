import axios, { type AxiosRequestConfig } from 'axios';
import {
  generarClaveCache,
  guardarEnCache,
  obtenerDeCache,
  limpiarCacheApi,
  esperarCacheLista,
} from '../lib/offlineCache';
import { useOfflineStore } from '../store/offlineStore';
import { useToastStore } from '../store/toastStore';

const rawApiUrl = import.meta.env?.VITE_API_URL?.trim();
const baseURL = rawApiUrl ? `${rawApiUrl.replace(/\/$/, '')}/api` : '/api';

export const api = axios.create({
  baseURL,
  withCredentials: true,
  timeout: 7000, // Evita cuelgues prolongados en conexiones móviles débiles
  headers: {
    'Content-Type': 'application/json',
  },
});

// Deduplicación de peticiones GET concurrentes idénticas en vuelo
const inFlightGetRequests = new Map<string, Promise<unknown>>();
const rawApiGet = api.get.bind(api);

api.get = ((url: string, config?: AxiosRequestConfig) => {
  if (
    config?.signal ||
    config?.responseType === 'blob' ||
    config?.responseType === 'arraybuffer'
  ) {
    return rawApiGet(url, config);
  }

  const dedupeKey = generarClaveCache(url, config?.params as Record<string, unknown> | undefined);
  const existing = inFlightGetRequests.get(dedupeKey);
  if (existing) {
    return existing as ReturnType<typeof rawApiGet>;
  }

  const requestPromise = rawApiGet(url, config).finally(() => {
    if (inFlightGetRequests.get(dedupeKey) === requestPromise) {
      inFlightGetRequests.delete(dedupeKey);
    }
  });
  inFlightGetRequests.set(dedupeKey, requestPromise);
  return requestPromise;
}) as typeof api.get;

function estaOfflineCliente(): boolean {
  const navOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const storeOffline = useOfflineStore.getState().isOnline === false;
  return navOffline || storeOffline;
}

api.interceptors.request.use((config) => {
  // La autenticación viaja exclusivamente en cookie HttpOnly (withCredentials: true)

  const method = config.method?.toLowerCase() || 'get';
  const offline = estaOfflineCliente();

  // Si el dispositivo está sin red, responder GET de inmediato con la caché sin esperar timeout
  if (offline && method === 'get') {
    const offlineErr = new Error('Sin conexión a internet (offline)') as Error & {
      __isOfflineFastFail: boolean;
      config: typeof config;
    };
    offlineErr.__isOfflineFastFail = true;
    offlineErr.config = config;
    return Promise.reject(offlineErr);
  }

  // Bloquear mutaciones de servidor cuando no hay señal mostrando aviso claro al usuario
  const esMutacion = method === 'post' || method === 'put' || method === 'patch' || method === 'delete';
  const esLogout = typeof config.url === 'string' && config.url.includes('/auth/logout');
  if (offline && esMutacion && !esLogout) {
    const msg =
      'Sin conexión a internet: los cambios en el servidor están bloqueados hasta recuperar señal.';
    useToastStore.getState().mostrarToast(msg, 'advertencia', 5000);
    const offlineMutationErr = new Error(msg) as Error & {
      __isOfflineFastFail: boolean;
      __isOfflineMutationBlocked: boolean;
      config: typeof config;
    };
    offlineMutationErr.__isOfflineFastFail = true;
    offlineMutationErr.__isOfflineMutationBlocked = true;
    offlineMutationErr.config = config;
    return Promise.reject(offlineMutationErr);
  }

  return config;
});

let onAuthErrorCallback: (() => void) | null = null;
export function setOnAuthError(cb: () => void) {
  onAuthErrorCallback = cb;
}

let onRequirePasswordChangeCallback: (() => void) | null = null;
export function setOnRequirePasswordChange(cb: () => void) {
  onRequirePasswordChangeCallback = cb;
}

let isHandlingAuthError = false;

api.interceptors.response.use(
  (response) => {
    // Almacenar en caché toda respuesta GET exitosa (excepto descargas de archivos)
    const { config, status, data } = response;
    if (
      config?.method?.toLowerCase() === 'get' &&
      status === 200 &&
      config.responseType !== 'blob' &&
      config.responseType !== 'arraybuffer'
    ) {
      guardarEnCache(config.url, config.params, data);
    }
    return response;
  },
  async (error) => {
    const config = error.config || (error.__isOfflineFastFail ? error.config : null);
    const esGet = config?.method?.toLowerCase() === 'get';

    // Comprobar si falló por motivos de conectividad de red o timeout
    const esErrorRed =
      error.__isOfflineFastFail ||
      !error.response ||
      error.code === 'ECONNABORTED' ||
      error.message?.includes('Network Error') ||
      (typeof navigator !== 'undefined' && navigator.onLine === false);

    if (esGet && esErrorRed) {
      // Al abrir la app sin conexión, la lectura de IndexedDB puede no haber terminado todavía.
      await esperarCacheLista();
      const cached = obtenerDeCache(config.url, config.params);
      if (cached) {
        useOfflineStore.getState().marcarUsoCache(cached.timestamp);
        return Promise.resolve({
          data: cached.data,
          status: 200,
          statusText: 'OK (Desde memoria local)',
          headers: { 'x-from-cache': 'true' },
          config: config,
          request: {},
        });
      }
    }

    if (error.response?.status === 401) {
      if (!isHandlingAuthError) {
        isHandlingAuthError = true;
        limpiarCacheApi();
        localStorage.removeItem('scout_token');
        localStorage.removeItem('scout_user');
        localStorage.removeItem('scout_asignaciones');
        localStorage.removeItem('scout_cambio_clave');
        if (onAuthErrorCallback) {
          try {
            onAuthErrorCallback();
          } catch {
            // ignore
          }
        } else if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
        setTimeout(() => {
          isHandlingAuthError = false;
        }, 1500);
      }
    } else if (
      error.response?.status === 403 &&
      (error.response?.data?.code === 'REQUIERE_CAMBIO_CLAVE' ||
        /cambi(o|ar) (de |su )?(clave|contraseña)/.test(error.response?.data?.message?.toLowerCase?.() ?? ''))
    ) {
      if (onRequirePasswordChangeCallback) {
        try {
          onRequirePasswordChangeCallback();
        } catch {
          // ignore
        }
      } else if (typeof window !== 'undefined' && window.location.pathname !== '/cambiar-clave') {
        window.location.href = '/cambiar-clave';
      }
    }
    return Promise.reject(error);
  },
);
