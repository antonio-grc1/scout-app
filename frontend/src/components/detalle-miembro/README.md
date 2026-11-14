# Detalle de Miembro (`detalle-miembro`)

## Overview
Provides the modular tab views and timeline subcomponents used inside the 360° member dossier (`ExpedienteMiembro360` / `DrawerMiembro360` / `MiembroDetallePage`) to inspect and manage personal profile data, branch/role assignments, account security, medical/authorization forms, and treasury charges/payments.

## Interface
- `[PestanaCuotasTesoreria.tsx:CargoEditando]` — Exported interface for inline editing of a member charge/fee (`id`, `nombreConcepto`, `esIndividual`, `montoOriginal`, `montoDescuento`, `fechaVencimiento`).
- `[PestanaCuotasTesoreria.tsx:PagoEditando]` — Exported interface for inline editing of a registered payment (`id`, `metodoPago: 'EFECTIVO' | 'TRANSFERENCIA' | 'OTRO'`, `referenciaComprobante`, `observaciones`).
- `[PestanaCuotasTesoreria.tsx:PestanaCuotasTesoreriaProps]` — Exported props interface for `PestanaCuotasTesoreria`.
- `[PestanaCuotasTesoreria.tsx:PestanaCuotasTesoreria]` — Exported `React.FC<PestanaCuotasTesoreriaProps>` rendering the member's financial summary, manual credit balance adjustment form, family group bar, active/cancelled charges list with inline editor, and payment history with inline editor.
- `[PestanaDatosMiembro.tsx:FormDatosMiembro]` — Exported interface defining editable member personal, contact, family, medical, and active status fields.
- `[PestanaDatosMiembro.tsx:PestanaDatosMiembroProps]` — Exported props interface for `PestanaDatosMiembro`.
- `[PestanaDatosMiembro.tsx:PestanaDatosMiembro]` — Exported `React.FC<PestanaDatosMiembroProps>` rendering the member profile form/read-only view, family group section, `TrayectoriaMiembro` timeline, and active status toggle.
- `[PestanaLegajosFichas.tsx:PestanaLegajosFichasProps]` — Exported props interface for `PestanaLegajosFichas`.
- `[PestanaLegajosFichas.tsx:PestanaLegajosFichas]` — Exported `React.FC<PestanaLegajosFichasProps>` rendering medical/authorization form status, action buttons (validate physical copy, preview/download PDF, open editor), `VisorFichaMiembro`, or `DynamicFormRenderer` when editing.
- `[PestanaPaseRol.tsx:PestanaPaseRolProps]` — Exported props interface defining role transfer/addition parameters.
- `[PestanaPaseRol.tsx:PestanaPaseRol]` — Exported `React.FC<PestanaPaseRolProps>` for transferring a member's branch/role (`MUDAR`), assigning additional roles (`AGREGAR`), and closing active secondary roles.
- `[PestanaSeguridad.tsx:PestanaSeguridadProps]` — Exported props interface with `miembro`, `reseteandoClave`, and `onResetClave`.
- `[PestanaSeguridad.tsx:PestanaSeguridad]` — Exported `React.FC<PestanaSeguridadProps>` for resetting a member's password back to their DNI.
- `[TrayectoriaMiembro.tsx:TrayectoriaMiembroProps]` — Exported props interface with optional `asignaciones?: AsignacionHistorial[]`.
- `[TrayectoriaMiembro.tsx:TrayectoriaMiembro]` — Exported `React.FC<TrayectoriaMiembroProps>` collapsible timeline component displaying a member's historical and active assignments.

## Invariants
- `[PestanaCuotasTesoreria.tsx:tipoAjusteSaldo]` — Manual balance adjustment amount input enforces `min=0` when `tipoAjusteSaldo === 'FIJAR'` and `min=0.01` when `'CARGAR'` or `'DESCONTAR'`.
- `[PestanaCuotasTesoreria.tsx:pendiente]` — Charge pending amount is clamped to non-negative via `Math.max(0, Number(c.montoFinal) - Number(c.montoPagado))`.
- `[PestanaCuotasTesoreria.tsx:puedeCobrar]` — Per-charge collect action is only enabled when `puedeCobrarCuotas` is `true` and `c.estado !== 'PAGADO'` and `c.estado !== 'ANULADO'`.
- `[PestanaDatosMiembro.tsx:campos]` — Identity fields require `puedeEditarIdentidad`; contact/medical fields require `puedeEditarContacto`.
- `[PestanaLegajosFichas.tsx:esPendiente]` — Physical form validation button (`Recibir Papel`) only renders when `entregas[0]?.estado === 'PENDIENTE_FIRMA_FISICA'` and `puedeValidarFisico` is `true`.
- `[PestanaPaseRol.tsx:PestanaPaseRol]` — Active role closure button (`Cerrar Rol`) renders only when `asignacionesActivas.length > 1` and `onCerrarAsignacion` is provided.
- `[TrayectoriaMiembro.tsx:TrayectoriaMiembro]` — Assignment history is sorted with active assignments first, then descending by `fechaInicio` and `id`.

## Verification
- Run: `npm run build && npm run lint`
