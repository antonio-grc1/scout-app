import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { TipoUnidad, AlcanceRol, EstadoSolicitudPase } from '@prisma/client';
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
          permisos: expect.objectContaining({
            none: expect.objectContaining({
              permiso: expect.objectContaining({
                clave: expect.objectContaining({
                  in: expect.arrayContaining(['roles.gestionar', 'organizacion.gestionar', 'tesoreria.gestionar']),
                }),
              }),
            }),
          }),
        }),
        orderBy: { id: 'asc' },
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

  it('P2-5: ejecutarLote precarga asignaciones, roles y unidades en lote evitando N+1 findUnique', async () => {
    const asigFindMany = vi.fn().mockResolvedValue([
      {
        id: 1,
        activo: true,
        usuarioId: 10,
        unidadId: 1,
        rolId: 1,
        alcanceOverride: null,
        usuario: { id: 10, activo: true, fechaNacimiento: new Date('2015-01-01') },
        unidad: { id: 1, tipo: TipoUnidad.SECCION_RAMA, activa: true, rama: null },
        rol: { id: 1, nombre: 'Protagonista', tipoMiembro: 'PROTAGONISTA', alcancePorDefecto: AlcanceRol.PROPIO, permisos: [] },
      },
      {
        id: 2,
        activo: true,
        usuarioId: 11,
        unidadId: 1,
        rolId: 1,
        alcanceOverride: null,
        usuario: { id: 11, activo: true, fechaNacimiento: new Date('2015-02-01') },
        unidad: { id: 1, tipo: TipoUnidad.SECCION_RAMA, activa: true, rama: null },
        rol: { id: 1, nombre: 'Protagonista', tipoMiembro: 'PROTAGONISTA', alcancePorDefecto: AlcanceRol.PROPIO, permisos: [] },
      },
    ]);
    const asigFindUnique = vi.fn();
    const unidadFindMany = vi.fn().mockResolvedValue([
      { id: 2, nombre: 'Unidad', tipo: TipoUnidad.SECCION_RAMA, activa: true },
    ]);
    const tx: any = {
      rama: { findFirst: vi.fn().mockResolvedValue({ edadMaxima: 21 }) },
      asignacionMiembro: {
        findMany: asigFindMany,
        findUnique: asigFindUnique,
        findFirst: vi.fn().mockResolvedValue(null),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn().mockResolvedValue({ id: 99, unidad: { id: 2, nombre: 'Unidad' }, rol: { id: 1, nombre: 'Protagonista' } }),
      },
      unidadOrganizativa: { findMany: unidadFindMany, findUnique: vi.fn() },
    };
    const prisma: any = { $transaction: vi.fn(async (cb: any) => cb(tx)) };
    const pasesSvc = new PasesService(prisma);

    const res = await pasesSvc.ejecutarLote({ tipo: 'GLOBAL' }, {
      pases: [
        { asignacionOrigenId: 1, unidadDestinoId: 2 },
        { asignacionOrigenId: 2, unidadDestinoId: 2 },
      ],
    });
    expect(res.total).toBe(2);
    expect(asigFindMany).toHaveBeenCalledTimes(1);
    expect(asigFindUnique).not.toHaveBeenCalled();
    expect(unidadFindMany).toHaveBeenCalledTimes(1);
  });
});

describe('PasesService - Reglas de Alcance, Progresión y Solicitudes en Dos Pasos', () => {
  const ramasActivas = [
    { id: 1, ordenProgresion: 1 }, // Manada
    { id: 2, ordenProgresion: 2 }, // Unidad Scout
    { id: 3, ordenProgresion: 3 }, // Caminantes
    { id: 4, ordenProgresion: 4 }, // Rover
  ];

  const crearTxBase = () => ({
    rama: {
      findFirst: vi.fn().mockResolvedValue({ edadMaxima: 21 }),
      findMany: vi.fn().mockResolvedValue(ramasActivas),
    },
    asignacionMiembro: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn(),
      findFirst: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi.fn(),
    },
    unidadOrganizativa: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(1),
    },
    rol: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    solicitudPase: {
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  });

  it('bloquea a un usuario UNIDAD si intenta mover a un EDUCADOR o asignar rol EDUCADOR', async () => {
    const tx = crearTxBase();
    const prisma: any = { $transaction: vi.fn(async (cb: any) => cb(tx)) };
    const service = new PasesService(prisma);

    // Caso 1: origen EDUCADOR
    tx.asignacionMiembro.findUnique.mockResolvedValueOnce({
      id: 10,
      usuarioId: 100,
      unidadId: 1,
      rolId: 2,
      activo: true,
      alcanceOverride: null,
      rol: { id: 2, nombre: 'Educador', tipoMiembro: 'EDUCADOR', alcancePorDefecto: AlcanceRol.UNIDAD, permisos: [] },
      unidad: { id: 1, tipo: TipoUnidad.SECCION_RAMA, ramaId: 1 },
      usuario: { id: 100, activo: true, fechaNacimiento: new Date('1990-01-01') },
    });
    await expect(
      service.ejecutar({ tipo: 'UNIDAD', unidadIds: [1], usuarioIdPropio: 999 }, { asignacionOrigenId: 10, unidadDestinoId: 1 }),
    ).rejects.toThrow(ForbiddenException);

    // Caso 2: protagonista destino rol EDUCADOR (ej. Rover -> Educador)
    tx.asignacionMiembro.findUnique.mockResolvedValueOnce({
      id: 11,
      usuarioId: 101,
      unidadId: 4,
      rolId: 1,
      activo: true,
      alcanceOverride: null,
      rol: { id: 1, nombre: 'Protagonista', tipoMiembro: 'PROTAGONISTA', alcancePorDefecto: AlcanceRol.PROPIO, permisos: [] },
      unidad: { id: 4, tipo: TipoUnidad.SECCION_RAMA, ramaId: 4 },
      usuario: { id: 101, activo: true, fechaNacimiento: new Date('2004-01-01') },
    });
    tx.unidadOrganizativa.findUnique.mockResolvedValueOnce({
      id: 1,
      nombre: 'Manada A',
      tipo: TipoUnidad.SECCION_RAMA,
      ramaId: 1,
      activa: true,
    });
    tx.rol.findUnique.mockResolvedValueOnce({
      id: 2,
      nombre: 'Educador de Rama',
      tipoMiembro: 'EDUCADOR',
      requiereRama: true,
      alcancePorDefecto: AlcanceRol.UNIDAD,
    });

    await expect(
      service.ejecutar(
        { tipo: 'UNIDAD', unidadIds: [4], usuarioIdPropio: 999 },
        { asignacionOrigenId: 11, unidadDestinoId: 1, rolDestinoId: 2 },
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('bloquea a un usuario UNIDAD si salta más de una rama o retrocede a una rama anterior', async () => {
    const tx = crearTxBase();
    const prisma: any = { $transaction: vi.fn(async (cb: any) => cb(tx)) };
    const service = new PasesService(prisma);

    const origenManada = {
      id: 20,
      usuarioId: 102,
      unidadId: 1,
      rolId: 1,
      activo: true,
      alcanceOverride: null,
      rol: { id: 1, nombre: 'Protagonista', tipoMiembro: 'PROTAGONISTA', requiereRama: true, alcancePorDefecto: AlcanceRol.PROPIO, permisos: [] },
      unidad: { id: 1, tipo: TipoUnidad.SECCION_RAMA, ramaId: 1 },
      usuario: { id: 102, activo: true, fechaNacimiento: new Date('2015-01-01') },
    };

    // Salto Manada (1) -> Caminantes (3)
    tx.asignacionMiembro.findUnique.mockResolvedValueOnce(origenManada);
    tx.unidadOrganizativa.findUnique.mockResolvedValueOnce({
      id: 5,
      nombre: 'Caminantes',
      tipo: TipoUnidad.SECCION_RAMA,
      ramaId: 3,
      activa: true,
    });
    tx.rol.findUnique.mockResolvedValueOnce(origenManada.rol);

    await expect(
      service.ejecutar(
        { tipo: 'UNIDAD', unidadIds: [1], usuarioIdPropio: 999 },
        { asignacionOrigenId: 20, unidadDestinoId: 5, rolDestinoId: 1 },
      ),
    ).rejects.toThrow(ForbiddenException);

    // Retroceso Caminantes (3) -> Unidad Scout (2)
    tx.asignacionMiembro.findUnique.mockResolvedValueOnce({
      ...origenManada,
      unidadId: 5,
      unidad: { id: 5, tipo: TipoUnidad.SECCION_RAMA, ramaId: 3 },
    });
    tx.unidadOrganizativa.findUnique.mockResolvedValueOnce({
      id: 3,
      nombre: 'Unidad Scout A',
      tipo: TipoUnidad.SECCION_RAMA,
      ramaId: 2,
      activa: true,
    });
    tx.rol.findUnique.mockResolvedValueOnce(origenManada.rol);

    await expect(
      service.ejecutar(
        { tipo: 'UNIDAD', unidadIds: [5], usuarioIdPropio: 999 },
        { asignacionOrigenId: 20, unidadDestinoId: 3, rolDestinoId: 1 },
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('crea SolicitudPase PENDIENTE cuando UNIDAD pasa a rama multi-sección fuera de alcance, y se aprueba en destino', async () => {
    const tx = crearTxBase();
    tx.unidadOrganizativa.count.mockResolvedValueOnce(2); // Rama destino tiene 2 secciones activas
    tx.asignacionMiembro.findUnique.mockResolvedValueOnce({
      id: 30,
      usuarioId: 103,
      unidadId: 1,
      rolId: 1,
      activo: true,
      alcanceOverride: null,
      rol: { id: 1, nombre: 'Protagonista', tipoMiembro: 'PROTAGONISTA', requiereRama: true, alcancePorDefecto: AlcanceRol.PROPIO, permisos: [] },
      unidad: { id: 1, tipo: TipoUnidad.SECCION_RAMA, ramaId: 1 },
      usuario: { id: 103, activo: true, fechaNacimiento: new Date('2015-01-01') },
    });
    tx.unidadOrganizativa.findUnique.mockResolvedValueOnce({
      id: 3,
      nombre: 'Unidad Scout A',
      tipo: TipoUnidad.SECCION_RAMA,
      ramaId: 2,
      activa: true,
    });
    tx.rol.findUnique.mockResolvedValueOnce({
      id: 1,
      nombre: 'Protagonista',
      tipoMiembro: 'PROTAGONISTA',
      requiereRama: true,
      alcancePorDefecto: AlcanceRol.PROPIO,
    });
    tx.solicitudPase.create.mockResolvedValueOnce({
      id: 77,
      estado: EstadoSolicitudPase.PENDIENTE,
      unidadOrigenId: 1,
      unidadDestinoId: 3,
    });

    const prisma: any = { $transaction: vi.fn(async (cb: any) => cb(tx)) };
    const service = new PasesService(prisma);

    const resultadoSolicitud: any = await service.ejecutar(
      { tipo: 'UNIDAD', unidadIds: [1], usuarioIdPropio: 999 },
      { asignacionOrigenId: 30, unidadDestinoId: 3, rolDestinoId: 1 },
      999,
    );

    expect(resultadoSolicitud.pendienteAprobacion).toBe(true);
    expect(resultadoSolicitud.solicitud.id).toBe(77);
    expect(tx.asignacionMiembro.updateMany).not.toHaveBeenCalled();

    // Emisor no puede aprobar su propia solicitud saliente
    tx.solicitudPase.findUnique.mockResolvedValueOnce({
      id: 77,
      asignacionOrigenId: 30,
      usuarioId: 103,
      unidadOrigenId: 1,
      unidadDestinoId: 3,
      rolDestinoId: 1,
      alcanceOverride: null,
      estado: EstadoSolicitudPase.PENDIENTE,
      unidadDestino: { id: 3, ramaId: 2, tipo: TipoUnidad.SECCION_RAMA, activa: true },
      rolDestino: { id: 1, nombre: 'Protagonista', tipoMiembro: 'PROTAGONISTA', alcancePorDefecto: AlcanceRol.PROPIO, permisos: [] },
      asignacionOrigen: {
        id: 30,
        activo: true,
        alcanceOverride: null,
        rol: { id: 1, tipoMiembro: 'PROTAGONISTA', alcancePorDefecto: AlcanceRol.PROPIO, permisos: [] },
        unidad: { id: 1, ramaId: 1 },
        usuario: { id: 103, activo: true, fechaNacimiento: new Date('2015-01-01') },
      },
    });
    await expect(
      service.aprobarSolicitud({ tipo: 'UNIDAD', unidadIds: [1], usuarioIdPropio: 999 }, 77, {}, 999),
    ).rejects.toThrow(ForbiddenException);

    // Unidad destino aprueba (redirigiendo a Unidad Scout B = 4 dentro de misma ramaId=2)
    tx.solicitudPase.findUnique.mockResolvedValueOnce({
      id: 77,
      asignacionOrigenId: 30,
      usuarioId: 103,
      unidadOrigenId: 1,
      unidadDestinoId: 3,
      rolDestinoId: 1,
      alcanceOverride: null,
      estado: EstadoSolicitudPase.PENDIENTE,
      unidadDestino: { id: 3, ramaId: 2, tipo: TipoUnidad.SECCION_RAMA, activa: true },
      rolDestino: { id: 1, nombre: 'Protagonista', tipoMiembro: 'PROTAGONISTA', alcancePorDefecto: AlcanceRol.PROPIO, permisos: [] },
      asignacionOrigen: {
        id: 30,
        activo: true,
        alcanceOverride: null,
        rol: { id: 1, tipoMiembro: 'PROTAGONISTA', alcancePorDefecto: AlcanceRol.PROPIO, permisos: [] },
        unidad: { id: 1, ramaId: 1 },
        usuario: { id: 103, activo: true, fechaNacimiento: new Date('2015-01-01') },
      },
    });
    tx.unidadOrganizativa.findUnique.mockResolvedValueOnce({
      id: 4,
      ramaId: 2,
      tipo: TipoUnidad.SECCION_RAMA,
      activa: true,
    });
    tx.asignacionMiembro.create.mockResolvedValueOnce({
      id: 31,
      usuarioId: 103,
      unidadId: 4,
      rolId: 1,
      unidad: { id: 4, nombre: 'Unidad Scout B' },
      rol: { id: 1, nombre: 'Protagonista' },
    });

    const aprobacion = await service.aprobarSolicitud(
      { tipo: 'UNIDAD', unidadIds: [3, 4], usuarioIdPropio: 888 },
      77,
      { unidadDestinoId: 4 },
      888,
    );
    expect(aprobacion.aprobada).toBe(true);
    expect(aprobacion.asignacionNueva.unidadId).toBe(4);
  });

  it('permite rechazar a la unidad receptora (RECHAZADA) o cancelar a la emisora (CANCELADA)', async () => {
    const tx = crearTxBase();
    const prisma: any = { $transaction: vi.fn(async (cb: any) => cb(tx)) };
    const service = new PasesService(prisma);

    tx.solicitudPase.findUnique.mockResolvedValueOnce({
      id: 88,
      unidadOrigenId: 1,
      unidadDestinoId: 3,
      estado: EstadoSolicitudPase.PENDIENTE,
    });
    const resRechazo = await service.rechazarSolicitud(
      { tipo: 'UNIDAD', unidadIds: [3], usuarioIdPropio: 888 },
      88,
      { motivo: 'Seccion llena' },
      888,
    );
    expect(resRechazo.estado).toBe(EstadoSolicitudPase.RECHAZADA);

    tx.solicitudPase.findUnique.mockResolvedValueOnce({
      id: 89,
      unidadOrigenId: 1,
      unidadDestinoId: 3,
      estado: EstadoSolicitudPase.PENDIENTE,
    });
    const resCancel = await service.rechazarSolicitud(
      { tipo: 'UNIDAD', unidadIds: [1], usuarioIdPropio: 999 },
      89,
      {},
      999,
    );
    expect(resCancel.estado).toBe(EstadoSolicitudPase.CANCELADA);
  });
});
