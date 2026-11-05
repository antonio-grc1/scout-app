import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { X, Receipt, PlusCircle, AlertCircle, Wallet, Pencil } from 'lucide-react';
import {
  formatearMoneda,
  traducirErrorAmigable,
  ahoraLocalDatetime,
  fechaAFormatoDatetimeLocal,
} from '../lib/formatters';
import { ModalCrearRubro, type RubroAEditarItem } from './ModalCrearRubro';
import { useModalOverlay } from '../hooks/useModalOverlay';

export interface GastoAEditarItem {
  id: number;
  fecha: string;
  monto: number;
  descripcion: string;
  rubroId: number;
  cuentaId: number;
  comprobanteNro: string | null;
}

export interface ModalRegistrarGastoProps {
  abierto: boolean;
  onCerrar: () => void;
  onGastoRegistrado: (mensaje: string) => void;
  gastoAEditar?: GastoAEditarItem | null;
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
  saldoActual?: number;
  saldoActualConsolidado?: number;
}

export const ModalRegistrarGasto: React.FC<ModalRegistrarGastoProps> = ({
  abierto,
  onCerrar,
  onGastoRegistrado,
  gastoAEditar,
}) => {
  const esModoEdicion = Boolean(gastoAEditar);

  const [fecha, setFecha] = useState(ahoraLocalDatetime());
  const [monto, setMonto] = useState<string>('');
  const [descripcion, setDescripcion] = useState('');
  const [rubroId, setRubroId] = useState<number | ''>('');
  const [cuentaId, setCuentaId] = useState<number | ''>('');
  const [comprobanteNro, setComprobanteNro] = useState('');

  const [rubros, setRubros] = useState<RubroItem[]>([]);
  const [cuentas, setCuentas] = useState<CuentaItem[]>([]);
  const [cargandoDatos, setCargandoDatos] = useState(false);
  const [modalNuevoRubroAbierto, setModalNuevoRubroAbierto] = useState(false);
  const [rubroAEditar, setRubroAEditar] = useState<RubroAEditarItem | null>(null);

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { backdropProps, contentProps } = useModalOverlay({
    abierto,
    onCerrar,
    bloqueado: guardando || modalNuevoRubroAbierto,
  });

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

      if (!gastoAEditar) {
        if (rubrosList.length > 0 && !rubroId) {
          setRubroId(rubrosList[0].id);
        }
        if (cuentasList.length > 0 && !cuentaId) {
          setCuentaId(cuentasList[0].id);
        }
      }
    } catch {
      // Ignorar error inicial
    } finally {
      setCargandoDatos(false);
    }
  };

  useEffect(() => {
    if (abierto) {
      if (gastoAEditar) {
        setFecha(fechaAFormatoDatetimeLocal(gastoAEditar.fecha));
        setMonto(String(gastoAEditar.monto));
        setDescripcion(gastoAEditar.descripcion || '');
        setRubroId(gastoAEditar.rubroId);
        setCuentaId(gastoAEditar.cuentaId);
        setComprobanteNro(gastoAEditar.comprobanteNro || '');
      } else {
        setFecha(ahoraLocalDatetime());
        setMonto('');
        setDescripcion('');
        setComprobanteNro('');
      }
      setError(null);
      cargarCuentasYRubros();
    }
  }, [abierto, gastoAEditar]);

  if (!abierto) return null;

  const cuentaSeleccionada = cuentas.find((c) => c.id === cuentaId);
  const saldoBase = Number(cuentaSeleccionada?.saldoActual ?? cuentaSeleccionada?.saldoActualConsolidado ?? 0);
  const saldoDisponibleCuenta =
    saldoBase +
    (esModoEdicion && gastoAEditar && gastoAEditar.cuentaId === cuentaId
      ? Number(gastoAEditar.monto)
      : 0);
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
      const payload = {
        fecha,
        monto: montoNum,
        descripcion: descripcion.trim(),
        rubroId: Number(rubroId),
        cuentaId: Number(cuentaId),
        comprobanteNro: comprobanteNro.trim() || undefined,
      };

      if (esModoEdicion && gastoAEditar) {
        await api.patch(`/tesoreria/gastos/${gastoAEditar.id}`, payload);
        onGastoRegistrado(`Gasto de ${formatearMoneda(montoNum)} actualizado correctamente`);
      } else {
        await api.post('/tesoreria/gastos', payload);
        onGastoRegistrado(`Gasto de ${formatearMoneda(montoNum)} registrado correctamente`);
      }

      onCerrar();
    } catch (err) {
      setError(traducirErrorAmigable(err, esModoEdicion ? 'No se pudo actualizar el gasto.' : 'No se pudo registrar el gasto.'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
        {...backdropProps}
      >
        <div
          className="bg-paper border border-rule w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92dvh]"
          {...contentProps}
        >
          <div className="px-5 py-4 border-b border-rule flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                <Receipt className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-black text-ink">
                  {esModoEdicion ? 'Modificar Gasto / Egreso' : 'Registrar Gasto / Egreso'}
                </h3>
                <p className="text-[11px] text-ink-muted">
                  {esModoEdicion
                    ? 'Actualizará los datos del gasto y el movimiento en el libro diario.'
                    : 'Impactará inmediatamente en el libro diario de la cuenta seleccionada.'}
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

          <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
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
                  Fecha y Hora del Gasto *
                </label>
                <Input
                  type="datetime-local"
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
                    {c.nombre} ({c.tipo === 'CAJA_EFECTIVO' ? 'Efectivo' : 'Banco'}) — Saldo disp: {formatearMoneda(Number(c.saldoActual ?? c.saldoActualConsolidado ?? 0))}
                  </option>
                ))}
              </select>

              {saldoInsuficiente && (
                <p className="text-[11px] text-rose-600 dark:text-rose-400 font-bold mt-1">
                  ⚠️ El monto supera el saldo disponible ({formatearMoneda(saldoDisponibleCuenta)}).
                </p>
              )}
            </div>

            {/* Rubro de Gasto con botón para crear y editar */}
            <div>
              <div className="flex flex-wrap items-center justify-between gap-1 mb-1">
                <label className="text-xs font-bold text-ink">
                  Rubro / Categoría de Gasto
                </label>
                <div className="flex items-center gap-2">
                  {rubroId && (
                    <button
                      type="button"
                      onClick={() => {
                        const r = rubros.find((x) => x.id === rubroId);
                        if (r) {
                          setRubroAEditar({
                            id: r.id,
                            nombre: r.nombre,
                            tipo: r.tipo,
                            permiteDescuentoDefault: r.permiteDescuentoDefault,
                          });
                          setModalNuevoRubroAbierto(true);
                        }
                      }}
                      className="text-[11px] font-bold text-ink-muted hover:text-ink hover:underline flex items-center gap-1 cursor-pointer"
                      title="Modificar o eliminar esta categoría"
                    >
                      <Pencil className="w-3 h-3" />
                      <span>Editar</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setRubroAEditar(null);
                      setModalNuevoRubroAbierto(true);
                    }}
                    className="text-[11px] font-bold text-brand hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    <span>+ Nuevo Rubro</span>
                  </button>
                </div>
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
                <span>
                  {guardando
                    ? 'Guardando...'
                    : esModoEdicion
                    ? 'Guardar Modificaciones'
                    : 'Registrar Gasto'}
                </span>
              </Button>
            </div>
          </form>
        </div>
      </div>

      <ModalCrearRubro
        abierto={modalNuevoRubroAbierto}
        tipoDefault="EGRESO"
        rubroAEditar={rubroAEditar}
        onCerrar={() => {
          setModalNuevoRubroAbierto(false);
          setRubroAEditar(null);
        }}
        onRubroCreado={(rubroGuardado) => {
          setRubros((prev) => {
            const index = prev.findIndex((x) => x.id === rubroGuardado.id);
            if (index >= 0) {
              const copia = [...prev];
              copia[index] = { ...copia[index], ...rubroGuardado };
              return copia;
            }
            return [...prev, rubroGuardado as RubroItem];
          });
          setRubroId(rubroGuardado.id);
        }}
        onRubroEliminado={(rubroEliminado) => {
          setRubros((prev) => {
            const filtrados = prev.filter((x) => x.id !== rubroEliminado.id);
            if (rubroId === rubroEliminado.id) {
              setRubroId(filtrados.length > 0 ? filtrados[0].id : '');
            }
            return filtrados;
          });
        }}
      />
    </>
  );
};
