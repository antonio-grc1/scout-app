import { ArgumentsHost, Catch, HttpStatus, type ExceptionFilter } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';

/** Traduce errores conocidos de Prisma a respuestas HTTP claras. */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(e: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const map: Record<string, [number, string]> = {
      P2002: [HttpStatus.CONFLICT, `Ya existe un registro con ese valor (${String(e.meta?.target ?? 'único')})`],
      P2003: [HttpStatus.BAD_REQUEST, 'Referencia a un registro inexistente'],
      P2025: [HttpStatus.NOT_FOUND, 'Registro no encontrado'],
    };
    const [status, message] = map[e.code] ?? [HttpStatus.INTERNAL_SERVER_ERROR, 'Error de base de datos'];
    res.status(status).json({ statusCode: status, message, code: e.code });
  }
}
