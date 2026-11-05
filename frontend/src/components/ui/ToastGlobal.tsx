import React, { useEffect, useState } from 'react';
import { useToastStore } from '../../store/toastStore';
import { RotateCcw, X, CheckCircle2, AlertTriangle, AlertCircle, Info } from 'lucide-react';

export const ToastGlobal: React.FC = () => {
  const { toast, cerrarToast, ejecutarAccion } = useToastStore();
  const [ejecutando, setEjecutando] = useState(false);
  const [progreso, setProgreso] = useState(100);

  useEffect(() => {
    if (!toast) {
      setProgreso(100);
      setEjecutando(false);
      return;
    }

    const duracion = toast.duracionMs || 4000;
    const inicio = toast.creadoEn || Date.now();
    setProgreso(100);

    const intervalo = setInterval(() => {
      const tiempoPasado = Date.now() - inicio;
      const restante = Math.max(0, 100 - (tiempoPasado / duracion) * 100);
      setProgreso(restante);
      if (restante <= 0) {
        clearInterval(intervalo);
      }
    }, 40);

    return () => clearInterval(intervalo);
  }, [toast?.id, toast?.duracionMs, toast?.creadoEn]);

  if (!toast) return null;

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

  return (
    <div
      className="fixed bottom-20 sm:bottom-6 inset-x-0 mx-auto max-w-md z-50 px-4 pointer-events-none motion-safe:animate-in motion-safe:slide-in-from-bottom-5 motion-safe:fade-in duration-200"
      role="status"
      aria-live="polite"
    >
      <div className="pointer-events-auto relative overflow-hidden rounded-2xl bg-surface/95 dark:bg-zinc-900/95 backdrop-blur-md border border-rule shadow-2xl text-ink transition-colors">
        <div className="p-3.5 sm:p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="p-1.5 rounded-xl bg-paper-2 shrink-0">
              {getIcono()}
            </div>
            <span className="text-xs sm:text-sm font-semibold leading-snug line-clamp-2">
              {toast.texto}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {toast.accion && (
              <button
                type="button"
                onClick={handleAccion}
                disabled={ejecutando}
                className="px-3 py-1.5 rounded-xl bg-brand text-brand-contrast text-xs font-bold hover:brightness-110 active:scale-95 transition-all shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                <RotateCcw className={`w-3.5 h-3.5 ${ejecutando ? 'animate-spin' : ''}`} />
                <span>{ejecutando ? 'Deshaciendo...' : toast.accion.label || 'Deshacer'}</span>
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

        {/* Barra de progreso de tiempo restante */}
        <div className="h-1 w-full bg-paper-2">
          <div
            className={`h-full transition-all duration-75 ease-linear ${
              toast.accion
                ? 'bg-brand'
                : toast.tipo === 'error'
                ? 'bg-rose-500'
                : toast.tipo === 'advertencia'
                ? 'bg-amber-500'
                : 'bg-emerald-500'
            }`}
            style={{ width: `${progreso}%` }}
          />
        </div>
      </div>
    </div>
  );
};
