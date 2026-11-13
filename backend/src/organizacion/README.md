# Organizacion (`backend/src/organizacion`)

## Overview

Manages the scout group's organizational hierarchy and access-control catalog: branches (`Rama`), organizational units (`UnidadOrganizativa`), roles (`Rol`), and permissions (`Permiso`). Enforces global scope on structural mutations, referential integrity on hard deletions, and anti-lockout invariants protecting the last administrative role.

## Interface

- `[organizacion.dto.ts:CrearRamaSchema]` — Zod schema validating branch creation (`nombre`, `edadMinima`, `edadMaxima`, `ordenProgresion`, optional `activa`), enforcing `edadMinima <= edadMaxima`.
- `[organizacion.dto.ts:EditarRamaSchema]` — Partial Zod schema for editing a `Rama`, enforcing `edadMinima <= edadMaxima` when both bounds are provided.
- `[organizacion.dto.ts:CrearRamaDto]` — TypeScript DTO type inferred from `CrearRamaSchema`.
- `[organizacion.dto.ts:EditarRamaDto]` — TypeScript DTO type inferred from `EditarRamaSchema`.
- `[organizacion.dto.ts:CrearUnidadSchema]` — Zod schema validating organizational unit creation (`nombre`, `tipo: TipoUnidad`, `ramaId`, optional `activa`).
- `[organizacion.dto.ts:EditarUnidadSchema]` — Partial Zod schema for editing an `UnidadOrganizativa`.
- `[organizacion.dto.ts:CrearUnidadDto]` — TypeScript DTO type inferred from `CrearUnidadSchema`.
- `[organizacion.dto.ts:EditarUnidadDto]` — TypeScript DTO type inferred from `EditarUnidadSchema`.
- `[organizacion.dto.ts:TipoMiembroRolSchema]` — Zod enum `['PROTAGONISTA', 'EDUCADOR']`.
- `[organizacion.dto.ts:CrearRolSchema]` — Zod schema for creating a `Rol` (`nombre`, `alcancePorDefecto: AlcanceRol`, optional `tipoMiembro`, optional `requiereRama`, `permisos` defaulting to `[]`).
- `[organizacion.dto.ts:EditarRolSchema]` — Partial Zod schema for updating a `Rol` and its permission keys.
- `[organizacion.dto.ts:CrearRolDto]` — TypeScript DTO type inferred from `CrearRolSchema`.
- `[organizacion.dto.ts:EditarRolDto]` — TypeScript DTO type inferred from `EditarRolSchema`.
- `[organizacion.dto.ts:CrearPermisoSchema]` — Zod schema for creating a `Permiso` (`clave`, optional `descripcion`).
- `[organizacion.dto.ts:EditarPermisoSchema]` — Zod schema for updating a `Permiso`'s `descripcion` (nullable).
- `[organizacion.dto.ts:CrearPermisoDto]` — TypeScript DTO type inferred from `CrearPermisoSchema`.
- `[organizacion.dto.ts:EditarPermisoDto]` — TypeScript DTO type inferred from `EditarPermisoSchema`.
- `[organizacion.module.ts:OrganizacionModule]` — NestJS module registering `OrganizacionController` and providing/exporting `OrganizacionService`.
- `[organizacion.controller.ts:OrganizacionController.listarRamas]` — `GET /organizacion/ramas` (`@RequirePermission('organizacion.ver')`, optional query `incluirInactivas?: boolean`).
- `[organizacion.controller.ts:OrganizacionController.crearRama]` — `POST /organizacion/ramas` (`@RequirePermission('organizacion.gestionar')`).
- `[organizacion.controller.ts:OrganizacionController.editarRama]` — `PATCH /organizacion/ramas/:id` (`@RequirePermission('organizacion.gestionar')`).
- `[organizacion.controller.ts:OrganizacionController.eliminarRama]` — `DELETE /organizacion/ramas/:id` (`@RequirePermission('organizacion.gestionar')`, optional query `definitivo?: boolean`).
- `[organizacion.controller.ts:OrganizacionController.listarUnidades]` — `GET /organizacion/unidades` (`@RequirePermission('organizacion.ver')`, optional query `incluirInactivas?: boolean`).
- `[organizacion.controller.ts:OrganizacionController.obtenerHistorialUnidad]` — `GET /organizacion/unidades/:id/historial` (`@RequirePermission('organizacion.ver')`).
- `[organizacion.controller.ts:OrganizacionController.crearUnidad]` — `POST /organizacion/unidades` (`@RequirePermission('organizacion.gestionar')`).
- `[organizacion.controller.ts:OrganizacionController.editarUnidad]` — `PATCH /organizacion/unidades/:id` (`@RequirePermission('organizacion.gestionar')`).
- `[organizacion.controller.ts:OrganizacionController.eliminarUnidad]` — `DELETE /organizacion/unidades/:id` (`@RequirePermission('organizacion.gestionar')`, optional query `definitivo?: boolean`).
- `[organizacion.controller.ts:OrganizacionController.listarRoles]` — `GET /organizacion/roles` (`@RequireAnyPermission('organizacion.ver', 'roles.gestionar', 'organizacion.gestionar')`).
- `[organizacion.controller.ts:OrganizacionController.crearRol]` — `POST /organizacion/roles` (`@RequireAnyPermission('roles.gestionar', 'organizacion.gestionar')`).
- `[organizacion.controller.ts:OrganizacionController.editarRol]` — `PATCH /organizacion/roles/:id` (`@RequireAnyPermission('roles.gestionar', 'organizacion.gestionar')`).
- `[organizacion.controller.ts:OrganizacionController.eliminarRol]` — `DELETE /organizacion/roles/:id` (`@RequireAnyPermission('roles.gestionar', 'organizacion.gestionar')`).
- `[organizacion.controller.ts:OrganizacionController.listarPermisos]` — `GET /organizacion/permisos` (`@RequireAnyPermission('organizacion.ver', 'roles.gestionar', 'organizacion.gestionar')`).
- `[organizacion.controller.ts:OrganizacionController.crearPermiso]` — `POST /organizacion/permisos` (`@RequireAnyPermission('roles.gestionar', 'organizacion.gestionar')`).
- `[organizacion.controller.ts:OrganizacionController.editarPermiso]` — `PATCH /organizacion/permisos/:id` (`@RequireAnyPermission('roles.gestionar', 'organizacion.gestionar')`).
- `[organizacion.service.ts:OrganizacionService]` — Injectable service implementing `listarRamas`, `crearRama`, `editarRama`, `eliminarRama`, `listarUnidades`, `obtenerHistorialUnidad`, `crearUnidad`, `editarUnidad`, `eliminarUnidad`, `listarRoles`, `crearRol`, `editarRol`, `eliminarRol`, `listarPermisos`, `crearPermiso`, and `editarPermiso`.

## Invariants

- `[organizacion.dto.ts:nombre]`: Entity names are trimmed, non-empty strings with max length `100` (`Rama`), `120` (`UnidadOrganizativa`), or `80` (`Rol`).
- `[organizacion.dto.ts:RamaBase]` & `[organizacion.dto.ts:rangoValido]`: `edadMinima` and `edadMaxima` must be integers in `0..120` with `edadMinima <= edadMaxima`; `ordenProgresion` must be an integer `>= 1`.
- `[organizacion.service.ts:OrganizacionService.editarRama]`: Merged `edadMinima` (`dto.edadMinima ?? actual.edadMinima`) must be `<=` merged `edadMaxima` (`dto.edadMaxima ?? actual.edadMaxima`), throwing `BadRequestException` otherwise.
- `[organizacion.dto.ts:CrearUnidadSchema]` & `[organizacion.service.ts:OrganizacionService.validarRamaDeUnidad]`: `TipoUnidad.SECCION_RAMA` requires a positive integer `ramaId` referencing an existing `Rama`; all other `TipoUnidad` values require `ramaId == null`.
- `[organizacion.dto.ts:CrearPermisoSchema]` & `[organizacion.dto.ts:permisosClaves]`: Permission `clave` must match `/^[a-z0-9_]+(\.[a-z0-9_]+)+$/` (max 100 chars), `descripcion` is at most 255 chars, and a role's `permisos` array may contain at most 200 keys.
- `[organizacion.service.ts:OrganizacionService.assertGlobal]`: All mutating operations (`crearRama`, `editarRama`, `eliminarRama`, `crearUnidad`, `editarUnidad`, `eliminarUnidad`, `crearRol`, `editarRol`, `eliminarRol`, `crearPermiso`, `editarPermiso`) require `alcance.tipo === 'GLOBAL'`, throwing `ForbiddenException` otherwise.
- `[organizacion.service.ts:OrganizacionService.obtenerHistorialUnidad]`: Enforces unit scope access via `assertUnidadEnAlcance(alcance, id)`.
- `[organizacion.service.ts:OrganizacionService.eliminarRama]` & `[organizacion.service.ts:OrganizacionService.eliminarUnidad]`: Hard deletion (`definitivo = true`) throws `ConflictException` if the target unit (or any child unit of the branch) has any linked `asignaciones`, `conceptos`, or `planesCuota`.
- `[organizacion.service.ts:OrganizacionService.idsDePermisos]`: Every permission key assigned to a role must exist in `prisma.permiso`, throwing `BadRequestException` if any key is unknown.
- `[organizacion.service.ts:OrganizacionService.crearRol]`: Newly created roles always set `esSistema: false`, default `tipoMiembro` to `'PROTAGONISTA'` when `alcancePorDefecto === AlcanceRol.PROPIO` (otherwise `'EDUCADOR'`), and default `requiereRama` to `alcancePorDefecto !== AlcanceRol.GLOBAL`.
- `[organizacion.service.ts:OrganizacionService.asegurarNoBloquearUltimoAdmin]`: Forbids removing admin capabilities (`alcancePorDefecto === AlcanceRol.GLOBAL` plus `'organizacion.gestionar'` or `'roles.gestionar'`, and `'organizacion.ver'` on edit) or deleting a role if it is the last administrative role in the system or the only administrative role with active member assignments.
- `[organizacion.service.ts:OrganizacionService.eliminarRol]`: Cannot delete a role that has active member assignments (`_count.asignaciones > 0`), throwing `ConflictException`.

## Side Effects

- `[organizacion.service.ts:OrganizacionService.crearRama]`: Inserts a new row into `prisma.rama`.
- `[organizacion.service.ts:OrganizacionService.editarRama]`: Updates an existing row in `prisma.rama`.
- `[organizacion.service.ts:OrganizacionService.eliminarRama]`: Runs `prisma.$transaction` to either hard-delete child `prisma.unidadOrganizativa` rows and the `prisma.rama` row (`definitivo = true`) or soft-deactivate them with `activa: false` (`definitivo = false`).
- `[organizacion.service.ts:OrganizacionService.crearUnidad]`: Inserts a new row into `prisma.unidadOrganizativa`.
- `[organizacion.service.ts:OrganizacionService.editarUnidad]`: Updates an existing row in `prisma.unidadOrganizativa`.
- `[organizacion.service.ts:OrganizacionService.eliminarUnidad]`: Hard-deletes the `prisma.unidadOrganizativa` row (`definitivo = true`) or updates `activa: false` (`definitivo = false`).
- `[organizacion.service.ts:OrganizacionService.crearRol]`: Inserts a new row into `prisma.rol` along with nested `prisma.rolPermiso` links.
- `[organizacion.service.ts:OrganizacionService.editarRol]`: Runs `prisma.$transaction` to replace `prisma.rolPermiso` rows (`deleteMany` + `createMany` when `dto.permisos` is provided) and update `prisma.rol`.
- `[organizacion.service.ts:OrganizacionService.eliminarRol]`: Runs `prisma.$transaction` to delete inactive `prisma.asignacionMiembro` records (`activo: false`) for the role and delete the `prisma.rol` record.
- `[organizacion.service.ts:OrganizacionService.crearPermiso]`: Inserts a new row into `prisma.permiso`.
- `[organizacion.service.ts:OrganizacionService.editarPermiso]`: Updates `descripcion` on an existing `prisma.permiso` row.

## Verification

- Run: `npm test`
