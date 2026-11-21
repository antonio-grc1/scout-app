# Frontend Application (`frontend/src`) Blueprint

## System Overview
React 19 + TypeScript single-page and Progressive Web Application (PWA) frontend for the Grupo Scout Juan XXIII management platform. Coordinates capability-gated domain routing (`App.tsx` + `core/capabilities.ts`), unified navigation shell (`components/layout/AppShell.tsx`), authentication and session synchronization (`store/authStore.ts`, `api/client.ts`), offline-resilient IndexedDB caching & campamento sync (`lib/offlineCache.ts`, `core/offline/campamentoSync.ts`), client-side vector PDF generation (`services/`), unified QR scanning (`components/qr/QrScannerUniversalModal.tsx`), and domain workspaces (`pages/{inicio,mi-espacio,miembros,legajos,pases,tesoreria,eventos,organizacion}`).

## Local Interface & Invariants
- **Interface**:
  - `[App.tsx:App]` — Root component mounting `QueryClientProvider`, `BrowserRouter`, global overlays (`BannerOffline`, `QrScannerUniversalModal`, `ThemeCustomizerModal`, `ToastGlobal`), and domain routes (`/login`, `/cambiar-clave`, `/inicio`, `/mi-espacio`, `/miembros`, `/miembros/:id`, `/legajos`, `/legajos/completar`, `/pases`, `/tesoreria`, `/eventos`, `/eventos/:id`, `/organizacion`).
  - `[App.tsx:RutaProtegida]` — Capability guard (`permitirCambioClave?: boolean`, `permitido?: (caps: Capabilities) => boolean`) enforcing authentication, mandatory password-change redirects, and capability-based access without hardcoded role names.
  - `[App.tsx:queryClient]` — Module-scoped TanStack `QueryClient` instance (`staleTime: 180000`, `refetchOnWindowFocus: false`, `retry: 1`).
- **Invariants**:
  - `[App.tsx:RutaProtegida]` — Unauthenticated users (`!token`) redirect to `/login`; users with `requiereCambioClave === true` redirect to `/cambiar-clave` unless `permitirCambioClave` is `true`.
  - `[App.tsx:App]` — Legacy URLs (`/autogestion`, `/perfil`, `/rama`, `/unidad`, `/padron`, `/global`) redirect cleanly to their unified domain equivalents (`/mi-espacio`, `/miembros`, `/tesoreria`).
  - `[core/capabilities.ts:computeCapabilities]` — Derives scope (`PROPIO | UNIDAD | GLOBAL`), active unit selection (`useActiveUnitStore`), and declarative capabilities strictly from `asignaciones` and permission strings.
- **Side Effects**:
  - `[main.tsx:pdfPolyfills]` — Loads `./lib/pdfPolyfills` before mounting React.
  - `[main.tsx:registerSW]` — Registers PWA Service Worker (`registerType: 'prompt'`) via `virtual:pwa-register`.
  - `[App.tsx:useEffect]` — Synchronizes `/auth/me` on mount/token change and window focus.

## Subdirectories & System Boundaries
- **api**: [./api/README.md](./api/README.md) — Shared Axios HTTP client (`api`) with 7000ms timeout, GET deduplication, offline GET cache fallback, and offline mutation blocking.
- **core**: Capability engine (`capabilities.ts`), global QR modal store (`qrModalStore.ts`), and Modo Campamento offline sync + IndexedDB local legajo drafts (`offline/campamentoSync.ts`).
- **components**: [./components/README.md](./components/README.md) — App shell (`layout/`), unified QR scanner (`qr/`), UI primitives (`ui/`), member detail tabs (`detalle-miembro/`), and reusable domain modals/panels.
- **hooks**: [./hooks/README.md](./hooks/README.md) — `useModalOverlay` (LIFO modal stack, `Escape`, `popstate`, scroll locking) and `useHtml5QrScanner`.
- **lib**: [./lib/README.md](./lib/README.md) — Formatting helpers, dynamic cycle year (`obtenerCicloAnioActual`), June 30 cohort calculators, IndexedDB/localStorage cache (`offlineCache.ts`), medical alerts, and permission utilities.
- **pages**: [./pages/README.md](./pages/README.md) — Auth screens (`Login`, `CambiarClave`) and unified domain modules (`inicio`, `mi-espacio`, `miembros`, `legajos`, `pases`, `tesoreria`, `eventos`, `organizacion`).
- **services**: [./services/README.md](./services/README.md) — Web Worker PDF builders (`pdf-lib`, `qrcode`), `pdfGenerator.ts`, and organizational unit history queries.
- **store**: [./store/README.md](./store/README.md) — Zustand stores (`useAuthStore`, `useOfflineStore`, `useThemeStore`, `useToastStore`).
- **types**: [./types/README.md](./types/README.md) — Shared TypeScript interfaces (`AsignacionHistorial`, `pdfjs-worker.d.ts`).
- **utils**: [./utils/README.md](./utils/README.md) — Formula-sanitized spreadsheet export utilities (`exportadorPlanillas.ts`).

## Global Invariants
- `[api/client.ts:api.interceptors.request]` / `[lib/offlineCache.ts:obtenerDeCache]` — Offline GET requests resolve from memory/IndexedDB/localStorage cache without waiting for timeout; offline server mutations (`POST`, `PUT`, `PATCH`, `DELETE`, excluding `/auth/logout`) fail fast with a visible warning toast.
- `[core/offline/campamentoSync.ts]` — Proactive download caches roster, entregas, plantillas, units, branches, and pases candidates; legajo drafts edited offline persist in IndexedDB (`PENDIENTE_SINCRONIZAR`) and are purged along with `offlineCache` on `logout()`.
- `[store/themeStore.ts:useThemeStore]` — Exposes a single WCAG-audited preset (`scout`) with light, dark and system modes, plus typography scaling (`100%`, `110%`, `125%`) with no button glow effects. A high-contrast (AAA) preset is not implemented yet.

## System Verification
- Run: `npm run build && npm run lint && npm test`
