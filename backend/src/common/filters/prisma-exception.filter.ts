import { ArgumentsHost, Catch, HttpStatus, type ExceptionFilter } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';

/** Traduce errores conocidos y de validación de Prisma a respuestas HTTP claras sin exponer metadatos internos. */
@Catch(Prisma.PrismaClientKnownRequestError, Prisma.PrismaClientValidationError)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(
    e: Prisma.PrismaClientKnownRequestError | Prisma.PrismaClientValidationError,
    host: ArgumentsHost,
  ): void {
    const res = host.switchToHttp().getResponse<Response>();
    if (e instanceof Prisma.PrismaClientValidationError) {
      res.status(HttpStatus.BAD_REQUEST).json({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Datos inválidos para la operación solicitada',
        code: 'VALIDATION_ERROR',
      });
      return;
    }

    const map: Record<string, [number, string]> = {
      P2002: [HttpStatus.CONFLICT, 'Ya existe un registro con ese valor'],
      P2003: [HttpStatus.BAD_REQUEST, 'Referencia a un registro inexistente'],
      P2024: [HttpStatus.SERVICE_UNAVAILABLE, 'Servicio temporalmente saturado, reintentá en unos instantes'],
      P2025: [HttpStatus.NOT_FOUND, 'Registro no encontrado'],
      P2028: [HttpStatus.SERVICE_UNAVAILABLE, 'No se pudo iniciar la transacción, reintentá en unos instantes'],
      P2034: [HttpStatus.CONFLICT, 'Conflicto de concurrencia, reintentá la operación'],
    };
    const [status, message] = map[e.code] ?? [HttpStatus.INTERNAL_SERVER_ERROR, 'Error de base de datos'];
    res.status(status).json({ statusCode: status, message, code: e.code });
  }
}
