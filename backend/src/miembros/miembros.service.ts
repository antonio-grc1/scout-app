import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { AlcanceRol, EstadoCargo, TipoUnidad, type Prisma } from '@prisma/client';
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
import { MailerService } from '../mailer/mailer.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TesoreriaService } from '../tesoreria/tesoreria.service.js';
import {
  CAMPOS_EDITABLES_PROPIOS,
  type CrearAsignacionDto,
  type CrearMiembroDto,
  type EditarMiembroDto,
  type ListarMiembrosDto,
} from './miembros.dto.js';

const BCRYPT_ROUNDS = 10;

function normalizarSinTildes(valor: unknown): string {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

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
  saldoAFavor: true,
  createdAt: true,
  updatedAt: true,
  cargos: {
    where: { estado: { not: EstadoCargo.ANULADO } },
    select: {
      id: true,
      montoFinal: true,
      montoPagado: true,
      estado: true,
    },
  },
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
      rol: {
        select: {
          id: true,
          nombre: true,
          alcancePorDefecto: true,
          tipoMiembro: true,
          requiereRama: true,
        },
      },
    },
  },
} satisfies Prisma.UsuarioSelect;

@Injectable()
export class MiembrosService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly tesoreria?: TesoreriaService,
    @Optional() private readonly mailer?: MailerService,
  ) {}

  // ---------------- Padrón ----------------
  async listar(alcance: AlcanceAcceso, q: ListarMiembrosDto) {
    const whereBase: Prisma.UsuarioWhereInput = {
      AND: [
        filtroUsuariosPorAlcance(alcance),
        q.incluirInactivos ? {} : { activo: true },
        q.unidadId ? { asignaciones: { some: { activo: true, unidadId: q.unidadId } } } : {},
        q.rolId ? { asignaciones: { some: { activo: true, rolId: q.rolId } } } : {},
      ],
    };

    if (q.q) {
      const qNorm = normalizarSinTildes(q.q);
      const todos = await this.prisma.usuario.findMany({
        where: whereBase,
        select: MIEMBRO_SELECT,
        orderBy: [{ apellido: 'asc' }, { nombre: 'asc' }],
      });
      const filtrados = todos.filter(
        (m) =>
          normalizarSinTildes(m.nombre).includes(qNorm) ||
          normalizarSinTildes(m.apellido).includes(qNorm) ||
          normalizarSinTildes(`${m.nombre} ${m.apellido}`).includes(qNorm) ||
          normalizarSinTildes(`${m.apellido} ${m.nombre}`).includes(qNorm) ||
          normalizarSinTildes(m.dni).includes(qNorm) ||
          normalizarSinTildes(m.grupoFamiliar?.nombreFamilia).includes(qNorm),
      );
      const total = filtrados.length;
      const items = filtrados.slice((q.pagina - 1) * q.porPagina, q.pagina * q.porPagina);
      return { total, pagina: q.pagina, porPagina: q.porPagina, items };
    }

    const [total, items] = await this.prisma.$transaction([
      this.prisma.usuario.count({ where: whereBase }),
      this.prisma.usuario.findMany({
        where: whereBase,
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

  async obtenerMiPerfil(userId: number) {
    const miembro = await this.prisma.usuario.findUnique({
      where: { id: userId },
      select: MIEMBRO_SELECT,
    });
    if (!miembro) throw new NotFoundException('Perfil no encontrado');
    return miembro;
  }

  async actualizarMiPerfil(userId: number, dto: EditarMiembroDto) {
    const actual = await this.prisma.usuario.findUnique({
      where: { id: userId },
      select: { id: true, datosFijosJson: true },
    });
    if (!actual) throw new NotFoundException('Perfil no encontrado');

    let datosFijosJson: Prisma.InputJsonObject | undefined;
    if (dto.datosFijosJson) {
      const base = (actual.datosFijosJson ?? {}) as Record<string, unknown>;
      const merged = { ...base, ...dto.datosFijosJson };
      for (const [k, v] of Object.entries(dto.datosFijosJson)) if (v === null) delete merged[k];
      datosFijosJson = merged as Prisma.InputJsonObject;
    }

    return this.prisma.usuario.update({
      where: { id: userId },
      data: {
        emailContacto: dto.emailContacto !== undefined ? dto.emailContacto : undefined,
        telefonoContacto: dto.telefonoContacto !== undefined ? dto.telefonoContacto : undefined,
        datosFijosJson,
      },
      select: MIEMBRO_SELECT,
    });
  }

  // ---------------- Autocompletado por hermano ----------------
  /** Claves de `datosFijosJson` copiables entre hermanos, leídas de las plantillas activas + claves familiares estándar. */
  private async clavesCopiables(tx: Prisma.TransactionClient = this.prisma): Promise<Set<string>> {
    const plantillas = await tx.plantillaFormulario.findMany({
      where: { activa: true },
      select: { esquemaCamposJson: true },
    });
    const set = clavesCopiablesEntreHermanos(plantillas.map((p) => p.esquemaCamposJson));
    const estandarFamilia = [
      'domicilio',
      'obra_social',
      'madre_nombres',
      'madre_dni',
      'madre_domicilio',
      'madre_email',
      'madre_telefono',
      'madre_profesion',
      'padre_nombres',
      'padre_dni',
      'padre_domicilio',
      'padre_email',
      'padre_telefono',
      'padre_profesion',
      'tutor_nombres',
      'tutor_dni',
      'tutor_domicilio',
      'tutor_email',
      'tutor_telefono',
      'tutor_profesion',
      'telefono_urgencias',
    ];
    for (const k of estandarFamilia) set.add(k);
    return set;
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
        dni: true,
        nombre: true,
        apellido: true,
        activo: true,
        emailContacto: true,
        telefonoContacto: true,
        datosFijosJson: true,
        grupoFamiliar: { select: { id: true, nombreFamilia: true } },
        asignaciones: {
          where: { activo: true },
          select: { unidad: { select: { id: true, nombre: true } } },
        },
      },
    });
    if (!hermano || !hermano.activo) throw new NotFoundException('No se encontró un miembro activo con ese DNI');
    return {
      id: hermano.id,
      dni: hermano.dni,
      nombre: hermano.nombre,
      apellido: hermano.apellido,
      emailContacto: hermano.emailContacto,
      telefonoContacto: hermano.telefonoContacto,
      grupoFamiliar: hermano.grupoFamiliar,
      asignaciones: hermano.asignaciones,
      datosCompartidos: filtrarClaves(hermano.datosFijosJson, await this.clavesCopiables()),
    };
  }

  /**
   * Búsqueda de posibles hermanos por DNI, Apellido o Nombre en todo el grupo
   * (sin restricción de rama para permitir vincular hermanos de distintas secciones).
   */
  async buscarHermanosPorCriterio(criterioRaw: string) {
    const qNorm = normalizarSinTildes(criterioRaw);
    if (!qNorm) return [];

    const todosActivos = await this.prisma.usuario.findMany({
      where: { activo: true },
      orderBy: [{ apellido: 'asc' }, { nombre: 'asc' }],
      select: {
        id: true,
        dni: true,
        nombre: true,
        apellido: true,
        emailContacto: true,
        telefonoContacto: true,
        datosFijosJson: true,
        grupoFamiliar: {
          select: {
            id: true,
            nombreFamilia: true,
            porcentajeDescuentoHermanos: true,
            miembros: {
              where: { activo: true },
              select: {
                id: true,
                dni: true,
                nombre: true,
                apellido: true,
                asignaciones: {
                  where: { activo: true },
                  select: { unidad: { select: { id: true, nombre: true } } },
                },
              },
            },
          },
        },
        asignaciones: {
          where: { activo: true },
          select: { unidad: { select: { id: true, nombre: true } } },
        },
      },
    });

    const candidatos = todosActivos
      .filter(
        (h) =>
          normalizarSinTildes(h.dni).includes(qNorm) ||
          normalizarSinTildes(h.apellido).includes(qNorm) ||
          normalizarSinTildes(h.nombre).includes(qNorm) ||
          normalizarSinTildes(`${h.nombre} ${h.apellido}`).includes(qNorm) ||
          normalizarSinTildes(`${h.apellido} ${h.nombre}`).includes(qNorm) ||
          normalizarSinTildes(h.grupoFamiliar?.nombreFamilia).includes(qNorm),
      )
      .slice(0, 15);

    const claves = await this.clavesCopiables();
    return candidatos.map((h) => ({
      id: h.id,
      dni: h.dni,
      nombre: h.nombre,
      apellido: h.apellido,
      emailContacto: h.emailContacto,
      telefonoContacto: h.telefonoContacto,
      grupoFamiliar: h.grupoFamiliar,
      asignaciones: h.asignaciones,
      datosCompartidos: filtrarClaves(h.datosFijosJson, claves),
    }));
  }

  // ---------------- Alta ----------------
  async crear(alcance: AlcanceAcceso, dto: CrearMiembroDto) {
    const unidadIdResuelta = await this.resolverYValidarUnidadYRol(alcance, dto.unidadId, dto.rolId);
    assertUnidadEnAlcance(alcance, unidadIdResuelta);
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
          const grupo = await tx.grupoFamiliar.create({ data: { nombreFamilia: `Familia ${hermano.apellido}` } });
          grupoFamiliarId = grupo.id;
          await tx.usuario.update({ where: { id: hermano.id }, data: { grupoFamiliarId } });
        }
        if (dto.copiarDatosHermano) {
          email ??= hermano.emailContacto;
          telefono ??= hermano.telefonoContacto;
          datosFijos = { ...filtrarClaves(hermano.datosFijosJson, await this.clavesCopiables(tx)), ...datosFijos };
        }
      }

      const ciclo = dto.cicloAnio ?? anioActual();
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
            create: { unidadId: unidadIdResuelta, rolId: dto.rolId, cicloAnio: ciclo },
          },
        },
      });

      if (this.tesoreria) {
        const mesActual = new Date().getMonth() + 1;
        await this.tesoreria.sincronizarCuotasMiembroActivoEnTx(tx, usuario.id, mesActual, ciclo);
      }

      return usuario.id;
    });

    const creado = await this.prisma.usuario.findUniqueOrThrow({ where: { id }, select: MIEMBRO_SELECT });

    if (creado.emailContacto && this.mailer) {
      const asig = creado.asignaciones?.[0];
      void this.mailer.enviarBienvenidaAlta({
        destinatario: creado.emailContacto,
        nombre: creado.nombre,
        apellido: creado.apellido,
        dni: creado.dni,
        unidadNombre: asig?.unidad?.nombre,
        rolNombre: asig?.rol?.nombre,
      });
    }

    return creado;
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

    // Permisos por campo: cada grupo de campos exige su propio permiso (actualización parcial).
    if (!esPropio) {
      const permisosActor = new Set(actor.asignaciones.flatMap((a) => a.permisos));
      const PERMISO_POR_CAMPO: Record<string, string> = {
        nombre: 'miembros.editar_identidad',
        apellido: 'miembros.editar_identidad',
        dni: 'miembros.editar_identidad',
        fechaNacimiento: 'miembros.editar_identidad',
        activo: 'miembros.baja',
      };
      const sinPermiso = Object.keys(dto).filter((k) => {
        const req = PERMISO_POR_CAMPO[k];
        if (!req) return false;
        // Enviar el mismo valor no cuenta como modificación
        const actual = (objetivo as Record<string, unknown>)[k];
        const nuevo = (dto as Record<string, unknown>)[k];
        const igual =
          k === 'fechaNacimiento'
            ? actual instanceof Date && String(nuevo) === actual.toISOString().slice(0, 10)
            : actual === nuevo;
        return !igual && !permisosActor.has(req);
      });
      if (sinPermiso.length) {
        throw new ForbiddenException(`No tiene permiso para modificar: ${sinPermiso.join(', ')}`);
      }
    }

    let datosFijosJson: Prisma.InputJsonObject | undefined;
    if (dto.datosFijosJson) {
      const actual = (objetivo.datosFijosJson ?? {}) as Record<string, unknown>;
      const merged = { ...actual, ...dto.datosFijosJson };
      for (const [k, v] of Object.entries(dto.datosFijosJson)) if (v === null) delete merged[k];
      datosFijosJson = merged as Prisma.InputJsonObject;
    }

    const cambioEstadoActivo = dto.activo !== undefined && dto.activo !== objetivo.activo;

    if (cambioEstadoActivo && this.tesoreria && this.prisma.$transaction) {
      return this.prisma.$transaction(async (tx) => {
        await tx.usuario.update({
          where: { id },
          data: {
            ...dto,
            fechaNacimiento: dto.fechaNacimiento ? new Date(dto.fechaNacimiento) : undefined,
            datosFijosJson,
          },
        });

        if (dto.activo === false) {
          await this.tesoreria!.anularCargosImpagosDeMiembroEnTx(tx, id);
        } else if (dto.activo === true) {
          const mesActual = new Date().getMonth() + 1;
          await this.tesoreria!.sincronizarCuotasMiembroActivoEnTx(tx, id, mesActual, anioActual());
        }

        return tx.usuario.findUniqueOrThrow({ where: { id }, select: MIEMBRO_SELECT });
      });
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
  private async resolverYValidarUnidadYRol(
    alcance: AlcanceAcceso,
    unidadId: number | undefined,
    rolId: number,
    alcanceOverride?: AlcanceRol | null,
  ): Promise<number> {
    const rol = await this.prisma.rol.findUnique({ where: { id: rolId } });
    if (!rol) throw new BadRequestException('Rol inexistente');
    assertPuedeOtorgar(alcance, rol, alcanceOverride);

    let unidad = unidadId
      ? await this.prisma.unidadOrganizativa.findUnique({ where: { id: unidadId } })
      : null;

    if (!unidad && rol.requiereRama === false && this.prisma.unidadOrganizativa.findFirst) {
      const tipoPreferido =
        rol.alcancePorDefecto === AlcanceRol.GLOBAL ? TipoUnidad.JEFATURA : TipoUnidad.SIN_RAMA_APOYO;
      unidad =
        (await this.prisma.unidadOrganizativa.findFirst({
          where: { activa: true, tipo: tipoPreferido },
        })) ??
        (await this.prisma.unidadOrganizativa.findFirst({
          where: { activa: true, tipo: { in: [TipoUnidad.SIN_RAMA_APOYO, TipoUnidad.JEFATURA] } },
        }));
    }

    if (!unidad || !unidad.activa) {
      throw new BadRequestException('Rama o sección inexistente o inactiva');
    }
    return unidad.id;
  }

  private async validarUnidadYRol(
    alcance: AlcanceAcceso,
    unidadId: number,
    rolId: number,
    alcanceOverride?: AlcanceRol | null,
  ) {
    await this.resolverYValidarUnidadYRol(alcance, unidadId, rolId, alcanceOverride);
  }
}
