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
  assertActorDominaObjetivo,
  assertPuedeOtorgar,
  assertUnidadEnAlcance,
  esRolEducadorEfectivo,
  filtroUsuariosPorAlcance,
  resolverAlcance,
  rolTienePermisoConAlcanceGlobal,
  tipoMiembroEfectivo,
} from '../common/scope/alcance.util.js';
import { PERMISOS_CRITICOS_ADMIN } from '../common/scope/permisos-catalogo.js';
import type { AlcanceAcceso, AuthUser } from '../common/types/auth.types.js';
import { anioActual, hoyUtc, mesInicioCuotas } from '../common/utils/fechas.util.js';
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
/** Claves de `datosFijosJson` con datos de salud (alergias y dieta) que exigen `legajos.editar`. */
const CLAVES_SALUD_DATOS_FIJOS = new Set([
  'alergias',
  'alergias_tipos',
  'sufre_alergia',
  'sufre_alergia_detalle',
  'regimen_dietario',
  'regimen_dietario_tipos',
  'regimen_dietario_detalle',
  'dieta_especial_detalle',
]);

export const MIEMBRO_SELECT = {
  id: true,
  dni: true,
  nombre: true,
  apellido: true,
  fechaNacimiento: true,
  fechaIngreso: true,
  emailContacto: true,
  telefonoContacto: true,
  tipoMiembro: true,
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
          tipoUnidad: true,
          activo: true,
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
    const hermano = await this.prisma.usuario.findFirst({
      where: {
        AND: [{ dni: dniHermano, activo: true }, filtroUsuariosPorAlcance(alcance)],
      },
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
    if (!hermano || !hermano.activo) {
      throw new NotFoundException('No se encontró un miembro activo con ese DNI dentro de su alcance');
    }
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
  async crear(actor: AuthUser, alcance: AlcanceAcceso, dto: CrearMiembroDto) {
    if (dto.soloEnviarPorCorreo) {
      if (!dto.emailContacto?.trim()) {
        throw new BadRequestException(
          'Para enviar las credenciales solo por correo debes ingresar un email de contacto.',
        );
      }
      if (!this.mailer || !(await this.mailer.estaDisponibleParaEnvio())) {
        throw new BadRequestException(
          'El envío de correos no está configurado o está deshabilitado. Configuralo en Organización → Correo institucional.',
        );
      }
    }

    const { unidadId: unidadIdResuelta, tipoMiembroRol } = await this.resolverYValidarUnidadYRol(
      alcance,
      dto.unidadId,
      dto.rolId,
      actor,
    );
    assertUnidadEnAlcance(alcance, unidadIdResuelta);
    const tipoMiembroFinal = dto.tipoMiembro ?? tipoMiembroRol;
    // Temporal: usamos el DNI como clave inicial; se fuerza el cambio en el primer login.
    const claveTemporal = dto.dni;
    const passwordHash = await bcrypt.hash(claveTemporal, BCRYPT_ROUNDS);

    const id = await this.prisma.$transaction(async (tx) => {
      let grupoFamiliarId: number | null = null;
      let email = dto.emailContacto ?? null;
      let telefono = dto.telefonoContacto ?? null;
      let datosFijos: Record<string, unknown> = sanitizarJsonPlano(dto.datosFijosJson);

      if (dto.hermanoDni) {
        if (dto.hermanoDni === dto.dni) throw new BadRequestException('El hermano no puede ser el mismo DNI');
        const hermano = tx.usuario.findFirst
          ? await tx.usuario.findFirst({
              where: { AND: [{ dni: dto.hermanoDni, activo: true }, filtroUsuariosPorAlcance(alcance)] },
            })
          : null;
        if (!hermano || !hermano.activo) throw new NotFoundException('Hermano no encontrado en su alcance');

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
      const fechaIngreso = dto.fechaIngreso ? new Date(dto.fechaIngreso) : hoyUtc();
      const usuario = await tx.usuario.create({
        data: {
          dni: dto.dni,
          passwordHash,
          nombre: dto.nombre,
          apellido: dto.apellido,
          fechaNacimiento: new Date(dto.fechaNacimiento),
          fechaIngreso,
          emailContacto: email,
          telefonoContacto: telefono,
          tipoMiembro: tipoMiembroFinal,
          grupoFamiliarId,
          datosFijosJson: datosFijos as Prisma.InputJsonObject,
          requiereCambioClave: true,
          asignaciones: {
            create: { unidadId: unidadIdResuelta, rolId: dto.rolId, cicloAnio: ciclo },
          },
        },
      });

      // Cuotas del ciclo desde el mes de ingreso (por defecto, el mes actual)
      const mesDesde = mesInicioCuotas(fechaIngreso, ciclo);
      if (this.tesoreria && mesDesde !== null) {
        await this.tesoreria.sincronizarCuotasMiembroActivoEnTx(tx, usuario.id, mesDesde, ciclo);
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
    // Alcance PROPIO estricto (autogestión): solo contacto y datos fijos.
    if (alcance.tipo === 'PROPIO') {
      const prohibidos = Object.keys(dto).filter(
        (k) => !(CAMPOS_EDITABLES_PROPIOS as readonly string[]).includes(k),
      );
      if (prohibidos.length) throw new ForbiddenException(`No puede modificar: ${prohibidos.join(', ')}`);
    }

    // Permiso unificado por panel: padron.editar habilita editar la ficha del miembro según alcance.
    const CAMPOS_SENSIBLES_COBERTURA_TOTAL = new Set([
      'nombre',
      'apellido',
      'dni',
      'fechaNacimiento',
      'fechaIngreso',
      'tipoMiembro',
      'activo',
    ]);
    const CAMPOS_CONTROLADOS = new Set([
      'nombre',
      'apellido',
      'dni',
      'fechaNacimiento',
      'fechaIngreso',
      'tipoMiembro',
      'activo',
      'emailContacto',
      'telefonoContacto',
      'datosFijosJson',
    ]);

    const camposModificados = Object.keys(dto).filter((k) => {
      if (!CAMPOS_CONTROLADOS.has(k)) return false;
      const actual = (objetivo as Record<string, unknown>)[k];
      const nuevo = (dto as Record<string, unknown>)[k];
      if (k === 'fechaNacimiento') {
        return !(actual instanceof Date && String(nuevo) === actual.toISOString().slice(0, 10));
      }
      if (k === 'fechaIngreso') {
        return (nuevo ?? null) !== (actual instanceof Date ? actual.toISOString().slice(0, 10) : null);
      }
      return actual !== nuevo;
    });

    const alcanceEdicion = resolverAlcance(actor, 'padron.editar');

    if (esPropio) {
      const prohibidosPropios: string[] = [];
      for (const k of camposModificados) {
        const esEditablePropio = (CAMPOS_EDITABLES_PROPIOS as readonly string[]).includes(k);
        if (esEditablePropio) {
          if (!alcanceEdicion && alcance.tipo !== 'PROPIO') {
            prohibidosPropios.push(k);
          }
        } else if (alcanceEdicion?.tipo !== 'GLOBAL') {
          prohibidosPropios.push(k);
        }
      }
      if (prohibidosPropios.length) {
        throw new ForbiddenException(`No puede modificar: ${prohibidosPropios.join(', ')}`);
      }
    } else {
      const objetivoTieneGlobal = objetivo.asignaciones.some(
        (a) => alcanceEfectivo(a) === AlcanceRol.GLOBAL,
      );
      const unidadesObjetivo = objetivo.asignaciones.map((a) => a.unidadId);
      const sinPermiso: string[] = [];

      for (const k of camposModificados) {
        if (!alcanceEdicion || alcanceEdicion.tipo === 'PROPIO') {
          sinPermiso.push(k);
          continue;
        }
        if (alcanceEdicion.tipo === 'GLOBAL') continue;
        if (objetivoTieneGlobal) {
          throw new ForbiddenException('No puede modificar a un usuario con alcance global');
        }
        const requiereCoberturaCompleta = CAMPOS_SENSIBLES_COBERTURA_TOTAL.has(k);
        const cubierto = requiereCoberturaCompleta
          ? unidadesObjetivo.length > 0 && unidadesObjetivo.every((uId) => alcanceEdicion.unidadIds.includes(uId))
          : unidadesObjetivo.some((uId) => alcanceEdicion.unidadIds.includes(uId));
        if (!cubierto) {
          sinPermiso.push(k);
        }
      }
      if (sinPermiso.length) {
        throw new ForbiddenException(`No tiene permiso para modificar: ${sinPermiso.join(', ')}`);
      }
      // Alergias y dieta son datos de salud (ficha médica): además de padron.editar,
      // cambiarlos en otro miembro exige legajos.editar con alcance sobre él.
      if (dto.datosFijosJson && typeof dto.datosFijosJson === 'object') {
        const actualJson = (objetivo.datosFijosJson ?? {}) as Record<string, unknown>;
        const tocaSalud = Object.entries(dto.datosFijosJson as Record<string, unknown>).some(
          ([k, v]) =>
            CLAVES_SALUD_DATOS_FIJOS.has(k) && JSON.stringify(v ?? null) !== JSON.stringify(actualJson[k] ?? null),
        );
        if (tocaSalud) {
          const alcanceSalud = resolverAlcance(actor, 'legajos.editar');
          const cubreSalud =
            alcanceSalud?.tipo === 'GLOBAL' ||
            (alcanceSalud?.tipo === 'UNIDAD' &&
              unidadesObjetivo.some((uId) => alcanceSalud.unidadIds.includes(uId)));
          if (!cubreSalud) {
            throw new ForbiddenException(
              'Las alergias y la dieta son datos de salud: modificarlas requiere el permiso de legajos.',
            );
          }
        }
      }
      if (alcance.tipo !== 'GLOBAL' && objetivoTieneGlobal) {
        throw new ForbiddenException('No puede modificar a un usuario con alcance global');
      }
      if (camposModificados.length > 0) {
        assertActorDominaObjetivo(
          actor,
          objetivo.asignaciones,
          'No puede modificar a un usuario con permisos o alcance superiores a los suyos',
        );
      }
    }

    const cambioEstadoActivo = dto.activo !== undefined && dto.activo !== objetivo.activo;
    const cambioTipoMiembro =
      dto.tipoMiembro !== undefined &&
      dto.tipoMiembro !== (objetivo as { tipoMiembro?: string | null }).tipoMiembro;
    const capacidadesCriticasObjetivo =
      dto.activo === false && objetivo.activo
        ? this.extraerCapacidadesCriticasGlobales(objetivo.asignaciones)
        : [];
    const verificaUltimoAdmin = capacidadesCriticasObjetivo.length > 0;

    const ejecutarEdicion = async (tx: Prisma.TransactionClient) => {
      if ((dto.datosFijosJson || verificaUltimoAdmin) && '$queryRaw' in tx && typeof tx.$queryRaw === 'function') {
        await tx.$queryRaw`SELECT id FROM usuarios WHERE id = ${id} FOR UPDATE`;
      }
      if (verificaUltimoAdmin) {
        await this.asegurarNoDesactivarUltimoAdmin(id, capacidadesCriticasObjetivo, undefined, tx);
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
          fechaIngreso: dto.fechaIngreso ? new Date(dto.fechaIngreso) : dto.fechaIngreso,
          datosFijosJson,
          ...(dto.activo === false && objetivo.activo ? { tokenVersion: { increment: 1 } } : {}),
        },
        select: MIEMBRO_SELECT,
      });

      if ((cambioEstadoActivo || cambioTipoMiembro) && this.tesoreria) {
        if (dto.activo === false) {
          await this.tesoreria.anularCargosImpagosDeMiembroEnTx(tx, id);
        } else if (actualizado.activo !== false) {
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

      // Si se adelantó la fecha de ingreso, se generan las cuotas que faltan desde ese mes.
      // Las que ya existen no se tocan (si se atrasa la fecha, se anulan a mano).
      if (camposModificados.includes('fechaIngreso') && actualizado.fechaIngreso && actualizado.activo && this.tesoreria) {
        const ciclo = anioActual();
        const mesDesde = mesInicioCuotas(actualizado.fechaIngreso, ciclo);
        if (mesDesde !== null) {
          await this.tesoreria.sincronizarCuotasMiembroActivoEnTx(tx, id, mesDesde, ciclo);
          return tx.usuario.findUniqueOrThrow({ where: { id }, select: MIEMBRO_SELECT });
        }
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
          asignaciones: {
            where: { activo: true },
            include: { rol: { include: { permisos: { include: { permiso: true } } } } },
          },
        },
      });
      if (!objetivo) throw new NotFoundException('Miembro no encontrado');
      assertActorDominaObjetivo(
        actor,
        objetivo.asignaciones ?? [],
        'No puede eliminar definitivamente a un usuario con permisos superiores a los suyos',
      );
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
  async agregarAsignacion(actor: AuthUser, alcance: AlcanceAcceso, usuarioId: number, dto: CrearAsignacionDto) {
    if (alcance.tipo === 'PROPIO') throw new ForbiddenException('No puede gestionar asignaciones');
    const { unidadId: unidadIdResuelta } = await this.resolverYValidarUnidadYRol(
      alcance,
      dto.unidadId,
      dto.rolId,
      actor,
    );
    assertUnidadEnAlcance(alcance, unidadIdResuelta);

    const usuario = await this.prisma.usuario.findFirst({
      where: { AND: [{ id: usuarioId }, filtroUsuariosPorAlcance(alcance)] },
      include: {
        asignaciones: {
          where: { activo: true },
          include: { rol: { include: { permisos: { include: { permiso: true } } } } },
        },
      },
    });
    if (!usuario || !usuario.activo) throw new NotFoundException('Miembro no encontrado en su alcance');

    assertActorDominaObjetivo(
      actor,
      usuario.asignaciones,
      'No puede gestionar asignaciones de un usuario con permisos o alcance superiores a los suyos',
    );

    if (alcance.tipo !== 'GLOBAL') {
      const tieneAsignacionGlobalOEducador =
        (usuario as { tipoMiembro?: string | null }).tipoMiembro === 'EDUCADOR' ||
        usuario.asignaciones.some(
          (a) =>
            a.rol.alcancePorDefecto === AlcanceRol.GLOBAL ||
            esRolEducadorEfectivo(a.rol),
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
      assertPuedeOtorgar(alcance, asig.rol, actor, asig.unidadId);
      if (alcance.tipo !== 'GLOBAL' && esRolEducadorEfectivo(asig.rol)) {
        throw new ForbiddenException('Solo un usuario con alcance global puede cerrar asignaciones de educadores');
      }

      const capacidadesCriticasAsig = this.extraerCapacidadesCriticasGlobales([asig]);
      if (capacidadesCriticasAsig.length > 0) {
        await this.asegurarNoDesactivarUltimoAdmin(usuarioId, capacidadesCriticasAsig, asignacionId, tx);
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
  private esAsignacionConPermisoCriticoGlobal(
    asig: {
      rol?: {
        activo?: boolean;
        alcancePorDefecto: AlcanceRol;
        permisos?: ReadonlyArray<{ permiso?: { clave: string }; alcance?: AlcanceRol | null } | string>;
      };
    },
    clavePermiso?: string,
  ): boolean {
    if (!asig.rol || asig.rol.activo === false) return false;
    if (clavePermiso) return rolTienePermisoConAlcanceGlobal(asig.rol, clavePermiso);
    return PERMISOS_CRITICOS_ADMIN.some((c) => rolTienePermisoConAlcanceGlobal(asig.rol, c));
  }

  private extraerCapacidadesCriticasGlobales(
    asignaciones: ReadonlyArray<{
      rol?: {
        activo?: boolean;
        alcancePorDefecto: AlcanceRol;
        permisos?: ReadonlyArray<{ permiso?: { clave: string }; alcance?: AlcanceRol | null } | string>;
      };
    }>,
  ): string[] {
    const caps = new Set<string>();
    for (const a of asignaciones) {
      if (!a.rol || a.rol.activo === false) continue;
      for (const c of PERMISOS_CRITICOS_ADMIN) {
        if (rolTienePermisoConAlcanceGlobal(a.rol, c)) {
          caps.add(c);
        }
      }
    }
    return [...caps];
  }

  private async asegurarNoDesactivarUltimoAdmin(
    usuarioId: number,
    capacidadesRequeridas: readonly string[],
    asignacionIdACerrar?: number,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<void> {
    if (!tx.asignacionMiembro) return;
    const where: Prisma.AsignacionMiembroWhereInput = {
      activo: true,
      usuario: { activo: true },
      unidad: { activa: true },
      rol: { alcancePorDefecto: AlcanceRol.GLOBAL, activo: true },
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

    const caps = capacidadesRequeridas.length > 0 ? capacidadesRequeridas : PERMISOS_CRITICOS_ADMIN;
    for (const cap of caps) {
      const cubierto =
        Array.isArray(candidatos) &&
        candidatos.some((a) => this.esAsignacionConPermisoCriticoGlobal(a, cap));
      if (!cubierto) {
        throw new BadRequestException(
          asignacionIdACerrar !== undefined
            ? `No se puede cerrar la asignación del último administrador global activo del sistema con permiso "${cap}"`
            : `No se puede desactivar al último administrador global activo del sistema con permiso "${cap}"`,
        );
      }
    }
  }

  // ---------------- Helpers ----------------
  private async resolverYValidarUnidadYRol(
    alcance: AlcanceAcceso,
    unidadId: number | undefined,
    rolId: number,
    actor: AuthUser,
  ): Promise<{ unidadId: number; tipoMiembroRol: 'PROTAGONISTA' | 'EDUCADOR' }> {
    const rol = await this.prisma.rol.findUnique({
      where: { id: rolId },
      include: { permisos: { include: { permiso: true } } },
    });
    if (!rol) throw new BadRequestException('Rol inexistente');
    if (rol.activo === false) {
      throw new BadRequestException('El rol seleccionado está archivado o inactivo');
    }
    assertPuedeOtorgar(alcance, rol, actor, unidadId);
    if (alcance.tipo !== 'GLOBAL' && esRolEducadorEfectivo(rol)) {
      throw new ForbiddenException('Solo un usuario con alcance global puede otorgar roles de educador');
    }

    let unidad = unidadId
      ? await this.prisma.unidadOrganizativa.findUnique({ where: { id: unidadId } })
      : null;

    if (!unidad && rol.requiereRama === false && this.prisma.unidadOrganizativa.findFirst) {
      const tipoPreferido =
        rol.tipoUnidad && rol.tipoUnidad !== TipoUnidad.SECCION_RAMA
          ? rol.tipoUnidad
          : rol.alcancePorDefecto === AlcanceRol.GLOBAL
            ? TipoUnidad.JEFATURA
            : TipoUnidad.SIN_RAMA_APOYO;
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

    if (unidadId === undefined) {
      assertPuedeOtorgar(alcance, rol, actor, unidad.id);
    }

    return { unidadId: unidad.id, tipoMiembroRol: tipoMiembroEfectivo(rol) };
  }
}
