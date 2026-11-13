import React, { useState } from 'react';
import { api } from '../api/client';
import { traducirErrorAmigable } from '../lib/formatters';
import { Check, Clock, Loader2, X } from 'lucide-react';

interface Props {
  solicitudes: any[];
  puedeEjecutar: boolean;
  onResuelto: () => Promise<void>;
  onToast: (texto: string, tipo?: 'exito' | 'error') => void;
  onAbrirMiembro?: (usuarioId: number) => void;
}

export const PanelSolicitudesPase: React.FC<Props> = ({
  solicitudes,
  puedeEjecutar,
  onResuelto,
  onToast,
  onAbrirMiembro,
}) => {
  const [seccionSeleccionada, setSeccionSeleccionada] = useState<Record<number, number>>({});
  const [procesandoId, setProcesandoId] = useState<number | null>(null);

  if (!solicitudes || solicitudes.length === 0) return null;

  const handleAprobar = async (s: any) => {
    const unidadDestinoId = Number(seccionSeleccionada[s.id] ?? s.unidadDestinoId);
    setProcesandoId(s.id);
    try {
      await api.post(`/pases/solicitudes/${s.id}/aprobar`, { unidadDestinoId });
      const destNombre =
        s.seccionesMismaRama?.find((u: any) => u.id === unidadDestinoId)?.nombre ||
        s.unidadDestino?.nombre ||
        'la sección';
      onToast(`Pase de ${s.usuario?.nombre} ${s.usuario?.apellido} confirmado en ${destNombre}.`);
      await onResuelto();
    } catch (err) {
      onToast(traducirErrorAmigable(err, 'No se pudo aprobar la solicitud de pase.'), 'error');
    } finally {
      setProcesandoId(null);
    }
  };

  const handleRechazar = async (s: any) => {
    setProcesandoId(s.id);
    try {
      const res = await api.post(`/pases/solicitudes/${s.id}/rechazar`, {});
      const cancelada = res.data?.estado === 'CANCELADA';
      onToast(
        cancelada
          ? `Solicitud de pase de ${s.usuario?.nombre} ${s.usuario?.apellido} cancelada.`
          : `Solicitud de pase de ${s.usuario?.nombre} ${s.usuario?.apellido} rechazada.`,
      );
      await onResuelto();
    } catch (err) {
      onToast(traducirErrorAmigable(err, 'No se pudo rechazar/cancelar la solicitud.'), 'error');
    } finally {
      setProcesandoId(null);
    }
  };

  return (
    <div className="bg-surface rounded-2xl border border-amber-300 dark:border-amber-700/60 shadow-xs overflow-hidden">
      <div className="p-4 sm:px-5 bg-amber-50/70 dark:bg-amber-950/25 border-b border-amber-200 dark:border-amber-800/50 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-extrabold text-ink flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <span>Solicitudes de Pase Pendientes ({solicitudes.length})</span>
          </h3>
          <p className="text-xs text-ink-muted mt-0.5">
            Pases hacia ramas con múltiples secciones que esperan confirmación de la sección receptora.
          </p>
        </div>
      </div>

      <div className="divide-y divide-rule">
        {solicitudes.map((s) => {
          const enProceso = procesandoId === s.id;
          const destId = seccionSeleccionada[s.id] ?? s.unidadDestinoId;
          const secciones = s.seccionesMismaRama ?? [];
          const fechaStr = s.createdAt
            ? new Date(s.createdAt).toLocaleDateString('es-AR', { timeZone: 'UTC' })
            : '';

          return (
            <div
              key={s.id}
              className="p-3.5 sm:px-5 flex flex-col md:flex-row md:items-center justify-between gap-3"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  {onAbrirMiembro ? (
                    <button
                      type="button"
                      onClick={() => onAbrirMiembro(s.usuario?.id)}
                      className="font-bold text-sm text-ink hover:text-brand hover:underline cursor-pointer"
                    >
                      {s.usuario?.apellido}, {s.usuario?.nombre}
                    </button>
                  ) : (
                    <span className="font-bold text-sm text-ink">
                      {s.usuario?.apellido}, {s.usuario?.nombre}
                    </span>
                  )}
                  <span className="text-xs text-ink-muted">DNI {s.usuario?.dni}</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                      s.puedeAprobar
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                        : 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300'
                    }`}
                  >
                    {s.puedeAprobar ? 'Entrante (para confirmar)' : 'Saliente (esperando confirmación)'}
                  </span>
                </div>

                <p className="text-xs text-ink-2">
                  <strong>{s.unidadOrigen?.nombre}</strong> → <strong>{s.unidadDestino?.nombre}</strong>
                  {s.solicitadoPor && (
                    <span className="text-ink-muted">
                      {' '}
                      • Solicitado por {s.solicitadoPor.nombre} {s.solicitadoPor.apellido}
                      {fechaStr ? ` (${fechaStr})` : ''}
                    </span>
                  )}
                </p>
              </div>

              {puedeEjecutar && (s.puedeAprobar || s.puedeRechazar) && (
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {s.puedeAprobar && secciones.length > 1 && (
                    <select
                      value={destId}
                      disabled={enProceso}
                      onChange={(e) =>
                        setSeccionSeleccionada((prev) => ({
                          ...prev,
                          [s.id]: Number(e.target.value),
                        }))
                      }
                      className="min-h-[36px] px-2.5 py-1 rounded-xl border border-rule bg-paper-2 text-xs font-semibold text-ink outline-none"
                    >
                      {secciones.map((u: any) => (
                        <option key={u.id} value={u.id}>
                          Confirmar en: {u.nombre}
                        </option>
                      ))}
                    </select>
                  )}

                  {s.puedeAprobar && (
                    <button
                      type="button"
                      disabled={enProceso}
                      onClick={() => handleAprobar(s)}
                      className="min-h-[36px] px-3.5 py-1.5 rounded-xl bg-brand text-brand-contrast hover:opacity-90 font-bold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      {enProceso ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Check className="w-3.5 h-3.5" />
                      )}
                      <span>Confirmar ingreso</span>
                    </button>
                  )}

                  {s.puedeRechazar && (
                    <button
                      type="button"
                      disabled={enProceso}
                      onClick={() => handleRechazar(s)}
                      className="min-h-[36px] px-3 py-1.5 rounded-xl border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 font-bold text-xs flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>{s.puedeAprobar ? 'Rechazar' : 'Cancelar'}</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
