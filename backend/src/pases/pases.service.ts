import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, Optional, Inject, forwardRef } from '@nestjs/common';
import { AlcanceRol, EstadoSolicitudPase, TipoUnidad, type Prisma } from '@prisma/client';
import {
  alcanceEfectivo,
  assertPuedeOtorgar,
  assertUnidadEnAlcance,
  esRolEducadorEfectivo,
} from '../common/scope/alcance.util.js';
import type { AlcanceAcceso } from '../common/types/auth.types.js';
import { anioActual, calcularEdad, fechaCorteCicloEscolar, hoyUtc } from '../common/utils/fechas.util.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TesoreriaService } from '../tesoreria/tesoreria.service.js';
import type {
  AprobarSolicitudPaseDto,
  CandidatosQueryDto,
  PaseDto,
  PasesLoteDto,
  RechazarSolicitudPaseDto,
} from './pases.dto.js';
import { sugerirPase } from './pases.logic.js';

@Injectable()
export class PasesService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(forwardRef(() => TesoreriaService)) private readonly tesoreria?: TesoreriaService,
  ) {}

  /**
   * Protagonistas (asignaciones con alcance PROPIO en secciones de rama) cuya edad al corte
   * del ciclo escolar (30/06 inclusive) supera la edad máxima de su rama, agrupables por Camada.
   */
  async candidatos(alcance: AlcanceAcceso, q: CandidatosQueryDto) {
    if (alcance.tipo === 'PROPIO') return [];
    const hoy = hoyUtc();
    const fechaRef = q.fechaReferencia ? new Date(q.fechaReferencia) : fechaCorteCicloEscolar(anioActual());

    const unidadFiltro: Prisma.IntFilter | undefined =
      alcance.tipo === 'UNIDAD' ? { in: alcance.unidadIds } : undefined;
    if (q.unidadId) assertUnidadEnAlcance(alcance, q.unidadId);

    const [ramas, unidadesDestino, asignaciones] = await Promise.all([
      this.prisma.rama.findMany({ where: { activa: true }, orderBy: { ordenProgresion: 'asc' } }),
      this.prisma.unidadOrganizativa.findMany({
        where: { activa: true },
        select: { id: true, nombre: true, ramaId: true, tipo: true },
        orderBy: { nombre: 'asc' },
      }),
      this.prisma.asignacionMiembro.findMany({
        where: {
          activo: true,
          unidadId: q.unidadId ?? unidadFiltro,
          usuario: { activo: true },
          unidad: { activa: true, tipo: TipoUnidad.SECCION_RAMA, rama: { isNot: null } },
        },
        include: {
          rol: true,
          unidad: { include: { rama: true } },
          usuario: { select: { id: true, dni: true, nombre: true, apellido: true, fechaNacimiento: true } },
        },
      }),
    ]);

    const ramaMap = new Map(ramas.map((rm) => [rm.id, rm.ordenProgresion]));

    const candidatas = asignaciones.filter((a) => {
      const esProtagonista =
        (a.rol.tipoMiembro ?? (alcanceEfectivo(a) === AlcanceRol.PROPIO ? 'PROTAGONISTA' : 'EDUCADOR')) ===
        'PROTAGONISTA';
      return esProtagonista && Boolean(a.unidad.rama);
    });

    const solicitudesPendientesMap = new Map<
      number,
      { id: number; unidadDestinoId: number; unidadDestinoNombre: string; createdAt: Date }
    >();
    if (candidatas.length > 0 && this.prisma.solicitudPase?.findMany) {
      const pendientes = await this.prisma.solicitudPase.findMany({
        where: {
          estado: EstadoSolicitudPase.PENDIENTE,
          asignacionOrigenId: { in: candidatas.map((a) => a.id) },
        },
        include: { unidadDestino: { select: { id: true, nombre: true } } },
      });
      for (const s of pendientes) {
        solicitudesPendientesMap.set(s.asignacionOrigenId, {
          id: s.id,
          unidadDestinoId: s.unidadDestinoId,
          unidadDestinoNombre: s.unidadDestino.nombre,
          createdAt: s.createdAt,
        });
      }
    }

    return candidatas
      .flatMap((a) => {
        const r = sugerirPase(a.usuario.fechaNacimiento, a.unidad.rama!, ramas, fechaRef);
        if (!r) return [];
        const ramaSugerida = r.sugerencia.tipo === 'PROGRESION' ? r.sugerencia.ramaSugerida : null;
        const requiereAlcanceGlobal = r.sugerencia.tipo === 'EGRESO' && alcance.tipo !== 'GLOBAL';

        let dests: Array<{ id: number; nombre: string; tipo: TipoUnidad; ramaId: number | null }>;
        if (requiereAlcanceGlobal) {
          dests = [];
        } else if (ramaSugerida) {
          dests = unidadesDestino
            .filter((u) => u.ramaId === ramaSugerida.id)
            .map(({ id, nombre, tipo, ramaId }) => ({ id, nombre, tipo, ramaId }));
        } else {
          // EGRESO: Rover pasa a Educador. Puede ir a Sin Rama/Apoyo, a cualquier Rama (como Educador), o a Jefatura.
          dests = [...unidadesDestino]
            .sort((u1, u2) => {
              const scoreTipo = (t: TipoUnidad) =>
                t === TipoUnidad.SIN_RAMA_APOYO ? 0 : t === TipoUnidad.SECCION_RAMA ? 1 : 2;
              const diffTipo = scoreTipo(u1.tipo) - scoreTipo(u2.tipo);
              if (diffTipo !== 0) return diffTipo;
              if (u1.ramaId && u2.ramaId) {
                const o1 = ramaMap.get(u1.ramaId) ?? 0;
                const o2 = ramaMap.get(u2.ramaId) ?? 0;
                if (o1 !== o2) return o1 - o2;
              }
              return u1.nombre.localeCompare(u2.nombre);
            })
            .map(({ id, nombre, tipo, ramaId }) => ({ id, nombre, tipo, ramaId }));
        }

        return [
          {
            asignacionId: a.id,
            usuario: a.usuario,
            edad: r.edad,
            edadActual: calcularEdad(a.usuario.fechaNacimiento, hoy),
            camada: r.camada,
            rolActual: { id: a.rol.id, nombre: a.rol.nombre },
            unidadActual: { id: a.unidad.id, nombre: a.unidad.nombre },
            ramaActual: { id: a.unidad.rama!.id, nombre: a.unidad.rama!.nombre, edadMaxima: a.unidad.rama!.edadMaxima },
            tipo: r.sugerencia.tipo,
            ramaSugerida: ramaSugerida && { id: ramaSugerida.id, nombre: ramaSugerida.nombre },
            requiereAlcanceGlobal,
            solicitudPendiente: solicitudesPendientesMap.get(a.id) ?? null,
            unidadesDestino: dests,
          },
        ];
      })
      .sort(
        (x, y) =>
          x.unidadActual.nombre.localeCompare(y.unidadActual.nombre) ||
          x.camada - y.camada ||
          x.usuario.apellido.localeCompare(y.usuario.apellido),
      );
  }

  /** Ejecuta un pase en una transacción (o crea solicitud pendiente si destino multi-sección queda fuera de alcance). */
  async ejecutar(alcance: AlcanceAcceso, dto: PaseDto, actorId?: number) {
    const [resultado] = await this.prisma.$transaction((tx) => this.aplicarPases(tx, alcance, [dto], actorId));
    return resultado;
  }

  /** Ejecuta varios pases de forma atómica: si uno falla, no se aplica ninguno. */
  async ejecutarLote(alcance: AlcanceAcceso, dto: PasesLoteDto, actorId?: number) {
    const resultados = await this.prisma.$transaction((tx) => this.aplicarPases(tx, alcance, dto.pases, actorId), {
      timeout: 30_000,
    });
    const pendientesAprobacion = resultados.filter((r: any) => Boolean(r.pendienteAprobacion)).length;
    return {
      total: resultados.length,
      pendientesAprobacion,
      ejecutadosDirectos: resultados.length - pendientesAprobacion,
      pases: resultados,
    };
  }

  private async aplicarPases(
    tx: Prisma.TransactionClient,
    alcance: AlcanceAcceso,
    pases: PaseDto[],
    actorId?: number,
  ) {
    const resultados = [];
    const hoy = hoyUtc();
    const ultimaRama = tx.rama?.findFirst
      ? await tx.rama.findFirst({
          where: { activa: true },
          orderBy: { ordenProgresion: 'desc' },
          select: { edadMaxima: true },
        })
      : null;
    const edadEgreso = ultimaRama?.edadMaxima ?? 21;

    const ramasOrdenadas =
      alcance.tipo !== 'GLOBAL' && tx.rama?.findMany
        ? await tx.rama.findMany({
            where: { activa: true },
            orderBy: { ordenProgresion: 'asc' },
            select: { id: true, ordenProgresion: true },
          })
        : null;
    const seccionesPorRamaCache = new Map<number, number>();

    // Precarga masiva para evitar consultas N+1 dentro del bucle (lotes de hasta 200 pases)
    const origenIds = [...new Set(pases.map((p) => p.asignacionOrigenId))];
    const origenesList = tx.asignacionMiembro?.findMany
      ? await tx.asignacionMiembro.findMany({
          where: { id: { in: origenIds } },
          include: {
            rol: { include: { permisos: { include: { permiso: true } } } },
            unidad: { include: { rama: true } },
            usuario: { select: { id: true, activo: true, fechaNacimiento: true } },
          },
        })
      : [];
    const origenesMap = new Map(origenesList.map((a) => [a.id, a]));

    const rolDestinoIds = [...new Set(pases.map((p) => p.rolDestinoId).filter((id): id is number => id != null))];
    const rolesMap = new Map<number, any>();
    if (rolDestinoIds.length > 0 && tx.rol?.findMany) {
      const roles = await tx.rol.findMany({
        where: { id: { in: rolDestinoIds } },
        include: { permisos: { include: { permiso: true } } },
      });
      for (const r of roles) rolesMap.set(r.id, r);
    }

    const unidadDestinoIds = [
      ...new Set(pases.map((p) => p.unidadDestinoId).filter((id): id is number => id != null)),
    ];
    const unidadesMap = new Map<number, any>();
    if (unidadDestinoIds.length > 0 && tx.unidadOrganizativa?.findMany) {
      const unidades = await tx.unidadOrganizativa.findMany({
        where: { id: { in: unidadDestinoIds } },
      });
      for (const u of unidades) unidadesMap.set(u.id, u);
    }

    const unidadesFallbackCache = new Map<string, any>();
    const rolesFallbackCache = new Map<string, any>();

    for (const p of pases) {
      const origen =
        origenesMap.get(p.asignacionOrigenId) ??
        (tx.asignacionMiembro?.findUnique
          ? await tx.asignacionMiembro.findUnique({
              where: { id: p.asignacionOrigenId },
              include: {
                rol: { include: { permisos: { include: { permiso: true } } } },
                unidad: { include: { rama: true } },
                usuario: { select: { id: true, activo: true, fechaNacimiento: true } },
              },
            })
          : null);
      if (!origen) throw new NotFoundException(`Asignación ${p.asignacionOrigenId} no encontrada`);
      if (!origen.activo) throw new ConflictException(`La asignación ${origen.id} ya está cerrada`);
      if (!origen.usuario.activo) throw new BadRequestException(`El miembro ${origen.usuarioId} está inactivo`);

      // El origen debe estar en el alcance de quien ejecuta; no se puede mover a alguien con más privilegios.
      assertUnidadEnAlcance(alcance, origen.unidadId);
      assertPuedeOtorgar(alcance, origen.rol, origen.alcanceOverride);
      if (alcance.tipo !== 'GLOBAL' && esRolEducadorEfectivo(origen.rol, origen.alcanceOverride)) {
        throw new ForbiddenException('Solo un usuario con alcance global puede realizar pases de educadores');
      }

      // No permitir auto-pase para usuarios no globales
      const actorUsuarioId =
        actorId ??
        (alcance.tipo === 'UNIDAD'
          ? alcance.usuarioIdPropio
          : alcance.tipo === 'PROPIO'
            ? alcance.usuarioId
            : undefined);
      if (alcance.tipo !== 'GLOBAL' && actorUsuarioId && origen.usuarioId === actorUsuarioId) {
        throw new ForbiddenException('No puede auto-asignarse un pase institucional');
      }

      let rolDestino: (typeof origen.rol | Prisma.RolGetPayload<{}>) | null = p.rolDestinoId
        ? (rolesMap.get(p.rolDestinoId) ??
          (await tx.rol.findUnique({
            where: { id: p.rolDestinoId },
            include: { permisos: { include: { permiso: true } } },
          })))
        : null;

      let unidadDestino = p.unidadDestinoId
        ? (unidadesMap.get(p.unidadDestinoId) ??
          (await tx.unidadOrganizativa.findUnique({ where: { id: p.unidadDestinoId } })))
        : null;

      if (!unidadDestino && rolDestino?.requiereRama === false && tx.unidadOrganizativa.findFirst) {
        const tipoPref =
          rolDestino.alcancePorDefecto === AlcanceRol.GLOBAL ? TipoUnidad.JEFATURA : TipoUnidad.SIN_RAMA_APOYO;
        const cacheKey = `fallback:${tipoPref}`;
        if (!unidadesFallbackCache.has(cacheKey)) {
          const encontrada =
            (await tx.unidadOrganizativa.findFirst({ where: { activa: true, tipo: tipoPref } })) ??
            (await tx.unidadOrganizativa.findFirst({
              where: { activa: true, tipo: { in: [TipoUnidad.SIN_RAMA_APOYO, TipoUnidad.JEFATURA] } },
            }));
          unidadesFallbackCache.set(cacheKey, encontrada ?? null);
        }
        unidadDestino = unidadesFallbackCache.get(cacheKey);
      }

      if (!unidadDestino && !p.unidadDestinoId) {
        unidadDestino =
          unidadesMap.get(origen.unidadId) ??
          (await tx.unidadOrganizativa.findUnique({ where: { id: origen.unidadId } }));
        if (unidadDestino) unidadesMap.set(origen.unidadId, unidadDestino);
      }

      if (!unidadDestino || !unidadDestino.activa) {
        throw new BadRequestException('Rama o sección destino inexistente o inactiva');
      }

      if (!rolDestino) {
        const exclusionRolesPrivilegiados = {
          none: {
            permiso: {
              clave: {
                in: [
                  'roles.gestionar',
                  'organizacion.gestionar',
                  'tesoreria.gestionar',
                  'eventos.gestionar',
                  'cuotas.ajustar',
                  'miembros.baja',
                ],
              },
            },
          },
        };

        if (unidadDestino.tipo === TipoUnidad.SIN_RAMA_APOYO && tx.rol.findFirst) {
          if (!rolesFallbackCache.has('SIN_RAMA_APOYO')) {
            rolesFallbackCache.set(
              'SIN_RAMA_APOYO',
              await tx.rol.findFirst({
                where: {
                  tipoMiembro: 'EDUCADOR',
                  requiereRama: false,
                  permisos: exclusionRolesPrivilegiados,
                },
                orderBy: { id: 'asc' },
              }),
            );
          }
          rolDestino = rolesFallbackCache.get('SIN_RAMA_APOYO');
        } else if (unidadDestino.tipo === TipoUnidad.JEFATURA) {
          throw new BadRequestException('Para pases a Jefatura debe especificar explícitamente el rol destino');
        } else if (unidadDestino.tipo === TipoUnidad.SECCION_RAMA && origen.rol.tipoMiembro === 'PROTAGONISTA') {
          const edad = calcularEdad(origen.usuario.fechaNacimiento, hoy);
          // Si el protagonista alcanzó o superó la edad máxima de la última rama, pasa a educador
          if (edad >= edadEgreso && tx.rol.findFirst) {
            if (!rolesFallbackCache.has('EDUCADOR_RAMA')) {
              rolesFallbackCache.set(
                'EDUCADOR_RAMA',
                await tx.rol.findFirst({
                  where: {
                    tipoMiembro: 'EDUCADOR',
                    requiereRama: true,
                    permisos: exclusionRolesPrivilegiados,
                  },
                  orderBy: { id: 'asc' },
                }),
              );
            }
            rolDestino = rolesFallbackCache.get('EDUCADOR_RAMA');
          } else {
            rolDestino = origen.rol;
          }
        } else {
          rolDestino = origen.rol;
        }
      }
      if (!rolDestino) throw new BadRequestException('Rol destino inexistente');
      const alcanceOverride = p.alcanceOverride !== undefined ? p.alcanceOverride : null;

      // Validación dinámica de privilegios por alcance (CERO nombres fijos)
      assertPuedeOtorgar(alcance, rolDestino, alcanceOverride);
      if (alcance.tipo !== 'GLOBAL' && esRolEducadorEfectivo(rolDestino, alcanceOverride)) {
        throw new ForbiddenException('Solo un usuario con alcance global puede asignar roles de educador');
      }

      // Si el rol en la unidad destino tiene alcance distinto de PROPIO, exige que la unidad destino esté en el alcance del actor
      const alcanceDestino = alcanceOverride ?? rolDestino.alcancePorDefecto;
      if (alcanceDestino !== AlcanceRol.PROPIO && alcance.tipo !== 'GLOBAL') {
        assertUnidadEnAlcance(alcance, unidadDestino.id);
      }

      // Validación de progresión para usuarios no globales: solo misma rama o rama inmediatamente siguiente en orden
      if (alcance.tipo !== 'GLOBAL' && ramasOrdenadas) {
        if (
          origen.unidad?.tipo !== TipoUnidad.SECCION_RAMA ||
          origen.unidad.ramaId == null ||
          unidadDestino.tipo !== TipoUnidad.SECCION_RAMA ||
          unidadDestino.ramaId == null
        ) {
          throw new ForbiddenException('Solo un usuario con alcance global puede realizar pases fuera de secciones de rama');
        }
        const idxOrigen = ramasOrdenadas.findIndex((r) => r.id === origen.unidad.ramaId);
        const idxDestino = ramasOrdenadas.findIndex((r) => r.id === unidadDestino.ramaId);
        if (idxOrigen < 0 || idxDestino < 0 || (idxDestino !== idxOrigen && idxDestino !== idxOrigen + 1)) {
          throw new ForbiddenException(
            'Solo un usuario con alcance global puede realizar pases entre ramas no consecutivas o hacia ramas anteriores',
          );
        }
      }

      // Validación dinámica de vínculo con Rama según `requiereRama` del rol
      const requiereRamaEfectivo =
        rolDestino.requiereRama !== undefined && rolDestino.requiereRama !== null
          ? rolDestino.requiereRama
          : rolDestino.alcancePorDefecto !== AlcanceRol.GLOBAL;

      const esUnidadRama = unidadDestino.tipo === TipoUnidad.SECCION_RAMA;

      if (esUnidadRama && !requiereRamaEfectivo) {
        throw new BadRequestException(
          'El rol seleccionado está configurado como rol sin rama asignada y no puede asignarse a una rama específica.',
        );
      }

      if (!esUnidadRama && requiereRamaEfectivo) {
        throw new BadRequestException(
          'El rol seleccionado requiere estar asignado a una rama específica.',
        );
      }

      if (unidadDestino.id === origen.unidadId && rolDestino.id === origen.rolId) {
        throw new BadRequestException(`El pase de la asignación ${origen.id} no cambia de rama ni de rol`);
      }

      // Evitar asignación activa duplicada en la unidad destino
      const asignacionActivaExistente = tx.asignacionMiembro.findFirst
        ? await tx.asignacionMiembro.findFirst({
            where: {
              usuarioId: origen.usuarioId,
              unidadId: unidadDestino.id,
              rolId: rolDestino.id,
              activo: true,
            },
          })
        : null;
      if (asignacionActivaExistente) {
        throw new ConflictException(
          `El miembro ya posee una asignación activa en la sección destino con el rol seleccionado (asignación #${asignacionActivaExistente.id})`,
        );
      }

      // Anti-lockout: impedir que el pase quite el último rol administrador global activo del sistema.
      const esOrigenAdminGlobal =
        (origen.alcanceOverride ?? origen.rol.alcancePorDefecto) === AlcanceRol.GLOBAL &&
        (origen.rol as { permisos?: Array<{ permiso?: { clave: string } }> }).permisos?.some(
          (rp) => rp.permiso?.clave === 'organizacion.gestionar' || rp.permiso?.clave === 'roles.gestionar',
        );
      if (esOrigenAdminGlobal && tx.asignacionMiembro.findMany) {
        const destinoMantieneAdmin =
          alcanceDestino === AlcanceRol.GLOBAL &&
          (rolDestino as { permisos?: Array<{ permiso?: { clave: string } }> }).permisos?.some(
            (rp) => rp.permiso?.clave === 'organizacion.gestionar' || rp.permiso?.clave === 'roles.gestionar',
          );
        if (!destinoMantieneAdmin) {
          const otrasGlobales = await tx.asignacionMiembro.findMany({
            where: {
              id: { not: origen.id },
              activo: true,
              usuario: { activo: true },
              unidad: { activa: true },
              OR: [
                { alcanceOverride: AlcanceRol.GLOBAL },
                { alcanceOverride: null, rol: { alcancePorDefecto: AlcanceRol.GLOBAL } },
              ],
            },
            include: { rol: { include: { permisos: { include: { permiso: true } } } } },
          });
          const hayOtroAdmin = otrasGlobales.some((a) =>
            a.rol.permisos?.some(
              (rp) => rp.permiso?.clave === 'organizacion.gestionar' || rp.permiso?.clave === 'roles.gestionar',
            ),
          );
          if (!hayOtroAdmin) {
            throw new BadRequestException(
              'No se puede transferir al último administrador global activo sin conservar un rol administrador.',
            );
          }
        }
      }

      // Flujo en dos pasos: si el actor NO es global, la unidad destino está fuera de su alcance
      // y la rama destino posee más de una sección activa, creamos SolicitudPase pendiente.
      const destinoFueraDeAlcance =
        alcance.tipo !== 'GLOBAL' &&
        (alcance.tipo === 'PROPIO' || !alcance.unidadIds.includes(unidadDestino.id));
      if (
        destinoFueraDeAlcance &&
        unidadDestino.ramaId != null &&
        tx.unidadOrganizativa?.count &&
        tx.solicitudPase?.create
      ) {
        let totalSeccionesRama = seccionesPorRamaCache.get(unidadDestino.ramaId);
        if (totalSeccionesRama === undefined) {
          totalSeccionesRama = await tx.unidadOrganizativa.count({
            where: { activa: true, tipo: TipoUnidad.SECCION_RAMA, ramaId: unidadDestino.ramaId },
          });
          seccionesPorRamaCache.set(unidadDestino.ramaId, totalSeccionesRama);
        }

        if (totalSeccionesRama > 1) {
          if (tx.solicitudPase.findFirst) {
            const yaPendiente = await tx.solicitudPase.findFirst({
              where: { asignacionOrigenId: origen.id, estado: EstadoSolicitudPase.PENDIENTE },
            });
            if (yaPendiente) {
              throw new ConflictException(`Ya existe una solicitud de pase pendiente para la asignación ${origen.id}`);
            }
          }
          if (!actorUsuarioId) {
            throw new ForbiddenException('No se pudo identificar al usuario solicitante');
          }
          const solicitud = await tx.solicitudPase.create({
            data: {
              asignacionOrigenId: origen.id,
              usuarioId: origen.usuarioId,
              unidadOrigenId: origen.unidadId,
              unidadDestinoId: unidadDestino.id,
              rolDestinoId: rolDestino.id,
              alcanceOverride,
              modo: 'MOVER',
              estado: EstadoSolicitudPase.PENDIENTE,
              solicitadoPorId: actorUsuarioId,
            },
            include: {
              unidadOrigen: { select: { id: true, nombre: true } },
              unidadDestino: { select: { id: true, nombre: true } },
              rolDestino: { select: { id: true, nombre: true } },
            },
          });
          resultados.push({
            usuarioId: origen.usuarioId,
            pendienteAprobacion: true,
            solicitud,
          });
          continue;
        }
      }

      const paseEjecutado = await this.cerrarYCrearAsignacionEnTx(tx, {
        asignacionOrigenId: origen.id,
        usuarioId: origen.usuarioId,
        unidadDestinoId: unidadDestino.id,
        rolDestinoId: rolDestino.id,
        alcanceOverride,
        cicloAnio: p.cicloAnio ?? anioActual(),
        fechaHoy: hoy,
      });

      resultados.push(paseEjecutado);
    }
    return resultados;
  }

  private async cerrarYCrearAsignacionEnTx(
    tx: Prisma.TransactionClient,
    params: {
      asignacionOrigenId: number;
      usuarioId: number;
      unidadDestinoId: number;
      rolDestinoId: number;
      alcanceOverride: AlcanceRol | null;
      cicloAnio: number;
      fechaHoy: Date;
    },
  ) {
    // Cierre condicional: evita que dos pases concurrentes cierren la misma asignación.
    const cierre = await tx.asignacionMiembro.updateMany({
      where: { id: params.asignacionOrigenId, activo: true },
      data: { activo: false, fechaFin: params.fechaHoy },
    });
    if (cierre.count !== 1) {
      throw new ConflictException(`La asignación ${params.asignacionOrigenId} fue modificada por otro proceso`);
    }

    const nueva = await tx.asignacionMiembro.create({
      data: {
        usuarioId: params.usuarioId,
        unidadId: params.unidadDestinoId,
        rolId: params.rolDestinoId,
        alcanceOverride: params.alcanceOverride,
        cicloAnio: params.cicloAnio,
        fechaInicio: params.fechaHoy,
      },
      include: { unidad: { select: { id: true, nombre: true } }, rol: { select: { id: true, nombre: true } } },
    });

    if (this.tesoreria) {
      const mesActual = params.fechaHoy.getUTCMonth() + 1;
      await this.tesoreria.sincronizarCuotasMiembroActivoEnTx(tx, params.usuarioId, mesActual, params.cicloAnio);
    }

    return {
      usuarioId: params.usuarioId,
      asignacionCerradaId: params.asignacionOrigenId,
      pendienteAprobacion: false,
      asignacionNueva: nueva,
    };
  }

  /** Lista solicitudes de pase pendientes dentro del alcance del actor (entrantes o salientes). */
  async listarSolicitudes(alcance: AlcanceAcceso) {
    if (alcance.tipo === 'PROPIO') return [];
    if (!this.prisma.solicitudPase?.findMany) return [];

    const where: Prisma.SolicitudPaseWhereInput =
      alcance.tipo === 'UNIDAD'
        ? {
            estado: EstadoSolicitudPase.PENDIENTE,
            OR: [{ unidadDestinoId: { in: alcance.unidadIds } }, { unidadOrigenId: { in: alcance.unidadIds } }],
          }
        : { estado: EstadoSolicitudPase.PENDIENTE };

    const [solicitudes, unidadesSeccion] = await Promise.all([
      this.prisma.solicitudPase.findMany({
        where,
        include: {
          usuario: { select: { id: true, dni: true, nombre: true, apellido: true, fechaNacimiento: true } },
          unidadOrigen: { select: { id: true, nombre: true, ramaId: true, rama: { select: { id: true, nombre: true } } } },
          unidadDestino: { select: { id: true, nombre: true, ramaId: true, rama: { select: { id: true, nombre: true } } } },
          rolDestino: { select: { id: true, nombre: true } },
          solicitadoPor: { select: { id: true, nombre: true, apellido: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.unidadOrganizativa?.findMany
        ? this.prisma.unidadOrganizativa.findMany({
            where: { activa: true, tipo: TipoUnidad.SECCION_RAMA },
            select: { id: true, nombre: true, ramaId: true },
            orderBy: { nombre: 'asc' },
          })
        : Promise.resolve([]),
    ]);

    return solicitudes.map((s) => {
      const esReceptor =
        alcance.tipo === 'GLOBAL' || (alcance.tipo === 'UNIDAD' && alcance.unidadIds.includes(s.unidadDestinoId));
      const esEmisor = alcance.tipo === 'UNIDAD' && alcance.unidadIds.includes(s.unidadOrigenId);
      const seccionesMismaRama = unidadesSeccion.filter(
        (u) =>
          u.ramaId === s.unidadDestino.ramaId &&
          (alcance.tipo === 'GLOBAL' || (alcance.tipo === 'UNIDAD' && alcance.unidadIds.includes(u.id))),
      );

      return {
        ...s,
        puedeAprobar: esReceptor,
        puedeRechazar: esReceptor || esEmisor,
        rolActorSolicitud: esReceptor ? 'RECEPTOR' : 'EMISOR',
        seccionesMismaRama,
      };
    });
  }

  /** Aprueba/confirma una solicitud pendiente y ejecuta el pase definitivo. */
  async aprobarSolicitud(
    alcance: AlcanceAcceso,
    solicitudId: number,
    dto: AprobarSolicitudPaseDto,
    actorId?: number,
  ) {
    if (alcance.tipo === 'PROPIO') throw new ForbiddenException('Sin permisos para aprobar solicitudes');

    return this.prisma.$transaction(async (tx) => {
      const solicitud = await tx.solicitudPase.findUnique({
        where: { id: solicitudId },
        include: {
          unidadDestino: true,
          rolDestino: { include: { permisos: { include: { permiso: true } } } },
          asignacionOrigen: {
            include: {
              rol: { include: { permisos: { include: { permiso: true } } } },
              unidad: { include: { rama: true } },
              usuario: { select: { id: true, activo: true, fechaNacimiento: true } },
            },
          },
        },
      });
      if (!solicitud) throw new NotFoundException(`Solicitud de pase ${solicitudId} no encontrada`);
      if (solicitud.estado !== EstadoSolicitudPase.PENDIENTE) {
        throw new ConflictException('La solicitud ya fue resuelta');
      }

      const esReceptor =
        alcance.tipo === 'GLOBAL' || (alcance.tipo === 'UNIDAD' && alcance.unidadIds.includes(solicitud.unidadDestinoId));
      if (!esReceptor) {
        throw new ForbiddenException('Solo la unidad destino o un usuario con alcance global puede aprobar esta solicitud');
      }

      const actorUsuarioId = actorId ?? (alcance.tipo === 'UNIDAD' ? alcance.usuarioIdPropio : undefined);
      if (alcance.tipo !== 'GLOBAL' && actorUsuarioId && solicitud.usuarioId === actorUsuarioId) {
        throw new ForbiddenException('No puede aprobar su propio pase institucional');
      }

      const origen = solicitud.asignacionOrigen;
      if (!origen || !origen.activo) {
        throw new ConflictException('La asignación origen ya fue cerrada');
      }
      if (!origen.usuario.activo) {
        throw new BadRequestException('El miembro se encuentra inactivo');
      }

      if (alcance.tipo !== 'GLOBAL') {
        if (
          esRolEducadorEfectivo(origen.rol, origen.alcanceOverride) ||
          esRolEducadorEfectivo(solicitud.rolDestino, solicitud.alcanceOverride)
        ) {
          throw new ForbiddenException('Solo un usuario con alcance global puede aprobar pases de educadores');
        }
      }
      assertPuedeOtorgar(alcance, solicitud.rolDestino, solicitud.alcanceOverride);

      let unidadDestinoFinalId = solicitud.unidadDestinoId;
      if (dto.unidadDestinoId && dto.unidadDestinoId !== solicitud.unidadDestinoId) {
        const unidadAlt = await tx.unidadOrganizativa.findUnique({ where: { id: dto.unidadDestinoId } });
        if (
          !unidadAlt ||
          !unidadAlt.activa ||
          unidadAlt.tipo !== TipoUnidad.SECCION_RAMA ||
          unidadAlt.ramaId !== solicitud.unidadDestino.ramaId
        ) {
          throw new BadRequestException('La sección seleccionada no pertenece a la misma rama de destino');
        }
        if (alcance.tipo !== 'GLOBAL') {
          assertUnidadEnAlcance(alcance, unidadAlt.id);
        }
        unidadDestinoFinalId = unidadAlt.id;
      }

      const duplicada = await tx.asignacionMiembro.findFirst({
        where: {
          usuarioId: solicitud.usuarioId,
          unidadId: unidadDestinoFinalId,
          rolId: solicitud.rolDestinoId,
          activo: true,
        },
      });
      if (duplicada) {
        throw new ConflictException('El miembro ya posee una asignación activa en la sección destino con ese rol');
      }

      const hoy = hoyUtc();
      const marcada = await tx.solicitudPase.updateMany({
        where: { id: solicitudId, estado: EstadoSolicitudPase.PENDIENTE },
        data: {
          estado: EstadoSolicitudPase.APROBADA,
          unidadDestinoId: unidadDestinoFinalId,
          resueltoPorId: actorUsuarioId ?? null,
          resueltoAt: hoy,
        },
      });
      if (marcada.count !== 1) throw new ConflictException('La solicitud ya fue resuelta por otro proceso');

      const pase = await this.cerrarYCrearAsignacionEnTx(tx, {
        asignacionOrigenId: solicitud.asignacionOrigenId,
        usuarioId: solicitud.usuarioId,
        unidadDestinoId: unidadDestinoFinalId,
        rolDestinoId: solicitud.rolDestinoId,
        alcanceOverride: solicitud.alcanceOverride,
        cicloAnio: anioActual(),
        fechaHoy: hoy,
      });

      return { solicitudId, aprobada: true, ...pase };
    });
  }

  /** Rechaza (unidad destino/global) o cancela (unidad origen) una solicitud de pase pendiente. */
  async rechazarSolicitud(
    alcance: AlcanceAcceso,
    solicitudId: number,
    dto: RechazarSolicitudPaseDto,
    actorId?: number,
  ) {
    if (alcance.tipo === 'PROPIO') throw new ForbiddenException('Sin permisos para rechazar solicitudes');

    return this.prisma.$transaction(async (tx) => {
      const solicitud = await tx.solicitudPase.findUnique({ where: { id: solicitudId } });
      if (!solicitud) throw new NotFoundException(`Solicitud de pase ${solicitudId} no encontrada`);
      if (solicitud.estado !== EstadoSolicitudPase.PENDIENTE) {
        throw new ConflictException('La solicitud ya fue resuelta');
      }

      const esReceptor =
        alcance.tipo === 'GLOBAL' || (alcance.tipo === 'UNIDAD' && alcance.unidadIds.includes(solicitud.unidadDestinoId));
      const esEmisor = alcance.tipo === 'UNIDAD' && alcance.unidadIds.includes(solicitud.unidadOrigenId);
      if (!esReceptor && !esEmisor) {
        throw new ForbiddenException('La solicitud está fuera de su alcance');
      }

      const nuevoEstado = esReceptor ? EstadoSolicitudPase.RECHAZADA : EstadoSolicitudPase.CANCELADA;
      const actorUsuarioId = actorId ?? (alcance.tipo === 'UNIDAD' ? alcance.usuarioIdPropio : undefined);
      const actualizada = await tx.solicitudPase.updateMany({
        where: { id: solicitudId, estado: EstadoSolicitudPase.PENDIENTE },
        data: {
          estado: nuevoEstado,
          motivoRechazo: dto.motivo?.trim() || null,
          resueltoPorId: actorUsuarioId ?? null,
          resueltoAt: hoyUtc(),
        },
      });
      if (actualizada.count !== 1) throw new ConflictException('La solicitud ya fue resuelta por otro proceso');

      return { solicitudId, estado: nuevoEstado };
    });
  }
}
