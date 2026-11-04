import React, { useEffect, useState, useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Calendar,
  Wallet,
  Landmark,
  ArrowDownLeft,
  ArrowUpRight,
  Filter,
  RefreshCw,
  Printer,
  Scale,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { api } from '../api/client';
import { formatearMoneda, traducirErrorAmigable } from '../lib/formatters';
import { Button } from './ui/Button';

export interface PanelCuadroResultadosProps {
  onToast?: (texto: string, tipo?: 'exito' | 'error') => void;
}

interface ItemRubro {
  rubroId: number | null;
  rubroNombre: string;
  meses: Record<number, number>;
  total: number;
  porcentaje: number;
}

interface MesResumen {
  mes: number;
  nombreMes: string;
  ingresos: number;
  egresos: number;
  resultadoNeto: number;
}

interface CuadroResultadosData {
  anio: number;
  mesFiltro?: number | null;
  resumen: {
    totalIngresos: number;
    totalEgresos: number;
    resultadoNeto: number;
    margenOperativoPorcentaje: number;
  };
  ingresosPorRubro: ItemRubro[];
  egresosPorRubro: ItemRubro[];
  evolucionMensual: MesResumen[];
  disponibilidadActual: {
    totalCaja: number;
    totalBanco: number;
    totalDisponible: number;
  };
}

const NOMBRES_MESES_COMPLETO = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const NOMBRES_MESES_CORTO = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
];

export const PanelCuadroResultados: React.FC<PanelCuadroResultadosProps> = ({ onToast }) => {
  const [anio, setAnio] = useState<number>(new Date().getFullYear());
  const [mesFiltro, setMesFiltro] = useState<number | null>(null); // null = Todo el año
  const [ocultarSinMovimiento, setOcultarSinMovimiento] = useState<boolean>(true);
  const [cargando, setCargando] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [datos, setDatos] = useState<CuadroResultadosData | null>(null);

  const cargarCuadro = async () => {
    setCargando(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.append('anio', String(anio));
      if (mesFiltro !== null) {
        params.append('mes', String(mesFiltro));
      }
      const res = await api.get(`/tesoreria/cuadro-resultados?${params.toString()}`);
      setDatos(res.data);
    } catch (err) {
      const msg = traducirErrorAmigable(err, 'No se pudo cargar el cuadro de resultados.');
      setError(msg);
      if (onToast) onToast(msg, 'error');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarCuadro();
  }, [anio, mesFiltro]);

  const ingresosVisibles = useMemo(() => {
    if (!datos?.ingresosPorRubro) return [];
    if (!ocultarSinMovimiento) return datos.ingresosPorRubro;
    return datos.ingresosPorRubro.filter((r) => r.total > 0);
  }, [datos?.ingresosPorRubro, ocultarSinMovimiento]);

  const egresosVisibles = useMemo(() => {
    if (!datos?.egresosPorRubro) return [];
    if (!ocultarSinMovimiento) return datos.egresosPorRubro;
    return datos.egresosPorRubro.filter((r) => r.total > 0);
  }, [datos?.egresosPorRubro, ocultarSinMovimiento]);

  const handleImprimir = () => {
    window.print();
  };

  const esSuperavit = (datos?.resumen.resultadoNeto ?? 0) >= 0;

  return (
    <div className="space-y-4 print:space-y-2 print:text-black">
      {/* Barra Superior de Control y Filtros */}
      <div className="p-4 rounded-2xl bg-paper-2 border border-rule flex flex-col md:flex-row md:items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <Scale className="w-5 h-5 text-brand shrink-0" />
            <h2 className="text-base font-black text-ink">Cuadro de Resultados y Balance</h2>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Selector de Año */}
            <div className="flex items-center gap-1">
              <span className="text-xs font-bold text-ink-muted">Ejercicio:</span>
              <select
                value={anio}
                onChange={(e) => setAnio(Number(e.target.value))}
                className="py-1 px-2.5 rounded-xl bg-surface border border-rule text-xs font-bold text-ink focus:outline-brand cursor-pointer"
              >
                {[2024, 2025, 2026, 2027].map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            {/* Selector de Período (Año vs Mes) */}
            <div className="flex items-center gap-1">
              <span className="text-xs font-bold text-ink-muted">Período:</span>
              <select
                value={mesFiltro === null ? 'ANUAL' : String(mesFiltro)}
                onChange={(e) => {
                  const val = e.target.value;
                  setMesFiltro(val === 'ANUAL' ? null : Number(val));
                }}
                className="py-1 px-2.5 rounded-xl bg-surface border border-rule text-xs font-bold text-ink focus:outline-brand cursor-pointer"
              >
                <option value="ANUAL">Todo el Año (Consolidado)</option>
                {NOMBRES_MESES_COMPLETO.map((nom, idx) => (
                  <option key={idx + 1} value={String(idx + 1)}>
                    {nom}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Toggle Ocultar Rubros sin movimiento */}
          <label className="flex items-center gap-1.5 text-xs text-ink-muted cursor-pointer select-none">
            <input
              type="checkbox"
              checked={ocultarSinMovimiento}
              onChange={(e) => setOcultarSinMovimiento(e.target.checked)}
              className="rounded text-brand focus:ring-brand"
            />
            <span>Ocultar rubros sin movimiento</span>
          </label>
        </div>

        {/* Acciones */}
        <div className="flex items-center gap-2 self-end md:self-auto">
          <Button
            variant="secondary"
            size="sm"
            onClick={cargarCuadro}
            disabled={cargando}
            className="gap-1.5"
            title="Recargar datos"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${cargando ? 'animate-spin' : ''}`} />
            <span>Actualizar</span>
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={handleImprimir}
            className="gap-1.5"
            title="Imprimir informe contable"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Imprimir</span>
          </Button>
        </div>
      </div>

      {/* Cabecera para Impresión Oficial */}
      <div className="hidden print:block mb-4 border-b border-gray-300 pb-2">
        <h1 className="text-xl font-bold">Grupo Scout Juan XXIII - Cuadro de Resultados</h1>
        <p className="text-xs text-gray-600">
          Ejercicio Contable: {anio} — Período:{' '}
          {mesFiltro ? NOMBRES_MESES_COMPLETO[mesFiltro - 1] : 'Consolidado Anual'}
          {' • '}Generado el {new Date().toLocaleDateString('es-AR')}
        </p>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Tarjetas Principales de Resultados */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Total Ingresos */}
        <div className="p-4 rounded-2xl bg-paper-2 border border-rule flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
              <ArrowDownLeft className="w-4 h-4" />
              Ingresos del Período
            </span>
            <span className="text-[11px] font-bold text-ink-muted">
              {mesFiltro ? NOMBRES_MESES_CORTO[mesFiltro - 1] : anio}
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
              {formatearMoneda(datos?.resumen.totalIngresos ?? 0)}
            </span>
            <span className="text-xs font-semibold text-ink-muted">
              {ingresosVisibles.length} rubros
            </span>
          </div>
        </div>

        {/* Total Egresos */}
        <div className="p-4 rounded-2xl bg-paper-2 border border-rule flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
              <ArrowUpRight className="w-4 h-4" />
              Egresos del Período
            </span>
            <span className="text-[11px] font-bold text-ink-muted">
              {mesFiltro ? NOMBRES_MESES_CORTO[mesFiltro - 1] : anio}
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black text-rose-600 dark:text-rose-400">
              {formatearMoneda(datos?.resumen.totalEgresos ?? 0)}
            </span>
            <span className="text-xs font-semibold text-ink-muted">
              {egresosVisibles.length} rubros
            </span>
          </div>
        </div>

        {/* Resultado Operativo Neto (Superávit / Déficit) */}
        <div
          className={`p-4 rounded-2xl border flex flex-col justify-between ${
            esSuperavit
              ? 'bg-emerald-50/70 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800'
              : 'bg-rose-50/70 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800'
          }`}
        >
          <div className="flex items-center justify-between">
            <span
              className={`text-xs font-bold flex items-center gap-1.5 ${
                esSuperavit
                  ? 'text-emerald-700 dark:text-emerald-300'
                  : 'text-rose-700 dark:text-rose-300'
              }`}
            >
              {esSuperavit ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              Resultado ({esSuperavit ? 'Superávit' : 'Déficit'})
            </span>
            <span
              className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                esSuperavit
                  ? 'bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200'
                  : 'bg-rose-100 dark:bg-rose-900 text-rose-800 dark:text-rose-200'
              }`}
            >
              {datos?.resumen.margenOperativoPorcentaje ?? 0}% margen
            </span>
          </div>
          <div className="mt-2">
            <span
              className={`text-2xl font-black ${
                esSuperavit
                  ? 'text-emerald-700 dark:text-emerald-300'
                  : 'text-rose-700 dark:text-rose-300'
              }`}
            >
              {formatearMoneda(datos?.resumen.resultadoNeto ?? 0)}
            </span>
          </div>
        </div>

        {/* Disponibilidad en Cuentas (Caja y Banco en tiempo real) */}
        <div className="p-4 rounded-2xl bg-paper-2 border border-rule flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
              <Landmark className="w-4 h-4" />
              Disponibilidad Total (Hoy)
            </span>
            <span className="text-[10px] font-bold text-ink-muted">En vivo</span>
          </div>
          <div className="mt-1">
            <span className="text-xl font-black text-ink">
              {formatearMoneda(datos?.disponibilidadActual.totalDisponible ?? 0)}
            </span>
            <div className="mt-1.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-[11px] text-ink-muted">
              <span className="flex items-center gap-1">
                <Wallet className="w-3 h-3 text-emerald-500 shrink-0" />
                <span>Caja: {formatearMoneda(datos?.disponibilidadActual.totalCaja ?? 0)}</span>
              </span>
              <span className="flex items-center gap-1">
                <Landmark className="w-3 h-3 text-blue-500 shrink-0" />
                <span>Banco: {formatearMoneda(datos?.disponibilidadActual.totalBanco ?? 0)}</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Evolución Mes a Mes Interactiva */}
      {datos?.evolucionMensual && (
        <div className="p-4 rounded-2xl bg-paper-2 border border-rule space-y-3 print:hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-ink-muted" />
              <span className="text-xs font-bold text-ink">Evolución Mensual del Ejercicio {anio}</span>
            </div>
            {mesFiltro !== null && (
              <button
                type="button"
                onClick={() => setMesFiltro(null)}
                className="text-xs font-bold text-brand hover:underline cursor-pointer"
              >
                Ver todo el año
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-12 gap-2">
            {datos.evolucionMensual.map((m) => {
              const estaSeleccionado = mesFiltro === m.mes;
              const mesPositivo = m.resultadoNeto >= 0;
              return (
                <button
                  key={m.mes}
                  type="button"
                  onClick={() => setMesFiltro(estaSeleccionado ? null : m.mes)}
                  className={`p-2 rounded-xl text-left transition border cursor-pointer flex flex-col justify-between ${
                    estaSeleccionado
                      ? 'bg-brand/10 border-brand shadow-xs'
                      : 'bg-surface border-rule hover:bg-paper-2'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold text-ink">{m.nombreMes.slice(0, 3)}</span>
                    {estaSeleccionado && (
                      <CheckCircle2 className="w-3 h-3 text-brand" />
                    )}
                  </div>
                  <div className="mt-1.5 space-y-0.5 text-[10px]">
                    <div className="text-emerald-600 dark:text-emerald-400 font-semibold truncate">
                      +{formatearMoneda(m.ingresos)}
                    </div>
                    <div className="text-rose-600 dark:text-rose-400 font-semibold truncate">
                      -{formatearMoneda(m.egresos)}
                    </div>
                  </div>
                  <div
                    className={`mt-1 pt-1 border-t border-rule text-[10px] font-black truncate ${
                      mesPositivo
                        ? 'text-emerald-700 dark:text-emerald-300'
                        : 'text-rose-700 dark:text-rose-300'
                    }`}
                  >
                    {formatearMoneda(m.resultadoNeto)}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* CUADRO DE RESULTADOS FORMAL / TABLAS CONTABLES */}
      <div className="space-y-4">
        {/* BLOQUE 1: INGRESOS POR RUBRO */}
        <div className="rounded-2xl border border-rule bg-surface overflow-hidden shadow-2xs">
          <div className="px-4 py-3 bg-emerald-50/60 dark:bg-emerald-950/30 border-b border-rule flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ArrowDownLeft className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <h3 className="text-sm font-black text-ink">
                1. INGRESOS POR RUBRO (COBRANZAS Y ENTRADAS)
              </h3>
            </div>
            <span className="text-xs font-black text-emerald-600 dark:text-emerald-400">
              Total: {formatearMoneda(datos?.resumen.totalIngresos ?? 0)}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-rule bg-paper-2/60 text-ink-muted">
                  <th className="py-2.5 px-4 font-bold">Rubro de Ingreso</th>
                  <th className="py-2.5 px-4 font-bold text-center w-40 print:hidden">Composición</th>
                  <th className="py-2.5 px-4 font-bold text-right w-36">Total Recaudado</th>
                  <th className="py-2.5 px-4 font-bold text-right w-24">% del Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule font-medium">
                {ingresosVisibles.map((r, i) => (
                  <tr key={r.rubroId ?? `ing-${i}`} className="hover:bg-paper-2/40 transition">
                    <td className="py-2.5 px-4 font-bold text-ink">
                      {r.rubroNombre}
                    </td>
                    <td className="py-2.5 px-4 print:hidden">
                      <div className="w-full h-1.5 bg-paper-3 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full"
                          style={{ width: `${Math.min(100, r.porcentaje)}%` }}
                        />
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-right font-black text-emerald-600 dark:text-emerald-400">
                      {formatearMoneda(r.total)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-bold text-ink-muted">
                      {r.porcentaje}%
                    </td>
                  </tr>
                ))}

                {ingresosVisibles.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-ink-muted">
                      No se registraron ingresos en este período.
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="bg-emerald-50/40 dark:bg-emerald-950/20 font-black border-t-2 border-emerald-500/30">
                  <td colSpan={2} className="py-3 px-4 text-ink text-sm">
                    SUBTOTAL INGRESOS
                  </td>
                  <td className="py-3 px-4 text-right text-sm text-emerald-600 dark:text-emerald-400 font-black">
                    {formatearMoneda(datos?.resumen.totalIngresos ?? 0)}
                  </td>
                  <td className="py-3 px-4 text-right text-xs text-ink">
                    100%
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* BLOQUE 2: EGRESOS POR RUBRO */}
        <div className="rounded-2xl border border-rule bg-surface overflow-hidden shadow-2xs">
          <div className="px-4 py-3 bg-rose-50/60 dark:bg-rose-950/30 border-b border-rule flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ArrowUpRight className="w-4 h-4 text-rose-600 dark:text-rose-400" />
              <h3 className="text-sm font-black text-ink">
                2. EGRESOS POR RUBRO (GASTOS Y OPERACIONES)
              </h3>
            </div>
            <span className="text-xs font-black text-rose-600 dark:text-rose-400">
              Total: {formatearMoneda(datos?.resumen.totalEgresos ?? 0)}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-rule bg-paper-2/60 text-ink-muted">
                  <th className="py-2.5 px-4 font-bold">Rubro de Gasto</th>
                  <th className="py-2.5 px-4 font-bold text-center w-40 print:hidden">Composición</th>
                  <th className="py-2.5 px-4 font-bold text-right w-36">Total Invertido</th>
                  <th className="py-2.5 px-4 font-bold text-right w-24">% del Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule font-medium">
                {egresosVisibles.map((r, i) => (
                  <tr key={r.rubroId ?? `egr-${i}`} className="hover:bg-paper-2/40 transition">
                    <td className="py-2.5 px-4 font-bold text-ink">
                      {r.rubroNombre}
                    </td>
                    <td className="py-2.5 px-4 print:hidden">
                      <div className="w-full h-1.5 bg-paper-3 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-rose-500 rounded-full"
                          style={{ width: `${Math.min(100, r.porcentaje)}%` }}
                        />
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-right font-black text-rose-600 dark:text-rose-400">
                      {formatearMoneda(r.total)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-bold text-ink-muted">
                      {r.porcentaje}%
                    </td>
                  </tr>
                ))}

                {egresosVisibles.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-ink-muted">
                      No se registraron egresos en este período.
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="bg-rose-50/40 dark:bg-rose-950/20 font-black border-t-2 border-rose-500/30">
                  <td colSpan={2} className="py-3 px-4 text-ink text-sm">
                    SUBTOTAL EGRESOS
                  </td>
                  <td className="py-3 px-4 text-right text-sm text-rose-600 dark:text-rose-400 font-black">
                    {formatearMoneda(datos?.resumen.totalEgresos ?? 0)}
                  </td>
                  <td className="py-3 px-4 text-right text-xs text-ink">
                    100%
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* BLOQUE 3: CIERRE / RESULTADO DEL EJERCICIO */}
        <div
          className={`p-5 rounded-2xl border shadow-xs flex flex-wrap items-center justify-between gap-4 ${
            esSuperavit
              ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-700'
              : 'bg-rose-50 dark:bg-rose-950/50 border-rose-300 dark:border-rose-700'
          }`}
        >
          <div>
            <div className="flex items-center gap-2">
              <Scale
                className={`w-6 h-6 ${
                  esSuperavit
                    ? 'text-emerald-700 dark:text-emerald-300'
                    : 'text-rose-700 dark:text-rose-300'
                }`}
              />
              <span className="text-base font-black text-ink">
                RESULTADO DEL PERÍODO (INGRESOS MENOS EGRESOS)
              </span>
            </div>
            <p className="text-xs text-ink-muted mt-1">
              {esSuperavit
                ? 'Superávit operativo: los ingresos por cuotas y eventos superaron a los costos y gastos registrados.'
                : 'Déficit operativo: los egresos e inversiones del período superaron los ingresos registrados.'}
            </p>
          </div>

          <div className="text-right">
            <span
              className={`text-3xl font-black block tracking-tight ${
                esSuperavit
                  ? 'text-emerald-700 dark:text-emerald-300'
                  : 'text-rose-700 dark:text-rose-300'
              }`}
            >
              {formatearMoneda(datos?.resumen.resultadoNeto ?? 0)}
            </span>
            <span
              className={`inline-block mt-1 text-xs font-extrabold px-2.5 py-0.5 rounded-full ${
                esSuperavit
                  ? 'bg-emerald-200 dark:bg-emerald-900 text-emerald-900 dark:text-emerald-100'
                  : 'bg-rose-200 dark:bg-rose-900 text-rose-900 dark:text-rose-100'
              }`}
            >
              {esSuperavit ? 'SUPERÁVIT DEL EJERCICIO' : 'DÉFICIT DEL EJERCICIO'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
