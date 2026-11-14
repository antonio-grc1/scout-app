import { create } from 'zustand';
import { useAuthStore } from '../store/authStore';

export type QrScope = 'auto' | 'legajo' | 'evento';

interface QrModalState {
  abierto: boolean;
  scopeInicial: QrScope;
  lastValidationAt: number;
  abrirQr: (scope?: QrScope) => void;
  cerrarQr: () => void;
  notificarValidacion: () => void;
}

export const useQrModalStore = create<QrModalState>((set) => ({
  abierto: false,
  scopeInicial: 'auto',
  lastValidationAt: 0,
  abrirQr: (scope = 'auto') => set({ abierto: true, scopeInicial: scope }),
  cerrarQr: () => set({ abierto: false }),
  notificarValidacion: () => set({ lastValidationAt: Date.now() }),
}));

let ultimoUsuarioQrId = useAuthStore.getState().usuario?.id ?? null;
useAuthStore.subscribe((state) => {
  const nextId = state.usuario?.id ?? null;
  if (nextId !== ultimoUsuarioQrId) {
    ultimoUsuarioQrId = nextId;
    useQrModalStore.setState({ abierto: false, scopeInicial: 'auto' });
  }
});
