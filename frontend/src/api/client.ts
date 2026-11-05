import axios from 'axios';
import { guardarEnCache, obtenerDeCache, limpiarCacheApi } from '../lib/offlineCache';
import { useOfflineStore } from '../store/offlineStore';

const rawApiUrl = import.meta.env?.VITE_API_URL?.trim();
const baseURL = rawApiUrl ? `${rawApiUrl.replace(/\/$/, '')}/api` : '/api';

export const api = axios.create({
  baseURL,
  timeout: 7000, // Evita cuelgues prolongados en conexiones móviles débiles
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('scout_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  // Si el dispositivo está sin red, responder de inmediato con la caché sin esperar timeout
  if (
    typeof navigator !== 'undefined' &&
    !navigator.onLine &&
    config.method?.toLowerCase() === 'get'
  ) {
    return Promise.reject({
      __isOfflineFastFail: true,
      config,
      message: 'Sin conexión a internet (offline)',
    });
  }

  return config;
});

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
  (error) => {
    const config = error.config || (error.__isOfflineFastFail ? error.config : null);
    const esGet = config?.method?.toLowerCase() === 'get';

    // Comprobar si falló por motivos de conectividad de red o timeout
    const esErrorRed =
      error.__isOfflineFastFail ||
      !error.response ||
      error.code === 'ECONNABORTED' ||
      error.message?.includes('Network Error') ||
      (typeof navigator !== 'undefined' && !navigator.onLine);

    if (esGet && esErrorRed) {
      const cached = obtenerDeCache(config.url, config.params);
      if (cached) {
        useOfflineStore.getState().marcarUsoCache(cached.timestamp);
        return Promise.resolve({
          data: cached.data,
          status: 200,
          statusText: 'OK (Desde memoria local)',
          headers: {},
          config: config,
          request: {},
        });
      }
    }

    if (error.response?.status === 401) {
      limpiarCacheApi();
      localStorage.removeItem('scout_token');
      localStorage.removeItem('scout_user');
      localStorage.removeItem('scout_asignaciones');
      localStorage.removeItem('scout_cambio_clave');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    } else if (
      error.response?.status === 403 &&
      (error.response?.data?.code === 'REQUIERE_CAMBIO_CLAVE' ||
        error.response?.data?.message?.toLowerCase()?.includes('cambio de clave'))
    ) {
      if (window.location.pathname !== '/cambiar-clave') {
        window.location.href = '/cambiar-clave';
      }
    }
    return Promise.reject(error);
  },
);
