import React, { useState } from 'react';
import { Phone, X } from 'lucide-react';
import { extraerTelefonosMiembro } from '../lib/formatters';

interface Props {
  miembro: any;
  entrega?: any;
  className?: string;
}

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
        title="Elegir teléfono para llamar"
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

      {abierto && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            setAbierto(false);
          }}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-slate-900 border-t sm:border border-slate-200 dark:border-slate-800 rounded-t-3xl sm:rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden"
          >
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
                  <Phone className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-xs font-extrabold text-slate-900 dark:text-slate-100 truncate">
                    Llamar a Contacto
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    {miembro?.apellido}, {miembro?.nombre}
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

            <div className="p-3 space-y-2">
              {telefonos.map((item, idx) => (
                <a
                  key={`${item.etiqueta}-${idx}`}
                  href={`tel:${item.telefono}`}
                  onClick={() => setAbierto(false)}
                  className="w-full min-h-[52px] p-3 rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/70 dark:bg-slate-800/60 hover:border-emerald-400 dark:hover:border-emerald-700 hover:bg-emerald-50/60 dark:hover:bg-emerald-950/30 flex items-center justify-between gap-3 transition"
                >
                  <div className="min-w-0">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 block">
                      {item.etiqueta}
                    </span>
                    {item.nombre && (
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate block">
                        {item.nombre}
                      </span>
                    )}
                    <span className="text-xs font-mono text-slate-500 dark:text-slate-400 block">
                      {item.telefono}
                    </span>
                  </div>
                  <div className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold flex items-center gap-1.5 shrink-0">
                    <Phone className="w-3.5 h-3.5" />
                    <span>Llamar</span>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
