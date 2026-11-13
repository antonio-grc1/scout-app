# Unidad & Padrón Operativo Page (`frontend/src/pages/unidad`)

## Overview
Primary operational roster and branch/unit management page (`UnidadPage.tsx`) providing multi-criteria filtering (sections, roles, birth cohorts/`camadas`, status chips), sorting, 1-tap physical form validation, QR scanning, batch cohort branch transfers (`pases por camada`), volunteer family lookup, unit event management, member creation/import, and Excel/CSV roster export.

## Interface
- `[UnidadPage.tsx:UnidadPage]` — Exported `React.FC` component rendering the operational member roster, filters, batch transition panel, and action modals.
- `[UnidadPage.tsx:CampoOrden]` — Internal union type `'miembro' | 'edad' | 'seccion' | 'ficha'` controlling roster sort column.
- `[UnidadPage.tsx:DireccionOrden]` — Internal union type `'asc' | 'desc'` controlling sort direction.
- `[UnidadPage.tsx:ChipFiltro]` — Internal union type `'TODOS' | 'FALTA_FICHA' | 'CON_DEUDA' | 'PASE_SUGERIDO' | 'BAJAS'` controlling status chip filtering.
- `[UnidadPage.tsx:calcularDeudaMiembro]` — Internal helper `(m: any) => number` computing a member's net non-cancelled debt.
- `[UnidadPage.tsx:obtenerTextoDireccion]` — Internal helper `(campo: CampoOrden, dir: DireccionOrden) => string` returning human-readable sort direction labels.

## Invariants
- `[UnidadPage.tsx:calcularDeudaMiembro]` — Excludes charges with `estado === 'ANULADO'`, clamps each charge's balance to `Math.max(0, Number(c.montoFinal) - Number(c.montoPagado))`, and rounds total debt to 2 decimal places.
- `[UnidadPage.tsx:mostrarToast]` — Suppresses error toasts when `navigator.onLine` is false or error text contains `'sin conexión'`, `'sin conexion'`, `'offline'`, or `'red'`.
- `[UnidadPage.tsx:entregasPorUsuario]` — Maps each `usuarioId` to its delivery, prioritizing entregas where `estado === 'VALIDADO_FISICAMENTE'`.
- `[UnidadPage.tsx:handleValidarFichaDirecto]` — Requires `entrega.hashVerificacion` to be truthy and `validandoId` to be null/falsy before executing; row-level `'Recibir Ficha'` button requires `entrega.estado === 'PENDIENTE_FIRMA_FISICA' && puedeValidarFisico`.
- `[UnidadPage.tsx:miembrosFiltrados]` — Filters active vs. inactive members strictly by `chipActivo === 'BAJAS'` (`!m.activo` for `'BAJAS'`, `m.activo` for all other chips).
- `[UnidadPage.tsx:miembrosFiltrados]` — Excludes educators (`esRolDeEducador`) and members without a valid `camada` when `camadasFiltro` is non-empty.
- `[UnidadPage.tsx:miembrosFiltrados]` — When `campoOrden === 'seccion'`, sorts by: (1) `obtenerOrdenRama`, (2) unit name `localeCompare('es')`, (3) protagonists before educators (`esRolDeEducador`), (4) birth date timestamp descending (younger to older), (5) `apellido + nombre` `localeCompare('es')`.
- `[UnidadPage.tsx:handleEjecutarPaseCamada]` — Aliased as `[UnidadPage.tsx:handlePasarCamada]`; requires a resolved `destinoId` (from `destinoPorCamada[grupo.key]`, `grupo.unidadesDestino[0].id`, or a fallback `SIN_RAMA_APOYO` / `'sin rama'` / `'apoyo'` unit) and `ejecutandoCamadaKey` to be falsy before posting batch transfer.
- `[UnidadPage.tsx:handleExportarPadronExcel]` / `[UnidadPage.tsx:handleExportarPadronCSV]` — Require `miembrosFiltrados.length > 0` to export (`BotonExportar` is also disabled when `miembrosFiltrados.length === 0`).
- `[UnidadPage.tsx:menuAccionesAbierto]` — Opening any filter/action dropdown menu (`acciones`, `secciones`, `roles`, `camadas`) explicitly closes the other three dropdown menus.
- `[UnidadPage.tsx:tienePermiso('miembros.crear')]` / `[UnidadPage.tsx:puedeVerFichas]` / `[UnidadPage.tsx:puedeVerCuotas]` / `[UnidadPage.tsx:puedeVerPases]` / `[UnidadPage.tsx:puedeEjecutarPases]` — Gate header creation/import actions, `'Falta Ficha'` chip & ficha modal tab, `'Con Deuda'` chip & `'Cuotas'` action, `'Pases por Camada'` chip & batch panel, and `'Pasar Camada'` / `'Pasar de Rama'` execution buttons respectively.

## Side Effects
- `[UnidadPage.tsx:cargarDatos]` — Calls `api.get('/miembros?porPagina=2000&incluirInactivos=true')`, `api.get('/organizacion/unidades')`, `api.get('/organizacion/roles')`, `api.get('/organizacion/ramas')`, and conditionally `api.get('/pases/candidatos')` (if `puedeVerPases`) and `api.get('/legajos/entregas?cicloAnio=2026')` / `api.get('/legajos/plantillas?cicloAnio=2026')` (if `puedeVerFichas`) on mount and after modal mutation callbacks.
- `[UnidadPage.tsx:handleAbrirFamiliasVoluntarias]` — Calls `api.get('/legajos/colaboradores-adultos?cicloAnio=2026')` when opening the volunteer families modal.
- `[UnidadPage.tsx:handleValidarFichaDirecto]` — Calls `api.post('/legajos/qr/validar/${entrega.hashVerificacion}')` and reloads data via `cargarDatos()`.
- `[UnidadPage.tsx:handleEjecutarPaseCamada]` — Calls `api.post('/pases/lote', { pases })` and reloads data via `cargarDatos()`.
- `[UnidadPage.tsx:handleExportarPadronExcel]` / `[UnidadPage.tsx:handleExportarPadronCSV]` — Generate and download `.xlsx` / `.csv` files of the filtered roster via `exportarAExcel` and `exportarACSV`.
- `[UnidadPage.tsx:UnidadPage]` — Registers a `window` `'keydown'` listener for `'Escape'` when any dropdown menu is open, and sets a 4000ms timeout to auto-dismiss active toasts.

## Verification
- Run: `npm run build && npm run lint`
