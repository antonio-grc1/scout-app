import React, { useState, useMemo } from 'react';
import { History, ChevronDown, Calendar, Clock } from 'lucide-react';
import type { AsignacionHistorial } from '../../types/miembro';
import { obtenerConfigRama } from '../../lib/ramaColors';

export interface TrayectoriaMiembroProps {
  asignaciones?: AsignacionHistorial[];
}

function formatearFecha(fechaStr?: string | null): string {
  if (!fechaStr) return '';
  try {
    const d = new Date(fechaStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'UTC',
    });
  } catch {
    return '';
  }
}

export const TrayectoriaMiembro: React.FC<TrayectoriaMiembroProps> = ({ asignaciones = [] }) => {
  const [abierto, setAbierto] = useState(true);

  const historial = useMemo(() => {
    return [...(asignaciones || [])].sort((a, b) => {
      // Asignaciones activas primero
      if (a.activo !== b.activo) {
        return a.activo ? -1 : 1;
      }
      const fechaA = new Date(a.fechaInicio).getTime();
      const fechaB = new Date(b.fechaInicio).getTime();
      if (fechaB !== fechaA) return fechaB - fechaA;
      return (b.id ?? 0) - (a.id ?? 0);
    });
  }, [asignaciones]);

  const totalEtapas = historial.length;

  return (
    <div className="rounded-2xl border border-rule bg-paper-2 overflow-hidden transition-colors">
      <button
        type="button"
        onClick={() => setAbierto((prev) => !prev)}
        aria-expanded={abierto}
        className="w-full p-3.5 sm:p-4 flex items-center justify-between text-left bg-surface hover:bg-paper-3/50 transition-colors cursor-pointer select-none"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <History className="w-4 h-4 text-brand shrink-0" />
          <span className="font-extrabold text-ink text-xs sm:text-sm">
            Trayectoria en el Grupo
          </span>
          <span className="px-2 py-0.5 rounded-full bg-brand/15 text-brand font-bold text-[10px]">
            {totalEtapas} {totalEtapas === 1 ? 'asignación' : 'asignaciones'}
          </span>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-ink-muted transition-transform duration-200 shrink-0 ${
            abierto ? 'rotate-180 text-brand' : ''
          }`}
        />
      </button>

      {abierto && (
        <div className="p-3.5 sm:p-4 pt-2 border-t border-rule">
          {totalEtapas === 0 ? (
            <div className="p-6 text-center rounded-xl bg-surface border border-rule/60 text-ink-muted flex flex-col items-center justify-center gap-2">
              <Clock className="w-7 h-7 text-ink-muted/70" />
              <p className="text-xs font-semibold">Sin historial de asignaciones registrado.</p>
            </div>
          ) : (
            <div className="relative border-l-2 border-rule ml-3.5 sm:ml-4 my-2 pl-4 sm:pl-6 space-y-4">
              {historial.map((asig) => {
                const cfgRama = obtenerConfigRama({ asignaciones: [asig] });
                const esInactivaUnidad = asig.unidad?.activa === false;
                const esInactivaRama = Boolean(asig.unidad?.rama && asig.unidad.rama.activa === false);
                const tieneBajaEstructural = esInactivaUnidad || esInactivaRama;

                const fInicio = formatearFecha(asig.fechaInicio);
                const fFin = asig.activo
                  ? 'Actualidad'
                  : asig.fechaFin
                    ? formatearFecha(asig.fechaFin)
                    : null;

                const textoRango = fFin
                  ? `${fInicio || '—'} – ${fFin} • Ciclo ${asig.cicloAnio}`
                  : fInicio
                    ? `Desde ${fInicio} • Ciclo ${asig.cicloAnio}`
                    : `Ciclo ${asig.cicloAnio}`;

                return (
                  <div key={asig.id} className="relative">
                    {/* Indicador de nodo en la línea de tiempo */}
                    {asig.activo ? (
                      <span
                        aria-hidden="true"
                        className="w-3.5 h-3.5 rounded-full bg-emerald-500 ring-4 ring-emerald-100 dark:ring-emerald-950/60 -left-[21px] sm:-left-[23px] absolute top-1.5"
                      />
                    ) : (
                      <span
                        aria-hidden="true"
                        className="w-3 h-3 rounded-full bg-paper-3 border-2 border-rule -left-[20px] sm:-left-[22px] absolute top-1.5"
                      />
                    )}

                    {/* Tarjeta de la asignación */}
                    <div
                      className={`p-3 rounded-xl bg-surface border border-rule/80 shadow-xs space-y-1.5 transition-opacity ${
                        tieneBajaEstructural ? 'opacity-75' : ''
                      }`}
                    >
                      {/* Fila de Insignias / Badges */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        {/* Rama */}
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold text-[10px] border ${cfgRama.badgeClases}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${cfgRama.dotColor}`} />
                          {asig.unidad?.rama?.nombre || cfgRama.nombre}
                        </span>

                        {/* Rol */}
                        {asig.rol?.nombre && (
                          <span className="text-[10px] font-semibold text-ink-2 bg-paper-2 px-2 py-0.5 rounded-full border border-rule">
                            {asig.rol.nombre}
                          </span>
                        )}

                        {/* Estado */}
                        {asig.activo ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-[10px] font-extrabold">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Actual
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-paper-3 text-ink-muted border border-rule text-[10px] font-semibold">
                            Finalizada
                          </span>
                        )}

                        {/* Indicadores de inactividad de unidad o rama */}
                        {esInactivaUnidad && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                            Sección inactiva
                          </span>
                        )}

                        {esInactivaRama && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                            Rama inactiva
                          </span>
                        )}
                      </div>

                      {/* Nombre de la unidad */}
                      <h4 className="text-xs sm:text-sm font-bold text-ink">
                        {asig.unidad?.nombre || 'Sin Sección'}
                      </h4>

                      {/* Fechas y Ciclo */}
                      <div className="flex items-center gap-1.5 text-[11px] text-ink-muted">
                        <Calendar className="w-3.5 h-3.5 shrink-0" />
                        <span>{textoRango}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
