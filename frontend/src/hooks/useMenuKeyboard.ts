import { useCallback, useEffect, useRef } from 'react';

const SELECTOR_ITEMS = '[role="menuitem"]:not([disabled]),[role="menuitemradio"]:not([disabled])';

/**
 * Teclado para menús desplegables (role="menu"): al abrir enfoca el primer ítem, ↑/↓/Inicio/Fin
 * navegan, Escape cierra y el foco vuelve al botón que abrió el menú.
 * Uso: const { menuRef, onKeyDown } = useMenuKeyboard(abierto, cerrar);
 *      <div role="menu" ref={menuRef} onKeyDown={onKeyDown}>…
 */
export function useMenuKeyboard(abierto: boolean, cerrar: () => void) {
  const menuRef = useRef<HTMLDivElement>(null);
  const cerrarRef = useRef(cerrar);
  cerrarRef.current = cerrar;

  useEffect(() => {
    if (!abierto) return;
    const disparador = document.activeElement as HTMLElement | null;
    const t = window.setTimeout(() => {
      menuRef.current?.querySelector<HTMLElement>(SELECTOR_ITEMS)?.focus();
    }, 0);
    return () => {
      window.clearTimeout(t);
      if (disparador?.isConnected) disparador.focus({ preventScroll: true });
    };
  }, [abierto]);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>(SELECTOR_ITEMS) ?? []);
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cerrarRef.current();
      return;
    }
    if (items.length === 0) return;
    const idx = items.indexOf(document.activeElement as HTMLElement);
    let destino: HTMLElement | undefined;
    if (e.key === 'ArrowDown') destino = items[(idx + 1) % items.length];
    else if (e.key === 'ArrowUp') destino = items[(idx - 1 + items.length) % items.length];
    else if (e.key === 'Home') destino = items[0];
    else if (e.key === 'End') destino = items[items.length - 1];
    else if (e.key === 'Tab') {
      cerrarRef.current();
      return;
    }
    if (destino) {
      e.preventDefault();
      destino.focus();
    }
  }, []);

  return { menuRef, onKeyDown };
}
