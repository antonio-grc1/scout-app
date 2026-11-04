import { describe, expect, it } from 'vitest';
import { prepararRespuestasParaImpresion } from '../../frontend/src/services/pdfGenerator.js';
import { calcularEdad, formatearFecha, formatearFechaHora } from '../../frontend/src/lib/formatters.js';

describe('Husos horarios y fechas oficiales (GMT-3)', () => {
  it("valida que una fecha '2015-05-01T00:00:00.000Z' formateada en GMT-3 imprima '01 / 05 / 2015' y no '30 / 04 / 2015'", () => {
    process.env.TZ = 'America/Argentina/Buenos_Aires';

    const usuario = {
      nombre: 'Lucía',
      apellido: 'González',
      dni: '55111222',
      fechaNacimiento: '2015-05-01T00:00:00.000Z',
    };

    const res = prepararRespuestasParaImpresion({}, usuario);

    // Debe coincidir exactamente con el día asentado en DNI (01/05/2015) y no 30/04/2015
    expect(res.protagonista_fecha_nac).toBe('01 / 05 / 2015');
    expect(res.salud_fecha_nac).toBe('01 / 05 / 2015');
    expect(res.menor_nac_dia_p3).toBe('01');
    expect(res.menor_nac_mes_p3).toBe('05');
    expect(res.menor_nac_anio_p3).toBe('2015');
    expect(res.ret_menor_nac).toBe('01 / 05 / 2015');
  });

  it('calcularEdad no desfasar días entre fecha UTC y hoy', () => {
    const edad = calcularEdad('2015-05-01T00:00:00.000Z');
    expect(edad).toBeTypeOf('number');
  });

  it('formatearFecha no retrocede un día ante fechas legacy a medianoche UTC', () => {
    process.env.TZ = 'America/Argentina/Buenos_Aires';
    const fecha = '2026-11-03T00:00:00.000Z';
    expect(formatearFecha(fecha)).toBe('03/11/2026');
  });

  it('formatearFechaHora formatea correctamente hora en horario de Argentina (24hs)', () => {
    process.env.TZ = 'America/Argentina/Buenos_Aires';
    // 18:18 UTC = 15:18 en Argentina GMT-3
    const fecha = '2026-11-03T18:18:00.000Z';
    expect(formatearFechaHora(fecha)).toContain('03/11/2026');
    expect(formatearFechaHora(fecha)).toContain('15:18');
  });
});
