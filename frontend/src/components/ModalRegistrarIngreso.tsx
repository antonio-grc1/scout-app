import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { X, PlusCircle, AlertCircle, Pencil, ArrowDownRight } from 'lucide-react';
import {
  formatearMoneda,
  traducirErrorAmigable,
  ahoraLocalDatetime,
  fechaAFormatoDatetimeLocal,
} from '../lib/formatters';
import { ModalCrearRubro, type RubroAEditarItem } from './ModalCrearRubro';
import { useModalOverlay } from '../hooks/useModalOverlay';

export interface IngresoAEditarItem {
  id: number;
  fecha: string;
  montoIngreso: number;
  conceptoTexto: string;
  rubroId?: number | null;
  cuentaId: number;
  comprobanteNro?: string | null;
}

export interface ModalRegistrarIngresoProps {
  abierto: boolean;
  onCerrar: () => void;
  onIngresoRegistrado: (mensaje: string) => void;
  ingresoAEditar?: IngresoAEditarItem | null;
  cuentaIdInicial?: number | null;
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

export const ModalRegistrarIngreso: React.FC<ModalRegistrarIngresoProps> = ({
  abierto,
  onCerrar,
  onIngresoRegistrado,
  ingresoAEditar,
  cuentaIdInicial,
}) => {
  const esModoEdicion = Boolean(ingresoAEditar);

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
        api.get('/tesoreria/rubros?tipo=INGRESO'),
        api.get('/tesoreria/cuentas'),
      ]);
      const rubrosList = Array.isArray(resRubros.data) ? resRubros.data : [];
      const cuentasList = Array.isArray(resCuentas.data) ? resCuentas.data : [];

      setRubros(rubrosList);
      setCuentas(cuentasList);

      if (!ingresoAEditar) {
        if (rubrosList.length > 0 && !rubroId) {
          setRubroId(rubrosList[0].id);
        }
        if (cuentaIdInicial && cuentasList.some((c) => c.id === cuentaIdInicial)) {
          setCuentaId(cuentaIdInicial);
        } else if (cuentasList.length > 0 && !cuentaId) {
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
      if (ingresoAEditar) {
        setFecha(fechaAFormatoDatetimeLocal(ingresoAEditar.fecha));
        setMonto(String(ingresoAEditar.montoIngreso));

        // Limpiar descripción quitando el prefijo "Ingreso: ", comprobante y rubro
        let descLimpia = ingresoAEditar.conceptoTexto || '';
        let compExtraido = ingresoAEditar.comprobanteNro || '';

        const matchComp = descLimpia.match(/\(Comp\.\s*#?([^)]+)\)/i);
        if (matchComp) {
          if (!compExtraido) compExtraido = matchComp[1].trim();
          descLimpia = descLimpia.replace(/\(Comp\.\s*#?[^)]+\)/i, '').trim();
        }

        if (descLimpia.startsWith('Ingreso: ')) {
          descLimpia = descLimpia.replace(/^Ingreso:\s*/, '');
          const partes = descLimpia.split(' - ');
          descLimpia = partes[0] || descLimpia;
        }
        setDescripcion(descLimpia.trim());
        setRubroId(ingresoAEditar.rubroId || '');
        setCuentaId(ingresoAEditar.cuentaId);
        setComprobanteNro(compExtraido);
      } else {
        setFecha(ahoraLocalDatetime());
        setMonto('');
        setDescripcion('');
        setComprobanteNro('');
        if (cuentaIdInicial) setCuentaId(cuentaIdInicial);
      }
      setError(null);
      cargarCuentasYRubros();
    }
  }, [abierto, ingresoAEditar, cuentaIdInicial]);

  if (!abierto) return null;

  const montoNum = Number(monto) || 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!monto || montoNum <= 0) {
      setError('El monto debe ser mayor a 0');
      return;
    }
    if (!descripcion.trim()) {
      setError('La descripción del ingreso es obligatoria');
      return;
    }
    if (!rubroId) {
      setError('Debe seleccionar un rubro de ingreso');
      return;
    }
    if (!cuentaId) {
      setError('Debe seleccionar a qué cuenta entra el dinero (Caja o Banco)');
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

      if (esModoEdicion && ingresoAEditar) {
        await api.patch(`/tesoreria/ingresos/${ingresoAEditar.id}`, payload);
        onIngresoRegistrado(`Ingreso de ${formatearMoneda(montoNum)} actualizado correctamente`);
      } else {
        await api.post('/tesoreria/ingresos', payload);
        onIngresoRegistrado(`Ingreso de ${formatearMoneda(montoNum)} registrado correctamente`);
      }

      onCerrar();
    } catch (err) {
      setError(traducirErrorAmigable(err, esModoEdicion ? 'No se pudo actualizar el ingreso.' : 'No se pudo registrar el ingreso.'));
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
          className="bg-paper border border-rule w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
          {...contentProps}
        >
          <div className="px-5 py-4 border-b border-rule flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <ArrowDownRight className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-black text-ink">
                  {esModoEdicion ? 'Modificar Ingreso Manual' : 'Registrar Ingreso Manual'}
                </h3>
                <p className="text-[11px] text-ink-muted">
                  {esModoEdicion
                    ? 'Actualizará los datos del ingreso y el saldo de la cuenta.'
                    : 'Acreditará saldo inmediatamente en la cuenta seleccionada.'}
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
                  Monto ($) *
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
                  Fecha y Hora del Ingreso *
                </label>
                <Input
                  type="datetime-local"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Cuenta de destino (Caja o Banco) */}
            <div>
              <label className="text-xs font-bold text-ink block mb-1">
                Cuenta de Ingreso (¿Dónde entra la plata?) *
              </label>
              <select
                value={cuentaId}
                onChange={(e) => setCuentaId(Number(e.target.value) || '')}
                className="w-full h-10 px-3 rounded-xl bg-paper-2 border border-rule text-xs font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-brand/30"
                required
              >
                {cuentas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre} ({c.tipo === 'CAJA_EFECTIVO' ? 'Efectivo' : 'Banco'}) — Saldo actual: {formatearMoneda(Number(c.saldoActual ?? c.saldoActualConsolidado ?? 0))}
                  </option>
                ))}
              </select>
            </div>

            {/* Rubro de Ingreso con botón para crear y editar */}
            <div>
              <div className="flex flex-wrap items-center justify-between gap-1 mb-1">
                <label className="text-xs font-bold text-ink">
                  Rubro / Categoría de Ingreso *
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

              {rubros.length === 0 && !cargandoDatos ? (
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-[11px] text-amber-800 dark:text-amber-300">
                  No hay rubros de ingreso creados. Creá uno con el botón de arriba (ej. "Donaciones", "Subsidios", "Venta de garage").
                </div>
              ) : (
                <select
                  value={rubroId}
                  onChange={(e) => setRubroId(Number(e.target.value) || '')}
                  className="w-full h-10 px-3 rounded-xl bg-paper-2 border border-rule text-xs font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-brand/30"
                  required
                >
                  <option value="" disabled>
                    Seleccionar rubro de ingreso...
                  </option>
                  {rubros.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nombre}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Descripción */}
            <div>
              <label className="text-xs font-bold text-ink block mb-1">
                Descripción / Detalle *
              </label>
              <Input
                type="text"
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Ej. Donación de familia Martínez, Subsidio municipal, Venta benéfica..."
                maxLength={300}
                required
              />
            </div>

            {/* Comprobante / Recibo */}
            <div>
              <label className="text-xs font-bold text-ink block mb-1">
                N° de Recibo / Comprobante (Opcional)
              </label>
              <Input
                type="text"
                value={comprobanteNro}
                onChange={(e) => setComprobanteNro(e.target.value)}
                placeholder="Ej. REC-0045, TRANSF-8891..."
                maxLength={100}
              />
            </div>

            <div className="pt-3 border-t border-rule flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={onCerrar}
                disabled={guardando}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={guardando || rubros.length === 0}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {guardando
                  ? 'Guardando...'
                  : esModoEdicion
                  ? 'Guardar Cambios'
                  : 'Registrar Ingreso'}
              </Button>
            </div>
          </form>
        </div>
      </div>

      <ModalCrearRubro
        abierto={modalNuevoRubroAbierto}
        tipoDefault="INGRESO"
        rubroAEditar={rubroAEditar}
        onCerrar={() => {
          setModalNuevoRubroAbierto(false);
          setRubroAEditar(null);
        }}
        onRubroCreado={(nuevoRubro) => {
          cargarCuentasYRubros();
          setRubroId(nuevoRubro.id);
          setModalNuevoRubroAbierto(false);
          setRubroAEditar(null);
        }}
        onRubroEliminado={(rubroEliminado) => {
          if (rubroId === rubroEliminado.id) {
            setRubroId('');
          }
          cargarCuentasYRubros();
          setModalNuevoRubroAbierto(false);
          setRubroAEditar(null);
        }}
      />
    </>
  );
};
