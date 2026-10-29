import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { normalizarTextoBusqueda } from '../lib/formatters';
import { Users, UserX, Search, X, ShieldAlert, Check } from 'lucide-react';

export interface SelectorDestinatariosProps {
  destinatarioTipo: 'TODOS' | 'PROTAGONISTAS' | 'EDUCADORES';
  onChangeDestinatarioTipo: (tipo: 'TODOS' | 'PROTAGONISTAS' | 'EDUCADORES') => void;
  unidadId: number | null;
  onChangeUnidadId: (unidadId: number | null) => void;
  excepcionesIds: number[];
  onChangeExcepcionesIds: (ids: number[]) => void;
  unidades: Array<{ id: number; nombre: string; tipo?: string }>;
  disabled?: boolean;
}

interface MiembroResumen {
  id: number;
  nombre: string;
  apellido: string;
  dni: string;
}

export const SelectorDestinatarios: React.FC<SelectorDestinatariosProps> = ({
  destinatarioTipo,
  onChangeDestinatarioTipo,
  unidadId,
  onChangeUnidadId,
  excepcionesIds,
  onChangeExcepcionesIds,
  unidades,
  disabled = false,
}) => {
  // Buscador de excepciones
  const [busqueda, setBusqueda] = useState('');
  const [resultadosBusqueda, setResultadosBusqueda] = useState<MiembroResumen[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [miembrosExcluidosDetalle, setMiembrosExcluidosDetalle] = useState<MiembroResumen[]>([]);

  // Cargar detalles de los miembros actualmente excluidos si no están cargados
  useEffect(() => {
    if (excepcionesIds.length === 0) {
      setMiembrosExcluidosDetalle([]);
      return;
    }

    // Si ya tenemos todos los detalles, no buscar de nuevo
    const idsFaltantes = excepcionesIds.filter(
      (id) => !miembrosExcluidosDetalle.some((m) => m.id === id),
    );

    if (idsFaltantes.length > 0) {
      api
        .get('/miembros', { params: { porPagina: 100 } })
        .then((res) => {
          const todos: MiembroResumen[] = res.data?.items || res.data || [];
          const encontrados = todos.filter((m) => excepcionesIds.includes(m.id));
          setMiembrosExcluidosDetalle((prev) => {
            const mapa = new Map(prev.map((x) => [x.id, x]));
            for (const m of encontrados) {
              mapa.set(m.id, m);
            }
            return Array.from(mapa.values());
          });
        })
        .catch(() => {
          // Ignorar error silenciosamente
        });
    }
  }, [excepcionesIds]);

  // Debounced search de miembros para excepciones
  useEffect(() => {
    const termino = normalizarTextoBusqueda(busqueda);
    if (!termino || termino.length < 2) {
      setResultadosBusqueda([]);
      setBuscando(false);
      return;
    }

    const timer = setTimeout(async () => {
      setBuscando(true);
      try {
        const res = await api.get('/miembros', {
          params: { q: busqueda.trim(), busqueda: busqueda.trim(), porPagina: 20 },
        });
        const items: MiembroResumen[] = res.data?.items || res.data || [];

        // Filtro estricto sin tildes en memoria: solo incluir si coincide con nombre, apellido o DNI
        const filtrados = items.filter((m) => {
          const nom = normalizarTextoBusqueda(m.nombre);
          const ape = normalizarTextoBusqueda(m.apellido);
          const completo1 = `${nom} ${ape}`;
          const completo2 = `${ape} ${nom}`;
          const d = normalizarTextoBusqueda(m.dni);
          return (
            nom.includes(termino) ||
            ape.includes(termino) ||
            completo1.includes(termino) ||
            completo2.includes(termino) ||
            d.includes(termino)
          );
        });

        setResultadosBusqueda(filtrados);
      } catch (err) {
        setResultadosBusqueda([]);
      } finally {
        setBuscando(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [busqueda]);

  const handleAgregarExcepcion = (m: MiembroResumen) => {
    if (!excepcionesIds.includes(m.id)) {
      onChangeExcepcionesIds([...excepcionesIds, m.id]);
      setMiembrosExcluidosDetalle((prev) => [...prev.filter((x) => x.id !== m.id), m]);
    }
    setBusqueda('');
    setResultadosBusqueda([]);
  };

  const handleRemoverExcepcion = (id: number) => {
    onChangeExcepcionesIds(excepcionesIds.filter((x) => x !== id));
    setMiembrosExcluidosDetalle((prev) => prev.filter((x) => x.id !== id));
  };

  return (
    <div className="space-y-4 rounded-2xl border border-rule bg-paper-2 p-4">
      <div className="flex items-center justify-between border-b border-rule pb-2.5">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-brand" />
          <h4 className="font-bold text-ink text-xs">
            Destinatarios
          </h4>
        </div>
      </div>

      {/* Dimensión 1: Población / Rol */}
      <div>
        <label className="block text-xs font-semibold text-ink-2 mb-1.5">
          1. ¿A quiénes se les aplica? (Rol)
        </label>
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChangeDestinatarioTipo('PROTAGONISTAS')}
            className={`py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer border ${
              destinatarioTipo === 'PROTAGONISTAS'
                ? 'bg-brand text-brand-contrast border-brand font-extrabold shadow-2xs'
                : 'bg-surface text-ink-2 border-rule hover:bg-paper-2/60'
            }`}
          >
            {destinatarioTipo === 'PROTAGONISTAS' && <Check className="w-3.5 h-3.5" />}
            <span>Solo Protagonistas</span>
          </button>

          <button
            type="button"
            disabled={disabled}
            onClick={() => onChangeDestinatarioTipo('EDUCADORES')}
            className={`py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer border ${
              destinatarioTipo === 'EDUCADORES'
                ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                : 'bg-surface text-ink-2 border-rule hover:bg-paper-2/60'
            }`}
          >
            {destinatarioTipo === 'EDUCADORES' && <Check className="w-3.5 h-3.5" />}
            <span>Solo Educadores</span>
          </button>

          <button
            type="button"
            disabled={disabled}
            onClick={() => onChangeDestinatarioTipo('TODOS')}
            className={`py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer border ${
              destinatarioTipo === 'TODOS'
                ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                : 'bg-surface text-ink-2 border-rule hover:bg-paper-2/60'
            }`}
          >
            {destinatarioTipo === 'TODOS' && <Check className="w-3.5 h-3.5" />}
            <span>Todos (Ambos)</span>
          </button>
        </div>
      </div>

      {/* Dimensión 2: Rama / Sección Organizativa */}
      <div>
        <label className="block text-xs font-semibold text-ink-2 mb-1.5">
          2. ¿En qué Rama o Sección?
        </label>
        <select
          disabled={disabled}
          value={unidadId === null ? '' : String(unidadId)}
          onChange={(e) => {
            const val = e.target.value;
            onChangeUnidadId(val === '' ? null : Number(val));
          }}
          className="w-full rounded-xl border border-rule bg-surface px-3 py-2 text-xs font-medium text-ink focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition-colors"
        >
          <option value="">Todo el Grupo Scout (Todas las Ramas y Secciones)</option>
          {unidades.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nombre}
            </option>
          ))}
        </select>
      </div>

      {/* Resumen del Alcance Seleccionado */}
      <div className="p-2.5 rounded-xl bg-paper-3 border border-rule/70 text-xs flex items-center gap-2">
        <span className="font-bold text-ink-2">Alcance configurado:</span>
        <span className="font-bold text-ink-2">
          {destinatarioTipo === 'PROTAGONISTAS'
            ? 'Protagonistas'
            : destinatarioTipo === 'EDUCADORES'
              ? 'Educadores'
              : 'Todos los miembros'}
          {' de '}
          {unidadId === null
            ? 'todo el Grupo Scout'
            : unidades.find((u) => u.id === unidadId)?.nombre || 'la unidad seleccionada'}
        </span>
      </div>

      {/* Dimensión 3: Excepciones de Miembros Particulares */}
      <div className="space-y-2 pt-1 border-t border-rule">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-ink-2 flex items-center gap-1.5">
            <UserX className="w-3.5 h-3.5 text-rose-500" />
            <span>Excepciones particulares (miembros exentos de la cuota)</span>
          </label>
          <span className="text-[11px] font-bold text-ink-muted dark:text-ink-muted">
            {excepcionesIds.length} {excepcionesIds.length === 1 ? 'excluido' : 'excluidos'}
          </span>
        </div>

        {/* Input con autocompletado */}
        <div className="relative">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-ink-muted absolute left-3 top-2.5 pointer-events-none" />
            <input
              type="text"
              disabled={disabled}
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Escriba nombre, apellido o DNI para excluir..."
              className="w-full rounded-xl border border-rule bg-surface pl-8 pr-8 py-1.5 text-xs text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-rose-500 transition"
            />
            {busqueda && (
              <button
                type="button"
                onClick={() => {
                  setBusqueda('');
                  setResultadosBusqueda([]);
                }}
                className="absolute right-2.5 top-2 text-ink-muted hover:text-ink cursor-pointer"
                title="Limpiar búsqueda"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Menú de resultados de búsqueda */}
          {busqueda.trim().length >= 2 && (
            <div className="absolute z-20 mt-1 w-full rounded-xl border border-rule bg-surface shadow-xl max-h-56 overflow-y-auto">
              {buscando ? (
                <div className="p-3 text-center text-xs text-ink-muted">
                  Buscando coincidencias…
                </div>
              ) : resultadosBusqueda.length > 0 ? (
                resultadosBusqueda.map((m) => {
                  const yaExcluido = excepcionesIds.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      disabled={yaExcluido}
                      onClick={() => handleAgregarExcepcion(m)}
                      className="w-full text-left px-3.5 py-2 text-xs hover:bg-paper-2 flex items-center justify-between border-b border-rule last:border-0 cursor-pointer disabled:opacity-50"
                    >
                      <div>
                        <span className="font-bold text-ink">
                          {m.nombre} {m.apellido}
                        </span>
                        <span className="text-ink-muted dark:text-ink-muted text-[11px] ml-2">
                          DNI {m.dni}
                        </span>
                      </div>
                      {yaExcluido ? (
                        <span className="text-[10px] text-rose-500 font-semibold">Ya excluido</span>
                      ) : (
                        <span className="text-[10px] text-brand font-bold hover:underline">
                          + Excluir
                        </span>
                      )}
                    </button>
                  );
                })
              ) : (
                <div className="p-3 text-center text-xs text-ink-muted italic">
                  No se encontraron miembros coincidentes con "{busqueda.trim()}".
                </div>
              )}
            </div>
          )}
        </div>

        {/* Chips de miembros excluidos */}
        {excepcionesIds.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {excepcionesIds.map((id) => {
              const detalle = miembrosExcluidosDetalle.find((m) => m.id === id);
              return (
                <span
                  key={id}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-medium"
                >
                  <span>
                    {detalle ? `${detalle.nombre} ${detalle.apellido}` : 'Miembro exento'}
                  </span>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => handleRemoverExcepcion(id)}
                    className="hover:text-rose-900 dark:hover:text-rose-100 rounded-full cursor-pointer"
                    title="Quitar excepción"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
