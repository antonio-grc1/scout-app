import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AlcanceRol, TipoUnidad, type Prisma } from '@prisma/client';
import { alcanceEfectivo, assertPuedeOtorgar, assertUnidadEnAlcance } from '../common/scope/alcance.util.js';
import type { AlcanceAcceso } from '../common/types/auth.types.js';
import { anioActual, calcularEdad, fechaCorteCicloEscolar, hoyUtc } from '../common/utils/fechas.util.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CandidatosQueryDto, PaseDto, PasesLoteDto } from './pases.dto.js';
import { sugerirPase } from './pases.logic.js';

@Injectable()
export class PasesService {
  constructor(private readonly prisma: PrismaService) {}

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

    for (const p of pases) {
      const origen = await tx.asignacionMiembro.findUnique({
        where: { id: p.asignacionOrigenId },
        include: { rol: true, usuario: { select: { id: true, activo: true, fechaNacimiento: true } } },
      });
      if (!origen) throw new NotFoundException(`Asignación ${p.asignacionOrigenId} no encontrada`);
      if (!origen.activo) throw new ConflictException(`La asignación ${origen.id} ya está cerrada`);
      if (!origen.usuario.activo) throw new BadRequestException(`El miembro ${origen.usuarioId} está inactivo`);

      // El origen debe estar en el alcance de quien ejecuta; no se puede mover a alguien con más privilegios.
      assertUnidadEnAlcance(alcance, origen.unidadId);
      assertPuedeOtorgar(alcance, origen.rol, origen.alcanceOverride);

      let rolDestino = p.rolDestinoId ? await tx.rol.findUnique({ where: { id: p.rolDestinoId } }) : null;

      let unidadDestino = p.unidadDestinoId
        ? await tx.unidadOrganizativa.findUnique({ where: { id: p.unidadDestinoId } })
        : null;

      if (!unidadDestino && rolDestino?.requiereRama === false && tx.unidadOrganizativa.findFirst) {
        const tipoPref =
          rolDestino.alcancePorDefecto === AlcanceRol.GLOBAL ? TipoUnidad.JEFATURA : TipoUnidad.SIN_RAMA_APOYO;
        unidadDestino =
          (await tx.unidadOrganizativa.findFirst({ where: { activa: true, tipo: tipoPref } })) ??
          (await tx.unidadOrganizativa.findFirst({
            where: { activa: true, tipo: { in: [TipoUnidad.SIN_RAMA_APOYO, TipoUnidad.JEFATURA] } },
          }));
      }

      if (!unidadDestino && !p.unidadDestinoId) {
        unidadDestino = await tx.unidadOrganizativa.findUnique({ where: { id: origen.unidadId } });
      }

      if (!unidadDestino || !unidadDestino.activa) {
        throw new BadRequestException('Rama o sección destino inexistente o inactiva');
      }

      if (!rolDestino) {
        if (unidadDestino.tipo === TipoUnidad.SIN_RAMA_APOYO && tx.rol.findFirst) {
          rolDestino =
            (await tx.rol.findFirst({
              where: {
                requiereRama: false,
                tipoMiembro: 'EDUCADOR',
                nombre: { contains: 'Sin Rama', mode: 'insensitive' },
              },
            })) ??
            (await tx.rol.findFirst({
              where: {
                requiereRama: false,
                tipoMiembro: 'EDUCADOR',
                nombre: { not: { contains: 'Jefe', mode: 'insensitive' } },
              },
            })) ??
            (await tx.rol.findFirst({
              where: { requiereRama: false, tipoMiembro: 'EDUCADOR' },
            }));
        } else if (unidadDestino.tipo === TipoUnidad.JEFATURA && tx.rol.findFirst) {
          rolDestino =
            (await tx.rol.findFirst({
              where: {
                requiereRama: false,
                tipoMiembro: 'EDUCADOR',
                nombre: { contains: 'Jefe', mode: 'insensitive' },
              },
            })) ??
            (await tx.rol.findFirst({
              where: { requiereRama: false, alcancePorDefecto: AlcanceRol.GLOBAL },
            }));
        } else if (unidadDestino.tipo === TipoUnidad.SECCION_RAMA && origen.rol.tipoMiembro === 'PROTAGONISTA') {
          const edad = calcularEdad(origen.usuario.fechaNacimiento, hoy);
          // Si el protagonista tiene edad de pase a educador (>= 21 años, egreso de Rover)
          if (edad >= 21 && tx.rol.findFirst) {
            rolDestino =
              (await tx.rol.findFirst({
                where: {
                  requiereRama: true,
                  tipoMiembro: 'EDUCADOR',
                  nombre: { contains: 'Educador', mode: 'insensitive' },
                },
              })) ??
              (await tx.rol.findFirst({
                where: { requiereRama: true, tipoMiembro: 'EDUCADOR' },
              }));
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

      // Cierre condicional: evita que dos pases concurrentes cierren la misma asignación.
      const cierre = await tx.asignacionMiembro.updateMany({
        where: { id: origen.id, activo: true },
        data: { activo: false, fechaFin: hoy },
      });
      if (cierre.count !== 1) throw new ConflictException(`La asignación ${origen.id} fue modificada por otro proceso`);

      const nueva = await tx.asignacionMiembro.create({
        data: {
          usuarioId: origen.usuarioId,
          unidadId: unidadDestino.id,
          rolId: rolDestino.id,
          alcanceOverride,
          cicloAnio: p.cicloAnio ?? anioActual(),
          fechaInicio: hoy,
        },
        include: { unidad: { select: { id: true, nombre: true } }, rol: { select: { id: true, nombre: true } } },
      });

      resultados.push({ usuarioId: origen.usuarioId, asignacionCerradaId: origen.id, asignacionNueva: nueva });
    }
    return resultados;
  }
}
