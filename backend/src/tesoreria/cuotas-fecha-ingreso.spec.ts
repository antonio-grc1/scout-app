import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { mesInicioCuotas } from '../common/utils/fechas.util.js';
import { TesoreriaService } from './tesoreria.service.js';

const fecha = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('mesInicioCuotas', () => {
  it('sin fecha de ingreso cobra desde enero', () => {
    expect(mesInicioCuotas(null, 2027)).toBe(1);
  });
  it('ingreso en un año anterior al ciclo cobra desde enero', () => {
    expect(mesInicioCuotas(fecha('2025-08-20'), 2027)).toBe(1);
  });
  it('ingreso dentro del ciclo cobra desde ese mes', () => {
    expect(mesInicioCuotas(fecha('2027-06-30'), 2027)).toBe(6);
  });
  it('ingreso posterior al ciclo no cobra ningún mes', () => {
    expect(mesInicioCuotas(fecha('2028-01-05'), 2027)).toBeNull();
  });
});

describe('sincronizarCargosDeConceptoEnTx con fecha de ingreso', () => {
  const crearTx = (usuarios: any[], cargosExistentes: any[] = []) => ({
    usuario: { findMany: vi.fn().mockResolvedValue(usuarios) },
    cargoMiembro: {
      findMany: vi.fn().mockResolvedValue(cargosExistentes),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      update: vi.fn(),
      delete: vi.fn(),
    },
  });

  const cuotaMensual = (mes: number) => ({
    id: 10 + mes,
    planCuotaMensualId: 1,
    mes,
    cicloAnio: 2027,
    montoBase: new Prisma.Decimal(10000),
    destinatarioTipo: 'TODOS',
    permiteDescuentoHermanos: false,
    porcentajeDescuentoHermanos: null,
    excepciones: [],
  });

  const usuarios = [
    { id: 1, fechaIngreso: null, grupoFamiliar: null },
    { id: 2, fechaIngreso: fecha('2026-03-01'), grupoFamiliar: null },
    { id: 3, fechaIngreso: fecha('2027-06-15'), grupoFamiliar: null },
  ];

  const idsCreados = (tx: ReturnType<typeof crearTx>) =>
    (tx.cargoMiembro.createMany.mock.calls[0]?.[0]?.data ?? []).map((c: any) => c.usuarioId);

  it('no crea la cuota de un mes anterior al ingreso', async () => {
    const service = new TesoreriaService({} as any);
    const tx = crearTx(usuarios);
    await service.cuotas.sincronizarCargosDeConceptoEnTx(tx as any, cuotaMensual(3));
    expect(idsCreados(tx)).toEqual([1, 2]);
  });

  it('crea la cuota del mes de ingreso y los siguientes', async () => {
    const service = new TesoreriaService({} as any);
    const tx = crearTx(usuarios);
    await service.cuotas.sincronizarCargosDeConceptoEnTx(tx as any, cuotaMensual(6));
    expect(idsCreados(tx)).toEqual([1, 2, 3]);
  });

  it('no borra ni modifica una cuota ya existente de un mes anterior al ingreso', async () => {
    const service = new TesoreriaService({} as any);
    const existente = {
      id: 99,
      usuarioId: 3,
      conceptoId: 13,
      estado: 'PENDIENTE',
      montoOriginal: new Prisma.Decimal(10000),
      montoDescuento: new Prisma.Decimal(0),
      montoFinal: new Prisma.Decimal(10000),
      montoPagado: new Prisma.Decimal(0),
    };
    const tx = crearTx(usuarios, [existente]);
    await service.cuotas.sincronizarCargosDeConceptoEnTx(tx as any, cuotaMensual(3));
    expect(tx.cargoMiembro.delete).not.toHaveBeenCalled();
    expect(tx.cargoMiembro.update).not.toHaveBeenCalled();
    expect(idsCreados(tx)).toEqual([1, 2]);
  });

  it('los conceptos que no son cuota mensual se asignan sin importar la fecha de ingreso', async () => {
    const service = new TesoreriaService({} as any);
    const tx = crearTx(usuarios);
    await service.cuotas.sincronizarCargosDeConceptoEnTx(tx as any, {
      ...cuotaMensual(3),
      planCuotaMensualId: null,
      mes: null,
    });
    expect(idsCreados(tx)).toEqual([1, 2, 3]);
  });
});
