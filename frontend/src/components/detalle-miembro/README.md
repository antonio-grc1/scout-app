# Detalle de Miembro (`detalle-miembro`)

## Overview
Provides the modular tab views and timeline subcomponents used inside the member detail modal (`ModalDetalleMiembro`) to inspect and manage personal profile data, branch/role assignments, account security, medical/authorization forms, and treasury charges/payments.

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
- `[PestanaPaseRol.tsx:PestanaPaseRolProps]` — Exported props interface defining role transfer/addition parameters (`candidatoPase`, `categoriaDestino`, `onCambioCategoria`, `tieneGlobal`, `ramas`, `ramaSeleccionadaId`, `ramaSeleccionadaObj`, `unidadesRamaSeleccionada`, `unidadDestinoId`, `setUnidadDestinoId`, `rolDestinoId`, `setRolDestinoId`, `rolesRama`, `rolesSinRama`, `rolesJefatura`, `onSeleccionarRama`, `onEjecutarPase`, `ejecutandoPase`, `esMismoDestino`, `asignacionesActivas`, `onCerrarAsignacion`, `onAgregarAsignacion`, `asignacionPrincipalId`).
- `[PestanaPaseRol.tsx:PestanaPaseRol]` — Exported `React.FC<PestanaPaseRolProps>` for transferring a member's branch/role (`MUDAR`), assigning additional roles (`AGREGAR`), and closing active secondary roles.
- `[PestanaSeguridad.tsx:PestanaSeguridadProps]` — Exported props interface with `miembro`, `reseteandoClave`, and `onResetClave`.
- `[PestanaSeguridad.tsx:PestanaSeguridad]` — Exported `React.FC<PestanaSeguridadProps>` for resetting a member's password back to their DNI.
- `[TrayectoriaMiembro.tsx:TrayectoriaMiembroProps]` — Exported props interface with optional `asignaciones?: AsignacionHistorial[]`.
- `[TrayectoriaMiembro.tsx:TrayectoriaMiembro]` — Exported `React.FC<TrayectoriaMiembroProps>` collapsible timeline component displaying a member's historical and active assignments.

## Invariants
- `[PestanaCuotasTesoreria.tsx:tipoAjusteSaldo]` — Manual balance adjustment amount input enforces `min=0` when `tipoAjusteSaldo === 'FIJAR'` and `min=0.01` when `'CARGAR'` or `'DESCONTAR'`, and is required.
- `[PestanaCuotasTesoreria.tsx:pendiente]` — Charge pending amount is clamped to non-negative via `Math.max(0, Number(c.montoFinal) - Number(c.montoPagado))`.
- `[PestanaCuotasTesoreria.tsx:puedeCobrar]` — Per-charge collect action is only enabled when `puedeCobrarCuotas` is `true` and `c.estado !== 'PAGADO'` and `c.estado !== 'ANULADO'`.
- `[PestanaCuotasTesoreria.tsx:CargoEditando]` — Inline charge edit form requires `montoOriginal >= 0` and `montoDescuento >= 0` (`step="0.01"`), and requires `nombreConcepto` when `cargoEditando.esIndividual` is `true`.
- `[PestanaDatosMiembro.tsx:campos]` — Identity fields (`nombre`, `apellido`, `dni`, `fechaNacimiento`) require `puedeEditarIdentidad` to edit and are required when editable; contact/medical fields require `puedeEditarContacto`; read-only fields with empty values are omitted from rendering (`!c.editable && !valor`).
- `[PestanaLegajosFichas.tsx:esPendiente]` — Physical form validation button (`Recibir Papel`) only renders when `entregas[0]?.estado === 'PENDIENTE_FIRMA_FISICA'` and `puedeValidarFisico` is `true`.
- `[PestanaLegajosFichas.tsx:valoresIniciales]` — `DynamicFormRenderer` initial values merge in precedence order: default protagonist phone/address, `precargaFicha.datosFamiliaresSugeridos`, `precargaFicha.usuario?.datosFijosJson`, and `precargaFicha.ultimaEntrega?.respuestasSnapshotJson`.
- `[PestanaPaseRol.tsx:PestanaPaseRol]` — Active role closure button (`Cerrar Rol`) is only rendered when `asignacionesActivas.length > 1` and `onCerrarAsignacion` is provided; the `'Jefatura / Global'` category button is only rendered when `tieneGlobal()` returns `true`; the confirmation button is disabled when `ejecutandoPase` is `true`, when both `unidadDestinoId` and `rolDestinoId` are falsy, or when `modoAccion === 'MUDAR'` and `esMismoDestino` is `true`.
- `[TrayectoriaMiembro.tsx:TrayectoriaMiembro]` — Assignment history is sorted with active assignments first (`a.activo !== b.activo`), then descending by `fechaInicio` timestamp, then descending by `id`.
- `[TrayectoriaMiembro.tsx:formatearFecha]` — Dates are formatted in `'es-AR'` locale (`dd/mm/yyyy`) using `'UTC'` `timeZone`, returning an empty string for falsy or invalid date strings.

## Side Effects
- `[PestanaPaseRol.tsx:handleCerrar]` — Calls browser native `confirm()` dialog before invoking async `onCerrarAsignacion(asigId)`.
- `[PestanaPaseRol.tsx:handleConfirmar]` — Invokes async parent callbacks `onEjecutarPase()` (in `'MUDAR'` mode) or `onAgregarAsignacion({ rolId, unidadId })` (in `'AGREGAR'` mode).

## Verification
- Run: `npm run build && npm run lint`
