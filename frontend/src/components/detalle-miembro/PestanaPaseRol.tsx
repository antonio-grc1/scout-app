import React from 'react';
import { Sparkles, ArrowRightLeft } from 'lucide-react';
import { RAMA_COLORS } from '../../lib/ramaColors';

export interface PestanaPaseRolProps {
  candidatoPase: any;
  categoriaDestino: 'RAMA' | 'SIN_RAMA' | 'JEFATURA';
  onCambioCategoria: (cat: 'RAMA' | 'SIN_RAMA' | 'JEFATURA') => void;
  tieneGlobal: () => boolean;
  ramas: any[];
  ramaSeleccionadaId: number | null;
  ramaSeleccionadaObj: any;
  unidadesRamaSeleccionada: any[];
  unidadDestinoId: string;
  setUnidadDestinoId: (id: string) => void;
  rolDestinoId: string;
  setRolDestinoId: (id: string) => void;
  rolesRama: any[];
  rolesSinRama: any[];
  rolesJefatura: any[];
  onSeleccionarRama: (rama: any) => void;
  onEjecutarPase: () => Promise<void>;
  ejecutandoPase: boolean;
  esMismoDestino: boolean;
}

const getRamaColorConfig = (nombreRama: string) => {
  const n = (nombreRama || '').toLowerCase();
  if (n.includes('lobat')) return RAMA_COLORS.lobatos;
  if (n.includes('scout')) return RAMA_COLORS.scout;
  if (n.includes('caminant')) return RAMA_COLORS.caminantes;
  if (n.includes('rover')) return RAMA_COLORS.rover;
  return RAMA_COLORS.otro;
};

export const PestanaPaseRol: React.FC<PestanaPaseRolProps> = ({
  candidatoPase,
  categoriaDestino,
  onCambioCategoria,
  tieneGlobal,
  ramas,
  ramaSeleccionadaId,
  ramaSeleccionadaObj,
  unidadesRamaSeleccionada,
  unidadDestinoId,
  setUnidadDestinoId,
  rolDestinoId,
  setRolDestinoId,
  rolesRama,
  rolesSinRama,
  rolesJefatura,
  onSeleccionarRama,
  onEjecutarPase,
  ejecutandoPase,
  esMismoDestino,
}) => {
  return (
    <div className="space-y-4">
      {candidatoPase && (
        <div className="bg-brand/10 border border-brand/30 p-3.5 rounded-2xl flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-5 h-5 text-brand shrink-0" />
            <div>
              <span className="font-bold text-ink text-xs block">
                Cumplió {candidatoPase.edad} años
              </span>
              <span className="text-[11px] text-ink-2">
                Sugerido:{' '}
                {candidatoPase.tipo === 'PROGRESION'
                  ? `Pasar a ${candidatoPase.ramaSugerida?.nombre}`
                  : 'Pasar a Educador (con rama o sin rama / apoyo)'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Tipo de Destino */}
      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => onCambioCategoria('RAMA')}
          className={`min-h-[44px] p-2.5 rounded-xl border font-bold text-xs transition cursor-pointer ${
            categoriaDestino === 'RAMA'
              ? 'border-brand bg-brand/10 text-brand ring-2 ring-brand/30 font-bold'
              : 'border-rule text-ink-2'
          }`}
        >
          Rama
        </button>
        <button
          type="button"
          onClick={() => onCambioCategoria('SIN_RAMA')}
          className={`min-h-[44px] p-2.5 rounded-xl border font-bold text-xs transition cursor-pointer ${
            categoriaDestino === 'SIN_RAMA'
              ? 'border-neutral-900 bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 ring-2 ring-neutral-400/30 font-bold'
              : 'border-rule text-ink-2'
          }`}
        >
          Sin Rama / Apoyo
        </button>
        {tieneGlobal() && (
          <button
            type="button"
            onClick={() => onCambioCategoria('JEFATURA')}
            className={`min-h-[44px] p-2.5 rounded-xl border font-bold text-xs transition cursor-pointer ${
              categoriaDestino === 'JEFATURA'
                ? 'border-brand bg-brand/10 text-brand ring-2 ring-brand/30'
                : 'border-rule text-ink-2'
            }`}
          >
            Jefatura / Global
          </button>
        )}
      </div>

      {categoriaDestino === 'RAMA' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {ramas.map((rama) => {
              const config = getRamaColorConfig(rama.nombre);
              const seleccionada = ramaSeleccionadaId === rama.id;
              return (
                <button
                  key={rama.id}
                  type="button"
                  onClick={() => onSeleccionarRama(rama)}
                  className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                    seleccionada
                      ? 'border-brand bg-brand/10 ring-2 ring-brand/40'
                      : 'border-rule bg-surface'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs text-ink">
                      {rama.nombre}
                    </span>
                    <span className={`w-2.5 h-2.5 rounded-full ${config.dotColor}`} />
                  </div>
                  <span className="text-[10px] text-ink-muted block">
                    {rama.edadMinima}-{rama.edadMaxima} años
                  </span>
                </button>
              );
            })}
          </div>

          {unidadesRamaSeleccionada.length > 1 && (
            <div className="space-y-1.5">
              <span className="text-xs font-bold text-ink-2 block">
                Sección de {ramaSeleccionadaObj?.nombre}:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {unidadesRamaSeleccionada.map((u) => {
                  const activa = Number(unidadDestinoId) === u.id;
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => setUnidadDestinoId(String(u.id))}
                      className={`min-h-[42px] px-3 py-2 rounded-xl text-xs font-bold transition border cursor-pointer ${
                        activa
                          ? 'bg-brand text-brand-contrast border-brand font-bold shadow-xs'
                          : 'bg-surface text-ink-2 border-rule'
                      }`}
                    >
                      {u.nombre}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Selector de Rol Dinámico para la categoría seleccionada */}
      <div className="space-y-1.5">
        <span className="text-xs font-bold text-ink-2 block">
          Función / Rol:
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {(categoriaDestino === 'RAMA'
            ? rolesRama
            : categoriaDestino === 'SIN_RAMA'
              ? rolesSinRama
              : rolesJefatura
          ).map((r) => {
            const activo = Number(rolDestinoId) === r.id;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setRolDestinoId(String(r.id))}
                className={`min-h-[42px] px-3 py-2 rounded-xl border text-xs font-bold transition cursor-pointer ${
                  activo
                    ? 'border-brand bg-brand/10 text-brand font-bold'
                    : 'border-rule text-ink-2'
                }`}
              >
                {r.nombre}
              </button>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        disabled={ejecutandoPase || (!unidadDestinoId && !rolDestinoId) || esMismoDestino}
        onClick={onEjecutarPase}
        className="w-full min-h-[46px] rounded-xl bg-brand hover:opacity-90 active:opacity-100 text-brand-contrast font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-xs disabled:opacity-40"
      >
        <ArrowRightLeft className="w-4 h-4" />
        <span>
          {ejecutandoPase
            ? 'Procesando pase...'
            : esMismoDestino
              ? 'Ya pertenece a esta sección y rol'
              : 'Confirmar Pase / Cambio de Rol'}
        </span>
      </button>
    </div>
  );
};
