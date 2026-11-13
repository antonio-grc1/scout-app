# Pipes (`backend/src/common/pipes`)

## Overview
Provides a generic NestJS `PipeTransform` (`ZodValidationPipe`) that validates and transforms incoming values against a Zod schema, throwing a `BadRequestException` with mapped issue paths and messages when validation fails.

## Interface
- `[zod-validation.pipe.ts:ZodValidationPipe]` `export class ZodValidationPipe<T extends z.ZodType> implements PipeTransform<unknown, z.infer<T>>`
- `[zod-validation.pipe.ts:ZodValidationPipe.constructor]` `constructor(private readonly schema: T)`
- `[zod-validation.pipe.ts:ZodValidationPipe.transform]` `transform(value: unknown): z.infer<T>`

## Invariants
- `[zod-validation.pipe.ts:ZodValidationPipe.transform]` Input values must pass `this.schema.safeParse(value)` (`result.success === true`); otherwise a `BadRequestException` is thrown with payload `{ message: 'Datos inválidos', errores: Array<{ campo: string, mensaje: string }> }`.

## Side Effects
- None

## Verification
- Run: `npm test`
