import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import {
  X,
  PlusCircle,
  DollarSign,
  Calendar,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';

interface Props {
  abierto: boolean;
  miembro: {
    id: number;
    nombre: string;
    apellido: string;
    dni: string;
  };
  onCerrar: () => void;
  onGenerado: (mensaje: string) => void;
}

export const ModalGenerarDeudaManual: React.FC<Props> = ({
  abierto,
  miembro,
  onCerrar,
  onGenerado,
}) => {
  const anioActual = new Date().getFullYear();

  const [nombreConcepto, setNombreConcepto] = useState('');
  const [tipo, setTipo] = useState<'OTRO' | 'CAMPAMENTO' | 'CUOTA_MENSUAL' | 'INSCRIPCION' | 'MATERIALES' | 'EVENTO'>('OTRO');
  const [monto, setMonto] = useState<number | ''>('');
  const [montoDescuento, setMontoDescuento] = useState<number | ''>('');
  const [fechaVencimiento, setFechaVencimiento] = useState('');
  const [observaciones, setObservaciones] = useState('');

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (abierto) {
      setNombreConcepto('');
      setTipo('OTRO');
      setMonto('');
      setMontoDescuento('');
      setFechaVencimiento('');
      setObservaciones('');
      setError(null);
    }
  }, [abierto]);

  if (!abierto) return null;

  const montoNum = monto === '' ? 0 : Number(monto);
  const descuentoNum = montoDescuento === '' ? 0 : Number(montoDescuento);
  const montoFinal = Math.max(0, montoNum - descuentoNum);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!nombreConcepto.trim()) {
      setError('El concepto o motivo de la deuda es requerido');
      return;
    }

    if (monto === '' || Number(monto) <= 0) {
      setError('El monto de la deuda debe ser mayor a 0');
      return;
    }

    if (descuentoNum > montoNum) {
      setError('El descuento no puede superar el monto de la deuda');
      return;
    }

    setGuardando(true);
    try {
      await api.post('/tesoreria/cargos/individual', {
        usuarioId: miembro.id,
        nombreConcepto: nombreConcepto.trim(),
        tipo,
        cicloAnio: anioActual,
        monto: montoNum,
        montoDescuento: descuentoNum,
        fechaVencimiento: fechaVencimiento ? fechaVencimiento : null,
        observaciones: observaciones.trim() || undefined,
      });

      onGenerado(`Deuda de "${nombreConcepto.trim()}" por $${montoFinal.toFixed(2)} generada exitosamente.`);
      onCerrar();
    } catch (err: any) {
      console.error('Error al generar deuda individual', err);
      setError(err.response?.data?.message || 'Error al generar la deuda individual');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="bg-surface rounded-3xl border border-rule shadow-2xl w-full max-w-lg overflow-hidden motion-safe:animate-in motion-safe:fade-in motion-reduce:animate-none">
        {/* Header */}
        <div className="p-5 border-b border-rule flex items-center justify-between shrink-0 bg-paper-2">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
              <PlusCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-ink text-base">
                Generar Nueva Deuda Individual
              </h3>
              <p className="text-xs text-ink-muted">
                Para: <strong>{miembro.nombre} {miembro.apellido}</strong> (DNI {miembro.dni})
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
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs font-semibold">
              {error}
            </div>
          )}

          {/* Motivo y Tipo */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-ink-2 mb-1">
                Motivo / Nombre del Concepto *
              </label>
              <input
                type="text"
                required
                value={nombreConcepto}
                onChange={(e) => setNombreConcepto(e.target.value)}
                placeholder="Ej. Pañuelo y Camisa Scout, Campamento Verano, Ajuste..."
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
                className="w-full rounded-xl border border-rule bg-surface px-3 py-2 text-xs font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
              >
                <option value="CAMPAMENTO">Campamento</option>
                <option value="CUOTA_MENSUAL">Cuota Mensual</option>
                <option value="INSCRIPCION">Inscripción / Matrícula</option>
                <option value="MATERIALES">Materiales / Indumentaria</option>
                <option value="EVENTO">Evento</option>
                <option value="OTRO">Otro / Extraordinario</option>
              </select>
            </div>
          </div>

          {/* Montos */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-ink-2 mb-1">
                Monto Original ($) *
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-xs font-bold text-ink-muted pointer-events-none">
                  $
                </span>
                <input
                  type="number"
                  step="0.01"
                  required
                  min={1}
                  value={monto}
                  onChange={(e) => setMonto(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="5000.00"
                  className="w-full rounded-xl border border-rule bg-surface pl-7 pr-3 py-2 text-xs font-bold text-ink focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-ink-2 mb-1">
                Descuento ($ opcional)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-xs font-bold text-ink-muted pointer-events-none">
                  $
                </span>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  value={montoDescuento}
                  onChange={(e) => setMontoDescuento(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="0.00"
                  className="w-full rounded-xl border border-rule bg-surface pl-7 pr-3 py-2 text-xs font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                />
              </div>
            </div>
          </div>

          {/* Resumen Monto Final */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-paper-2 border border-rule text-xs">
            <span className="font-bold text-ink-2">Deuda final a cobrar:</span>
            <span className="text-sm font-extrabold text-blue-600 dark:text-blue-400">
              ${montoFinal.toFixed(2)}
            </span>
          </div>

          {/* Vencimiento y Observaciones */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-ink-2 mb-1">
                Fecha de Vencimiento (opcional)
              </label>
              <input
                type="date"
                value={fechaVencimiento}
                onChange={(e) => setFechaVencimiento(e.target.value)}
                className="w-full rounded-xl border border-rule bg-surface px-3 py-1.5 text-xs text-ink"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-ink-2 mb-1">
                Observaciones (opcional)
              </label>
              <input
                type="text"
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                placeholder="Detalle o nota interna..."
                className="w-full rounded-xl border border-rule bg-surface px-3 py-1.5 text-xs text-ink"
              />
            </div>
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
              disabled={guardando || montoFinal <= 0}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition shadow-xs cursor-pointer disabled:opacity-50 flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{guardando ? 'Generando...' : `Generar Deuda de $${montoFinal.toFixed(2)}`}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
