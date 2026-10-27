import { BadRequestException, ConflictException } from '@nestjs/common';
import { AlcanceRol } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { OrganizacionService } from './organizacion.service.js';

describe('OrganizacionService - Roles Dinámicos y Anti-Lockout', () => {
  const crearMockPrisma = () => {
    const mock: any = {
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
        delete: vi.fn(),
      },
      $transaction: vi.fn(async (arg: any) => {
        if (typeof arg === 'function') return arg(mock);
        return Promise.all(arg);
      }),
    };
    return mock;
  };

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

  it('elimina una sección operativa sin miembros activos limpiando historial huérfano', async () => {
    const prisma = crearMockPrisma();
    const service = new OrganizacionService(prisma);

    prisma.unidadOrganizativa.findUnique.mockResolvedValueOnce({
      id: 10,
      nombre: 'Manada Impeesa',
      _count: { asignaciones: 1, conceptos: 0, planesCuota: 0 },
    });
    prisma.asignacionMiembro.count.mockResolvedValueOnce(0);
    prisma.asignacionMiembro.deleteMany.mockResolvedValueOnce({ count: 1 });
    prisma.unidadOrganizativa.delete.mockResolvedValueOnce({ id: 10 });

    const res = await service.eliminarUnidad({ tipo: 'GLOBAL' }, 10);
    expect(res.eliminada).toBe(true);
    expect(prisma.unidadOrganizativa.delete).toHaveBeenCalledWith({ where: { id: 10 } });
  });
});
