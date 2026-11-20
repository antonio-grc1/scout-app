import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Award,
  Calendar,
  Camera,
  CheckCircle2,
  Clock,
  Edit2,
  Landmark,
  Loader2,
  MapPin,
  Minus,
  Plus,
  QrCode,
  RefreshCw,
  Search,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Trash2,
  User,
  Wallet,
  X,
  XCircle,
} from 'lucide-react';
import { api } from '../../api/client';
import { useCapabilities } from '../../core/capabilities';
import { useQrModalStore } from '../../core/qrModalStore';
import { useAuthStore } from '../../store/authStore';
import { mostrarToastConDeshacer, useToastStore } from '../../store/toastStore';
import {
  esErrorOffline,
  formatearFecha,
  formatearMoneda,
  normalizarTextoBusqueda,
  traducirErrorAmigable,
} from '../../lib/formatters';
import {
  Button,
  ConfirmImpactDialog,
  Input,
  KpiCard,
  SegmentedTabs,
  Select,
} from '../../components/ui';
import { ModalCrearEventoEconomico } from '../../components/ModalCrearEventoEconomico';
import { ModalCargarPedidoEvento } from '../../components/ModalCargarPedidoEvento';
import { ModalTicketQR, type TicketData } from '../../components/ModalTicketQR';

type TabWorkspace = 'pos' | 'pedidos' | 'liquidacion';
type FiltroPedidos = 'TODOS' | 'PENDIENTES' | 'PENDIENTE_RETIRADO' | 'PAGADOS';

interface CuentaOption {
  id: number;
  nombre: string;
  tipo: string;
}

interface MiembroBusqueda {
  id: number;
  nombre: string;
  apellido: string;
  dni?: string;
}

export const EventoWorkspacePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const eventoId = Number(id);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const caps = useCapabilities();
  const usuarioActual = useAuthStore((s) => s.usuario);
  const abrirQr = useQrModalStore((s) => s.abrirQr);
  const lastValidationAt = useQrModalStore((s) => s.lastValidationAt);
  const mostrarToast = useToastStore((s) => s.mostrarToast);

  const tabUrl = searchParams.get('tab') as TabWorkspace | null;
  const tabInicial: TabWorkspace =
    tabUrl === 'pedidos' || tabUrl === 'liquidacion' || tabUrl === 'pos'
      ? tabUrl
      : 'pos';
  const [tab, setTab] = useState<TabWorkspace>(tabInicial);

  const cambiarTab = (next: TabWorkspace) => {
    setTab(next);
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.set('tab', next);
        return p;
      },
      { replace: true },
    );
  };

  const [evento, setEvento] = useState<any | null>(null);
  const [misPedidosPropios, setMisPedidosPropios] = useState<any[]>([]);
  const [cuentas, setCuentas] = useState<CuentaOption[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Sub-modals & confirmaciones
  const [modalEditarEventoAbierto, setModalEditarEventoAbierto] = useState(false);
  const [confirmEliminarEvento, setConfirmEliminarEvento] = useState(false);
  const [eliminandoEvento, setEliminandoEvento] = useState(false);

  const [pedidoModalState, setPedidoModalState] = useState<{
    abierto: boolean;
    pedido: any | null;
  }>({ abierto: false, pedido: null });

  const [modalTicketQR, setModalTicketQR] = useState<{
    abierto: boolean;
    ticket: TicketData | null;
  }>({ abierto: false, ticket: null });

  const [confirmAcreditar, setConfirmAcreditar] = useState(false);
  const [acreditando, setAcreditando] = useState(false);
  const [pedidoAEliminar, setPedidoAEliminar] = useState<any | null>(null);
  const [eliminandoPedido, setEliminandoPedido] = useState(false);

  // Pedidos filter state
  const [busquedaPedidos, setBusquedaPedidos] = useState('');
  const [filtroPedidos, setFiltroPedidos] = useState<FiltroPedidos>('TODOS');

  // POS Venta Rápida state
  const [posCompradorNombre, setPosCompradorNombre] = useState('');
  const [posCompradorContacto, setPosCompradorContacto] = useState('');
  const [posObservaciones, setPosObservaciones] = useState('');
  const [posVendedorId, setPosVendedorId] = useState<string>('');
  const [posBusquedaVendedor, setPosBusquedaVendedor] = useState('');
  const [posDropdownAbierto, setPosDropdownAbierto] = useState(false);
  const [posMiembros, setPosMiembros] = useState<MiembroBusqueda[]>([]);
  const [posCantidades, setPosCantidades] = useState<Record<number, number>>({});
  const [posMetodoPago, setPosMetodoPago] = useState<'PENDIENTE' | 'EFECTIVO' | 'TRANSFERENCIA'>(
    'PENDIENTE',
  );
  const [posCuentaId, setPosCuentaId] = useState<string>('');
  const [posGuardando, setPosGuardando] = useState(false);

  const cargarTodo = useCallback(async () => {
    if (!Number.isFinite(eventoId) || eventoId <= 0) {
      setError('Identificador de evento inválido.');
      setCargando(false);
      return;
    }
    setCargando(true);
    setError(null);
    try {
      const requests: Promise<any>[] = [api.get(`/tesoreria/eventos/${eventoId}`)];
      if (!caps.canSellEventos) {
        requests.push(api.get('/tesoreria/mis-pedidos').catch(() => ({ data: [] })));
      }
      if (caps.canCreateGlobalEventos) {
        requests.push(api.get('/tesoreria/cuentas').catch(() => ({ data: [] })));
      }
      if (caps.canSellEventos) {
        requests.push(api.get('/miembros?porPagina=80').catch(() => ({ data: { items: [] } })));
      }

      const results = await Promise.all(requests);
      const evData = results[0].data;
      setEvento(evData);

      let idx = 1;
      if (!caps.canSellEventos) {
        const mp = Array.isArray(results[idx]?.data) ? results[idx].data : [];
        setMisPedidosPropios(mp.filter((p: any) => Number(p.eventoId) === eventoId));
        idx++;
      }
      if (caps.canCreateGlobalEventos) {
        const cList: CuentaOption[] = Array.isArray(results[idx]?.data) ? results[idx].data : [];
        setCuentas(cList);
        if (cList.length > 0) {
          setPosCuentaId((prev) => prev || String(cList[0].id));
        }
        idx++;
      }
      if (caps.canSellEventos) {
        const rawM = results[idx]?.data;
        const mList: MiembroBusqueda[] = Array.isArray(rawM)
          ? rawM
          : Array.isArray(rawM?.items)
            ? rawM.items
            : [];
        setPosMiembros(mList);
      }
    } catch (err) {
      const msg = traducirErrorAmigable(err, 'No se pudo cargar el detalle del evento.');
      if (!esErrorOffline(err, msg)) {
        setError(msg);
      }
    } finally {
      setCargando(false);
    }
  }, [eventoId, caps.canSellEventos, caps.canCreateGlobalEventos]);

  useEffect(() => {
    void cargarTodo();
  }, [cargarTodo, lastValidationAt]);

  // Pre-set vendedor en modo propio
  useEffect(() => {
    if (!caps.canSellEventos && usuarioActual?.id) {
      setPosVendedorId(String(usuarioActual.id));
    }
  }, [caps.canSellEventos, usuarioActual?.id]);

  // Búsqueda debounced de vendedor Scout en POS
  useEffect(() => {
    const q = posBusquedaVendedor.trim();
    if (!q || !caps.canSellEventos) return;
    const t = setTimeout(async () => {
      try {
        const res = await api.get('/miembros', { params: { q, porPagina: 40 } });
        const raw = res.data;
        const list: MiembroBusqueda[] = Array.isArray(raw)
          ? raw
          : Array.isArray(raw?.items)
            ? raw.items
            : [];
        if (list.length > 0) {
          setPosMiembros((prev) => {
            const map = new Map(prev.map((m) => [m.id, m]));
            for (const m of list) map.set(m.id, m);
            return Array.from(map.values());
          });
        }
      } catch {
        // Ignorar
      }
    }, 250);
    return () => clearTimeout(t);
  }, [posBusquedaVendedor, caps.canSellEventos]);

  const vendedoresFiltrados = useMemo(() => {
    const q = normalizarTextoBusqueda(posBusquedaVendedor);
    if (!q) return posMiembros.slice(0, 15);
    return posMiembros
      .filter((m) => {
        const full = normalizarTextoBusqueda(`${m.nombre} ${m.apellido}`);
        const inv = normalizarTextoBusqueda(`${m.apellido} ${m.nombre}`);
        return full.includes(q) || inv.includes(q) || String(m.dni || '').includes(q);
      })
      .slice(0, 20);
  }, [posMiembros, posBusquedaVendedor]);

  const vendedorSeleccionado = useMemo(
    () => posMiembros.find((m) => String(m.id) === String(posVendedorId)) || null,
    [posMiembros, posVendedorId],
  );

  const itemsCatalogo: any[] = useMemo(
    () => (Array.isArray(evento?.items) ? evento.items : []),
    [evento?.items],
  );

  const posTotals = useMemo(() => {
    let total = 0;
    let ganancia = 0;
    let unidades = 0;
    for (const it of itemsCatalogo) {
      const c = posCantidades[it.id] || 0;
      if (c > 0) {
        unidades += c;
        total += Number(it.precioVenta || 0) * c;
        ganancia += Number(it.gananciaUnitaria || 0) * c;
      }
    }
    return { total, ganancia, unidades };
  }, [itemsCatalogo, posCantidades]);

  const pedidosSource: any[] = useMemo(() => {
    if (caps.canSellEventos) {
      return Array.isArray(evento?.pedidos) ? evento.pedidos : [];
    }
    return misPedidosPropios;
  }, [caps.canSellEventos, evento?.pedidos, misPedidosPropios]);

  const contadoresPedidos = useMemo(() => {
    let pendientes = 0;
    let pendienteRetirado = 0;
    let pagados = 0;
    let montoPendiente = 0;

    for (const p of pedidosSource) {
      const retirado = Boolean(p.tickets?.some((t: any) => t.estado === 'UTILIZADO'));
      if (p.estado === 'PAGADO') {
        pagados++;
      } else {
        pendientes++;
        montoPendiente += Number(p.total || 0);
        if (retirado) pendienteRetirado++;
      }
    }

    return {
      todos: pedidosSource.length,
      pendientes,
      pendienteRetirado,
      pagados,
      montoPendiente,
    };
  }, [pedidosSource]);

  const pedidosFiltrados = useMemo(() => {
    const q = normalizarTextoBusqueda(busquedaPedidos);
    return pedidosSource.filter((p) => {
      const retirado = Boolean(p.tickets?.some((t: any) => t.estado === 'UTILIZADO'));
      if (filtroPedidos === 'PENDIENTES' && p.estado !== 'PENDIENTE') return false;
      if (filtroPedidos === 'PENDIENTE_RETIRADO' && !(p.estado === 'PENDIENTE' && retirado)) {
        return false;
      }
      if (filtroPedidos === 'PAGADOS' && p.estado !== 'PAGADO') return false;

      if (!q) return true;
      const matchComprador = normalizarTextoBusqueda(p.compradorNombre || '').includes(q);
      const matchContacto = normalizarTextoBusqueda(p.compradorContacto || '').includes(q);
      const matchVendedor = p.vendedorUsuario
        ? normalizarTextoBusqueda(
            `${p.vendedorUsuario.nombre} ${p.vendedorUsuario.apellido}`,
          ).includes(q)
        : false;
      const matchTotal = String(p.total || '').includes(q);
      const matchItems = p.detalles?.some((d: any) =>
        normalizarTextoBusqueda(d.item?.nombre || '').includes(q),
      );
      return matchComprador || matchContacto || matchVendedor || matchTotal || matchItems;
    });
  }, [pedidosSource, filtroPedidos, busquedaPedidos]);

  // Pre-flight de Liquidación a Familias agrupada por Scout Vendedor
  const liquidacionPorScout = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        vendedorNombre: string;
        vendedorDni?: string;
        totalPedidos: number;
        pedidosListosAcreditar: number;
        pedidosPendientesRetiro: number;
        gananciaAcreditada: number;
        gananciaListaParaAcreditar: number;
      }
    >();

    for (const p of pedidosSource) {
      if (!p.vendedorUsuario) continue;
      const key = String(p.vendedorUsuario.id);
      if (!map.has(key)) {
        map.set(key, {
          key,
          vendedorNombre: `${p.vendedorUsuario.nombre} ${p.vendedorUsuario.apellido}`,
          vendedorDni: p.vendedorUsuario.dni,
          totalPedidos: 0,
          pedidosListosAcreditar: 0,
          pedidosPendientesRetiro: 0,
          gananciaAcreditada: 0,
          gananciaListaParaAcreditar: 0,
        });
      }
      const row = map.get(key)!;
      row.totalPedidos += 1;
      const g = Number(p.totalGanancia || 0);
      const todosRetirados =
        Array.isArray(p.tickets) &&
        p.tickets.length > 0 &&
        p.tickets.every((t: any) => t.estado === 'UTILIZADO');

      if (p.gananciaAcreditada) {
        row.gananciaAcreditada += g;
      } else if (todosRetirados && g >= 0 && p.estado === 'PAGADO') {
        // El backend solo acredita pedidos PAGADOS con todos sus vales retirados.
        row.pedidosListosAcreditar += 1;
        row.gananciaListaParaAcreditar += g;
      } else {
        row.pedidosPendientesRetiro += 1;
      }
    }

    return Array.from(map.values()).sort(
      (a, b) =>
        b.gananciaListaParaAcreditar - a.gananciaListaParaAcreditar ||
        a.vendedorNombre.localeCompare(b.vendedorNombre),
    );
  }, [pedidosSource]);

  const resumenLiquidacion = useMemo(() => {
    return liquidacionPorScout.reduce(
      (acc, r) => {
        acc.pedidosListos += r.pedidosListosAcreditar;
        acc.montoListo += r.gananciaListaParaAcreditar;
        acc.montoYaAcreditado += r.gananciaAcreditada;
        return acc;
      },
      { pedidosListos: 0, montoListo: 0, montoYaAcreditado: 0 },
    );
  }, [liquidacionPorScout]);

  const handlePosCantidad = (it: any, delta: number) => {
    setPosCantidades((prev) => {
      const actual = prev[it.id] || 0;
      const maxStock =
        it.stockDisponible !== null && it.stockDisponible !== undefined
          ? Number(it.stockDisponible)
          : Infinity;
      const next = Math.max(0, Math.min(maxStock, actual + delta));
      return { ...prev, [it.id]: next };
    });
  };

  const handleRegistrarPos = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!evento || evento.estado !== 'PUBLICADO') return;

    if (!posCompradorNombre.trim() || posCompradorNombre.trim().length < 2) {
      mostrarToast('Indicá el nombre del comprador (mínimo 2 caracteres).', 'error');
      return;
    }

    const itemsPayload = Object.entries(posCantidades)
      .filter(([, cant]) => cant > 0)
      .map(([itemId, cant]) => ({ itemId: Number(itemId), cantidad: cant }));

    if (itemsPayload.length === 0) {
      mostrarToast('Agregá al menos un producto al pedido.', 'error');
      return;
    }

    const puedeImputarPago = caps.canCreateGlobalEventos;
    if (puedeImputarPago && posMetodoPago !== 'PENDIENTE' && !posCuentaId) {
      mostrarToast('Seleccioná la cuenta donde ingresa el pago.', 'error');
      return;
    }

    setPosGuardando(true);
    try {
      const payload: Record<string, unknown> = {
        eventoId: evento.id,
        compradorNombre: posCompradorNombre.trim(),
        compradorContacto: posCompradorContacto.trim() || undefined,
        vendedorUsuarioId: posVendedorId ? Number(posVendedorId) : null,
        observaciones: posObservaciones.trim() || undefined,
        items: itemsPayload,
      };
      if (puedeImputarPago && posMetodoPago !== 'PENDIENTE') {
        payload.metodoPago = posMetodoPago;
        if (posCuentaId) payload.cuentaId = Number(posCuentaId);
      }

      const res = await api.post('/tesoreria/eventos/pedidos', payload);
      mostrarToast('Pedido registrado y vales QR generados correctamente.');

      // Reset POS for rapid next order
      setPosCompradorNombre('');
      setPosCompradorContacto('');
      setPosObservaciones('');
      setPosCantidades({});
      setPosMetodoPago('PENDIENTE');

      await cargarTodo();

      // Abrir el primer ticket QR generado si viene en respuesta
      const nuevoPedido = res.data;
      if (nuevoPedido?.tickets?.[0]) {
        handleVerTicket(nuevoPedido.tickets[0], nuevoPedido);
      }
    } catch (err) {
      mostrarToast(traducirErrorAmigable(err, 'No se pudo registrar el pedido.'), 'error');
    } finally {
      setPosGuardando(false);
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
            id: evento.id,
            titulo: evento.titulo,
            fechaEvento: evento.fechaEvento,
            lugarEntrega: evento.lugarEntrega,
          },
          vendedorUsuario: pedido.vendedorUsuario,
        },
      },
    });
  };

  const ejecutarEliminarPedido = async () => {
    if (!pedidoAEliminar || !evento) return;
    const copia = { ...pedidoAEliminar };
    setEliminandoPedido(true);
    try {
      await api.delete(`/tesoreria/eventos/pedidos/${copia.id}`);
      setPedidoAEliminar(null);
      await cargarTodo();

      mostrarToastConDeshacer(
        `Pedido #${copia.id} (${copia.compradorNombre}) eliminado.`,
        async () => {
          try {
            const payloadUndo: Record<string, unknown> = {
              eventoId: evento.id,
              compradorNombre: copia.compradorNombre,
              compradorContacto: copia.compradorContacto || undefined,
              vendedorUsuarioId: copia.vendedorUsuarioId ?? null,
              observaciones: copia.observaciones || undefined,
              items: (copia.detalles || []).map((d: any) => ({
                itemId: d.itemId,
                cantidad: d.cantidad,
              })),
            };
            if (copia.metodoPago && copia.metodoPago !== 'PENDIENTE') {
              payloadUndo.metodoPago = copia.metodoPago;
              if (copia.cuentaId) payloadUndo.cuentaId = copia.cuentaId;
            }
            await api.post('/tesoreria/eventos/pedidos', payloadUndo);
            await cargarTodo();
            mostrarToast(`Pedido #${copia.id} restaurado.`);
          } catch (err) {
            mostrarToast(traducirErrorAmigable(err, 'No se pudo restaurar el pedido.'), 'error');
          }
        },
      );
    } catch (err) {
      mostrarToast(traducirErrorAmigable(err, 'No se pudo eliminar el pedido.'), 'error');
    } finally {
      setEliminandoPedido(false);
    }
  };

  const ejecutarAcreditarGanancias = async () => {
    if (!evento) return;
    setAcreditando(true);
    try {
      const res = await api.post('/tesoreria/eventos/acreditar-ganancias', {
        eventoId: evento.id,
        soloRetirados: true,
      });
      const { pedidosAcreditados, totalGananciaAcreditada } = res.data;
      mostrarToast(
        `Se acreditaron ${formatearMoneda(totalGananciaAcreditada)} a las familias (${pedidosAcreditados} pedidos liquidados).`,
      );
      setConfirmAcreditar(false);
      await cargarTodo();
    } catch (err) {
      mostrarToast(traducirErrorAmigable(err, 'No se pudieron acreditar las ganancias.'), 'error');
    } finally {
      setAcreditando(false);
    }
  };

  const ejecutarEliminarEvento = async () => {
    if (!evento) return;
    const copia = { ...evento };
    setEliminandoEvento(true);
    try {
      await api.delete(`/tesoreria/eventos/${copia.id}`);
      setConfirmEliminarEvento(false);
      navigate('/eventos', { replace: true });

      const sinPedidos = (copia.metricas?.cantidadPedidos || copia.pedidos?.length || 0) === 0;
      if (sinPedidos) {
        mostrarToastConDeshacer(`Evento "${copia.titulo}" eliminado.`, async () => {
          try {
            await api.post('/tesoreria/eventos', {
              titulo: copia.titulo,
              descripcion: copia.descripcion || undefined,
              tipo: copia.tipo,
              estado: copia.estado,
              fechaEvento: copia.fechaEvento,
              fechaFin: copia.fechaFin || undefined,
              lugarEntrega: copia.lugarEntrega || undefined,
              rubroId: copia.rubroId || undefined,
              cuentaId: copia.cuentaId || undefined,
              items: (copia.items || []).map((it: any) => ({
                nombre: it.nombre,
                descripcion: it.descripcion || undefined,
                precioVenta: Number(it.precioVenta),
                costoUnitario: Number(it.costoUnitario || 0),
                gananciaUnitaria: Number(it.gananciaUnitaria || 0),
                stockTotal: it.stockTotal ?? it.stockDisponible ?? null,
              })),
            });
            mostrarToast(`Evento "${copia.titulo}" restaurado.`);
          } catch (err) {
            mostrarToast(traducirErrorAmigable(err, 'No se pudo restaurar el evento.'), 'error');
          }
        });
      } else {
        mostrarToast(`Evento "${copia.titulo}" eliminado.`);
      }
    } catch (err) {
      mostrarToast(traducirErrorAmigable(err, 'No se pudo eliminar el evento.'), 'error');
    } finally {
      setEliminandoEvento(false);
    }
  };

  if (cargando && !evento) {
    return (
      <div className="space-y-4 s-anim-view">
        <div className="s-card rounded-2xl p-6 animate-pulse space-y-3">
          <div className="h-4 w-32 rounded bg-paper-2" />
          <div className="h-7 w-72 rounded bg-paper-3" />
          <div className="h-4 w-48 rounded bg-paper-2" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="s-card rounded-2xl p-4 h-24 animate-pulse bg-paper-2" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !evento) {
    return (
      <div className="s-card rounded-2xl p-8 text-center space-y-4">
        <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto" />
        <h2 className="text-lg font-black text-ink">
          {error || 'No se encontró el evento solicitado'}
        </h2>
        <Button type="button" variant="secondary" onClick={() => navigate('/eventos')}>
          <ArrowLeft className="w-4 h-4 mr-1.5" />
          Volver al Catálogo de Eventos
        </Button>
      </div>
    );
  }

  const tabsWorkspace = caps.canSellEventos
    ? [
        { id: 'pos' as const, label: 'POS Venta Rápida', icon: <ShoppingCart className="w-4 h-4" /> },
        {
          id: 'pedidos' as const,
          label: 'Pedidos y Vales',
          icon: <ShoppingBag className="w-4 h-4" />,
          badge: contadoresPedidos.todos,
        },
        {
          id: 'liquidacion' as const,
          label: 'Liquidación a Familias',
          icon: <Award className="w-4 h-4" />,
          badge: resumenLiquidacion.pedidosListos > 0 ? resumenLiquidacion.pedidosListos : undefined,
        },
      ]
    : [
        { id: 'pos' as const, label: 'Cargar Mi Pedido', icon: <ShoppingCart className="w-4 h-4" /> },
        {
          id: 'pedidos' as const,
          label: 'Mis Pedidos y Vales',
          icon: <QrCode className="w-4 h-4" />,
          badge: contadoresPedidos.todos,
        },
      ];

  const estadoClass =
    evento.estado === 'PUBLICADO'
      ? 's-badge-ok'
      : evento.estado === 'FINALIZADO'
        ? 's-badge-info'
        : evento.estado === 'BORRADOR'
          ? 's-badge-warn'
          : 's-badge-err';

  return (
    <div className="space-y-5 s-anim-view">
      {/* Cabecera Contextual Nivel 2 */}
      <div className="s-card rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <Link
            to="/eventos"
            className="s-btn-sec min-h-[40px] px-3.5 py-2 rounded-xl text-[13px] font-bold inline-flex items-center gap-1.5"
          >
            <ArrowLeft className="w-4 h-4 shrink-0" />
            <span>Volver a Eventos</span>
          </Link>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void cargarTodo()}
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
              <>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setModalEditarEventoAbierto(true)}
                  leftIcon={<Settings className="w-3.5 h-3.5" />}
                >
                  Configurar Evento
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  onClick={() => setConfirmEliminarEvento(true)}
                  leftIcon={<Trash2 className="w-3.5 h-3.5" />}
                >
                  Eliminar
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 pt-2 border-t border-rule">
          <div className="space-y-2 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`${estadoClass} px-2.5 py-0.5 rounded-full text-xs font-bold inline-flex items-center gap-1.5`}>
                {evento.estado === 'PUBLICADO' && <CheckCircle2 className="w-3.5 h-3.5" />}
                {evento.estado === 'FINALIZADO' && <Clock className="w-3.5 h-3.5" />}
                {evento.estado === 'BORRADOR' && <AlertTriangle className="w-3.5 h-3.5" />}
                {evento.estado === 'CANCELADO' && <XCircle className="w-3.5 h-3.5" />}
                <span>
                  {evento.estado === 'PUBLICADO'
                    ? 'Publicado'
                    : evento.estado === 'FINALIZADO'
                      ? 'Finalizado'
                      : evento.estado === 'BORRADOR'
                        ? 'Borrador'
                        : 'Cancelado'}
                </span>
              </span>
              <span className="px-2.5 py-0.5 rounded-lg bg-paper-2 border border-rule text-xs font-bold text-ink-2">
                {evento.tipo === 'FESTIVAL_ENTRADAS' ? 'Festival / Entradas' : 'Recaudación por Pedidos'}
              </span>
            </div>

            <h1 className="text-2xl sm:text-[1.75rem] font-black text-ink tracking-tight">
              {evento.titulo}
            </h1>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-2">
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-brand" />
                {formatearFecha(evento.fechaEvento)}
              </span>
              {evento.lugarEntrega && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-ink-muted" />
                  {evento.lugarEntrega}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Banners de estado especial */}
      {evento.estado === 'FINALIZADO' && (
        <div className="s-badge-info rounded-2xl p-4 text-[13px] flex items-center gap-2.5">
          <Clock className="w-4 h-4 shrink-0" />
          <span>
            <strong>Evento finalizado:</strong> no admite nuevos pedidos, pero podés cobrar saldos pendientes, validar vales QR en puerta y acreditar ganancias.
          </span>
        </div>
      )}
      {evento.estado === 'BORRADOR' && (
        <div className="s-badge-warn rounded-2xl p-4 text-[13px] flex items-center gap-2.5">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>
            <strong>Borrador oculto:</strong> este evento todavía no es visible para las familias. Publicalo desde "Configurar Evento".
          </span>
        </div>
      )}

      {/* 4 KPIs */}
      {caps.canSellEventos && evento.metricas && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard
            label="Total recaudado"
            value={formatearMoneda(evento.metricas.totalVenta)}
            hint={`${evento.metricas.cantidadPedidos} pedidos cargados`}
            tone="ok"
            icon={<ShoppingBag className="w-4 h-4" />}
          />
          <KpiCard
            label="Ganancia familias"
            value={`+${formatearMoneda(evento.metricas.totalGanancia)}`}
            hint="Acreditable a Saldo a Favor"
            tone="brand"
            icon={<Award className="w-4 h-4" />}
          />
          <KpiCard
            label="Entrega de vales"
            value={`${evento.metricas.ticketsRetirados} / ${evento.metricas.totalTickets}`}
            hint={`${evento.metricas.porcentajeRetirado}% retirado`}
            tone="info"
            icon={<QrCode className="w-4 h-4" />}
          />
          <KpiCard
            label="Pendientes de cobro"
            value={contadoresPedidos.pendientes}
            hint={
              contadoresPedidos.pendienteRetirado > 0
                ? `${contadoresPedidos.pendienteRetirado} ya retirados sin pago`
                : formatearMoneda(contadoresPedidos.montoPendiente)
            }
            tone={contadoresPedidos.pendienteRetirado > 0 ? 'err' : 'warn'}
            icon={<Wallet className="w-4 h-4" />}
            onClick={() => {
              cambiarTab('pedidos');
              setFiltroPedidos(
                contadoresPedidos.pendienteRetirado > 0 ? 'PENDIENTE_RETIRADO' : 'PENDIENTES',
              );
            }}
          />
        </div>
      )}

      {/* Sub-tabs */}
      <SegmentedTabs
        items={tabsWorkspace}
        activeId={tab}
        onChange={cambiarTab}
        ariaLabel="Herramientas del evento"
      />

      {/* SUB-TAB 1: POS VENTA RÁPIDA */}
      {tab === 'pos' && (
        <form onSubmit={handleRegistrarPos} className="grid grid-cols-1 lg:grid-cols-12 gap-4 s-anim-tab">
          {evento.estado !== 'PUBLICADO' && (
            <div className="lg:col-span-12 s-badge-warn rounded-2xl p-4 text-[13px] font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                El evento está en estado <strong>{evento.estado}</strong>. Para cargar nuevos pedidos debe estar publicado.
              </span>
            </div>
          )}

          {/* Catálogo de Productos con Stock en vivo */}
          <div className="lg:col-span-7 s-card rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-black text-ink">1. Productos y Stock en Vivo</h2>
              <span className="text-[13px] font-bold text-ink-muted s-tabular">
                {posTotals.unidades} unid. seleccionadas
              </span>
            </div>

            {itemsCatalogo.length === 0 ? (
              <div className="s-panel rounded-xl p-6 text-center text-sm text-ink-muted">
                No hay productos configurados en este evento.
              </div>
            ) : (
              <div className="space-y-2.5">
                {itemsCatalogo.map((it) => {
                  const cant = posCantidades[it.id] || 0;
                  const sinStock =
                    it.stockDisponible !== null &&
                    it.stockDisponible !== undefined &&
                    Number(it.stockDisponible) <= 0;
                  const stockMax =
                    it.stockDisponible !== null && it.stockDisponible !== undefined
                      ? Number(it.stockDisponible)
                      : null;

                  return (
                    <div
                      key={it.id}
                      className={`p-4 rounded-2xl border transition flex items-center justify-between gap-3 ${
                        cant > 0
                          ? 'bg-brand-soft/30 border-brand'
                          : 'bg-paper-2 border-rule'
                      }`}
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[15px] font-black text-ink">{it.nombre}</span>
                          {stockMax !== null && (
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-xs font-bold s-tabular ${
                                sinStock
                                  ? 's-badge-err'
                                  : stockMax <= 5
                                    ? 's-badge-warn'
                                    : 'bg-surface border border-rule text-ink-2'
                              }`}
                            >
                              {sinStock ? 'Sin stock' : `Disp: ${stockMax}`}
                            </span>
                          )}
                        </div>
                        {it.descripcion && (
                          <p className="text-xs text-ink-muted line-clamp-1">{it.descripcion}</p>
                        )}
                        <div className="flex items-center gap-3 text-[13px] s-tabular">
                          <span className="font-black text-ink">
                            {formatearMoneda(Number(it.precioVenta))}
                          </span>
                          <span className="font-bold text-emerald-600 dark:text-emerald-400">
                            Ganancia +{formatearMoneda(Number(it.gananciaUnitaria || 0))}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handlePosCantidad(it, -1)}
                          disabled={evento.estado !== 'PUBLICADO' || cant <= 0}
                          aria-label={`Quitar ${it.nombre}`}
                          className="s-btn-sec w-11 h-11 rounded-xl flex items-center justify-center disabled:opacity-35 cursor-pointer"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="w-8 text-center text-[15px] font-black text-ink s-tabular">
                          {cant}
                        </span>
                        <button
                          type="button"
                          onClick={() => handlePosCantidad(it, 1)}
                          disabled={
                            evento.estado !== 'PUBLICADO' ||
                            sinStock ||
                            (stockMax !== null && cant >= stockMax)
                          }
                          aria-label={`Agregar ${it.nombre}`}
                          className="s-btn-brand w-11 h-11 rounded-xl flex items-center justify-center disabled:opacity-35 cursor-pointer"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Datos del Comprador, Vendedor y Cobro */}
          <div className="lg:col-span-5 s-card rounded-2xl p-5 space-y-4">
            <h2 className="text-base font-black text-ink">2. Comprador y Cobro</h2>

            <Input
              label="Nombre del comprador / cliente"
              value={posCompradorNombre}
              onChange={(e) => setPosCompradorNombre(e.target.value)}
              placeholder="Ej: Familia Gómez"
              disabled={evento.estado !== 'PUBLICADO'}
              required
            />

            <Input
              label="Teléfono / WhatsApp (opcional)"
              value={posCompradorContacto}
              onChange={(e) => setPosCompradorContacto(e.target.value)}
              placeholder="Ej: 351-155555555"
              disabled={evento.estado !== 'PUBLICADO'}
            />

            {caps.canSellEventos ? (
              <div className="space-y-1.5 relative">
                <label className="block text-sm font-bold text-ink-2">
                  Vendedor Scout (acreditación a Saldo a Favor)
                </label>
                {vendedorSeleccionado ? (
                  <div className="p-3 rounded-xl bg-brand-soft/30 border border-brand flex items-center justify-between gap-2 text-[13px]">
                    <div className="flex items-center gap-2 min-w-0">
                      <User className="w-4 h-4 text-brand shrink-0" />
                      <span className="font-bold text-ink truncate">
                        {vendedorSeleccionado.nombre} {vendedorSeleccionado.apellido}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPosVendedorId('')}
                      className="text-ink-muted hover:text-ink p-1 cursor-pointer"
                      aria-label="Quitar vendedor"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
                    <input
                      type="text"
                      value={posBusquedaVendedor}
                      disabled={evento.estado !== 'PUBLICADO'}
                      onFocus={() => setPosDropdownAbierto(true)}
                      onBlur={() => setTimeout(() => setPosDropdownAbierto(false), 180)}
                      onChange={(e) => {
                        setPosBusquedaVendedor(e.target.value);
                        setPosDropdownAbierto(true);
                      }}
                      placeholder="Buscar scout por nombre o DNI (o dejar Venta General)..."
                      className="s-input w-full min-h-[46px] pl-10 pr-3 rounded-xl text-base sm:text-[15px]"
                    />
                    {posDropdownAbierto && (
                      <div className="absolute left-0 right-0 top-full mt-1 max-h-48 overflow-y-auto rounded-xl bg-surface border border-rule z-20 py-1 divide-y divide-rule/40">
                        <button
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setPosVendedorId('');
                            setPosBusquedaVendedor('');
                            setPosDropdownAbierto(false);
                          }}
                          className="w-full px-3.5 py-2.5 text-left text-[13px] text-ink-muted hover:bg-paper-2 cursor-pointer"
                        >
                          Venta general del grupo (sin vendedor)
                        </button>
                        {vendedoresFiltrados.map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setPosVendedorId(String(m.id));
                              setPosBusquedaVendedor('');
                              setPosDropdownAbierto(false);
                            }}
                            className="w-full px-3.5 py-2.5 text-left text-[13px] text-ink hover:bg-paper-2 flex items-center justify-between gap-2 cursor-pointer"
                          >
                            <span className="font-bold truncate">
                              {m.nombre} {m.apellido}
                            </span>
                            {m.dni && (
                              <span className="text-xs text-ink-muted s-tabular shrink-0">
                                DNI {m.dni}
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="s-panel rounded-xl p-3 text-[13px] flex items-center gap-2 text-ink-2">
                <User className="w-4 h-4 text-brand shrink-0" />
                <span>
                  Vendedor asignado: <strong>{usuarioActual?.nombre} {usuarioActual?.apellido}</strong>
                </span>
              </div>
            )}

            <Input
              label="Observaciones (opcional)"
              value={posObservaciones}
              onChange={(e) => setPosObservaciones(e.target.value)}
              placeholder="Ej: Retira al mediodía"
              disabled={evento.estado !== 'PUBLICADO'}
            />

            {caps.canCreateGlobalEventos && (
              <div className="space-y-2 pt-2 border-t border-rule">
                <label className="block text-sm font-bold text-ink-2">Estado de cobro</label>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: 'PENDIENTE', label: 'Pendiente' },
                      { id: 'EFECTIVO', label: 'Efectivo' },
                      { id: 'TRANSFERENCIA', label: 'Transfer.' },
                    ] as const
                  ).map((op) => {
                    const active = posMetodoPago === op.id;
                    return (
                      <button
                        key={op.id}
                        type="button"
                        disabled={evento.estado !== 'PUBLICADO'}
                        onClick={() => setPosMetodoPago(op.id)}
                        className={`min-h-[44px] px-2.5 rounded-xl text-[13px] font-bold cursor-pointer border transition ${
                          active ? 's-btn-brand border-brand' : 's-btn-sec text-ink-2'
                        }`}
                      >
                        {op.label}
                      </button>
                    );
                  })}
                </div>

                {posMetodoPago !== 'PENDIENTE' && (
                  <Select
                    label="Cuenta de ingreso *"
                    value={posCuentaId}
                    onChange={(e) => setPosCuentaId(e.target.value)}
                    disabled={evento.estado !== 'PUBLICADO'}
                  >
                    {cuentas.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </Select>
                )}
              </div>
            )}

            <div className="s-panel rounded-2xl p-4 flex items-center justify-between gap-2">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-ink-muted block">
                  Total pedido
                </span>
                <span className="text-2xl font-black text-ink s-tabular">
                  {formatearMoneda(posTotals.total)}
                </span>
              </div>
              <div className="text-right">
                <span className="text-xs font-bold uppercase tracking-wider text-ink-muted block">
                  Ganancia Scout
                </span>
                <span className="text-[15px] font-black text-emerald-600 dark:text-emerald-400 s-tabular">
                  +{formatearMoneda(posTotals.ganancia)}
                </span>
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full"
              loading={posGuardando}
              disabled={evento.estado !== 'PUBLICADO' || posTotals.unidades <= 0 || posGuardando}
              leftIcon={<QrCode className="w-4 h-4" />}
            >
              Registrar Pedido y Generar QR
            </Button>
          </div>
        </form>
      )}

      {/* SUB-TAB 2: PEDIDOS Y VALES */}
      {tab === 'pedidos' && (
        <div className="s-card rounded-2xl overflow-hidden s-anim-tab">
          <div className="p-4 bg-paper-2 border-b border-rule flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              {(
                [
                  { id: 'TODOS', label: `Todos (${contadoresPedidos.todos})` },
                  { id: 'PENDIENTES', label: `Pendientes (${contadoresPedidos.pendientes})` },
                  ...(contadoresPedidos.pendienteRetirado > 0
                    ? [
                        {
                          id: 'PENDIENTE_RETIRADO' as const,
                          label: `PENDIENTE (RETIRADO) (${contadoresPedidos.pendienteRetirado})`,
                          danger: true,
                        },
                      ]
                    : []),
                  { id: 'PAGADOS', label: `Pagados (${contadoresPedidos.pagados})` },
                ] as Array<{ id: FiltroPedidos; label: string; danger?: boolean }>
              ).map((f) => {
                const active = filtroPedidos === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFiltroPedidos(f.id)}
                    className={`min-h-[40px] px-3.5 py-1.5 rounded-xl text-[13px] font-bold cursor-pointer transition border ${
                      f.danger
                        ? active
                          ? 'bg-rose-600 text-white border-rose-600'
                          : 's-badge-err'
                        : active
                          ? 's-btn-brand border-brand'
                          : 's-btn-sec text-ink-2'
                    }`}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>

            <div className="relative w-full lg:w-72">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
              <input
                type="text"
                value={busquedaPedidos}
                onChange={(e) => setBusquedaPedidos(e.target.value)}
                placeholder="Buscar comprador, scout, producto..."
                className="s-input w-full min-h-[44px] pl-10 pr-9 rounded-xl text-base sm:text-[15px]"
              />
              {busquedaPedidos && (
                <button
                  type="button"
                  onClick={() => setBusquedaPedidos('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink cursor-pointer"
                  aria-label="Limpiar búsqueda"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {pedidosFiltrados.length === 0 ? (
            <div className="p-10 text-center text-sm text-ink-muted space-y-2">
              <ShoppingBag className="w-8 h-8 mx-auto opacity-40" />
              <p className="font-semibold">
                {pedidosSource.length === 0
                  ? 'Todavía no hay pedidos registrados para este evento.'
                  : 'No hay pedidos que coincidan con el filtro aplicado.'}
              </p>
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="border-b border-rule bg-paper-2/70 text-xs uppercase tracking-wider text-ink-muted">
                      <th className="py-3.5 px-4 font-bold">Comprador</th>
                      <th className="py-3.5 px-4 font-bold">Vendedor Scout</th>
                      <th className="py-3.5 px-4 font-bold">Productos</th>
                      <th className="py-3.5 px-4 font-bold text-right">Total</th>
                      <th className="py-3.5 px-4 font-bold text-center">Estado Pago</th>
                      <th className="py-3.5 px-4 font-bold text-center">Vales QR</th>
                      <th className="py-3.5 px-4 font-bold text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rule">
                    {pedidosFiltrados.map((p: any) => {
                      const algunoRetirado = Boolean(
                        p.tickets?.some((t: any) => t.estado === 'UTILIZADO'),
                      );
                      const esPendienteRetirado = p.estado === 'PENDIENTE' && algunoRetirado;

                      return (
                        <tr key={p.id} className="s-table-row hover:bg-paper-2/40">
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-ink text-[15px]">{p.compradorNombre}</div>
                            {p.compradorContacto && (
                              <div className="text-xs text-ink-muted">{p.compradorContacto}</div>
                            )}
                          </td>
                          <td className="py-3.5 px-4">
                            {p.vendedorUsuario ? (
                              <span className="font-semibold text-ink">
                                {p.vendedorUsuario.nombre} {p.vendedorUsuario.apellido}
                              </span>
                            ) : (
                              <span className="text-ink-muted italic">Venta General</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="space-y-0.5 text-[13px]">
                              {p.detalles?.map((d: any) => (
                                <div key={d.id}>
                                  <strong className="text-brand">{d.cantidad}x</strong>{' '}
                                  {d.item?.nombre}
                                </div>
                              ))}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-right s-tabular">
                            <div className="font-black text-ink">
                              {formatearMoneda(Number(p.total))}
                            </div>
                            <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                              +{formatearMoneda(Number(p.totalGanancia || 0))}
                              {p.gananciaAcreditada && ' · Acred.'}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-center whitespace-nowrap">
                            <span
                              className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-black ${
                                p.estado === 'PAGADO'
                                  ? 's-badge-ok'
                                  : esPendienteRetirado
                                    ? 's-badge-err'
                                    : 's-badge-warn'
                              }`}
                            >
                              {esPendienteRetirado ? 'PENDIENTE (RETIRADO)' : p.estado}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <div className="flex items-center justify-center gap-1.5 flex-wrap">
                              {p.tickets?.map((t: any, idx: number) => (
                                <button
                                  key={t.id}
                                  type="button"
                                  onClick={() => handleVerTicket(t, p)}
                                  className={`px-2.5 py-1 rounded-xl text-xs font-bold inline-flex items-center gap-1 border cursor-pointer whitespace-nowrap ${
                                    t.estado === 'UTILIZADO'
                                      ? 'bg-paper-2 text-ink-muted border-rule line-through'
                                      : 's-badge-brand hover:opacity-85'
                                  }`}
                                >
                                  <QrCode className="w-3.5 h-3.5 shrink-0" />
                                  <span>Vale #{idx + 1}</span>
                                </button>
                              ))}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5">
                              {caps.canCreateGlobalEventos && p.estado === 'PENDIENTE' && (
                                <Button
                                  type="button"
                                  variant="primary"
                                  size="sm"
                                  disabled={p.gananciaAcreditada}
                                  onClick={() =>
                                    setPedidoModalState({
                                      abierto: true,
                                      pedido: { ...p, algunoRetirado, preferirCobro: true },
                                    })
                                  }
                                  leftIcon={<Landmark className="w-3.5 h-3.5" />}
                                >
                                  Cobrar
                                </Button>
                              )}
                              {(caps.canCreateGlobalEventos ||
                                (caps.canSellEventos && p.estado !== 'PAGADO')) && (
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  disabled={
                                    p.gananciaAcreditada || (!caps.canSellEventos && algunoRetirado)
                                  }
                                  onClick={() =>
                                    setPedidoModalState({
                                      abierto: true,
                                      pedido: { ...p, algunoRetirado, preferirCobro: false },
                                    })
                                  }
                                  leftIcon={<Edit2 className="w-3.5 h-3.5" />}
                                >
                                  Editar
                                </Button>
                              )}
                              {(caps.canCreateGlobalEventos ||
                                (caps.canSellEventos && p.estado !== 'PAGADO')) &&
                                !algunoRetirado &&
                                !p.gananciaAcreditada && (
                                  <Button
                                    type="button"
                                    variant="danger"
                                    size="sm"
                                    aria-label={`Eliminar pedido #${p.id}`}
                                    onClick={() => setPedidoAEliminar(p)}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden divide-y divide-rule">
                {pedidosFiltrados.map((p: any) => {
                  const algunoRetirado = Boolean(
                    p.tickets?.some((t: any) => t.estado === 'UTILIZADO'),
                  );
                  const esPendienteRetirado = p.estado === 'PENDIENTE' && algunoRetirado;

                  return (
                    <div key={p.id} className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="text-[15px] font-black text-ink truncate">
                            {p.compradorNombre}
                          </h3>
                          <p className="text-xs text-ink-muted mt-0.5">
                            {p.vendedorUsuario
                              ? `Scout: ${p.vendedorUsuario.nombre} ${p.vendedorUsuario.apellido}`
                              : 'Venta General'}
                          </p>
                        </div>
                        <div className="text-right shrink-0 s-tabular">
                          <span className="text-[15px] font-black text-ink block">
                            {formatearMoneda(Number(p.total))}
                          </span>
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-black mt-0.5 ${
                              p.estado === 'PAGADO'
                                ? 's-badge-ok'
                                : esPendienteRetirado
                                  ? 's-badge-err'
                                  : 's-badge-warn'
                            }`}
                          >
                            {esPendienteRetirado ? 'PENDIENTE (RETIRADO)' : p.estado}
                          </span>
                        </div>
                      </div>

                      <div className="s-panel rounded-xl p-3 text-[13px] space-y-1">
                        {p.detalles?.map((d: any) => (
                          <div key={d.id} className="flex justify-between gap-2">
                            <span>
                              <strong className="text-brand">{d.cantidad}x</strong> {d.item?.nombre}
                            </span>
                            <span className="text-ink-muted s-tabular">
                              {formatearMoneda(Number(d.subtotal))}
                            </span>
                          </div>
                        ))}
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap gap-1.5">
                          {p.tickets?.map((t: any, idx: number) => (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => handleVerTicket(t, p)}
                              className={`min-h-[38px] px-3 py-1.5 rounded-xl text-[13px] font-bold inline-flex items-center gap-1.5 border cursor-pointer ${
                                t.estado === 'UTILIZADO'
                                  ? 'bg-paper-2 text-ink-muted border-rule line-through'
                                  : 's-badge-brand'
                              }`}
                            >
                              <QrCode className="w-4 h-4" />
                              <span>Vale #{idx + 1}</span>
                            </button>
                          ))}
                        </div>

                        <div className="flex items-center gap-1.5 ml-auto">
                          {caps.canCreateGlobalEventos && p.estado === 'PENDIENTE' && (
                            <Button
                              type="button"
                              variant="primary"
                              size="sm"
                              disabled={p.gananciaAcreditada}
                              onClick={() =>
                                setPedidoModalState({
                                  abierto: true,
                                  pedido: { ...p, algunoRetirado, preferirCobro: true },
                                })
                              }
                            >
                              Cobrar
                            </Button>
                          )}
                          {(caps.canCreateGlobalEventos ||
                            (caps.canSellEventos && p.estado !== 'PAGADO')) && (
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              disabled={
                                p.gananciaAcreditada || (!caps.canSellEventos && algunoRetirado)
                              }
                              onClick={() =>
                                setPedidoModalState({
                                  abierto: true,
                                  pedido: { ...p, algunoRetirado, preferirCobro: false },
                                })
                              }
                            >
                              Editar
                            </Button>
                          )}
                          {(caps.canCreateGlobalEventos ||
                            (caps.canSellEventos && p.estado !== 'PAGADO')) &&
                            !algunoRetirado &&
                            !p.gananciaAcreditada && (
                              <Button
                                type="button"
                                variant="danger"
                                size="sm"
                                aria-label="Eliminar pedido"
                                onClick={() => setPedidoAEliminar(p)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* SUB-TAB 3: LIQUIDACIÓN A FAMILIAS */}
      {tab === 'liquidacion' && caps.canSellEventos && (
        <div className="space-y-4 s-anim-tab">
          <div className="s-card rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-lg font-black text-ink flex items-center gap-2">
                <Award className="w-5 h-5 text-brand shrink-0" />
                <span>Pre-flight de Liquidación a Saldo a Favor</span>
              </h2>
              <p className="text-[13px] text-ink-muted leading-relaxed">
                Revisá el detalle por vendedor scout antes de acreditar ganancias. Solo se liquidan pedidos pagados cuyos vales QR ya fueron retirados.
              </p>
            </div>

            {caps.canConfigureEventos && (
              <Button
                type="button"
                variant="primary"
                size="md"
                disabled={resumenLiquidacion.pedidosListos === 0 || acreditando}
                onClick={() => setConfirmAcreditar(true)}
                leftIcon={
                  acreditando ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Award className="w-4 h-4" />
                  )
                }
              >
                Acreditar {formatearMoneda(resumenLiquidacion.montoListo)}
              </Button>
            )}
          </div>

          {liquidacionPorScout.length === 0 ? (
            <div className="s-card rounded-2xl p-10 text-center text-sm text-ink-muted">
              No hay ventas asignadas a vendedores scouts en este evento para liquidar a familias.
            </div>
          ) : (
            <div className="s-card rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="border-b border-rule bg-paper-2 text-xs uppercase tracking-wider text-ink-muted">
                      <th className="py-3.5 px-4 font-bold">Scout Vendedor</th>
                      <th className="py-3.5 px-4 font-bold text-center">Pedidos Totales</th>
                      <th className="py-3.5 px-4 font-bold text-center">Pend. pago o retiro</th>
                      <th className="py-3.5 px-4 font-bold text-center">Listos p/ Liquidar</th>
                      <th className="py-3.5 px-4 font-bold text-right">Ya Acreditado</th>
                      <th className="py-3.5 px-4 font-bold text-right">A Acreditar Hoy</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rule s-tabular">
                    {liquidacionPorScout.map((row) => (
                      <tr key={row.key} className="s-table-row hover:bg-paper-2/40">
                        <td className="py-3.5 px-4 font-bold text-ink">
                          {row.vendedorNombre}
                          {row.vendedorDni && (
                            <span className="block text-xs font-normal text-ink-muted">
                              DNI {row.vendedorDni}
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-center font-semibold">{row.totalPedidos}</td>
                        <td className="py-3.5 px-4 text-center text-ink-muted">
                          {row.pedidosPendientesRetiro}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                              row.pedidosListosAcreditar > 0 ? 's-badge-ok' : 'bg-paper-2 text-ink-muted'
                            }`}
                          >
                            {row.pedidosListosAcreditar}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right text-ink-muted">
                          {formatearMoneda(row.gananciaAcreditada)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-black text-emerald-600 dark:text-emerald-400">
                          +{formatearMoneda(row.gananciaListaParaAcreditar)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modales y Diálogos de Confirmación */}
      <ModalCrearEventoEconomico
        abierto={modalEditarEventoAbierto}
        onCerrar={() => setModalEditarEventoAbierto(false)}
        onGuardado={() => {
          void cargarTodo();
        }}
        eventoAEditar={evento}
        onToast={(texto, tipo) => mostrarToast(texto, tipo === 'error' ? 'error' : 'exito')}
      />

      <ModalCargarPedidoEvento
        abierto={pedidoModalState.abierto}
        onCerrar={() => setPedidoModalState({ abierto: false, pedido: null })}
        onGuardado={() => {
          void cargarTodo();
        }}
        eventoId={evento.id}
        eventoTitulo={evento.titulo}
        itemsEvento={itemsCatalogo}
        pedidoAEditar={pedidoModalState.pedido}
        bloquearVendedor={!caps.canSellEventos}
        vendedorFijoId={!caps.canSellEventos ? usuarioActual?.id : undefined}
        vendedorFijoNombre={
          !caps.canSellEventos && usuarioActual
            ? `${usuarioActual.nombre} ${usuarioActual.apellido}`
            : undefined
        }
        onToast={(texto, tipo) => mostrarToast(texto, tipo === 'error' ? 'error' : 'exito')}
      />

      <ModalTicketQR
        abierto={modalTicketQR.abierto}
        onCerrar={() => setModalTicketQR({ abierto: false, ticket: null })}
        ticket={modalTicketQR.ticket}
      />

      <ConfirmImpactDialog
        abierto={confirmAcreditar}
        onCerrar={() => setConfirmAcreditar(false)}
        onConfirmar={ejecutarAcreditarGanancias}
        titulo="Confirmar Liquidación a Familias"
        peligroso={false}
        tipoImpacto="info"
        cargando={acreditando}
        textoConfirmar="Acreditar Ganancias"
        mensaje={
          <span>
            Se acreditarán las ganancias de <strong>{resumenLiquidacion.pedidosListos} pedido(s)</strong>{' '}
            con vales QR ya retirados de <strong>"{evento.titulo}"</strong>.
          </span>
        }
        impacto={
          <span>
            Impacto total: <strong>+{formatearMoneda(resumenLiquidacion.montoListo)}</strong> en el{' '}
            <strong>Saldo a Favor</strong> de los scouts vendedores. Esta operación no se puede revertir automáticamente.
          </span>
        }
      />

      <ConfirmImpactDialog
        abierto={Boolean(pedidoAEliminar)}
        onCerrar={() => setPedidoAEliminar(null)}
        onConfirmar={ejecutarEliminarPedido}
        titulo="Eliminar Pedido"
        peligroso={true}
        tipoImpacto="warn"
        cargando={eliminandoPedido}
        textoConfirmar="Sí, eliminar"
        mensaje={
          pedidoAEliminar ? (
            <span>
              ¿Eliminar el pedido <strong>#{pedidoAEliminar.id}</strong> de{' '}
              <strong>{pedidoAEliminar.compradorNombre}</strong> por{' '}
              <strong>{formatearMoneda(Number(pedidoAEliminar.total))}</strong>?
            </span>
          ) : null
        }
        impacto="Se reintegrará el stock de los productos y tendrás 7,5 segundos para deshacer si te arrepentís."
      />

      <ConfirmImpactDialog
        abierto={confirmEliminarEvento}
        onCerrar={() => setConfirmEliminarEvento(false)}
        onConfirmar={ejecutarEliminarEvento}
        titulo="Eliminar Evento Económico"
        peligroso={true}
        tipoImpacto="danger"
        cargando={eliminandoEvento}
        textoConfirmar="Sí, eliminar evento"
        mensaje={
          <span>
            ¿Seguro que querés eliminar el evento <strong>"{evento.titulo}"</strong>?
          </span>
        }
        impacto={
          (evento.metricas?.cantidadPedidos || 0) > 0
            ? `Atención: este evento tiene ${evento.metricas.cantidadPedidos} pedido(s) asociados.`
            : 'Si no tiene pedidos, podrás deshacer la eliminación durante 7,5 segundos.'
        }
      />
    </div>
  );
};
