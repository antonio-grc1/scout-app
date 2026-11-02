import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AlcanceRol, TipoUnidad } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { OrganizacionService } from './organizacion.service.js';

const crearMockPrisma = () => {
  const mock: any = {
    rama: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    rol: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    permiso: {
      findMany: vi.fn(),
    },
    rolPermiso: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    asignacionMiembro: {
      count: vi.fn(),
      deleteMany: vi.fn(),
    },
    unidadOrganizativa: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(async (arg: any) => {
      if (typeof arg === 'function') return arg(mock);
      return Promise.all(arg);
    }),
  };
  return mock;
};

describe('OrganizacionService - Roles Dinámicos y Anti-Lockout', () => {

  it('permite renombrar cualquier rol y actualizar tipoMiembro y requiereRama', async () => {
    const prisma = crearMockPrisma();
    const service = new OrganizacionService(prisma);

    const rolActual = {
      id: 2,
      nombre: 'Educador de Rama',
      alcancePorDefecto: AlcanceRol.UNIDAD,
      tipoMiembro: 'EDUCADOR',
      requiereRama: true,
      esSistema: true,
      _count: { asignaciones: 3 },
      permisos: [{ permiso: { clave: 'miembros.ver' } }],
    };

    prisma.rol.findUnique.mockResolvedValueOnce(rolActual);
    prisma.permiso.findMany.mockResolvedValueOnce([{ id: 10, clave: 'miembros.ver' }]);
    prisma.rol.update.mockResolvedValueOnce({
      ...rolActual,
      nombre: 'Dirigente de Sección',
      requiereRama: true,
    });

    const res = await service.editarRol({ tipo: 'GLOBAL' }, 2, {
      nombre: 'Dirigente de Sección',
      permisos: ['miembros.ver'],
    });

    expect(res.nombre).toBe('Dirigente de Sección');
    expect(res.tipoMiembro).toBe('EDUCADOR');
  });

  it('bloquea quitar permisos de administración al último rol administrador del sistema (Anti-Lockout)', async () => {
    const prisma = crearMockPrisma();
    const service = new OrganizacionService(prisma);

    const unicoAdmin = {
      id: 1,
      nombre: 'Coordinador General',
      alcancePorDefecto: AlcanceRol.GLOBAL,
      tipoMiembro: 'EDUCADOR',
      requiereRama: false,
      esSistema: false,
      _count: { asignaciones: 1 },
      permisos: [
        { permiso: { clave: 'organizacion.ver' } },
        { permiso: { clave: 'organizacion.gestionar' } },
      ],
    };

    prisma.rol.findUnique.mockResolvedValueOnce(unicoAdmin);
    prisma.rol.findMany.mockResolvedValueOnce([unicoAdmin]);

    await expect(
      service.editarRol({ tipo: 'GLOBAL' }, 1, {
        permisos: ['organizacion.ver'], // intenta quitar organizacion.gestionar
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('impide eliminar un rol que tiene personas activas asignadas e informa quiénes son', async () => {
    const prisma = crearMockPrisma();
    const service = new OrganizacionService(prisma);

    prisma.rol.findUnique.mockResolvedValueOnce({
      id: 5,
      nombre: 'Tesorero',
      alcancePorDefecto: AlcanceRol.GLOBAL,
      tipoMiembro: 'EDUCADOR',
      requiereRama: false,
      esSistema: false,
      _count: { asignaciones: 2 },
      permisos: [{ permiso: { clave: 'cuotas.cobrar' } }],
      asignaciones: [
        { usuario: { nombre: 'Ana', apellido: 'Gómez' } },
        { usuario: { nombre: 'Luis', apellido: 'Pérez' } },
      ],
    });

    await expect(service.eliminarRol({ tipo: 'GLOBAL' }, 5)).rejects.toThrow(ConflictException);
  });
});

describe('OrganizacionService - eliminarRama', () => {
  it('rechaza con ForbiddenException si el alcance no es GLOBAL', async () => {
    const prisma = crearMockPrisma();
    const service = new OrganizacionService(prisma);

    await expect(
      service.eliminarRama({ tipo: 'UNIDAD', unidadIds: [1] }, 1),
    ).rejects.toThrow(ForbiddenException);

    await expect(
      service.eliminarRama({ tipo: 'PROPIO', usuarioId: 10 }, 1),
    ).rejects.toThrow(ForbiddenException);

    expect(prisma.rama.findUnique).not.toHaveBeenCalled();
  });

  it('rechaza con NotFoundException si la rama no existe', async () => {
    const prisma = crearMockPrisma();
    const service = new OrganizacionService(prisma);

    prisma.rama.findUnique.mockResolvedValueOnce(null);

    await expect(
      service.eliminarRama({ tipo: 'GLOBAL' }, 999),
    ).rejects.toThrow(NotFoundException);

    expect(prisma.rama.findUnique).toHaveBeenCalledWith({
      where: { id: 999 },
      include: {
        unidades: {
          include: {
            _count: {
              select: {
                asignaciones: true,
                conceptos: true,
                planesCuota: true,
              },
            },
          },
        },
      },
    });
  });

  it('por defecto (definitivo = false) ejecuta borrado lógico desactivando rama y sus secciones', async () => {
    const prisma = crearMockPrisma();
    const service = new OrganizacionService(prisma);

    prisma.rama.findUnique.mockResolvedValueOnce({
      id: 1,
      nombre: 'Manada',
      unidades: [
        { id: 10, activa: true },
        { id: 11, activa: true },
      ],
    });
    prisma.unidadOrganizativa.updateMany.mockResolvedValueOnce({ count: 2 });
    prisma.rama.update.mockResolvedValueOnce({ id: 1, activa: false });

    const res = await service.eliminarRama({ tipo: 'GLOBAL' }, 1);
    expect(res.desactivada).toBe(true);
    expect(res.eliminada).toBe(false);
    expect(res.mensaje).toBe('Rama "Manada" desactivada.');
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.unidadOrganizativa.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [10, 11] } },
      data: { activa: false },
    });
    expect(prisma.rama.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { activa: false },
    });
  });

  it('por defecto (definitivo = false) desactiva rama sin unidades hijas', async () => {
    const prisma = crearMockPrisma();
    const service = new OrganizacionService(prisma);

    prisma.rama.findUnique.mockResolvedValueOnce({
      id: 2,
      nombre: 'Rover',
      unidades: [],
    });
    prisma.rama.update.mockResolvedValueOnce({ id: 2, activa: false });

    const res = await service.eliminarRama({ tipo: 'GLOBAL' }, 2, false);
    expect(res.desactivada).toBe(true);
    expect(res.eliminada).toBe(false);
    expect(res.mensaje).toBe('Rama "Rover" desactivada.');
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.unidadOrganizativa.updateMany).not.toHaveBeenCalled();
    expect(prisma.rama.update).toHaveBeenCalledWith({
      where: { id: 2 },
      data: { activa: false },
    });
  });

  it('borrado definitivo rechaza con ConflictException si sus unidades poseen registros asociados', async () => {
    const prisma = crearMockPrisma();
    const service = new OrganizacionService(prisma);

    prisma.rama.findUnique.mockResolvedValueOnce({
      id: 1,
      nombre: 'Scouts',
      unidades: [
        { id: 10, _count: { asignaciones: 2, conceptos: 1, planesCuota: 0 } },
        { id: 11, _count: { asignaciones: 0, conceptos: 0, planesCuota: 0 } },
      ],
    });

    await expect(
      service.eliminarRama({ tipo: 'GLOBAL' }, 1, true),
    ).rejects.toThrow(ConflictException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('borrado definitivo elimina físicamente rama y unidades si tiene 0 historial', async () => {
    const prisma = crearMockPrisma();
    const service = new OrganizacionService(prisma);

    prisma.rama.findUnique.mockResolvedValueOnce({
      id: 1,
      nombre: 'Caminantes',
      unidades: [
        { id: 20, _count: { asignaciones: 0, conceptos: 0, planesCuota: 0 } },
      ],
    });
    prisma.unidadOrganizativa.deleteMany.mockResolvedValueOnce({ count: 1 });
    prisma.rama.delete.mockResolvedValueOnce({ id: 1 });

    const res = await service.eliminarRama({ tipo: 'GLOBAL' }, 1, true);
    expect(res.eliminada).toBe(true);
    expect(res.desactivada).toBe(false);
    expect(res.mensaje).toBe('Rama "Caminantes" eliminada definitivamente.');
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.unidadOrganizativa.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: [20] } },
    });
    expect(prisma.rama.delete).toHaveBeenCalledWith({ where: { id: 1 } });
  });

  it('borrado definitivo de rama sin unidades hijas elimina físicamente solo la rama', async () => {
    const prisma = crearMockPrisma();
    const service = new OrganizacionService(prisma);

    prisma.rama.findUnique.mockResolvedValueOnce({
      id: 2,
      nombre: 'Rama Huérfana',
      unidades: [],
    });
    prisma.rama.delete.mockResolvedValueOnce({ id: 2 });

    const res = await service.eliminarRama({ tipo: 'GLOBAL' }, 2, true);
    expect(res.eliminada).toBe(true);
    expect(res.desactivada).toBe(false);
    expect(res.mensaje).toBe('Rama "Rama Huérfana" eliminada definitivamente.');
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.unidadOrganizativa.deleteMany).not.toHaveBeenCalled();
    expect(prisma.rama.delete).toHaveBeenCalledWith({ where: { id: 2 } });
  });
});

describe('OrganizacionService - eliminarUnidad', () => {
  it('rechaza con ForbiddenException si el alcance no es GLOBAL', async () => {
    const prisma = crearMockPrisma();
    const service = new OrganizacionService(prisma);

    await expect(
      service.eliminarUnidad({ tipo: 'UNIDAD', unidadIds: [1] }, 10),
    ).rejects.toThrow(ForbiddenException);

    await expect(
      service.eliminarUnidad({ tipo: 'PROPIO', usuarioId: 10 }, 10),
    ).rejects.toThrow(ForbiddenException);

    expect(prisma.unidadOrganizativa.findUnique).not.toHaveBeenCalled();
  });

  it('rechaza con NotFoundException si la unidad no existe', async () => {
    const prisma = crearMockPrisma();
    const service = new OrganizacionService(prisma);

    prisma.unidadOrganizativa.findUnique.mockResolvedValueOnce(null);

    await expect(
      service.eliminarUnidad({ tipo: 'GLOBAL' }, 999),
    ).rejects.toThrow(NotFoundException);

    expect(prisma.unidadOrganizativa.findUnique).toHaveBeenCalledWith({
      where: { id: 999 },
      include: {
        _count: {
          select: {
            asignaciones: true,
            conceptos: true,
            planesCuota: true,
          },
        },
      },
    });
  });

  it('por defecto (definitivo = false) ejecuta borrado lógico (soft-delete activa=false)', async () => {
    const prisma = crearMockPrisma();
    const service = new OrganizacionService(prisma);

    prisma.unidadOrganizativa.findUnique.mockResolvedValueOnce({
      id: 10,
      nombre: 'Manada Impeesa',
      _count: { asignaciones: 1, conceptos: 0, planesCuota: 0 },
    });
    prisma.unidadOrganizativa.update.mockResolvedValueOnce({ id: 10, activa: false });

    const res = await service.eliminarUnidad({ tipo: 'GLOBAL' }, 10);
    expect(res.desactivada).toBe(true);
    expect(res.eliminada).toBe(false);
    expect(res.mensaje).toBe('Sección "Manada Impeesa" desactivada.');
    expect(prisma.unidadOrganizativa.update).toHaveBeenCalledWith({ where: { id: 10 }, data: { activa: false } });
  });

  it('borrado definitivo rechaza con ConflictException si tiene dependencias asociadas', async () => {
    const prisma = crearMockPrisma();
    const service = new OrganizacionService(prisma);

    prisma.unidadOrganizativa.findUnique.mockResolvedValueOnce({
      id: 10,
      nombre: 'Manada Impeesa',
      _count: { asignaciones: 3, conceptos: 0, planesCuota: 0 },
    });

    await expect(service.eliminarUnidad({ tipo: 'GLOBAL' }, 10, true)).rejects.toThrow(ConflictException);
    expect(prisma.unidadOrganizativa.delete).not.toHaveBeenCalled();
  });

  it('borrado definitivo elimina físicamente solo si tiene 0 dependencias', async () => {
    const prisma = crearMockPrisma();
    const service = new OrganizacionService(prisma);

    prisma.unidadOrganizativa.findUnique.mockResolvedValueOnce({
      id: 10,
      nombre: 'Manada Impeesa',
      _count: { asignaciones: 0, conceptos: 0, planesCuota: 0 },
    });
    prisma.unidadOrganizativa.delete.mockResolvedValueOnce({ id: 10 });

    const res = await service.eliminarUnidad({ tipo: 'GLOBAL' }, 10, true);
    expect(res.eliminada).toBe(true);
    expect(res.desactivada).toBe(false);
    expect(res.mensaje).toBe('Sección "Manada Impeesa" eliminada definitivamente.');
    expect(prisma.unidadOrganizativa.delete).toHaveBeenCalledWith({ where: { id: 10 } });
  });
});

describe('OrganizacionService - obtenerHistorialUnidad', () => {
  it('retorna historial completo y resumen de sección con alcance GLOBAL', async () => {
    const prisma = crearMockPrisma();
    const service = new OrganizacionService(prisma);

    const unidadMock = {
      id: 1,
      nombre: 'Manada Impeesa',
      tipo: TipoUnidad.SECCION_RAMA,
      activa: true,
      ramaId: 1,
      rama: {
        id: 1,
        nombre: 'Lobatos y Lobeznas',
        edadMinima: 7,
        edadMaxima: 11,
        ordenProgresion: 1,
        activa: true,
      },
      asignaciones: [
        {
          id: 101,
          usuarioId: 10,
          rolId: 2,
          cicloAnio: 2026,
          fechaInicio: new Date('2026-03-01'),
          fechaFin: null,
          activo: true,
          usuario: {
            id: 10,
            nombre: 'Juan',
            apellido: 'Pérez',
            dni: '12345678',
            activo: true,
          },
          rol: {
            id: 2,
            nombre: 'Educador de Manada',
            tipoMiembro: 'EDUCADOR',
          },
        },
        {
          id: 102,
          usuarioId: 11,
          rolId: 3,
          cicloAnio: 2026,
          fechaInicio: new Date('2026-03-05'),
          fechaFin: null,
          activo: true,
          usuario: {
            id: 11,
            nombre: 'Sofía',
            apellido: 'García',
            dni: '45678901',
            activo: true,
          },
          rol: {
            id: 3,
            nombre: 'Lobezna',
            tipoMiembro: 'PROTAGONISTA',
          },
        },
        {
          id: 95,
          usuarioId: 10,
          rolId: 2,
          cicloAnio: 2025,
          fechaInicio: new Date('2025-03-01'),
          fechaFin: new Date('2025-12-15'),
          activo: false,
          usuario: {
            id: 10,
            nombre: 'Juan',
            apellido: 'Pérez',
            dni: '12345678',
            activo: true,
          },
          rol: {
            id: 2,
            nombre: 'Educador de Manada',
            tipoMiembro: 'EDUCADOR',
          },
        },
      ],
    };

    prisma.unidadOrganizativa.findUnique.mockResolvedValueOnce(unidadMock);

    const res = await service.obtenerHistorialUnidad({ tipo: 'GLOBAL' }, 1);

    expect(prisma.unidadOrganizativa.findUnique).toHaveBeenCalledWith({
      where: { id: 1 },
      include: {
        rama: {
          select: {
            id: true,
            nombre: true,
            edadMinima: true,
            edadMaxima: true,
            ordenProgresion: true,
            activa: true,
          },
        },
        asignaciones: {
          orderBy: [{ cicloAnio: 'desc' }, { fechaInicio: 'desc' }, { id: 'desc' }],
          include: {
            usuario: {
              select: {
                id: true,
                nombre: true,
                apellido: true,
                dni: true,
                activo: true,
              },
            },
            rol: {
              select: {
                id: true,
                nombre: true,
                tipoMiembro: true,
              },
            },
          },
        },
      },
    });

    expect(res.id).toBe(1);
    expect(res.nombre).toBe('Manada Impeesa');
    expect(res.activa).toBe(true);
    expect(res.rama?.nombre).toBe('Lobatos y Lobeznas');
    expect(res.asignaciones).toHaveLength(3);

    // Verifica que cada asignación tenga tanto miembro como usuario
    expect(res.asignaciones[0].miembro.nombre).toBe('Juan');
    expect(res.asignaciones[0].usuario.nombre).toBe('Juan');
    expect(res.asignaciones[0].rol.nombre).toBe('Educador de Manada');

    // Verifica el resumen de métricas
    expect(res.resumen).toEqual({
      ciclos: [2026, 2025],
      ciclosOperativos: [2026, 2025],
      totalCiclos: 2,
      totalAsignaciones: 3,
      totalEducadores: 1, // Juan Pérez es el único educador único
      totalEducadoresUnicos: 1,
      totalProtagonistas: 1, // Sofía García
      totalProtagonistasUnicos: 1,
      totalMiembros: 2, // Juan y Sofía
    });
  });

  it('permite acceso si la unidad se encuentra en el alcance UNIDAD', async () => {
    const prisma = crearMockPrisma();
    const service = new OrganizacionService(prisma);

    const unidadMock = {
      id: 2,
      nombre: 'Unidad Scout',
      tipo: TipoUnidad.SECCION_RAMA,
      activa: true,
      ramaId: 2,
      rama: { id: 2, nombre: 'Scouts', edadMinima: 11, edadMaxima: 14, ordenProgresion: 2, activa: true },
      asignaciones: [],
    };
    prisma.unidadOrganizativa.findUnique.mockResolvedValueOnce(unidadMock);

    const res = await service.obtenerHistorialUnidad({ tipo: 'UNIDAD', unidadIds: [2, 5] }, 2);
    expect(res.id).toBe(2);
    expect(res.nombre).toBe('Unidad Scout');
    expect(prisma.unidadOrganizativa.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 2 } }),
    );
  });

  it('rechaza con ForbiddenException si la unidad está fuera del alcance UNIDAD', async () => {
    const prisma = crearMockPrisma();
    const service = new OrganizacionService(prisma);

    await expect(
      service.obtenerHistorialUnidad({ tipo: 'UNIDAD', unidadIds: [1, 2] }, 5),
    ).rejects.toThrow(ForbiddenException);

    expect(prisma.unidadOrganizativa.findUnique).not.toHaveBeenCalled();
  });

  it('rechaza con ForbiddenException si el alcance es PROPIO', async () => {
    const prisma = crearMockPrisma();
    const service = new OrganizacionService(prisma);

    await expect(
      service.obtenerHistorialUnidad({ tipo: 'PROPIO', usuarioId: 10 }, 1),
    ).rejects.toThrow(ForbiddenException);

    expect(prisma.unidadOrganizativa.findUnique).not.toHaveBeenCalled();
  });

  it('rechaza con NotFoundException si la unidad no existe en base de datos', async () => {
    const prisma = crearMockPrisma();
    const service = new OrganizacionService(prisma);

    prisma.unidadOrganizativa.findUnique.mockResolvedValueOnce(null);

    await expect(
      service.obtenerHistorialUnidad({ tipo: 'GLOBAL' }, 999),
    ).rejects.toThrow(NotFoundException);
  });

  it('soporta sección inactiva (activa: false) y sección sin rama (ramaId: null, rama: null)', async () => {
    const prisma = crearMockPrisma();
    const service = new OrganizacionService(prisma);

    const unidadInactivaSinRama = {
      id: 7,
      nombre: 'Jefatura de Grupo',
      tipo: TipoUnidad.JEFATURA,
      activa: false,
      ramaId: null,
      rama: null,
      asignaciones: [],
    };

    prisma.unidadOrganizativa.findUnique.mockResolvedValueOnce(unidadInactivaSinRama);

    const res = await service.obtenerHistorialUnidad({ tipo: 'GLOBAL' }, 7);

    expect(res.id).toBe(7);
    expect(res.activa).toBe(false);
    expect(res.ramaId).toBeNull();
    expect(res.rama).toBeNull();
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
});
