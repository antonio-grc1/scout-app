# Shared Hooks (`frontend/src/hooks`)

## Overview

Provides shared React hooks for modal overlay management (`useModalOverlay`), handling LIFO modal stacking, Escape key dismissal, browser history (`popstate`) integration, body scroll locking, and backdrop click-outside detection.

## Interface

- `[index.ts:*]` — Re-exports all symbols from `./useModalOverlay`.
- `[useModalOverlay.ts:UseModalOverlayOptions]` — Options interface (`abierto?: boolean`, `isOpen?: boolean`, `onCerrar?: () => void`, `onClose?: () => void`, `bloqueado?: boolean`, `bloquearScroll?: boolean`, `cerrarConEsc?: boolean`, `cerrarAlClickAfuera?: boolean`, `manejarHistorial?: boolean`).
- `[useModalOverlay.ts:useModalOverlay]` — Hook accepting `UseModalOverlayOptions` and returning `{ handleBackdropClick, handleBackdropMouseDown, handleContentClick, backdropProps: { onMouseDown, onClick }, contentProps: { onClick } }`.

## Invariants

- `[useModalOverlay.ts:modalStack]` — Modals are processed in LIFO order (topmost non-closing entry in `modalStack` handles `Escape` keydown and browser `popstate` events first).
- `[useModalOverlay.ts:scrollLockCount]` — `scrollLockCount` is clamped to `>= 0` via `Math.max(0, scrollLockCount - 1)`; `document.body.style.overflow` is set to `'hidden'` only when transitioning from `0` and restored to `originalBodyOverflow` only when returning to `0`.
- `[useModalOverlay.ts:useModalOverlay]` — Stack registration, scroll locking, and history state pushing only execute when `activo` (`abierto ?? isOpen ?? true`) and `tieneCallback` (`Boolean(onCerrar ?? onClose)`) are both truthy.
- `[useModalOverlay.ts:handleBackdropClick]` — Backdrop click only triggers close when `cerrarAlClickAfuera` is true, click is not on a scrollbar (`!isClickOnScrollbar(e)`), both `mousedown` and `click` targets match `e.currentTarget`, and `!bloqueadoRef.current`.

## Side Effects

- `[useModalOverlay.ts:window.addEventListener('popstate')]` — Module-level listener registered at import time on `window` that intercepts browser back navigation to close the topmost unblocked modal or re-push `{ ...window.history.state, __modalId: top.id }` if blocked.
- `[useModalOverlay.ts:window.addEventListener('keydown')]` — Module-level listener registered at import time on `window` that intercepts `Escape` keydown (`preventDefault`, `stopPropagation`) to close the topmost unblocked modal with `cerrarConEsc: true`.
- `[useModalOverlay.ts:lockScroll]` — Mutates `document.body.style.overflow = 'hidden'` when `scrollLockCount` transitions from `0` to `1`.
- `[useModalOverlay.ts:unlockScroll]` — Restores `document.body.style.overflow = originalBodyOverflow` when `scrollLockCount` decrements to `0`.
- `[useModalOverlay.ts:useModalOverlay]` — Calls `window.history.pushState({ ...window.history.state, __modalId: modalId }, '')` on modal activation when `manejarHistorial` is true, and calls `window.history.back()` with a 300ms `setTimeout` guard on `ignoringPopstateCount` during cleanup if closed programmatically while `window.history.state?.__modalId === modalId`.
- `[useModalOverlay.ts:modalStack]` — Mutates module-level `modalStack`, `nextModalId`, `scrollLockCount`, `originalBodyOverflow`, and `ignoringPopstateCount` state across hook instances.

## Verification

- Run: `npm run build && npm run lint`
