import { create } from 'zustand';

interface OfflineState {
  isOnline: boolean;
  isUsingCache: boolean;
  lastCachedAt: number | null;
  mostrarBanner: boolean;
  conexionRestablecida: boolean;
  marcarUsoCache: (timestamp?: number) => void;
  actualizarEstadoRed: (online: boolean) => void;
  descartarBanner: () => void;
}

let timeoutRestablecido: ReturnType<typeof setTimeout> | null = null;

export const useOfflineStore = create<OfflineState>((set, get) => {
  const onlineInicial = typeof navigator !== 'undefined' ? navigator.onLine : true;

  // Registrar listeners de red globales una sola vez en el cliente
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      get().actualizarEstadoRed(true);
    });

    window.addEventListener('offline', () => {
      get().actualizarEstadoRed(false);
    });
  }

  return {
    isOnline: onlineInicial,
    isUsingCache: false,
    lastCachedAt: null,
    mostrarBanner: !onlineInicial,
    conexionRestablecida: false,

    marcarUsoCache: (timestamp?: number) => {
      set((state) => ({
        isUsingCache: true,
        lastCachedAt: timestamp || state.lastCachedAt || Date.now(),
        mostrarBanner: true,
      }));
    },

    actualizarEstadoRed: (online: boolean) => {
      if (timeoutRestablecido) {
        clearTimeout(timeoutRestablecido);
        timeoutRestablecido = null;
      }

      if (online) {
        set({
          isOnline: true,
          conexionRestablecida: true,
          mostrarBanner: true,
        });

        // Ocultar mensaje de reconexión tras 4 segundos
        timeoutRestablecido = setTimeout(() => {
          set({
            conexionRestablecida: false,
            isUsingCache: false,
            mostrarBanner: false,
          });
        }, 4000);
      } else {
        set({
          isOnline: false,
          conexionRestablecida: false,
          mostrarBanner: true,
        });
      }
    },

    descartarBanner: () => {
      set({ mostrarBanner: false });
    },
  };
});
