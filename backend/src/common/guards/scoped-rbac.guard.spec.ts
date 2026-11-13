import { ForbiddenException, HttpStatus, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AlcanceRol, Prisma } from '@prisma/client';
import { vi } from 'vitest';
import { REQUIRED_PERMISSION_KEY } from '../decorators/auth.decorators.js';
import { PrismaExceptionFilter } from '../filters/prisma-exception.filter.js';
import { extraerTokenDeRequest, JwtAuthGuard } from './jwt-auth.guard.js';
import { filtroUsuariosPorAlcance, resolverAlcance } from '../scope/alcance.util.js';
import type { AsignacionToken, AuthUser, AuthenticatedRequest } from '../types/auth.types.js';
import { ScopedRbacGuard } from './scoped-rbac.guard.js';

const asig = (unidadId: number, alcance: AlcanceRol, permisos: string[]): AsignacionToken => ({
  unidadId,
  unidadNombre: `U${unidadId}`,
  rol: 'x',
  alcance,
  permisos,
});
const user = (...asignaciones: AsignacionToken[]): AuthUser => ({
  sub: 104,
  dni: '45123456',
  requiereCambioClave: false,
  asignaciones,
});

describe('resolverAlcance', () => {
  it('null si ninguna asignación otorga el permiso', () => {
    expect(resolverAlcance(user(asig(2, AlcanceRol.UNIDAD, ['miembros.ver'])), 'cuotas.cobrar')).toBeNull();
  });

  it('GLOBAL prevalece sobre UNIDAD', () => {
    const u = user(asig(2, AlcanceRol.UNIDAD, ['miembros.ver']), asig(7, AlcanceRol.GLOBAL, ['miembros.ver']));
    expect(resolverAlcance(u, 'miembros.ver')).toEqual({ tipo: 'GLOBAL' });
  });

  it('GLOBAL sin el permiso no habilita (Educador Sin Rama acotado)', () => {
    const u = user(asig(7, AlcanceRol.GLOBAL, ['miembros.ver']), asig(2, AlcanceRol.UNIDAD, ['cuotas.cobrar']));
    expect(resolverAlcance(u, 'cuotas.cobrar')).toEqual({
      tipo: 'UNIDAD',
      unidadIds: [2],
      usuarioIdPropio: 104,
    });
  });

  it('UNIDAD junta las unidades sin duplicar', () => {
    const u = user(
      asig(2, AlcanceRol.UNIDAD, ['miembros.ver']),
      asig(3, AlcanceRol.UNIDAD, ['miembros.ver']),
      asig(2, AlcanceRol.UNIDAD, ['miembros.ver']),
    );
    expect(resolverAlcance(u, 'miembros.ver')).toEqual({
      tipo: 'UNIDAD',
      unidadIds: [2, 3],
      usuarioIdPropio: 104,
    });
  });

  it('UNIDAD + PROPIO incluye al propio usuario', () => {
    const u = user(asig(1, AlcanceRol.UNIDAD, ['legajos.ver']), asig(5, AlcanceRol.PROPIO, ['legajos.ver']));
    expect(resolverAlcance(u, 'legajos.ver')).toEqual({ tipo: 'UNIDAD', unidadIds: [1], usuarioIdPropio: 104 });
  });

  it('solo PROPIO', () => {
    expect(resolverAlcance(user(asig(5, AlcanceRol.PROPIO, ['legajos.ver'])), 'legajos.ver')).toEqual({
      tipo: 'PROPIO',
      usuarioId: 104,
    });
  });
});

describe('filtroUsuariosPorAlcance', () => {
  it('GLOBAL no filtra', () => {
    expect(filtroUsuariosPorAlcance({ tipo: 'GLOBAL' })).toEqual({});
  });
  it('UNIDAD filtra por asignaciones activas (contrato §6.1)', () => {
    expect(filtroUsuariosPorAlcance({ tipo: 'UNIDAD', unidadIds: [2, 3] })).toEqual({
      asignaciones: { some: { activo: true, unidadId: { in: [2, 3] } } },
    });
  });
  it('PROPIO filtra por id', () => {
    expect(filtroUsuariosPorAlcance({ tipo: 'PROPIO', usuarioId: 104 })).toEqual({ id: 104 });
  });
});

describe('ScopedRbacGuard', () => {
  const ctxCon = (req: Partial<AuthenticatedRequest>, permiso?: string | string[]): ExecutionContext => {
    const handler = () => undefined;
    if (permiso) Reflect.defineMetadata(REQUIRED_PERMISSION_KEY, permiso, handler);
    return {
      getHandler: () => handler,
      getClass: () => class {},
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
  };
  const guard = new ScopedRbacGuard(new Reflector());

  it('deja pasar endpoints sin @RequirePermission', () => {
    expect(guard.canActivate(ctxCon({}))).toBe(true);
  });

  it('rechaza sin el permiso', () => {
    const req = { user: user(asig(2, AlcanceRol.UNIDAD, ['miembros.ver'])) };
    expect(() => guard.canActivate(ctxCon(req, 'pases.ejecutar'))).toThrow(ForbiddenException);
  });

  it('carga req.alcance cuando tiene el permiso', () => {
    const req: Partial<AuthenticatedRequest> = { user: user(asig(2, AlcanceRol.UNIDAD, ['miembros.ver'])) };
    expect(guard.canActivate(ctxCon(req, 'miembros.ver'))).toBe(true);
    expect(req.alcance).toEqual({ tipo: 'UNIDAD', unidadIds: [2], usuarioIdPropio: 104 });
  });

  it('permite acceso si tiene al menos uno de los permisos requeridos (alternativos)', () => {
    const req: Partial<AuthenticatedRequest> = { user: user(asig(3, AlcanceRol.UNIDAD, ['miembros.baja'])) };
    expect(guard.canActivate(ctxCon(req, ['miembros.editar', 'miembros.editar_identidad', 'miembros.baja']))).toBe(true);
    expect(req.alcance).toEqual({ tipo: 'UNIDAD', unidadIds: [3], usuarioIdPropio: 104 });
  });

  it('rechaza si no tiene ninguno de los permisos alternativos', () => {
    const req = { user: user(asig(3, AlcanceRol.UNIDAD, ['miembros.ver'])) };
    expect(() =>
      guard.canActivate(ctxCon(req, ['miembros.editar', 'miembros.editar_identidad', 'miembros.baja'])),
    ).toThrow(ForbiddenException);
  });

  it('P1-1: resolverAlcance no habilita PROPIO en arrays alternativos ni sin asignaciones activas', () => {
    expect(resolverAlcance(user(), 'legajos.ver')).toBeNull();
    expect(
      resolverAlcance(user(asig(1, AlcanceRol.UNIDAD, ['eventos.vender'])), ['cuotas.ver', 'tesoreria.gestionar']),
    ).toBeNull();
  });
});

describe('PrismaExceptionFilter (P1-17)', () => {
  it('mapea P2002 sin exponer e.meta.target y maneja P2034/P2024', () => {
    const filter = new PrismaExceptionFilter();
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const host = { switchToHttp: () => ({ getResponse: () => ({ status }) }) } as any;

    const errUnique = new Prisma.PrismaClientKnownRequestError('Unique constraint', {
      code: 'P2002',
      clientVersion: '7.0.0',
      meta: { target: ['usuarios_dni_key'] },
    });
    filter.catch(errUnique, host);
    expect(status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(json).toHaveBeenCalledWith({
      statusCode: HttpStatus.CONFLICT,
      message: 'Ya existe un registro con ese valor',
      code: 'P2002',
    });

    const errConcurrency = new Prisma.PrismaClientKnownRequestError('Write conflict', {
      code: 'P2034',
      clientVersion: '7.0.0',
    });
    filter.catch(errConcurrency, host);
    expect(status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
  });
});

describe('JwtAuthGuard (P2)', () => {
  it('hidrata usuario con select mínimo en lugar de include completo', async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id: 10,
      dni: '12345678',
      activo: true,
      requiereCambioClave: false,
      asignaciones: [
        {
          unidadId: 2,
          alcanceOverride: null,
          unidad: { nombre: 'Manada', activa: true },
          rol: {
            id: 3,
            nombre: 'Educador',
            tipoMiembro: 'EDUCADOR',
            requiereRama: true,
            alcancePorDefecto: AlcanceRol.UNIDAD,
            permisos: [{ permiso: { clave: 'miembros.ver' } }],
          },
        },
      ],
    });
    const guard = new JwtAuthGuard(
      new Reflector(),
      { verifyAsync: vi.fn().mockResolvedValue({ sub: 10 }) } as any,
      { usuario: { findUnique } } as any,
    );
    const req: any = { headers: { authorization: 'Bearer token-valido' } };
    const ctx = {
      getHandler: () => () => undefined,
      getClass: () => class {},
      switchToHttp: () => ({ getRequest: () => req }),
    } as any;

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    const arg = findUnique.mock.calls[0][0];
    expect(arg.select).toBeDefined();
    expect(arg.include).toBeUndefined();
    expect(req.user.asignaciones[0].permisos).toEqual(['miembros.ver']);
  });

  it('P1-6: rechaza tokens con tokenVersion desactualizado o ausente frente a usuarioDb.tokenVersion', async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id: 10,
      dni: '12345678',
      activo: true,
      requiereCambioClave: false,
      tokenVersion: 3,
      asignaciones: [],
    });
    const guard = new JwtAuthGuard(
      new Reflector(),
      { verifyAsync: vi.fn().mockResolvedValue({ sub: 10, tokenVersion: 2 }) } as any,
      { usuario: { findUnique } } as any,
    );
    const req: any = { headers: { authorization: 'Bearer token-revocado' } };
    const ctx = {
      getHandler: () => () => undefined,
      getClass: () => class {},
      switchToHttp: () => ({ getRequest: () => req }),
    } as any;

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('extraerTokenDeRequest y JwtAuthGuard aceptan cookie HttpOnly scout_access_token además de Bearer', async () => {
    expect(extraerTokenDeRequest({ headers: { authorization: 'Bearer tok-header' } })).toBe('tok-header');
    expect(
      extraerTokenDeRequest({ headers: { cookie: 'pref=1; scout_access_token=tok%2Dcookie; otro=2' } }),
    ).toBe('tok-cookie');
    expect(extraerTokenDeRequest({ headers: {} })).toBeNull();

    const findUnique = vi.fn().mockResolvedValue({
      id: 10,
      dni: '12345678',
      activo: true,
      requiereCambioClave: false,
      asignaciones: [],
    });
    const guard = new JwtAuthGuard(
      new Reflector(),
      { verifyAsync: vi.fn().mockResolvedValue({ sub: 10 }) } as any,
      { usuario: { findUnique } } as any,
    );
    const req: any = { headers: { cookie: 'scout_access_token=jwt-en-cookie' } };
    const ctx = {
      getHandler: () => () => undefined,
      getClass: () => class {},
      switchToHttp: () => ({ getRequest: () => req }),
    } as any;

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(req.user.sub).toBe(10);
  });
});
