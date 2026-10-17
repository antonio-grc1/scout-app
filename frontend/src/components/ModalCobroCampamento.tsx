import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { SelectorDestinatarios } from './SelectorDestinatarios';
import {
  X,
  Tent,
  Calendar,
  DollarSign,
  CheckCircle2,
  Users,
  Sparkles,
} from 'lucide-react';

interface Props {
  abierto: boolean;
  unidades: Array<{ id: number; nombre: string; tipo?: string }>;
  onCerrar: () => void;
  onGenerado: (mensaje: string) => void;
}

export const ModalCobroCampamento: React.FC<Props> = ({
  abierto,
  unidades,
  onCerrar,
  onGenerado,
}) => {
  const anioActual = new Date().getFullYear();

  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState<'CAMPAMENTO' | 'EVENTO' | 'INSCRIPCION' | 'MATERIALES' | 'OTRO'>('CAMPAMENTO');
  const [montoBase, setMontoBase] = useState<number | ''>('');
  const [cicloAnio, setCicloAnio] = useState(anioActual);
  const [fechaVencimiento, setFechaVencimiento] = useState('');
  const [destinatarioTipo, setDestinatarioTipo] = useState<'TODOS' | 'PROTAGONISTAS' | 'EDUCADORES'>('PROTAGONISTAS');
  const [unidadId, setUnidadId] = useState<number | null>(null);
  const [permiteDescuentoHermanos, setPermiteDescuentoHermanos] = useState(true);
  const [usarPorcentajePersonalizado, setUsarPorcentajePersonalizado] = useState(false);
  const [porcentajeDescuentoHermanos, setPorcentajeDescuentoHermanos] = useState<number | ''>('');
  const [excepcionesIds, setExcepcionesIds] = useState<number[]>([]);
  const [generarCargosInmediatos, setGenerarCargosInmediatos] = useState(true);

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (abierto) {
      setNombre('Campamento Anual ' + anioActual);
      setTipo('CAMPAMENTO');
      setMontoBase('');
      setCicloAnio(anioActual);
      setFechaVencimiento('');
      setDestinatarioTipo('PROTAGONISTAS');
      setUnidadId(null);
      setPermiteDescuentoHermanos(true);
      setUsarPorcentajePersonalizado(false);
      setPorcentajeDescuentoHermanos('');
      setExcepcionesIds([]);
      setGenerarCargosInmediatos(true);
      setError(null);
    }
  }, [abierto, anioActual]);

  if (!abierto) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!nombre.trim()) {
      setError('El nombre del evento / campamento es obligatorio');
      return;
    }

    if (montoBase === '' || Number(montoBase) <= 0) {
      setError('Debe indicar un monto válido');
      return;
    }

    setGuardando(true);
    try {
      // 1. Crear el concepto
      const conceptoPayload = {
        nombre: nombre.trim(),
        tipo,
        montoBase: Number(montoBase),
        cicloAnio: Number(cicloAnio),
        fechaVencimiento: fechaVencimiento ? fechaVencimiento : null,
        destinatarioTipo,
        unidadId: unidadId ?? null,
        permiteDescuentoHermanos,
        porcentajeDescuentoHermanos:
          permiteDescuentoHermanos && usarPorcentajePersonalizado && porcentajeDescuentoHermanos !== ''
            ? Number(porcentajeDescuentoHermanos)
            : null,
        excepcionesIds,
      };

      const resConcepto = await api.post('/tesoreria/conceptos', conceptoPayload);
      const conceptoCreado = resConcepto.data;

      // 2. Si se solicitó generar cargos inmediatamente, llamar a generar cargos
      if (generarCargosInmediatos && conceptoCreado?.id) {
        const resCargos = await api.post('/tesoreria/cargos/generar', {
          conceptoId: conceptoCreado.id,
          unidadId: unidadId ?? undefined,
          excluirUsuarioIds: excepcionesIds,
          aplicarDescuentoFamiliar: permiteDescuentoHermanos,
        });

        const total = resCargos.data?.totalGenerados ?? 0;
        onGenerado(`Cobro de "${nombre}" creado exitosamente y se generaron ${total} cargos.`);
      } else {
        onGenerado(`Concepto de "${nombre}" creado exitosamente.`);
      }

      onCerrar();
    } catch (err: any) {
      console.error('Error al generar cobro extraordinario', err);
      setError(err.response?.data?.message || 'Error al generar el cobro de campamento / evento');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0 bg-slate-50/50 dark:bg-slate-800/30">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
              <Tent className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base">
                Generar Cobro Extraordinario / Campamento
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Configure un cobro especial de evento o campamento y defina a quiénes se les cobra
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

          {/* Nombre y Tipo */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Nombre del Cobro / Campamento *
              </label>
              <input
                type="text"
                required
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej. Campamento de Verano 2026, Acantonamiento..."
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Tipo de Concepto
              </label>
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value as any)}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
              >
                <option value="CAMPAMENTO">Campamento</option>
                <option value="EVENTO">Evento Especial</option>
                <option value="INSCRIPCION">Inscripción</option>
                <option value="MATERIALES">Materiales</option>
                <option value="OTRO">Otro</option>
              </select>
            </div>
          </div>

          {/* Monto, Año y Fecha de Vencimiento */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Monto Base ($) *
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-2 text-xs font-bold text-slate-400 pointer-events-none">
                  $
                </span>
                <input
                  type="number"
                  step="0.01"
                  required
                  min={1}
                  value={montoBase}
                  onChange={(e) => setMontoBase(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="25000.00"
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 pl-8 pr-3.5 py-2 text-xs font-bold text-blue-600 dark:text-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Ciclo / Año
              </label>
              <input
                type="number"
                min={2020}
                max={2100}
                value={cicloAnio}
                onChange={(e) => setCicloAnio(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Fecha de Vencimiento (opcional)
              </label>
              <input
                type="date"
                value={fechaVencimiento}
                onChange={(e) => setFechaVencimiento(e.target.value)}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
              />
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

          {/* REGLA DE DESCUENTO FAMILIAR */}
          <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={permiteDescuentoHermanos}
                onChange={(e) => setPermiteDescuentoHermanos(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
              />
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Permitir descuento por hermanos / grupo familiar
              </span>
            </label>

            {permiteDescuentoHermanos && (
              <div className="pl-6 space-y-2 pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-600 dark:text-slate-400">
                  <input
                    type="checkbox"
                    checked={usarPorcentajePersonalizado}
                    onChange={(e) => setUsarPorcentajePersonalizado(e.target.checked)}
                    className="w-3.5 h-3.5 rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span>Fijar porcentaje de descuento específico para este campamento</span>
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
                        placeholder="Ej. 20"
                        className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-900 dark:text-slate-100"
                      />
                      <span className="absolute right-3 top-1.5 text-xs font-bold text-slate-400">%</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* CHECKBOX GENERACIÓN INMEDIATA */}
          <div className="p-3.5 rounded-2xl bg-blue-50/60 dark:bg-blue-950/40 border border-blue-200/80 dark:border-blue-900/60">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={generarCargosInmediatos}
                onChange={(e) => setGenerarCargosInmediatos(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
              />
              <div>
                <span className="text-xs font-bold text-blue-900 dark:text-blue-200 block">
                  Generar los cargos automáticamente ahora a todos los destinatarios
                </span>
                <span className="text-[11px] text-blue-700/80 dark:text-blue-300 block">
                  Creará la deuda individual en el estado de cuenta de cada miembro seleccionado (menos los exentos).
                </span>
              </div>
            </label>
          </div>

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
              disabled={guardando}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition shadow-xs cursor-pointer disabled:opacity-50 flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{guardando ? 'Generando...' : 'Crear Cobro de Campamento'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
