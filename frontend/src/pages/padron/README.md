# Padrón Page (`frontend/src/pages/padron`)

## Overview
Deprecated legacy wrapper page (`PadronPage.tsx`) that delegates rendering directly to [`UnidadPage`](../unidad/README.md).

## Interface
- `[PadronPage.tsx:PadronPage]` — Exported `React.FC` component marked `@deprecated` in JSDoc (`Utilizar UnidadPage montada sobre la ruta '/rama'`) that renders and returns `<UnidadPage />`.

## Invariants
- None

## Side Effects
- None

## Verification
- Run: `npm run build && npm run lint`
