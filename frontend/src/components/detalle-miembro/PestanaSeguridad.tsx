import React, { useState } from 'react';
import { Check, Copy, KeyRound, Mail } from 'lucide-react';

export interface PestanaSeguridadProps {
  miembro: any;
  reseteandoClave: boolean;
  claveTemporalGenerada?: string | null;
  onResetClave: (soloPorCorreo?: boolean) => void;
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
    <div className="p-4 sm:p-5 rounded-2xl bg-brand/10 border border-brand/30 space-y-3.5">
      <span className="font-bold text-ink text-base block">
        ¿Olvidó su contraseña?
      </span>
      <p className="text-ink-2 text-sm leading-relaxed">
        Genera una clave temporal aleatoria para{' '}
        <strong>{miembro ? `${miembro.nombre} ${miembro.apellido}` : 'este miembro'}</strong> y
        cierra sus sesiones activas. Al ingresar deberá cambiarla por una personal.
      </p>

      {claveTemporalGenerada && (
        <div className="p-3.5 rounded-xl bg-surface border border-brand/40 flex items-center justify-between gap-2.5">
          <div>
            <span className="block text-xs font-semibold text-ink-muted">
              Nueva clave temporal (se muestra una sola vez):
            </span>
            <code className="text-base font-mono font-extrabold text-ink select-all">
              {claveTemporalGenerada}
            </code>
          </div>
          <button
            type="button"
            onClick={copiarClave}
            className="min-h-[40px] px-3.5 rounded-lg border border-rule bg-paper-2 hover:bg-paper-3 text-ink text-[13px] font-bold inline-flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            {copiada ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
            <span>{copiada ? 'Copiada' : 'Copiar'}</span>
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          onClick={() => onResetClave(false)}
          disabled={reseteandoClave}
          className="min-h-[46px] px-4.5 bg-brand hover:opacity-90 active:opacity-100 text-brand-contrast font-bold rounded-xl text-sm inline-flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
        >
          <KeyRound className="w-4 h-4" />
          <span>
            {reseteandoClave ? 'Generando clave...' : 'Generar clave temporal'}
          </span>
        </button>

        <button
          type="button"
          onClick={() => onResetClave(true)}
          disabled={reseteandoClave || !miembro?.emailContacto}
          title={
            miembro?.emailContacto
              ? `Enviar nueva clave únicamente a ${miembro.emailContacto}`
              : 'El miembro no tiene un correo electrónico registrado'
          }
          className="min-h-[46px] px-4.5 border border-brand/40 bg-surface hover:bg-paper-2 text-ink font-bold rounded-xl text-sm inline-flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Mail className="w-4 h-4 text-brand" />
          <span>Enviar nueva clave solo por correo</span>
        </button>
      </div>

      {miembro?.emailContacto ? (
        <p className="text-xs sm:text-[13px] text-ink-muted">
          Si usás <strong>Enviar nueva clave solo por correo</strong>, la contraseña se enviará a{' '}
          <strong className="text-ink-2">{miembro.emailContacto}</strong> y no se mostrará en
          pantalla.
        </p>
      ) : (
        <p className="text-xs sm:text-[13px] text-ink-muted">
          Este miembro no tiene un email de contacto registrado para envío exclusivo por correo.
        </p>
      )}
    </div>
  );
};
