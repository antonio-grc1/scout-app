import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { X, Users, Percent, Sparkles, Check, AlertCircle } from 'lucide-react';

interface Props {
  abierto: boolean;
  familia: {
    id: number;
    nombreFamilia: string;
    porcentajeDescuentoHermanos: number | string;
    miembros?: any[];
  } | null;
  onCerrar: () => void;
  onGuardado: () => void;
}

export const ModalEditarFamilia: React.FC<Props> = ({
  abierto,
  familia,
  onCerrar,
  onGuardado,
}) => {
  const [nombreFamilia, setNombreFamilia] = useState('');
  const [porcentajeDescuento, setPorcentajeDescuento] = useState<number>(0);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (familia) {
      setNombreFamilia(familia.nombreFamilia || '');
      setPorcentajeDescuento(Number(familia.porcentajeDescuentoHermanos ?? 0));
      setError(null);
    }
  }, [familia]);

  if (!abierto || !familia) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombreFamilia.trim()) {
      setError('El nombre de la familia no puede estar vacío.');
      return;
    }
    if (porcentajeDescuento < 0 || porcentajeDescuento > 100) {
      setError('El porcentaje de descuento debe ser un valor entre 0 y 100.');
      return;
    }

    setGuardando(true);
    setError(null);
    try {
      await api.patch(`/tesoreria/familias/${familia.id}`, {
        nombreFamilia: nombreFamilia.trim(),
        porcentajeDescuentoHermanos: porcentajeDescuento,
      });
      onGuardado();
      onCerrar();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error al actualizar el grupo familiar.');
    } finally {
      setGuardando(false);
    }
  };

  const aplicarPredefinido = (pct: number) => {
    setPorcentajeDescuento(pct);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Encabezado */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 dark:text-slate-100 text-base">
                Grupo Familiar y Descuento por Hermanos
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Ajuste el porcentaje que se descontará automáticamente en cuotas a los hermanos
              </p>
            </div>
          </div>
          <button
            onClick={onCerrar}
            className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto flex-1">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800/60 text-rose-800 dark:text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Nombre de la Familia */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
              Nombre del Grupo Familiar *
            </label>
            <input
              type="text"
              required
              value={nombreFamilia}
              onChange={(e) => setNombreFamilia(e.target.value)}
              placeholder="Ej: Familia Gómez, Hermanos Pérez"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:border-emerald-500 outline-none text-xs"
            />
          </div>

          {/* Configuración de Porcentaje de Descuento */}
          <div className="p-4 rounded-2xl bg-emerald-50/50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Percent className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
                  Porcentaje de Descuento por Hermanos
                </span>
              </div>
              <span className="text-lg font-black text-emerald-700 dark:text-emerald-300">
                {porcentajeDescuento}%
              </span>
            </div>

            <p className="text-[11px] text-emerald-800/80 dark:text-emerald-300/80 leading-relaxed">
              Este porcentaje se aplicará automáticamente a cada cuota mensual o cobro extraordinario
              que tenga activada la opción "Permitir descuento por hermanos / familiar".
            </p>

            <div className="flex items-center gap-3 pt-1">
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={porcentajeDescuento}
                onChange={(e) => setPorcentajeDescuento(Number(e.target.value))}
                className="w-full accent-emerald-600 cursor-pointer"
              />
              <input
                type="number"
                min="0"
                max="100"
                value={porcentajeDescuento}
                onChange={(e) => setPorcentajeDescuento(Math.min(100, Math.max(0, Number(e.target.value))))}
                className="w-16 px-2.5 py-1 text-center font-bold text-xs rounded-lg border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
              />
              <span className="font-bold text-xs text-slate-600 dark:text-slate-400">%</span>
            </div>

            {/* Accesos rápidos a porcentajes comunes */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold mr-1">
                Comunes:
              </span>
              {[0, 10, 15, 20, 25, 50].map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => aplicarPredefinido(val)}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition cursor-pointer border ${
                    porcentajeDescuento === val
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-emerald-300'
                  }`}
                >
                  {val === 0 ? 'Sin desc. (0%)' : `${val}%`}
                </button>
              ))}
            </div>
          </div>

          {/* Miembros / Hermanos integrantes de esta familia */}
          {familia.miembros && familia.miembros.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                Hermanos vinculados en este grupo ({familia.miembros.length}):
              </span>
              <div className="space-y-1.5 max-h-36 overflow-y-auto">
                {familia.miembros.map((m: any) => {
                  const unidadNombre = m.asignaciones?.[0]?.unidad?.nombre || 'Sin sección';
                  return (
                    <div
                      key={m.id}
                      className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-bold text-slate-800 dark:text-slate-200">
                          {m.nombre} {m.apellido}
                        </span>
                        <span className="text-slate-400 dark:text-slate-500 text-[10px] block">
                          DNI: {m.dni}
                        </span>
                      </div>
                      <span className="px-2 py-0.5 rounded-full bg-slate-200/70 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-[10px] font-semibold">
                        {unidadNombre}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Botones de acción */}
          <div className="flex justify-end items-center gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onCerrar}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 font-semibold text-xs transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition shadow-xs cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>{guardando ? 'Guardando...' : 'Guardar Descuento Familiar'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
