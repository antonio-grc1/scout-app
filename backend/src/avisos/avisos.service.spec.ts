import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AlcanceRol } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import type { AlcanceAcceso, AuthUser } from '../common/types/auth.types.js';
import { MailerService } from '../mailer/mailer.service.js';
import { AvisosService } from './avisos.service.js';

const actorGlobal: AuthUser = {
  sub: 1,
  dni: '10000001',
  requiereCambioClave: false,
  asignaciones: [
    {
      unidadId: 1,
      unidadNombre: 'Jefatura',
      rol: 'Jefe de Grupo',
      alcance: AlcanceRol.GLOBAL,
      permisos: ['avisos.ver', 'avisos.editar'],
    },
  ],
};

const actorUnidad: AuthUser = {
  sub: 20,
  dni: '20000020',
  requiereCambioClave: false,
  asignaciones: [
    {
      unidadId: 3,
      unidadNombre: 'Rama Scout',
      rol: 'Educador de Rama',
      alcance: AlcanceRol.UNIDAD,
      permisos: ['avisos.ver', 'avisos.editar'],
    },
  ],
};

const crearMockPrisma = () => ({
  unidadOrganizativa: {
    findUnique: vi.fn(),
  },
  usuario: {
    findMany: vi.fn(),
    count: vi.fn(),
  },
  aviso: {
    create: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  avisoDestinatario: {
    findMany: vi.fn(),
    count: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    groupBy: vi.fn(),
  },
});

describe('AvisosService', () => {
  it('bloquea a perfiles PROPIO en crear, listarEnviados, obtenerLecturas y eliminar', async () => {
    const prisma = crearMockPrisma();
    const service = new AvisosService(prisma as any);
    const alcancePropio: AlcanceAcceso = { tipo: 'PROPIO', usuarioId: 99 };

    await expect(
      service.crear(alcancePropio, actorGlobal, {
        titulo: 'Aviso',
        mensaje: 'Contenido de prueba',
        prioridad: 'NORMAL',
        destinatarioTipo: 'TODOS',
        unidadId: 3,
      }),
    ).rejects.toThrow(ForbiddenException);

    await expect(
      service.listarEnviados(alcancePropio, 99, { pagina: 1, porPagina: 30 }),
    ).rejects.toThrow(ForbiddenException);

    await expect(service.obtenerLecturas(alcancePropio, 99, 1)).rejects.toThrow(ForbiddenException);
    await expect(service.eliminar(alcancePropio, 99, 1)).rejects.toThrow(ForbiddenException);
  });

  it('crea aviso GLOBAL a TODOS con excepciones y marca leído automáticamente al emisor', async () => {
    const prisma = crearMockPrisma();
    const service = new AvisosService(prisma as any);

    prisma.usuario.findMany.mockResolvedValueOnce([{ id: 1 }, { id: 2 }, { id: 3 }]);
    prisma.aviso.create.mockResolvedValueOnce({
      id: 10,
      titulo: 'Reunión general',
      mensaje: 'Nos vemos el sábado a las 14 hs.',
      prioridad: 'IMPORTANTE',
      destinatarioTipo: 'TODOS',
      unidadId: null,
      fechaExpiracion: null,
      createdAt: new Date('2026-11-26T15:00:00Z'),
      unidad: null,
      creadoPor: { id: 1, nombre: 'Admin', apellido: 'Jefatura' },
    });

    const res = await service.crear({ tipo: 'GLOBAL' }, actorGlobal, {
      titulo: 'Reunión general',
      mensaje: 'Nos vemos el sábado a las 14 hs.',
      prioridad: 'IMPORTANTE',
      destinatarioTipo: 'TODOS',
      unidadId: null,
      excepcionesIds: [99],
    });

    expect(prisma.usuario.findMany).toHaveBeenCalledWith({
      where: {
        activo: true,
        id: { notIn: [99] },
        asignaciones: { some: { activo: true } },
      },
      select: { id: true },
    });

    const createCall = prisma.aviso.create.mock.calls[0][0];
    expect(createCall.data.destinatarios.createMany.data).toEqual([
      { usuarioId: 1, leidoAt: expect.any(Date) },
      { usuarioId: 2, leidoAt: null },
      { usuarioId: 3, leidoAt: null },
    ]);
    expect(res.totalDestinatarios).toBe(3);
    expect(res.totalLeidos).toBe(1);
  });

  it('crea aviso a USUARIOS puntuales sin marcar leído al emisor aunque esté incluido', async () => {
    const prisma = crearMockPrisma();
    const service = new AvisosService(prisma as any);

    prisma.usuario.findMany.mockResolvedValueOnce([{ id: 1 }, { id: 5 }]);
    prisma.aviso.create.mockResolvedValueOnce({
      id: 11,
      titulo: 'Aviso puntual',
      mensaje: 'Recordatorio personal.',
      prioridad: 'NORMAL',
      destinatarioTipo: 'USUARIOS',
      unidadId: null,
      fechaExpiracion: null,
      createdAt: new Date(),
      unidad: null,
      creadoPor: { id: 1, nombre: 'Admin', apellido: 'Jefatura' },
    });

    const res = await service.crear({ tipo: 'GLOBAL' }, actorGlobal, {
      titulo: 'Aviso puntual',
      mensaje: 'Recordatorio personal.',
      prioridad: 'NORMAL',
      destinatarioTipo: 'USUARIOS',
      usuariosIds: [1, 5, 5],
    });

    const createCall = prisma.aviso.create.mock.calls[0][0];
    expect(createCall.data.destinatarios.createMany.data).toEqual([
      { usuarioId: 1, leidoAt: null },
      { usuarioId: 5, leidoAt: null },
    ]);
    expect(res.totalDestinatarios).toBe(2);
    expect(res.totalLeidos).toBe(0);
  });

  it('rechaza fechaExpiracion pasada o criterio sin destinatarios activos', async () => {
    const prisma = crearMockPrisma();
    const service = new AvisosService(prisma as any);

    await expect(
      service.crear({ tipo: 'GLOBAL' }, actorGlobal, {
        titulo: 'Vencido',
        mensaje: 'No debería crearse',
        prioridad: 'NORMAL',
        destinatarioTipo: 'TODOS',
        fechaExpiracion: '2020-01-01',
      }),
    ).rejects.toThrow(BadRequestException);

    prisma.usuario.findMany.mockResolvedValueOnce([]);
    await expect(
      service.crear({ tipo: 'GLOBAL' }, actorGlobal, {
        titulo: 'Vacío',
        mensaje: 'Sin destinatarios',
        prioridad: 'NORMAL',
        destinatarioTipo: 'EDUCADORES',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('restringe a alcance UNIDAD: impide envío global, otra unidad y usuarios fuera de su unidad', async () => {
    const prisma = crearMockPrisma();
    const service = new AvisosService(prisma as any);
    const alcanceUnidad: AlcanceAcceso = { tipo: 'UNIDAD', unidadIds: [3], usuarioIdPropio: 20 };

    await expect(
      service.crear(alcanceUnidad, actorUnidad, {
        titulo: 'Global',
        mensaje: 'Intento sin permiso global',
        prioridad: 'NORMAL',
        destinatarioTipo: 'TODOS',
        unidadId: null,
      }),
    ).rejects.toThrow(ForbiddenException);

    await expect(
      service.crear(alcanceUnidad, actorUnidad, {
        titulo: 'Otra unidad',
        mensaje: 'Intento hacia unidad 4',
        prioridad: 'NORMAL',
        destinatarioTipo: 'PROTAGONISTAS',
        unidadId: 4,
      }),
    ).rejects.toThrow(ForbiddenException);

    // Usuario 50 existe activo pero fuera de unidad 3
    prisma.usuario.findMany.mockResolvedValueOnce([]);
    prisma.usuario.count.mockResolvedValueOnce(1);
    await expect(
      service.crear(alcanceUnidad, actorUnidad, {
        titulo: 'Puntual fuera',
        mensaje: 'Intento a miembro ajeno',
        prioridad: 'NORMAL',
        destinatarioTipo: 'USUARIOS',
        usuariosIds: [50],
      }),
    ).rejects.toThrow(ForbiddenException);

    // Envío válido dentro de unidad 3
    prisma.unidadOrganizativa.findUnique.mockResolvedValueOnce({ id: 3, activa: true });
    prisma.usuario.findMany.mockResolvedValueOnce([{ id: 31 }, { id: 32 }]);
    prisma.aviso.create.mockResolvedValueOnce({
      id: 12,
      titulo: 'Campamento de rama',
      mensaje: 'Traer autorización firmada.',
      prioridad: 'URGENTE',
      destinatarioTipo: 'PROTAGONISTAS',
      unidadId: 3,
      fechaExpiracion: null,
      createdAt: new Date(),
      unidad: { id: 3, nombre: 'Rama Scout' },
      creadoPor: { id: 20, nombre: 'Edu', apellido: 'Scout' },
    });

    const ok = await service.crear(alcanceUnidad, actorUnidad, {
      titulo: 'Campamento de rama',
      mensaje: 'Traer autorización firmada.',
      prioridad: 'URGENTE',
      destinatarioTipo: 'PROTAGONISTAS',
      unidadId: 3,
    });
    expect(ok.id).toBe(12);
    expect(ok.unidadId).toBe(3);
    expect(ok.totalDestinatarios).toBe(2);
  });

  it('lista bandeja, cuenta no leídos y marca lecturas de manera idempotente', async () => {
    const prisma = crearMockPrisma();
    const service = new AvisosService(prisma as any);

    prisma.avisoDestinatario.findMany.mockResolvedValueOnce([
      {
        avisoId: 5,
        usuarioId: 10,
        leidoAt: null,
        aviso: {
          id: 5,
          titulo: 'Aviso 5',
          mensaje: 'Detalle',
          prioridad: 'NORMAL',
          destinatarioTipo: 'TODOS',
          unidadId: null,
          unidad: null,
          creadoPor: { id: 1, nombre: 'Admin', apellido: 'Jefatura' },
          fechaExpiracion: null,
          createdAt: new Date('2026-11-26T12:00:00Z'),
        },
      },
    ]);
    prisma.avisoDestinatario.count.mockResolvedValueOnce(1).mockResolvedValueOnce(1);

    const bandeja = await service.listarBandeja(10, { pagina: 1, porPagina: 30 });
    expect(bandeja.total).toBe(1);
    expect(bandeja.noLeidos).toBe(1);
    expect(bandeja.items[0].leido).toBe(false);

    prisma.avisoDestinatario.count.mockResolvedValueOnce(3);
    const countRes = await service.contarNoLeidos(10);
    expect(countRes).toEqual({ count: 3 });

    // No existe en bandeja -> 404
    prisma.avisoDestinatario.findUnique.mockResolvedValueOnce(null);
    await expect(service.marcarLeido(10, 999)).rejects.toThrow(NotFoundException);

    // Ya estaba leído -> idempotente sin llamar update
    const fechaPrevia = new Date('2026-11-26T10:00:00Z');
    prisma.avisoDestinatario.findUnique.mockResolvedValueOnce({
      avisoId: 5,
      usuarioId: 10,
      leidoAt: fechaPrevia,
    });
    const yaLeido = await service.marcarLeido(10, 5);
    expect(yaLeido).toEqual({ avisoId: 5, leidoAt: fechaPrevia });
    expect(prisma.avisoDestinatario.update).not.toHaveBeenCalled();

    // Marcar todos como leídos
    prisma.avisoDestinatario.updateMany.mockResolvedValueOnce({ count: 4 });
    expect(await service.marcarTodosLeidos(10)).toEqual({ actualizados: 4 });
  });

  it('lista enviados, obtiene lecturas y elimina respetando alcance UNIDAD vs GLOBAL', async () => {
    const prisma = crearMockPrisma();
    const service = new AvisosService(prisma as any);
    const alcanceUnidad: AlcanceAcceso = { tipo: 'UNIDAD', unidadIds: [3], usuarioIdPropio: 20 };

    prisma.aviso.findMany.mockResolvedValueOnce([
      {
        id: 15,
        titulo: 'Salida',
        mensaje: 'Sábado 9 hs',
        prioridad: 'NORMAL',
        destinatarioTipo: 'TODOS',
        unidadId: 3,
        unidad: { id: 3, nombre: 'Rama Scout' },
        creadoPor: { id: 20, nombre: 'Edu', apellido: 'Scout' },
        fechaExpiracion: null,
        createdAt: new Date(),
        _count: { destinatarios: 5 },
      },
    ]);
    prisma.aviso.count.mockResolvedValueOnce(1);
    prisma.avisoDestinatario.groupBy.mockResolvedValueOnce([{ avisoId: 15, _count: { _all: 2 } }]);

    const enviados = await service.listarEnviados(alcanceUnidad, 20, { pagina: 1, porPagina: 30 });
    expect(enviados.items[0].totalDestinatarios).toBe(5);
    expect(enviados.items[0].totalLeidos).toBe(2);

    // Lecturas de aviso de otra unidad por otro creador -> 403
    prisma.aviso.findUnique.mockResolvedValueOnce({
      id: 99,
      titulo: 'Otro',
      mensaje: 'Ajeno',
      prioridad: 'NORMAL',
      destinatarioTipo: 'TODOS',
      unidadId: 8,
      creadoPorUsuarioId: 1,
      unidad: { id: 8, nombre: 'Otra' },
      creadoPor: { id: 1, nombre: 'Admin', apellido: 'Jefatura' },
      fechaExpiracion: null,
      createdAt: new Date(),
      destinatarios: [],
    });
    await expect(service.obtenerLecturas(alcanceUnidad, 20, 99)).rejects.toThrow(ForbiddenException);

    // Eliminar propio aviso en unidad 3 -> ok
    prisma.aviso.findUnique.mockResolvedValueOnce({
      id: 15,
      creadoPorUsuarioId: 20,
      unidadId: 3,
    });
    prisma.aviso.delete.mockResolvedValueOnce({ id: 15 });
    expect(await service.eliminar(alcanceUnidad, 20, 15)).toEqual({ eliminado: true, id: 15 });
  });

  it('despacha canales externos (Web Push + Mailer deduplicando emails) y actualiza contadores', async () => {
    const prisma = crearMockPrisma();
    prisma.usuario.findMany.mockResolvedValueOnce([
      { emailContacto: 'Familia@Test.com' },
      { emailContacto: 'familia@test.com' },
      { emailContacto: 'otro@test.com' },
    ]);
    prisma.aviso.update.mockResolvedValueOnce({ id: 40 });

    const webPushMock = {
      obtenerEstadoPublico: vi.fn().mockReturnValue({ habilitado: true, publicKey: 'PUB' }),
      estaHabilitado: vi.fn().mockReturnValue(true),
      contarSuscripcionesUsuario: vi.fn().mockResolvedValue(1),
      enviarAUsuarios: vi.fn().mockResolvedValue({ enviados: 2, fallidos: 0, eliminadas: 0 }),
    };
    const mailerMock = {
      estaDisponibleParaEnvio: vi.fn().mockResolvedValue(true),
      enviarAvisoMasivo: vi
        .fn()
        .mockResolvedValue({ enviados: 2, fallidos: 0, destinatariosUnicos: 2 }),
    };

    const service = new AvisosService(prisma as any, webPushMock as any, mailerMock as any);

    const estado = await service.obtenerEstadoCanales(1);
    expect(estado).toEqual({
      pushHabilitado: true,
      pushPublicKey: 'PUB',
      pushSuscripcionesUsuario: 1,
      emailHabilitado: true,
    });

    const despacho = await service.despacharCanalesExternos({
      avisoId: 40,
      titulo: 'Aviso doble canal',
      mensaje: 'Detalle completo',
      prioridad: 'IMPORTANTE',
      unidadNombre: 'Rama Scout',
      remitenteNombre: 'Admin Jefatura',
      enviarPush: true,
      enviarEmail: true,
      destinatariosIds: [2, 3, 4],
    });

    expect(webPushMock.enviarAUsuarios).toHaveBeenCalledWith([2, 3, 4], {
      avisoId: 40,
      titulo: 'Aviso doble canal',
      mensaje: 'Detalle completo',
      prioridad: 'IMPORTANTE',
      url: '/avisos',
    });
    expect(mailerMock.enviarAvisoMasivo).toHaveBeenCalledWith(
      ['Familia@Test.com', 'familia@test.com', 'otro@test.com'],
      {
        titulo: 'Aviso doble canal',
        mensaje: 'Detalle completo',
        prioridad: 'IMPORTANTE',
        unidadNombre: 'Rama Scout',
        remitenteNombre: 'Admin Jefatura',
      },
    );
    expect(prisma.aviso.update).toHaveBeenCalledWith({
      where: { id: 40 },
      data: { pushEnviados: 2, emailsEnviados: 2 },
    });
    expect(despacho).toEqual({ pushEnviados: 2, emailsEnviados: 2 });
  });

  it('MailerService.enviarAvisoMasivo deduplica emails case-insensitive y omite si SMTP no está listo', async () => {
    const mailerSinSmtp = new MailerService({
      configuracionCorreo: { findUnique: vi.fn().mockResolvedValue({ id: 1, habilitado: false }) },
    } as any);

    const omitido = await mailerSinSmtp.enviarAvisoMasivo(
      ['A@Test.com', 'a@test.com', null, 'sin-arroba'],
      {
        titulo: 'Prueba',
        mensaje: 'Hola',
        prioridad: 'NORMAL',
        remitenteNombre: 'Jefatura',
      },
    );
    expect(omitido).toEqual({ enviados: 0, fallidos: 0, destinatariosUnicos: 1 });

    const mailerConSmtp = new MailerService({
      configuracionCorreo: { findUnique: vi.fn().mockResolvedValue(null) },
    } as any);
    const sendMail = vi.fn().mockResolvedValue({});
    vi.spyOn(mailerConSmtp as any, 'resolverConfiguracionActiva').mockResolvedValue({
      habilitado: true,
      host: 'smtp.test.com',
      port: 587,
      user: 'bot@test.com',
      pass: 'secret',
      appUrl: 'https://scout.test',
      fuente: 'db',
    });
    vi.spyOn(mailerConSmtp as any, 'obtenerTransporter').mockReturnValue({ sendMail });

    const res = await mailerConSmtp.enviarAvisoMasivo(
      ['Mama@Familia.com', 'mama@familia.com ', 'papa@familia.com', ''],
      {
        titulo: 'Salida de rama',
        mensaje: 'Llevar equipo.\nPuntual.',
        prioridad: 'URGENTE',
        unidadNombre: 'Manada',
        remitenteNombre: 'Akela',
      },
    );

    expect(res).toEqual({ enviados: 2, fallidos: 0, destinatariosUnicos: 2 });
    expect(sendMail).toHaveBeenCalledTimes(2);
    expect(sendMail.mock.calls[0][0].subject).toContain('[URGENTE]');
  });
});
