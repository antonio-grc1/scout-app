import React from 'react';
import { useOfflineStore } from '../store/offlineStore';
import { formatearFechaHora } from '../lib/formatters';
import { obtenerUltimoTimestampCache } from '../lib/offlineCache';
import { WifiOff, CheckCircle2 } from 'lucide-react';

export const BannerOffline: React.FC = () => {
  const {
    isOnline,
    isUsingCache,
    lastCachedAt,
    conexionRestablecida,
  } = useOfflineStore();

  if (conexionRestablecida) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="s-badge-ok min-h-[36px] text-[13px] font-semibold px-4 py-1.5 flex items-center justify-center gap-2 border-x-0 border-t-0"
      >
        <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span className="truncate">¡Conexión restablecida! El sistema está sincronizado.</span>
      </div>
    );
  }

  if (!isOnline || isUsingCache) {
    const timestampEfectivo = lastCachedAt || obtenerUltimoTimestampCache();
    const textoFecha = timestampEfectivo
      ? formatearFechaHora(new Date(timestampEfectivo).toISOString())
      : null;

    return (
      <div
        role="status"
        aria-live="polite"
        className="s-badge-warn min-h-[36px] text-[13px] font-medium px-4 py-1.5 flex items-center justify-center gap-2 border-x-0 border-t-0"
      >
        <WifiOff className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span className="truncate">
          <strong>Sin conexión:</strong> mostrando los últimos datos guardados{textoFecha ? ` (${textoFecha})` : ''}.
        </span>
      </div>
    );
  }

  return null;
};
