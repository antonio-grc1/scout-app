import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { createServer, type ViteDevServer } from 'vite';
import ts from 'typescript';

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(String(key), String(value));
    },
  };
}

let vite: ViteDevServer;

before(async () => {
  Object.defineProperty(globalThis, 'localStorage', {
    value: createMemoryStorage(),
    configurable: true,
    writable: true,
  });

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

describe('M1: obtenerConfigRama, obtenerOrdenRama y familias usan rol principal', () => {
  it('prioriza asignación principal activa sobre asignaciones?.[0] y respeta fallback histórico', async () => {
    const { obtenerConfigRama, obtenerOrdenRama } = await vite.ssrLoadModule('/src/lib/ramaColors.ts');

    const miembroMultirrol = {
      asignaciones: [
        {
          id: 1,
          activo: false,
          unidad: { nombre: 'Manada', rama: { nombre: 'Lobatos', ordenProgresion: 1 } },
          rol: { tipoMiembro: 'PROTAGONISTA' },
        },
        {
          id: 2,
          activo: true,
          unidad: { nombre: 'Comunidad Rover', rama: { nombre: 'Rover', ordenProgresion: 4 } },
          rol: { tipoMiembro: 'PROTAGONISTA' },
        },
      ],
    };

    assert.equal(obtenerConfigRama(miembroMultirrol).key, 'rover');
    assert.equal(obtenerOrdenRama(miembroMultirrol), 4);

    // Fallback histórico cuando se pasa un único item inactivo (TrayectoriaMiembro)
    const historico = {
      asignaciones: [miembroMultirrol.asignaciones[0]],
    };
    assert.equal(obtenerConfigRama(historico).key, 'lobatos');
  });

  it('agruparCandidatosPorFamilia muestra la rama del rol principal activo', async () => {
    const { agruparCandidatosPorFamilia } = await vite.ssrLoadModule('/src/lib/formatters.ts');

    const grupos = agruparCandidatosPorFamilia([
      {
        id: 1,
        dni: '100',
        nombre: 'Sofía',
        apellido: 'Díaz',
        grupoFamiliar: {
          id: 9,
          nombreFamilia: 'Familia Díaz',
          miembros: [
            {
              id: 1,
              dni: '100',
              nombre: 'Sofía',
              apellido: 'Díaz',
              asignaciones: [
                { id: 1, activo: false, unidad: { nombre: 'Manada', tipo: 'SECCION_RAMA' }, rol: { tipoMiembro: 'PROTAGONISTA' } },
                { id: 2, activo: true, unidad: { nombre: 'Unidad Scout', tipo: 'SECCION_RAMA' }, rol: { tipoMiembro: 'PROTAGONISTA' } },
              ],
            },
          ],
        },
      },
    ]);

    assert.equal(grupos.length, 1);
    assert.equal(grupos[0].integrantes[0].ramaNombre, 'Unidad Scout');
  });
});

describe('M3: configuración PWA prompt y vercel.json seguro', () => {
  it('vite.config.ts usa registerType prompt y vercel.json excluye /api y extensiones estáticas', () => {
    const viteConfig = fs.readFileSync(path.join(process.cwd(), 'vite.config.ts'), 'utf8');
    assert.ok(viteConfig.includes("registerType: 'prompt'"));
    assert.equal(viteConfig.includes("registerType: 'autoUpdate'"), false);

    const vercelRaw = fs.readFileSync(path.join(process.cwd(), 'vercel.json'), 'utf8');
    const vercel = JSON.parse(vercelRaw);
    const sourcePattern = vercel.rewrites?.[0]?.source as string;
    assert.ok(sourcePattern);
    const regex = new RegExp(`^${sourcePattern}$`);
    assert.equal(regex.test('/rama'), true);
    assert.equal(regex.test('/api/miembros'), false);
    assert.equal(regex.test('/assets/index-123.js'), false);
    assert.equal(regex.test('/manifest.webmanifest'), false);

    assert.equal(vercel.rewrites?.[1]?.source, '/api/(.*)');
    assert.equal(
      vercel.rewrites?.[1]?.destination,
      'https://scout-app-vek5.onrender.com/api/$1',
    );
  });

  it('toastStore soporta toast con acción personalizada para actualización PWA', async () => {
    const { useToastStore } = await vite.ssrLoadModule('/src/store/toastStore.ts');

    useToastStore.setState({ toast: null });
    let ejecutado = false;
    useToastStore.getState().mostrarToastAccion(
      'Nueva versión disponible.',
      'Actualizar',
      () => {
        ejecutado = true;
      },
      10000,
    );

    const toast = useToastStore.getState().toast;
    assert.equal(toast?.accion?.label, 'Actualizar');
    await useToastStore.getState().ejecutarAccion();
    assert.equal(ejecutado, true);
  });
});

describe('M4 & B1: validación calendario, ciclo dinámico y limpieza', () => {
  it('esFechaCalendarioValida rechaza fechas imposibles como 31 de febrero o mes 13', async () => {
    const { esFechaCalendarioValida } = await vite.ssrLoadModule('/src/lib/formatters.ts');

    assert.equal(esFechaCalendarioValida(2024, 2, 29), true);
    assert.equal(esFechaCalendarioValida(2025, 2, 29), false);
    assert.equal(esFechaCalendarioValida(2026, 2, 31), false);
    assert.equal(esFechaCalendarioValida(2026, 13, 1), false);
  });

  it('obtenerCicloAnioActual usa el año de la fecha y tsconfig.app.json activa strict: true', async () => {
    const { obtenerCicloAnioActual } = await vite.ssrLoadModule('/src/lib/formatters.ts');
    const { useAuthStore } = await vite.ssrLoadModule('/src/store/authStore.ts');

    assert.equal(obtenerCicloAnioActual(new Date(2028, 5, 1)), 2028);
    assert.equal('tieneRama' in useAuthStore.getState(), false);
    assert.equal(fs.existsSync(path.join(process.cwd(), 'src/pages/padron/PadronPage.tsx')), false);

    const tsconfigRaw = fs.readFileSync(path.join(process.cwd(), 'tsconfig.app.json'), 'utf8');
    const parsed = ts.parseConfigFileTextToJson('tsconfig.app.json', tsconfigRaw);
    assert.equal(parsed.error, undefined);
    assert.equal(parsed.config?.compilerOptions?.strict, true);
  });
});

describe('Mejoras arquitectónicas: offlineCache memoria/IDB, deduplicación GET, HttpOnly y PDF Worker', () => {
  it('offlineCache conserva entradas en memoria aunque localStorage falle/se purgue y limpiarCacheApi vacía ambos', async () => {
    const offlineCache = await vite.ssrLoadModule('/src/lib/offlineCache.ts');
    offlineCache.limpiarCacheApi();
    assert.equal(offlineCache.obtenerTamanoMemoriaCache(), 0);

    offlineCache.guardarEnCache('/tesoreria/cuentas', null, [{ id: 1, nombre: 'Caja Central' }]);
    assert.ok(offlineCache.obtenerTamanoMemoriaCache() >= 1);

    // Simular límite de cuota o borrado de localStorage: el espejo en memoria sigue respondiendo
    const clave = offlineCache.generarClaveCache('/tesoreria/cuentas', null);
    localStorage.removeItem(clave);
    const desdeMemoria = offlineCache.obtenerDeCache('/tesoreria/cuentas', null);
    assert.ok(desdeMemoria);
    assert.equal(desdeMemoria.data[0].nombre, 'Caja Central');

    offlineCache.limpiarCacheApi();
    assert.equal(offlineCache.obtenerTamanoMemoriaCache(), 0);
    assert.equal(offlineCache.obtenerDeCache('/tesoreria/cuentas', null), null);
  });

  it('api configura withCredentials y deduplica peticiones GET concurrentes idénticas', async () => {
    const { api } = await vite.ssrLoadModule('/src/api/client.ts');
    assert.equal(api.defaults.withCredentials, true);

    const prevAdapter = api.defaults.adapter;
    let llamadasReales = 0;
    api.defaults.adapter = async (config: any) => {
      llamadasReales += 1;
      await new Promise((r) => setTimeout(r, 20));
      return {
        data: [{ id: 7, nombre: 'Banco Nación' }],
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    };

    try {
      const [r1, r2, r3] = await Promise.all([
        api.get('/tesoreria/cuentas'),
        api.get('/tesoreria/cuentas'),
        api.get('/tesoreria/cuentas'),
      ]);
      assert.equal(llamadasReales, 1);
      assert.deepEqual(r1.data, r2.data);
      assert.deepEqual(r2.data, r3.data);
    } finally {
      api.defaults.adapter = prevAdapter;
    }
  });

  it('generarFichaPdf rellena plantilla AcroForm oficial y estampa QR de verificación', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const { generarFichaPdf } = await vite.ssrLoadModule('/src/services/pdfGenerator.ts');

    const tplPath = path.resolve(
      process.cwd(),
      'public/pdf-templates/planilla_salud_01_25_acroform.pdf',
    );
    const pdfBaseDataUrl = `data:application/pdf;base64,${fs.readFileSync(tplPath).toString('base64')}`;

    const bytes = await generarFichaPdf(
      {
        pdfBaseUrl: '__UPLOADED_PDF__',
        pdfBaseDataUrl,
        modoRender: 'PDF_ACROFORM',
        indexBase: 0,
        campos: {},
        qrVerificacion: { page: 0, x: 514, y: 749, width: 52 },
      },
      {
        protagonista_domicilio: 'Vera y Zárate 3069',
        tel_emergencia_1: '3515551234',
        obra_social: 'APROSS',
      },
      'WORKER-QR-TEST',
      {
        nombre: 'Ana',
        apellido: 'Pérez',
        dni: '33111222',
      },
    );

    assert.ok(bytes instanceof Uint8Array);
    assert.ok(bytes.length > 1000);
    assert.equal(Buffer.from(bytes.slice(0, 5)).toString('ascii'), '%PDF-');
  });

  it('extraerInfoMedicaMiembro soporta selectores estructurados, campos dinámicos por categoriaMedica e inferencia de texto libre', async () => {
    const { extraerInfoMedicaMiembro } = await vite.ssrLoadModule('/src/lib/alertasMedicas.ts');

    const plantillaCustom = {
      id: 20,
      codigo: 'FICHA_CUSTOM_2026',
      esquemaCamposJson: {
        secciones: [
          {
            id: 'salud',
            titulo: 'Salud',
            campos: [
              {
                key: 'intolerancia_custom',
                label: 'Intolerancia',
                type: 'multiselect',
                categoriaMedica: 'DIETA',
                options: [{ label: 'Sin Frutos Secos', value: 'SIN_FRUTOS_SECOS' }],
              },
            ],
          },
        ],
      },
    };

    const miembroEstructurado = {
      id: 1,
      datosFijosJson: {
        grupo_sanguineo: 'A',
        factor_rh: '+',
        regimen_dietario_tipos: ['VEGETARIANO'],
        regimen_dietario_detalle: 'Evitar ultraprocesados',
      },
    };

    const entregaComplem = {
      plantillaId: 20,
      respuestasSnapshotJson: {
        alergias_tipos: ['PICADURAS'],
        alergias_detalle: 'Avispas',
        intolerancia_custom: ['SIN_FRUTOS_SECOS'],
      },
    };

    const info = extraerInfoMedicaMiembro(
      miembroEstructurado,
      [entregaComplem],
      [plantillaCustom],
    );

    assert.equal(info.grupoSanguineo, 'A +');
    assert.equal(info.tieneDieta, true);
    assert.ok(info.dietas.includes('VEGETARIANO'));
    assert.ok(info.dietas.includes('SIN_FRUTOS_SECOS'));
    assert.ok(info.dietasLabels.includes('Vegetariano'));
    assert.ok(info.dietasLabels.includes('Sin Frutos Secos'));
    assert.equal(info.tieneAlergia, true);
    assert.ok(info.alergiasTipos.includes('PICADURAS'));

    const legacy = extraerInfoMedicaMiembro({
      id: 2,
      datosFijosJson: {
        regimen_dietario: 'Celíaca sin TACC',
        alergias: true,
        alergias_detalle: 'Alergia a la penicilina',
      },
    });
    assert.equal(legacy.tieneDieta, true);
    assert.ok(legacy.dietas.includes('CELIACO'));
    assert.equal(legacy.tieneAlergia, true);
    assert.ok(legacy.alergiasTipos.includes('MEDICAMENTOS'));
  });

  it('filtrarPlantillasParaMiembro filtra múltiples documentos por metadatos declarativos sin hardcodear prefijos', async () => {
    const { filtrarPlantillasParaMiembro, seleccionarPlantillaPorMiembro } =
      await vite.ssrLoadModule('/src/lib/formatters.ts');

    const plantillas = [
      {
        id: 1,
        codigo: 'FORM_GRAL_COMPLEMENTARIO',
        titulo: '3. Autorización Salida',
        activa: true,
        esquemaCamposJson: { destinatario: 'MENORES', esPrincipal: false, orden: 3, secciones: [] },
      },
      {
        id: 4,
        codigo: 'DOC_SALUD_GRAL',
        titulo: '2. Declaración Jurada de Salud',
        activa: true,
        esquemaCamposJson: { destinatario: 'TODOS', esPrincipal: false, orden: 2, secciones: [] },
      },
      {
        id: 2,
        codigo: 'CUSTOM_INSCRIPCION_INFANTIL',
        titulo: '1. Inscripción Rama Menor',
        activa: true,
        esquemaCamposJson: { destinatario: 'MENORES', esPrincipal: true, orden: 1, secciones: [] },
      },
      {
        id: 3,
        codigo: 'CUSTOM_DIRIGENTES',
        titulo: 'Declaración Dirigentes',
        activa: true,
        esquemaCamposJson: { destinatario: 'EDUCADORES', esPrincipal: true, orden: 1, secciones: [] },
      },
    ];

    const menor = {
      id: 10,
      tipoMiembro: 'PROTAGONISTA',
      fechaNacimiento: '2013-04-10T00:00:00.000Z',
      asignaciones: [],
    };

    const aplicablesMenor = filtrarPlantillasParaMiembro(plantillas, menor);
    assert.deepEqual(
      aplicablesMenor.map((p: any) => p.id),
      [2, 4, 1],
    );
    assert.equal(seleccionarPlantillaPorMiembro(plantillas, menor)?.id, 2);
  });

  it('generarFichaPdf estampa dinámicamente coordenadas, arrays y QR sobre un PDF base Data URL', async () => {
    const { PDFDocument } = await import('pdf-lib');
    const { generarFichaPdf, prepararRespuestasParaImpresion } = await vite.ssrLoadModule(
      '/src/services/pdfGenerator.ts',
    );

    const formateadas = prepararRespuestasParaImpresion({
      regimen_dietario_tipos: ['VEGETARIANO', 'SIN_LACTOSA'],
      regimen_dietario_detalle: 'Sin huevo',
    });
    assert.match(
      String(formateadas.regimen_dietario_detalle),
      /Vegetariano, Sin Lactosa — Sin huevo/,
    );
    assert.equal(formateadas.regimen_dietario_tipos, 'Vegetariano, Sin Lactosa');
    assert.equal(formateadas.regimen_dietario_texto, 'SÍ');

    const doc = await PDFDocument.create();
    doc.addPage([595, 842]);
    const baseBytes = await doc.save();
    const pdfBaseDataUrl = `data:application/pdf;base64,${Buffer.from(baseBytes).toString('base64')}`;

    const pdfFinal = await generarFichaPdf(
      {
        pdfBaseUrl: '__CUSTOM_PDF__',
        pdfBaseDataUrl,
        modoRender: 'ESTAMPAR_COORDENADAS',
        indexBase: 1,
        campos: {
          protagonista_nombre_completo: { page: 1, x: 50, y: 760, size: 12 },
          regimen_dietario_detalle: { page: 1, x: 50, y: 730, size: 10 },
        },
        qrVerificacion: { page: 1, x: 480, y: 720, width: 70 },
      },
      {
        regimen_dietario_tipos: ['CELIACO'],
      },
      'HASH-CUSTOM-PDF-001',
      {
        nombre: 'Sofía',
        apellido: 'Gómez',
        dni: '42555666',
      },
    );

    assert.equal(Buffer.from(pdfFinal.slice(0, 5)).toString('ascii'), '%PDF-');
    const recargado = await PDFDocument.load(pdfFinal);
    assert.equal(recargado.getPageCount(), 1);
  });

  it('generarFichaPdf en modo DISENO_SECCIONES interpola textoLegal, aplica saltoPaginaAntes y formatea multiselect', async () => {
    const { PDFDocument } = await import('pdf-lib');
    const { generarFichaPdf, interpolarTextoLegal } = await vite.ssrLoadModule(
      '/src/services/pdfGenerator.ts',
    );

    const textoInterpolado = interpolarTextoLegal(
      'Yo {{autorizante_nombre}} autorizo a {{nombre_completo}} (DNI {{dni}}) · Dieta: {{dieta_custom}}.',
      {
        autorizante_nombre: 'Juan Pérez',
        protagonista_nombre_completo: 'PÉREZ, Lucía',
        protagonista_dni: '45999888',
        dieta_custom: 'Sin TACC, Vegetariano',
      },
      false,
    );
    assert.equal(
      textoInterpolado,
      'Yo Juan Pérez autorizo a PÉREZ, Lucía (DNI 45999888) · Dieta: Sin TACC, Vegetariano.',
    );

    const textoEnBlanco = interpolarTextoLegal(
      'Yo {{autorizante_nombre}} ciclo {{ciclo_anio}}',
      { autorizante_nombre: 'Juan Pérez' },
      true,
    );
    assert.match(textoEnBlanco, /Yo \.{10,} ciclo \d{4}/);

    const esquemaDiseno = {
      tituloDocumento: 'Autorización Campamento de Invierno',
      membrete: 'GRUPO_JUAN_XXIII',
      mostrarResumenMiembro: true,
      firmas: ['ADULTO_RESPONSABLE', 'PROTAGONISTA'],
      secciones: [
        {
          id: 'sec_auth',
          titulo: 'Autorización Legal',
          textoLegal:
            'Autorizo a {{nombre_completo}} (DNI {{dni}}) de rama {{rama}} a asistir al campamento.',
          ocultarTablaCamposEnPdf: false,
          campos: [
            {
              key: 'regimen_dietario_tipos',
              label: 'Régimen Alimentario',
              type: 'multiselect',
              options: [{ label: 'Vegetariano', value: 'VEGETARIANO' }],
            },
            {
              key: 'autoriza_traslado',
              label: 'Autoriza traslado',
              type: 'boolean',
            },
          ],
        },
        {
          id: 'sec_p2',
          titulo: 'Información Médica Adicional',
          saltoPaginaAntes: true,
          campos: [
            {
              key: 'observaciones_camp',
              label: 'Observaciones para cocina y enfermería',
              type: 'textarea',
            },
          ],
        },
      ],
    };

    const bytes = await generarFichaPdf(
      {
        pdfBaseUrl: '__DISENO_SECCIONES__',
        modoRender: 'DISENO_SECCIONES',
        campos: {},
      },
      {
        autorizante_nombre: 'Juan Pérez',
        regimen_dietario_tipos: ['VEGETARIANO'],
        autoriza_traslado: true,
        observaciones_camp: 'Trae vianda para la primera noche del viaje.',
      },
      'HASH-DISENO-SECCIONES-2026',
      {
        nombre: 'Lucía',
        apellido: 'Pérez',
        dni: '45999888',
        ramaNombre: 'Unidad Scout',
      },
      1,
      esquemaDiseno,
    );

    assert.equal(Buffer.from(bytes.slice(0, 5)).toString('ascii'), '%PDF-');
    const recargado = await PDFDocument.load(bytes);
    assert.equal(recargado.getPageCount(), 2);
  });
});
