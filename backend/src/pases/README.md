# Pases (`backend/src/pases`)

## Overview
Manages member progression and role/unit transitions (`pases`) across branches and units within the scout group. Provides pure age/cohort progression suggestion logic (`sugerirPase`) based on the school-cycle cutoff date (June 30) and transactional execution of single or batch passes with scope, privilege, and treasury quota synchronization.

## Interface
- `[pases.module.ts:PasesModule]` — NestJS module importing `forwardRef(() => TesoreriaModule)`, registering `PasesController` and `PasesService`, and exporting `PasesService`.
- `[pases.controller.ts:PasesController]` — REST controller mounted at `@Controller('pases')`:
  - `[pases.controller.ts:PasesController.candidatos]` — `GET /pases/candidatos` guarded by `@RequirePermission('pases.ver')`, validates query with `CandidatosQuerySchema`.
  - `[pases.controller.ts:PasesController.ejecutar]` — `POST /pases` guarded by `@RequirePermission('pases.ejecutar')`, validates body with `PaseSchema`.
  - `[pases.controller.ts:PasesController.ejecutarLote]` — `POST /pases/lote` guarded by `@RequirePermission('pases.ejecutar')`, validates body with `PasesLoteSchema`.
- `[pases.service.ts:PasesService]` — Injectable service exposing `candidatos(alcance, q)`, `ejecutar(alcance, dto)`, and `ejecutarLote(alcance, dto)`.
- `[pases.logic.ts:sugerirPase]` — Pure function `(fechaNacimiento: Date, ramaActual: RamaLite, ramas: RamaLite[], fechaReferencia?: Date) => { edad: number; camada: number; sugerencia: SugerenciaPase } | null`.
- `[pases.logic.ts:RamaLite]` — Interface `{ id: number, nombre: string, edadMinima: number, edadMaxima: number, ordenProgresion: number }`.
- `[pases.logic.ts:SugerenciaPase]` — Discriminated union `{ tipo: 'PROGRESION'; ramaSugerida: RamaLite } | { tipo: 'EGRESO' }`.
- `[pases.logic.ts:calcularAnioCamada]` — Re-exported utility from `../common/utils/fechas.util.js`.
- `[pases.logic.ts:fechaCorteCicloEscolar]` — Re-exported utility from `../common/utils/fechas.util.js`.
- `[pases.dto.ts:CandidatosQuerySchema]` / `[pases.dto.ts:CandidatosQueryDto]` — Zod schema and DTO for candidate query parameters (`{ fechaReferencia?: iso.date, unidadId?: positive int }`).
- `[pases.dto.ts:PaseSchema]` / `[pases.dto.ts:PaseDto]` — Zod schema and DTO for a single pass (`{ asignacionOrigenId: positive int, unidadDestinoId?: positive int, rolDestinoId?: positive int, alcanceOverride?: AlcanceRol | null, cicloAnio?: int(2000..2100) }`).
- `[pases.dto.ts:PasesLoteSchema]` / `[pases.dto.ts:PasesLoteDto]` — Zod schema and DTO for batch passes (`{ pases: PaseSchema[] (1..200, unique asignacionOrigenId) }`).

## Invariants
- `[pases.dto.ts:PaseSchema]` — `asignacionOrigenId`, `unidadDestinoId`, and `rolDestinoId` must be positive integers; `cicloAnio` must be an integer between `2000` and `2100`.
- `[pases.dto.ts:PasesLoteSchema]` — `pases` array must contain between `1` and `200` items and cannot contain duplicate `asignacionOrigenId` values.
- `[pases.logic.ts:sugerirPase]` — Returns `null` if the member's age at `fechaReferencia` (default `fechaCorteCicloEscolar()`, June 30) is `<= ramaActual.edadMaxima`; returns `{ tipo: 'EGRESO' }` if no branches with higher `ordenProgresion` exist or age exceeds the highest branch's `edadMaxima`; otherwise returns `{ tipo: 'PROGRESION', ramaSugerida }` to the matching or next higher branch.
- `[pases.service.ts:PasesService.candidatos]` — Returns `[]` immediately if `alcance.tipo === 'PROPIO'`; enforces `assertUnidadEnAlcance(alcance, q.unidadId)` when `q.unidadId` is provided; only evaluates active assignments (`activo: true`) of active users (`activo: true`) in active `SECCION_RAMA` units with a non-null `rama` whose effective member type is `'PROTAGONISTA'`.
- `[pases.service.ts:PasesService.aplicarPases]` — Origin assignment must exist (`NotFoundException`), have `activo: true` (`ConflictException`), and belong to an active user (`BadRequestException`).
- `[pases.service.ts:PasesService.aplicarPases]` — Actor must have scope over `origen.unidadId` (`assertUnidadEnAlcance`) and privilege to grant `origen.rol` + `origen.alcanceOverride` (`assertPuedeOtorgar`).
- `[pases.service.ts:PasesService.aplicarPases]` — Non-`GLOBAL` actors cannot execute a pass on their own user (`ForbiddenException` when `origen.usuarioId === actorUsuarioId`).
- `[pases.service.ts:PasesService.aplicarPases]` — Destination unit must exist and have `activa: true` (`BadRequestException`); passes to `TipoUnidad.JEFATURA` require an explicit `rolDestinoId` (`BadRequestException`); when `rolDestinoId` is omitted for `SECCION_RAMA` and origin role is `'PROTAGONISTA'` with `edad >= 21`, auto-selects a role with `tipoMiembro: 'EDUCADOR'` and `requiereRama: true`.
- `[pases.service.ts:PasesService.aplicarPases]` — Actor must have privilege to grant `rolDestino` + `alcanceOverride` (`assertPuedeOtorgar`), and if effective destination scope is not `AlcanceRol.PROPIO` and actor is not `GLOBAL`, `unidadDestino.id` must be within actor's scope (`assertUnidadEnAlcance`).
- `[pases.service.ts:PasesService.aplicarPases]` — Effective `requiereRama` of the destination role must match `unidadDestino.tipo === TipoUnidad.SECCION_RAMA` (`BadRequestException` if mismatched).
- `[pases.service.ts:PasesService.aplicarPases]` — Pass must change either `unidadId` or `rolId` (`BadRequestException` if `unidadDestino.id === origen.unidadId && rolDestino.id === origen.rolId`).
- `[pases.service.ts:PasesService.aplicarPases]` — User cannot already hold an active assignment with the same `unidadId` and `rolId` (`ConflictException`).
- `[pases.service.ts:PasesService.aplicarPases]` — Optimistic concurrency check on closing the origin assignment via `updateMany({ where: { id: origen.id, activo: true } })` requires `cierre.count === 1` (`ConflictException`).

## Side Effects
- `[pases.service.ts:PasesService.ejecutar]` — Executes a Prisma `$transaction` invoking `aplicarPases` for a single pass.
- `[pases.service.ts:PasesService.ejecutarLote]` — Executes an atomic Prisma `$transaction` (with `timeout: 30_000` ms) invoking `aplicarPases` for all passes in the batch.
- `[pases.service.ts:PasesService.aplicarPases]` — Updates the origin `asignacionMiembro` row setting `activo: false` and `fechaFin: hoyUtc()`.
- `[pases.service.ts:PasesService.aplicarPases]` — Inserts a new active `asignacionMiembro` row for `origen.usuarioId` in `unidadDestino.id` with `rolDestino.id`, `alcanceOverride`, `cicloAnio: p.cicloAnio ?? anioActual()`, and `fechaInicio: hoyUtc()`.
- `[pases.service.ts:PasesService.aplicarPases]` — When `TesoreriaService` is injected, invokes `this.tesoreria.sincronizarCuotasMiembroActivoEnTx(tx, origen.usuarioId, mesActual, cicloPase)` inside the transaction to synchronize monthly fee charges (`[tesoreria.service.ts:TesoreriaService.sincronizarCuotasMiembroActivoEnTx]`).

## Verification
- Run: `npm test`
