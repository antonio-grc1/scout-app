# Components (`components`)

## Overview
Provides the unified navigation shell (`layout/`), universal QR scanner (`qr/`), design-system primitives (`ui/`), member dossier tabs (`detalle-miembro/`), and reusable feature modals and management panels for members, dynamic medical/authorization forms (`legajos`), branch progression (`pases`), treasury accounts/ledgers, fee plans, fundraising events, PDF viewing, offline status, PWA installation, and theme customization.

## Interface
- [Layout (`./layout/`)](./layout/AppShell.tsx) — `AppShell` (desktop sidebar + topbar with Active Unit selector and `Ctrl+K`, mobile bottom bar + FAB + "Más" drawer) and `CommandPaletteModal`.
- [QR Scanner (`./qr/`)](./qr/QrScannerUniversalModal.tsx) — `QrScannerUniversalModal` unifying legajo hash verification and event ticket QR scanning with continuous door mode and inline pending-payment collection.
- [Detalle de Miembro](./detalle-miembro/README.md) — Modular tabs and assignment timeline for `ExpedienteMiembro360` (`PestanaCuotasTesoreria`, `PestanaDatosMiembro`, `PestanaLegajosFichas`, `PestanaPaseRol`, `PestanaSeguridad`, `TrayectoriaMiembro`).
- [UI Primitives](./ui/README.md) — Reusable design-system primitives (`Button`, `BrandLogo`, `Badge`, `Input`, `Select`, `Textarea`, `BotonExportar`, `Drawer`, `ConfirmImpactDialog`, `KpiCard`, `SegmentedTabs`, `ToastGlobal`).
- `[BannerOffline.tsx:BannerOffline]` — Sticky online/reconnected or offline/cached status banner using `useOfflineStore`.
- `[BotonInstalarPwa.tsx:BotonInstalarPwa]` — PWA installation trigger and fallback guide modal via portal.
- `[BotonLlamarMiembro.tsx:BotonLlamarMiembro]` — Call button and emergency/family phone sheet.
- `[DynamicFormRenderer.tsx:DynamicFormRenderer]` — Multi-step dynamic form renderer with conditional fields, draft saving, PDF preview hook, and validation on finalization.
- `[MiembroCard.tsx:MiembroCard]` — Touch-friendly member summary card with emergency call trigger and 1-tap physical validation.
- `[ModalAltaMiembro.tsx:ModalAltaMiembro]` — New member creation form/sheet with sibling family lookup.
- `[ModalCargarPedidoEvento.tsx:ModalCargarPedidoEvento]` — Event order creation/edition modal preserving `'PENDIENTE'` payment state when editing.
- `[ModalCobrarDeuda.tsx:ModalCobrarDeuda]` — Partial/full debt collection form/drawer applying `Saldo a Favor` and surplus credit.
- `[ModalCobroCampamento.tsx:ModalCobroCampamento]` — Camp and special charge concept creator/editor.
- `[ModalConcepto.tsx:ModalConcepto]` — Treasury charge concept modal (`CUOTA_GRUPO`, `CAMPAMENTO`, `EVENTO`, `INSCRIPCION`, `OTRO`).
- `[ModalConfirmacion.tsx:ModalConfirmacion]` — Confirmation and alert modal.
- `[ModalCrearCuentaFinanciera.tsx:ModalCrearCuentaFinanciera]` — Financial account CRUD modal.
- `[ModalCrearEventoEconomico.tsx:ModalCrearEventoEconomico]` — Economic event & item catalog CRUD modal.
- `[ModalCrearRubro.tsx:ModalCrearRubro]` — Accounting category (`rubro`) CRUD modal.
- `[ModalEditarFamilia.tsx:ModalEditarFamilia]` — Family group name and sibling discount editor.
- `[ModalGenerarDeudaManual.tsx:ModalGenerarDeudaManual]` — Individual manual charge generator.
- `[ModalGestionRubros.tsx:ModalGestionRubros]` — Accounting categories drawer/modal.
- `[ModalHistorialSeccion.tsx:ModalHistorialSeccion]` — Historical unit assignments drawer/modal.
- `[ModalImportarMiembros.tsx:ModalImportarMiembros]` — 3-step Excel/CSV member importer.
- `[ModalPlanCuotaMensual.tsx:ModalPlanCuotaMensual]` — Monthly fee plan configurator.
- `[ModalRegistrarGasto.tsx:ModalRegistrarGasto]` — Treasury expense (`egreso`) creator/editor.
- `[ModalRegistrarIngreso.tsx:ModalRegistrarIngreso]` — Treasury income (`ingreso`) creator/editor.
- `[ModalTicketQR.tsx:ModalTicketQR]` — QR voucher viewer, PNG generator, clipboard copy, and fullscreen display.
- `[ModalTraspasoCuentas.tsx:ModalTraspasoCuentas]` — Account-to-account transfer modal.
- `[ModalVincularHermano.tsx:ModalVincularHermano]` — Sibling family linking modal.
- `[PanelAdminRamas.tsx:PanelAdminRamas]` — Pedagogical branches (`ramas`) and units (`unidades`) manager.
- `[PanelCuadroResultados.tsx:PanelCuadroResultados]` — Annual/monthly income statement (`Cuadro de Resultados`) with print and Excel/CSV export.
- `[PanelGastosTesoreria.tsx:PanelGastosTesoreria]` — Expenses ledger with filter, void, and restore.
- `[PanelGestorRoles.tsx:PanelGestorRoles]` — RBAC roles and permissions editor grouped by domain with anti-lockout guards.
- `[PanelPasesPorCamada.tsx:PanelPasesPorCamada]` — Cohort-based branch progression (`30/06` cutoff) with per-candidate destination override and batch execution.
- `[PanelTesoreriaCajaBanco.tsx:PanelTesoreriaCajaBanco]` — Multi-account treasury ledger (`Libro Diario`), transfers, and Excel/CSV exports.
- `[PdfViewerModal.tsx:PdfViewerModal]` — PDF document canvas viewer (`pdfjs-dist`) with zoom and download controls.
- `[SelectorDestinatarios.tsx:SelectorDestinatarios]` — Target group and individual exclusion selector for fee plans and concepts.
- `[ThemeCustomizerModal.tsx:ThemeCustomizerModal]` — Preset selector (`Claro`, `Oscuro`, `Alto Contraste AAA`, `Sistema`) and font scaling (`100%`, `110%`, `125%`).
- `[ThemeToggle.tsx:ThemeToggle]` — Theme mode switcher (`icon` | `dropdown` | `segmented`).
- `[VisorFichaMiembro.tsx:VisorFichaMiembro]` — Read-only medical, family, and authorization summary viewer.

## Invariants
- `[ThemeCustomizerModal.tsx:ThemeCustomizerModal]` — Exposes strictly the 3 audited WCAG presets (`Claro`, `Oscuro`, `Alto Contraste AAA`) and typography scaling without arbitrary hex color pickers or button glow styles.
- `[QrScannerUniversalModal.tsx]` — Auto-routes between legajo hashes and event ticket tokens, enforcing `scanInProgressRef` camera lock and inline pending-payment collection without nested modals.
- `[PanelGestorRoles.tsx:solicitarEliminarRol]` — Blocks deleting the last global admin role or any role with active assignments.
- `[PanelCuadroResultados.tsx]` / `[PanelTesoreriaCajaBanco.tsx]` — Sanitize spreadsheet cells against formula injection via `exportadorPlanillas.ts`.

## Verification
- Run: `npm run build && npm run lint && npm test`
