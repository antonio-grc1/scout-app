import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AlcanceRol, TipoUnidad, type Prisma } from '@prisma/client';
import {
  assertActorCubrePermisosConAlcance,
  assertUnidadEnAlcance,
  extraerClavesPermisosRol,
  extraerPermisosConAlcanceRol,
  rolTienePermisoConAlcanceGlobal,
} from '../common/scope/alcance.util.js';
import {
  CATALOGO_PERMISOS_MAP,
  normalizarYValidarPermisosConAlcance,
  PERMISOS_CRITICOS_ADMIN,
} from '../common/scope/permisos-catalogo.js';
import type { AlcanceAcceso, AuthUser } from '../common/types/auth.types.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  CrearRamaDto,
  CrearRolDto,
  CrearUnidadDto,
  EditarRamaDto,
  EditarRolDto,
  EditarUnidadDto,
} from './organizacion.dto.js';

const ROL_INCLUDE = {
  permisos: { include: { permiso: true } },
  _count: { select: { asignaciones: { where: { activo: true } } } },
} satisfies Prisma.RolInclude;

@Injectable()
export class OrganizacionService {
  constructor(private readonly prisma: PrismaService) {}

  /** La estructura del grupo es global: solo se modifica con alcance GLOBAL. */
  private assertGlobal(alcance: AlcanceAcceso): void {
    if (alcance.tipo !== 'GLOBAL') {
      throw new ForbiddenException('Modificar la organización requiere alcance global');
    }
  }

  // ---------------- Ramas ----------------
  listarRamas(alcance: AlcanceAcceso, incluirInactivas: boolean) {
    const puedeVerInactivas = incluirInactivas && alcance.tipo === 'GLOBAL';
    return this.prisma.rama.findMany({
      where: puedeVerInactivas ? {} : { activa: true },
      orderBy: { ordenProgresion: 'asc' },
      include: {
        unidades: {
          where: puedeVerInactivas ? {} : { activa: true },
          select: { id: true, nombre: true, activa: true },
        },
      },
    });
  }

  async crearRama(alcance: AlcanceAcceso, dto: CrearRamaDto) {
    this.assertGlobal(alcance);
    return this.prisma.rama.create({
      data: dto,
      include: { unidades: { select: { id: true, nombre: true, activa: true } } },
    });
  }

  async editarRama(alcance: AlcanceAcceso, id: number, dto: EditarRamaDto) {
    this.assertGlobal(alcance);
    return this.runInTx(async (tx) => {
      const actual = await tx.rama.findUnique({ where: { id } });
      if (!actual) throw new NotFoundException('Rama no encontrada');
      const min = dto.edadMinima ?? actual.edadMinima;
      const max = dto.edadMaxima ?? actual.edadMaxima;
      if (min > max) throw new BadRequestException('edadMaxima debe ser >= edadMinima');

      if (dto.activa === false && actual.activa && tx.unidadOrganizativa?.findMany) {
        const unidadesActivas = await tx.unidadOrganizativa.findMany({
          where: { ramaId: id, activa: true },
          select: { id: true },
        });
        await this.asegurarNoDejarSinUnidadAlUltimoAdmin(
          unidadesActivas.map((u) => u.id),
          tx,
        );
      }

      return tx.rama.update({
        where: { id },
        data: dto,
        include: { unidades: { select: { id: true, nombre: true, activa: true } } },
      });
    });
  }

  async eliminarRama(alcance: AlcanceAcceso, id: number, definitivo: boolean = false) {
    this.assertGlobal(alcance);
    const rama = await this.prisma.rama.findUnique({
      where: { id },
      include: {
        unidades: {
          include: {
            _count: {
              select: {
                asignaciones: true,
                conceptos: true,
                planesCuota: true,
              },
            },
          },
        },
      },
    });
    if (!rama) throw new NotFoundException('Rama no encontrada');

    if (definitivo) {
      const totalAsignaciones = rama.unidades.reduce((acc, u) => acc + (u._count?.asignaciones ?? 0), 0);
      const totalConceptos = rama.unidades.reduce((acc, u) => acc + (u._count?.conceptos ?? 0), 0);
      const totalPlanes = rama.unidades.reduce((acc, u) => acc + (u._count?.planesCuota ?? 0), 0);
      if (totalAsignaciones > 0 || totalConceptos > 0 || totalPlanes > 0) {
        throw new ConflictException(
          `No se puede eliminar definitivamente la rama "${rama.nombre}": posee registros asociados (${totalAsignaciones} asignaciones, ${totalConceptos} conceptos, ${totalPlanes} planes). Desactivala en su lugar.`,
        );
      }

      const idsUnidades = rama.unidades.map((u) => u.id);
      await this.prisma.$transaction([
        ...(idsUnidades.length > 0
          ? [
              this.prisma.unidadOrganizativa.deleteMany({
                where: { id: { in: idsUnidades } },
              }),
            ]
          : []),
        this.prisma.rama.delete({ where: { id } }),
      ]);

      return {
        eliminada: true,
        desactivada: false,
        mensaje: `Rama "${rama.nombre}" eliminada definitivamente.`,
      };
    }

    const idsUnidades = rama.unidades.map((u) => u.id);
    await this.asegurarNoDejarSinUnidadAlUltimoAdmin(
      idsUnidades,
      this.prisma as unknown as Prisma.TransactionClient,
    );

    await this.prisma.$transaction([
      ...(idsUnidades.length > 0
        ? [
            this.prisma.unidadOrganizativa.updateMany({
              where: { id: { in: idsUnidades } },
              data: { activa: false },
            }),
          ]
        : []),
      this.prisma.rama.update({
        where: { id },
        data: { activa: false },
      }),
    ]);

    return {
      eliminada: false,
      desactivada: true,
      mensaje: `Rama "${rama.nombre}" desactivada.`,
    };
  }

  // ---------------- Unidades ----------------
  listarUnidades(alcance: AlcanceAcceso, incluirInactivas: boolean) {
    const puedeVerInactivas = incluirInactivas && alcance.tipo === 'GLOBAL';
    return this.prisma.unidadOrganizativa.findMany({
      where: puedeVerInactivas ? {} : { activa: true },
      orderBy: [{ rama: { ordenProgresion: 'asc' } }, { nombre: 'asc' }],
      include: {
        rama: { select: { id: true, nombre: true, edadMinima: true, edadMaxima: true } },
        _count: { select: { asignaciones: { where: { activo: true, usuario: { activo: true } } } } },
      },
    });
  }

  async obtenerHistorialUnidad(alcance: AlcanceAcceso, id: number) {
    assertUnidadEnAlcance(alcance, id);

    const unidad = await this.prisma.unidadOrganizativa.findUnique({
      where: { id },
      include: {
        rama: {
          select: {
            id: true,
            nombre: true,
            edadMinima: true,
            edadMaxima: true,
            ordenProgresion: true,
            activa: true,
          },
        },
        asignaciones: {
          orderBy: [{ cicloAnio: 'desc' }, { fechaInicio: 'desc' }, { id: 'desc' }],
          include: {
            usuario: {
              select: {
                id: true,
                nombre: true,
                apellido: true,
                dni: true,
                tipoMiembro: true,
                activo: true,
              },
            },
            rol: {
              select: {
                id: true,
                nombre: true,
                tipoMiembro: true,
              },
            },
          },
        },
      },
    });

    if (!unidad) {
      throw new NotFoundException('Sección no encontrada');
    }

    const asignaciones = (unidad.asignaciones || []).map((a) => {
      const miembroData = a.usuario
        ? {
            id: a.usuario.id,
            nombre: a.usuario.nombre,
            apellido: a.usuario.apellido,
            dni: a.usuario.dni,
            activo: a.usuario.activo,
          }
        : {
            id: a.usuarioId,
            nombre: 'Usuario',
            apellido: 'Inactivo',
            dni: '-',
            activo: false,
          };
      return {
        id: a.id,
        usuarioId: a.usuarioId,
        rolId: a.rolId,
        cicloAnio: a.cicloAnio,
        fechaInicio: a.fechaInicio,
        fechaFin: a.fechaFin,
        activo: a.activo,
        miembro: miembroData,
        usuario: miembroData,
        rol: {
          id: a.rol?.id ?? a.rolId,
          nombre: a.rol?.nombre ?? 'Rol',
          tipoMiembro:
            (a.usuario as { tipoMiembro?: string | null } | null)?.tipoMiembro ||
            a.rol?.tipoMiembro ||
            'EDUCADOR',
        },
      };
    });

    const ciclos = [...new Set(asignaciones.map((a) => a.cicloAnio))].sort((a, b) => b - a);

    const educadoresIds = new Set(
      asignaciones
        .filter((a) => {
          const tm = (
            (a.usuario as { tipoMiembro?: string | null } | null)?.tipoMiembro ||
            a.rol.tipoMiembro ||
            ''
          ).toUpperCase();
          return tm === 'EDUCADOR' || tm === 'ADULTO';
        })
        .map((a) => a.usuarioId),
    );
    const protagonistasIds = new Set(
      asignaciones
        .filter((a) => {
          const tm = (
            (a.usuario as { tipoMiembro?: string | null } | null)?.tipoMiembro ||
            a.rol.tipoMiembro ||
            ''
          ).toUpperCase();
          return tm === 'PROTAGONISTA';
        })
        .map((a) => a.usuarioId),
    );
    const miembrosTotalesIds = new Set(asignaciones.map((a) => a.usuarioId));

    const resumen = {
      ciclos,
      ciclosOperativos: ciclos,
      totalCiclos: ciclos.length,
      totalAsignaciones: asignaciones.length,
      totalEducadores: educadoresIds.size,
      totalEducadoresUnicos: educadoresIds.size,
      totalProtagonistas: protagonistasIds.size,
      totalProtagonistasUnicos: protagonistasIds.size,
      totalMiembros: miembrosTotalesIds.size,
    };

    return {
      id: unidad.id,
      nombre: unidad.nombre,
      tipo: unidad.tipo,
      activa: unidad.activa,
      ramaId: unidad.ramaId,
      rama: unidad.rama,
      asignaciones,
      resumen,
    };
  }

  private async validarRamaDeUnidad(tipo: TipoUnidad, ramaId: number | null | undefined) {
    if (tipo === TipoUnidad.SECCION_RAMA) {
      if (ramaId == null) throw new BadRequestException('SECCION_RAMA requiere ramaId');
      const rama = await this.prisma.rama.findUnique({ where: { id: ramaId } });
      if (!rama) throw new BadRequestException('Rama inexistente');
    } else if (ramaId != null) {
      throw new BadRequestException(`${tipo} no puede tener rama asociada`);
    }
  }

  async crearUnidad(alcance: AlcanceAcceso, dto: CrearUnidadDto) {
    this.assertGlobal(alcance);
    await this.validarRamaDeUnidad(dto.tipo, dto.ramaId);
    return this.prisma.unidadOrganizativa.create({ data: { ...dto, ramaId: dto.ramaId ?? null } });
  }

  private runInTx<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction
      ? this.prisma.$transaction(fn)
      : fn(this.prisma as unknown as Prisma.TransactionClient);
  }

  /** Verifica que desactivar una o más unidades no deje sin unidades activas al último administrador global de cada permiso crítico. */
  private async asegurarNoDejarSinUnidadAlUltimoAdmin(
    unidadIdsADesactivar: number | number[],
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const ids = Array.isArray(unidadIdsADesactivar) ? unidadIdsADesactivar : [unidadIdsADesactivar];
    const idsSet = new Set(ids);
    if (idsSet.size === 0 || !tx.asignacionMiembro?.findMany) return;

    const asignacionesGlobales = await tx.asignacionMiembro.findMany({
      where: {
        activo: true,
        usuario: { activo: true },
        unidad: { activa: true },
        rol: { alcancePorDefecto: AlcanceRol.GLOBAL, activo: true },
      },
      include: { rol: { include: { permisos: { include: { permiso: true } } } } },
    });

    for (const cap of PERMISOS_CRITICOS_ADMIN) {
      const titulares = asignacionesGlobales.filter((a) => {
        if (!a.rol || a.rol.activo === false) return false;
        const rolConAlcance = {
          ...a.rol,
          alcancePorDefecto: a.rol.alcancePorDefecto ?? AlcanceRol.GLOBAL,
        };
        return rolTienePermisoConAlcanceGlobal(rolConAlcance, cap);
      });
      if (titulares.length === 0) continue;

      const quedaEnOtraUnidad = titulares.some((a) => !idsSet.has(a.unidadId));
      if (!quedaEnOtraUnidad) {
        throw new BadRequestException(
          `No se puede desactivar esta sección porque dejaría sin sección activa al último administrador global del sistema con permiso "${cap}".`,
        );
      }
    }
  }

  async editarUnidad(alcance: AlcanceAcceso, id: number, dto: EditarUnidadDto) {
    this.assertGlobal(alcance);
    return this.runInTx(async (tx) => {
      const actual = await tx.unidadOrganizativa.findUnique({ where: { id } });
      if (!actual) throw new NotFoundException('Unidad no encontrada');
      if (dto.activa === false && actual.activa) {
        await this.asegurarNoDejarSinUnidadAlUltimoAdmin(id, tx);
      }
      const tipo = dto.tipo ?? actual.tipo;
      const ramaId = dto.ramaId !== undefined ? dto.ramaId : actual.ramaId;
      await this.validarRamaDeUnidad(tipo, ramaId);
      return tx.unidadOrganizativa.update({ where: { id }, data: { ...dto, ramaId } });
    });
  }

  async eliminarUnidad(alcance: AlcanceAcceso, id: number, definitivo: boolean = false) {
    this.assertGlobal(alcance);
    return this.runInTx(async (tx) => {
      const unidad = await tx.unidadOrganizativa.findUnique({
        where: { id },
        include: {
          _count: {
            select: {
              asignaciones: true,
              conceptos: true,
              planesCuota: true,
            },
          },
        },
      });
      if (!unidad) throw new NotFoundException('Sección no encontrada');

      if (definitivo) {
        const totalAsignaciones = unidad._count?.asignaciones ?? 0;
        const totalConceptos = unidad._count?.conceptos ?? 0;
        const totalPlanes = unidad._count?.planesCuota ?? 0;
        if (totalAsignaciones > 0 || totalConceptos > 0 || totalPlanes > 0) {
          throw new ConflictException(
            `No se puede eliminar definitivamente la sección "${unidad.nombre}": posee registros asociados (${totalAsignaciones} asignaciones, ${totalConceptos} conceptos, ${totalPlanes} planes). Desactivala en su lugar.`,
          );
        }

        await tx.unidadOrganizativa.delete({ where: { id } });
        return {
          eliminada: true,
          desactivada: false,
          mensaje: `Sección "${unidad.nombre}" eliminada definitivamente.`,
        };
      }

      if (unidad.activa) {
        await this.asegurarNoDejarSinUnidadAlUltimoAdmin(id, tx);
      }

      await tx.unidadOrganizativa.update({
        where: { id },
        data: { activa: false },
      });

      return {
        eliminada: false,
        desactivada: true,
        mensaje: `Sección "${unidad.nombre}" desactivada.`,
      };
    });
  }

  // ---------------- Roles ----------------
  async listarRoles(alcance?: AlcanceAcceso, incluirInactivos = false) {
    const puedeVerInactivos = incluirInactivos && alcance?.tipo === 'GLOBAL';
    const roles = await this.prisma.rol.findMany({
      where: puedeVerInactivos ? {} : { activo: true },
      orderBy: [{ activo: 'desc' }, { id: 'asc' }],
      include: ROL_INCLUDE,
    });
    return roles.map((r) => this.mapRol(r));
  }

  private resolverYValidarConfiguracionRol(params: {
    alcancePorDefecto: AlcanceRol;
    tipoMiembro: 'PROTAGONISTA' | 'EDUCADOR';
    requiereRamaDto?: boolean;
    tipoUnidadDto?: TipoUnidad;
    requiereRamaActual?: boolean;
    tipoUnidadActual?: TipoUnidad;
    permisos: readonly string[];
    permisosAlcance?: Record<string, AlcanceRol>;
    validarPermisos: boolean;
  }): {
    tipoMiembro: 'PROTAGONISTA' | 'EDUCADOR';
    requiereRama: boolean;
    tipoUnidad: TipoUnidad;
    normPermisos: ReturnType<typeof normalizarYValidarPermisosConAlcance>;
  } {
    const {
      alcancePorDefecto,
      tipoMiembro,
      requiereRamaDto,
      tipoUnidadDto,
      requiereRamaActual,
      tipoUnidadActual,
      permisos,
      permisosAlcance,
      validarPermisos,
    } = params;

    let requiereRama: boolean;
    let tipoUnidad: TipoUnidad;

    if (tipoUnidadDto !== undefined && requiereRamaDto !== undefined) {
      const esperaRama = tipoUnidadDto === TipoUnidad.SECCION_RAMA;
      if (esperaRama !== requiereRamaDto) {
        throw new BadRequestException(
          `Configuración inconsistente: tipoUnidad=${tipoUnidadDto} requiere requiereRama=${esperaRama}`,
        );
      }
      tipoUnidad = tipoUnidadDto;
      requiereRama = requiereRamaDto;
    } else if (tipoUnidadDto !== undefined) {
      tipoUnidad = tipoUnidadDto;
      requiereRama = tipoUnidadDto === TipoUnidad.SECCION_RAMA;
    } else if (requiereRamaDto !== undefined) {
      requiereRama = requiereRamaDto;
      tipoUnidad = requiereRama
        ? TipoUnidad.SECCION_RAMA
        : tipoUnidadActual && tipoUnidadActual !== TipoUnidad.SECCION_RAMA
          ? tipoUnidadActual
          : alcancePorDefecto === AlcanceRol.GLOBAL
            ? TipoUnidad.JEFATURA
            : TipoUnidad.SIN_RAMA_APOYO;
    } else {
      requiereRama = requiereRamaActual ?? alcancePorDefecto !== AlcanceRol.GLOBAL;
      tipoUnidad =
        tipoUnidadActual && (tipoUnidadActual === TipoUnidad.SECCION_RAMA) === requiereRama
          ? tipoUnidadActual
          : requiereRama
            ? TipoUnidad.SECCION_RAMA
            : alcancePorDefecto === AlcanceRol.GLOBAL
              ? TipoUnidad.JEFATURA
              : TipoUnidad.SIN_RAMA_APOYO;
    }

    if (tipoMiembro === 'PROTAGONISTA' && !permisosAlcance) {
      if (
        alcancePorDefecto !== AlcanceRol.PROPIO ||
        !requiereRama ||
        tipoUnidad !== TipoUnidad.SECCION_RAMA
      ) {
        throw new BadRequestException(
          'Los roles de tipo PROTAGONISTA deben tener alcance PROPIO y pertenecer a una sección de rama (SECCION_RAMA).',
        );
      }
    }

    const normPermisos = validarPermisos
      ? normalizarYValidarPermisosConAlcance({
          permisos,
          permisosAlcance,
          alcancePorDefecto,
        })
      : {
          permisos: [...new Set(permisos)].sort(),
          permisosAlcance:
            permisosAlcance ??
            Object.fromEntries([...new Set(permisos)].map((c) => [c, alcancePorDefecto])),
          alcanceMaximo: alcancePorDefecto,
        };

    return { tipoMiembro, requiereRama, tipoUnidad, normPermisos };
  }

  private async mapaIdsDePermisos(
    claves: string[],
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<Map<string, number>> {
    const unicas = [...new Set(claves)];
    if (unicas.length === 0) return new Map();
    const permisos = await tx.permiso.findMany({ where: { clave: { in: unicas } } });
    const faltantes = unicas.filter((c) => !permisos.some((p) => p.clave === c));
    if (faltantes.length) throw new BadRequestException(`Permisos inexistentes: ${faltantes.join(', ')}`);
    return new Map(permisos.map((p) => [p.clave, p.id]));
  }

  /**
   * Verifica de forma independiente que el sistema nunca se quede sin al menos un rol
   * administrador activo (rol activo con el permiso crítico en alcance GLOBAL asignado a usuario y sección activos)
   * para cada permiso crítico en `capacidadesPerdidas`.
   */
  private async asegurarNoBloquearUltimoAdmin(
    rolId: number,
    capacidadesPerdidas: readonly string[],
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<void> {
    if (capacidadesPerdidas.length === 0 || !tx.rol.findMany) return;
    const todosRoles = await tx.rol.findMany({ include: ROL_INCLUDE });
    if (!Array.isArray(todosRoles) || todosRoles.length === 0) return;

    const actual = todosRoles.find((r) => r.id === rolId);
    if (!actual) return;

    for (const cap of capacidadesPerdidas) {
      const otrosAdmins = todosRoles.filter(
        (r) =>
          r.id !== rolId &&
          r.activo !== false &&
          rolTienePermisoConAlcanceGlobal(r, cap),
      );
      if (otrosAdmins.length === 0) {
        throw new BadRequestException(
          `No se puede quitar el permiso de administrar roles ni eliminar el último rol administrador del sistema (permiso "${cap}"), para evitar que el grupo quede bloqueado.`,
        );
      }

      if (tx.asignacionMiembro?.findMany) {
        const otroAdminIds = otrosAdmins.map((r) => r.id);
        const [asignacionesActual, asignacionesOtros] = await Promise.all([
          tx.asignacionMiembro.findMany({
            where: { rolId, activo: true, usuario: { activo: true }, unidad: { activa: true } },
            select: { id: true },
          }),
          tx.asignacionMiembro.findMany({
            where: { rolId: { in: otroAdminIds }, activo: true, usuario: { activo: true }, unidad: { activa: true } },
            select: { id: true },
          }),
        ]);
        if (asignacionesActual.length > 0 && asignacionesOtros.length === 0) {
          throw new BadRequestException(
            `Este es el único rol administrador con personas activas asignadas para el permiso "${cap}". Asigná otro rol equivalente antes de modificarlo.`,
          );
        }
      } else {
        const actualTieneMiembros = (actual._count?.asignaciones ?? 0) > 0;
        const otrosTienenMiembros = otrosAdmins.some((r) => (r._count?.asignaciones ?? 0) > 0);
        if (actualTieneMiembros && !otrosTienenMiembros) {
          throw new BadRequestException(
            `Este es el único rol administrador con personas activas asignadas para el permiso "${cap}". Asigná otro rol equivalente antes de modificarlo.`,
          );
        }
      }
    }
  }

  async crearRol(actor: AuthUser, alcance: AlcanceAcceso, dto: CrearRolDto) {
    this.assertGlobal(alcance);
    const mapaPreValidacion = Object.fromEntries(
      dto.permisos.map((clave) => [
        clave,
        dto.permisosAlcance?.[clave] ?? dto.alcancePorDefecto ?? AlcanceRol.PROPIO,
      ]),
    ) as Record<string, AlcanceRol>;
    assertActorCubrePermisosConAlcance(
      actor,
      mapaPreValidacion,
      'No puede crear un rol con permisos o alcances superiores a los suyos',
    );
    const normPre = normalizarYValidarPermisosConAlcance({
      permisos: dto.permisos,
      permisosAlcance: dto.permisosAlcance,
      alcancePorDefecto: dto.alcancePorDefecto,
    });
    const alcanceEfectivoRol = dto.alcancePorDefecto ?? normPre.alcanceMaximo;
    assertActorCubrePermisosConAlcance(
      actor,
      normPre.permisosAlcance,
      'No puede crear un rol con permisos o alcances superiores a los suyos',
    );
    const tipoMiembroInicial =
      dto.tipoMiembro ?? (alcanceEfectivoRol === AlcanceRol.PROPIO ? 'PROTAGONISTA' : 'EDUCADOR');
    const config = this.resolverYValidarConfiguracionRol({
      alcancePorDefecto: alcanceEfectivoRol,
      tipoMiembro: tipoMiembroInicial,
      requiereRamaDto: dto.requiereRama,
      tipoUnidadDto: dto.tipoUnidad,
      permisos: normPre.permisos,
      permisosAlcance: dto.permisosAlcance,
      validarPermisos: false,
    });
    const idPorClave = await this.mapaIdsDePermisos(normPre.permisos);

    const rol = await this.prisma.rol.create({
      data: {
        nombre: dto.nombre,
        alcancePorDefecto: alcanceEfectivoRol,
        tipoMiembro: config.tipoMiembro,
        requiereRama: config.requiereRama,
        tipoUnidad: config.tipoUnidad,
        esSistema: false,
        activo: true,
        permisos: {
          create: normPre.permisos.map((clave) => ({
            permisoId: idPorClave.get(clave)!,
            alcance: normPre.permisosAlcance[clave],
          })),
        },
      },
      include: ROL_INCLUDE,
    });
    return this.mapRol(rol);
  }

  async editarRol(actor: AuthUser, alcance: AlcanceAcceso, id: number, dto: EditarRolDto) {
    this.assertGlobal(alcance);
    const rol = await this.runInTx(async (tx) => {
      const actual = await tx.rol.findUnique({ where: { id }, include: ROL_INCLUDE });
      if (!actual) throw new NotFoundException('Rol no encontrado');

      const permisosActualesConAlcance = extraerPermisosConAlcanceRol(actual);
      const mapaActual = Object.fromEntries(
        permisosActualesConAlcance.map((p) => [p.clave, p.alcance]),
      ) as Record<string, AlcanceRol>;
      assertActorCubrePermisosConAlcance(
        actor,
        mapaActual,
        'No puede modificar un rol que posee permisos superiores a los suyos',
      );

      if (actual.esSistema && dto.activo === false) {
        throw new BadRequestException(`El rol base del sistema "${actual.nombre}" no puede archivarse.`);
      }
      if (dto.activo === false && (actual._count?.asignaciones ?? 0) > 0) {
        throw new ConflictException(
          `No se puede archivar el rol "${actual.nombre}" porque hay ${actual._count.asignaciones} persona(s) activa(s) asignada(s).`,
        );
      }

      const cambiaPermisos =
        dto.permisos !== undefined ||
        dto.permisosAlcance !== undefined ||
        dto.alcancePorDefecto !== undefined;
      const permisosEntrada = dto.permisos ?? extraerClavesPermisosRol(actual);
      const permisosAlcanceEntrada =
        dto.permisosAlcance ??
        (dto.permisos === undefined && dto.alcancePorDefecto === undefined ? mapaActual : undefined);

      if (cambiaPermisos) {
        const alcancePre = dto.alcancePorDefecto ?? actual.alcancePorDefecto;
        const mapaPreEdit = Object.fromEntries(
          permisosEntrada.map((clave) => [
            clave,
            permisosAlcanceEntrada?.[clave] ?? alcancePre,
          ]),
        ) as Record<string, AlcanceRol>;
        assertActorCubrePermisosConAlcance(
          actor,
          mapaPreEdit,
          'No puede otorgar permisos o alcances superiores a los suyos',
        );
      }

      const norm = cambiaPermisos
        ? normalizarYValidarPermisosConAlcance({
            permisos: permisosEntrada,
            permisosAlcance: permisosAlcanceEntrada,
            alcancePorDefecto: dto.alcancePorDefecto ?? actual.alcancePorDefecto,
          })
        : {
            permisos: extraerClavesPermisosRol(actual),
            permisosAlcance: mapaActual,
            alcanceMaximo: actual.alcancePorDefecto,
          };

      if (cambiaPermisos) {
        assertActorCubrePermisosConAlcance(
          actor,
          norm.permisosAlcance,
          'No puede otorgar permisos o alcances superiores a los suyos',
        );
      }

      const nuevoAlcance =
        dto.alcancePorDefecto ??
        (dto.permisosAlcance ? norm.alcanceMaximo : actual.alcancePorDefecto);
      const nuevoTipoMiembro =
        (dto.tipoMiembro ??
          (dto.permisosAlcance
            ? nuevoAlcance === AlcanceRol.PROPIO
              ? 'PROTAGONISTA'
              : 'EDUCADOR'
            : (actual.tipoMiembro ??
              (nuevoAlcance === AlcanceRol.PROPIO ? 'PROTAGONISTA' : 'EDUCADOR')))) as
          | 'PROTAGONISTA'
          | 'EDUCADOR';
      const config = this.resolverYValidarConfiguracionRol({
        alcancePorDefecto: nuevoAlcance,
        tipoMiembro: nuevoTipoMiembro,
        requiereRamaDto: dto.requiereRama,
        tipoUnidadDto: dto.tipoUnidad,
        requiereRamaActual: actual.requiereRama,
        tipoUnidadActual: actual.tipoUnidad,
        permisos: norm.permisos,
        permisosAlcance: dto.permisosAlcance ? norm.permisosAlcance : undefined,
        validarPermisos: false,
      });

      const estabaActivo = actual.activo ?? true;
      const nuevoActivo = dto.activo ?? estabaActivo;
      const capacidadesPrevias = estabaActivo
        ? PERMISOS_CRITICOS_ADMIN.filter((cap) => rolTienePermisoConAlcanceGlobal(actual, cap))
        : [];
      const capacidadesPerdidas = capacidadesPrevias.filter(
        (cap) => !nuevoActivo || norm.permisosAlcance[cap] !== AlcanceRol.GLOBAL,
      );

      if (capacidadesPerdidas.length > 0) {
        await this.asegurarNoBloquearUltimoAdmin(id, capacidadesPerdidas, tx);
      }

      const idPorClave = cambiaPermisos ? await this.mapaIdsDePermisos(norm.permisos, tx) : null;
      if (idPorClave) {
        await tx.rolPermiso.deleteMany({ where: { rolId: id } });
        if (norm.permisos.length > 0) {
          await tx.rolPermiso.createMany({
            data: norm.permisos.map((clave) => ({
              rolId: id,
              permisoId: idPorClave.get(clave)!,
              alcance: norm.permisosAlcance[clave],
            })),
          });
        }
      }
      return tx.rol.update({
        where: { id },
        data: {
          nombre: dto.nombre,
          alcancePorDefecto:
            dto.alcancePorDefecto !== undefined || dto.permisosAlcance !== undefined
              ? nuevoAlcance
              : undefined,
          tipoMiembro:
            dto.tipoMiembro !== undefined || dto.permisosAlcance !== undefined
              ? config.tipoMiembro
              : undefined,
          requiereRama:
            dto.requiereRama !== undefined || dto.tipoUnidad !== undefined ? config.requiereRama : undefined,
          tipoUnidad:
            dto.requiereRama !== undefined || dto.tipoUnidad !== undefined ? config.tipoUnidad : undefined,
          activo: dto.activo,
        },
        include: ROL_INCLUDE,
      });
    });
    return this.mapRol(rol);
  }

  async eliminarRol(actor: AuthUser, alcance: AlcanceAcceso, id: number) {
    this.assertGlobal(alcance);
    return this.runInTx(async (tx) => {
      const rol = await tx.rol.findUnique({
        where: { id },
        include: {
          ...ROL_INCLUDE,
          asignaciones: {
            where: { activo: true },
            take: 5,
            include: {
              usuario: { select: { nombre: true, apellido: true } },
            },
          },
        },
      });
      if (!rol) throw new NotFoundException('Rol no encontrado');

      const permisosAlcanceRol = Object.fromEntries(
        extraerPermisosConAlcanceRol(rol).map((p) => [p.clave, p.alcance]),
      ) as Record<string, AlcanceRol>;
      assertActorCubrePermisosConAlcance(
        actor,
        permisosAlcanceRol,
        'No puede eliminar un rol que posee permisos superiores a los suyos',
      );

      if (rol.esSistema) {
        throw new BadRequestException(
          `El rol base del sistema "${rol.nombre}" no puede eliminarse ni archivarse.`,
        );
      }

      if (rol._count.asignaciones > 0) {
        const nombres = (rol.asignaciones || [])
          .map((a) => `${a.usuario?.nombre || ''} ${a.usuario?.apellido || ''}`.trim())
          .filter(Boolean);
        const detalleNombres = nombres.length > 0 ? ` (${nombres.join(', ')})` : '';
        throw new ConflictException(
          `No se puede eliminar el rol "${rol.nombre}" porque hay ${rol._count.asignaciones} persona(s) activa(s) usándolo actualmente${detalleNombres}. Cambiales el rol antes de eliminarlo.`,
        );
      }

      const capacidadesCriticas =
        (rol.activo ?? true)
          ? PERMISOS_CRITICOS_ADMIN.filter((cap) => rolTienePermisoConAlcanceGlobal(rol, cap))
          : [];
      if (capacidadesCriticas.length > 0) {
        await this.asegurarNoBloquearUltimoAdmin(id, capacidadesCriticas, tx);
      }

      const totalHistoricoAsig = tx.asignacionMiembro?.count
        ? await tx.asignacionMiembro.count({ where: { rolId: id } })
        : 0;
      const totalSolicitudesPase = tx.solicitudPase?.count
        ? await tx.solicitudPase.count({ where: { rolDestinoId: id } })
        : 0;

      if (totalHistoricoAsig > 0 || totalSolicitudesPase > 0) {
        await tx.rol.update({ where: { id }, data: { activo: false } });
        return {
          eliminado: false,
          archivado: true,
          mensaje: `Rol "${rol.nombre}" archivado (se conserva para preservar el historial de asignaciones y pases).`,
        };
      }

      await tx.rol.delete({ where: { id } });
      return {
        eliminado: true,
        archivado: false,
        mensaje: `Rol "${rol.nombre}" eliminado correctamente`,
      };
    });
  }

  private mapRol(r: Prisma.RolGetPayload<{ include: typeof ROL_INCLUDE }>) {
    const permisosConAlcance = extraerPermisosConAlcanceRol(r);
    const permisos = permisosConAlcance.map((p) => p.clave).sort();
    const permisosAlcance = Object.fromEntries(
      permisosConAlcance.map((p) => [p.clave, p.alcance]),
    ) as Record<string, AlcanceRol>;
    const tipoMiembro =
      r.tipoMiembro || (r.alcancePorDefecto === AlcanceRol.PROPIO ? 'PROTAGONISTA' : 'EDUCADOR');
    const requiereRama =
      r.requiereRama !== undefined && r.requiereRama !== null
        ? r.requiereRama
        : r.alcancePorDefecto !== AlcanceRol.GLOBAL;
    const tipoUnidad =
      r.tipoUnidad ??
      (requiereRama
        ? TipoUnidad.SECCION_RAMA
        : r.alcancePorDefecto === AlcanceRol.GLOBAL
          ? TipoUnidad.JEFATURA
          : TipoUnidad.SIN_RAMA_APOYO);
    return {
      id: r.id,
      nombre: r.nombre,
      alcancePorDefecto: r.alcancePorDefecto,
      tipoMiembro,
      requiereRama,
      tipoUnidad,
      esSistema: r.esSistema,
      activo: r.activo ?? true,
      esRolAdministrador:
        rolTienePermisoConAlcanceGlobal(r, 'roles.editar') ||
        rolTienePermisoConAlcanceGlobal(r, 'organizacion.editar'),
      asignacionesActivas: r._count.asignaciones,
      permisos,
      permisosAlcance,
    };
  }

  // ---------------- Permisos ----------------
  async listarPermisos() {
    const permisos = await this.prisma.permiso.findMany({ orderBy: { clave: 'asc' } });
    return permisos.map((p) => {
      const meta = CATALOGO_PERMISOS_MAP.get(p.clave);
      return {
        id: p.id,
        clave: p.clave,
        modulo: meta?.modulo ?? 'Otros',
        nombre: meta?.nombre ?? p.clave,
        descripcion: p.descripcion ?? meta?.descripcion ?? null,
        alcanceMinimo: meta?.alcanceMinimo ?? AlcanceRol.GLOBAL,
        requiere: meta ? [...meta.requiere] : [],
      };
    });
  }
}
