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
      findFirst: vi.fn(),
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
    usuario: { id: 100, activo: true, fechaNacimiento: new Date('2015-01-01') },
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

  it('asigna automáticamente Educador Sin Rama al pasar a SIN_RAMA_APOYO sin especificar rol', async () => {
    const origenRover = {
      ...mockOrigen,
      usuario: { id: 100, activo: true, fechaNacimiento: new Date('2004-01-01') },
    };
    mockTx.asignacionMiembro.findUnique.mockResolvedValueOnce(origenRover);
    mockTx.unidadOrganizativa.findUnique.mockResolvedValueOnce({
      id: 7,
      nombre: 'Educadores Sin Rama / Apoyo',
      tipo: TipoUnidad.SIN_RAMA_APOYO,
      activa: true,
    });
    mockTx.rol.findFirst.mockResolvedValueOnce({
      id: 4,
      nombre: 'Educador Sin Rama',
      tipoMiembro: 'EDUCADOR',
      requiereRama: false,
      alcancePorDefecto: AlcanceRol.GLOBAL,
    });
    mockTx.asignacionMiembro.updateMany.mockResolvedValueOnce({ count: 1 });
    mockTx.asignacionMiembro.create.mockResolvedValueOnce({
      id: 12,
      usuarioId: 100,
      unidadId: 7,
      rolId: 4,
      unidad: { id: 7, nombre: 'Educadores Sin Rama / Apoyo' },
      rol: { id: 4, nombre: 'Educador Sin Rama' },
    });

    const resultado = await service.ejecutar({ tipo: 'GLOBAL' }, {
      asignacionOrigenId: 10,
      unidadDestinoId: 7,
    });

    expect(resultado).toBeDefined();
    expect(mockTx.rol.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tipoMiembro: 'EDUCADOR',
          requiereRama: false,
        }),
      }),
    );
    expect(resultado.asignacionNueva.rolId).toBe(4);
  });

  it('asigna automáticamente Educador de Rama al pasar un Rover egresado a una sección de rama sin rol especificado', async () => {
    const origenRover = {
      ...mockOrigen,
      usuario: { id: 100, activo: true, fechaNacimiento: new Date('2004-01-01') },
    };
    mockTx.asignacionMiembro.findUnique.mockResolvedValueOnce(origenRover);
    mockTx.unidadOrganizativa.findUnique.mockResolvedValueOnce({
      id: 1,
      nombre: 'Rama Lobatos',
      tipo: TipoUnidad.SECCION_RAMA,
      activa: true,
    });
    mockTx.rol.findFirst.mockResolvedValueOnce({
      id: 2,
      nombre: 'Educador de Rama',
      tipoMiembro: 'EDUCADOR',
      requiereRama: true,
      alcancePorDefecto: AlcanceRol.UNIDAD,
    });
    mockTx.asignacionMiembro.updateMany.mockResolvedValueOnce({ count: 1 });
    mockTx.asignacionMiembro.create.mockResolvedValueOnce({
      id: 13,
      usuarioId: 100,
      unidadId: 1,
      rolId: 2,
      unidad: { id: 1, nombre: 'Rama Lobatos' },
      rol: { id: 2, nombre: 'Educador de Rama' },
    });

    const resultado = await service.ejecutar({ tipo: 'GLOBAL' }, {
      asignacionOrigenId: 10,
      unidadDestinoId: 1,
    });

    expect(resultado).toBeDefined();
    expect(resultado.asignacionNueva.rolId).toBe(2);
  });

  it('candidatos incluye secciones de rama y sin rama para un pase de egreso (Rover >= 22 años)', async () => {
    mockPrisma.rama = {
      findMany: vi.fn().mockResolvedValue([
        { id: 1, nombre: 'Lobatos', ordenProgresion: 1, edadMinima: 7, edadMaxima: 9 },
        { id: 4, nombre: 'Rover', ordenProgresion: 4, edadMinima: 18, edadMaxima: 21 },
      ]),
    };
    mockPrisma.unidadOrganizativa = {
      findMany: vi.fn().mockResolvedValue([
        { id: 1, nombre: 'Manada Roca de la Paz', tipo: TipoUnidad.SECCION_RAMA, ramaId: 1 },
        { id: 5, nombre: 'Comunidad Rover', tipo: TipoUnidad.SECCION_RAMA, ramaId: 4 },
        { id: 7, nombre: 'Equipo de Apoyo', tipo: TipoUnidad.SIN_RAMA_APOYO, ramaId: null },
      ]),
    };
    mockPrisma.asignacionMiembro = {
      findMany: vi.fn().mockResolvedValue([
        {
          id: 50,
          unidadId: 5,
          activo: true,
          rol: { id: 1, nombre: 'Protagonista', tipoMiembro: 'PROTAGONISTA' },
          unidad: {
            id: 5,
            nombre: 'Comunidad Rover',
            tipo: TipoUnidad.SECCION_RAMA,
            rama: { id: 4, nombre: 'Rover', edadMinima: 18, edadMaxima: 21, ordenProgresion: 4 },
          },
          usuario: {
            id: 200,
            dni: '44000111',
            nombre: 'Juan',
            apellido: 'Pérez',
            fechaNacimiento: new Date('2004-01-01'),
            activo: true,
          },
        },
      ]),
    };

    const candidatos = await service.candidatos({ tipo: 'GLOBAL' }, {});
    expect(candidatos).toHaveLength(1);
    expect(candidatos[0].tipo).toBe('EGRESO');
    const unidadesIds = candidatos[0].unidadesDestino.map((u: any) => u.id);
    expect(unidadesIds).toContain(7); // Equipo de Apoyo
    expect(unidadesIds).toContain(1); // Manada Roca de la Paz
    expect(unidadesIds).toContain(5); // Comunidad Rover
  });
});
