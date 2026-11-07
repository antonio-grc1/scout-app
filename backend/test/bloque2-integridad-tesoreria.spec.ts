import { describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { EstadoCargo, TipoMovimientoFinanciero } from '@prisma/client';
import type { AlcanceAcceso, AuthUser } from '../src/common/types/auth.types.js';
import { TesoreriaService } from '../src/tesoreria/tesoreria.service.js';
import {
  RegistrarPagoSchema,
  AplicarSaldoAFavorSchema,
  CrearPedidoEventoSchema,
  ActualizarPedidoEventoSchema,
  CrearItemEventoSchema,
} from '../src/tesoreria/tesoreria.dto.js';
import { parsearFechaOperacion } from '../src/common/utils/fechas.util.js';

describe('BLOQUE 2 - Integridad Transaccional, Saldos, Stock, Fechas y Rendimiento en Tesorería', () => {
  const alcanceGlobal: AlcanceAcceso = { tipo: 'GLOBAL' };
  const actorGlobal: AuthUser = {
    sub: 1,
    dni: '12345678',
    email: 'admin@scout.org',
    roles: ['ADMINISTRADOR'],
    permisos: ['tesoreria.gestionar', 'cuotas.cobrar', 'cuotas.ver', 'eventos.gestionar', 'eventos.vender'],
    asignaciones: [{ unidadId: null, rolNombre: 'ADMINISTRADOR', permisos: ['tesoreria.gestionar', 'cuotas.cobrar', 'cuotas.ver', 'eventos.gestionar', 'eventos.vender'] }],
  };

  describe('ITEM-08: Preservación de cargos históricos PAGADO al sincronizar conceptos', () => {
    it('no elimina ni anula cargos en estado PAGADO si el miembro ya no es candidato', async () => {
      const mockTx: any = {
        cargoMiembro: {
          findMany: vi.fn().mockResolvedValue([
            { id: 101, usuarioId: 50, estado: EstadoCargo.PAGADO, montoOriginal: 5000, montoFinal: 5000 },
            { id: 102, usuarioId: 51, estado: EstadoCargo.PENDIENTE, montoOriginal: 5000, montoFinal: 5000 },
          ]),
          createMany: vi.fn().mockResolvedValue({ count: 0 }),
          update: vi.fn().mockResolvedValue({}),
          delete: vi.fn().mockResolvedValue({}),
        },
        usuario: {
          findMany: vi.fn().mockResolvedValue([]), // Ya no hay miembros candidatos (ej: se dio de baja)
        },
      };

      const mockPrisma = {
        conceptoCuota: {
          findUnique: vi.fn().mockResolvedValue({
            id: 1,
            monto: 5000,
            tipoConcepto: 'GENERAL',
            unidadId: null,
            subrogadoPorGrupo: false,
            aplicaBeca: false,
          }),
        },
        $transaction: vi.fn().mockImplementation((cb) => cb(mockTx)),
      } as any;

      const service = new TesoreriaService(mockPrisma);
      await (service as any).sincronizarCargosDeConceptoEnTx(mockTx, 1);

      // El cargo PAGADO no debe ser borrado
      expect(mockTx.cargoMiembro.delete).not.toHaveBeenCalledWith({ where: { id: 101 } });

      // El cargo PENDIENTE sí debe ser eliminado porque ya no es candidato
      expect(mockTx.cargoMiembro.delete).toHaveBeenCalledWith({ where: { id: 102 } });
    });
  });

  describe('ITEM-09: Control de Concurrencia y Deduplicación en Imputaciones y Saldo a Favor', () => {
    it('RegistrarPagoSchema rechaza cargos duplicados en las imputaciones', () => {
      const payloadInvalido = {
        usuarioId: 10,
        montoTotal: 1000,
        metodoPago: 'EFECTIVO',
        imputaciones: [
          { cargoId: 5, monto: 500 },
          { cargoId: 5, monto: 500 },
        ],
      };
      const result = RegistrarPagoSchema.safeParse(payloadInvalido);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('No se permiten cargos duplicados');
      }
    });

    it('AplicarSaldoAFavorSchema rechaza cargos duplicados en las imputaciones', () => {
      const payloadInvalido = {
        usuarioId: 10,
        imputaciones: [
          { cargoId: 7, monto: 300 },
          { cargoId: 7, monto: 200 },
        ],
      };
      const result = AplicarSaldoAFavorSchema.safeParse(payloadInvalido);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('No se permiten cargos duplicados');
      }
    });

    it('registrarPago falla atómicamente si saldoAFavor decrece concurrentemente (count === 0)', async () => {
      const mockTx = {
        usuario: {
          updateMany: vi.fn().mockResolvedValue({ count: 0 }), // Simula que otro proceso ya consumió el saldo
        },
        cargoMiembro: {
          findUnique: vi.fn().mockResolvedValue({ id: 1, usuarioId: 10, usuario: { id: 10, grupoFamiliarId: null } }),
        },
      };
      const mockPrisma = {
        usuario: {
          findUnique: vi.fn().mockResolvedValue({
            id: 10,
            saldoAFavor: '500.00',
            asignaciones: [],
          }),
        },
        $transaction: vi.fn().mockImplementation((cb) => cb(mockTx)),
      } as any;

      const service = new TesoreriaService(mockPrisma);
      await expect(
        service.registrarPago(actorGlobal, alcanceGlobal, {
          usuarioId: 10,
          montoTotal: 0,
          usarSaldoAFavor: true,
          montoSaldoAFavor: 500,
          metodoPago: 'OTRO',
          imputaciones: [{ cargoId: 1, monto: 500 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('ITEM-10: Condición de carrera y stock en pedidos de eventos', () => {
    it('CrearPedidoEventoSchema y ActualizarPedidoEventoSchema rechazan items duplicados', () => {
      const payloadDuplicado = {
        eventoId: 1,
        compradorNombre: 'Juan',
        items: [
          { itemId: 2, cantidad: 1 },
          { itemId: 2, cantidad: 3 },
        ],
      };
      expect(CrearPedidoEventoSchema.safeParse(payloadDuplicado).success).toBe(false);
      expect(ActualizarPedidoEventoSchema.safeParse(payloadDuplicado).success).toBe(false);
    });

    it('crearPedidoEvento rechaza la orden si el stock disponible fue consumido concurrentemente', async () => {
      const mockPrisma = {
        evento: {
          findUnique: vi.fn().mockResolvedValue({
            id: 1,
            titulo: 'Polenta Scout',
            estado: 'PUBLICADO',
            items: [
              { id: 10, nombre: 'Porción Polenta', precioVenta: '2000', gananciaUnitaria: '1000', stockDisponible: 2 },
            ],
          }),
        },
        $transaction: vi.fn().mockImplementation(async (cb) => {
          const tx = {
            pedidoEvento: { create: vi.fn().mockResolvedValue({ id: 1 }) },
            ticketEvento: { create: vi.fn().mockResolvedValue({ id: 1 }) },
            itemEvento: {
              updateMany: vi.fn().mockResolvedValue({ count: 0 }), // Stock no decrementado por falta de disponibilidad
            },
          };
          return cb(tx);
        }),
      } as any;

      const service = new TesoreriaService(mockPrisma);
      await expect(
        service.crearPedidoEvento(actorGlobal, alcanceGlobal, {
          eventoId: 1,
          compradorNombre: 'Comprador Concurrente',
          items: [{ itemId: 10, cantidad: 2 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('ITEM-11: Transaccionalidad en operaciones destructivas y validación de descuento', () => {
    it('generarCargoIndividual rechaza si montoDescuento es mayor que monto original', async () => {
      const mockPrisma = {
        usuario: {
          findUnique: vi.fn().mockResolvedValue({ id: 10, asignaciones: [] }),
        },
      } as any;
      const service = new TesoreriaService(mockPrisma);

      await expect(
        service.generarCargoIndividual(actorGlobal, alcanceGlobal, {
          usuarioId: 10,
          conceptoNombre: 'Uniforme',
          monto: 5000,
          montoDescuento: 6000,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('ITEM-12: gananciaUnitaria en eventos económicos', () => {
    it('CrearItemEventoSchema permite no enviar gananciaUnitaria sin forzar default(0)', () => {
      const itemParsed = CrearItemEventoSchema.parse({
        nombre: 'Hamburguesa',
        precioVenta: 4000,
        costoUnitario: 2500,
      });
      // No debe ser 0 por defecto, debe quedar undefined para calcular precio - costo
      expect(itemParsed.gananciaUnitaria).toBeUndefined();
    });
  });

  describe('ITEM-25: Protección contra saldos negativos de CuentaFinanciera y validación de cuenta activa', () => {
    it('revertirPago rechaza reversión si la cuenta financiera asociada quedaría con saldo negativo', async () => {
      const mockPrisma = {
        pago: {
          findUnique: vi.fn().mockResolvedValue({
            id: 99,
            montoTotal: '10000.00',
            imputaciones: [],
          }),
        },
        $transaction: vi.fn().mockImplementation(async (cb) => {
          const tx = {
            cargoMiembro: { findUnique: vi.fn() },
            pagoImputacion: { deleteMany: vi.fn() },
            movimientoFinanciero: {
              findMany: vi.fn().mockResolvedValue([
                { id: 1, montoIngreso: '10000.00', cuentaId: 1, cuenta: { id: 1, nombre: 'Caja Chica', activa: true } },
              ]),
              aggregate: vi.fn().mockResolvedValue({
                _sum: { montoIngreso: '10000.00', montoEgreso: '8000.00' }, // Saldo actual = $2000, insuficiente para devolver $10000
              }),
            },
          };
          return cb(tx);
        }),
      } as any;

      const service = new TesoreriaService(mockPrisma);
      await expect(service.revertirPago(actorGlobal, alcanceGlobal, 99)).rejects.toThrow(BadRequestException);
    });

    it('eliminarIngreso rechaza si la cuenta financiera quedaría con saldo negativo', async () => {
      const mockPrisma = {
        movimientoFinanciero: {
          findUnique: vi.fn().mockResolvedValue({
            id: 15,
            tipo: TipoMovimientoFinanciero.INGRESO_OTRO,
            montoIngreso: '50000.00',
            cuentaId: 2,
            cuenta: { id: 2, nombre: 'Banco Santander', activa: true },
          }),
          aggregate: vi.fn().mockResolvedValue({
            _sum: { montoIngreso: '50000.00', montoEgreso: '45000.00' }, // Saldo actual = $5000, insuficiente para revertir $50000
          }),
        },
      } as any;

      const service = new TesoreriaService(mockPrisma);
      await expect(service.eliminarIngreso(actorGlobal, alcanceGlobal, 15)).rejects.toThrow(BadRequestException);
    });

    it('crearEvento rechaza cuentaId si la cuenta se encuentra inactiva', async () => {
      const mockPrisma = {
        cuentaFinanciera: {
          findUnique: vi.fn().mockResolvedValue({ id: 3, nombre: 'Caja Vieja', activa: false }),
        },
      } as any;

      const service = new TesoreriaService(mockPrisma);
      await expect(
        service.crearEvento(actorGlobal, alcanceGlobal, {
          titulo: 'Rifa Anual',
          fechaEvento: '2026-10-10',
          cuentaId: 3,
          items: [{ nombre: 'Numero Rifa', precioVenta: 1000 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('ITEM-26: Cargos con 100% de descuento pasan automáticamente a PAGADO', () => {
    it('generarCargoIndividual marca el cargo como PAGADO cuando montoDescuento cubre el total', async () => {
      let cargoCreadoData: any = null;
      const mockPrisma = {
        usuario: {
          findUnique: vi.fn().mockResolvedValue({ id: 10, asignaciones: [] }),
        },
        $transaction: vi.fn().mockImplementation(async (cb) => {
          const tx = {
            conceptoCuota: {
              create: vi.fn().mockResolvedValue({ id: 50, nombre: 'Beca Total' }),
            },
            cargoMiembro: {
              create: vi.fn().mockImplementation(({ data }) => {
                cargoCreadoData = data;
                return Promise.resolve({ id: 1, ...data });
              }),
            },
          };
          return cb(tx);
        }),
      } as any;

      const service = new TesoreriaService(mockPrisma);
      await service.generarCargoIndividual(actorGlobal, alcanceGlobal, {
        usuarioId: 10,
        conceptoNombre: 'Beca Campamento',
        monto: 15000,
        montoDescuento: 15000, // 100% descuento
      });

      expect(cargoCreadoData).toBeDefined();
      expect(Number(cargoCreadoData.montoFinal)).toBe(0);
      expect(cargoCreadoData.estado).toBe(EstadoCargo.PAGADO);
    });
  });

  describe('ITEM-27: Manejo de meses cortos y GMT-3 en fechas', () => {
    it('parsearFechaOperacion parsea fechas YYYY-MM-DD en huso horario GMT-3', () => {
      const date = parsearFechaOperacion('2026-05-15');
      // Representa el mediodía en Argentina (12:00:00-03:00 = 15:00:00.000Z en UTC)
      expect(date.toISOString()).toBe('2026-05-15T15:00:00.000Z');
    });

    it('sincronizarMesDePlanEnTx no desborda al mes siguiente en febrero para diaVencimiento 31', async () => {
      let conceptoCreado: any = null;
      const mockTx = {
        conceptoCuota: {
          findFirst: vi.fn().mockResolvedValue(null),
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockImplementation(({ data }) => {
            conceptoCreado = data;
            return Promise.resolve({ id: 2, ...data });
          }),
        },
        cargoMiembro: {
          findMany: vi.fn().mockResolvedValue([]),
          createMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        usuario: {
          findMany: vi.fn().mockResolvedValue([
            { id: 1, asignaciones: [{ unidadId: 1 }], becado: false, grupoFamiliarId: null },
          ]),
        },
      };

      const planMock = {
        id: 1,
        nombre: 'Cuotas 2026',
        cicloAnio: 2026,
        diaVencimiento: 31, // Día 31
        montoBase: 5000,
        unidadId: null,
      };

      const service = new TesoreriaService({} as any);
      // Mes 2 (Febrero de 2026 tiene 28 días)
      await (service as any).sincronizarMesDePlanEnTx(mockTx, planMock, 2);

      expect(conceptoCreado).toBeDefined();
      const fechaVenc = new Date(conceptoCreado.fechaVencimiento);
      // Debe quedar en el mes de febrero (mes index 1), no pasar a marzo
      expect(fechaVenc.getUTCMonth()).toBe(1); // Febrero (0-indexed)
      expect(fechaVenc.getUTCDate()).toBe(28); // Clamped al último día de febrero
    });
  });
});
