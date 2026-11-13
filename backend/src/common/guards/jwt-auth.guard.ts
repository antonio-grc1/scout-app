import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC_KEY, PERMITIR_CLAVE_PENDIENTE_KEY } from '../decorators/auth.decorators.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AuthenticatedRequest, JwtPayload } from '../types/auth.types.js';

export const AUTH_COOKIE_NAME = 'scout_access_token';

/**
 * Extrae el token JWT desde el header Authorization (`Bearer ...`) o desde la cookie HttpOnly.
 */
export function extraerTokenDeRequest(req?: {
  headers?: { authorization?: string; cookie?: string };
}): string | null {
  const [tipo, tokenHeader] = req?.headers?.authorization?.split(' ') ?? [];
  if (tipo === 'Bearer' && tokenHeader) {
    return tokenHeader;
  }

  const cookieHeader = req?.headers?.cookie;
  if (!cookieHeader) return null;

  for (const parte of cookieHeader.split(';')) {
    const idx = parte.indexOf('=');
    if (idx === -1) continue;
    const nombre = parte.slice(0, idx).trim();
    if (nombre === AUTH_COOKIE_NAME) {
      const valor = parte.slice(idx + 1).trim();
      if (!valor) return null;
      try {
        return decodeURIComponent(valor);
      } catch {
        return valor;
      }
    }
  }
  return null;
}

/**
 * Guard global: valida el JWT (Bearer o cookie HttpOnly) y carga `req.user`.
 * Hidrata en tiempo real las asignaciones y permisos desde la base de datos
 * para que cualquier cambio en roles/permisos impacte inmediatamente sin reloguear.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extraerTokenDeRequest(req);
    if (!token) throw new UnauthorizedException('Token ausente');

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Token inválido o vencido');
    }

    if (this.prisma?.usuario?.findUnique) {
      try {
        const usuarioDb = await this.prisma.usuario.findUnique({
          where: { id: payload.sub },
          select: {
            id: true,
            dni: true,
            activo: true,
            requiereCambioClave: true,
            tokenVersion: true,
            asignaciones: {
              where: { activo: true },
              select: {
                unidadId: true,
                alcanceOverride: true,
                unidad: { select: { nombre: true, activa: true } },
                rol: {
                  select: {
                    id: true,
                    nombre: true,
                    tipoMiembro: true,
                    requiereRama: true,
                    alcancePorDefecto: true,
                    permisos: {
                      select: {
                        permiso: { select: { clave: true } },
                      },
                    },
                  },
                },
              },
            },
          },
        });
        if (!usuarioDb || !usuarioDb.activo) {
          throw new UnauthorizedException('Usuario inactivo o inexistente');
        }
        if (
          typeof usuarioDb.tokenVersion === 'number' &&
          payload.tokenVersion !== usuarioDb.tokenVersion
        ) {
          throw new UnauthorizedException('Sesión revocada; vuelva a iniciar sesión');
        }
        payload = {
          sub: usuarioDb.id,
          dni: usuarioDb.dni,
          requiereCambioClave: usuarioDb.requiereCambioClave,
          tokenVersion: usuarioDb.tokenVersion,
          asignaciones: usuarioDb.asignaciones
            .filter((a) => a.unidad?.activa !== false)
            .map((a) => ({
              unidadId: a.unidadId,
              unidadNombre: a.unidad.nombre,
              rolId: a.rol.id,
              rol: a.rol.nombre,
              tipoMiembro: a.rol.tipoMiembro ?? 'EDUCADOR',
              requiereRama: a.rol.requiereRama ?? true,
              alcance: a.alcanceOverride ?? a.rol.alcancePorDefecto,
              permisos: a.rol.permisos.map((rp) => rp.permiso.clave),
            })),
        };
      } catch (err) {
        if (err instanceof UnauthorizedException) throw err;
        throw err;
      }
    }

    req.user = payload;

    const permitePendiente = this.reflector.getAllAndOverride<boolean>(PERMITIR_CLAVE_PENDIENTE_KEY, targets);
    if (payload.requiereCambioClave && !permitePendiente) {
      throw new ForbiddenException({
        code: 'REQUIERE_CAMBIO_CLAVE',
        message: 'Debe cambiar su clave antes de continuar',
      });
    }
    return true;
  }
}
