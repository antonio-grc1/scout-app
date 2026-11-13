# Common (`backend/src/common`)

## Overview
Shared cross-cutting infrastructure for the NestJS backend, grouping authentication and RBAC decorators, execution guards, Prisma exception filtering, Zod request validation pipes, access-scope resolution utilities, authentication/permission types, and pure domain helper utilities (dates/cohorts, form templates, and HMAC-signed QR tokens).

## Subdirectories & Boundaries
- `decorators`: [./decorators/README.md](./decorators/README.md) - Defines NestJS metadata keys, route/class metadata decorators (`Public`, `PermitirClavePendiente`, `RequirePermission`, `RequireAnyPermission`), and HTTP request parameter decorators (`CurrentUser`, `Alcance`) for authentication and RBAC scope injection.
- `filters`: [./filters/README.md](./filters/README.md) - Provides a NestJS exception filter (`PrismaExceptionFilter`) that intercepts `PrismaClientKnownRequestError` exceptions and maps known Prisma error codes (`P2002`, `P2003`, `P2025`) to standardized HTTP status codes and JSON error responses.
- `guards`: [./guards/README.md](./guards/README.md) - Contains two NestJS execution guards (`JwtAuthGuard` and `ScopedRbacGuard`) that enforce JWT authentication with real-time database role/permission hydration, mandatory password-change gating, and scoped RBAC permission evaluation.
- `pipes`: [./pipes/README.md](./pipes/README.md) - Provides a generic NestJS `PipeTransform` (`ZodValidationPipe`) that validates and transforms incoming values against a Zod schema, throwing a `BadRequestException` with mapped issue paths and messages when validation fails.
- `scope`: [./scope/README.md](./scope/README.md) - Provides access-scope resolution, Prisma query filter builders, and privilege-escalation guard assertions based on a user's active role assignments and permissions.
- `types`: [./types/README.md](./types/README.md) - Defines TypeScript types, interfaces, and system permission constants (`PERMISOS_SISTEMA`) for JWT payloads, role assignments, scoped RBAC access levels (`GLOBAL`, `UNIDAD`, `PROPIO`), and authenticated Express requests.
- `utils`: [./utils/README.md](./utils/README.md) - Pure utility modules providing UTC/Argentina (GMT-3) date and scout cohort (`camada` with June 30 cutoff) calculations, Zod schema validation and sibling-copyable field filtering for form templates, and HMAC-SHA256 signed QR token generation and verification.
