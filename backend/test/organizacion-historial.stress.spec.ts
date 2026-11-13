import { ForbiddenException } from '@nestjs/common';
import { TipoUnidad } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { OrganizacionController } from '../src/organizacion/organizacion.controller.js';
import { OrganizacionService } from '../src/organizacion/organizacion.service.js';

const crearMockPrisma = () => {
  const mock: any = {
    unidadOrganizativa: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(async (arg: any) => {
      if (typeof arg === 'function') return arg(mock);
      return Promise.all(arg);
    }),
  };
  return mock;
};

describe('Empirical Stress Harness: Organizacion Historial Unidad', () => {
  it('E1: Section with 0 assignments returns empty arrays, 0 counts, and does not throw', async () => {
    const prisma = crearMockPrisma();
    const service = new OrganizacionService(prisma);

    prisma.unidadOrganizativa.findUnique.mockResolvedValueOnce({
      id: 42,
      nombre: 'Comunidad Rover San Pablo',
      tipo: TipoUnidad.SECCION_RAMA,
      activa: true,
      ramaId: 4,
      rama: {
        id: 4,
        nombre: 'Rovers',
        edadMinima: 17,
        edadMaxima: 21,
        ordenProgresion: 4,
        activa: true,
      },
      asignaciones: [],
    });

    const res = await service.obtenerHistorialUnidad({ tipo: 'GLOBAL' }, 42);

    expect(res.id).toBe(42);
    expect(res.asignaciones).toEqual([]);
    expect(res.resumen).toEqual({
      ciclos: [],
      ciclosOperativos: [],
      totalCiclos: 0,
      totalAsignaciones: 0,
      totalEducadores: 0,
      totalEducadoresUnicos: 0,
      totalProtagonistas: 0,
      totalProtagonistasUnicos: 0,
      totalMiembros: 0,
    });
  });

  it('E2: Section with ramaId: null (JEFATURA) returns rama: null without runtime crash', async () => {
    const prisma = crearMockPrisma();
    const service = new OrganizacionService(prisma);

    prisma.unidadOrganizativa.findUnique.mockResolvedValueOnce({
      id: 99,
      nombre: 'Jefatura de Grupo General',
      tipo: TipoUnidad.JEFATURA,
      activa: true,
      ramaId: null,
      rama: null,
      asignaciones: [
        {
          id: 1,
          usuarioId: 50,
          rolId: 1,
          cicloAnio: 2026,
          fechaInicio: new Date('2026-02-01'),
          fechaFin: null,
          activo: true,
          usuario: {
            id: 50,
            nombre: 'Carlos',
            apellido: 'Jefe',
            dni: '20111222',
            activo: true,
          },
          rol: {
            id: 1,
            nombre: 'Jefe de Grupo',
            tipoMiembro: 'EDUCADOR',
          },
        },
      ],
    });

    const res = await service.obtenerHistorialUnidad({ tipo: 'GLOBAL' }, 99);

    expect(res.id).toBe(99);
    expect(res.ramaId).toBeNull();
    expect(res.rama).toBeNull();
    expect(res.asignaciones).toHaveLength(1);
    expect(res.resumen.totalEducadores).toBe(1);
  });

  it('E3: Inactive section (activa: false) returns full history and preserves inactive status', async () => {
    const prisma = crearMockPrisma();
    const service = new OrganizacionService(prisma);

    prisma.unidadOrganizativa.findUnique.mockResolvedValueOnce({
      id: 88,
      nombre: 'Tropa Antigua Desactivada',
      tipo: TipoUnidad.SECCION_RAMA,
      activa: false,
      ramaId: 2,
      rama: {
        id: 2,
        nombre: 'Scouts',
        edadMinima: 11,
        edadMaxima: 14,
        ordenProgresion: 2,
        activa: true,
      },
      asignaciones: [
        {
          id: 20,
          usuarioId: 30,
          rolId: 4,
          cicloAnio: 2022,
          fechaInicio: new Date('2022-03-01'),
          fechaFin: new Date('2022-12-15'),
          activo: false,
          usuario: {
            id: 30,
            nombre: 'Martín',
            apellido: 'Antiguo',
            dni: '30444555',
            activo: false,
          },
          rol: {
            id: 4,
            nombre: 'Scout',
            tipoMiembro: 'PROTAGONISTA',
          },
        },
      ],
    });

    const res = await service.obtenerHistorialUnidad({ tipo: 'GLOBAL' }, 88);

    expect(res.id).toBe(88);
    expect(res.activa).toBe(false);
    expect(res.asignaciones).toHaveLength(1);
    expect(res.resumen.totalProtagonistas).toBe(1);
    expect(res.resumen.ciclos).toEqual([2022]);
  });

  it('E4: Scope UNIDAD with IDs [1, 2] strictly returns 403 Forbidden for unit 3, and empty unitIds returns 403', async () => {
    const prisma = crearMockPrisma();
    const service = new OrganizacionService(prisma);

    // Unit 3 not in [1, 2]
    await expect(
      service.obtenerHistorialUnidad({ tipo: 'UNIDAD', unidadIds: [1, 2] }, 3),
    ).rejects.toThrow(ForbiddenException);

    // Empty list
    await expect(
      service.obtenerHistorialUnidad({ tipo: 'UNIDAD', unidadIds: [] }, 1),
    ).rejects.toThrow(ForbiddenException);

    // Database query should NEVER be called when scope check fails
    expect(prisma.unidadOrganizativa.findUnique).not.toHaveBeenCalled();
  });

  it('E5: Scope PROPIO strictly returns 403 Forbidden for any unit query', async () => {
    const prisma = crearMockPrisma();
    const service = new OrganizacionService(prisma);

    await expect(
      service.obtenerHistorialUnidad({ tipo: 'PROPIO', usuarioId: 77 }, 1),
    ).rejects.toThrow(ForbiddenException);

    await expect(
      service.obtenerHistorialUnidad({ tipo: 'PROPIO', usuarioId: 77 }, 2),
    ).rejects.toThrow(ForbiddenException);

    expect(prisma.unidadOrganizativa.findUnique).not.toHaveBeenCalled();
  });

  it('E6: Query enforces exact ordering [{ cicloAnio: "desc" }, { fechaInicio: "desc" }, { id: "desc" }] and cycles are sorted desc', async () => {
    const prisma = crearMockPrisma();
    const service = new OrganizacionService(prisma);

    prisma.unidadOrganizativa.findUnique.mockResolvedValueOnce({
      id: 5,
      nombre: 'Posta Caminantes',
      tipo: TipoUnidad.SECCION_RAMA,
      activa: true,
      ramaId: 3,
      rama: null,
      asignaciones: [
        {
          id: 105,
          usuarioId: 1,
          rolId: 1,
          cicloAnio: 2026,
          fechaInicio: new Date('2026-03-01'),
          fechaFin: null,
          activo: true,
          usuario: { id: 1, nombre: 'A', apellido: 'A', dni: '1', activo: true },
          rol: { id: 1, nombre: 'R', tipoMiembro: 'EDUCADOR' },
        },
        {
          id: 104,
          usuarioId: 2,
          rolId: 1,
          cicloAnio: 2025,
          fechaInicio: new Date('2025-05-01'),
          fechaFin: null,
          activo: false,
          usuario: { id: 2, nombre: 'B', apellido: 'B', dni: '2', activo: true },
          rol: { id: 1, nombre: 'R', tipoMiembro: 'EDUCADOR' },
        },
        {
          id: 103,
          usuarioId: 3,
          rolId: 1,
          cicloAnio: 2024,
          fechaInicio: new Date('2024-03-01'),
          fechaFin: null,
          activo: false,
          usuario: { id: 3, nombre: 'C', apellido: 'C', dni: '3', activo: true },
          rol: { id: 1, nombre: 'R', tipoMiembro: 'EDUCADOR' },
        },
      ],
    });

    const res = await service.obtenerHistorialUnidad({ tipo: 'GLOBAL' }, 5);

    // Verify Prisma findUnique was called with the exact expected orderBy clauses
    expect(prisma.unidadOrganizativa.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 5 },
        include: expect.objectContaining({
          asignaciones: expect.objectContaining({
            orderBy: [{ cicloAnio: 'desc' }, { fechaInicio: 'desc' }, { id: 'desc' }],
          }),
        }),
      }),
    );

    // Verify summary cycles are distinct and descending
    expect(res.resumen.ciclos).toEqual([2026, 2025, 2024]);
    expect(res.resumen.totalCiclos).toBe(3);
  });

  it('E7: miembro and usuario are both populated, have identical fields, and match the underlying user data', async () => {
    const prisma = crearMockPrisma();
    const service = new OrganizacionService(prisma);

    const userObj = {
      id: 55,
      nombre: 'Lucía',
      apellido: 'Fernández',
      dni: '40123456',
      activo: false, // User was deactivated
    };

    prisma.unidadOrganizativa.findUnique.mockResolvedValueOnce({
      id: 3,
      nombre: 'Comunidad Raider',
      tipo: TipoUnidad.SECCION_RAMA,
      activa: true,
      ramaId: 3,
      rama: null,
      asignaciones: [
        {
          id: 301,
          usuarioId: 55,
          rolId: 12,
          cicloAnio: 2023,
          fechaInicio: new Date('2023-03-01'),
          fechaFin: new Date('2023-11-30'),
          activo: false,
          usuario: userObj,
          rol: {
            id: 12,
            nombre: 'Raider',
            tipoMiembro: 'PROTAGONISTA',
          },
        },
      ],
    });

    const res = await service.obtenerHistorialUnidad({ tipo: 'GLOBAL' }, 3);

    const asignacion = res.asignaciones[0];
    expect(asignacion.miembro).toBeDefined();
    expect(asignacion.usuario).toBeDefined();
    expect(asignacion.miembro).toEqual(asignacion.usuario);
    expect(asignacion.miembro).toEqual({
      id: 55,
      nombre: 'Lucía',
      apellido: 'Fernández',
      dni: '40123456',
      activo: false,
    });
  });

  it('E8: Unique counter logic when a person transitions from PROTAGONISTA to EDUCADOR in the same section', async () => {
    const prisma = crearMockPrisma();
    const service = new OrganizacionService(prisma);

    const personId = 100;
    prisma.unidadOrganizativa.findUnique.mockResolvedValueOnce({
      id: 10,
      nombre: 'Sección Mixta',
      tipo: TipoUnidad.SECCION_RAMA,
      activa: true,
      ramaId: 2,
      rama: null,
      asignaciones: [
        {
          id: 501,
          usuarioId: personId,
          rolId: 10,
          cicloAnio: 2026,
          fechaInicio: new Date('2026-03-01'),
          fechaFin: null,
          activo: true,
          usuario: { id: personId, nombre: 'Marcos', apellido: 'Transicion', dni: '99', activo: true },
          rol: { id: 10, nombre: 'Educador', tipoMiembro: 'EDUCADOR' },
        },
        {
          id: 401,
          usuarioId: personId,
          rolId: 20,
          cicloAnio: 2024,
          fechaInicio: new Date('2024-03-01'),
          fechaFin: new Date('2024-12-01'),
          activo: false,
          usuario: { id: personId, nombre: 'Marcos', apellido: 'Transicion', dni: '99', activo: true },
          rol: { id: 20, nombre: 'Protagonista', tipoMiembro: 'PROTAGONISTA' },
        },
      ],
    });

    const res = await service.obtenerHistorialUnidad({ tipo: 'GLOBAL' }, 10);

    expect(res.resumen.totalAsignaciones).toBe(2);
    // Person was an educador
    expect(res.resumen.totalEducadores).toBe(1);
    // Person was a protagonista
    expect(res.resumen.totalProtagonistas).toBe(1);
    // Unique total persons is 1, not 2!
    expect(res.resumen.totalMiembros).toBe(1);
  });

  it('E9: Controller endpoint integration: delegates to service with parsed id and scope', async () => {
    const historialSpy = vi.fn().mockResolvedValue({ id: 1, nombre: 'Test' });
    const mockService = {
      obtenerHistorialUnidad: historialSpy,
    } as unknown as OrganizacionService;

    const controller = new OrganizacionController(mockService);
    const alcance = { tipo: 'GLOBAL' } as const;

    const result = await controller.obtenerHistorialUnidad(alcance, 12);

    expect(historialSpy).toHaveBeenCalledWith(alcance, 12);
    expect(result).toEqual({ id: 1, nombre: 'Test' });
  });
});
