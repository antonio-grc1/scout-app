import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import {
  X,
  CreditCard,
  CheckCircle2,
  Sparkles,
  Wallet,
} from 'lucide-react';
import { formatearMoneda, traducirErrorAmigable } from '../lib/formatters';

interface Props {
  abierto: boolean;
  miembro: {
    id: number;
    nombre: string;
    apellido: string;
    dni: string;
    saldoAFavor?: number;
  };
  cargosPendientes: Array<{
    id: number;
    concepto?: {
      id: number;
      nombre: string;
      tipo?: string;
      cicloAnio?: number;
      mes?: number | null;
      fechaVencimiento?: string | null;
    };
    montoFinal: number;
    montoPagado: number;
    estado: string;
  }>;
  cargoInicialId?: number | null;
  onCerrar: () => void;
  onPagoExitoso: (mensaje: string) => void;
}

const NOMBRES_MESES = [
  '',
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

export const ModalCobrarDeuda: React.FC<Props> = ({
  abierto,
  miembro,
  cargosPendientes,
  cargoInicialId,
  onCerrar,
  onPagoExitoso,
}) => {
  const [imputaciones, setImputaciones] = useState<Record<number, number>>({});
  const [usarSaldoAFavor, setUsarSaldoAFavor] = useState(false);
  const [montoTotalIngresado, setMontoTotalIngresado] = useState<number | ''>('');
  const [metodoPago, setMetodoPago] = useState<'EFECTIVO' | 'TRANSFERENCIA' | 'OTRO'>('EFECTIVO');
  const [referenciaComprobante, setReferenciaComprobante] = useState('');
  const [observaciones, setObservaciones] = useState('');

  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saldoAFavorDisponible = Math.round(Number(miembro.saldoAFavor ?? 0) * 100) / 100;

  const recalcularMontoRecibidoPorDefecto = (
    mapaImputaciones: Record<number, number>,
    aplicarSaldo: boolean,
  ) => {
    const suma =
      Math.round(
        Object.values(mapaImputaciones).reduce((a, b) => a + (Number(b) || 0), 0) * 100,
      ) / 100;
    const saldoUsado = aplicarSaldo ? Math.min(saldoAFavorDisponible, suma) : 0;
    const efectivoNecesario = Math.max(0, Math.round((suma - saldoUsado) * 100) / 100);
    setMontoTotalIngresado(efectivoNecesario);
  };

  useEffect(() => {
    if (abierto) {
      setError(null);
      setMetodoPago('EFECTIVO');
      setReferenciaComprobante('');
      setObservaciones('');

      const nuevaImputacion: Record<number, number> = {};

      if (cargoInicialId) {
        const c = cargosPendientes.find((x) => x.id === cargoInicialId);
        if (c && c.estado !== 'PAGADO' && c.estado !== 'ANULADO') {
          const pendiente = Math.max(0, Number(c.montoFinal) - Number(c.montoPagado));
          if (pendiente > 0) {
            nuevaImputacion[c.id] = Math.round(pendiente * 100) / 100;
          }
        }
      } else {
        for (const c of cargosPendientes) {
          if (c.estado === 'PAGADO' || c.estado === 'ANULADO') continue;
          const pendiente = Math.max(0, Number(c.montoFinal) - Number(c.montoPagado));
          if (pendiente > 0) {
            nuevaImputacion[c.id] = Math.round(pendiente * 100) / 100;
          }
        }
      }

      const tieneSaldo = saldoAFavorDisponible > 0 && Object.keys(nuevaImputacion).length > 0;
      setUsarSaldoAFavor(tieneSaldo);
      setImputaciones(nuevaImputacion);
      recalcularMontoRecibidoPorDefecto(nuevaImputacion, tieneSaldo);
    }
  }, [abierto, cargoInicialId, cargosPendientes, saldoAFavorDisponible]);

  if (!abierto) return null;

  const cargosPendientesValidos = cargosPendientes.filter(
    (c) => c.estado !== 'PAGADO' && c.estado !== 'ANULADO',
  );

  const totalImputado =
    Math.round(
      Object.values(imputaciones).reduce((a, b) => a + (Number(b) || 0), 0) * 100,
    ) / 100;

  const saldoAFavorAUsar =
    usarSaldoAFavor && saldoAFavorDisponible > 0 && totalImputado > 0
      ? Math.round(Math.min(saldoAFavorDisponible, totalImputado) * 100) / 100
      : 0;

  const minimoEfectivoRequerido = Math.max(
    0,
    Math.round((totalImputado - saldoAFavorAUsar) * 100) / 100,
  );

  const montoEfectivoFinal =
    montoTotalIngresado === ''
      ? minimoEfectivoRequerido
      : Math.round(Number(montoTotalIngresado) * 100) / 100;

  const excedenteSaldoAFavor = Math.max(
    0,
    Math.round((montoEfectivoFinal - minimoEfectivoRequerido) * 100) / 100,
  );

  const toggleSeleccionCargo = (cargoId: number, pendienteTotal: number) => {
    setImputaciones((prev) => {
      const copy = { ...prev };
      if (copy[cargoId] !== undefined) {
        delete copy[cargoId];
      } else {
        copy[cargoId] = Math.round(pendienteTotal * 100) / 100;
      }
      recalcularMontoRecibidoPorDefecto(copy, usarSaldoAFavor);
      return copy;
    });
  };

  const handleCambioMontoImputado = (cargoId: number, valor: string, maxPendiente: number) => {
    const num = Number(valor);
    if (isNaN(num) || num < 0) return;
    const finalVal = Math.min(num, maxPendiente);

    setImputaciones((prev) => {
      const copy = { ...prev, [cargoId]: Math.round(finalVal * 100) / 100 };
      recalcularMontoRecibidoPorDefecto(copy, usarSaldoAFavor);
      return copy;
    });
  };

  const handleToggleUsarSaldo = (checked: boolean) => {
    setUsarSaldoAFavor(checked);
    recalcularMontoRecibidoPorDefecto(imputaciones, checked);
  };

  const seleccionarTodos = () => {
    const mapa: Record<number, number> = {};
    for (const c of cargosPendientesValidos) {
      const pendiente = Math.max(0, Number(c.montoFinal) - Number(c.montoPagado));
      if (pendiente > 0) {
        mapa[c.id] = Math.round(pendiente * 100) / 100;
      }
    }
    setImputaciones(mapa);
    recalcularMontoRecibidoPorDefecto(mapa, usarSaldoAFavor);
  };

  const deseleccionarTodos = () => {
    setImputaciones({});
    setUsarSaldoAFavor(false);
    setMontoTotalIngresado('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const itemsAImputar = Object.entries(imputaciones)
      .map(([cargoIdStr, monto]) => ({
        cargoId: Number(cargoIdStr),
        monto: Math.round(Number(monto) * 100) / 100,
      }))
      .filter((x) => x.monto > 0);

    if (itemsAImputar.length === 0 && montoEfectivoFinal <= 0) {
      setError('Seleccioná al menos una cuota a cancelar o ingresá un monto para acreditar a cuenta.');
      return;
    }

    if (montoEfectivoFinal + 0.001 < minimoEfectivoRequerido) {
      setError(
        `El monto recibido (${formatearMoneda(montoEfectivoFinal)}) no alcanza para cubrir el restante de las cuotas seleccionadas (${formatearMoneda(minimoEfectivoRequerido)}). Si es un pago parcial, ajustá el monto imputado en la cuota.`,
      );
      return;
    }

    setProcesando(true);
    try {
      const res = await api.post('/tesoreria/pagos', {
        usuarioId: miembro.id,
        montoTotal: montoEfectivoFinal,
        metodoPago,
        usarSaldoAFavor: saldoAFavorAUsar > 0,
        montoSaldoAFavor: saldoAFavorAUsar,
        referenciaComprobante: referenciaComprobante.trim() || undefined,
        observaciones: observaciones.trim() || undefined,
        imputaciones: itemsAImputar,
      });

      const excedente = Number(res.data?.excedenteAcreditado ?? 0);
      const saldoUsado = Number(res.data?.saldoAFavorUsado ?? 0);
      const partes: string[] = [];

      if (montoEfectivoFinal > 0) {
        partes.push(`Pago de ${formatearMoneda(montoEfectivoFinal)} registrado`);
      }
      if (saldoUsado > 0) {
        partes.push(`se aplicaron ${formatearMoneda(saldoUsado)} de saldo a favor`);
      }
      if (excedente > 0) {
        partes.push(`quedaron ${formatearMoneda(excedente)} a favor`);
      }

      onPagoExitoso(partes.length > 0 ? partes.join(' • ') + '.' : 'Operación registrada.');
      onCerrar();
    } catch (err: any) {
      setError(traducirErrorAmigable(err, 'No se pudo registrar el pago.'));
    } finally {
      setProcesando(false);
    }
  };

  const puedeConfirmar = !procesando && (totalImputado > 0 || montoEfectivoFinal > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="bg-surface rounded-3xl border border-rule shadow-md w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden motion-safe:animate-in motion-safe:fade-in motion-reduce:animate-none">
        {/* Header */}
        <div className="p-5 border-b border-rule flex items-center justify-between shrink-0 bg-paper-2">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-brand/10 text-brand">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-ink text-base">
                Registrar Pago / Cobrar Cuotas
              </h3>
              <p className="text-xs text-ink-muted">
                Miembro: <strong>{miembro.nombre} {miembro.apellido}</strong> (DNI {miembro.dni})
              </p>
            </div>
          </div>
          <button
            onClick={onCerrar}
            className="p-2 rounded-xl text-ink-muted hover:text-ink hover:bg-paper-2 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 overflow-y-auto space-y-4 flex-1">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs font-semibold">
              {error}
            </div>
          )}

          {/* Lista de deudas / cargos pendientes con checkbox */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-ink-2">
                Cuotas a cancelar (podés ajustar el monto si es un pago parcial):
              </label>
              {cargosPendientesValidos.length > 0 && (
                <div className="flex items-center gap-2 text-[11px]">
                  <button
                    type="button"
                    onClick={seleccionarTodos}
                    className="text-brand font-semibold hover:underline cursor-pointer"
                  >
                    Seleccionar todas
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    type="button"
                    onClick={deseleccionarTodos}
                    className="text-ink-muted hover:underline cursor-pointer"
                  >
                    Ninguna (Adelanto)
                  </button>
                </div>
              )}
            </div>

            {cargosPendientesValidos.length > 0 ? (
              <div className="border border-rule rounded-2xl overflow-hidden divide-y divide-rule max-h-52 overflow-y-auto">
                {cargosPendientesValidos.map((c) => {
                  const seleccionado = imputaciones[c.id] !== undefined;
                  const pendienteTotal = Math.max(0, Number(c.montoFinal) - Number(c.montoPagado));
                  const montoActual = imputaciones[c.id] ?? pendienteTotal;

                  return (
                    <div
                      key={c.id}
                      className={`p-3 flex items-center justify-between gap-3 transition text-xs ${
                        seleccionado
                          ? 'bg-brand/10'
                          : 'bg-surface hover:bg-paper-2/40'
                      }`}
                    >
                      <label className="flex items-center gap-3 cursor-pointer flex-1 min-w-0">
                        <input
                          type="checkbox"
                          checked={seleccionado}
                          onChange={() => toggleSeleccionCargo(c.id, pendienteTotal)}
                          className="w-4 h-4 rounded text-brand focus:ring-brand/20 shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-ink">
                              {c.concepto?.nombre || 'Cuota'}
                            </span>
                            {c.concepto?.mes && (
                              <span className="px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-[10px] font-bold">
                                {NOMBRES_MESES[c.concepto.mes]}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-ink-muted flex items-center gap-1.5 flex-wrap">
                            <span>Total: {formatearMoneda(c.montoFinal)}</span>
                            <span className="text-slate-300 dark:text-slate-600">/</span>
                            <span>Abonado: {formatearMoneda(c.montoPagado)}</span>
                            <span className="text-slate-300 dark:text-slate-600">/</span>
                            <strong className="text-brand">
                              Resta: {formatearMoneda(pendienteTotal)}
                            </strong>
                          </div>
                        </div>
                      </label>

                      {seleccionado && (
                        <div className="w-28 shrink-0">
                          <div className="relative">
                            <span className="absolute left-2.5 top-1.5 text-xs font-bold text-ink-muted pointer-events-none">
                              $
                            </span>
                            <input
                              type="number"
                              step="0.01"
                              min={0.01}
                              max={pendienteTotal}
                              value={montoActual}
                              onChange={(e) => handleCambioMontoImputado(c.id, e.target.value, pendienteTotal)}
                              className="w-full rounded-xl border border-brand/40 bg-surface pl-6 pr-2 py-1 text-xs font-bold text-ink focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none text-right transition-colors"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-4 text-center bg-paper-2 rounded-2xl border border-rule text-xs text-ink-muted">
                No hay cuotas pendientes. Podés registrar igualmente un <strong>pago a cuenta (adelanto)</strong> que quedará como Saldo a Favor.
              </div>
            )}
          </div>

          {/* Uso de Saldo a Favor integrado */}
          {saldoAFavorDisponible > 0 && totalImputado > 0 && (
            <label className="p-3.5 rounded-2xl bg-teal-50/80 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800/60 flex items-center justify-between gap-3 cursor-pointer">
              <div className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={usarSaldoAFavor}
                  onChange={(e) => handleToggleUsarSaldo(e.target.checked)}
                  className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500"
                />
                <div>
                  <span className="text-xs font-bold text-teal-950 dark:text-teal-100 flex items-center gap-1.5">
                    <Wallet className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                    Usar Saldo a Favor disponible ({formatearMoneda(saldoAFavorDisponible)})
                  </span>
                  <span className="text-[11px] text-teal-700 dark:text-teal-300 block">
                    {usarSaldoAFavor
                      ? `Se descuentan ${formatearMoneda(saldoAFavorAUsar)} de su saldo a favor.`
                      : 'Tildá esta opción para descontar el saldo a favor de este cobro.'}
                  </span>
                </div>
              </div>
              {usarSaldoAFavor && (
                <span className="text-sm font-black text-teal-700 dark:text-teal-300 shrink-0">
                  -{formatearMoneda(saldoAFavorAUsar)}
                </span>
              )}
            </label>
          )}

          {/* Subtotal imputado y restante */}
          <div className="p-3.5 rounded-2xl bg-paper-2 border border-rule space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-ink-muted">
                Total imputado a cuotas seleccionadas:
              </span>
              <span className="font-bold text-ink">
                {formatearMoneda(totalImputado)}
              </span>
            </div>
            {saldoAFavorAUsar > 0 && (
              <div className="flex items-center justify-between text-teal-700 dark:text-teal-300">
                <span className="font-semibold">Cubierto con Saldo a Favor:</span>
                <span className="font-bold">-{formatearMoneda(saldoAFavorAUsar)}</span>
              </div>
            )}
            <div className="flex items-center justify-between pt-1 border-t border-rule">
              <span className="font-bold text-ink">
                Restante a cobrar hoy en caja / transferencia:
              </span>
              <span className="text-sm font-black text-brand">
                {formatearMoneda(minimoEfectivoRequerido)}
              </span>
            </div>
          </div>

          {/* Monto recibido hoy y medio de pago */}
          <div className="space-y-4 pt-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-ink-2 mb-1">
                  Monto Recibido Hoy ($) *
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-2.5 text-xs font-bold text-ink-muted pointer-events-none">
                    $
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min={minimoEfectivoRequerido}
                    value={montoTotalIngresado}
                    onChange={(e) =>
                      setMontoTotalIngresado(e.target.value === '' ? '' : Number(e.target.value))
                    }
                    placeholder={minimoEfectivoRequerido.toString()}
                    className="w-full min-h-[40px] rounded-xl border border-rule bg-surface pl-8 pr-3.5 py-2 text-xs font-extrabold text-ink focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-ink-2 mb-1">
                  Método de Pago
                </label>
                <select
                  value={metodoPago}
                  onChange={(e) => setMetodoPago(e.target.value as any)}
                  disabled={montoEfectivoFinal <= 0}
                  className="w-full min-h-[40px] rounded-xl border border-rule bg-surface px-3 py-2 text-xs font-semibold text-ink focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none transition-colors disabled:opacity-50"
                >
                  <option value="EFECTIVO">Efectivo</option>
                  <option value="TRANSFERENCIA">Transferencia Bancaria</option>
                  <option value="OTRO">Otro Medio</option>
                </select>
              </div>
            </div>

            {/* Banner de Excedente o Adelanto como Saldo a Favor */}
            {excedenteSaldoAFavor > 0 && (
              <div className="p-3.5 rounded-2xl bg-brand/10 border border-brand/30 flex items-center justify-between text-xs animate-in fade-in">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-brand shrink-0" />
                  <div>
                    <span className="font-bold text-ink block">
                      {totalImputado === 0
                        ? `Adelanto a cuenta: ${formatearMoneda(excedenteSaldoAFavor)}`
                        : `Excedente a favor: ${formatearMoneda(excedenteSaldoAFavor)}`}
                    </span>
                    <span className="text-[11px] text-ink-2">
                      Se acreditará automáticamente como Saldo a Favor del miembro para futuras cuotas.
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Referencia Comprobante y Observaciones */}
            {montoEfectivoFinal > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-ink-2 mb-1">
                    N° Comprobante / Referencia (opcional)
                  </label>
                  <input
                    type="text"
                    value={referenciaComprobante}
                    onChange={(e) => setReferenciaComprobante(e.target.value)}
                    placeholder="Ej. Transf 884920..."
                    className="w-full rounded-xl border border-rule bg-surface px-3 py-2 text-xs text-ink"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink-2 mb-1">
                    Observaciones (opcional)
                  </label>
                  <input
                    type="text"
                    value={observaciones}
                    onChange={(e) => setObservaciones(e.target.value)}
                    placeholder="Notas para tesorería..."
                    className="w-full rounded-xl border border-rule bg-surface px-3 py-2 text-xs text-ink"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Footer del Formulario */}
          <div className="pt-3 border-t border-rule flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onCerrar}
              className="min-h-[42px] px-4 py-2 rounded-xl border border-rule text-ink-2 font-semibold text-xs hover:bg-paper-2 transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!puedeConfirmar}
              className="min-h-[42px] px-5 py-2 rounded-xl bg-brand hover:opacity-90 active:opacity-100 text-brand-contrast font-bold text-xs transition-colors shadow-xs cursor-pointer disabled:opacity-50 flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {procesando
                  ? 'Procesando...'
                  : montoEfectivoFinal === 0 && saldoAFavorAUsar > 0
                    ? `Cancelar con Saldo (${formatearMoneda(saldoAFavorAUsar)})`
                    : saldoAFavorAUsar > 0
                      ? `Cobrar ${formatearMoneda(montoEfectivoFinal)} (+ ${formatearMoneda(saldoAFavorAUsar)} saldo)`
                      : `Confirmar Pago (${formatearMoneda(montoEfectivoFinal)})`}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
