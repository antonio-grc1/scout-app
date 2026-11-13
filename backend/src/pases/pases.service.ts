import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, Optional, Inject, forwardRef } from '@nestjs/common';
import { AlcanceRol, TipoUnidad, type Prisma } from '@prisma/client';
import { alcanceEfectivo, assertPuedeOtorgar, assertUnidadEnAlcance } from '../common/scope/alcance.util.js';
import type { AlcanceAcceso } from '../common/types/auth.types.js';
import { anioActual, calcularEdad, fechaCorteCicloEscolar, hoyUtc } from '../common/utils/fechas.util.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TesoreriaService } from '../tesoreria/tesoreria.service.js';
import type { CandidatosQueryDto, PaseDto, PasesLoteDto } from './pases.dto.js';
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

    return asignaciones
      .filter((a) => {
        const esProtagonista =
          (a.rol.tipoMiembro ?? (alcanceEfectivo(a) === AlcanceRol.PROPIO ? 'PROTAGONISTA' : 'EDUCADOR')) ===
          'PROTAGONISTA';
        return esProtagonista && Boolean(a.unidad.rama);
      })
      .flatMap((a) => {
        const r = sugerirPase(a.usuario.fechaNacimiento, a.unidad.rama!, ramas, fechaRef);
        if (!r) return [];
        const ramaSugerida = r.sugerencia.tipo === 'PROGRESION' ? r.sugerencia.ramaSugerida : null;

        let dests: Array<{ id: number; nombre: string; tipo: TipoUnidad; ramaId: number | null }>;
        if (ramaSugerida) {
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

  /** Ejecuta un pase en una transacción (cierra la asignación actual y crea la nueva). */
  async ejecutar(alcance: AlcanceAcceso, dto: PaseDto) {
    const [resultado] = await this.prisma.$transaction((tx) => this.aplicarPases(tx, alcance, [dto]));
    return resultado;
  }

  /** Ejecuta varios pases de forma atómica: si uno falla, no se aplica ninguno. */
  async ejecutarLote(alcance: AlcanceAcceso, dto: PasesLoteDto) {
    const resultados = await this.prisma.$transaction((tx) => this.aplicarPases(tx, alcance, dto.pases), {
      timeout: 30_000,
    });
    return { total: resultados.length, pases: resultados };
  }

  private async aplicarPases(tx: Prisma.TransactionClient, alcance: AlcanceAcceso, pases: PaseDto[]) {
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

      // No permitir auto-pase para usuarios no globales
      const actorUsuarioId =
        alcance.tipo === 'UNIDAD'
          ? alcance.usuarioIdPropio
          : alcance.tipo === 'PROPIO'
            ? alcance.usuarioId
            : undefined;
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

      // Si el rol en la unidad destino tiene alcance distinto de PROPIO, exige que la unidad destino esté en el alcance del actor
      const alcanceDestino = alcanceOverride ?? rolDestino.alcancePorDefecto;
      if (alcanceDestino !== AlcanceRol.PROPIO && alcance.tipo !== 'GLOBAL') {
        assertUnidadEnAlcance(alcance, unidadDestino.id);
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

      // Cierre condicional: evita que dos pases concurrentes cierren la misma asignación.
      const cierre = await tx.asignacionMiembro.updateMany({
        where: { id: origen.id, activo: true },
        data: { activo: false, fechaFin: hoy },
      });
      if (cierre.count !== 1) throw new ConflictException(`La asignación ${origen.id} fue modificada por otro proceso`);

      const cicloPase = p.cicloAnio ?? anioActual();
      const nueva = await tx.asignacionMiembro.create({
        data: {
          usuarioId: origen.usuarioId,
          unidadId: unidadDestino.id,
          rolId: rolDestino.id,
          alcanceOverride,
          cicloAnio: cicloPase,
          fechaInicio: hoy,
        },
        include: { unidad: { select: { id: true, nombre: true } }, rol: { select: { id: true, nombre: true } } },
      });

      if (this.tesoreria) {
        const mesActual = hoy.getUTCMonth() + 1;
        await this.tesoreria.sincronizarCuotasMiembroActivoEnTx(tx, origen.usuarioId, mesActual, cicloPase);
      }

      resultados.push({ usuarioId: origen.usuarioId, asignacionCerradaId: origen.id, asignacionNueva: nueva });
    }
    return resultados;
  }
}
