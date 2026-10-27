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
    'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/70 dark:text-emerald-300 dark:border-emerald-800',
  Madre:
    'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-950/70 dark:text-purple-300 dark:border-purple-800',
  Padre:
    'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/70 dark:text-blue-300 dark:border-blue-800',
  'Tutor/a':
    'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/70 dark:text-amber-300 dark:border-amber-800',
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
          'min-h-[42px] min-w-[42px] px-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 text-slate-600 dark:text-slate-300 hover:text-emerald-600 flex items-center justify-center gap-1 transition ml-auto cursor-pointer'
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
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-slate-900 border-t sm:border border-slate-200 dark:border-slate-800 rounded-t-3xl sm:rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
            >
              <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
                    <Phone className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-sm font-extrabold text-slate-900 dark:text-slate-100 truncate">
                      ¿A quién querés llamar?
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      Contactos de {miembro?.nombre} {miembro?.apellido}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setAbierto(false)}
                  className="min-w-[36px] min-h-[36px] rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-3.5 space-y-2.5 max-h-[70vh] overflow-y-auto">
                {telefonos.map((item, idx) => {
                  const badgeClase =
                    BADGE_POR_ETIQUETA[item.etiqueta] ||
                    'bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700';

                  return (
                    <a
                      key={`${item.etiqueta}-${idx}`}
                      href={`tel:${item.telefono}`}
                      onClick={() => setAbierto(false)}
                      className="w-full min-h-[58px] p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/70 dark:bg-slate-800/60 hover:border-emerald-400 dark:hover:border-emerald-700 hover:bg-emerald-50/60 dark:hover:bg-emerald-950/30 flex items-center justify-between gap-3 transition"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider border ${badgeClase}`}
                          >
                            {item.etiqueta}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-sm font-extrabold text-slate-900 dark:text-slate-100 truncate">
                          <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">{item.nombre || `${miembro?.nombre} ${miembro?.apellido}`}</span>
                        </div>
                        <span className="text-xs font-mono font-semibold text-slate-600 dark:text-slate-400 block">
                          {item.telefono}
                        </span>
                      </div>
                      <div className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center gap-1.5 shrink-0 shadow-xs">
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
