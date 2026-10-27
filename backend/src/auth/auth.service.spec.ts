import { BadRequestException } from '@nestjs/common';
import bcrypt from 'bcrypt';
import { describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../common/types/auth.types.js';
import { CambiarClaveSchema } from './auth.dto.js';
import { AuthService } from './auth.service.js';

describe('AuthService - Cambio y Reset de Clave', () => {
  const crearMockPrisma = (usuario: any) => {
    const mock: any = {
      usuario: {
        findUnique: vi.fn().mockResolvedValue(usuario),
        findFirst: vi.fn().mockResolvedValue(usuario),
        update: vi.fn().mockImplementation((args: any) =>
          Promise.resolve({ ...usuario, ...args.data, asignaciones: [] }),
        ),
      },
    };
    return mock;
  };

  const mockJwt: any = {
    signAsync: vi.fn().mockResolvedValue('jwt-mock-token'),
  };

  it('CambiarClaveSchema acepta tanto claveActual/claveNueva como passwordActual/passwordNueva', () => {
    const r1 = CambiarClaveSchema.safeParse({
      claveActual: 'actual1234',
      claveNueva: 'nuevaClave1234',
    });
    expect(r1.success).toBe(true);
    if (r1.success) {
      expect(r1.data.claveActual).toBe('actual1234');
      expect(r1.data.claveNueva).toBe('nuevaClave1234');
    }

    const r2 = CambiarClaveSchema.safeParse({
      passwordActual: 'actual1234',
      passwordNueva: 'nuevaClave1234',
    });
    expect(r2.success).toBe(true);
    if (r2.success) {
      expect(r2.data.claveActual).toBe('actual1234');
      expect(r2.data.claveNueva).toBe('nuevaClave1234');
    }
  });

  it('CambiarClaveSchema rechaza si la clave nueva es menor a 8 caracteres o igual a la actual', () => {
    const rCorto = CambiarClaveSchema.safeParse({
      claveActual: 'actual1234',
      claveNueva: 'corta',
    });
    expect(rCorto.success).toBe(false);

    const rIgual = CambiarClaveSchema.safeParse({
      claveActual: 'claveMisma1234',
      claveNueva: 'claveMisma1234',
    });
    expect(rIgual.success).toBe(false);
  });

  it('cambiarClave rechaza si la clave actual es incorrecta', async () => {
    const hash = await bcrypt.hash('claveVieja123', 6);
    const usuarioMock = {
      id: 5,
      dni: '40111222',
      passwordHash: hash,
      activo: true,
      requiereCambioClave: true,
      asignaciones: [],
    };

    const prisma = crearMockPrisma(usuarioMock);
    const service = new AuthService(prisma, mockJwt);

    const actor: AuthUser = {
      sub: 5,
      dni: '40111222',
      nombre: 'Juan',
      apellido: 'Pérez',
      asignaciones: [],
    };

    await expect(
      service.cambiarClave(actor, {
        claveActual: 'claveIncorrecta',
        claveNueva: 'nuevaClaveSegura88',
      }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.cambiarClave(actor, {
        claveActual: 'claveIncorrecta',
        claveNueva: 'nuevaClaveSegura88',
      }),
    ).rejects.toThrow('La clave actual es incorrecta');
  });

  it('cambiarClave rechaza si la nueva clave es igual al DNI', async () => {
    const hash = await bcrypt.hash('claveVieja123', 6);
    const usuarioMock = {
      id: 5,
      dni: '40111222',
      passwordHash: hash,
      activo: true,
      requiereCambioClave: true,
      asignaciones: [],
    };

    const prisma = crearMockPrisma(usuarioMock);
    const service = new AuthService(prisma, mockJwt);

    const actor: AuthUser = {
      sub: 5,
      dni: '40111222',
      nombre: 'Juan',
      apellido: 'Pérez',
      asignaciones: [],
    };

    await expect(
      service.cambiarClave(actor, {
        claveActual: 'claveVieja123',
        claveNueva: '40111222',
      }),
    ).rejects.toThrow('La nueva clave no puede ser igual al DNI');
  });

  it('cambiarClave actualiza passwordHash y devuelve nueva sesión con requiereCambioClave: false', async () => {
    const hash = await bcrypt.hash('claveVieja123', 6);
    const usuarioMock = {
      id: 5,
      dni: '40111222',
      passwordHash: hash,
      nombre: 'Juan',
      apellido: 'Pérez',
      activo: true,
      requiereCambioClave: true,
      asignaciones: [],
    };

    const prisma = crearMockPrisma(usuarioMock);
    const service = new AuthService(prisma, mockJwt);

    const actor: AuthUser = {
      sub: 5,
      dni: '40111222',
      nombre: 'Juan',
      apellido: 'Pérez',
      asignaciones: [],
    };

    const res = await service.cambiarClave(actor, {
      claveActual: 'claveVieja123',
      claveNueva: 'claveSuperSecreta88',
    });

    expect(prisma.usuario.update).toHaveBeenCalled();
    expect(res.accessToken).toBe('jwt-mock-token');
    expect(res.requiereCambioClave).toBe(false);
  });
});
