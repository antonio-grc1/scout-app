# Types (`backend/src/common/types`)

## Overview
Defines TypeScript types, interfaces, and system permission constants for JWT payloads, role assignments, scoped RBAC access levels (`GLOBAL`, `UNIDAD`, `PROPIO`), and authenticated Express requests.

## Interface
- `[auth.types.ts:AsignacionToken]`
- `[auth.types.ts:JwtPayload]`
- `[auth.types.ts:AuthUser]`
- `[auth.types.ts:AlcanceAcceso]`
- `[auth.types.ts:AuthenticatedRequest]`
- `[auth.types.ts:PERMISOS_SISTEMA]`
- `[auth.types.ts:PermisoSistema]`

## Invariants
- `[auth.types.ts:AlcanceAcceso]` Discriminated union restricting effective RBAC scope to `{ tipo: 'GLOBAL' }`, `{ tipo: 'UNIDAD'; unidadIds: number[]; usuarioIdPropio?: number }`, or `{ tipo: 'PROPIO'; usuarioId: number }`.
- `[auth.types.ts:PERMISOS_SISTEMA]` Read-only tuple enumerating the 25 valid system permission strings, typing `[auth.types.ts:PermisoSistema]`.

## Side Effects
- None

## Verification
- Run: `npm test`
