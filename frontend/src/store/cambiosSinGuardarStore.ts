import { create } from 'zustand';

/**
 * Marca global de "hay cambios sin guardar" en la vista actual (p. ej. el legajo).
 * La app usa BrowserRouter (sin data router), así que no hay useBlocker: la navegación del
 * AppShell consulta esta marca antes de cambiar de página.
 */
interface CambiosSinGuardarState {
  pendiente: boolean;
  setPendiente: (pendiente: boolean) => void;
}

export const useCambiosSinGuardarStore = create<CambiosSinGuardarState>((set) => ({
  pendiente: false,
  setPendiente: (pendiente) => set({ pendiente }),
}));

/** Devuelve true si se puede salir (no hay cambios o el usuario confirmó descartarlos). */
export function confirmarSalidaSiHayCambios(): boolean {
  const { pendiente, setPendiente } = useCambiosSinGuardarStore.getState();
  if (!pendiente) return true;
  const ok = window.confirm('Tenés cambios sin guardar. ¿Querés salir y descartarlos?');
  if (ok) setPendiente(false);
  return ok;
}
