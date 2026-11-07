import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AlcanceRol, TipoUnidad } from '@prisma/client';
import type { AlcanceAcceso } from '../src/common/types/auth.types.js';
import { PasesService } from '../src/pases/pases.service.js';
import { OrganizacionService } from '../src/organizacion/organizacion.service.js';

describe('BLOQUE 4 - Backend Organización, Roles, Asignaciones, Historial y Pases', () => {
  const alcanceGlobal: AlcanceAcceso = { tipo: 'GLOBAL' };
  const alcanceUnidad: AlcanceAcceso = { tipo: 'UNIDAD', unidadIds: [1], usuarioIdPropio: 99 };

  describe('PasesService - Control de duplicados e integridad de cuotas', () => {
    it('bloquea pase si el miembro ya tiene una asignación activa en la unidad destino con el mismo rol', async () => {
      const mockPrisma: any = {
        asignacionMiembro: {
          findUnique: vi.fn().mockResolvedValue({
            id: 10,
            usuarioId: 5,
            unidadId: 1,
            rolId: 2,
            activo: true,
            alcanceOverride: null,
            rol: { id: 2, alcancePorDefecto: AlcanceRol.PROPIO, tipoMiembro: 'PROTAGONISTA', requiereRama: true },
            usuario: { id: 5, activo: true, fechaNacimiento: new Date('2012-05-10') },
          }),
          findFirst: vi.fn().mockResolvedValue({
            id: 15,
            usuarioId: 5,
            unidadId: 2,
            rolId: 3,
            activo: true,
          }), // Ya tiene asignación activa en destino!
          updateMany: vi.fn(),
          create: vi.fn(),
        },
        unidadOrganizativa: {
          findUnique: vi.fn().mockResolvedValue({ id: 2, activa: true, tipo: TipoUnidad.SECCION_RAMA }),
        },
        rol: {
          findUnique: vi.fn().mockResolvedValue({
            id: 3,
            alcancePorDefecto: AlcanceRol.PROPIO,
            tipoMiembro: 'PROTAGONISTA',
            requiereRama: true,
          }),
        },
        $transaction: vi.fn((cb) => cb(mockPrisma)),
      };

      const service = new PasesService(mockPrisma);

      await expect(
        service.ejecutar(alcanceGlobal, {
          asignacionOrigenId: 10,
          unidadDestinoId: 2,
          rolDestinoId: 3,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('sincroniza cuotas de tesorería al ejecutar un pase con éxito', async () => {
      const mockTesoreria: any = {
        sincronizarCuotasMiembroActivoEnTx: vi.fn().mockResolvedValue(undefined),
      };

      const mockPrisma: any = {
        asignacionMiembro: {
          findUnique: vi.fn().mockResolvedValue({
            id: 20,
            usuarioId: 8,
            unidadId: 1,
            rolId: 2,
            activo: true,
            alcanceOverride: null,
            rol: { id: 2, alcancePorDefecto: AlcanceRol.PROPIO, tipoMiembro: 'PROTAGONISTA', requiereRama: true },
            usuario: { id: 8, activo: true, fechaNacimiento: new Date('2012-05-10') },
          }),
          findFirst: vi.fn().mockResolvedValue(null), // No duplicado
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          create: vi.fn().mockResolvedValue({
            id: 25,
            usuarioId: 8,
            unidadId: 2,
            rolId: 3,
            cicloAnio: 2026,
            unidad: { id: 2, nombre: 'Comunidad Scout' },
            rol: { id: 3, nombre: 'Scout' },
          }),
        },
        unidadOrganizativa: {
          findUnique: vi.fn().mockResolvedValue({ id: 2, activa: true, tipo: TipoUnidad.SECCION_RAMA }),
        },
        rol: {
          findUnique: vi.fn().mockResolvedValue({
            id: 3,
            alcancePorDefecto: AlcanceRol.PROPIO,
            tipoMiembro: 'PROTAGONISTA',
            requiereRama: true,
          }),
        },
        $transaction: vi.fn((cb) => cb(mockPrisma)),
      };

      const service = new PasesService(mockPrisma, mockTesoreria);

      const res = await service.ejecutar(alcanceGlobal, {
        asignacionOrigenId: 20,
        unidadDestinoId: 2,
        rolDestinoId: 3,
        cicloAnio: 2026,
      });

      expect(res.asignacionNueva.id).toBe(25);
      expect(mockTesoreria.sincronizarCuotasMiembroActivoEnTx).toHaveBeenCalledWith(
        mockPrisma,
        8,
        expect.any(Number),
        2026,
      );
    });
  });

  describe('OrganizacionService - Historial de unidad y consistencia jerárquica', () => {
    it('obtiene historial de unidad con cálculo seguro de educadores y protagonistas', async () => {
      const mockPrisma: any = {
        unidadOrganizativa: {
          findUnique: vi.fn().mockResolvedValue({
            id: 1,
            nombre: 'Manada San Francisco',
            tipo: TipoUnidad.SECCION_RAMA,
            activa: true,
            ramaId: 1,
            rama: { id: 1, nombre: 'Lobatos', edadMinima: 7, edadMaxima: 11, ordenProgresion: 1, activa: true },
            asignaciones: [
              {
                id: 101,
                usuarioId: 10,
                rolId: 1,
                cicloAnio: 2026,
                fechaInicio: new Date('2026-01-01'),
                fechaFin: null,
                activo: true,
                usuario: { id: 10, nombre: 'Akela', apellido: 'Líder', dni: '30111222', activo: true },
                rol: { id: 1, nombre: 'Educador de Rama', tipoMiembro: 'EDUCADOR' },
              },
              {
                id: 102,
                usuarioId: 11,
                rolId: 2,
                cicloAnio: 2026,
                fechaInicio: new Date('2026-01-01'),
                fechaFin: null,
                activo: true,
                usuario: { id: 11, nombre: 'Mowgli', apellido: 'Lobato', dni: '50111222', activo: true },
                rol: { id: 2, nombre: 'Lobato', tipoMiembro: 'PROTAGONISTA' },
              },
            ],
          }),
        },
      };

      const service = new OrganizacionService(mockPrisma);
      const resultado = await service.obtenerHistorialUnidad(alcanceGlobal, 1);

      expect(resultado.resumen.totalAsignaciones).toBe(2);
      expect(resultado.resumen.totalEducadores).toBe(1);
      expect(resultado.resumen.totalProtagonistas).toBe(1);
      expect(resultado.resumen.ciclos).toContain(2026);
    });

    it('bloquea eliminación definitiva de una rama si tiene asignaciones o planes vinculados', async () => {
      const mockPrisma: any = {
        rama: {
          findUnique: vi.fn().mockResolvedValue({
            id: 1,
            nombre: 'Lobatos y Lobeznas',
            unidades: [
              {
                id: 1,
                _count: { asignaciones: 15, conceptos: 2, planesCuota: 1 },
              },
            ],
          }),
        },
      };

      const service = new OrganizacionService(mockPrisma);

      await expect(service.eliminarRama(alcanceGlobal, 1, true)).rejects.toThrow(ConflictException);
    });

    it('bloquea eliminación de rol si es el único rol administrador del sistema', async () => {
      const mockPrisma: any = {
        rol: {
          findUnique: vi.fn().mockResolvedValue({
            id: 1,
            nombre: 'Jefe de Grupo Admin',
            alcancePorDefecto: AlcanceRol.GLOBAL,
            _count: { asignaciones: 0 },
            permisos: [{ permiso: { clave: 'organizacion.gestionar' } }],
          }),
          findMany: vi.fn().mockResolvedValue([
            {
              id: 1,
              nombre: 'Jefe de Grupo Admin',
              alcancePorDefecto: AlcanceRol.GLOBAL,
              _count: { asignaciones: 0 },
              permisos: [{ permiso: { clave: 'organizacion.gestionar' } }],
            },
          ]),
        },
      };

      const service = new OrganizacionService(mockPrisma);

      await expect(service.eliminarRol(alcanceGlobal, 1)).rejects.toThrow(
        /no se puede quitar el permiso de administrar roles ni eliminar el último rol administrador/i,
      );
    });
  });
});
