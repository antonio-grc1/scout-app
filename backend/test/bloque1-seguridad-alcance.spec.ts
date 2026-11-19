import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';
import { AlcanceRol, TipoUnidad } from '@prisma/client';
import type { AlcanceAcceso, AuthUser } from '../src/common/types/auth.types.js';
import {
  PERMITIR_AUTOGESTION_PROPIA_KEY,
  REQUIRED_PERMISSION_KEY,
} from '../src/common/decorators/auth.decorators.js';
import { assertUnidadEnAlcance } from '../src/common/scope/alcance.util.js';
import { MiembrosService } from '../src/miembros/miembros.service.js';
import { PasesService } from '../src/pases/pases.service.js';
import { AuthService } from '../src/auth/auth.service.js';
import { TesoreriaService } from '../src/tesoreria/tesoreria.service.js';
import { TesoreriaController } from '../src/tesoreria/tesoreria.controller.js';
import { LegajosService } from '../src/legajos/legajos.service.js';
import { LegajosController } from '../src/legajos/legajos.controller.js';
import { OrganizacionService } from '../src/organizacion/organizacion.service.js';
import { OrganizacionController } from '../src/organizacion/organizacion.controller.js';
import { MiembrosController } from '../src/miembros/miembros.controller.js';
import { MailerController } from '../src/mailer/mailer.controller.js';
import { generateTokenQR } from '../src/common/utils/qr-token.util.js';

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
    const actorGlobalPases: AuthUser = {
      sub: 1,
      dni: '10000001',
      requiereCambioClave: false,
      asignaciones: [
        {
          unidadId: 1,
          unidadNombre: 'Jefatura',
          rol: 'Jefe de Grupo',
          alcance: AlcanceRol.GLOBAL,
          permisos: ['pases.ver', 'pases.editar'],
        },
      ],
    };
    const actorUnidad99: AuthUser = {
      sub: 99,
      dni: '10000099',
      requiereCambioClave: false,
      asignaciones: [
        {
          unidadId: 1,
          unidadNombre: 'Manada',
          rol: 'Educador de Rama',
          alcance: AlcanceRol.UNIDAD,
          permisos: ['pases.ver', 'pases.editar'],
        },
        {
          unidadId: 2,
          unidadNombre: 'Scout',
          rol: 'Educador de Rama',
          alcance: AlcanceRol.UNIDAD,
          permisos: ['pases.ver', 'pases.editar'],
        },
      ],
    };

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
        rol: { id: 1, nombre: 'Protagonista', tipoMiembro: 'PROTAGONISTA', alcancePorDefecto: AlcanceRol.PROPIO },
        usuario: { id: 99, activo: true, fechaNacimiento: new Date('1990-01-01') },
      });

      await expect(
        pasesService.ejecutar(
          alcanceUnidad,
          {
            asignacionOrigenId: 10,
            unidadDestinoId: 2,
          },
          actorUnidad99,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('exige rolDestinoId explícito al pasar a JEFATURA', async () => {
      mockTx.asignacionMiembro.findUnique.mockResolvedValueOnce({
        id: 10,
        usuarioId: 200,
        unidadId: 1,
        rolId: 1,
        activo: true,
        rol: { id: 1, nombre: 'Protagonista', tipoMiembro: 'PROTAGONISTA', alcancePorDefecto: AlcanceRol.PROPIO },
        usuario: { id: 200, activo: true, fechaNacimiento: new Date('2000-01-01') },
      });
      mockTx.unidadOrganizativa.findUnique.mockResolvedValueOnce({
        id: 8,
        nombre: 'Jefatura de Grupo',
        tipo: TipoUnidad.JEFATURA,
        activa: true,
      });

      await expect(
        pasesService.ejecutar(
          alcanceGlobal,
          {
            asignacionOrigenId: 10,
            unidadDestinoId: 8,
            // rolDestinoId omitido
          },
          actorGlobalPases,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('bloquea asignar rol con alcance distinto de PROPIO a una unidad fuera de su alcance', async () => {
      mockTx.asignacionMiembro.findUnique.mockResolvedValueOnce({
        id: 10,
        usuarioId: 200,
        unidadId: 1,
        rolId: 1,
        activo: true,
        rol: { id: 1, nombre: 'Protagonista', tipoMiembro: 'PROTAGONISTA', alcancePorDefecto: AlcanceRol.PROPIO },
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
        pasesService.ejecutar(
          alcanceUnidad,
          {
            asignacionOrigenId: 10,
            unidadDestinoId: 999,
            rolDestinoId: 5,
          },
          actorUnidad99,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('ITEM-04: MiembrosService.agregarAsignacion', () => {
    const actorUnidad99: AuthUser = {
      sub: 99,
      dni: '10000099',
      requiereCambioClave: false,
      asignaciones: [
        {
          unidadId: 1,
          unidadNombre: 'Manada',
          rol: 'Educador de Rama',
          alcance: AlcanceRol.UNIDAD,
          permisos: ['pases.editar'],
        },
        {
          unidadId: 2,
          unidadNombre: 'Scout',
          rol: 'Educador de Rama',
          alcance: AlcanceRol.UNIDAD,
          permisos: ['pases.editar'],
        },
      ],
    };
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
      mockPrisma.rol.findUnique.mockResolvedValueOnce({ id: 2, activa: true, tipoMiembro: 'PROTAGONISTA', alcancePorDefecto: AlcanceRol.PROPIO });
      mockPrisma.usuario.findFirst.mockResolvedValueOnce({
        id: 15,
        activo: true,
        asignaciones: [
          { unidadId: 1, activo: true, rol: { alcancePorDefecto: AlcanceRol.GLOBAL } },
        ],
      });

      await expect(
        service.agregarAsignacion(actorUnidad99, alcanceUnidad, 15, { unidadId: 1, rolId: 2 }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('bloquea si el usuario objetivo no pertenece al alcance del actor', async () => {
      mockPrisma.unidadOrganizativa.findUnique.mockResolvedValueOnce({ id: 1, activa: true, tipo: TipoUnidad.SECCION_RAMA });
      mockPrisma.rol.findUnique.mockResolvedValueOnce({ id: 2, activa: true, tipoMiembro: 'PROTAGONISTA', alcancePorDefecto: AlcanceRol.PROPIO });
      mockPrisma.usuario.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.agregarAsignacion(actorUnidad99, alcanceUnidad, 999, { unidadId: 1, rolId: 2 }),
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
            permisos: ['padron.editar'],
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
          { unidadId: 1, activo: true, rol: { alcancePorDefecto: AlcanceRol.UNIDAD } },
          { unidadId: 5, activo: true, rol: { alcancePorDefecto: AlcanceRol.UNIDAD } }, // unidad 5 fuera de [1]
        ],
      });

      await expect(service.resetearClave(actor, { tipo: 'UNIDAD', unidadIds: [1] }, 70)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // =========================================================================
  // Etapa 1 — Blindaje de Privilegios, No-Escalada y Alcance (SEG-01 .. SEG-06)
  // =========================================================================

  describe('SEG-01: Gestión de roles sin escalada y separación roles.gestionar / organizacion.gestionar', () => {
    const secretariaRoles: AuthUser = {
      sub: 20,
      dni: '20111222',
      requiereCambioClave: false,
      asignaciones: [
        {
          unidadId: 10,
          unidadNombre: 'Jefatura',
          rol: 'Secretaría / Legajos',
          alcance: AlcanceRol.GLOBAL,
          permisos: ['organizacion.ver', 'padron.ver', 'roles.editar'],
        },
      ],
    };

    it('separa los metadatos de permisos entre OrganizacionController (roles) y MailerController (correo)', () => {
      const metaCrearRol = Reflect.getMetadata(REQUIRED_PERMISSION_KEY, OrganizacionController.prototype.crearRol);
      const metaEditarRol = Reflect.getMetadata(REQUIRED_PERMISSION_KEY, OrganizacionController.prototype.editarRol);
      const metaEliminarRol = Reflect.getMetadata(REQUIRED_PERMISSION_KEY, OrganizacionController.prototype.eliminarRol);
      expect(metaCrearRol).toBe('roles.editar');
      expect(metaEditarRol).toBe('roles.editar');
      expect(metaEliminarRol).toBe('roles.editar');

      const metaMailGet = Reflect.getMetadata(REQUIRED_PERMISSION_KEY, MailerController.prototype.obtener);
      const metaMailPut = Reflect.getMetadata(REQUIRED_PERMISSION_KEY, MailerController.prototype.guardar);
      const metaMailPost = Reflect.getMetadata(REQUIRED_PERMISSION_KEY, MailerController.prototype.probar);
      expect(metaMailGet).toBe('organizacion.editar');
      expect(metaMailPut).toBe('organizacion.editar');
      expect(metaMailPost).toBe('organizacion.editar');
    });

    it('rechaza crear, editar o eliminar roles que contengan permisos no poseídos por el actor', async () => {
      const mockPrisma: any = {
        rol: {
          findUnique: vi.fn().mockResolvedValue({
            id: 1,
            nombre: 'Jefe de Grupo',
            alcancePorDefecto: AlcanceRol.GLOBAL,
            _count: { asignaciones: 0 },
            permisos: [
              { permiso: { clave: 'organizacion.ver' } },
              { permiso: { clave: 'roles.editar' } },
              { permiso: { clave: 'caja.editar' } },
            ],
          }),
          create: vi.fn(),
          update: vi.fn(),
          delete: vi.fn(),
        },
        permiso: { findMany: vi.fn() },
        $transaction: vi.fn(async (cb: any) => cb(mockPrisma)),
      };
      const service = new OrganizacionService(mockPrisma);

      await expect(
        service.crearRol(secretariaRoles, alcanceGlobal, {
          nombre: 'SuperAdmin',
          alcancePorDefecto: AlcanceRol.GLOBAL,
          permisos: ['roles.editar', 'caja.editar'],
        }),
      ).rejects.toThrow(ForbiddenException);

      // No puede editar rol superior (Jefe de Grupo tiene tesoreria.gestionar)
      await expect(
        service.editarRol(secretariaRoles, alcanceGlobal, 1, {
          permisos: ['roles.editar'],
        }),
      ).rejects.toThrow(ForbiddenException);

      // No puede agregarse un permiso ajeno al editar un rol dentro de sus propios permisos
      mockPrisma.rol.findUnique.mockResolvedValueOnce({
        id: 2,
        nombre: 'Secretaría',
        alcancePorDefecto: AlcanceRol.GLOBAL,
        _count: { asignaciones: 1 },
        permisos: [{ permiso: { clave: 'roles.editar' } }],
      });
      await expect(
        service.editarRol(secretariaRoles, alcanceGlobal, 2, {
          permisos: ['roles.editar', 'caja.editar'],
        }),
      ).rejects.toThrow(ForbiddenException);

      // No puede eliminar rol con permisos superiores
      mockPrisma.rol.findUnique.mockResolvedValueOnce({
        id: 1,
        nombre: 'Jefe de Grupo',
        alcancePorDefecto: AlcanceRol.GLOBAL,
        _count: { asignaciones: 0 },
        permisos: [{ permiso: { clave: 'caja.editar' } }],
        asignaciones: [],
      });
      await expect(service.eliminarRol(secretariaRoles, alcanceGlobal, 1)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('SEG-02: Anti-Account Takeover y dominancia entre roles', () => {
    const rolJefeGrupo = {
      id: 1,
      alcancePorDefecto: AlcanceRol.GLOBAL,
      tipoMiembro: 'EDUCADOR',
      permisos: [
        { permiso: { clave: 'organizacion.editar' } },
        { permiso: { clave: 'roles.editar' } },
        { permiso: { clave: 'caja.editar' } },
      ],
    };

    it('impide que Tesorero modifique el emailContacto del Jefe de Grupo', async () => {
      const tesorero: AuthUser = {
        sub: 30,
        dni: '30111222',
        requiereCambioClave: false,
        asignaciones: [
          {
            unidadId: 10,
            unidadNombre: 'Jefatura',
            rol: 'Tesorero',
            alcance: AlcanceRol.GLOBAL,
            permisos: ['padron.ver', 'padron.editar', 'caja.editar'],
          },
        ],
      };
      const mockPrisma: any = {
        usuario: {
          findFirst: vi.fn().mockResolvedValue({
            id: 1,
            emailContacto: 'jefe@scout.org',
            asignaciones: [{ unidadId: 10, activo: true, rol: rolJefeGrupo }],
          }),
          update: vi.fn(),
        },
      };
      const service = new MiembrosService(mockPrisma);

      await expect(
        service.editar(tesorero, alcanceGlobal, 1, { emailContacto: 'attacker@evil.com' }),
      ).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.usuario.update).not.toHaveBeenCalled();
    });

    it('impide que Secretaría resetee la clave del Jefe de Grupo pero le permite resetear la de un Protagonista', async () => {
      const secretaria: AuthUser = {
        sub: 20,
        dni: '20111222',
        requiereCambioClave: false,
        asignaciones: [
          {
            unidadId: 10,
            unidadNombre: 'Jefatura',
            rol: 'Secretaría',
            alcance: AlcanceRol.GLOBAL,
            permisos: ['padron.ver', 'padron.editar', 'padron.editar'],
          },
        ],
      };
      const mockPrisma: any = {
        usuario: {
          findFirst: vi
            .fn()
            .mockResolvedValueOnce({
              id: 1,
              dni: '11111111',
              nombre: 'Jefe',
              apellido: 'Grupo',
              emailContacto: null,
              asignaciones: [{ unidadId: 10, activo: true, rol: rolJefeGrupo }],
            })
            .mockResolvedValueOnce({
              id: 500,
              dni: '50111222',
              nombre: 'Lobato',
              apellido: 'Prota',
              emailContacto: null,
              asignaciones: [
                {
                  unidadId: 1,
                  activo: true,
                  rol: {
                    alcancePorDefecto: AlcanceRol.PROPIO,
                    tipoMiembro: 'PROTAGONISTA',
                    permisos: [{ permiso: { clave: 'cobranzas.ver' } }, { permiso: { clave: 'eventos.editar' } }],
                  },
                },
              ],
            }),
          update: vi.fn().mockResolvedValue({ id: 500 }),
        },
      };
      const authService = new AuthService(mockPrisma);

      await expect(authService.resetearClave(secretaria, alcanceGlobal, 1)).rejects.toThrow(ForbiddenException);
      const resProta = await authService.resetearClave(secretaria, alcanceGlobal, 500);
      expect(resProta.claveTemporal).toBeDefined();
    });

    it('impide que un educador UNIDAD acotado resetee la clave de otro educador de la misma unidad con más permisos', async () => {
      const educadorAcotado: AuthUser = {
        sub: 40,
        dni: '40111222',
        requiereCambioClave: false,
        asignaciones: [
          {
            unidadId: 1,
            unidadNombre: 'Manada',
            rol: 'Educador Auxiliar',
            alcance: AlcanceRol.UNIDAD,
            permisos: ['padron.ver', 'padron.editar'],
          },
        ],
      };
      const mockPrisma: any = {
        usuario: {
          findFirst: vi.fn().mockResolvedValue({
            id: 41,
            dni: '41111222',
            nombre: 'Jefe',
            apellido: 'Rama',
            asignaciones: [
              {
                unidadId: 1,
                activo: true,
                rol: {
                  alcancePorDefecto: AlcanceRol.UNIDAD,
                  tipoMiembro: 'EDUCADOR',
                  permisos: [{ permiso: { clave: 'padron.ver' } }, { permiso: { clave: 'pases.editar' } }],
                },
              },
            ],
          }),
          update: vi.fn(),
        },
      };
      const authService = new AuthService(mockPrisma);

      await expect(
        authService.resetearClave(educadorAcotado, { tipo: 'UNIDAD', unidadIds: [1], usuarioIdPropio: 40 }, 41),
      ).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.usuario.update).not.toHaveBeenCalled();
    });
  });

  describe('SEG-03: Multirrol bypass en PATCH /miembros/:id y no-escalada al otorgar roles', () => {
    it('impide que un usuario multirrol (GLOBAL editar + UNIDAD baja) dé de baja a un usuario GLOBAL o a sí mismo', async () => {
      const multirrol: AuthUser = {
        sub: 60,
        dni: '60111222',
        requiereCambioClave: false,
        asignaciones: [
          {
            unidadId: 10,
            unidadNombre: 'Jefatura',
            rol: 'Tesorero',
            alcance: AlcanceRol.GLOBAL,
            permisos: ['padron.ver', 'cobranzas.ver'],
          },
          {
            unidadId: 1,
            unidadNombre: 'Manada',
            rol: 'Educador',
            alcance: AlcanceRol.UNIDAD,
            permisos: ['padron.editar'],
          },
        ],
      };
      const mockPrisma: any = {
        usuario: {
          findFirst: vi
            .fn()
            .mockResolvedValueOnce({
              id: 1,
              activo: true,
              asignaciones: [
                {
                  unidadId: 1,
                  activo: true,
                  rol: { alcancePorDefecto: AlcanceRol.GLOBAL, tipoMiembro: 'EDUCADOR', permisos: [] },
                },
              ],
            })
            .mockResolvedValueOnce({
              id: 60,
              activo: true,
              asignaciones: [],
            }),
          update: vi.fn(),
        },
      };
      const service = new MiembrosService(mockPrisma);

      await expect(service.editar(multirrol, alcanceGlobal, 1, { activo: false })).rejects.toThrow(ForbiddenException);
      await expect(service.editar(multirrol, alcanceGlobal, 60, { activo: false })).rejects.toThrow(ForbiddenException);
    });

    it('impide que Secretaría otorgue un rol con permisos superiores en crear, agregarAsignacion y pases.ejecutar', async () => {
      const secretaria: AuthUser = {
        sub: 20,
        dni: '20111222',
        requiereCambioClave: false,
        asignaciones: [
          {
            unidadId: 10,
            unidadNombre: 'Jefatura',
            rol: 'Secretaría',
            alcance: AlcanceRol.GLOBAL,
            permisos: ['padron.editar', 'pases.editar'],
          },
        ],
      };
      const rolSuperior = {
        id: 1,
        nombre: 'Jefe de Grupo',
        alcancePorDefecto: AlcanceRol.GLOBAL,
        tipoMiembro: 'EDUCADOR',
        requiereRama: false,
        permisos: [{ permiso: { clave: 'caja.editar' } }],
      };

      const mockMiembrosPrisma: any = {
        rol: { findUnique: vi.fn().mockResolvedValue(rolSuperior) },
        unidadOrganizativa: { findUnique: vi.fn().mockResolvedValue({ id: 10, activa: true, tipo: TipoUnidad.JEFATURA }) },
      };
      const miembrosService = new MiembrosService(mockMiembrosPrisma);

      await expect(
        miembrosService.crear(secretaria, alcanceGlobal, {
          dni: '99111222',
          nombre: 'Nuevo',
          apellido: 'Jefe',
          fechaNacimiento: '1990-01-01',
          unidadId: 10,
          rolId: 1,
        }),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        miembrosService.agregarAsignacion(secretaria, alcanceGlobal, 50, { unidadId: 10, rolId: 1 }),
      ).rejects.toThrow(ForbiddenException);

      const mockPasesPrisma: any = {
        asignacionMiembro: {
          findUnique: vi.fn().mockResolvedValue({
            id: 10,
            usuarioId: 50,
            unidadId: 1,
            rolId: 2,
            activo: true,
            rol: { alcancePorDefecto: AlcanceRol.PROPIO, tipoMiembro: 'PROTAGONISTA', permisos: [] },
            usuario: { id: 50, activo: true, fechaNacimiento: new Date('2000-01-01') },
          }),
        },
        unidadOrganizativa: { findUnique: vi.fn().mockResolvedValue({ id: 10, activa: true, tipo: TipoUnidad.JEFATURA }) },
        rol: { findUnique: vi.fn().mockResolvedValue(rolSuperior) },
        $transaction: vi.fn(async (cb: any) => cb(mockPasesPrisma)),
      };
      const pasesService = new PasesService(mockPasesPrisma);

      await expect(
        pasesService.ejecutar(alcanceGlobal, { asignacionOrigenId: 10, unidadDestinoId: 10, rolDestinoId: 1 }, secretaria),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('SEG-04 & SEG-05: Fail-closed y aislamiento de alcance UNIDAD en Eventos Económicos', () => {
    const actorVacio: AuthUser = {
      sub: 99,
      dni: '99000111',
      requiereCambioClave: false,
      asignaciones: [],
    };
    const actorUnidadEventos: AuthUser = {
      sub: 99,
      dni: '99000111',
      requiereCambioClave: false,
      asignaciones: [
        {
          unidadId: 1,
          unidadNombre: 'Manada',
          rol: 'Educador',
          alcance: AlcanceRol.UNIDAD,
          permisos: ['eventos.ver', 'eventos.editar', 'eventos.editar'],
        },
      ],
    };

    it('SEG-04: rechaza con ForbiddenException si actor.asignaciones está vacío', async () => {
      const token = generateTokenQR({ eventoId: 1, pedidoId: 1 });
      const service = new TesoreriaService({} as any);

      await expect(
        service.crearPedidoEvento(actorVacio, alcanceGlobal, {
          eventoId: 1,
          compradorNombre: 'Cliente',
          items: [{ itemId: 1, cantidad: 1 }],
        }),
      ).rejects.toThrow(ForbiddenException);

      await expect(service.validarTicketQr(actorVacio, alcanceGlobal, { tokenQr: token })).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('SEG-05: bloquea Venta General, cuentaId y pedidos PAGADO para alcance UNIDAD; filtra métricas y oculta cuenta', async () => {
      const mockPrisma: any = {
        pedidoEvento: {
          findUnique: vi.fn(),
        },
        ticketEvento: {
          findUnique: vi.fn(),
        },
        evento: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: 1,
              titulo: 'Rifa',
              estado: 'PUBLICADO',
              cuentaId: 7,
              cuenta: { id: 7, nombre: 'Caja Central', tipo: 'CAJA_EFECTIVO' },
              items: [],
              pedidos: [{ id: 1, total: '2000', totalGanancia: '1000', estado: 'PAGADO', tickets: [] }],
            },
          ]),
          findUnique: vi.fn().mockResolvedValue({
            id: 1,
            titulo: 'Rifa',
            estado: 'PUBLICADO',
            cuentaId: 7,
            cuenta: { id: 7, nombre: 'Caja Central', tipo: 'CAJA_EFECTIVO' },
            items: [],
            pedidos: [],
          }),
        },
        $transaction: vi.fn(async (cb: any) => cb(mockPrisma)),
      };
      const service = new TesoreriaService(mockPrisma);

      // crearPedidoEvento: rechaza Venta General y rechaza cuentaId para UNIDAD
      await expect(
        service.crearPedidoEvento(actorUnidadEventos, alcanceUnidad, {
          eventoId: 1,
          compradorNombre: 'Venta General Test',
          vendedorUsuarioId: null,
          items: [{ itemId: 1, cantidad: 1 }],
        }),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.crearPedidoEvento(actorUnidadEventos, alcanceUnidad, {
          eventoId: 1,
          compradorNombre: 'Cliente',
          vendedorUsuarioId: 50,
          cuentaId: 7,
          items: [{ itemId: 1, cantidad: 1 }],
        }),
      ).rejects.toThrow(ForbiddenException);

      // actualizarPedidoEvento: rechaza Venta General, cuentaId y pedido PAGADO
      mockPrisma.pedidoEvento.findUnique.mockResolvedValueOnce({
        id: 10,
        vendedorUsuarioId: null,
        registradoPorUsuarioId: 99,
        estado: 'PENDIENTE',
        tickets: [],
        detalles: [],
        evento: { items: [] },
      });
      await expect(
        service.actualizarPedidoEvento(actorUnidadEventos, alcanceUnidad, 10, { compradorNombre: 'Cambio' }),
      ).rejects.toThrow(ForbiddenException);

      mockPrisma.pedidoEvento.findUnique.mockResolvedValueOnce({
        id: 11,
        vendedorUsuarioId: 50,
        registradoPorUsuarioId: 99,
        estado: 'PAGADO',
        tickets: [],
        detalles: [],
        evento: { items: [] },
      });
      await expect(
        service.actualizarPedidoEvento(actorUnidadEventos, alcanceUnidad, 11, { compradorNombre: 'Cambio' }),
      ).rejects.toThrow(ForbiddenException);

      // eliminarPedidoEvento: rechaza Venta General y pedido PAGADO
      mockPrisma.pedidoEvento.findUnique.mockResolvedValueOnce({
        id: 12,
        vendedorUsuarioId: null,
        registradoPorUsuarioId: 99,
        estado: 'PENDIENTE',
        tickets: [],
        detalles: [],
        evento: { items: [] },
      });
      await expect(service.eliminarPedidoEvento(actorUnidadEventos, alcanceUnidad, 12)).rejects.toThrow(
        ForbiddenException,
      );

      // validarTicketQr: rechaza Venta General y ticket cuyo vendedor es de otra unidad (aun si registradoPorUsuarioId === actor.sub)
      const token = generateTokenQR({ eventoId: 1, pedidoId: 13 });
      mockPrisma.ticketEvento.findUnique.mockResolvedValueOnce({
        id: 1,
        pedidoId: 13,
        tokenQr: token,
        estado: 'ACTIVO',
        item: { nombre: 'Bono' },
        pedido: {
          id: 13,
          eventoId: 1,
          vendedorUsuarioId: null,
          registradoPorUsuarioId: 99,
          estado: 'PENDIENTE',
          evento: { id: 1, titulo: 'Rifa', estado: 'PUBLICADO' },
          vendedorUsuario: null,
        },
      });
      await expect(service.validarTicketQr(actorUnidadEventos, alcanceUnidad, { tokenQr: token })).rejects.toThrow(
        ForbiddenException,
      );

      const token14 = generateTokenQR({ eventoId: 1, pedidoId: 14 });
      mockPrisma.ticketEvento.findUnique.mockResolvedValueOnce({
        id: 2,
        pedidoId: 14,
        tokenQr: token14,
        estado: 'ACTIVO',
        item: { nombre: 'Bono' },
        pedido: {
          id: 14,
          eventoId: 1,
          vendedorUsuarioId: 88,
          registradoPorUsuarioId: 99,
          estado: 'PENDIENTE',
          evento: { id: 1, titulo: 'Rifa', estado: 'PUBLICADO' },
          vendedorUsuario: { id: 88, nombre: 'Otro', apellido: 'Rama', asignaciones: [{ unidadId: 999 }] },
        },
      });
      await expect(service.validarTicketQr(actorUnidadEventos, alcanceUnidad, { tokenQr: token14 })).rejects.toThrow(
        ForbiddenException,
      );

      // listarEventos y obtenerEventoPorId ocultan cuenta y filtran pedidos de métricas para UNIDAD
      const eventos = await service.listarEventos(alcanceUnidad);
      expect(eventos[0].cuenta).toBeNull();
      expect(eventos[0].cuentaId).toBeNull();
      expect(mockPrisma.evento.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            pedidos: expect.objectContaining({
              where: { vendedorUsuario: expect.anything() },
            }),
          }),
        }),
      );

      const detalle = await service.obtenerEventoPorId(alcanceUnidad, 1);
      expect(detalle.cuenta).toBeNull();
      expect(detalle.cuentaId).toBeNull();
    });
  });

  describe('SEG-06: Cierre de fugas UNIDAD en pagos familiares, hermanos, saldo a favor y caja', () => {
    it('bloquea editarPago y revertirPago si un pago familiar imputó a un hermano de otra unidad o no tiene usuarios', async () => {
      const pagoMixto = {
        id: 55,
        usuario: { id: 10, asignaciones: [{ unidadId: 1 }] },
        imputaciones: [
          { cargo: { usuario: { id: 10, asignaciones: [{ unidadId: 1 }] } } },
          { cargo: { usuario: { id: 11, asignaciones: [{ unidadId: 999 }] } } },
        ],
      };
      const pagoHuerfano = {
        id: 56,
        usuario: null,
        imputaciones: [],
      };
      const mockPrisma: any = {
        pago: {
          findUnique: vi
            .fn()
            .mockResolvedValueOnce(pagoMixto)
            .mockResolvedValueOnce(pagoHuerfano)
            .mockResolvedValueOnce(pagoMixto),
        },
        $transaction: vi.fn(async (cb: any) => cb(mockPrisma)),
      };
      const service = new TesoreriaService(mockPrisma);

      await expect(service.editarPago(alcanceUnidad, 55, { observaciones: 'Edit' })).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.editarPago(alcanceUnidad, 56, { observaciones: 'Edit' })).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.revertirPago(alcanceUnidad, 55)).rejects.toThrow(ForbiddenException);
    });

    it('bloquea aplicarSaldoAFavor sobre cargo de un hermano perteneciente a otra unidad', async () => {
      const tx: any = {
        usuario: {
          findUnique: vi.fn().mockResolvedValue({
            id: 10,
            grupoFamiliarId: 5,
            saldoAFavor: '5000.00',
            asignaciones: [{ unidadId: 1 }],
          }),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        cargoMiembro: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: 200,
              usuarioId: 11,
              montoFinal: '1000.00',
              montoPagado: '0.00',
              estado: 'PENDIENTE',
              usuario: { id: 11, grupoFamiliarId: 5, asignaciones: [{ unidadId: 999 }] },
            },
          ]),
        },
      };
      const service = new TesoreriaService({
        $transaction: vi.fn(async (cb: any) => cb(tx)),
      } as any);

      await expect(
        service.aplicarSaldoAFavor({ sub: 99, dni: '99000111', requiereCambioClave: false, asignaciones: [] }, alcanceUnidad, {
          usuarioId: 10,
          imputaciones: [{ cargoId: 200, monto: 1000 }],
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('bloquea desvincularHermano para UNIDAD cuando la familia tiene integrantes activos en otra rama', async () => {
      const mockPrisma: any = {
        usuario: {
          findUnique: vi.fn().mockResolvedValue({
            id: 10,
            grupoFamiliarId: 5,
            asignaciones: [{ unidadId: 1 }],
          }),
          findMany: vi.fn().mockResolvedValue([
            { id: 10, asignaciones: [{ unidadId: 1 }] },
            { id: 11, asignaciones: [{ unidadId: 999 }] },
          ]),
        },
      };
      const service = new TesoreriaService(mockPrisma);

      await expect(service.desvincularHermano(alcanceUnidad, { usuarioId: 10 })).rejects.toThrow(ForbiddenException);
    });

    it('bloquea vincular hermano de otra rama en miembros.crear y consultar hermano de otra rama en buscarHermano', async () => {
      const actorUnidad: AuthUser = {
        sub: 99,
        dni: '99000111',
        requiereCambioClave: false,
        asignaciones: [
          {
            unidadId: 1,
            unidadNombre: 'Manada',
            rol: 'Educador',
            alcance: AlcanceRol.UNIDAD,
            permisos: ['padron.editar'],
          },
        ],
      };
      const mockPrisma: any = {
        rol: {
          findUnique: vi.fn().mockResolvedValue({
            id: 2,
            alcancePorDefecto: AlcanceRol.PROPIO,
            tipoMiembro: 'PROTAGONISTA',
            requiereRama: true,
          }),
        },
        unidadOrganizativa: {
          findUnique: vi.fn().mockResolvedValue({ id: 1, activa: true, tipo: TipoUnidad.SECCION_RAMA }),
        },
        usuario: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
        $transaction: vi.fn(async (cb: any) => cb(mockPrisma)),
      };
      const service = new MiembrosService(mockPrisma);

      await expect(service.buscarHermano(alcanceUnidad, '40999888')).rejects.toThrow(NotFoundException);
      expect(mockPrisma.usuario.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            AND: [{ dni: '40999888', activo: true }, expect.anything()],
          },
        }),
      );

      await expect(
        service.crear(actorUnidad, alcanceUnidad, {
          dni: '50111222',
          nombre: 'Hijo',
          apellido: 'Prueba',
          fechaNacimiento: '2016-01-01',
          unidadId: 1,
          rolId: 2,
          hermanoDni: '40999888',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('bloquea registrarGasto y registrarIngreso de UNIDAD sobre CuentaFinanciera global aunque el rubro sea de su unidad', async () => {
      const tx: any = {
        cuentaFinanciera: {
          findUnique: vi.fn().mockResolvedValue({ id: 1, nombre: 'Caja Central', activa: true }),
        },
        rubroContable: {
          findUnique: vi.fn().mockResolvedValue({ id: 3, nombre: 'Manada', tipo: 'EGRESO', activo: true, unidadId: 1 }),
        },
      };
      const service = new TesoreriaService({
        $transaction: vi.fn(async (cb: any) => cb(tx)),
      } as any);

      await expect(
        service.registrarGasto(
          { sub: 99, dni: '99000111', requiereCambioClave: false, asignaciones: [] },
          alcanceUnidad,
          { cuentaId: 1, rubroId: 3, monto: 500, descripcion: 'Gasto en caja global' },
        ),
      ).rejects.toThrow(ForbiddenException);

      tx.rubroContable.findUnique.mockResolvedValueOnce({
        id: 4,
        nombre: 'Ingresos Manada',
        tipo: 'INGRESO',
        activo: true,
        unidadId: 1,
      });
      await expect(
        service.registrarIngreso(
          { sub: 99, dni: '99000111', requiereCambioClave: false, asignaciones: [] },
          alcanceUnidad,
          { cuentaId: 1, rubroId: 4, monto: 500, descripcion: 'Ingreso en caja global' },
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('Etapa 2: Archivado de roles, Anti-Lockout independiente y Metadata BUG-03/04/07/08', () => {
    it('impide asignar un rol archivado (activo: false) en MiembrosService y PasesService', async () => {
      const actorGlobal: AuthUser = {
        sub: 1,
        dni: '11111111',
        requiereCambioClave: false,
        asignaciones: [
          {
            unidadId: 10,
            unidadNombre: 'Jefatura',
            rol: 'Jefe',
            alcance: AlcanceRol.GLOBAL,
            permisos: ['padron.editar', 'pases.editar'],
          },
        ],
      };

      const rolArchivado = {
        id: 88,
        nombre: 'Rol Viejo',
        alcancePorDefecto: AlcanceRol.PROPIO,
        tipoMiembro: 'PROTAGONISTA',
        requiereRama: true,
        activo: false,
        permisos: [],
      };

      const miembrosService = new MiembrosService({
        rol: { findUnique: vi.fn().mockResolvedValue(rolArchivado) },
      } as any);

      await expect(
        miembrosService.crear(actorGlobal, alcanceGlobal, {
          dni: '50111222',
          nombre: 'Test',
          apellido: 'Archivado',
          fechaNacimiento: '2016-01-01',
          unidadId: 1,
          rolId: 88,
        }),
      ).rejects.toThrow(/archivado o inactivo/i);

      const mockPasesPrisma: any = {
        asignacionMiembro: {
          findUnique: vi.fn().mockResolvedValue({
            id: 10,
            usuarioId: 50,
            unidadId: 1,
            rolId: 2,
            activo: true,
            rol: { id: 2, alcancePorDefecto: AlcanceRol.PROPIO, tipoMiembro: 'PROTAGONISTA', permisos: [] },
            usuario: { id: 50, activo: true, fechaNacimiento: new Date('2015-01-01') },
          }),
        },
        unidadOrganizativa: {
          findUnique: vi.fn().mockResolvedValue({ id: 2, activa: true, tipo: TipoUnidad.SECCION_RAMA }),
        },
        rol: { findUnique: vi.fn().mockResolvedValue(rolArchivado) },
        $transaction: vi.fn(async (cb: any) => cb(mockPasesPrisma)),
      };
      const pasesService = new PasesService(mockPasesPrisma);

      await expect(
        pasesService.ejecutar(
          alcanceGlobal,
          { asignacionOrigenId: 10, unidadDestinoId: 2, rolDestinoId: 88 },
          actorGlobal,
        ),
      ).rejects.toThrow(/archivado o inactivo/i);
    });

    it('COD-02: impide desactivar al último titular global de roles.gestionar aunque exista otro admin con organizacion.gestionar', async () => {
      const actorSuper: AuthUser = {
        sub: 1,
        dni: '11111111',
        requiereCambioClave: false,
        asignaciones: [
          {
            unidadId: 10,
            unidadNombre: 'Jefatura',
            rol: 'Super',
            alcance: AlcanceRol.GLOBAL,
            permisos: ['padron.ver', 'padron.editar', 'roles.editar', 'organizacion.editar'],
          },
        ],
      };

      const prismaMock: any = {
        usuario: {
          findFirst: vi.fn().mockResolvedValue({
            id: 1,
            activo: true,
            asignaciones: [
              {
                id: 100,
                unidadId: 10,
                activo: true,
                rol: {
                  activo: true,
                  alcancePorDefecto: AlcanceRol.GLOBAL,
                  permisos: [
                    { permiso: { clave: 'roles.editar' } },
                    { permiso: { clave: 'organizacion.editar' } },
                  ],
                },
              },
            ],
          }),
        },
        asignacionMiembro: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: 200,
              usuarioId: 2,
              unidadId: 10,
              activo: true,
              rol: {
                activo: true,
                alcancePorDefecto: AlcanceRol.GLOBAL,
                permisos: [{ permiso: { clave: 'organizacion.editar' } }], // falta roles.gestionar!
              },
            },
          ]),
        },
        $transaction: vi.fn(async (cb: any) => cb(prismaMock)),
      };

      const service = new MiembrosService(prismaMock);
      await expect(service.editar(actorSuper, alcanceGlobal, 1, { activo: false })).rejects.toThrow(
        /roles\.editar/i,
      );
    });

    it('BUG-03, BUG-04, BUG-07 & BUG-08: valida metadata de permisos en TesoreriaController y MiembrosController', () => {
      const metaCuentas = Reflect.getMetadata(REQUIRED_PERMISSION_KEY, TesoreriaController.prototype.listarCuentas);
      expect(metaCuentas).toEqual(
        expect.arrayContaining(['caja.ver', 'caja.editar', 'caja.editar']),
      );

      const metaRubros = Reflect.getMetadata(REQUIRED_PERMISSION_KEY, TesoreriaController.prototype.listarRubros);
      expect(metaRubros).toEqual(
        expect.arrayContaining(['planes.editar', 'eventos.editar', 'caja.editar']),
      );

      const metaMisTickets = Reflect.getMetadata(
        REQUIRED_PERMISSION_KEY,
        TesoreriaController.prototype.obtenerMisTickets,
      );
      expect(metaMisTickets).toContain('caja.editar');

      const metaMisPedidos = Reflect.getMetadata(
        REQUIRED_PERMISSION_KEY,
        TesoreriaController.prototype.obtenerMisPedidos,
      );
      expect(metaMisPedidos).toContain('caja.editar');

      const metaBuscarHermanos = Reflect.getMetadata(
        REQUIRED_PERMISSION_KEY,
        MiembrosController.prototype.buscarHermanosPorCriterio,
      );
      expect(metaBuscarHermanos).toEqual(
        expect.arrayContaining(['padron.editar', 'padron.editar', 'cobranzas.editar', 'caja.editar']),
      );
    });

    it('ARQ-04 & COD-01: valida @PermitirAutogestionPropia explícito solo en endpoints de autogestión y ausente en gestión', () => {
      const autogestionHandlers = [
        LegajosController.prototype.listarPlantillas,
        LegajosController.prototype.obtenerPlantilla,
        LegajosController.prototype.obtenerPrecarga,
        LegajosController.prototype.guardarEntrega,
        LegajosController.prototype.listarEntregas,
        TesoreriaController.prototype.obtenerEstadoCuenta,
        TesoreriaController.prototype.obtenerMisTickets,
        TesoreriaController.prototype.obtenerMisPedidos,
        MiembrosController.prototype.obtener,
      ];
      for (const h of autogestionHandlers) {
        expect(Reflect.getMetadata(PERMITIR_AUTOGESTION_PROPIA_KEY, h)).toBe(true);
      }

      const gestionHandlers = [
        MiembrosController.prototype.listar,
        LegajosController.prototype.listarColaboradoresAdultos,
        LegajosController.prototype.validarFisico,
        TesoreriaController.prototype.listarCargos,
        TesoreriaController.prototype.listarEventos,
      ];
      for (const h of gestionHandlers) {
        expect(Reflect.getMetadata(PERMITIR_AUTOGESTION_PROPIA_KEY, h)).toBeUndefined();
      }
    });

    it('Opción A: resolverAlcance combina alcances heterogéneos por permiso (permisosAlcance) en un mismo rol', async () => {
      const { resolverAlcance, assertActorCubrePermisosConAlcance } = await import(
        '../src/common/scope/alcance.util.js'
      );

      const userMixto: AuthUser = {
        sub: 77,
        dni: '33000111',
        requiereCambioClave: false,
        asignaciones: [
          {
            unidadId: 3,
            unidadNombre: 'Tropa Scout',
            rol: 'Rol Mixto',
            alcance: AlcanceRol.GLOBAL,
            permisos: ['padron.ver', 'eventos.ver', 'eventos.editar', 'roles.editar'],
            permisosAlcance: {
              'padron.ver': AlcanceRol.UNIDAD,
              'eventos.ver': AlcanceRol.GLOBAL,
              'eventos.editar': AlcanceRol.GLOBAL,
              'roles.editar': AlcanceRol.GLOBAL,
            },
          },
        ],
      };

      expect(resolverAlcance(userMixto, 'padron.ver')).toEqual({
        tipo: 'UNIDAD',
        unidadIds: [3],
        usuarioIdPropio: 77,
      });
      expect(resolverAlcance(userMixto, 'eventos.editar')).toEqual({ tipo: 'GLOBAL' });
      expect(resolverAlcance(userMixto, 'caja.ver')).toBeNull();

      expect(() =>
        assertActorCubrePermisosConAlcance(userMixto, {
          'padron.ver': AlcanceRol.GLOBAL,
        }),
      ).toThrow(ForbiddenException);

      expect(() =>
        assertActorCubrePermisosConAlcance(userMixto, {
          'padron.ver': AlcanceRol.UNIDAD,
          'eventos.editar': AlcanceRol.GLOBAL,
        }),
      ).not.toThrow();
    });
  });
});
