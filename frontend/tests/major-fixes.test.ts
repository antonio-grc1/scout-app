import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createServer, type ViteDevServer } from 'vite';

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

describe('A1: offlineCache no duplica entradas por miembro en guardarEnCache', () => {
  it('resuelve /miembros/:id desde la lista sin escribir N claves individuales', async () => {
    localStorage.clear();
    const offlineCache = await vite.ssrLoadModule('/src/lib/offlineCache.ts');

    offlineCache.guardarEnCache(
      '/miembros',
      { porPagina: 2000, incluirInactivos: true },
      {
        items: [
          { id: 101, nombre: 'Lucía', apellido: 'Gómez' },
          { id: 102, nombre: 'Mateo', apellido: 'Paz' },
        ],
      },
    );

    assert.equal(localStorage.getItem('scout_cache_v1:/miembros/101'), null);
    assert.equal(localStorage.getItem('scout_cache_v1:/miembros/102'), null);

    const detalle = offlineCache.obtenerDeCache('/miembros/101');
    assert.ok(detalle);
    assert.equal(detalle.data.nombre, 'Lucía');
  });
});

describe('A2: esErrorOffline y toastStore no silencian errores por contener "red"', () => {
  it('distingue errores de red/offline reales de mensajes con la subcadena "red"', async () => {
    const { esErrorOffline } = await vite.ssrLoadModule('/src/lib/formatters.ts');

    assert.equal(esErrorOffline({ __isOfflineFastFail: true }), true);
    assert.equal(esErrorOffline({ message: 'Network Error' }), true);
    assert.equal(esErrorOffline({ code: 'ERR_NETWORK', message: 'fallo' }), true);
    assert.equal(esErrorOffline(new Error('Sin conexión a internet')), true);

    assert.equal(esErrorOffline(new Error('Credenciales incorrectas')), false);
    assert.equal(esErrorOffline(new Error('Error al guardar ingrediente o correo')), false);
    assert.equal(esErrorOffline(new Error('El campo password es requerido')), false);
  });

  it('toastStore muestra errores con "red" pero omite errores offline reales', async () => {
    const { useToastStore } = await vite.ssrLoadModule('/src/store/toastStore.ts');

    useToastStore.setState({ toast: null });
    useToastStore.getState().mostrarToast('Credenciales inválidas en el formulario', 'error');
    assert.equal(useToastStore.getState().toast?.texto, 'Credenciales inválidas en el formulario');

    useToastStore.setState({ toast: null });
    useToastStore.getState().mostrarToast('Sin conexión con el servidor', 'error');
    assert.equal(useToastStore.getState().toast, null);
  });
});

describe('A4: obtenerRutaInicialUsuario respeta permisos globales/unidad y autogestión', () => {
  it('dirige a /global si tiene permisos de gestión aunque no tenga miembros.ver', async () => {
    localStorage.clear();
    const { obtenerRutaInicialUsuario } = await vite.ssrLoadModule('/src/lib/permisos.ts');
    const { useAuthStore } = await vite.ssrLoadModule('/src/store/authStore.ts');

    useAuthStore.getState().setSesion({
      accessToken: 'tok-unidad-tesorero',
      usuario: { id: 5, dni: '55', nombre: 'Tesorero', apellido: 'Unidad' },
      requiereCambioClave: false,
      asignaciones: [
        {
          unidadId: 2,
          unidadNombre: 'Manada',
          rol: 'Tesorero',
          alcance: 'UNIDAD',
          permisos: ['cuotas.ver', 'cuotas.cobrar'],
        },
      ],
    });

    const auth = useAuthStore.getState();
    assert.equal(
      obtenerRutaInicialUsuario({
        token: auth.token,
        requiereCambioClave: auth.requiereCambioClave,
        puedeVerPadron: auth.puedeVerPadron,
        puedeAccederPanelGestion: auth.puedeAccederPanelGestion,
      }),
      '/global',
    );

    assert.equal(
      obtenerRutaInicialUsuario({
        token: 'tok-padron',
        requiereCambioClave: false,
        puedeVerPadron: () => true,
        puedeAccederPanelGestion: () => true,
      }),
      '/rama',
    );

    assert.equal(
      obtenerRutaInicialUsuario({
        token: 'tok-propio',
        requiereCambioClave: false,
        puedeVerPadron: () => false,
        puedeAccederPanelGestion: () => false,
      }),
      '/autogestion',
    );

    assert.equal(
      obtenerRutaInicialUsuario({
        token: null,
        requiereCambioClave: false,
        puedeVerPadron: () => true,
        puedeAccederPanelGestion: () => true,
      }),
      '/login',
    );
  });
});

describe('A6: shouldIgnorePopstateForTopModal sincroniza pila de modales sin timer arbitrario', () => {
  it('ignora popstate solo cuando el estado resultante coincide con el modal superior actual', async () => {
    const { shouldIgnorePopstateForTopModal } = await vite.ssrLoadModule('/src/hooks/useModalOverlay.ts');

    assert.equal(shouldIgnorePopstateForTopModal('modal-1', 'modal-1'), true);
    assert.equal(shouldIgnorePopstateForTopModal('modal-1', 'modal-2'), false);
    assert.equal(shouldIgnorePopstateForTopModal(undefined, 'modal-1'), false);
    assert.equal(shouldIgnorePopstateForTopModal('modal-1', undefined), false);
  });
});

describe('A7: helpers de fecha local y formato UTC consistente', () => {
  it('obtenerHoyLocalISO y sumarDiasLocalISO usan calendario local', async () => {
    const { obtenerHoyLocalISO, sumarDiasLocalISO } = await vite.ssrLoadModule('/src/lib/formatters.ts');

    const base = new Date(2026, 11, 31, 23, 30, 0); // 31 dic 2026 23:30 local
    assert.equal(obtenerHoyLocalISO(base), '2026-12-31');
    assert.equal(sumarDiasLocalISO(1, base), '2027-01-01');
    assert.equal(sumarDiasLocalISO(14, new Date(2026, 0, 20, 22, 0, 0)), '2026-02-03');
  });

  it('formatearFechaLargaUTC no corre fechas ISO midnight UTC al día anterior', async () => {
    const { formatearFechaLargaUTC, formatearFecha } = await vite.ssrLoadModule('/src/lib/formatters.ts');

    const larga = formatearFechaLargaUTC('2026-05-01T00:00:00.000Z');
    assert.ok(larga.includes('2026'));
    assert.ok(larga.toLowerCase().includes('mayo'));
    assert.ok(/\b1\b/.test(larga));
    assert.equal(formatearFecha('2026-05-01T00:00:00.000Z'), '01/05/2026');
  });
});

describe('A8: sanitización de planillas y URLs de logo', () => {
  it('sanitizarCeldaPlanilla neutraliza inyección de fórmulas y preserva números', async () => {
    const { sanitizarCeldaPlanilla } = await vite.ssrLoadModule('/src/utils/exportadorPlanillas.ts');

    assert.equal(sanitizarCeldaPlanilla('=CMD|"/C calc"!A0'), '\'=CMD|"/C calc"!A0');
    assert.equal(sanitizarCeldaPlanilla('+SUM(A1:A2)'), '\'+SUM(A1:A2)');
    assert.equal(sanitizarCeldaPlanilla('-10+20'), '\'-10+20');
    assert.equal(sanitizarCeldaPlanilla('@SUM(1,2)'), '\'@SUM(1,2)');
    assert.equal(sanitizarCeldaPlanilla('\t=1+1'), '\'\t=1+1');
    assert.equal(sanitizarCeldaPlanilla('Juan Pérez'), 'Juan Pérez');
    assert.equal(sanitizarCeldaPlanilla(1500.5), 1500.5);
    assert.equal(sanitizarCeldaPlanilla(-250), -250);
  });

  it('esLogoUrlSegura permite rutas relativas y https seguras y rechaza data/javascript/CSS', async () => {
    const { esLogoUrlSegura } = await vite.ssrLoadModule('/src/store/themeStore.ts');

    assert.equal(esLogoUrlSegura('/logo.png'), true);
    assert.equal(esLogoUrlSegura('https://cdn.example.org/escudo.webp'), true);

    assert.equal(esLogoUrlSegura('data:image/png;base64,iVBORw0KGgo='), false);
    assert.equal(esLogoUrlSegura('data:image/svg+xml,<svg></svg>'), false);
    assert.equal(esLogoUrlSegura('javascript:alert(1)'), false);
    assert.equal(esLogoUrlSegura('data:text/html,<script>alert(1)</script>'), false);
    assert.equal(esLogoUrlSegura('https://evil.com/x.png");background:url(y)'), false);
    assert.equal(esLogoUrlSegura('/foo/../bar.png'), false);
    assert.equal(esLogoUrlSegura(''), false);
  });
});

describe('traducirErrorAmigable no confunde montos con códigos HTTP', () => {
  it('preserva el mensaje real de errores 400 aunque contengan 500, 401, 403 o 404 en montos', async () => {
    const { traducirErrorAmigable } = await vite.ssrLoadModule('/src/lib/formatters.ts');

    const msgSaldo =
      'No se puede revertir el pago porque la cuenta Caja Chica Central no tiene saldo suficiente para devolver los fondos ($5000 disponibles vs $15000 a revertir).';
    assert.equal(
      traducirErrorAmigable({
        response: { status: 400, data: { statusCode: 400, message: msgSaldo } },
        message: 'Request failed with status code 400',
      }),
      msgSaldo,
    );

    const msgOtrosMontos = 'El monto debe estar entre $401, $403, $404 y $500.';
    assert.equal(
      traducirErrorAmigable({
        response: { status: 400, data: { statusCode: 400, message: msgOtrosMontos } },
      }),
      msgOtrosMontos,
    );
  });

  it('traduce códigos HTTP 500/401/403/404 reales y errores técnicos', async () => {
    const { traducirErrorAmigable } = await vite.ssrLoadModule('/src/lib/formatters.ts');

    assert.equal(
      traducirErrorAmigable({
        response: { status: 500, data: { message: 'Error inesperado' } },
        message: 'Request failed with status code 500',
      }),
      'Ocurrió un inconveniente temporal. Por favor, intenta de nuevo en unos segundos.',
    );

    assert.equal(
      traducirErrorAmigable(new Error('Request failed with status code 500')),
      'Ocurrió un inconveniente temporal. Por favor, intenta de nuevo en unos segundos.',
    );

    assert.equal(
      traducirErrorAmigable({ response: { status: 401, data: { message: 'Unauthorized' } } }),
      'El DNI o la contraseña ingresados no son correctos.',
    );

    assert.equal(
      traducirErrorAmigable({ response: { status: 403, data: { message: 'Forbidden resource' } } }),
      'No tienes permisos para realizar esta acción.',
    );

    assert.equal(
      traducirErrorAmigable({ response: { status: 404, data: { message: 'Pago no encontrado' } } }),
      'Pago no encontrado',
    );

    assert.equal(
      traducirErrorAmigable({ response: { status: 404, data: { message: 'Not Found' } } }),
      'No encontramos la información solicitada.',
    );
  });
});
