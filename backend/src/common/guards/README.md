# Guards (`backend/src/common/guards`)

## Overview
Contains two NestJS execution guards (`JwtAuthGuard` and `ScopedRbacGuard`) that enforce JWT authentication with real-time database role/permission hydration, mandatory password-change gating, and scoped RBAC permission evaluation.

## Interface
- `[jwt-auth.guard.ts:JwtAuthGuard]`
- `[jwt-auth.guard.ts:JwtAuthGuard.canActivate]`
- `[scoped-rbac.guard.ts:ScopedRbacGuard]`
- `[scoped-rbac.guard.ts:ScopedRbacGuard.canActivate]`

## Invariants
- `[jwt-auth.guard.ts:IS_PUBLIC_KEY]` Routes or controllers with truthy `IS_PUBLIC_KEY` metadata bypass JWT authentication and return `true`.
- `[jwt-auth.guard.ts:JwtAuthGuard.canActivate]` Non-public requests must provide a valid `Authorization: Bearer <token>` header verified by `JwtService.verifyAsync`, or an `UnauthorizedException` (`'Token ausente'` / `'Token inválido o vencido'`) is thrown.
- `[jwt-auth.guard.ts:JwtAuthGuard.canActivate]` When `prisma.usuario.findUnique` is available, the user (`payload.sub`) must exist and have `activo === true`, otherwise `UnauthorizedException('Usuario inactivo o inexistente')` is thrown; only active assignments (`activo: true`) on non-inactive units (`unidad?.activa !== false`) are included in `req.user.asignaciones`.
- `[jwt-auth.guard.ts:PERMITIR_CLAVE_PENDIENTE_KEY]` If `payload.requiereCambioClave` is true and `PERMITIR_CLAVE_PENDIENTE_KEY` metadata is not truthy on the handler/class, a `ForbiddenException` with `code: 'REQUIERE_CAMBIO_CLAVE'` is thrown.
- `[scoped-rbac.guard.ts:REQUIRED_PERMISSION_KEY]` Routes without `REQUIRED_PERMISSION_KEY` metadata (or with an empty array) bypass permission checks and return `true`.
- `[scoped-rbac.guard.ts:ScopedRbacGuard.canActivate]` When `REQUIRED_PERMISSION_KEY` is present, `req.user` must be defined (else `UnauthorizedException` is thrown) and `resolverAlcance(req.user, permiso)` must return a truthy scope (else `ForbiddenException` with `'Permiso requerido: ...'` is thrown).

## Side Effects
- `[jwt-auth.guard.ts:JwtAuthGuard.canActivate]` Queries PostgreSQL via `prisma.usuario.findUnique` (including active `asignaciones`, `unidad`, `rol`, and `permisos`) on every non-public authenticated request when `PrismaService` is injected.
- `[jwt-auth.guard.ts:JwtAuthGuard.canActivate]` Mutates the HTTP request object by assigning the verified/hydrated `JwtPayload` to `req.user`.
- `[scoped-rbac.guard.ts:ScopedRbacGuard.canActivate]` Mutates the HTTP request object by assigning the resolved effective scope to `req.alcance` when a permission is required and granted.

## Verification
- Run: `npm test`
