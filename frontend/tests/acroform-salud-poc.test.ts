import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { createServer, type ViteDevServer } from 'vite';

let vite: ViteDevServer;
let pdfSaludDataUrl = '';
let saludBytes: Uint8Array;
let menoresBytes: Uint8Array;
let pdfMenoresDataUrl = '';
let mayoresBytes: Uint8Array;
let pdfMayoresDataUrl = '';

function cargarTemplateDataUrl(fileName: string): { bytes: Uint8Array; dataUrl: string } {
  const tplPath = path.resolve(process.cwd(), 'public/pdf-templates', fileName);
  const bytes = new Uint8Array(fs.readFileSync(tplPath));
  return {
    bytes,
    dataUrl: `data:application/pdf;base64,${Buffer.from(bytes).toString('base64')}`,
  };
}

function leerClavesEsquemaBackend(): {
  menoresKeys: string[];
  mayoresKeys: string[];
  educadoresKeys: string[];
} {
  // Extraer las claves reales declaradas en backend/prisma/plantilla-oficial-2026.ts sin importar @prisma/client
  const srcPath = path.resolve(process.cwd(), '../backend/prisma/plantilla-oficial-2026.ts');
  const src = fs.readFileSync(srcPath, 'utf8');
  const secSplit = src.indexOf('export const ESQUEMA_CAMPOS_ROVERS_2026');
  const menoresBlock = src.slice(0, secSplit);

  const extraerSeccionKeys = (secId: string): string[] => {
    const start = menoresBlock.indexOf(`id: '${secId}'`);
    const nextSec = menoresBlock.indexOf("id: 'seccion_", start + 20);
    const slice = menoresBlock.slice(start, nextSec === -1 ? menoresBlock.length : nextSec);
    return Array.from(slice.matchAll(/key:\s*'([a-z0-9_]+)'/g)).map((m) => m[1]);
  };

  const s0 = extraerSeccionKeys('seccion_inscripcion');
  const s1 = extraerSeccionKeys('seccion_salud');
  const s2 = extraerSeccionKeys('seccion_autorizacion_ingreso');
  const s3 = extraerSeccionKeys('seccion_autorizacion_salidas');
  const s4 = extraerSeccionKeys('seccion_necesidades_especiales');
  const s5 = extraerSeccionKeys('seccion_retiro_menores');
  const s6 = extraerSeccionKeys('seccion_ficha_adultos');

  return {
    menoresKeys: [...s0, ...s1, ...s2, ...s3, ...s4, ...s5, ...s6],
    mayoresKeys: [...s0, ...s1, ...s4, ...s6],
    educadoresKeys: ['protagonista_domicilio', 'obra_social', 'obra_social_afiliado', ...s1],
  };
}

async function extraerTextoPorPagina(pdfBytes: Uint8Array): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(pdfBytes),
    disableFontFace: true,
    verbosity: 0,
  }).promise;

  const paginas: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const pg = await doc.getPage(i);
    const tc = await pg.getTextContent();
    const texto = tc.items
      .map((item: any) => (typeof item?.str === 'string' ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    paginas.push(texto);
  }
  if (typeof (doc as any).destroy === 'function') {
    await (doc as any).destroy();
  }
  return paginas;
}

before(async () => {
  const s = cargarTemplateDataUrl('planilla_salud_01_25_acroform.pdf');
  saludBytes = s.bytes;
  pdfSaludDataUrl = s.dataUrl;

  const men = cargarTemplateDataUrl('legajo_menores_2026_acroform.pdf');
  menoresBytes = men.bytes;
  pdfMenoresDataUrl = men.dataUrl;

  const may = cargarTemplateDataUrl('legajo_mayores_2026_acroform.pdf');
  mayoresBytes = may.bytes;
  pdfMayoresDataUrl = may.dataUrl;

  vite = await createServer({
    root: process.cwd(),
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
    optimizeDeps: { noDiscovery: true },
    logLevel: 'silent',
  });
});

after(async () => {
  await vite?.close();
});

describe('PoC AcroForm Planilla 01-25 de Salud + Anexo anti-desborde', () => {
  it('detecta los 61 campos AcroForm y valida que todos quedan vinculados contra el esquema', async () => {
    const { extraerCamposAcroFormPdf, validarCamposAcroFormContraEsquema } =
      await vite.ssrLoadModule('/src/services/pdfGenerator.ts');

    const campos = await extraerCamposAcroFormPdf(saludBytes);
    assert.equal(campos.length, 61);

    const esquemaSaludMinimo = {
      secciones: [
        {
          id: 'seccion_salud',
          campos: [
            'tel_emergencia_1',
            'tel_emergencia_2',
            'fecha_control_medico',
            'vacuna_quintuple',
            'vacuna_triple_celular',
            'vacuna_triple_acelular',
            'vacuna_doble_bacteriana',
            'no_tiene_vacunas_mencionadas',
            'no_sabe_vacunas',
            'toma_medicacion',
            'medicacion_tipos',
            'toma_medicacion_detalle',
            'enfermedad_cronica',
            'condiciones_medicas_tipos',
            'enfermedad_cronica_detalle',
            'requiere_tratamiento',
            'requiere_tratamiento_detalle',
            'tiene_cud',
            'sufre_alergia',
            'alergias_tipos',
            'sufre_alergia_detalle',
            'esta_anticoagulado',
            'anticoagulado_droga',
            'regimen_dietario',
            'regimen_dietario_tipos',
            'regimen_dietario_detalle',
            'ataques_panico_ansiedad',
            'ataques_panico_frecuencia',
            'diagnostico_salud_mental',
            'diagnostico_salud_mental_detalle',
            'recibe_tratamiento_salud_mental',
            'recibe_tratamiento_salud_mental_detalle',
            'miedo_fobia_excesivo',
            'miedo_fobia_detalle',
            'sit_hemorragias_nasales',
            'sit_sangrado_encias',
            'sit_dolor_cabeza',
            'sit_presion_alta',
            'sit_presion_baja',
            'sit_transfusiones',
            'sit_convulsiones',
            'sit_cirugias_ultimo_anio',
            'sit_internaciones_ultimo_anio',
            'sit_actividad_fisica',
            'sit_cualquier_actividad_fisica',
            'sit_actividad_fisica_no_especifique',
            'grupo_sanguineo',
            'factor_rh',
            'peso_kg',
            'talla_m',
            'tel_emergencia_obra_social',
            'comunicacion_educador_necesaria',
          ].map((key) => ({ key })),
        },
      ],
    };

    const validacion = validarCamposAcroFormContraEsquema(campos, esquemaSaludMinimo, {});
    assert.equal(validacion.totalCamposPdf, 61);
    assert.equal(validacion.sinPreguntaEnFormulario.length, 0);
    assert.equal(validacion.vinculados.length, 61);
  });

  it('Caso 1: datos sucios con tildes/NFD y desborde generan Anexo automático sin truncar y aplanan el formulario', async () => {
    const { PDFDocument } = await import('pdf-lib');
    const { generarFichaPdf } = await vite.ssrLoadModule('/src/services/pdfGenerator.ts');

    const medicacionLarga =
      '1) Salbutamol puff 100mcg SOS ante broncoespasmo; 2) Budesonida 200mcg cada 12 hs (08:00 y 20:00); 3) Cetirizina 10mg 1 comp./día a la noche; 4) Ibuprofeno 400mg solo con autorización médica';
    const alergiaLarga =
      'Alergia severa a maní, nueces pecán, piña fresca, penicilina, amoxicilina con ácido clavulánico y ácaros de polvo en ambiente cerrado';
    const dietaLarga =
      'Menú estricto sin TACC (celiaquía confirmada) + alimentación vegetariana sin carnes rojas, aves ni pescados; evitar contaminación cruzada';
    const comunicacionLarga =
      'Por favor revisar la heladerita térmica al llegar al campamento en Co\u0301rdoba y avisar al teléfono alternativo ante cualquier cuadro respiratorio.';

    const bytes = await generarFichaPdf(
      {
        pdfBaseUrl: '__UPLOADED_PDF__',
        pdfBaseDataUrl: pdfSaludDataUrl,
        modoRender: 'PDF_ACROFORM',
        indexBase: 0,
        campos: {},
        qrVerificacion: { page: 0, x: 514, y: 749, width: 52 },
      },
      {
        protagonista_domicilio: 'Av. Vélez Sársfield 1420, B° Nueva Co\u0301rdoba',
        tel_emergencia_1: '351-555-8899',
        tel_emergencia_2: '351-444-1122',
        obra_social: 'APROSS Córdoba',
        obra_social_afiliado: '0012-998877-02',
        tel_emergencia_obra_social: '0800-555-2776',
        fecha_control_medico: '2026-03-04',
        vacuna_quintuple: '15/03/2020',
        no_tiene_vacunas_mencionadas: false,
        no_sabe_vacunas: true,
        toma_medicacion: true,
        medicacion_tipos: ['DIARIA', 'RESCATE'],
        toma_medicacion_detalle: medicacionLarga,
        enfermedad_cronica: true,
        condiciones_medicas_tipos: ['ASMA'],
        enfermedad_cronica_detalle: 'Asma alérgica estacional moderada',
        sufre_alergia: true,
        alergias_tipos: ['ALIMENTOS', 'MEDICAMENTOS', 'AMBIENTALES'],
        sufre_alergia_detalle: alergiaLarga,
        regimen_dietario: true,
        regimen_dietario_tipos: ['CELIACO', 'VEGETARIANO'],
        regimen_dietario_detalle: dietaLarga,
        grupo_sanguineo: 'A',
        factor_rh: '+',
        peso_kg: '54',
        talla_m: '1.63',
        sit_actividad_fisica: true,
        sit_cualquier_actividad_fisica: true,
        comunicacion_educador_necesaria: comunicacionLarga,
        autorizante_nombre: 'Martín Ñáñez',
        autorizante_dni: '29.876.543',
      },
      'HASH-DESBORDE-SALUD-001',
      {
        nombre: 'Sofía Ñandú',
        apellido: 'Peña León',
        dni: '44555666',
        fechaNacimiento: '2012-08-19',
        ramaNombre: 'Unidad Scout Cura Brochero',
      },
      1,
      { tituloDocumento: 'Declaración Jurada de Salud (Planilla 01-25)' },
    );

    const recargado = await PDFDocument.load(bytes);
    assert.ok(
      recargado.getPageCount() >= 2,
      `Se esperaba >= 2 páginas con Anexo, resultó ${recargado.getPageCount()}`,
    );
    assert.equal(recargado.getForm().getFields().length, 0, 'El PDF debe quedar aplanado (flatten)');

    const textos = await extraerTextoPorPagina(bytes);
    const pag1 = textos[0];
    const pag2 = textos.slice(1).join(' ');

    assert.match(pag1, /PEÑA LEÓN/);
    assert.match(pag1, /Sofía Ñandú/);
    assert.match(pag1, /Martín Ñáñez/);
    assert.match(pag1, /VER ANEXO/i);

    assert.match(pag2, /ANEXO DE INFORMACIÓN AMPLIADA/);
    assert.match(pag2, /Salbutamol puff 100mcg SOS/);
    assert.match(pag2, /Ibuprofeno 400mg solo con autorización médica/);
    assert.match(pag2, /amoxicilina con ácido clavulánico y ácaros/);
    assert.match(pag2, /contaminación cruzada/);
    assert.match(pag2, /campamento en Córdoba/);
  });

  it('Caso 2: datos normales sin desborde generan exactamente 1 página aplanada', async () => {
    const { PDFDocument } = await import('pdf-lib');
    const { generarFichaPdf } = await vite.ssrLoadModule('/src/services/pdfGenerator.ts');

    const bytes = await generarFichaPdf(
      {
        pdfBaseUrl: '__UPLOADED_PDF__',
        pdfBaseDataUrl: pdfSaludDataUrl,
        modoRender: 'PDF_ACROFORM',
        indexBase: 0,
        campos: {},
        qrVerificacion: { page: 0, x: 514, y: 749, width: 52 },
      },
      {
        protagonista_domicilio: 'Vera y Zárate 3069',
        tel_emergencia_1: '3515551234',
        obra_social: 'OSDE 210',
        obra_social_afiliado: '6100123456',
        tel_emergencia_obra_social: '0810-888-7788',
        grupo_sanguineo: '0',
        factor_rh: '+',
        peso_kg: '48',
        talla_m: '1.55',
        sit_actividad_fisica: true,
        sit_cualquier_actividad_fisica: true,
        autorizante_nombre: 'Laura Gómez',
        autorizante_dni: '27.333.444',
      },
      'HASH-NORMAL-SALUD-002',
      {
        nombre: 'Tomás',
        apellido: 'Gómez',
        dni: '46111222',
        fechaNacimiento: '2014-04-10',
        ramaNombre: 'Lobatos',
      },
    );

    const recargado = await PDFDocument.load(bytes);
    assert.equal(recargado.getPageCount(), 1);
    assert.equal(recargado.getForm().getFields().length, 0);

    const [pag1] = await extraerTextoPorPagina(bytes);
    assert.match(pag1, /GÓMEZ/);
    assert.match(pag1, /Tomás/);
    assert.match(pag1, /Laura Gómez/);
    assert.doesNotMatch(pag1, /VER ANEXO/i);
  });

  it('Caso 3: Educador o Mayor de 18 años firma con su propio nombre y DNI', async () => {
    const { PDFDocument } = await import('pdf-lib');
    const { generarFichaPdf, prepararRespuestasParaImpresion } = await vite.ssrLoadModule(
      '/src/services/pdfGenerator.ts',
    );

    const educador = {
      nombre: 'Carolina',
      apellido: 'Ibarra',
      dni: '33444555',
      fechaNacimiento: '1991-09-22',
      tipoMiembro: 'EDUCADOR',
      ramaNombre: 'Rama Rovers',
    };

    const prep = prepararRespuestasParaImpresion({}, educador, { destinatario: 'EDUCADORES' });
    assert.equal(prep.salud_firmante_aclaracion, 'IBARRA, Carolina');
    assert.equal(prep.salud_firmante_dni, '33444555');

    const bytes = await generarFichaPdf(
      {
        pdfBaseUrl: '__UPLOADED_PDF__',
        pdfBaseDataUrl: pdfSaludDataUrl,
        modoRender: 'PDF_ACROFORM',
        indexBase: 0,
        campos: {},
        qrVerificacion: { page: 0, x: 514, y: 749, width: 52 },
      },
      {
        protagonista_domicilio: 'Av. Colón 2150',
        tel_emergencia_1: '3516007788',
        grupo_sanguineo: 'B',
        factor_rh: '-',
        peso_kg: '62',
        talla_m: '1.68',
        sit_actividad_fisica: true,
        sit_cualquier_actividad_fisica: true,
      },
      'HASH-EDUCADOR-003',
      educador,
      1,
      { destinatario: 'TODOS' },
    );

    const recargado = await PDFDocument.load(bytes);
    assert.equal(recargado.getPageCount(), 1);
    assert.equal(recargado.getForm().getFields().length, 0);

    const [pag1] = await extraerTextoPorPagina(bytes);
    assert.match(pag1, /IBARRA, Carolina/);
    assert.match(pag1, /33444555/);
  });

  it('Caso 4: modo en blanco (blank: true) devuelve 1 página sin rellenar ni aplanar', async () => {
    const { PDFDocument } = await import('pdf-lib');
    const { generarFichaPdf } = await vite.ssrLoadModule('/src/services/pdfGenerator.ts');

    const bytes = await generarFichaPdf(
      {
        pdfBaseUrl: '__UPLOADED_PDF__',
        pdfBaseDataUrl: pdfSaludDataUrl,
        modoRender: 'PDF_ACROFORM',
        indexBase: 0,
        campos: {},
      },
      {
        protagonista_domicilio: 'No debe imprimirse',
        toma_medicacion_detalle: 'Texto largo que tampoco debe imprimirse ni disparar anexo en modo en blanco',
      },
      '',
      {
        nombre: 'Sofía',
        apellido: 'Scout',
        dni: '42123456',
      },
      1,
      undefined,
      { blank: true },
    );

    const recargado = await PDFDocument.load(bytes);
    assert.equal(recargado.getPageCount(), 1);
    assert.equal(
      recargado.getForm().getFields().length,
      61,
      'En modo en blanco el molde debe conservar los campos AcroForm vacíos sin aplanar',
    );
  });
});

describe('Fase B: Legajos consolidados Menores (7p), Mayores +18 (4p) y Educadores (1p)', () => {
  it('valida vinculación completa (0 faltantes) en los 3 moldes AcroForm oficiales', async () => {
    const { extraerCamposAcroFormPdf, validarCamposAcroFormContraEsquema } =
      await vite.ssrLoadModule('/src/services/pdfGenerator.ts');
    const { menoresKeys, mayoresKeys, educadoresKeys } = leerClavesEsquemaBackend();

    const toEsquema = (keys: string[]) => ({
      secciones: [{ id: 'sec', campos: keys.map((key) => ({ key })) }],
    });

    const camposMenores = await extraerCamposAcroFormPdf(menoresBytes);
    const valMenores = validarCamposAcroFormContraEsquema(camposMenores, toEsquema(menoresKeys), {});
    assert.equal(valMenores.totalCamposPdf, 267);
    assert.deepEqual(valMenores.sinPreguntaEnFormulario, []);

    const camposMayores = await extraerCamposAcroFormPdf(mayoresBytes);
    const valMayores = validarCamposAcroFormContraEsquema(camposMayores, toEsquema(mayoresKeys), {});
    assert.equal(valMayores.totalCamposPdf, 193);
    assert.deepEqual(valMayores.sinPreguntaEnFormulario, []);

    const camposEduc = await extraerCamposAcroFormPdf(saludBytes);
    const valEduc = validarCamposAcroFormContraEsquema(camposEduc, toEsquema(educadoresKeys), {});
    assert.equal(valEduc.totalCamposPdf, 61);
    assert.deepEqual(valEduc.sinPreguntaEnFormulario, []);

    // Confirmar explícitamente que Mayores +18 NO incluye la página DDJJ Salidas/Campamentos 07-21
    const textoMayores = (await extraerTextoPorPagina(mayoresBytes)).join(' ');
    assert.doesNotMatch(
      textoMayores,
      /Participación de Jóvenes Mayores de 18 años en Salidas/i,
    );
  });

  it('Legajo Menores completo genera 7 páginas aplanadas con todos los bloques y checkboxes', async () => {
    const { PDFDocument } = await import('pdf-lib');
    const { generarFichaPdf } = await vite.ssrLoadModule('/src/services/pdfGenerator.ts');

    const bytes = await generarFichaPdf(
      {
        pdfBaseUrl: '__UPLOADED_PDF__',
        pdfBaseDataUrl: pdfMenoresDataUrl,
        modoRender: 'PDF_ACROFORM',
        indexBase: 0,
        campos: {},
        qrPaginas: [
          { page: 0, x: 520, y: 12, width: 44 },
          { page: 1, x: 514, y: 749, width: 52 },
        ],
        paginasCondicionales: [
          { page: 4, incluirSiAlguno: ['condicion_salud_preexistente', 'ne_diagnostico'] },
          { page: 6, incluirSiAlguno: ['completar_ficha_adultos'], incluirSiPrefijoTruthy: ['colab_', 'mat_'] },
        ],
      },
      {
        protagonista_domicilio: 'Av. Hipólito Yrigoyen 450, Córdoba',
        protagonista_telefono: '3515123456',
        religion: 'Católica',
        escolaridad_institucion: 'Colegio León XIII',
        escolaridad_grado: '6° Grado',
        obra_social: 'APROSS',
        obra_social_afiliado: '1122-3344',
        tiene_hermanos: true,
        realiza_hobby: true,
        hobby_detalle: 'Fútbol',
        condicion_salud_preexistente: true,
        madre_nombres: 'Pérez, Ana María',
        madre_dni: '28111222',
        madre_domicilio: 'Av. Hipólito Yrigoyen 450',
        madre_convive: true,
        madre_email: 'ana@ejemplo.com',
        madre_telefono: '3515123456',
        madre_profesion: 'Contadora',
        madre_estado_civil: 'Casada',
        padre_nombres: 'Fernández, Luis Alberto',
        padre_dni: '27444555',
        padre_domicilio: 'Av. Hipólito Yrigoyen 450',
        padre_convive: true,
        padre_email: 'luis@ejemplo.com',
        padre_telefono: '3515987654',
        padre_profesion: 'Arquitecto',
        padre_estado_civil: 'Casado',
        tel_emergencia_1: '3515123456',
        grupo_sanguineo: '0',
        factor_rh: '+',
        peso_kg: '42',
        talla_m: '1.48',
        autorizante_tipo: 'madre',
        autorizante_fecha_nac: '1983-05-14',
        menor_nacionalidad: 'Argentina',
        confirma_autorizacion_salidas: true,
        ne_diagnostico: 'TDAH leve',
        ne_medico_cabecera: 'Dra. Morales',
        ret_persona1_nombre: 'Gómez, Carlos',
        ret_persona1_dni: '19222333',
        ret_persona1_telefono: '3514001122',
        ret_persona1_caracter: 'Tío',
        ret_autoriza_retirarse_solo: false,
        completar_ficha_adultos: true,
        adulto_profesion: 'Contadora',
        adulto_preferencia_trabajo: 'JOVENES',
        colab_campamento: true,
        mat_carpas_prestamo: true,
        adulto_observaciones: 'Disponible fines de semana',
      },
      'HASH-MENORES-FULL-001',
      {
        nombre: 'Mateo',
        apellido: 'Fernández',
        dni: '49111222',
        fechaNacimiento: '2014-08-20',
        ramaNombre: 'Manada',
      },
    );

    const doc = await PDFDocument.load(bytes);
    assert.equal(doc.getPageCount(), 7);
    assert.equal(doc.getForm().getFields().length, 0);

    const pags = await extraerTextoPorPagina(bytes);
    assert.match(pags[0], /FERNÁNDEZ, Mateo/);
    assert.match(pags[1], /FERNÁNDEZ/);
    assert.match(pags[2], /Agosto/);
    assert.match(pags[2], /Mayo/);
    assert.match(pags[3], /Salidas|Agosto/);
    assert.match(pags[4], /TDAH leve/);
    assert.match(pags[5], /Gómez, Carlos/);
    assert.match(pags[6], /Disponible fines de semana/);
  });

  it('Legajo Menores omite páginas condicionales (4 y 6) cuando no aplican y conserva Anexo si hay desborde', async () => {
    const { PDFDocument } = await import('pdf-lib');
    const { generarFichaPdf } = await vite.ssrLoadModule('/src/services/pdfGenerator.ts');

    const bytesSinCond = await generarFichaPdf(
      {
        pdfBaseUrl: '__UPLOADED_PDF__',
        pdfBaseDataUrl: pdfMenoresDataUrl,
        modoRender: 'PDF_ACROFORM',
        indexBase: 0,
        campos: {},
        qrPaginas: [
          { page: 0, x: 520, y: 12, width: 44 },
          { page: 1, x: 514, y: 749, width: 52 },
        ],
        paginasCondicionales: [
          { page: 4, incluirSiAlguno: ['condicion_salud_preexistente', 'ne_diagnostico'] },
          { page: 6, incluirSiAlguno: ['completar_ficha_adultos'], incluirSiPrefijoTruthy: ['colab_', 'mat_'] },
        ],
      },
      {
        protagonista_domicilio: 'Vera y Zárate 3069',
        escolaridad_institucion: 'Escuela Primaria',
        escolaridad_grado: '5°',
        obra_social: 'OSDE',
        condicion_salud_preexistente: false,
        toma_medicacion: true,
        toma_medicacion_detalle:
          'Tratamiento prolongado con nombre de droga extremadamente extenso para verificar que se dispara Anexo aún cuando se omiten páginas condicionales.',
        completar_ficha_adultos: false,
      },
      'HASH-MENORES-TRIM-002',
      {
        nombre: 'Lucía',
        apellido: 'Gómez',
        dni: '50222333',
        fechaNacimiento: '2015-03-11',
        ramaNombre: 'Lobatos',
      },
    );

    const doc = await PDFDocument.load(bytesSinCond);
    // 7 - 2 omitidas + 1 Anexo = 6 páginas
    assert.equal(doc.getPageCount(), 6);
    const pags = await extraerTextoPorPagina(bytesSinCond);
    const todo = pags.join(' ');
    assert.doesNotMatch(todo, /FICHA DE INSCRIPCIÓN - NECESIDADES ESPECIALES/);
    assert.doesNotMatch(todo, /FICHA DE ADULTOS - 2026/);
    assert.match(pags[5], /ANEXO DE INFORMACIÓN AMPLIADA/);
  });

  it('Legajo Mayores (+18) genera 4 páginas o 2 sin opcionales, con firmante propio y sin padres requeridos', async () => {
    const { PDFDocument } = await import('pdf-lib');
    const { generarFichaPdf } = await vite.ssrLoadModule('/src/services/pdfGenerator.ts');

    const mapMayores = {
      pdfBaseUrl: '__UPLOADED_PDF__',
      pdfBaseDataUrl: pdfMayoresDataUrl,
      modoRender: 'PDF_ACROFORM' as const,
      indexBase: 0 as const,
      campos: {},
      qrPaginas: [
        { page: 0, x: 520, y: 12, width: 44 },
        { page: 1, x: 514, y: 749, width: 52 },
      ],
      paginasCondicionales: [
        { page: 2, incluirSiAlguno: ['condicion_salud_preexistente', 'ne_diagnostico'] },
        { page: 3, incluirSiAlguno: ['completar_ficha_adultos'], incluirSiPrefijoTruthy: ['colab_', 'mat_'] },
      ],
    };

    const rover = {
      nombre: 'Valentín',
      apellido: 'Mendoza',
      dni: '44999888',
      fechaNacimiento: '2006-02-10',
      ramaNombre: 'Rovers',
    };

    const bytes2p = await generarFichaPdf(
      mapMayores,
      {
        protagonista_domicilio: 'Av. Chacabuco 900, Córdoba',
        protagonista_telefono: '3516778899',
        obra_social: 'Swiss Medical',
        grupo_sanguineo: 'A',
        factor_rh: '+',
        peso_kg: '72',
        talla_m: '1.78',
      },
      'HASH-ROVER-2P',
      rover,
      1,
      { destinatario: 'MAYORES', tituloDocumento: 'Legajo Rovers 2026' },
    );

    const doc2p = await PDFDocument.load(bytes2p);
    assert.equal(doc2p.getPageCount(), 2);
    assert.equal(doc2p.getForm().getFields().length, 0);
    const pags2p = await extraerTextoPorPagina(bytes2p);
    assert.match(pags2p[1], /MENDOZA, Valentín/);

    const bytes4p = await generarFichaPdf(
      mapMayores,
      {
        protagonista_domicilio: 'Av. Chacabuco 900, Córdoba',
        obra_social: 'Swiss Medical',
        ne_diagnostico: 'Miopía',
        completar_ficha_adultos: true,
        adulto_observaciones: 'Puedo colaborar en logística',
      },
      'HASH-ROVER-4P',
      rover,
      1,
      { destinatario: 'MAYORES', tituloDocumento: 'Legajo Rovers 2026' },
    );

    const doc4p = await PDFDocument.load(bytes4p);
    assert.equal(doc4p.getPageCount(), 4);
    const pags4p = await extraerTextoPorPagina(bytes4p);
    assert.match(pags4p[2], /Miopía/);
    assert.match(pags4p[3], /Puedo colaborar en logística/);
  });
});
