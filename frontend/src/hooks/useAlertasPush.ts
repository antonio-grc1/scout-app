import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { invalidarAvisosQueries, useCanalesAvisosEstado } from './useAvisos';
import { traducirErrorAmigable } from '../lib/formatters';
import {
  activarPushEnDispositivo,
  desactivarPushEnDispositivo,
  esIosSinInstalar,
  obtenerSuscripcionPushActual,
  soportaWebPush,
} from '../lib/webPush';
import { desuscribirPushAviso, suscribirPushAviso } from '../services/avisos.service';
import { useToastStore } from '../store/toastStore';

const QUERY_SUSCRIPCION_LOCAL = ['push-suscripcion-local'] as const;

/**
 * Estado y acciones de las alertas push de este dispositivo. La suscripción local vive en
 * React Query para que el banner de Avisos, la campana, Mi perfil y la invitación al entrar
 * se enteren todos juntos cuando se activa o desactiva desde cualquiera de ellos.
 */
export function useAlertasPush() {
  const queryClient = useQueryClient();
  const mostrarToast = useToastStore((s) => s.mostrarToast);
  const { data: canales, isLoading: cargandoCanales } = useCanalesAvisosEstado();
  const [procesando, setProcesando] = useState(false);

  const soportado = soportaWebPush();
  const iosSinInstalar = esIosSinInstalar();

  const suscripcionQuery = useQuery({
    queryKey: QUERY_SUSCRIPCION_LOCAL,
    enabled: soportado,
    staleTime: Infinity,
    queryFn: async () => {
      try {
        return Boolean(await obtenerSuscripcionPushActual());
      } catch {
        return false;
      }
    },
  });

  const refrescar = async () => {
    await queryClient.invalidateQueries({ queryKey: QUERY_SUSCRIPCION_LOCAL });
    await invalidarAvisosQueries(queryClient);
  };

  const activar = async (): Promise<boolean> => {
    if (!canales?.pushPublicKey || procesando) return false;
    setProcesando(true);
    try {
      const payload = await activarPushEnDispositivo(canales.pushPublicKey);
      await suscribirPushAviso(payload);
      mostrarToast('Alertas push activadas en este dispositivo.', 'exito');
      return true;
    } catch (err) {
      mostrarToast(
        traducirErrorAmigable(err, 'No se pudieron activar las notificaciones en este dispositivo.'),
        'error',
      );
      return false;
    } finally {
      await refrescar();
      setProcesando(false);
    }
  };

  const desactivar = async () => {
    if (procesando) return;
    setProcesando(true);
    try {
      const endpoint = await desactivarPushEnDispositivo();
      if (endpoint) {
        await desuscribirPushAviso(endpoint);
      }
      mostrarToast('Alertas push desactivadas en este dispositivo.', 'info');
    } catch (err) {
      mostrarToast(
        traducirErrorAmigable(err, 'No se pudieron desactivar las notificaciones.'),
        'error',
      );
    } finally {
      await refrescar();
      setProcesando(false);
    }
  };

  const permiso: NotificationPermission =
    typeof Notification !== 'undefined' ? Notification.permission : 'default';

  return {
    /** Datos del servidor todavía cargando: no mostrar nada aún. */
    cargando: cargandoCanales || !canales || (soportado && suscripcionQuery.isLoading),
    pushHabilitado: Boolean(canales?.pushHabilitado),
    soportado,
    iosSinInstalar,
    permiso,
    suscripto: Boolean(suscripcionQuery.data),
    procesando,
    activar,
    desactivar,
  };
}
