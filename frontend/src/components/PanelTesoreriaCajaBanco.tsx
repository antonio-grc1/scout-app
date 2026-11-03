import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { formatearMoneda, traducirErrorAmigable } from '../lib/formatters';
import { Button } from './ui/Button';
import { ModalCrearCuentaFinanciera } from './ModalCrearCuentaFinanciera';
import { ModalTraspasoCuentas, type CuentaFinancieraItem } from './ModalTraspasoCuentas';
import {
  Landmark,
  Wallet,
  ArrowLeftRight,
  PlusCircle,
  Calendar,
  RotateCcw,
  ArrowDownRight,
  ArrowUpRight,
  FileSpreadsheet,
  Clock,
  User,
  CheckCircle2,
} from 'lucide-react';

export interface MovimientoFinancieroItem {
  id: number;
  cuentaId: number;
  fecha: string;
  tipo:
    | 'INGRESO_COBRANZA'
    | 'INGRESO_OTRO'
    | 'EGRESO_GASTO'
    | 'TRANSFERENCIA_SALIDA'
    | 'TRANSFERENCIA_ENTRADA';
  montoIngreso: number;
  montoEgreso: number;
  conceptoTexto: string;
  miembroNombre?: string | null;
  pagoId: number | null;
  gastoId: number | null;
  creadoPorUsuarioId: number;
  creadoPor?: {
    id: number;
    nombre: string;
    apellido: string;
  };
  saldoAcumulado: number;
}

export interface LibroDiarioRespuesta {
  cuenta: {
    id: number;
    nombre: string;
    tipo: 'CAJA_EFECTIVO' | 'BANCO';
    activa: boolean;
  };
  saldoAnterior: number;
  movimientos: MovimientoFinancieroItem[];
  totalIngresosPeriodo: number;
  totalEgresosPeriodo: number;
  saldoFinalPeriodo: number;
  saldoActualConsolidado: number;
}

export interface PanelTesoreriaCajaBancoProps {
  onToast?: (texto: string, tipo?: 'exito' | 'error') => void;
}

function obtenerHoyISO(): string {
  const d = new Date();
  const anio = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

function obtenerRangoSemana(): { desde: string; hasta: string } {
  const hoy = new Date();
  const diaSemana = hoy.getDay(); // 0 domingo .. 6 sábado
  const diasHastaLunes = (diaSemana + 6) % 7;
  const lunes = new Date(hoy);
  lunes.setDate(hoy.getDate() - diasHastaLunes);
  const domingo = new Date(lunes);
  domingo.setDate(lunes.getDate() + 6);

  const format = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  return { desde: format(lunes), hasta: format(domingo) };
}

function obtenerRangoMes(): { desde: string; hasta: string } {
  const hoy = new Date();
  const y = hoy.getFullYear();
  const m = hoy.getMonth();
  const primerDia = new Date(y, m, 1);
  const ultimoDia = new Date(y, m + 1, 0);

  const format = (d: Date) => {
    const anio = d.getFullYear();
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    return `${anio}-${mes}-${dia}`;
  };

  return { desde: format(primerDia), hasta: format(ultimoDia) };
}

function formatearFechaHora(fechaIso?: string | null): string {
  if (!fechaIso) return '-';
  try {
    const d = new Date(fechaIso);
    if (isNaN(d.getTime())) return fechaIso;
    return d.toLocaleString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return fechaIso;
  }
}

function obtenerEtiquetaTipoMovimiento(tipo: MovimientoFinancieroItem['tipo']): {
  texto: string;
  badgeClass: string;
} {
  switch (tipo) {
    case 'INGRESO_COBRANZA':
      return {
        texto: 'Cobro de Cuota / Evento',
        badgeClass:
          'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
      };
    case 'INGRESO_OTRO':
      return {
        texto: 'Ingreso Extra',
        badgeClass:
          'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
      };
    case 'EGRESO_GASTO':
      return {
        texto: 'Egreso / Gasto',
        badgeClass:
          'bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300 border-rose-200 dark:border-rose-800',
      };
    case 'TRANSFERENCIA_SALIDA':
      return {
        texto: 'Traspaso Emitido',
        badgeClass:
          'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border-amber-200 dark:border-amber-800',
      };
    case 'TRANSFERENCIA_ENTRADA':
      return {
        texto: 'Traspaso Recibido',
        badgeClass:
          'bg-blue-100 text-blue-800 dark:bg-blue-950/70 dark:text-blue-300 border-blue-200 dark:border-blue-800',
      };
    default:
      return {
        texto: tipo,
        badgeClass:
          'bg-paper-3 text-ink-2 border-rule',
      };
  }
}

export const PanelTesoreriaCajaBanco: React.FC<PanelTesoreriaCajaBancoProps> = ({ onToast }) => {
  const { tienePermiso } = useAuthStore();
  const puedeGestionarTesoreria = tienePermiso('tesoreria.gestionar');

  const [cuentas, setCuentas] = useState<CuentaFinancieraItem[]>([]);
  const [cuentaSeleccionadaId, setCuentaSeleccionadaId] = useState<number | null>(null);
  const [cargandoCuentas, setCargandoCuentas] = useState(true);

  // Filtros de fecha / arqueo
  const [fechaDesde, setFechaDesde] = useState<string>('');
  const [fechaHasta, setFechaHasta] = useState<string>('');
  const [filtroRapido, setFiltroRapido] = useState<'hoy' | 'semana' | 'mes' | 'todo'>('todo');

  // Datos del libro diario
  const [libroDiario, setLibroDiario] = useState<LibroDiarioRespuesta | null>(null);
  const [cargandoLibro, setCargandoLibro] = useState(false);
  const [errorLibro, setErrorLibro] = useState<string | null>(null);

  // Modales
  const [modalCrearAbierto, setModalCrearAbierto] = useState(false);
  const [modalTraspasoAbierto, setModalTraspasoAbierto] = useState(false);

  // Cargar cuentas financieras
  const cargarCuentas = useCallback(
    async (idASeleccionar?: number) => {
      setCargandoCuentas(true);
      try {
        const res = await api.get('/tesoreria/cuentas');
        const listaCuentas: CuentaFinancieraItem[] = res.data || [];
        setCuentas(listaCuentas);

        if (listaCuentas.length > 0) {
          if (idASeleccionar && listaCuentas.some((c) => c.id === idASeleccionar)) {
            setCuentaSeleccionadaId(idASeleccionar);
          } else if (
            cuentaSeleccionadaId === null ||
            !listaCuentas.some((c) => c.id === cuentaSeleccionadaId)
          ) {
            setCuentaSeleccionadaId(listaCuentas[0].id);
          }
        } else {
          setCuentaSeleccionadaId(null);
        }
      } catch (err: any) {
        const msg = traducirErrorAmigable(err, 'No se pudieron cargar las cuentas financieras.');
        if (onToast) onToast(msg, 'error');
      } finally {
        setCargandoCuentas(false);
      }
    },
    [cuentaSeleccionadaId, onToast],
  );

  useEffect(() => {
    cargarCuentas();
  }, [cargarCuentas]);

  // Cargar libro diario de la cuenta seleccionada
  const cargarLibroDiario = useCallback(async () => {
    if (!cuentaSeleccionadaId) {
      setLibroDiario(null);
      return;
    }

    setCargandoLibro(true);
    setErrorLibro(null);

    try {
      const params: Record<string, string> = {};
      if (fechaDesde) params.desde = fechaDesde;
      if (fechaHasta) params.hasta = fechaHasta;

      const res = await api.get(`/tesoreria/cuentas/${cuentaSeleccionadaId}/libro-diario`, {
        params,
      });
      setLibroDiario(res.data);
    } catch (err: any) {
      const msg = traducirErrorAmigable(err, 'No se pudo cargar el libro diario.');
      setErrorLibro(msg);
      if (onToast) onToast(msg, 'error');
    } finally {
      setCargandoLibro(false);
    }
  }, [cuentaSeleccionadaId, fechaDesde, fechaHasta, onToast]);

  useEffect(() => {
    cargarLibroDiario();
  }, [cargarLibroDiario]);

  // Manejo de filtros rápidos
  const aplicarFiltroRapido = (tipo: 'hoy' | 'semana' | 'mes' | 'todo') => {
    setFiltroRapido(tipo);
    if (tipo === 'hoy') {
      const hoy = obtenerHoyISO();
      setFechaDesde(hoy);
      setFechaHasta(hoy);
    } else if (tipo === 'semana') {
      const { desde, hasta } = obtenerRangoSemana();
      setFechaDesde(desde);
      setFechaHasta(hasta);
    } else if (tipo === 'mes') {
      const { desde, hasta } = obtenerRangoMes();
      setFechaDesde(desde);
      setFechaHasta(hasta);
    } else {
      setFechaDesde('');
      setFechaHasta('');
    }
  };

  const cuentaActiva = cuentas.find((c) => c.id === cuentaSeleccionadaId);
  const hayFiltroFecha = Boolean(fechaDesde || fechaHasta);
  const saldoAnterior = libroDiario?.saldoAnterior ?? 0;
  const movimientos = libroDiario?.movimientos ?? [];
  const saldoHero =
    libroDiario?.saldoActualConsolidado !== undefined
      ? libroDiario.saldoActualConsolidado
      : cuentaActiva?.saldoActual ?? 0;

  return (
    <div className="space-y-5">
      {/* 1. Dynamic Account Tabs Strip */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 max-w-full">
          {cargandoCuentas ? (
            <div className="flex items-center gap-2">
              <div className="h-10 w-32 bg-paper-2 animate-pulse rounded-xl" />
              <div className="h-10 w-36 bg-paper-2 animate-pulse rounded-xl" />
            </div>
          ) : (
            cuentas.map((c) => {
              const estaSeleccionada = c.id === cuentaSeleccionadaId;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setCuentaSeleccionadaId(c.id);
                  }}
                  className={`min-h-[42px] px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer flex items-center gap-2 border ${
                    estaSeleccionada
                      ? 'bg-brand text-brand-contrast border-brand shadow-2xs font-extrabold'
                      : 'bg-surface text-ink hover:bg-paper-2 border-rule'
                  }`}
                >
                  {c.tipo === 'BANCO' ? (
                    <Landmark className="w-4 h-4 shrink-0" />
                  ) : (
                    <Wallet className="w-4 h-4 shrink-0" />
                  )}
                  <span>{c.nombre}</span>
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${
                      estaSeleccionada
                        ? 'bg-black/15 text-white dark:bg-black/30'
                        : 'bg-paper-2 text-ink-2'
                    }`}
                  >
                    {formatearMoneda(c.saldoActual)}
                  </span>
                </button>
              );
            })
          )}
        </div>

        {puedeGestionarTesoreria && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setModalCrearAbierto(true)}
            leftIcon={<PlusCircle className="w-4 h-4" />}
            className="shrink-0"
          >
            Nueva Cuenta
          </Button>
        )}
      </div>

      {/* 2. Top Summary Hero Strip */}
      {cuentaActiva && (
        <div className="p-4 sm:p-5 rounded-2xl border border-rule bg-paper-2 shadow-2xs transition-colors">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="w-9 h-9 rounded-xl bg-brand/15 text-brand flex items-center justify-center shrink-0">
                  {cuentaActiva.tipo === 'BANCO' ? (
                    <Landmark className="w-5 h-5" />
                  ) : (
                    <Wallet className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <h3 className="font-extrabold text-ink text-lg leading-tight">
                    {cuentaActiva.nombre}
                  </h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] px-2 py-0.5 rounded-md font-semibold bg-paper-3 text-ink-2">
                      {cuentaActiva.tipo === 'CAJA_EFECTIVO'
                        ? 'Caja Chica / Efectivo'
                        : 'Cuenta Bancaria'}
                    </span>
                    <span className="text-[11px] px-2 py-0.5 rounded-md font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>Activa</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-end sm:items-center gap-4 justify-between sm:justify-end">
              <div className="text-left sm:text-right">
                <span className="block text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                  Saldo Disponible en Tiempo Real
                </span>
                <span className="text-2xl sm:text-3xl font-black text-ink tracking-tight">
                  {formatearMoneda(saldoHero)}
                </span>
              </div>

              {puedeGestionarTesoreria && (
                <Button
                  type="button"
                  variant="primary"
                  size="md"
                  onClick={() => setModalTraspasoAbierto(true)}
                  leftIcon={<ArrowLeftRight className="w-4 h-4" />}
                  className="shrink-0"
                >
                  Traspaso entre cuentas
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 3. Date Filter / Arqueo Bar */}
      <div className="p-3.5 sm:p-4 rounded-2xl border border-rule bg-surface shadow-2xs space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Quick 1-tap arqueo buttons */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
            <span className="text-xs font-bold text-ink-muted mr-1 hidden sm:inline flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              <span>Período:</span>
            </span>

            <button
              type="button"
              onClick={() => aplicarFiltroRapido('hoy')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer shrink-0 border ${
                filtroRapido === 'hoy'
                  ? 'bg-brand/15 text-brand border-brand/40 shadow-2xs'
                  : 'bg-paper-2 text-ink-2 hover:text-ink border-rule'
              }`}
            >
              Hoy (Arqueo)
            </button>

            <button
              type="button"
              onClick={() => aplicarFiltroRapido('semana')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer shrink-0 border ${
                filtroRapido === 'semana'
                  ? 'bg-brand/15 text-brand border-brand/40 shadow-2xs'
                  : 'bg-paper-2 text-ink-2 hover:text-ink border-rule'
              }`}
            >
              Esta Semana
            </button>

            <button
              type="button"
              onClick={() => aplicarFiltroRapido('mes')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer shrink-0 border ${
                filtroRapido === 'mes'
                  ? 'bg-brand/15 text-brand border-brand/40 shadow-2xs'
                  : 'bg-paper-2 text-ink-2 hover:text-ink border-rule'
              }`}
            >
              Este Mes
            </button>

            <button
              type="button"
              onClick={() => aplicarFiltroRapido('todo')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer shrink-0 border ${
                filtroRapido === 'todo'
                  ? 'bg-brand/15 text-brand border-brand/40 shadow-2xs'
                  : 'bg-paper-2 text-ink-2 hover:text-ink border-rule'
              }`}
            >
              Todo el Histórico
            </button>
          </div>

          {/* Date Range Inputs */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs text-ink-2">
              <label htmlFor="fecha-desde-input" className="font-semibold text-ink-muted">
                Desde:
              </label>
              <input
                id="fecha-desde-input"
                type="date"
                value={fechaDesde}
                onChange={(e) => {
                  setFechaDesde(e.target.value);
                  setFiltroRapido('todo');
                }}
                className="min-h-[36px] rounded-xl border border-rule bg-paper-2 px-2.5 py-1 text-xs text-ink focus:border-brand outline-none"
              />
            </div>

            <div className="flex items-center gap-1.5 text-xs text-ink-2">
              <label htmlFor="fecha-hasta-input" className="font-semibold text-ink-muted">
                Hasta:
              </label>
              <input
                id="fecha-hasta-input"
                type="date"
                value={fechaHasta}
                onChange={(e) => {
                  setFechaHasta(e.target.value);
                  setFiltroRapido('todo');
                }}
                className="min-h-[36px] rounded-xl border border-rule bg-paper-2 px-2.5 py-1 text-xs text-ink focus:border-brand outline-none"
              />
            </div>

            {hayFiltroFecha && (
              <button
                type="button"
                onClick={() => aplicarFiltroRapido('todo')}
                className="p-2 text-ink-muted hover:text-ink rounded-lg hover:bg-paper-2 transition cursor-pointer"
                title="Limpiar fechas"
                aria-label="Limpiar fechas"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 4. Chronological Ledger Table (Libro Diario) */}
      <div className="bg-surface rounded-2xl border border-rule shadow-xs overflow-hidden transition-colors">
        <div className="p-4 sm:p-5 border-b border-rule flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-brand" />
            <h4 className="font-extrabold text-ink text-base">
              Libro Diario de Movimientos
            </h4>
          </div>
          <span className="text-xs font-semibold text-ink-muted">
            {movimientos.length} {movimientos.length === 1 ? 'operación' : 'operaciones'}
          </span>
        </div>

        {/* Loading state */}
        {cargandoLibro && (
          <div className="p-8 space-y-3">
            <div className="h-8 bg-paper-2 animate-pulse rounded-xl w-full" />
            <div className="h-8 bg-paper-2 animate-pulse rounded-xl w-full" />
            <div className="h-8 bg-paper-2 animate-pulse rounded-xl w-full" />
          </div>
        )}

        {/* Error state */}
        {!cargandoLibro && errorLibro && (
          <div className="p-8 text-center space-y-3">
            <p className="text-sm font-semibold text-rose-600 dark:text-rose-400">
              {errorLibro}
            </p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={cargarLibroDiario}
              leftIcon={<RotateCcw className="w-4 h-4" />}
            >
              Reintentar
            </Button>
          </div>
        )}

        {/* Empty state */}
        {!cargandoLibro && !errorLibro && movimientos.length === 0 && (
          <div className="p-10 text-center space-y-2">
            <p className="text-sm font-bold text-ink">
              No hay movimientos registrados en este período
            </p>
            <p className="text-xs text-ink-muted max-w-md mx-auto">
              Los cobros de cuotas, campamentos o traspasos asignados a esta cuenta se
              reflejarán cronológicamente aquí.
            </p>
          </div>
        )}

        {/* Desktop Ledger Table */}
        {!cargandoLibro && !errorLibro && (movimientos.length > 0 || hayFiltroFecha) && (
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-paper-2 border-b border-rule text-ink font-bold">
                <tr>
                  <th scope="col" className="py-3 px-4">Fecha / Hora</th>
                  <th scope="col" className="py-3 px-4">Concepto y Tipo</th>
                  <th scope="col" className="py-3 px-4 text-right">Ingreso (+)</th>
                  <th scope="col" className="py-3 px-4 text-right">Salida (-)</th>
                  <th scope="col" className="py-3 px-4 text-right">Saldo Acumulado</th>
                  <th scope="col" className="py-3 px-4">Registrado Por</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {/* Fila inicial de Saldo Anterior cuando hay filtro de fecha */}
                {hayFiltroFecha && (
                  <tr className="bg-paper-2/60 font-semibold text-ink-2">
                    <td className="py-2.5 px-4 text-ink-muted italic">
                      Al inicio del período
                    </td>
                    <td className="py-2.5 px-4">
                      <span className="font-bold text-ink">
                        Saldo Anterior / Arrastre
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-right text-ink-muted">-</td>
                    <td className="py-2.5 px-4 text-right text-ink-muted">-</td>
                    <td className="py-2.5 px-4 text-right font-extrabold text-ink">
                      {formatearMoneda(saldoAnterior)}
                    </td>
                    <td className="py-2.5 px-4 text-ink-muted text-[11px]">
                      Sistema
                    </td>
                  </tr>
                )}

                {/* Movimientos cronológicos */}
                {movimientos.map((m) => {
                  const tipoConfig = obtenerEtiquetaTipoMovimiento(m.tipo);
                  const usuarioNombre = m.creadoPor
                    ? `${m.creadoPor.nombre} ${m.creadoPor.apellido}`.trim()
                    : `Usuario #${m.creadoPorUsuarioId}`;

                  return (
                    <tr
                      key={m.id}
                      className="hover:bg-paper-2/50 transition-colors"
                    >
                      <td className="py-3 px-4 whitespace-nowrap text-ink-2">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-ink-muted" />
                          <span>{formatearFechaHora(m.fecha)}</span>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="space-y-1">
                          <div className="font-bold text-ink leading-snug">
                            {m.conceptoTexto}
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span
                              className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full border ${tipoConfig.badgeClass}`}
                            >
                              {tipoConfig.texto}
                            </span>
                            {m.miembroNombre &&
                              !m.conceptoTexto
                                .toLowerCase()
                                .includes(m.miembroNombre.toLowerCase()) && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-paper-2 border border-rule text-ink-2">
                                  <User className="w-3 h-3 text-ink-muted" />
                                  <span>{m.miembroNombre}</span>
                                </span>
                              )}
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4 text-right whitespace-nowrap font-bold text-emerald-600 dark:text-emerald-400">
                        {m.montoIngreso > 0 ? (
                          <span className="inline-flex items-center gap-0.5">
                            <ArrowDownRight className="w-3.5 h-3.5" />
                            <span>+{formatearMoneda(m.montoIngreso)}</span>
                          </span>
                        ) : (
                          <span className="text-ink-muted font-normal">-</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right whitespace-nowrap font-bold text-rose-600 dark:text-rose-400">
                        {m.montoEgreso > 0 ? (
                          <span className="inline-flex items-center gap-0.5">
                            <ArrowUpRight className="w-3.5 h-3.5" />
                            <span>-{formatearMoneda(m.montoEgreso)}</span>
                          </span>
                        ) : (
                          <span className="text-ink-muted font-normal">-</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right whitespace-nowrap font-black text-ink text-sm">
                        {formatearMoneda(m.saldoAcumulado)}
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap text-ink-muted text-xs">
                        <div className="flex items-center gap-1.5">
                          <User className="w-3 h-3 text-ink-muted shrink-0" />
                          <span className="truncate max-w-[130px]">{usuarioNombre}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Mobile Responsive Cards Fallback */}
        {!cargandoLibro && !errorLibro && movimientos.length > 0 && (
          <div className="md:hidden divide-y divide-rule">
            {hayFiltroFecha && (
              <div className="p-3.5 bg-paper-2/60 space-y-1 text-xs">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-ink">Saldo Anterior</span>
                  <span className="font-black text-ink">
                    {formatearMoneda(saldoAnterior)}
                  </span>
                </div>
                <span className="text-[11px] text-ink-muted block">
                  Arrastre acumulado antes del período
                </span>
              </div>
            )}

            {movimientos.map((m) => {
              const tipoConfig = obtenerEtiquetaTipoMovimiento(m.tipo);
              const usuarioNombre = m.creadoPor
                ? `${m.creadoPor.nombre} ${m.creadoPor.apellido}`.trim()
                : `Usuario #${m.creadoPorUsuarioId}`;

              return (
                <div key={m.id} className="p-3.5 space-y-2 hover:bg-paper-2/40 transition">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h5 className="font-bold text-ink text-xs leading-snug">
                        {m.conceptoTexto}
                      </h5>
                      <span className="text-[11px] text-ink-muted flex items-center gap-1 mt-0.5">
                        <Clock className="w-3 h-3" />
                        <span>{formatearFechaHora(m.fecha)}</span>
                      </span>
                      {m.miembroNombre &&
                        !m.conceptoTexto
                          .toLowerCase()
                          .includes(m.miembroNombre.toLowerCase()) && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-paper-2 border border-rule text-ink-2 mt-1">
                            <User className="w-3 h-3 text-ink-muted" />
                            <span>{m.miembroNombre}</span>
                          </span>
                        )}
                    </div>

                    <div className="text-right shrink-0">
                      {m.montoIngreso > 0 && (
                        <span className="font-extrabold text-xs text-emerald-600 dark:text-emerald-400 block">
                          +{formatearMoneda(m.montoIngreso)}
                        </span>
                      )}
                      {m.montoEgreso > 0 && (
                        <span className="font-extrabold text-xs text-rose-600 dark:text-rose-400 block">
                          -{formatearMoneda(m.montoEgreso)}
                        </span>
                      )}
                      <span className="text-[11px] font-bold text-ink-muted block mt-0.5">
                        Saldo: {formatearMoneda(m.saldoAcumulado)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-rule/50 text-[10px]">
                    <span
                      className={`font-semibold px-2 py-0.5 rounded-full border ${tipoConfig.badgeClass}`}
                    >
                      {tipoConfig.texto}
                    </span>
                    <span className="text-ink-muted truncate">{usuarioNombre}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 5. Bottom summary bar */}
        {libroDiario && (
          <div className="p-4 sm:p-5 bg-paper-2 border-t border-rule">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center sm:text-left">
              <div className="p-3 rounded-xl bg-surface border border-rule">
                <span className="block text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                  Total Ingresos Período
                </span>
                <span className="text-base sm:text-lg font-black text-emerald-600 dark:text-emerald-400">
                  +{formatearMoneda(libroDiario.totalIngresosPeriodo)}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-surface border border-rule">
                <span className="block text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                  Total Salidas Período
                </span>
                <span className="text-base sm:text-lg font-black text-rose-600 dark:text-rose-400">
                  -{formatearMoneda(libroDiario.totalEgresosPeriodo)}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-surface border border-rule">
                <span className="block text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                  Saldo Final del Período
                </span>
                <span className="text-base sm:text-lg font-black text-ink">
                  {formatearMoneda(libroDiario.saldoFinalPeriodo)}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modales */}
      {modalCrearAbierto && (
        <ModalCrearCuentaFinanciera
          abierto={modalCrearAbierto}
          onCerrar={() => setModalCrearAbierto(false)}
          onCuentaCreada={(nuevaCuenta) => {
            const nuevoId = nuevaCuenta?.id;
            cargarCuentas(nuevoId);
          }}
          onToast={onToast}
        />
      )}

      {modalTraspasoAbierto && (
        <ModalTraspasoCuentas
          abierto={modalTraspasoAbierto}
          cuentas={cuentas}
          cuentaOrigenInicialId={cuentaSeleccionadaId ?? undefined}
          onCerrar={() => setModalTraspasoAbierto(false)}
          onTransferenciaExitosa={() => {
            cargarCuentas(cuentaSeleccionadaId ?? undefined);
            cargarLibroDiario();
          }}
          onToast={onToast}
        />
      )}
    </div>
  );
};
