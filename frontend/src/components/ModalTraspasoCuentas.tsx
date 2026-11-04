import React, { useState, useEffect, useMemo } from 'react';
import { useModalOverlay } from '../hooks/useModalOverlay';
import { api } from '../api/client';
import { formatearMoneda, traducirErrorAmigable, ahoraLocalDatetime } from '../lib/formatters';
import { Button } from './ui/Button';
import { Input, Select, Textarea } from './ui/Input';
import { ArrowLeftRight, X, AlertTriangle } from 'lucide-react';

export interface CuentaFinancieraItem {
  id: number;
  nombre: string;
  tipo: 'CAJA_EFECTIVO' | 'BANCO';
  activa: boolean;
  saldoActual: number;
}

export interface ModalTraspasoCuentasProps {
  abierto: boolean;
  cuentas: CuentaFinancieraItem[];
  cuentaOrigenInicialId?: number;
  onCerrar: () => void;
  onTransferenciaExitosa: () => void;
  onToast?: (texto: string, tipo?: 'exito' | 'error') => void;
}

export const ModalTraspasoCuentas: React.FC<ModalTraspasoCuentasProps> = ({
  abierto,
  cuentas,
  cuentaOrigenInicialId,
  onCerrar,
  onTransferenciaExitosa,
  onToast,
}) => {
  const cuentasActivas = useMemo(() => cuentas.filter((c) => c.activa), [cuentas]);

  const [origenId, setOrigenId] = useState<number | ''>('');
  const [destinoId, setDestinoId] = useState<number | ''>('');
  const [monto, setMonto] = useState<string>('');
  const [concepto, setConcepto] = useState<string>('');
  const [fecha, setFecha] = useState<string>('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Inicializar formulario al abrir
  useEffect(() => {
    if (abierto) {
      setFecha(ahoraLocalDatetime());
      setMonto('');
      setConcepto('');
      setError(null);

      const origenPorDefecto =
        cuentaOrigenInicialId && cuentasActivas.some((c) => c.id === cuentaOrigenInicialId)
          ? cuentaOrigenInicialId
          : cuentasActivas[0]?.id ?? '';

      setOrigenId(origenPorDefecto);

      // Elegir un destino diferente por defecto
      const otro = cuentasActivas.find((c) => c.id !== origenPorDefecto);
      setDestinoId(otro ? otro.id : '');
    }
  }, [abierto, cuentaOrigenInicialId, cuentasActivas]);

  const { backdropProps, contentProps } = useModalOverlay({
    abierto,
    onCerrar,
    bloqueado: enviando,
  });

  if (!abierto) return null;

  const cuentaOrigen = cuentasActivas.find((c) => c.id === Number(origenId));
  const cuentaDestino = cuentasActivas.find((c) => c.id === Number(destinoId));
  const montoNum = parseFloat(monto);
  const saldoOrigenDisponible = cuentaOrigen ? Number(cuentaOrigen.saldoActual) : 0;
  const saldoInsuficiente = !isNaN(montoNum) && montoNum > saldoOrigenDisponible;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!origenId) {
      setError('Seleccioná la cuenta de origen.');
      return;
    }
    if (!destinoId) {
      setError('Seleccioná la cuenta de destino.');
      return;
    }
    if (origenId === destinoId) {
      setError('La cuenta de origen y de destino no pueden ser la misma.');
      return;
    }
    if (isNaN(montoNum) || montoNum <= 0) {
      setError('Ingresá un monto mayor a $0.');
      return;
    }
    if (saldoInsuficiente) {
      setError(
        `El monto ($${montoNum.toLocaleString('es-AR')}) excede el saldo disponible en la cuenta origen (${formatearMoneda(saldoOrigenDisponible)}).`,
      );
      return;
    }
    if (!concepto.trim() || concepto.trim().length < 3) {
      setError('Ingresá el motivo o concepto del traspaso (mínimo 3 caracteres).');
      return;
    }

    setEnviando(true);
    setError(null);

    try {
      const res = await api.post('/tesoreria/transferencias', {
        origenCuentaId: Number(origenId),
        destinoCuentaId: Number(destinoId),
        monto: montoNum,
        concepto: concepto.trim(),
        fecha: fecha ? fecha : undefined,
      });

      const mensajeExito = res.data?.mensaje || 'Traspaso realizado con éxito.';
      if (onToast) {
        onToast(mensajeExito);
      }
      onTransferenciaExitosa();
      onCerrar();
    } catch (err: any) {
      const msg = traducirErrorAmigable(err, 'No se pudo realizar el traspaso entre cuentas.');
      setError(msg);
      if (onToast) {
        onToast(msg, 'error');
      }
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 overflow-y-auto motion-safe:animate-in motion-safe:fade-in motion-reduce:animate-none"
      {...backdropProps}
    >
      <div
        className="bg-surface border border-rule rounded-2xl w-full max-w-lg shadow-md overflow-hidden transition-colors"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-traspaso-title"
        {...contentProps}
      >
        <div className="p-5 sm:p-6">
          {/* Encabezado */}
          <div className="flex items-start justify-between gap-4 border-b border-rule pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand/15 text-brand flex items-center justify-center shrink-0">
                <ArrowLeftRight className="w-5 h-5" />
              </div>
              <div>
                <h3 id="modal-traspaso-title" className="text-base sm:text-lg font-bold text-ink leading-snug">
                  Traspaso entre Cuentas
                </h3>
                <p className="text-xs text-ink-muted">
                  Extracción, depósito o movimiento interno entre fondos del grupo.
                </p>
              </div>
            </div>
            {!enviando && (
              <button
                type="button"
                onClick={onCerrar}
                className="text-ink-muted hover:text-ink transition-colors p-1.5 rounded-lg cursor-pointer hover:bg-paper-2"
                aria-label="Cerrar ventana"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Formulario */}
          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            {/* Cuenta Origen y Destino */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                label="Cuenta Origen (Sale dinero)"
                required
                value={origenId}
                onChange={(e) => {
                  const val = e.target.value === '' ? '' : Number(e.target.value);
                  setOrigenId(val);
                  if (val === destinoId) {
                    const otro = cuentasActivas.find((c) => c.id !== val);
                    setDestinoId(otro ? otro.id : '');
                  }
                }}
                disabled={enviando}
                helperText={
                  cuentaOrigen
                    ? `Saldo disponible: ${formatearMoneda(cuentaOrigen.saldoActual)}`
                    : undefined
                }
              >
                {cuentasActivas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre} ({formatearMoneda(c.saldoActual)})
                  </option>
                ))}
              </Select>

              <Select
                label="Cuenta Destino (Ingresa dinero)"
                required
                value={destinoId}
                onChange={(e) => setDestinoId(e.target.value === '' ? '' : Number(e.target.value))}
                disabled={enviando}
                helperText={
                  cuentaDestino
                    ? `Saldo actual: ${formatearMoneda(cuentaDestino.saldoActual)}`
                    : undefined
                }
              >
                <option value="" disabled>
                  Seleccionar destino...
                </option>
                {cuentasActivas
                  .filter((c) => c.id !== Number(origenId))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre} ({formatearMoneda(c.saldoActual)})
                    </option>
                  ))}
              </Select>
            </div>

            {/* Monto y Fecha */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Input
                  label="Monto a Transferir"
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={saldoOrigenDisponible > 0 ? saldoOrigenDisponible : undefined}
                  required
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  placeholder="0.00"
                  disabled={enviando}
                  error={
                    saldoInsuficiente
                      ? `Saldo insuficiente (máx ${formatearMoneda(saldoOrigenDisponible)})`
                      : undefined
                  }
                />
              </div>

              <div>
                <Input
                  label="Fecha y Hora de la Operación"
                  type="datetime-local"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  disabled={enviando}
                  helperText="Fecha y hora en que se realizó el movimiento."
                />
              </div>
            </div>

            {/* Advertencia de saldo si aplica */}
            {saldoInsuficiente && (
              <div
                role="alert"
                className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2 font-medium"
              >
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <span>
                  El monto ingresado excede el saldo disponible en la cuenta origen (
                  {formatearMoneda(saldoOrigenDisponible)}).
                </span>
              </div>
            )}

            {/* Concepto / Motivo */}
            <Textarea
              label="Concepto / Motivo"
              required
              rows={2}
              value={concepto}
              onChange={(e) => setConcepto(e.target.value)}
              placeholder="Ej. Extracción de banco para compras de comida campamento..."
              disabled={enviando}
              helperText="Detalla el motivo del movimiento para el libro diario."
            />

            {error && (
              <div
                role="alert"
                className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 font-medium"
              >
                {error}
              </div>
            )}

            {/* Botones de acción */}
            <div className="pt-2 flex items-center justify-end gap-2.5">
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={onCerrar}
                disabled={enviando}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="md"
                disabled={saldoInsuficiente || !origenId || !destinoId || origenId === destinoId}
                loading={enviando}
                loadingText="Transfiriendo..."
                leftIcon={<ArrowLeftRight className="w-4 h-4" />}
              >
                Confirmar Traspaso
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
