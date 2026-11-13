import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { AlcanceRol, EstadoCargo, EstadoEntrega, Prisma, TipoUnidad } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import {
  alcanceEfectivo,
  assertPuedeOtorgar,
  assertUnidadEnAlcance,
  esRolEducadorEfectivo,
  filtroUsuariosPorAlcance,
  resolverAlcance,
} from '../common/scope/alcance.util.js';
import type { AlcanceAcceso, AuthUser } from '../common/types/auth.types.js';
import { anioActual, hoyUtc } from '../common/utils/fechas.util.js';
import { generarClaveTemporal } from '../common/utils/password.util.js';
import {
  CLAVES_FAMILIARES_ESTANDAR,
  clavesCopiablesEntreHermanos,
  filtrarClaves,
  sanitizarJsonPlano,
} from '../common/utils/plantillas.util.js';
import { MailerService } from '../mailer/mailer.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TesoreriaService } from '../tesoreria/tesoreria.service.js';
import {
  CAMPOS_EDITABLES_PROPIOS,
  type ActualizarMiPerfilDto,
  type CrearAsignacionDto,
  type CrearMiembroDto,
  type EditarMiembroDto,
  type ListarMiembrosDto,
} from './miembros.dto.js';

const BCRYPT_ROUNDS = 10;

function normalizarSinTildes(valor: unknown): string {
  const texto =
    typeof valor === 'string'
      ? valor
      : typeof valor === 'number' || typeof valor === 'bigint'
        ? String(valor)
        : '';
  return texto
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
    orderBy: [{ activo: 'desc' }, { fechaInicio: 'desc' }, { id: 'desc' }],
    select: {
      id: true,
      unidadId: true,
      rolId: true,
      cicloAnio: true,
      fechaInicio: true,
      fechaFin: true,
      activo: true,
      alcanceOverride: true,
      unidad: {
        select: {
          id: true,
          nombre: true,
          tipo: true,
          activa: true,
          ramaId: true,
          rama: {
            select: {
              id: true,
              nombre: true,
              ordenProgresion: true,
              edadMinima: true,
              edadMaxima: true,
              activa: true,
            },
          },
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
  private readonly logger = new Logger(MiembrosService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly tesoreria?: TesoreriaService,
    @Optional() private readonly mailer?: MailerService,
  ) {}

  // ---------------- Padrón ----------------
  private tieneQueryRaw(): boolean {
    return typeof (this.prisma as { $queryRaw?: unknown }).$queryRaw === 'function';
  }

  private async buscarIdsPorTextoSql(
    alcance: AlcanceAcceso,
    qTexto: string,
    opciones: {
      incluirInactivos?: boolean;
      unidadId?: number;
      rolId?: number;
      ids?: number[];
      take: number;
      skip?: number;
      conTotal: boolean;
    },
  ): Promise<{ total: number; ids: number[] }> {
    if (opciones.ids && opciones.ids.length === 0) {
      return { total: 0, ids: [] };
    }

    const qNorm = normalizarSinTildes(qTexto);
    if (!qNorm) {
      return { total: 0, ids: [] };
    }

    const condiciones: Prisma.Sql[] = [];

    if (alcance.tipo === 'PROPIO') {
      condiciones.push(Prisma.sql`u."id" = ${alcance.usuarioId}`);
    } else if (alcance.tipo === 'UNIDAD') {
      const tieneUnidades = alcance.unidadIds.length > 0;
      const tienePropio = alcance.usuarioIdPropio !== undefined;
      if (tieneUnidades && tienePropio) {
        condiciones.push(
          Prisma.sql`(EXISTS (SELECT 1 FROM "asignaciones_miembro" a WHERE a."usuario_id" = u."id" AND a."activo" = true AND a."unidad_id" IN (${Prisma.join(alcance.unidadIds)})) OR u."id" = ${alcance.usuarioIdPropio})`,
        );
      } else if (tieneUnidades) {
        condiciones.push(
          Prisma.sql`EXISTS (SELECT 1 FROM "asignaciones_miembro" a WHERE a."usuario_id" = u."id" AND a."activo" = true AND a."unidad_id" IN (${Prisma.join(alcance.unidadIds)}))`,
        );
      } else if (tienePropio) {
        condiciones.push(Prisma.sql`u."id" = ${alcance.usuarioIdPropio}`);
      } else {
        condiciones.push(Prisma.sql`FALSE`);
      }
    }

    if (!opciones.incluirInactivos) {
      condiciones.push(Prisma.sql`u."activo" = true`);
    }
    if (opciones.unidadId) {
      condiciones.push(
        Prisma.sql`EXISTS (SELECT 1 FROM "asignaciones_miembro" a WHERE a."usuario_id" = u."id" AND a."activo" = true AND a."unidad_id" = ${opciones.unidadId})`,
      );
    }
    if (opciones.rolId) {
      condiciones.push(
        Prisma.sql`EXISTS (SELECT 1 FROM "asignaciones_miembro" a WHERE a."usuario_id" = u."id" AND a."activo" = true AND a."rol_id" = ${opciones.rolId})`,
      );
    }
    if (opciones.ids?.length) {
      condiciones.push(Prisma.sql`u."id" IN (${Prisma.join(opciones.ids)})`);
    }

    const escaped = qNorm.replace(/[!%_]/g, (ch) => `!${ch}`);
    const patron = `%${escaped}%`;
    condiciones.push(
      Prisma.sql`(
        unaccent(u."nombre") ILIKE unaccent(${patron}) ESCAPE '!'
        OR unaccent(u."apellido") ILIKE unaccent(${patron}) ESCAPE '!'
        OR unaccent(u."nombre" || ' ' || u."apellido") ILIKE unaccent(${patron}) ESCAPE '!'
        OR unaccent(u."apellido" || ' ' || u."nombre") ILIKE unaccent(${patron}) ESCAPE '!'
        OR unaccent(u."dni") ILIKE unaccent(${patron}) ESCAPE '!'
        OR unaccent(COALESCE(gf."nombre_familia", '')) ILIKE unaccent(${patron}) ESCAPE '!'
      )`,
    );

    const whereSql = Prisma.join(condiciones, ' AND ');
    const runIdsQuery = () =>
      this.prisma.$queryRaw<Array<{ id: number }>>`
        SELECT u."id"
        FROM "usuarios" u
        LEFT JOIN "grupos_familiares" gf ON gf."id" = u."grupo_familiar_id"
        WHERE ${whereSql}
        ORDER BY u."apellido" ASC, u."nombre" ASC
        LIMIT ${opciones.take}
        OFFSET ${opciones.skip ?? 0}
      `;

    if (!opciones.conTotal) {
      const rows = await runIdsQuery();
      return { total: rows.length, ids: rows.map((r) => Number(r.id)) };
    }

    const [countRows, idRows] = await Promise.all([
      this.prisma.$queryRaw<Array<{ total: number }>>`
        SELECT COUNT(*)::int AS total
        FROM "usuarios" u
        LEFT JOIN "grupos_familiares" gf ON gf."id" = u."grupo_familiar_id"
        WHERE ${whereSql}
      `,
      runIdsQuery(),
    ]);

    return {
      total: Number(countRows[0]?.total ?? 0),
      ids: idRows.map((r) => Number(r.id)),
    };
  }

  async listar(alcance: AlcanceAcceso, q: ListarMiembrosDto) {
    const whereBase: Prisma.UsuarioWhereInput = {
      AND: [
        filtroUsuariosPorAlcance(alcance),
        q.incluirInactivos ? {} : { activo: true },
        q.unidadId ? { asignaciones: { some: { activo: true, unidadId: q.unidadId } } } : {},
        q.rolId ? { asignaciones: { some: { activo: true, rolId: q.rolId } } } : {},
        q.ids?.length ? { id: { in: q.ids } } : {},
      ],
    };

    if (q.q) {
      let total: number;
      let paginaIds: number[];

      if (this.tieneQueryRaw()) {
        const resSql = await this.buscarIdsPorTextoSql(alcance, q.q, {
          incluirInactivos: q.incluirInactivos,
          unidadId: q.unidadId,
          rolId: q.rolId,
          ids: q.ids,
          take: q.porPagina,
          skip: (q.pagina - 1) * q.porPagina,
          conTotal: true,
        });
        total = resSql.total;
        paginaIds = resSql.ids;
      } else {
        const qNorm = normalizarSinTildes(q.q);
        const candidatos = await this.prisma.usuario.findMany({
          where: whereBase,
          select: {
            id: true,
            nombre: true,
            apellido: true,
            dni: true,
            grupoFamiliar: { select: { nombreFamilia: true } },
          },
          orderBy: [{ apellido: 'asc' }, { nombre: 'asc' }],
        });
        const filtradosIds = candidatos
          .filter(
            (m) =>
              normalizarSinTildes(m.nombre).includes(qNorm) ||
              normalizarSinTildes(m.apellido).includes(qNorm) ||
              normalizarSinTildes(`${m.nombre} ${m.apellido}`).includes(qNorm) ||
              normalizarSinTildes(`${m.apellido} ${m.nombre}`).includes(qNorm) ||
              normalizarSinTildes(m.dni).includes(qNorm) ||
              normalizarSinTildes(m.grupoFamiliar?.nombreFamilia).includes(qNorm),
          )
          .map((m) => m.id);
        total = filtradosIds.length;
        paginaIds = filtradosIds.slice((q.pagina - 1) * q.porPagina, q.pagina * q.porPagina);
      }

      if (paginaIds.length === 0) {
        return { total, pagina: q.pagina, porPagina: q.porPagina, items: [] };
      }
      const itemsDesordenados = await this.prisma.usuario.findMany({
        where: { id: { in: paginaIds } },
        select: MIEMBRO_SELECT,
      });
      const itemsPorId = new Map(itemsDesordenados.map((item) => [item.id, item]));
      const items = paginaIds
        .map((id) => itemsPorId.get(id))
        .filter((item): item is NonNullable<typeof item> => item !== undefined);
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

  async actualizarMiPerfil(userId: number, dto: ActualizarMiPerfilDto) {
    const ejecutar = async (tx: Prisma.TransactionClient) => {
      if ('$queryRaw' in tx && typeof tx.$queryRaw === 'function') {
        await tx.$queryRaw`SELECT id FROM usuarios WHERE id = ${userId} FOR UPDATE`;
      }
      const actual = await tx.usuario.findUnique({
        where: { id: userId },
        select: { id: true, datosFijosJson: true },
      });
      if (!actual) throw new NotFoundException('Perfil no encontrado');

      let datosFijosJson: Prisma.InputJsonObject | undefined;
      if (dto.datosFijosJson) {
        const base = sanitizarJsonPlano(actual.datosFijosJson);
        const entrante = sanitizarJsonPlano(dto.datosFijosJson);
        const merged = { ...base, ...entrante };
        for (const [k, v] of Object.entries(entrante)) if (v === null) delete merged[k];
        datosFijosJson = merged as Prisma.InputJsonObject;
      }

      return tx.usuario.update({
        where: { id: userId },
        data: {
          emailContacto: dto.emailContacto !== undefined ? dto.emailContacto : undefined,
          telefonoContacto: dto.telefonoContacto !== undefined ? dto.telefonoContacto : undefined,
          datosFijosJson,
        },
        select: MIEMBRO_SELECT,
      });
    };

    return this.prisma.$transaction
      ? this.prisma.$transaction((tx) => ejecutar(tx))
      : ejecutar(this.prisma as unknown as Prisma.TransactionClient);
  }

  // ---------------- Autocompletado por hermano ----------------
  /** Claves de `datosFijosJson` copiables entre hermanos, leídas de las plantillas activas + claves familiares estándar. */
  private async clavesCopiables(tx: Prisma.TransactionClient = this.prisma): Promise<Set<string>> {
    const plantillas = await tx.plantillaFormulario.findMany({
      where: { activa: true },
      select: { esquemaCamposJson: true },
    });
    const set = clavesCopiablesEntreHermanos(plantillas.map((p) => p.esquemaCamposJson));
    for (const k of CLAVES_FAMILIARES_ESTANDAR) set.add(k);
    return set;
  }

  /**
   * Devuelve SOLO datos familiares compartibles de un hermano (contacto, grupo familiar
   * y campos de secciones con `permiteCopiarHermano`). Se permite buscar fuera del alcance
   * porque los hermanos suelen estar en ramas distintas.
   */
  async buscarHermano(alcance: AlcanceAcceso, dniHermano: string) {
    if (alcance.tipo === 'PROPIO') {
      throw new ForbiddenException('No tiene permisos para consultar datos de otros miembros');
    }
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
  async buscarHermanosPorCriterio(alcance: AlcanceAcceso, criterioRaw: string) {
    if (alcance.tipo === 'PROPIO') {
      throw new ForbiddenException('No tiene permisos para buscar hermanos');
    }
    const qNorm = normalizarSinTildes(criterioRaw);
    if (!qNorm) return [];

    let candidatoIds: number[];
    if (this.tieneQueryRaw()) {
      const resSql = await this.buscarIdsPorTextoSql(alcance, criterioRaw, {
        take: 15,
        conTotal: false,
      });
      candidatoIds = resSql.ids;
    } else {
      const indicesActivos = await this.prisma.usuario.findMany({
        where: {
          AND: [{ activo: true }, filtroUsuariosPorAlcance(alcance)],
        },
        orderBy: [{ apellido: 'asc' }, { nombre: 'asc' }],
        select: {
          id: true,
          dni: true,
          nombre: true,
          apellido: true,
          grupoFamiliar: {
            select: { nombreFamilia: true },
          },
        },
      });

      candidatoIds = indicesActivos
        .filter(
          (h) =>
            normalizarSinTildes(h.dni).includes(qNorm) ||
            normalizarSinTildes(h.apellido).includes(qNorm) ||
            normalizarSinTildes(h.nombre).includes(qNorm) ||
            normalizarSinTildes(`${h.nombre} ${h.apellido}`).includes(qNorm) ||
            normalizarSinTildes(`${h.apellido} ${h.nombre}`).includes(qNorm) ||
            normalizarSinTildes(h.grupoFamiliar?.nombreFamilia).includes(qNorm),
        )
        .slice(0, 15)
        .map((h) => h.id);
    }

    if (candidatoIds.length === 0) return [];

    const [candidatos, claves] = await Promise.all([
      this.prisma.usuario.findMany({
        where: { id: { in: candidatoIds } },
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
      }),
      this.clavesCopiables(),
    ]);

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
    if (dto.soloEnviarPorCorreo) {
      if (!dto.emailContacto?.trim()) {
        throw new BadRequestException(
          'Para enviar las credenciales solo por correo debes ingresar un email de contacto.',
        );
      }
      if (!this.mailer || !(await this.mailer.estaDisponibleParaEnvio())) {
        throw new BadRequestException(
          'El envío de correos no está configurado o está deshabilitado. Configuralo en Panel de Gestión → Correo y Claves.',
        );
      }
    }

    const unidadIdResuelta = await this.resolverYValidarUnidadYRol(alcance, dto.unidadId, dto.rolId);
    assertUnidadEnAlcance(alcance, unidadIdResuelta);
    // Generamos clave temporal aleatoria; se fuerza el cambio en el primer login.
    const claveTemporal = generarClaveTemporal();
    const passwordHash = await bcrypt.hash(claveTemporal, BCRYPT_ROUNDS);

    const id = await this.prisma.$transaction(async (tx) => {
      let grupoFamiliarId: number | null = null;
      let email = dto.emailContacto ?? null;
      let telefono = dto.telefonoContacto ?? null;
      let datosFijos: Record<string, unknown> = sanitizarJsonPlano(dto.datosFijosJson);

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

    if (dto.soloEnviarPorCorreo && creado.emailContacto && this.mailer) {
      const asig = creado.asignaciones?.[0];
      const emailEnviado = await this.mailer.enviarBienvenidaAlta({
        destinatario: creado.emailContacto,
        nombre: creado.nombre,
        apellido: creado.apellido,
        dni: creado.dni,
        claveTemporal,
        unidadNombre: asig?.unidad?.nombre,
        rolNombre: asig?.rol?.nombre,
      });
      return {
        ...creado,
        emailEnviado,
        emailDestino: creado.emailContacto,
      };
    }

    if (creado.emailContacto && this.mailer) {
      const asig = creado.asignaciones?.[0];
      void this.mailer
        .enviarBienvenidaAlta({
          destinatario: creado.emailContacto,
          nombre: creado.nombre,
          apellido: creado.apellido,
          dni: creado.dni,
          claveTemporal,
          unidadNombre: asig?.unidad?.nombre,
          rolNombre: asig?.rol?.nombre,
        })
        .catch((err: unknown) => {
          this.logger.warn(
            `Error inesperado enviando email de bienvenida a ${creado.emailContacto}: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
    }

    return { ...creado, claveTemporal };
  }

  // ---------------- Edición ----------------
  async editar(actor: AuthUser, alcance: AlcanceAcceso, id: number, dto: EditarMiembroDto) {
    const objetivo = await this.prisma.usuario.findFirst({
      where: { AND: [{ id }, filtroUsuariosPorAlcance(alcance)] },
      include: {
        asignaciones: {
          where: { activo: true },
          include: { rol: { include: { permisos: { include: { permiso: true } } } } },
        },
      },
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
    const PERMISO_POR_CAMPO: Record<string, string> = {
      nombre: 'miembros.editar_identidad',
      apellido: 'miembros.editar_identidad',
      dni: 'miembros.editar_identidad',
      fechaNacimiento: 'miembros.editar_identidad',
      activo: 'miembros.baja',
      emailContacto: 'miembros.editar',
      telefonoContacto: 'miembros.editar',
      datosFijosJson: 'miembros.editar',
    };
    if (!esPropio || alcance.tipo === 'GLOBAL') {
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
        if (igual) return false;

        const alcanceCampo = resolverAlcance(actor, req);
        if (!alcanceCampo) return true;
        if (alcanceCampo.tipo === 'GLOBAL') return false;
        if (alcanceCampo.tipo === 'UNIDAD') {
          const unidadesObjetivo = objetivo.asignaciones.map((a) => a.unidadId);
          // Campos sensibles (identidad / baja) requieren cobertura de TODAS las unidades activas del objetivo.
          const requiereCoberturaCompleta = req === 'miembros.editar_identidad' || req === 'miembros.baja';
          const cubierto = requiereCoberturaCompleta
            ? unidadesObjetivo.length > 0 && unidadesObjetivo.every((uId) => alcanceCampo.unidadIds.includes(uId))
            : unidadesObjetivo.some((uId) => alcanceCampo.unidadIds.includes(uId));
          return !cubierto;
        }
        return true;
      });
      if (sinPermiso.length) {
        throw new ForbiddenException(`No tiene permiso para modificar: ${sinPermiso.join(', ')}`);
      }
    }

    const cambioEstadoActivo = dto.activo !== undefined && dto.activo !== objetivo.activo;
    const verificaUltimoAdmin =
      dto.activo === false &&
      objetivo.activo &&
      objetivo.asignaciones.some((a) => this.esAsignacionAdminGlobal(a));

    const ejecutarEdicion = async (tx: Prisma.TransactionClient) => {
      if ((dto.datosFijosJson || verificaUltimoAdmin) && '$queryRaw' in tx && typeof tx.$queryRaw === 'function') {
        await tx.$queryRaw`SELECT id FROM usuarios WHERE id = ${id} FOR UPDATE`;
      }
      if (verificaUltimoAdmin) {
        await this.asegurarNoDesactivarUltimoAdmin(id, undefined, tx);
      }

      let datosFijosJson: Prisma.InputJsonObject | undefined;
      if (dto.datosFijosJson) {
        const registroFresco = tx.usuario?.findUnique
          ? await tx.usuario.findUnique({ where: { id }, select: { datosFijosJson: true } })
          : null;
        const actual = sanitizarJsonPlano(registroFresco?.datosFijosJson ?? objetivo.datosFijosJson);
        const entrante = sanitizarJsonPlano(dto.datosFijosJson);
        const merged = { ...actual, ...entrante };
        for (const [k, v] of Object.entries(entrante)) if (v === null) delete merged[k];
        datosFijosJson = merged as Prisma.InputJsonObject;
      }

      const actualizado = await tx.usuario.update({
        where: { id },
        data: {
          ...dto,
          fechaNacimiento: dto.fechaNacimiento ? new Date(dto.fechaNacimiento) : undefined,
          datosFijosJson,
          ...(dto.activo === false && objetivo.activo ? { tokenVersion: { increment: 1 } } : {}),
        },
        select: MIEMBRO_SELECT,
      });

      if (cambioEstadoActivo && this.tesoreria) {
        if (dto.activo === false) {
          await this.tesoreria.anularCargosImpagosDeMiembroEnTx(tx, id);
        } else if (dto.activo === true) {
          const hoy = hoyUtc();
          await this.tesoreria.sincronizarCuotasMiembroActivoEnTx(
            tx,
            id,
            hoy.getUTCMonth() + 1,
            anioActual(),
          );
        }
        return tx.usuario.findUniqueOrThrow({ where: { id }, select: MIEMBRO_SELECT });
      }

      return actualizado;
    };

    return this.prisma.$transaction
      ? this.prisma.$transaction((tx) => ejecutarEdicion(tx))
      : ejecutarEdicion(this.prisma as unknown as Prisma.TransactionClient);
  }

  // ---------------- Eliminación definitiva ----------------
  /**
   * Elimina físicamente un miembro dado de baja (activo=false) cuando no posee
   * historial contable, de auditoría ni legajos impresos/validados (salvo que
   * un usuario con alcance GLOBAL indique `forzarFichas=true`, en cuyo caso se
   * eliminan también sus fichas médicas propias si no hay otro historial bloqueante).
   */
  async eliminarDefinitivo(
    actor: AuthUser,
    alcance: AlcanceAcceso,
    id: number,
    forzarFichas = false,
  ) {
    if (alcance.tipo !== 'GLOBAL') {
      throw new ForbiddenException('Solo un usuario con alcance global puede eliminar miembros definitivamente');
    }
    if (id === actor.sub) {
      throw new BadRequestException('No puede eliminar definitivamente su propio usuario');
    }

    const ejecutarEliminacion = async (tx: Prisma.TransactionClient) => {
      if ('$queryRaw' in tx && typeof tx.$queryRaw === 'function') {
        await tx.$queryRaw`SELECT id FROM usuarios WHERE id = ${id} FOR UPDATE`;
      }

      const objetivo = await tx.usuario.findUnique({
        where: { id },
        select: {
          id: true,
          nombre: true,
          apellido: true,
          activo: true,
          saldoAFavor: true,
          grupoFamiliarId: true,
        },
      });
      if (!objetivo) throw new NotFoundException('Miembro no encontrado');
      if (objetivo.activo) {
        throw new BadRequestException('Solo se pueden eliminar definitivamente miembros dados de baja (inactivos)');
      }

      const [
        cargosBloqueantes,
        pagos,
        movimientos,
        gastos,
        eventos,
        pedidos,
        tickets,
        entregasPropiasBloqueantes,
        entregasValidadasAjenas,
      ] = await Promise.all([
        tx.cargoMiembro.count({
          where: {
            usuarioId: id,
            OR: [
              { estado: { not: EstadoCargo.ANULADO } },
              { montoPagado: { gt: 0 } },
              { imputaciones: { some: {} } },
            ],
          },
        }),
        tx.pago.count({ where: { OR: [{ usuarioId: id }, { registradoPorUsuarioId: id }] } }),
        tx.movimientoFinanciero.count({ where: { creadoPorUsuarioId: id } }),
        tx.gasto.count({ where: { registradoPorId: id } }),
        tx.evento.count({ where: { creadoPorUsuarioId: id } }),
        tx.pedidoEvento.count({ where: { OR: [{ registradoPorUsuarioId: id }, { vendedorUsuarioId: id }] } }),
        tx.ticketEvento.count({ where: { validadorUsuarioId: id } }),
        tx.entregaFormulario.count({
          where: { usuarioId: id, estado: { not: EstadoEntrega.BORRADOR } },
        }),
        tx.entregaFormulario.count({
          where: { validadoPorUsuarioId: id, usuarioId: { not: id } },
        }),
      ]);

      const saldoAFavor = Number(objetivo.saldoAFavor ?? 0);
      const detalles: string[] = [];
      if (cargosBloqueantes > 0) detalles.push(`${cargosBloqueantes} cargo(s) activo(s) o con pagos`);
      if (pagos > 0) detalles.push(`${pagos} pago(s)`);
      if (movimientos > 0) detalles.push(`${movimientos} movimiento(s) de caja/banco`);
      if (gastos > 0) detalles.push(`${gastos} gasto(s)`);
      if (eventos > 0 || pedidos > 0 || tickets > 0) {
        detalles.push(`${eventos + pedidos + tickets} registro(s) de eventos`);
      }
      if (!forzarFichas && entregasPropiasBloqueantes > 0) {
        detalles.push(`${entregasPropiasBloqueantes} ficha(s) médica(s) emitida(s) o validada(s)`);
      }
      if (entregasValidadasAjenas > 0) {
        detalles.push(`${entregasValidadasAjenas} ficha(s) médica(s) de otros miembros validada(s)`);
      }
      if (saldoAFavor > 0) detalles.push('saldo a favor pendiente');

      if (detalles.length > 0) {
        const soloFichasPropias =
          !forzarFichas &&
          entregasPropiasBloqueantes > 0 &&
          cargosBloqueantes === 0 &&
          pagos === 0 &&
          movimientos === 0 &&
          gastos === 0 &&
          eventos === 0 &&
          pedidos === 0 &&
          tickets === 0 &&
          entregasValidadasAjenas === 0 &&
          saldoAFavor <= 0;

        throw new ConflictException({
          statusCode: 409,
          message: `No se puede eliminar definitivamente a ${objetivo.nombre} ${objetivo.apellido}: posee historial asociado (${detalles.join(', ')}). Debe permanecer dado de baja para preservar el legajo y la integridad contable.`,
          ...(soloFichasPropias ? { puedeForzarFichas: true } : {}),
        });
      }

      if (forzarFichas && tx.entregaFormulario?.deleteMany) {
        await tx.entregaFormulario.deleteMany({
          where: { usuarioId: id },
        });
      }

      // Los cargos anulados sin imputaciones ni pagos (p. ej. generados al crear un miembro de prueba y anulados al darlo de baja) se limpian antes de borrar al usuario.
      await tx.cargoMiembro.deleteMany({
        where: { usuarioId: id, estado: EstadoCargo.ANULADO },
      });

      await tx.usuario.delete({ where: { id } });

      if (objetivo.grupoFamiliarId) {
        const grupoIdAnterior = objetivo.grupoFamiliarId;
        const restantes = await tx.usuario.findMany({
          where: { grupoFamiliarId: grupoIdAnterior },
          select: { id: true },
        });
        if (restantes.length <= 1) {
          if (restantes.length === 1) {
            await tx.usuario.update({
              where: { id: restantes[0].id },
              data: { grupoFamiliarId: null },
            });
            if (this.tesoreria) {
              await this.tesoreria.recalcularCargosPendientesDeUsuariosEnTx(tx, [restantes[0].id]);
            }
          }
          if (tx.grupoFamiliar?.deleteMany) {
            await tx.grupoFamiliar.deleteMany({ where: { id: grupoIdAnterior } });
          } else {
            await tx.grupoFamiliar.delete({ where: { id: grupoIdAnterior } });
          }
        }
      }

      return {
        eliminado: true,
        mensaje: `Miembro "${objetivo.nombre} ${objetivo.apellido}" eliminado definitivamente.`,
      };
    };

    return this.prisma.$transaction
      ? this.prisma.$transaction((tx) => ejecutarEliminacion(tx))
      : ejecutarEliminacion(this.prisma as unknown as Prisma.TransactionClient);
  }

  // ---------------- Asignaciones adicionales ----------------
  /** Agrega una asignación (ej. un Rover que además es Educador). No toca las existentes. */
  async agregarAsignacion(alcance: AlcanceAcceso, usuarioId: number, dto: CrearAsignacionDto) {
    if (alcance.tipo === 'PROPIO') throw new ForbiddenException('No puede gestionar asignaciones');
    const unidadIdResuelta = await this.resolverYValidarUnidadYRol(
      alcance,
      dto.unidadId,
      dto.rolId,
      dto.alcanceOverride,
    );
    assertUnidadEnAlcance(alcance, unidadIdResuelta);

    const usuario = await this.prisma.usuario.findFirst({
      where: { AND: [{ id: usuarioId }, filtroUsuariosPorAlcance(alcance)] },
      include: { asignaciones: { where: { activo: true }, include: { rol: true } } },
    });
    if (!usuario || !usuario.activo) throw new NotFoundException('Miembro no encontrado en su alcance');

    if (alcance.tipo !== 'GLOBAL') {
      const tieneAsignacionGlobalOEducador = usuario.asignaciones.some(
        (a) =>
          (a.alcanceOverride ?? a.rol.alcancePorDefecto) === AlcanceRol.GLOBAL ||
          esRolEducadorEfectivo(a.rol, a.alcanceOverride),
      );
      if (tieneAsignacionGlobalOEducador) {
        throw new ForbiddenException(
          'Solo un usuario con alcance global puede gestionar asignaciones de educadores o usuarios con alcance global',
        );
      }
      if (alcance.tipo === 'UNIDAD' && alcance.usuarioIdPropio && usuarioId === alcance.usuarioIdPropio) {
        throw new ForbiddenException('No puede agregar asignaciones a su propio usuario');
      }
    }

    const duplicada = await this.prisma.asignacionMiembro.findFirst({
      where: { usuarioId, unidadId: unidadIdResuelta, rolId: dto.rolId, activo: true },
    });
    if (duplicada) throw new ConflictException('El miembro ya tiene esa asignación activa');

    const ciclo = dto.cicloAnio ?? anioActual();
    const trans = this.prisma.$transaction
      ? (cb: (tx: any) => Promise<any>) => this.prisma.$transaction(cb)
      : async (cb: (tx: any) => Promise<any>) => cb(this.prisma);

    await trans(async (tx) => {
      await tx.asignacionMiembro.create({
        data: {
          usuarioId,
          unidadId: unidadIdResuelta,
          rolId: dto.rolId,
          alcanceOverride: dto.alcanceOverride ?? null,
          cicloAnio: ciclo,
        },
      });

      if (this.tesoreria) {
        const mesActual = hoyUtc().getUTCMonth() + 1;
        await this.tesoreria.sincronizarCuotasMiembroActivoEnTx(tx, usuarioId, mesActual, ciclo);
      }
    });

    return this.prisma.usuario.findUniqueOrThrow({ where: { id: usuarioId }, select: MIEMBRO_SELECT });
  }

  /** Cierra (nunca borra) una asignación activa: activo=false + fechaFin=hoy. */
  async cerrarAsignacion(actor: AuthUser, alcance: AlcanceAcceso, usuarioId: number, asignacionId: number) {
    if (alcance.tipo === 'PROPIO') throw new ForbiddenException('No puede gestionar asignaciones');
    if (usuarioId === actor.sub && alcance.tipo !== 'GLOBAL') {
      throw new ForbiddenException('No puede cerrar su propia asignación');
    }

    const trans = this.prisma.$transaction
      ? (cb: (tx: any) => Promise<any>) => this.prisma.$transaction(cb)
      : async (cb: (tx: any) => Promise<any>) => cb(this.prisma);

    await trans(async (tx) => {
      const asig = await tx.asignacionMiembro.findFirst({
        where: { id: asignacionId, usuarioId, activo: true },
        include: { rol: { include: { permisos: { include: { permiso: true } } } } },
      });
      if (!asig) throw new NotFoundException('Asignación activa no encontrada');
      assertUnidadEnAlcance(alcance, asig.unidadId);
      assertPuedeOtorgar(alcance, asig.rol, asig.alcanceOverride);
      if (alcance.tipo !== 'GLOBAL' && esRolEducadorEfectivo(asig.rol, asig.alcanceOverride)) {
        throw new ForbiddenException('Solo un usuario con alcance global puede cerrar asignaciones de educadores');
      }

      if (this.esAsignacionAdminGlobal(asig)) {
        await this.asegurarNoDesactivarUltimoAdmin(usuarioId, asignacionId, tx);
      }

      if (tx.asignacionMiembro?.updateMany) {
        const res = await tx.asignacionMiembro.updateMany({
          where: { id: asignacionId, activo: true },
          data: { activo: false, fechaFin: hoyUtc() },
        });
        if (res.count !== 1) {
          throw new ConflictException('La asignación ya fue cerrada por otro proceso');
        }
      } else {
        await tx.asignacionMiembro.update({
          where: { id: asignacionId },
          data: { activo: false, fechaFin: hoyUtc() },
        });
      }

      if (this.tesoreria) {
        const hoy = hoyUtc();
        await this.tesoreria.sincronizarCuotasMiembroActivoEnTx(
          tx,
          usuarioId,
          hoy.getUTCMonth() + 1,
          anioActual(),
        );
      }
    });

    return this.prisma.usuario.findUniqueOrThrow({ where: { id: usuarioId }, select: MIEMBRO_SELECT });
  }

  // ---------------- Anti-Lockout Helpers ----------------
  private esAsignacionAdminGlobal(asig: {
    alcanceOverride?: AlcanceRol | null;
    rol?: { alcancePorDefecto: AlcanceRol; permisos?: Array<{ permiso?: { clave: string } } | string> };
  }): boolean {
    if (!asig.rol) return false;
    const alcance = asig.alcanceOverride ?? asig.rol.alcancePorDefecto;
    if (alcance !== AlcanceRol.GLOBAL) return false;
    if (!asig.rol.permisos || asig.rol.permisos.length === 0) {
      return false;
    }
    return asig.rol.permisos.some((p) => {
      const clave = typeof p === 'string' ? p : p.permiso?.clave;
      return clave === 'organizacion.gestionar' || clave === 'roles.gestionar';
    });
  }

  private async asegurarNoDesactivarUltimoAdmin(
    usuarioId: number,
    asignacionIdACerrar?: number,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<void> {
    if (!tx.asignacionMiembro) return;
    const where: Prisma.AsignacionMiembroWhereInput = {
      activo: true,
      usuario: { activo: true },
      unidad: { activa: true },
      OR: [
        { alcanceOverride: AlcanceRol.GLOBAL },
        { alcanceOverride: null, rol: { alcancePorDefecto: AlcanceRol.GLOBAL } },
      ],
      ...(asignacionIdACerrar !== undefined ? { id: { not: asignacionIdACerrar } } : {}),
      ...(asignacionIdACerrar === undefined ? { usuarioId: { not: usuarioId } } : {}),
    };

    let candidatos: any[] = [];
    if (tx.asignacionMiembro.findMany) {
      candidatos = await tx.asignacionMiembro.findMany({
        where,
        include: { rol: { include: { permisos: { include: { permiso: true } } } } },
      });
    } else if (tx.asignacionMiembro.findFirst) {
      const uno = await tx.asignacionMiembro.findFirst({
        where,
        include: { rol: { include: { permisos: { include: { permiso: true } } } } },
      });
      if (uno) candidatos = [uno];
    }

    const hayOtroAdmin = Array.isArray(candidatos) && candidatos.some((a) => this.esAsignacionAdminGlobal(a));
    if (!hayOtroAdmin) {
      throw new BadRequestException(
        asignacionIdACerrar !== undefined
          ? 'No se puede cerrar la asignación del último administrador global activo del sistema'
          : 'No se puede desactivar al último administrador global activo del sistema',
      );
    }
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
    if (alcance.tipo !== 'GLOBAL' && esRolEducadorEfectivo(rol, alcanceOverride)) {
      throw new ForbiddenException('Solo un usuario con alcance global puede otorgar roles de educador');
    }

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

    if (rol.requiereRama !== undefined && rol.requiereRama !== null && unidad.tipo !== undefined) {
      const esUnidadRama = unidad.tipo === TipoUnidad.SECCION_RAMA;
      if (esUnidadRama && !rol.requiereRama) {
        throw new BadRequestException(
          'El rol seleccionado está configurado como rol sin rama asignada y no puede asignarse a una rama específica.',
        );
      }
      if (!esUnidadRama && rol.requiereRama) {
        throw new BadRequestException(
          'El rol seleccionado requiere estar asignado a una rama específica.',
        );
      }
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
