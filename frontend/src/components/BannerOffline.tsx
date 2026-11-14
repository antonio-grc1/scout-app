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
        className="s-badge-ok sticky top-0 z-50 min-h-[30px] text-xs font-semibold px-3 py-1 flex items-center justify-center gap-1.5 border-x-0 border-t-0"
      >
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">¡Conexión restablecida! El sistema está sincronizado.</span>
      </div>
    );
  }

  if (!isOnline || isUsingCache) {
    const timestampEfectivo = lastCachedAt || obtenerUltimoTimestampCache();
    const textoFecha = timestampEfectivo
      ? formatearFechaHora(new Date(timestampEfectivo).toISOString())
      : formatearFechaHora(new Date().toISOString());

    return (
      <div
        role="status"
        aria-live="polite"
        className="s-badge-warn sticky top-0 z-50 min-h-[30px] text-xs font-medium px-3 py-1 flex items-center justify-center gap-1.5 border-x-0 border-t-0"
      >
        <WifiOff className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">
          <strong>Sin conexión:</strong> últimos datos ({textoFecha}). Lectura offline activa.
        </span>
      </div>
    );
  }

  return null;
};
