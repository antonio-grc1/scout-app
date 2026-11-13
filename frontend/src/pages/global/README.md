# Global Management Page (`frontend/src/pages/global`)

## Overview
Group-wide administration and treasury management page (`GlobalPage.tsx`) coordinating treasury sub-modules (cash/bank accounts, expenses, balance sheet, QR events, monthly fee plans, camps/special concepts, family billing), organizational structure, roles & permissions, form templates, branch transitions (`pases`), and adult collaborators.

## Interface
- `[GlobalPage.tsx:GlobalPage]` — Exported `React.FC` component rendering the global management and treasury page.

## Invariants
- `[GlobalPage.tsx:TabGestion]` — Active main tab is constrained to `'tesoreria' | 'colaboradores' | 'organizacion' | 'roles' | 'pases' | 'plantillas'`.
- `[GlobalPage.tsx:SubTabTesoreria]` — Active treasury sub-tab is constrained to `'caja-banco' | 'gastos' | 'balance' | 'eventos-qr' | 'planes' | 'campamentos' | 'familias'`.
- `[GlobalPage.tsx:tabPorDefecto]` — Default main tab fallback priority order: `'tesoreria'` -> `'roles'` -> `'organizacion'` -> `'plantillas'` -> `'pases'` -> `'colaboradores'` based on permission flags (`puedeVerTesoreria`, `puedeVerRoles`, `puedeVerOrganizacion`, `puedeVerPlantillas`, `puedeVerPases`).
- `[GlobalPage.tsx:subTabPorDefecto]` — Default treasury sub-tab fallback priority order: `'caja-banco'` -> `'gastos'` -> `'balance'` -> `'eventos-qr'` -> `'planes'` -> `'campamentos'` -> `'familias'` -> `'caja-banco'` based on permission flags (`puedeVerCaja`, `puedeVerGastos`, `puedeVerBalance`, `puedeVerEventos`, `puedeVerPlanes`, `puedeVerCampamentos`, `puedeVerFamilias`).
- `[GlobalPage.tsx:tabInicial]` — URL query parameter `?tab=` is only accepted if `permisoPorTab[desdeUrl]` is truthy; otherwise falls back to `tabPorDefecto()`.
- `[GlobalPage.tsx:subTabInicial]` — URL query parameter `?sub=` is only accepted if `permisoPorSubTab[desdeUrl]` is truthy; otherwise falls back to `subTabPorDefecto()`.
- `[GlobalPage.tsx:cambiarTab]` — Switching to a tab other than `'tesoreria'` deletes the `'sub'` query parameter from URL `searchParams`.
- `[GlobalPage.tsx:GlobalPage]` — Special charges/camps view (`'campamentos'` sub-tab) filters concepts to only those where `!con.planCuotaMensualId`.
- `[GlobalPage.tsx:handleToggleMesPlan]` — Enabled months array (`nuevosMeses`) is kept sorted ascending (`(a, b) => a - b`) when toggling months `1..12`.

## Side Effects
- `[GlobalPage.tsx:cambiarTab]` — Mutates URL search params (`?tab=` and removes `?sub=` when `tab !== 'tesoreria'`) via `setSearchParams`.
- `[GlobalPage.tsx:cambiarSubTabTesoreria]` — Mutates URL search params (`?tab=tesoreria&sub=...`) via `setSearchParams`.
- `[GlobalPage.tsx:cargarDatos]` — When `tab === 'pases'`, performs `GET '/pases/candidatos'` and conditionally `GET '/organizacion/unidades'` (if `unidades` is empty).
- `[GlobalPage.tsx:cargarDatos]` — When `tab === 'tesoreria'`, performs parallel GET requests to `'/tesoreria/planes-mensuales'`, `'/tesoreria/conceptos'`, `'/tesoreria/familias'`, `'/organizacion/unidades'` (if empty), `'/tesoreria/cuentas'`, `'/tesoreria/rubros'`, `'/tesoreria/gastos'`, `'/tesoreria/eventos'`, and `'/tesoreria/cuadro-resultados?anio=${new Date().getFullYear()}'`, plus pre-caches ledger per account via `GET '/tesoreria/cuentas/${c.id}/libro-diario'`.
- `[GlobalPage.tsx:cargarDatos]` — When `tab === 'organizacion'`, performs `GET '/organizacion/ramas'` and `GET '/organizacion/unidades'` (with `'?incluirInactivas=true'` when `mostrarInactivasOrg` is true).
- `[GlobalPage.tsx:cargarDatos]` — When `tab === 'roles'`, performs `GET '/organizacion/roles'` and `GET '/organizacion/permisos'`.
- `[GlobalPage.tsx:cargarDatos]` — When `tab === 'colaboradores'`, performs `GET '/legajos/colaboradores-adultos?cicloAnio=2026'`.
- `[GlobalPage.tsx:handleSolicitarEliminarPlan]` — Performs `DELETE '/tesoreria/planes-mensuales/${plan.id}'` on confirmation, and registers an undo toast callback via `mostrarToastConDeshacer` that performs `POST '/tesoreria/planes-mensuales'`.
- `[GlobalPage.tsx:handleToggleMesPlan]` — Performs `POST '/tesoreria/planes-mensuales/${plan.id}/sincronizar-meses'` with `{ mesesHabilitados: nuevosMeses }`.
- `[GlobalPage.tsx:handleSolicitarEliminarConcepto]` — Performs `DELETE '/tesoreria/conceptos/${con.id}'` on confirmation, and registers an undo toast callback via `mostrarToastConDeshacer` that performs `POST '/tesoreria/conceptos'` with `generarCargosInmediatos: true`.
- `[GlobalPage.tsx:GlobalPage]` — Invokes `useAuthStore().refrescarSesionDesdeServidor()` after reloading roles in `PanelGestorRoles.onRecargar`.
- `[GlobalPage.tsx:mostrarToast]` — Triggers global toast notifications via `useToastStore.getState().mostrarToast(texto, tipo)`.

## Verification
- Run: `npm run build && npm run lint`
