import { useEffect, useRef, useCallback } from 'react';

interface ModalStackEntry {
  id: number;
  close: () => void;
  isBlocked: () => boolean;
  isClosing: boolean;
  setClosedByPopState: (val: boolean) => void;
  cerrarConEsc: boolean;
}

const modalStack: ModalStackEntry[] = [];
let nextModalId = 1;
let scrollLockCount = 0;
let originalBodyOverflow = '';
let pendingProgrammaticBacks = 0;

export function shouldIgnorePopstateForTopModal(
  eventStateModalId: unknown,
  topModalId: number | string | undefined,
): boolean {
  return (
    (typeof eventStateModalId === 'string' || typeof eventStateModalId === 'number') &&
    topModalId !== undefined &&
    eventStateModalId === topModalId
  );
}

function lockScroll() {
  if (typeof document === 'undefined') return;
  if (scrollLockCount === 0) {
    originalBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  scrollLockCount++;
}

function unlockScroll() {
  if (typeof document === 'undefined') return;
  scrollLockCount = Math.max(0, scrollLockCount - 1);
  if (scrollLockCount === 0) {
    document.body.style.overflow = originalBodyOverflow;
  }
}

// Global popstate listener for browser / mobile back button (closes topmost modal)
if (typeof window !== 'undefined') {
  window.addEventListener('popstate', (event: PopStateEvent) => {
    if (pendingProgrammaticBacks > 0) {
      pendingProgrammaticBacks--;
      return;
    }

    if (modalStack.length > 0) {
      for (let i = modalStack.length - 1; i >= 0; i--) {
        const top = modalStack[i];
        if (top.isClosing) continue;

        const currentModalStateId =
          event.state && typeof event.state === 'object'
            ? (event.state as { __modalId?: unknown }).__modalId
            : window.history.state?.__modalId;

        if (shouldIgnorePopstateForTopModal(currentModalStateId, top.id)) {
          return;
        }

        if (top.isBlocked()) {
          // Si el modal está bloqueado, reinsertamos el estado para no desfasar el historial
          window.history.pushState({ ...window.history.state, __modalId: top.id }, '');
          return;
        }

        top.isClosing = true;
        top.setClosedByPopState(true);
        top.close();
        return;
      }
    }
  });
}

// Global keydown listener for Escape key (LIFO stack: closes topmost modal first)
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape' && modalStack.length > 0) {
      for (let i = modalStack.length - 1; i >= 0; i--) {
        const top = modalStack[i];
        if (top.isClosing) continue;
        if (top.cerrarConEsc && !top.isBlocked()) {
          e.preventDefault();
          e.stopPropagation();
          top.close();
        }
        return;
      }
    }
  });
}

const SELECTOR_FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

function obtenerFocusables(contenedor: HTMLElement): HTMLElement[] {
  return Array.from(contenedor.querySelectorAll<HTMLElement>(SELECTOR_FOCUSABLE)).filter(
    (el) => el.getClientRects().length > 0,
  );
}

function isClickOnScrollbar(e: React.MouseEvent<HTMLElement>) {
  const rect = e.currentTarget.getBoundingClientRect();
  const clickedScrollbarX = e.clientX >= rect.left + e.currentTarget.clientWidth;
  const clickedScrollbarY = e.clientY >= rect.top + e.currentTarget.clientHeight;
  return clickedScrollbarX || clickedScrollbarY;
}

export interface UseModalOverlayOptions {
  abierto?: boolean;
  isOpen?: boolean;
  onCerrar?: () => void;
  onClose?: () => void;
  bloqueado?: boolean;
  bloquearScroll?: boolean;
  cerrarConEsc?: boolean;
  cerrarAlClickAfuera?: boolean;
  manejarHistorial?: boolean;
}

export function useModalOverlay({
  abierto,
  isOpen,
  onCerrar,
  onClose,
  bloqueado = false,
  bloquearScroll = true,
  cerrarConEsc = true,
  cerrarAlClickAfuera = true,
  manejarHistorial = true,
}: UseModalOverlayOptions = {}) {
  const activo = abierto ?? isOpen ?? true;
  const cerrarCallback = onCerrar ?? onClose;
  const tieneCallback = Boolean(cerrarCallback);

  const callbackRef = useRef(cerrarCallback);
  callbackRef.current = cerrarCallback;

  const bloqueadoRef = useRef(bloqueado);
  bloqueadoRef.current = bloqueado;

  const mouseDownTargetRef = useRef<EventTarget | null>(null);

  // Panel del diálogo (se obtiene vía contentProps.ref): sobre él se maneja el foco.
  const contentElRef = useRef<HTMLElement | null>(null);
  const setContentEl = useCallback((el: HTMLElement | null) => {
    contentElRef.current = el;
  }, []);

  useEffect(() => {
    if (!activo || !tieneCallback) return;

    if (bloquearScroll) {
      lockScroll();
    }

    const modalId = nextModalId++;
    let closedByPopState = false;
    let historyPushed = false;

    if (manejarHistorial && typeof window !== 'undefined') {
      const currentModalId = window.history.state?.__modalId;
      const esEntradaHuerfana =
        (typeof currentModalId === 'number' || typeof currentModalId === 'string') &&
        !modalStack.some((item) => item.id === currentModalId);

      // En React StrictMode (dev) o al reemplazar un modal por otro en el mismo commit,
      // reutilizamos la entrada huérfana para no disparar un history.back() asíncrono
      // que cerraría el modal recién montado.
      if (esEntradaHuerfana) {
        window.history.replaceState({ ...window.history.state, __modalId: modalId }, '');
      } else {
        window.history.pushState({ ...window.history.state, __modalId: modalId }, '');
      }
      historyPushed = true;
    }

    const stackEntry: ModalStackEntry = {
      id: modalId,
      isClosing: false,
      close: () => {
        callbackRef.current?.();
      },
      isBlocked: () => Boolean(bloqueadoRef.current),
      setClosedByPopState: (val: boolean) => {
        closedByPopState = val;
      },
      cerrarConEsc,
    };

    modalStack.push(stackEntry);

    // Accesibilidad: foco inicial dentro del diálogo, trampa de Tab y retorno de foco al cerrar.
    const elementoPrevio =
      typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;

    const prepararFoco = () => {
      const el = contentElRef.current;
      if (!el) return;
      // Semántica de diálogo si el panel no la declara (varios modales a mano no la tenían).
      if (!el.hasAttribute('role')) el.setAttribute('role', 'dialog');
      if (!el.hasAttribute('aria-modal')) el.setAttribute('aria-modal', 'true');
      if (!el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby')) {
        const titulo = el.querySelector<HTMLElement>('h1,h2,h3,h4');
        if (titulo) {
          if (!titulo.id) titulo.id = `modal-titulo-${modalId}`;
          el.setAttribute('aria-labelledby', titulo.id);
        }
      }
      if (el.contains(document.activeElement)) return; // p. ej. un campo con autoFocus
      // Se enfoca el propio panel (no un campo) para no abrir el teclado en móvil.
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
      el.style.outline = 'none';
      el.focus({ preventScroll: true });
    };
    prepararFoco();
    const timerFoco = typeof window !== 'undefined' ? window.setTimeout(prepararFoco, 0) : 0;

    const onKeyDownTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const top = [...modalStack].reverse().find((item) => !item.isClosing);
      if (!top || top.id !== modalId) return;
      const el = contentElRef.current;
      if (!el) return;
      const focusables = obtenerFocusables(el);
      if (focusables.length === 0) {
        e.preventDefault();
        el.focus({ preventScroll: true });
        return;
      }
      const primero = focusables[0];
      const ultimo = focusables[focusables.length - 1];
      const activo = document.activeElement;
      if (!el.contains(activo)) {
        e.preventDefault();
        primero.focus();
      } else if (e.shiftKey && (activo === primero || activo === el)) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && activo === ultimo) {
        e.preventDefault();
        primero.focus();
      }
    };
    document.addEventListener('keydown', onKeyDownTab, true);

    return () => {
      document.removeEventListener('keydown', onKeyDownTab, true);
      if (timerFoco) window.clearTimeout(timerFoco);
      queueMicrotask(() => {
        const activoAhora = document.activeElement;
        const foco = !activoAhora || activoAhora === document.body || !activoAhora.isConnected;
        if (foco && elementoPrevio && elementoPrevio.isConnected) {
          elementoPrevio.focus({ preventScroll: true });
        }
      });
      if (bloquearScroll) {
        unlockScroll();
      }

      const index = modalStack.findIndex((item) => item.id === modalId);
      if (index !== -1) {
        modalStack.splice(index, 1);
      }

      // Si el modal se cerró programáticamente (no por popstate del botón atrás):
      // diferimos el retroceso al finalizar el commit para que un remount inmediato
      // (StrictMode en dev o transición entre modales) pueda reutilizar la entrada.
      if (manejarHistorial && historyPushed && !closedByPopState && typeof window !== 'undefined') {
        queueMicrotask(() => {
          if (
            window.history.state?.__modalId === modalId &&
            !modalStack.some((item) => item.id === modalId) &&
            window.history.length > 1
          ) {
            pendingProgrammaticBacks++;
            window.history.back();
          }
        });
      }
    };
  }, [activo, tieneCallback, bloquearScroll, manejarHistorial, cerrarConEsc]);

  const handleBackdropMouseDown = useCallback((e: React.MouseEvent<HTMLElement>) => {
    mouseDownTargetRef.current = e.target;
  }, []);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      if (!cerrarAlClickAfuera) return;
      if (isClickOnScrollbar(e)) return;
      if (
        e.target === e.currentTarget &&
        mouseDownTargetRef.current === e.currentTarget &&
        !bloqueadoRef.current &&
        callbackRef.current
      ) {
        callbackRef.current();
      }
      mouseDownTargetRef.current = null;
    },
    [cerrarAlClickAfuera]
  );

  const handleContentClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  return {
    handleBackdropClick,
    handleBackdropMouseDown,
    handleContentClick,
    backdropProps: {
      onMouseDown: handleBackdropMouseDown,
      onClick: handleBackdropClick,
    },
    contentProps: {
      onClick: handleContentClick,
      ref: setContentEl,
    },
  };
}
