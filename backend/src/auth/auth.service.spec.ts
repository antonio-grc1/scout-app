import { BadRequestException, HttpException } from '@nestjs/common';
import bcrypt from 'bcrypt';
import { describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../common/types/auth.types.js';
import { MailerService } from '../mailer/mailer.service.js';
import { CambiarClaveSchema } from './auth.dto.js';
import { AuthService } from './auth.service.js';
import { LoginRateLimitGuard } from './login-rate-limit.guard.js';

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

describe('LoginRateLimitGuard (P1-6) y MailerService (P3-1)', () => {
  it('LoginRateLimitGuard bloquea tras 10 intentos seguidos para el mismo IP+DNI con 429', () => {
    const guard = new LoginRateLimitGuard();
    const mkCtx = (ip: string, dni: string) =>
      ({
        switchToHttp: () => ({
          getRequest: () => ({ ip, headers: {}, body: { dni } }),
        }),
      }) as any;

    for (let i = 0; i < 10; i++) {
      expect(guard.canActivate(mkCtx('10.0.0.1', '30111222'))).toBe(true);
    }
    expect(() => guard.canActivate(mkCtx('10.0.0.1', '30111222'))).toThrow(HttpException);
    expect(guard.canActivate(mkCtx('10.0.0.1', '40999888'))).toBe(true);
  });

  it('MailerService no escapa entidades HTML en el subject y valida protocolo de APP_URL', async () => {
    const prevHost = process.env.SMTP_HOST;
    const prevUser = process.env.SMTP_USER;
    const prevPass = process.env.SMTP_PASS;
    const prevUrl = process.env.APP_URL;

    const sendMail = vi.fn().mockResolvedValue({});
    const mailer = new MailerService();
    (mailer as any).obtenerTransporter = () => ({ sendMail });
    process.env.APP_URL = 'javascript:alert(1)';

    try {
      const ok = await mailer.enviarBienvenidaAlta({
        destinatario: 'familia@test.com',
        nombre: "O'Connor & Cía",
        apellido: 'Test\r\nInyectado',
        dni: '40111222',
      });
      expect(ok).toBe(true);
      const sent = sendMail.mock.calls[0][0];
      expect(sent.subject).toBe("¡Bienvenido/a al Grupo Scout Juan XXIII! - Alta de O'Connor & Cía Test Inyectado");
      expect(sent.subject).not.toContain('&#039;');
      expect(sent.subject).not.toContain('&amp;');
      expect(sent.html).toContain('href="http://localhost:5173"');
      expect(sent.html).not.toContain('javascript:');
    } finally {
      process.env.SMTP_HOST = prevHost;
      process.env.SMTP_USER = prevUser;
      process.env.SMTP_PASS = prevPass;
      process.env.APP_URL = prevUrl;
    }
  });

  it('P1-6: cambiarClave y resetearClave incrementan tokenVersion para revocar sesiones previas', async () => {
    const hash = await bcrypt.hash('ClaveVieja123', 4);
    const updateMock = vi.fn().mockResolvedValue({
      id: 7,
      dni: '40111222',
      nombre: 'Ana',
      apellido: 'Scout',
      requiereCambioClave: false,
      tokenVersion: 2,
      asignaciones: [],
    });
    const prisma: any = {
      usuario: {
        findUnique: vi.fn().mockResolvedValue({
          id: 7,
          dni: '40111222',
          passwordHash: hash,
          activo: true,
        }),
        findFirst: vi.fn().mockResolvedValue({
          id: 7,
          dni: '40111222',
          nombre: 'Ana',
          apellido: 'Scout',
          asignaciones: [],
        }),
        update: updateMock,
      },
    };
    const jwt: any = { signAsync: vi.fn().mockResolvedValue('jwt-v2') };
    const service = new AuthService(prisma, jwt);

    await service.cambiarClave(
      { sub: 7, dni: '40111222', requiereCambioClave: true, asignaciones: [] },
      { claveActual: 'ClaveVieja123', claveNueva: 'NuevaClaveSegura1' },
    );
    expect(updateMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({ tokenVersion: { increment: 1 } }),
      }),
    );
    expect(jwt.signAsync).toHaveBeenCalledWith(expect.objectContaining({ tokenVersion: 2 }));

    const resReset = await service.resetearClave(
      { sub: 1, dni: '11111111', requiereCambioClave: false, asignaciones: [] },
      { tipo: 'GLOBAL' },
      7,
    );
    expect(resReset.claveTemporal).toBeDefined();
    expect(resReset.claveTemporal).not.toBe('40111222');
    expect(resReset.claveTemporal.length).toBeGreaterThanOrEqual(8);
    expect(updateMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          requiereCambioClave: true,
          tokenVersion: { increment: 1 },
        }),
      }),
    );
  });
});
