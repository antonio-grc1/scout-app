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
import type { AuthUser, AuthenticatedRequest, JwtTokenClaims } from '../types/auth.types.js';

export const AUTH_COOKIE_NAME = 'scout_access_token';

/**
 * Extrae el token JWT exclusivamente desde la cookie HttpOnly `scout_access_token`.
 */
export function extraerTokenDeRequest(req?: {
  headers?: { cookie?: string };
}): string | null {
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
 * Guard global: valida la cookie JWT HttpOnly e hidrata en tiempo real `req.user`
 * desde la base de datos para que cualquier cambio en roles/permisos impacte de inmediato.
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

    let claims: JwtTokenClaims;
    try {
      claims = await this.jwt.verifyAsync<JwtTokenClaims>(token);
    } catch {
      throw new UnauthorizedException('Token inválido o vencido');
    }

    if (!this.prisma?.usuario?.findUnique) {
      throw new UnauthorizedException('Servicio de autenticación no disponible');
    }

    const usuarioDb = await this.prisma.usuario.findUnique({
      where: { id: claims.sub },
      select: {
        id: true,
        dni: true,
        tipoMiembro: true,
        activo: true,
        requiereCambioClave: true,
        tokenVersion: true,
        asignaciones: {
          where: { activo: true },
          select: {
            unidadId: true,
            unidad: { select: { nombre: true, activa: true } },
            rol: {
              select: {
                id: true,
                nombre: true,
                tipoMiembro: true,
                requiereRama: true,
                tipoUnidad: true,
                activo: true,
                alcancePorDefecto: true,
                permisos: {
                  select: {
                    alcance: true,
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
      claims.tokenVersion !== usuarioDb.tokenVersion
    ) {
      throw new UnauthorizedException('Sesión revocada; vuelva a iniciar sesión');
    }

    const usuarioHidratado: AuthUser = {
      sub: usuarioDb.id,
      dni: usuarioDb.dni,
      requiereCambioClave: usuarioDb.requiereCambioClave,
      tokenVersion: usuarioDb.tokenVersion,
      asignaciones: usuarioDb.asignaciones
        .filter((a) => a.unidad?.activa !== false && a.rol?.activo !== false)
        .map((a) => ({
          unidadId: a.unidadId,
          unidadNombre: a.unidad.nombre,
          rolId: a.rol.id,
          rol: a.rol.nombre,
          tipoMiembro: usuarioDb.tipoMiembro ?? a.rol.tipoMiembro ?? 'EDUCADOR',
          requiereRama: a.rol.requiereRama ?? true,
          tipoUnidad: a.rol.tipoUnidad,
          alcance: a.rol.alcancePorDefecto,
          permisos: a.rol.permisos.map((rp) => rp.permiso.clave),
          permisosAlcance: Object.fromEntries(
            a.rol.permisos.map((rp) => [rp.permiso.clave, rp.alcance ?? a.rol.alcancePorDefecto]),
          ),
        })),
    };

    req.user = usuarioHidratado;

    const permitePendiente = this.reflector.getAllAndOverride<boolean>(PERMITIR_CLAVE_PENDIENTE_KEY, targets);
    if (usuarioHidratado.requiereCambioClave && !permitePendiente) {
      throw new ForbiddenException({
        code: 'REQUIERE_CAMBIO_CLAVE',
        message: 'Debe cambiar su clave antes de continuar',
      });
    }
    return true;
  }
}
