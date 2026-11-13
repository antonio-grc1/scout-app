# Autogestión Page (`frontend/src/pages/autogestion`)

## Overview
Member self-service page (`AutogestionPage.tsx`) allowing authenticated protagonists and educators to complete and download their annual medical/registration forms (`papeles`), inspect their personal account statement (`cuotas`), and manage event orders and QR tickets (`eventos`).

## Interface
- `[AutogestionPage.tsx:AutogestionPage]` — Exported `React.FC` component managing member self-service across three views (`'papeles'`, `'cuotas'`, `'eventos'`).

## Invariants
- `[AutogestionPage.tsx:VISTAS_VALIDAS]` — Active view `vistaActiva` is restricted to `'papeles' | 'cuotas' | 'eventos'`, defaulting to `'papeles'` when URL search parameter `vista` is missing or not in `VISTAS_VALIDAS`.
- `[AutogestionPage.tsx:mostrarToast]` — Suppresses error toasts (`tipo === 'error'`) when `navigator.onLine` is false or the message text contains `'sin conexión'`, `'sin conexion'`, `'offline'`, or `'red'`.
- `[AutogestionPage.tsx:inicializarAutogestion]` — Requires `usuarioActual?.id` (`targetUserId`); if absent, sets `errorCarga` and aborts API initialization.
- `[AutogestionPage.tsx:valoresFormularioIniciales]` — Merges initial form values in ascending precedence: `protagonista_telefono` / `protagonista_domicilio` -> `datosFamiliaresSugeridos` -> `usuario.datosFijosJson` -> `ultimaEntrega.respuestasSnapshotJson`.
- `[AutogestionPage.tsx:generarBytesPdfPropio]` — Falls back to verification hash `'FICHA-${usuarioParaPdf.dni}-2026'` and print version `1` when `ultimaEntrega` lacks `hashVerificacion` or `versionImpresion`.
- `[AutogestionPage.tsx:eventosHabilitados]` — Only events with `estado === 'PUBLICADO'` are classified as enabled for new sales (`eventosHabilitados`) and allow opening `ModalCargarPedidoEvento` for new orders.
- `[AutogestionPage.tsx:pedidosEventoSeleccionado]` — An existing order can only be edited (`Editar Pedido` button rendered) when none of its tickets have `estado === 'UTILIZADO'` (`!algunoRetirado`) and `!p.gananciaAcreditada`.

## Side Effects
- `[AutogestionPage.tsx:cambiarVista]` — Updates URL query string parameter `vista` via `setSearchParams` and syncs `vistaActiva` state on `searchParams` changes.
- `[AutogestionPage.tsx:toast]` — Schedules a 4000ms `setTimeout` to auto-clear active toast notifications.
- `[AutogestionPage.tsx:inicializarAutogestion]` — Performs HTTP GET requests via `api.get` to `/tesoreria/estado-cuenta/${targetUserId}`, `/legajos/plantillas?cicloAnio=2026` (falling back to `/legajos/plantillas`), `/miembros/${targetUserId}`, and `/legajos/miembro/${targetUserId}/plantilla/${plantilla.id}/precarga?cicloAnio=${ciclo}`.
- `[AutogestionPage.tsx:cargarMisPedidosYEventos]` — Triggered when `vistaActiva === 'eventos'` or after saving an event order; performs HTTP GET requests via `api.get` to `/tesoreria/mis-pedidos` and `/tesoreria/eventos`.
- `[AutogestionPage.tsx:handleVerCopiaPdf]` — Generates PDF bytes via `generarFichaPdf`, creates an object URL via `crearUrlPdfBlob`, and revokes previous blob URLs via `URL.revokeObjectURL` (`cerrarVistaPreviaPdf` / `handleVerCopiaPdf`).
- `[AutogestionPage.tsx:handleDescargarCopiaPdf]` — Generates PDF bytes via `generarFichaPdf` and triggers a browser file download (`Ficha_${apellido}_${nombre}.pdf`) via `descargarPdfBlob`.
- `[AutogestionPage.tsx:handleSubmitFormulario]` — Performs HTTP POST via `api.post('/legajos/entregas', ...)` with `actualizarDatosFijos: true`; if `finalizarParaFirma && entrega.hashVerificacion`, generates and downloads the PDF via `generarFichaPdf` and `descargarPdfBlob`, then re-runs `inicializarAutogestion`.

## Verification
- Run: `npm run build && npm run lint`
