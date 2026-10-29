import React from 'react';
import {
  AlertTriangle,
  HelpCircle,
  CheckCircle2,
  AlertCircle,
  X,
} from 'lucide-react';
import { Button } from './ui/Button';

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
          <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-400 flex items-center justify-center shrink-0">
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
          <div className="w-12 h-12 rounded-full bg-brand/15 text-brand flex items-center justify-center shrink-0">
            <HelpCircle className="w-6 h-6" />
          </div>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 overflow-y-auto motion-safe:animate-in motion-safe:fade-in motion-reduce:animate-none">
      <div
        className="bg-surface border border-rule rounded-2xl w-full max-w-md shadow-md overflow-hidden transition-colors"
        role="dialog"
        aria-modal="true"
      >
        <div className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              {getIcono()}
              <div>
                <h3 className="text-lg font-bold text-ink leading-snug">
                  {titulo}
                </h3>
              </div>
            </div>
            {!cargando && (
              <button
                type="button"
                onClick={onCerrar}
                className="text-ink-muted hover:text-ink transition-colors p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          <div className="mt-4 text-sm text-ink-2 leading-relaxed whitespace-pre-line">
            {mensaje}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
            {!esAlertaSimple && (
              <Button
                type="button"
                disabled={cargando}
                variant="secondary"
                size="md"
                onClick={onCerrar}
              >
                {textoCancelar}
              </Button>
            )}

            <Button
              type="button"
              disabled={cargando}
              loading={cargando}
              variant={tipo === 'peligro' ? 'danger' : 'primary'}
              size="md"
              onClick={async () => {
                if (onConfirmar) {
                  await onConfirmar();
                } else {
                  onCerrar();
                }
              }}
            >
              <span>{textoConfirmar}</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
