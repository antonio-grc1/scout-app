import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AlcanceAcceso, AuthUser } from '../common/types/auth.types.js';
import { MiembrosService } from './miembros.service.js';

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
