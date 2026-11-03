import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { X, Receipt, PlusCircle, AlertCircle, Wallet } from 'lucide-react';
import { formatearMoneda, traducirErrorAmigable } from '../lib/formatters';
import { ModalCrearRubro } from './ModalCrearRubro';

export interface ModalRegistrarGastoProps {
  abierto: boolean;
  onCerrar: () => void;
  onGastoRegistrado: (mensaje: string) => void;
}

export interface RubroItem {
  id: number;
  nombre: string;
  tipo: 'INGRESO' | 'EGRESO';
  permiteDescuentoDefault: boolean;
}

export interface CuentaItem {
  id: number;
  nombre: string;
  tipo: 'CAJA_EFECTIVO' | 'BANCO';
  activa: boolean;
  saldoActualConsolidado?: number;
}

function hoyISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export const ModalRegistrarGasto: React.FC<ModalRegistrarGastoProps> = ({
  abierto,
  onCerrar,
  onGastoRegistrado,
}) => {
  const [fecha, setFecha] = useState(hoyISO());
  const [monto, setMonto] = useState<string>('');
  const [descripcion, setDescripcion] = useState('');
  const [rubroId, setRubroId] = useState<number | ''>('');
  const [cuentaId, setCuentaId] = useState<number | ''>('');
  const [comprobanteNro, setComprobanteNro] = useState('');

  const [rubros, setRubros] = useState<RubroItem[]>([]);
  const [cuentas, setCuentas] = useState<CuentaItem[]>([]);
  const [cargandoDatos, setCargandoDatos] = useState(false);
  const [modalNuevoRubroAbierto, setModalNuevoRubroAbierto] = useState(false);

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargarCuentasYRubros = async () => {
    try {
      setCargandoDatos(true);
      const [resRubros, resCuentas] = await Promise.all([
        api.get('/tesoreria/rubros?tipo=EGRESO'),
        api.get('/tesoreria/cuentas'),
      ]);
      const rubrosList = Array.isArray(resRubros.data) ? resRubros.data : [];
      const cuentasList = Array.isArray(resCuentas.data) ? resCuentas.data : [];

      setRubros(rubrosList);
      setCuentas(cuentasList);

      if (rubrosList.length > 0 && !rubroId) {
        setRubroId(rubrosList[0].id);
      }
      if (cuentasList.length > 0 && !cuentaId) {
        setCuentaId(cuentasList[0].id);
      }
    } catch {
      // Ignorar error inicial
    } finally {
      setCargandoDatos(false);
    }
  };

  useEffect(() => {
    if (abierto) {
      setFecha(hoyISO());
      setMonto('');
      setDescripcion('');
      setComprobanteNro('');
      setError(null);
      cargarCuentasYRubros();
    }
  }, [abierto]);

  if (!abierto) return null;

  const cuentaSeleccionada = cuentas.find((c) => c.id === cuentaId);
  const saldoDisponibleCuenta = Number(cuentaSeleccionada?.saldoActualConsolidado ?? 0);
  const montoNum = Number(monto) || 0;
  const saldoInsuficiente = montoNum > saldoDisponibleCuenta && montoNum > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!monto || montoNum <= 0) {
      setError('El monto debe ser mayor a 0');
      return;
    }
    if (!descripcion.trim()) {
      setError('La descripción del gasto es obligatoria');
      return;
    }
    if (!rubroId) {
      setError('Debe seleccionar un rubro de egreso');
      return;
    }
    if (!cuentaId) {
      setError('Debe seleccionar de qué cuenta sale el dinero (Caja o Banco)');
      return;
    }
    if (saldoInsuficiente) {
      setError(
        `Saldo insuficiente en ${cuentaSeleccionada?.nombre || 'la cuenta'}. Saldo disponible: ${formatearMoneda(
          saldoDisponibleCuenta,
        )}`,
      );
      return;
    }

    try {
      setGuardando(true);
      setError(null);
      await api.post('/tesoreria/gastos', {
        fecha,
        monto: montoNum,
        descripcion: descripcion.trim(),
        rubroId: Number(rubroId),
        cuentaId: Number(cuentaId),
        comprobanteNro: comprobanteNro.trim() || undefined,
      });

      onGastoRegistrado(`Gasto de ${formatearMoneda(montoNum)} registrado correctamente`);
      onCerrar();
    } catch (err) {
      setError(traducirErrorAmigable(err, 'No se pudo registrar el gasto.'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
        <div className="bg-paper border border-rule w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-rule flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                <Receipt className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-black text-ink">
                  Registrar Gasto / Egreso
                </h3>
                <p className="text-[11px] text-ink-muted">
                  Impactará inmediatamente en el libro diario de la cuenta seleccionada.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onCerrar}
              className="p-1 rounded-lg text-ink-muted hover:text-ink hover:bg-paper-2 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            {error && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs font-semibold flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-ink block mb-1">
                  Monto ($)
                </label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  placeholder="0.00"
                  autoFocus
                  required
                />
              </div>

              <div>
                <label className="text-xs font-bold text-ink block mb-1">
                  Fecha del Gasto
                </label>
                <Input
                  type="date"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Cuenta de salida (Caja o Banco) */}
            <div>
              <label className="text-xs font-bold text-ink block mb-1">
                Cuenta de Pago (¿De dónde sale la plata?)
              </label>
              <select
                value={cuentaId}
                onChange={(e) => setCuentaId(Number(e.target.value) || '')}
                className="w-full h-10 px-3 rounded-xl bg-paper-2 border border-rule text-xs font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-brand/30"
                required
              >
                {cuentas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre} ({c.tipo === 'CAJA_EFECTIVO' ? 'Efectivo' : 'Banco'}) — Saldo disp: {formatearMoneda(Number(c.saldoActualConsolidado ?? 0))}
                  </option>
                ))}
              </select>

              {saldoInsuficiente && (
                <p className="text-[11px] text-rose-600 dark:text-rose-400 font-bold mt-1">
                  ⚠️ El monto supera el saldo disponible ({formatearMoneda(saldoDisponibleCuenta)}).
                </p>
              )}
            </div>

            {/* Rubro de Gasto con botón para crear nuevo */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-ink">
                  Rubro / Categoría de Gasto
                </label>
                <button
                  type="button"
                  onClick={() => setModalNuevoRubroAbierto(true)}
                  className="text-[11px] font-bold text-brand hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>+ Nuevo Rubro</span>
                </button>
              </div>

              <select
                value={rubroId}
                onChange={(e) => setRubroId(Number(e.target.value) || '')}
                className="w-full h-10 px-3 rounded-xl bg-paper-2 border border-rule text-xs font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-brand/30"
                required
              >
                {rubros.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nombre}
                  </option>
                ))}
              </select>
            </div>

            {/* Descripción */}
            <div>
              <label className="text-xs font-bold text-ink block mb-1">
                Descripción / Detalle del Gasto
              </label>
              <Input
                type="text"
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Ej: Pintura para sede, Comida para campamento, Fletes..."
                required
              />
            </div>

            {/* Comprobante */}
            <div>
              <label className="text-xs font-bold text-ink block mb-1">
                N° de Comprobante / Ticket / Factura (Opcional)
              </label>
              <Input
                type="text"
                value={comprobanteNro}
                onChange={(e) => setComprobanteNro(e.target.value)}
                placeholder="Ej: Ticket N° 0041-9872"
              />
            </div>

            <div className="pt-2 flex justify-end gap-2 border-t border-rule">
              <Button
                type="button"
                variant="secondary"
                onClick={onCerrar}
                disabled={guardando}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={guardando || !monto || saldoInsuficiente || !descripcion.trim()}
                className="gap-1.5"
              >
                <Receipt className="w-4 h-4" />
                <span>{guardando ? 'Guardando...' : 'Registrar Gasto'}</span>
              </Button>
            </div>
          </form>
        </div>
      </div>

      <ModalCrearRubro
        abierto={modalNuevoRubroAbierto}
        tipoDefault="EGRESO"
        onCerrar={() => setModalNuevoRubroAbierto(false)}
        onRubroCreado={(nuevo) => {
          setRubros((prev) => [...prev, nuevo as RubroItem]);
          setRubroId(nuevo.id);
        }}
      />
    </>
  );
};
