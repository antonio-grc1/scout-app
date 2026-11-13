# Config (`backend/src/config`)

## Overview
Loads environment variables from `.env` and validates required runtime configuration at module load time using Zod.

## Interface
- `[env.ts:env]` — Exported parsed environment configuration object validated against `EnvSchema` (`DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `QR_HMAC_SECRET`, `PORT`, `CORS_ORIGIN?`, `APP_URL`, `SMTP_HOST?`, `SMTP_PORT`, `SMTP_USER?`, `SMTP_PASS?`, `SMTP_FROM?`)
- `[env.ts:Env]` — Exported TypeScript type inferred from `EnvSchema` (`z.infer<typeof EnvSchema>`)

## Invariants
- `[env.ts:EnvSchema.DATABASE_URL]` — Required non-empty string (`'DATABASE_URL es obligatoria'`)
- `[env.ts:EnvSchema.JWT_SECRET]` — Required string of at least 32 characters
- `[env.ts:EnvSchema.JWT_EXPIRES_IN]` — Required non-empty string, defaults to `'8h'`
- `[env.ts:EnvSchema.QR_HMAC_SECRET]` — Required string of at least 32 characters
- `[env.ts:EnvSchema.PORT]` — Coerced to positive integer, defaults to `3000`
- `[env.ts:EnvSchema.CORS_ORIGIN]` — Optional string (comma-separated origins; falls back to localhost origins in `main.ts` when omitted)
- `[env.ts:EnvSchema.APP_URL]` — HTTP/HTTPS URL string, defaults to `'http://localhost:5173'`
- `[env.ts:EnvSchema.SMTP_*]` — Optional SMTP settings (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, coerced `SMTP_PORT` in `1..65535` defaulting to `587`)

## Side Effects
- `[env.ts:dotenv/config]` — Side-effect import `import 'dotenv/config'` loads `.env` variables into `process.env` at module import time
- `[env.ts:env]` — Calls `EnvSchema.parse(process.env)` eagerly at module load time, throwing a `ZodError` if validation fails

## Verification
- Run: `npm test`
