import React, { useState } from 'react';
import { useToastStore } from '../../store/toastStore';
import { RotateCcw, X, CheckCircle2, AlertTriangle, AlertCircle, Info } from 'lucide-react';

export const ToastGlobal: React.FC = () => {
  const { toast, cerrarToast, ejecutarAccion } = useToastStore();
  const [ejecutando, setEjecutando] = useState(false);

  if (!toast) return null;

  const duracion = toast.duracionMs || 4000;

  const handleAccion = async () => {
    setEjecutando(true);
    try {
      await ejecutarAccion();
    } finally {
      setEjecutando(false);
    }
  };

  const getIcono = () => {
    if (toast.accion) {
      return <RotateCcw className="w-4 h-4 text-brand shrink-0" />;
    }
    switch (toast.tipo) {
      case 'exito':
        return <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />;
      case 'error':
        return <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />;
      case 'advertencia':
        return <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />;
      case 'info':
      default:
        return <Info className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />;
    }
  };

  const borderToneClass =
    toast.tipo === 'error'
      ? 'border-[var(--s-err-border)]'
      : toast.tipo === 'advertencia'
        ? 'border-[var(--s-warn-border)]'
        : 'border-brand/70';

  const barToneClass = toast.accion
    ? 'bg-brand'
    : toast.tipo === 'error'
      ? 'bg-rose-500'
      : toast.tipo === 'advertencia'
        ? 'bg-amber-500'
        : 'bg-emerald-500';

  return (
    <div
      key={toast.id}
      className="s-anim-toast-in fixed bottom-22 md:bottom-5 left-3 right-3 sm:left-auto sm:right-5 sm:w-full sm:max-w-sm z-50 pointer-events-none"
      role="status"
      aria-live="polite"
    >
      <div
        className={`pointer-events-auto relative overflow-hidden rounded-xl bg-surface text-ink border shadow-xl ${borderToneClass}`}
      >
        <div className="p-3.5 sm:p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-8 h-8 rounded-lg bg-paper-2 flex items-center justify-center shrink-0">
              {getIcono()}
            </div>
            <span className="text-sm font-semibold leading-snug line-clamp-2">
              {toast.texto}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {toast.accion && (
              <button
                type="button"
                onClick={handleAccion}
                disabled={ejecutando}
                className="s-btn-brand px-3 py-1.5 rounded-lg text-[13px] font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                <RotateCcw className={`w-3.5 h-3.5 ${ejecutando ? 'animate-spin' : ''}`} />
                <span>{ejecutando ? 'Deshaciendo…' : toast.accion.label || 'Deshacer'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={cerrarToast}
              className="p-1.5 rounded-lg text-ink-muted hover:text-ink hover:bg-paper-2 transition-colors cursor-pointer"
              aria-label="Cerrar notificación"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="h-1 w-full bg-paper-2 overflow-hidden">
          <div
            className={`h-full w-full s-toast-progress ${barToneClass}`}
            style={{ animationDuration: `${duracion}ms` }}
          />
        </div>
      </div>
    </div>
  );
};
