import React from 'react';
import { BellOff, BellRing, Info, Loader2, Smartphone } from 'lucide-react';
import { useCapabilities } from '../../core/capabilities';
import { useAlertasPush } from '../../hooks/useAlertasPush';
import { useConfirmar } from '../../hooks/useConfirmar';

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
  const push = useAlertasPush();
  const { pedir: pedirConfirmacion, dialogo: dialogoConfirmacion } = useConfirmar();

  const handleDesactivar = () => {
    pedirConfirmacion(
      {
        titulo: '¿Desactivar las alertas?',
        mensaje:
          'Vas a dejar de recibir en este dispositivo los avisos del grupo: cambios de horario, salidas, campamentos y urgencias.',
        impacto: 'Los avisos van a seguir apareciendo en la app, pero solo te vas a enterar cuando la abras.',
        textoConfirmar: 'Sí, desactivar',
        peligroso: true,
      },
      push.desactivar,
    );
  };

  if (push.cargando) return null;

  if (!push.pushHabilitado) {
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

  if (push.iosSinInstalar) {
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

  if (!push.soportado) return null;

  if (push.permiso === 'denied') {
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

  if (push.suscripto) {
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
          onClick={handleDesactivar}
          disabled={push.procesando}
          className="s-btn-sec px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer disabled:opacity-60"
        >
          {push.procesando ? 'Procesando…' : 'Desactivar'}
        </button>
        {dialogoConfirmacion}
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
        onClick={() => void push.activar()}
        disabled={push.procesando}
        className="s-btn-brand min-h-[38px] px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 shrink-0 cursor-pointer disabled:opacity-60"
      >
        {push.procesando ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <BellRing className="w-3.5 h-3.5" />
        )}
        <span>{push.procesando ? 'Activando…' : 'Activar alertas'}</span>
      </button>
    </div>
  );
};
