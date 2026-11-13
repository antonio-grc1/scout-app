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

describe('Alcance en UI: ocultar pestañas globales y filtrar unidades destinatarias', () => {
  it('oculta Caja, Gastos y Balance para usuarios sin alcance GLOBAL', async () => {
    const { calcularPermisosPanelGlobal } = await vite.ssrLoadModule('/src/lib/permisos.ts');

    const soloCajaUnidad = calcularPermisosPanelGlobal({
      esGlobal: false,
      tienePermiso: (p: string) => ['tesoreria.caja_ver', 'tesoreria.gastos_registrar'].includes(p),
      asignaciones: [
        {
          alcance: 'UNIDAD',
          unidadId: 2,
          permisos: ['tesoreria.caja_ver', 'tesoreria.gastos_registrar'],
        },
      ],
    });
    assert.equal(soloCajaUnidad.puedeVerCaja, false);
    assert.equal(soloCajaUnidad.puedeVerGastos, false);
    assert.equal(soloCajaUnidad.puedeVerBalance, false);
    assert.equal(soloCajaUnidad.puedeVerTesoreria, false);

    const tesoreroRama = calcularPermisosPanelGlobal({
      esGlobal: false,
      tienePermiso: (p: string) => ['cuotas.ver', 'tesoreria.conceptos_planes'].includes(p),
      asignaciones: [
        {
          alcance: 'UNIDAD',
          unidadId: 2,
          permisos: ['cuotas.ver', 'tesoreria.conceptos_planes'],
        },
      ],
    });
    assert.equal(tesoreroRama.puedeVerCaja, false);
    assert.equal(tesoreroRama.puedeVerEventos, false);
    assert.equal(tesoreroRama.puedeVerPlanes, true);
    assert.equal(tesoreroRama.puedeVerCampamentos, true);
    assert.equal(tesoreroRama.puedeVerTesoreria, true);

    const tesoreroGlobal = calcularPermisosPanelGlobal({
      esGlobal: true,
      tienePermiso: (p: string) => p === 'tesoreria.caja_ver',
      asignaciones: [{ alcance: 'GLOBAL', unidadId: 1, permisos: ['tesoreria.caja_ver'] }],
    });
    assert.equal(tesoreroGlobal.puedeVerCaja, true);
    assert.equal(tesoreroGlobal.puedeVerGastos, true);
    assert.equal(tesoreroGlobal.puedeVerBalance, true);
  });

  it('filtra unidades y bloquea edición de conceptos globales o familias de otras ramas para alcance UNIDAD', async () => {
    const {
      filtrarUnidadesPorAlcance,
      puedeModificarPorAlcanceUnidad,
      puedeEditarFamiliaPorAlcance,
    } = await vite.ssrLoadModule('/src/lib/permisos.ts');

    const todas = [
      { id: 1, nombre: 'Castores' },
      { id: 2, nombre: 'Manada' },
      { id: 3, nombre: 'Unidad Scout' },
    ];
    const filtradas = filtrarUnidadesPorAlcance(todas, {
      esGlobal: false,
      asignaciones: [{ alcance: 'UNIDAD', unidadId: 2 }],
    });
    assert.deepEqual(filtradas, [{ id: 2, nombre: 'Manada' }]);
    assert.equal(filtrarUnidadesPorAlcance(todas, { esGlobal: true, asignaciones: [] }).length, 3);

    assert.equal(
      puedeModificarPorAlcanceUnidad(null, { esGlobal: false, unidadesEnAlcanceIds: [2] }),
      false,
    );
    assert.equal(
      puedeModificarPorAlcanceUnidad(3, { esGlobal: false, unidadesEnAlcanceIds: [2] }),
      false,
    );
    assert.equal(
      puedeModificarPorAlcanceUnidad(2, { esGlobal: false, unidadesEnAlcanceIds: [2] }),
      true,
    );

    assert.equal(
      puedeEditarFamiliaPorAlcance(
        { miembros: [{ asignaciones: [{ unidad: { id: 2 } }] }] },
        { esGlobal: false, unidadesEnAlcanceIds: [2] },
      ),
      true,
    );
    assert.equal(
      puedeEditarFamiliaPorAlcance(
        {
          miembros: [
            { asignaciones: [{ unidad: { id: 2 } }] },
            { asignaciones: [{ unidad: { id: 3 } }] },
          ],
        },
        { esGlobal: false, unidadesEnAlcanceIds: [2] },
      ),
      false,
    );
  });

  it('puedeAccederPanelGestion no habilita /global si un usuario UNIDAD solo tiene permisos globales de caja/gastos', async () => {
    localStorage.clear();
    const { useAuthStore } = await vite.ssrLoadModule('/src/store/authStore.ts');

    useAuthStore.getState().setSesion({
      accessToken: 'tok-caja-unidad',
      usuario: { id: 9, dni: '99', nombre: 'Solo', apellido: 'Caja' },
      requiereCambioClave: false,
      asignaciones: [
        {
          unidadId: 2,
          unidadNombre: 'Manada',
          rol: 'Revisor Caja',
          alcance: 'UNIDAD',
          permisos: ['tesoreria.caja_ver', 'tesoreria.gastos_registrar'],
        },
      ],
    });
    assert.equal(useAuthStore.getState().puedeAccederPanelGestion(), false);

    useAuthStore.getState().setSesion({
      accessToken: 'tok-cuotas-unidad',
      usuario: { id: 10, dni: '100', nombre: 'Tesorero', apellido: 'Manada' },
      requiereCambioClave: false,
      asignaciones: [
        {
          unidadId: 2,
          unidadNombre: 'Manada',
          rol: 'Tesorero',
          alcance: 'UNIDAD',
          permisos: ['cuotas.ver'],
        },
      ],
    });
    assert.equal(useAuthStore.getState().puedeAccederPanelGestion(), true);
  });

  it('filtra roles asignables, bloquea modificaciones sobre usuarios GLOBALES y restringe pases según alcance', async () => {
    const {
      filtrarRolesAsignablesPorAlcance,
      miembroEsEducador,
      miembroTieneAlcanceGlobal,
      obtenerRamasPermitidasParaPase,
      puedeCerrarAsignacionPorAlcance,
      tienePermisoEdicion,
      filtrarRolesParaPase,
      puedeDesvincularIntegrantePorAlcance,
    } = await vite.ssrLoadModule('/src/lib/permisos.ts');

    const rolesMock = [
      { id: 1, codigo: 'PROTAGONISTA', nombre: 'Protagonista', alcance: 'PROPIO', tipoMiembro: 'PROTAGONISTA', requiereRama: true },
      { id: 2, codigo: 'EDUCADOR_RAMA', nombre: 'Educador de Rama', alcance: 'UNIDAD', tipoMiembro: 'EDUCADOR', requiereRama: true },
      { id: 3, codigo: 'EDUCADOR_SIN_RAMA', nombre: 'Apoyo sin Rama', alcance: 'UNIDAD', tipoMiembro: 'EDUCADOR', requiereRama: false },
      { id: 4, codigo: 'JEFE_GRUPO', nombre: 'Jefe de Grupo', alcance: 'GLOBAL', tipoMiembro: 'EDUCADOR', requiereRama: false },
    ];
    const unidadesSoloRama = [{ id: 2, tipo: 'SECCION_RAMA', ramaId: 1 }];
    const unidadesConApoyo = [
      { id: 2, tipo: 'SECCION_RAMA', ramaId: 1 },
      { id: 9, tipo: 'SIN_RAMA_APOYO', ramaId: null },
    ];

    // Usuario UNIDAD con solo sección rama no ve roles GLOBAL ni roles Sin Rama / Apoyo
    assert.deepEqual(
      filtrarRolesAsignablesPorAlcance(rolesMock, unidadesSoloRama, false).map((r: any) => r.id),
      [1, 2],
    );
    // Si incluye SIN_RAMA_APOYO en su alcance, habilita Apoyo sin Rama, nunca Jefe de Grupo
    assert.deepEqual(
      filtrarRolesAsignablesPorAlcance(rolesMock, unidadesConApoyo, false).map((r: any) => r.id),
      [1, 2, 3],
    );
    // Alcance GLOBAL ve todos
    assert.deepEqual(
      filtrarRolesAsignablesPorAlcance(rolesMock, unidadesSoloRama, true).map((r: any) => r.id),
      [1, 2, 3, 4],
    );

    // Usuario objetivo GLOBAL detectado correctamente
    assert.equal(
      miembroTieneAlcanceGlobal({
        asignaciones: [{ activo: true, rol: { alcance: 'GLOBAL', nombre: 'Jefe de Grupo' } }],
      }),
      true,
    );
    assert.equal(
      miembroTieneAlcanceGlobal({
        asignaciones: [{ activo: true, rol: { alcance: 'UNIDAD', nombre: 'Educador' } }],
      }),
      false,
    );

    // Permiso de pases desacoplado de miembros.editar (Tesorero no puede gestionar pases)
    assert.equal(tienePermisoEdicion('miembro', 'pase', ['miembros.editar']), false);
    assert.equal(tienePermisoEdicion('miembro', 'pase', ['pases.ejecutar']), true);

    // Cerrar asignaciones: UNIDAD no puede cerrar globales, propias, de educadores ni de otra unidad
    assert.equal(
      puedeCerrarAsignacionPorAlcance(
        { unidadId: 2, rol: { alcance: 'PROPIO', tipoMiembro: 'PROTAGONISTA' } },
        { esGlobal: false, unidadesEnAlcanceIds: [2], esMismoUsuario: true },
      ),
      false,
    );
    assert.equal(
      puedeCerrarAsignacionPorAlcance(
        { unidadId: 3, rol: { alcance: 'PROPIO', tipoMiembro: 'PROTAGONISTA' } },
        { esGlobal: false, unidadesEnAlcanceIds: [2], esMismoUsuario: false },
      ),
      false,
    );
    assert.equal(
      puedeCerrarAsignacionPorAlcance(
        { unidadId: 1, rol: { alcance: 'GLOBAL' } },
        { esGlobal: false, unidadesEnAlcanceIds: [1, 2], esMismoUsuario: false },
      ),
      false,
    );
    assert.equal(
      puedeCerrarAsignacionPorAlcance(
        { unidadId: 2, rol: { alcance: 'UNIDAD', tipoMiembro: 'EDUCADOR' } },
        { esGlobal: false, unidadesEnAlcanceIds: [2], esMismoUsuario: false },
      ),
      false,
    );
    assert.equal(
      puedeCerrarAsignacionPorAlcance(
        { unidadId: 2, rol: { alcance: 'PROPIO', tipoMiembro: 'PROTAGONISTA' } },
        { esGlobal: false, unidadesEnAlcanceIds: [2], esMismoUsuario: false },
      ),
      true,
    );

    // Pases sin ser GLOBAL solo permiten rol PROTAGONISTA (inclusive dentro de la propia unidad) y jamás SIN_RAMA
    const rolesPaseOutOfScope = filtrarRolesParaPase({
      categoriaDestino: 'RAMA',
      modoAccion: 'MUDAR',
      esGlobal: false,
      unidadDestinoEnAlcance: false,
      rolesRama: [rolesMock[0], rolesMock[1]],
      rolesSinRama: [rolesMock[2]],
      rolesJefatura: [rolesMock[3]],
    });
    assert.deepEqual(rolesPaseOutOfScope.map((r: any) => r.id), [1]);

    const rolesPaseInScope = filtrarRolesParaPase({
      categoriaDestino: 'RAMA',
      modoAccion: 'MUDAR',
      esGlobal: false,
      unidadDestinoEnAlcance: true,
      rolesRama: [rolesMock[0], rolesMock[1]],
      rolesSinRama: [rolesMock[2]],
      rolesJefatura: [rolesMock[3]],
    });
    assert.deepEqual(rolesPaseInScope.map((r: any) => r.id), [1]);

    const rolesPaseSinRamaNoGlobal = filtrarRolesParaPase({
      categoriaDestino: 'SIN_RAMA',
      modoAccion: 'MUDAR',
      esGlobal: false,
      unidadDestinoEnAlcance: true,
      rolesRama: [rolesMock[0], rolesMock[1]],
      rolesSinRama: [rolesMock[2]],
      rolesJefatura: [rolesMock[3]],
    });
    assert.deepEqual(rolesPaseSinRamaNoGlobal, []);

    // Progresión de ramas permitidas para usuario no global: solo misma rama o inmediatamente siguiente
    const ramasMock = [
      { id: 1, nombre: 'Manada', ordenProgresion: 1, activa: true },
      { id: 2, nombre: 'Unidad Scout', ordenProgresion: 2, activa: true },
      { id: 3, nombre: 'Caminantes', ordenProgresion: 3, activa: true },
      { id: 4, nombre: 'Rover', ordenProgresion: 4, activa: true },
    ];
    assert.deepEqual(
      obtenerRamasPermitidasParaPase({ esGlobal: false, ramas: ramasMock, ramaOrigenId: 1 }).map((r: any) => r.id),
      [1, 2],
    );
    assert.deepEqual(
      obtenerRamasPermitidasParaPase({ esGlobal: true, ramas: ramasMock, ramaOrigenId: 1 }).map((r: any) => r.id),
      [1, 2, 3, 4],
    );
    assert.equal(
      miembroEsEducador({ asignaciones: [{ activo: true, rol: { tipoMiembro: 'EDUCADOR' } }] }),
      true,
    );
    assert.equal(
      miembroEsEducador({ asignaciones: [{ activo: true, rol: { tipoMiembro: 'PROTAGONISTA', alcance: 'PROPIO' } }] }),
      false,
    );

    // Desvincular hermano: bloquea hermanos de otra rama si no se tiene alcance GLOBAL
    assert.equal(
      puedeDesvincularIntegrantePorAlcance(
        { id: 15, asignaciones: [{ unidadId: 3 }] },
        { esGlobal: false, unidadesEnAlcanceIds: [2], miembroActualId: 12 },
      ),
      false,
    );
    assert.equal(
      puedeDesvincularIntegrantePorAlcance(
        { id: 12, asignaciones: [{ unidadId: 2 }] },
        { esGlobal: false, unidadesEnAlcanceIds: [2], miembroActualId: 12 },
      ),
      true,
    );
  });
});
