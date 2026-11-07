import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { AlcanceRol, TipoUnidad, EstadoEvento } from '@prisma/client';
import type { AlcanceAcceso, AuthUser } from '../src/common/types/auth.types.js';
import { assertUnidadEnAlcance } from '../src/common/scope/alcance.util.js';
import { MiembrosService } from '../src/miembros/miembros.service.js';
import { PasesService } from '../src/pases/pases.service.js';
import { AuthService } from '../src/auth/auth.service.js';
import { TesoreriaService } from '../src/tesoreria/tesoreria.service.js';
import { LegajosService } from '../src/legajos/legajos.service.js';

describe('BLOQUE 1 - Blindaje de Seguridad, Alcances y RBAC', () => {
  const alcanceUnidad: AlcanceAcceso = { tipo: 'UNIDAD', unidadIds: [1, 2], usuarioIdPropio: 99 };
  const alcancePropio: AlcanceAcceso = { tipo: 'PROPIO', usuarioId: 50 };
  const alcanceGlobal: AlcanceAcceso = { tipo: 'GLOBAL' };

  describe('ITEM-06: assertUnidadEnAlcance con unidadId nula o undefined', () => {
    it('permite unidadId null o undefined solo si el alcance es GLOBAL', () => {
      expect(() => assertUnidadEnAlcance(alcanceGlobal, null)).not.toThrow();
      expect(() => assertUnidadEnAlcance(alcanceGlobal, undefined)).not.toThrow();
      expect(() => assertUnidadEnAlcance(alcanceGlobal, 1)).not.toThrow();
    });

    it('bloquea unidadId null o undefined para alcance UNIDAD', () => {
      expect(() => assertUnidadEnAlcance(alcanceUnidad, null)).toThrow(ForbiddenException);
      expect(() => assertUnidadEnAlcance(alcanceUnidad, undefined)).toThrow(ForbiddenException);
    });

    it('permite unidadId dentro de sus unidadIds y bloquea fuera', () => {
      expect(() => assertUnidadEnAlcance(alcanceUnidad, 1)).not.toThrow();
      expect(() => assertUnidadEnAlcance(alcanceUnidad, 999)).toThrow(ForbiddenException);
    });
  });

  describe('ITEM-01: LegajosService.verificarQr con alcance', () => {
    const mockPrisma: any = {
      entregaFormulario: {
        findFirst: vi.fn(),
      },
    };
    const service = new LegajosService(mockPrisma);

    it('bloquea si el usuario con alcance UNIDAD consulta un QR de un miembro de otra unidad', async () => {
      mockPrisma.entregaFormulario.findFirst.mockResolvedValueOnce({
        id: 1,
        estado: 'PENDIENTE_FIRMA_FISICA',
        hashVerificacion: 'abcdef123456',
        usuario: {
          id: 200,
          dni: '40111222',
          asignaciones: [{ unidadId: 5 }],
        },
      });

      await expect(service.verificarQr(alcanceUnidad, 'abcdef123456')).rejects.toThrow(ForbiddenException);
    });

    it('bloquea si el usuario con alcance PROPIO consulta el QR de otro miembro', async () => {
      mockPrisma.entregaFormulario.findFirst.mockResolvedValueOnce({
        id: 1,
        estado: 'PENDIENTE_FIRMA_FISICA',
        hashVerificacion: 'abcdef123456',
        usuario: {
          id: 200,
          dni: '40111222',
          asignaciones: [{ unidadId: 1 }],
        },
      });

      await expect(service.verificarQr(alcancePropio, 'abcdef123456')).rejects.toThrow(ForbiddenException);
    });

    it('permite consultar QR si el miembro pertenece a la unidad del educador', async () => {
      mockPrisma.entregaFormulario.findFirst.mockResolvedValueOnce({
        id: 1,
        estado: 'PENDIENTE_FIRMA_FISICA',
        hashVerificacion: 'abcdef123456',
        usuario: {
          id: 200,
          dni: '40111222',
          asignaciones: [{ unidadId: 1 }],
        },
      });

      const res = await service.verificarQr(alcanceUnidad, 'abcdef123456');
      expect(res.id).toBe(1);
    });
  });

  describe('ITEM-03: PasesService control de privilegio en destino, auto-pase y Jefatura', () => {
    const mockTx: any = {
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
    const mockPrisma: any = {
      $transaction: vi.fn(async (cb: any) => cb(mockTx)),
    };
    const pasesService = new PasesService(mockPrisma);

    it('bloquea auto-pase para usuarios no globales', async () => {
      mockTx.asignacionMiembro.findUnique.mockResolvedValueOnce({
        id: 10,
        usuarioId: 99, // mismo que alcanceUnidad.usuarioIdPropio
        unidadId: 1,
        rolId: 1,
        activo: true,
        alcanceOverride: null,
        rol: { id: 1, nombre: 'Educador', alcancePorDefecto: AlcanceRol.UNIDAD },
        usuario: { id: 99, activo: true, fechaNacimiento: new Date('1990-01-01') },
      });

      await expect(
        pasesService.ejecutar(alcanceUnidad, {
          asignacionOrigenId: 10,
          unidadDestinoId: 2,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('exige rolDestinoId explícito al pasar a JEFATURA', async () => {
      mockTx.asignacionMiembro.findUnique.mockResolvedValueOnce({
        id: 10,
        usuarioId: 200,
        unidadId: 1,
        rolId: 1,
        activo: true,
        alcanceOverride: null,
        rol: { id: 1, nombre: 'Protagonista', alcancePorDefecto: AlcanceRol.PROPIO },
        usuario: { id: 200, activo: true, fechaNacimiento: new Date('2000-01-01') },
      });
      mockTx.unidadOrganizativa.findUnique.mockResolvedValueOnce({
        id: 8,
        nombre: 'Jefatura de Grupo',
        tipo: TipoUnidad.JEFATURA,
        activa: true,
      });

      await expect(
        pasesService.ejecutar(alcanceGlobal, {
          asignacionOrigenId: 10,
          unidadDestinoId: 8,
          // rolDestinoId omitido
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('bloquea asignar rol con alcance distinto de PROPIO a una unidad fuera de su alcance', async () => {
      mockTx.asignacionMiembro.findUnique.mockResolvedValueOnce({
        id: 10,
        usuarioId: 200,
        unidadId: 1,
        rolId: 1,
        activo: true,
        alcanceOverride: null,
        rol: { id: 1, nombre: 'Protagonista', alcancePorDefecto: AlcanceRol.PROPIO },
        usuario: { id: 200, activo: true, fechaNacimiento: new Date('2000-01-01') },
      });
      mockTx.unidadOrganizativa.findUnique.mockResolvedValueOnce({
        id: 999, // fuera de alcanceUnidad [1, 2]
        nombre: 'Comunidad Rover',
        tipo: TipoUnidad.SECCION_RAMA,
        activa: true,
      });
      mockTx.rol.findUnique.mockResolvedValueOnce({
        id: 5,
        nombre: 'Educador',
        alcancePorDefecto: AlcanceRol.UNIDAD,
      });

      await expect(
        pasesService.ejecutar(alcanceUnidad, {
          asignacionOrigenId: 10,
          unidadDestinoId: 999,
          rolDestinoId: 5,
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('ITEM-04: MiembrosService.agregarAsignacion', () => {
    const mockPrisma: any = {
      usuario: {
        findFirst: vi.fn(),
      },
      unidadOrganizativa: {
        findUnique: vi.fn(),
      },
      rol: {
        findUnique: vi.fn(),
      },
    };
    const service = new MiembrosService(mockPrisma);

    it('bloquea si un educador de UNIDAD intenta modificar asignaciones de un usuario con rol GLOBAL', async () => {
      mockPrisma.unidadOrganizativa.findUnique.mockResolvedValueOnce({ id: 1, activa: true, tipo: TipoUnidad.SECCION_RAMA });
      mockPrisma.rol.findUnique.mockResolvedValueOnce({ id: 2, activa: true, alcancePorDefecto: AlcanceRol.PROPIO });
      mockPrisma.usuario.findFirst.mockResolvedValueOnce({
        id: 15,
        activo: true,
        asignaciones: [
          { unidadId: 1, activo: true, rol: { alcancePorDefecto: AlcanceRol.GLOBAL }, alcanceOverride: null },
        ],
      });

      await expect(
        service.agregarAsignacion(alcanceUnidad, 15, { unidadId: 1, rolId: 2 }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('bloquea si el usuario objetivo no pertenece al alcance del actor', async () => {
      mockPrisma.unidadOrganizativa.findUnique.mockResolvedValueOnce({ id: 1, activa: true, tipo: TipoUnidad.SECCION_RAMA });
      mockPrisma.rol.findUnique.mockResolvedValueOnce({ id: 2, activa: true, alcancePorDefecto: AlcanceRol.PROPIO });
      mockPrisma.usuario.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.agregarAsignacion(alcanceUnidad, 999, { unidadId: 1, rolId: 2 }),
      ).rejects.toThrow();
    });
  });

  describe('ITEM-02 & ITEM-22: Grupos Familiares y Hermanos', () => {
    it('buscarHermanosPorCriterio rechaza alcance PROPIO', async () => {
      const mockPrisma: any = {};
      const service = new MiembrosService(mockPrisma);
      await expect(service.buscarHermanosPorCriterio(alcancePropio, 'Perez')).rejects.toThrow(ForbiddenException);
    });

    it('buscarHermano rechaza alcance PROPIO', async () => {
      const mockPrisma: any = {};
      const service = new MiembrosService(mockPrisma);
      await expect(service.buscarHermano(alcancePropio, '40111222')).rejects.toThrow(ForbiddenException);
    });

    it('listarGruposFamiliares rechaza alcance PROPIO', async () => {
      const mockPrisma: any = {};
      const service = new TesoreriaService(mockPrisma);
      await expect(service.listarGruposFamiliares(alcancePropio)).rejects.toThrow(ForbiddenException);
    });

    it('vincularHermano rechaza si el miembro origen no pertenece a la unidad del actor', async () => {
      const mockPrisma: any = {
        usuario: {
          findUnique: vi.fn().mockResolvedValueOnce({
            id: 50,
            apellido: 'Gomez',
            asignaciones: [{ unidadId: 999 }], // fuera de [1, 2]
          }),
        },
      };
      const service = new TesoreriaService(mockPrisma);
      await expect(service.vincularHermano(alcanceUnidad, { usuarioId: 50, hermanoDni: '38111222' })).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('ITEM-30: AuthService.resetearClave entre educadores de distintas ramas', () => {
    const mockPrisma: any = {
      usuario: {
        findFirst: vi.fn(),
      },
    };
    const service = new AuthService(mockPrisma);

    it('bloquea resetear clave si el educador objetivo tiene asignaciones activas en unidades fuera del alcance del actor', async () => {
      const actor: AuthUser = {
        sub: 99,
        dni: '12345678',
        nombre: 'Educador',
        apellido: 'Unidad 1',
        asignaciones: [
          {
            unidadId: 1,
            unidadNombre: 'Manada',
            rolId: 1,
            rol: 'Educador',
            alcance: AlcanceRol.UNIDAD,
            permisos: ['miembros.editar'],
            tipoMiembro: 'EDUCADOR',
            requiereRama: true,
          },
        ],
      };

      mockPrisma.usuario.findFirst.mockResolvedValueOnce({
        id: 70,
        dni: '22333444',
        nombre: 'Otro',
        apellido: 'Educador',
        asignaciones: [
          { unidadId: 1, activo: true, rol: { alcancePorDefecto: AlcanceRol.UNIDAD }, alcanceOverride: null },
          { unidadId: 5, activo: true, rol: { alcancePorDefecto: AlcanceRol.UNIDAD }, alcanceOverride: null }, // unidad 5 fuera de [1]
        ],
      });

      await expect(service.resetearClave(actor, { tipo: 'UNIDAD', unidadIds: [1] }, 70)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
