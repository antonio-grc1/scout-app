import { create } from 'zustand';

export interface ToastAccion {
  label?: string;
  onEjecutar: () => void | Promise<void>;
}

export interface ToastItem {
  id: string;
  texto: string;
  tipo: 'exito' | 'error' | 'info' | 'advertencia';
  accion?: ToastAccion;
  duracionMs: number;
  creadoEn: number;
}

interface ToastState {
  toast: ToastItem | null;
  mostrarToast: (
    texto: string,
    tipo?: 'exito' | 'error' | 'info' | 'advertencia',
    duracionMs?: number,
  ) => void;
  mostrarToastConDeshacer: (
    texto: string,
    onDeshacer: () => void | Promise<void>,
    duracionMs?: number,
  ) => void;
  mostrarToastAccion: (
    texto: string,
    label: string,
    onEjecutar: () => void | Promise<void>,
    duracionMs?: number,
  ) => void;
  cerrarToast: () => void;
  ejecutarAccion: () => Promise<void>;
}

let timeoutId: any = null;

export const useToastStore = create<ToastState>((set, get) => ({
  toast: null,

  mostrarToast: (texto, tipo = 'exito', duracionMs = 4000) => {
    // Silenciar toasts de error por falta de conexión u offline, ya que se informa en el banner superior
    if (
      tipo === 'error' &&
      (texto.toLowerCase().includes('sin conexión') ||
        texto.toLowerCase().includes('sin conexion') ||
        texto.toLowerCase().includes('offline') ||
        texto.toLowerCase().includes('network error') ||
        (typeof navigator !== 'undefined' && navigator.onLine === false))
    ) {
      return;
    }

    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    const id = Math.random().toString(36).substring(2, 9);
    set({
      toast: {
        id,
        texto,
        tipo,
        duracionMs,
        creadoEn: Date.now(),
      },
    });

    timeoutId = setTimeout(() => {
      if (get().toast?.id === id) {
        set({ toast: null });
      }
    }, duracionMs);
  },

  mostrarToastAccion: (texto, label, onEjecutar, duracionMs = 7500) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    const id = Math.random().toString(36).substring(2, 9);
    set({
      toast: {
        id,
        texto,
        tipo: 'info',
        accion: {
          label,
          onEjecutar,
        },
        duracionMs,
        creadoEn: Date.now(),
      },
    });

    timeoutId = setTimeout(() => {
      if (get().toast?.id === id) {
        set({ toast: null });
      }
    }, duracionMs);
  },

  mostrarToastConDeshacer: (texto, onDeshacer, duracionMs = 7500) => {
    get().mostrarToastAccion(texto, 'Deshacer', onDeshacer, duracionMs);
  },

  cerrarToast: () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    set({ toast: null });
  },

  ejecutarAccion: async () => {
    const { toast } = get();
    if (!toast || !toast.accion) return;
    const accion = toast.accion;
    // Cerrar inmediatamente el toast para no permitir doble clic
    if (timeoutId) clearTimeout(timeoutId);
    set({ toast: null });

    try {
      await accion.onEjecutar();
    } catch (err) {
      console.error('Error al ejecutar acción de deshacer:', err);
      get().mostrarToast('No se pudo deshacer la acción.', 'error');
    }
  },
}));

// Helpers directos sin necesidad de hook
export const mostrarToast = (
  texto: string,
  tipo?: 'exito' | 'error' | 'info' | 'advertencia',
  duracionMs?: number,
) => useToastStore.getState().mostrarToast(texto, tipo, duracionMs);

export const mostrarToastConDeshacer = (
  texto: string,
  onDeshacer: () => void | Promise<void>,
  duracionMs?: number,
) => useToastStore.getState().mostrarToastConDeshacer(texto, onDeshacer, duracionMs);
