import React, { useState, useRef, useEffect } from 'react';
import { Download, ChevronDown, FileSpreadsheet, FileText, Loader2 } from 'lucide-react';

export interface BotonExportarProps {
  onExportarExcel: () => Promise<void> | void;
  onExportarCSV: () => Promise<void> | void;
  texto?: string;
  tituloTooltip?: string;
  disabled?: boolean;
  className?: string;
  size?: 'sm' | 'md';
}

export const BotonExportar: React.FC<BotonExportarProps> = ({
  onExportarExcel,
  onExportarCSV,
  texto = 'Exportar',
  tituloTooltip = 'Exportar datos como hoja de cálculo',
  disabled = false,
  className = '',
  size = 'sm',
}) => {
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [procesando, setProcesando] = useState<'excel' | 'csv' | null>(null);
  const contenedorRef = useRef<HTMLDivElement>(null);

  // Cierre al presionar tecla Escape o hacer clic afuera
  useEffect(() => {
    if (!menuAbierto) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuAbierto(false);
      }
    };

    const handleClickFuera = (e: MouseEvent) => {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) {
        setMenuAbierto(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickFuera);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickFuera);
    };
  }, [menuAbierto]);

  const handleDescargar = async (tipo: 'excel' | 'csv') => {
    try {
      setProcesando(tipo);
      setMenuAbierto(false);
      if (tipo === 'excel') {
        await onExportarExcel();
      } else {
        await onExportarCSV();
      }
    } finally {
      setProcesando(null);
    }
  };

  const padClasses =
    size === 'sm'
      ? 'min-h-[38px] px-3.5 py-2 text-[13px] gap-1.5 rounded-xl'
      : 'min-h-[44px] px-4.5 py-2.5 text-sm gap-2 rounded-xl';

  return (
    <div ref={contenedorRef} className="relative inline-block text-left">
      <button
        type="button"
        disabled={disabled || procesando !== null}
        onClick={() => setMenuAbierto(!menuAbierto)}
        aria-haspopup="menu"
        aria-expanded={menuAbierto}
        title={tituloTooltip}
        className={`inline-flex items-center justify-center font-bold bg-surface text-ink border border-rule hover:bg-paper-2 active:bg-paper-3 transition cursor-pointer select-none disabled:opacity-50 disabled:pointer-events-none ${padClasses} ${className}`}
      >
        {procesando ? (
          <Loader2 className="w-4 h-4 animate-spin text-brand shrink-0" />
        ) : (
          <Download className="w-4 h-4 text-brand shrink-0" />
        )}
        <span>{procesando ? 'Generando...' : texto}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-ink-muted transition-transform ${
            menuAbierto ? 'rotate-180' : ''
          }`}
        />
      </button>

      {menuAbierto && (
        <div
          role="menu"
          aria-orientation="vertical"
          className="absolute right-0 top-full mt-1.5 z-40 w-64 bg-surface border border-rule rounded-2xl shadow-lg p-1.5 motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-reduce:animate-none"
        >
          <div className="px-3 py-2 border-b border-rule/50 mb-1">
            <span className="text-xs font-bold text-ink-muted uppercase tracking-wider block">
              Elegir formato de descarga
            </span>
          </div>

          <button
            type="button"
            role="menuitem"
            onClick={() => handleDescargar('excel')}
            className="w-full min-h-[44px] px-3 py-2 rounded-xl flex items-center gap-3 text-sm font-semibold text-ink hover:bg-paper-2 text-left cursor-pointer transition-colors"
          >
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 flex items-center justify-center shrink-0">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="font-bold block text-ink">Excel (.xlsx)</span>
              <span className="text-xs text-ink-muted block truncate">
                Hoja de cálculo nativa
              </span>
            </div>
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => handleDescargar('csv')}
            className="w-full min-h-[44px] px-3 py-2 rounded-xl flex items-center gap-3 text-sm font-semibold text-ink hover:bg-paper-2 text-left cursor-pointer transition-colors"
          >
            <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-800 dark:bg-blue-950/70 dark:text-blue-300 flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="font-bold block text-ink">CSV (.csv)</span>
              <span className="text-xs text-ink-muted block truncate">
                Separado por punto y coma (UTF-8)
              </span>
            </div>
          </button>
        </div>
      )}
    </div>
  );
};
