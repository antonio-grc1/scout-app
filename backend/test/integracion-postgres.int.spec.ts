import 'dotenv/config';
import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  EstadoCargo,
  EstadoEvento,
  MetodoPago,
  Prisma,
  TipoCuenta,
  TipoMovimientoFinanciero,
  TipoRubro,
} from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AlcanceAcceso, AuthUser } from '../src/common/types/auth.types.js';
import { MiembrosService } from '../src/miembros/miembros.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { TesoreriaCajaService } from '../src/tesoreria/tesoreria-caja.service.js';
import { TesoreriaCuotasService } from '../src/tesoreria/tesoreria-cuotas.service.js';
import { TesoreriaEventosService } from '../src/tesoreria/tesoreria-eventos.service.js';
import { TesoreriaService } from '../src/tesoreria/tesoreria.service.js';

describe('Integración Real PostgreSQL - Concurrencia, Constraints, SQL y Búsqueda', () => {
  const prisma = new PrismaService();
  let tesoreria: TesoreriaService;
  let miembros: MiembrosService;

  const runTag = `INT_${Date.now()}`;
  let actor: AuthUser;
  const alcanceGlobal: AlcanceAcceso = {
    tipo: 'GLOBAL',
    usuarioId: 0,
    permisos: new Set(['tesoreria.gestionar', 'cuotas.cobrar', 'cuotas.ver', 'eventos.gestionar']),
  };

  // IDs creados para limpieza ordenada al finalizar
  const created = {
    usuarioIds: [] as number[],
    cuentaIds: [] as number[],
    rubroIds: [] as number[],
    conceptoIds: [] as number[],
    planIds: [] as number[],
    eventoIds: [] as number[],
    unidadId: 0,
    rolId: 0,
    adminId: 0,
  };

  beforeAll(async () => {
    await prisma.$connect();

    const cuotas = new TesoreriaCuotasService(prisma);
    const caja = new TesoreriaCajaService(prisma);
    const eventos = new TesoreriaEventosService(prisma);
    tesoreria = new TesoreriaService(prisma, cuotas, caja, eventos);
    miembros = new MiembrosService(prisma);

    const admin = await prisma.usuario.findFirst({ where: { activo: true }, orderBy: { id: 'asc' } });
    const unidad = await prisma.unidadOrganizativa.findFirst({
      where: { activa: true },
      orderBy: { id: 'asc' },
    });
    const rol = await prisma.rol.findFirst({ orderBy: { id: 'asc' } });

    if (!admin || !unidad || !rol) {
      throw new Error('La base de datos requiere seed básico (usuarios, unidades, roles) antes de correr test:integration');
    }

    created.adminId = admin.id;
    created.unidadId = unidad.id;
    created.rolId = rol.id;
    alcanceGlobal.usuarioId = admin.id;
    actor = {
      sub: admin.id,
      dni: admin.dni,
      nombre: admin.nombre,
      apellido: admin.apellido,
      asignaciones: [],
    };
  });

  afterAll(async () => {
    // Limpieza en orden inverso a las FK sin tocar datos del seed
    if (created.eventoIds.length > 0) {
      const pedidos = await prisma.pedidoEvento.findMany({
        where: { eventoId: { in: created.eventoIds } },
        select: { id: true },
      });
      const pedidoIds = pedidos.map((p) => p.id);
      if (pedidoIds.length > 0) {
        await prisma.movimientoFinanciero.deleteMany({ where: { pedidoEventoId: { in: pedidoIds } } });
        await prisma.ticketEvento.deleteMany({ where: { pedidoId: { in: pedidoIds } } });
        await prisma.detallePedidoEvento.deleteMany({ where: { pedidoId: { in: pedidoIds } } });
        await prisma.pedidoEvento.deleteMany({ where: { id: { in: pedidoIds } } });
      }
      await prisma.itemEvento.deleteMany({ where: { eventoId: { in: created.eventoIds } } });
      await prisma.evento.deleteMany({ where: { id: { in: created.eventoIds } } });
    }

    if (created.cuentaIds.length > 0) {
      const gastos = await prisma.gasto.findMany({
        where: { cuentaId: { in: created.cuentaIds } },
        select: { id: true },
      });
      const gastoIds = gastos.map((g) => g.id);
      if (gastoIds.length > 0) {
        await prisma.movimientoFinanciero.deleteMany({ where: { gastoId: { in: gastoIds } } });
        await prisma.gasto.deleteMany({ where: { id: { in: gastoIds } } });
      }

      const movsCuenta = await prisma.movimientoFinanciero.findMany({
        where: { cuentaId: { in: created.cuentaIds } },
        select: { pagoId: true },
      });
      const pagoIds = movsCuenta.map((m) => m.pagoId).filter((id): id is number => id !== null);
      await prisma.movimientoFinanciero.deleteMany({ where: { cuentaId: { in: created.cuentaIds } } });
      if (pagoIds.length > 0) {
        await prisma.pagoImputacion.deleteMany({ where: { pagoId: { in: pagoIds } } });
        await prisma.pago.deleteMany({ where: { id: { in: pagoIds } } });
      }
      await prisma.cuentaFinanciera.deleteMany({ where: { id: { in: created.cuentaIds } } });
    }

    if (created.conceptoIds.length > 0 || created.usuarioIds.length > 0) {
      const cargoWhere: Prisma.CargoMiembroWhereInput = {
        OR: [
          ...(created.conceptoIds.length > 0 ? [{ conceptoId: { in: created.conceptoIds } }] : []),
          ...(created.usuarioIds.length > 0 ? [{ usuarioId: { in: created.usuarioIds } }] : []),
        ],
      };
      const cargos = await prisma.cargoMiembro.findMany({ where: cargoWhere, select: { id: true } });
      const cargoIds = cargos.map((c) => c.id);
      if (cargoIds.length > 0) {
        const imps = await prisma.pagoImputacion.findMany({
          where: { cargoId: { in: cargoIds } },
          select: { pagoId: true },
        });
        const pagoIds = Array.from(new Set(imps.map((i) => i.pagoId)));
        if (pagoIds.length > 0) {
          await prisma.movimientoFinanciero.deleteMany({ where: { pagoId: { in: pagoIds } } });
          await prisma.pagoImputacion.deleteMany({ where: { pagoId: { in: pagoIds } } });
          await prisma.pago.deleteMany({ where: { id: { in: pagoIds } } });
        }
        await prisma.cargoMiembro.deleteMany({ where: { id: { in: cargoIds } } });
      }
    }

    if (created.conceptoIds.length > 0) {
      await prisma.conceptoExcepcion.deleteMany({ where: { conceptoId: { in: created.conceptoIds } } });
      await prisma.conceptoCuota.deleteMany({ where: { id: { in: created.conceptoIds } } });
    }

    if (created.planIds.length > 0) {
      await prisma.planCuotaExcepcion.deleteMany({
        where: { planCuotaMensualId: { in: created.planIds } },
      });
      await prisma.planCuotaMensual.deleteMany({ where: { id: { in: created.planIds } } });
    }

    if (created.usuarioIds.length > 0) {
      await prisma.pago.deleteMany({ where: { usuarioId: { in: created.usuarioIds } } });
      await prisma.usuario.deleteMany({ where: { id: { in: created.usuarioIds } } });
    }

    if (created.rubroIds.length > 0) {
      await prisma.rubroContable.deleteMany({ where: { id: { in: created.rubroIds } } });
    }

    await prisma.$disconnect();
  });

  it('Concurrencia FOR UPDATE y stock atómico: evita doble sobregiro en transferencias, pagos simultáneos y sobreventa de stock', async () => {
    const origen = await prisma.cuentaFinanciera.create({
      data: { nombre: `${runTag}_Origen`, tipo: TipoCuenta.CAJA_EFECTIVO, activa: true },
    });
    const destino = await prisma.cuentaFinanciera.create({
      data: { nombre: `${runTag}_Destino`, tipo: TipoCuenta.BANCO, activa: true },
    });
    created.cuentaIds.push(origen.id, destino.id);

    // Fondear origen con $1000
    await prisma.movimientoFinanciero.create({
      data: {
        cuentaId: origen.id,
        tipo: TipoMovimientoFinanciero.INGRESO_OTRO,
        montoIngreso: new Prisma.Decimal('1000.00'),
        montoEgreso: new Prisma.Decimal('0.00'),
        conceptoTexto: 'Saldo inicial test concurrencia',
        creadoPorUsuarioId: created.adminId,
      },
    });

    // Dos transferencias simultáneas de $700 sobre $1000 disponible -> exactamente una pasa y otra rechaza
    const transferencias = await Promise.allSettled([
      tesoreria.transferirEntreCuentas(actor, alcanceGlobal, {
        origenCuentaId: origen.id,
        destinoCuentaId: destino.id,
        monto: 700,
        concepto: 'Transferencia A',
      }),
      tesoreria.transferirEntreCuentas(actor, alcanceGlobal, {
        origenCuentaId: origen.id,
        destinoCuentaId: destino.id,
        monto: 700,
        concepto: 'Transferencia B',
      }),
    ]);

    expect(transferencias.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(transferencias.filter((r) => r.status === 'rejected')).toHaveLength(1);
    const rejected = transferencias.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(BadRequestException);

    // Usuario + cargo de $1000 con dos pagos concurrentes de $1000
    const socio = await prisma.usuario.create({
      data: {
        dni: `99${String(Date.now()).slice(-6)}`,
        passwordHash: 'hash',
        nombre: 'Tomás',
        apellido: 'Concurrencia',
        fechaNacimiento: new Date('2012-03-15'),
      },
    });
    created.usuarioIds.push(socio.id);

    const concepto = await prisma.conceptoCuota.create({
      data: {
        nombre: `${runTag}_ConceptoPago`,
        tipo: 'CUOTA_MENSUAL',
        montoBase: new Prisma.Decimal('1000.00'),
        cicloAnio: 2026,
      },
    });
    created.conceptoIds.push(concepto.id);

    const cargo = await prisma.cargoMiembro.create({
      data: {
        usuarioId: socio.id,
        conceptoId: concepto.id,
        montoOriginal: new Prisma.Decimal('1000.00'),
        montoDescuento: new Prisma.Decimal('0.00'),
        montoFinal: new Prisma.Decimal('1000.00'),
        montoPagado: new Prisma.Decimal('0.00'),
        estado: EstadoCargo.PENDIENTE,
      },
    });

    const pagosRes = await Promise.allSettled([
      tesoreria.registrarPago(actor, alcanceGlobal, {
        usuarioId: socio.id,
        montoTotal: 1000,
        metodoPago: MetodoPago.EFECTIVO,
        cuentaId: origen.id,
        imputaciones: [{ cargoId: cargo.id, monto: 1000 }],
      }),
      tesoreria.registrarPago(actor, alcanceGlobal, {
        usuarioId: socio.id,
        montoTotal: 1000,
        metodoPago: MetodoPago.EFECTIVO,
        cuentaId: origen.id,
        imputaciones: [{ cargoId: cargo.id, monto: 1000 }],
      }),
    ]);

    expect(pagosRes.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(pagosRes.filter((r) => r.status === 'rejected')).toHaveLength(1);
    const pagoRejected = pagosRes.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(pagoRejected.reason).toBeInstanceOf(ConflictException);

    const [cargoDb, socioDb] = await Promise.all([
      prisma.cargoMiembro.findUniqueOrThrow({ where: { id: cargo.id } }),
      prisma.usuario.findUniqueOrThrow({ where: { id: socio.id } }),
    ]);
    // Nunca excede monto_final: el segundo pago queda bloqueado por FOR UPDATE al leer estado PAGADO
    expect(Number(cargoDb.montoPagado)).toBe(1000);
    expect(cargoDb.estado).toBe(EstadoCargo.PAGADO);
    expect(Number(socioDb.saldoAFavor)).toBe(0);

    // Sobreventa concurrente de stock de evento (stock = 3, dos pedidos de 2 unidades)
    const evento = await prisma.evento.create({
      data: {
        titulo: `${runTag}_EventoStock`,
        estado: EstadoEvento.PUBLICADO,
        fechaEvento: new Date('2026-10-10'),
        creadoPorUsuarioId: created.adminId,
        items: {
          create: [
            {
              nombre: 'Porción Locro',
              precioVenta: new Prisma.Decimal('3000.00'),
              costoUnitario: new Prisma.Decimal('1000.00'),
              gananciaUnitaria: new Prisma.Decimal('2000.00'),
              stockTotal: 3,
              stockDisponible: 3,
            },
          ],
        },
      },
      include: { items: true },
    });
    created.eventoIds.push(evento.id);
    const itemId = evento.items[0].id;

    const pedidosRes = await Promise.allSettled([
      tesoreria.crearPedidoEvento(actor, alcanceGlobal, {
        eventoId: evento.id,
        compradorNombre: 'Comprador 1',
        items: [{ itemId, cantidad: 2 }],
      }),
      tesoreria.crearPedidoEvento(actor, alcanceGlobal, {
        eventoId: evento.id,
        compradorNombre: 'Comprador 2',
        items: [{ itemId, cantidad: 2 }],
      }),
    ]);

    expect(pedidosRes.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(pedidosRes.filter((r) => r.status === 'rejected')).toHaveLength(1);
    const itemFinal = await prisma.itemEvento.findUniqueOrThrow({ where: { id: itemId } });
    expect(itemFinal.stockDisponible).toBe(1);
  });

  it('Constraints SQL CHECK, índices únicos parciales y FK onDelete Restrict/Cascade se cumplen en PostgreSQL', async () => {
    const miembro = await prisma.usuario.create({
      data: {
        dni: `98${String(Date.now()).slice(-6)}`,
        passwordHash: 'hash',
        nombre: 'Sofía',
        apellido: 'Constraints',
        fechaNacimiento: new Date('2011-06-20'),
      },
    });
    created.usuarioIds.push(miembro.id);

    const concepto = await prisma.conceptoCuota.create({
      data: {
        nombre: `${runTag}_ConceptoCheck`,
        tipo: 'CAMPAMENTO',
        montoBase: new Prisma.Decimal('500.00'),
        cicloAnio: 2026,
      },
    });
    created.conceptoIds.push(concepto.id);

    const cargo = await prisma.cargoMiembro.create({
      data: {
        usuarioId: miembro.id,
        conceptoId: concepto.id,
        montoOriginal: new Prisma.Decimal('500.00'),
        montoDescuento: new Prisma.Decimal('0.00'),
        montoFinal: new Prisma.Decimal('500.00'),
        montoPagado: new Prisma.Decimal('0.00'),
        estado: EstadoCargo.PENDIENTE,
      },
    });

    // 1. CHECK saldo_a_favor >= 0
    await expect(
      prisma.$executeRaw`UPDATE "usuarios" SET "saldo_a_favor" = -0.01 WHERE "id" = ${miembro.id}`,
    ).rejects.toThrow(/usuarios_saldo_a_favor_nonneg_chk|check constraint/i);

    // 2. CHECK monto_pagado <= monto_final
    await expect(
      prisma.$executeRaw`UPDATE "cargos_miembro" SET "monto_pagado" = 500.01 WHERE "id" = ${cargo.id}`,
    ).rejects.toThrow(/cargos_miembro_monto_pagado_rango_chk|check constraint/i);

    // 3. CHECK stock_disponible >= 0
    const eventoChk = await prisma.evento.create({
      data: {
        titulo: `${runTag}_EventoChk`,
        estado: EstadoEvento.BORRADOR,
        fechaEvento: new Date('2026-11-11'),
        creadoPorUsuarioId: created.adminId,
        items: {
          create: [
            {
              nombre: 'Rifa',
              precioVenta: new Prisma.Decimal('100.00'),
              stockTotal: 5,
              stockDisponible: 5,
            },
          ],
        },
      },
      include: { items: true },
    });
    created.eventoIds.push(eventoChk.id);

    await expect(
      prisma.$executeRaw`UPDATE "items_evento" SET "stock_disponible" = -1 WHERE "id" = ${eventoChk.items[0].id}`,
    ).rejects.toThrow(/items_evento_stock_disponible_nonneg_chk|check constraint/i);

    // 4. Partial unique index cargos_miembro_activos_unicos: rechaza segundo cargo no anulado, permite si se anula el primero
    await expect(
      prisma.cargoMiembro.create({
        data: {
          usuarioId: miembro.id,
          conceptoId: concepto.id,
          montoOriginal: new Prisma.Decimal('500.00'),
          montoDescuento: new Prisma.Decimal('0.00'),
          montoFinal: new Prisma.Decimal('500.00'),
          montoPagado: new Prisma.Decimal('0.00'),
          estado: EstadoCargo.PENDIENTE,
        },
      }),
    ).rejects.toThrow(/cargos_miembro_activos_unicos|Unique constraint/i);

    await prisma.cargoMiembro.update({ where: { id: cargo.id }, data: { estado: EstadoCargo.ANULADO } });
    await prisma.cargoMiembro.create({
      data: {
        usuarioId: miembro.id,
        conceptoId: concepto.id,
        montoOriginal: new Prisma.Decimal('500.00'),
        montoDescuento: new Prisma.Decimal('0.00'),
        montoFinal: new Prisma.Decimal('500.00'),
        montoPagado: new Prisma.Decimal('0.00'),
        estado: EstadoCargo.PENDIENTE,
      },
    });

    // 5. Partial unique index asignaciones_miembro_activas_unicas
    await prisma.asignacionMiembro.create({
      data: {
        usuarioId: miembro.id,
        unidadId: created.unidadId,
        rolId: created.rolId,
        cicloAnio: 2025,
        activo: false,
      },
    });
    await prisma.asignacionMiembro.create({
      data: {
        usuarioId: miembro.id,
        unidadId: created.unidadId,
        rolId: created.rolId,
        cicloAnio: 2026,
        activo: true,
      },
    });
    await expect(
      prisma.asignacionMiembro.create({
        data: {
          usuarioId: miembro.id,
          unidadId: created.unidadId,
          rolId: created.rolId,
          cicloAnio: 2026,
          activo: true,
        },
      }),
    ).rejects.toThrow(/asignaciones_miembro_activas_unicas|Unique constraint/i);

    // 6. onDelete: Restrict en MovimientoFinanciero -> Pago
    const cuenta = await prisma.cuentaFinanciera.create({
      data: { nombre: `${runTag}_CuentaRestrict`, tipo: TipoCuenta.CAJA_EFECTIVO, activa: true },
    });
    created.cuentaIds.push(cuenta.id);

    const pagoRestrict = await prisma.pago.create({
      data: {
        montoTotal: new Prisma.Decimal('200.00'),
        metodoPago: MetodoPago.EFECTIVO,
        registradoPorUsuarioId: created.adminId,
        usuarioId: miembro.id,
      },
    });
    await prisma.movimientoFinanciero.create({
      data: {
        cuentaId: cuenta.id,
        tipo: TipoMovimientoFinanciero.INGRESO_COBRANZA,
        montoIngreso: new Prisma.Decimal('200.00'),
        montoEgreso: new Prisma.Decimal('0.00'),
        conceptoTexto: 'Movimiento restrict test',
        pagoId: pagoRestrict.id,
        creadoPorUsuarioId: created.adminId,
      },
    });

    await expect(prisma.pago.delete({ where: { id: pagoRestrict.id } })).rejects.toThrow(
      /Foreign key constraint|23503/i,
    );
  });

  it('unaccent + ILIKE SQL en MiembrosService y excepciones relacionales con Cascade', async () => {
    const dniTilde = `97${String(Date.now()).slice(-6)}`;
    const miembroTilde = await prisma.usuario.create({
      data: {
        dni: dniTilde,
        passwordHash: 'hash',
        nombre: 'María José',
        apellido: 'Fernández Óñez',
        fechaNacimiento: new Date('2013-07-04'),
        activo: true,
      },
    });
    created.usuarioIds.push(miembroTilde.id);

    const listado = await miembros.listar(alcanceGlobal, {
      pagina: 1,
      porPagina: 20,
      q: 'maria jose',
    });
    expect(listado.items.some((u) => u.id === miembroTilde.id)).toBe(true);

    const hermanos = await miembros.buscarHermanosPorCriterio(alcanceGlobal, 'fernandez onez');
    expect(hermanos.some((u) => u.id === miembroTilde.id)).toBe(true);

    // Crear concepto con excepción relacional y verificar cascada al borrar el usuario
    const conceptoConExc = await tesoreria.crearConcepto(alcanceGlobal, {
      nombre: `${runTag}_ConceptoExc`,
      tipo: 'CAMPAMENTO',
      montoBase: 1200,
      cicloAnio: 2026,
      excepcionesIds: [miembroTilde.id],
      sincronizarCargos: false,
    });
    created.conceptoIds.push(conceptoConExc.id);
    expect(conceptoConExc.excepcionesJson).toEqual([miembroTilde.id]);

    // Eliminar asignaciones y usuario borra automáticamente concepto_excepciones por FK CASCADE
    await prisma.usuario.delete({ where: { id: miembroTilde.id } });
    created.usuarioIds.splice(created.usuarioIds.indexOf(miembroTilde.id), 1);

    const excsRestantes = await prisma.conceptoExcepcion.findMany({
      where: { conceptoId: conceptoConExc.id },
    });
    expect(excsRestantes).toHaveLength(0);
  });

  it('obtenerCuadroResultados agrupa en SQL por mes usando AT TIME ZONE America/Argentina/Buenos_Aires', async () => {
    const anioAislado = 2098;
    const cuentaCuadro = await prisma.cuentaFinanciera.create({
      data: { nombre: `${runTag}_CuentaCuadro`, tipo: TipoCuenta.CAJA_EFECTIVO, activa: true },
    });
    created.cuentaIds.push(cuentaCuadro.id);

    const rubroIng = await prisma.rubroContable.create({
      data: { nombre: `${runTag}_CuotaSocialTest`, tipo: TipoRubro.INGRESO, activo: true },
    });
    const rubroEgr = await prisma.rubroContable.create({
      data: { nombre: `${runTag}_EgresoTest`, tipo: TipoRubro.EGRESO, activo: true },
    });
    created.rubroIds.push(rubroIng.id, rubroEgr.id);

    const conceptoCuadro = await prisma.conceptoCuota.create({
      data: {
        nombre: `${runTag}_CuotaTz`,
        tipo: 'CUOTA_MENSUAL',
        montoBase: new Prisma.Decimal('1000.00'),
        cicloAnio: anioAislado,
        rubroId: rubroIng.id,
      },
    });
    created.conceptoIds.push(conceptoCuadro.id);

    const socio = await prisma.usuario.create({
      data: {
        dni: `96${String(Date.now()).slice(-6)}`,
        passwordHash: 'hash',
        nombre: 'Lucía',
        apellido: 'Timezone',
        fechaNacimiento: new Date('2012-08-01'),
      },
    });
    created.usuarioIds.push(socio.id);

    const cargo = await prisma.cargoMiembro.create({
      data: {
        usuarioId: socio.id,
        conceptoId: conceptoCuadro.id,
        montoOriginal: new Prisma.Decimal('1000.00'),
        montoDescuento: new Prisma.Decimal('0.00'),
        montoFinal: new Prisma.Decimal('1000.00'),
        montoPagado: new Prisma.Decimal('1000.00'),
        estado: EstadoCargo.PAGADO,
      },
    });

    // 2098-05-01T01:30:00Z = 30 de Abril 22:30 GMT-3 (Mes 4)
    const pagoAbril = await prisma.pago.create({
      data: {
        fechaPago: new Date(Date.UTC(anioAislado, 4, 1, 1, 30, 0)),
        montoTotal: new Prisma.Decimal('600.00'),
        metodoPago: MetodoPago.EFECTIVO,
        registradoPorUsuarioId: created.adminId,
        usuarioId: socio.id,
        imputaciones: { create: [{ cargoId: cargo.id, montoImputado: new Prisma.Decimal('600.00') }] },
      },
    });

    // 2098-05-01T03:30:00Z = 1 de Mayo 00:30 GMT-3 (Mes 5)
    const pagoMayo = await prisma.pago.create({
      data: {
        fechaPago: new Date(Date.UTC(anioAislado, 4, 1, 3, 30, 0)),
        montoTotal: new Prisma.Decimal('400.00'),
        metodoPago: MetodoPago.EFECTIVO,
        registradoPorUsuarioId: created.adminId,
        usuarioId: socio.id,
        imputaciones: { create: [{ cargoId: cargo.id, montoImputado: new Prisma.Decimal('400.00') }] },
      },
    });

    // Movimiento asociado solo para cleanup limpio via cuentaId
    await prisma.movimientoFinanciero.createMany({
      data: [
        {
          cuentaId: cuentaCuadro.id,
          fecha: pagoAbril.fechaPago,
          tipo: TipoMovimientoFinanciero.INGRESO_COBRANZA,
          montoIngreso: new Prisma.Decimal('600.00'),
          montoEgreso: new Prisma.Decimal('0.00'),
          conceptoTexto: 'Cobro Abril',
          pagoId: pagoAbril.id,
          creadoPorUsuarioId: created.adminId,
        },
        {
          cuentaId: cuentaCuadro.id,
          fecha: pagoMayo.fechaPago,
          tipo: TipoMovimientoFinanciero.INGRESO_COBRANZA,
          montoIngreso: new Prisma.Decimal('400.00'),
          montoEgreso: new Prisma.Decimal('0.00'),
          conceptoTexto: 'Cobro Mayo',
          pagoId: pagoMayo.id,
          creadoPorUsuarioId: created.adminId,
        },
      ],
    });

    const gastoMayo = await prisma.gasto.create({
      data: {
        fecha: new Date(Date.UTC(anioAislado, 4, 2, 12, 0, 0)),
        monto: new Prisma.Decimal('250.00'),
        descripcion: 'Gasto Mayo TZ',
        rubroId: rubroEgr.id,
        cuentaId: cuentaCuadro.id,
        registradoPorId: created.adminId,
      },
    });
    await prisma.movimientoFinanciero.create({
      data: {
        cuentaId: cuentaCuadro.id,
        fecha: gastoMayo.fecha,
        tipo: TipoMovimientoFinanciero.EGRESO_GASTO,
        montoIngreso: new Prisma.Decimal('0.00'),
        montoEgreso: new Prisma.Decimal('250.00'),
        conceptoTexto: 'Gasto Mayo TZ',
        gastoId: gastoMayo.id,
        rubroId: rubroEgr.id,
        creadoPorUsuarioId: created.adminId,
      },
    });

    const resAbril = await tesoreria.obtenerCuadroResultados(alcanceGlobal, {
      anio: anioAislado,
      mes: 4,
    });
    const resMayo = await tesoreria.obtenerCuadroResultados(alcanceGlobal, {
      anio: anioAislado,
      mes: 5,
    });

    expect(resAbril.resumen.totalIngresos).toBe(600);
    expect(resAbril.resumen.totalEgresos).toBe(0);
    expect(resMayo.resumen.totalIngresos).toBe(400);
    expect(resMayo.resumen.totalEgresos).toBe(250);
    expect(resMayo.resumen.resultadoNeto).toBe(150);
  });
});
