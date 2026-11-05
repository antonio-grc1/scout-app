interface ItemCache<T = unknown> {
  data: T;
  timestamp: number;
}

const PREFIJO_CACHE = 'scout_cache_v1:';

/**
 * Genera una clave determinista para la URL y sus parámetros.
 */
export function generarClaveCache(url?: string, params?: Record<string, unknown> | null): string {
  if (!url) return '';
  let queryStr = '';
  if (params && typeof params === 'object') {
    const keys = Object.keys(params).sort();
    const searchParams = new URLSearchParams();
    for (const k of keys) {
      const val = params[k];
      if (val !== undefined && val !== null) {
        searchParams.set(k, String(val));
      }
    }
    queryStr = searchParams.toString();
  }
  const separador = url.includes('?') ? '&' : '?';
  const urlCompleta = queryStr ? `${url}${separador}${queryStr}` : url;
  return `${PREFIJO_CACHE}${urlCompleta}`;
}

/**
 * Guarda un elemento individual en localStorage de forma segura.
 */
function guardarItemCrudo<T = unknown>(clave: string, data: T, timestamp: number): void {
  const item: ItemCache<T> = { data, timestamp };
  try {
    localStorage.setItem(clave, JSON.stringify(item));
  } catch {
    try {
      purgarCachesAntiguos();
      localStorage.setItem(clave, JSON.stringify(item));
    } catch {
      // Ignorar si la cuota no permite guardar
    }
  }
}

/**
 * Guarda la respuesta en localStorage y pre-indexa automáticamente
 * elementos secundarios (miembros individuales, entregas por usuario, plantillas)
 * para que estén disponibles sin conexión sin necesidad de abrirlos uno por uno.
 */
export function guardarEnCache<T = unknown>(
  url?: string,
  params?: Record<string, unknown> | null,
  data?: T,
): void {
  if (!url || data === undefined || data === null) return;
  const clave = generarClaveCache(url, params);
  const now = Date.now();

  // Guardar la consulta principal
  guardarItemCrudo(clave, data, now);

  // 1. Si guardamos la lista de miembros (/miembros), pre-indexar cada miembro por su ID individual
  if (url.includes('/miembros') && typeof data === 'object') {
    const items = (data as any)?.items;
    if (Array.isArray(items)) {
      for (const m of items) {
        if (m?.id) {
          const claveIndividual = `${PREFIJO_CACHE}/miembros/${m.id}`;
          guardarItemCrudo(claveIndividual, m, now);
        }
      }
    }
  }

  // 2. Si guardamos la lista de entregas (/legajos/entregas), pre-indexar por cada usuarioId
  if (url.includes('/legajos/entregas') && Array.isArray(data)) {
    const entregasPorUsuario: Record<number, any[]> = {};
    for (const ent of data) {
      if (ent?.usuarioId) {
        if (!entregasPorUsuario[ent.usuarioId]) {
          entregasPorUsuario[ent.usuarioId] = [];
        }
        entregasPorUsuario[ent.usuarioId].push(ent);
      }
    }
    for (const usuarioId of Object.keys(entregasPorUsuario)) {
      const claveEntregas = `${PREFIJO_CACHE}/legajos/entregas?usuarioId=${usuarioId}`;
      guardarItemCrudo(claveEntregas, entregasPorUsuario[Number(usuarioId)], now);
    }
  }

  // 3. Si guardamos plantillas de fichas (/legajos/plantillas), pre-indexar cada plantilla por su ID
  if (url.includes('/legajos/plantillas') && Array.isArray(data)) {
    for (const p of data) {
      if (p?.id) {
        const clavePlantilla = `${PREFIJO_CACHE}/legajos/plantillas/${p.id}`;
        guardarItemCrudo(clavePlantilla, p, now);
      }
    }
  }
}

/**
 * Obtiene la respuesta guardada en localStorage.
 * Si no encuentra la clave exacta, realiza una búsqueda inteligente de respaldo:
 * - Para /miembros/:id busca el miembro dentro de la lista de miembros guardada.
 * - Para /legajos/entregas?usuarioId=:id busca las entregas del usuario en la lista de entregas guardada.
 * - Para /legajos/plantillas/:id busca la plantilla en la lista de plantillas guardada.
 * - Para /tesoreria/estado-cuenta/:id genera el estado de cuenta sintético desde el miembro guardado.
 */
export function obtenerDeCache<T = unknown>(
  url?: string,
  params?: Record<string, unknown> | null,
): ItemCache<T> | null {
  if (!url) return null;
  const clave = generarClaveCache(url, params);

  // 1. Intento directo por clave exacta
  try {
    const raw = localStorage.getItem(clave);
    if (raw) {
      return JSON.parse(raw) as ItemCache<T>;
    }
  } catch {
    // Continuar al fallback inteligente
  }

  // 2. Búsqueda inteligente de respaldo (Fallback por entidad)
  return resolverFallbackInteligente<T>(url, params);
}

/**
 * Resuelve peticiones individuales a partir de listas cacheadas globales.
 */
function resolverFallbackInteligente<T>(
  url: string,
  params?: Record<string, unknown> | null,
): ItemCache<T> | null {
  try {
    // Fallback: /miembros/:id
    const matchMiembro = url.match(/\/miembros\/(\d+)(?:\?|$)/);
    if (matchMiembro) {
      const id = Number(matchMiembro[1]);
      const listaMiembros = buscarListaEnCache<{ items?: any[] }>('/miembros');
      if (listaMiembros?.data?.items) {
        const m = listaMiembros.data.items.find((item: any) => item.id === id);
        if (m) {
          return { data: m as T, timestamp: listaMiembros.timestamp };
        }
      }
    }

    // Fallback: /legajos/entregas?usuarioId=:id
    if (url.includes('/legajos/entregas')) {
      const paramUsuarioId = params?.usuarioId || extraerParametroUrl(url, 'usuarioId');
      if (paramUsuarioId) {
        const usuarioId = Number(paramUsuarioId);
        const listaEntregas = buscarListaEnCache<any[]>('/legajos/entregas');
        if (Array.isArray(listaEntregas?.data)) {
          const entregasDelUsuario = listaEntregas.data.filter((e: any) => e.usuarioId === usuarioId);
          return { data: entregasDelUsuario as T, timestamp: listaEntregas.timestamp };
        }
      }
    }

    // Fallback: /legajos/plantillas/:id
    const matchPlantilla = url.match(/\/legajos\/plantillas\/(\d+)(?:\?|$)/);
    if (matchPlantilla) {
      const id = Number(matchPlantilla[1]);
      const listaPlantillas = buscarListaEnCache<any[]>('/legajos/plantillas');
      if (Array.isArray(listaPlantillas?.data)) {
        const p = listaPlantillas.data.find((item: any) => item.id === id);
        if (p) {
          return { data: p as T, timestamp: listaPlantillas.timestamp };
        }
      }
    }

    // Fallback: /legajos/plantillas (lista completa)
    if (url.includes('/legajos/plantillas') && !url.match(/\/legajos\/plantillas\/\d+/)) {
      const listaPlantillas = buscarListaEnCache<any[]>('/legajos/plantillas');
      if (Array.isArray(listaPlantillas?.data) && listaPlantillas.data.length > 0) {
        return { data: listaPlantillas.data as T, timestamp: listaPlantillas.timestamp };
      }
    }

    // Fallback: /auth/me
    if (url.includes('/auth/me')) {
      const authUserRaw = localStorage.getItem('scout_user');
      const authAsignacionesRaw = localStorage.getItem('scout_asignaciones');
      if (authUserRaw) {
        try {
          const usuario = JSON.parse(authUserRaw);
          const asignaciones = authAsignacionesRaw ? JSON.parse(authAsignacionesRaw) : [];
          return {
            data: {
              usuario,
              asignaciones,
              accessToken: localStorage.getItem('scout_token') || '',
            } as T,
            timestamp: Date.now(),
          };
        } catch {
          // Continuar
        }
      }
    }

    // Fallback: /legajos/miembro/:usuarioId/plantilla/:plantillaId/precarga
    const matchPrecarga = url.match(/\/legajos\/miembro\/(\d+)\/plantilla\/(\d+)\/precarga/);
    if (matchPrecarga) {
      const usuarioId = Number(matchPrecarga[1]);
      const plantillaId = Number(matchPrecarga[2]);

      let usuarioPrecarga: any = null;
      const cachedMiembro = resolverFallbackInteligente<any>(`/miembros/${usuarioId}`);
      if (cachedMiembro?.data) {
        usuarioPrecarga = cachedMiembro.data;
      } else {
        const rawUser = localStorage.getItem('scout_user');
        if (rawUser) {
          try {
            const parsed = JSON.parse(rawUser);
            if (parsed.id === usuarioId || !usuarioId) usuarioPrecarga = parsed;
          } catch {
            // Ignorar
          }
        }
      }

      let plantillaPrecarga: any = null;
      const cachedPlantilla = resolverFallbackInteligente<any>(`/legajos/plantillas/${plantillaId}`);
      if (cachedPlantilla?.data) {
        plantillaPrecarga = cachedPlantilla.data;
      } else {
        const listaPlantillas = buscarListaEnCache<any[]>('/legajos/plantillas');
        if (Array.isArray(listaPlantillas?.data)) {
          plantillaPrecarga =
            listaPlantillas.data.find((p: any) => p.id === plantillaId) || listaPlantillas.data[0];
        }
      }

      let entregaPrecarga: any = null;
      const cachedEntregas = resolverFallbackInteligente<any[]>(`/legajos/entregas?usuarioId=${usuarioId}`);
      if (Array.isArray(cachedEntregas?.data) && cachedEntregas.data.length > 0) {
        entregaPrecarga = cachedEntregas.data[cachedEntregas.data.length - 1];
      }

      if (usuarioPrecarga || plantillaPrecarga) {
        const precargaData = {
          usuario: usuarioPrecarga || {},
          plantilla: plantillaPrecarga || {},
          ultimaEntrega: entregaPrecarga,
          datosFamiliaresSugeridos: {},
        };
        return { data: precargaData as T, timestamp: Date.now() };
      }
    }

    // Fallback: /tesoreria/estado-cuenta/:id
    const matchCuenta = url.match(/\/tesoreria\/estado-cuenta\/(\d+)(?:\?|$)/);
    if (matchCuenta) {
      const id = Number(matchCuenta[1]);
      const listaMiembros = buscarListaEnCache<{ items?: any[] }>('/miembros');
      if (listaMiembros?.data?.items) {
        const m = listaMiembros.data.items.find((item: any) => item.id === id);
        if (m) {
          const cuentaSintetica = {
            usuarioId: id,
            cargos: m.cargos || [],
            saldoAFavor: m.saldoAFavor || 0,
            movimientos: [],
            totalDeuda: 0,
          };
          return { data: cuentaSintetica as T, timestamp: listaMiembros.timestamp };
        }
      }
    }

    // Fallback: /tesoreria/cuentas/:id/libro-diario
    const matchLibro = url.match(/\/tesoreria\/cuentas\/(\d+)\/libro-diario/);
    if (matchLibro) {
      const cId = Number(matchLibro[1]);
      const cachedLibro = buscarListaEnCache<any>(`/tesoreria/cuentas/${cId}/libro-diario`);
      if (cachedLibro?.data) {
        return cachedLibro as ItemCache<T>;
      }
    }

    // Fallback: /tesoreria/cuentas
    if (url.includes('/tesoreria/cuentas') && !url.match(/\/tesoreria\/cuentas\/\d+/)) {
      const listaCuentas = buscarListaEnCache<any[]>('/tesoreria/cuentas');
      if (Array.isArray(listaCuentas?.data) && listaCuentas.data.length > 0) {
        return listaCuentas as ItemCache<T>;
      }
    }

    // Fallback: /tesoreria/gastos
    if (url.includes('/tesoreria/gastos')) {
      const listaGastos = buscarListaEnCache<any[]>('/tesoreria/gastos');
      if (Array.isArray(listaGastos?.data)) {
        let items = listaGastos.data;
        const cuentaId = params?.cuentaId || extraerParametroUrl(url, 'cuentaId');
        const rubroId = params?.rubroId || extraerParametroUrl(url, 'rubroId');
        const incluirAnulados = (params?.incluirAnulados || extraerParametroUrl(url, 'incluirAnulados')) === 'true';

        if (cuentaId && cuentaId !== 'TODAS') {
          items = items.filter((g: any) => g.cuentaId === Number(cuentaId));
        }
        if (rubroId && rubroId !== 'TODOS') {
          items = items.filter((g: any) => g.rubroId === Number(rubroId));
        }
        if (!incluirAnulados) {
          items = items.filter((g: any) => !g.anulado);
        }
        return { data: items as T, timestamp: listaGastos.timestamp };
      }
    }

    // Fallback: /tesoreria/rubros
    if (url.includes('/tesoreria/rubros')) {
      const listaRubros = buscarListaEnCache<any[]>('/tesoreria/rubros');
      if (Array.isArray(listaRubros?.data)) {
        const tipo = params?.tipo || extraerParametroUrl(url, 'tipo');
        let items = listaRubros.data;
        if (tipo) {
          items = items.filter((r: any) => r.tipo === tipo);
        }
        return { data: items as T, timestamp: listaRubros.timestamp };
      }
    }

    // Fallback: /tesoreria/cuadro-resultados
    if (url.includes('/tesoreria/cuadro-resultados')) {
      const balance = buscarListaEnCache<any>('/tesoreria/cuadro-resultados');
      if (balance?.data) {
        return balance as ItemCache<T>;
      }
    }

    // Fallback: /tesoreria/eventos/:id
    const matchEvento = url.match(/\/tesoreria\/eventos\/(\d+)(?:\?|$)/);
    if (matchEvento) {
      const evId = Number(matchEvento[1]);
      const listaEventos = buscarListaEnCache<any[]>('/tesoreria/eventos');
      if (Array.isArray(listaEventos?.data)) {
        const ev = listaEventos.data.find((e: any) => e.id === evId);
        if (ev) {
          return { data: ev as T, timestamp: listaEventos.timestamp };
        }
      }
    }

    // Fallback: /tesoreria/eventos
    if (url.includes('/tesoreria/eventos') && !url.match(/\/tesoreria\/eventos\/\d+/)) {
      const listaEventos = buscarListaEnCache<any[]>('/tesoreria/eventos');
      if (Array.isArray(listaEventos?.data) && listaEventos.data.length > 0) {
        return listaEventos as ItemCache<T>;
      }
    }

    // Fallback: /tesoreria/planes-mensuales
    if (url.includes('/tesoreria/planes-mensuales')) {
      const listaPlanes = buscarListaEnCache<any[]>('/tesoreria/planes-mensuales');
      if (Array.isArray(listaPlanes?.data) && listaPlanes.data.length > 0) {
        return listaPlanes as ItemCache<T>;
      }
    }

    // Fallback: /tesoreria/conceptos
    if (url.includes('/tesoreria/conceptos')) {
      const listaConceptos = buscarListaEnCache<any[]>('/tesoreria/conceptos');
      if (Array.isArray(listaConceptos?.data) && listaConceptos.data.length > 0) {
        return listaConceptos as ItemCache<T>;
      }
    }

    // Fallback: /tesoreria/familias
    if (url.includes('/tesoreria/familias')) {
      const listaFamilias = buscarListaEnCache<any[]>('/tesoreria/familias');
      if (Array.isArray(listaFamilias?.data) && listaFamilias.data.length > 0) {
        return listaFamilias as ItemCache<T>;
      }
    }
  } catch {
    // Si falla la deserialización, no devolver nada
  }

  return null;
}

/**
 * Busca en localStorage la primera clave que contenga la subcadena y devuelve su ItemCache.
 */
function buscarListaEnCache<D>(subcadena: string): ItemCache<D> | null {
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(PREFIJO_CACHE) && k.includes(subcadena)) {
      try {
        const parsed = JSON.parse(localStorage.getItem(k) || '');
        if (parsed?.data) {
          return parsed as ItemCache<D>;
        }
      } catch {
        continue;
      }
    }
  }
  return null;
}

/**
 * Extrae un parámetro de consulta de una URL si está en formato string.
 */
function extraerParametroUrl(url: string, param: string): string | null {
  try {
    const queryIdx = url.indexOf('?');
    if (queryIdx === -1) return null;
    const searchParams = new URLSearchParams(url.substring(queryIdx));
    return searchParams.get(param);
  } catch {
    return null;
  }
}

/**
 * Devuelve la cantidad de miembros guardados en caché local (para información de la interfaz).
 */
export function contarMiembrosEnCache(): number {
  try {
    const lista = buscarListaEnCache<{ items?: any[] }>('/miembros');
    return lista?.data?.items?.length || 0;
  } catch {
    return 0;
  }
}

/**
 * Devuelve el timestamp más reciente guardado en la caché local.
 */
export function obtenerUltimoTimestampCache(): number | null {
  let maxTimestamp: number | null = null;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIJO_CACHE)) {
        try {
          const item = JSON.parse(localStorage.getItem(k) || '');
          if (item?.timestamp && (maxTimestamp === null || item.timestamp > maxTimestamp)) {
            maxTimestamp = item.timestamp;
          }
        } catch {
          continue;
        }
      }
    }
  } catch {
    // Ignorar si localStorage no está disponible
  }
  return maxTimestamp;
}

/**
 * Elimina todas las entradas de caché de la API (útil al cerrar sesión).
 */
export function limpiarCacheApi(): void {
  try {
    const clavesAEliminar: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIJO_CACHE)) {
        clavesAEliminar.push(k);
      }
    }
    for (const k of clavesAEliminar) {
      localStorage.removeItem(k);
    }
  } catch {
    // Ignorar si localStorage no está disponible
  }
}

/**
 * Elimina las entradas de caché más antiguas en caso de alcanzar la cuota.
 */
function purgarCachesAntiguos(): void {
  const items: { key: string; timestamp: number }[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(PREFIJO_CACHE)) {
      try {
        const parsed = JSON.parse(localStorage.getItem(k) || '{}');
        items.push({ key: k, timestamp: parsed.timestamp || 0 });
      } catch {
        items.push({ key: k, timestamp: 0 });
      }
    }
  }

  // Ordenar por más viejo primero y borrar la mitad
  items.sort((a, b) => a.timestamp - b.timestamp);
  const aBorrar = Math.max(1, Math.floor(items.length / 2));
  for (let i = 0; i < aBorrar && i < items.length; i++) {
    localStorage.removeItem(items[i].key);
  }
}
