import React from 'react';
import { KeyRound } from 'lucide-react';

export interface PestanaSeguridadProps {
  miembro: any;
  reseteandoClave: boolean;
  onResetClave: () => void;
}

export const PestanaSeguridad: React.FC<PestanaSeguridadProps> = ({
  miembro,
  reseteandoClave,
  onResetClave,
}) => {
  return (
    <div className="p-4 rounded-2xl bg-brand/10 border border-brand/30 space-y-3">
      <span className="font-bold text-ink text-sm block">
        ¿Olvidó su contraseña?
      </span>
      <p className="text-ink-2 text-xs">
        Restablece su clave para que vuelva a ser su número de DNI (
        <strong>{miembro?.dni}</strong>).
      </p>
      <button
        type="button"
        onClick={onResetClave}
        disabled={reseteandoClave}
        className="min-h-[44px] px-4 bg-brand hover:opacity-90 active:opacity-100 text-brand-contrast font-bold rounded-xl text-xs inline-flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
      >
        <KeyRound className="w-4 h-4" />
        <span>
          {reseteandoClave ? 'Restableciendo...' : `Volver clave a DNI (${miembro?.dni})`}
        </span>
      </button>
    </div>
  );
};
