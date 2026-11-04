import { useEffect, useRef, useCallback } from 'react';

interface ModalStackEntry {
  id: number;
  close: () => void;
  isBlocked: () => boolean;
}

const modalStack: ModalStackEntry[] = [];
let nextModalId = 1;
let scrollLockCount = 0;
let originalBodyOverflow = '';

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

// Global keydown listener for Escape key (LIFO stack: closes topmost modal first)
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape' && modalStack.length > 0) {
      const top = modalStack[modalStack.length - 1];
      if (top && !top.isBlocked()) {
        e.preventDefault();
        e.stopPropagation();
        top.close();
      }
    }
  });
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
}: UseModalOverlayOptions = {}) {
  const activo = abierto ?? isOpen ?? true;
  const cerrarCallback = onCerrar ?? onClose;
  const tieneCallback = Boolean(cerrarCallback);

  const callbackRef = useRef(cerrarCallback);
  callbackRef.current = cerrarCallback;

  const bloqueadoRef = useRef(bloqueado);
  bloqueadoRef.current = bloqueado;

  const mouseDownTargetRef = useRef<EventTarget | null>(null);

  useEffect(() => {
    if (!activo || !tieneCallback) return;

    if (bloquearScroll) {
      lockScroll();
    }

    const modalId = nextModalId++;
    if (cerrarConEsc) {
      modalStack.push({
        id: modalId,
        close: () => {
          if (callbackRef.current) {
            callbackRef.current();
          }
        },
        isBlocked: () => Boolean(bloqueadoRef.current),
      });
    }

    return () => {
      if (bloquearScroll) {
        unlockScroll();
      }
      if (cerrarConEsc) {
        const index = modalStack.findIndex((item) => item.id === modalId);
        if (index !== -1) {
          modalStack.splice(index, 1);
        }
      }
    };
  }, [activo, tieneCallback, bloquearScroll, cerrarConEsc]);

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
    },
  };
}
