import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { EstadoCargo, type CargoMiembro, type Prisma } from '@prisma/client';
import { AvisosService } from '../avisos/avisos.service.js';
import {
  assertUnidadEnAlcance,
  filtroUsuariosPorAlcance,
  resolverAlcance,
} from '../common/scope/alcance.util.js';
import type { AlcanceAcceso, AuthUser } from '../common/types/auth.types.js';
import { finDelDiaArgentina, validarFechaCalendarioIso } from '../common/utils/fechas.util.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  aCentavos,
  calcularMontosCargo,
  deCentavos,
  liberarMontoPagadoDeCargoEnTx,
} from '../tesoreria/tesoreria-shared.js';
import type {
  CrearCampamentoDto,
  EditarCampamentoDto,
  GestionarInscripcionDto,
  ListarCampamentosQueryDto,
  ResponderCampamentoDto,
} from './campamentos.dto.js';

export type CrearCampamentoInput = Omit<
  CrearCampamentoDto,
  | 'estado'
  | 'destinatarioTipo'
  | 'costoBase'
  | 'permiteDescuentoHermanos'
  | 'notificarAviso'
  | 'notificarPush'
  | 'notificarEmail'
> & {
  estado?: 'BORRADOR' | 'PUBLICADO';
  destinatarioTipo?: 'TODOS' | 'PROTAGONISTAS' | 'EDUCADORES' | 'USUARIOS';
  costoBase?: number;
  permiteDescuentoHermanos?: boolean;
  notificarAviso?: boolean;
  notificarPush?: boolean;
  notificarEmail?: boolean;
};

@Injectable()
export class CampamentosService {
  private readonly logger = new Logger(CampamentosService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly avisos?: AvisosService,
  ) {}

  private runInTx<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction
      ? this.prisma.$transaction(fn)
      : fn(this.prisma as unknown as Prisma.TransactionClient);
  }

  private assertGestionPermitida(alcance: AlcanceAcceso, mensaje: string): void {
    if (alcance.tipo === 'PROPIO') {
      throw new ForbiddenException(mensaje);
    }
  }

  private normalizarUnidadesIds(
    unidadesIds?: readonly number[],
    unidadId?: number | null,
  ): number[] {
    if (unidadesIds !== undefined) {
      return [...new Set(unidadesIds)];
    }
    if (unidadId != null) {
      return [unidadId];
    }
    return [];
  }

  private mapearUnidadesCampamento(camp: {
    unidadId: number | null;
    unidad?: { id: number; nombre: string } | null;
    unidades?: Array<{ unidadId?: number; unidad?: { id: number; nombre: string } | null }>;
  }): {
    unidades: Array<{ id: number; nombre: string }>;
    unidadesIds: number[];
    unidadNombre: string | null;
  } {
    const desdeRelacion = (camp.unidades ?? [])
      .map((u) => u.unidad)
      .filter((u): u is { id: number; nombre: string } => Boolean(u));
    const unidades =
      desdeRelacion.length > 0 ? desdeRelacion : camp.unidad ? [camp.unidad] : [];
    const unidadesIds =
      unidades.length > 0
        ? unidades.map((u) => u.id)
        : (camp.unidades ?? [])
              .map((u) => u.unidadId)
              .filter((id): id is number => typeof id === 'number').length > 0
          ? (camp.unidades ?? [])
              .map((u) => u.unidadId)
              .filter((id): id is number => typeof id === 'number')
          : camp.unidadId != null
            ? [camp.unidadId]
            : [];
    const unidadNombre =
      unidades.length > 0
        ? unidades.map((u) => u.nombre).join(', ')
        : (camp.unidad?.nombre ?? null);
    return { unidades, unidadesIds, unidadNombre };
  }

  private assertAccesoCampamento(
    alcance: AlcanceAcceso,
    actorId: number,
    camp: {
      unidadId: number | null;
      creadoPorUsuarioId: number;
      unidades?: Array<{ unidadId?: number; unidad?: { id: number } | null }>;
    },
  ): void {
    if (alcance.tipo === 'GLOBAL') return;
    if (alcance.tipo === 'UNIDAD') {
      const ids = new Set<number>([
        ...(camp.unidadId != null ? [camp.unidadId] : []),
        ...(camp.unidades ?? [])
          .map((u) => u.unidadId ?? u.unidad?.id)
          .filter((id): id is number => typeof id === 'number'),
      ]);
      const enUnidad = [...ids].some((id) => alcance.unidadIds.includes(id));
      if (camp.creadoPorUsuarioId === actorId || enUnidad) return;
    }
    throw new ForbiddenException('Este campamento está fuera de su alcance');
  }

  private parsearFechaDate(fechaIso: string): Date {
    const { anio, mes, dia } = validarFechaCalendarioIso(fechaIso);
    return new Date(Date.UTC(anio, mes - 1, dia));
  }

  private parsearFechaLimite(fechaIso?: string | null): Date | null {
    if (!fechaIso) return null;
    return finDelDiaArgentina(fechaIso);
  }

  private formatearFechaCorta(fecha: Date): string {
    const d = fecha.toISOString().slice(0, 10);
    const [y, m, day] = d.split('-');
    return `${day}/${m}/${y}`;
  }

  private async validarYResolverInvitados(
    alcance: AlcanceAcceso,
    params: {
      destinatarioTipo: 'TODOS' | 'PROTAGONISTAS' | 'EDUCADORES' | 'USUARIOS';
      unidadesIds: number[];
      usuariosIds?: number[];
      excepcionesIds?: number[];
    },
  ): Promise<number[]> {
    const { destinatarioTipo, unidadesIds, usuariosIds, excepcionesIds } = params;

    if (alcance.tipo === 'UNIDAD') {
      if (destinatarioTipo !== 'USUARIOS') {
        if (unidadesIds.length === 0) {
          throw new ForbiddenException(
            'Solo un perfil global puede crear campamentos para todo el grupo',
          );
        }
        for (const uid of unidadesIds) {
          assertUnidadEnAlcance(alcance, uid);
        }
      } else {
        for (const uid of unidadesIds) {
          assertUnidadEnAlcance(alcance, uid);
        }
      }
    }

    if (unidadesIds.length > 0) {
      const activas = await this.prisma.unidadOrganizativa.findMany({
        where: { id: { in: unidadesIds }, activa: true },
        select: { id: true },
      });
      if (activas.length !== unidadesIds.length) {
        throw new BadRequestException('Una o más secciones seleccionadas no existen o están inactivas');
      }
    }

    let idsInvitados: number[] = [];
    if (destinatarioTipo === 'USUARIOS') {
      const idsUnicos = [...new Set(usuariosIds ?? [])];
      if (idsUnicos.length === 0) {
        throw new BadRequestException('Debés seleccionar al menos una persona invitada');
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
              'Uno o más miembros seleccionados están fuera de su alcance',
            );
          }
        }
        idsInvitados = enAlcance.map((u) => u.id);
      } else {
        const encontrados = await this.prisma.usuario.findMany({
          where: { id: { in: idsUnicos }, activo: true },
          select: { id: true },
        });
        idsInvitados = encontrados.map((u) => u.id);
      }
    } else {
      const excepciones = excepcionesIds?.length ? [...new Set(excepcionesIds)] : [];
      const whereUsuarios: Prisma.UsuarioWhereInput = {
        activo: true,
        ...(destinatarioTipo === 'PROTAGONISTAS' ? { tipoMiembro: 'PROTAGONISTA' } : {}),
        ...(destinatarioTipo === 'EDUCADORES' ? { tipoMiembro: 'EDUCADOR' } : {}),
        ...(excepciones.length > 0 ? { id: { notIn: excepciones } } : {}),
        asignaciones: {
          some: {
            activo: true,
            ...(unidadesIds.length > 0 ? { unidadId: { in: unidadesIds } } : {}),
          },
        },
      };
      const encontrados = await this.prisma.usuario.findMany({
        where: whereUsuarios,
        select: { id: true },
      });
      idsInvitados = encontrados.map((u) => u.id);
    }

    if (idsInvitados.length === 0) {
      throw new BadRequestException(
        'No se encontraron miembros activos para el criterio seleccionado',
      );
    }

    return idsInvitados;
  }

  private async notificarCampamentoPublicado(
    actor: AuthUser,
    camp: {
      id: number;
      titulo: string;
      lugar: string;
      fechaInicio: Date;
      fechaFin: Date;
      costoBase: Prisma.Decimal | number | string;
      unidadId: number | null;
    },
    usuariosIds: number[],
    notificarPush: boolean,
    notificarEmail: boolean,
  ) {
    if (!this.avisos || usuariosIds.length === 0) return;
    // El aviso se envía con el permiso y alcance de avisos del usuario, no con el de campamentos.
    const alcanceAvisos = resolverAlcance(actor, 'avisos.editar');
    if (!alcanceAvisos || alcanceAvisos.tipo === 'PROPIO') {
      this.logger.warn(
        `Se omitió el aviso del campamento "${camp.titulo}": el usuario #${actor.sub} no tiene permiso para enviar avisos.`,
      );
      return;
    }
    const costo = Number(camp.costoBase);
    const textoCosto = costo > 0 ? `$${costo.toLocaleString('es-AR')}` : 'Sin costo';
    const mensaje = [
      `Lugar: ${camp.lugar}`,
      `Fechas: ${this.formatearFechaCorta(camp.fechaInicio)} al ${this.formatearFechaCorta(camp.fechaFin)}`,
      `Costo base: ${textoCosto}`,
      '',
      'Ingresá a la sección Campamentos de la app para confirmar tu asistencia.',
    ].join('\n');

    try {
      await this.avisos.crear(alcanceAvisos, actor, {
        titulo: `Campamento: ${camp.titulo}`.slice(0, 150),
        mensaje,
        prioridad: 'IMPORTANTE',
        destinatarioTipo: 'USUARIOS',
        unidadId: camp.unidadId,
        usuariosIds,
        enviarPush: notificarPush,
        enviarEmail: notificarEmail,
        campamentoId: camp.id,
      });
    } catch (err) {
      this.logger.warn(
        `No se pudo enviar aviso del campamento "${camp.titulo}": ${String((err as Error | undefined)?.message ?? err)}`,
      );
    }
  }

  /**
   * Devuelve el cargo vigente de la inscripción o, si el campamento tiene costo, crea uno nuevo
   * y lo vincula. El vínculo solo se aplica si `cargoId` sigue igual al leído: si dos
   * confirmaciones llegan a la vez, la segunda falla y su transacción descarta el cargo duplicado.
   */
  private async asegurarCargoDeConfirmacionEnTx(
    tx: Prisma.TransactionClient,
    inscripcion: {
      id: number;
      usuarioId: number;
      cargoId: number | null;
      cargo: CargoMiembro | null;
    },
    camp: {
      costoBase: Prisma.Decimal | number | string;
      conceptoCuotaId: number | null;
      permiteDescuentoHermanos: boolean;
      porcentajeDescuentoHermanos: Prisma.Decimal | number | null;
    },
  ) {
    if (inscripcion.cargo && inscripcion.cargo.estado !== EstadoCargo.ANULADO) {
      return inscripcion.cargo;
    }
    if (!(Number(camp.costoBase) > 0) || !camp.conceptoCuotaId) {
      return null;
    }

    const usuario = await tx.usuario.findUnique({
      where: { id: inscripcion.usuarioId },
      select: { grupoFamiliar: { select: { porcentajeDescuentoHermanos: true } } },
    });
    const { montoOriginal, montoDescuento, montoFinal } = calcularMontosCargo(
      camp.costoBase,
      camp.permiteDescuentoHermanos,
      camp.porcentajeDescuentoHermanos,
      usuario?.grupoFamiliar,
    );
    const creado = await tx.cargoMiembro.create({
      data: {
        usuarioId: inscripcion.usuarioId,
        conceptoId: camp.conceptoCuotaId,
        montoOriginal,
        montoDescuento,
        montoFinal,
        montoPagado: 0,
        estado: Number(montoFinal) > 0 ? EstadoCargo.PENDIENTE : EstadoCargo.PAGADO,
      },
    });

    const vinculo = await tx.campamentoInscripcion.updateMany({
      where: { id: inscripcion.id, cargoId: inscripcion.cargoId },
      data: { cargoId: creado.id },
    });
    if (vinculo.count !== 1) {
      throw new ConflictException(
        'La asistencia ya se estaba registrando en otra solicitud. Actualizá la página.',
      );
    }
    return creado;
  }

  async listarMios(usuarioId: number) {
    const ahora = new Date();
    const [inscripciones, usuario] = await Promise.all([
      this.prisma.campamentoInscripcion.findMany({
        where: {
          usuarioId,
          campamento: { estado: { not: 'BORRADOR' } },
        },
        orderBy: [{ campamento: { fechaInicio: 'desc' } }, { id: 'desc' }],
        include: {
          campamento: {
            include: {
              unidad: { select: { id: true, nombre: true } },
              unidades: { include: { unidad: { select: { id: true, nombre: true } } } },
              creadoPor: { select: { id: true, nombre: true, apellido: true } },
            },
          },
          cargo: {
            select: {
              id: true,
              montoOriginal: true,
              montoDescuento: true,
              montoFinal: true,
              montoPagado: true,
              estado: true,
            },
          },
        },
      }),
      this.prisma.usuario.findUnique({
        where: { id: usuarioId },
        select: {
          id: true,
          grupoFamiliar: { select: { porcentajeDescuentoHermanos: true } },
        },
      }),
    ]);

    const ciclos = [...new Set(inscripciones.map((i) => i.campamento.cicloAnio))];
    const entregas =
      ciclos.length > 0
        ? await this.prisma.entregaFormulario.findMany({
            where: { usuarioId, cicloAnio: { in: ciclos } },
            select: { cicloAnio: true, estado: true },
          })
        : [];

    const estadoFichaPorCiclo = new Map<number, string>();
    for (const ent of entregas) {
      const actual = estadoFichaPorCiclo.get(ent.cicloAnio);
      if (actual === 'VALIDADO_FISICAMENTE') continue;
      if (ent.estado === 'VALIDADO_FISICAMENTE' || !actual) {
        estadoFichaPorCiclo.set(ent.cicloAnio, ent.estado);
      }
    }

    return inscripciones.map((ins) => {
      const camp = ins.campamento;
      const { unidades, unidadesIds, unidadNombre } = this.mapearUnidadesCampamento(camp);
      const cargoActivo = ins.cargo && ins.cargo.estado !== EstadoCargo.ANULADO ? ins.cargo : null;
      const montoEstimado = cargoActivo
        ? {
            montoOriginal: Number(cargoActivo.montoOriginal),
            montoDescuento: Number(cargoActivo.montoDescuento),
            montoFinal: Number(cargoActivo.montoFinal),
          }
        : calcularMontosCargo(
            camp.costoBase,
            camp.permiteDescuentoHermanos,
            camp.porcentajeDescuentoHermanos,
            usuario?.grupoFamiliar,
          );

      const estadoFicha = estadoFichaPorCiclo.get(camp.cicloAnio) ?? 'SIN_FICHA';
      const fichaValidada = estadoFicha === 'VALIDADO_FISICAMENTE';
      const limiteVencido = Boolean(
        camp.fechaLimiteConfirmacion && camp.fechaLimiteConfirmacion < ahora,
      );
      const montoPagado = Number(cargoActivo?.montoPagado ?? 0);
      const bajaPorEducador = ins.estado === 'CANCELADO';

      return {
        inscripcionId: ins.id,
        estadoInscripcion: ins.estado,
        observaciones: ins.observaciones,
        confirmadoAt: ins.confirmadoAt,
        fichaValidada,
        estadoFicha,
        limiteVencido,
        puedeConfirmar: camp.estado === 'PUBLICADO' && !limiteVencido && !bajaPorEducador,
        puedeCancelar:
          camp.estado === 'PUBLICADO' && !limiteVencido && !bajaPorEducador && montoPagado === 0,
        montoEstimado,
        cargo: cargoActivo
          ? {
              id: cargoActivo.id,
              montoOriginal: Number(cargoActivo.montoOriginal),
              montoDescuento: Number(cargoActivo.montoDescuento),
              montoFinal: Number(cargoActivo.montoFinal),
              montoPagado,
              estado: cargoActivo.estado,
            }
          : null,
        campamento: {
          id: camp.id,
          titulo: camp.titulo,
          descripcion: camp.descripcion,
          lugar: camp.lugar,
          fechaInicio: camp.fechaInicio,
          fechaFin: camp.fechaFin,
          fechaLimiteConfirmacion: camp.fechaLimiteConfirmacion,
          estado: camp.estado,
          cicloAnio: camp.cicloAnio,
          costoBase: Number(camp.costoBase),
          permiteDescuentoHermanos: camp.permiteDescuentoHermanos,
          porcentajeDescuentoHermanos:
            camp.porcentajeDescuentoHermanos !== null
              ? Number(camp.porcentajeDescuentoHermanos)
              : null,
          unidadId: camp.unidadId,
          unidadNombre,
          unidades,
          unidadesIds,
          creadoPor: camp.creadoPor,
        },
      };
    });
  }

  async responder(usuarioId: number, campamentoId: number, dto: ResponderCampamentoDto) {
    const ahora = new Date();

    return this.runInTx(async (tx) => {
      const inscripcion = await tx.campamentoInscripcion.findUnique({
        where: { campamentoId_usuarioId: { campamentoId, usuarioId } },
        include: {
          campamento: true,
          cargo: true,
        },
      });

      if (!inscripcion || inscripcion.campamento.estado === 'BORRADOR') {
        throw new NotFoundException('No estás invitado a este campamento o no está disponible.');
      }

      const camp = inscripcion.campamento;
      if (camp.estado !== 'PUBLICADO') {
        throw new BadRequestException('Este campamento ya no acepta cambios de asistencia.');
      }
      if (inscripcion.estado === 'CANCELADO') {
        throw new ForbiddenException(
          'Tu educador registró tu baja en este campamento. Hablá con tu educador si querés volver a anotarte.',
        );
      }
      if (camp.fechaLimiteConfirmacion && camp.fechaLimiteConfirmacion < ahora) {
        throw new BadRequestException(
          'El plazo para confirmar o cancelar asistencia a este campamento ya venció.',
        );
      }

      const entregaValidada = await tx.entregaFormulario.findFirst({
        where: { usuarioId, cicloAnio: camp.cicloAnio, estado: 'VALIDADO_FISICAMENTE' },
        select: { id: true },
      });
      const fichaValidada = Boolean(entregaValidada);

      if (dto.accion === 'CONFIRMAR') {
        const cargoResultado = await this.asegurarCargoDeConfirmacionEnTx(tx, inscripcion, camp);

        const act = await tx.campamentoInscripcion.update({
          where: { id: inscripcion.id },
          data: {
            estado: 'CONFIRMADO',
            confirmadoAt: ahora,
            confirmadoPorUsuarioId: usuarioId,
            cargoId: cargoResultado?.id ?? null,
            ...(dto.observaciones !== undefined ? { observaciones: dto.observaciones } : {}),
          },
        });

        return {
          inscripcionId: act.id,
          estado: act.estado,
          confirmadoAt: act.confirmadoAt,
          fichaValidada,
          cargo: cargoResultado
            ? {
                id: cargoResultado.id,
                montoFinal: Number(cargoResultado.montoFinal),
                montoPagado: Number(cargoResultado.montoPagado),
                estado: cargoResultado.estado,
              }
            : null,
        };
      }

      if (inscripcion.cargo && inscripcion.cargo.estado !== EstadoCargo.ANULADO) {
        if (Number(inscripcion.cargo.montoPagado) > 0) {
          throw new BadRequestException(
            'Ya registrás pagos para este campamento. Pedile a tu educador o tesorería que gestione la baja.',
          );
        }
        await tx.cargoMiembro.update({
          where: { id: inscripcion.cargo.id },
          data: { estado: EstadoCargo.ANULADO },
        });
      }

      const act = await tx.campamentoInscripcion.update({
        where: { id: inscripcion.id },
        data: {
          estado: 'NO_ASISTE',
          cargoId: null,
          ...(dto.observaciones !== undefined ? { observaciones: dto.observaciones } : {}),
        },
      });

      return {
        inscripcionId: act.id,
        estado: act.estado,
        confirmadoAt: act.confirmadoAt,
        fichaValidada,
        cargo: null,
      };
    });
  }

  async listarGestion(
    alcance: AlcanceAcceso,
    actorId: number,
    query: ListarCampamentosQueryDto,
  ) {
    this.assertGestionPermitida(alcance, 'No posee permiso para gestionar campamentos');

    if (query.unidadId !== undefined) {
      assertUnidadEnAlcance(alcance, query.unidadId);
    }

    const filtroPorUnidades = (ids: number[]): Prisma.CampamentoWhereInput => ({
      OR: [
        { unidadId: { in: ids } },
        { unidades: { some: { unidadId: { in: ids } } } },
      ],
    });

    const where: Prisma.CampamentoWhereInput = {
      ...(query.cicloAnio !== undefined ? { cicloAnio: query.cicloAnio } : {}),
      ...(query.estado !== undefined ? { estado: query.estado } : {}),
      ...(alcance.tipo === 'GLOBAL'
        ? query.unidadId !== undefined
          ? filtroPorUnidades([query.unidadId])
          : {}
        : query.unidadId !== undefined
          ? filtroPorUnidades([query.unidadId])
          : {
              OR: [
                filtroPorUnidades((alcance as Extract<AlcanceAcceso, { tipo: 'UNIDAD' }>).unidadIds),
                { creadoPorUsuarioId: actorId },
              ],
            }),
    };

    const campamentos = await this.prisma.campamento.findMany({
      where,
      orderBy: [{ fechaInicio: 'desc' }, { id: 'desc' }],
      include: {
        unidad: { select: { id: true, nombre: true } },
        unidades: { include: { unidad: { select: { id: true, nombre: true } } } },
        rubro: { select: { id: true, nombre: true } },
        creadoPor: { select: { id: true, nombre: true, apellido: true } },
        inscripciones: {
          select: {
            estado: true,
            usuario: { select: { id: true, nombre: true, apellido: true, dni: true } },
            cargo: { select: { montoFinal: true, montoPagado: true, estado: true } },
          },
        },
      },
    });

    return campamentos.map((c) => {
      const { unidades, unidadesIds, unidadNombre } = this.mapearUnidadesCampamento(c);
      let confirmados = 0;
      let pendientes = 0;
      let noAsisten = 0;
      let cancelados = 0;
      let facturadoCts = 0;
      let recaudadoCts = 0;

      for (const ins of c.inscripciones) {
        if (ins.estado === 'CONFIRMADO') confirmados += 1;
        else if (ins.estado === 'PENDIENTE') pendientes += 1;
        else if (ins.estado === 'NO_ASISTE') noAsisten += 1;
        else if (ins.estado === 'CANCELADO') cancelados += 1;

        if (ins.cargo && ins.cargo.estado !== EstadoCargo.ANULADO) {
          facturadoCts += aCentavos(ins.cargo.montoFinal);
          recaudadoCts += aCentavos(ins.cargo.montoPagado);
        }
      }

      const usuariosInvitados =
        c.destinatarioTipo === 'USUARIOS'
          ? c.inscripciones
              .map((i) => i.usuario)
              .filter((u): u is { id: number; nombre: string; apellido: string; dni: string } =>
                Boolean(u),
              )
          : undefined;

      return {
        id: c.id,
        titulo: c.titulo,
        descripcion: c.descripcion,
        lugar: c.lugar,
        fechaInicio: c.fechaInicio,
        fechaFin: c.fechaFin,
        fechaLimiteConfirmacion: c.fechaLimiteConfirmacion,
        estado: c.estado,
        destinatarioTipo: c.destinatarioTipo,
        unidadId: c.unidadId,
        unidadNombre,
        unidades,
        unidadesIds,
        usuariosInvitados,
        cicloAnio: c.cicloAnio,
        costoBase: Number(c.costoBase),
        permiteDescuentoHermanos: c.permiteDescuentoHermanos,
        porcentajeDescuentoHermanos:
          c.porcentajeDescuentoHermanos !== null ? Number(c.porcentajeDescuentoHermanos) : null,
        rubroId: c.rubroId,
        rubroNombre: c.rubro?.nombre ?? null,
        creadoPor: c.creadoPor,
        createdAt: c.createdAt,
        resumen: {
          totalInvitados: c.inscripciones.length,
          confirmados,
          pendientes,
          noAsisten,
          cancelados,
          totalFacturado: deCentavos(facturadoCts),
          totalRecaudado: deCentavos(recaudadoCts),
        },
      };
    });
  }

  async obtenerDetalle(alcance: AlcanceAcceso, actorId: number, campamentoId: number) {
    this.assertGestionPermitida(alcance, 'No posee permiso para consultar el detalle del campamento');

    const camp = await this.prisma.campamento.findUnique({
      where: { id: campamentoId },
      include: {
        unidad: { select: { id: true, nombre: true } },
        unidades: { include: { unidad: { select: { id: true, nombre: true } } } },
        rubro: { select: { id: true, nombre: true } },
        creadoPor: { select: { id: true, nombre: true, apellido: true } },
        inscripciones: {
          include: {
            usuario: {
              select: {
                id: true,
                nombre: true,
                apellido: true,
                dni: true,
                tipoMiembro: true,
                asignaciones: {
                  where: { activo: true },
                  select: { unidad: { select: { id: true, nombre: true } } },
                },
              },
            },
            cargo: {
              select: {
                id: true,
                montoOriginal: true,
                montoDescuento: true,
                montoFinal: true,
                montoPagado: true,
                estado: true,
              },
            },
          },
          orderBy: [{ usuario: { apellido: 'asc' } }, { usuario: { nombre: 'asc' } }],
        },
      },
    });

    if (!camp) {
      throw new NotFoundException('Campamento no encontrado');
    }

    this.assertAccesoCampamento(alcance, actorId, camp);

    const { unidades, unidadesIds, unidadNombre } = this.mapearUnidadesCampamento(camp);

    const usuarioIds = camp.inscripciones.map((i) => i.usuarioId);
    const entregas =
      usuarioIds.length > 0
        ? await this.prisma.entregaFormulario.findMany({
            where: { usuarioId: { in: usuarioIds }, cicloAnio: camp.cicloAnio },
            select: { usuarioId: true, estado: true },
          })
        : [];
    const fichaPorUsuario = new Map<number, string>();
    for (const ent of entregas) {
      const actual = fichaPorUsuario.get(ent.usuarioId);
      if (actual === 'VALIDADO_FISICAMENTE') continue;
      if (ent.estado === 'VALIDADO_FISICAMENTE' || !actual) {
        fichaPorUsuario.set(ent.usuarioId, ent.estado);
      }
    }

    let confirmados = 0;
    let pendientes = 0;
    let noAsisten = 0;
    let cancelados = 0;
    let facturadoCts = 0;
    let recaudadoCts = 0;

    const inscripciones = camp.inscripciones.map((ins) => {
      if (ins.estado === 'CONFIRMADO') confirmados += 1;
      else if (ins.estado === 'PENDIENTE') pendientes += 1;
      else if (ins.estado === 'NO_ASISTE') noAsisten += 1;
      else if (ins.estado === 'CANCELADO') cancelados += 1;

      const cargoActivo = ins.cargo && ins.cargo.estado !== EstadoCargo.ANULADO ? ins.cargo : null;
      if (cargoActivo) {
        facturadoCts += aCentavos(cargoActivo.montoFinal);
        recaudadoCts += aCentavos(cargoActivo.montoPagado);
      }

      const estadoFicha = fichaPorUsuario.get(ins.usuarioId) ?? 'SIN_FICHA';
      return {
        id: ins.id,
        usuarioId: ins.usuarioId,
        estado: ins.estado,
        observaciones: ins.observaciones,
        confirmadoAt: ins.confirmadoAt,
        fichaValidada: estadoFicha === 'VALIDADO_FISICAMENTE',
        estadoFicha,
        usuario: {
          id: ins.usuario.id,
          nombre: ins.usuario.nombre,
          apellido: ins.usuario.apellido,
          dni: ins.usuario.dni,
          tipoMiembro: ins.usuario.tipoMiembro,
          unidadNombre: ins.usuario.asignaciones[0]?.unidad?.nombre ?? null,
        },
        cargo: cargoActivo
          ? {
              id: cargoActivo.id,
              montoOriginal: Number(cargoActivo.montoOriginal),
              montoDescuento: Number(cargoActivo.montoDescuento),
              montoFinal: Number(cargoActivo.montoFinal),
              montoPagado: Number(cargoActivo.montoPagado),
              estado: cargoActivo.estado,
            }
          : null,
      };
    });

    return {
      campamento: {
        id: camp.id,
        titulo: camp.titulo,
        descripcion: camp.descripcion,
        lugar: camp.lugar,
        fechaInicio: camp.fechaInicio,
        fechaFin: camp.fechaFin,
        fechaLimiteConfirmacion: camp.fechaLimiteConfirmacion,
        estado: camp.estado,
        destinatarioTipo: camp.destinatarioTipo,
        unidadId: camp.unidadId,
        unidadNombre,
        unidades,
        unidadesIds,
        cicloAnio: camp.cicloAnio,
        costoBase: Number(camp.costoBase),
        permiteDescuentoHermanos: camp.permiteDescuentoHermanos,
        porcentajeDescuentoHermanos:
          camp.porcentajeDescuentoHermanos !== null
            ? Number(camp.porcentajeDescuentoHermanos)
            : null,
        rubroId: camp.rubroId,
        rubroNombre: camp.rubro?.nombre ?? null,
        creadoPor: camp.creadoPor,
      },
      resumen: {
        totalInvitados: inscripciones.length,
        confirmados,
        pendientes,
        noAsisten,
        cancelados,
        totalFacturado: deCentavos(facturadoCts),
        totalRecaudado: deCentavos(recaudadoCts),
      },
      inscripciones,
    };
  }

  async crear(alcance: AlcanceAcceso, actor: AuthUser, dto: CrearCampamentoInput) {
    this.assertGestionPermitida(alcance, 'No posee permiso para crear campamentos');

    const fechaInicio = this.parsearFechaDate(dto.fechaInicio);
    const fechaFin = this.parsearFechaDate(dto.fechaFin);
    if (fechaFin < fechaInicio) {
      throw new BadRequestException('La fecha de fin debe ser igual o posterior al inicio');
    }
    const fechaLimite = this.parsearFechaLimite(dto.fechaLimiteConfirmacion);

    const destinatarioTipo = dto.destinatarioTipo ?? 'PROTAGONISTAS';
    const unidadesIds = this.normalizarUnidadesIds(dto.unidadesIds, dto.unidadId);
    const unidadPrincipalId = unidadesIds.length === 1 ? unidadesIds[0] : null;

    const idsInvitados = await this.validarYResolverInvitados(alcance, {
      destinatarioTipo,
      unidadesIds,
      usuariosIds: dto.usuariosIds,
      excepcionesIds: dto.excepcionesIds,
    });

    const cicloAnio = dto.cicloAnio ?? fechaInicio.getUTCFullYear();
    const costoBase = Number(dto.costoBase ?? 0);
    const permiteDescuentoHermanos = dto.permiteDescuentoHermanos ?? true;
    const porcentajeDescuentoHermanos =
      permiteDescuentoHermanos && dto.porcentajeDescuentoHermanos != null
        ? dto.porcentajeDescuentoHermanos
        : null;
    const estado = dto.estado ?? 'PUBLICADO';

    const creado = await this.runInTx(async (tx) => {
      let conceptoCuotaId: number | null = null;
      if (costoBase > 0) {
        const concepto = await tx.conceptoCuota.create({
          data: {
            nombre: `Campamento: ${dto.titulo}`.slice(0, 120),
            tipo: 'CAMPAMENTO',
            montoBase: costoBase,
            cicloAnio,
            fechaVencimiento: fechaLimite ?? fechaInicio,
            permiteDescuentoHermanos,
            porcentajeDescuentoHermanos,
            esParaEducadores: destinatarioTipo === 'EDUCADORES',
            destinatarioTipo: 'POR_CONFIRMACION',
            unidadId: unidadPrincipalId,
            rubroId: dto.rubroId ?? null,
          },
          select: { id: true },
        });
        conceptoCuotaId = concepto.id;
      }

      return tx.campamento.create({
        data: {
          titulo: dto.titulo,
          descripcion: dto.descripcion ?? null,
          lugar: dto.lugar,
          fechaInicio,
          fechaFin,
          fechaLimiteConfirmacion: fechaLimite,
          estado,
          destinatarioTipo,
          unidadId: unidadPrincipalId,
          cicloAnio,
          costoBase,
          permiteDescuentoHermanos,
          porcentajeDescuentoHermanos,
          rubroId: dto.rubroId ?? null,
          conceptoCuotaId,
          creadoPorUsuarioId: actor.sub,
          ...(unidadesIds.length > 0
            ? {
                unidades: {
                  createMany: {
                    data: unidadesIds.map((unidadId) => ({ unidadId })),
                    skipDuplicates: true,
                  },
                },
              }
            : {}),
          inscripciones: {
            createMany: {
              data: idsInvitados.map((usuarioId) => ({
                usuarioId,
                estado: 'PENDIENTE',
              })),
              skipDuplicates: true,
            },
          },
        },
        include: {
          unidad: { select: { id: true, nombre: true } },
          creadoPor: { select: { id: true, nombre: true, apellido: true } },
        },
      });
    });

    if (dto.notificarAviso && estado === 'PUBLICADO') {
      await this.notificarCampamentoPublicado(
        actor,
        creado,
        idsInvitados,
        dto.notificarPush ?? true,
        dto.notificarEmail ?? false,
      );
    }

    return {
      id: creado.id,
      titulo: creado.titulo,
      estado: creado.estado,
      totalInvitados: idsInvitados.length,
    };
  }

  async editar(
    alcance: AlcanceAcceso,
    actor: AuthUser,
    campamentoId: number,
    dto: EditarCampamentoDto,
  ) {
    this.assertGestionPermitida(alcance, 'No posee permiso para editar campamentos');

    const actual = await this.prisma.campamento.findUnique({
      where: { id: campamentoId },
      include: {
        unidades: { select: { unidadId: true } },
        inscripciones: {
          select: {
            id: true,
            usuarioId: true,
            estado: true,
            cargoId: true,
            cargo: { select: { id: true, montoPagado: true, estado: true } },
          },
        },
      },
    });
    if (!actual) {
      throw new NotFoundException('Campamento no encontrado');
    }

    this.assertAccesoCampamento(alcance, actor.sub, actual);

    if (actual.estado === 'CANCELADO' && dto.estado !== undefined && dto.estado !== 'CANCELADO') {
      throw new ConflictException(
        'Un campamento cancelado no se puede reactivar porque sus deudas ya fueron anuladas. Creá un campamento nuevo.',
      );
    }
    const pasaACancelado = dto.estado === 'CANCELADO' && actual.estado !== 'CANCELADO';

    const nuevaFechaInicio = dto.fechaInicio
      ? this.parsearFechaDate(dto.fechaInicio)
      : actual.fechaInicio;
    const nuevaFechaFin = dto.fechaFin ? this.parsearFechaDate(dto.fechaFin) : actual.fechaFin;
    if (nuevaFechaFin < nuevaFechaInicio) {
      throw new BadRequestException('La fecha de fin debe ser igual o posterior al inicio');
    }

    const nuevaFechaLimite =
      dto.fechaLimiteConfirmacion !== undefined
        ? this.parsearFechaLimite(dto.fechaLimiteConfirmacion)
        : actual.fechaLimiteConfirmacion;

    const nuevoDestTipo = dto.destinatarioTipo ?? actual.destinatarioTipo;
    const unidadesActuales =
      actual.unidades.length > 0
        ? actual.unidades.map((u) => u.unidadId)
        : actual.unidadId != null
          ? [actual.unidadId]
          : [];
    const nuevasUnidadesIds =
      dto.unidadesIds !== undefined || dto.unidadId !== undefined
        ? this.normalizarUnidadesIds(dto.unidadesIds, dto.unidadId)
        : unidadesActuales;

    // El formulario reenvía siempre los destinatarios: solo se re-sincronizan invitados
    // si difieren de lo guardado, para no borrar inscripciones al editar otros campos.
    const mismosIds = (a: readonly number[], b: readonly number[]) => {
      const sa = new Set(a);
      const sb = new Set(b);
      return sa.size === sb.size && [...sa].every((id) => sb.has(id));
    };
    const cambiaDestinatarios =
      nuevoDestTipo !== actual.destinatarioTipo ||
      !mismosIds(nuevasUnidadesIds, unidadesActuales) ||
      (dto.usuariosIds !== undefined &&
        !mismosIds(
          dto.usuariosIds,
          actual.inscripciones.map((i) => i.usuarioId),
        )) ||
      (dto.excepcionesIds?.length ?? 0) > 0;
    const nuevaUnidadPrincipalId =
      nuevasUnidadesIds.length === 1 ? nuevasUnidadesIds[0] : null;

    let nuevosInvitadosIds: number[] = actual.inscripciones.map((i) => i.usuarioId);
    if (cambiaDestinatarios) {
      const usuariosIdsEntrada =
        dto.usuariosIds !== undefined
          ? dto.usuariosIds
          : nuevoDestTipo === 'USUARIOS'
            ? actual.inscripciones.map((i) => i.usuarioId)
            : undefined;

      nuevosInvitadosIds = await this.validarYResolverInvitados(alcance, {
        destinatarioTipo: nuevoDestTipo,
        unidadesIds: nuevasUnidadesIds,
        usuariosIds: usuariosIdsEntrada,
        excepcionesIds: dto.excepcionesIds,
      });

      const nuevosSet = new Set(nuevosInvitadosIds);
      const aQuitar = actual.inscripciones.filter((i) => !nuevosSet.has(i.usuarioId));
      const conPagos = aQuitar.some(
        (i) => i.cargo && i.cargo.estado !== EstadoCargo.ANULADO && Number(i.cargo.montoPagado) > 0,
      );
      if (conPagos) {
        throw new ConflictException(
          'Hay miembros confirmados con pagos registrados en las ramas o personas que intentás quitar. Dalos de baja primero desde "Asistentes" para pasar sus pagos a Saldo a favor.',
        );
      }
    }

    const nuevoCostoBase =
      dto.costoBase !== undefined ? dto.costoBase : Number(actual.costoBase);
    const nuevoPermiteDto =
      dto.permiteDescuentoHermanos !== undefined
        ? dto.permiteDescuentoHermanos
        : actual.permiteDescuentoHermanos;
    const nuevoPorcentajeDto = !nuevoPermiteDto
      ? null
      : dto.porcentajeDescuentoHermanos !== undefined
        ? dto.porcentajeDescuentoHermanos
        : actual.porcentajeDescuentoHermanos !== null
          ? Number(actual.porcentajeDescuentoHermanos)
          : null;
    const nuevoRubroId = dto.rubroId !== undefined ? dto.rubroId : actual.rubroId;
    const nuevoTitulo = dto.titulo ?? actual.titulo;

    const actualizado = await this.runInTx(async (tx) => {
      let conceptoCuotaId = actual.conceptoCuotaId;

      if (nuevoCostoBase > 0) {
        if (conceptoCuotaId) {
          await tx.conceptoCuota.update({
            where: { id: conceptoCuotaId },
            data: {
              nombre: `Campamento: ${nuevoTitulo}`.slice(0, 120),
              montoBase: nuevoCostoBase,
              fechaVencimiento: nuevaFechaLimite ?? nuevaFechaInicio,
              permiteDescuentoHermanos: nuevoPermiteDto,
              porcentajeDescuentoHermanos: nuevoPorcentajeDto,
              esParaEducadores: nuevoDestTipo === 'EDUCADORES',
              unidadId: nuevaUnidadPrincipalId,
              rubroId: nuevoRubroId,
            },
          });
        } else {
          const concepto = await tx.conceptoCuota.create({
            data: {
              nombre: `Campamento: ${nuevoTitulo}`.slice(0, 120),
              tipo: 'CAMPAMENTO',
              montoBase: nuevoCostoBase,
              cicloAnio: actual.cicloAnio,
              fechaVencimiento: nuevaFechaLimite ?? nuevaFechaInicio,
              permiteDescuentoHermanos: nuevoPermiteDto,
              porcentajeDescuentoHermanos: nuevoPorcentajeDto,
              esParaEducadores: nuevoDestTipo === 'EDUCADORES',
              destinatarioTipo: 'POR_CONFIRMACION',
              unidadId: nuevaUnidadPrincipalId,
              rubroId: nuevoRubroId,
            },
            select: { id: true },
          });
          conceptoCuotaId = concepto.id;
        }
      }

      if (cambiaDestinatarios) {
        const existentesIds = new Set(actual.inscripciones.map((i) => i.usuarioId));
        const nuevosSet = new Set(nuevosInvitadosIds);
        const aAgregar = nuevosInvitadosIds.filter((uid) => !existentesIds.has(uid));
        const aQuitar = actual.inscripciones.filter((i) => !nuevosSet.has(i.usuarioId));

        if (aQuitar.length > 0) {
          const cargoIdsAAnular = aQuitar
            .map((i) => (i.cargo && i.cargo.estado !== EstadoCargo.ANULADO ? i.cargo.id : null))
            .filter((id): id is number => id !== null);
          if (cargoIdsAAnular.length > 0 && tx.cargoMiembro?.updateMany) {
            await tx.cargoMiembro.updateMany({
              where: { id: { in: cargoIdsAAnular }, montoPagado: 0 },
              data: { estado: EstadoCargo.ANULADO },
            });
          }
          if (tx.campamentoInscripcion?.deleteMany) {
            await tx.campamentoInscripcion.deleteMany({
              where: { id: { in: aQuitar.map((i) => i.id) } },
            });
          }
        }

        if (aAgregar.length > 0 && tx.campamentoInscripcion?.createMany) {
          await tx.campamentoInscripcion.createMany({
            data: aAgregar.map((usuarioId) => ({
              campamentoId,
              usuarioId,
              estado: 'PENDIENTE',
            })),
            skipDuplicates: true,
          });
        }

        if (tx.campamentoUnidad?.deleteMany) {
          await tx.campamentoUnidad.deleteMany({ where: { campamentoId } });
        }
        if (nuevasUnidadesIds.length > 0 && tx.campamentoUnidad?.createMany) {
          await tx.campamentoUnidad.createMany({
            data: nuevasUnidadesIds.map((unidadId) => ({ campamentoId, unidadId })),
            skipDuplicates: true,
          });
        }
      }

      if (pasaACancelado) {
        // Al cancelar: se anulan las deudas vigentes y lo pagado pasa a Saldo a favor.
        const vigentesIds = new Set(nuevosInvitadosIds);
        for (const ins of actual.inscripciones) {
          if (!vigentesIds.has(ins.usuarioId)) continue;
          if (!ins.cargo || ins.cargo.estado === EstadoCargo.ANULADO) continue;
          const pagado = Number(ins.cargo.montoPagado);
          if (pagado > 0) {
            await liberarMontoPagadoDeCargoEnTx(tx, ins.cargo.id, ins.usuarioId, pagado);
          }
          await tx.cargoMiembro.update({
            where: { id: ins.cargo.id },
            data: { montoPagado: 0, estado: EstadoCargo.ANULADO },
          });
        }
      }

      const cambiosEconomicos =
        dto.costoBase !== undefined ||
        dto.permiteDescuentoHermanos !== undefined ||
        dto.porcentajeDescuentoHermanos !== undefined;

      if (cambiosEconomicos && conceptoCuotaId && tx.cargoMiembro?.findMany) {
        const cargosPendientes = await tx.cargoMiembro.findMany({
          where: {
            conceptoId: conceptoCuotaId,
            // PAGADO sin pagos = cargo de $0 (campamento gratis o 100% de descuento).
            estado: { in: [EstadoCargo.PENDIENTE, EstadoCargo.PAGADO] },
            montoPagado: 0,
          },
          include: {
            usuario: { select: { grupoFamiliar: { select: { porcentajeDescuentoHermanos: true } } } },
          },
        });
        for (const cargo of cargosPendientes) {
          const { montoOriginal, montoDescuento, montoFinal } = calcularMontosCargo(
            nuevoCostoBase,
            nuevoPermiteDto,
            nuevoPorcentajeDto,
            cargo.usuario?.grupoFamiliar,
          );
          await tx.cargoMiembro.update({
            where: { id: cargo.id },
            data: {
              montoOriginal,
              montoDescuento,
              montoFinal,
              estado: Number(montoFinal) > 0 ? EstadoCargo.PENDIENTE : EstadoCargo.PAGADO,
            },
          });
        }
      }

      // Si el campamento pasa de gratis a tener costo, los que ya confirmaron (sin cargo) deben recibirlo.
      if (
        Number(actual.costoBase) <= 0 &&
        nuevoCostoBase > 0 &&
        conceptoCuotaId &&
        !pasaACancelado &&
        actual.estado !== 'CANCELADO'
      ) {
        const vigentesIds = new Set(nuevosInvitadosIds);
        const confirmadosSinCargo = actual.inscripciones.filter(
          (i) => vigentesIds.has(i.usuarioId) && i.estado === 'CONFIRMADO' && !i.cargo,
        );
        if (confirmadosSinCargo.length > 0) {
          const usuarios = await tx.usuario.findMany({
            where: { id: { in: confirmadosSinCargo.map((i) => i.usuarioId) } },
            select: {
              id: true,
              grupoFamiliar: { select: { porcentajeDescuentoHermanos: true } },
            },
          });
          const grupoPorUsuario = new Map(usuarios.map((u) => [u.id, u.grupoFamiliar]));
          for (const ins of confirmadosSinCargo) {
            const { montoOriginal, montoDescuento, montoFinal } = calcularMontosCargo(
              nuevoCostoBase,
              nuevoPermiteDto,
              nuevoPorcentajeDto,
              grupoPorUsuario.get(ins.usuarioId),
            );
            const cargo = await tx.cargoMiembro.create({
              data: {
                usuarioId: ins.usuarioId,
                conceptoId: conceptoCuotaId,
                montoOriginal,
                montoDescuento,
                montoFinal,
                montoPagado: 0,
                estado: Number(montoFinal) > 0 ? EstadoCargo.PENDIENTE : EstadoCargo.PAGADO,
              },
            });
            await tx.campamentoInscripcion.update({
              where: { id: ins.id },
              data: { cargoId: cargo.id },
            });
          }
        }
      }

      return tx.campamento.update({
        where: { id: campamentoId },
        data: {
          titulo: dto.titulo,
          descripcion: dto.descripcion,
          lugar: dto.lugar,
          fechaInicio: dto.fechaInicio ? nuevaFechaInicio : undefined,
          fechaFin: dto.fechaFin ? nuevaFechaFin : undefined,
          fechaLimiteConfirmacion:
            dto.fechaLimiteConfirmacion !== undefined ? nuevaFechaLimite : undefined,
          estado: dto.estado,
          destinatarioTipo: cambiaDestinatarios ? nuevoDestTipo : undefined,
          unidadId: cambiaDestinatarios ? nuevaUnidadPrincipalId : undefined,
          costoBase: dto.costoBase,
          permiteDescuentoHermanos: dto.permiteDescuentoHermanos,
          porcentajeDescuentoHermanos: !nuevoPermiteDto
            ? null
            : dto.porcentajeDescuentoHermanos,
          rubroId: dto.rubroId,
          conceptoCuotaId,
        },
      });
    });

    if (
      actual.estado === 'BORRADOR' &&
      actualizado.estado === 'PUBLICADO' &&
      dto.notificarAviso
    ) {
      await this.notificarCampamentoPublicado(
        actor,
        actualizado,
        nuevosInvitadosIds,
        dto.notificarPush ?? true,
        dto.notificarEmail ?? false,
      );
    }

    return {
      id: actualizado.id,
      titulo: actualizado.titulo,
      estado: actualizado.estado,
      totalInvitados: nuevosInvitadosIds.length,
    };
  }

  async gestionarInscripcion(
    alcance: AlcanceAcceso,
    actor: AuthUser,
    campamentoId: number,
    usuarioId: number,
    dto: GestionarInscripcionDto,
  ) {
    this.assertGestionPermitida(alcance, 'No posee permiso para gestionar inscripciones');

    return this.runInTx(async (tx) => {
      const inscripcion = await tx.campamentoInscripcion.findUnique({
        where: { campamentoId_usuarioId: { campamentoId, usuarioId } },
        include: {
          campamento: {
            include: { unidades: { select: { unidadId: true } } },
          },
          cargo: true,
        },
      });
      if (!inscripcion) {
        throw new NotFoundException('Inscripción de campamento no encontrada');
      }

      const camp = inscripcion.campamento;
      this.assertAccesoCampamento(alcance, actor.sub, camp);

      if (dto.estado === 'CONFIRMADO') {
        const cargo = await this.asegurarCargoDeConfirmacionEnTx(tx, inscripcion, camp);

        const act = await tx.campamentoInscripcion.update({
          where: { id: inscripcion.id },
          data: {
            estado: 'CONFIRMADO',
            confirmadoAt: inscripcion.confirmadoAt ?? new Date(),
            confirmadoPorUsuarioId: actor.sub,
            cargoId: cargo?.id ?? null,
            ...(dto.observaciones !== undefined ? { observaciones: dto.observaciones } : {}),
          },
        });
        return { inscripcion: act, saldoLiberado: 0 };
      }

      let saldoLiberado = 0;
      if (inscripcion.cargo && inscripcion.cargo.estado !== EstadoCargo.ANULADO) {
        const pagado = Number(inscripcion.cargo.montoPagado);
        if (pagado > 0) {
          await liberarMontoPagadoDeCargoEnTx(tx, inscripcion.cargo.id, usuarioId, pagado);
          saldoLiberado = pagado;
        }
        await tx.cargoMiembro.update({
          where: { id: inscripcion.cargo.id },
          data: { montoPagado: 0, estado: EstadoCargo.ANULADO },
        });
      }

      const act = await tx.campamentoInscripcion.update({
        where: { id: inscripcion.id },
        data: {
          estado: dto.estado,
          cargoId: null,
          ...(dto.observaciones !== undefined ? { observaciones: dto.observaciones } : {}),
        },
      });
      return { inscripcion: act, saldoLiberado };
    });
  }

  async eliminar(alcance: AlcanceAcceso, actorId: number, campamentoId: number) {
    this.assertGestionPermitida(alcance, 'No posee permiso para eliminar campamentos');

    const camp = await this.prisma.campamento.findUnique({
      where: { id: campamentoId },
      include: {
        unidades: { select: { unidadId: true } },
        inscripciones: {
          select: {
            cargo: { select: { id: true, montoPagado: true, estado: true } },
          },
        },
      },
    });
    if (!camp) {
      throw new NotFoundException('Campamento no encontrado');
    }

    this.assertAccesoCampamento(alcance, actorId, camp);

    // Se revisan todos los cargos del concepto, no solo los vinculados: tras una baja o un
    // "No asisto" el cargo anulado queda desvinculado de la inscripción.
    const tienePagos =
      camp.inscripciones.some(
        (i) => i.cargo && i.cargo.estado !== EstadoCargo.ANULADO && Number(i.cargo.montoPagado) > 0,
      ) ||
      (camp.conceptoCuotaId != null &&
        (await this.prisma.cargoMiembro.count({
          where: { conceptoId: camp.conceptoCuotaId, montoPagado: { gt: 0 } },
        })) > 0);
    if (tienePagos) {
      throw new ConflictException(
        'No se puede eliminar un campamento que ya tiene pagos registrados. Cambiá su estado a CANCELADO.',
      );
    }

    await this.runInTx(async (tx) => {
      if (camp.conceptoCuotaId != null && tx.cargoMiembro?.deleteMany) {
        await tx.cargoMiembro.deleteMany({
          where: { conceptoId: camp.conceptoCuotaId, montoPagado: 0 },
        });
      }

      if (tx.aviso?.deleteMany) {
        await tx.aviso.deleteMany({ where: { campamentoId } });
      }

      await tx.campamento.delete({ where: { id: campamentoId } });

      if (camp.conceptoCuotaId && tx.conceptoCuota?.deleteMany) {
        await tx.conceptoCuota.deleteMany({
          where: { id: camp.conceptoCuotaId, cargos: { none: {} } },
        });
      }
    });

    return { eliminado: true, id: campamentoId };
  }
}
