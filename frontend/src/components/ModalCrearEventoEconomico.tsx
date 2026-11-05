import React, { useState, useEffect } from 'react';
import {
  X,
  PlusCircle,
  Trash2,
  Calendar,
  MapPin,
  Tag,
  DollarSign,
  Landmark,
  Sparkles,
  Edit2,
  Clock,
} from 'lucide-react';
import { api } from '../api/client';
import { useToastStore, mostrarToastConDeshacer } from '../store/toastStore';
import { formatearMoneda, traducirErrorAmigable } from '../lib/formatters';
import { Button } from './ui/Button';
import { ModalConfirmacion } from './ModalConfirmacion';
import { useModalOverlay } from '../hooks/useModalOverlay';

export interface EventoAEditar {
  id: number;
  titulo: string;
  descripcion?: string | null;
  tipo: 'RECAUDACION_PEDIDOS' | 'FESTIVAL_ENTRADAS';
  estado: 'BORRADOR' | 'PUBLICADO' | 'FINALIZADO' | 'CANCELADO';
  fechaEvento: string;
  fechaFin?: string | null;
  lugarEntrega?: string | null;
  rubroId?: number | null;
  cuentaId?: number | null;
  rubro?: { id: number; nombre: string } | null;
  cuenta?: { id: number; nombre: string } | null;
  items?: Array<{
    id?: number;
    nombre: string;
    descripcion?: string | null;
    precioVenta: string | number;
    costoUnitario?: string | number;
    gananciaUnitaria?: string | number;
    stockTotal?: number | null;
  }>;
}

export interface ModalCrearEventoEconomicoProps {
  abierto: boolean;
  onCerrar: () => void;
  onGuardado: () => void;
  eventoAEditar?: EventoAEditar | null;
  onToast?: (texto: string, tipo?: 'exito' | 'error') => void;
}

interface ItemForm {
  nombre: string;
  descripcion: string;
  precioVenta: string;
  costoUnitario: string;
  gananciaUnitaria?: string;
  stockTotal: string;
}

export const ModalCrearEventoEconomico: React.FC<ModalCrearEventoEconomicoProps> = ({
  abierto,
  onCerrar,
  onGuardado,
  eventoAEditar = null,
  onToast,
}) => {
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [tipo, setTipo] = useState<'RECAUDACION_PEDIDOS' | 'FESTIVAL_ENTRADAS'>('RECAUDACION_PEDIDOS');
  const [estado, setEstado] = useState<'BORRADOR' | 'PUBLICADO' | 'FINALIZADO' | 'CANCELADO'>('PUBLICADO');
  const [fechaEvento, setFechaEvento] = useState('');
  const [lugarEntrega, setLugarEntrega] = useState('');
  const [rubroId, setRubroId] = useState<string>('');
  const [cuentaId, setCuentaId] = useState<string>('');
  const [guardando, setGuardando] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [modalConfirmarEliminar, setModalConfirmarEliminar] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { backdropProps, contentProps } = useModalOverlay({
    abierto,
    onCerrar,
    bloqueado: guardando || eliminando,
  });

  // Listas
  const [rubros, setRubros] = useState<Array<{ id: number; nombre: string }>>([]);
  const [cuentas, setCuentas] = useState<Array<{ id: number; nombre: string }>>([]);

  // Items del evento
  const [items, setItems] = useState<ItemForm[]>([
    {
      nombre: '',
      descripcion: '',
      precioVenta: '',
      costoUnitario: '',
      gananciaUnitaria: '',
      stockTotal: '',
    },
  ]);

  const esModoEdicion = Boolean(eventoAEditar);

  useEffect(() => {
    if (abierto) {
      cargarSelectores();

      if (eventoAEditar) {
        setTitulo(eventoAEditar.titulo || '');
        setDescripcion(eventoAEditar.descripcion || '');
        setTipo(eventoAEditar.tipo || 'RECAUDACION_PEDIDOS');
        setEstado(eventoAEditar.estado || 'PUBLICADO');
        setFechaEvento(
          eventoAEditar.fechaEvento
            ? new Date(eventoAEditar.fechaEvento).toISOString().slice(0, 10)
            : new Date().toISOString().slice(0, 10),
        );
        setLugarEntrega(eventoAEditar.lugarEntrega || '');
        const rId = eventoAEditar.rubroId ?? eventoAEditar.rubro?.id;
        const cId = eventoAEditar.cuentaId ?? eventoAEditar.cuenta?.id;
        setRubroId(rId ? String(rId) : '');
        setCuentaId(cId ? String(cId) : '');

        if (Array.isArray(eventoAEditar.items) && eventoAEditar.items.length > 0) {
          setItems(
            eventoAEditar.items.map((it) => ({
              nombre: it.nombre || '',
              descripcion: it.descripcion || '',
              precioVenta: String(it.precioVenta ?? ''),
              costoUnitario: String(it.costoUnitario ?? ''),
              gananciaUnitaria:
                it.gananciaUnitaria !== undefined && it.gananciaUnitaria !== null
                  ? String(it.gananciaUnitaria)
                  : '',
              stockTotal: it.stockTotal ? String(it.stockTotal) : '',
            })),
          );
        }
      } else {
        const d = new Date();
        d.setDate(d.getDate() + 14);
        setTitulo('');
        setDescripcion('');
        setTipo('RECAUDACION_PEDIDOS');
        setEstado('PUBLICADO');
        setFechaEvento(d.toISOString().slice(0, 10));
        setLugarEntrega('');
        setItems([
          {
            nombre: '',
            descripcion: '',
            precioVenta: '',
            costoUnitario: '',
            gananciaUnitaria: '',
            stockTotal: '',
          },
        ]);
      }
      setError(null);
    }
  }, [abierto, eventoAEditar]);

  const cargarSelectores = async () => {
    try {
      const [resRubros, resCuentas] = await Promise.all([
        api.get('/tesoreria/rubros?tipo=INGRESO'),
        api.get('/tesoreria/cuentas'),
      ]);
      const rubrosList = resRubros.data || [];
      setRubros(rubrosList);
      if (!rubroId) {
        const rubroEv = rubrosList.find((r: any) =>
          r.nombre.toLowerCase().includes('evento') || r.nombre.toLowerCase().includes('campa'),
        );
        if (rubroEv) setRubroId(String(rubroEv.id));
      }

      const cuentasList = resCuentas.data || [];
      setCuentas(cuentasList);
      if (cuentasList.length > 0 && !cuentaId) setCuentaId(String(cuentasList[0].id));
    } catch {
      // Ignorar
    }
  };

  if (!abierto) return null;

  const agregarItem = () => {
    setItems([
      ...items,
      {
        nombre: '',
        descripcion: '',
        precioVenta: '',
        costoUnitario: '',
        gananciaUnitaria: '',
        stockTotal: '',
      },
    ]);
  };

  const actualizarItem = (index: number, campo: keyof ItemForm, valor: string) => {
    setItems(items.map((it, i) => (i === index ? { ...it, [campo]: valor } : it)));
  };

  const eliminarItem = (index: number) => {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!titulo.trim()) {
      setError('El título del evento es obligatorio');
      return;
    }

    if (items.some((it) => !it.nombre.trim() || Number(it.precioVenta) <= 0)) {
      setError('Todos los productos deben tener un nombre y un precio de venta mayor a $0');
      return;
    }

    setGuardando(true);
    try {
      const itemsPayload = items.map((it) => {
        const pVenta = Number(it.precioVenta);
        const pCosto = Number(it.costoUnitario) || 0;
        const gManual =
          it.gananciaUnitaria !== undefined && it.gananciaUnitaria !== ''
            ? Number(it.gananciaUnitaria)
            : pVenta - pCosto;
        const gananciaFinal = Math.max(0, isNaN(gManual) ? 0 : gManual);
        return {
          nombre: it.nombre.trim(),
          descripcion: it.descripcion.trim() || undefined,
          precioVenta: pVenta,
          costoUnitario: pCosto,
          gananciaUnitaria: gananciaFinal,
          stockTotal: it.stockTotal ? Number(it.stockTotal) : undefined,
        };
      });

      const payload = {
        titulo: titulo.trim(),
        descripcion: descripcion.trim() || undefined,
        tipo,
        estado,
        fechaEvento,
        lugarEntrega: lugarEntrega.trim() || undefined,
        rubroId: rubroId ? Number(rubroId) : undefined,
        cuentaId: cuentaId ? Number(cuentaId) : undefined,
        items: itemsPayload,
      };

      if (esModoEdicion && eventoAEditar) {
        await api.patch(`/tesoreria/eventos/${eventoAEditar.id}`, payload);
        if (onToast) onToast('Evento actualizado exitosamente', 'exito');
      } else {
        await api.post('/tesoreria/eventos', payload);
        if (onToast) onToast('Evento creado exitosamente con sus productos y vales QR', 'exito');
      }

      onGuardado();
      onCerrar();
    } catch (err) {
      const msg = traducirErrorAmigable(
        err,
        esModoEdicion ? 'No se pudo actualizar el evento.' : 'No se pudo crear el evento.',
      );
      setError(msg);
      if (onToast) onToast(msg, 'error');
    } finally {
      setGuardando(false);
    }
  };

  const handleEliminarEvento = async () => {
    if (!eventoAEditar) return;
    const eventoAEliminar = { ...eventoAEditar };
    setEliminando(true);
    try {
      await api.delete(`/tesoreria/eventos/${eventoAEliminar.id}`);
      setModalConfirmarEliminar(false);
      onCerrar();
      onGuardado();

      mostrarToastConDeshacer(
        `Evento "${eventoAEliminar.titulo}" eliminado.`,
        async () => {
          try {
            await api.post('/tesoreria/eventos', {
              titulo: eventoAEliminar.titulo,
              descripcion: eventoAEliminar.descripcion || undefined,
              tipo: eventoAEliminar.tipo,
              fechaEvento: eventoAEliminar.fechaEvento,
              fechaFin: eventoAEliminar.fechaFin || undefined,
              lugarEntrega: eventoAEliminar.lugarEntrega || undefined,
              rubroId: eventoAEliminar.rubroId || undefined,
              cuentaId: eventoAEliminar.cuentaId || undefined,
              items: (eventoAEliminar.items || []).map((it: any) => ({
                nombre: it.nombre,
                descripcion: it.descripcion || undefined,
                precioVenta: Number(it.precioVenta),
                costoUnitario: Number(it.costoUnitario || 0),
                gananciaUnitaria: Number(it.gananciaUnitaria || 0),
                stockTotal: it.stockTotal ? Number(it.stockTotal) : null,
              })),
            });
            onGuardado();
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
      setEliminando(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      {...backdropProps}
    >
      <div
        className="relative w-full max-w-2xl rounded-3xl bg-surface border border-rule shadow-2xl overflow-hidden flex flex-col max-h-[92dvh]"
        {...contentProps}
      >
        {/* Header */}
        <div className="p-4 bg-paper-2 border-b border-rule flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            {esModoEdicion ? (
              <Edit2 className="w-5 h-5 text-brand" />
            ) : (
              <Sparkles className="w-5 h-5 text-brand" />
            )}
            <div>
              <h3 className="text-sm font-black text-ink">
                {esModoEdicion ? `Editar Evento: ${eventoAEditar?.titulo}` : 'Crear Evento Económico / Entradas QR'}
              </h3>
              <span className="text-[11px] text-ink-muted">Gestión de recaudación y vales digitales</span>
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

          {/* Tipo y Estado de Evento */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-ink mb-1">Tipo de Evento:</label>
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value as any)}
                className="w-full py-2 px-3 rounded-xl bg-surface border border-rule text-xs text-ink focus:outline-brand"
              >
                <option value="RECAUDACION_PEDIDOS">Venta / Pedidos (Pizzas, Empanadas, Rosas, etc.)</option>
                <option value="FESTIVAL_ENTRADAS">Festival / Cumpleaños / Entradas para evento</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-ink mb-1">Estado de Publicación:</label>
              <select
                value={estado}
                onChange={(e) => setEstado(e.target.value as any)}
                className="w-full py-2 px-3 rounded-xl bg-surface border border-rule text-xs text-ink focus:outline-brand"
              >
                <option value="PUBLICADO">Publicado (Habilitado para vender)</option>
                <option value="BORRADOR">Borrador (Oculto para familias)</option>
                <option value="FINALIZADO">Finalizado (Cerrado)</option>
                <option value="CANCELADO">Cancelado</option>
              </select>
            </div>
          </div>

          {/* Título y Descripción */}
          <div>
            <label className="block text-xs font-bold text-ink mb-1">Título del Evento *</label>
            <input
              type="text"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ej: Venta de pizzas"
              className="w-full py-2 px-3 rounded-xl bg-surface border border-rule text-xs text-ink focus:outline-brand"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-ink mb-1">Descripción / Instrucciones</label>
            <textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Detalles o instrucciones de retiro"
              rows={2}
              className="w-full py-2 px-3 rounded-xl bg-surface border border-rule text-xs text-ink focus:outline-brand resize-none"
            />
          </div>

          {/* Fecha y Lugar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-ink mb-1 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-brand" />
                Fecha del Evento o Retiro *
              </label>
              <input
                type="date"
                value={fechaEvento}
                onChange={(e) => setFechaEvento(e.target.value)}
                className="w-full py-2 px-3 rounded-xl bg-surface border border-rule text-xs text-ink focus:outline-brand"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-ink mb-1 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-brand" />
                Lugar de Entrega / Retiro
              </label>
              <input
                type="text"
                value={lugarEntrega}
                onChange={(e) => setLugarEntrega(e.target.value)}
                placeholder="Ej: Sede del grupo"
                className="w-full py-2 px-3 rounded-xl bg-surface border border-rule text-xs text-ink focus:outline-brand"
              />
            </div>
          </div>

          {/* Imputación Contable */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-rule">
            <div>
              <label className="block text-xs font-bold text-ink mb-1 flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-brand" />
                Rubro Contable Asociado
              </label>
              <select
                value={rubroId}
                onChange={(e) => setRubroId(e.target.value)}
                className="w-full py-2 px-3 rounded-xl bg-surface border border-rule text-xs text-ink focus:outline-brand"
              >
                <option value="">(Sin rubro asignado)</option>
                {rubros.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-ink mb-1 flex items-center gap-1.5">
                <Landmark className="w-3.5 h-3.5 text-brand" />
                Cuenta de Cobro por Defecto
              </label>
              <select
                value={cuentaId}
                onChange={(e) => setCuentaId(e.target.value)}
                className="w-full py-2 px-3 rounded-xl bg-surface border border-rule text-xs text-ink focus:outline-brand"
              >
                <option value="">(Sin cuenta asignada)</option>
                {cuentas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* LISTA DE PRODUCTOS O TIPOS DE ENTRADAS */}
          <div className="pt-2 border-t border-rule space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-black text-ink">Productos o Entradas a la Venta</h4>
                <span className="text-[11px] text-ink-muted">
                  Por cada unidad vendida se calcula la ganancia automática para el scout
                </span>
              </div>
              <Button type="button" variant="secondary" size="sm" onClick={agregarItem} className="gap-1 text-xs">
                <PlusCircle className="w-3.5 h-3.5" />
                <span>Agregar Producto</span>
              </Button>
            </div>

            <div className="space-y-3">
              {items.map((it, idx) => {
                const pVenta = Number(it.precioVenta) || 0;
                const pCosto = Number(it.costoUnitario) || 0;
                const gananciaCalc = Math.max(0, pVenta - pCosto);
                const gananciaVal =
                  it.gananciaUnitaria !== undefined && it.gananciaUnitaria !== ''
                    ? it.gananciaUnitaria
                    : pVenta > 0
                    ? String(gananciaCalc)
                    : '';

                return (
                  <div
                    key={idx}
                    className="p-3.5 rounded-2xl bg-paper-2 border border-rule space-y-2 relative"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <input
                        type="text"
                        value={it.nombre}
                        onChange={(e) => actualizarItem(idx, 'nombre', e.target.value)}
                        placeholder="Ej: Pizza especial"
                        className="flex-1 py-1 px-2.5 rounded-xl bg-surface border border-rule text-xs font-bold text-ink focus:outline-brand"
                        required
                      />

                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => eliminarItem(idx)}
                          className="p-1 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition cursor-pointer"
                          title="Eliminar este producto"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[10px] font-bold text-ink-muted mb-0.5">
                          Precio Venta ($) *
                        </label>
                        <input
                          type="number"
                          step="1"
                          min="0"
                          value={it.precioVenta}
                          onChange={(e) => actualizarItem(idx, 'precioVenta', e.target.value)}
                          placeholder="0"
                          className="w-full py-1 px-2 rounded-xl bg-surface border border-rule text-xs font-black text-ink"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-ink-muted mb-0.5">
                          Costo Unitario ($)
                        </label>
                        <input
                          type="number"
                          step="1"
                          min="0"
                          value={it.costoUnitario}
                          onChange={(e) => actualizarItem(idx, 'costoUnitario', e.target.value)}
                          placeholder="0"
                          className="w-full py-1 px-2 rounded-xl bg-surface border border-rule text-xs text-ink"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-ink-muted mb-0.5">
                          Ganancia Scout ($)
                        </label>
                        <input
                          type="number"
                          step="1"
                          min="0"
                          value={gananciaVal}
                          onChange={(e) => actualizarItem(idx, 'gananciaUnitaria', e.target.value)}
                          placeholder="0"
                          className="w-full py-1 px-2 rounded-xl bg-surface border border-rule text-xs font-black text-emerald-600 dark:text-emerald-400"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="pt-3 flex items-center justify-between gap-2 border-t border-rule shrink-0">
            {esModoEdicion ? (
              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={() => setModalConfirmarEliminar(true)}
                disabled={guardando || eliminando}
                className="gap-1.5 text-xs"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Eliminar Evento</span>
              </Button>
            ) : <div />}

            <div className="flex items-center gap-2">
              <Button type="button" variant="secondary" onClick={onCerrar} disabled={guardando || eliminando}>
                Cancelar
              </Button>
              <Button type="submit" variant="primary" disabled={guardando || eliminando} className="gap-1.5">
                <span>
                  {guardando
                    ? 'Guardando...'
                    : esModoEdicion
                    ? 'Guardar Modificaciones'
                    : 'Crear Evento y Habilitar Ventas'}
                </span>
              </Button>
            </div>
          </div>
        </form>
      </div>

      {modalConfirmarEliminar && eventoAEditar && (
        <ModalConfirmacion
          abierto={modalConfirmarEliminar}
          onCerrar={() => !eliminando && setModalConfirmarEliminar(false)}
          onConfirmar={handleEliminarEvento}
          titulo="Eliminar Evento Económico"
          tipo="peligro"
          textoConfirmar={eliminando ? 'Eliminando...' : 'Sí, Eliminar Evento'}
          textoCancelar="Cancelar"
          cargando={eliminando}
          mensaje={
            <div className="space-y-3">
              <p className="text-sm text-ink leading-relaxed">
                ¿Estás seguro de que deseas eliminar permanentemente el evento{' '}
                <strong className="text-ink font-bold">"{eventoAEditar.titulo}"</strong>?
              </p>
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
