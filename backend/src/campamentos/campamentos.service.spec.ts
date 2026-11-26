import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { AlcanceRol, EstadoCargo, Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import type { AlcanceAcceso, AuthUser } from '../common/types/auth.types.js';
import { CampamentosService } from './campamentos.service.js';

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
      permisos: ['campamentos.ver', 'campamentos.editar', 'avisos.editar'],
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
      rol: 'Educador',
      alcance: AlcanceRol.UNIDAD,
      permisos: ['campamentos.ver', 'campamentos.editar'],
    },
  ],
};

const crearMockPrisma = () => {
  const mock: any = {
    unidadOrganizativa: { findUnique: vi.fn(), findMany: vi.fn() },
    usuario: { findMany: vi.fn(), findUnique: vi.fn(), count: vi.fn() },
    conceptoCuota: { create: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
    cargoMiembro: {
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    },
    entregaFormulario: { findFirst: vi.fn(), findMany: vi.fn() },
    pagoImputacion: { findMany: vi.fn(), delete: vi.fn(), update: vi.fn() },
    pago: { deleteMany: vi.fn(), delete: vi.fn(), update: vi.fn() },
    aviso: { deleteMany: vi.fn() },
    campamento: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    campamentoUnidad: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    campamentoInscripcion: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      createMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(async (fn: (tx: any) => Promise<any>) => fn(mock)),
  };
  return mock;
};

describe('CampamentosService', () => {
  it('crea campamento con concepto POR_CONFIRMACION sin generar cargos por adelantado y dispara aviso opcional', async () => {
    const prisma = crearMockPrisma();
    const avisosMock = { crear: vi.fn().mockResolvedValue({ id: 99 }) };
    const service = new CampamentosService(prisma, avisosMock as any);

    prisma.unidadOrganizativa.findMany.mockResolvedValueOnce([{ id: 3 }]);
    prisma.usuario.findMany.mockResolvedValueOnce([{ id: 10 }, { id: 11 }]);
    prisma.conceptoCuota.create.mockResolvedValueOnce({ id: 50 });
    prisma.campamento.create.mockResolvedValueOnce({
      id: 7,
      titulo: 'Campamento de Primavera',
      lugar: 'Sierra de los Padres',
      fechaInicio: new Date('2026-10-10T00:00:00.000Z'),
      fechaFin: new Date('2026-10-12T00:00:00.000Z'),
      costoBase: 25000,
      unidadId: 3,
      estado: 'PUBLICADO',
    });

    const res = await service.crear({ tipo: 'GLOBAL' }, actorGlobal, {
      titulo: 'Campamento de Primavera',
      lugar: 'Sierra de los Padres',
      fechaInicio: '2026-10-10',
      fechaFin: '2026-10-12',
      unidadId: 3,
      costoBase: 25000,
      notificarAviso: true,
      notificarPush: true,
      notificarEmail: false,
    });

    expect(prisma.conceptoCuota.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tipo: 'CAMPAMENTO',
          destinatarioTipo: 'POR_CONFIRMACION',
          montoBase: 25000,
        }),
      }),
    );
    expect(prisma.cargoMiembro.create).not.toHaveBeenCalled();
    expect(avisosMock.crear).toHaveBeenCalledWith(
      { tipo: 'GLOBAL' },
      actorGlobal,
      expect.objectContaining({
        campamentoId: 7,
      }),
    );
    expect(res).toEqual({
      id: 7,
      titulo: 'Campamento de Primavera',
      estado: 'PUBLICADO',
      totalInvitados: 2,
    });
  });

  it('al confirmar asistencia genera CargoMiembro con descuento familiar y devuelve estado de ficha médica', async () => {
    const prisma = crearMockPrisma();
    const service = new CampamentosService(prisma);

    prisma.campamentoInscripcion.findUnique.mockResolvedValueOnce({
      id: 21,
      campamentoId: 7,
      usuarioId: 10,
      estado: 'PENDIENTE',
      observaciones: null,
      cargo: null,
      campamento: {
        id: 7,
        estado: 'PUBLICADO',
        cicloAnio: 2026,
        costoBase: 20000,
        permiteDescuentoHermanos: true,
        porcentajeDescuentoHermanos: null,
        conceptoCuotaId: 50,
        fechaLimiteConfirmacion: new Date('2028-01-01T23:59:59.000Z'),
      },
    });
    prisma.entregaFormulario.findFirst.mockResolvedValueOnce(null); // sin ficha validada
    prisma.usuario.findUnique.mockResolvedValueOnce({
      grupoFamiliar: { porcentajeDescuentoHermanos: 25 },
    });
    prisma.cargoMiembro.create.mockResolvedValueOnce({
      id: 300,
      montoFinal: 15000,
      montoPagado: 0,
      estado: EstadoCargo.PENDIENTE,
    });
    prisma.campamentoInscripcion.update.mockResolvedValueOnce({
      id: 21,
      estado: 'CONFIRMADO',
      confirmadoAt: new Date(),
    });

    const res = await service.responder(10, 7, { accion: 'CONFIRMAR' });
    expect(prisma.cargoMiembro.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        usuarioId: 10,
        conceptoId: 50,
        montoOriginal: new Prisma.Decimal(20000),
        montoDescuento: new Prisma.Decimal(5000),
        montoFinal: new Prisma.Decimal(15000),
        estado: EstadoCargo.PENDIENTE,
      }),
    });
    expect(res.fichaValidada).toBe(false);
    expect(res.estado).toBe('CONFIRMADO');
    expect(res.cargo?.montoFinal).toBe(15000);
  });

  it('al marcar NO_ASISTE anula cargo impago, pero bloquea si ya registró pagos', async () => {
    const prisma = crearMockPrisma();
    const service = new CampamentosService(prisma);

    // Caso 1: impago -> anula
    prisma.campamentoInscripcion.findUnique.mockResolvedValueOnce({
      id: 21,
      campamentoId: 7,
      usuarioId: 10,
      estado: 'CONFIRMADO',
      observaciones: null,
      cargo: { id: 300, montoPagado: 0, estado: EstadoCargo.PENDIENTE },
      campamento: {
        id: 7,
        estado: 'PUBLICADO',
        cicloAnio: 2026,
        fechaLimiteConfirmacion: new Date('2028-01-01T23:59:59.000Z'),
      },
    });
    prisma.entregaFormulario.findFirst.mockResolvedValueOnce({ id: 1 });
    prisma.campamentoInscripcion.update.mockResolvedValueOnce({
      id: 21,
      estado: 'NO_ASISTE',
      confirmadoAt: null,
    });

    const ok = await service.responder(10, 7, { accion: 'NO_ASISTE' });
    expect(prisma.cargoMiembro.update).toHaveBeenCalledWith({
      where: { id: 300 },
      data: { estado: EstadoCargo.ANULADO },
    });
    expect(ok.estado).toBe('NO_ASISTE');

    // Caso 2: con pago -> bloquea
    prisma.campamentoInscripcion.findUnique.mockResolvedValueOnce({
      id: 21,
      campamentoId: 7,
      usuarioId: 10,
      estado: 'CONFIRMADO',
      cargo: { id: 300, montoPagado: 5000, estado: EstadoCargo.PARCIAL },
      campamento: {
        id: 7,
        estado: 'PUBLICADO',
        cicloAnio: 2026,
        fechaLimiteConfirmacion: new Date('2028-01-01T23:59:59.000Z'),
      },
    });
    prisma.entregaFormulario.findFirst.mockResolvedValueOnce({ id: 1 });

    await expect(service.responder(10, 7, { accion: 'NO_ASISTE' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('educador puede dar de baja una inscripción pagada pasando el dinero a saldo a favor y anulando el cargo', async () => {
    const prisma = crearMockPrisma();
    const service = new CampamentosService(prisma);

    prisma.campamentoInscripcion.findUnique.mockResolvedValueOnce({
      id: 21,
      campamentoId: 7,
      usuarioId: 10,
      estado: 'CONFIRMADO',
      cargo: { id: 300, montoPagado: 15000, estado: EstadoCargo.PAGADO },
      campamento: { id: 7, unidadId: 3, creadoPorUsuarioId: 20 },
    });
    prisma.pagoImputacion.findMany.mockResolvedValueOnce([]);
    prisma.usuario.update = vi.fn().mockResolvedValueOnce({ id: 10 });
    prisma.campamentoInscripcion.update.mockResolvedValueOnce({
      id: 21,
      estado: 'CANCELADO',
    });

    const res = await service.gestionarInscripcion(
      { tipo: 'UNIDAD', unidadIds: [3], usuarioIdPropio: 20 },
      actorUnidad,
      7,
      10,
      { estado: 'CANCELADO' },
    );

    expect(prisma.usuario.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { saldoAFavor: { increment: new Prisma.Decimal(15000) } },
    });
    expect(prisma.cargoMiembro.update).toHaveBeenCalledWith({
      where: { id: 300 },
      data: { montoPagado: 0, estado: EstadoCargo.ANULADO },
    });
    expect(res.saldoLiberado).toBe(15000);
  });

  it('respeta alcance RBAC (PROPIO bloqueado en gestión, UNIDAD bloqueado fuera de su unidad) y bloquea eliminar con pagos', async () => {
    const prisma = crearMockPrisma();
    const service = new CampamentosService(prisma);
    const alcancePropio: AlcanceAcceso = { tipo: 'PROPIO', usuarioId: 10 };

    await expect(service.listarGestion(alcancePropio, 10, {})).rejects.toThrow(ForbiddenException);
    await expect(
      service.crear({ tipo: 'UNIDAD', unidadIds: [3], usuarioIdPropio: 20 }, actorUnidad, {
        titulo: 'Global',
        lugar: 'Tandil',
        fechaInicio: '2026-11-28',
        fechaFin: '2026-11-30',
        unidadId: null,
      }),
    ).rejects.toThrow(ForbiddenException);

    prisma.campamento.findUnique.mockResolvedValueOnce({
      id: 7,
      unidadId: 3,
      creadoPorUsuarioId: 20,
      inscripciones: [{ cargo: { id: 300, montoPagado: 5000, estado: EstadoCargo.PARCIAL } }],
    });
    await expect(
      service.eliminar({ tipo: 'UNIDAD', unidadIds: [3], usuarioIdPropio: 20 }, 20, 7),
    ).rejects.toThrow(ConflictException);
  });

  it('crea campamento con múltiples unidadesIds y restringe si UNIDAD incluye rama ajena', async () => {
    const prisma = crearMockPrisma();
    const service = new CampamentosService(prisma);

    await expect(
      service.crear({ tipo: 'UNIDAD', unidadIds: [3], usuarioIdPropio: 20 }, actorUnidad, {
        titulo: 'Multi ajeno',
        lugar: 'Tandil',
        fechaInicio: '2026-11-28',
        fechaFin: '2026-11-30',
        unidadesIds: [3, 4],
      }),
    ).rejects.toThrow(ForbiddenException);

    prisma.unidadOrganizativa.findMany.mockResolvedValueOnce([{ id: 2 }, { id: 3 }]);
    prisma.usuario.findMany.mockResolvedValueOnce([{ id: 10 }, { id: 11 }, { id: 12 }]);
    prisma.campamento.create.mockResolvedValueOnce({
      id: 8,
      titulo: 'Inter-ramas',
      lugar: 'Tandil',
      fechaInicio: new Date('2026-11-28T00:00:00.000Z'),
      fechaFin: new Date('2026-11-30T00:00:00.000Z'),
      costoBase: 0,
      unidadId: null,
      estado: 'PUBLICADO',
    });

    const ok = await service.crear({ tipo: 'GLOBAL' }, actorGlobal, {
      titulo: 'Inter-ramas',
      lugar: 'Tandil',
      fechaInicio: '2026-11-28',
      fechaFin: '2026-11-30',
      unidadesIds: [2, 3],
      costoBase: 0,
    });

    expect(prisma.usuario.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          asignaciones: { some: { activo: true, unidadId: { in: [2, 3] } } },
        }),
      }),
    );
    expect(prisma.campamento.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          unidadId: null,
          unidades: {
            createMany: {
              data: [{ unidadId: 2 }, { unidadId: 3 }],
              skipDuplicates: true,
            },
          },
        }),
      }),
    );
    expect(ok.totalInvitados).toBe(3);
  });

  it('edita destinatarios de campamento sincronizando invitados y bloquea si un removido ya tiene pagos', async () => {
    const prisma = crearMockPrisma();
    const service = new CampamentosService(prisma);

    // 1) Caso bloqueado por pago en miembro quitado
    prisma.campamento.findUnique.mockResolvedValueOnce({
      id: 7,
      titulo: 'Camp',
      lugar: 'Tandil',
      fechaInicio: new Date('2026-11-28T00:00:00.000Z'),
      fechaFin: new Date('2026-11-30T00:00:00.000Z'),
      fechaLimiteConfirmacion: null,
      estado: 'PUBLICADO',
      destinatarioTipo: 'PROTAGONISTAS',
      unidadId: 2,
      cicloAnio: 2026,
      costoBase: 10000,
      permiteDescuentoHermanos: true,
      porcentajeDescuentoHermanos: null,
      rubroId: null,
      conceptoCuotaId: 50,
      creadoPorUsuarioId: 1,
      unidades: [{ unidadId: 2 }],
      inscripciones: [
        { id: 100, usuarioId: 10, estado: 'CONFIRMADO', cargoId: 300, cargo: { id: 300, montoPagado: 5000, estado: EstadoCargo.PARCIAL } },
      ],
    });
    prisma.unidadOrganizativa.findMany.mockResolvedValueOnce([{ id: 3 }]);
    prisma.usuario.findMany.mockResolvedValueOnce([{ id: 20 }]);

    await expect(
      service.editar({ tipo: 'GLOBAL' }, actorGlobal, 7, { unidadesIds: [3] }),
    ).rejects.toThrow(ConflictException);

    // 2) Caso exitoso: quita usuario 10 con cargo impago (lo anula), agrega usuario 20, conserva usuario 15
    prisma.campamento.findUnique.mockResolvedValueOnce({
      id: 7,
      titulo: 'Camp',
      lugar: 'Tandil',
      fechaInicio: new Date('2026-11-28T00:00:00.000Z'),
      fechaFin: new Date('2026-11-30T00:00:00.000Z'),
      fechaLimiteConfirmacion: null,
      estado: 'PUBLICADO',
      destinatarioTipo: 'PROTAGONISTAS',
      unidadId: 2,
      cicloAnio: 2026,
      costoBase: 10000,
      permiteDescuentoHermanos: true,
      porcentajeDescuentoHermanos: null,
      rubroId: null,
      conceptoCuotaId: 50,
      creadoPorUsuarioId: 1,
      unidades: [{ unidadId: 2 }],
      inscripciones: [
        { id: 100, usuarioId: 10, estado: 'CONFIRMADO', cargoId: 300, cargo: { id: 300, montoPagado: 0, estado: EstadoCargo.PENDIENTE } },
        { id: 101, usuarioId: 15, estado: 'PENDIENTE', cargoId: null, cargo: null },
      ],
    });
    prisma.unidadOrganizativa.findMany.mockResolvedValueOnce([{ id: 3 }, { id: 4 }]);
    prisma.usuario.findMany.mockResolvedValueOnce([{ id: 15 }, { id: 20 }]);
    prisma.campamento.update.mockResolvedValueOnce({ id: 7, titulo: 'Camp', estado: 'PUBLICADO' });

    const editRes = await service.editar({ tipo: 'GLOBAL' }, actorGlobal, 7, {
      unidadesIds: [3, 4],
    });

    expect(prisma.cargoMiembro.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [300] }, montoPagado: 0 },
      data: { estado: EstadoCargo.ANULADO },
    });
    expect(prisma.campamentoInscripcion.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: [100] } },
    });
    expect(prisma.campamentoInscripcion.createMany).toHaveBeenCalledWith({
      data: [{ campamentoId: 7, usuarioId: 20, estado: 'PENDIENTE' }],
      skipDuplicates: true,
    });
    expect(prisma.campamentoUnidad.createMany).toHaveBeenCalledWith({
      data: [
        { campamentoId: 7, unidadId: 3 },
        { campamentoId: 7, unidadId: 4 },
      ],
      skipDuplicates: true,
    });
    expect(editRes.totalInvitados).toBe(2);
  });

  it('editar otros campos reenviando los mismos destinatarios no toca las inscripciones', async () => {
    const prisma = crearMockPrisma();
    const service = new CampamentosService(prisma);

    prisma.campamento.findUnique.mockResolvedValueOnce({
      id: 7,
      titulo: 'Camp',
      lugar: 'Tandil',
      fechaInicio: new Date('2026-11-28T00:00:00.000Z'),
      fechaFin: new Date('2026-11-30T00:00:00.000Z'),
      fechaLimiteConfirmacion: null,
      estado: 'PUBLICADO',
      destinatarioTipo: 'PROTAGONISTAS',
      unidadId: null,
      cicloAnio: 2026,
      costoBase: 10000,
      permiteDescuentoHermanos: true,
      porcentajeDescuentoHermanos: null,
      rubroId: null,
      conceptoCuotaId: 50,
      creadoPorUsuarioId: 1,
      unidades: [{ unidadId: 2 }, { unidadId: 3 }],
      inscripciones: [
        // Usuario 10 se pasó de rama: no debe perder su inscripción confirmada y pagada.
        { id: 100, usuarioId: 10, estado: 'CONFIRMADO', cargoId: 300, cargo: { id: 300, montoPagado: 5000, estado: EstadoCargo.PARCIAL } },
      ],
    });
    prisma.cargoMiembro.findMany.mockResolvedValueOnce([]);
    prisma.campamento.update.mockResolvedValueOnce({ id: 7, titulo: 'Camp corregido', estado: 'PUBLICADO' });

    const res = await service.editar({ tipo: 'GLOBAL' }, actorGlobal, 7, {
      titulo: 'Camp corregido',
      destinatarioTipo: 'PROTAGONISTAS',
      unidadesIds: [3, 2],
      costoBase: 10000,
    });

    expect(prisma.usuario.findMany).not.toHaveBeenCalled();
    expect(prisma.campamentoInscripcion.deleteMany).not.toHaveBeenCalled();
    expect(prisma.campamentoInscripcion.createMany).not.toHaveBeenCalled();
    expect(prisma.campamentoUnidad.deleteMany).not.toHaveBeenCalled();
    expect(prisma.cargoMiembro.updateMany).not.toHaveBeenCalled();
    expect(res.totalInvitados).toBe(1);
  });

  it('editar con los mismos invitados en modo USUARIOS no re-sincroniza', async () => {
    const prisma = crearMockPrisma();
    const service = new CampamentosService(prisma);

    prisma.campamento.findUnique.mockResolvedValueOnce({
      id: 8,
      titulo: 'Salida',
      lugar: 'Sierras',
      fechaInicio: new Date('2026-11-28T00:00:00.000Z'),
      fechaFin: new Date('2026-11-29T00:00:00.000Z'),
      fechaLimiteConfirmacion: null,
      estado: 'PUBLICADO',
      destinatarioTipo: 'USUARIOS',
      unidadId: null,
      cicloAnio: 2026,
      costoBase: 0,
      permiteDescuentoHermanos: true,
      porcentajeDescuentoHermanos: null,
      rubroId: null,
      conceptoCuotaId: null,
      creadoPorUsuarioId: 1,
      unidades: [],
      inscripciones: [
        { id: 200, usuarioId: 10, estado: 'PENDIENTE', cargoId: null, cargo: null },
        { id: 201, usuarioId: 11, estado: 'CONFIRMADO', cargoId: null, cargo: null },
      ],
    });
    prisma.campamento.update.mockResolvedValueOnce({ id: 8, titulo: 'Salida', estado: 'PUBLICADO' });

    await service.editar({ tipo: 'GLOBAL' }, actorGlobal, 8, {
      lugar: 'Sierras Chicas',
      destinatarioTipo: 'USUARIOS',
      unidadesIds: [],
      usuariosIds: [11, 10],
    });

    expect(prisma.usuario.findMany).not.toHaveBeenCalled();
    expect(prisma.campamentoInscripcion.deleteMany).not.toHaveBeenCalled();
    expect(prisma.campamentoInscripcion.createMany).not.toHaveBeenCalled();
  });

  it('al cancelar un campamento anula sus deudas y pasa lo pagado a Saldo a favor', async () => {
    const prisma = crearMockPrisma();
    const service = new CampamentosService(prisma);

    prisma.campamento.findUnique.mockResolvedValueOnce({
      id: 9,
      titulo: 'Camp',
      lugar: 'Tandil',
      fechaInicio: new Date('2026-11-28T00:00:00.000Z'),
      fechaFin: new Date('2026-11-30T00:00:00.000Z'),
      fechaLimiteConfirmacion: null,
      estado: 'PUBLICADO',
      destinatarioTipo: 'PROTAGONISTAS',
      unidadId: 2,
      cicloAnio: 2026,
      costoBase: 10000,
      permiteDescuentoHermanos: true,
      porcentajeDescuentoHermanos: null,
      rubroId: null,
      conceptoCuotaId: 50,
      creadoPorUsuarioId: 1,
      unidades: [{ unidadId: 2 }],
      inscripciones: [
        { id: 100, usuarioId: 10, estado: 'CONFIRMADO', cargoId: 300, cargo: { id: 300, montoPagado: 0, estado: EstadoCargo.PENDIENTE } },
        { id: 101, usuarioId: 11, estado: 'CONFIRMADO', cargoId: 301, cargo: { id: 301, montoPagado: 4000, estado: EstadoCargo.PARCIAL } },
        { id: 102, usuarioId: 12, estado: 'NO_ASISTE', cargoId: 302, cargo: { id: 302, montoPagado: 0, estado: EstadoCargo.ANULADO } },
        { id: 103, usuarioId: 13, estado: 'PENDIENTE', cargoId: null, cargo: null },
      ],
    });
    prisma.pagoImputacion.findMany.mockResolvedValueOnce([]);
    prisma.usuario.update = vi.fn();
    prisma.campamento.update.mockResolvedValueOnce({ id: 9, titulo: 'Camp', estado: 'CANCELADO' });

    await service.editar({ tipo: 'GLOBAL' }, actorGlobal, 9, { estado: 'CANCELADO' });

    expect(prisma.cargoMiembro.update).toHaveBeenCalledTimes(2);
    expect(prisma.cargoMiembro.update).toHaveBeenCalledWith({
      where: { id: 300 },
      data: { montoPagado: 0, estado: EstadoCargo.ANULADO },
    });
    expect(prisma.cargoMiembro.update).toHaveBeenCalledWith({
      where: { id: 301 },
      data: { montoPagado: 0, estado: EstadoCargo.ANULADO },
    });
    expect(prisma.usuario.update).toHaveBeenCalledWith({
      where: { id: 11 },
      data: { saldoAFavor: { increment: expect.anything() } },
    });
    expect(Number(prisma.usuario.update.mock.calls[0][0].data.saldoAFavor.increment)).toBe(4000);
  });

  it('si el costo pasa de 0 a más de 0, genera el cargo a quienes ya confirmaron', async () => {
    const prisma = crearMockPrisma();
    const service = new CampamentosService(prisma);

    prisma.campamento.findUnique.mockResolvedValueOnce({
      id: 10,
      titulo: 'Salida',
      lugar: 'Sierras',
      fechaInicio: new Date('2026-11-28T00:00:00.000Z'),
      fechaFin: new Date('2026-11-29T00:00:00.000Z'),
      fechaLimiteConfirmacion: null,
      estado: 'PUBLICADO',
      destinatarioTipo: 'PROTAGONISTAS',
      unidadId: 2,
      cicloAnio: 2026,
      costoBase: 0,
      permiteDescuentoHermanos: true,
      porcentajeDescuentoHermanos: null,
      rubroId: null,
      conceptoCuotaId: null,
      creadoPorUsuarioId: 1,
      unidades: [{ unidadId: 2 }],
      inscripciones: [
        { id: 100, usuarioId: 10, estado: 'CONFIRMADO', cargoId: null, cargo: null },
        { id: 101, usuarioId: 11, estado: 'PENDIENTE', cargoId: null, cargo: null },
        { id: 102, usuarioId: 12, estado: 'NO_ASISTE', cargoId: null, cargo: null },
      ],
    });
    prisma.conceptoCuota.create.mockResolvedValueOnce({ id: 60 });
    prisma.cargoMiembro.findMany.mockResolvedValueOnce([]);
    prisma.usuario.findMany.mockResolvedValueOnce([
      { id: 10, grupoFamiliar: { porcentajeDescuentoHermanos: new Prisma.Decimal(10) } },
    ]);
    prisma.cargoMiembro.create.mockResolvedValueOnce({ id: 400 });
    prisma.campamento.update.mockResolvedValueOnce({ id: 10, titulo: 'Salida', estado: 'PUBLICADO' });

    await service.editar({ tipo: 'GLOBAL' }, actorGlobal, 10, { costoBase: 8000 });

    expect(prisma.cargoMiembro.create).toHaveBeenCalledTimes(1);
    const dataCargo = prisma.cargoMiembro.create.mock.calls[0][0].data;
    expect(dataCargo.usuarioId).toBe(10);
    expect(dataCargo.conceptoId).toBe(60);
    expect(Number(dataCargo.montoFinal)).toBe(7200);
    expect(dataCargo.estado).toBe(EstadoCargo.PENDIENTE);
    expect(prisma.campamentoInscripcion.update).toHaveBeenCalledWith({
      where: { id: 100 },
      data: { cargoId: 400 },
    });
  });

  it('el miembro no puede revertir una baja registrada por su educador', async () => {
    const prisma = crearMockPrisma();
    const service = new CampamentosService(prisma);

    prisma.campamentoInscripcion.findUnique.mockResolvedValue({
      id: 100,
      estado: 'CANCELADO',
      campamento: {
        id: 7,
        estado: 'PUBLICADO',
        fechaLimiteConfirmacion: null,
        costoBase: 10000,
        conceptoCuotaId: 50,
        cicloAnio: 2026,
      },
      cargo: null,
    });

    await expect(service.responder(10, 7, { accion: 'CONFIRMAR' })).rejects.toThrow(
      ForbiddenException,
    );
    await expect(service.responder(10, 7, { accion: 'NO_ASISTE' })).rejects.toThrow(
      ForbiddenException,
    );
    expect(prisma.cargoMiembro.create).not.toHaveBeenCalled();
    expect(prisma.campamentoInscripcion.update).not.toHaveBeenCalled();
  });

  it('si dos confirmaciones llegan a la vez, la segunda falla y no deja un cargo vinculado de más', async () => {
    const prisma = crearMockPrisma();
    const service = new CampamentosService(prisma);

    prisma.campamentoInscripcion.findUnique.mockResolvedValueOnce({
      id: 100,
      usuarioId: 10,
      estado: 'PENDIENTE',
      cargoId: null,
      cargo: null,
      campamento: {
        id: 7,
        estado: 'PUBLICADO',
        fechaLimiteConfirmacion: null,
        costoBase: 10000,
        conceptoCuotaId: 50,
        permiteDescuentoHermanos: false,
        porcentajeDescuentoHermanos: null,
        cicloAnio: 2026,
      },
    });
    prisma.entregaFormulario.findFirst.mockResolvedValueOnce(null);
    prisma.usuario.findUnique.mockResolvedValueOnce({ grupoFamiliar: null });
    prisma.cargoMiembro.create.mockResolvedValueOnce({ id: 500 });
    // Otra solicitud ya vinculó un cargo: el vínculo condicional no afecta filas.
    prisma.campamentoInscripcion.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(service.responder(10, 7, { accion: 'CONFIRMAR' })).rejects.toThrow(
      ConflictException,
    );
    expect(prisma.campamentoInscripcion.updateMany).toHaveBeenCalledWith({
      where: { id: 100, cargoId: null },
      data: { cargoId: 500 },
    });
    expect(prisma.campamentoInscripcion.update).not.toHaveBeenCalled();
  });

  it('no elimina un campamento si un cargo desvinculado de su concepto tiene pagos', async () => {
    const prisma = crearMockPrisma();
    const service = new CampamentosService(prisma);

    prisma.campamento.findUnique.mockResolvedValueOnce({
      id: 7,
      unidadId: 3,
      conceptoCuotaId: 50,
      creadoPorUsuarioId: 1,
      unidades: [{ unidadId: 3 }],
      inscripciones: [{ cargo: null }],
    });
    prisma.cargoMiembro.count.mockResolvedValueOnce(1);

    await expect(service.eliminar({ tipo: 'GLOBAL' }, 1, 7)).rejects.toThrow(ConflictException);
    expect(prisma.cargoMiembro.count).toHaveBeenCalledWith({
      where: { conceptoId: 50, montoPagado: { gt: 0 } },
    });
    expect(prisma.campamento.delete).not.toHaveBeenCalled();
  });

  it('no envía el aviso automático si el usuario no tiene permiso de avisos', async () => {
    const prisma = crearMockPrisma();
    const avisos = { crear: vi.fn() } as any;
    const service = new CampamentosService(prisma, avisos);

    prisma.unidadOrganizativa.findMany.mockResolvedValueOnce([{ id: 3 }]);
    prisma.usuario.findMany.mockResolvedValueOnce([{ id: 30 }]);
    prisma.campamento.create.mockResolvedValueOnce({
      id: 11,
      titulo: 'Camp rama',
      lugar: 'Tandil',
      fechaInicio: new Date('2026-12-05T00:00:00.000Z'),
      fechaFin: new Date('2026-12-07T00:00:00.000Z'),
      costoBase: 0,
      unidadId: 3,
      estado: 'PUBLICADO',
    });

    // actorUnidad tiene campamentos.editar pero no avisos.editar
    await service.crear(
      { tipo: 'UNIDAD', unidadIds: [3], usuarioIdPropio: 20 },
      actorUnidad,
      {
        titulo: 'Camp rama',
        lugar: 'Tandil',
        fechaInicio: '2026-12-05',
        fechaFin: '2026-12-07',
        unidadesIds: [3],
        notificarAviso: true,
      },
    );

    expect(avisos.crear).not.toHaveBeenCalled();
  });

  it('no permite reactivar un campamento cancelado', async () => {
    const prisma = crearMockPrisma();
    const service = new CampamentosService(prisma);

    prisma.campamento.findUnique.mockResolvedValueOnce({
      id: 9,
      estado: 'CANCELADO',
      destinatarioTipo: 'PROTAGONISTAS',
      unidadId: 2,
      creadoPorUsuarioId: 1,
      unidades: [{ unidadId: 2 }],
      inscripciones: [],
    });

    await expect(
      service.editar({ tipo: 'GLOBAL' }, actorGlobal, 9, { estado: 'PUBLICADO' }),
    ).rejects.toThrow(ConflictException);
    expect(prisma.campamento.update).not.toHaveBeenCalled();
  });

  it('al eliminar un campamento elimina también las alertas vinculadas y el concepto si no tiene cargos', async () => {
    const prisma = crearMockPrisma();
    const service = new CampamentosService(prisma);

    prisma.campamento.findUnique.mockResolvedValueOnce({
      id: 7,
      unidadId: 3,
      conceptoCuotaId: 50,
      creadoPorUsuarioId: 20,
      unidades: [{ unidadId: 3 }],
      inscripciones: [{ cargo: { id: 300, montoPagado: 0, estado: EstadoCargo.PENDIENTE } }],
    });

    const res = await service.eliminar({ tipo: 'GLOBAL' }, 1, 7);

    expect(prisma.cargoMiembro.deleteMany).toHaveBeenCalledWith({
      where: { conceptoId: 50, montoPagado: 0 },
    });
    expect(prisma.aviso.deleteMany).toHaveBeenCalledWith({
      where: { campamentoId: 7 },
    });
    expect(prisma.campamento.delete).toHaveBeenCalledWith({
      where: { id: 7 },
    });
    expect(prisma.conceptoCuota.deleteMany).toHaveBeenCalledWith({
      where: { id: 50, cargos: { none: {} } },
    });
    expect(res).toEqual({ eliminado: true, id: 7 });
  });
});
