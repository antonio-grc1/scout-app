import { create } from 'zustand';

/**
 * Marca global de "hay cambios sin guardar" en la vista actual (p. ej. el legajo).
 * La app usa BrowserRouter (sin data router), así que no hay useBlocker: la navegación del
 * AppShell consulta esta marca antes de cambiar de página.
 *
 * La confirmación usa el diálogo estándar de la app (montado una vez en App con
 * `DialogoDescartarCambios`) en lugar del `window.confirm` nativo.
 */
interface CambiosSinGuardarState {
  pendiente: boolean;
  setPendiente: (pendiente: boolean) => void;
  /** Mensaje del diálogo abierto; null si no hay ninguno. */
  mensajeDialogo: string | null;
  resolverDialogo: ((ok: boolean) => void) | null;
  responderDialogo: (ok: boolean) => void;
}

export const useCambiosSinGuardarStore = create<CambiosSinGuardarState>((set, get) => ({
  pendiente: false,
  setPendiente: (pendiente) => set({ pendiente }),
  mensajeDialogo: null,
  resolverDialogo: null,
  responderDialogo: (ok) => {
    const resolver = get().resolverDialogo;
    // El diálogo se monta sin entrada de historial (manejarHistorial={false}), así que se puede
    // resolver enseguida: ya no hay un history.back() diferido que deshaga la navegación.
    set({ mensajeDialogo: null, resolverDialogo: null });
    resolver?.(ok);
  },
}));

/** Abre el diálogo de descarte y resuelve true si la persona confirma. */
export function pedirConfirmacionDescarte(
  mensaje = 'Tenés cambios sin guardar. ¿Querés salir y descartarlos?',
): Promise<boolean> {
  const { resolverDialogo } = useCambiosSinGuardarStore.getState();
  // Si ya había uno abierto, se cancela antes de abrir el nuevo.
  resolverDialogo?.(false);
  return new Promise((resolve) => {
    useCambiosSinGuardarStore.setState({ mensajeDialogo: mensaje, resolverDialogo: resolve });
  });
}

/** Resuelve true si se puede salir (no hay cambios o la persona confirmó descartarlos). */
export async function confirmarSalidaSiHayCambios(): Promise<boolean> {
  if (!useCambiosSinGuardarStore.getState().pendiente) return true;
  const ok = await pedirConfirmacionDescarte();
  if (ok) useCambiosSinGuardarStore.getState().setPendiente(false);
  return ok;
}

/** True si hay cambios marcados (para decidir de forma síncrona si frenar un click). */
export function hayCambiosSinGuardar(): boolean {
  return useCambiosSinGuardarStore.getState().pendiente;
}
