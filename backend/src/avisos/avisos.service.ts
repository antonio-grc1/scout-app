import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  assertUnidadEnAlcance,
  filtroUsuariosPorAlcance,
} from '../common/scope/alcance.util.js';
import type { AlcanceAcceso, AuthUser } from '../common/types/auth.types.js';
import { finDelDiaArgentina } from '../common/utils/fechas.util.js';
import { MailerService } from '../mailer/mailer.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  BandejaQueryDto,
  CrearAvisoDto,
  EnviadosQueryDto,
  SuscripcionPushDto,
} from './avisos.dto.js';
import { WebPushService } from './web-push.service.js';

export type CrearAvisoInput = Omit<CrearAvisoDto, 'enviarPush' | 'enviarEmail'> & {
  enviarPush?: boolean;
  enviarEmail?: boolean;
  campamentoId?: number | null;
};

@Injectable()
export class AvisosService {
  private readonly logger = new Logger(AvisosService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly webPush?: WebPushService,
    @Optional() private readonly mailer?: MailerService,
  ) {}

  private construirFiltroVigente(ahora: Date): Prisma.AvisoWhereInput {
    return {
      OR: [{ fechaExpiracion: null }, { fechaExpiracion: { gte: ahora } }],
    };
  }

  private assertGestionPermitida(alcance: AlcanceAcceso, mensaje: string): void {
    if (alcance.tipo === 'PROPIO') {
      throw new ForbiddenException(mensaje);
    }
  }

  private assertAccesoAvisoEnviado(
    alcance: AlcanceAcceso,
    actorId: number,
    aviso: { creadoPorUsuarioId: number; unidadId: number | null },
  ): void {
    if (alcance.tipo === 'GLOBAL') return;
    if (alcance.tipo === 'UNIDAD') {
      const enUnidad = aviso.unidadId != null && alcance.unidadIds.includes(aviso.unidadId);
      if (aviso.creadoPorUsuarioId === actorId || enUnidad) return;
    }
    throw new ForbiddenException('Este aviso está fuera de su alcance');
  }

  async obtenerEstadoCanales(usuarioId: number) {
    const pushPublico = this.webPush?.obtenerEstadoPublico() ?? {
      habilitado: false,
      publicKey: null,
    };
    const [pushSuscripcionesUsuario, emailHabilitado] = await Promise.all([
      pushPublico.habilitado && this.webPush
        ? this.webPush.contarSuscripcionesUsuario(usuarioId)
        : Promise.resolve(0),
      this.mailer ? this.mailer.estaDisponibleParaEnvio() : Promise.resolve(false),
    ]);
    return {
      pushHabilitado: pushPublico.habilitado,
      pushPublicKey: pushPublico.publicKey,
      pushSuscripcionesUsuario,
      emailHabilitado,
    };
  }

  async suscribirPush(usuarioId: number, dto: SuscripcionPushDto, userAgent?: string) {
    if (!this.webPush || !this.webPush.estaHabilitado()) {
      throw new BadRequestException(
        'Las notificaciones push no están configuradas en el servidor.',
      );
    }
    return this.webPush.suscribir(usuarioId, dto, userAgent);
  }

  async desuscribirPush(usuarioId: number, endpoint: string) {
    if (!this.webPush) {
      return { ok: true, eliminadas: 0 };
    }
    return this.webPush.desuscribir(usuarioId, endpoint);
  }

  async listarBandeja(usuarioId: number, query: BandejaQueryDto) {
    const ahora = new Date();
    const skip = (query.pagina - 1) * query.porPagina;

    const where: Prisma.AvisoDestinatarioWhereInput = {
      usuarioId,
      ...(query.soloNoLeidos ? { leidoAt: null } : {}),
      ...(!query.incluirExpirados ? { aviso: this.construirFiltroVigente(ahora) } : {}),
    };

    const [registros, total, noLeidos] = await Promise.all([
      this.prisma.avisoDestinatario.findMany({
        where,
        orderBy: [{ aviso: { createdAt: 'desc' } }, { avisoId: 'desc' }],
        skip,
        take: query.porPagina,
        include: {
          aviso: {
            include: {
              unidad: { select: { id: true, nombre: true } },
              creadoPor: { select: { id: true, nombre: true, apellido: true } },
            },
          },
        },
      }),
      this.prisma.avisoDestinatario.count({ where }),
      this.prisma.avisoDestinatario.count({
        where: {
          usuarioId,
          leidoAt: null,
          aviso: this.construirFiltroVigente(ahora),
        },
      }),
    ]);

    const items = registros.map((r) => ({
      id: r.aviso.id,
      titulo: r.aviso.titulo,
      mensaje: r.aviso.mensaje,
      prioridad: r.aviso.prioridad,
      destinatarioTipo: r.aviso.destinatarioTipo,
      unidadId: r.aviso.unidadId,
      unidadNombre: r.aviso.unidad?.nombre ?? null,
      creadoPor: r.aviso.creadoPor,
      fechaExpiracion: r.aviso.fechaExpiracion,
      createdAt: r.aviso.createdAt,
      leidoAt: r.leidoAt,
      leido: r.leidoAt !== null,
    }));

    return { items, total, noLeidos };
  }

  async contarNoLeidos(usuarioId: number) {
    const ahora = new Date();
    const count = await this.prisma.avisoDestinatario.count({
      where: {
        usuarioId,
        leidoAt: null,
        aviso: this.construirFiltroVigente(ahora),
      },
    });
    return { count };
  }

  async marcarLeido(usuarioId: number, avisoId: number) {
    const registro = await this.prisma.avisoDestinatario.findUnique({
      where: { avisoId_usuarioId: { avisoId, usuarioId } },
    });
    if (!registro) {
      throw new NotFoundException('Aviso no encontrado en tu bandeja');
    }
    if (registro.leidoAt !== null) {
      return { avisoId, leidoAt: registro.leidoAt };
    }
    const actualizado = await this.prisma.avisoDestinatario.update({
      where: { avisoId_usuarioId: { avisoId, usuarioId } },
      data: { leidoAt: new Date() },
    });
    return { avisoId, leidoAt: actualizado.leidoAt };
  }

  async marcarTodosLeidos(usuarioId: number) {
    const res = await this.prisma.avisoDestinatario.updateMany({
      where: { usuarioId, leidoAt: null },
      data: { leidoAt: new Date() },
    });
    return { actualizados: res.count };
  }

  async listarEnviados(alcance: AlcanceAcceso, actorId: number, query: EnviadosQueryDto) {
    this.assertGestionPermitida(alcance, 'No posee permiso para consultar avisos enviados');

    if (query.unidadId !== undefined) {
      assertUnidadEnAlcance(alcance, query.unidadId);
    }

    const where: Prisma.AvisoWhereInput =
      alcance.tipo === 'GLOBAL'
        ? query.unidadId !== undefined
          ? { unidadId: query.unidadId }
          : {}
        : query.unidadId !== undefined
          ? { unidadId: query.unidadId }
          : {
              OR: [
                { unidadId: { in: (alcance as Extract<AlcanceAcceso, { tipo: 'UNIDAD' }>).unidadIds } },
                { creadoPorUsuarioId: actorId },
              ],
            };

    const skip = (query.pagina - 1) * query.porPagina;
    const [avisos, total] = await Promise.all([
      this.prisma.aviso.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: query.porPagina,
        include: {
          unidad: { select: { id: true, nombre: true } },
          creadoPor: { select: { id: true, nombre: true, apellido: true } },
          _count: { select: { destinatarios: true } },
        },
      }),
      this.prisma.aviso.count({ where }),
    ]);

    const ids = avisos.map((a) => a.id);
    const leidosGroup =
      ids.length > 0 && this.prisma.avisoDestinatario?.groupBy
        ? await this.prisma.avisoDestinatario.groupBy({
            by: ['avisoId'],
            where: { avisoId: { in: ids }, leidoAt: { not: null } },
            _count: { _all: true },
          })
        : [];
    const leidosPorAviso = new Map(leidosGroup.map((g) => [g.avisoId, g._count._all]));

    const items = avisos.map((a) => ({
      id: a.id,
      titulo: a.titulo,
      mensaje: a.mensaje,
      prioridad: a.prioridad,
      destinatarioTipo: a.destinatarioTipo,
      unidadId: a.unidadId,
      unidadNombre: a.unidad?.nombre ?? null,
      creadoPor: a.creadoPor,
      fechaExpiracion: a.fechaExpiracion,
      createdAt: a.createdAt,
      enviarPush: Boolean(a.enviarPush),
      enviarEmail: Boolean(a.enviarEmail),
      pushEnviados: Number(a.pushEnviados ?? 0),
      emailsEnviados: Number(a.emailsEnviados ?? 0),
      totalDestinatarios: a._count.destinatarios,
      totalLeidos: leidosPorAviso.get(a.id) ?? 0,
    }));

    return { items, total };
  }

  async obtenerLecturas(alcance: AlcanceAcceso, actorId: number, avisoId: number) {
    this.assertGestionPermitida(alcance, 'No posee permiso para consultar lecturas de avisos');

    const aviso = await this.prisma.aviso.findUnique({
      where: { id: avisoId },
      include: {
        unidad: { select: { id: true, nombre: true } },
        creadoPor: { select: { id: true, nombre: true, apellido: true } },
        destinatarios: {
          include: {
            usuario: { select: { id: true, nombre: true, apellido: true, dni: true } },
          },
          orderBy: [{ usuario: { apellido: 'asc' } }, { usuario: { nombre: 'asc' } }],
        },
      },
    });

    if (!aviso) {
      throw new NotFoundException('Aviso no encontrado');
    }

    this.assertAccesoAvisoEnviado(alcance, actorId, aviso);

    const total = aviso.destinatarios.length;
    const leidos = aviso.destinatarios.filter((d) => d.leidoAt !== null).length;

    return {
      aviso: {
        id: aviso.id,
        titulo: aviso.titulo,
        mensaje: aviso.mensaje,
        prioridad: aviso.prioridad,
        destinatarioTipo: aviso.destinatarioTipo,
        unidadId: aviso.unidadId,
        unidadNombre: aviso.unidad?.nombre ?? null,
        creadoPor: aviso.creadoPor,
        fechaExpiracion: aviso.fechaExpiracion,
        createdAt: aviso.createdAt,
      },
      resumen: {
        total,
        leidos,
        pendientes: total - leidos,
      },
      destinatarios: aviso.destinatarios.map((d) => ({
        usuarioId: d.usuarioId,
        nombre: d.usuario.nombre,
        apellido: d.usuario.apellido,
        dni: d.usuario.dni,
        leidoAt: d.leidoAt,
        leido: d.leidoAt !== null,
      })),
    };
  }

  async crear(alcance: AlcanceAcceso, actor: AuthUser, dto: CrearAvisoInput) {
    this.assertGestionPermitida(alcance, 'No posee permiso para enviar avisos');

    const ahora = new Date();
    let fechaExpiracion: Date | null = null;
    if (dto.fechaExpiracion) {
      fechaExpiracion = finDelDiaArgentina(dto.fechaExpiracion);
      if (fechaExpiracion < ahora) {
        throw new BadRequestException('La fecha de vencimiento debe ser hoy o posterior');
      }
    }

    const unidadId = dto.unidadId ?? null;
    if (alcance.tipo === 'UNIDAD') {
      if (dto.destinatarioTipo !== 'USUARIOS') {
        if (unidadId === null) {
          throw new ForbiddenException('Solo un perfil global puede enviar avisos a todo el grupo');
        }
        assertUnidadEnAlcance(alcance, unidadId);
      } else if (unidadId !== null) {
        assertUnidadEnAlcance(alcance, unidadId);
      }
    }

    if (unidadId !== null) {
      const unidad = await this.prisma.unidadOrganizativa.findUnique({
        where: { id: unidadId },
        select: { id: true, activa: true },
      });
      if (!unidad || !unidad.activa) {
        throw new BadRequestException('La unidad seleccionada no existe o está inactiva');
      }
    }

    let idsDestinatarios: number[] = [];

    if (dto.destinatarioTipo === 'USUARIOS') {
      const idsUnicos = [...new Set(dto.usuariosIds ?? [])];
      if (idsUnicos.length === 0) {
        throw new BadRequestException('Debés seleccionar al menos una persona destinataria');
      }

      if (alcance.tipo === 'UNIDAD') {
        const enAlcance = await this.prisma.usuario.findMany({
          where: {
            AND: [{ id: { in: idsUnicos }, activo: true }, filtroUsuariosPorAlcance(alcance)],
          },
          select: { id: true },
        });
        if (enAlcance.length !== idsUnicos.length) {
          const permitidosSet = new Set(enAlcance.map((u) => u.id));
          const faltantes = idsUnicos.filter((id) => !permitidosSet.has(id));
          const fueraDeAlcance = await this.prisma.usuario.count({
            where: { id: { in: faltantes }, activo: true },
          });
          if (fueraDeAlcance > 0) {
            throw new ForbiddenException(
              'Uno o más destinatarios seleccionados están fuera de su alcance',
            );
          }
        }
        idsDestinatarios = enAlcance.map((u) => u.id);
      } else {
        const encontrados = await this.prisma.usuario.findMany({
          where: { id: { in: idsUnicos }, activo: true },
          select: { id: true },
        });
        idsDestinatarios = encontrados.map((u) => u.id);
      }
    } else {
      const excepciones = dto.excepcionesIds?.length ? [...new Set(dto.excepcionesIds)] : [];
      const whereUsuarios: Prisma.UsuarioWhereInput = {
        activo: true,
        ...(dto.destinatarioTipo === 'PROTAGONISTAS' ? { tipoMiembro: 'PROTAGONISTA' } : {}),
        ...(dto.destinatarioTipo === 'EDUCADORES' ? { tipoMiembro: 'EDUCADOR' } : {}),
        ...(excepciones.length > 0 ? { id: { notIn: excepciones } } : {}),
        asignaciones: {
          some: {
            activo: true,
            ...(unidadId !== null ? { unidadId } : {}),
          },
        },
      };

      const destinatarios = await this.prisma.usuario.findMany({
        where: whereUsuarios,
        select: { id: true },
      });
      idsDestinatarios = destinatarios.map((u) => u.id);
    }

    if (idsDestinatarios.length === 0) {
      throw new BadRequestException(
        'No se encontraron destinatarios activos para el criterio seleccionado',
      );
    }

    const enviarPush = Boolean(dto.enviarPush);
    const enviarEmail = Boolean(dto.enviarEmail);
    const marcarEmisorLeido = dto.destinatarioTipo !== 'USUARIOS';
    const destinatariosData = idsDestinatarios.map((usuarioId) => ({
      usuarioId,
      leidoAt: marcarEmisorLeido && usuarioId === actor.sub ? ahora : null,
    }));

    const creado = await this.prisma.aviso.create({
      data: {
        titulo: dto.titulo,
        mensaje: dto.mensaje,
        prioridad: dto.prioridad,
        destinatarioTipo: dto.destinatarioTipo,
        unidadId,
        creadoPorUsuarioId: actor.sub,
        fechaExpiracion,
        enviarPush,
        enviarEmail,
        campamentoId: dto.campamentoId ?? null,
        destinatarios: {
          createMany: {
            data: destinatariosData,
            skipDuplicates: true,
          },
        },
      },
      include: {
        unidad: { select: { id: true, nombre: true } },
        creadoPor: { select: { id: true, nombre: true, apellido: true } },
      },
    });

    const totalLeidos = destinatariosData.filter((d) => d.leidoAt !== null).length;

    const destinatariosExternosIds = idsDestinatarios.filter(
      (id) => dto.destinatarioTipo === 'USUARIOS' || id !== actor.sub,
    );
    if ((enviarPush || enviarEmail) && destinatariosExternosIds.length > 0) {
      void this.despacharCanalesExternos({
        avisoId: creado.id,
        titulo: creado.titulo,
        mensaje: creado.mensaje,
        prioridad: creado.prioridad,
        unidadNombre: creado.unidad?.nombre ?? null,
        remitenteNombre: `${creado.creadoPor.nombre} ${creado.creadoPor.apellido}`.trim(),
        enviarPush,
        enviarEmail,
        destinatariosIds: destinatariosExternosIds,
      }).catch((err) => {
        this.logger.warn(
          `Error despachando canales externos para aviso #${creado.id}: ${String((err as Error | undefined)?.message ?? err)}`,
        );
      });
    }

    return {
      id: creado.id,
      titulo: creado.titulo,
      mensaje: creado.mensaje,
      prioridad: creado.prioridad,
      destinatarioTipo: creado.destinatarioTipo,
      unidadId: creado.unidadId,
      unidadNombre: creado.unidad?.nombre ?? null,
      creadoPor: creado.creadoPor,
      fechaExpiracion: creado.fechaExpiracion,
      createdAt: creado.createdAt,
      enviarPush,
      enviarEmail,
      pushEnviados: 0,
      emailsEnviados: 0,
      totalDestinatarios: idsDestinatarios.length,
      totalLeidos,
    };
  }

  async despacharCanalesExternos(params: {
    avisoId: number;
    titulo: string;
    mensaje: string;
    prioridad: 'NORMAL' | 'IMPORTANTE' | 'URGENTE';
    unidadNombre: string | null;
    remitenteNombre: string;
    enviarPush: boolean;
    enviarEmail: boolean;
    destinatariosIds: readonly number[];
  }): Promise<{ pushEnviados: number; emailsEnviados: number }> {
    let pushEnviados = 0;
    let emailsEnviados = 0;

    if (params.enviarPush && this.webPush) {
      const resPush = await this.webPush.enviarAUsuarios(params.destinatariosIds, {
        avisoId: params.avisoId,
        titulo: params.titulo,
        mensaje: params.mensaje,
        prioridad: params.prioridad,
        url: '/avisos',
      });
      pushEnviados = resPush.enviados;
    }

    if (params.enviarEmail && this.mailer) {
      const usuariosConEmail = await this.prisma.usuario.findMany({
        where: {
          id: { in: [...params.destinatariosIds] },
          activo: true,
          emailContacto: { not: null },
        },
        select: { emailContacto: true },
      });
      const resEmail = await this.mailer.enviarAvisoMasivo(
        usuariosConEmail.map((u) => u.emailContacto),
        {
          titulo: params.titulo,
          mensaje: params.mensaje,
          prioridad: params.prioridad,
          unidadNombre: params.unidadNombre,
          remitenteNombre: params.remitenteNombre,
        },
      );
      emailsEnviados = resEmail.enviados;
    }

    if ((pushEnviados > 0 || emailsEnviados > 0) && this.prisma.aviso?.update) {
      await this.prisma.aviso.update({
        where: { id: params.avisoId },
        data: { pushEnviados, emailsEnviados },
      });
    }

    return { pushEnviados, emailsEnviados };
  }

  async eliminar(alcance: AlcanceAcceso, actorId: number, avisoId: number) {
    this.assertGestionPermitida(alcance, 'No posee permiso para eliminar avisos');

    const aviso = await this.prisma.aviso.findUnique({
      where: { id: avisoId },
      select: { id: true, creadoPorUsuarioId: true, unidadId: true },
    });
    if (!aviso) {
      throw new NotFoundException('Aviso no encontrado');
    }

    this.assertAccesoAvisoEnviado(alcance, actorId, aviso);

    await this.prisma.aviso.delete({ where: { id: avisoId } });
    return { eliminado: true, id: avisoId };
  }
}
