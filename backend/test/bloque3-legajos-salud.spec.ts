import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EstadoEntrega } from '@prisma/client';
import type { AlcanceAcceso, AuthUser } from '../src/common/types/auth.types.js';
import { LegajosService, CAMPOS_DATOS_FIJOS_PERMITIDOS, CAMPOS_FAMILIARES_PERMITIDOS_COMPARTIR } from '../src/legajos/legajos.service.js';

describe('BLOQUE 3 - Backend Legajos, Formularios de Salud y Auditoría Médica', () => {
  const actorEducador: AuthUser = { sub: 10, username: 'educador1', roles: ['EDUCADOR'] };
  const alcanceGlobal: AlcanceAcceso = { tipo: 'GLOBAL' };

  describe('Validación de plantillas según edad y tipo de miembro', () => {
    const mockPrisma: any = {
      usuario: { findFirst: vi.fn(), update: vi.fn() },
      plantillaFormulario: { findUnique: vi.fn() },
      entregaFormulario: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
      $transaction: vi.fn((cb) => cb(mockPrisma)),
    };
    const service = new LegajosService(mockPrisma);

    it('rechaza si el miembro está inactivo', async () => {
      mockPrisma.usuario.findFirst.mockResolvedValueOnce({
        id: 1,
        activo: false,
        fechaNacimiento: new Date('2015-05-10'),
      });

      await expect(
        service.guardarEntrega(actorEducador, alcanceGlobal, {
          usuarioId: 1,
          plantillaId: 1,
          cicloAnio: 2026,
          respuestas: {},
          finalizarParaFirma: false,
          actualizarDatosFijos: true,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza si un mayor de 18 años intenta completar LEGAJO_MENORES_2026', async () => {
      mockPrisma.usuario.findFirst.mockResolvedValueOnce({
        id: 2,
        activo: true,
        fechaNacimiento: new Date('2000-01-01'), // 26 años
      });
      mockPrisma.plantillaFormulario.findUnique.mockResolvedValueOnce({
        id: 1,
        codigo: 'LEGAJO_MENORES_2026',
        activa: true,
      });

      await expect(
        service.guardarEntrega(actorEducador, alcanceGlobal, {
          usuarioId: 2,
          plantillaId: 1,
          cicloAnio: 2026,
          respuestas: {},
          finalizarParaFirma: false,
          actualizarDatosFijos: true,
        }),
      ).rejects.toThrow(/exclusiva para menores de 18/i);
    });

    it('rechaza si un menor de 18 años intenta completar LEGAJO_ROVERS_2026', async () => {
      mockPrisma.usuario.findFirst.mockResolvedValueOnce({
        id: 3,
        activo: true,
        fechaNacimiento: new Date('2014-06-15'), // 11-12 años
      });
      mockPrisma.plantillaFormulario.findUnique.mockResolvedValueOnce({
        id: 2,
        codigo: 'LEGAJO_ROVERS_2026',
        activa: true,
      });

      await expect(
        service.guardarEntrega(actorEducador, alcanceGlobal, {
          usuarioId: 3,
          plantillaId: 2,
          cicloAnio: 2026,
          respuestas: {},
          finalizarParaFirma: false,
          actualizarDatosFijos: true,
        }),
      ).rejects.toThrow(/mayores de edad/i);
    });

    it('rechaza si un menor de 18 años intenta completar LEGAJO_EDUCADORES_2026', async () => {
      mockPrisma.usuario.findFirst.mockResolvedValueOnce({
        id: 4,
        activo: true,
        fechaNacimiento: new Date('2012-03-20'), // 14 años
      });
      mockPrisma.plantillaFormulario.findUnique.mockResolvedValueOnce({
        id: 3,
        codigo: 'LEGAJO_EDUCADORES_2026',
        activa: true,
      });

      await expect(
        service.guardarEntrega(actorEducador, alcanceGlobal, {
          usuarioId: 4,
          plantillaId: 3,
          cicloAnio: 2026,
          respuestas: {},
          finalizarParaFirma: false,
          actualizarDatosFijos: true,
        }),
      ).rejects.toThrow(/dirigentes y educadores adultos/i);
    });
  });

  describe('Sanitización de datos fijos y exclusión de claves no permitidas', () => {
    it('CAMPOS_DATOS_FIJOS_PERMITIDOS contiene campos personales y médicos válidos', () => {
      expect(CAMPOS_DATOS_FIJOS_PERMITIDOS.has('obra_social')).toBe(true);
      expect(CAMPOS_DATOS_FIJOS_PERMITIDOS.has('grupo_sanguineo')).toBe(true);
      expect(CAMPOS_DATOS_FIJOS_PERMITIDOS.has('alergias')).toBe(true);
      expect(CAMPOS_DATOS_FIJOS_PERMITIDOS.has('protagonista_domicilio')).toBe(true);
      expect(CAMPOS_DATOS_FIJOS_PERMITIDOS.has('__proto__')).toBe(false);
      expect(CAMPOS_DATOS_FIJOS_PERMITIDOS.has('confirma_autorizacion_salidas')).toBe(false);
    });

    it('sincroniza en usuario.datosFijosJson solo campos permitidos y filtra claves espurias', async () => {
      const mockPrisma: any = {
        usuario: {
          findFirst: vi.fn().mockResolvedValue({
            id: 10,
            activo: true,
            fechaNacimiento: new Date('2015-01-01'), // 11 años
            datosFijosJson: { protagonista_domicilio: 'Calle Vieja 123' },
          }),
          update: vi.fn().mockResolvedValue({}),
        },
        plantillaFormulario: {
          findUnique: vi.fn().mockResolvedValue({
            id: 1,
            codigo: 'LEGAJO_MENORES_2026',
            activa: true,
          }),
        },
        entregaFormulario: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ id: 100 }),
        },
        $transaction: vi.fn((cb) => cb(mockPrisma)),
      };
      const service = new LegajosService(mockPrisma);

      await service.guardarEntrega(actorEducador, alcanceGlobal, {
        usuarioId: 10,
        plantillaId: 1,
        cicloAnio: 2026,
        respuestas: {
          protagonista_domicilio: 'Avenida San Martín 456',
          grupo_sanguineo: 'A+',
          alergias: 'Penicilina',
          confirma_autorizacion_salidas: true, // no debe ir a datosFijosJson
          hack_arbitrary_key: 'malicious', // no debe ir a datosFijosJson
        },
        finalizarParaFirma: true,
        actualizarDatosFijos: true,
      });

      expect(mockPrisma.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 10 },
          data: {
            datosFijosJson: {
              protagonista_domicilio: 'Avenida San Martín 456',
              grupo_sanguineo: 'A+',
              alergias: 'Penicilina',
            },
          },
        }),
      );
    });
  });

  describe('Privacidad médica en sugerencias familiares (obtenerDatosPrecarga)', () => {
    it('CAMPOS_FAMILIARES_PERMITIDOS_COMPARTIR no incluye campos médicos', () => {
      expect(CAMPOS_FAMILIARES_PERMITIDOS_COMPARTIR.has('grupo_sanguineo')).toBe(false);
      expect(CAMPOS_FAMILIARES_PERMITIDOS_COMPARTIR.has('alergias')).toBe(false);
      expect(CAMPOS_FAMILIARES_PERMITIDOS_COMPARTIR.has('medicacion_habitual')).toBe(false);
      expect(CAMPOS_FAMILIARES_PERMITIDOS_COMPARTIR.has('protagonista_domicilio')).toBe(true);
      expect(CAMPOS_FAMILIARES_PERMITIDOS_COMPARTIR.has('madre_telefono')).toBe(true);
      expect(CAMPOS_FAMILIARES_PERMITIDOS_COMPARTIR.has('emergencia_telefono')).toBe(true);
    });

    it('sugiere únicamente datos familiares de contacto y domicilio de hermanos, nunca datos médicos', async () => {
      const mockPrisma: any = {
        usuario: {
          findFirst: vi.fn().mockResolvedValue({
            id: 20,
            dni: '45000111',
            nombre: 'Juan',
            apellido: 'Pérez',
            fechaNacimiento: new Date('2014-05-10'),
            grupoFamiliar: { id: 9, nombreFamilia: 'Familia Pérez' },
            asignaciones: [{ unidad: { id: 1, nombre: 'Manada' }, rol: { tipoMiembro: 'PROTAGONISTA' } }],
          }),
          findMany: vi.fn().mockResolvedValue([
            {
              datosFijosJson: {
                protagonista_domicilio: 'Calle Sol 789',
                madre_nombres: 'María Gómez',
                madre_telefono: '1122334455',
                // Datos médicos del hermano que NO deben compartirse:
                grupo_sanguineo: '0-',
                alergias: 'Mani, Polvo',
                medicacion_habitual: 'Ritalina',
                enfermedades_cronicas: 'Asma severo',
              },
            },
          ]),
        },
        plantillaFormulario: {
          findUnique: vi.fn().mockResolvedValue({ id: 1, activa: true }),
        },
        entregaFormulario: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      };
      const service = new LegajosService(mockPrisma);

      const precarga = await service.obtenerDatosPrecarga(alcanceGlobal, 20, 1, 2026);

      expect(precarga.datosFamiliaresSugeridos).toEqual({
        protagonista_domicilio: 'Calle Sol 789',
        madre_nombres: 'María Gómez',
        madre_telefono: '1122334455',
      });
      // Asegurarse de que ningún dato médico del hermano se transfiera
      expect(precarga.datosFamiliaresSugeridos).not.toHaveProperty('grupo_sanguineo');
      expect(precarga.datosFamiliaresSugeridos).not.toHaveProperty('alergias');
      expect(precarga.datosFamiliaresSugeridos).not.toHaveProperty('medicacion_habitual');
      expect(precarga.datosFamiliaresSugeridos).not.toHaveProperty('enfermedades_cronicas');
    });
  });

  describe('Auditoría física y validación de estado activo en validarFisico', () => {
    it('bloquea validación física si el miembro está inactivo', async () => {
      const mockPrisma: any = {
        entregaFormulario: {
          findFirst: vi.fn().mockResolvedValue({
            id: 50,
            estado: EstadoEntrega.PENDIENTE_FIRMA_FISICA,
            hashVerificacion: 'hash123',
            usuario: {
              id: 30,
              activo: false,
              asignaciones: [{ unidadId: 1 }],
            },
          }),
        },
      };
      const service = new LegajosService(mockPrisma);

      await expect(service.validarFisico(actorEducador, alcanceGlobal, 'hash123')).rejects.toThrow(
        /miembro inactivo o dado de baja/i,
      );
    });

    it('bloquea validación física si el miembro no tiene asignación activa', async () => {
      const mockPrisma: any = {
        entregaFormulario: {
          findFirst: vi.fn().mockResolvedValue({
            id: 50,
            estado: EstadoEntrega.PENDIENTE_FIRMA_FISICA,
            hashVerificacion: 'hash123',
            usuario: {
              id: 30,
              activo: true,
              asignaciones: [], // Sin asignación activa
            },
          }),
        },
      };
      const service = new LegajosService(mockPrisma);

      await expect(service.validarFisico(actorEducador, alcanceGlobal, 'hash123')).rejects.toThrow(
        /no posee ninguna unidad o asignación activa/i,
      );
    });

    it('valida físicamente con éxito y registra auditoría de fecha y educador', async () => {
      const mockPrisma: any = {
        entregaFormulario: {
          findFirst: vi.fn().mockResolvedValue({
            id: 50,
            estado: EstadoEntrega.PENDIENTE_FIRMA_FISICA,
            hashVerificacion: 'hash123',
            usuario: {
              id: 30,
              activo: true,
              asignaciones: [{ unidadId: 1 }],
            },
          }),
          update: vi.fn().mockResolvedValue({
            id: 50,
            estado: EstadoEntrega.VALIDADO_FISICAMENTE,
            validadoPorUsuarioId: actorEducador.sub,
          }),
        },
      };
      const service = new LegajosService(mockPrisma);

      const res = await service.validarFisico(actorEducador, alcanceGlobal, 'hash123');

      expect(res.estado).toBe(EstadoEntrega.VALIDADO_FISICAMENTE);
      expect(mockPrisma.entregaFormulario.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 50 },
          data: expect.objectContaining({
            estado: EstadoEntrega.VALIDADO_FISICAMENTE,
            validadoPorUsuarioId: actorEducador.sub,
          }),
        }),
      );
    });
  });
});
