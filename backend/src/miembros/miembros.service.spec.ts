import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { TipoUnidad } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import type { AlcanceAcceso, AuthUser } from '../common/types/auth.types.js';
import { ActualizarMiPerfilSchema } from './miembros.dto.js';
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

  it('P1-3: educador de una sola unidad no puede cambiar identidad ni dar de baja a miembro multi-unidad', async () => {
    const mockPrisma: any = {
      usuario: {
        findFirst: vi.fn().mockResolvedValue({
          id: 25,
          dni: '44000111',
          nombre: 'Multi',
          apellido: 'Rama',
          fechaNacimiento: new Date('2008-01-01T00:00:00.000Z'),
          activo: true,
          asignaciones: [
            { unidadId: 1, rolId: 1, activo: true, rol: { alcancePorDefecto: 'UNIDAD' } },
            { unidadId: 2, rolId: 2, activo: true, rol: { alcancePorDefecto: 'UNIDAD' } },
          ],
        }),
      },
    };
    const service = new MiembrosService(mockPrisma);
    const actor: AuthUser = {
      sub: 50,
      dni: '33000111',
      asignaciones: [
        { unidadId: 1, unidadNombre: 'U1', rol: 'Educador', alcance: 'UNIDAD', permisos: ['miembros.editar_identidad', 'miembros.baja'] },
      ],
    };
    const alcanceUnidad: AlcanceAcceso = { tipo: 'UNIDAD', unidadIds: [1], usuarioIdPropio: 50 };

    await expect(service.editar(actor, alcanceUnidad, 25, { nombre: 'Otro' })).rejects.toThrow(ForbiddenException);
    await expect(service.editar(actor, alcanceUnidad, 25, { activo: false })).rejects.toThrow(ForbiddenException);
  });

  it('P1-4: buscarHermanosPorCriterio filtra por unidad para alcance UNIDAD', async () => {
    const mockPrisma: any = {
      usuario: { findMany: vi.fn().mockResolvedValue([]) },
      plantillaFormulario: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const service = new MiembrosService(mockPrisma);
    const alcanceUnidad: AlcanceAcceso = { tipo: 'UNIDAD', unidadIds: [3], usuarioIdPropio: 10 };

    await service.buscarHermanosPorCriterio(alcanceUnidad, 'Perez');

    expect(mockPrisma.usuario.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            { activo: true },
            {
              OR: [
                { asignaciones: { some: { activo: true, unidadId: { in: [3] } } } },
                { id: 10 },
              ],
            },
          ],
        },
      }),
    );
  });

  it('P2: ActualizarMiPerfilSchema rechaza campos administrativos y acepta contacto propio', () => {
    expect(ActualizarMiPerfilSchema.safeParse({ dni: '99999999' }).success).toBe(false);
    expect(ActualizarMiPerfilSchema.safeParse({ activo: false }).success).toBe(false);
    expect(
      ActualizarMiPerfilSchema.safeParse({
        emailContacto: 'nuevo@test.com',
        telefonoContacto: '1155556666',
        datosFijosJson: { domicilio: 'Av. Siempre Viva 742' },
      }).success,
    ).toBe(true);
  });

  it('P2: actualizarMiPerfil sanitiza claves de prototipo en JSON y usa lock transaccional', async () => {
    const mockPrisma: any = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      usuario: {
        findUnique: vi.fn().mockResolvedValue({ id: 7, datosFijosJson: { domicilio: 'Viejo' } }),
        update: vi.fn().mockResolvedValue({ id: 7 }),
      },
      $transaction: vi.fn(async (cb: any) => cb(mockPrisma)),
    };
    const service = new MiembrosService(mockPrisma);

    const payload = JSON.parse('{"telefono_urgencias":"123","__proto__":{"admin":true},"nested":{"constructor":"x","ok":1}}');
    await service.actualizarMiPerfil(7, { datosFijosJson: payload });

    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    const updateArg = mockPrisma.usuario.update.mock.calls[0][0].data.datosFijosJson;
    expect(updateArg).toEqual({
      domicilio: 'Viejo',
      telefono_urgencias: '123',
      nested: { ok: 1 },
    });
    expect(Object.prototype.hasOwnProperty.call(updateArg, '__proto__')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(updateArg.nested, 'constructor')).toBe(false);
  });

  it('P2: cerrarAsignacion lanza ConflictException si otra operación la cerró concurrentemente', async () => {
    const mockPrisma: any = {
      asignacionMiembro: {
        findFirst: vi.fn().mockResolvedValue({
          id: 50,
          usuarioId: 10,
          unidadId: 1,
          alcanceOverride: null,
          rol: { alcancePorDefecto: 'UNIDAD', permisos: [] },
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      $transaction: vi.fn(async (cb: any) => cb(mockPrisma)),
    };
    const service = new MiembrosService(mockPrisma);
    const actor: AuthUser = { sub: 1, dni: '100', asignaciones: [] };

    await expect(service.cerrarAsignacion(actor, { tipo: 'GLOBAL' }, 10, 50)).rejects.toThrow(ConflictException);
  });

  it('P2: resolverYValidarUnidadYRol impide asignar rol sin rama a una SECCION_RAMA y viceversa', async () => {
    const mockPrisma: any = {
      rol: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({ id: 1, alcancePorDefecto: 'UNIDAD', requiereRama: false })
          .mockResolvedValueOnce({ id: 2, alcancePorDefecto: 'PROPIO', requiereRama: true }),
      },
      unidadOrganizativa: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({ id: 10, activa: true, tipo: TipoUnidad.SECCION_RAMA })
          .mockResolvedValueOnce({ id: 20, activa: true, tipo: TipoUnidad.JEFATURA }),
      },
    };
    const service = new MiembrosService(mockPrisma);

    await expect(
      service.agregarAsignacion({ tipo: 'GLOBAL' }, 5, { rolId: 1, unidadId: 10 }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.agregarAsignacion({ tipo: 'GLOBAL' }, 5, { rolId: 2, unidadId: 20 }),
    ).rejects.toThrow(BadRequestException);
  });

  it('P1-20: listar con búsqueda q hidrata MIEMBRO_SELECT solo para los IDs paginados', async () => {
    const mockPrisma: any = {
      usuario: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([
            { id: 1, nombre: 'Juan', apellido: 'Pérez', dni: '100', grupoFamiliar: null },
            { id: 2, nombre: 'María', apellido: 'López', dni: '200', grupoFamiliar: null },
            { id: 3, nombre: 'Pedro', apellido: 'Pérez', dni: '300', grupoFamiliar: null },
          ])
          .mockResolvedValueOnce([
            { id: 3, nombre: 'Pedro', apellido: 'Pérez' },
          ]),
      },
    };
    const service = new MiembrosService(mockPrisma);

    const res = await service.listar({ tipo: 'GLOBAL' }, { q: 'perez', pagina: 2, porPagina: 1 });
    expect(res.total).toBe(2);
    expect(res.items.map((i: any) => i.id)).toEqual([3]);
    expect(mockPrisma.usuario.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { id: { in: [3] } },
        select: MIEMBRO_SELECT,
      }),
    );
  });

  it('P1-20: buscarHermanosPorCriterio usa proyección liviana primero e hidrata solo coincidencias', async () => {
    const mockPrisma: any = {
      usuario: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([
            { id: 1, dni: '100', nombre: 'Juan', apellido: 'Pérez', grupoFamiliar: null },
            { id: 2, dni: '200', nombre: 'María', apellido: 'López', grupoFamiliar: null },
          ])
          .mockResolvedValueOnce([
            {
              id: 1,
              dni: '100',
              nombre: 'Juan',
              apellido: 'Pérez',
              emailContacto: null,
              telefonoContacto: null,
              datosFijosJson: { domicilio: 'Av. Siempreviva 123', medico: 'Oculto' },
              grupoFamiliar: null,
              asignaciones: [],
            },
          ]),
      },
      plantillaFormulario: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    const service = new MiembrosService(mockPrisma);

    const res = await service.buscarHermanosPorCriterio({ tipo: 'GLOBAL' }, 'perez');
    expect(res).toHaveLength(1);
    expect(res[0].id).toBe(1);
    expect(mockPrisma.usuario.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        select: expect.not.objectContaining({ datosFijosJson: true }),
      }),
    );
    expect(mockPrisma.usuario.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { id: { in: [1] } },
      }),
    );
  });

  it('P1-6 & P1-20: ListarMiembrosSchema limita porPagina <= 200 y parsea ids; crear genera claveTemporal != dni', async () => {
    const { ListarMiembrosSchema } = await import('./miembros.dto.js');
    expect(ListarMiembrosSchema.safeParse({ porPagina: 2000 }).success).toBe(false);
    const parsed = ListarMiembrosSchema.parse({ ids: '3, 7, 3, invalid', porPagina: 200 });
    expect(parsed.ids).toEqual([3, 7]);
    expect(parsed.porPagina).toBe(200);

    const mailerMock = { enviarBienvenidaAlta: vi.fn().mockResolvedValue(true) };
    const txUsuarioCreate = vi.fn().mockResolvedValue({ id: 91 });
    const mockPrisma: any = {
      rol: { findUnique: vi.fn().mockResolvedValue({ id: 2, requiereRama: true }) },
      unidadOrganizativa: { findUnique: vi.fn().mockResolvedValue({ id: 1, activa: true, tipo: TipoUnidad.SECCION_RAMA }) },
      $transaction: vi.fn((cb: any) =>
        cb({
          usuario: { create: txUsuarioCreate },
        }),
      ),
      usuario: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: 91,
          dni: '44555666',
          nombre: 'Lucia',
          apellido: 'Scout',
          emailContacto: 'familia@scout.test',
          asignaciones: [{ unidad: { nombre: 'Manada' }, rol: { nombre: 'Protagonista' } }],
        }),
      },
    };
    const service = new MiembrosService(mockPrisma, undefined, mailerMock as any);

    const res = await service.crear({ tipo: 'GLOBAL' }, {
      dni: '44555666',
      nombre: 'Lucia',
      apellido: 'Scout',
      fechaNacimiento: '2014-05-10',
      unidadId: 1,
      rolId: 2,
    });
    expect(res.claveTemporal).toBeDefined();
    expect(res.claveTemporal).not.toBe('44555666');
    expect(res.claveTemporal.length).toBeGreaterThanOrEqual(8);
    expect(mailerMock.enviarBienvenidaAlta).toHaveBeenCalledWith(
      expect.objectContaining({
        dni: '44555666',
        claveTemporal: res.claveTemporal,
      }),
    );
  });

  it('P1-20: listar y buscarHermanosPorCriterio usan SQL unaccent/ILIKE paginado cuando $queryRaw está disponible', async () => {
    const queryRaw = vi
      .fn()
      // listar: count + ids
      .mockResolvedValueOnce([{ total: 1 }])
      .mockResolvedValueOnce([{ id: 42 }])
      // buscarHermanosPorCriterio: top 15 ids
      .mockResolvedValueOnce([{ id: 42 }]);

    const mockPrisma: any = {
      $queryRaw: queryRaw,
      usuario: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([{ id: 42, nombre: 'José', apellido: 'Pérez', dni: '30111222' }])
          .mockResolvedValueOnce([
            {
              id: 42,
              dni: '30111222',
              nombre: 'José',
              apellido: 'Pérez',
              emailContacto: null,
              telefonoContacto: null,
              datosFijosJson: {},
              grupoFamiliar: null,
              asignaciones: [],
            },
          ]),
      },
      plantillaFormulario: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    const service = new MiembrosService(mockPrisma);

    const listado = await service.listar(
      { tipo: 'GLOBAL' },
      { pagina: 1, porPagina: 10, q: 'jose perez' },
    );
    expect(listado.total).toBe(1);
    expect(listado.items).toHaveLength(1);
    expect(listado.items[0].id).toBe(42);
    expect(mockPrisma.usuario.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ where: { id: { in: [42] } } }),
    );

    const hermanos = await service.buscarHermanosPorCriterio({ tipo: 'GLOBAL' }, 'perez');
    expect(hermanos).toHaveLength(1);
    expect(hermanos[0].id).toBe(42);
    expect(queryRaw).toHaveBeenCalledTimes(3);
  });
});

