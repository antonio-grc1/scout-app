import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  ShoppingBag,
  User,
  Phone,
  Landmark,
  Plus,
  Minus,
  Sparkles,
  CheckCircle2,
  Search,
  Lock,
  Edit2,
  Trash2,
} from 'lucide-react';
import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { useToastStore, mostrarToastConDeshacer } from '../store/toastStore';
import { formatearMoneda, traducirErrorAmigable } from '../lib/formatters';
import { Button } from './ui/Button';
import { useModalOverlay } from '../hooks/useModalOverlay';

export interface PedidoAEditar {
  id: number;
  estado?: string;
  compradorNombre: string;
  compradorContacto?: string | null;
  vendedorUsuarioId?: number | null;
  vendedorUsuario?: { id: number; nombre: string; apellido: string; dni?: string } | null;
  metodoPago?: string | null;
  cuentaId?: number | null;
  observaciones?: string | null;
  detalles?: Array<{
    itemId: number;
    cantidad: number;
  }>;
  algunoRetirado?: boolean;
  gananciaAcreditada?: boolean;
  tickets?: Array<{
    id: number;
    estado: string;
  }>;
}

export interface ModalCargarPedidoEventoProps {
  abierto: boolean;
  onCerrar: () => void;
  onGuardado: () => void;
  eventoId: number;
  eventoTitulo: string;
  itemsEvento?: Array<{
    id: number;
    nombre: string;
    precioVenta: string | number;
    costoUnitario: string | number;
    gananciaUnitaria: string | number;
    stockDisponible: number | null;
  }>;
  pedidoAEditar?: (PedidoAEditar & { estado?: string; preferirCobro?: boolean }) | null;
  bloquearVendedor?: boolean;
  vendedorFijoNombre?: string;
  vendedorFijoId?: number;
  onToast?: (texto: string, tipo?: 'exito' | 'error') => void;
}

export const ModalCargarPedidoEvento: React.FC<ModalCargarPedidoEventoProps> = ({
  abierto,
  onCerrar,
  onGuardado,
  eventoId,
  eventoTitulo,
  itemsEvento = [],
  pedidoAEditar = null,
  bloquearVendedor = false,
  vendedorFijoNombre,
  vendedorFijoId,
  onToast,
}) => {
  const [compradorNombre, setCompradorNombre] = useState('');
  const [compradorContacto, setCompradorContacto] = useState('');
  const [vendedorUsuarioId, setVendedorUsuarioId] = useState<string>('');
  const [cantidades, setCantidades] = useState<Record<number, number>>({});
  const [metodoPago, setMetodoPago] = useState<'EFECTIVO' | 'TRANSFERENCIA' | 'PENDIENTE'>('PENDIENTE');
  const [cuentaId, setCuentaId] = useState<string>('');
  const [observaciones, setObservaciones] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [eliminando, setEliminando] = useState(false);

  const { backdropProps, contentProps } = useModalOverlay({
    abierto,
    onCerrar,
    bloqueado: guardando || eliminando,
  });
  const [modalConfirmarEliminar, setModalConfirmarEliminar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const esGlobalEventos = useAuthStore((s) =>
    s.tienePermisoGlobal(['eventos.editar', 'eventos.editar', 'caja.editar']),
  );
  const puedeImputarCuenta = !bloquearVendedor && esGlobalEventos;

  // Buscador de miembros
  const [busquedaMiembro, setBusquedaMiembro] = useState('');
  const [mostrarDropdownMiembros, setMostrarDropdownMiembros] = useState(false);

  // Listas
  const [miembros, setMiembros] = useState<Array<{ id: number; nombre: string; apellido: string; dni?: string }>>([]);
  const [cuentas, setCuentas] = useState<Array<{ id: number; nombre: string }>>([]);

  const safeItems = Array.isArray(itemsEvento) ? itemsEvento : [];
  const esModoEdicion = Boolean(pedidoAEditar);
  const pedidoYaPagado = esModoEdicion && pedidoAEditar?.estado === 'PAGADO';
  // Si la ganancia ya se acreditó al vendedor, revertir el cobro dejaría saldo a favor sin respaldo.
  const bloquearVolverAPendiente = pedidoYaPagado && Boolean(pedidoAEditar?.gananciaAcreditada);
  const valesRetirados = Boolean(
    pedidoAEditar?.algunoRetirado ||
      pedidoAEditar?.tickets?.some((t) => t.estado === 'UTILIZADO'),
  );

  useEffect(() => {
    if (abierto) {
      cargarDatos();

      if (pedidoAEditar) {
        setCompradorNombre(pedidoAEditar.compradorNombre || '');
        setCompradorContacto(pedidoAEditar.compradorContacto || '');
        setVendedorUsuarioId(
          pedidoAEditar.vendedorUsuarioId ? String(pedidoAEditar.vendedorUsuarioId) : '',
        );
        setObservaciones(pedidoAEditar.observaciones || '');
        if (
          puedeImputarCuenta &&
          (pedidoAEditar.metodoPago === 'EFECTIVO' || pedidoAEditar.metodoPago === 'TRANSFERENCIA')
        ) {
          setMetodoPago(pedidoAEditar.metodoPago);
        } else if (
          (pedidoAEditar.preferirCobro || pedidoAEditar.estado === 'PAGADO') &&
          puedeImputarCuenta
        ) {
          // Un pedido ya pagado (con método no estándar) se mantiene cobrado al editarlo.
          setMetodoPago('EFECTIVO');
        } else {
          // Editar un pedido pendiente (p. ej. corregir el nombre) no debe cobrarlo por defecto:
          // solo se cobra si el usuario elige explícitamente un método de pago.
          setMetodoPago('PENDIENTE');
        }
        if (pedidoAEditar.cuentaId) {
          setCuentaId(String(pedidoAEditar.cuentaId));
        }

        const cMap: Record<number, number> = {};
        if (Array.isArray(pedidoAEditar.detalles)) {
          for (const d of pedidoAEditar.detalles) {
            cMap[d.itemId] = d.cantidad;
          }
        }
        setCantidades(cMap);
      } else {
        setCompradorNombre('');
        setCompradorContacto('');
        setObservaciones('');
        setMetodoPago('PENDIENTE');

        if (bloquearVendedor && vendedorFijoId) {
          setVendedorUsuarioId(String(vendedorFijoId));
        } else {
          setVendedorUsuarioId('');
        }

        if (safeItems.length > 0) {
          setCantidades({ [safeItems[0].id]: 1 });
        } else {
          setCantidades({});
        }
      }
      setBusquedaMiembro('');
      setMostrarDropdownMiembros(false);
      setModalConfirmarEliminar(false);
      setError(null);
    }
  }, [abierto, pedidoAEditar, itemsEvento, bloquearVendedor, vendedorFijoId]);

  const cargarDatos = async () => {
    if (bloquearVendedor) {
      setMiembros([]);
      setCuentas([]);
      return;
    }
    try {
      const [resMiembros, resCuentas] = await Promise.all([
        api.get('/miembros?porPagina=100').catch(() => ({ data: { items: [] } })),
        esGlobalEventos
          ? api.get('/tesoreria/cuentas').catch(() => ({ data: [] }))
          : Promise.resolve({ data: [] }),
      ]);
      const mData = resMiembros.data;
      const mList = Array.isArray(mData)
        ? mData
        : Array.isArray(mData?.items)
        ? mData.items
        : [];
      setMiembros(mList);

      const cData = resCuentas.data;
      const cList = Array.isArray(cData) ? cData : [];
      setCuentas(cList);
      if (cList.length > 0) {
        setCuentaId((prev) => {
          if (prev && cList.some((c) => String(c.id) === String(prev))) return prev;
          if (pedidoAEditar?.cuentaId && cList.some((c) => c.id === pedidoAEditar.cuentaId)) {
            return String(pedidoAEditar.cuentaId);
          }
          return String(cList[0].id);
        });
      }
    } catch {
      // Ignorar
    }
  };

  // Búsqueda dinámica de miembros con debounce
  useEffect(() => {
    const q = busquedaMiembro.trim();
    if (!q || bloquearVendedor) return;

    const timer = setTimeout(async () => {
      try {
        const res = await api.get('/miembros', { params: { q, porPagina: 50 } });
        const data = res.data;
        const items = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
        if (items.length > 0) {
          setMiembros((prev) => {
            const map = new Map(prev.map((m) => [m.id, m]));
            for (const item of items) {
              map.set(item.id, item);
            }
            return Array.from(map.values());
          });
        }
      } catch {
        // Ignorar
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [busquedaMiembro, bloquearVendedor]);

  // Miembros filtrados por el buscador con soporte de tildes
  const miembrosFiltrados = useMemo(() => {
    const q = busquedaMiembro
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    if (!q) return miembros.slice(0, 15);
    return miembros
      .filter((m) => {
        const full = `${m.nombre} ${m.apellido}`
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '');
        const inv = `${m.apellido} ${m.nombre}`
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '');
        const dni = String(m.dni || '');
        return full.includes(q) || inv.includes(q) || dni.includes(q);
      })
      .slice(0, 25);
  }, [miembros, busquedaMiembro]);

  const miembroSeleccionado = useMemo(() => {
    if (!vendedorUsuarioId) return null;
    const encontrado = miembros.find((m) => String(m.id) === String(vendedorUsuarioId));
    if (encontrado) return encontrado;
    if (
      pedidoAEditar?.vendedorUsuario &&
      String(pedidoAEditar.vendedorUsuario.id) === String(vendedorUsuarioId)
    ) {
      return pedidoAEditar.vendedorUsuario;
    }
    return null;
  }, [miembros, vendedorUsuarioId, pedidoAEditar]);

  if (!abierto) return null;

  const handleCambiarCantidad = (itemId: number, delta: number) => {
    setCantidades((prev) => {
      const actual = prev[itemId] || 0;
      const nuevo = Math.max(0, actual + delta);
      return { ...prev, [itemId]: nuevo };
    });
  };

  // Cálculo de totales
  let totalCobrar = 0;
  let totalGanancia = 0;
  let totalUnidades = 0;

  for (const it of safeItems) {
    const cant = cantidades[it.id] || 0;
    if (cant > 0) {
      totalUnidades += cant;
      totalCobrar += Number(it.precioVenta || 0) * cant;
      totalGanancia += Number(it.gananciaUnitaria || 0) * cant;
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!compradorNombre.trim()) {
      setError('Indicá el nombre del comprador o cliente');
      return;
    }

    if (totalUnidades <= 0) {
      setError('Debe seleccionar al menos un producto (cantidad mayor a 0)');
      return;
    }

    if (!bloquearVendedor && !esGlobalEventos && !vendedorUsuarioId) {
      setError('Seleccioná un miembro de tu rama como vendedor del pedido.');
      return;
    }

    if (puedeImputarCuenta && metodoPago !== 'PENDIENTE' && !cuentaId) {
      setError('Por favor seleccioná en qué cuenta financiera ingresa el cobro');
      return;
    }

    setGuardando(true);
    try {
      const itemsPayload = Object.entries(cantidades)
        .filter(([, cant]) => cant > 0)
        .map(([itemIdStr, cant]) => ({
          itemId: Number(itemIdStr),
          cantidad: cant,
        }));

      // Detectar si los items o cantidades cambiaron respecto a los detalles originales
      const detallesOriginales = pedidoAEditar?.detalles || [];
      const itemsCambiaron =
        !pedidoAEditar ||
        itemsPayload.length !== detallesOriginales.length ||
        itemsPayload.some((it) => {
          const orig = detallesOriginales.find((d) => d.itemId === it.itemId);
          return !orig || orig.cantidad !== it.cantidad;
        });

      const payload: any = {
        compradorNombre: compradorNombre.trim(),
        compradorContacto: compradorContacto.trim() || undefined,
        vendedorUsuarioId: vendedorUsuarioId ? Number(vendedorUsuarioId) : null,
        metodoPago: puedeImputarCuenta && metodoPago !== 'PENDIENTE' ? metodoPago : undefined,
        cuentaId:
          puedeImputarCuenta && metodoPago !== 'PENDIENTE' && cuentaId
            ? Number(cuentaId)
            : puedeImputarCuenta && metodoPago === 'PENDIENTE' && pedidoYaPagado
              ? null // null explícito: el backend revierte el cobro y vuelve el pedido a PENDIENTE
              : undefined,
        observaciones: observaciones.trim() || undefined,
      };

      if (!valesRetirados && itemsCambiaron) {
        payload.items = itemsPayload;
      }

      if (esModoEdicion && pedidoAEditar) {
        await api.patch(`/tesoreria/eventos/pedidos/${pedidoAEditar.id}`, payload);
        if (onToast) onToast('Pedido actualizado exitosamente', 'exito');
      } else {
        payload.eventoId = eventoId;
        payload.items = itemsPayload;
        await api.post('/tesoreria/eventos/pedidos', payload);
        if (onToast) onToast('Pedido registrado y vales QR generados correctamente', 'exito');
      }

      onGuardado();
      onCerrar();
    } catch (err) {
      const msg = traducirErrorAmigable(
        err,
        esModoEdicion ? 'No se pudo actualizar el pedido.' : 'No se pudo registrar el pedido.',
      );
      setError(msg);
      if (onToast) onToast(msg, 'error');
    } finally {
      setGuardando(false);
    }
  };

  const handleEliminarPedido = async () => {
    if (!pedidoAEditar) return;
    const pedidoAEliminar = { ...pedidoAEditar };
    setEliminando(true);
    try {
      await api.delete(`/tesoreria/eventos/pedidos/${pedidoAEliminar.id}`);
      setModalConfirmarEliminar(false);
      onCerrar();
      onGuardado();

      mostrarToastConDeshacer(
        `Pedido #${pedidoAEliminar.id} (${pedidoAEliminar.compradorNombre}) eliminado.`,
        async () => {
          try {
            await api.post('/tesoreria/eventos/pedidos', {
              eventoId,
              compradorNombre: pedidoAEliminar.compradorNombre,
              compradorContacto: pedidoAEliminar.compradorContacto,
              vendedorUsuarioId: pedidoAEliminar.vendedorUsuarioId,
              metodoPago: pedidoAEliminar.metodoPago,
              cuentaId: pedidoAEliminar.cuentaId,
              observaciones: pedidoAEliminar.observaciones,
              items: (pedidoAEliminar.detalles || []).map((d) => ({
                itemId: d.itemId,
                cantidad: d.cantidad,
              })),
            });
            onGuardado();
            useToastStore.getState().mostrarToast(`Pedido #${pedidoAEliminar.id} restaurado.`);
          } catch (err: any) {
            const msg = traducirErrorAmigable(err, 'No se pudo restaurar el pedido.');
            useToastStore.getState().mostrarToast(msg, 'error');
          }
        },
      );
    } catch (err) {
      const msg = traducirErrorAmigable(err, 'No se pudo eliminar el pedido.');
      setError(msg);
      if (onToast) onToast(msg, 'error');
    } finally {
      setEliminando(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      {...backdropProps}
    >
      <div
        className="relative w-full max-w-lg rounded-3xl bg-surface border border-rule shadow-2xl overflow-hidden flex flex-col max-h-[92dvh]"
        {...contentProps}
      >
        {/* Header */}
        <div className="p-5 bg-paper-2 border-b border-rule flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            {esModoEdicion ? (
              <Edit2 className="w-5 h-5 text-brand" />
            ) : (
              <ShoppingBag className="w-5 h-5 text-brand" />
            )}
            <div>
              <h3 className="text-lg font-black text-ink">
                {esModoEdicion ? `Editar Pedido #${pedidoAEditar?.id}` : 'Cargar Pedido / Venta'}
              </h3>
              <span className="text-[13px] text-ink-muted">{eventoTitulo}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center p-1.5 rounded-xl text-ink-muted hover:text-ink hover:bg-paper-3 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 overflow-y-auto space-y-4 flex-1">
          {error && (
            <div role="alert" className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-sm">
              {error}
            </div>
          )}

          {/* Datos del Comprador */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-[13px] font-bold text-ink mb-1.5 flex items-center gap-1.5">
                <User className="w-4 h-4 text-brand" />
                Nombre del Comprador *
              </label>
              <input
                type="text"
                value={compradorNombre}
                onChange={(e) => setCompradorNombre(e.target.value)}
                placeholder="Ej: Juan Pérez"
                className="w-full min-h-[46px] py-2.5 px-3.5 rounded-xl bg-surface border border-rule text-base sm:text-[15px] text-ink focus:outline-brand"
                required
              />
            </div>

            <div>
              <label className="block text-[13px] font-bold text-ink mb-1.5 flex items-center gap-1.5">
                <Phone className="w-4 h-4 text-brand" />
                Teléfono de quien retira
              </label>
              <input
                type="text"
                value={compradorContacto}
                onChange={(e) => setCompradorContacto(e.target.value)}
                placeholder="Ej: 11 2345-6789"
                className="w-full min-h-[46px] py-2.5 px-3.5 rounded-xl bg-surface border border-rule text-base sm:text-[15px] text-ink focus:outline-brand"
              />
            </div>
          </div>

          {/* Buscador de Scout / Familia Vendedora */}
          <div>
            <label className="block text-[13px] font-bold text-ink mb-1.5 flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-emerald-600" />
                Scout / Familia Vendedora (Acredita Ganancia)
              </span>
              <span className="text-xs text-ink-muted">
                {bloquearVendedor
                  ? 'Asignado a tu cuenta'
                  : esGlobalEventos
                  ? 'Opcional'
                  : 'Obligatorio (tu rama)'}
              </span>
            </label>

            {bloquearVendedor ? (
              <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-emerald-600" />
                  <span className="text-sm font-bold text-emerald-800 dark:text-emerald-200">
                    {vendedorFijoNombre || 'Tu cuenta de beneficiario'}
                  </span>
                </div>
                <span className="text-xs text-emerald-600 font-semibold">Ganancia para tu saldo</span>
              </div>
            ) : (
              <div className="relative">
                {miembroSeleccionado ? (
                  <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Sparkles className="w-4 h-4 text-emerald-600" />
                      <span className="text-sm font-bold text-ink">
                        {miembroSeleccionado.nombre} {miembroSeleccionado.apellido}
                      </span>
                      {miembroSeleccionado.dni && (
                        <span className="text-xs text-ink-muted">(DNI: {miembroSeleccionado.dni})</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setVendedorUsuarioId('');
                        setBusquedaMiembro('');
                      }}
                      className="p-1.5 rounded-lg hover:bg-paper-3 text-ink-muted hover:text-ink cursor-pointer"
                      title="Quitar asignación (Venta general)"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div>
                    <div className="relative">
                      <Search className="w-4 h-4 text-ink-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={busquedaMiembro}
                        onChange={(e) => {
                          setBusquedaMiembro(e.target.value);
                          setMostrarDropdownMiembros(true);
                        }}
                        onFocus={() => setMostrarDropdownMiembros(true)}
                        aria-label="Buscar scout por nombre, apellido o DNI" placeholder="Buscar scout..."
                        className="w-full min-h-[44px] py-2 pl-10 pr-3.5 rounded-xl bg-surface border border-rule text-base sm:text-[15px] text-ink focus:outline-brand"
                      />
                    </div>

                    {mostrarDropdownMiembros && (
                      <div className="absolute left-0 right-0 top-full mt-1 max-h-52 overflow-y-auto rounded-xl bg-surface border border-rule shadow-xl z-20 py-1 divide-y divide-rule/40">
                        {esGlobalEventos && (
                          <button
                            type="button"
                            onClick={() => {
                              setVendedorUsuarioId('');
                              setMostrarDropdownMiembros(false);
                              setBusquedaMiembro('');
                            }}
                            className="w-full px-3.5 py-2.5 text-left text-[13px] text-ink-muted hover:bg-paper-2 flex items-center justify-between cursor-pointer"
                          >
                            <span>(Venta general del Grupo Scout - sin vendedor)</span>
                            <span className="text-xs text-ink-muted">Sin ganancia individual</span>
                          </button>
                        )}

                        {miembrosFiltrados.map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => {
                              setVendedorUsuarioId(String(m.id));
                              setMostrarDropdownMiembros(false);
                              setBusquedaMiembro('');
                            }}
                            className="w-full px-3.5 py-2.5 text-left text-[13px] text-ink hover:bg-emerald-50 dark:hover:bg-emerald-950/30 flex items-center justify-between cursor-pointer"
                          >
                            <span className="font-bold">
                              {m.nombre} {m.apellido}
                            </span>
                            {m.dni && <span className="text-xs text-ink-muted">DNI {m.dni}</span>}
                          </button>
                        ))}

                        {miembrosFiltrados.length === 0 && (
                          <div className="px-3.5 py-2.5 text-[13px] text-ink-muted text-center">
                            No se encontraron scouts con ese nombre o DNI.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
                <p className="text-xs text-ink-muted mt-1.5">
                  Al retirar el pedido, la ganancia se acreditará automáticamente en el <strong>saldo a favor</strong> de este miembro.
                </p>
              </div>
            )}
          </div>

          {/* Selección de Productos y Cantidades */}
          <div className="space-y-2.5 pt-2.5 border-t border-rule">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-bold text-ink block">Productos solicitados:</span>
              {valesRetirados && (
                <span className="text-xs font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  <Lock className="w-3.5 h-3.5" />
                  Vales retirados (solo lectura)
                </span>
              )}
            </div>

            {valesRetirados && (
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-[13px] text-amber-900 dark:text-amber-200 flex items-center gap-2">
                <Lock className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <span>
                  <strong>Vales ya retirados:</strong> Los productos y cantidades quedan fijos para preservar la entrega. Podés registrar el cobro, cambiar la cuenta o actualizar observaciones.
                </span>
              </div>
            )}

            {safeItems.length === 0 ? (
              <div className="p-4 text-center text-[13px] text-ink-muted bg-paper-2 rounded-xl">
                No hay productos configurados para este evento.
              </div>
            ) : (
              <div className="space-y-2.5">
                {safeItems.map((it) => {
                  const cant = cantidades[it.id] || 0;
                  return (
                    <div
                      key={it.id}
                      className="p-3.5 rounded-2xl bg-paper-2 border border-rule flex items-center justify-between gap-3"
                    >
                      <div>
                        <h4 className="text-sm font-black text-ink">{it.nombre}</h4>
                        <span className="text-[13px] text-emerald-600 font-bold block">
                          {formatearMoneda(Number(it.precioVenta))}
                        </span>
                      </div>

                      <div className="flex items-center gap-2.5">
                        <button
                          type="button"
                          onClick={() => handleCambiarCantidad(it.id, -1)}
                          disabled={valesRetirados || cant <= 0}
                          className="w-9 h-9 rounded-xl bg-surface border border-rule text-ink flex items-center justify-center hover:bg-paper-3 disabled:opacity-30 cursor-pointer"
                          title={valesRetirados ? 'No se puede modificar: vales ya retirados' : undefined}
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="w-7 text-center text-sm font-black text-ink">{cant}</span>
                        <button
                          type="button"
                          onClick={() => handleCambiarCantidad(it.id, 1)}
                          disabled={valesRetirados}
                          className="w-9 h-9 rounded-xl bg-surface border border-rule text-ink flex items-center justify-center hover:bg-paper-3 disabled:opacity-30 cursor-pointer"
                          title={valesRetirados ? 'No se puede modificar: vales ya retirados' : undefined}
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

          {/* Resumen de Importes */}
          <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-center justify-between">
            <div>
              <span className="text-[13px] font-bold text-emerald-800 dark:text-emerald-200 block">Total a Cobrar:</span>
              <span className="text-xl font-black text-emerald-700 dark:text-emerald-300">
                {formatearMoneda(totalCobrar)}
              </span>
            </div>

            <div className="text-right">
              <span className="text-[13px] font-bold text-emerald-800 dark:text-emerald-200 block">Ganancia Familiar:</span>
              <span className="text-base font-black text-emerald-600 dark:text-emerald-400">
                +{formatearMoneda(totalGanancia)}
              </span>
            </div>
          </div>

          {/* Observaciones */}
          <div>
            <label className="block text-[13px] font-bold text-ink mb-1.5">Observaciones / Aclaraciones</label>
            <input
              type="text"
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder="Aclaraciones u observaciones"
              className="w-full min-h-[44px] py-2 px-3.5 rounded-xl bg-surface border border-rule text-base sm:text-[15px] text-ink focus:outline-brand"
            />
          </div>

          {/* Cobro en el momento (solo con alcance global y fuera de autogestión) */}
          {puedeImputarCuenta && (
            <div className="space-y-2.5 pt-2.5 border-t border-rule">
              <label className="block text-[13px] font-bold text-ink">Estado del Cobro:</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  aria-pressed={metodoPago === 'PENDIENTE'}
                  type="button"
                  onClick={() => setMetodoPago('PENDIENTE')}
                  disabled={bloquearVolverAPendiente}
                  title={
                    bloquearVolverAPendiente
                      ? 'La ganancia de este pedido ya se acreditó: no se puede revertir el cobro.'
                      : undefined
                  }
                  className={`min-h-[42px] py-2 px-3 rounded-xl border text-[13px] font-bold transition cursor-pointer text-center disabled:opacity-50 disabled:cursor-not-allowed ${
                    metodoPago === 'PENDIENTE'
                      ? 'bg-amber-100 dark:bg-amber-950 border-amber-400 text-amber-900 dark:text-amber-100'
                      : 'bg-surface border-rule text-ink-muted'
                  }`}
                >
                  Cobrar al Retirar
                </button>

                <button
                  aria-pressed={metodoPago === 'EFECTIVO'}
                  type="button"
                  onClick={() => setMetodoPago('EFECTIVO')}
                  className={`min-h-[42px] py-2 px-3 rounded-xl border text-[13px] font-bold transition cursor-pointer text-center ${
                    metodoPago === 'EFECTIVO'
                      ? 'bg-emerald-100 dark:bg-emerald-950 border-emerald-400 text-emerald-900 dark:text-emerald-100'
                      : 'bg-surface border-rule text-ink-muted'
                  }`}
                >
                  Pagó en Efectivo
                </button>

                <button
                  type="button"
                  onClick={() => setMetodoPago('TRANSFERENCIA')}
                  className={`min-h-[42px] py-2 px-3 rounded-xl border text-[13px] font-bold transition cursor-pointer text-center ${
                    metodoPago === 'TRANSFERENCIA'
                      ? 'bg-blue-100 dark:bg-blue-950 border-blue-400 text-blue-900 dark:text-blue-100'
                      : 'bg-surface border-rule text-ink-muted'
                  }`}
                >
                  Transferencia
                </button>
              </div>

              {metodoPago !== 'PENDIENTE' && (
                <div className="mt-2.5">
                  <label className="block text-[13px] font-bold text-ink mb-1.5 flex items-center gap-1.5">
                    <Landmark className="w-4 h-4 text-brand" />
                    Ingresá en la cuenta:
                  </label>
                  <select
                    value={cuentaId}
                    onChange={(e) => setCuentaId(e.target.value)}
                    className="w-full min-h-[44px] py-2 px-3.5 rounded-xl bg-surface border border-rule text-base sm:text-[15px] text-ink focus:outline-brand"
                    required
                  >
                    {Array.isArray(cuentas) &&
                      cuentas.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nombre}
                        </option>
                      ))}
                  </select>
                </div>
              )}
            </div>
          )}

          <div className="pt-3.5 flex flex-wrap items-center justify-between gap-2.5 border-t border-rule shrink-0">
            {esModoEdicion && (esGlobalEventos || pedidoAEditar?.estado !== 'PAGADO') ? (
              modalConfirmarEliminar ? (
                <div className="w-full p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 flex flex-wrap items-center justify-between gap-2.5">
                  <span className="text-[13px] font-bold text-rose-800 dark:text-rose-200">
                    ¿Eliminar el pedido #{pedidoAEditar?.id}? Se anularán los vales QR y se restituirá el stock.
                  </span>
                  <div className="flex items-center gap-2 ml-auto">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setModalConfirmarEliminar(false)}
                      disabled={eliminando}
                    >
                      Cancelar
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      onClick={handleEliminarPedido}
                      disabled={eliminando}
                    >
                      {eliminando ? 'Eliminando...' : 'Sí, Eliminar Pedido'}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  onClick={() => setModalConfirmarEliminar(true)}
                  disabled={guardando || eliminando || valesRetirados}
                  className="gap-1.5"
                  title={valesRetirados ? 'No se puede eliminar un pedido con vales ya retirados' : undefined}
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Eliminar Pedido</span>
                </Button>
              )
            ) : (
              <div />
            )}

            {!modalConfirmarEliminar && (
              <div className="flex items-center gap-2 ml-auto">
                <Button type="button" variant="secondary" onClick={onCerrar} disabled={guardando || eliminando}>
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={guardando || eliminando || totalUnidades <= 0}
                  className="gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {guardando
                      ? 'Guardando...'
                      : esModoEdicion
                      ? metodoPago !== 'PENDIENTE' && (!pedidoAEditar?.metodoPago || pedidoAEditar.metodoPago === 'PENDIENTE')
                        ? 'Confirmar Cobro'
                        : 'Guardar Modificaciones'
                      : 'Confirmar Pedido y Generar Vales QR'}
                  </span>
                </Button>
              </div>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
