# Mailer (`backend/src/mailer`)

## Overview
Provides global outbound SMTP email delivery for user onboarding welcome messages with HTML escaping and non-throwing fallback behavior when SMTP is unconfigured or fails.

## Interface
- `[mailer.module.ts:MailerModule]` — `@Global()` `@Module` exporting `MailerService`
- `[mailer.service.ts:DatosEmailBienvenida]` — Interface with fields `destinatario`, `nombre`, `apellido`, `dni`, `unidadNombre?`, `rolNombre?`
- `[mailer.service.ts:MailerService.enviarBienvenidaAlta]` — `async (datos: DatosEmailBienvenida): Promise<boolean>`

## Invariants
- `[mailer.service.ts:escapeHtml]` — Escapes `&`, `<`, `>`, `"`, and `'` characters on `nombre`, `apellido`, `unidadNombre`, `rolNombre`, and `dni` before interpolation into HTML
- `[mailer.service.ts:MailerService.crearTransporter]` — Requires non-empty trimmed `SMTP_HOST`, `SMTP_USER`, and `SMTP_PASS` environment variables to create a transport; otherwise returns `null` (defaults `SMTP_PORT` to `587` and sets `secure: port === 465`)
- `[mailer.service.ts:MailerService.enviarBienvenidaAlta]` — Returns `false` immediately if `datos.destinatario?.trim()` is empty, if `transporter` is `null`, or if `sendMail` throws an error; never throws on SMTP failure

## Side Effects
- `[mailer.service.ts:MailerService.crearTransporter]` — Reads `process.env.SMTP_HOST`, `process.env.SMTP_PORT`, `process.env.SMTP_USER`, `process.env.SMTP_PASS` and initializes a `nodemailer` SMTP transport
- `[mailer.service.ts:MailerService.enviarBienvenidaAlta]` — Reads `process.env.APP_URL`, `process.env.SMTP_FROM`, `process.env.SMTP_USER`
- `[mailer.service.ts:MailerService.enviarBienvenidaAlta]` — Sends an outbound HTML welcome email via `nodemailer` `transporter.sendMail` when SMTP is configured
- `[mailer.service.ts:MailerService.logger]` — Writes info logs (`this.logger.log`) when SMTP is unconfigured or when email succeeds, and warning logs (`this.logger.warn`) when `sendMail` fails

## Verification
- Run: `npm test`
