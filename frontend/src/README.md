# Frontend Application (`frontend/src`) Blueprint

## System Overview
React 19 + TypeScript single-page and Progressive Web Application (PWA) frontend for the Grupo Scout Juan XXIII management platform. Coordinates role- and scope-gated routing (`App.tsx`), authentication and session synchronization (`store`, `api`), offline-resilient GET caching (`lib`, `api`), client-side vector PDF generation for official medical/authorization forms (`services`), QR voucher generation and camera scanning (`lib`, `components`), and operational workspaces for member rosters, self-service (`autogestion`), unit management (`unidad`), and group-wide administration and treasury (`global`).

## Local Interface & Invariants
- **Interface**:
  - `[App.tsx:App]` — Named and default exported root React component mounting `QueryClientProvider`, `BrowserRouter`, global overlays (`BannerOffline`, `ThemeCustomizerModal`, `ToastGlobal`), and protected application routes (`/login`, `/cambiar-clave`, `/autogestion`, `/perfil`, `/rama`, `/unidad`, `/padron`, `/global`, `*`).
  - `[App.tsx:RutaProtegida]` — Internal route guard (`requiereAlcance?: 'UNIDAD' | 'GLOBAL'`, `permitirCambioClave?: boolean`) enforcing authentication, mandatory password-change redirects, and scope-based route access.
  - `[App.tsx:queryClient]` — Module-scoped TanStack `QueryClient` instance.
- **Invariants**:
  - `[App.tsx:RutaProtegida]` — Unauthenticated users (`!token`) are redirected to `/login`.
  - `[App.tsx:RutaProtegida]` — Authenticated users with `requiereCambioClave === true` are redirected to `/cambiar-clave` on any protected route unless `permitirCambioClave` is `true`.
  - `[App.tsx:RutaProtegida]` — Routes with `requiereAlcance === 'GLOBAL'` require `puedeAccederPanelGestion() === true`, otherwise redirecting to `/rama` (if `puedeVerPadron()`) or `/autogestion`.
  - `[App.tsx:RutaProtegida]` — Routes with `requiereAlcance === 'UNIDAD'` require `puedeVerPadron() === true`, otherwise redirecting to `/autogestion`.
  - `[App.tsx:rutaDefault]` — Wildcard fallback route (`*`) resolves in priority order: `/login` (if `!token`), `/cambiar-clave` (if `requiereCambioClave`), `/rama` (if `puedeVerPadron()`), `/global` (if `puedeAccederPanelGestion()`), or `/autogestion`.
  - `[App.tsx:App]` — Legacy/alias paths `/unidad` and `/padron` unconditionally redirect to `/rama`.
  - `[App.tsx:queryClient]` — Configures default React Query options with `staleTime: 180000` (3 minutes), `refetchOnWindowFocus: false`, and `retry: 1`.
- **Side Effects**:
  - `[main.tsx:pdfPolyfills]` — Executes side-effect import `./lib/pdfPolyfills` at module load before application rendering.
  - `[main.tsx:registerSW]` — Registers the PWA Service Worker immediately (`registerSW({ immediate: true })`) via `virtual:pwa-register`.
  - `[main.tsx:createRoot]` — Mounts `<StrictMode><App /></StrictMode>` into `#root`.
  - `[App.tsx:useEffect]` — When `token` is truthy, invokes `refrescarSesionDesdeServidor()` on mount/token change and registers a `window` `'focus'` event listener to re-invoke `refrescarSesionDesdeServidor()`.

## Subdirectories & System Boundaries
- **api**: [./api/README.md](./api/README.md) — Shared Axios HTTP client (`api`) with 7000ms timeout, Bearer token injection, offline GET caching/fallback, and 401/403 session and password-change interceptors.
- **components**: [./components/README.md](./components/README.md) — Feature UI components, operational modals, administration/treasury panels, PDF/QR viewers, member detail tabs ([./components/detalle-miembro/README.md](./components/detalle-miembro/README.md)), and design-system primitives ([./components/ui/README.md](./components/ui/README.md)).
- **hooks**: [./hooks/README.md](./hooks/README.md) — Shared React hooks (`useModalOverlay`) managing LIFO modal stacking, Escape key dismissal, browser history (`popstate`) integration, and body scroll locking.
- **lib**: [./lib/README.md](./lib/README.md) — Formatting helpers, June 30 cohort (`camada`) calculators, role/template selectors, QR voucher canvas rendering, `localStorage` offline response caching, WebView PDF polyfills, UI permission hooks (`usePermisosUI`), and branch (`rama`) color palettes.
- **pages**: [./pages/README.md](./pages/README.md) — Top-level route views (`Login`, `CambiarClave`) and feature workspaces ([./pages/autogestion/README.md](./pages/autogestion/README.md), [./pages/global/README.md](./pages/global/README.md), [./pages/padron/README.md](./pages/padron/README.md), [./pages/perfil/README.md](./pages/perfil/README.md), [./pages/unidad/README.md](./pages/unidad/README.md)).
- **services**: [./services/README.md](./services/README.md) — Client-side vector PDF builders (`pdf-lib`, `qrcode`) for official member legajo forms and blank templates, plus organizational unit history API queries.
- **store**: [./store/README.md](./store/README.md) — Global Zustand stores for authentication and RBAC permissions (`useAuthStore`), network/cache banner status (`useOfflineStore`), theme and custom CSS tokens (`useThemeStore`), and undoable toast notifications (`useToastStore`).
- **types**: [./types/README.md](./types/README.md) — Shared TypeScript interfaces for member assignment histories (`AsignacionHistorial`, `UnidadDetalle`, `RolDetalle`, `RamaDetalle`) and PDF.js worker module declarations.
- **utils**: [./utils/README.md](./utils/README.md) — Client-side spreadsheet export utilities (`exportarACSV`, `exportarAExcel`) producing UTF-8 BOM semicolon-delimited CSV and `.xlsx` files.

## Global Invariants
- `[api/client.ts:api.interceptors.request]` / `[lib/offlineCache.ts:generarClaveCache]` — Offline GET requests (`!navigator.onLine`) fast-fail before network dispatch and resolve from deterministic `scout_cache_v1:` keys in `localStorage` when available; only HTTP 200 non-binary (`responseType` neither `'blob'` nor `'arraybuffer'`) GET responses are cached.
- `[store/authStore.ts:useAuthStore]` / `[lib/permisos.ts:usePermisosUI]` — UI route guards (`RutaProtegida`) and component-level view/edit capabilities (`canView`, `canEdit`, `tienePermiso`) derive strictly from the authenticated user's `asignaciones` scopes (`PROPIO`, `UNIDAD`, `GLOBAL`) and permission strings synchronized via `/auth/me`.
- `[lib/formatters.ts:calcularCamada]` — Birth cohort (`camada`) calculations across roster filtering and branch progression (`pases`) use the June 30 cutoff in UTC (`getUTCMonth() < 6` returns birth year `Y`; `getUTCMonth() >= 6` returns `Y + 1`).
- `[hooks/useModalOverlay.ts:modalStack]` — All modal overlays register in a shared LIFO stack so `Escape` keydowns and browser back (`popstate`) events dismiss only the topmost unblocked modal and preserve `document.body.style.overflow` scroll-lock counting.
- `[store/toastStore.ts:mostrarToast]` — Error toasts (`tipo === 'error'`) are suppressed globally when `navigator.onLine === false` or when the message text indicates an offline/network condition (`'sin conexión'`, `'sin conexion'`, `'offline'`, `'red'`).

## Global Side Effects
- `[api/client.ts:api]` — Communicates over HTTP with the backend REST API (`/api/*`), injecting `Authorization: Bearer <token>` from `localStorage` (`'scout_token'`) and redirecting `window.location.href` to `'/login'` on HTTP 401 or `'/cambiar-clave'` on HTTP 403 (`REQUIERE_CAMBIO_CLAVE`).
- `[store/authStore.ts:useAuthStore]` / `[lib/offlineCache.ts:guardarEnCache]` / `[store/themeStore.ts:useThemeStore]` — Reads and mutates `window.localStorage` for session credentials (`'scout_token'`, `'scout_user'`, `'scout_asignaciones'`, `'scout_cambio_clave'`), offline API cache entries (`'scout_cache_v1:*'`), and theme preferences (`'scout-theme'`, `'scout-theme-customization'`).
- `[store/themeStore.ts:applyDocumentThemeMode]` / `[store/themeStore.ts:applyDocumentCustomization]` — Mutates `document.documentElement` classes (`'dark'`), inline CSS custom properties (`--color-brand`, `--color-paper`, `--color-navbar`, `--font-scale`, `--brand-logo-scale`), and `<meta name="theme-color">`.
- `[services/pdfGenerator.ts:descargarPdfBlob]` / `[utils/exportadorPlanillas.ts:exportarAExcel]` / `[utils/exportadorPlanillas.ts:exportarACSV]` — Generates in-memory `Blob` URLs (`URL.createObjectURL`) and triggers browser downloads for `.pdf`, `.xlsx`, `.csv`, and `.png` files.
- `[components/ModalScannerQR.tsx:ModalScannerQR]` / `[components/QrScannerModal.tsx:QrScannerModal]` — Accesses device camera streams via `Html5Qrcode` (`html5-qrcode`) and synthesizes audio feedback tones via the Web Audio API (`AudioContext`).

## System Verification
- Run: `npm run build && npm run lint`
