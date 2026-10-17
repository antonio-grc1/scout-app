import axios from 'axios';

export const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('scout_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
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
