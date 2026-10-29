import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Phone, X, User } from 'lucide-react';
import { extraerTelefonosMiembro } from '../lib/formatters';

interface Props {
  miembro: any;
  entrega?: any;
  className?: string;
}

const BADGE_POR_ETIQUETA: Record<string, string> = {
  Miembro:
    'bg-brand/15 text-brand border-brand/30',
  Madre:
    'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-950/70 dark:text-purple-300 dark:border-purple-800',
  Padre:
    'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/70 dark:text-blue-300 dark:border-blue-800',
  'Tutor/a':
    'bg-paper-2 text-ink border-rule',
  Emergencia:
    'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950/70 dark:text-rose-300 dark:border-rose-800',
};

export const BotonLlamarMiembro: React.FC<Props> = ({ miembro, entrega, className }) => {
  const [abierto, setAbierto] = useState(false);
  const telefonos = extraerTelefonosMiembro(miembro, entrega);

  if (telefonos.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setAbierto(true);
        }}
        title="Elegir a quién llamar"
        className={
          className ||
          'min-h-[42px] min-w-[42px] px-2.5 rounded-xl bg-paper-2 hover:bg-brand/10 text-ink-2 hover:text-brand flex items-center justify-center gap-1 transition-colors ml-auto cursor-pointer'
        }
      >
        <Phone className="w-4 h-4" />
        {telefonos.length > 1 && (
          <span className="text-[10px] font-extrabold">{telefonos.length}</span>
        )}
      </button>

      {abierto &&
        createPortal(
          <div
            onClick={(e) => {
              e.stopPropagation();
              setAbierto(false);
            }}
            className="fixed inset-0 z-[100] bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4 motion-safe:animate-in motion-safe:fade-in motion-reduce:animate-none"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-surface border-t sm:border border-rule rounded-t-3xl sm:rounded-2xl w-full max-w-md shadow-2xl overflow-hidden text-ink"
            >
              <div className="p-4 border-b border-rule flex items-center justify-between bg-paper-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-brand/15 text-brand flex items-center justify-center shrink-0">
                    <Phone className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-sm font-extrabold text-ink truncate">
                      ¿A quién querés llamar?
                    </h4>
                    <p className="text-xs text-ink-muted truncate">
                      Contactos de {miembro?.nombre} {miembro?.apellido}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setAbierto(false)}
                  className="min-w-[36px] min-h-[36px] rounded-xl flex items-center justify-center text-ink-muted hover:text-ink hover:bg-paper-2 transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-3.5 space-y-2.5 max-h-[70vh] overflow-y-auto">
                {telefonos.map((item, idx) => {
                  const badgeClase =
                    BADGE_POR_ETIQUETA[item.etiqueta] ||
                    'bg-paper-2 text-ink border-rule';

                  return (
                    <a
                      key={`${item.etiqueta}-${idx}`}
                      href={`tel:${item.telefono}`}
                      onClick={() => setAbierto(false)}
                      className="w-full min-h-[58px] p-3.5 rounded-2xl border border-rule bg-paper-2 hover:border-brand hover:bg-brand/10 flex items-center justify-between gap-3 transition-colors"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border ${badgeClase}`}
                          >
                            {item.etiqueta}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-sm font-extrabold text-ink truncate">
                          <User className="w-3.5 h-3.5 text-ink-muted shrink-0" />
                          <span className="truncate">{item.nombre || `${miembro?.nombre} ${miembro?.apellido}`}</span>
                        </div>
                        <span className="text-xs font-mono font-semibold text-ink-muted block">
                          {item.telefono}
                        </span>
                      </div>
                      <div className="px-3.5 py-2 rounded-xl bg-brand hover:opacity-90 active:opacity-100 text-brand-contrast text-xs font-bold flex items-center gap-1.5 shrink-0 shadow-xs transition-colors">
                        <Phone className="w-3.5 h-3.5" />
                        <span>Llamar</span>
                      </div>
                    </a>
                  );
                })}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
};
