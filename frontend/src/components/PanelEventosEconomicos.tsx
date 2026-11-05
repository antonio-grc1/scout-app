import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Sparkles,
  PlusCircle,
  Camera,
  ShoppingBag,
  Calendar,
  CheckCircle2,
  Clock,
  QrCode,
  User,
  Phone,
  Scale,
  RefreshCw,
  Award,
  ChevronRight,
  Filter,
  Edit2,
  Trash2,
  Landmark,
  AlertTriangle,
  XCircle,
  Search,
  X,
} from 'lucide-react';
import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { useToastStore, mostrarToastConDeshacer } from '../store/toastStore';
import { formatearMoneda, traducirErrorAmigable, normalizarTextoBusqueda } from '../lib/formatters';
import { Button } from './ui/Button';
import { ModalCrearEventoEconomico } from './ModalCrearEventoEconomico';
import { ModalCargarPedidoEvento } from './ModalCargarPedidoEvento';
import { ModalScannerQR } from './ModalScannerQR';
import { ModalTicketQR, type TicketData } from './ModalTicketQR';
import { ModalConfirmacion } from './ModalConfirmacion';

export interface PanelEventosEconomicosProps {
  onToast?: (texto: string, tipo?: 'exito' | 'error') => void;
}

interface EventoItem {
  id: number;
  titulo: string;
  descripcion?: string | null;
  tipo: 'RECAUDACION_PEDIDOS' | 'FESTIVAL_ENTRADAS';
  estado: 'BORRADOR' | 'PUBLICADO' | 'FINALIZADO' | 'CANCELADO';
  fechaEvento: string;
  lugarEntrega?: string | null;
  items: Array<{
    id: number;
    nombre: string;
    precioVenta: string | number;
    costoUnitario: string | number;
    gananciaUnitaria: string | number;
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

export const PanelEventosEconomicos: React.FC<PanelEventosEconomicosProps> = ({ onToast }) => {
  const puedeGestionarEventos = useAuthStore(
    (s) =>
      s.tienePermiso('eventos.gestionar') ||
      s.tienePermiso('tesoreria.gestionar') ||
      s.tienePermiso('tesoreria.conceptos_planes'),
  );
  const puedeVender = useAuthStore(
    (s) =>
      s.tienePermiso('eventos.vender') ||
      s.tienePermiso('eventos.gestionar') ||
      s.tienePermiso('tesoreria.gestionar'),
  );
  const [eventos, setEventos] = useState<EventoItem[]>([]);
  const [eventoSeleccionadoId, setEventoSeleccionadoId] = useState<number | null>(null);
  const [eventoDetalle, setEventoDetalle] = useState<any | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');

  // Modales
  const [modalCrearEventoAbierto, setModalCrearEventoAbierto] = useState(false);
  const [eventoAEditar, setEventoAEditar] = useState<any | null>(null);
  const [modalCargarPedidoAbierto, setModalCargarPedidoAbierto] = useState(false);
  const [pedidoAEditar, setPedidoAEditar] = useState<any | null>(null);
  const [modalScannerAbierto, setModalScannerAbierto] = useState(false);
  const [modalTicketQR, setModalTicketQR] = useState<{ abierto: boolean; ticket: TicketData | null }>({
    abierto: false,
    ticket: null,
  });

  // Acreditando ganancias
  const [modalAcreditarAbierto, setModalAcreditarAbierto] = useState(false);
  const [acreditando, setAcreditando] = useState(false);

  // Eliminar evento
  const [modalEliminarEventoAbierto, setModalEliminarEventoAbierto] = useState(false);
  const [eliminandoEvento, setEliminandoEvento] = useState(false);

  const cargarEventos = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await api.get('/tesoreria/eventos');
      const lista: EventoItem[] = res.data || [];
      setEventos(lista);
      if (lista.length > 0 && !eventoSeleccionadoId) {
        // Priorizar el primer evento habilitado / publicado
        const primerHabilitado = lista.find((e) => e.estado === 'PUBLICADO');
        setEventoSeleccionadoId(primerHabilitado ? primerHabilitado.id : lista[0].id);
      }
    } catch (err) {
      const msg = traducirErrorAmigable(err, 'No se pudieron cargar los eventos económicos.');
      const esOffline =
        (typeof navigator !== 'undefined' && !navigator.onLine) ||
        msg.toLowerCase().includes('offline') ||
        msg.toLowerCase().includes('sin conexión') ||
        msg.toLowerCase().includes('sin conexion');

      if (esOffline) {
        if (eventos.length === 0) {
          setError('Estás sin conexión y los eventos aún no han sido sincronizados en este dispositivo.');
        } else {
          setError(null);
        }
      } else {
        setError(msg);
        if (onToast) onToast(msg, 'error');
      }
    } finally {
      setCargando(false);
    }
  }, [eventoSeleccionadoId, onToast]);

  const cargarDetalleEvento = useCallback(async (id: number) => {
    try {
      const res = await api.get(`/tesoreria/eventos/${id}`);
      setEventoDetalle(res.data);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    cargarEventos();
  }, [cargarEventos]);

  useEffect(() => {
    setBusqueda('');
    if (eventoSeleccionadoId) {
      cargarDetalleEvento(eventoSeleccionadoId);
    } else {
      setEventoDetalle(null);
    }
  }, [eventoSeleccionadoId, cargarDetalleEvento]);

  const eventoActivo = eventos.find((e) => e.id === eventoSeleccionadoId) || eventos[0];

  const eventosHabilitados = useMemo(
    () => eventos.filter((e) => e.estado === 'PUBLICADO'),
    [eventos],
  );
  const eventosFinalizados = useMemo(
    () => eventos.filter((e) => e.estado !== 'PUBLICADO'),
    [eventos],
  );

  const pedidosFiltrados = useMemo(() => {
    const pedidos = eventoDetalle?.pedidos || [];
    const q = normalizarTextoBusqueda(busqueda);
    if (!q) return pedidos;

    return pedidos.filter((p: any) => {
      const matchComprador = p.compradorNombre
        ? normalizarTextoBusqueda(p.compradorNombre).includes(q)
        : false;
      const matchContacto = p.compradorContacto
        ? normalizarTextoBusqueda(p.compradorContacto).includes(q)
        : false;
      const matchVendedor = p.vendedorUsuario
        ? normalizarTextoBusqueda(`${p.vendedorUsuario.nombre} ${p.vendedorUsuario.apellido}`).includes(q)
        : false;
      const matchTotal = String(p.total).includes(q);
      const matchEstado = p.estado ? normalizarTextoBusqueda(p.estado).includes(q) : false;
      const matchItems = p.detalles?.some((d: any) =>
        d.item?.nombre ? normalizarTextoBusqueda(d.item.nombre).includes(q) : false,
      );

      return matchComprador || matchContacto || matchVendedor || matchTotal || matchEstado || matchItems;
    });
  }, [eventoDetalle?.pedidos, busqueda]);


  const pedidosPendientesAcreditar = (eventoDetalle?.pedidos || []).filter(
    (p: any) =>
      !p.gananciaAcreditada &&
      Number(p.totalGanancia) >= 0 &&
      p.vendedorUsuario &&
      p.tickets?.length > 0 &&
      p.tickets.every((t: any) => t.estado === 'UTILIZADO'),
  );

  const hayDetallePedidos = Boolean(eventoDetalle?.pedidos);
  const cantPedidosListos = pedidosPendientesAcreditar.length;
  const montoGananciaLista = hayDetallePedidos
    ? pedidosPendientesAcreditar.reduce((acc: number, p: any) => acc + Number(p.totalGanancia), 0)
    : (eventoActivo?.metricas.totalGanancia || 0);

  const ejecutarAcreditarGanancias = async () => {
    if (!eventoActivo) return;

    setAcreditando(true);
    try {
      const res = await api.post('/tesoreria/eventos/acreditar-ganancias', {
        eventoId: eventoActivo.id,
        soloRetirados: true,
      });
      const { pedidosAcreditados, totalGananciaAcreditada } = res.data;
      if (onToast) {
        onToast(
          `¡Éxito! Se acreditaron ${formatearMoneda(totalGananciaAcreditada)} a las familias (${pedidosAcreditados} pedidos liquidados).`,
          'exito',
        );
      }
      setModalAcreditarAbierto(false);
      cargarEventos();
      cargarDetalleEvento(eventoActivo.id);
    } catch (err) {
      const msg = traducirErrorAmigable(err, 'No se pudieron acreditar las ganancias.');
      if (onToast) onToast(msg, 'error');
    } finally {
      setAcreditando(false);
    }
  };

  const ejecutarEliminarEvento = async () => {
    if (!eventoActivo) return;
    const eventoAEliminar = { ...eventoActivo };

    setEliminandoEvento(true);
    try {
      await api.delete(`/tesoreria/eventos/${eventoAEliminar.id}`);
      setModalEliminarEventoAbierto(false);
      setEventoSeleccionadoId(null);
      setEventoDetalle(null);
      await cargarEventos();

      mostrarToastConDeshacer(
        `Evento "${eventoAEliminar.titulo}" eliminado.`,
        async () => {
          try {
            await api.post('/tesoreria/eventos', {
              titulo: eventoAEliminar.titulo,
              descripcion: eventoAEliminar.descripcion || undefined,
              tipo: eventoAEliminar.tipo,
              fechaEvento: eventoAEliminar.fechaEvento,
              lugarEntrega: eventoAEliminar.lugarEntrega || undefined,
              rubroId: eventoDetalle?.rubroId || undefined,
              cuentaId: eventoDetalle?.cuentaId || undefined,
              items: (eventoAEliminar.items || []).map((it) => ({
                nombre: it.nombre,
                precioVenta: Number(it.precioVenta),
                costoUnitario: Number(it.costoUnitario || 0),
                gananciaUnitaria: Number(it.gananciaUnitaria || 0),
                stockTotal: it.stockDisponible,
              })),
            });
            await cargarEventos();
            useToastStore.getState().mostrarToast(`Evento "${eventoAEliminar.titulo}" restaurado.`);
          } catch (err: any) {
            const msg = traducirErrorAmigable(err, 'No se pudo restaurar el evento.');
            useToastStore.getState().mostrarToast(msg, 'error');
          }
        },
      );
    } catch (err) {
      const msg = traducirErrorAmigable(err, 'No se pudo eliminar el evento.');
      if (onToast) onToast(msg, 'error');
    } finally {
      setEliminandoEvento(false);
    }
  };

  const handleVerTicket = (ticket: any, pedido: any) => {
    setModalTicketQR({
      abierto: true,
      ticket: {
        id: ticket.id,
        tokenQr: ticket.tokenQr,
        cantidad: ticket.cantidad,
        estado: ticket.estado,
        fechaUso: ticket.fechaUso,
        item: {
          nombre: ticket.item?.nombre || 'Producto',
          precioVenta: ticket.item?.precioVenta || 0,
        },
        pedido: {
          id: pedido.id,
          compradorNombre: pedido.compradorNombre,
          compradorContacto: pedido.compradorContacto,
          evento: {
            id: eventoActivo.id,
            titulo: eventoActivo.titulo,
            fechaEvento: eventoActivo.fechaEvento,
            lugarEntrega: eventoActivo.lugarEntrega,
          },
          vendedorUsuario: pedido.vendedorUsuario,
        },
      },
    });
  };

  return (
    <div className="space-y-4">
      {/* Barra Superior con Selector de Evento y Acciones Principales */}
      <div className="p-4 rounded-2xl bg-paper-2 border border-rule flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap flex-1">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-brand shrink-0" />
            <h2 className="text-base font-black text-ink">Eventos Económicos y Vales QR</h2>
          </div>

          {/* Selector de Evento */}
          {eventos.length > 0 && (
            <div className="flex items-center gap-2 pl-0 sm:pl-2 border-l-0 sm:border-l border-rule flex-wrap w-full sm:w-auto">
              <label htmlFor="selector-evento-tesoreria" className="text-xs font-bold text-ink-muted shrink-0">
                Evento:
              </label>
              <select
                id="selector-evento-tesoreria"
                value={eventoSeleccionadoId || ''}
                onChange={(e) => setEventoSeleccionadoId(Number(e.target.value))}
                className="py-1.5 px-3 rounded-xl bg-surface border border-rule text-xs font-bold text-ink focus:outline-brand cursor-pointer w-full sm:w-auto sm:max-w-[280px] truncate"
              >
                {eventosHabilitados.length > 0 && (
                  <optgroup label="🟢 Habilitados para venta">
                    {eventosHabilitados.map((ev) => (
                      <option key={ev.id} value={ev.id}>
                        {ev.titulo} ({new Date(ev.fechaEvento).toLocaleDateString('es-AR')})
                      </option>
                    ))}
                  </optgroup>
                )}
                {eventosFinalizados.length > 0 && (
                  <optgroup label="⚪ Finalizados / Cerrados">
                    {eventosFinalizados.map((ev) => (
                      <option key={ev.id} value={ev.id}>
                        {ev.titulo} ({ev.estado === 'FINALIZADO' ? 'Finalizado' : ev.estado})
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>

              {eventoActivo && (
                <span
                  className={`px-2.5 py-1 rounded-xl text-xs font-black flex items-center gap-1.5 border shrink-0 ${
                    eventoActivo.estado === 'PUBLICADO'
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200 border-emerald-300 dark:border-emerald-800'
                      : eventoActivo.estado === 'FINALIZADO'
                      ? 'bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300 border-slate-300 dark:border-slate-800'
                      : eventoActivo.estado === 'BORRADOR'
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200 border-amber-300 dark:border-amber-800'
                      : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200 border-rose-300 dark:border-rose-800'
                  }`}
                >
                  {eventoActivo.estado === 'PUBLICADO' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
                  {eventoActivo.estado === 'FINALIZADO' && <Clock className="w-3.5 h-3.5 text-slate-500" />}
                  {eventoActivo.estado === 'BORRADOR' && <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />}
                  {eventoActivo.estado === 'CANCELADO' && <XCircle className="w-3.5 h-3.5 text-rose-600" />}
                  <span>
                    {eventoActivo.estado === 'PUBLICADO'
                      ? 'Habilitado'
                      : eventoActivo.estado === 'FINALIZADO'
                      ? 'Finalizado (Cerrado)'
                      : eventoActivo.estado === 'BORRADOR'
                      ? 'Borrador'
                      : 'Cancelado'}
                  </span>
                </span>
              )}
            </div>
          )}
        </div>

        {/* Botones de Acción */}
        <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 w-full md:w-auto">
          {puedeVender && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setModalScannerAbierto(true)}
              className="col-span-2 sm:col-span-1 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold justify-center"
              title="Escanear con cámara los vales QR"
            >
              <Camera className="w-4 h-4 shrink-0" />
              <span>Escanear QR / Validar</span>
            </Button>
          )}

          {eventoActivo && (
            <Button
              variant="secondary"
              size="sm"
              disabled={eventoActivo.estado !== 'PUBLICADO'}
              onClick={() => {
                setPedidoAEditar(null);
                setModalCargarPedidoAbierto(true);
              }}
              className="gap-1.5 justify-center"
              title={
                eventoActivo.estado !== 'PUBLICADO'
                  ? 'El evento está finalizado/cerrado: no se pueden ingresar nuevos pedidos'
                  : 'Cargar un nuevo pedido para este evento'
              }
            >
              <ShoppingBag className="w-3.5 h-3.5 text-brand shrink-0" />
              <span>Cargar Pedido</span>
            </Button>
          )}

          {puedeGestionarEventos && (
            <Button
              variant={eventos.length === 0 ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => {
                setEventoAEditar(null);
                setModalCrearEventoAbierto(true);
              }}
              className="gap-1.5 justify-center font-bold"
            >
              <PlusCircle className="w-4 h-4 shrink-0" />
              <span>+ Nuevo Evento</span>
            </Button>
          )}

          {puedeGestionarEventos && eventoActivo && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setEventoAEditar(eventoDetalle || eventoActivo);
                setModalCrearEventoAbierto(true);
              }}
              className="gap-1.5 justify-center"
            >
              <Edit2 className="w-3.5 h-3.5 text-ink-muted hover:text-brand shrink-0" />
              <span>Editar</span>
            </Button>
          )}

          {puedeGestionarEventos && eventoActivo && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setModalEliminarEventoAbierto(true)}
              className="gap-1.5 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-900/60 hover:bg-rose-50 dark:hover:bg-rose-950/40 justify-center"
              title="Eliminar este evento económico"
            >
              <Trash2 className="w-3.5 h-3.5 shrink-0" />
              <span>Eliminar</span>
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs">
          {error}
        </div>
      )}

      {/* Alerta si el evento está finalizado o en borrador */}
      {eventoActivo?.estado === 'FINALIZADO' && (
        <div className="p-3.5 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Clock className="w-4 h-4 text-slate-500 shrink-0" />
            <span>
              <strong>Evento Finalizado:</strong> Cerrado a la carga de nuevos pedidos. Podés continuar registrando cobros pendientes, validando vales QR en puerta y acreditando ganancias a las familias.
            </span>
          </div>
        </div>
      )}

      {eventoActivo?.estado === 'BORRADOR' && (
        <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>Evento en Borrador:</strong> Este evento está oculto para miembros y familias. Podés editarlo para publicarlo cuando esté listo para recibir ventas.
            </span>
          </div>
        </div>
      )}

      {/* Tarjetas Métricas del Evento Activo */}
      {eventoActivo && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Total Venta Recaudada */}
          <div className="p-4 rounded-2xl bg-paper-2 border border-rule flex flex-col justify-between">
            <span className="text-xs font-semibold text-ink-muted">Total Recaudado</span>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-black text-ink">
                {formatearMoneda(eventoActivo.metricas.totalVenta)}
              </span>
              <span className="text-xs font-bold text-ink-muted">
                {eventoActivo.metricas.cantidadPedidos} pedidos
              </span>
            </div>
          </div>

          {/* Ganancia Asignable a Familias */}
          <div className="p-4 rounded-2xl bg-paper-2 border border-rule flex flex-col justify-between">
            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
              <Award className="w-4 h-4" />
              Ganancia para Familias
            </span>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                +{formatearMoneda(eventoActivo.metricas.totalGanancia)}
              </span>
              <span className="text-xs font-bold text-ink-muted">Para saldo a favor</span>
            </div>
          </div>

          {/* Progreso de Retiro / Entrega */}
          <div className="p-4 rounded-2xl bg-paper-2 border border-rule flex flex-col justify-between">
            <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" />
              Progreso de Entrega
            </span>
            <div className="mt-2">
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-black text-ink">
                  {eventoActivo.metricas.ticketsRetirados} / {eventoActivo.metricas.totalTickets}
                </span>
                <span className="text-xs font-bold text-blue-600 dark:text-blue-400">
                  {eventoActivo.metricas.porcentajeRetirado}%
                </span>
              </div>
              <div className="w-full h-1.5 bg-paper-3 rounded-full overflow-hidden mt-1.5">
                <div
                  className="h-full bg-blue-500 rounded-full"
                  style={{ width: `${Math.min(100, eventoActivo.metricas.porcentajeRetirado)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Acción de Liquidación */}
          {puedeGestionarEventos && (
            <div className="p-4 rounded-2xl bg-paper-2 border border-rule flex flex-col justify-between">
              <div>
                <span className="text-xs font-semibold text-ink-muted block">Liquidación a Familias</span>
                <span className="text-[11px] text-ink-muted block mt-0.5">Acredita en Saldo a Favor</span>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setModalAcreditarAbierto(true)}
                disabled={acreditando || eventoActivo.metricas.cantidadPedidos <= 0}
                className="mt-2 w-full gap-1.5 text-xs text-emerald-700 dark:text-emerald-300 font-bold border-emerald-300 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950"
              >
                <Award className="w-3.5 h-3.5 text-emerald-600" />
                <span>Acreditar Ganancias</span>
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Estado vacío cuando no hay eventos creados */}
      {eventos.length === 0 && !cargando && (
        <div className="p-8 sm:p-12 text-center rounded-2xl border border-dashed border-rule bg-surface space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
            <Sparkles className="w-7 h-7" />
          </div>
          <div className="space-y-1.5 max-w-md mx-auto">
            <h3 className="text-base font-bold text-ink">
              No hay eventos económicos creados aún
            </h3>
            <p className="text-xs text-ink-muted leading-relaxed">
              Los eventos económicos te permiten organizar ventas de recaudación (empanadas, pizzas, rifas, locro o festivales), generar vales digitales con código QR para retiro y liquidar ganancias para saldo a favor de las familias.
            </p>
          </div>
          {puedeGestionarEventos && (
            <Button
              variant="primary"
              size="md"
              onClick={() => {
                setEventoAEditar(null);
                setModalCrearEventoAbierto(true);
              }}
              leftIcon={<PlusCircle className="w-4 h-4" />}
              className="gap-1.5 font-bold mx-auto"
            >
              Crear Primer Evento Económico
            </Button>
          )}
        </div>
      )}

      {/* TABLA DE PEDIDOS Y VALES DEL EVENTO */}
      {eventos.length > 0 && (
      <div className="rounded-2xl border border-rule bg-surface overflow-hidden shadow-2xs">
        <div className="p-3 bg-paper-2 border-b border-rule flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center justify-between sm:justify-start gap-2">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-brand shrink-0" />
              <h3 className="text-xs font-black text-ink">
                Pedidos y Vales QR ({pedidosFiltrados.length}
                {busqueda && ` de ${eventoDetalle?.pedidos?.length || 0}`})
              </h3>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => eventoSeleccionadoId && cargarDetalleEvento(eventoSeleccionadoId)}
              className="gap-1 text-xs sm:hidden shrink-0"
              title="Refrescar pedidos"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>

          <div className="flex items-center gap-2 flex-1 max-w-md">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
              <input
                type="text"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por comprador, scout, producto, teléfono..."
                className="w-full pl-8 pr-7 py-1.5 rounded-xl bg-paper border border-rule text-xs font-medium text-ink placeholder:text-ink-muted focus:outline-brand"
              />
              {busqueda && (
                <button
                  type="button"
                  onClick={() => setBusqueda('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-ink-muted hover:text-ink rounded cursor-pointer"
                  title="Limpiar búsqueda"
                  aria-label="Limpiar búsqueda"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => eventoSeleccionadoId && cargarDetalleEvento(eventoSeleccionadoId)}
              className="gap-1 text-xs hidden sm:flex shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refrescar</span>
            </Button>
          </div>
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-rule bg-paper-2/60 text-ink-muted">
                <th className="py-2.5 px-4 font-bold">Comprador</th>
                <th className="py-2.5 px-4 font-bold">Scout / Vendedor</th>
                <th className="py-2.5 px-4 font-bold">Productos / Detalle</th>
                <th className="py-2.5 px-4 font-bold text-right">Total</th>
                <th className="py-2.5 px-4 font-bold text-right">Ganancia</th>
                <th className="py-2.5 px-4 font-bold text-center">Estado Pago</th>
                <th className="py-2.5 px-4 font-bold text-center">Vales / Retiro QR</th>
                <th className="py-2.5 px-4 font-bold text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule font-medium">
              {pedidosFiltrados.map((p: any) => {
                const todosRetirados = p.tickets?.length > 0 && p.tickets.every((t: any) => t.estado === 'UTILIZADO');
                const algunoRetirado = p.tickets?.some((t: any) => t.estado === 'UTILIZADO');

                return (
                  <tr key={p.id} className="hover:bg-paper-2/40 transition">
                    <td className="py-2.5 px-4 font-bold text-ink">
                      <div>{p.compradorNombre}</div>
                      {p.compradorContacto && (
                        <span className="text-[10px] text-ink-muted block">{p.compradorContacto}</span>
                      )}
                    </td>

                    <td className="py-2.5 px-4 text-ink-muted">
                      {p.vendedorUsuario ? (
                        <span className="font-semibold text-ink">
                          {p.vendedorUsuario.nombre} {p.vendedorUsuario.apellido}
                        </span>
                      ) : (
                        <span className="text-ink-muted italic">Venta General</span>
                      )}
                    </td>

                    <td className="py-2.5 px-4 text-ink">
                      <div className="space-y-0.5">
                        {p.detalles?.map((d: any) => (
                          <div key={d.id} className="text-xs">
                            <span className="font-black text-brand">{d.cantidad}x</span> {d.item?.nombre}
                          </div>
                        ))}
                      </div>
                    </td>

                    <td className="py-2.5 px-4 text-right font-black text-ink">
                      {formatearMoneda(Number(p.total))}
                    </td>

                    <td className="py-2.5 px-4 text-right font-bold text-emerald-600 dark:text-emerald-400">
                      +{formatearMoneda(Number(p.totalGanancia))}
                      {p.gananciaAcreditada && (
                        <span className="block text-[10px] text-emerald-500 font-normal">Acreditado ✓</span>
                      )}
                    </td>

                    <td className="py-2.5 px-4 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-black ${
                          p.estado === 'PAGADO'
                            ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200'
                            : algunoRetirado
                            ? 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-200 border border-rose-300 dark:border-rose-800'
                            : 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-200'
                        }`}
                      >
                        {p.estado === 'PENDIENTE' && algunoRetirado ? 'PENDIENTE (RETIRADO)' : p.estado}
                      </span>
                    </td>

                    <td className="py-2.5 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5 flex-wrap">
                        {p.tickets?.map((t: any, idx: number) => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => handleVerTicket(t, p)}
                            className={`px-2 py-1 rounded-xl text-[11px] font-black flex items-center gap-1 border transition cursor-pointer ${
                              t.estado === 'UTILIZADO'
                                ? 'bg-slate-100 dark:bg-slate-900 text-slate-500 border-slate-300 dark:border-slate-800 line-through'
                                : 'bg-brand/10 text-brand border-brand/30 hover:bg-brand/20'
                            }`}
                            title={t.estado === 'UTILIZADO' ? 'Retirado' : 'Click para ver vale con QR'}
                          >
                            <QrCode className="w-3.5 h-3.5" />
                            <span>Vale #{idx + 1}</span>
                          </button>
                        ))}
                      </div>
                    </td>

                    <td className="py-2.5 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {p.estado === 'PENDIENTE' ? (
                          <Button
                            variant="primary"
                            size="sm"
                            disabled={p.gananciaAcreditada}
                            onClick={() => {
                              setPedidoAEditar({ ...p, algunoRetirado });
                              setModalCargarPedidoAbierto(true);
                            }}
                            className="gap-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                            title={
                              algunoRetirado
                                ? 'Pedido retirado pendiente de cobro: registrar cobro'
                                : 'Registrar cobro de este pedido'
                            }
                          >
                            <Landmark className="w-3.5 h-3.5" />
                            <span>Cobrar</span>
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={algunoRetirado || p.gananciaAcreditada}
                            onClick={() => {
                              setPedidoAEditar({ ...p, algunoRetirado });
                              setModalCargarPedidoAbierto(true);
                            }}
                            className="gap-1 text-xs"
                            title={
                              algunoRetirado
                                ? 'No se puede editar: ya tiene vales retirados'
                                : p.gananciaAcreditada
                                ? 'No se puede editar: ganancias ya acreditadas'
                                : 'Editar datos o cantidades del pedido'
                            }
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            <span>Editar</span>
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {(!eventoDetalle?.pedidos || eventoDetalle.pedidos.length === 0) ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-ink-muted">
                    No hay pedidos registrados para este evento. Hacé clic en "Cargar Pedido" para registrar la primera venta.
                  </td>
                </tr>
              ) : pedidosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-ink-muted">
                    <p>No se encontraron pedidos que coincidan con "{busqueda}".</p>
                    <button
                      type="button"
                      onClick={() => setBusqueda('')}
                      className="mt-1 text-xs text-brand font-bold hover:underline cursor-pointer"
                    >
                      Limpiar búsqueda
                    </button>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {/* Mobile Responsive Cards View */}
        <div className="md:hidden divide-y divide-rule">
          {(!eventoDetalle?.pedidos || eventoDetalle.pedidos.length === 0) ? (
            <div className="p-8 text-center text-xs text-ink-muted">
              No hay pedidos registrados para este evento. Hacé clic en "Cargar Pedido" para registrar la primera venta.
            </div>
          ) : pedidosFiltrados.length === 0 ? (
            <div className="p-8 text-center text-xs text-ink-muted space-y-1">
              <p>No se encontraron pedidos que coincidan con "{busqueda}".</p>
              <button
                type="button"
                onClick={() => setBusqueda('')}
                className="text-xs text-brand font-bold hover:underline cursor-pointer"
              >
                Limpiar búsqueda
              </button>
            </div>
          ) : (
            pedidosFiltrados.map((p: any) => {
              const algunoRetirado = p.tickets?.some((t: any) => t.estado === 'UTILIZADO');
              return (
                <div key={p.id} className="p-3.5 space-y-2 hover:bg-paper-2/40 transition">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h5 className="font-bold text-ink text-sm leading-snug">
                        {p.compradorNombre}
                      </h5>
                      {p.compradorContacto && (
                        <span className="text-[11px] text-ink-muted block mt-0.5">
                          {p.compradorContacto}
                        </span>
                      )}
                      <div className="text-[11px] text-ink-muted mt-1">
                        Vendido por:{' '}
                        <span className="font-semibold text-ink">
                          {p.vendedorUsuario
                            ? `${p.vendedorUsuario.nombre} ${p.vendedorUsuario.apellido}`
                            : 'Venta General'}
                        </span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="font-black text-sm text-ink block">
                        {formatearMoneda(Number(p.total))}
                      </span>
                      <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 block">
                        +{formatearMoneda(Number(p.totalGanancia))}
                      </span>
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-black mt-1 ${
                          p.estado === 'PAGADO'
                            ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200'
                            : algunoRetirado
                            ? 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-200 border border-rose-300 dark:border-rose-800'
                            : 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-200'
                        }`}
                      >
                        {p.estado === 'PENDIENTE' && algunoRetirado ? 'PENDIENTE (RETIRADO)' : p.estado}
                      </span>
                    </div>
                  </div>

                  {/* Items detalle */}
                  <div className="p-2 rounded-xl bg-paper-2 text-xs space-y-1">
                    {p.detalles?.map((d: any) => (
                      <div key={d.id} className="flex justify-between items-center text-xs">
                        <span className="text-ink">
                          <strong className="text-brand">{d.cantidad}x</strong> {d.item?.nombre}
                        </span>
                        <span className="text-ink-muted text-[11px]">
                          {formatearMoneda(Number(d.subtotal))}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Vales QR y Acciones */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-rule/50">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {p.tickets?.map((t: any, idx: number) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => handleVerTicket(t, p)}
                          className={`min-h-[34px] px-2.5 py-1 rounded-xl text-xs font-black flex items-center gap-1 border transition cursor-pointer ${
                            t.estado === 'UTILIZADO'
                              ? 'bg-slate-100 dark:bg-slate-900 text-slate-500 border-slate-300 dark:border-slate-800 line-through'
                              : 'bg-brand/10 text-brand border-brand/30 hover:bg-brand/20'
                          }`}
                          title={t.estado === 'UTILIZADO' ? 'Retirado' : 'Click para ver vale con QR'}
                        >
                          <QrCode className="w-3.5 h-3.5 shrink-0" />
                          <span>Vale #{idx + 1}</span>
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-1.5 ml-auto">
                      {p.estado === 'PENDIENTE' ? (
                        <Button
                          variant="primary"
                          size="sm"
                          disabled={p.gananciaAcreditada}
                          onClick={() => {
                            setPedidoAEditar({ ...p, algunoRetirado });
                            setModalCargarPedidoAbierto(true);
                          }}
                          className="gap-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                        >
                          <Landmark className="w-3.5 h-3.5" />
                          <span>Cobrar</span>
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={algunoRetirado || p.gananciaAcreditada}
                          onClick={() => {
                            setPedidoAEditar({ ...p, algunoRetirado });
                            setModalCargarPedidoAbierto(true);
                          }}
                          className="gap-1 text-xs"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          <span>Editar</span>
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
      )}

      {/* Modales */}
      <ModalCrearEventoEconomico
        abierto={modalCrearEventoAbierto}
        onCerrar={() => {
          setModalCrearEventoAbierto(false);
          setEventoAEditar(null);
        }}
        onGuardado={cargarEventos}
        eventoAEditar={eventoAEditar}
        onToast={onToast}
      />

      {eventoActivo && (
        <ModalCargarPedidoEvento
          abierto={modalCargarPedidoAbierto}
          onCerrar={() => {
            setModalCargarPedidoAbierto(false);
            setPedidoAEditar(null);
          }}
          onGuardado={() => {
            cargarEventos();
            if (eventoSeleccionadoId) cargarDetalleEvento(eventoSeleccionadoId);
          }}
          eventoId={eventoActivo.id}
          eventoTitulo={eventoActivo.titulo}
          itemsEvento={eventoDetalle?.items || eventoActivo.items || []}
          pedidoAEditar={pedidoAEditar}
          onToast={onToast}
        />
      )}

      <ModalScannerQR
        abierto={modalScannerAbierto}
        onCerrar={() => setModalScannerAbierto(false)}
        onTicketValidado={() => {
          cargarEventos();
          if (eventoSeleccionadoId) cargarDetalleEvento(eventoSeleccionadoId);
        }}
      />

      <ModalTicketQR
        abierto={modalTicketQR.abierto}
        onCerrar={() => setModalTicketQR({ abierto: false, ticket: null })}
        ticket={modalTicketQR.ticket}
      />

      {modalAcreditarAbierto && eventoActivo && (
        <ModalConfirmacion
          abierto={modalAcreditarAbierto}
          onCerrar={() => {
            if (!acreditando) setModalAcreditarAbierto(false);
          }}
          onConfirmar={
            !hayDetallePedidos || cantPedidosListos > 0
              ? ejecutarAcreditarGanancias
              : () => setModalAcreditarAbierto(false)
          }
          titulo="Acreditar Ganancias a Familias"
          tipo={hayDetallePedidos && cantPedidosListos === 0 ? 'alerta' : 'confirmacion'}
          textoConfirmar={
            hayDetallePedidos && cantPedidosListos === 0
              ? 'Entendido'
              : acreditando
              ? 'Acreditando...'
              : 'Confirmar y Acreditar'
          }
          textoCancelar={hayDetallePedidos && cantPedidosListos === 0 ? null : 'Cancelar'}
          cargando={acreditando}
          mensaje={
            <div className="space-y-3">
              {hayDetallePedidos && cantPedidosListos === 0 ? (
                <>
                  <p className="text-sm text-ink leading-relaxed">
                    No hay pedidos con vales retirados pendientes de acreditar en{' '}
                    <strong className="text-ink font-bold">"{eventoActivo.titulo}"</strong>.
                  </p>
                  <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-800 dark:text-amber-200">
                    Las ganancias se acreditan a las familias vendedoras únicamente una vez que los tickets QR hayan sido escaneados y retirados.
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm text-ink leading-relaxed">
                    ¿Deseas acreditar las ganancias de los pedidos ya retirados de{' '}
                    <strong className="text-ink font-bold">"{eventoActivo.titulo}"</strong> al saldo a favor de las familias vendedoras?
                  </p>

                  <div className="p-3.5 bg-paper-2 rounded-xl border border-rule space-y-2 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-ink-muted">Pedidos listos para liquidar:</span>
                      <span className="font-bold text-ink">
                        {cantPedidosListos > 0 ? `${cantPedidosListos} pedidos retirados` : 'Todos los retirados'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-ink-muted">Monto total a acreditar:</span>
                      <span className="font-black text-emerald-600 dark:text-emerald-400 text-sm">
                        +{formatearMoneda(montoGananciaLista)}
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-ink-muted leading-relaxed">
                    {montoGananciaLista > 0 ? (
                      <>
                        El monto se acreditará automáticamente en el <strong>Saldo a Favor</strong> de cada scout para pagar cuotas, campamentos u otros conceptos.
                      </>
                    ) : (
                      <>
                        Los pedidos quedarán asentados como liquidados con ganancia de $0 a favor de las familias.
                      </>
                    )}
                  </p>
                </>
              )}
            </div>
          }
        />
      )}

      {modalEliminarEventoAbierto && eventoActivo && (
        <ModalConfirmacion
          abierto={modalEliminarEventoAbierto}
          onCerrar={() => !eliminandoEvento && setModalEliminarEventoAbierto(false)}
          onConfirmar={ejecutarEliminarEvento}
          titulo="Eliminar Evento Económico"
          tipo="peligro"
          textoConfirmar={eliminandoEvento ? 'Eliminando...' : 'Sí, Eliminar Evento'}
          textoCancelar="Cancelar"
          cargando={eliminandoEvento}
          mensaje={
            <div className="space-y-3">
              <p className="text-sm text-ink leading-relaxed">
                ¿Estás seguro de que deseas eliminar permanentemente el evento{' '}
                <strong className="text-ink font-bold">"{eventoActivo.titulo}"</strong>?
              </p>

              {eventoActivo.metricas.cantidadPedidos > 0 && (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-800 dark:text-amber-200">
                  Este evento tiene <strong>{eventoActivo.metricas.cantidadPedidos} pedidos</strong> asociados que también serán eliminados.
                </div>
              )}

              <p className="text-xs text-ink-muted leading-relaxed">
                Esta acción no se puede deshacer. Los eventos con vales ya canjeados o ganancias liquidadas a familias no pueden ser eliminados.
              </p>
            </div>
          }
        />
      )}
    </div>
  );
};
