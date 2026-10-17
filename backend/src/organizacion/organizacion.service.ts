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
      include: { unidades: { where: { activa: true }, select: { id: true, nombre: true } } },
    });
  }

  async crearRama(alcance: AlcanceAcceso, dto: CrearRamaDto) {
    this.assertGlobal(alcance);
    return this.prisma.rama.create({ data: dto });
  }

  async editarRama(alcance: AlcanceAcceso, id: number, dto: EditarRamaDto) {
    this.assertGlobal(alcance);
    const actual = await this.prisma.rama.findUnique({ where: { id } });
    if (!actual) throw new NotFoundException('Rama no encontrada');
    const min = dto.edadMinima ?? actual.edadMinima;
    const max = dto.edadMaxima ?? actual.edadMaxima;
    if (min > max) throw new BadRequestException('edadMaxima debe ser >= edadMinima');
    return this.prisma.rama.update({ where: { id }, data: dto });
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

  // ---------------- Roles ----------------
  async listarRoles() {
    const roles = await this.prisma.rol.findMany({ orderBy: { nombre: 'asc' }, include: ROL_INCLUDE });
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
      throw new ForbiddenException('No se puede renombrar un rol de sistema');
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
      include: { _count: { select: { asignaciones: true } } },
    });
    if (!rol) throw new NotFoundException('Rol no encontrado');
    if (rol.esSistema) throw new ForbiddenException('No se puede eliminar un rol de sistema');
    if (rol._count.asignaciones > 0) {
      throw new ConflictException('El rol tiene asignaciones (incluido el historial); no puede eliminarse');
    }
    await this.prisma.rol.delete({ where: { id } });
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
