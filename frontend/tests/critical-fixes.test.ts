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

describe('C1 & C2: offlineCache y authStore', () => {
  it('preserva requiereCambioClave en fallback offline de /auth/me y no cachea /auth/*', async () => {
    localStorage.clear();
    const offlineCache = await vite.ssrLoadModule('/src/lib/offlineCache.ts');

    // No debe persistir endpoints de autenticacion
    offlineCache.guardarEnCache('/auth/login', null, { accessToken: 'secret-jwt' });
    offlineCache.guardarEnCache('/auth/me', null, { accessToken: 'secret-jwt', usuario: { id: 1 } });
    assert.equal(localStorage.getItem('scout_cache_v1:/auth/login'), null);
    assert.equal(localStorage.getItem('scout_cache_v1:/auth/me'), null);

    // Fallback de /auth/me debe reflejar scout_cambio_clave === 'true'
    localStorage.setItem('scout_user', JSON.stringify({ id: 7, dni: '123', nombre: 'Ana', apellido: 'Paz' }));
    localStorage.setItem('scout_asignaciones', JSON.stringify([]));
    localStorage.setItem('scout_cambio_clave', 'true');
    localStorage.setItem('scout_token', 'tok-1');

    const fallback = offlineCache.obtenerDeCache('/auth/me');
    assert.ok(fallback);
    assert.equal(fallback.data.requiereCambioClave, true);
  });

  it('calcula resumen.saldoPendiente y totalDeuda en estado-cuenta offline sin confundir /miembros/:id', async () => {
    localStorage.clear();
    const offlineCache = await vite.ssrLoadModule('/src/lib/offlineCache.ts');

    // Guardar un detalle /miembros/999 primero (en orden de claves previo a la lista)
    offlineCache.guardarEnCache('/miembros/999', null, { id: 999, nombre: 'Otro' });
    // Guardar lista de miembros con cargos activos y anulados
    offlineCache.guardarEnCache(
      '/miembros',
      { porPagina: 2000, incluirInactivos: true },
      {
        items: [
          {
            id: 42,
            nombre: 'Juan',
            saldoAFavor: 500,
            cargos: [
              { id: 1, estado: 'PENDIENTE', montoFinal: 3000, montoPagado: 1000 },
              { id: 2, estado: 'PENDIENTE', montoFinal: 1500, montoPagado: 0 },
              { id: 3, estado: 'ANULADO', montoFinal: 9999, montoPagado: 0 },
            ],
          },
        ],
      },
    );

    const estadoCuenta = offlineCache.obtenerDeCache('/tesoreria/estado-cuenta/42');
    assert.ok(estadoCuenta);
    assert.equal(estadoCuenta.data.totalDeuda, 3500);
    assert.equal(estadoCuenta.data.resumen.saldoPendiente, 3500);
    assert.equal(estadoCuenta.data.resumen.saldoAFavor, 500);
  });

  it('expira entradas de cache mayores al TTL configurado', async () => {
    localStorage.clear();
    const offlineCache = await vite.ssrLoadModule('/src/lib/offlineCache.ts');

    const clave = offlineCache.generarClaveCache('/tesoreria/cuentas');
    localStorage.setItem(
      clave,
      JSON.stringify({
        data: [{ id: 1, nombre: 'Caja' }],
        timestamp: Date.now() - (offlineCache.CACHE_TTL_MS + 10_000),
      }),
    );

    const resultado = offlineCache.obtenerDeCache('/tesoreria/cuentas');
    assert.equal(resultado, null);
    assert.equal(localStorage.getItem(clave), null);
  });

  it('authStore limpia cache al cambiar de usuario y no pisa requiereCambioClave desde cache', async () => {
    localStorage.clear();
    const offlineCache = await vite.ssrLoadModule('/src/lib/offlineCache.ts');
    const { useAuthStore } = await vite.ssrLoadModule('/src/store/authStore.ts');
    const { api } = await vite.ssrLoadModule('/src/api/client.ts');

    useAuthStore.getState().setSesion({
      accessToken: 't1',
      usuario: { id: 10, dni: '10', nombre: 'U1', apellido: 'A1' },
      requiereCambioClave: true,
      asignaciones: [],
    });

    offlineCache.guardarEnCache('/tesoreria/cuentas', null, [{ id: 1 }]);
    assert.ok(localStorage.getItem('scout_cache_v1:/tesoreria/cuentas'));

    // Mockear api.get devolviendo respuesta desde cache sin requiereCambioClave
    const origGet = api.get.bind(api);
    api.get = async () =>
      ({
        data: {
          usuario: { id: 10, dni: '10', nombre: 'U1', apellido: 'A1' },
          asignaciones: [],
        },
        status: 200,
        headers: { 'x-from-cache': 'true' },
      }) as any;

    try {
      await useAuthStore.getState().refrescarSesionDesdeServidor();
      assert.equal(useAuthStore.getState().requiereCambioClave, true);
    } finally {
      api.get = origGet;
    }

    // Cambiar a otro usuario debe limpiar scout_cache_v1:*
    useAuthStore.getState().setSesion({
      accessToken: 't2',
      usuario: { id: 20, dni: '20', nombre: 'U2', apellido: 'A2' },
      requiereCambioClave: false,
      asignaciones: [],
    });
    assert.equal(localStorage.getItem('scout_cache_v1:/tesoreria/cuentas'), null);
  });
});

describe('C3: permisos de cuotas vs ajustes en PestanaCuotasTesoreria', () => {
  it('separa cobrar de editarCargo/anularCargo/revertirPago/ajustarSaldo y oculta acciones en UI', async () => {
    localStorage.clear();
    const React = (await import('react')).default;
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { useAuthStore } = await vite.ssrLoadModule('/src/store/authStore.ts');
    const { usePermisosUI } = await vite.ssrLoadModule('/src/lib/permisos.ts');
    const { PestanaCuotasTesoreria } = await vite.ssrLoadModule(
      '/src/components/detalle-miembro/PestanaCuotasTesoreria.tsx',
    );

    const estadoCuentaDemo = {
      cargos: [
        {
          id: 1,
          estado: 'PENDIENTE',
          montoOriginal: 2000,
          montoDescuento: 0,
          montoFinal: 2000,
          montoPagado: 0,
          concepto: { nombre: 'Cuota Mayo' },
        },
      ],
      cargosAnulados: [
        { id: 2, montoFinal: 1000, concepto: { nombre: 'Cuota Abril' } },
      ],
      pagos: [
        {
          id: 9,
          montoTotal: 1000,
          metodoPago: 'EFECTIVO',
          fechaPago: '2026-05-01T12:00:00Z',
          imputaciones: [],
        },
      ],
    };

    const noop = async () => {};
    const VistaTest = () => {
      const { canEdit } = usePermisosUI();
      const puedeCobrarCuotas = canEdit('cuotas', 'cobrar');
      const puedeCrearCargoIndividual = canEdit('cuotas', 'cargoIndividual');
      const puedeAjustarCuotas = canEdit('cuotas', 'editarCargo');

      return React.createElement(PestanaCuotasTesoreria, {
        miembro: { id: 1, nombre: 'Juan', apellido: 'Scout' },
        estadoCuenta: estadoCuentaDemo,
        saldoPendiente: 2000,
        saldoAFavor: 500,
        puedeGestionarTesoreria: false,
        puedeCobrarCuotas,
        puedeCrearCargoIndividual,
        puedeAjustarCuotas,
        ajustandoSaldo: false,
        setAjustandoSaldo: () => {},
        tipoAjusteSaldo: 'CARGAR',
        setTipoAjusteSaldo: () => {},
        montoAjusteSaldo: '',
        setMontoAjusteSaldo: () => {},
        motivoAjusteSaldo: '',
        setMotivoAjusteSaldo: () => {},
        procesandoAccionCuota: false,
        desvinculandoMiembroId: null,
        cargoEditando: null,
        setCargoEditando: () => {},
        mostrarAnulados: true,
        setMostrarAnulados: () => {},
        pagoEditando: null,
        setPagoEditando: () => {},
        onGuardarAjusteSaldo: noop,
        onIniciarEdicionCargo: () => {},
        onGuardarEdicionCargo: noop,
        onAnularCargo: () => {},
        onReactivarCargo: noop,
        onEliminarCargoDefinitivo: () => {},
        onRevertirPago: () => {},
        onGuardarEdicionPago: noop,
        onDesvincularRapido: noop,
        onCobrarCargo: () => {},
        onAbrirModalGenerarDeuda: () => {},
        onAbrirModalEditarFamilia: () => {},
        onAbrirModalVincularHermano: () => {},
      });
    };

    // 1. Cobrador puro (solo cuotas.cobrar): puede cobrar y + Cargo, NO editar/anular/revertir/ajustar
    useAuthStore.getState().setSesion({
      accessToken: 't-cobrador',
      usuario: { id: 30, dni: '30', nombre: 'Cobrador', apellido: 'Test' },
      requiereCambioClave: false,
      asignaciones: [
        {
          unidadId: 1,
          unidadNombre: 'Manada',
          rol: 'Cobrador',
          alcance: 'UNIDAD',
          permisos: ['cuotas.ver', 'cuotas.cobrar'],
        },
      ],
    });

    const htmlCobrador = renderToStaticMarkup(React.createElement(VistaTest));
    assert.match(htmlCobrador, /Cobrar \/ Pagar/);
    assert.match(htmlCobrador, /\+ Cargo/);
    assert.doesNotMatch(htmlCobrador, /Editar monto o descuento/);
    assert.doesNotMatch(htmlCobrador, /Anular cuota/);
    assert.doesNotMatch(htmlCobrador, /Reactivar/);
    assert.doesNotMatch(htmlCobrador, /Revertir/);
    assert.doesNotMatch(htmlCobrador, />Ajustar</);

    // 2. Usuario con cuotas.ajustar pero sin cuotas.cobrar: puede ajustar/editar/anular/revertir, NO cobrar
    useAuthStore.getState().setSesion({
      accessToken: 't-ajustador',
      usuario: { id: 31, dni: '31', nombre: 'Ajustador', apellido: 'Test' },
      requiereCambioClave: false,
      asignaciones: [
        {
          unidadId: 1,
          unidadNombre: 'Grupo',
          rol: 'Tesorero Adjunto',
          alcance: 'GLOBAL',
          permisos: ['cuotas.ver', 'cuotas.ajustar'],
        },
      ],
    });

    const htmlAjustador = renderToStaticMarkup(React.createElement(VistaTest));
    assert.doesNotMatch(htmlAjustador, /Cobrar \/ Pagar/);
    assert.match(htmlAjustador, /Editar monto o descuento/);
    assert.match(htmlAjustador, /Anular cuota/);
    assert.match(htmlAjustador, /Reactivar/);
    assert.match(htmlAjustador, /Revertir/);
    assert.match(htmlAjustador, />Ajustar</);
  });
});

describe('C5: resolución offline de libro diario al cambiar de cuenta', () => {
  it('detecta cuando el libro en memoria corresponde a otra cuenta para evitar skeleton infinito', async () => {
    const { debeMostrarErrorOfflineLibro } = await vite.ssrLoadModule(
      '/src/components/PanelTesoreriaCajaBanco.tsx',
    );

    assert.equal(debeMostrarErrorOfflineLibro(null, 2), true);
    assert.equal(debeMostrarErrorOfflineLibro({ cuenta: { id: 1 } }, 2), true);
    assert.equal(debeMostrarErrorOfflineLibro({ cuenta: { id: 2 } }, 2), false);
  });
});

describe('C4: merge no destructivo de datosFijosJson en importación', () => {
  it('preserva campos existentes de datosFijosJson al actualizar domicilio', async () => {
    const { construirPayloadActualizacionMiembro } = await vite.ssrLoadModule(
      '/src/components/ModalImportarMiembros.tsx',
    );

    const payload = construirPayloadActualizacionMiembro(
      {
        telefonoContacto: '3515550000',
        emailContacto: 'nuevo@mail.com',
        domicilio: 'Av. Colón 1234',
      },
      {
        obraSocial: 'OSDE 210',
        alergias: 'Penicilina',
        domicilio: 'Vieja 999',
      },
    );

    assert.deepEqual(payload, {
      telefonoContacto: '3515550000',
      emailContacto: 'nuevo@mail.com',
      datosFijosJson: {
        obraSocial: 'OSDE 210',
        alergias: 'Penicilina',
        domicilio: 'Av. Colón 1234',
      },
    });

    const payloadSinDomicilio = construirPayloadActualizacionMiembro(
      { telefonoContacto: '', emailContacto: '', domicilio: '' },
      { obraSocial: 'OSDE 210' },
    );
    assert.equal(payloadSinDomicilio.datosFijosJson, undefined);
  });
});

describe('C6: sanitización WinAnsi y generación PDF con Unicode', () => {
  it('sanitiza emojis y símbolos no-WinAnsi preservando tildes y puntuación española', async () => {
    const { sanitizarTextoWinAnsi, buildOfficialPdf } = await vite.ssrLoadModule(
      '/src/services/officialPdfBuilder.ts',
    );

    const limpio = sanitizarTextoWinAnsi('Córdoba – Nº 196 • áéíóúñ € 🚀 ≥ 10 ≤ 20 ✓\nLínea 2');
    assert.equal(limpio, 'Córdoba – Nº 196 • áéíóúñ €  >= 10 <= 20 [x] Línea 2');

    const pdfBytes: Uint8Array = await buildOfficialPdf(
      {
        protagonista_nombre: 'Sofía 🚀',
        protagonista_apellido: 'Pérez ≥',
        protagonista_domicilio: 'Calle Falsa 123 • Córdoba\nDepto B',
        alergias_detalle: 'Ninguna ✓ α β γ',
        observaciones: 'Traer medicación ≤ 2 dosis 👍',
      },
      {
        usuario: {
          nombre: 'Sofía',
          apellido: 'Pérez',
          dni: '45123456',
          ramaNombre: 'Manada',
        },
      },
    );

    assert.ok(pdfBytes instanceof Uint8Array);
    assert.ok(pdfBytes.byteLength > 1000);
    assert.equal(Buffer.from(pdfBytes.slice(0, 5)).toString('ascii'), '%PDF-');
  });
});
