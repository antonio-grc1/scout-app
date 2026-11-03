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
} from 'lucide-react';
import { api } from '../api/client';
import { formatearMoneda, traducirErrorAmigable } from '../lib/formatters';
import { Button } from './ui/Button';

export interface PedidoAEditar {
  id: number;
  compradorNombre: string;
  compradorContacto?: string | null;
  vendedorUsuarioId?: number | null;
  vendedorUsuario?: { id: number; nombre: string; apellido: string } | null;
  metodoPago?: string | null;
  cuentaId?: number | null;
  observaciones?: string | null;
  detalles?: Array<{
    itemId: number;
    cantidad: number;
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
  pedidoAEditar?: PedidoAEditar | null;
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
  const [error, setError] = useState<string | null>(null);

  // Buscador de miembros
  const [busquedaMiembro, setBusquedaMiembro] = useState('');
  const [mostrarDropdownMiembros, setMostrarDropdownMiembros] = useState(false);

  // Listas
  const [miembros, setMiembros] = useState<Array<{ id: number; nombre: string; apellido: string; dni?: string }>>([]);
  const [cuentas, setCuentas] = useState<Array<{ id: number; nombre: string }>>([]);

  const safeItems = Array.isArray(itemsEvento) ? itemsEvento : [];
  const esModoEdicion = Boolean(pedidoAEditar);

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
        if (pedidoAEditar.metodoPago === 'EFECTIVO' || pedidoAEditar.metodoPago === 'TRANSFERENCIA') {
          setMetodoPago(pedidoAEditar.metodoPago);
        } else {
          setMetodoPago('PENDIENTE');
        }
        setCuentaId(pedidoAEditar.cuentaId ? String(pedidoAEditar.cuentaId) : '');

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
      setError(null);
    }
  }, [abierto, pedidoAEditar, itemsEvento, bloquearVendedor, vendedorFijoId]);

  const cargarDatos = async () => {
    try {
      const [resMiembros, resCuentas] = await Promise.all([
        api.get('/miembros?porPagina=300').catch(() => ({ data: { items: [] } })),
        api.get('/tesoreria/cuentas').catch(() => ({ data: [] })),
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
      if (cList.length > 0 && !cuentaId) setCuentaId(String(cList[0].id));
    } catch {
      // Ignorar
    }
  };

  // Miembros filtrados por el buscador
  const miembrosFiltrados = useMemo(() => {
    const q = busquedaMiembro.trim().toLowerCase();
    if (!q) return miembros.slice(0, 15);
    return miembros
      .filter((m) => {
        const full = `${m.nombre} ${m.apellido}`.toLowerCase();
        const dni = String(m.dni || '');
        return full.includes(q) || dni.includes(q);
      })
      .slice(0, 20);
  }, [miembros, busquedaMiembro]);

  const miembroSeleccionado = useMemo(() => {
    if (!vendedorUsuarioId) return null;
    return miembros.find((m) => String(m.id) === String(vendedorUsuarioId)) || null;
  }, [miembros, vendedorUsuarioId]);

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
      setError('Indique el nombre del comprador o cliente');
      return;
    }

    if (totalUnidades <= 0) {
      setError('Debe seleccionar al menos un producto (cantidad mayor a 0)');
      return;
    }

    setGuardando(true);
    try {
      const itemsPayload = Object.entries(cantidades)
        .filter(([_, cant]) => cant > 0)
        .map(([itemIdStr, cant]) => ({
          itemId: Number(itemIdStr),
          cantidad: cant,
        }));

      const payload: any = {
        compradorNombre: compradorNombre.trim(),
        compradorContacto: compradorContacto.trim() || undefined,
        vendedorUsuarioId: vendedorUsuarioId ? Number(vendedorUsuarioId) : null,
        metodoPago: metodoPago === 'PENDIENTE' ? undefined : metodoPago,
        cuentaId: metodoPago !== 'PENDIENTE' && cuentaId ? Number(cuentaId) : undefined,
        observaciones: observaciones.trim() || undefined,
        items: itemsPayload,
      };

      if (esModoEdicion && pedidoAEditar) {
        await api.patch(`/tesoreria/eventos/pedidos/${pedidoAEditar.id}`, payload);
        if (onToast) onToast('Pedido actualizado exitosamente', 'exito');
      } else {
        payload.eventoId = eventoId;
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-lg rounded-3xl bg-surface border border-rule shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 bg-paper-2 border-b border-rule flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            {esModoEdicion ? (
              <Edit2 className="w-5 h-5 text-brand" />
            ) : (
              <ShoppingBag className="w-5 h-5 text-brand" />
            )}
            <div>
              <h3 className="text-sm font-black text-ink">
                {esModoEdicion ? `Editar Pedido #${pedidoAEditar?.id}` : 'Cargar Pedido / Venta'}
              </h3>
              <span className="text-[11px] text-ink-muted">{eventoTitulo}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            className="p-1 rounded-xl text-ink-muted hover:text-ink hover:bg-paper-3 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 flex-1">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs">
              {error}
            </div>
          )}

          {/* Datos del Comprador */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-ink mb-1 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-brand" />
                Nombre del Comprador *
              </label>
              <input
                type="text"
                value={compradorNombre}
                onChange={(e) => setCompradorNombre(e.target.value)}
                placeholder="Ej: Tía Marta / Juan Pérez"
                className="w-full py-2 px-3 rounded-xl bg-surface border border-rule text-xs text-ink focus:outline-brand"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-ink mb-1 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-brand" />
                Teléfono / WhatsApp
              </label>
              <input
                type="text"
                value={compradorContacto}
                onChange={(e) => setCompradorContacto(e.target.value)}
                placeholder="Para enviar el vale QR"
                className="w-full py-2 px-3 rounded-xl bg-surface border border-rule text-xs text-ink focus:outline-brand"
              />
            </div>
          </div>

          {/* Buscador de Scout / Familia Vendedora */}
          <div>
            <label className="block text-xs font-bold text-ink mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                Scout / Familia Vendedora (Acredita Ganancia)
              </span>
              <span className="text-[10px] text-ink-muted">
                {bloquearVendedor ? 'Asignado a tu cuenta' : 'Opcional'}
              </span>
            </label>

            {bloquearVendedor ? (
              <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Lock className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-xs font-bold text-emerald-800 dark:text-emerald-200">
                    {vendedorFijoNombre || 'Tu cuenta de beneficiario'}
                  </span>
                </div>
                <span className="text-[10px] text-emerald-600 font-semibold">Ganancia para tu saldo</span>
              </div>
            ) : (
              <div className="relative">
                {miembroSeleccionado ? (
                  <div className="p-2 px-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-emerald-600" />
                      <span className="text-xs font-bold text-ink">
                        {miembroSeleccionado.nombre} {miembroSeleccionado.apellido}
                      </span>
                      {miembroSeleccionado.dni && (
                        <span className="text-[10px] text-ink-muted">(DNI: {miembroSeleccionado.dni})</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setVendedorUsuarioId('');
                        setBusquedaMiembro('');
                      }}
                      className="p-1 rounded-lg hover:bg-paper-3 text-ink-muted hover:text-ink cursor-pointer"
                      title="Quitar asignación (Venta general)"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div>
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-ink-muted absolute left-3 top-3 pointer-events-none" />
                      <input
                        type="text"
                        value={busquedaMiembro}
                        onChange={(e) => {
                          setBusquedaMiembro(e.target.value);
                          setMostrarDropdownMiembros(true);
                        }}
                        onFocus={() => setMostrarDropdownMiembros(true)}
                        placeholder="Buscar scout por nombre, apellido o DNI..."
                        className="w-full py-2 pl-9 pr-3 rounded-xl bg-surface border border-rule text-xs text-ink focus:outline-brand"
                      />
                    </div>

                    {mostrarDropdownMiembros && (
                      <div className="absolute left-0 right-0 top-full mt-1 max-h-48 overflow-y-auto rounded-xl bg-surface border border-rule shadow-xl z-20 py-1 divide-y divide-rule/40">
                        <button
                          type="button"
                          onClick={() => {
                            setVendedorUsuarioId('');
                            setMostrarDropdownMiembros(false);
                            setBusquedaMiembro('');
                          }}
                          className="w-full px-3 py-2 text-left text-xs text-ink-muted hover:bg-paper-2 flex items-center justify-between cursor-pointer"
                        >
                          <span>(Venta general del Grupo Scout - sin vendedor)</span>
                          <span className="text-[10px] text-ink-muted">Sin ganancia individual</span>
                        </button>

                        {miembrosFiltrados.map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => {
                              setVendedorUsuarioId(String(m.id));
                              setMostrarDropdownMiembros(false);
                              setBusquedaMiembro('');
                            }}
                            className="w-full px-3 py-2 text-left text-xs text-ink hover:bg-emerald-50 dark:hover:bg-emerald-950/30 flex items-center justify-between cursor-pointer"
                          >
                            <span className="font-bold">
                              {m.nombre} {m.apellido}
                            </span>
                            {m.dni && <span className="text-[10px] text-ink-muted">DNI {m.dni}</span>}
                          </button>
                        ))}

                        {miembrosFiltrados.length === 0 && (
                          <div className="px-3 py-2 text-xs text-ink-muted text-center">
                            No se encontraron scouts con ese nombre o DNI.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
                <p className="text-[11px] text-ink-muted mt-1">
                  Al retirar el pedido, la ganancia se acreditará automáticamente en el <strong>saldo a favor</strong> de este miembro.
                </p>
              </div>
            )}
          </div>

          {/* Selección de Productos y Cantidades */}
          <div className="space-y-2 pt-2 border-t border-rule">
            <span className="text-xs font-bold text-ink block">Productos solicitados:</span>

            {safeItems.length === 0 ? (
              <div className="p-3 text-center text-xs text-ink-muted bg-paper-2 rounded-xl">
                No hay productos configurados para este evento.
              </div>
            ) : (
              <div className="space-y-2">
                {safeItems.map((it) => {
                  const cant = cantidades[it.id] || 0;
                  return (
                    <div
                      key={it.id}
                      className="p-3 rounded-2xl bg-paper-2 border border-rule flex items-center justify-between gap-3"
                    >
                      <div>
                        <h4 className="text-xs font-black text-ink">{it.nombre}</h4>
                        <span className="text-[11px] text-emerald-600 font-bold block">
                          {formatearMoneda(Number(it.precioVenta))}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleCambiarCantidad(it.id, -1)}
                          disabled={cant <= 0}
                          className="w-7 h-7 rounded-xl bg-surface border border-rule text-ink flex items-center justify-center hover:bg-paper-3 disabled:opacity-30 cursor-pointer"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="w-6 text-center text-xs font-black text-ink">{cant}</span>
                        <button
                          type="button"
                          onClick={() => handleCambiarCantidad(it.id, 1)}
                          className="w-7 h-7 rounded-xl bg-surface border border-rule text-ink flex items-center justify-center hover:bg-paper-3 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Resumen de Importes */}
          <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-emerald-800 dark:text-emerald-200 block">Total a Cobrar:</span>
              <span className="text-lg font-black text-emerald-700 dark:text-emerald-300">
                {formatearMoneda(totalCobrar)}
              </span>
            </div>

            <div className="text-right">
              <span className="text-xs font-bold text-emerald-800 dark:text-emerald-200 block">Ganancia Familiar:</span>
              <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">
                +{formatearMoneda(totalGanancia)}
              </span>
            </div>
          </div>

          {/* Observaciones */}
          <div>
            <label className="block text-xs font-bold text-ink mb-1">Observaciones / Aclaraciones</label>
            <input
              type="text"
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder="Ej: Retira el sábado al mediodía / Sin cebolla"
              className="w-full py-1.5 px-3 rounded-xl bg-surface border border-rule text-xs text-ink focus:outline-brand"
            />
          </div>

          {/* Cobro en el momento (solo si no es autogestión con vendedor bloqueado) */}
          {!bloquearVendedor && (
            <div className="space-y-2 pt-2 border-t border-rule">
              <label className="block text-xs font-bold text-ink">Estado del Cobro:</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setMetodoPago('PENDIENTE')}
                  className={`py-2 px-2.5 rounded-xl border text-xs font-bold transition cursor-pointer text-center ${
                    metodoPago === 'PENDIENTE'
                      ? 'bg-amber-100 dark:bg-amber-950 border-amber-400 text-amber-900 dark:text-amber-100'
                      : 'bg-surface border-rule text-ink-muted'
                  }`}
                >
                  Cobrar al Retirar
                </button>

                <button
                  type="button"
                  onClick={() => setMetodoPago('EFECTIVO')}
                  className={`py-2 px-2.5 rounded-xl border text-xs font-bold transition cursor-pointer text-center ${
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
                  className={`py-2 px-2.5 rounded-xl border text-xs font-bold transition cursor-pointer text-center ${
                    metodoPago === 'TRANSFERENCIA'
                      ? 'bg-blue-100 dark:bg-blue-950 border-blue-400 text-blue-900 dark:text-blue-100'
                      : 'bg-surface border-rule text-ink-muted'
                  }`}
                >
                  Transferencia
                </button>
              </div>

              {metodoPago !== 'PENDIENTE' && (
                <div className="mt-2">
                  <label className="block text-xs font-bold text-ink mb-1 flex items-center gap-1.5">
                    <Landmark className="w-3.5 h-3.5 text-brand" />
                    Ingresa en la cuenta:
                  </label>
                  <select
                    value={cuentaId}
                    onChange={(e) => setCuentaId(e.target.value)}
                    className="w-full py-1.5 px-2.5 rounded-xl bg-surface border border-rule text-xs text-ink focus:outline-brand"
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

          <div className="pt-3 flex justify-end gap-2 border-t border-rule shrink-0">
            <Button type="button" variant="secondary" onClick={onCerrar} disabled={guardando}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" disabled={guardando || totalUnidades <= 0} className="gap-1.5">
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {guardando
                  ? 'Guardando...'
                  : esModoEdicion
                  ? 'Guardar Modificaciones'
                  : 'Confirmar Pedido y Generar Vales QR'}
              </span>
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
