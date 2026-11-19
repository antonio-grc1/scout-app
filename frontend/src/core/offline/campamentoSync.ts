import { api } from '../../api/client';
import { obtenerCicloAnioActual } from '../../lib/formatters';
import { guardarEnCache } from '../../lib/offlineCache';
import { useAuthStore } from '../../store/authStore';

export interface CampamentoSyncResumen {
  sincronizadoEn: number;
  totalMiembros: number;
  totalEntregas: number;
  totalPlantillas: number;
}

export interface SincronizarCampamentoOpciones {
  usuarioId?: number | null;
  onProgreso?: (mensaje: string, porcentaje: number) => void;
}

export interface BorradorLegajoLocal {
  clave: string;
  ownerUserId: number;
  usuarioId: number;
  plantillaId: number;
  cicloAnio: number;
  respuestas: Record<string, unknown>;
  actualizadoEn: number;
  estadoSync: 'PENDIENTE_SINCRONIZAR';
}

const PREFIJO_SYNC_CAMPAMENTO = 'scout_campamento_sync_';
const IDB_CAMPAMENTO_NAME = 'scout_campamento_db';
const IDB_CAMPAMENTO_VERSION = 1;
const IDB_BORRADORES_STORE = 'legajo_borradores';

const borradoresMemoria = new Map<string, BorradorLegajoLocal>();
let idbCampamentoPromise: Promise<IDBDatabase | null> | null = null;

function abrirCampamentoIDB(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (idbCampamentoPromise) return idbCampamentoPromise;

  idbCampamentoPromise = new Promise<IDBDatabase | null>((resolve) => {
    try {
      const req = indexedDB.open(IDB_CAMPAMENTO_NAME, IDB_CAMPAMENTO_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_BORRADORES_STORE)) {
          db.createObjectStore(IDB_BORRADORES_STORE, { keyPath: 'clave' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return idbCampamentoPromise;
}

async function putBorradorIDB(borrador: BorradorLegajoLocal): Promise<void> {
  const db = await abrirCampamentoIDB();
  if (!db) return;
  try {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(IDB_BORRADORES_STORE, 'readwrite');
      tx.objectStore(IDB_BORRADORES_STORE).put(borrador);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } catch {
    // Ignorar errores de cuota o entorno restringido
  }
}

async function getBorradorIDB(clave: string): Promise<BorradorLegajoLocal | null> {
  const db = await abrirCampamentoIDB();
  if (!db) return null;
  try {
    return await new Promise<BorradorLegajoLocal | null>((resolve) => {
      const tx = db.transaction(IDB_BORRADORES_STORE, 'readonly');
      const req = tx.objectStore(IDB_BORRADORES_STORE).get(clave);
      req.onsuccess = () => resolve((req.result as BorradorLegajoLocal | undefined) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function getAllBorradoresIDB(): Promise<BorradorLegajoLocal[]> {
  const db = await abrirCampamentoIDB();
  if (!db) return [];
  try {
    return await new Promise<BorradorLegajoLocal[]>((resolve) => {
      const tx = db.transaction(IDB_BORRADORES_STORE, 'readonly');
      const req = tx.objectStore(IDB_BORRADORES_STORE).getAll();
      req.onsuccess = () =>
        resolve(Array.isArray(req.result) ? (req.result as BorradorLegajoLocal[]) : []);
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

async function deleteBorradorIDB(clave: string): Promise<void> {
  const db = await abrirCampamentoIDB();
  if (!db) return;
  try {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(IDB_BORRADORES_STORE, 'readwrite');
      tx.objectStore(IDB_BORRADORES_STORE).delete(clave);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } catch {
    // Ignorar
  }
}

async function clearBorradoresIDB(): Promise<void> {
  const db = await abrirCampamentoIDB();
  if (!db) return;
  try {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(IDB_BORRADORES_STORE, 'readwrite');
      tx.objectStore(IDB_BORRADORES_STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } catch {
    // Ignorar
  }
}

function resolverOwnerUserId(ownerUserId?: number | null): number {
  const resolved = ownerUserId ?? useAuthStore.getState().usuario?.id ?? 0;
  return Number.isFinite(resolved) && resolved > 0 ? Number(resolved) : 0;
}

export function generarClaveBorradorLegajo(params: {
  ownerUserId?: number | null;
  usuarioId: number;
  plantillaId: number;
  cicloAnio: number;
}): string {
  const owner = resolverOwnerUserId(params.ownerUserId);
  return `${owner}:${params.usuarioId}:${params.plantillaId}:${params.cicloAnio}`;
}

export async function guardarBorradorLegajoLocal(input: {
  ownerUserId?: number | null;
  usuarioId: number;
  plantillaId: number;
  cicloAnio: number;
  respuestas: Record<string, unknown>;
}): Promise<BorradorLegajoLocal> {
  const owner = resolverOwnerUserId(input.ownerUserId);
  const clave = generarClaveBorradorLegajo({
    ownerUserId: owner,
    usuarioId: input.usuarioId,
    plantillaId: input.plantillaId,
    cicloAnio: input.cicloAnio,
  });

  const borrador: BorradorLegajoLocal = {
    clave,
    ownerUserId: owner,
    usuarioId: input.usuarioId,
    plantillaId: input.plantillaId,
    cicloAnio: input.cicloAnio,
    respuestas: { ...input.respuestas },
    actualizadoEn: Date.now(),
    estadoSync: 'PENDIENTE_SINCRONIZAR',
  };

  borradoresMemoria.set(clave, borrador);
  await putBorradorIDB(borrador);
  return borrador;
}

export async function obtenerBorradorLegajoLocal(params: {
  ownerUserId?: number | null;
  usuarioId: number;
  plantillaId: number;
  cicloAnio: number;
}): Promise<BorradorLegajoLocal | null> {
  const clave = generarClaveBorradorLegajo(params);
  const mem = borradoresMemoria.get(clave);
  if (mem) return mem;

  const idbItem = await getBorradorIDB(clave);
  if (idbItem) {
    borradoresMemoria.set(clave, idbItem);
    return idbItem;
  }
  return null;
}

export async function listarBorradoresLegajoLocales(
  ownerUserId?: number | null,
): Promise<BorradorLegajoLocal[]> {
  const owner = resolverOwnerUserId(ownerUserId);
  const idbItems = await getAllBorradoresIDB();
  for (const item of idbItems) {
    const existing = borradoresMemoria.get(item.clave);
    if (!existing || item.actualizadoEn >= existing.actualizadoEn) {
      borradoresMemoria.set(item.clave, item);
    }
  }

  return Array.from(borradoresMemoria.values())
    .filter((b) => (owner === 0 ? true : b.ownerUserId === owner))
    .sort((a, b) => b.actualizadoEn - a.actualizadoEn);
}

export async function eliminarBorradorLegajoLocal(params: {
  ownerUserId?: number | null;
  usuarioId: number;
  plantillaId: number;
  cicloAnio: number;
}): Promise<void> {
  const clave = generarClaveBorradorLegajo(params);
  borradoresMemoria.delete(clave);
  await deleteBorradorIDB(clave);
}

export async function limpiarBorradoresLegajoLocales(): Promise<void> {
  borradoresMemoria.clear();
  await clearBorradoresIDB();
}

export async function sincronizarBorradoresLegajoLocales(
  ownerUserId?: number | null,
): Promise<{ sincronizados: number; fallidos: number }> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('Sin conexión a internet para sincronizar los borradores.');
  }

  const pendientes = await listarBorradoresLegajoLocales(ownerUserId);
  let sincronizados = 0;
  let fallidos = 0;

  for (const b of pendientes) {
    try {
      await api.post('/legajos/entregas', {
        usuarioId: b.usuarioId,
        plantillaId: b.plantillaId,
        cicloAnio: b.cicloAnio,
        respuestas: b.respuestas,
        finalizarParaFirma: false,
        actualizarDatosFijos: true,
      });
      await eliminarBorradorLegajoLocal({
        ownerUserId: b.ownerUserId,
        usuarioId: b.usuarioId,
        plantillaId: b.plantillaId,
        cicloAnio: b.cicloAnio,
      });
      sincronizados += 1;
    } catch {
      fallidos += 1;
    }
  }

  return { sincronizados, fallidos };
}

export function obtenerClaveSyncCampamento(usuarioId?: number | null): string {
  const idResuelto = usuarioId ?? useAuthStore.getState().usuario?.id ?? 'anon';
  return `${PREFIJO_SYNC_CAMPAMENTO}${idResuelto}`;
}

export function obtenerUltimoSyncCampamento(
  usuarioId?: number | null,
): CampamentoSyncResumen | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(obtenerClaveSyncCampamento(usuarioId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CampamentoSyncResumen>;
    if (typeof parsed.sincronizadoEn !== 'number' || !Number.isFinite(parsed.sincronizadoEn)) {
      return null;
    }
    return {
      sincronizadoEn: parsed.sincronizadoEn,
      totalMiembros: Number(parsed.totalMiembros || 0),
      totalEntregas: Number(parsed.totalEntregas || 0),
      totalPlantillas: Number(parsed.totalPlantillas || 0),
    };
  } catch {
    return null;
  }
}

export function limpiarSyncCampamento(usuarioId?: number | null): void {
  if (typeof localStorage === 'undefined') return;
  try {
    if (usuarioId !== undefined) {
      localStorage.removeItem(obtenerClaveSyncCampamento(usuarioId));
      return;
    }
    const claves: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIJO_SYNC_CAMPAMENTO)) {
        claves.push(k);
      }
    }
    for (const k of claves) {
      localStorage.removeItem(k);
    }
  } catch {
    // Ignorar si localStorage no está disponible
  }
}

export async function purgarCampamentoOffline(): Promise<void> {
  limpiarSyncCampamento();
  await limpiarBorradoresLegajoLocales();
}

let ultimoUsuarioCampamentoId = useAuthStore.getState().usuario?.id ?? null;
useAuthStore.subscribe((state) => {
  const nextId = state.usuario?.id ?? null;
  if (!state.autenticado || (ultimoUsuarioCampamentoId !== null && nextId !== ultimoUsuarioCampamentoId)) {
    void purgarCampamentoOffline();
  }
  ultimoUsuarioCampamentoId = nextId;
});

async function descargarTodosLosMiembros(): Promise<any[]> {
  const porPagina = 200;
  const primera = await api.get(`/miembros?pagina=1&porPagina=${porPagina}&incluirInactivos=true`);
  const primerosItems: any[] = Array.isArray(primera.data?.items) ? primera.data.items : [];
  const total = Number(primera.data?.total ?? primerosItems.length);
  const totalPaginas = Math.ceil(total / porPagina);

  if (totalPaginas <= 1) {
    return primerosItems;
  }

  const resto = await Promise.all(
    Array.from({ length: totalPaginas - 1 }, (_, idx) =>
      api.get(`/miembros?pagina=${idx + 2}&porPagina=${porPagina}&incluirInactivos=true`),
    ),
  );

  const acumulados = [...primerosItems];
  for (const res of resto) {
    if (Array.isArray(res.data?.items)) {
      acumulados.push(...res.data.items);
    }
  }
  return acumulados;
}

export async function sincronizarParaCampamento(
  opciones: SincronizarCampamentoOpciones = {},
): Promise<CampamentoSyncResumen> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error(
      'Necesitás conexión a internet para descargar los datos antes del campamento.',
    );
  }

  const { usuarioId, onProgreso } = opciones;
  const ciclo = obtenerCicloAnioActual();

  onProgreso?.('Descargando padrón de miembros…', 15);
  const todosLosMiembros = await descargarTodosLosMiembros();
  guardarEnCache('/miembros', undefined, {
    items: todosLosMiembros,
    total: todosLosMiembros.length,
  });

  onProgreso?.('Descargando fichas médicas y legajos…', 55);
  const resEntregas = await api
    .get(`/legajos/entregas?cicloAnio=${ciclo}`)
    .catch(() => ({ data: [] }));
  const entregas: any[] = Array.isArray(resEntregas.data) ? resEntregas.data : [];
  if (entregas.length > 0) {
    guardarEnCache('/legajos/entregas', undefined, entregas);
  }

  onProgreso?.('Descargando plantillas y organización…', 80);
  const [resPlantillas, resPlantillasCiclo, resUnidades, resRamas, resCandidatos] =
    await Promise.all([
      api.get('/legajos/plantillas').catch(() => ({ data: [] })),
      api.get(`/legajos/plantillas?cicloAnio=${ciclo}`).catch(() => ({ data: [] })),
      api.get('/organizacion/unidades').catch(() => ({ data: [] })),
      api.get('/organizacion/ramas').catch(() => ({ data: [] })),
      api.get('/pases/candidatos').catch(() => ({ data: [] })),
    ]);

  const plantillasTodas: any[] = Array.isArray(resPlantillas.data) ? resPlantillas.data : [];
  const plantillasCiclo: any[] = Array.isArray(resPlantillasCiclo.data)
    ? resPlantillasCiclo.data
    : [];
  const plantillas = plantillasTodas.length > 0 ? plantillasTodas : plantillasCiclo;
  if (plantillas.length > 0) {
    guardarEnCache('/legajos/plantillas', undefined, plantillas);
    guardarEnCache(`/legajos/plantillas?cicloAnio=${ciclo}`, undefined, plantillasCiclo.length > 0 ? plantillasCiclo : plantillas);
  }
  if (Array.isArray(resUnidades.data) && resUnidades.data.length > 0) {
    guardarEnCache('/organizacion/unidades', undefined, resUnidades.data);
  }
  if (Array.isArray(resRamas.data) && resRamas.data.length > 0) {
    guardarEnCache('/organizacion/ramas', undefined, resRamas.data);
  }
  if (Array.isArray(resCandidatos.data)) {
    guardarEnCache('/pases/candidatos', undefined, resCandidatos.data);
  }

  const resumen: CampamentoSyncResumen = {
    sincronizadoEn: Date.now(),
    totalMiembros: todosLosMiembros.length,
    totalEntregas: entregas.length,
    totalPlantillas: plantillas.length,
  };

  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(obtenerClaveSyncCampamento(usuarioId), JSON.stringify(resumen));
    }
  } catch {
    // Ignorar errores de cuota al guardar metadata de sincronización
  }

  onProgreso?.('Datos listos para usar sin señal', 100);
  return resumen;
}
