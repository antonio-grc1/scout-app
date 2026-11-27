import React, { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { BellOff, BellRing, Info, Loader2, Smartphone } from 'lucide-react';
import { useCapabilities } from '../../core/capabilities';
import { invalidarAvisosQueries, useCanalesAvisosEstado } from '../../hooks/useAvisos';
import { traducirErrorAmigable } from '../../lib/formatters';
import {
  activarPushEnDispositivo,
  desactivarPushEnDispositivo,
  esIosSinInstalar,
  obtenerSuscripcionPushActual,
  soportaWebPush,
} from '../../lib/webPush';
import { desuscribirPushAviso, suscribirPushAviso } from '../../services/avisos.service';
import { useToastStore } from '../../store/toastStore';

interface BannerActivarPushProps {
  variante?: 'banner' | 'compacto';
  /** Solo en Mi perfil: muestra el botón para desactivar las alertas ya activas. */
  permitirDesactivar?: boolean;
}

export const BannerActivarPush: React.FC<BannerActivarPushProps> = ({
  variante = 'banner',
  permitirDesactivar = false,
}) => {
  const caps = useCapabilities();
  const queryClient = useQueryClient();
  const mostrarToast = useToastStore((s) => s.mostrarToast);
  const { data: canales, isLoading: cargandoCanales } = useCanalesAvisosEstado();

  const [suscriptoLocal, setSuscriptoLocal] = useState(false);
  const [verificadoLocal, setVerificadoLocal] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [permisoActual, setPermisoActual] = useState<NotificationPermission>(() =>
    typeof Notification !== 'undefined' ? Notification.permission : 'default',
  );

  const soportado = soportaWebPush();
  const iosSinInstalar = esIosSinInstalar();

  const refrescarEstadoLocal = useCallback(async () => {
    if (!soportado) {
      setVerificadoLocal(true);
      return;
    }
    try {
      const sub = await obtenerSuscripcionPushActual();
      setSuscriptoLocal(Boolean(sub));
      if (typeof Notification !== 'undefined') {
        setPermisoActual(Notification.permission);
      }
    } catch {
      setSuscriptoLocal(false);
    } finally {
      setVerificadoLocal(true);
    }
  }, [soportado]);

  useEffect(() => {
    void refrescarEstadoLocal();
  }, [refrescarEstadoLocal]);

  const handleActivar = async () => {
    if (!canales?.pushPublicKey || procesando) return;
    setProcesando(true);
    try {
      const payload = await activarPushEnDispositivo(canales.pushPublicKey);
      await suscribirPushAviso(payload);
      await refrescarEstadoLocal();
      await invalidarAvisosQueries(queryClient);
      mostrarToast('Alertas push activadas en este dispositivo.', 'exito');
    } catch (err) {
      if (typeof Notification !== 'undefined') {
        setPermisoActual(Notification.permission);
      }
      mostrarToast(
        traducirErrorAmigable(err, 'No se pudieron activar las notificaciones en este dispositivo.'),
        'error',
      );
    } finally {
      setProcesando(false);
    }
  };

  const handleDesactivar = async () => {
    if (procesando) return;
    setProcesando(true);
    try {
      const endpoint = await desactivarPushEnDispositivo();
      if (endpoint) {
        await desuscribirPushAviso(endpoint);
      }
      await refrescarEstadoLocal();
      await invalidarAvisosQueries(queryClient);
      mostrarToast('Alertas push desactivadas en este dispositivo.', 'info');
    } catch (err) {
      mostrarToast(
        traducirErrorAmigable(err, 'No se pudieron desactivar las notificaciones.'),
        'error',
      );
    } finally {
      setProcesando(false);
    }
  };

  if (cargandoCanales || !canales) return null;

  if (!canales.pushHabilitado) {
    if (variante === 'banner' && (caps.canEditOrganizacion || caps.canSendAvisosGlobales)) {
      return (
        <div className="s-panel rounded-2xl px-4 py-3 flex items-start gap-2.5 text-xs text-ink-muted">
          <Info className="w-4 h-4 text-brand shrink-0 mt-0.5" />
          <span>
            Las alertas push en celulares están desactivadas porque faltan las claves{' '}
            <code>VAPID_PUBLIC_KEY</code> y <code>VAPID_PRIVATE_KEY</code> en el servidor.
          </span>
        </div>
      );
    }
    return null;
  }

  if (iosSinInstalar) {
    return (
      <div
        className={`s-panel rounded-2xl ${variante === 'compacto' ? 'p-3 text-xs' : 'p-4 text-sm'} flex items-start gap-2.5`}
      >
        <Smartphone className="w-4 h-4 text-brand shrink-0 mt-0.5" />
        <span className="text-ink-2">
          En iPhone/iPad, tocá <strong>Compartir → Agregar a inicio</strong> y abrí la app desde tu pantalla para recibir alertas push.
        </span>
      </div>
    );
  }

  if (!soportado || !verificadoLocal) return null;

  if (permisoActual === 'denied') {
    return (
      <div
        className={`s-badge-warn rounded-2xl ${variante === 'compacto' ? 'p-3 text-xs' : 'p-4 text-sm'} flex items-start gap-2.5`}
      >
        <BellOff className="w-4 h-4 shrink-0 mt-0.5" />
        <span>
          Bloqueaste las notificaciones en este navegador. Habilitalas desde la configuración del sitio para recibir avisos en tu dispositivo.
        </span>
      </div>
    );
  }

  if (suscriptoLocal) {
    if (!permitirDesactivar) return null;
    return (
      <div
        className={`s-panel rounded-2xl ${variante === 'compacto' ? 'px-3 py-2.5' : 'px-4 py-3'} flex items-center justify-between gap-3 flex-wrap`}
      >
        <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-ink-2">
          <BellRing className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>Alertas push activas en este dispositivo</span>
        </div>
        <button
          type="button"
          onClick={() => void handleDesactivar()}
          disabled={procesando}
          className="s-btn-sec px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer disabled:opacity-60"
        >
          {procesando ? 'Procesando…' : 'Desactivar'}
        </button>
      </div>
    );
  }

  return (
    <div
      className={`s-panel rounded-2xl border border-brand/35 bg-brand-soft/15 ${variante === 'compacto' ? 'p-3' : 'p-4'} flex flex-col sm:flex-row sm:items-center justify-between gap-3`}
    >
      <div className="flex items-start gap-2.5 min-w-0">
        <BellRing className="w-4 h-4 text-brand shrink-0 mt-0.5" />
        <div className="min-w-0">
          <div className="text-xs sm:text-sm font-extrabold text-ink">
            Recibí avisos en tu celular o navegador
          </div>
          {variante === 'banner' && (
            <p className="text-xs text-ink-muted mt-0.5">
              Activá las notificaciones push para enterarte al instante aunque la app esté cerrada.
            </p>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => void handleActivar()}
        disabled={procesando}
        className="s-btn-brand min-h-[38px] px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 shrink-0 cursor-pointer disabled:opacity-60"
      >
        {procesando ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <BellRing className="w-3.5 h-3.5" />
        )}
        <span>{procesando ? 'Activando…' : 'Activar alertas'}</span>
      </button>
    </div>
  );
};
