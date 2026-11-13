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

  it('buildOfficialPdf soporta qrPngBytes pregenerado para ejecución en Web Worker', async () => {
    const { buildOfficialPdf } = await vite.ssrLoadModule('/src/services/officialPdfBuilder.ts');
    const { default: QRCode } = await import('qrcode');
    const qrBuffer = await QRCode.toBuffer('WORKER-QR-TEST', { width: 80, margin: 1 });

    const bytes = await buildOfficialPdf(
      { protagonista_nombre: 'Ana', protagonista_apellido: 'Pérez' },
      { hashVerificacion: 'WORKER-QR-TEST', qrPngBytes: new Uint8Array(qrBuffer) },
    );

    assert.ok(bytes instanceof Uint8Array);
    assert.ok(bytes.length > 1000);
    assert.equal(Buffer.from(bytes.slice(0, 5)).toString('ascii'), '%PDF-');
  });
});
