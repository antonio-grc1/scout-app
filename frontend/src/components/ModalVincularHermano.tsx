import React, { useState } from 'react';
import { api } from '../api/client';
import { X, UserPlus, Search, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

interface Props {
  abierto: boolean;
  usuarioId: number;
  usuarioNombre: string;
  onCerrar: () => void;
  onVinculado: () => void;
}

export const ModalVincularHermano: React.FC<Props> = ({
  abierto,
  usuarioId,
  usuarioNombre,
  onCerrar,
  onVinculado,
}) => {
  const [dniHermano, setDniHermano] = useState('');
  const [hermanoEncontrado, setHermanoEncontrado] = useState<any | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!abierto) return null;

  const handleBuscar = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!dniHermano.trim()) {
      setError('Por favor ingrese el DNI del hermano.');
      return;
    }

    setBuscando(true);
    setError(null);
    setHermanoEncontrado(null);

    try {
      const res = await api.get(`/miembros?busqueda=${encodeURIComponent(dniHermano.trim())}&porPagina=5`);
      const items = res.data?.items || [];
      const match = items.find(
        (m: any) => m.dni?.toLowerCase() === dniHermano.trim().toLowerCase() && m.id !== usuarioId,
      );

      if (!match) {
        setError('No se encontró ningún miembro con ese DNI (o es el mismo miembro actual).');
      } else {
        setHermanoEncontrado(match);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error al buscar hermano por DNI.');
    } finally {
      setBuscando(false);
    }
  };

  const handleConfirmar = async () => {
    if (!hermanoEncontrado) return;
    setGuardando(true);
    setError(null);

    try {
      await api.post('/tesoreria/familias/vincular-hermano', {
        usuarioId,
        hermanoDni: hermanoEncontrado.dni,
      });
      onVinculado();
      onCerrar();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error al vincular hermano.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full shadow-2xl overflow-hidden flex flex-col">
        {/* Encabezado */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 dark:text-slate-100 text-base">
                Vincular Hermano por DNI
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Asociar a {usuarioNombre} con un hermano para compartir grupo familiar
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

        {/* Contenido */}
        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800/60 text-rose-800 dark:text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleBuscar} className="space-y-2">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              DNI del Hermano a Vincular
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                required
                value={dniHermano}
                onChange={(e) => {
                  setDniHermano(e.target.value);
                  setHermanoEncontrado(null);
                  setError(null);
                }}
                placeholder="Ej: 46123456"
                className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:border-blue-500 outline-none text-xs font-mono"
              />
              <button
                type="submit"
                disabled={buscando || !dniHermano.trim()}
                className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                {buscando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                <span>Buscar</span>
              </button>
            </div>
          </form>

          {/* Tarjeta del Hermano Encontrado */}
          {hermanoEncontrado && (
            <div className="p-4 rounded-2xl bg-blue-50/60 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 space-y-2 animate-in fade-in">
              <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300 text-xs font-bold">
                <CheckCircle2 className="w-4 h-4" />
                <span>Hermano encontrado:</span>
              </div>
              <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-blue-100 dark:border-blue-900/40">
                <div className="font-extrabold text-sm text-slate-800 dark:text-slate-100">
                  {hermanoEncontrado.nombre} {hermanoEncontrado.apellido}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  DNI: <span className="font-mono">{hermanoEncontrado.dni}</span> • Sección:{' '}
                  {hermanoEncontrado.asignaciones?.[0]?.unidad?.nombre || 'Sin sección activa'}
                </div>
              </div>
              <p className="text-[11px] text-blue-800/80 dark:text-blue-300/80 leading-relaxed">
                Al confirmar, ambos miembros quedarán integrados en el mismo Grupo Familiar, compartiendo
                el porcentaje de descuento por hermanos en sus cuotas institucionales.
              </p>
            </div>
          )}

          {/* Botones de acción */}
          <div className="flex justify-end items-center gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onCerrar}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 font-semibold text-xs transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirmar}
              disabled={guardando || !hermanoEncontrado}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition shadow-xs cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
            >
              {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
              <span>Confirmar Vinculación</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
