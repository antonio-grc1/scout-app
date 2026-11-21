import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calendar,
  Camera,
  CheckCircle2,
  ChevronRight,
  Clock,
  MapPin,
  PlusCircle,
  RefreshCw,
  ShoppingBag,
  Sparkles,
  Ticket,
  AlertTriangle,
  XCircle,
} from 'lucide-react';
import { api } from '../../api/client';
import { useActiveUnitStore, useCapabilities } from '../../core/capabilities';
import { useQrModalStore } from '../../core/qrModalStore';
import { useToastStore } from '../../store/toastStore';
import {
  esErrorOffline,
  formatearFecha,
  formatearMoneda,
  traducirErrorAmigable,
} from '../../lib/formatters';
import { Button, KpiCard, SegmentedTabs } from '../../components/ui';
import { ModalCrearEventoEconomico } from '../../components/ModalCrearEventoEconomico';

export interface EventoCatalogoItem {
  id: number;
  titulo: string;
  descripcion?: string | null;
  tipo: 'RECAUDACION_PEDIDOS' | 'FESTIVAL_ENTRADAS';
  estado: 'BORRADOR' | 'PUBLICADO' | 'FINALIZADO' | 'CANCELADO';
  fechaEvento: string;
  fechaFin?: string | null;
  lugarEntrega?: string | null;
  items: Array<{
    id: number;
    nombre: string;
    precioVenta: string | number;
    gananciaUnitaria: string | number;
    stockTotal?: number | null;
    stockDisponible: number | null;
  }>;
  metricas: {
    cantidadPedidos: number;
    totalVenta: number;
    totalGanancia: number;
    totalTickets: number;
    ticketsRetirados: number;
    porcentajeRetirado: number;
  };
}

type FiltroEstadoEvento = 'TODOS' | 'PUBLICADOS' | 'FINALIZADOS' | 'BORRADORES';

export const EventosCatalogoPage: React.FC = () => {
  const navigate = useNavigate();
  const caps = useCapabilities();
  const activeUnitId = useActiveUnitStore((s) => s.activeUnitId);
  const abrirQr = useQrModalStore((s) => s.abrirQr);
  const lastValidationAt = useQrModalStore((s) => s.lastValidationAt);
  const mostrarToast = useToastStore((s) => s.mostrarToast);

  const [eventos, setEventos] = useState<EventoCatalogoItem[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<FiltroEstadoEvento>('TODOS');
  const [modalCrearAbierto, setModalCrearAbierto] = useState(false);

  const cargarEventos = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await api.get<EventoCatalogoItem[]>('/tesoreria/eventos');
      setEventos(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      const msg = traducirErrorAmigable(err, 'No se pudieron cargar los eventos económicos.');
      if (esErrorOffline(err, msg)) {
        setEventos((prev) => {
          if (prev.length === 0) {
            setError('Sin conexión y sin eventos guardados en este dispositivo.');
          }
          return prev;
        });
      } else {
        setError(msg);
        mostrarToast(msg, 'error');
      }
    } finally {
      setCargando(false);
    }
  }, [mostrarToast]);

  useEffect(() => {
    void cargarEventos();
  }, [cargarEventos, lastValidationAt]);

  const counts = useMemo(() => {
    const publicados = eventos.filter((e) => e.estado === 'PUBLICADO').length;
    const finalizados = eventos.filter(
      (e) => e.estado === 'FINALIZADO' || e.estado === 'CANCELADO',
    ).length;
    const borradores = eventos.filter((e) => e.estado === 'BORRADOR').length;
    return {
      todos: eventos.length,
      publicados,
      finalizados,
      borradores,
    };
  }, [eventos]);

  const eventosFiltrados = useMemo(() => {
    if (filtro === 'PUBLICADOS') return eventos.filter((e) => e.estado === 'PUBLICADO');
    if (filtro === 'FINALIZADOS') {
      return eventos.filter((e) => e.estado === 'FINALIZADO' || e.estado === 'CANCELADO');
    }
    if (filtro === 'BORRADORES') return eventos.filter((e) => e.estado === 'BORRADOR');
    return eventos;
  }, [eventos, filtro]);

  const kpisGlobales = useMemo(() => {
    return eventos.reduce(
      (acc, ev) => {
        if (ev.estado === 'PUBLICADO') acc.activos += 1;
        acc.totalVenta += Number(ev.metricas?.totalVenta || 0);
        acc.totalGanancia += Number(ev.metricas?.totalGanancia || 0);
        acc.ticketsRetirados += Number(ev.metricas?.ticketsRetirados || 0);
        acc.totalTickets += Number(ev.metricas?.totalTickets || 0);
        return acc;
      },
      { activos: 0, totalVenta: 0, totalGanancia: 0, ticketsRetirados: 0, totalTickets: 0 },
    );
  }, [eventos]);

  const tabItems = useMemo(() => {
    const items: Array<{ id: FiltroEstadoEvento; label: string; badge: number }> = [
      { id: 'TODOS', label: 'Todos', badge: counts.todos },
      { id: 'PUBLICADOS', label: 'Publicados', badge: counts.publicados },
      { id: 'FINALIZADOS', label: 'Finalizados', badge: counts.finalizados },
    ];
    if (caps.canConfigureEventos && counts.borradores > 0) {
      items.push({ id: 'BORRADORES', label: 'Borradores', badge: counts.borradores });
    }
    return items;
  }, [caps.canConfigureEventos, counts]);

  const badgeEstado = (estado: EventoCatalogoItem['estado']) => {
    if (estado === 'PUBLICADO') {
      return {
        cls: 's-badge-ok',
        label: 'Publicado',
        icon: <CheckCircle2 className="w-3 h-3 shrink-0" />,
      };
    }
    if (estado === 'FINALIZADO') {
      return {
        cls: 's-badge-info',
        label: 'Finalizado',
        icon: <Clock className="w-3 h-3 shrink-0" />,
      };
    }
    if (estado === 'BORRADOR') {
      return {
        cls: 's-badge-warn',
        label: 'Borrador',
        icon: <AlertTriangle className="w-3 h-3 shrink-0" />,
      };
    }
    return {
      cls: 's-badge-err',
      label: 'Cancelado',
      icon: <XCircle className="w-3 h-3 shrink-0" />,
    };
  };

  return (
    <div className="space-y-5 s-anim-view">
      {activeUnitId !== 'ALL' && (
        <p className="text-[13px] text-ink-muted px-0.5" role="note">
          Los eventos se muestran para todo tu alcance: no se filtran por la sección elegida arriba.
        </p>
      )}
      {/* Cabecera del Módulo */}
      <div className="s-card rounded-2xl p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5 min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-5 h-5 text-brand shrink-0" />
            <h1 className="text-xl sm:text-2xl font-black text-ink tracking-tight">
              Eventos Económicos y Vales QR
            </h1>
          </div>
          <p className="text-sm text-ink-muted leading-relaxed">
            {caps.canSellEventos
              ? 'Elegí un evento para abrir su mesa operativa: POS de venta rápida, control de pedidos y liquidación de ganancias.'
              : 'Consultá los eventos publicados del grupo, cargá tus pedidos y descargá tus vales QR para retirar.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void cargarEventos()}
            disabled={cargando}
            leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${cargando ? 'animate-spin' : ''}`} />}
          >
            Refrescar
          </Button>

          {caps.canSellEventos && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => abrirQr('evento')}
              leftIcon={<Camera className="w-4 h-4 text-brand" />}
            >
              Escáner QR
            </Button>
          )}

          {caps.canConfigureEventos && (
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => setModalCrearAbierto(true)}
              leftIcon={<PlusCircle className="w-4 h-4" />}
            >
              Nuevo Evento
            </Button>
          )}
        </div>
      </div>

      {/* KPIs de gestión: solo para quien vende/gestiona (a familias el backend no les envía métricas) */}
      {caps.canSellEventos && (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="Eventos publicados"
          value={kpisGlobales.activos}
          hint={`${eventos.length} totales en catálogo`}
          tone="brand"
          icon={<Sparkles className="w-4 h-4" />}
        />
        <KpiCard
          label="Recaudación acumulada"
          value={formatearMoneda(kpisGlobales.totalVenta)}
          hint="Suma de todos los eventos"
          tone="ok"
          icon={<ShoppingBag className="w-4 h-4" />}
        />
        <KpiCard
          label="Ganancia familias"
          value={`+${formatearMoneda(kpisGlobales.totalGanancia)}`}
          hint="Asignable a Saldo a Favor"
          tone="info"
          icon={<Ticket className="w-4 h-4" />}
        />
        <KpiCard
          label="Vales entregados"
          value={`${kpisGlobales.ticketsRetirados} / ${kpisGlobales.totalTickets}`}
          hint="Retiros validados por QR"
          tone="neutral"
          icon={<CheckCircle2 className="w-4 h-4" />}
        />
      </div>
      )}

      {/* Filtros de Estado */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <SegmentedTabs
          items={tabItems}
          activeId={filtro}
          onChange={setFiltro}
          ariaLabel="Filtrar eventos por estado"
        />
      </div>

      {error && (
        <div
          role="alert"
          className="s-badge-err rounded-2xl p-4 text-sm font-semibold flex items-center justify-between gap-3 flex-wrap"
        >
          <span>{error}</span>
          <Button type="button" variant="secondary" size="sm" onClick={() => void cargarEventos()}>
            Reintentar
          </Button>
        </div>
      )}

      {/* Grilla Nivel 1: Tarjetas Tocables */}
      {cargando && eventos.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="s-card rounded-2xl p-5 space-y-3 animate-pulse">
              <div className="h-5 w-24 rounded-full bg-paper-3" />
              <div className="h-6 w-3/4 rounded-lg bg-paper-3" />
              <div className="h-4 w-1/2 rounded bg-paper-2" />
              <div className="h-14 w-full rounded-xl bg-paper-2" />
            </div>
          ))}
        </div>
      ) : error && eventos.length === 0 ? null : eventosFiltrados.length === 0 ? (
        <div className="s-card rounded-2xl p-8 sm:p-12 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-brand/10 text-brand flex items-center justify-center mx-auto">
            <Sparkles className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-extrabold text-ink">
            {eventos.length === 0
              ? 'No hay eventos económicos creados aún'
              : 'No hay eventos en esta categoría'}
          </h2>
          <p className="text-sm text-ink-muted max-w-md mx-auto leading-relaxed">
            {eventos.length === 0
              ? 'Organizá ventas de recaudación, festivales con entradas QR y acreditá las ganancias directamente en el Saldo a Favor de cada familia.'
              : 'Probá seleccionando otro filtro para ver el resto de los eventos registrados.'}
          </p>
          {eventos.length === 0 && caps.canConfigureEventos && (
            <div className="pt-1">
              <Button
                type="button"
                variant="primary"
                size="md"
                onClick={() => setModalCrearAbierto(true)}
                leftIcon={<PlusCircle className="w-4 h-4" />}
              >
                Crear Primer Evento
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 s-stagger">
          {eventosFiltrados.map((ev) => {
            const st = badgeEstado(ev.estado);
            const pctRetiro = Math.min(100, Math.max(0, Number(ev.metricas?.porcentajeRetirado || 0)));

            return (
              <button
                key={ev.id}
                type="button"
                onClick={() => navigate(`/eventos/${ev.id}`)}
                className="s-card s-card-hover s-event-card rounded-2xl p-5 text-left flex flex-col justify-between gap-4 cursor-pointer min-w-0"
              >
                <div className="space-y-3 min-w-0">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className={`${st.cls} px-3 py-0.5 rounded-full text-xs font-bold inline-flex items-center gap-1`}>
                      {st.icon}
                      <span>{st.label}</span>
                    </span>
                    <span className="px-2.5 py-0.5 rounded-lg bg-paper-2 border border-rule text-xs font-bold text-ink-2">
                      {ev.tipo === 'FESTIVAL_ENTRADAS' ? 'Entradas / Festival' : 'Recaudación'}
                    </span>
                  </div>

                  <div className="min-w-0">
                    <h2 className="text-[17px] font-black text-ink leading-snug line-clamp-2">
                      {ev.titulo}
                    </h2>
                    {ev.descripcion && (
                      <p className="text-[13px] text-ink-muted mt-1 line-clamp-2 leading-relaxed">
                        {ev.descripcion}
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5 text-[13px] text-ink-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Calendar className="w-4 h-4 text-brand shrink-0" />
                      <span className="truncate">{formatearFecha(ev.fechaEvento)}</span>
                    </div>
                    {ev.lugarEntrega && (
                      <div className="flex items-center gap-2 min-w-0">
                        <MapPin className="w-4 h-4 text-ink-muted shrink-0" />
                        <span className="truncate">{ev.lugarEntrega}</span>
                      </div>
                    )}
                  </div>

                  {/* Productos resumen */}
                  {Array.isArray(ev.items) && ev.items.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {ev.items.slice(0, 3).map((it) => (
                        <span
                          key={it.id}
                          className="px-2.5 py-0.5 rounded-lg bg-paper-2 border border-rule text-xs font-semibold text-ink-2 s-tabular"
                        >
                          {it.nombre} · {formatearMoneda(Number(it.precioVenta))}
                        </span>
                      ))}
                      {ev.items.length > 3 && (
                        <span className="px-2.5 py-0.5 rounded-lg bg-paper-2 text-xs font-bold text-ink-muted">
                          +{ev.items.length - 3} más
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-3 pt-3.5 border-t border-rule">
                  {caps.canSellEventos ? (
                    <>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-xs font-bold uppercase tracking-wider text-ink-muted block">
                            Recaudado
                          </span>
                          <span className="text-base font-black text-ink s-tabular">
                            {formatearMoneda(ev.metricas?.totalVenta || 0)}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-bold uppercase tracking-wider text-ink-muted block">
                            Pedidos / Vales
                          </span>
                          <span className="text-base font-black text-brand s-tabular">
                            {ev.metricas?.cantidadPedidos || 0} · {ev.metricas?.ticketsRetirados || 0}/{ev.metricas?.totalTickets || 0}
                          </span>
                        </div>
                      </div>

                      <div
                        role="progressbar"
                        aria-label="Vales retirados"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.round(pctRetiro)}
                        className="w-full h-1.5 bg-paper-3 rounded-full overflow-hidden"
                      >
                        <div
                          className="h-full bg-brand rounded-full s-progress-bar"
                          style={{ width: `${pctRetiro}%` }}
                        />
                      </div>
                    </>
                  ) : null}

                  <div className="flex items-center justify-between text-[13px] font-extrabold text-brand">
                    <span>{caps.canSellEventos ? 'Abrir mesa operativa' : 'Ver productos y pedir'}</span>
                    <ChevronRight className="w-4 h-4 shrink-0" />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <ModalCrearEventoEconomico
        abierto={modalCrearAbierto}
        onCerrar={() => setModalCrearAbierto(false)}
        onGuardado={() => {
          void cargarEventos();
        }}
        onToast={(texto, tipo) => mostrarToast(texto, tipo === 'error' ? 'error' : 'exito')}
      />
    </div>
  );
};
