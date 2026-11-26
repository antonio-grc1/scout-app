import { useQuery, type QueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import {
  obtenerCountNoLeidos,
  obtenerEstadoCanalesAvisos,
} from '../services/avisos.service';

export function useAvisosNoLeidosCount() {
  const usuarioId = useAuthStore((s) => s.usuario?.id);
  const autenticado = useAuthStore((s) => s.autenticado);
  const requiereCambioClave = useAuthStore((s) => s.requiereCambioClave);

  return useQuery({
    queryKey: ['avisos-no-leidos', usuarioId],
    enabled: Boolean(autenticado && !requiereCambioClave && usuarioId),
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const res = await obtenerCountNoLeidos();
      return Number(res?.count ?? 0);
    },
  });
}

export function useCanalesAvisosEstado(enabled = true) {
  const usuarioId = useAuthStore((s) => s.usuario?.id);
  const autenticado = useAuthStore((s) => s.autenticado);
  const requiereCambioClave = useAuthStore((s) => s.requiereCambioClave);

  return useQuery({
    queryKey: ['avisos-canales-estado', usuarioId],
    enabled: Boolean(enabled && autenticado && !requiereCambioClave && usuarioId),
    staleTime: 60_000,
    queryFn: () => obtenerEstadoCanalesAvisos(),
  });
}

const AVISOS_QUERY_PREFIXES = new Set([
  'avisos-no-leidos',
  'avisos-bandeja',
  'avisos-enviados',
  'avisos-lecturas',
  'avisos-canales-estado',
]);

export function invalidarAvisosQueries(queryClient: QueryClient) {
  return queryClient.invalidateQueries({
    predicate: (q) => AVISOS_QUERY_PREFIXES.has(String(q.queryKey[0])),
  });
}
