import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AlcanceRol, type Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { filtroUsuariosPorAlcance } from '../common/scope/alcance.util.js';
import type { AlcanceAcceso, AsignacionToken, AuthUser, JwtPayload } from '../common/types/auth.types.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CambiarClaveDto, LoginDto } from './auth.dto.js';

const BCRYPT_ROUNDS = 10;
/** Hash ficticio para igualar tiempos cuando el DNI no existe (evita enumeración de usuarios). */
const DUMMY_HASH = bcrypt.hashSync('dummy-password-no-valida', BCRYPT_ROUNDS);

const INCLUDE_ASIGNACIONES = {
  asignaciones: {
    where: { activo: true },
    include: {
      unidad: true,
      rol: { include: { permisos: { include: { permiso: true } } } },
    },
  },
} satisfies Prisma.UsuarioInclude;

type UsuarioConAsignaciones = Prisma.UsuarioGetPayload<{ include: typeof INCLUDE_ASIGNACIONES }>;

export interface SesionResponse {
  accessToken: string;
  requiereCambioClave: boolean;
  usuario: { id: number; dni: string; nombre: string; apellido: string };
  asignaciones: AsignacionToken[];
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  /** Login exclusivo por DNI + contraseña. */
  async login({ dni, password }: LoginDto): Promise<SesionResponse> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { dni },
      include: INCLUDE_ASIGNACIONES,
    });
    const ok = await bcrypt.compare(password, usuario?.passwordHash ?? DUMMY_HASH);
    if (!usuario || !ok || !usuario.activo) {
      throw new UnauthorizedException('DNI o contraseña incorrectos');
    }
    return this.emitirSesion(usuario);
  }

  /** Cambio de clave por el propio usuario (obligatorio en el primer ingreso). */
  async cambiarClave(user: AuthUser, dto: CambiarClaveDto): Promise<SesionResponse> {
    const usuario = await this.prisma.usuario.findUnique({ where: { id: user.sub } });
    if (!usuario || !usuario.activo) throw new UnauthorizedException();

    if (!(await bcrypt.compare(dto.claveActual, usuario.passwordHash))) {
      throw new BadRequestException('La clave actual es incorrecta');
    }
    if (dto.claveNueva.trim() === usuario.dni.trim()) {
      throw new BadRequestException('La nueva clave no puede ser igual al DNI');
    }

    const actualizado = await this.prisma.usuario.update({
      where: { id: usuario.id },
      data: {
        passwordHash: await bcrypt.hash(dto.claveNueva, BCRYPT_ROUNDS),
        requiereCambioClave: false,
      },
      include: INCLUDE_ASIGNACIONES,
    });
    return this.emitirSesion(actualizado);
  }

  /**
   * Reset rápido de clave al DNI, realizado por un educador.
   * Respeta el alcance: un educador de UNIDAD solo puede resetear miembros de sus unidades
   * y nunca a usuarios con alguna asignación GLOBAL (evita escalada de privilegios).
   */
  async resetearClave(actor: AuthUser, alcance: AlcanceAcceso, usuarioId: number): Promise<{ mensaje: string }> {
    if (usuarioId === actor.sub) {
      throw new BadRequestException('Para su propia cuenta use el cambio de clave');
    }

    const objetivo = await this.prisma.usuario.findFirst({
      where: { AND: [{ id: usuarioId }, filtroUsuariosPorAlcance(alcance)] },
      include: { asignaciones: { where: { activo: true }, include: { rol: true } } },
    });
    if (!objetivo) throw new NotFoundException('Usuario no encontrado en su alcance');

    if (alcance.tipo !== 'GLOBAL') {
      const esGlobal = objetivo.asignaciones.some(
        (a) => (a.alcanceOverride ?? a.rol.alcancePorDefecto) === AlcanceRol.GLOBAL,
      );
      if (esGlobal) throw new ForbiddenException('No puede resetear la clave de un usuario con alcance global');
    }

    await this.prisma.usuario.update({
      where: { id: objetivo.id },
      data: {
        passwordHash: await bcrypt.hash(objetivo.dni, BCRYPT_ROUNDS),
        requiereCambioClave: true,
      },
    });
    return { mensaje: `La clave de ${objetivo.nombre} ${objetivo.apellido} fue reseteada a su DNI` };
  }

  /** Datos actualizados del usuario autenticado. */
  async perfil(user: AuthUser) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: user.sub },
      include: INCLUDE_ASIGNACIONES,
    });
    if (!usuario || !usuario.activo) throw new UnauthorizedException();
    return this.emitirSesion(usuario);
  }

  private async emitirSesion(usuario: UsuarioConAsignaciones): Promise<SesionResponse> {
    const asignaciones = this.mapearAsignaciones(usuario);
    const payload: JwtPayload = {
      sub: usuario.id,
      dni: usuario.dni,
      requiereCambioClave: usuario.requiereCambioClave,
      asignaciones,
    };
    return {
      accessToken: await this.jwt.signAsync(payload),
      requiereCambioClave: usuario.requiereCambioClave,
      usuario: this.datosPublicos(usuario),
      asignaciones,
    };
  }

  private mapearAsignaciones(usuario: UsuarioConAsignaciones): AsignacionToken[] {
    return usuario.asignaciones
      .filter((a) => a.unidad.activa)
      .map((a) => ({
        unidadId: a.unidadId,
        unidadNombre: a.unidad.nombre,
        rolId: a.rol.id,
        rol: a.rol.nombre,
        tipoMiembro: a.rol.tipoMiembro ?? 'EDUCADOR',
        requiereRama: a.rol.requiereRama ?? true,
        alcance: a.alcanceOverride ?? a.rol.alcancePorDefecto,
        permisos: a.rol.permisos.map((rp) => rp.permiso.clave),
      }));
  }

  private datosPublicos(u: { id: number; dni: string; nombre: string; apellido: string }) {
    return { id: u.id, dni: u.dni, nombre: u.nombre, apellido: u.apellido };
  }
}
