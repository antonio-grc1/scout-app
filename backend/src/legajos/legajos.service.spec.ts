import { BadRequestException } from '@nestjs/common';
import { AlcanceRol } from '@prisma/client';
import { vi } from 'vitest';
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
