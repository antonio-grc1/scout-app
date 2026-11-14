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

const PREFIJO_SYNC_CAMPAMENTO = 'scout_campamento_sync_';

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

useAuthStore.subscribe((state) => {
  if (!state.token) {
    limpiarSyncCampamento();
  }
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
  const [resPlantillas, resUnidades, resRamas] = await Promise.all([
    api.get('/legajos/plantillas').catch(() => ({ data: [] })),
    api.get('/organizacion/unidades').catch(() => ({ data: [] })),
    api.get('/organizacion/ramas').catch(() => ({ data: [] })),
    api.get('/pases/candidatos').catch(() => ({ data: [] })),
  ]);

  const plantillas: any[] = Array.isArray(resPlantillas.data) ? resPlantillas.data : [];
  if (plantillas.length > 0) {
    guardarEnCache('/legajos/plantillas', undefined, plantillas);
  }
  if (Array.isArray(resUnidades.data) && resUnidades.data.length > 0) {
    guardarEnCache('/organizacion/unidades', undefined, resUnidades.data);
  }
  if (Array.isArray(resRamas.data) && resRamas.data.length > 0) {
    guardarEnCache('/organizacion/ramas', undefined, resRamas.data);
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
