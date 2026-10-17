import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AlcanceRol, type Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import {
  alcanceEfectivo,
  assertPuedeOtorgar,
  assertUnidadEnAlcance,
  filtroUsuariosPorAlcance,
} from '../common/scope/alcance.util.js';
import type { AlcanceAcceso, AuthUser } from '../common/types/auth.types.js';
import { anioActual, hoyUtc } from '../common/utils/fechas.util.js';
import { clavesCopiablesEntreHermanos, filtrarClaves } from '../common/utils/plantillas.util.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  CAMPOS_EDITABLES_PROPIOS,
  type CrearAsignacionDto,
  type CrearMiembroDto,
  type EditarMiembroDto,
  type ListarMiembrosDto,
} from './miembros.dto.js';

const BCRYPT_ROUNDS = 10;

/** Proyección segura: NUNCA incluye passwordHash. */
export const MIEMBRO_SELECT = {
  id: true,
  dni: true,
  nombre: true,
  apellido: true,
  fechaNacimiento: true,
  emailContacto: true,
  telefonoContacto: true,
  grupoFamiliarId: true,
  datosFijosJson: true,
  requiereCambioClave: true,
  activo: true,
  createdAt: true,
  updatedAt: true,
  grupoFamiliar: {
    select: {
      id: true,
      nombreFamilia: true,
      porcentajeDescuentoHermanos: true,
      miembros: {
        where: { activo: true },
        select: {
          id: true,
          nombre: true,
          apellido: true,
          dni: true,
          asignaciones: {
            where: { activo: true },
            select: {
              unidad: { select: { id: true, nombre: true } },
              rol: { select: { id: true, nombre: true } },
            },
          },
        },
      },
    },
  },
  asignaciones: {
    where: { activo: true },
    orderBy: { fechaInicio: 'desc' },
    select: {
      id: true,
      unidadId: true,
      rolId: true,
      cicloAnio: true,
      fechaInicio: true,
      alcanceOverride: true,
      unidad: {
        select: {
          id: true,
          nombre: true,
          tipo: true,
          ramaId: true,
          rama: { select: { id: true, nombre: true, ordenProgresion: true, edadMinima: true, edadMaxima: true } },
        },
      },
      rol: { select: { id: true, nombre: true, alcancePorDefecto: true } },
    },
  },
} satisfies Prisma.UsuarioSelect;

@Injectable()
export class MiembrosService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------- Padrón ----------------
  async listar(alcance: AlcanceAcceso, q: ListarMiembrosDto) {
    const where: Prisma.UsuarioWhereInput = {
      AND: [
        filtroUsuariosPorAlcance(alcance),
        q.incluirInactivos ? {} : { activo: true },
        q.unidadId ? { asignaciones: { some: { activo: true, unidadId: q.unidadId } } } : {},
        q.rolId ? { asignaciones: { some: { activo: true, rolId: q.rolId } } } : {},
        q.q
          ? {
              OR: [
                { nombre: { contains: q.q, mode: 'insensitive' } },
                { apellido: { contains: q.q, mode: 'insensitive' } },
                { dni: { contains: q.q, mode: 'insensitive' } },
              ],
            }
          : {},
      ],
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.usuario.count({ where }),
      this.prisma.usuario.findMany({
        where,
        select: MIEMBRO_SELECT,
        orderBy: [{ apellido: 'asc' }, { nombre: 'asc' }],
        skip: (q.pagina - 1) * q.porPagina,
        take: q.porPagina,
      }),
    ]);
    return { total, pagina: q.pagina, porPagina: q.porPagina, items };
  }

  async obtener(alcance: AlcanceAcceso, id: number) {
    const miembro = await this.prisma.usuario.findFirst({
      where: { AND: [{ id }, filtroUsuariosPorAlcance(alcance)] },
      select: MIEMBRO_SELECT,
    });
    if (!miembro) throw new NotFoundException('Miembro no encontrado en su alcance');
    return miembro;
  }

  // ---------------- Autocompletado por hermano ----------------
  /** Claves de `datosFijosJson` copiables entre hermanos, leídas de las plantillas activas. */
  private async clavesCopiables(tx: Prisma.TransactionClient = this.prisma): Promise<Set<string>> {
    const plantillas = await tx.plantillaFormulario.findMany({
      where: { activa: true },
      select: { esquemaCamposJson: true },
    });
    return clavesCopiablesEntreHermanos(plantillas.map((p) => p.esquemaCamposJson));
  }

  /**
   * Devuelve SOLO datos familiares compartibles de un hermano (contacto, grupo familiar
   * y campos de secciones con `permiteCopiarHermano`). Se permite buscar fuera del alcance
   * porque los hermanos suelen estar en ramas distintas.
   */
  async buscarHermano(dniHermano: string) {
    const hermano = await this.prisma.usuario.findUnique({
      where: { dni: dniHermano },
      select: {
        id: true,
        nombre: true,
        apellido: true,
        activo: true,
        emailContacto: true,
        telefonoContacto: true,
        datosFijosJson: true,
        grupoFamiliar: { select: { id: true, nombreFamilia: true } },
      },
    });
    if (!hermano || !hermano.activo) throw new NotFoundException('No se encontró un miembro activo con ese DNI');
    return {
      id: hermano.id,
      nombre: hermano.nombre,
      apellido: hermano.apellido,
      emailContacto: hermano.emailContacto,
      telefonoContacto: hermano.telefonoContacto,
      grupoFamiliar: hermano.grupoFamiliar,
      datosCompartidos: filtrarClaves(hermano.datosFijosJson, await this.clavesCopiables()),
    };
  }

  // ---------------- Alta ----------------
  async crear(alcance: AlcanceAcceso, dto: CrearMiembroDto) {
    assertUnidadEnAlcance(alcance, dto.unidadId);
    await this.validarUnidadYRol(alcance, dto.unidadId, dto.rolId);
    // La clave inicial es el DNI; se fuerza el cambio en el primer login.
    const passwordHash = await bcrypt.hash(dto.dni, BCRYPT_ROUNDS);

    const id = await this.prisma.$transaction(async (tx) => {
      let grupoFamiliarId: number | null = null;
      let email = dto.emailContacto ?? null;
      let telefono = dto.telefonoContacto ?? null;
      let datosFijos: Record<string, unknown> = dto.datosFijosJson ?? {};

      if (dto.hermanoDni) {
        if (dto.hermanoDni === dto.dni) throw new BadRequestException('El hermano no puede ser el mismo DNI');
        const hermano = await tx.usuario.findUnique({ where: { dni: dto.hermanoDni } });
        if (!hermano || !hermano.activo) throw new NotFoundException('Hermano no encontrado');

        grupoFamiliarId = hermano.grupoFamiliarId;
        if (grupoFamiliarId === null) {
          const grupo = await tx.grupoFamiliar.create({ data: { nombreFamilia: hermano.apellido } });
          grupoFamiliarId = grupo.id;
          await tx.usuario.update({ where: { id: hermano.id }, data: { grupoFamiliarId } });
        }
        if (dto.copiarDatosHermano) {
          email ??= hermano.emailContacto;
          telefono ??= hermano.telefonoContacto;
          datosFijos = { ...filtrarClaves(hermano.datosFijosJson, await this.clavesCopiables(tx)), ...datosFijos };
        }
      }

      const usuario = await tx.usuario.create({
        data: {
          dni: dto.dni,
          passwordHash,
          nombre: dto.nombre,
          apellido: dto.apellido,
          fechaNacimiento: new Date(dto.fechaNacimiento),
          emailContacto: email,
          telefonoContacto: telefono,
          grupoFamiliarId,
          datosFijosJson: datosFijos as Prisma.InputJsonObject,
          requiereCambioClave: true,
          asignaciones: {
            create: { unidadId: dto.unidadId, rolId: dto.rolId, cicloAnio: dto.cicloAnio ?? anioActual() },
          },
        },
      });
      return usuario.id;
    });
    return this.prisma.usuario.findUniqueOrThrow({ where: { id }, select: MIEMBRO_SELECT });
  }

  // ---------------- Edición ----------------
  async editar(actor: AuthUser, alcance: AlcanceAcceso, id: number, dto: EditarMiembroDto) {
    const objetivo = await this.prisma.usuario.findFirst({
      where: { AND: [{ id }, filtroUsuariosPorAlcance(alcance)] },
      include: { asignaciones: { where: { activo: true }, include: { rol: true } } },
    });
    if (!objetivo) throw new NotFoundException('Miembro no encontrado en su alcance');

    const esPropio = id === actor.sub;
    // Solo GLOBAL edita todo; quien edita su propia ficha (o tiene alcance PROPIO) solo contacto y datos fijos.
    if (alcance.tipo === 'PROPIO' || (esPropio && alcance.tipo !== 'GLOBAL')) {
      const prohibidos = Object.keys(dto).filter(
        (k) => !(CAMPOS_EDITABLES_PROPIOS as readonly string[]).includes(k),
      );
      if (prohibidos.length) throw new ForbiddenException(`No puede modificar: ${prohibidos.join(', ')}`);
    }
    if (alcance.tipo !== 'GLOBAL' && !esPropio) {
      if (objetivo.asignaciones.some((a) => alcanceEfectivo(a) === AlcanceRol.GLOBAL)) {
        throw new ForbiddenException('No puede modificar a un usuario con alcance global');
      }
    }

    let datosFijosJson: Prisma.InputJsonObject | undefined;
    if (dto.datosFijosJson) {
      const actual = (objetivo.datosFijosJson ?? {}) as Record<string, unknown>;
      const merged = { ...actual, ...dto.datosFijosJson };
      for (const [k, v] of Object.entries(dto.datosFijosJson)) if (v === null) delete merged[k];
      datosFijosJson = merged as Prisma.InputJsonObject;
    }

    return this.prisma.usuario.update({
      where: { id },
      data: {
        ...dto,
        fechaNacimiento: dto.fechaNacimiento ? new Date(dto.fechaNacimiento) : undefined,
        datosFijosJson,
      },
      select: MIEMBRO_SELECT,
    });
  }

  // ---------------- Asignaciones adicionales ----------------
  /** Agrega una asignación (ej. un Rover que además es Educador). No toca las existentes. */
  async agregarAsignacion(alcance: AlcanceAcceso, usuarioId: number, dto: CrearAsignacionDto) {
    if (alcance.tipo === 'PROPIO') throw new ForbiddenException('No puede gestionar asignaciones');
    assertUnidadEnAlcance(alcance, dto.unidadId);
    await this.validarUnidadYRol(alcance, dto.unidadId, dto.rolId, dto.alcanceOverride);

    const usuario = await this.prisma.usuario.findUnique({ where: { id: usuarioId } });
    if (!usuario || !usuario.activo) throw new NotFoundException('Miembro no encontrado');

    const duplicada = await this.prisma.asignacionMiembro.findFirst({
      where: { usuarioId, unidadId: dto.unidadId, rolId: dto.rolId, activo: true },
    });
    if (duplicada) throw new ConflictException('El miembro ya tiene esa asignación activa');

    await this.prisma.asignacionMiembro.create({
      data: {
        usuarioId,
        unidadId: dto.unidadId,
        rolId: dto.rolId,
        alcanceOverride: dto.alcanceOverride ?? null,
        cicloAnio: dto.cicloAnio ?? anioActual(),
      },
    });
    return this.prisma.usuario.findUniqueOrThrow({ where: { id: usuarioId }, select: MIEMBRO_SELECT });
  }

  /** Cierra (nunca borra) una asignación activa: activo=false + fechaFin=hoy. */
  async cerrarAsignacion(actor: AuthUser, alcance: AlcanceAcceso, usuarioId: number, asignacionId: number) {
    if (alcance.tipo === 'PROPIO') throw new ForbiddenException('No puede gestionar asignaciones');
    const asig = await this.prisma.asignacionMiembro.findFirst({
      where: { id: asignacionId, usuarioId, activo: true },
      include: { rol: true },
    });
    if (!asig) throw new NotFoundException('Asignación activa no encontrada');
    assertUnidadEnAlcance(alcance, asig.unidadId);
    assertPuedeOtorgar(alcance, asig.rol, asig.alcanceOverride);
    if (usuarioId === actor.sub && alcance.tipo !== 'GLOBAL') {
      throw new ForbiddenException('No puede cerrar su propia asignación');
    }

    await this.prisma.asignacionMiembro.update({
      where: { id: asignacionId },
      data: { activo: false, fechaFin: hoyUtc() },
    });
    return this.prisma.usuario.findUniqueOrThrow({ where: { id: usuarioId }, select: MIEMBRO_SELECT });
  }

  // ---------------- Helpers ----------------
  private async validarUnidadYRol(
    alcance: AlcanceAcceso,
    unidadId: number,
    rolId: number,
    alcanceOverride?: AlcanceRol | null,
  ) {
    const [unidad, rol] = await Promise.all([
      this.prisma.unidadOrganizativa.findUnique({ where: { id: unidadId } }),
      this.prisma.rol.findUnique({ where: { id: rolId } }),
    ]);
    if (!unidad || !unidad.activa) throw new BadRequestException('Rama o sección inexistente o inactiva');
    if (!rol) throw new BadRequestException('Rol inexistente');
    assertPuedeOtorgar(alcance, rol, alcanceOverride);
  }
}
