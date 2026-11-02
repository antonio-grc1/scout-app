import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AlcanceAcceso, AuthUser } from '../common/types/auth.types.js';
import { MIEMBRO_SELECT, MiembrosService } from './miembros.service.js';

describe('MiembrosService - Permisos Granulares por Campo', () => {
  const crearMockPrisma = () => {
    const mock: any = {
      usuario: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        findUniqueOrThrow: vi.fn(),
        update: vi.fn(),
      },
      $transaction: vi.fn(async (cb: any) => cb(mock)),
    };
    return mock;
  };

  const usuarioObjetivo = {
    id: 10,
    dni: '30111222',
    nombre: 'Juan',
    apellido: 'Pérez',
    fechaNacimiento: new Date('2010-05-15T00:00:00.000Z'),
    emailContacto: 'juan@test.com',
    telefonoContacto: '11223344',
    activo: true,
    datosFijosJson: { domicilio: 'Calle 123' },
    asignaciones: [{ unidadId: 1, rolId: 1, activo: true, rol: { alcancePorDefecto: 'UNIDAD' } }],
  };

  const alcanceGlobal: AlcanceAcceso = { tipo: 'GLOBAL' };

  it('rechaza modificación de identidad (nombre, dni, fecha) si no tiene miembros.editar_identidad', async () => {
    const prisma = crearMockPrisma();
    prisma.usuario.findFirst.mockResolvedValue(usuarioObjetivo);

    const service = new MiembrosService(prisma);
    const actor: AuthUser = {
      sub: 99,
      dni: '99999999',
      nombre: 'Educador',
      apellido: 'Sin Identidad',
      asignaciones: [
        {
          unidadId: 1,
          unidadNombre: 'Scout',
          rol: 'Educador',
          alcance: 'GLOBAL',
          permisos: ['miembros.ver', 'miembros.editar'], // carece de miembros.editar_identidad
        },
      ],
    };

    await expect(
      service.editar(actor, alcanceGlobal, 10, {
        nombre: 'Nuevo Nombre',
      }),
    ).rejects.toThrow(/No tiene permiso para modificar: nombre/);
  });

  it('permite modificar identidad si el actor tiene miembros.editar_identidad', async () => {
    const prisma = crearMockPrisma();
    prisma.usuario.findFirst.mockResolvedValueOnce(usuarioObjetivo);
    prisma.usuario.update.mockResolvedValueOnce({ ...usuarioObjetivo, nombre: 'Juan Carlos' });

    const service = new MiembrosService(prisma);
    const actor: AuthUser = {
      sub: 99,
      dni: '99999999',
      nombre: 'Jefe',
      apellido: 'Grupo',
      asignaciones: [
        {
          unidadId: 1,
          unidadNombre: 'Jefatura',
          rol: 'Jefe',
          alcance: 'GLOBAL',
          permisos: ['miembros.ver', 'miembros.editar', 'miembros.editar_identidad'],
        },
      ],
    };

    const res = await service.editar(actor, alcanceGlobal, 10, {
      nombre: 'Juan Carlos',
    });

    expect(prisma.usuario.update).toHaveBeenCalled();
    expect(res.nombre).toBe('Juan Carlos');
  });

  it('permite a un usuario con permiso miembros.editar_identidad cambiar el nombre de un miembro de su unidad sin error 403', async () => {
    const prisma = crearMockPrisma();
    prisma.usuario.findFirst.mockResolvedValueOnce(usuarioObjetivo);
    prisma.usuario.update.mockResolvedValueOnce({ ...usuarioObjetivo, nombre: 'Juan Modificado' });

    const service = new MiembrosService(prisma);
    const actorEducadorUnidad: AuthUser = {
      sub: 88,
      dni: '88888888',
      nombre: 'Educador',
      apellido: 'Rama',
      asignaciones: [
        {
          unidadId: 1,
          unidadNombre: 'Manada',
          rol: 'Dirigente',
          alcance: 'UNIDAD',
          permisos: ['miembros.ver', 'miembros.editar', 'miembros.editar_identidad'],
        },
      ],
    };

    const alcanceUnidad: AlcanceAcceso = {
      tipo: 'UNIDAD',
      unidadId: 1,
      unidadIds: [1],
    };

    const res = await service.editar(actorEducadorUnidad, alcanceUnidad, 10, {
      nombre: 'Juan Modificado',
    });

    expect(prisma.usuario.update).toHaveBeenCalled();
    expect(res.nombre).toBe('Juan Modificado');
  });

  it('no exige miembros.editar_identidad si el DNI o nombre enviado es idéntico al actual', async () => {
    const prisma = crearMockPrisma();
    prisma.usuario.findFirst.mockResolvedValueOnce(usuarioObjetivo);
    prisma.usuario.update.mockResolvedValueOnce({ ...usuarioObjetivo, telefonoContacto: '99887766' });

    const service = new MiembrosService(prisma);
    const actor: AuthUser = {
      sub: 99,
      dni: '99999999',
      nombre: 'Educador',
      apellido: 'Rama',
      asignaciones: [
        {
          unidadId: 1,
          unidadNombre: 'Scout',
          rol: 'Educador',
          alcance: 'GLOBAL',
          permisos: ['miembros.ver', 'miembros.editar'], // no tiene miembros.editar_identidad
        },
      ],
    };

    // Envía nombre idéntico pero cambia teléfono
    const res = await service.editar(actor, alcanceGlobal, 10, {
      nombre: 'Juan',
      telefonoContacto: '99887766',
    });

    expect(prisma.usuario.update).toHaveBeenCalled();
    expect(res.telefonoContacto).toBe('99887766');
  });

  it('rechaza cambio de activo (baja) si no tiene miembros.baja', async () => {
    const prisma = crearMockPrisma();
    prisma.usuario.findFirst.mockResolvedValue(usuarioObjetivo);

    const service = new MiembrosService(prisma);
    const actor: AuthUser = {
      sub: 99,
      dni: '99999999',
      nombre: 'Educador',
      apellido: 'Rama',
      asignaciones: [
        {
          unidadId: 1,
          unidadNombre: 'Scout',
          rol: 'Educador',
          alcance: 'GLOBAL',
          permisos: ['miembros.ver', 'miembros.editar'], // carece de miembros.baja
        },
      ],
    };

    await expect(
      service.editar(actor, alcanceGlobal, 10, {
        activo: false,
      }),
    ).rejects.toThrow(/No tiene permiso para modificar: activo/);
  });

  it('permite cambio de estado activo (baja o reactivación) con miembros.baja', async () => {
    const prisma = crearMockPrisma();
    prisma.usuario.findFirst.mockResolvedValueOnce(usuarioObjetivo);
    prisma.usuario.update.mockResolvedValueOnce({ ...usuarioObjetivo, activo: false });

    const service = new MiembrosService(prisma);
    const actor: AuthUser = {
      sub: 99,
      dni: '99999999',
      nombre: 'Secretario',
      apellido: 'Grupo',
      asignaciones: [
        {
          unidadId: 1,
          unidadNombre: 'Jefatura',
          rol: 'Secretario',
          alcance: 'GLOBAL',
          permisos: ['miembros.ver', 'miembros.baja'],
        },
      ],
    };

    const res = await service.editar(actor, alcanceGlobal, 10, {
      activo: false,
    });

    expect(prisma.usuario.update).toHaveBeenCalled();
    expect(res.activo).toBe(false);
  });

  it('verifica que el último administrador activo no pueda darse de baja a sí mismo (Anti-Lockout)', async () => {
    const prisma = crearMockPrisma();
    const adminObjetivo = {
      ...usuarioObjetivo,
      id: 1,
      asignaciones: [
        {
          id: 10,
          unidadId: 1,
          rolId: 1,
          activo: true,
          alcanceOverride: null,
          rol: {
            alcancePorDefecto: 'GLOBAL',
            permisos: [{ permiso: { clave: 'organizacion.gestionar' } }],
          },
        },
      ],
    };
    prisma.usuario.findFirst.mockResolvedValueOnce(adminObjetivo);
    prisma.asignacionMiembro = {
      findMany: vi.fn().mockResolvedValue([]),
    };

    const service = new MiembrosService(prisma);
    const actor: AuthUser = {
      sub: 1,
      dni: '11111111',
      nombre: 'Admin',
      apellido: 'Global',
      asignaciones: [
        {
          unidadId: 1,
          unidadNombre: 'Jefatura',
          rol: 'Admin',
          alcance: 'GLOBAL',
          permisos: ['miembros.ver', 'miembros.baja', 'organizacion.gestionar'],
        },
      ],
    };

    await expect(
      service.editar(actor, alcanceGlobal, 1, {
        activo: false,
      }),
    ).rejects.toThrow(/último administrador global activo/);
  });

  it('impide cerrar la asignación del último administrador global activo (Anti-Lockout)', async () => {
    const prisma = crearMockPrisma();
    prisma.asignacionMiembro = {
      findFirst: vi.fn().mockResolvedValueOnce({
        id: 10,
        usuarioId: 1,
        unidadId: 1,
        activo: true,
        alcanceOverride: null,
        rol: {
          alcancePorDefecto: 'GLOBAL',
          permisos: [{ permiso: { clave: 'organizacion.gestionar' } }],
        },
      }),
      findMany: vi.fn().mockResolvedValue([]),
    };

    const service = new MiembrosService(prisma);
    const actor: AuthUser = {
      sub: 1,
      dni: '11111111',
      nombre: 'Admin',
      apellido: 'Global',
      asignaciones: [
        {
          unidadId: 1,
          unidadNombre: 'Jefatura',
          rol: 'Admin',
          alcance: 'GLOBAL',
          permisos: ['miembros.ver', 'miembros.editar', 'organizacion.gestionar'],
        },
      ],
    };

    await expect(service.cerrarAsignacion(actor, alcanceGlobal, 1, 10)).rejects.toThrow(
      /último administrador global activo/,
    );
  });
});

describe('MiembrosService - Trayectoria y MIEMBRO_SELECT', () => {
  it('la proyección MIEMBRO_SELECT no filtra asignaciones inactivas y ordena activos primero', () => {
    const asigSelect = MIEMBRO_SELECT.asignaciones;
    expect(asigSelect).toBeDefined();

    // No debe contener where: { activo: true } ni ningún filtro excluyente de asignaciones históricas
    expect((asigSelect as any).where).toBeUndefined();

    // Debe ordenar con activos primero, luego fechaInicio desc, y desempate por id desc
    expect((asigSelect as any).orderBy).toEqual([
      { activo: 'desc' },
      { fechaInicio: 'desc' },
      { id: 'desc' },
    ]);

    // Debe incluir fechaFin y activo en asignación
    expect((asigSelect as any).select.fechaFin).toBe(true);
    expect((asigSelect as any).select.activo).toBe(true);
    expect((asigSelect as any).select.cicloAnio).toBe(true);
    expect((asigSelect as any).select.fechaInicio).toBe(true);

    // Debe incluir activa en unidad y rama para advertencias de secciones/ramas inactivas
    expect((asigSelect as any).select.unidad.select.activa).toBe(true);
    expect((asigSelect as any).select.unidad.select.rama.select.activa).toBe(true);
  });

  it('obtener() invoca findFirst con MIEMBRO_SELECT y retorna trayectoria completa con asignaciones activas e inactivas', async () => {
    const mockPrisma: any = {
      usuario: {
        findFirst: vi.fn(),
      },
    };

    const miembroMock = {
      id: 5,
      nombre: 'Lucía',
      apellido: 'Gómez',
      asignaciones: [
        {
          id: 102,
          unidadId: 3,
          rolId: 2,
          cicloAnio: 2025,
          fechaInicio: new Date('2025-03-01'),
          fechaFin: null,
          activo: true,
          alcanceOverride: null,
          unidad: {
            id: 3,
            nombre: 'Comunidad Rover',
            tipo: 'ROVER',
            activa: true,
            ramaId: 4,
            rama: { id: 4, nombre: 'Rover', ordenProgresion: 4, edadMinima: 17, edadMaxima: 21, activa: true },
          },
          rol: { id: 2, nombre: 'Beneficiario', alcancePorDefecto: 'UNIDAD', tipoMiembro: 'JOVEN', requiereRama: true },
        },
        {
          id: 85,
          unidadId: 2,
          rolId: 2,
          cicloAnio: 2023,
          fechaInicio: new Date('2023-03-01'),
          fechaFin: new Date('2024-12-15'),
          activo: false,
          alcanceOverride: null,
          unidad: {
            id: 2,
            nombre: 'Comunidad Caminantes',
            tipo: 'CAMINANTES',
            activa: true,
            ramaId: 3,
            rama: { id: 3, nombre: 'Caminantes', ordenProgresion: 3, edadMinima: 14, edadMaxima: 17, activa: true },
          },
          rol: { id: 2, nombre: 'Beneficiario', alcancePorDefecto: 'UNIDAD', tipoMiembro: 'JOVEN', requiereRama: true },
        },
      ],
    };

    mockPrisma.usuario.findFirst.mockResolvedValue(miembroMock);
    const service = new MiembrosService(mockPrisma);

    const alcance: AlcanceAcceso = { tipo: 'GLOBAL' };
    const resultado = await service.obtener(alcance, 5);

    expect(mockPrisma.usuario.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        AND: expect.arrayContaining([{ id: 5 }]),
      }),
      select: MIEMBRO_SELECT,
    });
    expect(resultado).toEqual(miembroMock);
    expect(resultado.asignaciones).toHaveLength(2);
    expect(resultado.asignaciones[0].activo).toBe(true);
    expect(resultado.asignaciones[1].activo).toBe(false);
    expect(resultado.asignaciones[1].fechaFin).toBeDefined();
  });

  it('obtener() respeta alcance y lanza NotFoundException si el miembro no está en el alcance del usuario', async () => {
    const mockPrisma: any = {
      usuario: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };
    const service = new MiembrosService(mockPrisma);
    const alcanceUnidad: AlcanceAcceso = { tipo: 'UNIDAD', unidadId: 99, unidadIds: [99] };

    await expect(service.obtener(alcanceUnidad, 5)).rejects.toThrow(NotFoundException);
  });
});

