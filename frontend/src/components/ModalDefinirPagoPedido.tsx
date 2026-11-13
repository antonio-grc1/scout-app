import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  CreditCard,
  Banknote,
  ArrowRight,
  Landmark,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Receipt,
  User,
  ShoppingBag,
  RotateCcw,
} from 'lucide-react';
import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { formatearMoneda, traducirErrorAmigable } from '../lib/formatters';
import { Button } from './ui/Button';
import { useModalOverlay } from '../hooks/useModalOverlay';

export interface CuentaFinancieraItem {
  id: number;
  nombre: string;
  tipo: string;
  activa?: boolean;
}

export interface ModalDefinirPagoPedidoProps {
  abierto: boolean;
  onCerrar: () => void;
  pedidoId: number;
  monto: number;
  comprador: string;
  producto?: string;
  cantidad?: number;
  evento?: string;
  vendedor?: string | null;
  onPagoConfirmado: (nuevoMetodoPago: string, nuevoEstado: 'PAGADO' | 'PENDIENTE') => void;
}

export const ModalDefinirPagoPedido: React.FC<ModalDefinirPagoPedidoProps> = ({
  abierto,
  onCerrar,
  pedidoId,
  monto,
  comprador,
  producto,
  cantidad,
  evento,
  vendedor,
  onPagoConfirmado,
}) => {
  const [estaAbonado, setEstaAbonado] = useState<boolean>(true);
  const [metodoPago, setMetodoPago] = useState<'EFECTIVO' | 'TRANSFERENCIA' | 'OTRO'>('EFECTIVO');
  const [cuentaId, setCuentaId] = useState<string>('');
  const [observaciones, setObservaciones] = useState<string>('');
  const [cuentas, setCuentas] = useState<CuentaFinancieraItem[]>([]);
  const [cargandoCuentas, setCargandoCuentas] = useState<boolean>(false);
  const [errorCuentas, setErrorCuentas] = useState<string | null>(null);
  const [guardando, setGuardando] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const enviandoRef = useRef<boolean>(false);
  const esGlobal = useAuthStore((s) => s.tieneGlobal());

  const { backdropProps, contentProps } = useModalOverlay({
    abierto,
    onCerrar,
    bloqueado: guardando,
  });

  const seleccionarCuentaPorMetodo = (
    listaCuentas: CuentaFinancieraItem[],
    metodo: 'EFECTIVO' | 'TRANSFERENCIA' | 'OTRO',
  ) => {
    if (listaCuentas.length === 0) return;

    if (metodo === 'EFECTIVO') {
      const caja = listaCuentas.find((c) => c.tipo === 'CAJA_EFECTIVO');
      if (caja) {
        setCuentaId(String(caja.id));
        return;
      }
    } else if (metodo === 'TRANSFERENCIA') {
      const banco = listaCuentas.find(
        (c) => c.tipo === 'BANCO' || c.tipo === 'MERCADOPAGO',
      );
      if (banco) {
        setCuentaId(String(banco.id));
        return;
      }
    }

    // Default a la primera cuenta
    setCuentaId(String(listaCuentas[0].id));
  };

  const cargarCuentas = async () => {
    setCargandoCuentas(true);
    setErrorCuentas(null);
    try {
      const res = await api.get('/tesoreria/cuentas');
      const data = Array.isArray(res.data) ? res.data : [];
      setCuentas(data);

      if (data.length > 0) {
        seleccionarCuentaPorMetodo(data, 'EFECTIVO');
      } else {
        setCuentaId('');
      }
    } catch (err) {
      setCuentas([]);
      setCuentaId('');
      setErrorCuentas(traducirErrorAmigable(err, 'No se pudieron cargar las cuentas financieras.'));
    } finally {
      setCargandoCuentas(false);
    }
  };

  useEffect(() => {
    if (!abierto) return;

    setEstaAbonado(true);
    setMetodoPago('EFECTIVO');
    setCuentaId('');
    setObservaciones('');
    setError(null);
    setErrorCuentas(null);
    if (esGlobal) {
      void cargarCuentas();
    } else {
      setCuentas([]);
    }
  }, [abierto, pedidoId, esGlobal]);

  const handleChangeMetodo = (nuevoMetodo: 'EFECTIVO' | 'TRANSFERENCIA' | 'OTRO') => {
    setMetodoPago(nuevoMetodo);
    seleccionarCuentaPorMetodo(cuentas, nuevoMetodo);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (enviandoRef.current || guardando) return;
    setError(null);

    if (!estaAbonado) {
      // El usuario decidió mantenerlo como no abonado (pendiente)
      onPagoConfirmado('PENDIENTE', 'PENDIENTE');
      onCerrar();
      return;
    }

    if (esGlobal && errorCuentas) {
      setError(errorCuentas);
      return;
    }

    if (esGlobal && !cuentaId && cuentas.length > 0) {
      setError('Por favor seleccione la cuenta financiera donde ingresa el dinero.');
      return;
    }

    enviandoRef.current = true;
    setGuardando(true);
    try {
      const payload: Record<string, unknown> = {
        metodoPago,
        cuentaId: esGlobal && cuentaId ? Number(cuentaId) : undefined,
      };

      if (observaciones.trim()) {
        payload.observaciones = observaciones.trim();
      }

      await api.patch(`/tesoreria/eventos/pedidos/${pedidoId}`, payload);
      onPagoConfirmado(metodoPago, 'PAGADO');
      onCerrar();
    } catch (err) {
      const msg = traducirErrorAmigable(err, 'No se pudo registrar el cobro del pedido.');
      setError(msg);
    } finally {
      enviandoRef.current = false;
      setGuardando(false);
    }
  };

  if (!abierto) return null;

  return (
    <div
      className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150"
      {...backdropProps}
    >
      <div
        className="relative w-full max-w-lg rounded-3xl bg-surface border border-rule shadow-2xl overflow-hidden flex flex-col max-h-[92dvh] animate-in zoom-in-95 duration-150"
        {...contentProps}
      >
        {/* Encabezado */}
        <div className="p-4 bg-paper-2 border-b border-rule flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-ink">Estado de Pago del Pedido</h3>
              <span className="text-[11px] text-ink-muted">
                Vale escaneado • Definir cobro en puerta
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            disabled={guardando}
            className="p-1 rounded-xl text-ink-muted hover:text-ink hover:bg-paper-3 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Resumen del Vale y Pedido */}
        <div className="p-4 overflow-y-auto space-y-4 flex-1">
          <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <span className="text-[11px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-400">
                  Total Pendiente de Cobro
                </span>
                <div className="text-2xl font-black text-amber-900 dark:text-amber-100">
                  {formatearMoneda(monto)}
                </div>
              </div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-300 text-[11px] font-bold">
                <Clock className="w-3.5 h-3.5" />
                <span>Pendiente</span>
              </div>
            </div>

            <div className="pt-2.5 mt-2.5 border-t border-amber-200/60 dark:border-amber-800/60 space-y-1 text-xs text-amber-950 dark:text-amber-200">
              <div className="flex items-center gap-1.5 font-bold">
                <User className="w-3.5 h-3.5 shrink-0 opacity-70" />
                <span>Comprador: <strong className="text-ink">{comprador}</strong></span>
              </div>
              {producto && (
                <div className="flex items-center gap-1.5 font-medium">
                  <ShoppingBag className="w-3.5 h-3.5 shrink-0 opacity-70" />
                  <span>
                    Entrega: <strong>{cantidad ? `${cantidad}x ` : ''}{producto}</strong>
                  </span>
                </div>
              )}
              {evento && (
                <div className="text-[11px] opacity-80 pt-0.5">
                  Evento: <em>{evento}</em>
                  {vendedor ? ` • Vendido por: ${vendedor}` : ''}
                </div>
              )}
            </div>
          </div>

          <form onSubmit={handleSubmit} id="form-definir-pago" className="space-y-4">
            {/* Pregunta: ¿Está abonado? */}
            <div>
              <label className="block text-xs font-black text-ink mb-2">
                ¿El comprador abona el pedido en este momento?
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setEstaAbonado(true)}
                  className={`p-3 rounded-2xl border text-left flex flex-col justify-between gap-1.5 transition cursor-pointer ${
                    estaAbonado
                      ? 'bg-emerald-500/10 border-emerald-500/60 text-emerald-950 dark:text-emerald-100 ring-2 ring-emerald-500/30'
                      : 'bg-paper-2 border-rule text-ink-muted hover:border-rule/80'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black">Sí, está abonado</span>
                    <CheckCircle2
                      className={`w-4 h-4 ${
                        estaAbonado ? 'text-emerald-600 dark:text-emerald-400' : 'opacity-30'
                      }`}
                    />
                  </div>
                  <span className="text-[10px] text-ink-muted leading-tight">
                    Registrar el ingreso y marcar como pagado
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setEstaAbonado(false)}
                  className={`p-3 rounded-2xl border text-left flex flex-col justify-between gap-1.5 transition cursor-pointer ${
                    !estaAbonado
                      ? 'bg-amber-500/10 border-amber-500/60 text-amber-950 dark:text-amber-100 ring-2 ring-amber-500/30'
                      : 'bg-paper-2 border-rule text-ink-muted hover:border-rule/80'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black">No abonado</span>
                    <Clock
                      className={`w-4 h-4 ${
                        !estaAbonado ? 'text-amber-600 dark:text-amber-400' : 'opacity-30'
                      }`}
                    />
                  </div>
                  <span className="text-[10px] text-ink-muted leading-tight">
                    Mantener pendiente para cobrar más tarde
                  </span>
                </button>
              </div>
            </div>

            {/* Opciones de Cobro si está abonado */}
            {estaAbonado ? (
              <div className="space-y-3.5 p-3.5 rounded-2xl bg-paper-2 border border-rule animate-in fade-in duration-150">
                {/* Método de Pago */}
                <div>
                  <label className="block text-xs font-bold text-ink mb-1.5 flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5 text-brand" />
                    ¿Cómo abonó? (Método de Pago)
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleChangeMetodo('EFECTIVO')}
                      className={`py-2 px-2 rounded-xl border text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 ${
                        metodoPago === 'EFECTIVO'
                          ? 'bg-emerald-100 dark:bg-emerald-950 border-emerald-400 text-emerald-900 dark:text-emerald-100 shadow-xs'
                          : 'bg-surface border-rule text-ink-muted hover:text-ink'
                      }`}
                    >
                      <Banknote className="w-3.5 h-3.5" />
                      <span>Efectivo</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleChangeMetodo('TRANSFERENCIA')}
                      className={`py-2 px-2 rounded-xl border text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 ${
                        metodoPago === 'TRANSFERENCIA'
                          ? 'bg-blue-100 dark:bg-blue-950 border-blue-400 text-blue-900 dark:text-blue-100 shadow-xs'
                          : 'bg-surface border-rule text-ink-muted hover:text-ink'
                      }`}
                    >
                      <Landmark className="w-3.5 h-3.5" />
                      <span>Transferencia</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleChangeMetodo('OTRO')}
                      className={`py-2 px-2 rounded-xl border text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 ${
                        metodoPago === 'OTRO'
                          ? 'bg-purple-100 dark:bg-purple-950 border-purple-400 text-purple-900 dark:text-purple-100 shadow-xs'
                          : 'bg-surface border-rule text-ink-muted hover:text-ink'
                      }`}
                    >
                      <CreditCard className="w-3.5 h-3.5" />
                      <span>Otro</span>
                    </button>
                  </div>
                </div>

                {/* Cuenta de Destino (solo alcance GLOBAL) */}
                {esGlobal && (
                  <div>
                    <label className="block text-xs font-bold text-ink mb-1 flex items-center gap-1.5">
                      <Landmark className="w-3.5 h-3.5 text-brand" />
                      Cuenta donde ingresa el dinero:
                    </label>
                    {cargandoCuentas ? (
                      <div className="py-2 text-xs text-ink-muted flex items-center gap-2">
                        <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                        <span>Cargando cuentas de tesorería...</span>
                      </div>
                    ) : cuentas.length > 0 ? (
                      <select
                        value={cuentaId}
                        onChange={(e) => setCuentaId(e.target.value)}
                        className="w-full py-2 px-3 rounded-xl bg-surface border border-rule text-xs text-ink focus:outline-brand"
                        required
                      >
                        {cuentas.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nombre} {c.tipo ? `(${c.tipo.replace('_', ' ')})` : ''}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-200 text-xs">
                        No se encontraron cuentas financieras activas registradas. El cobro se asentará sin cuenta asociada.
                      </div>
                    )}
                  </div>
                )}

                {/* Observaciones opcionales */}
                <div>
                  <label className="block text-xs font-bold text-ink mb-1">
                    Nota o comprobante (opcional):
                  </label>
                  <input
                    type="text"
                    value={observaciones}
                    onChange={(e) => setObservaciones(e.target.value)}
                    placeholder="Ej: Cobrado en mesa de entrada, nro de recibo, etc."
                    className="w-full py-2 px-3 rounded-xl bg-surface border border-rule text-xs text-ink focus:outline-brand"
                    maxLength={200}
                  />
                </div>
              </div>
            ) : (
              <div className="p-3.5 rounded-2xl bg-paper-2 border border-rule space-y-2 text-xs animate-in fade-in duration-150">
                <div className="flex items-center gap-2 font-bold text-ink">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                  <span>El pedido permanecerá PENDIENTE</span>
                </div>
                <p className="text-ink-muted leading-relaxed text-[11px]">
                  El vale QR ya fue marcado como retirado en el sistema, pero el cobro de{' '}
                  <strong className="text-ink">{formatearMoneda(monto)}</strong> quedará registrado como adeudado para cobrarse y regularizarse en otra ocasión.
                </p>
              </div>
            )}

            {error && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-200 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </form>
        </div>

        {/* Acciones */}
        <div className="p-3 bg-paper-2 border-t border-rule flex items-center justify-between gap-2 shrink-0">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onCerrar}
            disabled={guardando}
          >
            Cancelar
          </Button>

          <Button
            type="submit"
            form="form-definir-pago"
            variant={estaAbonado ? 'primary' : 'secondary'}
            size="sm"
            disabled={guardando}
            className="flex items-center gap-1.5"
          >
            {guardando ? (
              <span>Guardando...</span>
            ) : estaAbonado ? (
              <>
                <span>Confirmar Cobro ({formatearMoneda(monto)})</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            ) : (
              <>
                <Clock className="w-3.5 h-3.5 text-amber-500" />
                <span>Mantener como Pendiente</span>
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};
