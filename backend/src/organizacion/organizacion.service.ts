import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TipoUnidad, type Prisma } from '@prisma/client';
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

  async eliminarRama(alcance: AlcanceAcceso, id: number) {
    this.assertGlobal(alcance);
    const rama = await this.prisma.rama.findUnique({
      where: { id },
      include: {
        unidades: {
          include: {
            _count: {
              select: {
                asignaciones: true,
                conceptosPago: true,
                planesCuotaMensual: true,
              },
            },
          },
        },
      },
    });
    if (!rama) throw new NotFoundException('Rama no encontrada');

    const asignacionesActivas = await this.prisma.asignacionMiembro.count({
      where: { activo: true, unidad: { ramaId: id } },
    });
    if (asignacionesActivas > 0) {
      throw new ConflictException(
        `La rama "${rama.nombre}" tiene ${asignacionesActivas} miembro(s) activo(s). Pasalos a otra rama antes de quitarla.`,
      );
    }

    const tieneHistorial = rama.unidades.some(
      (u) => u._count.asignaciones > 0 || u._count.conceptosPago > 0 || u._count.planesCuotaMensual > 0,
    );

    if (tieneHistorial) {
      await this.prisma.$transaction([
        this.prisma.unidadOrganizativa.updateMany({ where: { ramaId: id }, data: { activa: false } }),
        this.prisma.rama.update({ where: { id }, data: { activa: false } }),
      ]);
      return {
        eliminada: false,
        desactivada: true,
        mensaje: `Rama "${rama.nombre}" desactivada (conserva historial de miembros y cuotas).`,
      };
    }

    await this.prisma.$transaction([
      this.prisma.unidadOrganizativa.deleteMany({ where: { ramaId: id } }),
      this.prisma.rama.delete({ where: { id } }),
    ]);
    return {
      eliminada: true,
      desactivada: false,
      mensaje: `Rama "${rama.nombre}" eliminada definitivamente.`,
    };
  }

  // ---------------- Unidades ----------------
  listarUnidades(incluirInactivas: boolean) {
    return this.prisma.unidadOrganizativa.findMany({
      where: incluirInactivas ? {} : { activa: true },
      orderBy: [{ rama: { ordenProgresion: 'asc' } }, { nombre: 'asc' }],
      include: {
        rama: { select: { id: true, nombre: true, edadMinima: true, edadMaxima: true } },
        _count: { select: { asignaciones: { where: { activo: true } } } },
      },
    });
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

  async eliminarUnidad(alcance: AlcanceAcceso, id: number) {
    this.assertGlobal(alcance);
    const unidad = await this.prisma.unidadOrganizativa.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            asignaciones: true,
            conceptosPago: true,
            planesCuotaMensual: true,
          },
        },
      },
    });
    if (!unidad) throw new NotFoundException('Sección no encontrada');

    const activas = await this.prisma.asignacionMiembro.count({
      where: { unidadId: id, activo: true },
    });
    if (activas > 0) {
      throw new ConflictException(
        `La sección "${unidad.nombre}" tiene ${activas} miembro(s) activo(s). Movelos a otra sección antes de quitarla.`,
      );
    }

    const tieneHistorial =
      unidad._count.asignaciones > 0 ||
      unidad._count.conceptosPago > 0 ||
      unidad._count.planesCuotaMensual > 0;

    if (tieneHistorial) {
      await this.prisma.unidadOrganizativa.update({ where: { id }, data: { activa: false } });
      return {
        eliminada: false,
        desactivada: true,
        mensaje: `Sección "${unidad.nombre}" desactivada.`,
      };
    }

    await this.prisma.unidadOrganizativa.delete({ where: { id } });
    return {
      eliminada: true,
      desactivada: false,
      mensaje: `Sección "${unidad.nombre}" eliminada.`,
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

  async crearRol(alcance: AlcanceAcceso, dto: CrearRolDto) {
    this.assertGlobal(alcance);
    const permisoIds = await this.idsDePermisos(dto.permisos);
    const rol = await this.prisma.rol.create({
      data: {
        nombre: dto.nombre,
        alcancePorDefecto: dto.alcancePorDefecto,
        esSistema: false,
        permisos: { create: permisoIds.map((permisoId) => ({ permisoId })) },
      },
      include: ROL_INCLUDE,
    });
    return this.mapRol(rol);
  }

  async editarRol(alcance: AlcanceAcceso, id: number, dto: EditarRolDto) {
    this.assertGlobal(alcance);
    const actual = await this.prisma.rol.findUnique({ where: { id } });
    if (!actual) throw new NotFoundException('Rol no encontrado');
    if (actual.esSistema && dto.nombre !== undefined && dto.nombre !== actual.nombre) {
      throw new ForbiddenException('No se puede renombrar un rol base del sistema');
    }

    // Protección anti-bloqueo para Jefe de Grupo
    if (actual.nombre.toLowerCase().includes('jefe') && dto.permisos) {
      if (!dto.permisos.includes('organizacion.gestionar') || !dto.permisos.includes('organizacion.ver')) {
        throw new BadRequestException(
          'El rol Jefe de Grupo debe conservar los permisos de administración organizacional para no bloquear el sistema',
        );
      }
    }

    const permisoIds = dto.permisos ? await this.idsDePermisos(dto.permisos) : null;

    const rol = await this.prisma.$transaction(async (tx) => {
      if (permisoIds) {
        await tx.rolPermiso.deleteMany({ where: { rolId: id } });
        await tx.rolPermiso.createMany({ data: permisoIds.map((permisoId) => ({ rolId: id, permisoId })) });
      }
      return tx.rol.update({
        where: { id },
        data: { nombre: dto.nombre, alcancePorDefecto: dto.alcancePorDefecto },
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
        _count: {
          select: {
            asignaciones: { where: { activo: true } },
          },
        },
      },
    });
    if (!rol) throw new NotFoundException('Rol no encontrado');
    if (rol.esSistema) throw new ForbiddenException('No se puede eliminar un rol base del sistema');
    if (rol._count.asignaciones > 0) {
      throw new ConflictException(
        `El rol "${rol.nombre}" tiene ${rol._count.asignaciones} miembro(s) activo(s); cambiá su rol antes de eliminarlo`,
      );
    }
    await this.prisma.$transaction([
      this.prisma.asignacionMiembro.deleteMany({ where: { rolId: id, activo: false } }),
      this.prisma.rol.delete({ where: { id } }),
    ]);
    return { mensaje: `Rol "${rol.nombre}" eliminado` };
  }

  private mapRol(r: Prisma.RolGetPayload<{ include: typeof ROL_INCLUDE }>) {
    return {
      id: r.id,
      nombre: r.nombre,
      alcancePorDefecto: r.alcancePorDefecto,
      esSistema: r.esSistema,
      asignacionesActivas: r._count.asignaciones,
      permisos: r.permisos.map((rp) => rp.permiso.clave).sort(),
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
