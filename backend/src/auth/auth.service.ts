import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AlcanceRol, type Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { assertActorDominaObjetivo, filtroUsuariosPorAlcance } from '../common/scope/alcance.util.js';
import type {
  AlcanceAcceso,
  AsignacionToken,
  AuthUser,
  JwtTokenClaims,
} from '../common/types/auth.types.js';
import { generarClaveTemporal } from '../common/utils/password.util.js';
import { MailerService } from '../mailer/mailer.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CambiarClaveDto, LoginDto, RecuperarClaveDto, ResetearClaveDto } from './auth.dto.js';

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
  usuario: { id: number; dni: string; nombre: string; apellido: string; tipoMiembro?: string };
  asignaciones: AsignacionToken[];
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    @Optional() private readonly mailer?: MailerService,
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

    const claveActual = dto.claveActual ?? '';
    if (!usuario.requiereCambioClave && claveActual.length === 0) {
      throw new BadRequestException('Debe ingresar su contraseña actual');
    }
    if (claveActual.length > 0 && !(await bcrypt.compare(claveActual, usuario.passwordHash))) {
      throw new BadRequestException('La contraseña actual es incorrecta');
    }
    if (await bcrypt.compare(dto.claveNueva, usuario.passwordHash)) {
      throw new BadRequestException('La nueva contraseña debe ser distinta de la actual');
    }
    if (dto.claveNueva.trim() === usuario.dni.trim()) {
      throw new BadRequestException('La nueva contraseña no puede ser igual al DNI');
    }

    const actualizado = await this.prisma.usuario.update({
      where: { id: usuario.id },
      data: {
        passwordHash: await bcrypt.hash(dto.claveNueva, BCRYPT_ROUNDS),
        requiereCambioClave: false,
        tokenVersion: { increment: 1 },
      },
      include: INCLUDE_ASIGNACIONES,
    });
    return this.emitirSesion(actualizado);
  }

  /**
   * Auto-recuperación pública desde el login por DNI.
   * Por seguridad anti-enumeración devuelve siempre el mismo mensaje genérico y solo
   * reemplaza la contraseña si el correo SMTP está operativo y el envío se confirma.
   */
  async recuperarClave(dto: RecuperarClaveDto): Promise<{ mensaje: string }> {
    const mensaje =
      'Si el DNI corresponde a una cuenta activa con correo electrónico registrado, recibirás una nueva contraseña temporal en tu casilla.';

    if (!this.mailer || !(await this.mailer.estaDisponibleParaEnvio())) {
      return { mensaje };
    }

    const usuario = await this.prisma.usuario.findUnique({
      where: { dni: dto.dni },
      select: {
        id: true,
        dni: true,
        nombre: true,
        apellido: true,
        emailContacto: true,
        activo: true,
      },
    });

    const emailDestino = usuario?.emailContacto?.trim();
    if (!usuario || !usuario.activo || !emailDestino) {
      return { mensaje };
    }

    const claveTemporal = generarClaveTemporal();
    const enviado = await this.mailer.enviarNuevaClaveTemporal({
      destinatario: emailDestino,
      nombre: usuario.nombre,
      apellido: usuario.apellido,
      dni: usuario.dni,
      claveTemporal,
    });

    if (enviado) {
      await this.prisma.usuario.update({
        where: { id: usuario.id },
        data: {
          passwordHash: await bcrypt.hash(claveTemporal, BCRYPT_ROUNDS),
          requiereCambioClave: true,
          tokenVersion: { increment: 1 },
        },
      });
    }

    return { mensaje };
  }

  /**
   * Reset rápido de clave a una contraseña temporal aleatoria, realizado por un educador.
   * Respeta el alcance: un educador de UNIDAD solo puede resetear miembros de sus unidades
   * y nunca a usuarios con alguna asignación GLOBAL (evita escalada de privilegios).
   */
  async resetearClave(
    actor: AuthUser,
    alcance: AlcanceAcceso,
    usuarioId: number,
    opciones?: ResetearClaveDto,
  ): Promise<{
    mensaje: string;
    claveTemporal?: string;
    emailEnviado: boolean;
    emailDestino: string | null;
  }> {
    if (usuarioId === actor.sub) {
      throw new BadRequestException('Para su propia cuenta use el cambio de contraseña');
    }

    const objetivo = await this.prisma.usuario.findFirst({
      where: { AND: [{ id: usuarioId }, filtroUsuariosPorAlcance(alcance)] },
      include: {
        asignaciones: {
          where: { activo: true },
          include: { rol: { include: { permisos: { include: { permiso: true } } } } },
        },
      },
    });
    if (!objetivo) throw new NotFoundException('Usuario no encontrado en su alcance');

    if (alcance.tipo !== 'GLOBAL') {
      const esGlobal = objetivo.asignaciones.some(
        (a) => a.rol.alcancePorDefecto === AlcanceRol.GLOBAL,
      );
      if (esGlobal) throw new ForbiddenException('No puede restablecer la contraseña de un usuario con alcance global');

      if (alcance.tipo === 'UNIDAD') {
        const tieneOtrasUnidades = objetivo.asignaciones.some(
          (a) =>
            a.rol.alcancePorDefecto === AlcanceRol.UNIDAD &&
            !alcance.unidadIds.includes(a.unidadId),
        );
        if (tieneOtrasUnidades) {
          throw new ForbiddenException(
            'No puede restablecer la contraseña de un usuario con asignaciones en unidades fuera de su alcance',
          );
        }
      }
    }

    assertActorDominaObjetivo(
      actor,
      objetivo.asignaciones,
      'No puede restablecer la contraseña de un usuario con permisos o alcance superiores a los suyos',
    );

    const claveTemporal = generarClaveTemporal();
    const emailDestino = objetivo.emailContacto?.trim() || null;
    const soloPorCorreo = Boolean(opciones?.soloPorCorreo);

    if (soloPorCorreo) {
      if (!emailDestino) {
        throw new BadRequestException(
          'El miembro no tiene un correo electrónico de contacto registrado para enviar la contraseña.',
        );
      }
      if (!this.mailer || !(await this.mailer.estaDisponibleParaEnvio())) {
        throw new BadRequestException(
          'El envío de correos no está configurado o está deshabilitado. Configuralo en Organización → Correo institucional.',
        );
      }

      const emailEnviado = await this.mailer.enviarNuevaClaveTemporal({
        destinatario: emailDestino,
        nombre: objetivo.nombre,
        apellido: objetivo.apellido,
        dni: objetivo.dni,
        claveTemporal,
      });

      if (!emailEnviado) {
        throw new BadRequestException(
          'No se pudo enviar el correo con la nueva contraseña. Verificá la configuración SMTP.',
        );
      }

      await this.prisma.usuario.update({
        where: { id: objetivo.id },
        data: {
          passwordHash: await bcrypt.hash(claveTemporal, BCRYPT_ROUNDS),
          requiereCambioClave: true,
          tokenVersion: { increment: 1 },
        },
      });

      return {
        mensaje: `Se generó una nueva contraseña temporal y se envió por correo a ${emailDestino}`,
        emailEnviado: true,
        emailDestino,
      };
    }

    await this.prisma.usuario.update({
      where: { id: objetivo.id },
      data: {
        passwordHash: await bcrypt.hash(claveTemporal, BCRYPT_ROUNDS),
        requiereCambioClave: true,
        tokenVersion: { increment: 1 },
      },
    });

    const emailEnviado =
      emailDestino && this.mailer
        ? await this.mailer.enviarNuevaClaveTemporal({
            destinatario: emailDestino,
            nombre: objetivo.nombre,
            apellido: objetivo.apellido,
            dni: objetivo.dni,
            claveTemporal,
          })
        : false;

    return {
      mensaje: `Se generó una nueva contraseña temporal para ${objetivo.nombre} ${objetivo.apellido}`,
      claveTemporal,
      emailEnviado,
      emailDestino,
    };
  }

  /** Revoca el token actual incrementando `tokenVersion` del usuario cuando la cookie es válida. */
  async logout(token: string | null): Promise<void> {
    if (!token) return;
    try {
      const claims = await this.jwt.verifyAsync<JwtTokenClaims>(token);
      if (!claims || typeof claims.sub !== 'number' || !Number.isInteger(claims.sub) || claims.sub <= 0) {
        return;
      }
      if (this.prisma.usuario?.updateMany) {
        await this.prisma.usuario.updateMany({
          where: {
            id: claims.sub,
            ...(typeof claims.tokenVersion === 'number' ? { tokenVersion: claims.tokenVersion } : {}),
          },
          data: { tokenVersion: { increment: 1 } },
        });
      } else if (this.prisma.usuario?.update) {
        await this.prisma.usuario.update({
          where: { id: claims.sub },
          data: { tokenVersion: { increment: 1 } },
        });
      }
    } catch {
      // Token inválido o expirado: la cookie se limpia igualmente sin bloquear el cierre de sesión
    }
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
    const claims: JwtTokenClaims = {
      sub: usuario.id,
      dni: usuario.dni,
      tokenVersion: usuario.tokenVersion ?? 1,
    };
    return {
      accessToken: await this.jwt.signAsync(claims),
      requiereCambioClave: usuario.requiereCambioClave,
      usuario: this.datosPublicos(usuario),
      asignaciones,
    };
  }

  private mapearAsignaciones(usuario: UsuarioConAsignaciones): AsignacionToken[] {
    return usuario.asignaciones
      .filter((a) => a.unidad.activa && a.rol.activo !== false)
      .map((a) => {
        const permisos = a.rol.permisos.map((rp) => rp.permiso.clave);
        const permisosAlcance = Object.fromEntries(
          a.rol.permisos.map((rp) => [
            rp.permiso.clave,
            (rp as { alcance?: AlcanceRol | null }).alcance ?? a.rol.alcancePorDefecto,
          ]),
        ) as Record<string, AlcanceRol>;
        return {
          unidadId: a.unidadId,
          unidadNombre: a.unidad.nombre,
          rolId: a.rol.id,
          rol: a.rol.nombre,
          tipoMiembro:
            (usuario as { tipoMiembro?: string | null }).tipoMiembro ??
            a.rol.tipoMiembro ??
            'EDUCADOR',
          requiereRama: a.rol.requiereRama ?? true,
          tipoUnidad: a.rol.tipoUnidad,
          alcance: a.rol.alcancePorDefecto,
          permisos,
          permisosAlcance,
        };
      });
  }

  private datosPublicos(u: {
    id: number;
    dni: string;
    nombre: string;
    apellido: string;
    tipoMiembro?: string | null;
  }) {
    return {
      id: u.id,
      dni: u.dni,
      nombre: u.nombre,
      apellido: u.apellido,
      ...(u.tipoMiembro ? { tipoMiembro: u.tipoMiembro } : {}),
    };
  }
}
