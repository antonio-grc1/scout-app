import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { SelectorDestinatarios } from './SelectorDestinatarios';
import {
  X,
  Calendar,
  DollarSign,
  Users,
  CheckCircle2,
  Clock,
  Sparkles,
  Layers,
} from 'lucide-react';

export interface PlanCuotaMensualData {
  id?: number;
  nombre: string;
  cicloAnio: number;
  montoMensual: number;
  diaVencimiento: number;
  mesesHabilitados: number[];
  destinatarioTipo: 'TODOS' | 'PROTAGONISTAS' | 'EDUCADORES';
  unidadId: number | null;
  permiteDescuentoHermanos?: boolean;
  porcentajeDescuentoHermanos?: number | null;
  excepcionesIds?: number[];
}

interface Props {
  abierto: boolean;
  planAEditar?: any | null;
  unidades: Array<{ id: number; nombre: string; tipo?: string }>;
  onCerrar: () => void;
  onGuardado: () => void;
}

const MESES = [
  { num: 1, nombre: 'Ene' },
  { num: 2, nombre: 'Feb' },
  { num: 3, nombre: 'Mar' },
  { num: 4, nombre: 'Abr' },
  { num: 5, nombre: 'May' },
  { num: 6, nombre: 'Jun' },
  { num: 7, nombre: 'Jul' },
  { num: 8, nombre: 'Ago' },
  { num: 9, nombre: 'Sep' },
  { num: 10, nombre: 'Oct' },
  { num: 11, nombre: 'Nov' },
  { num: 12, nombre: 'Dic' },
];

export const ModalPlanCuotaMensual: React.FC<Props> = ({
  abierto,
  planAEditar,
  unidades,
  onCerrar,
  onGuardado,
}) => {
  const anioActual = new Date().getFullYear();

  const [nombre, setNombre] = useState('');
  const [cicloAnio, setCicloAnio] = useState(anioActual);
  const [montoMensual, setMontoMensual] = useState<number | ''>('');
  const [diaVencimiento, setDiaVencimiento] = useState(10);
  const [mesesHabilitados, setMesesHabilitados] = useState<number[]>([3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  const [destinatarioTipo, setDestinatarioTipo] = useState<'TODOS' | 'PROTAGONISTAS' | 'EDUCADORES'>('PROTAGONISTAS');
  const [unidadId, setUnidadId] = useState<number | null>(null);
  const [permiteDescuentoHermanos, setPermiteDescuentoHermanos] = useState(true);
  const [usarPorcentajePersonalizado, setUsarPorcentajePersonalizado] = useState(false);
  const [porcentajeDescuentoHermanos, setPorcentajeDescuentoHermanos] = useState<number | ''>('');
  const [excepcionesIds, setExcepcionesIds] = useState<number[]>([]);

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (planAEditar) {
      setNombre(planAEditar.nombre || '');
      setCicloAnio(planAEditar.cicloAnio || anioActual);
      setMontoMensual(planAEditar.montoMensual ? Number(planAEditar.montoMensual) : '');
      setDiaVencimiento(planAEditar.diaVencimiento || 10);
      const meses = Array.isArray(planAEditar.mesesHabilitadosJson)
        ? planAEditar.mesesHabilitadosJson
        : [3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
      setMesesHabilitados(meses);
      setDestinatarioTipo(planAEditar.destinatarioTipo || 'PROTAGONISTAS');
      setUnidadId(planAEditar.unidadId ?? null);
      setPermiteDescuentoHermanos(planAEditar.permiteDescuentoHermanos ?? true);
      if (planAEditar.porcentajeDescuentoHermanos !== null && planAEditar.porcentajeDescuentoHermanos !== undefined) {
        setUsarPorcentajePersonalizado(true);
        setPorcentajeDescuentoHermanos(Number(planAEditar.porcentajeDescuentoHermanos));
      } else {
        setUsarPorcentajePersonalizado(false);
        setPorcentajeDescuentoHermanos('');
      }
      setExcepcionesIds(Array.isArray(planAEditar.excepcionesJson) ? planAEditar.excepcionesJson : []);
    } else {
      setNombre('Cuota Social ' + anioActual);
      setCicloAnio(anioActual);
      setMontoMensual('');
      setDiaVencimiento(10);
      setMesesHabilitados([3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
      setDestinatarioTipo('PROTAGONISTAS');
      setUnidadId(null);
      setPermiteDescuentoHermanos(true);
      setUsarPorcentajePersonalizado(false);
      setPorcentajeDescuentoHermanos('');
      setExcepcionesIds([]);
    }
    setError(null);
  }, [planAEditar, abierto, anioActual]);

  if (!abierto) return null;

  const toggleMes = (num: number) => {
    if (mesesHabilitados.includes(num)) {
      setMesesHabilitados(mesesHabilitados.filter((m) => m !== num));
    } else {
      setMesesHabilitados([...mesesHabilitados, num].sort((a, b) => a - b));
    }
  };

  const seleccionarTodosLosMeses = () => {
    setMesesHabilitados([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  };

  const seleccionarCicloEscolar = () => {
    setMesesHabilitados([3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  };

  const desmarcarTodosLosMeses = () => {
    setMesesHabilitados([]);
  };

  const handleGuardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!nombre.trim()) {
      setError('El nombre del plan de cuota es requerido');
      return;
    }

    if (montoMensual === '' || Number(montoMensual) <= 0) {
      setError('Debe especificar un monto mensual válido');
      return;
    }

    setGuardando(true);
    try {
      const payload: any = {
        nombre: nombre.trim(),
        cicloAnio: Number(cicloAnio),
        montoMensual: Number(montoMensual),
        diaVencimiento: Number(diaVencimiento),
        mesesHabilitados,
        destinatarioTipo,
        unidadId: unidadId ?? null,
        permiteDescuentoHermanos,
        porcentajeDescuentoHermanos:
          permiteDescuentoHermanos && usarPorcentajePersonalizado && porcentajeDescuentoHermanos !== ''
            ? Number(porcentajeDescuentoHermanos)
            : null,
        excepcionesIds,
      };

      if (planAEditar) {
        await api.patch(`/tesoreria/planes-mensuales/${planAEditar.id}`, payload);
      } else {
        await api.post('/tesoreria/planes-mensuales', payload);
      }

      onGuardado();
      onCerrar();
    } catch (err: any) {
      console.error('Error al guardar plan de cuota mensual', err);
      setError(err.response?.data?.message || 'Error al guardar el plan de cuota mensual');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 motion-safe:animate-in motion-safe:fade-in motion-reduce:animate-none">
      <div className="bg-surface rounded-3xl border border-rule shadow-md w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-rule flex items-center justify-between shrink-0 bg-paper-2">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-brand/10 text-brand">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-ink text-base">
                {planAEditar ? 'Editar Cuadro de Cuota Mensual' : 'Nuevo Cuadro de Cuota Mensual'}
              </h3>
              <p className="text-xs text-ink-muted">
                Configure la cuota progresiva y los casilleros de meses del año
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

        {/* Formulario con scroll */}
        <form onSubmit={handleGuardar} className="p-6 overflow-y-auto space-y-5 flex-1">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs font-semibold">
              {error}
            </div>
          )}

          {/* Nombre y Ciclo */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-ink-2 mb-1">
                Nombre del Cuadro / Plan *
              </label>
              <input
                type="text"
                required
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej. Cuota Social 2026, Cuota Rovers 2026..."
                className="w-full rounded-xl border border-rule bg-surface px-3.5 py-2 text-xs font-medium text-ink focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-ink-2 mb-1">
                Ciclo / Año *
              </label>
              <input
                type="number"
                required
                min={2020}
                max={2100}
                value={cicloAnio}
                onChange={(e) => setCicloAnio(Number(e.target.value))}
                className="w-full rounded-xl border border-rule bg-surface px-3.5 py-2 text-xs font-medium text-ink focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none transition-colors"
              />
            </div>
          </div>

          {/* Monto Mensual y Día de Vencimiento */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-ink-2 mb-1">
                Monto Mensual por Miembro ($) *
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-2 text-xs font-bold text-ink-muted pointer-events-none">
                  $
                </span>
                <input
                  type="number"
                  step="0.01"
                  required
                  min={1}
                  value={montoMensual}
                  onChange={(e) => setMontoMensual(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="5000.00"
                  className="w-full rounded-xl border border-rule bg-surface pl-8 pr-3.5 py-2 text-xs font-bold text-ink focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-ink-2 mb-1">
                Día de Vencimiento de Cada Mes
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-2 text-xs font-bold text-ink-muted pointer-events-none">
                  Día
                </span>
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={diaVencimiento}
                  onChange={(e) => setDiaVencimiento(Number(e.target.value))}
                  className="w-full rounded-xl border border-rule bg-surface pl-11 pr-3.5 py-2 text-xs font-medium text-ink focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none transition-colors"
                />
              </div>
            </div>
          </div>

          {/* CASILLEROS DE MESES DEL AÑO */}
          <div className="space-y-3 p-4 rounded-2xl border border-rule bg-paper-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-rule pb-2.5">
              <div>
                <label className="text-xs font-bold text-ink block">
                  Casilleros de Meses del Año ({mesesHabilitados.length} seleccionados)
                </label>
                <p className="text-[11px] text-ink-muted">
                  Cada mes habilitado genera y acumula la deuda mensual para los destinatarios
                </p>
              </div>

              {/* Acciones Rápidas */}
              <div className="flex items-center gap-1.5 text-[11px]">
                <button
                  type="button"
                  onClick={seleccionarCicloEscolar}
                  className="px-2.5 py-1 rounded-lg bg-brand/10 text-ink-2 border border-brand/30 font-semibold hover:bg-brand/15 transition-colors cursor-pointer"
                >
                  Mar-Dic
                </button>
                <button
                  type="button"
                  onClick={seleccionarTodosLosMeses}
                  className="px-2.5 py-1 rounded-lg bg-paper-3 text-ink-2 border border-rule font-semibold hover:bg-paper-3 transition-colors cursor-pointer"
                >
                  Ene-Dic
                </button>
                <button
                  type="button"
                  onClick={desmarcarTodosLosMeses}
                  className="px-2 py-1 rounded-lg text-ink-muted hover:bg-paper-3 transition cursor-pointer"
                >
                  Ninguno
                </button>
              </div>
            </div>

            {/* Grilla 12 meses */}
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
              {MESES.map((m) => {
                const activo = mesesHabilitados.includes(m.num);
                return (
                  <button
                    key={m.num}
                    type="button"
                    onClick={() => toggleMes(m.num)}
                    className={`py-2 px-1.5 rounded-xl text-center border transition flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
                      activo
                        ? 'bg-brand text-brand-contrast border-brand font-bold shadow-xs ring-2 ring-brand/20'
                        : 'bg-surface text-ink-muted border-rule hover:border-rule'
                    }`}
                  >
                    <span className="text-xs font-semibold">{m.nombre}</span>
                    <span className="text-[9px] opacity-80">Mes {m.num}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* SELECTOR BIDIMENSIONAL DE DESTINATARIOS */}
          <SelectorDestinatarios
            destinatarioTipo={destinatarioTipo}
            onChangeDestinatarioTipo={setDestinatarioTipo}
            unidadId={unidadId}
            onChangeUnidadId={setUnidadId}
            excepcionesIds={excepcionesIds}
            onChangeExcepcionesIds={setExcepcionesIds}
            unidades={unidades}
          />

          {/* DESCUENTO FAMILIAR POR HERMANOS */}
          <div className="p-4 rounded-2xl border border-rule bg-paper-2 space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={permiteDescuentoHermanos}
                onChange={(e) => setPermiteDescuentoHermanos(e.target.checked)}
                className="w-4 h-4 rounded text-brand focus:ring-brand/20"
              />
              <span className="text-xs font-bold text-ink">
                Permitir descuento por grupo familiar / hermanos
              </span>
            </label>

            {permiteDescuentoHermanos && (
              <div className="pl-6 space-y-2 pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-ink-muted">
                  <input
                    type="checkbox"
                    checked={usarPorcentajePersonalizado}
                    onChange={(e) => setUsarPorcentajePersonalizado(e.target.checked)}
                    className="w-3.5 h-3.5 rounded text-brand focus:ring-brand/20"
                  />
                  <span>Fijar porcentaje de descuento específico para este cuadro</span>
                </label>

                {usarPorcentajePersonalizado && (
                  <div className="w-48 pt-1">
                    <div className="relative">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={porcentajeDescuentoHermanos}
                        onChange={(e) =>
                          setPorcentajeDescuentoHermanos(e.target.value === '' ? '' : Number(e.target.value))
                        }
                        placeholder="Ej. 15"
                        className="w-full rounded-xl border border-rule bg-surface px-3 py-1.5 text-xs font-semibold text-ink"
                      />
                      <span className="absolute right-3 top-1.5 text-xs font-bold text-ink-muted">%</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer del Form */}
          <div className="pt-3 border-t border-rule flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onCerrar}
              className="px-4 py-2 rounded-xl border border-rule text-ink-2 font-semibold text-xs hover:bg-paper-2 transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="px-5 py-2 rounded-xl bg-brand hover:opacity-90 active:opacity-100 text-brand-contrast font-bold text-xs transition-colors shadow-xs cursor-pointer disabled:opacity-50 flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{guardando ? 'Guardando...' : planAEditar ? 'Guardar Cambios' : 'Crear Cuadro de Cuota'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
