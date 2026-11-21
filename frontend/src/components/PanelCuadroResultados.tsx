import React, { useEffect, useState, useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Calendar,
  Wallet,
  Landmark,
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
  Printer,
  Scale,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { api } from '../api/client';
import { formatearMoneda, obtenerCicloAnioActual, traducirErrorAmigable } from '../lib/formatters';
import { Button } from './ui/Button';
import { BotonExportar } from './ui/BotonExportar';
import { exportarACSV, exportarAExcel, type ColumnaExportacion } from '../utils/exportadorPlanillas';

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
  const [cargando, setCargando] = useState<boolean>(true);
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
      const esOffline =
        (typeof navigator !== 'undefined' && !navigator.onLine) ||
        msg.toLowerCase().includes('offline') ||
        msg.toLowerCase().includes('sin conexión') ||
        msg.toLowerCase().includes('sin conexion');

      if (esOffline) {
        if (!datos) {
          setError('Estás sin conexión y el cuadro de resultados aún no ha sido sincronizado en este dispositivo.');
        } else {
          setError(null);
        }
      } else {
        setError(msg);
        if (onToast) onToast(msg, 'error');
      }
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

  const construirFilasExportacion = () => {
    const periodoLabel = mesFiltro ? NOMBRES_MESES_COMPLETO[mesFiltro - 1] : 'Consolidado Anual';
    const filas: Array<{
      ejercicio: number;
      periodo: string;
      categoria: string;
      rubro: string;
      monto: number;
      porcentaje: string;
    }> = [];

    for (const r of ingresosVisibles) {
      filas.push({
        ejercicio: anio,
        periodo: periodoLabel,
        categoria: 'INGRESO',
        rubro: r.rubroNombre,
        monto: Number(r.total || 0),
        porcentaje: `${r.porcentaje}%`,
      });
    }
    for (const r of egresosVisibles) {
      filas.push({
        ejercicio: anio,
        periodo: periodoLabel,
        categoria: 'EGRESO',
        rubro: r.rubroNombre,
        monto: -Number(r.total || 0),
        porcentaje: `${r.porcentaje}%`,
      });
    }
    filas.push({
      ejercicio: anio,
      periodo: periodoLabel,
      categoria: 'RESUMEN NETO',
      rubro: (datos?.resumen?.resultadoNeto ?? 0) >= 0 ? 'SUPERÁVIT' : 'DÉFICIT',
      monto: Number(datos?.resumen?.resultadoNeto ?? 0),
      porcentaje: `${datos?.resumen?.margenOperativoPorcentaje ?? 0}%`,
    });

    const columnas: ColumnaExportacion<(typeof filas)[number]>[] = [
      { header: 'Ejercicio', formatear: (f) => f.ejercicio, ancho: 12 },
      { header: 'Período', formatear: (f) => f.periodo, ancho: 20 },
      { header: 'Categoría', formatear: (f) => f.categoria, ancho: 16 },
      { header: 'Rubro / Concepto', formatear: (f) => f.rubro, ancho: 32 },
      { header: 'Monto', formatear: (f) => f.monto, ancho: 16 },
      { header: '% Composición / Margen', formatear: (f) => f.porcentaje, ancho: 22 },
    ];

    return { filas, columnas };
  };

  const handleExportarExcel = () => {
    const { filas, columnas } = construirFilasExportacion();
    const sufijo = mesFiltro ? `mes-${mesFiltro}` : 'anual';
    void exportarAExcel({
      filas,
      columnas,
      nombreArchivo: `cuadro-resultados-${anio}-${sufijo}`,
      nombreHoja: 'Resultados',
    });
  };

  const handleExportarCSV = () => {
    const { filas, columnas } = construirFilasExportacion();
    const sufijo = mesFiltro ? `mes-${mesFiltro}` : 'anual';
    exportarACSV({
      filas,
      columnas,
      nombreArchivo: `cuadro-resultados-${anio}-${sufijo}`,
    });
  };

  const esSuperavit = (datos?.resumen?.resultadoNeto ?? 0) >= 0;
  const mostrarSkeleton = cargando;

  return (
    <div className="space-y-4 print:space-y-2 print:text-black">
      {/* Barra Superior de Control y Filtros */}
      <div className="p-4 sm:p-5 rounded-2xl bg-paper-2 border border-rule flex flex-col md:flex-row md:items-center justify-between gap-3.5 print:hidden">
        <div className="flex items-center gap-3.5 flex-wrap">
          <div className="flex items-center gap-2">
            <Scale className="w-5 h-5 text-brand shrink-0" />
            <h2 className="text-lg font-black text-ink">Cuadro de Resultados y Balance</h2>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Selector de Año */}
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] font-bold text-ink-muted">Ejercicio:</span>
              <select
                value={anio}
                onChange={(e) => setAnio(Number(e.target.value))}
                className="min-h-[42px] py-1.5 px-3 rounded-xl bg-surface border border-rule text-[13px] font-bold text-ink focus:outline-brand cursor-pointer"
              >
                {(() => {
                  const anioBase = obtenerCicloAnioActual();
                  return [anioBase - 2, anioBase - 1, anioBase, anioBase + 1];
                })().map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            {/* Selector de Período (Año vs Mes) */}
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] font-bold text-ink-muted">Período:</span>
              <select
                value={mesFiltro === null ? 'ANUAL' : String(mesFiltro)}
                onChange={(e) => {
                  const val = e.target.value;
                  setMesFiltro(val === 'ANUAL' ? null : Number(val));
                }}
                className="min-h-[42px] py-1.5 px-3 rounded-xl bg-surface border border-rule text-[13px] font-bold text-ink focus:outline-brand cursor-pointer"
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
          <label className="flex items-center gap-2 text-[13px] font-medium text-ink-muted cursor-pointer select-none">
            <input
              type="checkbox"
              checked={ocultarSinMovimiento}
              onChange={(e) => setOcultarSinMovimiento(e.target.checked)}
              className="w-4 h-4 rounded text-brand focus:ring-brand"
            />
            <span>Ocultar rubros sin movimiento</span>
          </label>
        </div>

        {/* Acciones */}
        <div className="flex items-center gap-2 self-end md:self-auto flex-wrap">
          <Button
            variant="secondary"
            size="sm"
            onClick={cargarCuadro}
            disabled={cargando}
            className="gap-1.5"
            title="Recargar datos"
          >
            <RefreshCw className={`w-4 h-4 ${cargando ? 'animate-spin' : ''}`} />
            <span>Actualizar</span>
          </Button>

          <BotonExportar
            disabled={cargando || !datos}
            onExportarExcel={handleExportarExcel}
            onExportarCSV={handleExportarCSV}
            texto="Exportar"
            size="sm"
          />

          <Button
            variant="secondary"
            size="sm"
            onClick={handleImprimir}
            className="gap-1.5"
            title="Imprimir informe contable"
          >
            <Printer className="w-4 h-4" />
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
        <div role="alert" className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Tarjetas Principales de Resultados */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Total Ingresos */}
        <div className="p-5 rounded-2xl bg-paper-2 border border-rule flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
              <ArrowDownLeft className="w-4 h-4" />
              Ingresos del Período
            </span>
            <span className="text-xs font-bold text-ink-muted">
              {mesFiltro ? NOMBRES_MESES_CORTO[mesFiltro - 1] : anio}
            </span>
          </div>
          <div className="mt-2.5 flex items-baseline justify-between gap-2">
            {mostrarSkeleton ? (
              <>
                <div className="h-8 w-32 rounded-lg bg-paper-3 animate-pulse" aria-label="Cargando ingresos" />
                <div className="h-4 w-16 rounded-md bg-paper-3 animate-pulse" />
              </>
            ) : (
              <>
                <span className="text-2xl sm:text-[1.75rem] font-black text-emerald-600 dark:text-emerald-400">
                  {formatearMoneda(datos?.resumen?.totalIngresos ?? 0)}
                </span>
                <span className="text-[13px] font-semibold text-ink-muted">
                  {ingresosVisibles.length} rubros
                </span>
              </>
            )}
          </div>
        </div>

        {/* Total Egresos */}
        <div className="p-5 rounded-2xl bg-paper-2 border border-rule flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
              <ArrowUpRight className="w-4 h-4" />
              Egresos del Período
            </span>
            <span className="text-xs font-bold text-ink-muted">
              {mesFiltro ? NOMBRES_MESES_CORTO[mesFiltro - 1] : anio}
            </span>
          </div>
          <div className="mt-2.5 flex items-baseline justify-between gap-2">
            {mostrarSkeleton ? (
              <>
                <div className="h-8 w-32 rounded-lg bg-paper-3 animate-pulse" aria-label="Cargando egresos" />
                <div className="h-4 w-16 rounded-md bg-paper-3 animate-pulse" />
              </>
            ) : (
              <>
                <span className="text-2xl sm:text-[1.75rem] font-black text-rose-600 dark:text-rose-400">
                  {formatearMoneda(datos?.resumen?.totalEgresos ?? 0)}
                </span>
                <span className="text-[13px] font-semibold text-ink-muted">
                  {egresosVisibles.length} rubros
                </span>
              </>
            )}
          </div>
        </div>

        {/* Resultado Operativo Neto (Superávit / Déficit) */}
        <div
          className={`p-5 rounded-2xl border flex flex-col justify-between ${
            mostrarSkeleton
              ? 'bg-paper-2 border-rule'
              : esSuperavit
                ? 'bg-emerald-50/70 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800'
                : 'bg-rose-50/70 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span
              className={`text-[13px] font-bold flex items-center gap-1.5 ${
                mostrarSkeleton
                  ? 'text-ink-muted'
                  : esSuperavit
                    ? 'text-emerald-700 dark:text-emerald-300'
                    : 'text-rose-700 dark:text-rose-300'
              }`}
            >
              {mostrarSkeleton ? (
                <Scale className="w-4 h-4" />
              ) : esSuperavit ? (
                <TrendingUp className="w-4 h-4" />
              ) : (
                <TrendingDown className="w-4 h-4" />
              )}
              {mostrarSkeleton ? 'Resultado del Período' : `Resultado (${esSuperavit ? 'Superávit' : 'Déficit'})`}
            </span>
            {mostrarSkeleton ? (
              <div className="h-4 w-16 rounded-full bg-paper-3 animate-pulse" />
            ) : (
              <span
                className={`text-xs font-extrabold px-2.5 py-0.5 rounded-full ${
                  esSuperavit
                    ? 'bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200'
                    : 'bg-rose-100 dark:bg-rose-900 text-rose-800 dark:text-rose-200'
                }`}
              >
                {datos?.resumen?.margenOperativoPorcentaje ?? 0}% margen
              </span>
            )}
          </div>
          <div className="mt-2.5">
            {mostrarSkeleton ? (
              <div className="h-8 w-32 rounded-lg bg-paper-3 animate-pulse" aria-label="Cargando resultado" />
            ) : (
              <span
                className={`text-2xl sm:text-[1.75rem] font-black ${
                  esSuperavit
                    ? 'text-emerald-700 dark:text-emerald-300'
                    : 'text-rose-700 dark:text-rose-300'
                }`}
              >
                {formatearMoneda(datos?.resumen?.resultadoNeto ?? 0)}
              </span>
            )}
          </div>
        </div>

        {/* Disponibilidad en Cuentas (Caja y Banco en tiempo real) */}
        <div className="p-5 rounded-2xl bg-paper-2 border border-rule flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
              <Landmark className="w-4 h-4" />
              Disponibilidad Total (Hoy)
            </span>
            <span className="text-xs font-bold text-ink-muted">En vivo</span>
          </div>
          <div className="mt-1.5">
            {mostrarSkeleton ? (
              <div className="space-y-2 mt-1">
                <div className="h-7 w-32 rounded-lg bg-paper-3 animate-pulse" aria-label="Cargando disponibilidad" />
                <div className="flex justify-between gap-2">
                  <div className="h-3.5 w-20 rounded bg-paper-3 animate-pulse" />
                  <div className="h-3.5 w-20 rounded bg-paper-3 animate-pulse" />
                </div>
              </div>
            ) : (
              <>
                <span className="text-2xl font-black text-ink">
                  {formatearMoneda(datos?.disponibilidadActual?.totalDisponible ?? 0)}
                </span>
                <div className="mt-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-xs text-ink-muted">
                  <span className="flex items-center gap-1">
                    <Wallet className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <span>Caja: {formatearMoneda(datos?.disponibilidadActual?.totalCaja ?? 0)}</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <Landmark className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                    <span>Banco: {formatearMoneda(datos?.disponibilidadActual?.totalBanco ?? 0)}</span>
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Evolución Mes a Mes Interactiva */}
      {(mostrarSkeleton || datos?.evolucionMensual) && (
        <div className="p-5 rounded-2xl bg-paper-2 border border-rule space-y-3.5 print:hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-ink-muted" />
              <span className="text-[13px] font-bold text-ink">Evolución Mensual del Ejercicio {anio}</span>
            </div>
            {mesFiltro !== null && (
              <button
                type="button"
                onClick={() => setMesFiltro(null)}
                className="text-[13px] font-bold text-brand hover:underline cursor-pointer"
              >
                Ver todo el año
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-12 gap-2">
            {mostrarSkeleton
              ? NOMBRES_MESES_CORTO.map((nom) => (
                  <div
                    key={nom}
                    className="p-2.5 rounded-xl bg-surface border border-rule space-y-1.5 animate-pulse"
                  >
                    <span className="text-xs font-extrabold text-ink block">{nom}</span>
                    <div className="h-2.5 w-full rounded bg-paper-2" />
                    <div className="h-2.5 w-4/5 rounded bg-paper-2" />
                    <div className="pt-1 border-t border-rule">
                      <div className="h-3 w-full rounded bg-paper-3" />
                    </div>
                  </div>
                ))
              : datos?.evolucionMensual.map((m) => {
              const estaSeleccionado = mesFiltro === m.mes;
              const mesPositivo = m.resultadoNeto >= 0;
              return (
                <button
                  aria-pressed={estaSeleccionado}
                  key={m.mes}
                  type="button"
                  onClick={() => setMesFiltro(estaSeleccionado ? null : m.mes)}
                  className={`p-2.5 rounded-xl text-left transition border cursor-pointer flex flex-col justify-between ${
                    estaSeleccionado
                      ? 'bg-brand/10 border-brand shadow-xs'
                      : 'bg-surface border-rule hover:bg-paper-2'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-extrabold text-ink">{m.nombreMes.slice(0, 3)}</span>
                    {estaSeleccionado && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-brand" />
                    )}
                  </div>
                  <div className="mt-1.5 space-y-0.5 text-xs">
                    <div className="text-emerald-600 dark:text-emerald-400 font-semibold break-words">
                      +{formatearMoneda(m.ingresos)}
                    </div>
                    <div className="text-rose-600 dark:text-rose-400 font-semibold break-words">
                      -{formatearMoneda(m.egresos)}
                    </div>
                  </div>
                  <div
                    className={`mt-1.5 pt-1 border-t border-rule text-xs font-black break-words ${
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
          <div className="px-5 py-3.5 bg-emerald-50/60 dark:bg-emerald-950/30 border-b border-rule flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ArrowDownLeft className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <h3 className="text-[15px] font-black text-ink">
                1. INGRESOS POR RUBRO (COBRANZAS Y ENTRADAS)
              </h3>
            </div>
            {mostrarSkeleton ? (
              <div className="h-4 w-24 rounded bg-paper-3 animate-pulse" />
            ) : (
              <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">
                Total: {formatearMoneda(datos?.resumen?.totalIngresos ?? 0)}
              </span>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-rule bg-paper-2/60 text-xs text-ink-muted">
                  <th className="py-3 px-4 font-bold">Rubro de Ingreso</th>
                  <th className="py-3 px-4 font-bold text-center w-40 print:hidden">Composición</th>
                  <th className="py-3 px-4 font-bold text-right w-40">Total Recaudado</th>
                  <th className="py-3 px-4 font-bold text-right w-28">% del Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule font-medium">
                {mostrarSkeleton ? (
                  [1, 2, 3].map((i) => (
                    <tr key={i} className="animate-pulse">
                      <td className="py-3.5 px-4"><div className="h-3.5 w-36 rounded bg-paper-2" /></td>
                      <td className="py-3.5 px-4 print:hidden"><div className="h-1.5 w-full rounded-full bg-paper-2" /></td>
                      <td className="py-3.5 px-4 text-right"><div className="h-3.5 w-24 rounded bg-paper-2 ml-auto" /></td>
                      <td className="py-3.5 px-4 text-right"><div className="h-3.5 w-10 rounded bg-paper-2 ml-auto" /></td>
                    </tr>
                  ))
                ) : (
                  <>
                    {ingresosVisibles.map((r, i) => (
                      <tr key={r.rubroId ?? `ing-${i}`} className="hover:bg-paper-2/40 transition">
                        <td className="py-3 px-4 font-bold text-ink">
                          {r.rubroNombre}
                        </td>
                        <td className="py-3 px-4 print:hidden">
                          <div className="w-full h-2 bg-paper-3 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-emerald-500 rounded-full"
                              style={{ width: `${Math.min(100, r.porcentaje)}%` }}
                            />
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right font-black text-emerald-600 dark:text-emerald-400">
                          {formatearMoneda(r.total)}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-ink-muted">
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
                  </>
                )}
              </tbody>
              <tfoot>
                <tr className="bg-emerald-50/40 dark:bg-emerald-950/20 font-black border-t-2 border-emerald-500/30">
                  <td colSpan={2} className="py-3.5 px-4 text-ink text-[15px]">
                    SUBTOTAL INGRESOS
                  </td>
                  <td className="py-3.5 px-4 text-right text-[15px] text-emerald-600 dark:text-emerald-400 font-black">
                    {mostrarSkeleton ? (
                      <div className="h-4 w-24 rounded bg-paper-3 animate-pulse ml-auto" />
                    ) : (
                      formatearMoneda(datos?.resumen?.totalIngresos ?? 0)
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-right text-[13px] text-ink">
                    {mostrarSkeleton ? (
                      <div className="h-3.5 w-10 rounded bg-paper-3 animate-pulse ml-auto" />
                    ) : (
                      '100%'
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* BLOQUE 2: EGRESOS POR RUBRO */}
        <div className="rounded-2xl border border-rule bg-surface overflow-hidden shadow-2xs">
          <div className="px-5 py-3.5 bg-rose-50/60 dark:bg-rose-950/30 border-b border-rule flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ArrowUpRight className="w-4 h-4 text-rose-600 dark:text-rose-400" />
              <h3 className="text-[15px] font-black text-ink">
                2. EGRESOS POR RUBRO (GASTOS Y OPERACIONES)
              </h3>
            </div>
            {mostrarSkeleton ? (
              <div className="h-4 w-24 rounded bg-paper-3 animate-pulse" />
            ) : (
              <span className="text-sm font-black text-rose-600 dark:text-rose-400">
                Total: {formatearMoneda(datos?.resumen?.totalEgresos ?? 0)}
              </span>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-rule bg-paper-2/60 text-xs text-ink-muted">
                  <th className="py-3 px-4 font-bold">Rubro de Gasto</th>
                  <th className="py-3 px-4 font-bold text-center w-40 print:hidden">Composición</th>
                  <th className="py-3 px-4 font-bold text-right w-40">Total Invertido</th>
                  <th className="py-3 px-4 font-bold text-right w-28">% del Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule font-medium">
                {mostrarSkeleton ? (
                  [1, 2, 3].map((i) => (
                    <tr key={i} className="animate-pulse">
                      <td className="py-3.5 px-4"><div className="h-3.5 w-36 rounded bg-paper-2" /></td>
                      <td className="py-3.5 px-4 print:hidden"><div className="h-1.5 w-full rounded-full bg-paper-2" /></td>
                      <td className="py-3.5 px-4 text-right"><div className="h-3.5 w-24 rounded bg-paper-2 ml-auto" /></td>
                      <td className="py-3.5 px-4 text-right"><div className="h-3.5 w-10 rounded bg-paper-2 ml-auto" /></td>
                    </tr>
                  ))
                ) : (
                  <>
                    {egresosVisibles.map((r, i) => (
                      <tr key={r.rubroId ?? `egr-${i}`} className="hover:bg-paper-2/40 transition">
                        <td className="py-3 px-4 font-bold text-ink">
                          {r.rubroNombre}
                        </td>
                        <td className="py-3 px-4 print:hidden">
                          <div className="w-full h-2 bg-paper-3 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-rose-500 rounded-full"
                              style={{ width: `${Math.min(100, r.porcentaje)}%` }}
                            />
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right font-black text-rose-600 dark:text-rose-400">
                          {formatearMoneda(r.total)}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-ink-muted">
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
                  </>
                )}
              </tbody>
              <tfoot>
                <tr className="bg-rose-50/40 dark:bg-rose-950/20 font-black border-t-2 border-rose-500/30">
                  <td colSpan={2} className="py-3.5 px-4 text-ink text-[15px]">
                    SUBTOTAL EGRESOS
                  </td>
                  <td className="py-3.5 px-4 text-right text-[15px] text-rose-600 dark:text-rose-400 font-black">
                    {mostrarSkeleton ? (
                      <div className="h-4 w-24 rounded bg-paper-3 animate-pulse ml-auto" />
                    ) : (
                      formatearMoneda(datos?.resumen?.totalEgresos ?? 0)
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-right text-[13px] text-ink">
                    {mostrarSkeleton ? (
                      <div className="h-3.5 w-10 rounded bg-paper-3 animate-pulse ml-auto" />
                    ) : (
                      '100%'
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* BLOQUE 3: CIERRE / RESULTADO DEL EJERCICIO */}
        <div
          className={`p-5 sm:p-6 rounded-2xl border shadow-xs flex flex-wrap items-center justify-between gap-4 ${
            mostrarSkeleton
              ? 'bg-paper-2 border-rule'
              : esSuperavit
                ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-700'
                : 'bg-rose-50 dark:bg-rose-950/50 border-rose-300 dark:border-rose-700'
          }`}
        >
          <div>
            <div className="flex items-center gap-2">
              <Scale
                className={`w-6 h-6 ${
                  mostrarSkeleton
                    ? 'text-ink-muted'
                    : esSuperavit
                      ? 'text-emerald-700 dark:text-emerald-300'
                      : 'text-rose-700 dark:text-rose-300'
                }`}
              />
              <span className="text-base sm:text-lg font-black text-ink">
                RESULTADO DEL PERÍODO (INGRESOS MENOS EGRESOS)
              </span>
            </div>
            <p className="text-[13px] text-ink-muted mt-1.5">
              {mostrarSkeleton
                ? 'Calculando resultado operativo del período...'
                : esSuperavit
                  ? 'Superávit operativo: los ingresos por cuotas y eventos superaron a los costos y gastos registrados.'
                  : 'Déficit operativo: los egresos e inversiones del período superaron los ingresos registrados.'}
            </p>
          </div>

          <div className="text-right">
            {mostrarSkeleton ? (
              <div className="space-y-2 flex flex-col items-end">
                <div className="h-9 w-36 rounded-lg bg-paper-3 animate-pulse" />
                <div className="h-5 w-40 rounded-full bg-paper-3 animate-pulse" />
              </div>
            ) : (
              <>
                <span
                  className={`text-3xl font-black block tracking-tight ${
                    esSuperavit
                      ? 'text-emerald-700 dark:text-emerald-300'
                      : 'text-rose-700 dark:text-rose-300'
                  }`}
                >
                  {formatearMoneda(datos?.resumen?.resultadoNeto ?? 0)}
                </span>
                <span
                  className={`inline-block mt-1.5 text-[13px] font-extrabold px-3 py-1 rounded-full ${
                    esSuperavit
                      ? 'bg-emerald-200 dark:bg-emerald-900 text-emerald-900 dark:text-emerald-100'
                      : 'bg-rose-200 dark:bg-rose-900 text-rose-900 dark:text-rose-100'
                  }`}
                >
                  {esSuperavit ? 'SUPERÁVIT DEL EJERCICIO' : 'DÉFICIT DEL EJERCICIO'}
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
