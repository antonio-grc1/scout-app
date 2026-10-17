import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import {
  X,
  CreditCard,
  DollarSign,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  Receipt,
  Wallet,
} from 'lucide-react';

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
  modoSaldoAFavor?: boolean;
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
  modoSaldoAFavor = false,
  onCerrar,
  onPagoExitoso,
}) => {
  // Lista de cargos seleccionados con el monto a imputar a cada uno
  const [imputaciones, setImputaciones] = useState<Record<number, number>>({});
  const [montoTotalIngresado, setMontoTotalIngresado] = useState<number | ''>('');
  const [metodoPago, setMetodoPago] = useState<'EFECTIVO' | 'TRANSFERENCIA' | 'OTRO'>('EFECTIVO');
  const [referenciaComprobante, setReferenciaComprobante] = useState('');
  const [observaciones, setObservaciones] = useState('');

  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saldoAFavorDisponible = Number(miembro.saldoAFavor ?? 0);

  // Inicializar selección cuando se abre el modal
  useEffect(() => {
    if (abierto) {
      setError(null);
      setMetodoPago('EFECTIVO');
      setReferenciaComprobante('');
      setObservaciones('');

      const nuevaImputacion: Record<number, number> = {};

      if (cargoInicialId) {
        const c = cargosPendientes.find((x) => x.id === cargoInicialId);
        if (c) {
          const pendiente = Math.max(0, Number(c.montoFinal) - Number(c.montoPagado));
          nuevaImputacion[c.id] = Math.round(pendiente * 100) / 100;
        }
      } else {
        // Por defecto seleccionar todos los cargos pendientes
        for (const c of cargosPendientes) {
          const pendiente = Math.max(0, Number(c.montoFinal) - Number(c.montoPagado));
          if (pendiente > 0) {
            nuevaImputacion[c.id] = Math.round(pendiente * 100) / 100;
          }
        }
      }

      setImputaciones(nuevaImputacion);

      const suma = Object.values(nuevaImputacion).reduce((a, b) => a + b, 0);
      setMontoTotalIngresado(Math.round(suma * 100) / 100);
    }
  }, [abierto, cargoInicialId, cargosPendientes]);

  if (!abierto) return null;

  const cargosPendientesValidos = cargosPendientes.filter(
    (c) => c.estado !== 'PAGADO' && c.estado !== 'ANULADO',
  );

  const totalImputado = Math.round(
    Object.values(imputaciones).reduce((a, b) => a + (Number(b) || 0), 0) * 100,
  ) / 100;

  const montoTotalFinal =
    montoTotalIngresado === '' ? totalImputado : Math.round(Number(montoTotalIngresado) * 100) / 100;

  const excedenteSaldoAFavor = Math.max(0, Math.round((montoTotalFinal - totalImputado) * 100) / 100);

  const toggleSeleccionCargo = (cargoId: number, pendienteTotal: number) => {
    setImputaciones((prev) => {
      const copy = { ...prev };
      if (copy[cargoId] !== undefined) {
        delete copy[cargoId];
      } else {
        copy[cargoId] = Math.round(pendienteTotal * 100) / 100;
      }
      const nuevaSuma = Object.values(copy).reduce((a, b) => a + b, 0);
      setMontoTotalIngresado(Math.round(nuevaSuma * 100) / 100);
      return copy;
    });
  };

  const handleCambioMontoImputado = (cargoId: number, valor: string, maxPendiente: number) => {
    const num = Number(valor);
    if (isNaN(num) || num < 0) return;
    const finalVal = Math.min(num, maxPendiente);

    setImputaciones((prev) => {
      const copy = { ...prev, [cargoId]: Math.round(finalVal * 100) / 100 };
      const nuevaSuma = Object.values(copy).reduce((a, b) => a + b, 0);
      setMontoTotalIngresado(Math.round(nuevaSuma * 100) / 100);
      return copy;
    });
  };

  const seleccionarTodos = () => {
    const mapa: Record<number, number> = {};
    for (const c of cargosPendientesValidos) {
      const pendiente = Math.max(0, Number(c.montoFinal) - Number(c.montoPagado));
      mapa[c.id] = Math.round(pendiente * 100) / 100;
    }
    setImputaciones(mapa);
    const suma = Object.values(mapa).reduce((a, b) => a + b, 0);
    setMontoTotalIngresado(Math.round(suma * 100) / 100);
  };

  const deseleccionarTodos = () => {
    setImputaciones({});
    setMontoTotalIngresado(0);
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

    if (itemsAImputar.length === 0) {
      setError('Debe seleccionar al menos un cargo con monto a cancelar');
      return;
    }

    setProcesando(true);
    try {
      if (modoSaldoAFavor) {
        // Aplicar saldo a favor
        if (totalImputado > saldoAFavorDisponible + 0.001) {
          setError(`El total a imputar ($${totalImputado}) supera el saldo a favor disponible ($${saldoAFavorDisponible})`);
          setProcesando(false);
          return;
        }

        const res = await api.post('/tesoreria/saldo-a-favor/aplicar', {
          usuarioId: miembro.id,
          imputaciones: itemsAImputar,
        });

        onPagoExitoso(res.data?.mensaje || 'Saldo a favor aplicado exitosamente.');
      } else {
        // Cobro ordinario
        if (montoTotalFinal < totalImputado) {
          setError(`El monto total pagado ($${montoTotalFinal}) no puede ser menor a la suma a imputar ($${totalImputado})`);
          setProcesando(false);
          return;
        }

        const res = await api.post('/tesoreria/pagos', {
          usuarioId: miembro.id,
          montoTotal: montoTotalFinal,
          metodoPago,
          referenciaComprobante: referenciaComprobante.trim() || undefined,
          observaciones: observaciones.trim() || undefined,
          imputaciones: itemsAImputar,
        });

        const excedente = res.data?.excedenteAcreditado ?? 0;
        let mensaje = `Pago de $${montoTotalFinal} registrado correctamente.`;
        if (excedente > 0) {
          mensaje += ` Se acreditaron $${excedente} a favor del miembro.`;
        }
        onPagoExitoso(mensaje);
      }

      onCerrar();
    } catch (err: any) {
      console.error('Error al procesar pago', err);
      setError(err.response?.data?.message || 'Error al procesar el pago o aplicación de saldo');
    } finally {
      setProcesando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0 bg-slate-50/50 dark:bg-slate-800/30">
          <div className="flex items-center gap-3">
            <div
              className={`p-2.5 rounded-2xl ${
                modoSaldoAFavor
                  ? 'bg-teal-100 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400'
                  : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
              }`}
            >
              {modoSaldoAFavor ? <Wallet className="w-5 h-5" /> : <CreditCard className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base">
                {modoSaldoAFavor ? 'Aplicar Saldo a Favor' : 'Cobrar Cuotas / Registrar Pago'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Miembro: <strong>{miembro.nombre} {miembro.apellido}</strong> (DNI {miembro.dni})
              </p>
            </div>
          </div>
          <button
            onClick={onCerrar}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5 flex-1">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs font-semibold">
              {error}
            </div>
          )}

          {/* Banner de Saldo a Favor disponible */}
          {saldoAFavorDisponible > 0 && (
            <div className="p-3.5 rounded-2xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800/60 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                <span className="font-bold text-teal-900 dark:text-teal-200">
                  Saldo a favor disponible del miembro:
                </span>
              </div>
              <span className="text-base font-extrabold text-teal-700 dark:text-teal-300">
                ${saldoAFavorDisponible.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </span>
            </div>
          )}

          {/* Lista de deudas / cargos pendientes con checkbox */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Seleccione las deudas o cuotas a cancelar:
              </label>
              <div className="flex items-center gap-2 text-[11px]">
                <button
                  type="button"
                  onClick={seleccionarTodos}
                  className="text-emerald-600 dark:text-emerald-400 font-semibold hover:underline cursor-pointer"
                >
                  Seleccionar todas
                </button>
                <span className="text-slate-300">|</span>
                <button
                  type="button"
                  onClick={deseleccionarTodos}
                  className="text-slate-500 dark:text-slate-400 hover:underline cursor-pointer"
                >
                  Deseleccionar
                </button>
              </div>
            </div>

            {cargosPendientesValidos.length > 0 ? (
              <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800 max-h-56 overflow-y-auto">
                {cargosPendientesValidos.map((c) => {
                  const seleccionado = imputaciones[c.id] !== undefined;
                  const pendienteTotal = Math.max(0, Number(c.montoFinal) - Number(c.montoPagado));
                  const montoActual = imputaciones[c.id] ?? pendienteTotal;

                  return (
                    <div
                      key={c.id}
                      className={`p-3 flex items-center justify-between gap-3 transition text-xs ${
                        seleccionado
                          ? 'bg-emerald-50/50 dark:bg-emerald-950/20'
                          : 'bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <label className="flex items-center gap-3 cursor-pointer flex-1">
                        <input
                          type="checkbox"
                          checked={seleccionado}
                          onChange={() => toggleSeleccionCargo(c.id, pendienteTotal)}
                          className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                        />
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-slate-800 dark:text-slate-200">
                              {c.concepto?.nombre || 'Cuota'}
                            </span>
                            {c.concepto?.mes && (
                              <span className="px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-[10px] font-bold">
                                {NOMBRES_MESES[c.concepto.mes]}
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-slate-400 dark:text-slate-500">
                            Total: ${Number(c.montoFinal).toFixed(2)} • Pagado: ${Number(c.montoPagado).toFixed(2)} •{' '}
                            <strong className="text-amber-600 dark:text-amber-400">
                              Pendiente: ${pendienteTotal.toFixed(2)}
                            </strong>
                          </span>
                        </div>
                      </label>

                      {/* Input de monto a imputar */}
                      {seleccionado && (
                        <div className="w-28 shrink-0">
                          <div className="relative">
                            <span className="absolute left-2.5 top-1.5 text-xs font-bold text-slate-400 pointer-events-none">
                              $
                            </span>
                            <input
                              type="number"
                              step="0.01"
                              min={0.01}
                              max={pendienteTotal}
                              value={montoActual}
                              onChange={(e) => handleCambioMontoImputado(c.id, e.target.value, pendienteTotal)}
                              className="w-full rounded-xl border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-slate-800 pl-6 pr-2 py-1 text-xs font-bold text-emerald-600 dark:text-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-right"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-6 text-center bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs text-slate-400">
                Este miembro no tiene deudas ni cuotas pendientes de pago.
              </div>
            )}
          </div>

          {/* Subtotal imputado */}
          <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs">
            <span className="font-bold text-slate-700 dark:text-slate-300">
              Total imputado a las deudas seleccionadas:
            </span>
            <span className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
              ${totalImputado.toFixed(2)}
            </span>
          </div>

          {/* Si NO es modo saldo a favor: Monto cobrado real, excedente y método de pago */}
          {!modoSaldoAFavor && (
            <div className="space-y-4 pt-2 border-t border-slate-200 dark:border-slate-800">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Monto Total Recibido ($) *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-2 text-xs font-bold text-slate-400 pointer-events-none">
                      $
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      required
                      min={totalImputado}
                      value={montoTotalIngresado}
                      onChange={(e) =>
                        setMontoTotalIngresado(e.target.value === '' ? '' : Number(e.target.value))
                      }
                      placeholder={totalImputado.toString()}
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 pl-8 pr-3.5 py-2 text-xs font-extrabold text-emerald-600 dark:text-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Método de Pago *
                  </label>
                  <select
                    value={metodoPago}
                    onChange={(e) => setMetodoPago(e.target.value as any)}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
                  >
                    <option value="EFECTIVO">Efectivo</option>
                    <option value="TRANSFERENCIA">Transferencia Bancaria</option>
                    <option value="OTRO">Otro Medio</option>
                  </select>
                </div>
              </div>

              {/* Banner de Excedente como Saldo a Favor */}
              {excedenteSaldoAFavor > 0 && (
                <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-center justify-between text-xs animate-in fade-in">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <div>
                      <span className="font-bold text-emerald-900 dark:text-emerald-200 block">
                        Excedente de pago: ${excedenteSaldoAFavor.toFixed(2)}
                      </span>
                      <span className="text-[11px] text-emerald-700 dark:text-emerald-300">
                        Se acreditará automáticamente como saldo a favor del miembro para futuras cuotas.
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Referencia Comprobante y Observaciones */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    N° Comprobante / Referencia (opcional)
                  </label>
                  <input
                    type="text"
                    value={referenciaComprobante}
                    onChange={(e) => setReferenciaComprobante(e.target.value)}
                    placeholder="Ej. Transf 884920..."
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Observaciones (opcional)
                  </label>
                  <input
                    type="text"
                    value={observaciones}
                    onChange={(e) => setObservaciones(e.target.value)}
                    placeholder="Notas para tesorería..."
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Footer del Formulario */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onCerrar}
              className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={procesando || totalImputado <= 0}
              className={`px-5 py-2 rounded-xl text-white font-bold text-xs transition shadow-xs cursor-pointer disabled:opacity-50 flex items-center gap-2 ${
                modoSaldoAFavor ? 'bg-teal-600 hover:bg-teal-700' : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {procesando
                  ? 'Procesando...'
                  : modoSaldoAFavor
                    ? `Aplicar $${totalImputado.toFixed(2)} de Saldo a Favor`
                    : `Registrar Pago de $${montoTotalFinal.toFixed(2)}`}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
