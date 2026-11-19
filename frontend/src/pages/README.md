# Frontend Route Pages (`frontend/src/pages`)

## Overview
Top-level route page views for the Scout application frontend, containing authentication/password-change screens (`Login.tsx`, `CambiarClave.tsx`) and domain workspaces (`inicio`, `mi-espacio`, `miembros`, `legajos`, `pases`, `tesoreria`, `eventos`, `organizacion`) mounted inside `AppShell`.

## Interface
- `[Login.tsx:Login]` — DNI + password authentication and capability-aware redirect to `/inicio` (or `/cambiar-clave`).
- `[CambiarClave.tsx:CambiarClave]` — Mandatory initial or voluntary password update screen.
- `inicio/InicioPage.tsx` — Role-adaptive home (`/inicio`), personal status bar, operational KPIs, emergency alerts drawer, and **Modo Campamento** offline sync (`Preparar para Campamento` + pending draft sync).
- `mi-espacio/MiEspacioPage.tsx` — Personal portal (`/mi-espacio`) with 4 sub-tabs: `Mi Legajo`, `Mis Cuotas y Recibos`, `Mis Pedidos y Vales`, and `Mi Perfil`.
- `miembros/` (`MiembrosPage.tsx`, `DrawerMiembro360.tsx`, `ExpedienteMiembro360.tsx`, `MiembroDetallePage.tsx`) — Polymorphic member roster (`/miembros`), Slide-over drawer (desktop) and dedicated expediente view (`/miembros/:id`).
- `legajos/` (`LegajosPage.tsx`, `CompletarLegajoPage.tsx`, `VisualPdfEditorDrawer.tsx`) — Compliance dashboard, adult collaborators, template CRUD + bidirectional visual PDF coordinate editor (`/legajos`), and 7-step form wizard (`/legajos/completar`) with IndexedDB offline draft persistence.
- `pases/PasesPage.tsx` — Branch progression by June 30 cohort (`30/06`) and inter-section transfer requests inbox (`/pases`).
- `tesoreria/TesoreriaPage.tsx` — Capability-gated treasury module (`/tesoreria`) with `Cobranzas y Familias` (partial collection drawer + scope lock), `Planes y Conceptos`, `Caja, Bancos y Gastos`, and `Cuadro de Resultados`.
- `eventos/` (`EventosCatalogoPage.tsx`, `EventoWorkspacePage.tsx`) — Event catalog cards (`/eventos`) and 3-tab operational workspace (`/eventos/:id`: POS quick sale, Orders & QR vouchers, Family earnings liquidation).
- `organizacion/OrganizacionPage.tsx` — Group governance (`/organizacion`) with `Ramas y Unidades`, `Roles RBAC`, and `Correo SMTP`.

## Invariants
- `[Login.tsx:Login]` / `[CambiarClave.tsx:CambiarClave]` — Authenticated users without pending password change resolve to `/inicio` via `obtenerRutaInicialUsuario`.
- `[Login.tsx:Login]` — Strips non-digits (`/\D/g`) from DNI input and trims credentials on submit.
- `[CambiarClave.tsx:handleSubmit]` — Requires `claveNueva.length >= 8`, `claveNueva === claveRepetir`, and `claveNueva !== claveActual`.

## Verification
- Run: `npm run build && npm run lint`
