import React, { useState, useEffect, useRef } from 'react';
import { useModalOverlay } from '../hooks/useModalOverlay';
import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';
import {
  X,
  CreditCard,
  CheckCircle2,
  Sparkles,
  Wallet,
  Landmark,
} from 'lucide-react';
import { formatearMoneda, parsearMontoAR, traducirErrorAmigable } from '../lib/formatters';

interface Props {
  abierto: boolean;
  /** Avisa al contenedor (Drawer) cuando hay un cobro en curso para bloquear el cierre */
  onOcupadoChange?: (ocupado: boolean) => void;
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
  embedded?: boolean;
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

interface CuentaSimple {
  id: number;
  nombre: string;
  tipo: 'CAJA_EFECTIVO' | 'BANCO';
  activa: boolean;
  saldoActual: number;
}

export const ModalCobrarDeuda: React.FC<Props> = ({
  abierto,
  onOcupadoChange,
  miembro,
  cargosPendientes,
  cargoInicialId,
  onCerrar,
  onPagoExitoso,
  embedded = false,
}) => {
  const [imputaciones, setImputaciones] = useState<Record<number, number>>({});
  const [usarSaldoAFavor, setUsarSaldoAFavor] = useState(false);
  const [montoTotalIngresado, setMontoTotalIngresado] = useState<number | ''>('');
  // Texto tal como lo escribe el usuario ("1.500" = mil quinientos); el número se deriva con parsearMontoAR.
  const [montoTexto, setMontoTexto] = useState('');
  const fijarMonto = (valor: number | '') => {
    setMontoTotalIngresado(valor);
    setMontoTexto(valor === '' ? '' : String(valor).replace('.', ','));
  };
  const [metodoPago, setMetodoPago] = useState<'EFECTIVO' | 'TRANSFERENCIA' | 'OTRO'>('EFECTIVO');
  const [cuentas, setCuentas] = useState<CuentaSimple[]>([]);
  const [cuentaId, setCuentaId] = useState<number | ''>('');
  const [referenciaComprobante, setReferenciaComprobante] = useState('');
  const [observaciones, setObservaciones] = useState('');

  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    onOcupadoChange?.(procesando);
    return () => onOcupadoChange?.(false);
  }, [procesando, onOcupadoChange]);
  const [errorCuentas, setErrorCuentas] = useState<string | null>(null);
  const enviandoRef = useRef(false);

  const { backdropProps, contentProps } = useModalOverlay({
    abierto: !embedded && abierto,
    onCerrar,
    bloqueado: procesando,
  });

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
    fijarMonto(efectivoNecesario);
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

  // Cargar cuentas financieras activas (GLOBAL ve centrales/todas; UNIDAD ve cuentas de su rama - A2)
  const puedeSeleccionarCuenta = useAuthStore((s) =>
    s.tienePermisoUnidadOGlobal([
      'cobranzas.editar',
      'caja.editar',
      'caja.ver',
      'caja.editar',
    ]),
  );
  useEffect(() => {
    if (!abierto) return;
    setErrorCuentas(null);
    if (!puedeSeleccionarCuenta) {
      setCuentas([]);
      setCuentaId('');
      return;
    }
    api
      .get('/tesoreria/cuentas')
      .then((res) => {
        const activas: CuentaSimple[] = (res.data || []).filter((c: CuentaSimple) => c.activa);
        setCuentas(activas);
        setErrorCuentas(null);
      })
      .catch((err) => {
        setCuentas([]);
        setErrorCuentas(
          traducirErrorAmigable(err, 'No se pudieron cargar las cuentas financieras activas.'),
        );
      });
  }, [abierto, puedeSeleccionarCuenta]);

  // Seleccionar automáticamente la cuenta financiera según el método de pago
  useEffect(() => {
    if (metodoPago === 'TRANSFERENCIA') {
      const bancos = cuentas.filter((c) => c.tipo === 'BANCO');
      const principal =
        bancos.find((c) => c.nombre.toLowerCase().includes('principal')) || bancos[0];
      if (principal) {
        setCuentaId(principal.id);
      } else {
        setCuentaId('');
      }
    } else if (metodoPago === 'EFECTIVO') {
      const cajas = cuentas.filter((c) => c.tipo === 'CAJA_EFECTIVO');
      const central =
        cajas.find(
          (c) =>
            c.nombre.toLowerCase().includes('central') ||
            c.nombre.toLowerCase().includes('chica'),
        ) || cajas[0];
      if (central) {
        setCuentaId(central.id);
      } else {
        setCuentaId('');
      }
    } else {
      setCuentaId('');
    }
  }, [metodoPago, cuentas]);

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
    fijarMonto('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (enviandoRef.current || procesando) return;
    setError(null);

    if (montoTexto.trim() !== '' && parsearMontoAR(montoTexto) === null) {
      setError('El monto recibido no es válido. Escribilo como 1.500 o 1500,50.');
      return;
    }

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

    if (puedeSeleccionarCuenta && montoEfectivoFinal > 0 && errorCuentas) {
      setError(errorCuentas);
      return;
    }

    const tieneCuentasParaMetodo =
      puedeSeleccionarCuenta &&
      ((metodoPago === 'TRANSFERENCIA' && cuentas.some((c) => c.tipo === 'BANCO')) ||
        (metodoPago === 'EFECTIVO' && cuentas.some((c) => c.tipo === 'CAJA_EFECTIVO')));
    if (puedeSeleccionarCuenta && montoEfectivoFinal > 0 && tieneCuentasParaMetodo && !cuentaId) {
      setError('Seleccioná la cuenta financiera donde ingresa el cobro.');
      return;
    }

    enviandoRef.current = true;
    setProcesando(true);
    try {
      const res = await api.post('/tesoreria/pagos', {
        usuarioId: miembro.id,
        montoTotal: montoEfectivoFinal,
        metodoPago,
        cuentaId: puedeSeleccionarCuenta && cuentaId ? Number(cuentaId) : undefined,
        usarSaldoAFavor: saldoAFavorAUsar > 0,
        montoSaldoAFavor: saldoAFavorAUsar,
        referenciaComprobante: referenciaComprobante.trim() || undefined,
        observaciones: observaciones.trim() || undefined,
        imputaciones: itemsAImputar,
      });

      const excedente = Number(res.data?.excedenteAcreditado ?? 0);
      const saldoUsado = Number(res.data?.saldoAFavorAplicado ?? 0);
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
      enviandoRef.current = false;
      setProcesando(false);
    }
  };

  const puedeConfirmar = !procesando && (totalImputado > 0 || montoEfectivoFinal > 0);

  const contenido = (
    <div
      className={
        embedded
          ? 'bg-surface rounded-2xl border border-rule w-full flex flex-col overflow-clip'
          : 'bg-surface rounded-3xl border border-rule shadow-md w-full max-w-2xl max-h-[92dvh] flex flex-col overflow-hidden motion-safe:animate-in motion-safe:fade-in motion-reduce:animate-none'
      }
      {...(embedded ? {} : contentProps)}
    >
      {/* Header: embebido, el contenedor (Drawer de Tesorería o subvista del expediente) ya
          muestra el título y el miembro, así que no se repiten. */}
      {!embedded && (
      <div className="p-5 border-b border-rule flex items-center justify-between shrink-0 bg-paper-2">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-brand/10 text-brand">
            <CreditCard className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-ink text-lg">
              Registrar Pago / Cobrar Cuotas
            </h3>
            <p className="text-[13px] text-ink-muted">
              Miembro: <strong>{miembro.nombre} {miembro.apellido}</strong> (DNI {miembro.dni})
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar"
          className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center p-2 rounded-xl text-ink-muted hover:text-ink hover:bg-paper-2 transition cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
      )}

      {/* Formulario */}
      <form
        onSubmit={handleSubmit}
        className={`p-5 sm:p-6 space-y-4 flex-1 ${embedded ? "" : "overflow-y-auto"}`}
      >
        {error && (
          <div role="alert" className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-sm font-semibold">
            {error}
          </div>
        )}

        {/* Lista de deudas / cargos pendientes con checkbox */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="text-[13px] font-bold text-ink-2">
              Cuotas a cancelar (podés ajustar el monto si es un pago parcial):
            </label>
            {cargosPendientesValidos.length > 0 && (
              <div className="flex items-center gap-2 text-xs">
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
            <div className="border border-rule rounded-2xl overflow-hidden divide-y divide-rule max-h-56 overflow-y-auto">
              {cargosPendientesValidos.map((c) => {
                const seleccionado = imputaciones[c.id] !== undefined;
                const pendienteTotal = Math.max(0, Number(c.montoFinal) - Number(c.montoPagado));
                const montoActual = imputaciones[c.id] ?? pendienteTotal;

                return (
                  <div
                    key={c.id}
                    className={`p-3.5 flex items-center justify-between gap-3 transition text-[13px] ${
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
                          <span className="font-bold text-ink text-sm">
                            {c.concepto?.nombre || 'Cuota'}
                          </span>
                          {c.concepto?.mes && (
                            <span className="px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-xs font-bold">
                              {NOMBRES_MESES[c.concepto.mes]}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-ink-muted flex items-center gap-1.5 flex-wrap mt-0.5">
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
                      <div className="w-32 shrink-0">
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] font-bold text-ink-muted pointer-events-none">
                            $
                          </span>
                          <input
                            type="number"
                            step="0.01"
                            min={0.01}
                            max={pendienteTotal}
                            value={montoActual}
                            onChange={(e) => handleCambioMontoImputado(c.id, e.target.value, pendienteTotal)}
                            className="w-full min-h-[38px] rounded-xl border border-brand/40 bg-surface pl-7 pr-2.5 py-1.5 text-sm font-bold text-ink focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none text-right transition-colors"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-4 text-center bg-paper-2 rounded-2xl border border-rule text-[13px] text-ink-muted">
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
                <span className="text-[13px] font-bold text-teal-950 dark:text-teal-100 flex items-center gap-1.5">
                  <Wallet className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                  Usar Saldo a Favor disponible ({formatearMoneda(saldoAFavorDisponible)})
                </span>
                <span className="text-xs text-teal-700 dark:text-teal-300 block mt-0.5">
                  {usarSaldoAFavor
                    ? `Se descuentan ${formatearMoneda(saldoAFavorAUsar)} de su saldo a favor.`
                    : 'Tildá esta opción para descontar el saldo a favor de este cobro.'}
                </span>
              </div>
            </div>
            {usarSaldoAFavor && (
              <span className="text-base font-black text-teal-700 dark:text-teal-300 shrink-0">
                -{formatearMoneda(saldoAFavorAUsar)}
              </span>
            )}
          </label>
        )}

        {/* Subtotal imputado y restante */}
        <div className="p-4 rounded-2xl bg-paper-2 border border-rule space-y-2 text-[13px]">
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
          <div className="flex items-center justify-between pt-1.5 border-t border-rule">
            <span className="font-bold text-ink">
              Restante a cobrar hoy en caja / transferencia:
            </span>
            <span className="text-base font-black text-brand">
              {formatearMoneda(minimoEfectivoRequerido)}
            </span>
          </div>
        </div>

        {/* Monto recibido hoy y medio de pago */}
        <div className="space-y-4 pt-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-[13px] font-bold text-ink-2 mb-1.5">
                Monto Recibido Hoy ($) *
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[15px] font-bold text-ink-muted pointer-events-none">
                  $
                </span>
                {/* type="text" + inputMode decimal: con type="number" "1.500" se leía como 1,5 */}
                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  aria-describedby="monto-recibido-ayuda"
                  value={montoTexto}
                  onChange={(e) => {
                    const texto = e.target.value;
                    setMontoTexto(texto);
                    const n = parsearMontoAR(texto);
                    setMontoTotalIngresado(texto.trim() === '' || n === null ? '' : n);
                  }}
                  placeholder={formatearMoneda(minimoEfectivoRequerido).replace(/^\$\s?/, '')}
                  className="w-full min-h-[46px] rounded-xl border border-rule bg-surface pl-8 pr-3.5 py-2.5 text-base sm:text-[15px] font-extrabold text-ink focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none transition-colors"
                />
              </div>
              <p id="monto-recibido-ayuda" className="mt-1 text-xs text-ink-muted" aria-live="polite">
                {montoTexto.trim() !== '' && parsearMontoAR(montoTexto) === null
                  ? 'Monto no válido. Ejemplos: 1.500 o 1500,50'
                  : `Se registrará: ${formatearMoneda(montoEfectivoFinal)}`}
              </p>
            </div>

            <div>
              <label className="block text-[13px] font-bold text-ink-2 mb-1.5">
                Método de Pago
              </label>
              <select
                value={metodoPago}
                onChange={(e) => setMetodoPago(e.target.value as any)}
                disabled={montoEfectivoFinal <= 0}
                className="w-full min-h-[46px] rounded-xl border border-rule bg-surface px-3.5 py-2.5 text-base sm:text-[15px] font-semibold text-ink focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none transition-colors disabled:opacity-50"
              >
                <option value="EFECTIVO">Efectivo</option>
                <option value="TRANSFERENCIA">Transferencia Bancaria</option>
                <option value="OTRO">Otro Medio</option>
              </select>
            </div>
          </div>

          {/* Sin cuenta para el método elegido el cobro no entra en ningún libro diario: avisarlo */}
          {puedeSeleccionarCuenta &&
            montoEfectivoFinal > 0 &&
            !(
              (metodoPago === 'TRANSFERENCIA' && cuentas.some((c) => c.tipo === 'BANCO')) ||
              (metodoPago === 'EFECTIVO' && cuentas.some((c) => c.tipo === 'CAJA_EFECTIVO'))
            ) && (
              <p role="note" className="s-badge-warn rounded-xl p-3 text-[13px] font-semibold">
                {metodoPago === 'OTRO'
                  ? 'Con "Otro medio" el cobro no se imputa a ninguna caja ni banco: no aparecerá en el libro diario.'
                  : `No hay ${metodoPago === 'TRANSFERENCIA' ? 'cuenta bancaria' : 'caja de efectivo'} activa: el cobro no aparecerá en el libro diario. Creala en Tesorería → Caja, Bancos y Gastos.`}
              </p>
            )}

          {/* Selector o indicador de Cuenta Financiera según método de pago */}
          {puedeSeleccionarCuenta && montoEfectivoFinal > 0 && metodoPago === 'TRANSFERENCIA' && cuentas.some((c) => c.tipo === 'BANCO') && (
            <div className="p-3.5 rounded-xl bg-paper-2 border border-rule space-y-2 animate-in fade-in">
              <label className="block text-[13px] font-bold text-ink-2 flex items-center gap-1.5">
                <Landmark className="w-4 h-4 text-brand" />
                <span>Cuenta Bancaria Destino</span>
              </label>
              <select
                value={cuentaId}
                onChange={(e) => setCuentaId(e.target.value === '' ? '' : Number(e.target.value))}
                className="w-full min-h-[44px] rounded-xl border border-rule bg-surface px-3.5 py-2 text-base sm:text-[15px] font-semibold text-ink focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none transition-colors"
              >
                {cuentas
                  .filter((c) => c.tipo === 'BANCO')
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre} (Saldo: {formatearMoneda(c.saldoActual)})
                    </option>
                  ))}
              </select>
              <p className="text-xs text-ink-muted">
                El cobro se acreditará como ingreso en el libro diario de esta cuenta bancaria.
              </p>
            </div>
          )}

          {puedeSeleccionarCuenta && montoEfectivoFinal > 0 && metodoPago === 'EFECTIVO' && cuentas.some((c) => c.tipo === 'CAJA_EFECTIVO') && (
            <div className="p-3.5 rounded-xl bg-paper-2 border border-rule space-y-2 animate-in fade-in">
              <label className="block text-[13px] font-bold text-ink-2 flex items-center gap-1.5">
                <Wallet className="w-4 h-4 text-brand" />
                <span>Cuenta de Efectivo / Caja Chica</span>
              </label>
              {cuentas.filter((c) => c.tipo === 'CAJA_EFECTIVO').length > 1 ? (
                <select
                  value={cuentaId}
                  onChange={(e) => setCuentaId(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full min-h-[44px] rounded-xl border border-rule bg-surface px-3.5 py-2 text-base sm:text-[15px] font-semibold text-ink focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none transition-colors"
                >
                  {cuentas
                    .filter((c) => c.tipo === 'CAJA_EFECTIVO')
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre} (Saldo: {formatearMoneda(c.saldoActual)})
                      </option>
                    ))}
                </select>
              ) : (
                <div className="flex items-center justify-between text-[13px] text-ink bg-surface p-2.5 rounded-lg border border-rule">
                  <span className="font-bold">
                    {cuentas.find((c) => c.id === cuentaId)?.nombre || 'Caja Chica Central'}
                  </span>
                  {cuentas.find((c) => c.id === cuentaId)?.saldoActual !== undefined && (
                    <span className="text-ink-muted text-xs">
                      Saldo: {formatearMoneda(cuentas.find((c) => c.id === cuentaId)?.saldoActual)}
                    </span>
                  )}
                </div>
              )}
              <p className="text-xs text-ink-muted">
                El cobro se acreditará en el libro diario de la caja física.
              </p>
            </div>
          )}

          {/* Banner de Excedente o Adelanto como Saldo a Favor */}
          {excedenteSaldoAFavor > 0 && (
            <div className="p-3.5 rounded-2xl bg-brand/10 border border-brand/30 flex items-center justify-between text-[13px] animate-in fade-in">
              <div className="flex items-center gap-2.5">
                <Sparkles className="w-4 h-4 text-brand shrink-0" />
                <div>
                  <span className="font-bold text-ink block">
                    {totalImputado === 0
                      ? `Adelanto a cuenta: ${formatearMoneda(excedenteSaldoAFavor)}`
                      : `Excedente a favor: ${formatearMoneda(excedenteSaldoAFavor)}`}
                  </span>
                  <span className="text-xs text-ink-2">
                    Se acreditará automáticamente como Saldo a Favor del miembro para futuras cuotas.
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Referencia Comprobante y Observaciones */}
          {montoEfectivoFinal > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-[13px] font-semibold text-ink-2 mb-1.5">
                  N° Comprobante / Referencia (opcional)
                </label>
                <input
                  type="text"
                  value={referenciaComprobante}
                  onChange={(e) => setReferenciaComprobante(e.target.value)}
                  placeholder="Ej. Transf 884920..."
                  className="w-full min-h-[44px] rounded-xl border border-rule bg-surface px-3.5 py-2 text-base sm:text-[15px] text-ink"
                />
              </div>

              <div>
                <label className="block text-[13px] font-semibold text-ink-2 mb-1.5">
                  Observaciones (opcional)
                </label>
                <input
                  type="text"
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  placeholder="Notas para tesorería..."
                  className="w-full min-h-[44px] rounded-xl border border-rule bg-surface px-3.5 py-2 text-base sm:text-[15px] text-ink"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer del Formulario */}
        <div className="sticky bottom-0 -mx-5 sm:-mx-6 -mb-5 sm:-mb-6 px-5 sm:px-6 pt-3.5 pb-[max(1rem,env(safe-area-inset-bottom))] bg-surface border-t border-rule flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCerrar}
            className="min-h-[44px] px-4 py-2 rounded-xl border border-rule text-ink-2 font-semibold text-sm hover:bg-paper-2 transition cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!puedeConfirmar}
            className="min-h-[44px] px-5 py-2 rounded-xl bg-brand hover:opacity-90 active:opacity-100 text-brand-contrast font-bold text-sm transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-2"
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
  );

  if (embedded) return contenido;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      {...backdropProps}
    >
      {contenido}
    </div>
  );
};
