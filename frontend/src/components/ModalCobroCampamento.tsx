import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { SelectorDestinatarios } from './SelectorDestinatarios';
import {
  X,
  Tent,
  CheckCircle2,
} from 'lucide-react';
import { traducirErrorAmigable } from '../lib/formatters';

interface Props {
  abierto: boolean;
  conceptoAEditar?: any | null;
  unidades: Array<{ id: number; nombre: string; tipo?: string }>;
  onCerrar: () => void;
  onGenerado: (mensaje: string) => void;
}

export const ModalCobroCampamento: React.FC<Props> = ({
  abierto,
  conceptoAEditar = null,
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

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (abierto) {
      if (conceptoAEditar) {
        setNombre(conceptoAEditar.nombre || '');
        setTipo(conceptoAEditar.tipo || 'CAMPAMENTO');
        setMontoBase(conceptoAEditar.montoBase ? Number(conceptoAEditar.montoBase) : '');
        setCicloAnio(conceptoAEditar.cicloAnio || anioActual);
        setFechaVencimiento(
          conceptoAEditar.fechaVencimiento
            ? String(conceptoAEditar.fechaVencimiento).split('T')[0]
            : '',
        );
        const dest = conceptoAEditar.destinatarioTipo;
        setDestinatarioTipo(
          dest === 'TODOS' || dest === 'EDUCADORES' ? dest : 'PROTAGONISTAS',
        );
        setUnidadId(conceptoAEditar.unidadId ?? null);
        setPermiteDescuentoHermanos(conceptoAEditar.permiteDescuentoHermanos ?? true);
        if (
          conceptoAEditar.porcentajeDescuentoHermanos !== null &&
          conceptoAEditar.porcentajeDescuentoHermanos !== undefined
        ) {
          setUsarPorcentajePersonalizado(true);
          setPorcentajeDescuentoHermanos(Number(conceptoAEditar.porcentajeDescuentoHermanos));
        } else {
          setUsarPorcentajePersonalizado(false);
          setPorcentajeDescuentoHermanos('');
        }
        setExcepcionesIds(
          Array.isArray(conceptoAEditar.excepcionesJson) ? conceptoAEditar.excepcionesJson : [],
        );
      } else {
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
      }
      setError(null);
    }
  }, [abierto, conceptoAEditar, anioActual]);

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
      const payload = {
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
        sincronizarCargos: true,
      };

      if (conceptoAEditar?.id) {
        await api.patch(`/tesoreria/conceptos/${conceptoAEditar.id}`, payload);
        onGenerado(`Cobro "${nombre.trim()}" actualizado y cargos sincronizados.`);
      } else {
        await api.post('/tesoreria/conceptos', payload);
        onGenerado(`Cobro "${nombre.trim()}" creado y asignado automáticamente.`);
      }

      onCerrar();
    } catch (err: any) {
      setError(traducirErrorAmigable(err, 'No se pudo guardar el cobro de campamento / evento.'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="bg-surface rounded-3xl border border-rule shadow-md w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden motion-safe:animate-in motion-safe:fade-in motion-reduce:animate-none">
        {/* Header */}
        <div className="p-5 border-b border-rule flex items-center justify-between shrink-0 bg-paper-2">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
              <Tent className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-ink text-base">
                {conceptoAEditar
                  ? 'Editar Campamento / Cobro Especial'
                  : 'Nuevo Campamento / Cobro Especial'}
              </h3>
              <p className="text-xs text-ink-muted">
                Definí el monto, a quiénes aplica y quiénes están becados o exentos
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
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5 flex-1">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs font-semibold">
              {error}
            </div>
          )}

          {/* Nombre y Tipo */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-ink-2 mb-1">
                Nombre del Campamento / Cobro *
              </label>
              <input
                type="text"
                required
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej. Campamento de Verano 2026, Acantonamiento, Pañuelo..."
                className="w-full rounded-xl border border-rule bg-surface px-3.5 py-2 text-xs font-medium text-ink focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-ink-2 mb-1">
                Categoría
              </label>
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value as any)}
                className="w-full rounded-xl border border-rule bg-surface px-3 py-2 text-xs font-medium text-ink focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
              >
                <option value="CAMPAMENTO">Campamento</option>
                <option value="EVENTO">Evento Especial</option>
                <option value="INSCRIPCION">Inscripción / Afiliación</option>
                <option value="MATERIALES">Materiales / Indumentaria</option>
                <option value="OTRO">Otro Cobro</option>
              </select>
            </div>
          </div>

          {/* Monto, Año y Fecha de Vencimiento */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-ink-2 mb-1">
                Monto Base ($) *
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
                  value={montoBase}
                  onChange={(e) => setMontoBase(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="25000.00"
                  className="w-full rounded-xl border border-rule bg-surface pl-8 pr-3.5 py-2 text-xs font-bold text-blue-600 dark:text-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-ink-2 mb-1">
                Ciclo / Año
              </label>
              <input
                type="number"
                min={2020}
                max={2100}
                value={cicloAnio}
                onChange={(e) => setCicloAnio(Number(e.target.value))}
                className="w-full rounded-xl border border-rule bg-surface px-3.5 py-2 text-xs font-medium text-ink focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-ink-2 mb-1">
                Fecha de Vencimiento (opcional)
              </label>
              <input
                type="date"
                value={fechaVencimiento}
                onChange={(e) => setFechaVencimiento(e.target.value)}
                className="w-full rounded-xl border border-rule bg-surface px-3.5 py-2 text-xs font-medium text-ink focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
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
          <div className="p-4 rounded-2xl border border-rule bg-paper-2 space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={permiteDescuentoHermanos}
                onChange={(e) => setPermiteDescuentoHermanos(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
              />
              <span className="text-xs font-bold text-ink">
                Permitir descuento por hermanos / grupo familiar
              </span>
            </label>

            {permiteDescuentoHermanos && (
              <div className="pl-6 space-y-2 pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-ink-muted">
                  <input
                    type="checkbox"
                    checked={usarPorcentajePersonalizado}
                    onChange={(e) => setUsarPorcentajePersonalizado(e.target.checked)}
                    className="w-3.5 h-3.5 rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span>Fijar porcentaje de descuento específico para este cobro</span>
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
                        className="w-full rounded-xl border border-rule bg-surface px-3 py-1.5 text-xs font-semibold text-ink"
                      />
                      <span className="absolute right-3 top-1.5 text-xs font-bold text-ink-muted">%</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Nota informativa */}
          <div className="p-3 rounded-2xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-900/50 text-[11px] text-blue-800 dark:text-blue-300">
            Al guardar, las deudas se asignan y actualizan automáticamente en la cuenta de los miembros seleccionados. Si quitás a alguien que ya había pagado, el dinero pagado pasa automáticamente a su <strong>Saldo a Favor</strong>.
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
              disabled={guardando}
              className="min-h-[42px] px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition shadow-xs cursor-pointer disabled:opacity-50 flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {guardando
                  ? 'Guardando...'
                  : conceptoAEditar
                    ? 'Guardar Cambios'
                    : 'Crear y Asignar Cobro'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
