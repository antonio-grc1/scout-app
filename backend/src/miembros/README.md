# Miembros (`backend/src/miembros`)

## Overview

Manages member profiles (`Usuario`), sibling lookups and family group linking (`GrupoFamiliar`), and unit/role assignments (`AsignacionMiembro`). Enforces scope-based (`GLOBAL`, `UNIDAD`, `PROPIO`) and field-level permissions, prevents accidental lockout of the last active global administrator, and synchronizes member lifecycle changes with treasury charges and welcome emails.

## Interface

- `[miembros.dto.ts:CrearMiembroSchema]` — Zod schema validating new member registration payloads (`nombre`, `apellido`, `dni`, `fechaNacimiento`, `emailContacto`, `telefonoContacto`, `datosFijosJson`, `hermanoDni`, `unidadId`, `rolId`, `cicloAnio`).
- `[miembros.dto.ts:CrearMiembroDto]` — TypeScript DTO type inferred from `CrearMiembroSchema`.
- `[miembros.dto.ts:CAMPOS_EDITABLES_PROPIOS]` — Constant tuple `['emailContacto', 'telefonoContacto', 'datosFijosJson']` defining fields a user may edit on their own profile.
- `[miembros.dto.ts:EditarMiembroSchema]` — Strict partial Zod schema for updating member identity, contact, status (`activo`), and fixed data fields (`datosFijosJson`).
- `[miembros.dto.ts:EditarMiembroDto]` — TypeScript DTO type inferred from `EditarMiembroSchema`.
- `[miembros.dto.ts:ActualizarMiPerfilSchema]` — Strict Zod schema (`emailContacto`, `telefonoContacto`, `datosFijosJson`) for `PATCH /miembros/mi-perfil`.
- `[miembros.dto.ts:ActualizarMiPerfilDto]` — TypeScript DTO type inferred from `ActualizarMiPerfilSchema`.
- `[miembros.dto.ts:ListarMiembrosSchema]` — Zod query schema for paginated and filtered member listings (`unidadId`, `ramaId`, `rolId`, `activo`, `busqueda`, `q`, `sinAsignacion`, `pagina`, `porPagina`, `limite`).
- `[miembros.dto.ts:ListarMiembrosDto]` — TypeScript DTO type inferred from `ListarMiembrosSchema`.
- `[miembros.dto.ts:CrearAsignacionSchema]` — Zod schema for assigning a member to a unit and role (`unidadId`, `rolId`, `cicloAnio`).
- `[miembros.dto.ts:CrearAsignacionDto]` — TypeScript DTO type inferred from `CrearAsignacionSchema`.
- `[miembros.module.ts:MiembrosModule]` — NestJS module importing `TesoreriaModule`, registering `MiembrosController` and `MiembrosService`, and exporting `MiembrosService`.
- `[miembros.controller.ts:MiembrosController.listar]` — `GET /miembros` (`@RequirePermission('miembros.ver')`). Lists members filtered by query parameters and caller scope.
- `[miembros.controller.ts:MiembrosController.obtenerMiPerfil]` — `GET /miembros/mi-perfil`. Retrieves the authenticated user's own member profile.
- `[miembros.controller.ts:MiembrosController.actualizarMiPerfil]` — `PATCH /miembros/mi-perfil`. Updates the authenticated user's own contact details and `datosFijosJson`.
- `[miembros.controller.ts:MiembrosController.buscarHermanosPorCriterio]` — `GET /miembros/hermanos/buscar` (`@RequireAnyPermission('miembros.editar', 'cuotas.ajustar', 'tesoreria.gestionar')`). Searches active sibling candidates by DNI, name, or surname (`q`).
- `[miembros.controller.ts:MiembrosController.buscarHermano]` — `GET /miembros/hermano/:dni` (`@RequirePermission('miembros.crear')`). Looks up an active sibling by exact DNI and returns copyable family fields.
- `[miembros.controller.ts:MiembrosController.obtener]` — `GET /miembros/:id` (`@RequirePermission('miembros.ver')`). Retrieves a member profile by ID within the caller's scope.
- `[miembros.controller.ts:MiembrosController.crear]` — `POST /miembros` (`@RequirePermission('miembros.crear')`). Creates a new member, optional family group link, and initial unit/role assignment.
- `[miembros.controller.ts:MiembrosController.editar]` — `PATCH /miembros/:id` (`@RequirePermission(['miembros.editar', 'miembros.editar_identidad', 'miembros.baja'])`). Edits member fields subject to scope and field-level permissions.
- `[miembros.controller.ts:MiembrosController.agregarAsignacion]` — `POST /miembros/:id/asignaciones` (`@RequireAnyPermission('pases.ejecutar', 'miembros.editar')`). Adds an active unit and role assignment to a member.
- `[miembros.controller.ts:MiembrosController.cerrarAsignacion]` — `DELETE /miembros/:id/asignaciones/:asignacionId` (`@RequireAnyPermission('pases.ejecutar', 'miembros.editar')`). Soft-closes an active assignment on a member.
- `[miembros.service.ts:MIEMBRO_SELECT]` — Prisma `select` projection for `Usuario` queries that excludes `passwordHash` and filters out `EstadoCargo.ANULADO` charges.
- `[miembros.service.ts:MiembrosService.listar]` — Queries paginated members matching `ListarMiembrosDto` and `filtroUsuariosPorAlcance(alcance)`.
- `[miembros.service.ts:MiembrosService.obtener]` — Fetches a single member by `id` enforcing scope visibility via `filtroUsuariosPorAlcance(alcance)`.
- `[miembros.service.ts:MiembrosService.obtenerMiPerfil]` — Fetches the profile of `usuarioId` using `MIEMBRO_SELECT`.
- `[miembros.service.ts:MiembrosService.actualizarMiPerfil]` — Updates `emailContacto`, `telefonoContacto`, and merged `datosFijosJson` for the caller's own `usuarioId`.
- `[miembros.service.ts:MiembrosService.buscarHermano]` — Finds an active member by `dni` within scope and extracts copyable family fields via `obtenerClavesCopiablesHermano`.
- `[miembros.service.ts:MiembrosService.buscarHermanosPorCriterio]` — Searches up to 15 active members matching `criterio` (excluding `excluirId`) within scope and returns copyable family fields.
- `[miembros.service.ts:MiembrosService.crear]` — Validates unit/role grantability, hashes initial password from DNI, links optional sibling family group, creates the member and assignment in a transaction, and triggers fee sync and welcome email.
- `[miembros.service.ts:MiembrosService.editar]` — Validates scope, self-edit constraints, field-level permissions (`PERMISO_POR_CAMPO`), and last-admin protection before updating a member and syncing treasury fees.
- `[miembros.service.ts:MiembrosService.agregarAsignacion]` — Validates scope and role grantability, prevents duplicate active `(usuarioId, unidadId, rolId)` assignments, and creates the assignment with treasury fee synchronization.
- `[miembros.service.ts:MiembrosService.cerrarAsignacion]` — Validates scope, self-modification restrictions, and last-admin protection before soft-closing an assignment (`activo: false`, `fechaFin: hoyUtc()`) and syncing treasury fees.

## Invariants

- `[miembros.dto.ts:CrearMiembroSchema]` & `[miembros.dto.ts:EditarMiembroSchema]`: `dni` must match `/^[0-9A-Za-z]{6,20}$/`, `fechaNacimiento` must be an ISO date (`YYYY-MM-DD`), `nombre` and `apellido` must be 1–100 characters, `emailContacto` at most 150 characters, `telefonoContacto` at most 50 characters, and `cicloAnio` an integer between 2000 and 2100.
- `[miembros.dto.ts:EditarMiembroSchema]`: Strict partial object; keys in `datosFijosJson` set to `null` are deleted from the stored JSON object during merge in `[miembros.service.ts:MiembrosService.actualizarMiPerfil]` and `[miembros.service.ts:MiembrosService.editar]`.
- `[miembros.dto.ts:ListarMiembrosSchema]`: `pagina` is an integer >= 1 (default `1`), `porPagina`/`limite` is an integer in `1..2000` (default `50`), and `q`/`busqueda` is at most 100 characters.
- `[miembros.service.ts:MIEMBRO_SELECT]`: Member queries never expose `passwordHash` and exclude `cargos` with `estado: EstadoCargo.ANULADO`.
- `[miembros.service.ts:MiembrosService.buscarHermano]` & `[miembros.service.ts:MiembrosService.buscarHermanosPorCriterio]`: Callers with `alcance.tipo === 'PROPIO'` are rejected with `ForbiddenException`; only active members (`activo: true`) and allowed copyable keys from `[miembros.service.ts:MiembrosService.obtenerClavesCopiablesHermano]` are returned (capped at `take: 15` in search).
- `[miembros.service.ts:MiembrosService.crear]`: Initial `passwordHash` is computed as `bcrypt.hash(dto.dni, 10)` with `requiereCambioClave: true`; `hermanoDni` cannot equal `dto.dni` and must belong to an active member; target unit and role must be active, valid for the unit type (`validarAsignacionRolUnidad`), within caller scope (`assertUnidadEnAlcance`), and grantable (`assertPuedeOtorgar`).
- `[miembros.service.ts:MiembrosService.editar]`: Callers with `alcance.tipo === 'PROPIO'` or non-`GLOBAL` callers editing their own record (`id === actor.sub`) may only modify fields in `[miembros.dto.ts:CAMPOS_EDITABLES_PROPIOS]`.
- `[miembros.service.ts:MiembrosService.editar]` & `[miembros.service.ts:MiembrosService.agregarAsignacion]`: Non-`GLOBAL` callers cannot edit or add assignments to a user who holds an active `GLOBAL` assignment (`tieneAsignacionGlobalActiva`).
- `[miembros.service.ts:MiembrosService.editar]`: Field-level permissions mapped in `[miembros.service.ts:PERMISO_POR_CAMPO]` (`miembros.editar_identidad` for `nombre`/`apellido`/`dni`/`fechaNacimiento`, `miembros.baja` for `activo`, `miembros.editar` for `emailContacto`/`telefonoContacto`/`datosFijosJson`) are verified against the target member's active units via `tienePermisoEfectivoEnUnidades`.
- `[miembros.service.ts:MiembrosService.agregarAsignacion]`: Rejects callers with `alcance.tipo === 'PROPIO'`, requires target member to be active and within scope, and rejects duplicate active assignments with the same `(usuarioId, unidadId, rolId)` via `ConflictException`.
- `[miembros.service.ts:MiembrosService.cerrarAsignacion]`: Assignments are never hard-deleted; they are soft-closed with `activo: false` and `fechaFin: hoyUtc()`. Non-`GLOBAL` callers cannot close their own assignments (`usuarioId === actor.sub`).
- `[miembros.service.ts:MiembrosService.asegurarNoDesactivarUltimoAdmin]`: Forbids deactivating a member or closing an assignment if doing so would leave zero active global administrators (active users with an active assignment in an active unit whose role has effective `GLOBAL` scope and includes `'organizacion.gestionar'` or `'roles.gestionar'`).
- `[miembros.service.ts:MiembrosService.editar]` & `[miembros.service.ts:MiembrosService.actualizarMiPerfil]`: Run read-merge-write on `datosFijosJson` inside `$transaction` with row lock (`FOR UPDATE`), strip `__proto__`/`constructor`/`prototype`, and enforce `.every()` unit coverage on `miembros.editar_identidad`/`miembros.baja`.

## Side Effects

- `[miembros.service.ts:MiembrosService.actualizarMiPerfil]`: Updates `prisma.usuario` (`emailContacto`, `telefonoContacto`, merged `datosFijosJson`).
- `[miembros.service.ts:MiembrosService.crear]`: Executes `prisma.$transaction` to optionally create a `prisma.grupoFamiliar` and update the sibling `prisma.usuario`, insert the new `prisma.usuario` and `prisma.asignacionMiembro`, and call `tesoreria.sincronizarCuotasMiembroActivoEnTx`; after commit, asynchronously invokes `mailer.enviarBienvenidaAlta` when `emailContacto` and `MailerService` are present.
- `[miembros.service.ts:MiembrosService.editar]`: Updates `prisma.usuario`; when `activo` transitions and `TesoreriaService` is injected, wraps the update in `prisma.$transaction` and calls `tesoreria.anularCargosImpagosDeMiembroEnTx` (when `activo === false`) or `tesoreria.sincronizarCuotasMiembroActivoEnTx` (when `activo === true`).
- `[miembros.service.ts:MiembrosService.agregarAsignacion]`: Executes `prisma.$transaction` to insert a `prisma.asignacionMiembro` record and call `tesoreria.sincronizarCuotasMiembroActivoEnTx`.
- `[miembros.service.ts:MiembrosService.cerrarAsignacion]`: Executes `prisma.$transaction` to update `prisma.asignacionMiembro` (`activo: false`, `fechaFin: hoyUtc()`) and call `tesoreria.sincronizarCuotasMiembroActivoEnTx`.

## Verification

- Run: `npm test`
