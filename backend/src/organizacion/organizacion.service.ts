import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AlcanceRol, TipoUnidad, type Prisma } from '@prisma/client';
import { assertUnidadEnAlcance } from '../common/scope/alcance.util.js';
import type { AlcanceAcceso } from '../common/types/auth.types.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  CrearPermisoDto,
  CrearRamaDto,
  CrearRolDto,
  CrearUnidadDto,
  EditarPermisoDto,
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
  listarRamas(incluirInactivas: boolean) {
    return this.prisma.rama.findMany({
      where: incluirInactivas ? {} : { activa: true },
      orderBy: { ordenProgresion: 'asc' },
      include: {
        unidades: {
          where: incluirInactivas ? {} : { activa: true },
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
    const actual = await this.prisma.rama.findUnique({ where: { id } });
    if (!actual) throw new NotFoundException('Rama no encontrada');
    const min = dto.edadMinima ?? actual.edadMinima;
    const max = dto.edadMaxima ?? actual.edadMaxima;
    if (min > max) throw new BadRequestException('edadMaxima debe ser >= edadMinima');
    return this.prisma.rama.update({
      where: { id },
      data: dto,
      include: { unidades: { select: { id: true, nombre: true, activa: true } } },
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
  listarUnidades(incluirInactivas: boolean) {
    return this.prisma.unidadOrganizativa.findMany({
      where: incluirInactivas ? {} : { activa: true },
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

    const asignaciones = unidad.asignaciones.map((a) => {
      const miembroData = {
        id: a.usuario.id,
        nombre: a.usuario.nombre,
        apellido: a.usuario.apellido,
        dni: a.usuario.dni,
        activo: a.usuario.activo,
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
          id: a.rol.id,
          nombre: a.rol.nombre,
          tipoMiembro: a.rol.tipoMiembro || 'EDUCADOR',
        },
      };
    });

    const ciclos = [...new Set(asignaciones.map((a) => a.cicloAnio))].sort((a, b) => b - a);

    const educadoresIds = new Set(
      asignaciones
        .filter((a) => {
          const tm = (a.rol.tipoMiembro || '').toUpperCase();
          return tm === 'EDUCADOR' || tm === 'ADULTO';
        })
        .map((a) => a.usuarioId),
    );
    const protagonistasIds = new Set(
      asignaciones
        .filter((a) => (a.rol.tipoMiembro || '').toUpperCase() === 'PROTAGONISTA')
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

  async editarUnidad(alcance: AlcanceAcceso, id: number, dto: EditarUnidadDto) {
    this.assertGlobal(alcance);
    const actual = await this.prisma.unidadOrganizativa.findUnique({ where: { id } });
    if (!actual) throw new NotFoundException('Unidad no encontrada');
    const tipo = dto.tipo ?? actual.tipo;
    const ramaId = dto.ramaId !== undefined ? dto.ramaId : actual.ramaId;
    await this.validarRamaDeUnidad(tipo, ramaId);
    return this.prisma.unidadOrganizativa.update({ where: { id }, data: { ...dto, ramaId } });
  }

  async eliminarUnidad(alcance: AlcanceAcceso, id: number, definitivo: boolean = false) {
    this.assertGlobal(alcance);
    const unidad = await this.prisma.unidadOrganizativa.findUnique({
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

      await this.prisma.unidadOrganizativa.delete({ where: { id } });
      return {
        eliminada: true,
        desactivada: false,
        mensaje: `Sección "${unidad.nombre}" eliminada definitivamente.`,
      };
    }

    await this.prisma.unidadOrganizativa.update({
      where: { id },
      data: { activa: false },
    });

    return {
      eliminada: false,
      desactivada: true,
      mensaje: `Sección "${unidad.nombre}" desactivada.`,
    };
  }

  // ---------------- Roles ----------------
  async listarRoles() {
    const roles = await this.prisma.rol.findMany({ orderBy: { id: 'asc' }, include: ROL_INCLUDE });
    return roles.map((r) => this.mapRol(r));
  }

  private async idsDePermisos(claves: string[]): Promise<number[]> {
    const unicas = [...new Set(claves)];
    const permisos = await this.prisma.permiso.findMany({ where: { clave: { in: unicas } } });
    const faltantes = unicas.filter((c) => !permisos.some((p) => p.clave === c));
    if (faltantes.length) throw new BadRequestException(`Permisos inexistentes: ${faltantes.join(', ')}`);
    return permisos.map((p) => p.id);
  }

  /**
   * Verifica que el sistema nunca se quede sin al menos un rol administrador (con alcance GLOBAL
   * y permiso `organizacion.gestionar`). Valida por capacidades dinámicas, nunca por nombre fijo.
   */
  private async asegurarNoBloquearUltimoAdmin(rolId: number): Promise<void> {
    if (!this.prisma.rol.findMany) return;
    const todosRoles = await this.prisma.rol.findMany({ include: ROL_INCLUDE });
    if (!Array.isArray(todosRoles) || todosRoles.length === 0) return;

    const esRolAdmin = (r: Prisma.RolGetPayload<{ include: typeof ROL_INCLUDE }>) =>
      r.alcancePorDefecto === AlcanceRol.GLOBAL &&
      r.permisos?.some((rp) => rp.permiso?.clave === 'organizacion.gestionar');

    const actual = todosRoles.find((r) => r.id === rolId);
    if (!actual || !esRolAdmin(actual)) return;

    const otrosAdmins = todosRoles.filter((r) => r.id !== rolId && esRolAdmin(r));
    if (otrosAdmins.length === 0) {
      throw new BadRequestException(
        'No se puede quitar el permiso de administrar roles ni eliminar el último rol administrador del sistema, para evitar que el grupo quede bloqueado.',
      );
    }

    const actualTieneMiembros = (actual._count?.asignaciones ?? 0) > 0;
    const otrosTienenMiembros = otrosAdmins.some((r) => (r._count?.asignaciones ?? 0) > 0);
    if (actualTieneMiembros && !otrosTienenMiembros) {
      throw new BadRequestException(
        'Este es el único rol administrador con personas activas asignadas. Asigná otro rol administrador a al menos una persona antes de quitarle estos permisos.',
      );
    }
  }

  async crearRol(alcance: AlcanceAcceso, dto: CrearRolDto) {
    this.assertGlobal(alcance);
    const permisoIds = await this.idsDePermisos(dto.permisos);
    const tipoMiembro =
      dto.tipoMiembro ?? (dto.alcancePorDefecto === AlcanceRol.PROPIO ? 'PROTAGONISTA' : 'EDUCADOR');
    const requiereRama =
      dto.requiereRama ?? (dto.alcancePorDefecto !== AlcanceRol.GLOBAL);

    const rol = await this.prisma.rol.create({
      data: {
        nombre: dto.nombre,
        alcancePorDefecto: dto.alcancePorDefecto,
        tipoMiembro,
        requiereRama,
        esSistema: false,
        permisos: { create: permisoIds.map((permisoId) => ({ permisoId })) },
      },
      include: ROL_INCLUDE,
    });
    return this.mapRol(rol);
  }

  async editarRol(alcance: AlcanceAcceso, id: number, dto: EditarRolDto) {
    this.assertGlobal(alcance);
    const actual = await this.prisma.rol.findUnique({ where: { id }, include: ROL_INCLUDE });
    if (!actual) throw new NotFoundException('Rol no encontrado');

    const nuevoAlcance = dto.alcancePorDefecto ?? actual.alcancePorDefecto;
    const nuevosPermisos = dto.permisos ?? actual.permisos?.map((rp) => rp.permiso.clave) ?? [];
    const pierdeCapacidadAdmin =
      nuevoAlcance !== AlcanceRol.GLOBAL ||
      !nuevosPermisos.includes('organizacion.gestionar') ||
      !nuevosPermisos.includes('organizacion.ver');

    if (pierdeCapacidadAdmin) {
      await this.asegurarNoBloquearUltimoAdmin(id);
    }

    const permisoIds = dto.permisos ? await this.idsDePermisos(dto.permisos) : null;

    const rol = await this.prisma.$transaction(async (tx) => {
      if (permisoIds) {
        await tx.rolPermiso.deleteMany({ where: { rolId: id } });
        await tx.rolPermiso.createMany({ data: permisoIds.map((permisoId) => ({ rolId: id, permisoId })) });
      }
      return tx.rol.update({
        where: { id },
        data: {
          nombre: dto.nombre,
          alcancePorDefecto: dto.alcancePorDefecto,
          tipoMiembro: dto.tipoMiembro,
          requiereRama: dto.requiereRama,
        },
        include: ROL_INCLUDE,
      });
    });
    return this.mapRol(rol);
  }

  async eliminarRol(alcance: AlcanceAcceso, id: number) {
    this.assertGlobal(alcance);
    const rol = await this.prisma.rol.findUnique({
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

    if (rol._count.asignaciones > 0) {
      const nombres = (rol.asignaciones || [])
        .map((a) => `${a.usuario?.nombre || ''} ${a.usuario?.apellido || ''}`.trim())
        .filter(Boolean);
      const detalleNombres = nombres.length > 0 ? ` (${nombres.join(', ')})` : '';
      throw new ConflictException(
        `No se puede eliminar el rol "${rol.nombre}" porque hay ${rol._count.asignaciones} persona(s) activa(s) usándolo actualmente${detalleNombres}. Cambiales el rol antes de eliminarlo.`,
      );
    }

    await this.asegurarNoBloquearUltimoAdmin(id);

    await this.prisma.$transaction([
      this.prisma.asignacionMiembro.deleteMany({ where: { rolId: id, activo: false } }),
      this.prisma.rol.delete({ where: { id } }),
    ]);
    return { mensaje: `Rol "${rol.nombre}" eliminado correctamente` };
  }

  private mapRol(r: Prisma.RolGetPayload<{ include: typeof ROL_INCLUDE }>) {
    const permisos = r.permisos.map((rp) => rp.permiso.clave).sort();
    const tipoMiembro =
      r.tipoMiembro || (r.alcancePorDefecto === AlcanceRol.PROPIO ? 'PROTAGONISTA' : 'EDUCADOR');
    const requiereRama =
      r.requiereRama !== undefined && r.requiereRama !== null
        ? r.requiereRama
        : r.alcancePorDefecto !== AlcanceRol.GLOBAL;
    return {
      id: r.id,
      nombre: r.nombre,
      alcancePorDefecto: r.alcancePorDefecto,
      tipoMiembro,
      requiereRama,
      esSistema: r.esSistema,
      esRolAdministrador:
        r.alcancePorDefecto === AlcanceRol.GLOBAL && permisos.includes('organizacion.gestionar'),
      asignacionesActivas: r._count.asignaciones,
      permisos,
    };
  }

  // ---------------- Permisos ----------------
  listarPermisos() {
    return this.prisma.permiso.findMany({ orderBy: { clave: 'asc' } });
  }

  async crearPermiso(alcance: AlcanceAcceso, dto: CrearPermisoDto) {
    this.assertGlobal(alcance);
    return this.prisma.permiso.create({ data: dto });
  }

  async editarPermiso(alcance: AlcanceAcceso, id: number, dto: EditarPermisoDto) {
    this.assertGlobal(alcance);
    return this.prisma.permiso.update({ where: { id }, data: dto });
  }
}
