import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../api/client';
import { normalizarTextoBusqueda } from '../lib/formatters';
import { filtrarUnidadesPorAlcance } from '../lib/permisos';
import { useAuthStore } from '../store/authStore';
import { Users, UserX, Search, X, Check } from 'lucide-react';

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
  const asignaciones = useAuthStore((s) => s.asignaciones);
  const tienePermisoGlobal = useAuthStore((s) => s.tienePermisoGlobal);
  const obtenerUnidadesConPermiso = useAuthStore((s) => s.obtenerUnidadesConPermiso);
  const esGlobal = tienePermisoGlobal(['planes.editar', 'caja.editar']);
  const unidadesConceptosIds = useMemo(
    () => obtenerUnidadesConPermiso(['planes.editar', 'caja.editar']),
    [asignaciones, obtenerUnidadesConPermiso],
  );
  const unidadesPermitidas = useMemo(
    () =>
      esGlobal
        ? [...unidades]
        : filtrarUnidadesPorAlcance(unidades, {
            esGlobal: false,
            asignaciones: unidadesConceptosIds.map((id) => ({
              alcance: 'UNIDAD' as const,
              unidadId: id,
            })),
          }),
    [unidades, esGlobal, unidadesConceptosIds],
  );

  // Si el usuario no tiene alcance global, nunca puede quedar seleccionado "Todo el Grupo" (null)
  useEffect(() => {
    if (!esGlobal && unidadId === null && unidadesPermitidas.length > 0) {
      onChangeUnidadId(unidadesPermitidas[0].id);
    }
  }, [esGlobal, unidadId, unidadesPermitidas, onChangeUnidadId]);

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
        .get('/miembros', {
          params: {
            ids: idsFaltantes.slice(0, 200).join(','),
            porPagina: Math.min(200, Math.max(idsFaltantes.length, 20)),
            incluirInactivos: true,
          },
        })
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

    // Al cambiar la búsqueda, la respuesta anterior se descarta (antes podía llegar tarde y
    // pisar los resultados del término nuevo).
    let cancelado = false;
    const timer = setTimeout(async () => {
      setBuscando(true);
      try {
        const res = await api.get('/miembros', {
          params: {
            q: busqueda.trim(),
            busqueda: busqueda.trim(),
            porPagina: 20,
            // Las excepciones se buscan dentro de la unidad elegida.
            ...(unidadId !== null ? { unidadId } : {}),
          },
        });
        if (cancelado) return;
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
      } catch {
        if (!cancelado) setResultadosBusqueda([]);
      } finally {
        if (!cancelado) setBuscando(false);
      }
    }, 200);

    return () => {
      cancelado = true;
      clearTimeout(timer);
    };
  }, [busqueda, unidadId]);

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
    <div className="space-y-4 rounded-2xl border border-rule bg-paper-2 p-4 sm:p-5">
      <div className="flex items-center justify-between border-b border-rule pb-2.5">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-brand" />
          <h4 className="font-bold text-ink text-sm">
            Destinatarios
          </h4>
        </div>
      </div>

      {/* Dimensión 1: Población / Rol */}
      <div>
        <label className="block text-[13px] font-semibold text-ink-2 mb-1.5">
          1. ¿A quiénes se les aplica? (Rol)
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <button
            aria-pressed={destinatarioTipo === 'PROTAGONISTAS'}
            type="button"
            disabled={disabled}
            onClick={() => onChangeDestinatarioTipo('PROTAGONISTAS')}
            className={`min-h-[42px] py-2 px-3 rounded-xl text-[13px] font-bold transition flex items-center justify-center gap-1.5 cursor-pointer border ${
              destinatarioTipo === 'PROTAGONISTAS'
                ? 'bg-brand text-brand-contrast border-brand font-extrabold shadow-2xs'
                : 'bg-surface text-ink-2 border-rule hover:bg-paper-2/60'
            }`}
          >
            {destinatarioTipo === 'PROTAGONISTAS' && <Check className="w-4 h-4" />}
            <span>Solo Protagonistas</span>
          </button>

          <button
            aria-pressed={destinatarioTipo === 'EDUCADORES'}
            type="button"
            disabled={disabled}
            onClick={() => onChangeDestinatarioTipo('EDUCADORES')}
            className={`min-h-[42px] py-2 px-3 rounded-xl text-[13px] font-bold transition flex items-center justify-center gap-1.5 cursor-pointer border ${
              destinatarioTipo === 'EDUCADORES'
                ? 'bg-brand text-brand-contrast border-brand font-extrabold shadow-2xs'
                : 'bg-surface text-ink-2 border-rule hover:bg-paper-2/60'
            }`}
          >
            {destinatarioTipo === 'EDUCADORES' && <Check className="w-4 h-4" />}
            <span>Solo Educadores</span>
          </button>

          <button
            aria-pressed={destinatarioTipo === 'TODOS'}
            type="button"
            disabled={disabled}
            onClick={() => onChangeDestinatarioTipo('TODOS')}
            className={`min-h-[42px] py-2 px-3 rounded-xl text-[13px] font-bold transition flex items-center justify-center gap-1.5 cursor-pointer border ${
              destinatarioTipo === 'TODOS'
                ? 'bg-brand text-brand-contrast border-brand font-extrabold shadow-2xs'
                : 'bg-surface text-ink-2 border-rule hover:bg-paper-2/60'
            }`}
          >
            {destinatarioTipo === 'TODOS' && <Check className="w-4 h-4" />}
            <span>Todos (Ambos)</span>
          </button>
        </div>
      </div>

      {/* Dimensión 2: Rama / Sección Organizativa */}
      <div>
        <label className="block text-[13px] font-semibold text-ink-2 mb-1.5">
          2. ¿En qué Rama o Sección?
        </label>
        <select
          disabled={disabled || (!esGlobal && unidadesPermitidas.length <= 1)}
          value={unidadId === null ? '' : String(unidadId)}
          onChange={(e) => {
            const val = e.target.value;
            onChangeUnidadId(val === '' ? null : Number(val));
          }}
          className="w-full min-h-[44px] rounded-xl border border-rule bg-surface px-3.5 py-2 text-base sm:text-[15px] font-medium text-ink focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition-colors disabled:opacity-75"
        >
          {esGlobal && (
            <option value="">Todo el Grupo Scout (Todas las Ramas y Secciones)</option>
          )}
          {unidadesPermitidas.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nombre}
            </option>
          ))}
        </select>
      </div>

      {/* Resumen del Alcance Seleccionado */}
      <div className="p-3 rounded-xl bg-paper-3 border border-rule/70 text-[13px] flex flex-wrap items-center gap-2">
        <span className="font-bold text-ink-2">Destinatarios:</span>
        <span className="font-bold text-ink-2">
          {destinatarioTipo === 'PROTAGONISTAS'
            ? 'Protagonistas'
            : destinatarioTipo === 'EDUCADORES'
              ? 'Educadores'
              : 'Todos los miembros'}
          {' de '}
          {unidadId === null
            ? 'todo el Grupo Scout'
            : unidadesPermitidas.find((u) => u.id === unidadId)?.nombre ||
              unidades.find((u) => u.id === unidadId)?.nombre ||
              'la unidad seleccionada'}
        </span>
      </div>

      {/* Dimensión 3: Excepciones de Miembros Particulares */}
      <div className="space-y-2.5 pt-2 border-t border-rule">
        <div className="flex items-center justify-between gap-2">
          <label className="text-[13px] font-semibold text-ink-2 flex items-center gap-1.5">
            <UserX className="w-4 h-4 text-rose-500" />
            <span>Excepciones particulares (miembros exentos del cobro)</span>
          </label>
          <span className="text-xs font-bold text-ink-muted dark:text-ink-muted">
            {excepcionesIds.length} {excepcionesIds.length === 1 ? 'excluido' : 'excluidos'}
          </span>
        </div>

        {/* Input con autocompletado */}
        <div className="relative">
          <div className="relative">
            <Search className="w-4 h-4 text-ink-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              disabled={disabled}
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Escribí nombre, apellido o DNI para excluir..."
              className="w-full min-h-[42px] rounded-xl border border-rule bg-surface pl-10 pr-9 py-2 text-base sm:text-[15px] text-ink placeholder:text-ink-muted focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none transition-colors"
            />
            {busqueda && (
              <button
                type="button"
                onClick={() => {
                  setBusqueda('');
                  setResultadosBusqueda([]);
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-ink-muted hover:text-ink cursor-pointer s-touch-icon"
                title="Limpiar búsqueda"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Menú de resultados de búsqueda */}
          {busqueda.trim().length >= 2 && (
            <div className="absolute z-20 mt-1 w-full rounded-xl border border-rule bg-surface shadow-xl max-h-56 overflow-y-auto">
              {buscando ? (
                <div className="p-3.5 text-center text-[13px] text-ink-muted">
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
                      className="w-full text-left px-3.5 py-2.5 text-[13px] hover:bg-paper-2 flex items-center justify-between border-b border-rule last:border-0 cursor-pointer disabled:opacity-50"
                    >
                      <div>
                        <span className="font-bold text-ink">
                          {m.nombre} {m.apellido}
                        </span>
                        <span className="text-ink-muted dark:text-ink-muted text-xs ml-2">
                          DNI {m.dni}
                        </span>
                      </div>
                      {yaExcluido ? (
                        <span className="text-xs text-rose-500 font-semibold">Ya excluido</span>
                      ) : (
                        <span className="text-xs text-brand font-bold hover:underline">
                          + Excluir
                        </span>
                      )}
                    </button>
                  );
                })
              ) : (
                <div className="p-3.5 text-center text-[13px] text-ink-muted italic">
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
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-[13px] font-medium"
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
                    <X className="w-3.5 h-3.5" />
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
