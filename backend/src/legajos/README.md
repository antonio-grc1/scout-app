# Legajos (`backend/src/legajos`)

## Overview

Manages dynamic member dossier templates (`PlantillaFormulario`), form preloading from member and sibling fixed data (`datosFijosJson`), dossier submission snapshots (`EntregaFormulario`) with cryptographic verification hashes, QR/code verification and physical signature validation workflows, and adult collaborator survey extraction.

## Interface

- `[legajos.dto.ts:CrearPlantillaSchema]` — Zod schema validating creation of form templates (`codigo`, `titulo`, `version`, `cicloAnio`, `esquemaJson`, `activa`).
- `[legajos.dto.ts:CrearPlantillaDto]` — TypeScript DTO type inferred from `CrearPlantillaSchema`.
- `[legajos.dto.ts:EditarPlantillaSchema]` — Partial Zod schema (`CrearPlantillaSchema.partial()`) for updating form templates.
- `[legajos.dto.ts:EditarPlantillaDto]` — TypeScript DTO type inferred from `EditarPlantillaSchema`.
- `[legajos.dto.ts:GuardarEntregaSchema]` — Zod schema for saving or finalizing a form submission (`usuarioId`, `plantillaId`, `cicloAnio`, `respuestas`, `finalizarParaFirma`, `actualizarDatosFijos`).
- `[legajos.dto.ts:GuardarEntregaDto]` — TypeScript DTO type inferred from `GuardarEntregaSchema`.
- `[legajos.dto.ts:ListarEntregasQuerySchema]` — Zod query schema for filtering form submissions (`usuarioId`, `unidadId`, `plantillaId`, `cicloAnio`, `estado`).
- `[legajos.dto.ts:ListarEntregasQueryDto]` — TypeScript DTO type inferred from `ListarEntregasQuerySchema`.
- `[legajos.module.ts:LegajosModule]` — NestJS module registering `LegajosController` and providing/exporting `LegajosService`.
- `[legajos.controller.ts:LegajosController.listarPlantillas]` — `GET /legajos/plantillas` (`@RequirePermission('legajos.ver')`). Lists active and historical form templates.
- `[legajos.controller.ts:LegajosController.obtenerPlantilla]` — `GET /legajos/plantillas/:id` (`@RequirePermission('legajos.ver')`). Retrieves a single form template by ID.
- `[legajos.controller.ts:LegajosController.crearPlantilla]` — `POST /legajos/plantillas` (`@RequirePermission('legajos.plantillas_gestionar')`). Creates a new form template.
- `[legajos.controller.ts:LegajosController.editarPlantilla]` — `PATCH /legajos/plantillas/:id` (`@RequirePermission('legajos.plantillas_gestionar')`). Updates an existing form template.
- `[legajos.controller.ts:LegajosController.obtenerPrecarga]` — `GET /legajos/miembro/:usuarioId/plantilla/:plantillaId/precarga` (`@RequirePermission('legajos.completar')`). Returns preloaded member data, sibling suggestions, and any existing submission for the current year.
- `[legajos.controller.ts:LegajosController.guardarEntrega]` — `POST /legajos/entregas` (`@RequirePermission('legajos.completar')`). Saves a draft or finalized dossier submission and optionally syncs fixed member data.
- `[legajos.controller.ts:LegajosController.listarEntregas]` — `GET /legajos/entregas` (`@RequirePermission('legajos.ver')`). Lists dossier submissions within the caller's scope.
- `[legajos.controller.ts:LegajosController.listarColaboradoresAdultos]` — `GET /legajos/colaboradores-adultos` (`@RequirePermission('legajos.ver')`). Extracts adult family contacts who expressed willingness to collaborate from the latest submissions per member.
- `[legajos.controller.ts:LegajosController.verificarQr]` — `GET /legajos/qr/verificar/:hash` (`@RequireAnyPermission('legajos.validar_fisico', 'legajos.ver')`). Resolves a verification hash, unambiguous hex prefix, or member DNI and returns submission verification metadata.
- `[legajos.controller.ts:LegajosController.validarFisico]` — `POST /legajos/qr/validar/:hash` (`@HttpCode(200)`, `@RequirePermission('legajos.validar_fisico')`). Requires exact 64-char SHA-256 `hashVerificacion` (rejecting prefix/DNI) and atomically marks a submission as physically validated.
- `[legajos.service.ts:CAMPOS_DATOS_FIJOS_PERMITIDOS]` — Read-only `Set<string>` of response keys allowed to synchronize back into `usuario.datosFijosJson`.
- `[legajos.service.ts:CAMPOS_FAMILIARES_PERMITIDOS_COMPARTIR]` — Read-only `Set<string>` of family-level keys eligible for prefill suggestions from siblings in the same `grupoFamiliar`.
- `[legajos.service.ts:calcularHashVerificacion]` — Generates a SHA-256 hex digest over `(usuarioId, plantillaId, cicloAnio, respuestasSnapshotJson, timestampIso, nonce)`.
- `[legajos.service.ts:LegajosService.listarPlantillas]` — Ensures 2026 adult/rover templates exist (`asegurarPlantillasMayores`) and lists all `PlantillaFormulario` records ordered by `cicloAnio` desc and `codigo` asc.
- `[legajos.service.ts:LegajosService.obtenerPlantilla]` — Fetches a single `PlantillaFormulario` by `id` or throws `NotFoundException`.
- `[legajos.service.ts:LegajosService.crearPlantilla]` — Creates a `PlantillaFormulario` when caller scope is `GLOBAL`.
- `[legajos.service.ts:LegajosService.editarPlantilla]` — Updates a `PlantillaFormulario` when caller scope is `GLOBAL`.
- `[legajos.service.ts:LegajosService.obtenerDatosPrecarga]` — Builds preloaded form values combining identity fields, `datosFijosJson`, sibling family suggestions, and any current-year submission.
- `[legajos.service.ts:LegajosService.guardarEntrega]` — Validates member age against template rules, sanitizes responses, transitions submission state (`EstadoEntrega`), computes `hashVerificacion`, and persists the submission and `datosFijosJson` in a transaction.
- `[legajos.service.ts:LegajosService.listarEntregas]` — Queries `EntregaFormulario` records filtered by `ListarEntregasQueryDto` and `filtroUsuariosPorAlcance(alcance)`.
- `[legajos.service.ts:LegajosService.verificarQr]` — Resolves a submission via `resolverEntregaPorCodigo`, verifies scope access, and returns printable/validation status flags.
- `[legajos.service.ts:LegajosService.validarFisico]` — Validates caller scope and submission state before transitioning a submission to `EstadoEntrega.VALIDADO_FISICAMENTE`.
- `[legajos.service.ts:LegajosService.listarColaboradoresAdultos]` — Scans latest dossier submissions in scope and extracts adult collaborator entries (`dispuestoColaborar === 'SI'`) with deduplicated contact details and linked beneficiaries.

## Invariants

- `[legajos.dto.ts:CrearPlantillaSchema]`: `codigo` is a trimmed string of 2–50 chars, `titulo` is 2–150 chars, `version` is 1–20 chars, `cicloAnio` is an integer in `2000..2100`, and `activa` defaults to `true`.
- `[legajos.dto.ts:GuardarEntregaSchema]`: `usuarioId` and `plantillaId` must be positive integers, `cicloAnio` an integer in `2000..2100`, `finalizarParaFirma` defaults to `false`, and `actualizarDatosFijos` defaults to `true`.
- `[legajos.service.ts:LegajosService.crearPlantilla]` & `[legajos.service.ts:LegajosService.editarPlantilla]`: Require `alcance.tipo === 'GLOBAL'`, throwing `ForbiddenException` otherwise.
- `[legajos.service.ts:LegajosService.obtenerDatosPrecarga]`: Target `usuario` must match `filtroUsuariosPorAlcance(alcance)` and `plantilla` must exist with `activa: true` (throws `NotFoundException` otherwise); sibling suggestions only copy keys present in `[legajos.service.ts:CAMPOS_FAMILIARES_PERMITIDOS_COMPARTIR]` from up to 5 siblings in the same `grupoFamiliar`.
- `[legajos.service.ts:LegajosService.guardarEntrega]`: Requires target `usuario` in scope with `usuario.activo === true` and `plantilla.activa === true`; enforces age eligibility by template prefix (`LEGAJO_MENORES_*` requires `edad < 18`, `LEGAJO_ROVERS_*` requires `edad >= 18`, `LEGAJO_EDUCADORES_*` requires `edad >= 18`).
- `[legajos.service.ts:LegajosService.guardarEntrega]`: Strips prototype-pollution keys (`'__proto__'`, `'constructor'`, `'prototype'`) from `dto.respuestas` before persistence.
- `[legajos.service.ts:LegajosService.guardarEntrega]`: State transition invariants for `EstadoEntrega`:
  - When `finalizarParaFirma` is `true`, sets state to `EstadoEntrega.PENDIENTE_FIRMA_FISICA`, sets `fechaGeneracionPdf = new Date()`, clears `fechaValidacionFisica` and `validadoPorUsuarioId`, and increments `versionImpresion` if the prior state was not `BORRADOR`.
  - When `finalizarParaFirma` is `false` and the prior state was `EstadoEntrega.VALIDADO_FISICAMENTE`, transitions to `EstadoEntrega.DESACTUALIZADO_REQUIERE_REIMPRESION` and increments `versionImpresion`.
  - Otherwise preserves the existing state or initializes to `EstadoEntrega.BORRADOR`.
- `[legajos.service.ts:LegajosService.guardarEntrega]`: When `actualizarDatosFijos` is `true`, only keys in `[legajos.service.ts:CAMPOS_DATOS_FIJOS_PERMITIDOS]` with primitive values (`string`, `number`, `boolean`, or `null`) are merged into `usuario.datosFijosJson`.
- `[legajos.service.ts:LegajosService.resolverEntregaPorCodigo]`: Strips optional `verif:`/`codigo:` prefixes and trailing `...`, then resolves by exact 64-char hex `hashVerificacion`, hex prefix (`>= 6` chars, rejecting ambiguous matches with `ConflictException`), or 6–10 digit numeric member `dni`.
- `[legajos.service.ts:LegajosService.verificarQr]`: Enforces scope visibility (`UNIDAD` requires active assignment in `alcance.unidadIds` or `alcance.usuarioIdPropio`; `PROPIO` requires `entrega.usuario.id === alcance.usuarioId`).
- `[legajos.service.ts:LegajosService.validarFisico]`: Rejects `PROPIO` scope (`ForbiddenException`), requires target member to be active with at least one active assignment, rejects already validated submissions (`EstadoEntrega.VALIDADO_FISICAMENTE` -> `ConflictException`), and rejects outdated or draft submissions (`DESACTUALIZADO_REQUIERE_REIMPRESION` or `BORRADOR` -> `BadRequestException`).

## Side Effects

- `[legajos.service.ts:calcularHashVerificacion]`: Reads 8 random bytes via `crypto.randomBytes(8)` and computes a SHA-256 digest.
- `[legajos.service.ts:LegajosService.asegurarPlantillasMayores]`: Sets instance flag `this.plantillasMayoresVerificadas = true` and, on the first call to `listarPlantillas`, queries `prisma.plantillaFormulario` for `'LEGAJO_MENORES_2026'` and creates `'LEGAJO_ROVERS_2026'` and `'LEGAJO_EDUCADORES_2026'` if missing.
- `[legajos.service.ts:LegajosService.crearPlantilla]`: Inserts a new row into `prisma.plantillaFormulario`.
- `[legajos.service.ts:LegajosService.editarPlantilla]`: Updates an existing row in `prisma.plantillaFormulario`.
- `[legajos.service.ts:LegajosService.guardarEntrega]`: Runs `prisma.$transaction` to create or update `prisma.entregaFormulario` and conditionally update `prisma.usuario.datosFijosJson`.
- `[legajos.service.ts:LegajosService.validarFisico]`: Updates `prisma.entregaFormulario` with `estado: EstadoEntrega.VALIDADO_FISICAMENTE`, `fechaValidacionFisica: new Date()`, and `validadoPorUsuarioId: actor.sub`.

## Verification

- Run: `npm test`
