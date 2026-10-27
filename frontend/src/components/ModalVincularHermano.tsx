import React, { useState } from 'react';
import { api } from '../api/client';
import { X, UserPlus, Search, CheckCircle2, AlertCircle, Loader2, Users } from 'lucide-react';

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
  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState<any[]>([]);
  const [hermanoEncontrado, setHermanoEncontrado] = useState<any | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!abierto) return null;

  const handleBuscar = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const termino = busqueda.trim();
    if (!termino) {
      setError('Por favor ingresá el DNI o el Apellido del hermano/a.');
      return;
    }

    setBuscando(true);
    setError(null);
    setHermanoEncontrado(null);
    setResultados([]);

    try {
      const res = await api.get(`/miembros/hermanos/buscar?q=${encodeURIComponent(termino)}`);
      const items = (Array.isArray(res.data) ? res.data : []).filter(
        (m: any) => m.id !== usuarioId,
      );

      if (items.length === 0) {
        setError('No se encontraron miembros activos con ese DNI o apellido.');
      } else if (items.length === 1) {
        setResultados(items);
        setHermanoEncontrado(items[0]);
      } else {
        setResultados(items);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error al buscar hermano.');
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
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Encabezado */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 dark:text-slate-100 text-base">
                Vincular Hermano/a
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Asociar a {usuarioNombre} por DNI o Apellido
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Contenido */}
        <div className="p-5 space-y-4 overflow-y-auto">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800/60 text-rose-800 dark:text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleBuscar} className="space-y-2">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              DNI o Apellido del Hermano/a
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                required
                value={busqueda}
                onChange={(e) => {
                  setBusqueda(e.target.value);
                  setError(null);
                }}
                placeholder="Ej: Pérez o 46123456"
                className="flex-1 min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:border-blue-500 outline-none text-xs"
              />
              <button
                type="submit"
                disabled={buscando || !busqueda.trim()}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                {buscando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                <span>Buscar</span>
              </button>
            </div>
          </form>

          {/* Lista de coincidencias cuando hay múltiples */}
          {resultados.length > 1 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <Users className="w-3.5 h-3.5" />
                <span>Seleccioná al hermano/a ({resultados.length} encontrados):</span>
              </p>
              <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1">
                {resultados.map((m) => {
                  const seleccionado = hermanoEncontrado?.id === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setHermanoEncontrado(m)}
                      className={`w-full text-left p-2.5 rounded-xl border transition cursor-pointer flex items-center justify-between gap-2 ${
                        seleccionado
                          ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-400 dark:border-blue-600'
                          : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 hover:border-blue-300'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="font-extrabold text-xs text-slate-900 dark:text-slate-100 truncate">
                          {m.apellido}, {m.nombre}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          DNI {m.dni} • {m.asignaciones?.[0]?.unidad?.nombre || 'Sin sección'}
                        </div>
                      </div>
                      {seleccionado && (
                        <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tarjeta del Hermano Seleccionado */}
          {hermanoEncontrado && (
            <div className="p-4 rounded-2xl bg-blue-50/60 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 space-y-2 animate-in fade-in">
              <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300 text-xs font-bold">
                <CheckCircle2 className="w-4 h-4" />
                <span>Hermano/a seleccionado:</span>
              </div>
              <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-blue-100 dark:border-blue-900/40">
                <div className="font-extrabold text-sm text-slate-800 dark:text-slate-100">
                  {hermanoEncontrado.apellido}, {hermanoEncontrado.nombre}
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
