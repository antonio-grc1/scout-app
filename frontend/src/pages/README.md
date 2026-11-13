# Frontend Route Pages (`frontend/src/pages`)

## Overview
Top-level route page views for the Scout application frontend, containing direct authentication and mandatory password-change screens (`Login.tsx`, `CambiarClave.tsx`) and organizing domain route modules into dedicated subdirectories (`autogestion`, `global`, `padron`, `perfil`, `unidad`).

## Interface
- `[Login.tsx:Login]` — Exported `React.FC` page component for DNI + password authentication and role-aware post-login redirection.
- `[CambiarClave.tsx:CambiarClave]` — Exported `React.FC` page component for mandatory initial password update or voluntary password change.
- [Autogestión (`./autogestion/README.md`)](./autogestion/README.md) — `[AutogestionPage.tsx:AutogestionPage]` member self-service portal (`'papeles'`, `'cuotas'`, `'eventos'`).
- [Global (`./global/README.md`)](./global/README.md) — `[GlobalPage.tsx:GlobalPage]` group administration and treasury management console.
- [Padrón (`./padron/README.md`)](./padron/README.md) — `[PadronPage.tsx:PadronPage]` `@deprecated` legacy route wrapper delegating to `UnidadPage`.
- [Perfil (`./perfil/README.md`)](./perfil/README.md) — `[PerfilPage.tsx:PerfilPage]` personal profile, family group, contact details, and password management view.
- [Unidad (`./unidad/README.md`)](./unidad/README.md) — `[UnidadPage.tsx:UnidadPage]` operational member roster, multi-filter view, QR validation, and cohort transition (`pases`) manager.

## Invariants
- `[Login.tsx:Login]` — If `token` and `usuario` are already present in `useAuthStore`, immediately renders `<Navigate replace />` to `'/cambiar-clave'` (if `requiereCambioClave`), `'/rama'` (if `puedeVerPadron()`), `'/global'` (if `puedeAccederPanelGestion()`), or `'/autogestion'`.
- `[Login.tsx:Login]` — Strips non-digit characters (`/\D/g`) from the DNI input on change and trims `dni` on submit.
- `[Login.tsx:handleSubmit]` — After login, redirects with `{ replace: true }` to `'/cambiar-clave'` if `res.data.requiereCambioClave` is truthy; otherwise redirects to `'/rama'` if any entry in `res.data.asignaciones` has `alcance === 'GLOBAL'` or `'UNIDAD'`, else `'/autogestion'`.
- `[CambiarClave.tsx:handleSubmit]` — Trims `claveActual`, `claveNueva`, and `claveRepetir`; requires `claveNueva.length >= 8`, `claveNueva === claveRepetir`, and `claveNueva !== claveActual` before submitting.
- `[CambiarClave.tsx:rutaDestino]` — Computes destination route as `'/rama'` if `puedeVerPadron()`, else `'/global'` if `puedeAccederPanelGestion()`, else `'/autogestion'`.
- `[CambiarClave.tsx:CambiarClave]` — Hides `<Navbar />` and the back button when `requiereCambioClave` is `true`, rendering `<ThemeToggle variant="segmented" />` instead.

## Side Effects
- `[Login.tsx:handleSubmit]` — Sends `POST '/auth/login'` with `{ dni, password }`, calls `useAuthStore.setSesion(res.data)`, and navigates with `{ replace: true }` via `react-router-dom` `useNavigate`.
- `[CambiarClave.tsx:handleSubmit]` — Sends `POST '/auth/cambiar-clave'` with `{ claveActual, claveNueva }`, calls `useAuthStore.setSesion(res.data)` and `setRequiereCambioClave(false)`, and navigates to `rutaDestino()` after a 1000ms `setTimeout`.

## Verification
- Run: `npm run build && npm run lint`
