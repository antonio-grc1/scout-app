import React from 'react';
import {
  AlertTriangle,
  HelpCircle,
  CheckCircle2,
  AlertCircle,
  X,
  Loader2,
} from 'lucide-react';

export interface ModalConfirmacionProps {
  abierto: boolean;
  onCerrar: () => void;
  onConfirmar?: () => void | Promise<void>;
  titulo: string;
  mensaje: string | React.ReactNode;
  tipo?: 'peligro' | 'confirmacion' | 'alerta' | 'exito' | 'info';
  textoConfirmar?: string;
  textoCancelar?: string | null;
  cargando?: boolean;
}

export const ModalConfirmacion: React.FC<ModalConfirmacionProps> = ({
  abierto,
  onCerrar,
  onConfirmar,
  titulo,
  mensaje,
  tipo = 'confirmacion',
  textoConfirmar = 'Aceptar',
  textoCancelar = 'Cancelar',
  cargando = false,
}) => {
  if (!abierto) return null;

  const esAlertaSimple = textoCancelar === null || textoCancelar === undefined;

  const getIcono = () => {
    switch (tipo) {
      case 'peligro':
        return (
          <div className="w-12 h-12 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-6 h-6" />
          </div>
        );
      case 'exito':
        return (
          <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        );
      case 'alerta':
        return (
          <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <AlertCircle className="w-6 h-6" />
          </div>
        );
      case 'info':
        return (
          <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <AlertCircle className="w-6 h-6" />
          </div>
        );
      case 'confirmacion':
      default:
        return (
          <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <HelpCircle className="w-6 h-6" />
          </div>
        );
    }
  };

  const getBotonConfirmarClase = () => {
    if (tipo === 'peligro') {
      return 'bg-rose-600 hover:bg-rose-700 text-white focus:ring-rose-500';
    }
    if (tipo === 'alerta') {
      return 'bg-amber-600 hover:bg-amber-700 text-white focus:ring-amber-500';
    }
    return 'bg-emerald-600 hover:bg-emerald-700 text-white focus:ring-emerald-500';
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-150">
      <div
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden transition-colors"
        role="dialog"
        aria-modal="true"
      >
        <div className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              {getIcono()}
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 leading-snug">
                  {titulo}
                </h3>
              </div>
            </div>
            {!cargando && (
              <button
                type="button"
                onClick={onCerrar}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          <div className="mt-4 text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line">
            {mensaje}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
            {!esAlertaSimple && (
              <button
                type="button"
                disabled={cargando}
                onClick={onCerrar}
                className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs transition cursor-pointer disabled:opacity-50"
              >
                {textoCancelar}
              </button>
            )}

            <button
              type="button"
              disabled={cargando}
              onClick={async () => {
                if (onConfirmar) {
                  await onConfirmar();
                } else {
                  onCerrar();
                }
              }}
              className={`flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl font-semibold text-xs transition shadow-xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 ${getBotonConfirmarClase()}`}
            >
              {cargando && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{textoConfirmar}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
