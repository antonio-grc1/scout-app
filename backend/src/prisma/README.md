# Prisma (`backend/src/prisma`)

## Overview
Provides a global NestJS `PrismaService` wrapper around `PrismaClient` that manages database lifecycle connections and ensures dynamic role columns exist on startup.

## Interface
- `[prisma.module.ts:PrismaModule]` — `@Global()` `@Module` providing and exporting `PrismaService`
- `[prisma.service.ts:PrismaService]` — `@Injectable()` class extending `PrismaClient`, implementing `OnModuleInit` and `OnModuleDestroy`
- `[prisma.service.ts:PrismaService.onModuleInit]` — `(): Promise<void>`
- `[prisma.service.ts:PrismaService.onModuleDestroy]` — `(): Promise<void>`

## Invariants
- `[prisma.service.ts:asegurarColumnasRolesDinamicos]` — Ensures table `"roles"` has columns `"tipo_miembro"` (`VARCHAR(30) NOT NULL DEFAULT 'EDUCADOR'`) and `"requiere_rama"` (`BOOLEAN NOT NULL DEFAULT true`) when fewer than 2 of those columns exist in `information_schema.columns`; initializes rows where `"alcance_por_defecto" = 'PROPIO'` to (`"tipo_miembro" = 'PROTAGONISTA'`, `"requiere_rama" = true`) and where `"alcance_por_defecto" = 'GLOBAL'` to (`"tipo_miembro" = 'EDUCADOR'`, `"requiere_rama" = false`)

## Side Effects
- `[prisma.service.ts:PrismaService.onModuleInit]` — Establishes database connection via `this.$connect()`, invokes `this.asegurarColumnasRolesDinamicos()`, and logs connection status via `Logger`
- `[prisma.service.ts:asegurarColumnasRolesDinamicos]` — Queries `information_schema.columns` via `$queryRawUnsafe` and conditionally executes DDL (`ALTER TABLE "roles"`) and DML (`UPDATE "roles"`) statements via `$executeRawUnsafe`, suppressing any thrown errors
- `[prisma.service.ts:PrismaService.onModuleDestroy]` — Closes database connection via `this.$disconnect()`

## Verification
- Run: `npm test`
