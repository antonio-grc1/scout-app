import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AlcanceRol, EstadoCargo, MetodoPago, Prisma } from '@prisma/client';
import { assertUnidadEnAlcance, filtroUsuariosPorAlcance } from '../common/scope/alcance.util.js';
import type { AlcanceAcceso, AuthUser } from '../common/types/auth.types.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  ActualizarDescuentoFamiliaDto,
  AplicarSaldoAFavorDto,
  CrearConceptoDto,
  CrearPlanCuotaMensualDto,
  EditarConceptoDto,
  EditarPlanCuotaMensualDto,
  GenerarCargoIndividualDto,
  GenerarCargosDto,
  ListarCargosQueryDto,
  RegistrarPagoDto,
  SincronizarMesesPlanDto,
  VincularHermanoDto,
} from './tesoreria.dto.js';

function redondearDosDecimales(n: number): Prisma.Decimal {
  return new Prisma.Decimal(Math.round(n * 100) / 100);
}

const NOMBRES_MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

@Injectable()
export class TesoreriaService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------- Planes de Cuota Mensual (Cuadros Anuales) ----------------
  async listarPlanesCuotaMensual(alcance: AlcanceAcceso, cicloAnio?: number) {
    const where: Prisma.PlanCuotaMensualWhereInput = {
      ...(cicloAnio ? { cicloAnio } : {}),
      ...(alcance.tipo === 'UNIDAD'
        ? { OR: [{ unidadId: null }, { unidadId: { in: alcance.unidadIds } }] }
        : {}),
    };

    return this.prisma.planCuotaMensual.findMany({
      where,
      orderBy: [{ cicloAnio: 'desc' }, { id: 'desc' }],
      include: {
        unidad: { select: { id: true, nombre: true } },
        conceptos: {
          orderBy: { mes: 'asc' },
          include: {
            _count: { select: { cargos: true } },
          },
        },
      },
    });
  }

  async crearPlanCuotaMensual(alcance: AlcanceAcceso, dto: CrearPlanCuotaMensualDto) {
    if (alcance.tipo === 'PROPIO') throw new ForbiddenException();
    if (dto.unidadId) {
      assertUnidadEnAlcance(alcance, dto.unidadId);
    } else if (alcance.tipo !== 'GLOBAL') {
      throw new ForbiddenException('Solo usuarios con alcance global pueden crear planes generales');
    }

    return this.prisma.$transaction(async (tx) => {
      const plan = await tx.planCuotaMensual.create({
        data: {
          nombre: dto.nombre,
          cicloAnio: dto.cicloAnio,
          montoMensual: new Prisma.Decimal(dto.montoMensual),
          diaVencimiento: dto.diaVencimiento,
          mesesHabilitadosJson: dto.mesesHabilitados,
          destinatarioTipo: dto.destinatarioTipo,
          unidadId: dto.unidadId ?? null,
          permiteDescuentoHermanos: dto.permiteDescuentoHermanos ?? true,
          porcentajeDescuentoHermanos:
            dto.porcentajeDescuentoHermanos !== undefined && dto.porcentajeDescuentoHermanos !== null
              ? new Prisma.Decimal(dto.porcentajeDescuentoHermanos)
              : null,
          excepcionesJson: dto.excepcionesIds ?? [],
        },
        include: { unidad: true },
      });

      for (const m of dto.mesesHabilitados) {
        await this.crearMesDePlanEnTx(tx, plan, m);
      }

      return plan;
    });
  }

  async sincronizarMesesPlan(alcance: AlcanceAcceso, planId: number, dto: SincronizarMesesPlanDto) {
    if (alcance.tipo === 'PROPIO') throw new ForbiddenException();
    const plan = await this.prisma.planCuotaMensual.findUnique({
      where: { id: planId },
      include: { unidad: true },
    });
    if (!plan) throw new NotFoundException('Plan no encontrado');

    if (plan.unidadId) {
      assertUnidadEnAlcance(alcance, plan.unidadId);
    } else if (alcance.tipo !== 'GLOBAL') {
      throw new ForbiddenException();
    }

    return this.prisma.$transaction(async (tx) => {
      const planActualizado = await tx.planCuotaMensual.update({
        where: { id: planId },
        data: {
          mesesHabilitadosJson: dto.mesesHabilitados,
        },
        include: { unidad: true },
      });

      for (const m of dto.mesesHabilitados) {
        await this.crearMesDePlanEnTx(tx, planActualizado, m);
      }

      return planActualizado;
    });
  }

  async editarPlanCuotaMensual(alcance: AlcanceAcceso, id: number, dto: EditarPlanCuotaMensualDto) {
    if (alcance.tipo === 'PROPIO') throw new ForbiddenException();
    const actual = await this.prisma.planCuotaMensual.findUnique({ where: { id } });
    if (!actual) throw new NotFoundException('Plan no encontrado');

    if (actual.unidadId) {
      assertUnidadEnAlcance(alcance, actual.unidadId);
    } else if (alcance.tipo !== 'GLOBAL') {
      throw new ForbiddenException();
    }

    return this.prisma.$transaction(async (tx) => {
      const planActualizado = await tx.planCuotaMensual.update({
        where: { id },
        data: {
          nombre: dto.nombre,
          cicloAnio: dto.cicloAnio,
          montoMensual: dto.montoMensual ? new Prisma.Decimal(dto.montoMensual) : undefined,
          diaVencimiento: dto.diaVencimiento,
          mesesHabilitadosJson: dto.mesesHabilitados ? dto.mesesHabilitados : undefined,
          destinatarioTipo: dto.destinatarioTipo,
          unidadId: dto.unidadId !== undefined ? dto.unidadId : undefined,
          permiteDescuentoHermanos: dto.permiteDescuentoHermanos,
          porcentajeDescuentoHermanos:
            dto.porcentajeDescuentoHermanos !== undefined
              ? dto.porcentajeDescuentoHermanos !== null
                ? new Prisma.Decimal(dto.porcentajeDescuentoHermanos)
                : null
              : undefined,
          excepcionesJson: dto.excepcionesIds ? dto.excepcionesIds : undefined,
        },
        include: { unidad: true },
      });

      if (dto.mesesHabilitados) {
        for (const m of dto.mesesHabilitados) {
          await this.crearMesDePlanEnTx(tx, planActualizado, m);
        }
      }

      return planActualizado;
    });
  }

  async eliminarPlanCuotaMensual(alcance: AlcanceAcceso, id: number) {
    if (alcance.tipo === 'PROPIO') throw new ForbiddenException();
    const plan = await this.prisma.planCuotaMensual.findUnique({
      where: { id },
      include: {
        conceptos: {
          include: {
            cargos: {
              include: {
                imputaciones: true,
              },
            },
          },
        },
      },
    });
    if (!plan) throw new NotFoundException('Plan no encontrado');

    if (plan.unidadId) {
      assertUnidadEnAlcance(alcance, plan.unidadId);
    } else if (alcance.tipo !== 'GLOBAL') {
      throw new ForbiddenException();
    }

    const tienePagos = plan.conceptos.some((c) =>
      c.cargos.some((cg) => cg.imputaciones.length > 0 || Number(cg.montoPagado) > 0),
    );

    if (tienePagos) {
      throw new BadRequestException(
        'No se puede eliminar el plan de cuotas porque ya existen pagos registrados vinculados a sus meses.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      for (const c of plan.conceptos) {
        await tx.cargoMiembro.deleteMany({ where: { conceptoId: c.id } });
      }
      await tx.conceptoCuota.deleteMany({ where: { planCuotaMensualId: id } });
      return tx.planCuotaMensual.delete({ where: { id } });
    });
  }

  private async crearMesDePlanEnTx(tx: Prisma.TransactionClient, plan: any, mesNum: number) {
    const nombreMes = NOMBRES_MESES[mesNum - 1] || `Mes ${mesNum}`;
    const fechaVto = new Date(Date.UTC(plan.cicloAnio, mesNum - 1, plan.diaVencimiento));

    let concepto = await tx.conceptoCuota.findFirst({
      where: {
        planCuotaMensualId: plan.id,
        mes: mesNum,
      },
    });

    if (!concepto) {
      concepto = await tx.conceptoCuota.create({
        data: {
          nombre: `${plan.nombre} - ${nombreMes}`,
          tipo: 'CUOTA_MENSUAL',
          montoBase: plan.montoMensual,
          cicloAnio: plan.cicloAnio,
          mes: mesNum,
          fechaVencimiento: fechaVto,
          planCuotaMensualId: plan.id,
          destinatarioTipo: plan.destinatarioTipo,
          unidadId: plan.unidadId,
          permiteDescuentoHermanos: plan.permiteDescuentoHermanos,
          porcentajeDescuentoHermanos: plan.porcentajeDescuentoHermanos,
          excepcionesJson: plan.excepcionesJson,
          esParaEducadores: plan.destinatarioTipo === 'EDUCADORES',
        },
      });
    }

    const excepciones: number[] = Array.isArray(plan.excepcionesJson) ? plan.excepcionesJson : [];
    const usuariosWhere: Prisma.UsuarioWhereInput = {
      activo: true,
      ...(excepciones.length > 0 ? { id: { notIn: excepciones } } : {}),
    };

    const rolFiltro =
      plan.destinatarioTipo === 'EDUCADORES'
        ? {
            OR: [
              { alcancePorDefecto: { not: AlcanceRol.PROPIO } },
              { nombre: { contains: 'Educador', mode: 'insensitive' as const } },
              { nombre: { contains: 'Jefe', mode: 'insensitive' as const } },
            ],
          }
        : plan.destinatarioTipo === 'PROTAGONISTAS'
          ? {
              OR: [
                { alcancePorDefecto: AlcanceRol.PROPIO },
                { nombre: { equals: 'Protagonista', mode: 'insensitive' as const } },
              ],
            }
          : undefined;

    usuariosWhere.asignaciones = {
      some: {
        activo: true,
        ...(plan.unidadId ? { unidadId: plan.unidadId } : {}),
        ...(rolFiltro ? { rol: rolFiltro } : {}),
      },
    };

    const candidatos = await tx.usuario.findMany({
      where: usuariosWhere,
      include: {
        grupoFamiliar: true,
        cargos: {
          where: { conceptoId: concepto.id, estado: { not: EstadoCargo.ANULADO } },
        },
      },
    });

    const montoBaseNum = Number(plan.montoMensual);

    for (const u of candidatos) {
      if (u.cargos.length > 0) continue;

      let descuentoNum = 0;
      if (plan.permiteDescuentoHermanos && u.grupoFamiliar) {
        let pct = 0;
        if (plan.porcentajeDescuentoHermanos !== null && plan.porcentajeDescuentoHermanos !== undefined) {
          pct = Number(plan.porcentajeDescuentoHermanos);
        } else {
          pct = Number(u.grupoFamiliar.porcentajeDescuentoHermanos);
        }
        if (pct > 0) {
          descuentoNum = (montoBaseNum * pct) / 100;
        }
      }

      const montoOriginal = redondearDosDecimales(montoBaseNum);
      const montoDescuento = redondearDosDecimales(descuentoNum);
      const montoFinal = redondearDosDecimales(Math.max(0, montoBaseNum - descuentoNum));

      await tx.cargoMiembro.create({
        data: {
          usuarioId: u.id,
          conceptoId: concepto.id,
          montoOriginal,
          montoDescuento,
          montoFinal,
          montoPagado: new Prisma.Decimal(0),
          estado: EstadoCargo.PENDIENTE,
        },
      });
    }
  }

  // ---------------- Conceptos de Cuota Sueltos (Campamentos / Extraordinarios) ----------------
  async listarConceptos(alcance: AlcanceAcceso, cicloAnio?: number) {
    const where: Prisma.ConceptoCuotaWhereInput = {
      ...(cicloAnio ? { cicloAnio } : {}),
      ...(alcance.tipo === 'UNIDAD'
        ? { OR: [{ unidadId: null }, { unidadId: { in: alcance.unidadIds } }] }
        : {}),
    };

    return this.prisma.conceptoCuota.findMany({
      where,
      orderBy: [{ cicloAnio: 'desc' }, { nombre: 'asc' }],
      include: {
        unidad: { select: { id: true, nombre: true } },
        _count: { select: { cargos: true } },
      },
    });
  }

  async crearConcepto(alcance: AlcanceAcceso, dto: CrearConceptoDto) {
    if (alcance.tipo === 'PROPIO') {
      throw new ForbiddenException('No tiene permisos para gestionar conceptos');
    }
    if (dto.unidadId) {
      assertUnidadEnAlcance(alcance, dto.unidadId);
    } else if (alcance.tipo !== 'GLOBAL') {
      throw new ForbiddenException('Solo usuarios con alcance global pueden crear conceptos generales');
    }

    return this.prisma.conceptoCuota.create({
      data: {
        nombre: dto.nombre,
        tipo: dto.tipo ?? 'CUOTA_MENSUAL',
        montoBase: new Prisma.Decimal(dto.montoBase),
        cicloAnio: dto.cicloAnio,
        fechaVencimiento: dto.fechaVencimiento ? new Date(dto.fechaVencimiento) : null,
        permiteDescuentoHermanos: dto.permiteDescuentoHermanos ?? true,
        porcentajeDescuentoHermanos:
          dto.porcentajeDescuentoHermanos !== undefined && dto.porcentajeDescuentoHermanos !== null
            ? new Prisma.Decimal(dto.porcentajeDescuentoHermanos)
            : null,
        esParaEducadores: dto.esParaEducadores ?? dto.destinatarioTipo === 'EDUCADORES',
        destinatarioTipo: dto.destinatarioTipo ?? 'TODOS',
        excepcionesJson: dto.excepcionesIds ?? [],
        mes: dto.mes ?? null,
        planCuotaMensualId: dto.planCuotaMensualId ?? null,
        unidadId: dto.unidadId ?? null,
      },
      include: { unidad: { select: { id: true, nombre: true } } },
    });
  }

  async editarConcepto(alcance: AlcanceAcceso, id: number, dto: EditarConceptoDto) {
    if (alcance.tipo === 'PROPIO') throw new ForbiddenException();
    const actual = await this.prisma.conceptoCuota.findUnique({ where: { id } });
    if (!actual) throw new NotFoundException('Concepto no encontrado');

    if (actual.unidadId) {
      assertUnidadEnAlcance(alcance, actual.unidadId);
    } else if (alcance.tipo !== 'GLOBAL') {
      throw new ForbiddenException('Solo usuarios globales pueden editar conceptos generales');
    }

    if (dto.unidadId !== undefined && dto.unidadId !== null) {
      assertUnidadEnAlcance(alcance, dto.unidadId);
    }

    const data: Prisma.ConceptoCuotaUpdateInput = {};
    if (dto.nombre !== undefined) data.nombre = dto.nombre;
    if (dto.tipo !== undefined) data.tipo = dto.tipo;
    if (dto.montoBase !== undefined) data.montoBase = new Prisma.Decimal(dto.montoBase);
    if (dto.cicloAnio !== undefined) data.cicloAnio = dto.cicloAnio;
    if (dto.fechaVencimiento !== undefined) {
      data.fechaVencimiento = dto.fechaVencimiento ? new Date(dto.fechaVencimiento) : null;
    }
    if (dto.permiteDescuentoHermanos !== undefined) {
      data.permiteDescuentoHermanos = dto.permiteDescuentoHermanos;
    }
    if (dto.porcentajeDescuentoHermanos !== undefined) {
      data.porcentajeDescuentoHermanos =
        dto.porcentajeDescuentoHermanos !== null
          ? new Prisma.Decimal(dto.porcentajeDescuentoHermanos)
          : null;
    }
    if (dto.esParaEducadores !== undefined) {
      data.esParaEducadores = dto.esParaEducadores;
    }
    if (dto.destinatarioTipo !== undefined) {
      data.destinatarioTipo = dto.destinatarioTipo;
      if (dto.destinatarioTipo === 'EDUCADORES') data.esParaEducadores = true;
    }
    if (dto.excepcionesIds !== undefined) {
      data.excepcionesJson = dto.excepcionesIds;
    }
    if (dto.mes !== undefined) {
      data.mes = dto.mes;
    }
    if (dto.unidadId !== undefined) {
      data.unidad = dto.unidadId ? { connect: { id: dto.unidadId } } : { disconnect: true };
    }

    return this.prisma.conceptoCuota.update({
      where: { id },
      data,
      include: { unidad: { select: { id: true, nombre: true } } },
    });
  }

  async eliminarConcepto(alcance: AlcanceAcceso, id: number) {
    if (alcance.tipo === 'PROPIO') throw new ForbiddenException();
    const actual = await this.prisma.conceptoCuota.findUnique({
      where: { id },
      include: {
        _count: {
          select: { cargos: true },
        },
      },
    });
    if (!actual) throw new NotFoundException('Concepto no encontrado');

    if (actual.unidadId) {
      assertUnidadEnAlcance(alcance, actual.unidadId);
    } else if (alcance.tipo !== 'GLOBAL') {
      throw new ForbiddenException('Solo usuarios globales pueden eliminar conceptos generales');
    }

    if (actual._count.cargos > 0) {
      const pagosVinculados = await this.prisma.pagoImputacion.count({
        where: { cargo: { conceptoId: id } },
      });
      if (pagosVinculados > 0) {
        throw new BadRequestException(
          'No se puede eliminar el concepto porque existen pagos registrados vinculados a sus cargos. Puede anular los cargos no pagados.',
        );
      }

      return this.prisma.$transaction(async (tx) => {
        await tx.cargoMiembro.deleteMany({ where: { conceptoId: id } });
        return tx.conceptoCuota.delete({ where: { id } });
      });
    }

    return this.prisma.conceptoCuota.delete({ where: { id } });
  }

  // ---------------- Grupos Familiares / Descuento ----------------
  async listarGruposFamiliares() {
    return this.prisma.grupoFamiliar.findMany({
      orderBy: { nombreFamilia: 'asc' },
      include: {
        miembros: {
          select: {
            id: true,
            dni: true,
            nombre: true,
            apellido: true,
            activo: true,
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
    });
  }

  async actualizarDescuentoFamilia(id: number, dto: ActualizarDescuentoFamiliaDto) {
    const familiar = await this.prisma.grupoFamiliar.findUnique({ where: { id } });
    if (!familiar) throw new NotFoundException('Grupo familiar no encontrado');

    return this.prisma.grupoFamiliar.update({
      where: { id },
      data: {
        nombreFamilia: dto.nombreFamilia,
        porcentajeDescuentoHermanos: new Prisma.Decimal(dto.porcentajeDescuentoHermanos),
      },
    });
  }

  async vincularHermano(dto: VincularHermanoDto) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: dto.usuarioId },
      select: { id: true, apellido: true, grupoFamiliarId: true },
    });
    if (!usuario) throw new NotFoundException('Miembro no encontrado');

    const hermano = await this.prisma.usuario.findUnique({
      where: { dni: dto.hermanoDni },
      select: { id: true, apellido: true, grupoFamiliarId: true },
    });
    if (!hermano) throw new NotFoundException(`No existe un miembro registrado con el DNI ${dto.hermanoDni}`);
    if (hermano.id === usuario.id) throw new BadRequestException('No puede vincular a un miembro consigo mismo');

    let grupoId = usuario.grupoFamiliarId || hermano.grupoFamiliarId;

    if (usuario.grupoFamiliarId && hermano.grupoFamiliarId && usuario.grupoFamiliarId !== hermano.grupoFamiliarId) {
      // Unificar grupos familiares: mover miembros del hermano al grupo del usuario
      await this.prisma.usuario.updateMany({
        where: { grupoFamiliarId: hermano.grupoFamiliarId },
        data: { grupoFamiliarId: usuario.grupoFamiliarId },
      });
      await this.prisma.grupoFamiliar.delete({ where: { id: hermano.grupoFamiliarId } }).catch(() => null);
      grupoId = usuario.grupoFamiliarId;
    } else if (!grupoId) {
      const nuevoGrupo = await this.prisma.grupoFamiliar.create({
        data: {
          nombreFamilia: `Familia ${usuario.apellido}`,
          porcentajeDescuentoHermanos: new Prisma.Decimal(0),
        },
      });
      grupoId = nuevoGrupo.id;
    }

    await this.prisma.usuario.update({
      where: { id: usuario.id },
      data: { grupoFamiliarId: grupoId },
    });
    await this.prisma.usuario.update({
      where: { id: hermano.id },
      data: { grupoFamiliarId: grupoId },
    });

    return this.prisma.grupoFamiliar.findUnique({
      where: { id: grupoId },
      include: {
        miembros: {
          select: {
            id: true,
            dni: true,
            nombre: true,
            apellido: true,
            activo: true,
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
    });
  }

  // ---------------- Generación de Cargos Colectivos (Campamento/Concepto) ----------------
  async generarCargos(alcance: AlcanceAcceso, dto: GenerarCargosDto) {
    const concepto = await this.prisma.conceptoCuota.findUnique({
      where: { id: dto.conceptoId },
      include: { unidad: true },
    });
    if (!concepto) throw new NotFoundException('Concepto no encontrado');

    if (concepto.unidadId) {
      assertUnidadEnAlcance(alcance, concepto.unidadId);
    } else if (alcance.tipo !== 'GLOBAL' && !dto.unidadId) {
      throw new ForbiddenException(
        'Para generar cargos de un concepto general con alcance de unidad, debe especificar su unidadId',
      );
    }

    const targetUnidadId = dto.unidadId ?? concepto.unidadId;
    if (targetUnidadId) {
      assertUnidadEnAlcance(alcance, targetUnidadId);
    }

    const excepcionesConcepto: number[] = Array.isArray(concepto.excepcionesJson)
      ? (concepto.excepcionesJson as number[])
      : [];
    const excluirIds = [...new Set([...(dto.excluirUsuarioIds ?? []), ...excepcionesConcepto])];

    const usuariosWhere: Prisma.UsuarioWhereInput = {
      activo: true,
      ...(dto.usuarioIds ? { id: { in: dto.usuarioIds } } : {}),
      ...(excluirIds.length > 0 ? { id: { notIn: excluirIds } } : {}),
    };

    const esEducadores = concepto.esParaEducadores || concepto.destinatarioTipo === 'EDUCADORES';
    const esProtagonistas = concepto.destinatarioTipo === 'PROTAGONISTAS';

    const rolFiltro = esEducadores
      ? {
          OR: [
            { alcancePorDefecto: { not: AlcanceRol.PROPIO } },
            { nombre: { contains: 'Educador', mode: 'insensitive' as const } },
            { nombre: { contains: 'Jefe', mode: 'insensitive' as const } },
          ],
        }
      : esProtagonistas
        ? {
            OR: [
              { alcancePorDefecto: AlcanceRol.PROPIO },
              { nombre: { equals: 'Protagonista', mode: 'insensitive' as const } },
            ],
          }
        : undefined;

    usuariosWhere.asignaciones = {
      some: {
        activo: true,
        ...(targetUnidadId ? { unidadId: targetUnidadId } : {}),
        ...(rolFiltro ? { rol: rolFiltro } : {}),
      },
    };

    const candidatos = await this.prisma.usuario.findMany({
      where: usuariosWhere,
      include: {
        grupoFamiliar: true,
        cargos: {
          where: { conceptoId: concepto.id, estado: { not: EstadoCargo.ANULADO } },
        },
      },
    });

    if (candidatos.length === 0) {
      return { totalGenerados: 0, cargos: [] };
    }

    const montoBaseNum = Number(concepto.montoBase);

    return this.prisma.$transaction(async (tx) => {
      const cargosCreados = [];

      for (const u of candidatos) {
        if (u.cargos.length > 0) continue;

        let descuentoNum = 0;
        if (
          dto.aplicarDescuentoFamiliar &&
          concepto.permiteDescuentoHermanos &&
          u.grupoFamiliar
        ) {
          let pct = 0;
          if (
            concepto.porcentajeDescuentoHermanos !== null &&
            concepto.porcentajeDescuentoHermanos !== undefined
          ) {
            pct = Number(concepto.porcentajeDescuentoHermanos);
          } else {
            pct = Number(u.grupoFamiliar.porcentajeDescuentoHermanos);
          }

          if (pct > 0) {
            descuentoNum = (montoBaseNum * pct) / 100;
          }
        }

        const montoOriginal = redondearDosDecimales(montoBaseNum);
        const montoDescuento = redondearDosDecimales(descuentoNum);
        const montoFinal = redondearDosDecimales(Math.max(0, montoBaseNum - descuentoNum));

        const cargo = await tx.cargoMiembro.create({
          data: {
            usuarioId: u.id,
            conceptoId: concepto.id,
            montoOriginal,
            montoDescuento,
            montoFinal,
            montoPagado: new Prisma.Decimal(0),
            estado: EstadoCargo.PENDIENTE,
          },
          include: {
            usuario: { select: { id: true, nombre: true, apellido: true, dni: true } },
            concepto: { select: { id: true, nombre: true } },
          },
        });
        cargosCreados.push(cargo);
      }

      return {
        totalGenerados: cargosCreados.length,
        cargos: cargosCreados,
      };
    });
  }

  // ---------------- Generación de Cargo Individual (Deuda Manual) ----------------
  async generarCargoIndividual(actor: AuthUser, alcance: AlcanceAcceso, dto: GenerarCargoIndividualDto) {
    if (alcance.tipo === 'PROPIO') {
      throw new ForbiddenException('No tiene permisos para generar cargos');
    }

    const usuario = await this.prisma.usuario.findUnique({
      where: { id: dto.usuarioId },
      include: { asignaciones: { where: { activo: true }, select: { unidadId: true } } },
    });
    if (!usuario) throw new NotFoundException('Miembro no encontrado');

    if (alcance.tipo === 'UNIDAD') {
      const unidadesMiembro = usuario.asignaciones.map((a) => a.unidadId);
      const tieneUnidad = unidadesMiembro.some((uId) => alcance.unidadIds.includes(uId));
      if (!tieneUnidad) throw new ForbiddenException('El miembro no pertenece a su unidad');
    }

    let conceptoId = dto.conceptoId;
    if (!conceptoId) {
      const nombreConcepto = dto.nombreConcepto?.trim() || 'Cargo Individual Extraordinario';
      const conceptoNuevo = await this.prisma.conceptoCuota.create({
        data: {
          nombre: nombreConcepto,
          tipo: dto.tipo ?? 'OTRO',
          montoBase: new Prisma.Decimal(dto.monto),
          cicloAnio: dto.cicloAnio ?? new Date().getFullYear(),
          fechaVencimiento: dto.fechaVencimiento ? new Date(dto.fechaVencimiento) : null,
          permiteDescuentoHermanos: false,
        },
      });
      conceptoId = conceptoNuevo.id;
    }

    const montoOriginal = redondearDosDecimales(dto.monto);
    const montoDescuento = redondearDosDecimales(dto.montoDescuento ?? 0);
    const montoFinal = redondearDosDecimales(Math.max(0, dto.monto - (dto.montoDescuento ?? 0)));

    return this.prisma.cargoMiembro.create({
      data: {
        usuarioId: dto.usuarioId,
        conceptoId,
        montoOriginal,
        montoDescuento,
        montoFinal,
        montoPagado: new Prisma.Decimal(0),
        estado: EstadoCargo.PENDIENTE,
      },
      include: {
        concepto: true,
        usuario: { select: { id: true, nombre: true, apellido: true, dni: true } },
      },
    });
  }

  // ---------------- Anulación de Cargos ----------------
  async anularCargo(alcance: AlcanceAcceso, id: number) {
    if (alcance.tipo === 'PROPIO') throw new ForbiddenException();
    const cargo = await this.prisma.cargoMiembro.findUnique({
      where: { id },
      include: {
        imputaciones: true,
        usuario: { select: { id: true, asignaciones: { where: { activo: true }, select: { unidadId: true } } } },
      },
    });
    if (!cargo) throw new NotFoundException('Cargo no encontrado');

    if (alcance.tipo === 'UNIDAD') {
      const uIds = cargo.usuario.asignaciones.map((a) => a.unidadId);
      const enAlcance = uIds.some((uId) => alcance.unidadIds.includes(uId));
      if (!enAlcance) throw new ForbiddenException('El cargo pertenece a un miembro fuera de su unidad');
    }

    if (cargo.estado === EstadoCargo.PAGADO || cargo.imputaciones.length > 0 || Number(cargo.montoPagado) > 0) {
      throw new BadRequestException('No se puede anular un cargo que ya tiene pagos imputados');
    }

    return this.prisma.cargoMiembro.update({
      where: { id },
      data: { estado: EstadoCargo.ANULADO },
      include: {
        concepto: true,
        usuario: { select: { id: true, nombre: true, apellido: true, dni: true } },
      },
    });
  }

  // ---------------- Listado de Cargos y Estado de Cuenta ----------------
  async listarCargos(alcance: AlcanceAcceso, q: ListarCargosQueryDto) {
    const where: Prisma.CargoMiembroWhereInput = {
      AND: [
        { usuario: filtroUsuariosPorAlcance(alcance) },
        q.usuarioId ? { usuarioId: q.usuarioId } : {},
        q.conceptoId ? { conceptoId: q.conceptoId } : {},
        q.planCuotaMensualId ? { concepto: { planCuotaMensualId: q.planCuotaMensualId } } : {},
        q.estado ? { estado: q.estado } : {},
        q.cicloAnio ? { concepto: { cicloAnio: q.cicloAnio } } : {},
        q.unidadId
          ? {
              usuario: {
                asignaciones: { some: { activo: true, unidadId: q.unidadId } },
              },
            }
          : {},
      ],
    };

    return this.prisma.cargoMiembro.findMany({
      where,
      orderBy: [{ id: 'desc' }],
      include: {
        usuario: { select: { id: true, dni: true, nombre: true, apellido: true } },
        concepto: { select: { id: true, nombre: true, tipo: true, cicloAnio: true, mes: true, fechaVencimiento: true } },
      },
    });
  }

  async obtenerEstadoCuenta(alcance: AlcanceAcceso, usuarioId: number) {
    const usuario = await this.prisma.usuario.findFirst({
      where: { AND: [{ id: usuarioId }, filtroUsuariosPorAlcance(alcance)] },
      select: {
        id: true,
        dni: true,
        nombre: true,
        apellido: true,
        saldoAFavor: true,
        grupoFamiliar: { select: { id: true, nombreFamilia: true, porcentajeDescuentoHermanos: true } },
      },
    });
    if (!usuario) throw new NotFoundException('Miembro no encontrado en su alcance');

    const cargos = await this.prisma.cargoMiembro.findMany({
      where: { usuarioId, estado: { not: EstadoCargo.ANULADO } },
      orderBy: [{ concepto: { cicloAnio: 'desc' } }, { concepto: { mes: 'desc' } }, { id: 'desc' }],
      include: {
        concepto: {
          select: {
            id: true,
            nombre: true,
            tipo: true,
            cicloAnio: true,
            mes: true,
            fechaVencimiento: true,
            planCuotaMensualId: true,
          },
        },
        imputaciones: {
          include: { pago: { select: { id: true, fechaPago: true, metodoPago: true, referenciaComprobante: true } } },
        },
      },
    });

    const pagos = await this.prisma.pago.findMany({
      where: {
        OR: [
          { usuarioId },
          { imputaciones: { some: { cargo: { usuarioId } } } },
        ],
      },
      orderBy: { fechaPago: 'desc' },
      take: 20,
      include: {
        registradoPor: { select: { id: true, nombre: true, apellido: true } },
        imputaciones: {
          include: {
            cargo: { select: { id: true, concepto: { select: { nombre: true } } } },
          },
        },
      },
    });

    let totalOriginal = 0;
    let totalDescuento = 0;
    let totalFinal = 0;
    let totalPagado = 0;

    for (const c of cargos) {
      totalOriginal += Number(c.montoOriginal);
      totalDescuento += Number(c.montoDescuento);
      totalFinal += Number(c.montoFinal);
      totalPagado += Number(c.montoPagado);
    }

    const saldoPendiente = Math.max(0, totalFinal - totalPagado);

    return {
      usuario,
      resumen: {
        totalCargos: cargos.length,
        totalOriginal: Math.round(totalOriginal * 100) / 100,
        totalDescuento: Math.round(totalDescuento * 100) / 100,
        totalFinal: Math.round(totalFinal * 100) / 100,
        totalPagado: Math.round(totalPagado * 100) / 100,
        saldoPendiente: Math.round(saldoPendiente * 100) / 100,
        saldoAFavor: Number(usuario.saldoAFavor ?? 0),
      },
      cargos,
      pagos,
    };
  }

  // ---------------- Registro de Pagos e Imputaciones ----------------
  async registrarPago(actor: AuthUser, alcance: AlcanceAcceso, dto: RegistrarPagoDto) {
    if (alcance.tipo === 'PROPIO') {
      throw new ForbiddenException('No tiene permisos para registrar pagos');
    }

    const sumaImputaciones = dto.imputaciones.reduce((acc, curr) => acc + curr.monto, 0);
    const montoTotalRedondeado = Math.round(dto.montoTotal * 100) / 100;
    const sumaImputacionesRedondeada = Math.round(sumaImputaciones * 100) / 100;

    if (montoTotalRedondeado < sumaImputacionesRedondeada) {
      throw new BadRequestException(
        `El monto total pagado ($${montoTotalRedondeado}) no puede ser inferior a la suma de las imputaciones ($${sumaImputacionesRedondeada})`,
      );
    }

    const excedente = Math.round((montoTotalRedondeado - sumaImputacionesRedondeada) * 100) / 100;

    return this.prisma.$transaction(async (tx) => {
      let targetUsuarioId = dto.usuarioId;

      for (const imp of dto.imputaciones) {
        const cargo = await tx.cargoMiembro.findUnique({
          where: { id: imp.cargoId },
          include: {
            usuario: {
              select: {
                id: true,
                asignaciones: { where: { activo: true }, select: { unidadId: true } },
              },
            },
          },
        });
        if (!cargo) throw new NotFoundException(`Cargo con ID ${imp.cargoId} no encontrado`);

        if (!targetUsuarioId) {
          targetUsuarioId = cargo.usuario.id;
        }

        if (alcance.tipo === 'UNIDAD') {
          const unidadesMiembro = cargo.usuario.asignaciones.map((a) => a.unidadId);
          const tieneUnidad = unidadesMiembro.some((uId) => alcance.unidadIds.includes(uId));
          if (!tieneUnidad) {
            throw new ForbiddenException(`El cargo ${imp.cargoId} pertenece a un miembro fuera de su unidad`);
          }
        }

        if (cargo.estado === EstadoCargo.ANULADO) {
          throw new BadRequestException(`El cargo ${imp.cargoId} se encuentra anulado`);
        }
        if (cargo.estado === EstadoCargo.PAGADO) {
          throw new ConflictException(`El cargo ${imp.cargoId} ya se encuentra totalmente saldado`);
        }

        const saldoPendiente = Number(cargo.montoFinal) - Number(cargo.montoPagado);
        const saldoRedondeado = Math.round(saldoPendiente * 100) / 100;

        if (imp.monto > saldoRedondeado + 0.001) {
          throw new BadRequestException(
            `El monto a imputar ($${imp.monto}) supera el saldo pendiente ($${saldoRedondeado}) del cargo #${cargo.id}`,
          );
        }

        const nuevoPagado = Number(cargo.montoPagado) + imp.monto;
        const nuevoEstado = nuevoPagado >= Number(cargo.montoFinal) - 0.001 ? EstadoCargo.PAGADO : EstadoCargo.PARCIAL;

        await tx.cargoMiembro.update({
          where: { id: cargo.id },
          data: {
            montoPagado: redondearDosDecimales(nuevoPagado),
            estado: nuevoEstado,
          },
        });
      }

      // Si hubo excedente y tenemos el titular, se agrega a su saldo a favor
      if (excedente > 0 && targetUsuarioId) {
        await tx.usuario.update({
          where: { id: targetUsuarioId },
          data: {
            saldoAFavor: { increment: new Prisma.Decimal(excedente) },
          },
        });
      }

      const pago = await tx.pago.create({
        data: {
          montoTotal: redondearDosDecimales(dto.montoTotal),
          metodoPago: dto.metodoPago,
          referenciaComprobante: dto.referenciaComprobante,
          observaciones: dto.observaciones,
          registradoPorUsuarioId: actor.sub,
          usuarioId: targetUsuarioId ?? null,
          imputaciones: {
            create: dto.imputaciones.map((imp) => ({
              cargoId: imp.cargoId,
              montoImputado: redondearDosDecimales(imp.monto),
            })),
          },
        },
        include: {
          registradoPor: { select: { id: true, nombre: true, apellido: true } },
          imputaciones: {
            include: {
              cargo: {
                select: {
                  id: true,
                  montoOriginal: true,
                  montoFinal: true,
                  montoPagado: true,
                  estado: true,
                  concepto: { select: { id: true, nombre: true } },
                  usuario: { select: { id: true, nombre: true, apellido: true, dni: true } },
                },
              },
            },
          },
        },
      });

      return {
        ...pago,
        excedenteAcreditado: excedente,
      };
    });
  }

  // ---------------- Aplicar Saldo a Favor a Deudas Pendientes ----------------
  async aplicarSaldoAFavor(actor: AuthUser, alcance: AlcanceAcceso, dto: AplicarSaldoAFavorDto) {
    if (alcance.tipo === 'PROPIO') {
      throw new ForbiddenException('No tiene permisos para aplicar saldo a favor');
    }

    const usuario = await this.prisma.usuario.findUnique({
      where: { id: dto.usuarioId },
      include: { asignaciones: { where: { activo: true }, select: { unidadId: true } } },
    });
    if (!usuario) throw new NotFoundException('Miembro no encontrado');

    if (alcance.tipo === 'UNIDAD') {
      const unidadesMiembro = usuario.asignaciones.map((a) => a.unidadId);
      const tieneUnidad = unidadesMiembro.some((uId) => alcance.unidadIds.includes(uId));
      if (!tieneUnidad) throw new ForbiddenException('El miembro no pertenece a su unidad');
    }

    const sumaAImputar = dto.imputaciones.reduce((acc, curr) => acc + curr.monto, 0);
    const sumaRedondeada = Math.round(sumaAImputar * 100) / 100;
    const saldoDisponible = Number(usuario.saldoAFavor);

    if (sumaRedondeada > saldoDisponible + 0.001) {
      throw new BadRequestException(
        `Saldo a favor insuficiente. Disponible: $${saldoDisponible.toFixed(2)}, Requerido: $${sumaRedondeada.toFixed(2)}`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Descontar del saldo a favor del miembro
      await tx.usuario.update({
        where: { id: dto.usuarioId },
        data: {
          saldoAFavor: { decrement: new Prisma.Decimal(sumaRedondeada) },
        },
      });

      // 2. Imputar a los cargos
      for (const imp of dto.imputaciones) {
        const cargo = await tx.cargoMiembro.findUnique({
          where: { id: imp.cargoId },
          include: { usuario: { select: { id: true, grupoFamiliarId: true } } },
        });
        if (!cargo) {
          throw new BadRequestException(`El cargo #${imp.cargoId} no existe`);
        }
        const mismoUsuario = cargo.usuarioId === dto.usuarioId;
        const mismaFamilia =
          usuario.grupoFamiliarId !== null &&
          usuario.grupoFamiliarId !== undefined &&
          cargo.usuario.grupoFamiliarId === usuario.grupoFamiliarId;

        if (!mismoUsuario && !mismaFamilia) {
          throw new BadRequestException(
            `El cargo #${imp.cargoId} no pertenece al miembro ni a su grupo familiar`,
          );
        }
        if (cargo.estado === EstadoCargo.PAGADO || cargo.estado === EstadoCargo.ANULADO) {
          throw new BadRequestException(`El cargo #${imp.cargoId} ya está saldado o anulado`);
        }

        const saldoPendiente = Number(cargo.montoFinal) - Number(cargo.montoPagado);
        if (imp.monto > saldoPendiente + 0.001) {
          throw new BadRequestException(
            `El monto $${imp.monto} excede el saldo pendiente de $${saldoPendiente.toFixed(2)} en cargo #${cargo.id}`,
          );
        }

        const nuevoPagado = Number(cargo.montoPagado) + imp.monto;
        const nuevoEstado = nuevoPagado >= Number(cargo.montoFinal) - 0.001 ? EstadoCargo.PAGADO : EstadoCargo.PARCIAL;

        await tx.cargoMiembro.update({
          where: { id: cargo.id },
          data: {
            montoPagado: redondearDosDecimales(nuevoPagado),
            estado: nuevoEstado,
          },
        });
      }

      // 3. Crear registro de Pago con método OTRO y referencia 'APLICACION_SALDO_A_FAVOR'
      const pago = await tx.pago.create({
        data: {
          montoTotal: redondearDosDecimales(sumaRedondeada),
          metodoPago: MetodoPago.OTRO,
          referenciaComprobante: 'APLICACION_SALDO_A_FAVOR',
          observaciones: 'Imputación de saldo a favor del miembro para cancelación de deuda',
          registradoPorUsuarioId: actor.sub,
          usuarioId: dto.usuarioId,
          imputaciones: {
            create: dto.imputaciones.map((imp) => ({
              cargoId: imp.cargoId,
              montoImputado: redondearDosDecimales(imp.monto),
            })),
          },
        },
      });

      return {
        mensaje: `Se imputaron $${sumaRedondeada.toFixed(2)} de saldo a favor exitosamente`,
        pagoId: pago.id,
      };
    });
  }

  async listarPagos(alcance: AlcanceAcceso, usuarioId?: number) {
    const where: Prisma.PagoWhereInput = {
      ...(usuarioId ? { OR: [{ usuarioId }, { imputaciones: { some: { cargo: { usuarioId } } } }] } : {}),
      ...(alcance.tipo === 'UNIDAD'
        ? {
            imputaciones: {
              some: {
                cargo: {
                  usuario: {
                    asignaciones: { some: { activo: true, unidadId: { in: alcance.unidadIds } } },
                  },
                },
              },
            },
          }
        : {}),
      ...(alcance.tipo === 'PROPIO'
        ? { OR: [{ usuarioId: alcance.usuarioId }, { imputaciones: { some: { cargo: { usuarioId: alcance.usuarioId } } } }] }
        : {}),
    };

    return this.prisma.pago.findMany({
      where,
      orderBy: { fechaPago: 'desc' },
      include: {
        registradoPor: { select: { id: true, nombre: true, apellido: true } },
        usuario: { select: { id: true, nombre: true, apellido: true, dni: true } },
        imputaciones: {
          include: {
            cargo: {
              select: {
                id: true,
                concepto: { select: { nombre: true } },
              },
            },
          },
        },
      },
    });
  }
}
