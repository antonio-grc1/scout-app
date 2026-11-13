# Utils (`backend/src/common/utils`)

## Overview
Pure utility modules providing UTC/Argentina (GMT-3) date and scout cohort (`camada` with June 30 cutoff) calculations, Zod schema validation and sibling-copyable field filtering for form templates (`esquemaCamposJson`), and HMAC-SHA256 signed QR token generation and timing-safe verification.

## Interface
- `[fechas.util.ts:hoyUtc] (): Date`
- `[fechas.util.ts:calcularEdad] (fechaNacimiento: Date, referencia?: Date): number`
- `[fechas.util.ts:anioActual] (): number`
- `[fechas.util.ts:fechaCorteCicloEscolar] (anio?: number): Date`
- `[fechas.util.ts:calcularAnioCamada] (fechaNacimiento: Date): number`
- `[fechas.util.ts:parsearFechaOperacion] (fechaStr?: string | null): Date`
- `[plantillas.util.ts:CampoFormularioSchema]` `z.ZodObject`
- `[plantillas.util.ts:SeccionFormularioSchema]` `z.ZodObject`
- `[plantillas.util.ts:EsquemaCamposSchema]` `z.ZodObject`
- `[plantillas.util.ts:EsquemaCampos]` `type`
- `[plantillas.util.ts:clavesCopiablesEntreHermanos] (esquemas: unknown[]): Set<string>`
- `[plantillas.util.ts:filtrarClaves] (datos: unknown, claves: Set<string>): Record<string, unknown>`
- `[qr-token.util.ts:generateTokenQR] (): string`
- `[qr-token.util.ts:verifyTokenQR] (token: string): { valid: boolean; uuid: string }`

## Invariants
- `[fechas.util.ts:hoyUtc]` Returns current local calendar date normalized to `00:00:00.000` UTC.
- `[fechas.util.ts:calcularEdad]` Computes completed years between `fechaNacimiento` and `referencia` (defaults to `hoyUtc()`) using UTC year/month/day components.
- `[fechas.util.ts:fechaCorteCicloEscolar]` Scout school cycle cutoff date is fixed at June 30 UTC (`Date.UTC(anio, 5, 30)`).
- `[fechas.util.ts:calcularAnioCamada]` Birth dates in UTC months Jan-Jun (`mesNac < 6`) belong to cohort year `anioNac`; Jul-Dec belong to `anioNac + 1`.
- `[fechas.util.ts:parsearFechaOperacion]` Empty/invalid date strings fallback to `new Date()`; `YYYY-MM-DD` strings matching today in `America/Argentina/Buenos_Aires` return `new Date()`, otherwise `T15:00:00.000Z` (12:00 GMT-3); zoneless `YYYY-MM-DDTHH:mm(:ss)?` strings append `-03:00`.
- `[plantillas.util.ts:CampoFormularioSchema]` Requires non-empty string `key` (`min(1)`), string `label`, string `type`, optional boolean `required`, and allows extra properties (`z.looseObject`).
- `[plantillas.util.ts:SeccionFormularioSchema]` Requires non-empty string `id` (`min(1)`), string `titulo`, optional boolean `permiteCopiarHermano`, array `campos` of `CampoFormularioSchema`, and allows extra properties (`z.looseObject`).
- `[plantillas.util.ts:clavesCopiablesEntreHermanos]` Collects field `key`s only from sections where `permiteCopiarHermano` is truthy; invalid schemas are silently ignored via `safeParse`.
- `[plantillas.util.ts:filtrarClaves]` Returns `{}` if `datos` is falsy, not an object, or an array; otherwise retains only entries whose key is in `claves`.
- `[qr-token.util.ts:generateTokenQR]` Produces token formatted as `<uuid>.<64-char-hex-hmac-sha256>` signed with `process.env.QR_HMAC_SECRET` or fallback `DEFAULT_SECRET`.
- `[qr-token.util.ts:verifyTokenQR]` Requires non-empty string with `<uuid>.<signature>` where `signature` matches `/^[a-f0-9]{64}$/i` and matches the expected HMAC-SHA256 digest via `crypto.timingSafeEqual`.

## Side Effects
- `[qr-token.util.ts:generateTokenQR]` Reads environment variable `process.env.QR_HMAC_SECRET` and generates cryptographic randomness via `crypto.randomUUID()`.
- `[qr-token.util.ts:verifyTokenQR]` Reads environment variable `process.env.QR_HMAC_SECRET`.

## Verification
- Run: `npm test`
