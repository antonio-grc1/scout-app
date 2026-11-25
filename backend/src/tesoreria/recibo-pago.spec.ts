import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { TesoreriaService } from './tesoreria.service.js';

describe('obtenerReciboPago', () => {
  it('alcance PROPIO: solo busca pagos propios o que imputan a sus cuotas', async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: 7 });
    const service = new TesoreriaService({ pago: { findFirst } } as any);

    await service.obtenerReciboPago({ tipo: 'PROPIO', usuarioId: 5 }, 7);

    expect(findFirst.mock.calls[0][0].where).toEqual({
      AND: [
        { id: 7 },
        {
          OR: [{ usuarioId: 5 }, { imputaciones: { some: { cargo: { usuarioId: 5 } } } }],
        },
      ],
    });
  });

  it('alcance GLOBAL: no agrega filtro de alcance', async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: 7 });
    const service = new TesoreriaService({ pago: { findFirst } } as any);

    await service.obtenerReciboPago({ tipo: 'GLOBAL' }, 7);

    expect(findFirst.mock.calls[0][0].where).toEqual({ AND: [{ id: 7 }] });
  });

  it('un pago fuera del alcance responde 404', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const service = new TesoreriaService({ pago: { findFirst } } as any);

    await expect(service.obtenerReciboPago({ tipo: 'PROPIO', usuarioId: 5 }, 99)).rejects.toThrow(
      NotFoundException,
    );
  });
});
