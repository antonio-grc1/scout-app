# Backend Source (`backend/src`) Blueprint

## System Overview
Core NestJS application source tree for the Scout Group management backend. It exposes a REST API under the global `/api` prefix backed by PostgreSQL (via Prisma ORM), enforcing JWT authentication, real-time database role/permission hydration, and hierarchical RBAC scopes (`GLOBAL`, `UNIDAD`, `PROPIO`) across organizational units, member profiles, dynamic dossiers (`legajos`), branch progression (`pases`), and treasury/accounting (`tesoreria`).

## Local Interface & Invariants
- **Interface**:
  - `[app.module.ts:AppModule]`: Root NestJS `@Module` importing `PrismaModule`, `MailerModule`, `AuthModule`, `OrganizacionModule`, `MiembrosModule`, `PasesModule`, `LegajosModule`, and `TesoreriaModule`; registers global `APP_GUARD` providers `JwtAuthGuard` and `ScopedRbacGuard`.
  - `[main.ts:bootstrap]`: Top-level async entrypoint that creates the NestJS application from `AppModule`, configures global prefix `'api'`, registers `PrismaExceptionFilter`, configures CORS, enables shutdown hooks, and listens on `env.PORT`.
- **Invariants**:
  - `[app.module.ts:APP_GUARD]`: Global guard execution order is fixed: `JwtAuthGuard` runs first (authentication and active assignment hydration), followed by `ScopedRbacGuard` (scoped RBAC authorization).
  - `[main.ts:bootstrap]`: All HTTP routes are served under the global prefix `'api'` via `app.setGlobalPrefix('api')`.
  - `[main.ts:bootstrap]`: CORS `origin` allows all origins (`true`) when `env.CORS_ORIGIN` is empty or `'*'`, otherwise splits `env.CORS_ORIGIN` by comma and trims each origin.
- **Side Effects**:
  - `[main.ts:bootstrap]`: Top-level `await bootstrap()` immediately instantiates the NestJS application, registers OS signal shutdown hooks (`app.enableShutdownHooks()`), and binds an HTTP server listening on `env.PORT`.

## Subdirectories & System Boundaries
- **auth**: [./auth/README.md](./auth/README.md) - User authentication, JWT session issuance, self-service password change, current user profile lookup, and scope-enforced administrative password resets.
- **common**: [./common/README.md](./common/README.md) - Shared cross-cutting infrastructure: auth/RBAC decorators, execution guards, Prisma exception filter, Zod validation pipe, access-scope resolution utilities, auth/permission types, and pure domain helpers (dates/cohorts, form templates, and HMAC-SHA256 QR tokens).
- **config**: [./config/README.md](./config/README.md) - Environment variable loading from `.env` and Zod runtime validation (`DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `PORT`, `CORS_ORIGIN`).
- **legajos**: [./legajos/README.md](./legajos/README.md) - Dynamic member dossier templates (`PlantillaFormulario`), sibling prefill resolution, dossier submission snapshots (`EntregaFormulario`) with SHA-256 verification hashes, physical QR validation, and adult collaborator survey extraction.
- **mailer**: [./mailer/README.md](./mailer/README.md) - Global outbound SMTP email delivery (`MailerService`) for user onboarding welcome messages with HTML escaping and non-throwing fallback when SMTP is unconfigured.
- **miembros**: [./miembros/README.md](./miembros/README.md) - Member profiles (`Usuario`), sibling lookups and family group linking (`GrupoFamiliar`), and unit/role assignments (`AsignacionMiembro`) with field-level permissions, last-admin lockout protection, and treasury/email synchronization.
- **organizacion**: [./organizacion/README.md](./organizacion/README.md) - Organizational structure and RBAC catalog management: branches (`Rama`), organizational units (`UnidadOrganizativa`), roles (`Rol`), and permissions (`Permiso`).
- **pases**: [./pases/README.md](./pases/README.md) - Member progression and role/unit transitions across branches and units, including pure age/cohort suggestion logic (June 30 cutoff) and transactional single/batch pass execution.
- **prisma**: [./prisma/README.md](./prisma/README.md) - Global `PrismaService` wrapper managing PostgreSQL lifecycle connections and ensuring dynamic role columns (`tipo_miembro`, `requiere_rama`) exist on startup.
- **tesoreria**: [./tesoreria/README.md](./tesoreria/README.md) - Financial, accounting, fee collection, family discount, cash/bank ledger, income/expense, and fundraising event subsystems with QR ticket validation.

## Global Invariants
- `[common/guards/jwt-auth.guard.ts:JwtAuthGuard.canActivate]` & `[common/guards/scoped-rbac.guard.ts:ScopedRbacGuard.canActivate]`: Every non-`@Public()` route requires a valid Bearer JWT belonging to an active user (`activo === true`), enforces mandatory password changes unless `@PermitirClavePendiente()` is present, and resolves effective access scope (`GLOBAL` > `UNIDAD` > `PROPIO`) before handler execution when `@RequirePermission()` / `@RequireAnyPermission()` is declared.
- `[common/scope/alcance.util.ts:assertPuedeOtorgar]` & `[organizacion/organizacion.service.ts:OrganizacionService.asegurarNoBloquearUltimoAdmin]` & `[miembros/miembros.service.ts:MiembrosService.asegurarNoDesactivarUltimoAdmin]`: Non-`GLOBAL` callers cannot grant `GLOBAL` scope or modify users holding active `GLOBAL` assignments, and the system prevents deactivating or removing the last active global administrator or admin role.
- `[common/filters/prisma-exception.filter.ts:PrismaExceptionFilter.catch]`: Unhandled `Prisma.PrismaClientKnownRequestError` exceptions across all controllers are translated into HTTP `409` (`P2002`), `400` (`P2003`), `404` (`P2025`), or `500`.

## Global Side Effects
- **PostgreSQL Database (`PrismaService`)**: Mutates and queries shared relational tables defined in `[backend/prisma/schema.prisma]` (`Rama`, `UnidadOrganizativa`, `GrupoFamiliar`, `Usuario`, `Rol`, `Permiso`, `RolPermiso`, `AsignacionMiembro`, `PlantillaFormulario`, `EntregaFormulario`, `ConceptoCuota`, `CargoMiembro`, `Pago`, `PagoImputacion`, `PlanCuotaMensual`, `CuentaFinanciera`, `MovimientoFinanciero`, `RubroContable`, `Gasto`, `Evento`, `ItemEvento`, `PedidoEvento`, `DetallePedidoEvento`, `TicketEvento`) and executes startup schema checks on `"roles"`.
- **Outbound SMTP (`MailerService`)**: Sends welcome emails via `nodemailer` when `SMTP_HOST`, `SMTP_USER`, and `SMTP_PASS` are configured in the environment.
- **Process & Environment (`config/env.ts`, `main.ts`)**: Loads `.env` into `process.env` at import time, validates environment variables via `EnvSchema`, and binds the HTTP server to `env.PORT`.

## System Verification
- Run: `npm test`
