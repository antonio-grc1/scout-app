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

describe('Fase 4: capabilities.ts (multi-rol, alcance UNIDAD y cero hardcoding por nombre)', () => {
  it('deriva capacidades por permisos declarativos sin depender del nombre del rol', async () => {
    const { computeCapabilities } = await vite.ssrLoadModule('/src/core/capabilities.ts');

    // Nombre arbitrario con permisos reales -> habilita exactamente esos permisos
    const capsArbitrario = computeCapabilities([
      {
        unidadId: 3,
        unidadNombre: 'Unidad Scout',
        rol: 'Colaborador Sin Nombre Conocido',
        tipoMiembro: 'EDUCADOR',
        alcance: 'UNIDAD',
        permisos: ['padron.ver', 'cobranzas.editar', 'pases.ver', 'pases.editar'],
      },
    ]);

    assert.equal(capsArbitrario.scope, 'UNIDAD');
    assert.equal(capsArbitrario.esUnidad, true);
    assert.equal(capsArbitrario.esGlobal, false);
    assert.equal(capsArbitrario.esMultiRol, true);
    assert.equal(capsArbitrario.canViewMiembros, true);
    assert.equal(capsArbitrario.canCobrar, true);
    assert.equal(capsArbitrario.canViewPases, true);
    assert.equal(capsArbitrario.canExecutePases, true);
    assert.equal(capsArbitrario.canExecuteEgreso, false);
    assert.equal(capsArbitrario.canSeeCajaContabilidad, false);
    assert.equal(capsArbitrario.canManagePlantillas, false);
    assert.equal(capsArbitrario.canEditOrganizacion, false);

    // Nombre privilegiado pero sin permisos -> no habilita acciones administrativas
    const capsSinPermisos = computeCapabilities([
      {
        unidadId: 1,
        unidadNombre: 'Jefatura',
        rol: 'Jefe de Grupo',
        tipoMiembro: 'PROTAGONISTA',
        alcance: 'PROPIO',
        permisos: [],
      },
    ]);

    assert.equal(capsSinPermisos.scope, 'PROPIO');
    assert.equal(capsSinPermisos.esPropio, true);
    assert.equal(capsSinPermisos.esMultiRol, false);
    assert.equal(capsSinPermisos.canViewMiembros, false);
    assert.equal(capsSinPermisos.canSeeTesoreriaGestion, false);
    assert.equal(capsSinPermisos.canEditOrganizacion, false);
    assert.equal(capsSinPermisos.canViewInicio, true);
    assert.equal(capsSinPermisos.canViewMiEspacio, true);
    assert.equal(capsSinPermisos.canViewAvisos, true);
    assert.equal(capsSinPermisos.canViewAvisosEnviados, false);
    assert.equal(capsSinPermisos.canSendAvisos, false);
    assert.equal(capsSinPermisos.canSendAvisosGlobales, false);
  });

  it('calcula capacidades de avisos según permiso y alcance (PROPIO, UNIDAD, GLOBAL)', async () => {
    const { computeCapabilities } = await vite.ssrLoadModule('/src/core/capabilities.ts');

    const capsPropio = computeCapabilities([
      {
        unidadId: 2,
        unidadNombre: 'Manada',
        rol: 'Protagonista',
        tipoMiembro: 'PROTAGONISTA',
        alcance: 'PROPIO',
        permisos: ['avisos.ver'],
      },
    ]);
    assert.equal(capsPropio.canViewAvisos, true);
    assert.equal(capsPropio.canViewAvisosEnviados, false);
    assert.equal(capsPropio.canSendAvisos, false);
    assert.equal(capsPropio.canSendAvisosGlobales, false);

    const capsUnidadSoloLectura = computeCapabilities([
      {
        unidadId: 3,
        unidadNombre: 'Rama Scout',
        rol: 'Colaborador',
        tipoMiembro: 'EDUCADOR',
        alcance: 'UNIDAD',
        permisos: ['avisos.ver'],
      },
    ]);
    assert.equal(capsUnidadSoloLectura.canViewAvisos, true);
    assert.equal(capsUnidadSoloLectura.canViewAvisosEnviados, true);
    assert.equal(capsUnidadSoloLectura.canSendAvisos, false);
    assert.equal(capsUnidadSoloLectura.canSendAvisosGlobales, false);

    const capsUnidadEdicion = computeCapabilities([
      {
        unidadId: 3,
        unidadNombre: 'Rama Scout',
        rol: 'Educador',
        tipoMiembro: 'EDUCADOR',
        alcance: 'UNIDAD',
        permisos: ['avisos.ver', 'avisos.editar'],
      },
    ]);
    assert.equal(capsUnidadEdicion.canViewAvisosEnviados, true);
    assert.equal(capsUnidadEdicion.canSendAvisos, true);
    assert.equal(capsUnidadEdicion.canSendAvisosGlobales, false);

    const capsGlobalEdicion = computeCapabilities([
      {
        unidadId: 1,
        unidadNombre: 'Jefatura',
        rol: 'Jefe de Grupo',
        tipoMiembro: 'EDUCADOR',
        alcance: 'GLOBAL',
        permisos: ['avisos.editar'],
      },
    ]);
    assert.equal(capsGlobalEdicion.canViewAvisos, true);
    assert.equal(capsGlobalEdicion.canViewAvisosEnviados, true);
    assert.equal(capsGlobalEdicion.canSendAvisos, true);
    assert.equal(capsGlobalEdicion.canSendAvisosGlobales, true);
  });

  it('calcula capacidades de campamentos según permiso y alcance (PROPIO, UNIDAD, GLOBAL)', async () => {
    const { computeCapabilities } = await vite.ssrLoadModule('/src/core/capabilities.ts');

    const capsPropio = computeCapabilities([
      {
        unidadId: 2,
        unidadNombre: 'Manada',
        rol: 'Protagonista',
        tipoMiembro: 'PROTAGONISTA',
        alcance: 'PROPIO',
        permisos: ['campamentos.ver'],
      },
    ]);
    assert.equal(capsPropio.canViewCampamentos, true);
    assert.equal(capsPropio.canManageCampamentos, false);
    assert.equal(capsPropio.canEditCampamentos, false);
    assert.equal(capsPropio.canCreateGlobalCampamentos, false);

    const capsUnidadEdicion = computeCapabilities([
      {
        unidadId: 3,
        unidadNombre: 'Rama Scout',
        rol: 'Educador',
        tipoMiembro: 'EDUCADOR',
        alcance: 'UNIDAD',
        permisos: ['campamentos.ver', 'campamentos.editar'],
      },
    ]);
    assert.equal(capsUnidadEdicion.canViewCampamentos, true);
    assert.equal(capsUnidadEdicion.canManageCampamentos, true);
    assert.equal(capsUnidadEdicion.canEditCampamentos, true);
    assert.equal(capsUnidadEdicion.canCreateGlobalCampamentos, false);

    const capsGlobalEdicion = computeCapabilities([
      {
        unidadId: 1,
        unidadNombre: 'Jefatura',
        rol: 'Jefe de Grupo',
        tipoMiembro: 'EDUCADOR',
        alcance: 'GLOBAL',
        permisos: ['campamentos.editar'],
      },
    ]);
    assert.equal(capsGlobalEdicion.canManageCampamentos, true);
    assert.equal(capsGlobalEdicion.canEditCampamentos, true);
    assert.equal(capsGlobalEdicion.canCreateGlobalCampamentos, true);
  });

  it('aisla capacidades GLOBAL-only en perfiles multi-rol UNIDAD + PROPIO y habilita al combinar GLOBAL', async () => {
    const { computeCapabilities } = await vite.ssrLoadModule('/src/core/capabilities.ts');

    const multiUnidadPropio = computeCapabilities([
      {
        unidadId: 2,
        unidadNombre: 'Manada',
        rol: 'Protagonista',
        tipoMiembro: 'PROTAGONISTA',
        alcance: 'PROPIO',
        permisos: ['legajos.editar', 'eventos.ver'],
      },
      {
        unidadId: 4,
        unidadNombre: 'Caminantes',
        rol: 'Educador',
        tipoMiembro: 'EDUCADOR',
        alcance: 'UNIDAD',
        permisos: ['padron.ver', 'caja.ver', 'plantillas.editar'],
      },
    ]);

    assert.equal(multiUnidadPropio.scope, 'UNIDAD');
    assert.equal(multiUnidadPropio.canCompleteLegajos, true);
    assert.equal(multiUnidadPropio.canViewMiembros, true);
    // A2: Caja por rama habilita canSeeCajaContabilidad en UNIDAD, pero permisos GLOBAL-only siguen bloqueados
    assert.equal(multiUnidadPropio.canSeeCajaContabilidad, true);
    assert.equal(multiUnidadPropio.canManagePlantillas, false);
    assert.equal(multiUnidadPropio.canEditOrganizacion, false);
    assert.equal(multiUnidadPropio.canEditRoles, false);
    assert.equal(multiUnidadPropio.unidadesAsignadas.length, 2);

    const multiConGlobal = computeCapabilities([
      {
        unidadId: 4,
        unidadNombre: 'Caminantes',
        rol: 'Educador',
        tipoMiembro: 'EDUCADOR',
        alcance: 'UNIDAD',
        permisos: ['padron.ver'],
      },
      {
        unidadId: 1,
        unidadNombre: 'Jefatura',
        rol: 'Administrador',
        tipoMiembro: 'EDUCADOR',
        alcance: 'GLOBAL',
        permisos: ['caja.ver', 'plantillas.editar', 'organizacion.editar'],
      },
    ]);

    assert.equal(multiConGlobal.scope, 'GLOBAL');
    assert.equal(multiConGlobal.esGlobal, true);
    assert.equal(multiConGlobal.canSeeCajaContabilidad, true);
    assert.equal(multiConGlobal.canManagePlantillas, true);
    assert.equal(multiConGlobal.canEditOrganizacion, true);
    // A5: organizacion.editar no otorga canEditRoles sin roles.editar
    assert.equal(multiConGlobal.canEditRoles, false);
  });

  it('useActiveUnitStore resetea activeUnitId a ALL al cambiar de usuario en authStore', async () => {
    localStorage.clear();
    const { useAuthStore } = await vite.ssrLoadModule('/src/store/authStore.ts');
    const { useActiveUnitStore } = await vite.ssrLoadModule('/src/core/capabilities.ts');

    useAuthStore.getState().setSesion({
      accessToken: 'tok-u1',
      usuario: { id: 101, dni: '101', nombre: 'Uno', apellido: 'Test' },
      requiereCambioClave: false,
      asignaciones: [],
    });

    useActiveUnitStore.getState().setActiveUnitId(4);
    assert.equal(useActiveUnitStore.getState().activeUnitId, 4);

    useAuthStore.getState().setSesion({
      accessToken: 'tok-u2',
      usuario: { id: 202, dni: '202', nombre: 'Dos', apellido: 'Test' },
      requiereCambioClave: false,
      asignaciones: [],
    });

    assert.equal(useActiveUnitStore.getState().activeUnitId, 'ALL');
  });

  it('abstrae el alcance en rolPrincipalLabel y oculta selector multi-vista cuando hay 1 sola unidad', async () => {
    const {
      computeCapabilities,
      obtenerUnidadesVisibles,
      obtenerNombreUnidadActiva,
    } = await vite.ssrLoadModule('/src/core/capabilities.ts');

    const capsUnaUnidad = computeCapabilities([
      {
        unidadId: 2,
        unidadNombre: 'Manada',
        rol: 'Educador',
        tipoMiembro: 'EDUCADOR',
        alcance: 'UNIDAD',
        permisos: ['padron.ver'],
      },
    ]);
    assert.equal(capsUnaUnidad.rolPrincipalLabel, 'Educador');
    assert.equal(capsUnaUnidad.rolPrincipalLabel.includes('Alcance'), false);
    assert.deepEqual(obtenerUnidadesVisibles(capsUnaUnidad), [{ id: 2, nombre: 'Manada' }]);
    assert.equal(obtenerNombreUnidadActiva('ALL', capsUnaUnidad), 'Manada');

    // Con asignación PROPIO en otra unidad + 1 UNIDAD: solo cuenta la unidad de gestión
    const capsMixtoUnaUnidadGestion = computeCapabilities([
      {
        unidadId: 5,
        unidadNombre: 'Rover',
        rol: 'Protagonista',
        tipoMiembro: 'PROTAGONISTA',
        alcance: 'PROPIO',
        permisos: ['legajos.editar'],
      },
      {
        unidadId: 2,
        unidadNombre: 'Manada',
        rol: 'Educador',
        tipoMiembro: 'EDUCADOR',
        alcance: 'UNIDAD',
        permisos: ['padron.ver'],
      },
    ]);
    assert.deepEqual(obtenerUnidadesVisibles(capsMixtoUnaUnidadGestion), [
      { id: 2, nombre: 'Manada' },
    ]);
    assert.equal(obtenerNombreUnidadActiva('ALL', capsMixtoUnaUnidadGestion), 'Manada');

    // Con 2 unidades de gestión sí habilita selector
    const capsDosUnidades = computeCapabilities([
      {
        unidadId: 2,
        unidadNombre: 'Manada',
        rol: 'Educador',
        tipoMiembro: 'EDUCADOR',
        alcance: 'UNIDAD',
        permisos: ['padron.ver'],
      },
      {
        unidadId: 3,
        unidadNombre: 'Unidad Scout',
        rol: 'Educador',
        tipoMiembro: 'EDUCADOR',
        alcance: 'UNIDAD',
        permisos: ['padron.ver'],
      },
    ]);
    assert.equal(obtenerUnidadesVisibles(capsDosUnidades).length, 2);
    assert.equal(obtenerNombreUnidadActiva('ALL', capsDosUnidades), 'Todas tus unidades');
  });
});

describe('Fase 4: campamentoSync.ts y bloqueo de mutaciones offline en api/client.ts', () => {
  it('sincronizarParaCampamento descarga datos paginados, los guarda en caché y registra timestamp', async () => {
    localStorage.clear();
    const { api } = await vite.ssrLoadModule('/src/api/client.ts');
    const { useAuthStore } = await vite.ssrLoadModule('/src/store/authStore.ts');
    const offlineCache = await vite.ssrLoadModule('/src/lib/offlineCache.ts');
    const campamentoSync = await vite.ssrLoadModule('/src/core/offline/campamentoSync.ts');

    offlineCache.limpiarCacheApi();
    await campamentoSync.purgarCampamentoOffline();

    useAuthStore.getState().setSesion({
      accessToken: 'tok-camp',
      usuario: { id: 55, dni: '55', nombre: 'Jefe', apellido: 'Camp' },
      requiereCambioClave: false,
      asignaciones: [],
    });

    const prevAdapter = api.defaults.adapter;
    api.defaults.adapter = async (config: any) => {
      const url = String(config.url || '');
      if (url.startsWith('/miembros?pagina=1')) {
        return {
          data: {
            total: 201,
            items: [{ id: 1, nombre: 'Mateo', apellido: 'Gómez' }],
          },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      }
      if (url.startsWith('/miembros?pagina=2')) {
        return {
          data: {
            total: 201,
            items: [{ id: 2, nombre: 'Sofía', apellido: 'Pereyra' }],
          },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      }
      if (url.startsWith('/legajos/entregas')) {
        return {
          data: [{ id: 90, usuarioId: 1, estado: 'VALIDADO_FISICO' }],
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      }
      if (url.startsWith('/legajos/plantillas')) {
        return {
          data: [{ id: 10, titulo: 'Menores', activa: true }],
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      }
      if (url === '/organizacion/unidades') {
        return { data: [{ id: 1, nombre: 'Manada' }], status: 200, statusText: 'OK', headers: {}, config };
      }
      if (url === '/organizacion/ramas') {
        return { data: [{ id: 1, nombre: 'Manada' }], status: 200, statusText: 'OK', headers: {}, config };
      }
      if (url === '/pases/candidatos') {
        return { data: [{ asignacionId: 1 }], status: 200, statusText: 'OK', headers: {}, config };
      }
      return { data: [], status: 200, statusText: 'OK', headers: {}, config };
    };

    try {
      const porcentajes: number[] = [];
      const resumen = await campamentoSync.sincronizarParaCampamento({
        usuarioId: 55,
        onProgreso: (_msg: string, pct: number) => porcentajes.push(pct),
      });

      assert.equal(resumen.totalMiembros, 2);
      assert.equal(resumen.totalEntregas, 1);
      assert.equal(resumen.totalPlantillas, 1);
      assert.ok(resumen.sincronizadoEn > 0);
      assert.equal(porcentajes[porcentajes.length - 1], 100);

      const miembrosCache = offlineCache.obtenerDeCache('/miembros');
      assert.equal(miembrosCache?.data?.items?.length, 2);
      assert.equal(offlineCache.obtenerDeCache('/miembros/2')?.data?.nombre, 'Sofía');
      assert.ok(campamentoSync.obtenerUltimoSyncCampamento(55));
    } finally {
      api.defaults.adapter = prevAdapter;
    }
  });

  it('gestiona borradores locales de legajo, los sincroniza al volver señal y los purga en logout()', async () => {
    localStorage.clear();
    const { api } = await vite.ssrLoadModule('/src/api/client.ts');
    const { useAuthStore } = await vite.ssrLoadModule('/src/store/authStore.ts');
    const offlineCache = await vite.ssrLoadModule('/src/lib/offlineCache.ts');
    const campamentoSync = await vite.ssrLoadModule('/src/core/offline/campamentoSync.ts');

    await campamentoSync.purgarCampamentoOffline();
    offlineCache.limpiarCacheApi();

    useAuthStore.getState().setSesion({
      accessToken: 'tok-draft',
      usuario: { id: 77, dni: '77', nombre: 'Ana', apellido: 'Scout' },
      requiereCambioClave: false,
      asignaciones: [],
    });

    const guardado = await campamentoSync.guardarBorradorLegajoLocal({
      ownerUserId: 77,
      usuarioId: 77,
      plantillaId: 5,
      cicloAnio: 2026,
      respuestas: { alergias_detalle: 'Polen', obra_social: 'APROSS' },
    });

    assert.equal(guardado.estadoSync, 'PENDIENTE_SINCRONIZAR');
    const leido = await campamentoSync.obtenerBorradorLegajoLocal({
      ownerUserId: 77,
      usuarioId: 77,
      plantillaId: 5,
      cicloAnio: 2026,
    });
    assert.equal(leido?.respuestas.alergias_detalle, 'Polen');
    assert.equal((await campamentoSync.listarBorradoresLegajoLocales(77)).length, 1);

    // Probar sincronización exitosa contra servidor
    const prevAdapter = api.defaults.adapter;
    const posts: any[] = [];
    api.defaults.adapter = async (config: any) => {
      if (config.method?.toLowerCase() === 'post' && config.url === '/legajos/entregas') {
        posts.push(JSON.parse(config.data));
        return { data: { id: 999 }, status: 201, statusText: 'Created', headers: {}, config };
      }
      return { data: {}, status: 200, statusText: 'OK', headers: {}, config };
    };

    try {
      const syncRes = await campamentoSync.sincronizarBorradoresLegajoLocales(77);
      assert.deepEqual(syncRes, { sincronizados: 1, fallidos: 0 });
      assert.equal(posts.length, 1);
      assert.equal(posts[0].finalizarParaFirma, false);
      assert.equal(posts[0].respuestas.obra_social, 'APROSS');
      assert.equal((await campamentoSync.listarBorradoresLegajoLocales(77)).length, 0);
    } finally {
      api.defaults.adapter = prevAdapter;
    }

    // Guardar otro borrador + metadata y probar purga completa en logout()
    await campamentoSync.guardarBorradorLegajoLocal({
      ownerUserId: 77,
      usuarioId: 88,
      plantillaId: 5,
      cicloAnio: 2026,
      respuestas: { protagonista_apellidos: 'Ruiz' },
    });
    localStorage.setItem(
      campamentoSync.obtenerClaveSyncCampamento(77),
      JSON.stringify({ sincronizadoEn: Date.now(), totalMiembros: 3, totalEntregas: 1, totalPlantillas: 1 }),
    );
    offlineCache.guardarEnCache('/organizacion/ramas', null, [{ id: 1 }]);

    useAuthStore.getState().logout();
    // Dar un tick para la suscripción async
    await new Promise((r) => setTimeout(r, 10));

    assert.equal(campamentoSync.obtenerUltimoSyncCampamento(77), null);
    assert.equal((await campamentoSync.listarBorradoresLegajoLocales(77)).length, 0);
    assert.equal(offlineCache.obtenerTamanoMemoriaCache(), 0);
  });

  it('logout() borra la suscripción push en el servidor pero la conserva en el navegador; al volver a entrar se re-asocia sola', async () => {
    const { api } = await vite.ssrLoadModule('/src/api/client.ts');
    const { useAuthStore } = await vite.ssrLoadModule('/src/store/authStore.ts');

    const g = globalThis as any;
    const prevWindow = g.window;
    const navDesc = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    let desuscriptoEnNavegador = false;
    const sub = {
      endpoint: 'https://push.example/abc',
      toJSON: () => ({
        endpoint: 'https://push.example/abc',
        keys: { p256dh: 'p256dh-de-prueba', auth: 'auth-de-prueba' },
      }),
      getKey: () => null,
      unsubscribe: async () => {
        desuscriptoEnNavegador = true;
        return true;
      },
    };
    g.window = { PushManager: class {}, Notification: class {} };
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        serviceWorker: {
          getRegistration: async () => ({
            pushManager: { getSubscription: async () => sub },
          }),
        },
      },
    });

    const prevAdapter = api.defaults.adapter;
    const llamadas: Array<{ url: string; data: unknown }> = [];
    api.defaults.adapter = async (config: any) => {
      llamadas.push({ url: config.url, data: config.data ? JSON.parse(config.data) : null });
      return { data: { ok: true }, status: 200, statusText: 'OK', headers: {}, config };
    };

    const sesion = (id: number) => ({
      accessToken: 'tok-push',
      usuario: { id, dni: String(id), nombre: 'Leo', apellido: 'Scout' },
      requiereCambioClave: false,
      asignaciones: [],
    });

    try {
      useAuthStore.getState().logout();
      await new Promise((r) => setTimeout(r, 20));
      llamadas.length = 0;

      // Entrar: la suscripción que ya tenía el dispositivo se asocia al usuario.
      useAuthStore.getState().setSesion(sesion(91));
      await new Promise((r) => setTimeout(r, 20));
      assert.deepEqual(llamadas.map((l) => l.url), ['/avisos/push/suscribir']);
      assert.deepEqual(llamadas[0].data, sub.toJSON());

      // Refrescar la sesión del mismo usuario no vuelve a enviarla.
      llamadas.length = 0;
      useAuthStore.getState().setSesion({ ...sesion(91), asignaciones: [] });
      await new Promise((r) => setTimeout(r, 20));
      assert.deepEqual(llamadas, []);

      // Salir: se borra en el servidor (antes de /auth/logout), no en el navegador.
      useAuthStore.getState().logout();
      await new Promise((r) => setTimeout(r, 20));
      assert.equal(desuscriptoEnNavegador, false);
      assert.deepEqual(
        llamadas.map((l) => l.url),
        ['/avisos/push/desuscribir', '/auth/logout'],
      );
      assert.deepEqual(llamadas[0].data, { endpoint: 'https://push.example/abc' });

      // Entra otra persona en el mismo dispositivo: la suscripción pasa a ser suya.
      llamadas.length = 0;
      useAuthStore.getState().setSesion(sesion(92));
      await new Promise((r) => setTimeout(r, 20));
      assert.deepEqual(llamadas.map((l) => l.url), ['/avisos/push/suscribir']);
    } finally {
      api.defaults.adapter = prevAdapter;
      g.window = prevWindow;
      if (navDesc) Object.defineProperty(globalThis, 'navigator', navDesc);
      else delete g.navigator;
    }
  });

  it('api bloquea mutaciones de servidor cuando !isOnline y muestra aviso claro sin disparar red', async () => {
    const { api } = await vite.ssrLoadModule('/src/api/client.ts');
    const { useOfflineStore } = await vite.ssrLoadModule('/src/store/offlineStore.ts');
    const { useToastStore } = await vite.ssrLoadModule('/src/store/toastStore.ts');

    const prevAdapter = api.defaults.adapter;
    let llamadasRed = 0;
    api.defaults.adapter = async (config: any) => {
      llamadasRed += 1;
      return { data: {}, status: 200, statusText: 'OK', headers: {}, config };
    };

    try {
      useToastStore.setState({ toast: null });
      useOfflineStore.getState().actualizarEstadoRed(false);

      await assert.rejects(
        () => api.post('/tesoreria/pagos', { monto: 1000 }),
        (err: any) => Boolean(err?.__isOfflineMutationBlocked && err?.__isOfflineFastFail),
      );

      assert.equal(llamadasRed, 0);
      const toast = useToastStore.getState().toast;
      assert.ok(toast);
      assert.equal(toast.tipo, 'advertencia');
      assert.match(toast.texto, /sin conexión/i);

      // /auth/logout no debe quedar bloqueado ni mostrar aviso
      useToastStore.setState({ toast: null });
      await api.post('/auth/logout');
      assert.equal(llamadasRed, 1);
      assert.equal(useToastStore.getState().toast, null);
    } finally {
      api.defaults.adapter = prevAdapter;
      useOfflineStore.setState({
        isOnline: true,
        isUsingCache: false,
        conexionRestablecida: false,
        mostrarBanner: false,
      });
    }
  });
});
