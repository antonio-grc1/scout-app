import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  CreditCard,
  Loader2,
  UserCheck,
  UserX,
} from 'lucide-react';
import { useCapabilities } from '../../core/capabilities';
import { invalidarCampamentosQueries } from '../../hooks/useCampamentos';
import { useConfirmar } from '../../hooks/useConfirmar';
import {
  ESTADO_CARGO_CONFIG,
  formatearFechaLargaUTC,
  formatearMoneda,
  traducirErrorAmigable,
} from '../../lib/formatters';
import {
  gestionarInscripcionCampamento,
  obtenerDetalleCampamento,
  type CampamentoInscripcionDetalle,
} from '../../services/campamentos.service';
import { useToastStore } from '../../store/toastStore';
import { Drawer } from '../../components/ui/Drawer';

interface DrawerDetalleCampamentoProps {
  campamentoId: number | null;
  onCerrar: () => void;
}

type FiltroDetalle =
  | 'TODOS'
  | 'CONFIRMADO'
  | 'PENDIENTE'
  | 'NO_ASISTE'
  | 'SIN_FICHA'
  | 'CON_DEUDA';

export const DrawerDetalleCampamento: React.FC<DrawerDetalleCampamentoProps> = ({
  campamentoId,
  onCerrar,
}) => {
  const caps = useCapabilities();
  const queryClient = useQueryClient();
  const mostrarToast = useToastStore((s) => s.mostrarToast);
  const { pedir: pedirConfirmacion, dialogo: dialogoConfirmacion } = useConfirmar();

  const [filtro, setFiltro] = useState<FiltroDetalle>('TODOS');
  const [procesandoUsuarioId, setProcesandoUsuarioId] = useState<number | null>(null);

  const query = useQuery({
    queryKey: ['campamentos-detalle', campamentoId],
    enabled: campamentoId !== null,
    staleTime: 10_000,
    queryFn: () => obtenerDetalleCampamento(campamentoId!),
  });

  const inscripcionesFiltradas = useMemo(() => {
    const lista = query.data?.inscripciones ?? [];
    if (filtro === 'CONFIRMADO') return lista.filter((i) => i.estado === 'CONFIRMADO');
    if (filtro === 'PENDIENTE') return lista.filter((i) => i.estado === 'PENDIENTE');
    if (filtro === 'NO_ASISTE') {
      return lista.filter((i) => i.estado === 'NO_ASISTE' || i.estado === 'CANCELADO');
    }
    if (filtro === 'SIN_FICHA') {
      return lista.filter((i) => i.estado === 'CONFIRMADO' && !i.fichaValidada);
    }
    if (filtro === 'CON_DEUDA') {
      return lista.filter(
        (i) => i.cargo && i.cargo.estado !== 'PAGADO' && i.cargo.estado !== 'ANULADO',
      );
    }
    return lista;
  }, [query.data?.inscripciones, filtro]);

  const handleConfirmarPorEducador = async (ins: CampamentoInscripcionDetalle) => {
    if (!campamentoId) return;
    setProcesandoUsuarioId(ins.usuarioId);
    try {
      await gestionarInscripcionCampamento(campamentoId, ins.usuarioId, 'CONFIRMADO');
      await invalidarCampamentosQueries(queryClient);
      mostrarToast(
        `Asistencia confirmada para ${ins.usuario.nombre} ${ins.usuario.apellido}.`,
        'exito',
      );
    } catch (err) {
      mostrarToast(traducirErrorAmigable(err, 'No se pudo confirmar la asistencia.'), 'error');
    } finally {
      setProcesandoUsuarioId(null);
    }
  };

  const handleBajaPorEducador = (ins: CampamentoInscripcionDetalle) => {
    if (!campamentoId) return;
    const pagado = Number(ins.cargo?.montoPagado ?? 0);
    pedirConfirmacion(
      {
        titulo: `Dar de baja a ${ins.usuario.nombre} ${ins.usuario.apellido}`,
        mensaje: 'Se cancelará su asistencia a este campamento.',
        impacto:
          pagado > 0
            ? `Ya abonó ${formatearMoneda(pagado)}. El cargo se anulará y ese importe pasará automáticamente a su Saldo a favor.`
            : ins.cargo
              ? 'Su deuda pendiente para este campamento se anulará automáticamente.'
              : undefined,
        textoConfirmar: 'Confirmar baja',
        peligroso: true,
        tipoImpacto: pagado > 0 ? 'warn' : 'danger',
      },
      async () => {
        setProcesandoUsuarioId(ins.usuarioId);
        try {
          const res = await gestionarInscripcionCampamento(
            campamentoId,
            ins.usuarioId,
            'CANCELADO',
          );
          await invalidarCampamentosQueries(queryClient);
          mostrarToast(
            res.saldoLiberado > 0
              ? `Baja registrada. Se acreditaron ${formatearMoneda(res.saldoLiberado)} al saldo a favor.`
              : 'Baja registrada y deuda anulada.',
            'exito',
          );
        } catch (err) {
          mostrarToast(traducirErrorAmigable(err, 'No se pudo dar de baja.'), 'error');
        } finally {
          setProcesandoUsuarioId(null);
        }
      },
    );
  };

  const camp = query.data?.campamento;
  const res = query.data?.resumen;

  return (
    <Drawer
      abierto={campamentoId !== null}
      onCerrar={onCerrar}
      titulo={camp?.titulo ?? 'Asistencia del campamento'}
      subtitulo={
        camp
          ? `${camp.lugar} · ${formatearFechaLargaUTC(camp.fechaInicio)} al ${formatearFechaLargaUTC(camp.fechaFin)}`
          : 'Cargando…'
      }
      mode="drawer"
      maxWidthClass="sm:max-w-2xl"
      footer={
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onCerrar}
            className="s-btn-sec s-touch px-4 py-2.5 rounded-xl text-sm font-bold cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      }
    >
      {dialogoConfirmacion}

      {query.isLoading ? (
        <div className="py-12 text-center text-sm text-ink-muted flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-brand" />
          <span>Cargando detalle del campamento…</span>
        </div>
      ) : query.isError ? (
        <div className="s-badge-warn rounded-2xl p-4 text-sm font-semibold text-center space-y-2">
          <p>No se pudo cargar el detalle del campamento.</p>
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="s-btn-sec px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer"
          >
            Reintentar
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {res && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="s-panel rounded-xl p-3">
                <div className="text-[11px] font-bold uppercase text-ink-muted">Confirmados</div>
                <div className="text-xl font-extrabold s-tabular text-emerald-600 dark:text-emerald-400">
                  {res.confirmados}
                </div>
              </div>
              <div className="s-panel rounded-xl p-3">
                <div className="text-[11px] font-bold uppercase text-ink-muted">Pendientes</div>
                <div className="text-xl font-extrabold s-tabular text-amber-600 dark:text-amber-400">
                  {res.pendientes}
                </div>
              </div>
              <div className="s-panel rounded-xl p-3">
                <div className="text-[11px] font-bold uppercase text-ink-muted">No asisten</div>
                <div className="text-xl font-extrabold s-tabular text-ink-2">
                  {res.noAsisten + res.cancelados}
                </div>
              </div>
              <div className="s-panel rounded-xl p-3">
                <div className="text-[11px] font-bold uppercase text-ink-muted">Recaudado</div>
                <div className="text-base font-extrabold s-tabular text-ink">
                  {formatearMoneda(res.totalRecaudado)}
                </div>
                <div className="text-[11px] text-ink-muted s-tabular">
                  de {formatearMoneda(res.totalFacturado)}
                </div>
              </div>
            </div>
          )}

          {/* Filtros */}
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { id: 'TODOS', label: `Todos (${query.data?.inscripciones.length ?? 0})` },
                { id: 'CONFIRMADO', label: `Confirmados (${res?.confirmados ?? 0})` },
                { id: 'PENDIENTE', label: `Pendientes (${res?.pendientes ?? 0})` },
                {
                  id: 'NO_ASISTE',
                  label: `No asisten (${(res?.noAsisten ?? 0) + (res?.cancelados ?? 0)})`,
                },
                { id: 'SIN_FICHA', label: 'Confirmados sin ficha' },
                { id: 'CON_DEUDA', label: 'Con deuda' },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFiltro(f.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border cursor-pointer transition-colors ${
                  filtro === f.id
                    ? 'bg-brand text-brand-contrast border-brand'
                    : 'bg-surface text-ink-2 border-rule hover:bg-paper-2'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {inscripcionesFiltradas.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-muted">
              No hay miembros para el filtro seleccionado.
            </p>
          ) : (
            <div className="space-y-2.5">
              {inscripcionesFiltradas.map((ins) => {
                const cargoCfg = ins.cargo
                  ? ESTADO_CARGO_CONFIG[ins.cargo.estado] ?? ESTADO_CARGO_CONFIG.PENDIENTE
                  : null;
                const ocupado = procesandoUsuarioId === ins.usuarioId;
                return (
                  <div key={ins.id} className="s-panel rounded-2xl p-3.5 space-y-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-extrabold text-ink">
                          {ins.usuario.apellido}, {ins.usuario.nombre}
                        </div>
                        <div className="text-xs text-ink-muted flex items-center gap-2 flex-wrap">
                          <span>DNI {ins.usuario.dni}</span>
                          {ins.usuario.unidadNombre && <span>· {ins.usuario.unidadNombre}</span>}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap">
                        {ins.estado === 'CONFIRMADO' && (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold s-badge-ok inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Confirmado</span>
                          </span>
                        )}
                        {ins.estado === 'PENDIENTE' && (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold s-badge-warn inline-flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            <span>Pendiente</span>
                          </span>
                        )}
                        {(ins.estado === 'NO_ASISTE' || ins.estado === 'CANCELADO') && (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-paper-2 text-ink-muted border border-rule">
                            {ins.estado === 'NO_ASISTE' ? 'No asiste' : 'Baja'}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-rule text-xs">
                      <div className="flex flex-wrap items-center gap-2">
                        {ins.fichaValidada ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Ficha médica al día</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 font-semibold text-amber-700 dark:text-amber-400">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span>Sin ficha validada</span>
                          </span>
                        )}

                        {ins.cargo && cargoCfg && (
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold border ${cargoCfg.badgeClass}`}
                          >
                            <CreditCard className="w-3 h-3" />
                            <span>
                              {cargoCfg.label} · {formatearMoneda(ins.cargo.montoPagado)} /{' '}
                              {formatearMoneda(ins.cargo.montoFinal)}
                            </span>
                          </span>
                        )}
                      </div>

                      {caps.canEditCampamentos && (
                        <div className="flex items-center gap-1.5">
                          {ins.estado !== 'CONFIRMADO' && (
                            <button
                              type="button"
                              disabled={ocupado}
                              onClick={() => void handleConfirmarPorEducador(ins)}
                              className="s-btn-sec px-2.5 py-1 rounded-lg text-xs font-bold inline-flex items-center gap-1 cursor-pointer disabled:opacity-60"
                            >
                              <UserCheck className="w-3.5 h-3.5 text-brand" />
                              <span>Confirmar</span>
                            </button>
                          )}
                          {ins.estado === 'CONFIRMADO' && (
                            <button
                              type="button"
                              disabled={ocupado}
                              onClick={() => handleBajaPorEducador(ins)}
                              className="s-btn-danger px-2.5 py-1 rounded-lg text-xs font-bold inline-flex items-center gap-1 cursor-pointer disabled:opacity-60"
                            >
                              <UserX className="w-3.5 h-3.5" />
                              <span>Dar de baja</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
};
