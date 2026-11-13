# Auth (`backend/src/auth`)

## Overview
Provides user authentication, JWT session issuance, self-service password change, current user profile lookup, and scope-enforced administrative password resets.

## Interface
- `[auth.dto.ts:LoginSchema]` — Zod schema validating `{ dni: string (trimmed, 1..20 chars), password: string (1..200 chars) }`
- `[auth.dto.ts:LoginDto]` — Type inferred from `LoginSchema`
- `[auth.dto.ts:CambiarClaveSchema]` — Zod schema accepting `{ claveActual?, passwordActual?, claveNueva?, passwordNueva? }` (each max 200 chars) and transforming to `{ claveActual, claveNueva }`
- `[auth.dto.ts:CambiarClaveDto]` — Type inferred from `CambiarClaveSchema`
- `[auth.module.ts:AuthModule]` — NestJS `@Module` registering global `JwtModule` (`secret: env.JWT_SECRET`, `expiresIn: env.JWT_EXPIRES_IN`), controller `AuthController`, and provider/export `AuthService`
- `[auth.controller.ts:AuthController]` — `@Controller('auth')`
- `[auth.controller.ts:AuthController.login]` — `POST /auth/login` (`@Public`, `@HttpCode(200)`, `ZodValidationPipe(LoginSchema)`) -> `AuthService.login(dto)`
- `[auth.controller.ts:AuthController.cambiarClave]` — `POST /auth/cambiar-clave` (`@PermitirClavePendiente`, `@HttpCode(200)`, `ZodValidationPipe(CambiarClaveSchema)`) -> `AuthService.cambiarClave(user, dto)`
- `[auth.controller.ts:AuthController.cambiarPassword]` — `POST /auth/cambiar-password` (`@PermitirClavePendiente`, `@HttpCode(200)`, `ZodValidationPipe(CambiarClaveSchema)`) -> `AuthService.cambiarClave(user, dto)`
- `[auth.controller.ts:AuthController.me]` — `GET /auth/me` (`@PermitirClavePendiente`) -> `AuthService.perfil(user)`
- `[auth.controller.ts:AuthController.perfil]` — `GET /auth/perfil` (`@PermitirClavePendiente`) -> `AuthService.perfil(user)`
- `[auth.controller.ts:AuthController.resetearClave]` — `POST /auth/usuarios/:id/resetear-clave` (`@RequirePermission('auth.resetear_clave')`, `@HttpCode(200)`, `ParseIntPipe` on `:id`) -> `AuthService.resetearClave(user, alcance, id)`
- `[auth.service.ts:SesionResponse]` — Interface `{ accessToken: string; requiereCambioClave: boolean; usuario: { id: number; dni: string; nombre: string; apellido: string }; asignaciones: AsignacionToken[] }`
- `[auth.service.ts:AuthService.login]` — `(dto: LoginDto) => Promise<SesionResponse>`
- `[auth.service.ts:AuthService.cambiarClave]` — `(user: AuthUser, dto: CambiarClaveDto) => Promise<SesionResponse>`
- `[auth.service.ts:AuthService.resetearClave]` — `(actor: AuthUser, alcance: AlcanceAcceso, usuarioId: number) => Promise<{ mensaje: string }>`
- `[auth.service.ts:AuthService.perfil]` — `(user: AuthUser) => Promise<SesionResponse>`

## Invariants
- `[auth.dto.ts:dni]` — `dni` is trimmed string with length >= 1 (`'DNI obligatorio'`) and <= 20
- `[auth.dto.ts:LoginSchema]` — `password` is string with length >= 1 (`'Contraseña obligatoria'`) and <= 200
- `[auth.dto.ts:CambiarClaveSchema]` — `claveActual` / `passwordActual` / `claveNueva` / `passwordNueva` each <= 200 chars; normalized `claveActual` must have length > 0 (`'Clave actual obligatoria'`); normalized `claveNueva` must have length >= 8 (`'La nueva clave debe tener al menos 8 caracteres'`); `claveActual !== claveNueva` (`'La nueva clave debe ser distinta de la actual'`)
- `[auth.service.ts:DUMMY_HASH]` — Module-level bcrypt hash (`BCRYPT_ROUNDS = 10`) used during login when `usuario` is not found to equalize timing and prevent user enumeration
- `[auth.service.ts:INCLUDE_ASIGNACIONES]` — Only active assignments (`where: { activo: true }`) are loaded from Prisma
- `[auth.service.ts:AuthService.login]` — Throws `UnauthorizedException('DNI o contraseña incorrectos')` if `!usuario`, `!bcrypt.compare(password, ...)`, or `!usuario.activo`
- `[auth.service.ts:AuthService.cambiarClave]` — Throws `UnauthorizedException` if `!usuario` or `!usuario.activo`; throws `BadRequestException('La clave actual es incorrecta')` if current password does not match; throws `BadRequestException('La nueva clave no puede ser igual al DNI')` if `dto.claveNueva.trim() === usuario.dni.trim()`
- `[auth.service.ts:AuthService.resetearClave]` — Throws `BadRequestException('Para su propia cuenta use el cambio de clave')` if `usuarioId === actor.sub`
- `[auth.service.ts:AuthService.resetearClave]` — Target user must match `filtroUsuariosPorAlcance(alcance)`, otherwise throws `NotFoundException('Usuario no encontrado en su alcance')`
- `[auth.service.ts:AuthService.resetearClave]` — When actor `alcance.tipo !== 'GLOBAL'`: throws `ForbiddenException` if target has any active assignment with effective scope (`alcanceOverride ?? rol.alcancePorDefecto`) `=== AlcanceRol.GLOBAL`; when actor `alcance.tipo === 'UNIDAD'`, throws `ForbiddenException` if target has any active `UNIDAD`-scoped assignment in a `unidadId` not in `alcance.unidadIds`
- `[auth.service.ts:AuthService.perfil]` — Throws `UnauthorizedException` if `!usuario` or `!usuario.activo`
- `[auth.service.ts:AuthService.mapearAsignaciones]` — Filters out assignments whose `unidad` is inactive (`a.unidad.activa === true`); defaults `tipoMiembro` to `'EDUCADOR'`, `requiereRama` to `true`, and `alcance` to `a.alcanceOverride ?? a.rol.alcancePorDefecto`

## Side Effects
- `[auth.service.ts:DUMMY_HASH]` — Executes synchronous `bcrypt.hashSync('dummy-password-no-valida', 10)` at module load time
- `[auth.service.ts:AuthService.login]` — Reads `prisma.usuario.findUnique` by `dni` with active assignments/unidad/rol/permisos and signs a JWT via `jwt.signAsync`
- `[auth.service.ts:AuthService.cambiarClave]` — Reads `prisma.usuario.findUnique` by `id`, updates `prisma.usuario.update` setting `passwordHash` (bcrypt hash, 10 rounds) and `requiereCambioClave = false`, and signs a new JWT via `jwt.signAsync`
- `[auth.service.ts:AuthService.resetearClave]` — Reads `prisma.usuario.findFirst` filtered by `alcance`, and updates `prisma.usuario.update` setting `passwordHash` to `bcrypt.hash(objetivo.dni, 10)` and `requiereCambioClave = true`
- `[auth.service.ts:AuthService.perfil]` — Reads `prisma.usuario.findUnique` by `user.sub` with active assignments and signs a new JWT via `jwt.signAsync`

## Verification
- Run: `npm test`
