# Scope (`backend/src/common/scope`)

## Overview
Provides access-scope resolution, Prisma query filter builders, and privilege-escalation guard assertions based on a user's active role assignments and permissions (`[alcance.util.ts:resolverAlcance]`, `[alcance.util.ts:filtroUsuariosPorAlcance]`, `[alcance.util.ts:assertUnidadEnAlcance]`, `[alcance.util.ts:assertPuedeOtorgar]`).

## Interface
- `[alcance.util.ts:resolverAlcance] (user: AuthUser, permiso: string | string[]) => AlcanceAcceso | null`
- `[alcance.util.ts:filtroUsuariosPorAlcance] (alcance: AlcanceAcceso) => Prisma.UsuarioWhereInput`
- `[alcance.util.ts:filtroPorDuenioSegunAlcance] (alcance: AlcanceAcceso) => { usuario?: Prisma.UsuarioWhereInput }`
- `[alcance.util.ts:assertUnidadEnAlcance] (alcance: AlcanceAcceso, unidadId: number | null | undefined) => void`
- `[alcance.util.ts:alcanceEfectivo] (a: { alcanceOverride: AlcanceRol | null; rol: { alcancePorDefecto: AlcanceRol } }) => AlcanceRol`
- `[alcance.util.ts:assertPuedeOtorgar] (alcance: AlcanceAcceso, rol: { alcancePorDefecto: AlcanceRol }, alcanceOverride?: AlcanceRol | null) => void`

## Invariants
- `[alcance.util.ts:PERMISOS_AUTOGESTION_PROPIA]` Requests for `'legajos.ver'`, `'legajos.completar'`, `'cuotas.ver'`, or `'miembros.ver'` fall back to `{ tipo: 'PROPIO', usuarioId: user.sub }` when no assignment explicitly grants the permission (`[alcance.util.ts:resolverAlcance]`).
- `[alcance.util.ts:resolverAlcance]` Scope resolution precedence across matching assignments is `GLOBAL` > `UNIDAD` (deduplicated `unidadIds` plus `usuarioIdPropio: user.sub`) > `PROPIO`.
- `[alcance.util.ts:filtroUsuariosPorAlcance]` `UNIDAD` scope filters users by active assignments (`activo: true`) in `alcance.unidadIds`, OR the user's own `id` (`alcance.usuarioIdPropio`) when defined.
- `[alcance.util.ts:assertUnidadEnAlcance]` Throws `ForbiddenException('La unidad está fuera de su alcance')` unless `alcance.tipo === 'GLOBAL'` or (`alcance.tipo === 'UNIDAD'` and a non-null/defined `unidadId` is included in `alcance.unidadIds`).
- `[alcance.util.ts:alcanceEfectivo]` Effective role scope is `alcanceOverride ?? rol.alcancePorDefecto`.
- `[alcance.util.ts:assertPuedeOtorgar]` Prevents privilege escalation by throwing `ForbiddenException('Solo un usuario con alcance global puede otorgar alcance global')` if a caller without `GLOBAL` scope attempts to grant an effective scope of `AlcanceRol.GLOBAL`.

## Side Effects
- None

## Verification
- Run: `npm test`
