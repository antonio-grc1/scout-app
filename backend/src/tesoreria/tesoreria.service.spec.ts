import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AlcanceAcceso } from '../common/types/auth.types.js';
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

    expect(res).toEqual({ id: 1, nombre: 'Cuota Modificada', montoBase: '20000.00' });
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
