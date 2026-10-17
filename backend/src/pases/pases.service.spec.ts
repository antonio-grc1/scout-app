import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { TipoUnidad, AlcanceRol } from '@prisma/client';
import { PasesService } from './pases.service.js';

describe('PasesService - Validaciones de Rama y Rol', () => {
  const mockTx = {
    asignacionMiembro: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
    unidadOrganizativa: {
      findUnique: vi.fn(),
    },
    rol: {
      findUnique: vi.fn(),
    },
  };

  const mockPrisma = {
    $transaction: vi.fn(async (cb: any) => cb(mockTx)),
  } as any;

  const service = new PasesService(mockPrisma);

  const mockOrigen = {
    id: 10,
    usuarioId: 100,
    unidadId: 2,
    rolId: 1,
    activo: true,
    alcanceOverride: null,
    rol: { id: 1, nombre: 'Protagonista', alcancePorDefecto: AlcanceRol.PROPIO },
    usuario: { id: 100, activo: true },
  };

  it('rechaza si se intenta asignar Jefe de Grupo o Educador Sin Rama a una sección de rama', async () => {
    mockTx.asignacionMiembro.findUnique.mockResolvedValueOnce(mockOrigen);
    mockTx.unidadOrganizativa.findUnique.mockResolvedValueOnce({
      id: 3,
      nombre: 'Rama Caminantes',
      tipo: TipoUnidad.SECCION_RAMA,
      activa: true,
    });
    mockTx.rol.findUnique.mockResolvedValueOnce({
      id: 4,
      nombre: 'Educador Sin Rama',
      alcancePorDefecto: AlcanceRol.GLOBAL,
    });

    await expect(
      service.ejecutar({ tipo: 'GLOBAL' }, {
        asignacionOrigenId: 10,
        unidadDestinoId: 3,
        rolDestinoId: 4,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rechaza si un Educador de Unidad (alcance UNIDAD) intenta otorgar Jefe de Grupo', async () => {
    mockTx.asignacionMiembro.findUnique.mockResolvedValueOnce(mockOrigen);
    mockTx.unidadOrganizativa.findUnique.mockResolvedValueOnce({
      id: 6,
      nombre: 'Jefatura de Grupo',
      tipo: TipoUnidad.JEFATURA,
      activa: true,
    });
    mockTx.rol.findUnique.mockResolvedValueOnce({
      id: 3,
      nombre: 'Jefe de Grupo',
      alcancePorDefecto: AlcanceRol.GLOBAL,
    });

    await expect(
      service.ejecutar({ tipo: 'UNIDAD', unidadIds: [2] }, {
        asignacionOrigenId: 10,
        unidadDestinoId: 6,
        rolDestinoId: 3,
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('permite que un Educador de Unidad ejecute el pase entre ramas con rol Protagonista', async () => {
    mockTx.asignacionMiembro.findUnique.mockResolvedValueOnce(mockOrigen);
    mockTx.unidadOrganizativa.findUnique.mockResolvedValueOnce({
      id: 3,
      nombre: 'Rama Caminantes',
      tipo: TipoUnidad.SECCION_RAMA,
      activa: true,
    });
    mockTx.rol.findUnique.mockResolvedValueOnce({
      id: 1,
      nombre: 'Protagonista',
      alcancePorDefecto: AlcanceRol.PROPIO,
    });
    mockTx.asignacionMiembro.updateMany.mockResolvedValueOnce({ count: 1 });
    mockTx.asignacionMiembro.create.mockResolvedValueOnce({
      id: 11,
      usuarioId: 100,
      unidadId: 3,
      rolId: 1,
      unidad: { id: 3, nombre: 'Rama Caminantes' },
      rol: { id: 1, nombre: 'Protagonista' },
    });

    const resultado = await service.ejecutar({ tipo: 'UNIDAD', unidadIds: [2] }, {
      asignacionOrigenId: 10,
      unidadDestinoId: 3,
      rolDestinoId: 1,
    });

    expect(resultado).toBeDefined();
    expect(resultado.usuarioId).toBe(100);
    expect(resultado.asignacionNueva.unidadId).toBe(3);
  });
});
