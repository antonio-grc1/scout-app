import React, { useMemo, useState } from 'react';
import { api } from '../api/client';
import { calcularCamada, traducirErrorAmigable } from '../lib/formatters';
import { ArrowRightLeft, Loader2, Sparkles, Users } from 'lucide-react';

interface Props {
  candidatos: any[];
  unidades: any[];
  onRecargar: () => Promise<void>;
  onToast: (texto: string, tipo?: 'exito' | 'error') => void;
}

export const PanelPasesPorCamada: React.FC<Props> = ({
  candidatos,
  unidades,
  onRecargar,
  onToast,
}) => {
  const [destinoPorCamada, setDestinoPorCamada] = useState<Record<string, number>>({});
  const [destinoIndividual, setDestinoIndividual] = useState<Record<number, number>>({});
  const [ejecutandoCamadaKey, setEjecutandoCamadaKey] = useState<string | null>(null);
  const [ejecutandoPaseId, setEjecutandoPaseId] = useState<number | null>(null);

  const unidadSinRamaFallback = useMemo(
    () =>
      unidades.find(
        (u) =>
          u.tipo === 'SIN_RAMA_APOYO' ||
          u.nombre?.toLowerCase().includes('sin rama') ||
          u.nombre?.toLowerCase().includes('apoyo'),
      ),
    [unidades],
  );

  const gruposCamada = useMemo(() => {
    const mapa = new Map<
      string,
      {
        key: string;
        camada: number;
        edadAlCorte: number;
        unidadActualNombre: string;
        ramaActualNombre: string;
        ramaSugeridaNombre: string;
        tipo: string;
        unidadesDestino: Array<{ id: number; nombre: string }>;
        miembros: any[];
      }
    >();

    for (const c of candidatos) {
      const camada = c.camada ?? calcularCamada(c.usuario?.fechaNacimiento) ?? 0;
      const key = `${c.unidadActual?.id || 0}-${camada}`;
      if (!mapa.has(key)) {
        const dests =
          c.unidadesDestino?.length > 0
            ? c.unidadesDestino
            : unidadSinRamaFallback
              ? [{ id: unidadSinRamaFallback.id, nombre: unidadSinRamaFallback.nombre }]
              : [];

        mapa.set(key, {
          key,
          camada,
          edadAlCorte: c.edad,
          unidadActualNombre: c.unidadActual?.nombre || 'Sección',
          ramaActualNombre: c.ramaActual?.nombre || 'Rama',
          ramaSugeridaNombre:
            c.tipo === 'PROGRESION' ? c.ramaSugerida?.nombre || 'Siguiente Rama' : 'Educador / Apoyo',
          tipo: c.tipo,
          unidadesDestino: dests,
          miembros: [],
        });
      }
      mapa.get(key)!.miembros.push(c);
    }

    return Array.from(mapa.values()).sort(
      (a, b) =>
        a.unidadActualNombre.localeCompare(b.unidadActualNombre) || a.camada - b.camada,
    );
  }, [candidatos, unidadSinRamaFallback]);

  const handlePasarCamada = async (grupo: (typeof gruposCamada)[number]) => {
    const destinoLoteId =
      destinoPorCamada[grupo.key] ?? grupo.unidadesDestino?.[0]?.id;

    if (!destinoLoteId) {
      onToast('No hay sección de destino disponible para este pase.', 'error');
      return;
    }

    setEjecutandoCamadaKey(grupo.key);
    try {
      await api.post('/pases/lote', {
        pases: grupo.miembros.map((c) => ({
          asignacionOrigenId: c.asignacionId,
          unidadDestinoId: Number(
            destinoIndividual[c.asignacionId] ?? destinoLoteId,
          ),
        })),
      });
      const destNombre =
        grupo.unidadesDestino.find((u) => u.id === Number(destinoLoteId))?.nombre ||
        grupo.ramaSugeridaNombre;
      onToast(
        `Camada ${grupo.camada} (${grupo.miembros.length} miembro${grupo.miembros.length === 1 ? '' : 's'}) pasó a ${destNombre}.`,
      );
      await onRecargar();
    } catch (err) {
      onToast(traducirErrorAmigable(err, 'No se pudo ejecutar el pase de la camada.'), 'error');
    } finally {
      setEjecutandoCamadaKey(null);
    }
  };

  const handlePasarIndividual = async (c: any, grupo: (typeof gruposCamada)[number]) => {
    const destinoId =
      destinoIndividual[c.asignacionId] ??
      destinoPorCamada[grupo.key] ??
      grupo.unidadesDestino?.[0]?.id;

    if (!destinoId) {
      onToast('Seleccioná una sección de destino para este pase.', 'error');
      return;
    }

    setEjecutandoPaseId(c.asignacionId);
    try {
      await api.post('/pases', {
        asignacionOrigenId: c.asignacionId,
        unidadDestinoId: Number(destinoId),
      });
      const destNombre =
        grupo.unidadesDestino.find((u) => u.id === Number(destinoId))?.nombre ||
        grupo.ramaSugeridaNombre;
      onToast(`${c.usuario.nombre} ${c.usuario.apellido} pasó a ${destNombre}.`);
      await onRecargar();
    } catch (err) {
      onToast(traducirErrorAmigable(err, 'No se pudo realizar el pase.'), 'error');
    } finally {
      setEjecutandoPaseId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-500" />
            <span>Sugerencias de Pases de Rama por Camada (Corte al 30/06 inclusive)</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Se agrupan en la misma camada quienes cumplen la edad de pase hasta el 30 de junio inclusive del ciclo actual.
          </p>
        </div>

        <span className="text-xs font-extrabold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 px-3.5 py-1.5 rounded-full border border-emerald-200 dark:border-emerald-800 shrink-0 self-start sm:self-center">
          {candidatos.length} {candidatos.length === 1 ? 'pase sugerido' : 'pases sugeridos'} en {gruposCamada.length}{' '}
          {gruposCamada.length === 1 ? 'camada' : 'camadas'}
        </span>
      </div>

      {gruposCamada.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-10 text-center space-y-2">
          <Users className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto" />
          <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
            Todas las camadas se encuentran en la rama correspondiente a su edad escolar (corte 30/06).
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {gruposCamada.map((g) => {
            const destinoLote =
              destinoPorCamada[g.key] ?? g.unidadesDestino?.[0]?.id ?? '';
            const ejecutandoLote = ejecutandoCamadaKey === g.key;

            return (
              <div
                key={g.key}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden"
              >
                {/* Cabecera de la Camada */}
                <div className="p-4 sm:p-5 bg-slate-50/80 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-3 py-1 rounded-xl bg-amber-100 dark:bg-amber-950/70 text-amber-900 dark:text-amber-200 font-black text-xs border border-amber-300 dark:border-amber-800">
                        Camada {g.camada}
                      </span>
                      <span className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
                        {g.unidadActualNombre} →{' '}
                        <span className="text-emerald-600 dark:text-emerald-400">
                          {g.ramaSugeridaNombre}
                        </span>
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Nacidos entre el 01/07/{g.camada - 1} y el 30/06/{g.camada} • Cumplen{' '}
                      <strong>{g.edadAlCorte} años</strong> al 30/06 •{' '}
                      <strong>
                        {g.miembros.length} {g.miembros.length === 1 ? 'integrante' : 'integrantes'}
                      </strong>
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
                    {g.unidadesDestino.length > 1 && (
                      <select
                        value={destinoLote}
                        onChange={(e) =>
                          setDestinoPorCamada((prev) => ({
                            ...prev,
                            [g.key]: Number(e.target.value),
                          }))
                        }
                        className="min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-800 dark:text-slate-100 outline-none"
                      >
                        {g.unidadesDestino.map((u) => (
                          <option key={u.id} value={u.id}>
                            Sección destino: {u.nombre}
                          </option>
                        ))}
                      </select>
                    )}

                    <button
                      type="button"
                      disabled={ejecutandoLote}
                      onClick={() => handlePasarCamada(g)}
                      className="min-h-[40px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer shadow-2xs disabled:opacity-50"
                    >
                      {ejecutandoLote ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <ArrowRightLeft className="w-4 h-4" />
                      )}
                      <span>
                        Pasar toda la Camada {g.camada} ({g.miembros.length})
                      </span>
                    </button>
                  </div>
                </div>

                {/* Integrantes de la Camada */}
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {g.miembros.map((c) => {
                    const enProceso = ejecutandoPaseId === c.asignacionId;
                    const destIndiv =
                      destinoIndividual[c.asignacionId] ??
                      destinoPorCamada[g.key] ??
                      g.unidadesDestino?.[0]?.id ??
                      '';
                    const fechaNacStr = c.usuario.fechaNacimiento
                      ? new Date(c.usuario.fechaNacimiento).toLocaleDateString('es-AR', {
                          timeZone: 'UTC',
                        })
                      : '';

                    return (
                      <div
                        key={c.asignacionId}
                        className="p-3.5 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-sm text-slate-900 dark:text-slate-100">
                              {c.usuario.apellido}, {c.usuario.nombre}
                            </span>
                            <span className="text-xs text-slate-400">DNI {c.usuario.dni}</span>
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
                            <span>Nac.: {fechaNacStr}</span>
                            <span>•</span>
                            <span>
                              Edad actual: <strong>{c.edadActual ?? c.edad} años</strong>
                            </span>
                            <span>•</span>
                            <span className="text-amber-700 dark:text-amber-400 font-semibold">
                              Al 30/06: {c.edad} años
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                          {g.unidadesDestino.length > 1 && (
                            <select
                              value={destIndiv}
                              onChange={(e) =>
                                setDestinoIndividual((prev) => ({
                                  ...prev,
                                  [c.asignacionId]: Number(e.target.value),
                                }))
                              }
                              className="min-h-[36px] px-2.5 py-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 outline-none"
                            >
                              {g.unidadesDestino.map((u) => (
                                <option key={u.id} value={u.id}>
                                  {u.nombre}
                                </option>
                              ))}
                            </select>
                          )}

                          <button
                            type="button"
                            disabled={enProceso || ejecutandoLote}
                            onClick={() => handlePasarIndividual(c, g)}
                            className="min-h-[36px] px-3.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-emerald-600 hover:text-white text-slate-700 dark:text-slate-200 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                          >
                            {enProceso ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <ArrowRightLeft className="w-3.5 h-3.5" />
                            )}
                            <span>Pasar individual</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
