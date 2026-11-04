import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  ShoppingBag,
  Calendar,
  MapPin,
  QrCode,
  Plus,
  RefreshCw,
  AlertCircle,
  Package,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { formatearMoneda, traducirErrorAmigable } from '../lib/formatters';
import { Button } from './ui/Button';
import { ModalCargarPedidoEvento } from './ModalCargarPedidoEvento';
import { ModalScannerQR } from './ModalScannerQR';
import { useModalOverlay } from '../hooks/useModalOverlay';

export interface ModalEventosUnidadProps {
  abierto: boolean;
  onCerrar: () => void;
  onToast?: (texto: string, tipo?: 'exito' | 'error') => void;
}

export const ModalEventosUnidad: React.FC<ModalEventosUnidadProps> = ({
  abierto,
  onCerrar,
  onToast,
}) => {
  const { tienePermiso } = useAuthStore();
  const puedeEscanear = tienePermiso('eventos.vender') || tienePermiso('eventos.gestionar');
  const [eventos, setEventos] = useState<any[]>([]);
  const [eventoSeleccionadoId, setEventoSeleccionadoId] = useState<number | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Estados para submodales
  const [eventoParaPedido, setEventoParaPedido] = useState<any | null>(null);
  const [scannerAbierto, setScannerAbierto] = useState(false);

  const { backdropProps, contentProps } = useModalOverlay({
    abierto,
    onCerrar,
    bloqueado: Boolean(eventoParaPedido || scannerAbierto),
  });

  useEffect(() => {
    if (abierto) {
      cargarEventos();
    }
  }, [abierto]);

  const cargarEventos = async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await api.get('/tesoreria/eventos');
      const lista = Array.isArray(res.data) ? res.data : [];
      setEventos(lista);
      if (lista.length > 0 && !eventoSeleccionadoId) {
        const primerHabilitado = lista.find((e: any) => e.estado === 'PUBLICADO');
        setEventoSeleccionadoId(primerHabilitado ? primerHabilitado.id : lista[0].id);
      }
    } catch (err) {
      setError(traducirErrorAmigable(err, 'No se pudieron cargar los eventos.'));
    } finally {
      setCargando(false);
    }
  };

  const eventosHabilitados = useMemo(
    () => eventos.filter((e) => e.estado === 'PUBLICADO'),
    [eventos],
  );
  const eventosFinalizados = useMemo(
    () => eventos.filter((e) => e.estado !== 'PUBLICADO'),
    [eventos],
  );

  const eventoSeleccionado = useMemo(() => {
    return (
      eventos.find((e) => e.id === eventoSeleccionadoId) ||
      eventosHabilitados[0] ||
      eventos[0] ||
      null
    );
  }, [eventos, eventoSeleccionadoId, eventosHabilitados]);

  if (!abierto) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
        {...backdropProps}
      >
        <div
          className="bg-surface border border-rule rounded-3xl max-w-2xl w-full shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
          {...contentProps}
        >
          {/* Encabezado */}
          <div className="flex items-center justify-between p-5 border-b border-rule bg-paper-2 shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-brand/10 text-brand">
                <ShoppingBag className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-ink text-base">
                  Eventos Económicos Activos
                </h3>
                <p className="text-[11px] text-ink-muted">
                  Ventas de recaudación del grupo y carga de pedidos para tu rama
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {puedeEscanear && (
                <button
                  type="button"
                  onClick={() => setScannerAbierto(true)}
                  className="px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer hover:bg-emerald-100 transition"
                  title="Escanear vales QR en puerta"
                >
                  <QrCode className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Escanear QR</span>
                </button>
              )}
              <button
                type="button"
                onClick={onCerrar}
                className="p-1.5 rounded-xl hover:bg-paper-3 text-ink-muted hover:text-ink transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Selector de Evento Desplegable */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 px-5 border-b border-rule bg-paper">
            <label htmlFor="selector-evento-unidad" className="text-xs font-bold text-ink-muted shrink-0">
              Evento Seleccionado:
            </label>
            <select
              id="selector-evento-unidad"
              value={eventoSeleccionado?.id || ''}
              onChange={(e) => setEventoSeleccionadoId(Number(e.target.value))}
              disabled={eventos.length === 0}
              className="flex-1 max-w-md bg-surface border border-rule rounded-xl px-3 py-1.5 text-xs font-bold text-ink focus:outline-none focus:ring-2 focus:ring-brand/30 transition cursor-pointer"
            >
              {eventos.length === 0 && <option value="">No hay eventos registrados</option>}
              {eventosHabilitados.length > 0 && (
                <optgroup label="🟢 Habilitados para venta">
                  {eventosHabilitados.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.titulo}
                    </option>
                  ))}
                </optgroup>
              )}
              {eventosFinalizados.length > 0 && (
                <optgroup label="⚪ Finalizados / Cerrados">
                  {eventosFinalizados.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.titulo} (Finalizado)
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          {/* Cuerpo: Muestra Únicamente el Evento Seleccionado */}
          <div className="p-5 overflow-y-auto space-y-4 flex-1">
            {cargando ? (
              <div className="py-12 flex flex-col items-center justify-center gap-3 text-ink-muted text-xs">
                <RefreshCw className="w-6 h-6 animate-spin text-brand" />
                <span>Cargando evento...</span>
              </div>
            ) : error ? (
              <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-200 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            ) : !eventoSeleccionado ? (
              <div className="py-12 text-center rounded-2xl bg-paper-2 border border-rule space-y-2 p-6">
                <ShoppingBag className="w-8 h-8 mx-auto text-ink-muted opacity-50" />
                <h4 className="text-sm font-bold text-ink">
                  No hay eventos económicos registrados
                </h4>
                <p className="text-xs text-ink-muted max-w-sm mx-auto">
                  Cuando Tesorería publique un nuevo evento (venta de empanadas, rifas, locro, etc.), aparecerá aquí para cargar pedidos.
                </p>
              </div>
            ) : (
              <div
                className={`p-5 rounded-2xl border transition space-y-4 ${
                  eventoSeleccionado.estado === 'PUBLICADO'
                    ? 'bg-paper-2 border-rule shadow-2xs'
                    : 'bg-paper-2/60 border-rule/60'
                }`}
              >
                {/* Cabecera del evento */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-base font-extrabold text-ink">
                        {eventoSeleccionado.titulo}
                      </h4>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase flex items-center gap-1 border ${
                          eventoSeleccionado.estado === 'PUBLICADO'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200 border-emerald-300 dark:border-emerald-800'
                            : 'bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300 border-slate-300 dark:border-slate-800'
                        }`}
                      >
                        {eventoSeleccionado.estado === 'PUBLICADO' ? (
                          <>
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>Habilitado para venta</span>
                          </>
                        ) : (
                          <>
                            <Clock className="w-3 h-3 text-slate-500" />
                            <span>Finalizado</span>
                          </>
                        )}
                      </span>
                    </div>
                    {eventoSeleccionado.descripcion && (
                      <p className="text-xs text-ink-muted leading-relaxed">
                        {eventoSeleccionado.descripcion}
                      </p>
                    )}
                  </div>

                  {/* Botón de acción */}
                  <div className="shrink-0 self-start sm:self-auto">
                    {eventoSeleccionado.estado === 'PUBLICADO' ? (
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        onClick={() => setEventoParaPedido(eventoSeleccionado)}
                        className="flex items-center gap-1.5 font-bold shadow-2xs"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Cargar Pedido</span>
                      </Button>
                    ) : (
                      <span className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-xs font-bold text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-slate-500" />
                        <span>Evento Finalizado</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Fecha y Lugar */}
                {(eventoSeleccionado.fechaEvento || eventoSeleccionado.lugarEntrega) && (
                  <div className="flex flex-wrap items-center gap-4 text-xs text-ink-muted py-2 border-y border-rule/60">
                    {eventoSeleccionado.fechaEvento && (
                      <span className="flex items-center gap-1.5">
                        <Calendar className="w-4 h-4 text-brand" />
                        <strong>Fecha de entrega:</strong>{' '}
                        {new Date(eventoSeleccionado.fechaEvento).toLocaleDateString('es-AR', {
                          weekday: 'long',
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </span>
                    )}
                    {eventoSeleccionado.lugarEntrega && (
                      <span className="flex items-center gap-1.5">
                        <MapPin className="w-4 h-4 text-amber-600" />
                        <strong>Lugar:</strong> {eventoSeleccionado.lugarEntrega}
                      </span>
                    )}
                  </div>
                )}

                {/* Productos y Precios */}
                {eventoSeleccionado.items && eventoSeleccionado.items.length > 0 && (
                  <div className="space-y-2 pt-1">
                    <span className="text-[11px] font-bold text-ink-muted uppercase tracking-wider">
                      Productos y Precios Disponibles:
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {eventoSeleccionado.items.map((it: any) => (
                        <div
                          key={it.id}
                          className="flex items-center justify-between p-2.5 rounded-xl bg-surface border border-rule text-xs"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <Package className="w-4 h-4 text-ink-muted shrink-0" />
                            <span className="font-semibold text-ink truncate">{it.nombre}</span>
                            {it.stockDisponible !== null && (
                              <span className="text-[10px] text-ink-muted">
                                ({it.stockDisponible} disp.)
                              </span>
                            )}
                          </div>
                          <span className="font-bold text-emerald-700 dark:text-emerald-400 shrink-0 ml-2">
                            {formatearMoneda(it.precioVenta)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {eventoSeleccionado.estado !== 'PUBLICADO' && (
                  <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-slate-500 shrink-0" />
                    <span>
                      Este evento ya ha finalizado y no acepta la carga de nuevos pedidos. Los pedidos existentes y sus vales QR se mantienen válidos para consulta.
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Pie */}
          <div className="p-4 bg-paper-2 border-t border-rule flex items-center justify-end shrink-0">
            <Button type="button" variant="ghost" size="sm" onClick={onCerrar}>
              Cerrar
            </Button>
          </div>
        </div>
      </div>

      {/* Modal para Cargar Pedido */}
      {eventoParaPedido && (
        <ModalCargarPedidoEvento
          abierto={true}
          onCerrar={() => setEventoParaPedido(null)}
          onGuardado={() => {
            setEventoParaPedido(null);
            cargarEventos();
            if (onToast) onToast('Pedido cargado exitosamente', 'exito');
          }}
          eventoId={eventoParaPedido.id}
          eventoTitulo={eventoParaPedido.titulo}
          itemsEvento={eventoParaPedido.items}
          onToast={onToast}
        />
      )}

      {/* Modal Escáner QR de Vales */}
      <ModalScannerQR
        abierto={scannerAbierto}
        onCerrar={() => setScannerAbierto(false)}
        onTicketValidado={() => {
          cargarEventos();
          if (onToast) onToast('Vale validado correctamente', 'exito');
        }}
      />
    </>
  );
};
