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
        className="sticky top-0 z-50 h-7 bg-emerald-600 text-white text-[11px] font-semibold px-3 flex items-center justify-center gap-1.5 shadow-xs transition-all duration-300"
      >
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
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
        className="sticky top-0 z-50 h-7 bg-amber-500 text-amber-950 dark:bg-amber-600 dark:text-amber-50 text-[11px] font-medium px-3 flex items-center justify-center gap-1.5 shadow-xs border-b border-amber-600/30"
      >
        <WifiOff className="w-3.5 h-3.5 shrink-0 text-amber-950 dark:text-amber-100" />
        <span className="truncate">
          <strong>Sin conexión:</strong> últimos datos ({textoFecha})
        </span>
      </div>
    );
  }

  return null;
};
