import React, { useEffect, useState } from 'react';
import {
  X,
  DollarSign,
  Calendar,
  Layers,
  Loader2,
  AlertCircle,
  Tag,
  Users2,
  Percent,
  HelpCircle,
} from 'lucide-react';
import { api } from '../api/client';

export interface ConceptoData {
  id?: number;
  nombre: string;
  tipo?: string;
  montoBase: number | string;
  cicloAnio: number;
  fechaVencimiento?: string | null;
  permiteDescuentoHermanos?: boolean;
  porcentajeDescuentoHermanos?: number | string | null;
  esParaEducadores?: boolean;
  unidadId?: number | null;
  unidad?: { id: number; nombre: string } | null;
  _count?: { cargos: number };
}

export interface ModalConceptoProps {
  abierto: boolean;
  onCerrar: () => void;
  onGuardado: (nombre: string, esEdicion: boolean) => void;
  concepto?: ConceptoData | null;
  unidades: Array<{ id: number; nombre: string }>;
}

export const TIPOS_CONCEPTO = [
  { id: 'CUOTA_MENSUAL', label: 'Cuota Mensual / Social', permiteDescDefault: true },
  { id: 'CAMPAMENTO', label: 'Campamento', permiteDescDefault: false },
  { id: 'INSCRIPCION', label: 'Inscripción / Matrícula Anual', permiteDescDefault: true },
  { id: 'EVENTO', label: 'Evento / Salida', permiteDescDefault: false },
  { id: 'MATERIALES', label: 'Materiales / Uniforme', permiteDescDefault: false },
  { id: 'OTRO', label: 'Otro Concepto', permiteDescDefault: true },
];

export const ModalConcepto: React.FC<ModalConceptoProps> = ({
  abierto,
  onCerrar,
  onGuardado,
  concepto,
  unidades,
}) => {
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState('CUOTA_MENSUAL');
  const [montoBase, setMontoBase] = useState('');
  const [cicloAnio, setCicloAnio] = useState(new Date().getFullYear());
  const [fechaVencimiento, setFechaVencimiento] = useState('');

  // Alcance
  const [alcanceSeleccionado, setAlcanceSeleccionado] = useState<string>(''); // '' = General, 'EDUCADORES' = Solo Educadores, '{id}' = Unidad

  // Descuento por hermanos
  const [permiteDescuentoHermanos, setPermiteDescuentoHermanos] = useState(true);
  const [modoDescuento, setModoDescuento] = useState<'FAMILIA' | 'FIJO'>('FAMILIA');
  const [porcentajeFijo, setPorcentajeFijo] = useState<string>('');

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const esEdicion = Boolean(concepto && concepto.id);

  useEffect(() => {
    if (abierto) {
      setError(null);
      if (concepto) {
        setNombre(concepto.nombre || '');
        setTipo(concepto.tipo || 'CUOTA_MENSUAL');
        setMontoBase(concepto.montoBase !== undefined ? String(concepto.montoBase) : '');
        setCicloAnio(concepto.cicloAnio || new Date().getFullYear());
        setFechaVencimiento(
          concepto.fechaVencimiento
            ? concepto.fechaVencimiento.includes('T')
              ? concepto.fechaVencimiento.split('T')[0]
              : concepto.fechaVencimiento
            : '',
        );

        // Alcance
        if (concepto.esParaEducadores) {
          setAlcanceSeleccionado('EDUCADORES');
        } else if (concepto.unidadId) {
          setAlcanceSeleccionado(String(concepto.unidadId));
        } else {
          setAlcanceSeleccionado('');
        }

        // Descuento por hermanos
        const permite = concepto.permiteDescuentoHermanos !== false;
        setPermiteDescuentoHermanos(permite);
        if (concepto.porcentajeDescuentoHermanos !== null && concepto.porcentajeDescuentoHermanos !== undefined) {
          setModoDescuento('FIJO');
          setPorcentajeFijo(String(concepto.porcentajeDescuentoHermanos));
        } else {
          setModoDescuento('FAMILIA');
          setPorcentajeFijo('');
        }
      } else {
        setNombre('');
        setTipo('CUOTA_MENSUAL');
        setMontoBase('');
        setCicloAnio(new Date().getFullYear());
        setFechaVencimiento('');
        setAlcanceSeleccionado('');
        setPermiteDescuentoHermanos(true);
        setModoDescuento('FAMILIA');
        setPorcentajeFijo('');
      }
    }
  }, [abierto, concepto]);

  if (!abierto) return null;

  const handleTipoChange = (nuevoTipo: string) => {
    setTipo(nuevoTipo);
    // Sugerir configuración de descuento por hermanos según tipo en modo creación
    if (!esEdicion) {
      const config = TIPOS_CONCEPTO.find((t) => t.id === nuevoTipo);
      if (config) {
        setPermiteDescuentoHermanos(config.permiteDescDefault);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const nombreTrim = nombre.trim();
    if (!nombreTrim) {
      setError('Por favor ingresa el nombre del concepto.');
      return;
    }

    const montoNum = parseFloat(montoBase);
    if (isNaN(montoNum) || montoNum <= 0) {
      setError('Por favor ingresa un monto válido mayor a 0.');
      return;
    }

    const anioNum = parseInt(String(cicloAnio), 10);
    if (isNaN(anioNum) || anioNum < 2000 || anioNum > 2100) {
      setError('El ciclo lectivo debe ser un año válido (ej. 2026).');
      return;
    }

    let pctDescuentoFinal: number | null = null;
    if (permiteDescuentoHermanos) {
      if (modoDescuento === 'FIJO') {
        const val = parseFloat(porcentajeFijo);
        if (isNaN(val) || val < 0 || val > 100) {
          setError('El porcentaje fijo de descuento debe ser un valor entre 0 y 100.');
          return;
        }
        pctDescuentoFinal = val;
      } else {
        pctDescuentoFinal = null; // Toma el porcentaje de cada grupo familiar
      }
    }

    // Alcance y destinatarios
    let unidadIdFinal: number | null = null;
    let esParaEducadoresFinal = false;

    if (alcanceSeleccionado === 'EDUCADORES') {
      esParaEducadoresFinal = true;
      unidadIdFinal = null;
    } else if (alcanceSeleccionado) {
      unidadIdFinal = parseInt(alcanceSeleccionado, 10);
      esParaEducadoresFinal = false;
    } else {
      unidadIdFinal = null;
      esParaEducadoresFinal = false;
    }

    setGuardando(true);
    try {
      const payload = {
        nombre: nombreTrim,
        tipo,
        montoBase: montoNum,
        cicloAnio: anioNum,
        fechaVencimiento: fechaVencimiento ? fechaVencimiento : null,
        permiteDescuentoHermanos,
        porcentajeDescuentoHermanos: pctDescuentoFinal,
        esParaEducadores: esParaEducadoresFinal,
        unidadId: unidadIdFinal,
      };

      if (esEdicion && concepto?.id) {
        await api.patch(`/tesoreria/conceptos/${concepto.id}`, payload);
      } else {
        await api.post('/tesoreria/conceptos', payload);
      }

      onGuardado(nombreTrim, esEdicion);
      onCerrar();
    } catch (err: any) {
      const mensaje =
        err.response?.data?.message ||
        (Array.isArray(err.response?.data?.errors)
          ? err.response.data.errors.join(', ')
          : 'Error al guardar el concepto de cuota.');
      setError(mensaje);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
      <div
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden transition-colors my-6"
        role="dialog"
        aria-modal="true"
      >
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/80">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {esEdicion ? 'Editar Concepto de Cuota' : 'Nuevo Concepto de Cuota'}
              </h2>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                {esEdicion
                  ? 'Modifica los valores, tipo, alcance y descuentos por hermanos'
                  : 'Define un concepto de cuota institucional con sus reglas de descuento'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            disabled={guardando}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition p-1.5 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[82vh] overflow-y-auto">
          {error && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Tipo de Concepto *
              </label>
              <div className="relative">
                <Tag className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <select
                  value={tipo}
                  onChange={(e) => handleTipoChange(e.target.value)}
                  className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
                >
                  {TIPOS_CONCEPTO.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Alcance / Destinatarios *
              </label>
              <div className="relative">
                <Layers className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <select
                  value={alcanceSeleccionado}
                  onChange={(e) => setAlcanceSeleccionado(e.target.value)}
                  className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition font-medium"
                >
                  <option value="">Todo el Grupo (General)</option>
                  <option value="EDUCADORES" className="font-bold text-emerald-600 dark:text-emerald-400">
                    ★ Solo Educadores (Dirigentes y Jefatura)
                  </option>
                  <optgroup label="Por Rama / Unidad">
                    {unidades.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nombre}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Nombre del Concepto *
            </label>
            <input
              type="text"
              required
              placeholder="ej. Campamento Anual 2026, Cuota Mensual Mayo..."
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Monto Base ($) *
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-semibold text-sm">
                  $
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder="15000.00"
                  value={montoBase}
                  onChange={(e) => setMontoBase(e.target.value)}
                  className="w-full pl-8 pr-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Ciclo / Año Lectivo *
              </label>
              <div className="relative">
                <Calendar className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="number"
                  min="2000"
                  max="2100"
                  required
                  value={cicloAnio}
                  onChange={(e) => setCicloAnio(parseInt(e.target.value, 10) || new Date().getFullYear())}
                  className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Fecha de Vencimiento (opcional)
            </label>
            <input
              type="date"
              value={fechaVencimiento}
              onChange={(e) => setFechaVencimiento(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
            />
          </div>

          {/* Sección de Descuento por Hermanos */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                  Descuento por Hermanos
                </span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={permiteDescuentoHermanos}
                  onChange={(e) => setPermiteDescuentoHermanos(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                <span className="ml-2 text-xs font-medium text-slate-700 dark:text-slate-300">
                  {permiteDescuentoHermanos ? 'Habilitado' : 'Sin descuento'}
                </span>
              </label>
            </div>

            {permiteDescuentoHermanos ? (
              <div className="space-y-2 pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Define cómo se calculará la bonificación a los miembros que tengan hermanos en el grupo:
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <label
                    className={`flex items-start gap-2 p-2.5 rounded-xl border cursor-pointer transition ${
                      modoDescuento === 'FAMILIA'
                        ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200'
                        : 'border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="modoDescuento"
                      checked={modoDescuento === 'FAMILIA'}
                      onChange={() => setModoDescuento('FAMILIA')}
                      className="mt-0.5 text-emerald-600"
                    />
                    <div>
                      <span className="font-semibold block">Según Grupo Familiar</span>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400">
                        Usa el % individual registrado en la ficha de cada familia.
                      </span>
                    </div>
                  </label>

                  <label
                    className={`flex items-start gap-2 p-2.5 rounded-xl border cursor-pointer transition ${
                      modoDescuento === 'FIJO'
                        ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200'
                        : 'border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="modoDescuento"
                      checked={modoDescuento === 'FIJO'}
                      onChange={() => setModoDescuento('FIJO')}
                      className="mt-0.5 text-emerald-600"
                    />
                    <div>
                      <span className="font-semibold block">Porcentaje Fijo</span>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400">
                        Aplica un % uniforme para este tipo de concepto.
                      </span>
                    </div>
                  </label>
                </div>

                {modoDescuento === 'FIJO' && (
                  <div className="pt-2">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Porcentaje de Descuento para este Concepto (%) *
                    </label>
                    <div className="relative max-w-xs">
                      <Percent className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        required
                        placeholder="ej. 15.00"
                        value={porcentajeFijo}
                        onChange={(e) => setPorcentajeFijo(e.target.value)}
                        className="w-full px-3.5 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
                      />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-[11px] text-slate-400 dark:text-slate-500 italic">
                Este concepto no aplicará bonificación por hermanos (útil para campamentos, comidas o gastos fijos por persona).
              </p>
            )}
          </div>

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              disabled={guardando}
              onClick={onCerrar}
              className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs transition cursor-pointer disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition shadow-xs cursor-pointer disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
            >
              {guardando && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{esEdicion ? 'Guardar Cambios' : 'Crear Concepto'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
