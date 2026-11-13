# Filters (`backend/src/common/filters`)

## Overview
Provides a NestJS exception filter that intercepts `PrismaClientKnownRequestError` exceptions and maps known Prisma error codes (`P2002`, `P2003`, `P2025`) to standardized HTTP status codes and JSON error responses.

## Interface
- `[prisma-exception.filter.ts:PrismaExceptionFilter]`
- `[prisma-exception.filter.ts:PrismaExceptionFilter.catch]`

## Invariants
- `[prisma-exception.filter.ts:PrismaExceptionFilter]` Only catches instances of `Prisma.PrismaClientKnownRequestError` via `@Catch(Prisma.PrismaClientKnownRequestError)`.
- `[prisma-exception.filter.ts:PrismaExceptionFilter.catch]` Maps `P2002` to `HttpStatus.CONFLICT` (409), `P2003` to `HttpStatus.BAD_REQUEST` (400), `P2025` to `HttpStatus.NOT_FOUND` (404), and all other error codes to `HttpStatus.INTERNAL_SERVER_ERROR` (500).

## Side Effects
- `[prisma-exception.filter.ts:PrismaExceptionFilter.catch]` Mutates the Express HTTP response by setting the HTTP status and sending a JSON payload (`{ statusCode, message, code }`) via `res.status(status).json(...)`.

## Verification
- Run: `npm test`
