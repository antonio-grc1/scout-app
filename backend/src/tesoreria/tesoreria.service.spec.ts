import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import type { AlcanceAcceso } from '../common/types/auth.types.js';
import { CrearConceptoSchema, CrearItemEventoSchema, CrearTransferenciaSchema } from './tesoreria.dto.js';
import { TesoreriaService } from './tesoreria.service.js';

describe('TesoreriaService - Flujo Completo Reversible y Modificable', () => {
  const alcanceGlobal: AlcanceAcceso = {
    tipo: 'GLOBAL',
    usuarioId: 1,
    permisos: new Set(['tesoreria.gestionar', 'cuotas.cobrar', 'cuotas.ver']),
  };

  const alcancePropio: AlcanceAcceso = {
    tipo: 'PROPIO',
    usuarioId: 2,
    permisos: new Set(['cuotas.ver']),
  };

  it('eliminarConcepto: rechaza acceso si alcance es PROPIO', async () => {
    const mockPrisma = {} as any;
    const service = new TesoreriaService(mockPrisma);

    await expect(service.eliminarConcepto(alcancePropio, 1)).rejects.toThrow(ForbiddenException);
  });

  it('confirma que un usuario con alcance PROPIO no pueda acceder al listado general de planes ni a la facturación total del grupo', async () => {
    const mockPrisma = {} as any;
    const service = new TesoreriaService(mockPrisma);

    // Listar planes incluye resumenRecaudacion con la facturación y recaudación global del grupo
    await expect(service.listarPlanesCuotaMensual(alcancePropio)).rejects.toThrow(ForbiddenException);
    await expect(service.listarConceptos(alcancePropio)).rejects.toThrow(ForbiddenException);
  });

  it('listarPlanesCuotaMensual: rechaza acceso si alcance es PROPIO', async () => {
    const mockPrisma = {} as any;
    const service = new TesoreriaService(mockPrisma);

    await expect(service.listarPlanesCuotaMensual(alcancePropio)).rejects.toThrow(ForbiddenException);
  });

  it('listarConceptos: rechaza acceso si alcance es PROPIO', async () => {
    const mockPrisma = {} as any;
    const service = new TesoreriaService(mockPrisma);

    await expect(service.listarConceptos(alcancePropio)).rejects.toThrow(ForbiddenException);
  });

  it('eliminarConcepto: lanza NotFoundException si el concepto no existe', async () => {
    const mockPrisma = {
      conceptoCuota: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    } as any;
    const service = new TesoreriaService(mockPrisma);

    await expect(service.eliminarConcepto(alcanceGlobal, 999)).rejects.toThrow(NotFoundException);
  });

  it('eliminarConcepto: elimina directamente si no tiene cargos asociados', async () => {
    const mockPrisma = {
      conceptoCuota: {
        findUnique: vi.fn().mockResolvedValue({
          id: 5,
          nombre: 'Cuota Enero',
          unidadId: null,
          _count: { cargos: 0 },
        }),
        delete: vi.fn().mockResolvedValue({ id: 5 }),
      },
    } as any;
    const service = new TesoreriaService(mockPrisma);

    const res = await service.eliminarConcepto(alcanceGlobal, 5);
    expect(res).toEqual({ id: 5 });
    expect(mockPrisma.conceptoCuota.delete).toHaveBeenCalledWith({ where: { id: 5 } });
  });

  it('eliminarConcepto: si existen pagos registrados para los cargos, acredita el monto pagado a Saldo a Favor y elimina concepto', async () => {
    const txMock = {
      cargoMiembro: {
        findMany: vi.fn().mockResolvedValue([
          { id: 50, usuarioId: 10, montoPagado: '4500.00' },
          { id: 51, usuarioId: 11, montoPagado: '0.00' },
        ]),
        deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
      pagoImputacion: {
        findMany: vi.fn().mockResolvedValue([
          { id: 90, cargoId: 50, montoImputado: '4500.00', pago: { id: 1, referenciaComprobante: 'EF-123' } },
        ]),
        delete: vi.fn().mockResolvedValue({ id: 90 }),
      },
      usuario: {
        update: vi.fn().mockResolvedValue({ id: 10 }),
      },
      conceptoCuota: {
        delete: vi.fn().mockResolvedValue({ id: 5 }),
      },
    };
    const mockPrisma = {
      conceptoCuota: {
        findUnique: vi.fn().mockResolvedValue({
          id: 5,
          nombre: 'Campamento',
          unidadId: null,
          _count: { cargos: 2 },
        }),
      },
      $transaction: vi.fn().mockImplementation((cb) => cb(txMock)),
    } as any;
    const service = new TesoreriaService(mockPrisma);

    const res = await service.eliminarConcepto(alcanceGlobal, 5);
    expect(res).toEqual({ id: 5 });
    expect(txMock.usuario.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 10 },
        data: expect.objectContaining({
          saldoAFavor: { increment: expect.any(Object) },
        }),
      }),
    );
    expect(txMock.cargoMiembro.deleteMany).toHaveBeenCalledWith({ where: { conceptoId: 5 } });
    expect(txMock.conceptoCuota.delete).toHaveBeenCalledWith({ where: { id: 5 } });
  });

  it('eliminarConcepto: elimina cargos y concepto en transacción si no hay pagos', async () => {
    const txMock = {
      cargoMiembro: {
        findMany: vi.fn().mockResolvedValue([
          { id: 50, usuarioId: 10, montoPagado: '0.00' },
        ]),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      conceptoCuota: {
        delete: vi.fn().mockResolvedValue({ id: 5 }),
      },
    };
    const mockPrisma = {
      conceptoCuota: {
        findUnique: vi.fn().mockResolvedValue({
          id: 5,
          nombre: 'Campamento',
          unidadId: null,
          _count: { cargos: 1 },
        }),
      },
      $transaction: vi.fn().mockImplementation((cb) => cb(txMock)),
    } as any;
    const service = new TesoreriaService(mockPrisma);

    const res = await service.eliminarConcepto(alcanceGlobal, 5);
    expect(res).toEqual({ id: 5 });
    expect(txMock.cargoMiembro.deleteMany).toHaveBeenCalledWith({ where: { conceptoId: 5 } });
    expect(txMock.conceptoCuota.delete).toHaveBeenCalledWith({ where: { id: 5 } });
  });

  it('editarConcepto: actualiza datos correctamente y sincroniza cargos', async () => {
    const mockPrisma = {
      conceptoCuota: {
        findUnique: vi.fn().mockResolvedValue({
          id: 1,
          nombre: 'Cuota Original',
          unidadId: null,
        }),
        update: vi.fn().mockResolvedValue({
          id: 1,
          nombre: 'Cuota Modificada',
          montoBase: '20000.00',
        }),
      },
    } as any;
    const service = new TesoreriaService(mockPrisma);

    const res = await service.editarConcepto(alcanceGlobal, 1, {
      nombre: 'Cuota Modificada',
      montoBase: 20000,
    });

    expect(res).toEqual({
      id: 1,
      nombre: 'Cuota Modificada',
      montoBase: '20000.00',
      excepcionesJson: [],
    });
    expect(mockPrisma.conceptoCuota.update).toHaveBeenCalled();
  });

  it('generarCargos: no aplica descuento si el concepto tiene permiteDescuentoHermanos = false', async () => {
    const mockPrisma = {
      conceptoCuota: {
        findUnique: vi.fn().mockResolvedValue({
          id: 1,
          nombre: 'Campamento 2026',
          montoBase: '10000.00',
          unidadId: null,
          permiteDescuentoHermanos: false,
          esParaEducadores: false,
        }),
      },
      usuario: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 10,
            cargos: [],
            grupoFamiliar: { porcentajeDescuentoHermanos: '20.00' },
          },
        ]),
      },
      $transaction: vi.fn().mockImplementation(async (cb) => {
        const tx = {
          cargoMiembro: {
            create: vi.fn().mockImplementation(({ data }) => Promise.resolve(data)),
          },
        };
        return cb(tx);
      }),
    } as any;

    const service = new TesoreriaService(mockPrisma);
    const res = await service.generarCargos(alcanceGlobal, {
      conceptoId: 1,
      aplicarDescuentoFamiliar: true,
    });

    expect(res.totalGenerados).toBe(1);
    expect(Number(res.cargos[0].montoDescuento)).toBe(0);
    expect(Number(res.cargos[0].montoFinal)).toBe(10000);
  });

  it('generarCargos: aplica porcentaje específico del concepto si está definido', async () => {
    const mockPrisma = {
      conceptoCuota: {
        findUnique: vi.fn().mockResolvedValue({
          id: 2,
          nombre: 'Inscripción Anual',
          montoBase: '10000.00',
          unidadId: null,
          permiteDescuentoHermanos: true,
          porcentajeDescuentoHermanos: '15.00',
          esParaEducadores: false,
        }),
      },
      usuario: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 11,
            cargos: [],
            grupoFamiliar: { porcentajeDescuentoHermanos: '50.00' },
          },
        ]),
      },
      $transaction: vi.fn().mockImplementation(async (cb) => {
        const tx = {
          cargoMiembro: {
            create: vi.fn().mockImplementation(({ data }) => Promise.resolve(data)),
          },
        };
        return cb(tx);
      }),
    } as any;

    const service = new TesoreriaService(mockPrisma);
    const res = await service.generarCargos(alcanceGlobal, {
      conceptoId: 2,
      aplicarDescuentoFamiliar: true,
    });

    expect(res.totalGenerados).toBe(1);
    expect(Number(res.cargos[0].montoDescuento)).toBe(1500);
    expect(Number(res.cargos[0].montoFinal)).toBe(8500);
  });

  it('registrarPago: acredita el excedente pagado en el saldo a favor del miembro', async () => {
    const actor = { sub: 1 } as any;
    const tx = {
      cargoMiembro: {
        findUnique: vi.fn().mockResolvedValue({
          id: 101,
          montoFinal: '5000.00',
          montoPagado: '0.00',
          estado: 'PENDIENTE',
          usuario: { id: 7, asignaciones: [] },
        }),
        update: vi.fn().mockResolvedValue({ id: 101, estado: 'PAGADO' }),
      },
      usuario: {
        findUnique: vi.fn().mockResolvedValue({ id: 7, saldoAFavor: '0.00' }),
        update: vi.fn().mockResolvedValue({ id: 7 }),
      },
      pago: {
        create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 1, ...data })),
      },
    };

    const mockPrisma = {
      $transaction: vi.fn().mockImplementation((cb) => cb(tx)),
    } as any;

    const service = new TesoreriaService(mockPrisma);
    const res = await service.registrarPago(actor, alcanceGlobal, {
      usuarioId: 7,
      montoTotal: 6000,
      metodoPago: 'EFECTIVO',
      imputaciones: [{ cargoId: 101, monto: 5000 }],
    });

    expect(res.excedenteAcreditado).toBe(1000);
    expect(tx.usuario.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 7 },
        data: expect.objectContaining({
          saldoAFavor: { increment: expect.any(Object) },
        }),
      }),
    );
  });

  it('registrarPago: permite pago combinado usando Saldo a Favor disponible + Efectivo', async () => {
    const actor = { sub: 1 } as any;
    const tx = {
      cargoMiembro: {
        findUnique: vi.fn().mockResolvedValue({
          id: 101,
          montoFinal: '5000.00',
          montoPagado: '0.00',
          estado: 'PENDIENTE',
          usuario: { id: 7, asignaciones: [] },
        }),
        update: vi.fn().mockResolvedValue({ id: 101, estado: 'PAGADO' }),
      },
      usuario: {
        findUnique: vi.fn().mockResolvedValue({ id: 7, saldoAFavor: '2000.00' }),
        update: vi.fn().mockResolvedValue({ id: 7 }),
      },
      pago: {
        create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 1, ...data })),
      },
    };

    const mockPrisma = {
      $transaction: vi.fn().mockImplementation((cb) => cb(tx)),
    } as any;

    const service = new TesoreriaService(mockPrisma);
    const res = await service.registrarPago(actor, alcanceGlobal, {
      usuarioId: 7,
      usarSaldoAFavor: true,
      montoTotal: 3000, // 2000 de saldo + 3000 en efectivo = 5000
      metodoPago: 'EFECTIVO',
      imputaciones: [{ cargoId: 101, monto: 5000 }],
    });

    expect(res.saldoAFavorAplicado).toBe(2000);
    expect(res.excedenteAcreditado).toBe(0);
    expect(tx.pago.create).toHaveBeenCalledTimes(2);
  });

  it('revertirPago: restaura la deuda en los cargos y descuenta el excedente generado', async () => {
    const tx = {
      cargoMiembro: {
        findUnique: vi.fn().mockResolvedValue({
          id: 101,
          montoFinal: '5000.00',
          montoPagado: '5000.00',
          estado: 'PAGADO',
        }),
        update: vi.fn().mockResolvedValue({ id: 101, estado: 'PENDIENTE' }),
      },
      usuario: {
        findUnique: vi.fn().mockResolvedValue({ id: 7, saldoAFavor: '1000.00' }),
        update: vi.fn().mockResolvedValue({ id: 7 }),
      },
      pago: {
        delete: vi.fn().mockResolvedValue({ id: 15 }),
      },
    };

    const mockPrisma = {
      pago: {
        findUnique: vi.fn().mockResolvedValue({
          id: 15,
          montoTotal: '6000.00',
          referenciaComprobante: 'EF-99',
          usuario: { id: 7, saldoAFavor: '1000.00', asignaciones: [] },
          imputaciones: [
            {
              id: 201,
              cargoId: 101,
              montoImputado: '5000.00',
              cargo: { usuario: { id: 7, saldoAFavor: '1000.00', asignaciones: [] } },
            },
          ],
        }),
      },
      $transaction: vi.fn().mockImplementation((cb) => cb(tx)),
    } as any;

    const service = new TesoreriaService(mockPrisma);
    const res = await service.revertirPago(alcanceGlobal, 15);

    expect(res.mensaje).toContain('Pago revertido');
    expect(tx.cargoMiembro.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 101 },
        data: expect.objectContaining({ estado: 'PENDIENTE' }),
      }),
    );
    expect(tx.pago.delete).toHaveBeenCalledWith({ where: { id: 15 } });
  });

  it('aplicarSaldoAFavor: descuenta saldo disponible e imputa a las deudas', async () => {
    const actor = { sub: 1 } as any;
    const tx = {
      usuario: {
        update: vi.fn().mockResolvedValue({ id: 7 }),
      },
      cargoMiembro: {
        findUnique: vi.fn().mockResolvedValue({
          id: 102,
          usuarioId: 7,
          montoFinal: '3000.00',
          montoPagado: '0.00',
          estado: 'PENDIENTE',
        }),
        update: vi.fn().mockResolvedValue({ id: 102, estado: 'PAGADO' }),
      },
      pago: {
        create: vi.fn().mockResolvedValue({ id: 99 }),
      },
    };

    const mockPrisma = {
      usuario: {
        findUnique: vi.fn().mockResolvedValue({
          id: 7,
          saldoAFavor: '4000.00',
          asignaciones: [],
        }),
      },
      $transaction: vi.fn().mockImplementation((cb) => cb(tx)),
    } as any;

    const service = new TesoreriaService(mockPrisma);
    const res = await service.aplicarSaldoAFavor(actor, alcanceGlobal, {
      usuarioId: 7,
      imputaciones: [{ cargoId: 102, monto: 3000 }],
    });

    expect(res.pagoId).toBe(99);
    expect(tx.usuario.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 7 },
        data: expect.objectContaining({
          saldoAFavor: { decrement: expect.any(Object) },
        }),
      }),
    );
  });
});

describe('TesoreriaService - Motor Financiero: Cuentas, Libro Diario y Transferencias (Fase 1)', () => {
  const actor = { sub: 10 } as any;

  const alcanceGlobal: AlcanceAcceso = {
    tipo: 'GLOBAL',
    usuarioId: 10,
    permisos: new Set(['tesoreria.gestionar', 'cuotas.cobrar', 'cuotas.ver']),
  };

  const alcancePropio: AlcanceAcceso = {
    tipo: 'PROPIO',
    usuarioId: 2,
    permisos: new Set(['cuotas.ver']),
  };

  describe('Cuentas Financieras', () => {
    it('listarCuentasFinancieras: rechaza si el alcance es PROPIO', async () => {
      const mockPrisma = {} as any;
      const service = new TesoreriaService(mockPrisma);

      await expect(service.listarCuentasFinancieras(alcancePropio)).rejects.toThrow(ForbiddenException);
    });

    it('listarCuentasFinancieras: calcula correctamente saldo actual, total ingresos y egresos', async () => {
      const mockPrisma = {
        cuentaFinanciera: {
          findMany: vi.fn().mockResolvedValue([
            { id: 1, nombre: 'Caja Chica Central', tipo: 'CAJA_EFECTIVO', activa: true, createdAt: new Date(), updatedAt: new Date() },
            { id: 2, nombre: 'Banco Principal', tipo: 'BANCO', activa: true, createdAt: new Date(), updatedAt: new Date() },
          ]),
        },
        movimientoFinanciero: {
          groupBy: vi.fn().mockResolvedValue([
            { cuentaId: 1, _sum: { montoIngreso: 15000, montoEgreso: 5000 }, _count: { id: 4 } },
            { cuentaId: 2, _sum: { montoIngreso: 80000, montoEgreso: 10000 }, _count: { id: 6 } },
          ]),
        },
      } as any;

      const service = new TesoreriaService(mockPrisma);
      const res = await service.listarCuentasFinancieras(alcanceGlobal);

      expect(res).toHaveLength(2);
      expect(res[0]).toMatchObject({
        id: 1,
        nombre: 'Caja Chica Central',
        saldoActual: 10000,
        totalIngresos: 15000,
        totalEgresos: 5000,
        cantidadMovimientos: 4,
      });
      expect(res[1]).toMatchObject({
        id: 2,
        nombre: 'Banco Principal',
        saldoActual: 70000,
        totalIngresos: 80000,
        totalEgresos: 10000,
        cantidadMovimientos: 6,
      });
    });

    it('crearCuentaFinanciera: crea una nueva cuenta exitosamente', async () => {
      const mockPrisma = {
        cuentaFinanciera: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 3, ...data })),
        },
      } as any;

      const service = new TesoreriaService(mockPrisma);
      const res = await service.crearCuentaFinanciera(actor, alcanceGlobal, {
        nombre: 'Caja Campamento Verano',
        tipo: 'CAJA_EFECTIVO',
      });

      expect(res.id).toBe(3);
      expect(res.nombre).toBe('Caja Campamento Verano');
      expect(res.activa).toBe(true);
    });

    it('crearCuentaFinanciera: rechaza nombres duplicados', async () => {
      const mockPrisma = {
        cuentaFinanciera: {
          findFirst: vi.fn().mockResolvedValue({ id: 1, nombre: 'Caja Chica Central' }),
        },
      } as any;

      const service = new TesoreriaService(mockPrisma);
      await expect(
        service.crearCuentaFinanciera(actor, alcanceGlobal, {
          nombre: 'caja chica central',
          tipo: 'CAJA_EFECTIVO',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('actualizarCuentaFinanciera: rechaza desactivar cuenta con saldo no nulo', async () => {
      const mockPrisma = {
        cuentaFinanciera: {
          findUnique: vi.fn().mockResolvedValue({ id: 1, nombre: 'Caja Chica', activa: true }),
        },
        movimientoFinanciero: {
          aggregate: vi.fn().mockResolvedValue({
            _sum: { montoIngreso: 5000, montoEgreso: 2000 },
          }),
        },
      } as any;

      const service = new TesoreriaService(mockPrisma);
      await expect(
        service.actualizarCuentaFinanciera(actor, alcanceGlobal, 1, { activa: false }),
      ).rejects.toThrow(BadRequestException);
    });

    it('actualizarCuentaFinanciera: desactiva cuenta si el saldo es cero', async () => {
      const mockPrisma = {
        cuentaFinanciera: {
          findUnique: vi.fn().mockResolvedValue({ id: 1, nombre: 'Caja Chica', activa: true }),
          update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 1, ...data })),
        },
        movimientoFinanciero: {
          aggregate: vi.fn().mockResolvedValue({
            _sum: { montoIngreso: 5000, montoEgreso: 5000 },
          }),
        },
      } as any;

      const service = new TesoreriaService(mockPrisma);
      const res = await service.actualizarCuentaFinanciera(actor, alcanceGlobal, 1, { activa: false });
      expect(res.activa).toBe(false);
    });

    it('actualizarCuentaFinanciera: actualiza nombre y tipo de cuenta', async () => {
      const mockPrisma = {
        cuentaFinanciera: {
          findUnique: vi.fn().mockResolvedValue({ id: 1, nombre: 'Caja Chica', tipo: 'CAJA_EFECTIVO', activa: true }),
          findFirst: vi.fn().mockResolvedValue(null),
          update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 1, ...data })),
        },
      } as any;

      const service = new TesoreriaService(mockPrisma);
      const res = await service.actualizarCuentaFinanciera(actor, alcanceGlobal, 1, {
        nombre: 'Caja Grande',
        tipo: 'BANCO' as any,
      });
      expect(res.nombre).toBe('Caja Grande');
      expect(res.tipo).toBe('BANCO');
    });

    it('eliminarCuentaFinanciera: rechaza si la cuenta tiene saldo no nulo', async () => {
      const mockPrisma = {
        cuentaFinanciera: {
          findUnique: vi.fn().mockResolvedValue({ id: 1, nombre: 'Caja', activa: true, _count: { movimientos: 2 } }),
        },
        movimientoFinanciero: {
          aggregate: vi.fn().mockResolvedValue({
            _sum: { montoIngreso: 5000, montoEgreso: 2000 },
          }),
        },
      } as any;

      const service = new TesoreriaService(mockPrisma);
      await expect(service.eliminarCuentaFinanciera(actor, alcanceGlobal, 1)).rejects.toThrow(BadRequestException);
    });

    it('eliminarCuentaFinanciera: desactiva (soft-delete) si tiene movimientos y saldo cero', async () => {
      const mockPrisma = {
        cuentaFinanciera: {
          findUnique: vi.fn().mockResolvedValue({ id: 1, nombre: 'Caja', activa: true, _count: { movimientos: 3 } }),
          update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 1, nombre: 'Caja', ...data })),
        },
        movimientoFinanciero: {
          aggregate: vi.fn().mockResolvedValue({
            _sum: { montoIngreso: 2000, montoEgreso: 2000 },
          }),
        },
      } as any;

      const service = new TesoreriaService(mockPrisma);
      const res = await service.eliminarCuentaFinanciera(actor, alcanceGlobal, 1);
      expect(res.activa).toBe(false);
      expect(res.eliminadoPermanente).toBe(false);
    });

    it('eliminarCuentaFinanciera: elimina permanente si no tiene movimientos', async () => {
      const mockPrisma = {
        cuentaFinanciera: {
          findUnique: vi.fn().mockResolvedValue({ id: 1, nombre: 'Caja Vacía', activa: true, _count: { movimientos: 0 } }),
          delete: vi.fn().mockResolvedValue({ id: 1, nombre: 'Caja Vacía' }),
        },
        movimientoFinanciero: {
          aggregate: vi.fn().mockResolvedValue({
            _sum: { montoIngreso: 0, montoEgreso: 0 },
          }),
        },
      } as any;

      const service = new TesoreriaService(mockPrisma);
      const res = await service.eliminarCuentaFinanciera(actor, alcanceGlobal, 1);
      expect(res.eliminadoPermanente).toBe(true);
      expect(mockPrisma.cuentaFinanciera.delete).toHaveBeenCalledWith({ where: { id: 1 } });
    });

    it('restaurarCuentaFinanciera y restaurarRubroContable reactivan registros soft-deleted', async () => {
      const mockPrisma = {
        cuentaFinanciera: {
          findUnique: vi.fn().mockResolvedValue({ id: 4, nombre: 'Caja Archivo', activa: false }),
          update: vi.fn().mockResolvedValue({ id: 4, nombre: 'Caja Archivo', activa: true }),
        },
        rubroContable: {
          findUnique: vi.fn().mockResolvedValue({
            id: 9,
            nombre: 'Eventos',
            activo: false,
            unidadId: null,
            _count: { conceptos: 1, planesCuota: 0, gastos: 0, movimientos: 0 },
          }),
          update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 9, ...data })),
        },
      } as any;

      const service = new TesoreriaService(mockPrisma);
      const resCuenta = await service.restaurarCuentaFinanciera(actor, alcanceGlobal, 4);
      expect(resCuenta.activa).toBe(true);

      const resDelRubro = await service.eliminarRubroContable(alcanceGlobal, 9);
      expect((resDelRubro as any).eliminadoPermanente).toBe(false);

      const resRestRubro = await service.restaurarRubroContable(alcanceGlobal, 9);
      expect(resRestRubro.activo).toBe(true);
    });
  });

  describe('Libro Diario y Saldo Continuo', () => {
    it('obtenerLibroDiario: calcula saldo anterior y saldo acumulado continuo por fila', async () => {
      const mockPrisma = {
        cuentaFinanciera: {
          findUnique: vi.fn().mockResolvedValue({
            id: 1,
            nombre: 'Caja Chica Central',
            tipo: 'CAJA_EFECTIVO',
            activa: true,
          }),
        },
        movimientoFinanciero: {
          aggregate: vi
            .fn()
            .mockResolvedValueOnce({
              _sum: { montoIngreso: 5000, montoEgreso: 2000 },
            })
            .mockResolvedValueOnce({
              _sum: { montoIngreso: 8000, montoEgreso: 3000 },
            }),
          findMany: vi.fn().mockResolvedValue([
            {
              id: 10,
              cuentaId: 1,
              fecha: new Date('2026-11-02T10:00:00Z'),
              tipo: 'INGRESO_COBRANZA',
              montoIngreso: 2000,
              montoEgreso: 0,
              conceptoTexto: 'Cobro cuota #1',
              pagoId: 5,
              gastoId: null,
              creadoPorUsuarioId: 1,
              creadoPor: { id: 1, nombre: 'Jefe', apellido: 'Grupo' },
            },
            {
              id: 11,
              cuentaId: 1,
              fecha: new Date('2026-11-02T11:00:00Z'),
              tipo: 'TRANSFERENCIA_SALIDA',
              montoIngreso: 0,
              montoEgreso: 1000,
              conceptoTexto: 'Traspaso a banco',
              pagoId: null,
              gastoId: null,
              creadoPorUsuarioId: 1,
              creadoPor: { id: 1, nombre: 'Jefe', apellido: 'Grupo' },
            },
            {
              id: 12,
              cuentaId: 1,
              fecha: new Date('2026-11-02T12:00:00Z'),
              tipo: 'INGRESO_OTRO',
              montoIngreso: 1000,
              montoEgreso: 0,
              conceptoTexto: 'Donación',
              pagoId: null,
              gastoId: null,
              creadoPorUsuarioId: 1,
              creadoPor: { id: 1, nombre: 'Jefe', apellido: 'Grupo' },
            },
          ]),
        },
      } as any;

      const service = new TesoreriaService(mockPrisma);
      const res = await service.obtenerLibroDiario(alcanceGlobal, 1, {
        desde: '2026-11-02',
        hasta: '2026-11-02',
      });

      expect(res.saldoAnterior).toBe(3000);
      expect(res.movimientos).toHaveLength(3);
      expect(res.movimientos[0].saldoAcumulado).toBe(5000);
      expect(res.movimientos[1].saldoAcumulado).toBe(4000);
      expect(res.movimientos[2].saldoAcumulado).toBe(5000);
      expect(res.totalIngresosPeriodo).toBe(3000);
      expect(res.totalEgresosPeriodo).toBe(1000);
      expect(res.saldoFinalPeriodo).toBe(5000);
      expect(res.saldoActualConsolidado).toBe(5000);
    });

    it('obtenerLibroDiario: reemplaza Miembro ID #ID con el nombre completo del miembro', async () => {
      const mockPrisma = {
        cuentaFinanciera: {
          findUnique: vi.fn().mockResolvedValue({
            id: 1,
            nombre: 'Caja Chica Central',
            tipo: 'CAJA_EFECTIVO',
            activa: true,
          }),
        },
        movimientoFinanciero: {
          aggregate: vi.fn().mockResolvedValue({
            _sum: { montoIngreso: 2000, montoEgreso: 0 },
          }),
          findMany: vi.fn().mockResolvedValue([
            {
              id: 10,
              cuentaId: 1,
              fecha: new Date('2026-11-02T10:00:00Z'),
              tipo: 'INGRESO_COBRANZA',
              montoIngreso: 2000,
              montoEgreso: 0,
              conceptoTexto: 'Cobro cuota - Miembro ID #7',
              pagoId: 5,
              gastoId: null,
              creadoPorUsuarioId: 1,
              creadoPor: { id: 1, nombre: 'Jefe', apellido: 'Grupo' },
              pago: {
                id: 5,
                usuarioId: 7,
                usuario: { id: 7, nombre: 'Lucas', apellido: 'Gómez' },
                imputaciones: [],
              },
            },
          ]),
        },
      } as any;

      const service = new TesoreriaService(mockPrisma);
      const res = await service.obtenerLibroDiario(alcanceGlobal, 1, {});

      expect(res.movimientos[0].conceptoTexto).toBe('Cobro cuota - Lucas Gómez');
      expect(res.movimientos[0].miembroNombre).toBe('Lucas Gómez');
    });

    it('obtenerLibroDiario: lanza NotFoundException si la cuenta no existe', async () => {
      const mockPrisma = {
        cuentaFinanciera: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
      } as any;

      const service = new TesoreriaService(mockPrisma);
      await expect(service.obtenerLibroDiario(alcanceGlobal, 999, {})).rejects.toThrow(NotFoundException);
    });
  });

  describe('Transferencias Internas', () => {
    it('transferirEntreCuentas: ejecuta transferencia atómica y actualiza saldos', async () => {
      const tx = {
        cuentaFinanciera: {
          findUnique: vi.fn().mockImplementation(({ where }) => {
            if (where.id === 1) return Promise.resolve({ id: 1, nombre: 'Caja Chica', activa: true });
            if (where.id === 2) return Promise.resolve({ id: 2, nombre: 'Banco Principal', activa: true });
            return Promise.resolve(null);
          }),
        },
        movimientoFinanciero: {
          aggregate: vi
            .fn()
            .mockResolvedValueOnce({ _sum: { montoIngreso: 10000, montoEgreso: 2000 } })
            .mockResolvedValueOnce({ _sum: { montoIngreso: 50000, montoEgreso: 10000 } }),
          create: vi.fn().mockResolvedValue({ id: 101 }),
        },
      };

      const mockPrisma = {
        $transaction: vi.fn().mockImplementation((cb) => cb(tx)),
      } as any;

      const service = new TesoreriaService(mockPrisma);
      const res = await service.transferirEntreCuentas(actor, alcanceGlobal, {
        origenCuentaId: 1,
        destinoCuentaId: 2,
        monto: 3000,
        concepto: 'Depósito semanal en banco',
      });

      expect(res.monto).toBe(3000);
      expect(res.saldoOrigen).toBe(5000);
      expect(tx.movimientoFinanciero.create).toHaveBeenCalledTimes(2);
      expect(tx.movimientoFinanciero.create).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          data: expect.objectContaining({
            cuentaId: 1,
            tipo: 'TRANSFERENCIA_SALIDA',
            montoEgreso: expect.any(Object),
            transferenciaGrupoId: expect.any(String),
          }),
        }),
      );
      expect(tx.movimientoFinanciero.create).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          data: expect.objectContaining({
            cuentaId: 2,
            tipo: 'TRANSFERENCIA_ENTRADA',
            montoIngreso: expect.any(Object),
            transferenciaGrupoId: tx.movimientoFinanciero.create.mock.calls[0][0].data.transferenciaGrupoId,
          }),
        }),
      );
    });

    it('transferirEntreCuentas: rechaza si origen y destino son la misma cuenta', async () => {
      const mockPrisma = {} as any;
      const service = new TesoreriaService(mockPrisma);

      await expect(
        service.transferirEntreCuentas(actor, alcanceGlobal, {
          origenCuentaId: 1,
          destinoCuentaId: 1,
          monto: 100,
          concepto: 'Misma cuenta',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('transferirEntreCuentas: rechaza si saldo es insuficiente en origen', async () => {
      const tx = {
        cuentaFinanciera: {
          findUnique: vi.fn().mockImplementation(({ where }) => {
            if (where.id === 1) return Promise.resolve({ id: 1, nombre: 'Caja Chica', activa: true });
            if (where.id === 2) return Promise.resolve({ id: 2, nombre: 'Banco Principal', activa: true });
            return null;
          }),
        },
        movimientoFinanciero: {
          aggregate: vi.fn().mockResolvedValue({ _sum: { montoIngreso: 1000, montoEgreso: 500 } }),
        },
      };

      const mockPrisma = {
        $transaction: vi.fn().mockImplementation((cb) => cb(tx)),
      } as any;

      const service = new TesoreriaService(mockPrisma);
      await expect(
        service.transferirEntreCuentas(actor, alcanceGlobal, {
          origenCuentaId: 1,
          destinoCuentaId: 2,
          monto: 2000,
          concepto: 'Excede saldo',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('transferirEntreCuentas: rechaza si una de las cuentas está inactiva', async () => {
      const tx = {
        cuentaFinanciera: {
          findUnique: vi.fn().mockImplementation(({ where }) => {
            if (where.id === 1) return Promise.resolve({ id: 1, nombre: 'Caja Chica', activa: false });
            if (where.id === 2) return Promise.resolve({ id: 2, nombre: 'Banco Principal', activa: true });
            return null;
          }),
        },
      };

      const mockPrisma = {
        $transaction: vi.fn().mockImplementation((cb) => cb(tx)),
      } as any;

      const service = new TesoreriaService(mockPrisma);
      await expect(
        service.transferirEntreCuentas(actor, alcanceGlobal, {
          origenCuentaId: 1,
          destinoCuentaId: 2,
          monto: 500,
          concepto: 'Cuenta inactiva',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Integración con Cobranzas y Reversiones', () => {
    it('registrarPago: genera MovimientoFinanciero en caja de efectivo con nombre de miembro', async () => {
      const tx = {
        cargoMiembro: {
          findUnique: vi.fn().mockResolvedValue({
            id: 101,
            montoFinal: '5000.00',
            montoPagado: '0.00',
            estado: 'PENDIENTE',
            concepto: { nombre: 'Cuota Mensual' },
            usuario: { id: 7, nombre: 'Lucas', apellido: 'Gómez', asignaciones: [] },
          }),
          update: vi.fn().mockResolvedValue({ id: 101, estado: 'PAGADO' }),
        },
        usuario: {
          findUnique: vi.fn().mockResolvedValue({ id: 7, nombre: 'Lucas', apellido: 'Gómez', saldoAFavor: '0.00' }),
          update: vi.fn().mockResolvedValue({ id: 7 }),
        },
        pago: {
          create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 88, ...data })),
        },
        cuentaFinanciera: {
          findFirst: vi.fn().mockResolvedValue({ id: 1, nombre: 'Caja Chica Central', tipo: 'CAJA_EFECTIVO', activa: true }),
        },
        movimientoFinanciero: {
          create: vi.fn().mockResolvedValue({ id: 501 }),
        },
      };

      const mockPrisma = {
        $transaction: vi.fn().mockImplementation((cb) => cb(tx)),
      } as any;

      const service = new TesoreriaService(mockPrisma);
      await service.registrarPago(actor, alcanceGlobal, {
        usuarioId: 7,
        montoTotal: 5000,
        metodoPago: 'EFECTIVO',
        imputaciones: [{ cargoId: 101, monto: 5000 }],
      });

      expect(tx.movimientoFinanciero.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            cuentaId: 1,
            tipo: 'INGRESO_COBRANZA',
            pagoId: 88,
            conceptoTexto: expect.stringContaining('Lucas Gómez'),
          }),
        }),
      );
    });

    it('registrarPago: genera MovimientoFinanciero en banco cuando se indica cuentaId bancaria', async () => {
      const tx = {
        cargoMiembro: {
          findUnique: vi.fn().mockResolvedValue({
            id: 101,
            montoFinal: '5000.00',
            montoPagado: '0.00',
            estado: 'PENDIENTE',
            usuario: { id: 7, asignaciones: [] },
          }),
          update: vi.fn().mockResolvedValue({ id: 101, estado: 'PAGADO' }),
        },
        usuario: {
          findUnique: vi.fn().mockResolvedValue({ id: 7, saldoAFavor: '0.00' }),
          update: vi.fn().mockResolvedValue({ id: 7 }),
        },
        pago: {
          create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 89, ...data })),
        },
        cuentaFinanciera: {
          findFirst: vi.fn().mockResolvedValue({ id: 2, nombre: 'Banco Principal', tipo: 'BANCO', activa: true }),
        },
        movimientoFinanciero: {
          create: vi.fn().mockResolvedValue({ id: 502 }),
        },
      };

      const mockPrisma = {
        $transaction: vi.fn().mockImplementation((cb) => cb(tx)),
      } as any;

      const service = new TesoreriaService(mockPrisma);
      await service.registrarPago(actor, alcanceGlobal, {
        usuarioId: 7,
        cuentaId: 2,
        montoTotal: 5000,
        metodoPago: 'TRANSFERENCIA',
        referenciaComprobante: 'TRX-12345',
        imputaciones: [{ cargoId: 101, monto: 5000 }],
      });

      expect(tx.movimientoFinanciero.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            cuentaId: 2,
            tipo: 'INGRESO_COBRANZA',
            pagoId: 89,
            conceptoTexto: expect.stringContaining('TRX-12345'),
          }),
        }),
      );
    });

    it('revertirPago: elimina atómicamente el MovimientoFinanciero asociado al pago', async () => {
      const tx = {
        cargoMiembro: {
          findUnique: vi.fn().mockResolvedValue({
            id: 101,
            montoFinal: '5000.00',
            montoPagado: '5000.00',
            estado: 'PAGADO',
          }),
          update: vi.fn().mockResolvedValue({ id: 101, estado: 'PENDIENTE' }),
        },
        movimientoFinanciero: {
          deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        pago: {
          delete: vi.fn().mockResolvedValue({ id: 55 }),
        },
      };

      const mockPrisma = {
        pago: {
          findUnique: vi.fn().mockResolvedValue({
            id: 55,
            montoTotal: '5000.00',
            referenciaComprobante: null,
            usuario: null,
            imputaciones: [
              {
                id: 1,
                montoImputado: '5000.00',
                cargoId: 101,
                cargo: { usuario: { id: 7, asignaciones: [] } },
              },
            ],
          }),
        },
        $transaction: vi.fn().mockImplementation((cb) => cb(tx)),
      } as any;

      const service = new TesoreriaService(mockPrisma);
      const res = await service.revertirPago(alcanceGlobal, 55);

      expect(res.mensaje).toContain('revertido correctamente');
      expect(tx.movimientoFinanciero.deleteMany).toHaveBeenCalledWith({
        where: { pagoId: 55 },
      });
      expect(tx.pago.delete).toHaveBeenCalledWith({ where: { id: 55 } });
    });

    it('revertirPago: reversión de pago histórico sin movimientos contables se ejecuta limpiamente', async () => {
      const tx = {
        cargoMiembro: {
          findUnique: vi.fn().mockResolvedValue({
            id: 101,
            montoFinal: '5000.00',
            montoPagado: '5000.00',
            estado: 'PAGADO',
          }),
          update: vi.fn().mockResolvedValue({ id: 101, estado: 'PENDIENTE' }),
        },
        movimientoFinanciero: {
          deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
        pago: {
          delete: vi.fn().mockResolvedValue({ id: 1 }),
        },
      };

      const mockPrisma = {
        pago: {
          findUnique: vi.fn().mockResolvedValue({
            id: 1,
            montoTotal: '5000.00',
            referenciaComprobante: null,
            usuario: null,
            imputaciones: [
              {
                id: 1,
                montoImputado: '5000.00',
                cargoId: 101,
                cargo: { usuario: { id: 7, asignaciones: [] } },
              },
            ],
          }),
        },
        $transaction: vi.fn().mockImplementation((cb) => cb(tx)),
      } as any;

      const service = new TesoreriaService(mockPrisma);
      const res = await service.revertirPago(alcanceGlobal, 1);

      expect(res.mensaje).toContain('revertido correctamente');
      expect(tx.movimientoFinanciero.deleteMany).toHaveBeenCalledWith({
        where: { pagoId: 1 },
      });
    });
  });

  describe('Fase 2: Rubros Contables y Gastos Operativos', () => {
    it('crearRubroContable: rechaza creación si el rubro es general y el alcance no es GLOBAL', async () => {
      const mockPrisma = {} as any;
      const service = new TesoreriaService(mockPrisma);

      await expect(
        service.crearRubroContable(alcancePropio, {
          nombre: 'Comida',
          tipo: 'EGRESO' as any,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('crearRubroContable: crea exitosamente un nuevo rubro contable', async () => {
      const mockPrisma = {
        rubroContable: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 1, ...data })),
        },
      } as any;
      const service = new TesoreriaService(mockPrisma);

      const res = await service.crearRubroContable(alcanceGlobal, {
        nombre: 'Programa Manada',
        tipo: 'EGRESO' as any,
        permiteDescuentoDefault: false,
      });

      expect(res.nombre).toBe('Programa Manada');
      expect(res.tipo).toBe('EGRESO');
      expect(mockPrisma.rubroContable.create).toHaveBeenCalled();
    });

    it('registrarGasto: rechaza si el rubro seleccionado no es de tipo EGRESO', async () => {
      const actor = { sub: 1 } as any;
      const tx = {
        cuentaFinanciera: {
          findUnique: vi.fn().mockResolvedValue({ id: 1, nombre: 'Caja Chica', activa: true }),
        },
        rubroContable: {
          findUnique: vi.fn().mockResolvedValue({ id: 2, nombre: 'Cuota Social', tipo: 'INGRESO', activo: true }),
        },
      };
      const mockPrisma = {
        $transaction: vi.fn().mockImplementation((cb) => cb(tx)),
      } as any;
      const service = new TesoreriaService(mockPrisma);

      await expect(
        service.registrarGasto(actor, alcanceGlobal, {
          cuentaId: 1,
          rubroId: 2,
          monto: 5000,
          descripcion: 'Compra de cartulinas',
        }),
      ).rejects.toThrow('El rubro seleccionado debe ser de tipo EGRESO');
    });

    it('registrarGasto: rechaza si el saldo en la cuenta es insuficiente', async () => {
      const actor = { sub: 1 } as any;
      const tx = {
        cuentaFinanciera: {
          findUnique: vi.fn().mockResolvedValue({ id: 1, nombre: 'Caja Chica', activa: true }),
        },
        rubroContable: {
          findUnique: vi.fn().mockResolvedValue({ id: 3, nombre: 'Programa Manada', tipo: 'EGRESO', activo: true }),
        },
        movimientoFinanciero: {
          aggregate: vi.fn().mockResolvedValue({
            _sum: { montoIngreso: '1000.00', montoEgreso: '800.00' }, // Saldo disponible: 200
          }),
        },
      };
      const mockPrisma = {
        $transaction: vi.fn().mockImplementation((cb) => cb(tx)),
      } as any;
      const service = new TesoreriaService(mockPrisma);

      await expect(
        service.registrarGasto(actor, alcanceGlobal, {
          cuentaId: 1,
          rubroId: 3,
          monto: 500, // Intenta gastar 500 habiendo solo 200
          descripcion: 'Compra de materiales',
        }),
      ).rejects.toThrow('Saldo insuficiente en Caja Chica');
    });

    it('registrarGasto: crea el gasto y genera el movimiento financiero de egreso si hay saldo disponible', async () => {
      const actor = { sub: 1 } as any;
      const tx = {
        cuentaFinanciera: {
          findUnique: vi.fn().mockResolvedValue({ id: 1, nombre: 'Caja Chica', activa: true }),
        },
        rubroContable: {
          findUnique: vi.fn().mockResolvedValue({ id: 3, nombre: 'Programa Manada', tipo: 'EGRESO', activo: true }),
        },
        movimientoFinanciero: {
          aggregate: vi.fn().mockResolvedValue({
            _sum: { montoIngreso: '50000.00', montoEgreso: '10000.00' }, // Saldo disponible: 40000
          }),
          create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 55, ...data })),
        },
        gasto: {
          create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 10, ...data })),
        },
      };
      const mockPrisma = {
        $transaction: vi.fn().mockImplementation((cb) => cb(tx)),
      } as any;
      const service = new TesoreriaService(mockPrisma);

      const res = await service.registrarGasto(actor, alcanceGlobal, {
        cuentaId: 1,
        rubroId: 3,
        monto: 4500,
        descripcion: 'Pintura y pinceles',
        comprobanteNro: 'FAC-0012',
      });

      expect(res.id).toBe(10);
      expect(tx.gasto.create).toHaveBeenCalled();
      expect(tx.movimientoFinanciero.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            cuentaId: 1,
            montoEgreso: expect.any(Object),
            gastoId: 10,
            tipo: 'EGRESO_GASTO',
          }),
        }),
      );
    });

    it('anularGasto: marca el gasto como anulado y remueve los movimientos financieros asociados', async () => {
      const actor = { sub: 1 } as any;
      const tx = {
        movimientoFinanciero: {
          deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        gasto: {
          update: vi.fn().mockResolvedValue({ id: 10, anulado: true }),
        },
      };
      const mockPrisma = {
        gasto: {
          findUnique: vi.fn().mockResolvedValue({
            id: 10,
            monto: '4500.00',
            anulado: false,
            cuenta: { id: 1, nombre: 'Caja Chica' },
            rubro: { id: 3, nombre: 'Programa Manada' },
          }),
        },
        $transaction: vi.fn().mockImplementation((cb) => cb(tx)),
      } as any;
      const service = new TesoreriaService(mockPrisma);

      const res = await service.anularGasto(actor, alcanceGlobal, 10);
      expect(res.anulado).toBe(true);
      expect(tx.movimientoFinanciero.deleteMany).toHaveBeenCalledWith({
        where: { gastoId: 10 },
      });
      expect(tx.gasto.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 10 },
          data: { anulado: true },
        }),
      );
    });
  });

  describe('Ingresos Directos / Manuales', () => {
    it('registrarIngreso: rechaza si el rubro seleccionado no es de tipo INGRESO', async () => {
      const actor = { sub: 1 } as any;
      const tx = {
        cuentaFinanciera: {
          findUnique: vi.fn().mockResolvedValue({ id: 1, nombre: 'Banco Galicia', activa: true }),
        },
        rubroContable: {
          findUnique: vi.fn().mockResolvedValue({ id: 2, nombre: 'Librería y Papelería', tipo: 'EGRESO', activo: true }),
        },
      };
      const mockPrisma = {
        $transaction: vi.fn().mockImplementation((cb) => cb(tx)),
      } as any;
      const service = new TesoreriaService(mockPrisma);

      await expect(
        service.registrarIngreso(actor, alcanceGlobal, {
          cuentaId: 1,
          rubroId: 2,
          monto: 15000,
          descripcion: 'Donación anónima',
        }),
      ).rejects.toThrow('El rubro seleccionado debe ser de tipo INGRESO');
    });

    it('registrarIngreso: crea el movimiento financiero con tipo INGRESO_OTRO', async () => {
      const actor = { sub: 5 } as any;
      const tx = {
        cuentaFinanciera: {
          findUnique: vi.fn().mockResolvedValue({ id: 1, nombre: 'Banco Galicia', activa: true }),
        },
        rubroContable: {
          findUnique: vi.fn().mockResolvedValue({ id: 8, nombre: 'Donaciones', tipo: 'INGRESO', activo: true }),
        },
        movimientoFinanciero: {
          create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 99, ...data })),
        },
      };
      const mockPrisma = {
        $transaction: vi.fn().mockImplementation((cb) => cb(tx)),
      } as any;
      const service = new TesoreriaService(mockPrisma);

      const res = await service.registrarIngreso(actor, alcanceGlobal, {
        cuentaId: 1,
        rubroId: 8,
        monto: 25000,
        descripcion: 'Donación de empresa colaboradora',
        comprobanteNro: 'REC-0099',
      });

      expect(res.id).toBe(99);
      expect(tx.movimientoFinanciero.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            cuentaId: 1,
            rubroId: 8,
            montoIngreso: expect.any(Object),
            montoEgreso: 0,
            tipo: 'INGRESO_OTRO',
            creadoPorUsuarioId: 5,
          }),
        }),
      );
    });

    it('actualizarIngreso: modifica monto y concepto en el movimiento financiero', async () => {
      const actor = { sub: 1 } as any;
      const movExistente = {
        id: 99,
        cuentaId: 1,
        rubroId: 8,
        tipo: 'INGRESO_OTRO',
        montoIngreso: '25000.00',
        conceptoTexto: 'Ingreso: Donación inicial - Donaciones',
        fecha: new Date('2026-05-01'),
        rubro: { id: 8, nombre: 'Donaciones' },
        cuenta: { id: 1, nombre: 'Banco Galicia' },
      };
      const tx = {
        movimientoFinanciero: {
          update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ ...movExistente, ...data })),
        },
      };
      const mockPrisma = {
        movimientoFinanciero: {
          findUnique: vi.fn().mockResolvedValue(movExistente),
        },
        $transaction: vi.fn().mockImplementation((cb) => cb(tx)),
      } as any;
      const service = new TesoreriaService(mockPrisma);

      await service.actualizarIngreso(actor, alcanceGlobal, 99, {
        monto: 30000,
        descripcion: 'Donación ampliada',
      });

      expect(tx.movimientoFinanciero.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 99 },
          data: expect.objectContaining({
            montoIngreso: expect.any(Object),
            conceptoTexto: 'Ingreso: Donación ampliada - Donaciones',
          }),
        }),
      );
    });

    it('eliminarIngreso: remueve el movimiento si es de tipo INGRESO_OTRO', async () => {
      const actor = { sub: 1 } as any;
      const movExistente = {
        id: 99,
        tipo: 'INGRESO_OTRO',
      };
      const mockPrisma = {
        movimientoFinanciero: {
          findUnique: vi.fn().mockResolvedValue(movExistente),
          delete: vi.fn().mockResolvedValue(movExistente),
        },
      } as any;
      const service = new TesoreriaService(mockPrisma);

      const res = await service.eliminarIngreso(actor, alcanceGlobal, 99);
      expect(res.exito).toBe(true);
      expect(mockPrisma.movimientoFinanciero.delete).toHaveBeenCalledWith({
        where: { id: 99 },
      });
    });
  });

  describe('Cuadro de Resultados y Balance Contable (Fase 3)', () => {
    it('obtenerCuadroResultados: rechaza acceso a usuarios con alcance PROPIO', async () => {
      const mockPrisma = {} as any;
      const service = new TesoreriaService(mockPrisma);

      await expect(
        service.obtenerCuadroResultados(alcancePropio, { anio: 2026 }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('obtenerCuadroResultados: calcula ingresos, egresos, resultado neto y evolución mensual consolidada', async () => {
      const mockPrisma = {
        rubroContable: {
          findMany: vi.fn().mockResolvedValue([
            { id: 1, nombre: 'Cuota Social', tipo: 'INGRESO', activo: true },
            { id: 2, nombre: 'Programa Manada', tipo: 'EGRESO', activo: true },
          ]),
        },
        pago: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: 101,
              fechaPago: new Date('2026-05-10T15:00:00.000Z'),
              montoTotal: '10000.00',
              imputaciones: [
                {
                  montoImputado: '10000.00',
                  cargo: {
                    concepto: {
                      id: 20,
                      nombre: 'Cuota Social Mayo 2026',
                      rubroId: 1,
                      rubro: { id: 1, nombre: 'Cuota Social' },
                    },
                  },
                },
              ],
            },
          ]),
        },
        movimientoFinanciero: {
          findMany: vi.fn().mockResolvedValue([]),
          groupBy: vi.fn().mockResolvedValue([
            { cuentaId: 1, _sum: { montoIngreso: '5000.00', montoEgreso: '0.00' }, _count: { id: 1 } },
            { cuentaId: 2, _sum: { montoIngreso: '20000.00', montoEgreso: '0.00' }, _count: { id: 1 } },
          ]),
        },
        gasto: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: 50,
              fecha: new Date('2026-05-15T15:00:00.000Z'),
              monto: '3000.00',
              rubroId: 2,
              rubro: { id: 2, nombre: 'Programa Manada' },
            },
          ]),
        },
        cuentaFinanciera: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: 1,
              nombre: 'Caja Chica',
              tipo: 'CAJA_EFECTIVO',
              saldoInicial: '5000.00',
              movimientos: [],
            },
            {
              id: 2,
              nombre: 'Banco Santander',
              tipo: 'BANCO',
              saldoInicial: '20000.00',
              movimientos: [],
            },
          ]),
        },
      } as any;
      const service = new TesoreriaService(mockPrisma);

      const res = await service.obtenerCuadroResultados(alcanceGlobal, { anio: 2026 });

      expect(mockPrisma.pago.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { referenciaComprobante: null },
              { referenciaComprobante: { not: 'APLICACION_SALDO_A_FAVOR' } },
            ],
          }),
        }),
      );

      expect(res.anio).toBe(2026);
      expect(res.resumen.totalIngresos).toBe(10000);
      expect(res.resumen.totalEgresos).toBe(3000);
      expect(res.resumen.resultadoNeto).toBe(7000);
      expect(res.resumen.margenOperativoPorcentaje).toBe(70);

      // Mayo es el mes 5 (índice 4 en el array de evolución)
      const mayo = res.evolucionMensual.find((m) => m.mes === 5);
      expect(mayo).toBeDefined();
      expect(mayo?.ingresos).toBe(10000);
      expect(mayo?.egresos).toBe(3000);
      expect(mayo?.resultadoNeto).toBe(7000);

      // Disponibilidad en cuentas
      expect(res.disponibilidadActual.totalCaja).toBe(5000);
      expect(res.disponibilidadActual.totalBanco).toBe(20000);
      expect(res.disponibilidadActual.totalDisponible).toBe(25000);

      // Rubros
      expect(res.ingresosPorRubro[0].rubroNombre).toBe('Cuota Social');
      expect(res.ingresosPorRubro[0].total).toBe(10000);
      expect(res.ingresosPorRubro[0].porcentaje).toBe(100);

      expect(res.egresosPorRubro[0].rubroNombre).toBe('Programa Manada');
      expect(res.egresosPorRubro[0].total).toBe(3000);
      expect(res.egresosPorRubro[0].porcentaje).toBe(100);
    });

    it('obtenerCuadroResultados: filtra por mes específico correctamente', async () => {
      const mockPrisma = {
        rubroContable: {
          findMany: vi.fn().mockResolvedValue([
            { id: 1, nombre: 'Cuota Social', tipo: 'INGRESO', activo: true },
            { id: 2, nombre: 'Programa Manada', tipo: 'EGRESO', activo: true },
          ]),
        },
        pago: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: 101,
              fechaPago: new Date('2026-05-10T15:00:00.000Z'),
              montoTotal: '10000.00',
              imputaciones: [
                {
                  montoImputado: '10000.00',
                  cargo: {
                    concepto: {
                      id: 20,
                      nombre: 'Cuota Social Mayo 2026',
                      rubroId: 1,
                      rubro: { id: 1, nombre: 'Cuota Social' },
                    },
                  },
                },
              ],
            },
          ]),
        },
        movimientoFinanciero: {
          findMany: vi.fn().mockResolvedValue([]),
          groupBy: vi.fn().mockResolvedValue([
            { cuentaId: 1, _sum: { montoIngreso: '5000.00', montoEgreso: '0.00' }, _count: { id: 1 } },
            { cuentaId: 2, _sum: { montoIngreso: '20000.00', montoEgreso: '0.00' }, _count: { id: 1 } },
          ]),
        },
        gasto: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        cuentaFinanciera: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      } as any;
      const service = new TesoreriaService(mockPrisma);

      // Si se filtra por mes 6 (Junio), no hay movimientos en junio
      const resJunio = await service.obtenerCuadroResultados(alcanceGlobal, { anio: 2026, mes: 6 });
      expect(resJunio.mesFiltro).toBe(6);
      expect(resJunio.resumen.totalIngresos).toBe(0);

      // Si se filtra por mes 5 (Mayo), el total es 10000
      const resMayo = await service.obtenerCuadroResultados(alcanceGlobal, { anio: 2026, mes: 5 });
      expect(resMayo.mesFiltro).toBe(5);
      expect(resMayo.resumen.totalIngresos).toBe(10000);
    });

    it('obtenerCuadroResultados: suma cobros de cuotas con comprobante null y deduce rubro Cuota Social', async () => {
      const mockPrisma = {
        rubroContable: {
          findMany: vi.fn().mockResolvedValue([
            { id: 1, nombre: 'Cuota Social', tipo: 'INGRESO', activo: true },
          ]),
        },
        pago: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: 102,
              fechaPago: new Date('2026-11-03T15:00:00.000Z'),
              referenciaComprobante: null,
              montoTotal: '45000.00',
              imputaciones: [
                {
                  montoImputado: '15000.00',
                  cargo: {
                    concepto: {
                      id: 40,
                      nombre: 'Cuota Social 2026 - Octubre',
                      tipo: 'CUOTA_MENSUAL',
                      rubroId: null,
                      rubro: null,
                    },
                  },
                },
                {
                  montoImputado: '15000.00',
                  cargo: {
                    concepto: {
                      id: 41,
                      nombre: 'Cuota Social 2026 - Noviembre',
                      tipo: 'CUOTA_MENSUAL',
                      rubroId: null,
                      rubro: null,
                    },
                  },
                },
                {
                  montoImputado: '15000.00',
                  cargo: {
                    concepto: {
                      id: 42,
                      nombre: 'Cuota Social 2026 - Diciembre',
                      tipo: 'CUOTA_MENSUAL',
                      rubroId: null,
                      rubro: null,
                    },
                  },
                },
              ],
            },
          ]),
        },
        movimientoFinanciero: {
          findMany: vi.fn().mockResolvedValue([]),
          groupBy: vi.fn().mockResolvedValue([]),
        },
        gasto: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        cuentaFinanciera: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      } as any;
      const service = new TesoreriaService(mockPrisma);

      const res = await service.obtenerCuadroResultados(alcanceGlobal, { anio: 2026 });
      expect(res.resumen.totalIngresos).toBe(45000);
      const cuotaRubro = res.ingresosPorRubro.find((r) => r.rubroNombre === 'Cuota Social');
      expect(cuotaRubro).toBeDefined();
      expect(cuotaRubro?.total).toBe(45000);
      expect(cuotaRubro?.meses[11]).toBe(45000);
    });
  });

  describe('Eventos Económicos y Entradas con QR (Fase 4)', () => {
    const actor = { sub: 1 } as any;

    it('crearEvento: rechaza si el alcance es PROPIO', async () => {
      const mockPrisma = {} as any;
      const service = new TesoreriaService(mockPrisma);

      await expect(
        service.crearEvento(actor, alcancePropio, {
          titulo: 'Venta de Pizzas',
          fechaEvento: '2026-05-20',
          items: [{ nombre: 'Pizza Muzza', precioVenta: 5000 }],
        } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('crearPedidoEvento: genera pedido, calcula totales y crea tickets con token QR criptográfico', async () => {
      const mockPrisma = {
        evento: {
          findUnique: vi.fn().mockResolvedValue({
            id: 1,
            titulo: 'Venta de Pizzas',
            estado: 'PUBLICADO',
            rubroId: 5,
            items: [
              {
                id: 10,
                nombre: 'Pizza Muzza',
                precioVenta: '5000.00',
                costoUnitario: '3000.00',
                gananciaUnitaria: '2000.00',
                stockDisponible: 50,
              },
            ],
          }),
        },
        $transaction: vi.fn().mockImplementation(async (cb) => {
          const tx = {
            pedidoEvento: {
              create: vi.fn().mockResolvedValue({ id: 99 }),
              findUnique: vi.fn().mockResolvedValue({
                id: 99,
                total: '10000.00',
                totalGanancia: '4000.00',
                detalles: [{ itemId: 10, cantidad: 2 }],
                tickets: [{ id: 1, tokenQr: 'mock.qr', cantidad: 2 }],
              }),
            },
            ticketEvento: {
              create: vi.fn().mockResolvedValue({ id: 1 }),
            },
            itemEvento: {
              update: vi.fn().mockResolvedValue({}),
            },
            movimientoFinanciero: {
              create: vi.fn().mockResolvedValue({}),
            },
          };
          return cb(tx);
        }),
      } as any;
      const service = new TesoreriaService(mockPrisma);

      const pedido = await service.crearPedidoEvento(actor, alcanceGlobal, {
        eventoId: 1,
        compradorNombre: 'Marta Pérez',
        vendedorUsuarioId: 2,
        items: [{ itemId: 10, cantidad: 2 }],
      });

      expect(pedido?.id).toBe(99);
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it('crearPedidoEvento: rechaza cargar pedidos si el evento no está publicado (ej: FINALIZADO o BORRADOR)', async () => {
      const mockPrisma = {
        evento: {
          findUnique: vi.fn().mockResolvedValue({
            id: 1,
            titulo: 'Venta Finalizada',
            estado: 'FINALIZADO',
            items: [],
          }),
        },
      } as any;
      const service = new TesoreriaService(mockPrisma);

      await expect(
        service.crearPedidoEvento(actor, alcanceGlobal, {
          eventoId: 1,
          compradorNombre: 'Marta Pérez',
          items: [{ itemId: 1, cantidad: 1 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('crearPedidoEvento: beneficiario con alcance PROPIO puede cargar sus propias ventas', async () => {
      const mockPrisma = {
        evento: {
          findUnique: vi.fn().mockResolvedValue({
            id: 1,
            titulo: 'Venta de Empanadas',
            estado: 'PUBLICADO',
            rubroId: 5,
            items: [
              {
                id: 10,
                nombre: 'Docena Empanadas',
                precioVenta: '6000.00',
                costoUnitario: '3500.00',
                gananciaUnitaria: '2500.00',
                stockDisponible: 20,
              },
            ],
          }),
        },
        $transaction: vi.fn().mockImplementation(async (cb) => {
          const tx = {
            pedidoEvento: {
              create: vi.fn().mockResolvedValue({ id: 50 }),
              findUnique: vi.fn().mockResolvedValue({
                id: 50,
                vendedorUsuarioId: 1,
                total: '6000.00',
              }),
            },
            ticketEvento: { create: vi.fn().mockResolvedValue({ id: 1 }) },
            itemEvento: { update: vi.fn().mockResolvedValue({}) },
          };
          return cb(tx);
        }),
      } as any;
      const service = new TesoreriaService(mockPrisma);

      const res = await service.crearPedidoEvento(actor, alcancePropio, {
        eventoId: 1,
        compradorNombre: 'Tía Nora',
        vendedorUsuarioId: 1,
        items: [{ itemId: 10, cantidad: 1 }],
      });

      expect(res?.id).toBe(50);
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it('crearPedidoEvento: beneficiario con alcance PROPIO no puede asignar ventas a otro usuario', async () => {
      const mockPrisma = {} as any;
      const service = new TesoreriaService(mockPrisma);

      await expect(
        service.crearPedidoEvento(actor, alcancePropio, {
          eventoId: 1,
          compradorNombre: 'Cliente X',
          vendedorUsuarioId: 999, // Distinto a actor.sub (1)
          items: [{ itemId: 10, cantidad: 1 }],
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('validarTicketQr: valida ticket activo y previene doble uso', async () => {
      const { generateTokenQR } = await import('../common/utils/qr-token.util.js');
      const validToken = generateTokenQR();

      const tx = {
        ticketEvento: {
          findUnique: vi.fn().mockResolvedValue({
            id: 15,
            tokenQr: validToken,
            cantidad: 2,
            estado: 'ACTIVO',
            item: { nombre: 'Pizza Muzza' },
            pedido: {
              id: 99,
              total: 5000,
              estado: 'PENDIENTE',
              compradorNombre: 'Marta Pérez',
              evento: { titulo: 'Venta de Pizzas' },
              vendedorUsuario: { nombre: 'Lucas', apellido: 'Gómez' },
            },
          }),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      };

      const mockPrisma = {
        $transaction: vi.fn().mockImplementation((cb) => cb(tx)),
      } as any;
      const service = new TesoreriaService(mockPrisma);

      const res = await service.validarTicketQr(actor, alcanceGlobal, { tokenQr: validToken });
      expect(res.ok).toBe(true);
      expect(res.estado).toBe('VALIDADO');
      expect(res.pedidoId).toBe(99);
      expect(res.alertaPagoPendiente).toBe(true);
      expect(res.ticket?.pedidoId).toBe(99);
      expect(tx.ticketEvento.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 15, estado: 'ACTIVO' },
          data: expect.objectContaining({ estado: 'UTILIZADO' }),
        }),
      );

      // Si ya fue utilizado previamente
      tx.ticketEvento.findUnique = vi.fn().mockResolvedValue({
        id: 15,
        tokenQr: validToken,
        cantidad: 2,
        estado: 'UTILIZADO',
        fechaUso: new Date(),
        item: { nombre: 'Pizza Muzza' },
        pedido: {
          compradorNombre: 'Marta Pérez',
          evento: { titulo: 'Venta de Pizzas' },
          vendedorUsuario: null,
        },
      });

      const resReuso = await service.validarTicketQr(actor, alcanceGlobal, { tokenQr: validToken });
      expect(resReuso.ok).toBe(false);
      expect(resReuso.estado).toBe('YA_UTILIZADO');

      // Token v2 vinculado a otro eventoId debe ser rechazado
      const tokenOtroEvento = generateTokenQR({ eventoId: 777, pedidoId: 99 });
      tx.ticketEvento.findUnique = vi.fn().mockResolvedValue({
        id: 15,
        pedidoId: 99,
        tokenQr: tokenOtroEvento,
        cantidad: 1,
        estado: 'ACTIVO',
        item: { nombre: 'Pizza Muzza' },
        pedido: {
          id: 99,
          eventoId: 1,
          estado: 'PAGADO',
          compradorNombre: 'Marta Pérez',
          evento: { id: 1, titulo: 'Venta de Pizzas' },
          vendedorUsuario: null,
        },
      });
      await expect(
        service.validarTicketQr(actor, alcanceGlobal, { tokenQr: tokenOtroEvento }),
      ).rejects.toThrow(/evento o pedido/i);
    });

    it('acreditarGananciasEvento: incrementa saldoAFavor del scout vendedor para pedidos retirados', async () => {
      const mockPrisma = {
        evento: {
          findUnique: vi.fn().mockResolvedValue({
            id: 1,
            pedidos: [
              {
                id: 101,
                vendedorUsuarioId: 5,
                totalGanancia: '4000.00',
                gananciaAcreditada: false,
                tickets: [{ id: 1, estado: 'UTILIZADO' }],
              },
            ],
          }),
        },
        $transaction: vi.fn().mockImplementation(async (cb) => {
          const tx = {
            usuario: { update: vi.fn().mockResolvedValue({}) },
            pedidoEvento: { update: vi.fn().mockResolvedValue({}) },
          };
          return cb(tx);
        }),
      } as any;
      const service = new TesoreriaService(mockPrisma);

      const res = await service.acreditarGananciasEvento(actor, alcanceGlobal, {
        eventoId: 1,
        soloRetirados: true,
      });

      expect(res.pedidosAcreditados).toBe(1);
      expect(res.totalGananciaAcreditada).toBe(4000);
      expect(mockPrisma.evento.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          include: expect.objectContaining({
            pedidos: expect.objectContaining({
              where: expect.objectContaining({
                estado: 'PAGADO',
              }),
            }),
          }),
        }),
      );
    });

    it('acreditarGananciasEvento: liquida y acredita pedidos con ganancia igual a cero', async () => {
      const mockPrisma = {
        evento: {
          findUnique: vi.fn().mockResolvedValue({
            id: 1,
            pedidos: [
              {
                id: 102,
                vendedorUsuarioId: 5,
                totalGanancia: '0.00',
                gananciaAcreditada: false,
                tickets: [{ id: 2, estado: 'UTILIZADO' }],
              },
            ],
          }),
        },
        $transaction: vi.fn().mockImplementation(async (cb) => {
          const tx = {
            usuario: { update: vi.fn().mockResolvedValue({}) },
            pedidoEvento: { update: vi.fn().mockResolvedValue({}) },
          };
          return cb(tx);
        }),
      } as any;
      const service = new TesoreriaService(mockPrisma);

      const res = await service.acreditarGananciasEvento(actor, alcanceGlobal, {
        eventoId: 1,
        soloRetirados: true,
      });

      expect(res.pedidosAcreditados).toBe(1);
      expect(res.totalGananciaAcreditada).toBe(0);
    });

    it('actualizarPedidoEvento: rechaza modificar productos de un pedido cuyos tickets ya fueron utilizados', async () => {
      const mockPrisma = {
        pedidoEvento: {
          findUnique: vi.fn().mockResolvedValue({
            id: 200,
            vendedorUsuarioId: 1,
            tickets: [{ id: 1, estado: 'UTILIZADO' }],
            detalles: [],
            evento: { items: [] },
          }),
        },
      } as any;
      const service = new TesoreriaService(mockPrisma);

      await expect(
        service.actualizarPedidoEvento(actor, alcanceGlobal, 200, {
          items: [{ itemId: 1, cantidad: 2 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('actualizarPedidoEvento: permite cobrar un pedido pendiente cuyos tickets ya fueron utilizados', async () => {
      const tx = {
        movimientoFinanciero: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ id: 999 }),
        },
        pedidoEvento: {
          update: vi.fn().mockResolvedValue({
            id: 200,
            estado: 'PAGADO',
            cuentaId: 10,
            metodoPago: 'EFECTIVO',
          }),
        },
      };

      const mockPrisma = {
        pedidoEvento: {
          findUnique: vi.fn().mockResolvedValue({
            id: 200,
            vendedorUsuarioId: 1,
            total: 5000,
            totalGanancia: 1500,
            estado: 'PENDIENTE',
            tickets: [{ id: 1, estado: 'UTILIZADO' }],
            detalles: [],
            evento: { id: 1, titulo: 'Venta Empanadas', items: [] },
          }),
        },
        $transaction: vi.fn().mockImplementation(async (cb) => cb(tx)),
      } as any;
      const service = new TesoreriaService(mockPrisma);

      const res = await service.actualizarPedidoEvento(actor, alcanceGlobal, 200, {
        cuentaId: 10,
        metodoPago: 'EFECTIVO',
      });

      expect(res.estado).toBe('PAGADO');
      expect(tx.movimientoFinanciero.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            cuentaId: 10,
            montoIngreso: new Prisma.Decimal('5000.00'),
            pedidoEventoId: 200,
          }),
        }),
      );
      expect(tx.pedidoEvento.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 200 },
          data: expect.objectContaining({
            estado: 'PAGADO',
            cuentaId: 10,
            metodoPago: 'EFECTIVO',
          }),
        }),
      );
    });

    it('actualizarPedidoEvento: si se envían los mismos items que ya tenía un pedido con tickets utilizados, no rechaza y actualiza el pago', async () => {
      const tx = {
        movimientoFinanciero: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ id: 999 }),
        },
        pedidoEvento: {
          update: vi.fn().mockResolvedValue({
            id: 200,
            estado: 'PAGADO',
            cuentaId: 10,
            metodoPago: 'EFECTIVO',
          }),
        },
      };

      const mockPrisma = {
        pedidoEvento: {
          findUnique: vi.fn().mockResolvedValue({
            id: 200,
            vendedorUsuarioId: 1,
            total: 5000,
            totalGanancia: 1500,
            estado: 'PENDIENTE',
            tickets: [{ id: 1, estado: 'UTILIZADO' }],
            detalles: [{ itemId: 1, cantidad: 2 }],
            evento: { id: 1, titulo: 'Venta Empanadas', items: [] },
          }),
        },
        $transaction: vi.fn().mockImplementation(async (cb) => cb(tx)),
      } as any;
      const service = new TesoreriaService(mockPrisma);

      const res = await service.actualizarPedidoEvento(actor, alcanceGlobal, 200, {
        cuentaId: 10,
        metodoPago: 'EFECTIVO',
        items: [{ itemId: 1, cantidad: 2 }],
      });

      expect(res.estado).toBe('PAGADO');
    });

    it('actualizarPedidoEvento: rechaza si el alcance es PROPIO y no le pertenece', async () => {
      const mockPrisma = {
        pedidoEvento: {
          findUnique: vi.fn().mockResolvedValue({
            id: 201,
            vendedorUsuarioId: 99,
            registradoPorUsuarioId: 99,
            tickets: [{ id: 1, estado: 'ACTIVO' }],
            detalles: [],
            evento: { items: [] },
          }),
        },
      } as any;
      const service = new TesoreriaService(mockPrisma);

      await expect(
        service.actualizarPedidoEvento({ sub: 5 } as any, alcancePropio, 201, { compradorNombre: 'Intento' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('eliminarEvento: rechaza si el alcance es PROPIO', async () => {
      const service = new TesoreriaService({} as any);
      await expect(service.eliminarEvento(alcancePropio, 1)).rejects.toThrow(ForbiddenException);
    });

    it('eliminarEvento: lanza NotFoundException si no existe', async () => {
      const mockPrisma = {
        evento: { findUnique: vi.fn().mockResolvedValue(null) },
      } as any;
      const service = new TesoreriaService(mockPrisma);
      await expect(service.eliminarEvento(alcanceGlobal, 999)).rejects.toThrow(NotFoundException);
    });

    it('eliminarEvento: rechaza si tiene pedidos con ganancias liquidadas', async () => {
      const mockPrisma = {
        evento: {
          findUnique: vi.fn().mockResolvedValue({
            id: 1,
            pedidos: [{ id: 10, gananciaAcreditada: true, tickets: [] }],
          }),
        },
      } as any;
      const service = new TesoreriaService(mockPrisma);
      await expect(service.eliminarEvento(alcanceGlobal, 1)).rejects.toThrow(BadRequestException);
    });

    it('eliminarEvento: rechaza si tiene tickets utilizados', async () => {
      const mockPrisma = {
        evento: {
          findUnique: vi.fn().mockResolvedValue({
            id: 1,
            pedidos: [{ id: 10, gananciaAcreditada: false, tickets: [{ id: 1, estado: 'UTILIZADO' }] }],
          }),
        },
      } as any;
      const service = new TesoreriaService(mockPrisma);
      await expect(service.eliminarEvento(alcanceGlobal, 1)).rejects.toThrow(BadRequestException);
    });

    it('eliminarEvento: elimina evento y relaciones en transaccion si no tiene vales utilizados ni ganancias liquidadas', async () => {
      const tx = {
        movimientoFinanciero: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
        ticketEvento: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
        detallePedidoEvento: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
        pedidoEvento: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
        itemEvento: { deleteMany: vi.fn().mockResolvedValue({ count: 2 }) },
        evento: { delete: vi.fn().mockResolvedValue({ id: 1, titulo: 'Bono Contribución' }) },
      };
      const mockPrisma = {
        evento: {
          findUnique: vi.fn().mockResolvedValue({
            id: 1,
            titulo: 'Bono Contribución',
            pedidos: [{ id: 10, gananciaAcreditada: false, tickets: [{ id: 1, estado: 'ACTIVO' }] }],
          }),
        },
        $transaction: vi.fn().mockImplementation((cb) => cb(tx)),
      } as any;
      const service = new TesoreriaService(mockPrisma);
      const res = await service.eliminarEvento(alcanceGlobal, 1);
      expect(res.id).toBe(1);
      expect(tx.evento.delete).toHaveBeenCalledWith({ where: { id: 1 } });
    });

    it('obtenerMisPedidos: consulta pedidos donde el usuario es vendedor o registrador', async () => {
      const mockPrisma = {
        pedidoEvento: {
          findMany: vi.fn().mockResolvedValue([
            { id: 1, compradorNombre: 'Tía Marta', total: '5000.00' },
          ]),
        },
      } as any;
      const service = new TesoreriaService(mockPrisma);

      const pedidos = await service.obtenerMisPedidos({ sub: 10 } as any);
      expect(pedidos).toHaveLength(1);
      expect(mockPrisma.pedidoEvento.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { vendedorUsuarioId: 10 },
              { registradoPorUsuarioId: 10 },
            ],
          },
        }),
      );
    });

    it('sincronizarCuotasMiembroActivoEnTx: Prevalencia de Protagonista ante rol dual (Protagonista + Educador)', async () => {
      const txMock = {
        usuario: {
          findUnique: vi.fn().mockResolvedValue({
            id: 20,
            activo: true,
            grupoFamiliar: null,
            asignaciones: [
              { unidadId: 1, rol: { tipoMiembro: 'PROTAGONISTA', alcancePorDefecto: 'PROPIO' } },
              { unidadId: 2, rol: { tipoMiembro: 'EDUCADOR', alcancePorDefecto: 'GLOBAL' } },
            ],
            cargos: [],
          }),
        },
        conceptoCuota: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: 101,
              cicloAnio: 2026,
              destinatarioTipo: 'EDUCADORES',
              esParaEducadores: true,
              planCuotaMensualId: 1,
              mes: 4,
              montoBase: '5000.00',
              excepcionesJson: [],
            },
            {
              id: 102,
              cicloAnio: 2026,
              destinatarioTipo: 'PROTAGONISTAS',
              esParaEducadores: false,
              planCuotaMensualId: 1,
              mes: 4,
              montoBase: '8000.00',
              excepcionesJson: [],
            },
          ]),
        },
        cargoMiembro: {
          create: vi.fn().mockResolvedValue({ id: 1 }),
        },
      } as any;

      const service = new TesoreriaService({} as any);
      await service.sincronizarCuotasMiembroActivoEnTx(txMock, 20, 4, 2026);

      // Debería haberse creado cargo para el concepto 102 (Protagonistas) pero NO para el 101 (Educadores)
      expect(txMock.cargoMiembro.create).toHaveBeenCalledTimes(1);
      expect(txMock.cargoMiembro.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            conceptoId: 102,
            usuarioId: 20,
          }),
        }),
      );
    });
  });

  describe('Hardening Crítico P0 (Seguridad y Concurrencia)', () => {
    const alcanceUnidad: AlcanceAcceso = { tipo: 'UNIDAD', unidadIds: [1] };

    it('P0-2: listarEventos y obtenerEventoPorId ocultan costos internos y borradores a alcance PROPIO', async () => {
      const mockPrisma = {
        evento: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: 1,
              titulo: 'Rifa',
              estado: 'PUBLICADO',
              cuentaId: 9,
              cuenta: { id: 9, nombre: 'Caja', tipo: 'CAJA_EFECTIVO' },
              items: [{ id: 10, nombre: 'Número', precioVenta: '1000', costoUnitario: '200', gananciaUnitaria: '800', stockTotal: 100, stockDisponible: 80 }],
              pedidos: [{ id: 1, total: '5000', totalGanancia: '4000', estado: 'PAGADO', tickets: [] }],
            },
          ]),
          findUnique: vi.fn().mockResolvedValue({
            id: 2,
            titulo: 'Borrador secreto',
            estado: 'BORRADOR',
            items: [],
            pedidos: [],
          }),
        },
      } as any;
      const service = new TesoreriaService(mockPrisma);

      const list = await service.listarEventos(alcancePropio);
      expect(list[0].cuenta).toBeNull();
      expect((list[0] as any).metricas).toBeUndefined();
      expect((list[0].items[0] as any).costoUnitario).toBeUndefined();
      expect((list[0].items[0] as any).gananciaUnitaria).toBeUndefined();

      await expect(service.obtenerEventoPorId(alcancePropio, 2)).rejects.toThrow(NotFoundException);
    });

    it('P0-2: bloquear modificar/eliminar pedidos PAGADO sin permiso de gestión y validarTicketQr en evento FINALIZADO o alcance PROPIO', async () => {
      const mockPrisma = {
        pedidoEvento: {
          findUnique: vi.fn().mockResolvedValue({
            id: 10,
            vendedorUsuarioId: 1,
            registradoPorUsuarioId: 1,
            estado: 'PAGADO',
            tickets: [],
            detalles: [],
            evento: { items: [] },
          }),
        },
      } as any;
      const service = new TesoreriaService(mockPrisma);

      await expect(
        service.actualizarPedidoEvento({ sub: 1 } as any, alcancePropio, 10, { compradorNombre: 'Cambio' }),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.eliminarPedidoEvento({ sub: 1 } as any, alcancePropio, 10),
      ).rejects.toThrow(ForbiddenException);

      const { generateTokenQR } = await import('../common/utils/qr-token.util.js');
      const token = generateTokenQR();

      await expect(
        service.validarTicketQr({ sub: 1 } as any, alcancePropio, { tokenQr: token }),
      ).rejects.toThrow(ForbiddenException);

      const txFinalizado = {
        $queryRaw: vi.fn().mockResolvedValue([]),
        ticketEvento: {
          findUnique: vi.fn().mockResolvedValue({
            id: 20,
            pedidoId: 10,
            tokenQr: token,
            estado: 'ACTIVO',
            item: { nombre: 'Pizza' },
            pedido: {
              id: 10,
              estado: 'PAGADO',
              evento: { titulo: 'Venta', estado: 'FINALIZADO' },
              vendedorUsuario: null,
            },
          }),
        },
      };
      const serviceFinalizado = new TesoreriaService({
        $transaction: vi.fn().mockImplementation((cb) => cb(txFinalizado)),
      } as any);
      const qrRes = await serviceFinalizado.validarTicketQr({ sub: 1 } as any, alcanceGlobal, { tokenQr: token });
      expect(qrRes.ok).toBe(false);
      expect(qrRes.estado).toBe('FINALIZADO');
    });

    it('P0-4: bloquea consultas financieras globales y rubros con unidadId null para alcance UNIDAD', async () => {
      const service = new TesoreriaService({
        $transaction: vi.fn().mockImplementation(async (cb) =>
          cb({
            cuentaFinanciera: { findUnique: vi.fn().mockResolvedValue({ id: 1, nombre: 'Caja', activa: true }) },
            rubroContable: { findUnique: vi.fn().mockResolvedValue({ id: 1, nombre: 'General', tipo: 'EGRESO', activo: true, unidadId: null }) },
          }),
        ),
      } as any);

      await expect(service.listarCuentasFinancieras(alcanceUnidad)).rejects.toThrow(ForbiddenException);
      await expect(service.obtenerLibroDiario(alcanceUnidad, 1, {})).rejects.toThrow(ForbiddenException);
      await expect(service.obtenerCuadroResultados(alcanceUnidad, { anio: 2026 })).rejects.toThrow(ForbiddenException);
      await expect(
        service.registrarGasto({ sub: 1 } as any, alcanceUnidad, { cuentaId: 1, rubroId: 1, monto: 100, descripcion: 'Test' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('P0-5 & P0-7: adquiere locks FOR UPDATE para cargos/usuarios/cuentas y ejecuta eliminarIngreso en transacción', async () => {
      const txMock = {
        $queryRaw: vi.fn().mockResolvedValue([]),
        movimientoFinanciero: {
          findUnique: vi.fn().mockResolvedValue({
            id: 50,
            tipo: 'INGRESO_OTRO',
            cuentaId: 3,
            montoIngreso: '1000.00',
            rubro: { id: 1, unidadId: null },
            cuenta: { id: 3, nombre: 'Caja', activa: true },
          }),
          aggregate: vi.fn().mockResolvedValue({ _sum: { montoIngreso: '2000.00', montoEgreso: '0.00' } }),
          delete: vi.fn().mockResolvedValue({ id: 50 }),
        },
      };
      const mockPrisma = {
        $transaction: vi.fn().mockImplementation((cb) => cb(txMock)),
      } as any;
      const service = new TesoreriaService(mockPrisma);

      const res = await service.eliminarIngreso({ sub: 1 } as any, alcanceGlobal, 50);
      expect(res.exito).toBe(true);
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(txMock.$queryRaw).toHaveBeenCalledTimes(1);
    });

    it('P0-6: acreditarGananciasEvento omite pedido ya reclamado concurrentemente (count === 0)', async () => {
      const txMock = {
        $queryRaw: vi.fn().mockResolvedValue([]),
        evento: {
          findUnique: vi.fn().mockResolvedValue({
            id: 1,
            pedidos: [
              { id: 101, vendedorUsuarioId: 5, totalGanancia: '4000.00', gananciaAcreditada: false, tickets: [{ estado: 'UTILIZADO' }] },
            ],
          }),
        },
        pedidoEvento: {
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
        usuario: {
          update: vi.fn(),
        },
      };
      const service = new TesoreriaService({
        $transaction: vi.fn().mockImplementation((cb) => cb(txMock)),
      } as any);

      const res = await service.acreditarGananciasEvento({ sub: 1 } as any, alcanceGlobal, {
        eventoId: 1,
        soloRetirados: true,
      });

      expect(res.pedidosAcreditados).toBe(0);
      expect(res.totalGananciaAcreditada).toBe(0);
      expect(txMock.usuario.update).not.toHaveBeenCalled();
    });
  });

  describe('Hardening P1 (Validación, Concurrencia, Scope y Transacciones)', () => {
    it('P1-4: bloquea actualizarDescuentoFamilia con alcance UNIDAD si la familia incluye miembros de otra unidad', async () => {
      const service = new TesoreriaService({
        grupoFamiliar: {
          findUnique: vi.fn().mockResolvedValue({
            id: 7,
            miembros: [
              { id: 1, asignaciones: [{ unidadId: 1 }] },
              { id: 2, asignaciones: [{ unidadId: 99 }] },
            ],
          }),
        },
      } as any);

      await expect(
        service.actualizarDescuentoFamilia(
          { tipo: 'UNIDAD', unidadIds: [1], usuarioIdPropio: 50 },
          7,
          { porcentajeDescuentoHermanos: 20 },
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('P1-9 & P1-15: DTOs rechazan fechas inexistentes y costoUnitario mayor a precioVenta', () => {
      const resFecha = CrearTransferenciaSchema.safeParse({
        origenCuentaId: 1,
        destinoCuentaId: 2,
        monto: 100,
        concepto: 'Pase',
        fecha: '2026-02-30',
      });
      expect(resFecha.success).toBe(false);

      const resItem = CrearItemEventoSchema.safeParse({
        nombre: 'Pizza',
        precioVenta: 5000,
        costoUnitario: 6000,
      });
      expect(resItem.success).toBe(false);
    });

    it('P1-12 & P1-15: registrarPago sin titular ni imputaciones, anularCargo ya anulado y actualizarEvento con pedidos fallan explícitamente', async () => {
      const tx = {
        $queryRaw: vi.fn().mockResolvedValue([]),
        cargoMiembro: {
          findUnique: vi.fn().mockResolvedValue({
            id: 10,
            estado: 'ANULADO',
            montoPagado: '0',
            usuario: { id: 1, asignaciones: [] },
          }),
        },
        evento: {
          findUnique: vi.fn().mockResolvedValue({ id: 2, estado: 'PUBLICADO' }),
        },
        pedidoEvento: {
          count: vi.fn().mockResolvedValue(3),
        },
      };
      const service = new TesoreriaService({
        $transaction: vi.fn().mockImplementation((cb) => cb(tx)),
      } as any);

      await expect(
        service.registrarPago({ sub: 1 } as any, alcanceGlobal, {
          montoTotal: 1000,
          metodoPago: 'EFECTIVO',
          imputaciones: [],
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(service.anularCargo(alcanceGlobal, 10)).rejects.toThrow(ConflictException);

      await expect(
        service.actualizarEvento({ sub: 1 } as any, alcanceGlobal, 2, {
          items: [{ nombre: 'Otro', precioVenta: 1000 }],
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('Hardening P2 (Decimales, Hermanos y Clasificación de Roles)', () => {
    it('P2: CrearConceptoSchema rechaza montos con más de 2 decimales y acepta 2 decimales exactos', () => {
      const invalido = CrearConceptoSchema.safeParse({
        nombre: 'Cuota',
        montoBase: 100.123,
        cicloAnio: 2026,
      });
      expect(invalido.success).toBe(false);

      const valido = CrearConceptoSchema.safeParse({
        nombre: 'Cuota',
        montoBase: 19.99,
        cicloAnio: 2026,
      });
      expect(valido.success).toBe(true);
    });

    it('P2: vincularHermano rechaza hermano inactivo y conserva el mayor descuento al fusionar grupos', async () => {
      const mockTx: any = {
        grupoFamiliar: {
          findMany: vi.fn().mockResolvedValue([
            { id: 10, porcentajeDescuentoHermanos: 5 },
            { id: 20, porcentajeDescuentoHermanos: 15 },
          ]),
          update: vi.fn().mockResolvedValue({}),
          deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
          findUnique: vi.fn().mockResolvedValue({ id: 10, miembros: [{ id: 1 }, { id: 2 }] }),
        },
        usuario: {
          findMany: vi.fn().mockResolvedValue([]),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          update: vi.fn().mockResolvedValue({}),
        },
        cargoMiembro: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      };
      const mockPrisma: any = {
        usuario: {
          findUnique: vi
            .fn()
            .mockResolvedValueOnce({ id: 1, activo: true, apellido: 'A', grupoFamiliarId: 10, datosFijosJson: {}, asignaciones: [] })
            .mockResolvedValueOnce({ id: 2, activo: false, apellido: 'A', grupoFamiliarId: 20, datosFijosJson: {}, asignaciones: [] })
            .mockResolvedValueOnce({ id: 1, activo: true, apellido: 'A', grupoFamiliarId: 10, datosFijosJson: {}, asignaciones: [] })
            .mockResolvedValueOnce({ id: 2, activo: true, apellido: 'A', grupoFamiliarId: 20, datosFijosJson: {}, asignaciones: [] }),
        },
        $transaction: vi.fn((cb: any) => cb(mockTx)),
      };

      const service = new TesoreriaService(mockPrisma);

      await expect(
        service.vincularHermano(alcanceGlobal, { usuarioId: 1, hermanoDni: '20000000' }),
      ).rejects.toThrow(BadRequestException);

      await service.vincularHermano(alcanceGlobal, { usuarioId: 1, hermanoDni: '20000000' });
      expect(mockTx.grupoFamiliar.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 10 },
          data: expect.objectContaining({ porcentajeDescuentoHermanos: expect.anything() }),
        }),
      );
    });

    it('P2-3: generarCargos usa tipoMiembro explícito en lugar de inferir por alcancePorDefecto', async () => {
      const findMany = vi.fn().mockResolvedValue([]);
      const service = new TesoreriaService({
        conceptoCuota: {
          findUnique: vi.fn().mockResolvedValue({
            id: 5,
            nombre: 'Cuota Educador',
            destinatarioTipo: 'EDUCADORES',
            esParaEducadores: true,
            unidadId: null,
            excepcionesJson: [],
          }),
        },
        usuario: { findMany },
      } as any);

      const res = await service.generarCargos(alcanceGlobal, { conceptoId: 5 });
      expect(res.totalGenerados).toBe(0);
      const wherePassed = findMany.mock.calls[0][0].where;
      expect(wherePassed.asignaciones.some.rol).toEqual({ tipoMiembro: 'EDUCADOR' });
      expect(wherePassed.asignaciones.none.rol).toEqual({ tipoMiembro: 'PROTAGONISTA' });
    });

    it('P1-14 & P2-5: aplicarSaldoAFavor redondea con round2, usa batch lookup y omite updates redundantes', async () => {
      const findManyCargos = vi.fn().mockResolvedValue([
        {
          id: 11,
          usuarioId: 7,
          montoFinal: '100.10',
          montoPagado: '33.40',
          estado: 'PARCIAL',
          usuario: { id: 7, grupoFamiliarId: null },
        },
      ]);
      const updateCargo = vi.fn().mockResolvedValue({});
      const mockTx: any = {
        $executeRaw: vi.fn().mockResolvedValue(1),
        usuario: {
          findUnique: vi.fn().mockResolvedValue({
            id: 7,
            grupoFamiliarId: null,
            saldoAFavor: '100.00',
            asignaciones: [{ unidadId: 1 }],
          }),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        cargoMiembro: {
          findMany: findManyCargos,
          update: updateCargo,
        },
        pago: {
          create: vi.fn().mockResolvedValue({ id: 99 }),
        },
      };
      const service = new TesoreriaService({
        $transaction: vi.fn((cb: any) => cb(mockTx)),
      } as any);

      const res = await service.aplicarSaldoAFavor(actor, alcanceGlobal, {
        usuarioId: 7,
        imputaciones: [{ cargoId: 11, monto: 66.7 }],
      });
      expect(res.pagoId).toBe(99);
      expect(findManyCargos).toHaveBeenCalledTimes(1);
      expect(updateCargo).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ estado: 'PAGADO' }),
        }),
      );

      // Recálculo de cargos sin cambios no dispara cargoMiembro.update (P2-5)
      const updateSinCambios = vi.fn();
      await service.recalcularCargosPendientesDeUsuariosEnTx(
        {
          usuario: {
            findMany: vi.fn().mockResolvedValue([
              {
                id: 7,
                grupoFamiliar: null,
                cargos: [
                  {
                    id: 12,
                    estado: 'PENDIENTE',
                    montoOriginal: '1000.00',
                    montoDescuento: '0.00',
                    montoFinal: '1000.00',
                    montoPagado: '0.00',
                    concepto: {
                      destinatarioTipo: 'TODOS',
                      montoBase: '1000.00',
                      permiteDescuentoHermanos: true,
                      porcentajeDescuentoHermanos: null,
                    },
                  },
                ],
              },
            ]),
          },
          cargoMiembro: { update: updateSinCambios },
        } as any,
        [7],
      );
      expect(updateSinCambios).not.toHaveBeenCalled();
    });

    it('P1-14 & P1-20: obtenerCuadroResultados y listarEventos usan agregación SQL GROUP BY cuando $queryRaw está disponible', async () => {
      const queryRawCuadro = vi
        .fn()
        // 1. Imputaciones de pagos
        .mockResolvedValueOnce([
          {
            mes: 5,
            conceptoNombre: 'Cuota Mayo',
            conceptoTipo: 'CUOTA_MENSUAL',
            conceptoRubroId: 1,
            rubroId: 1,
            rubroNombre: 'Cuota Social',
            total: new Prisma.Decimal('15000.00'),
          },
        ])
        // 2. Remanentes saldo a favor
        .mockResolvedValueOnce([{ mes: 5, total: new Prisma.Decimal('2500.50') }])
        // 3. Otros ingresos + eventos
        .mockResolvedValueOnce([
          {
            mes: 5,
            movRubroId: null,
            movRubroNombre: null,
            esEvento: true,
            eventoRubroId: null,
            eventoRubroNombre: null,
            total: new Prisma.Decimal('4000.25'),
          },
        ])
        // 4. Gastos
        .mockResolvedValueOnce([
          {
            mes: 5,
            rubroId: 2,
            rubroNombre: 'Mantenimiento',
            total: new Prisma.Decimal('5000.75'),
          },
        ]);

      const mockPrismaCuadro = {
        $queryRaw: queryRawCuadro,
        rubroContable: {
          findMany: vi.fn().mockResolvedValue([
            { id: 1, nombre: 'Cuota Social', tipo: 'INGRESO' },
            { id: 2, nombre: 'Mantenimiento', tipo: 'EGRESO' },
          ]),
        },
        cuentaFinanciera: {
          findMany: vi.fn().mockResolvedValue([{ id: 1, nombre: 'Caja', tipo: 'CAJA_EFECTIVO', activa: true, createdAt: new Date() }]),
        },
        movimientoFinanciero: {
          groupBy: vi.fn().mockResolvedValue([
            { cuentaId: 1, _sum: { montoIngreso: new Prisma.Decimal('21500.75'), montoEgreso: new Prisma.Decimal('5000.75') }, _count: { id: 4 } },
          ]),
        },
        pago: { findMany: vi.fn() },
        gasto: { findMany: vi.fn() },
      } as any;

      const serviceCuadro = new TesoreriaService(mockPrismaCuadro);
      const cuadro = await serviceCuadro.obtenerCuadroResultados(alcanceGlobal, { anio: 2026 });

      expect(queryRawCuadro).toHaveBeenCalledTimes(4);
      expect(mockPrismaCuadro.pago.findMany).not.toHaveBeenCalled();
      expect(cuadro.resumen.totalIngresos).toBe(21500.75);
      expect(cuadro.resumen.totalEgresos).toBe(5000.75);
      expect(cuadro.resumen.resultadoNeto).toBe(16500);
      expect(cuadro.disponibilidadActual.totalDisponible).toBe(16500);

      // listarEventos con groupBy + SQL GROUP BY para tickets
      const queryRawEventos = vi.fn().mockResolvedValue([
        { eventoId: 10, estado: 'UTILIZADO', cantidad: 3 },
        { eventoId: 10, estado: 'ACTIVO', cantidad: 1 },
      ]);
      const mockPrismaEventos = {
        $queryRaw: queryRawEventos,
        evento: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: 10,
              titulo: 'Locro 25 de Mayo',
              descripcion: null,
              tipo: 'RECAUDACION_PEDIDOS',
              estado: 'PUBLICADO',
              fechaEvento: new Date(),
              fechaFin: null,
              lugarEntrega: null,
              rubro: null,
              rubroId: null,
              cuenta: null,
              cuentaId: null,
              creadoPor: { id: 1, nombre: 'Admin', apellido: 'Test' },
              items: [],
            },
          ]),
        },
        pedidoEvento: {
          groupBy: vi.fn().mockResolvedValue([
            {
              eventoId: 10,
              estado: 'PAGADO',
              _count: { id: 2 },
              _sum: { total: new Prisma.Decimal('12000.00'), totalGanancia: new Prisma.Decimal('4000.00') },
            },
            {
              eventoId: 10,
              estado: 'CANCELADO',
              _count: { id: 1 },
              _sum: { total: new Prisma.Decimal('6000.00'), totalGanancia: new Prisma.Decimal('2000.00') },
            },
          ]),
        },
      } as any;

      const serviceEventos = new TesoreriaService(mockPrismaEventos);
      const listaEventos = await serviceEventos.listarEventos(alcanceGlobal);

      expect(mockPrismaEventos.evento.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 200 }),
      );
      expect(listaEventos[0].metricas).toEqual({
        cantidadPedidos: 3,
        totalVenta: 12000,
        totalGanancia: 4000,
        totalTickets: 4,
        ticketsRetirados: 3,
        porcentajeRetirado: 75,
      });
    });
  });
});
