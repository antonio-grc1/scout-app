import { sugerirPase, type RamaLite } from './pases.logic.js';

const RAMAS: RamaLite[] = [
  { id: 1, nombre: 'Lobatos', edadMinima: 7, edadMaxima: 9, ordenProgresion: 1 },
  { id: 2, nombre: 'Scout', edadMinima: 10, edadMaxima: 13, ordenProgresion: 2 },
  { id: 3, nombre: 'Caminante', edadMinima: 14, edadMaxima: 17, ordenProgresion: 3 },
  { id: 4, nombre: 'Rover', edadMinima: 18, edadMaxima: 21, ordenProgresion: 4 },
];
const ref = new Date('2026-03-01');
const nac = (s: string) => new Date(s);

describe('sugerirPase', () => {
  it('null si sigue en rango', () => {
    expect(sugerirPase(nac('2017-05-01'), RAMAS[0], RAMAS, ref)).toBeNull(); // 8 años
  });

  it('respeta el día de cumpleaños', () => {
    expect(sugerirPase(nac('2016-03-02'), RAMAS[0], RAMAS, ref)).toBeNull(); // cumple 10 mañana
    expect(sugerirPase(nac('2016-03-01'), RAMAS[0], RAMAS, ref)?.sugerencia).toEqual({
      tipo: 'PROGRESION',
      ramaSugerida: RAMAS[1],
    });
  });

  it('salta a la rama que contiene la edad si quedó atrasado', () => {
    expect(sugerirPase(nac('2011-01-01'), RAMAS[0], RAMAS, ref)?.sugerencia).toEqual({
      tipo: 'PROGRESION',
      ramaSugerida: RAMAS[2],
    }); // 15 años en Lobatos -> Caminante
  });

  it('Rover con 22 años -> EGRESO (pasa a Educador)', () => {
    const r = sugerirPase(nac('2004-01-01'), RAMAS[3], RAMAS, ref);
    expect(r).toEqual({ edad: 22, sugerencia: { tipo: 'EGRESO' } });
  });

  it('usa los rangos de la BD (sin hardcode)', () => {
    const custom = RAMAS.map((r) => (r.id === 1 ? { ...r, edadMaxima: 10 } : r));
    expect(sugerirPase(nac('2016-01-01'), custom[0], custom, ref)).toBeNull(); // 10 años, ahora válido
  });

  it('si hay hueco entre ramas sugiere la siguiente', () => {
    const conHueco = [RAMAS[0], { ...RAMAS[1], edadMinima: 12 }];
    expect(sugerirPase(nac('2015-01-01'), conHueco[0], conHueco, ref)?.sugerencia).toEqual({
      tipo: 'PROGRESION',
      ramaSugerida: conHueco[1],
    }); // 11 años, ninguna la contiene
  });
});
