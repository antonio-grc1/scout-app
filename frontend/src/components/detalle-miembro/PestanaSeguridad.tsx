import React, { useState } from 'react';
import { Check, Copy, KeyRound } from 'lucide-react';

export interface PestanaSeguridadProps {
  miembro: any;
  reseteandoClave: boolean;
  claveTemporalGenerada?: string | null;
  onResetClave: () => void;
}

export const PestanaSeguridad: React.FC<PestanaSeguridadProps> = ({
  miembro,
  reseteandoClave,
  claveTemporalGenerada,
  onResetClave,
}) => {
  const [copiada, setCopiada] = useState(false);

  const copiarClave = async () => {
    if (!claveTemporalGenerada) return;
    try {
      await navigator.clipboard.writeText(claveTemporalGenerada);
      setCopiada(true);
      setTimeout(() => setCopiada(false), 2000);
    } catch {
      // Clipboard no disponible
    }
  };

  return (
    <div className="p-4 rounded-2xl bg-brand/10 border border-brand/30 space-y-3">
      <span className="font-bold text-ink text-sm block">
        ¿Olvidó su contraseña?
      </span>
      <p className="text-ink-2 text-xs">
        Genera una clave temporal aleatoria para{' '}
        <strong>{miembro ? `${miembro.nombre} ${miembro.apellido}` : 'este miembro'}</strong> y
        cierra sus sesiones activas. Al ingresar deberá cambiarla por una personal.
      </p>

      {claveTemporalGenerada && (
        <div className="p-3 rounded-xl bg-surface border border-brand/40 flex items-center justify-between gap-2">
          <div>
            <span className="block text-[11px] font-semibold text-ink-muted">
              Nueva clave temporal (se muestra una sola vez):
            </span>
            <code className="text-sm font-mono font-extrabold text-ink select-all">
              {claveTemporalGenerada}
            </code>
          </div>
          <button
            type="button"
            onClick={copiarClave}
            className="min-h-[36px] px-3 rounded-lg border border-rule bg-paper-2 hover:bg-paper-3 text-ink text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            {copiada ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiada ? 'Copiada' : 'Copiar'}</span>
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={onResetClave}
        disabled={reseteandoClave}
        className="min-h-[44px] px-4 bg-brand hover:opacity-90 active:opacity-100 text-brand-contrast font-bold rounded-xl text-xs inline-flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
      >
        <KeyRound className="w-4 h-4" />
        <span>
          {reseteandoClave ? 'Generando clave...' : 'Generar clave temporal'}
        </span>
      </button>
    </div>
  );
};
