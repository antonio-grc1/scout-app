import { useQuery, type QueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import { obtenerMisCampamentos } from '../services/campamentos.service';

export function useMisCampamentos() {
  const usuarioId = useAuthStore((s) => s.usuario?.id);
  const autenticado = useAuthStore((s) => s.autenticado);
  const requiereCambioClave = useAuthStore((s) => s.requiereCambioClave);

  return useQuery({
    queryKey: ['campamentos-mios', usuarioId],
    enabled: Boolean(autenticado && !requiereCambioClave && usuarioId),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    queryFn: () => obtenerMisCampamentos(),
  });
}

export function useCampamentosPendientesCount(): number {
  const { data } = useMisCampamentos();
  if (!data) return 0;
  return data.filter(
    (c) =>
      c.estadoInscripcion === 'PENDIENTE' &&
      c.campamento.estado === 'PUBLICADO' &&
      !c.limiteVencido,
  ).length;
}

const CAMPAMENTOS_PREFIXES = new Set([
  'campamentos-mios',
  'campamentos-gestion',
  'campamentos-detalle',
  'inicio-personal',
  'avisos-no-leidos',
  'avisos-bandeja',
  'avisos-enviados',
  'avisos-lecturas',
]);

export function invalidarCampamentosQueries(queryClient: QueryClient) {
  return queryClient.invalidateQueries({
    predicate: (q) => CAMPAMENTOS_PREFIXES.has(String(q.queryKey[0])),
  });
}
