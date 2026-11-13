# Decorators (`backend/src/common/decorators`)

## Overview
Defines NestJS metadata keys, route/class metadata decorators (`Public`, `PermitirClavePendiente`, `RequirePermission`, `RequireAnyPermission`), and HTTP request parameter decorators (`CurrentUser`, `Alcance`) for authentication and RBAC scope injection.

## Interface
- `[auth.decorators.ts:IS_PUBLIC_KEY] = 'auth:isPublic'`
- `[auth.decorators.ts:PERMITIR_CLAVE_PENDIENTE_KEY] = 'auth:permitirClavePendiente'`
- `[auth.decorators.ts:REQUIRED_PERMISSION_KEY] = 'rbac:requiredPermission'`
- `[auth.decorators.ts:Public] () => CustomDecorator<string>` (sets metadata `'auth:isPublic'` to `true`)
- `[auth.decorators.ts:PermitirClavePendiente] () => CustomDecorator<string>` (sets metadata `'auth:permitirClavePendiente'` to `true`)
- `[auth.decorators.ts:RequirePermission] (claveOClaves: string | string[], ...resto: string[]) => CustomDecorator<string>` (sets metadata `'rbac:requiredPermission'` to `string | string[]`)
- `[auth.decorators.ts:RequireAnyPermission] (...claves: (string | string[])[]) => CustomDecorator<string>` (sets metadata `'rbac:requiredPermission'` to flattened `string[]`)
- `[auth.decorators.ts:CurrentUser]` `ParameterDecorator` returning `AuthUser` from `req.user`
- `[auth.decorators.ts:Alcance]` `ParameterDecorator` returning `AlcanceAcceso` from `req.alcance`

## Invariants
- `[auth.decorators.ts:Alcance]` Throws `Error('@Alcance() requiere que el endpoint tenga @RequirePermission()')` if `req.alcance` is falsy/undefined on the HTTP request.
- `[auth.decorators.ts:RequirePermission]` Normalizes `(claveOClaves, ...resto)` to `claveOClaves` if it is already an array or if `resto` is empty, otherwise combines `[claveOClaves, ...resto]`.

## Side Effects
- `[auth.decorators.ts:Public]` Attaches reflector metadata `IS_PUBLIC_KEY` (`'auth:isPublic' = true`) to target.
- `[auth.decorators.ts:PermitirClavePendiente]` Attaches reflector metadata `PERMITIR_CLAVE_PENDIENTE_KEY` (`'auth:permitirClavePendiente' = true`) to target.
- `[auth.decorators.ts:RequirePermission]` Attaches reflector metadata `REQUIRED_PERMISSION_KEY` (`'rbac:requiredPermission'`) to target.
- `[auth.decorators.ts:RequireAnyPermission]` Attaches reflector metadata `REQUIRED_PERMISSION_KEY` (`'rbac:requiredPermission'`) to target.

## Verification
- Run: `npm test`
