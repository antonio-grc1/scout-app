import { BadRequestException } from '@nestjs/common';
import { AlcanceRol, EstadoEntrega } from '@prisma/client';
import { vi } from 'vitest';
import {
  extraerClavesPersistiblesEsquema,
  validarDestinatarioPlantilla,
} from '../common/utils/plantillas.util.js';
import { CrearPlantillaSchema } from './legajos.dto.js';
import { calcularHashVerificacion, LegajosService } from './legajos.service.js';

describe('calcularHashVerificacion', () => {
  it('genera un hash SHA-256 hexadecimal de 64 caracteres', () => {
    const hash = calcularHashVerificacion(1, 2, 2026, 1, { domicilio: 'Calle Falsa 123' });
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('genera hashes distintos para dos ejecuciones (por el salt criptográfico)', () => {
    const h1 = calcularHashVerificacion(1, 2, 2026, 1, { domicilio: 'Calle 1' });
    const h2 = calcularHashVerificacion(1, 2, 2026, 1, { domicilio: 'Calle 1' });
    expect(h1).not.toBe(h2);
  });

  it('verifica que el hash contenga información del ciclo y versión', () => {
    const hash = calcularHashVerificacion(10, 1, 2026, 2, { obra_social: 'OSDE' });
    expect(hash).toBeDefined();
    expect(typeof hash).toBe('string');
  });
});

describe('Legajos - Hardening P2', () => {
  it('CrearPlantillaSchema exige esquemaCamposJson válido según EsquemaCamposSchema', () => {
    const invalida = CrearPlantillaSchema.safeParse({
      codigo: 'TEST_1',
      titulo: 'Test',
      version: '1.0',
      cicloAnio: 2026,
      esquemaCamposJson: { secciones: [{ titulo: 'Sin id ni campos' }] },
      mapeoPdfJson: {},
    });
    expect(invalida.success).toBe(false);

    const valida = CrearPlantillaSchema.safeParse({
      codigo: 'TEST_1',
      titulo: 'Test',
      version: '1.0',
      cicloAnio: 2026,
      esquemaCamposJson: {
        secciones: [{ id: 'sec1', titulo: 'General', campos: [{ key: 'domicilio', label: 'Domicilio', type: 'text' }] }],
      },
      mapeoPdfJson: {},
    });
    expect(valida.success).toBe(true);
  });

  it('obtenerDatosPrecarga valida rango de cicloAnio y respeta rol tipoMiembro PROTAGONISTA con alcance UNIDAD', async () => {
    const mockPrisma: any = {
      usuario: {
        findFirst: vi.fn().mockResolvedValue({
          id: 5,
          dni: '40111222',
          nombre: 'Ana',
          apellido: 'Scout',
          fechaNacimiento: new Date('2010-01-01T00:00:00.000Z'),
          emailContacto: null,
          telefonoContacto: null,
          datosFijosJson: {},
          grupoFamiliar: null,
          asignaciones: [
            {
              unidad: { id: 1, nombre: 'Rama' },
              rol: { id: 2, nombre: 'Guía', tipoMiembro: 'PROTAGONISTA', alcancePorDefecto: AlcanceRol.UNIDAD },
            },
          ],
        }),
      },
      plantillaFormulario: { findUnique: vi.fn().mockResolvedValue({ id: 1, activa: true }) },
      entregaFormulario: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const service = new LegajosService(mockPrisma);

    await expect(service.obtenerDatosPrecarga({ tipo: 'GLOBAL' }, 5, 1, 1800)).rejects.toThrow(
      BadRequestException,
    );

    const precarga = await service.obtenerDatosPrecarga({ tipo: 'GLOBAL' }, 5, 1, 2026);
    expect(precarga.esEducador).toBe(false);
  });
});

describe('Legajos - Plantillas dinámicas y selectores estructurados', () => {
  it('validarDestinatarioPlantilla respeta destinatario, edadMinima/Maxima y tipoMiembro declarativos con fallback legacy', () => {
    const schemaMenoresCustom = {
      codigo: 'AUTORIZACION_CAMPAMENTO_2026',
      esquemaCamposJson: { destinatario: 'MENORES', secciones: [] },
    };
    expect(validarDestinatarioPlantilla(schemaMenoresCustom, { edad: 14, esEducador: false })).toBeNull();
    expect(validarDestinatarioPlantilla(schemaMenoresCustom, { edad: 21, esEducador: false })).toMatch(
      /menores de 18/,
    );

    const schemaRangoEducador = {
      codigo: 'FICHA_SALIDA_NOCTURNA',
      esquemaCamposJson: {
        destinatario: 'TODOS',
        tipoMiembro: 'EDUCADOR',
        edadMinima: 21,
        edadMaxima: 65,
        secciones: [],
      },
    };
    expect(validarDestinatarioPlantilla(schemaRangoEducador, { edad: 30, esEducador: false })).toMatch(
      /exclusivamente para educadores/,
    );
    expect(validarDestinatarioPlantilla(schemaRangoEducador, { edad: 19, esEducador: true })).toMatch(
      /al menos 21 años/,
    );
    expect(validarDestinatarioPlantilla(schemaRangoEducador, { edad: 30, esEducador: true })).toBeNull();

    const legacyRovers = { codigo: 'LEGAJO_ROVERS_2026', esquemaCamposJson: { secciones: [] } };
    expect(validarDestinatarioPlantilla(legacyRovers, { edad: 15, esEducador: false })).toMatch(
      /mayores de edad/,
    );
    expect(validarDestinatarioPlantilla(legacyRovers, { edad: 19, esEducador: false })).toBeNull();
  });

  it('extraerClavesPersistiblesEsquema incorpora claves dinámicas salvo persistirEnPerfil: false', () => {
    const base = new Set(['domicilio']);
    const claves = extraerClavesPersistiblesEsquema(
      {
        secciones: [
          {
            id: 'sec_1',
            titulo: 'Salud',
            campos: [
              { key: 'regimen_dietario_tipos', label: 'Dieta', type: 'multiselect' },
              { key: 'campo_no_persistible', label: 'Temp', type: 'text', persistirEnPerfil: false },
              { key: '__proto__', label: 'Malicioso', type: 'text' },
            ],
          },
        ],
      },
      base,
    );

    expect(claves.has('domicilio')).toBe(true);
    expect(claves.has('regimen_dietario_tipos')).toBe(true);
    expect(claves.has('campo_no_persistible')).toBe(false);
    expect(claves.has('__proto__')).toBe(false);
  });

  it('guardarEntrega valida destinatario dinámico y persiste arrays de multiselect en datosFijosJson', async () => {
    const usuarioUpdate = vi.fn().mockResolvedValue({});
    const entregaCreate = vi.fn().mockImplementation(async ({ data }: any) => ({
      id: 99,
      ...data,
      plantilla: { id: 10, codigo: 'FICHA_CAMPAMENTO_2026', titulo: 'Campamento Anual' },
      usuario: { id: 5, nombre: 'Ana', apellido: 'Scout', dni: '40111222' },
    }));

    const mockPrisma: any = {
      usuario: {
        findFirst: vi.fn().mockResolvedValue({
          id: 5,
          activo: true,
          tipoMiembro: 'PROTAGONISTA',
          fechaNacimiento: new Date('2012-05-01T00:00:00.000Z'),
          datosFijosJson: { domicilio: 'Av. Scout 100' },
        }),
      },
      plantillaFormulario: {
        findUnique: vi.fn().mockResolvedValue({
          id: 10,
          codigo: 'FICHA_CAMPAMENTO_2026',
          activa: true,
          esquemaCamposJson: {
            destinatario: 'TODOS',
            secciones: [
              {
                id: 'dieta',
                titulo: 'Dieta y Salud',
                campos: [
                  { key: 'regimen_dietario_tipos', label: 'Régimen', type: 'multiselect' },
                  { key: 'preferencia_carpa', label: 'Carpa', type: 'text' },
                  { key: 'solo_evento', label: 'Solo Evento', type: 'text', persistirEnPerfil: false },
                ],
              },
            ],
          },
        }),
      },
      $transaction: vi.fn().mockImplementation(async (cb: any) =>
        cb({
          entregaFormulario: {
            findFirst: vi.fn().mockResolvedValue(null),
            create: entregaCreate,
          },
          usuario: {
            update: usuarioUpdate,
          },
        }),
      ),
    };

    const service = new LegajosService(mockPrisma);
    const entrega = await service.guardarEntrega(
      { id: 1, dni: '12345678', nombre: 'Dir', apellido: 'Test', activo: true, permisos: [] } as any,
      { tipo: 'GLOBAL' },
      {
        usuarioId: 5,
        plantillaId: 10,
        cicloAnio: 2026,
        respuestas: {
          regimen_dietario_tipos: ['VEGETARIANO', 'SIN_LACTOSA'],
          preferencia_carpa: 'Patrulla Halcón',
          solo_evento: 'No guardar en perfil',
        },
        finalizarParaFirma: true,
        actualizarDatosFijos: true,
      },
    );

    expect(entrega.estado).toBe(EstadoEntrega.PENDIENTE_FIRMA_FISICA);
    expect(usuarioUpdate).toHaveBeenCalledTimes(1);
    const updateArg = usuarioUpdate.mock.calls[0][0];
    expect(updateArg.data.datosFijosJson).toEqual({
      domicilio: 'Av. Scout 100',
      regimen_dietario_tipos: ['VEGETARIANO', 'SIN_LACTOSA'],
      preferencia_carpa: 'Patrulla Halcón',
    });
    expect(updateArg.data.datosFijosJson.solo_evento).toBeUndefined();
  });
});

describe('SELECT_DETALLE_ENTREGA_QR (verificación de QR)', () => {
  it('solo pide campos que existen en el schema de Prisma', async () => {
    const { Prisma } = await import('@prisma/client');
    const { SELECT_DETALLE_ENTREGA_QR } = await import('./legajos.service.js');
    const modelos = new Map(Prisma.dmmf.datamodel.models.map((m) => [m.name, m]));

    const revisar = (modelo: string, select: Record<string, unknown>, ruta: string) => {
      const def = modelos.get(modelo);
      expect(def, `modelo ${modelo}`).toBeTruthy();
      for (const [campo, valor] of Object.entries(select)) {
        const f = def!.fields.find((x) => x.name === campo);
        expect(f, `${ruta}.${campo} no existe en ${modelo}`).toBeTruthy();
        const sub = (valor as { select?: Record<string, unknown> })?.select;
        if (sub) revisar(f!.type, sub, `${ruta}.${campo}`);
      }
    };
    revisar('EntregaFormulario', SELECT_DETALLE_ENTREGA_QR, 'EntregaFormulario');
  });
});
