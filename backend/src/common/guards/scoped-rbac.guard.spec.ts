import { ForbiddenException, HttpStatus, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AlcanceRol, Prisma } from '@prisma/client';
import { vi } from 'vitest';
import {
  PERMITIR_AUTOGESTION_PROPIA_KEY,
  REQUIRED_PERMISSION_KEY,
} from '../decorators/auth.decorators.js';
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
    expect(resolverAlcance(user(asig(2, AlcanceRol.UNIDAD, ['padron.ver'])), 'cobranzas.editar')).toBeNull();
  });

  it('GLOBAL prevalece sobre UNIDAD', () => {
    const u = user(asig(2, AlcanceRol.UNIDAD, ['padron.ver']), asig(7, AlcanceRol.GLOBAL, ['padron.ver']));
    expect(resolverAlcance(u, 'padron.ver')).toEqual({ tipo: 'GLOBAL' });
  });

  it('GLOBAL sin el permiso no habilita (Educador Sin Rama acotado)', () => {
    const u = user(asig(7, AlcanceRol.GLOBAL, ['padron.ver']), asig(2, AlcanceRol.UNIDAD, ['cobranzas.editar']));
    expect(resolverAlcance(u, 'cobranzas.editar')).toEqual({
      tipo: 'UNIDAD',
      unidadIds: [2],
      usuarioIdPropio: 104,
    });
  });

  it('UNIDAD junta las unidades sin duplicar', () => {
    const u = user(
      asig(2, AlcanceRol.UNIDAD, ['padron.ver']),
      asig(3, AlcanceRol.UNIDAD, ['padron.ver']),
      asig(2, AlcanceRol.UNIDAD, ['padron.ver']),
    );
    expect(resolverAlcance(u, 'padron.ver')).toEqual({
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

  it('implica <panel>.ver cuando la asignación posee <panel>.editar', () => {
    expect(resolverAlcance(user(asig(2, AlcanceRol.UNIDAD, ['padron.editar'])), 'padron.ver')).toEqual({
      tipo: 'UNIDAD',
      unidadIds: [2],
      usuarioIdPropio: 104,
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
  const ctxCon = (
    req: Partial<AuthenticatedRequest>,
    permiso?: string | string[],
    autogestionPropia = false,
  ): ExecutionContext => {
    const handler = () => undefined;
    if (permiso) Reflect.defineMetadata(REQUIRED_PERMISSION_KEY, permiso, handler);
    if (autogestionPropia) Reflect.defineMetadata(PERMITIR_AUTOGESTION_PROPIA_KEY, true, handler);
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
    const req = { user: user(asig(2, AlcanceRol.UNIDAD, ['padron.ver'])) };
    expect(() => guard.canActivate(ctxCon(req, 'pases.editar'))).toThrow(ForbiddenException);
  });

  it('carga req.alcance cuando tiene el permiso', () => {
    const req: Partial<AuthenticatedRequest> = { user: user(asig(2, AlcanceRol.UNIDAD, ['padron.ver'])) };
    expect(guard.canActivate(ctxCon(req, 'padron.ver'))).toBe(true);
    expect(req.alcance).toEqual({ tipo: 'UNIDAD', unidadIds: [2], usuarioIdPropio: 104 });
  });

  it('permite acceso si tiene al menos uno de los permisos requeridos (alternativos)', () => {
    const req: Partial<AuthenticatedRequest> = { user: user(asig(3, AlcanceRol.UNIDAD, ['cobranzas.editar'])) };
    expect(guard.canActivate(ctxCon(req, ['padron.editar', 'cobranzas.editar']))).toBe(true);
    expect(req.alcance).toEqual({ tipo: 'UNIDAD', unidadIds: [3], usuarioIdPropio: 104 });
  });

  it('rechaza si no tiene ninguno de los permisos alternativos', () => {
    const req = { user: user(asig(3, AlcanceRol.UNIDAD, ['padron.ver'])) };
    expect(() =>
      guard.canActivate(ctxCon(req, ['padron.editar', 'cobranzas.editar'])),
    ).toThrow(ForbiddenException);
  });

  it('ARQ-04 & COD-01: bloquea sin @PermitirAutogestionPropia aunque el permiso fuese legajos.ver/cuotas.ver/miembros.ver, y habilita PROPIO solo con decorador explícito', () => {
    expect(resolverAlcance(user(), 'legajos.ver')).toBeNull();
    expect(
      resolverAlcance(user(asig(1, AlcanceRol.UNIDAD, ['eventos.editar'])), 'legajos.ver'),
    ).toBeNull();
    expect(
      resolverAlcance(user(asig(1, AlcanceRol.UNIDAD, ['eventos.editar'])), 'cobranzas.ver'),
    ).toBeNull();
    expect(
      resolverAlcance(user(asig(1, AlcanceRol.UNIDAD, ['eventos.editar'])), ['cobranzas.ver', 'caja.editar']),
    ).toBeNull();

    // Sin @PermitirAutogestionPropia: ForbiddenException
    const sinPermisoUser = user(asig(1, AlcanceRol.PROPIO, ['eventos.ver']));
    expect(() => guard.canActivate(ctxCon({ user: sinPermisoUser }, 'legajos.ver', false))).toThrow(
      ForbiddenException,
    );

    // Con @PermitirAutogestionPropia y al menos 1 asignación activa: habilita PROPIO
    const reqAutogestion: Partial<AuthenticatedRequest> = { user: sinPermisoUser };
    expect(guard.canActivate(ctxCon(reqAutogestion, ['cobranzas.ver', 'cobranzas.editar'], true))).toBe(true);
    expect(reqAutogestion.alcance).toEqual({ tipo: 'PROPIO', usuarioId: 104 });

    // Con @PermitirAutogestionPropia pero sin asignaciones activas: bloquea
    expect(() => guard.canActivate(ctxCon({ user: user() }, 'legajos.ver', true))).toThrow(ForbiddenException);
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

describe('JwtAuthGuard (P2 & Etapa 3 Cookie-Only)', () => {
  it('hidrata usuario con select mínimo en lugar de include completo desde cookie HttpOnly', async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id: 10,
      dni: '12345678',
      activo: true,
      requiereCambioClave: false,
      asignaciones: [
        {
          unidadId: 2,
          unidad: { nombre: 'Manada', activa: true },
          rol: {
            id: 3,
            nombre: 'Educador',
            tipoMiembro: 'EDUCADOR',
            requiereRama: true,
            tipoUnidad: 'SECCION_RAMA',
            activo: true,
            alcancePorDefecto: AlcanceRol.UNIDAD,
            permisos: [{ permiso: { clave: 'padron.ver' } }],
          },
        },
      ],
    });
    const guard = new JwtAuthGuard(
      new Reflector(),
      { verifyAsync: vi.fn().mockResolvedValue({ sub: 10, dni: '12345678', tokenVersion: 1 }) } as any,
      { usuario: { findUnique } } as any,
    );
    const req: any = { headers: { cookie: 'scout_access_token=token-valido' } };
    const ctx = {
      getHandler: () => () => undefined,
      getClass: () => class {},
      switchToHttp: () => ({ getRequest: () => req }),
    } as any;

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    const arg = findUnique.mock.calls[0][0];
    expect(arg.select).toBeDefined();
    expect(arg.include).toBeUndefined();
    expect(req.user.asignaciones[0].permisos).toEqual(['padron.ver']);
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
      { verifyAsync: vi.fn().mockResolvedValue({ sub: 10, dni: '12345678', tokenVersion: 2 }) } as any,
      { usuario: { findUnique } } as any,
    );
    const req: any = { headers: { cookie: 'scout_access_token=token-revocado' } };
    const ctx = {
      getHandler: () => () => undefined,
      getClass: () => class {},
      switchToHttp: () => ({ getRequest: () => req }),
    } as any;

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('A7 & ARQ-06: extraerTokenDeRequest solo acepta cookie scout_access_token (ignora Bearer) y JwtAuthGuard falla cerrado sin Prisma', async () => {
    expect(extraerTokenDeRequest({ headers: { authorization: 'Bearer tok-header' } })).toBeNull();
    expect(
      extraerTokenDeRequest({ headers: { cookie: 'pref=1; scout_access_token=tok%2Dcookie; otro=2' } }),
    ).toBe('tok-cookie');
    expect(extraerTokenDeRequest({ headers: {} })).toBeNull();

    const guardSinPrisma = new JwtAuthGuard(
      new Reflector(),
      { verifyAsync: vi.fn().mockResolvedValue({ sub: 10, dni: '12345678', tokenVersion: 1 }) } as any,
    );
    const reqSinPrisma: any = { headers: { cookie: 'scout_access_token=jwt-en-cookie' } };
    const ctxSinPrisma = {
      getHandler: () => () => undefined,
      getClass: () => class {},
      switchToHttp: () => ({ getRequest: () => reqSinPrisma }),
    } as any;
    await expect(guardSinPrisma.canActivate(ctxSinPrisma)).rejects.toThrow(UnauthorizedException);

    const findUnique = vi.fn().mockResolvedValue({
      id: 10,
      dni: '12345678',
      activo: true,
      requiereCambioClave: false,
      tokenVersion: 1,
      asignaciones: [],
    });
    const guard = new JwtAuthGuard(
      new Reflector(),
      { verifyAsync: vi.fn().mockResolvedValue({ sub: 10, dni: '12345678', tokenVersion: 1 }) } as any,
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
