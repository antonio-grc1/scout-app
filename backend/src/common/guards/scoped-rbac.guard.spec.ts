import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AlcanceRol } from '@prisma/client';
import { REQUIRED_PERMISSION_KEY } from '../decorators/auth.decorators.js';
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
    expect(resolverAlcance(u, 'cuotas.cobrar')).toEqual({ tipo: 'UNIDAD', unidadIds: [2] });
  });

  it('UNIDAD junta las unidades sin duplicar', () => {
    const u = user(
      asig(2, AlcanceRol.UNIDAD, ['miembros.ver']),
      asig(3, AlcanceRol.UNIDAD, ['miembros.ver']),
      asig(2, AlcanceRol.UNIDAD, ['miembros.ver']),
    );
    expect(resolverAlcance(u, 'miembros.ver')).toEqual({ tipo: 'UNIDAD', unidadIds: [2, 3] });
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
  const ctxCon = (req: Partial<AuthenticatedRequest>, permiso?: string): ExecutionContext => {
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
    expect(req.alcance).toEqual({ tipo: 'UNIDAD', unidadIds: [2] });
  });
});
