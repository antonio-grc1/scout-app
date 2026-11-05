import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { useToastStore, mostrarToastConDeshacer } from '../store/toastStore';
import {
  formatearMoneda,
  traducirErrorAmigable,
  formatearFecha,
  formatearFechaHora,
  normalizarTextoBusqueda,
} from '../lib/formatters';
import { Button } from './ui/Button';
import { BotonExportar } from './ui/BotonExportar';
import { exportarAExcel, exportarACSV, type ColumnaExportacion } from '../utils/exportadorPlanillas';
import { ModalCrearCuentaFinanciera } from './ModalCrearCuentaFinanciera';
import { ModalTraspasoCuentas, type CuentaFinancieraItem } from './ModalTraspasoCuentas';
import { ModalRegistrarIngreso, type IngresoAEditarItem } from './ModalRegistrarIngreso';
import { ModalRegistrarGasto, type GastoAEditarItem } from './ModalRegistrarGasto';
import { ModalConfirmacion } from './ModalConfirmacion';
import {
  Landmark,
  Wallet,
  ArrowLeftRight,
  PlusCircle,
  Pencil,
  Trash2,
  Receipt,
  Tag,
  Calendar,
  RotateCcw,
  ArrowDownRight,
  ArrowUpRight,
  FileSpreadsheet,
  Clock,
  User,
  CheckCircle2,
  ChevronDown,
  Loader2,
  ArrowUp,
  Search,
  X,
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
  rubroId?: number | null;
  rubro?: {
    id: number;
    nombre: string;
    tipo?: string;
  } | null;
  gasto?: {
    id: number;
    descripcion: string;
    anulado: boolean;
    comprobanteNro: string | null;
  } | null;
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

  const onToastRef = useRef(onToast);
  useEffect(() => {
    onToastRef.current = onToast;
  }, [onToast]);

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
  const [cuentaAEditar, setCuentaAEditar] = useState<CuentaFinancieraItem | null>(null);
  const [modalTraspasoAbierto, setModalTraspasoAbierto] = useState(false);
  const [modalIngresoAbierto, setModalIngresoAbierto] = useState(false);
  const [ingresoAEditar, setIngresoAEditar] = useState<IngresoAEditarItem | null>(null);
  const [modalGastoAbierto, setModalGastoAbierto] = useState(false);
  const [gastoAEditar, setGastoAEditar] = useState<GastoAEditarItem | null>(null);
  const [movimientoAEliminar, setMovimientoAEliminar] = useState<MovimientoFinancieroItem | null>(null);
  const [modalConfirmarEliminar, setModalConfirmarEliminar] = useState(false);
  const [eliminandoId, setEliminandoId] = useState<number | null>(null);

  // Cargar cuentas financieras
  const cargarCuentas = useCallback(
    async (idASeleccionar?: number) => {
      try {
        const res = await api.get('/tesoreria/cuentas');
        const listaCuentas: CuentaFinancieraItem[] = res.data || [];
        setCuentas(listaCuentas);

        if (listaCuentas.length > 0) {
          setCuentaSeleccionadaId((prevId) => {
            if (idASeleccionar && listaCuentas.some((c) => c.id === idASeleccionar)) {
              return idASeleccionar;
            }
            if (prevId === null || !listaCuentas.some((c) => c.id === prevId)) {
              return listaCuentas[0].id;
            }
            return prevId;
          });
        } else {
          setCuentaSeleccionadaId(null);
        }
      } catch (err: any) {
        const msg = traducirErrorAmigable(err, 'No se pudieron cargar las cuentas financieras.');
        const esOffline =
          (typeof navigator !== 'undefined' && !navigator.onLine) ||
          msg.toLowerCase().includes('offline') ||
          msg.toLowerCase().includes('sin conexión') ||
          msg.toLowerCase().includes('sin conexion');

        if (!esOffline && onToastRef.current) {
          onToastRef.current(msg, 'error');
        }
      } finally {
        setCargandoCuentas(false);
      }
    },
    [],
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
      const esOffline =
        (typeof navigator !== 'undefined' && !navigator.onLine) ||
        msg.toLowerCase().includes('offline') ||
        msg.toLowerCase().includes('sin conexión') ||
        msg.toLowerCase().includes('sin conexion');

      if (esOffline) {
        if (!libroDiario) {
          setErrorLibro('Estás sin conexión y esta cuenta aún no ha sido sincronizada en este dispositivo.');
        } else {
          setErrorLibro(null);
        }
      } else {
        setErrorLibro(msg);
        if (onToastRef.current) onToastRef.current(msg, 'error');
      }
    } finally {
      setCargandoLibro(false);
    }
  }, [cuentaSeleccionadaId, fechaDesde, fechaHasta]);

  useEffect(() => {
    cargarLibroDiario();
  }, [cargarLibroDiario]);

  const ejecutarEliminacionIngreso = async () => {
    if (!movimientoAEliminar) return;
    const mov = movimientoAEliminar;
    try {
      setEliminandoId(mov.id);
      await api.delete(`/tesoreria/ingresos/${mov.id}`);
      setModalConfirmarEliminar(false);
      setMovimientoAEliminar(null);
      await Promise.all([cargarCuentas(), cargarLibroDiario()]);

      mostrarToastConDeshacer(
        `Ingreso "${mov.conceptoTexto}" eliminado.`,
        async () => {
          try {
            await api.post('/tesoreria/ingresos', {
              fecha: mov.fecha,
              monto: Number(mov.montoIngreso),
              descripcion: mov.conceptoTexto.replace(/^Ingreso:\s*/, '').split(' - ')[0],
              cuentaId: mov.cuentaId,
              rubroId: mov.rubroId || mov.rubro?.id,
            });
            await Promise.all([cargarCuentas(), cargarLibroDiario()]);
            useToastStore.getState().mostrarToast('Ingreso restaurado correctamente.');
          } catch (err: any) {
            const msg = traducirErrorAmigable(err, 'No se pudo restaurar el ingreso.');
            useToastStore.getState().mostrarToast(msg, 'error');
          }
        },
      );
    } catch (err: any) {
      const msg = traducirErrorAmigable(err, 'No se pudo eliminar el ingreso.');
      if (onToastRef.current) onToastRef.current(msg, 'error');
    } finally {
      setEliminandoId(null);
    }
  };

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
  const datosLibroListos = Boolean(
    libroDiario && cuentaSeleccionadaId !== null && libroDiario.cuenta.id === cuentaSeleccionadaId,
  );
  const estaCargando =
    cargandoCuentas ||
    cargandoLibro ||
    (cuentaSeleccionadaId !== null && !datosLibroListos && !errorLibro);

  const saldoAnterior = datosLibroListos ? (libroDiario?.saldoAnterior ?? 0) : 0;
  const movimientos = datosLibroListos ? (libroDiario?.movimientos ?? []) : [];
  const saldoHero =
    datosLibroListos && libroDiario?.saldoActualConsolidado !== undefined
      ? libroDiario.saldoActualConsolidado
      : cuentaActiva?.saldoActual ?? 0;

  // Buscador y parámetros de paginación progresiva por bloques
  const [busqueda, setBusqueda] = useState('');
  const TAMANIO_BLOQUE = 20;
  const [expandido, setExpandido] = useState(false);
  const [cantidadVisible, setCantidadVisible] = useState(TAMANIO_BLOQUE);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Reiniciar paginación al cambiar de cuenta, filtro de fechas o búsqueda
  useEffect(() => {
    setExpandido(false);
    setCantidadVisible(TAMANIO_BLOQUE);
  }, [cuentaSeleccionadaId, fechaDesde, fechaHasta, busqueda]);

  // Invertir el orden: los movimientos más recientes se muestran más arriba
  const movimientosInvertidos = useMemo(() => {
    return [...movimientos].reverse();
  }, [movimientos]);

  // Filtrado en vivo por término de búsqueda
  const movimientosFiltrados = useMemo(() => {
    if (!busqueda.trim()) return movimientosInvertidos;
    const q = normalizarTextoBusqueda(busqueda);
    return movimientosInvertidos.filter((m) => {
      const concepto = normalizarTextoBusqueda(m.conceptoTexto);
      const miembro = normalizarTextoBusqueda(m.miembroNombre);
      const rubro = normalizarTextoBusqueda(m.rubro?.nombre);
      const usuario = normalizarTextoBusqueda(
        m.creadoPor ? `${m.creadoPor.nombre} ${m.creadoPor.apellido}` : '',
      );
      const tipo = normalizarTextoBusqueda(obtenerEtiquetaTipoMovimiento(m.tipo).texto);
      const montoIn = String(m.montoIngreso || '');
      const montoEg = String(m.montoEgreso || '');
      const saldo = String(m.saldoAcumulado || '');

      return (
        concepto.includes(q) ||
        miembro.includes(q) ||
        rubro.includes(q) ||
        usuario.includes(q) ||
        tipo.includes(q) ||
        montoIn.includes(q) ||
        montoEg.includes(q) ||
        saldo.includes(q)
      );
    });
  }, [movimientosInvertidos, busqueda]);

  const totalMovimientos = movimientosFiltrados.length;
  const hayMasMovimientos = cantidadVisible < totalMovimientos;

  // Movimientos en orden cronológico respetando la búsqueda para exportación contable
  const movimientosAExportar = useMemo(() => {
    if (!busqueda.trim()) return movimientos;
    const q = normalizarTextoBusqueda(busqueda);
    return movimientos.filter((m) => {
      const concepto = normalizarTextoBusqueda(m.conceptoTexto);
      const miembro = normalizarTextoBusqueda(m.miembroNombre);
      const rubro = normalizarTextoBusqueda(m.rubro?.nombre);
      const usuario = normalizarTextoBusqueda(
        m.creadoPor ? `${m.creadoPor.nombre} ${m.creadoPor.apellido}` : '',
      );
      const tipo = normalizarTextoBusqueda(obtenerEtiquetaTipoMovimiento(m.tipo).texto);
      const montoIn = String(m.montoIngreso || '');
      const montoEg = String(m.montoEgreso || '');
      const saldo = String(m.saldoAcumulado || '');

      return (
        concepto.includes(q) ||
        miembro.includes(q) ||
        rubro.includes(q) ||
        usuario.includes(q) ||
        tipo.includes(q) ||
        montoIn.includes(q) ||
        montoEg.includes(q) ||
        saldo.includes(q)
      );
    });
  }, [movimientos, busqueda]);

  const prepararColumnasLibroDiario = (): ColumnaExportacion<MovimientoFinancieroItem>[] => [
    {
      header: 'Fecha',
      formatear: (m) => (m.fecha ? formatearFecha(m.fecha) : ''),
    },
    { header: 'Concepto / Detalle', formatear: (m) => m.conceptoTexto || '' },
    {
      header: 'Tipo',
      formatear: (m) => obtenerEtiquetaTipoMovimiento(m.tipo).texto,
    },
    { header: 'Miembro', formatear: (m) => m.miembroNombre || '' },
    { header: 'Rubro Contable', formatear: (m) => m.rubro?.nombre || '' },
    { header: 'N° Comprobante', formatear: (m) => m.gasto?.comprobanteNro || '' },
    { header: 'Ingreso (+)', formatear: (m) => Number(m.montoIngreso || 0) },
    { header: 'Egreso (-)', formatear: (m) => Number(m.montoEgreso || 0) },
    { header: 'Saldo Acumulado', formatear: (m) => Number(m.saldoAcumulado || 0) },
    {
      header: 'Registrado Por',
      formatear: (m) =>
        m.creadoPor ? `${m.creadoPor.nombre} ${m.creadoPor.apellido}`.trim() : '',
    },
  ];

  const handleExportarExcel = async () => {
    if (movimientosAExportar.length === 0) {
      if (onToastRef.current) onToastRef.current('No hay movimientos para exportar.', 'error');
      return;
    }
    const fechaHoy = new Date().toISOString().slice(0, 10);
    const nombreSanitizado = (cuentaActiva?.nombre || 'Cuenta').replace(/[^a-zA-Z0-9_-]/g, '_');
    const periodoTexto = `${fechaDesde ? formatearFecha(fechaDesde) : 'Histórico'} al ${fechaHasta ? formatearFecha(fechaHasta) : 'Hoy'}`;

    await exportarAExcel({
      nombreArchivo: `Libro_Diario_${nombreSanitizado}_${fechaHoy}`,
      nombreHoja: 'Libro Diario',
      columnas: prepararColumnasLibroDiario(),
      filas: movimientosAExportar,
      resumenSuperior: [
        { etiqueta: 'Grupo', valor: 'Grupo Scout Juan XXIII' },
        { etiqueta: 'Cuenta', valor: cuentaActiva?.nombre || '' },
        {
          etiqueta: 'Tipo de Cuenta',
          valor: cuentaActiva?.tipo === 'CAJA_EFECTIVO' ? 'Caja Chica / Efectivo' : 'Cuenta Bancaria',
        },
        { etiqueta: 'Período', valor: periodoTexto },
        { etiqueta: 'Saldo Anterior ($)', valor: libroDiario?.saldoAnterior ?? 0 },
        { etiqueta: 'Fecha de Emisión', valor: formatearFecha(new Date().toISOString()) },
      ],
      resumenInferior: [
        { etiqueta: 'Total Ingresos del Período ($)', valor: libroDiario?.totalIngresosPeriodo ?? 0 },
        { etiqueta: 'Total Egresos del Período ($)', valor: libroDiario?.totalEgresosPeriodo ?? 0 },
        { etiqueta: 'Saldo Final del Período ($)', valor: libroDiario?.saldoFinalPeriodo ?? 0 },
        { etiqueta: 'Saldo Actual Consolidado ($)', valor: libroDiario?.saldoActualConsolidado ?? 0 },
      ],
    });
    if (onToastRef.current) onToastRef.current('Libro diario exportado exitosamente a Excel.');
  };

  const handleExportarCSV = () => {
    if (movimientosAExportar.length === 0) {
      if (onToastRef.current) onToastRef.current('No hay movimientos para exportar.', 'error');
      return;
    }
    const fechaHoy = new Date().toISOString().slice(0, 10);
    const nombreSanitizado = (cuentaActiva?.nombre || 'Cuenta').replace(/[^a-zA-Z0-9_-]/g, '_');
    const periodoTexto = `${fechaDesde ? formatearFecha(fechaDesde) : 'Histórico'} al ${fechaHasta ? formatearFecha(fechaHasta) : 'Hoy'}`;

    exportarACSV({
      nombreArchivo: `Libro_Diario_${nombreSanitizado}_${fechaHoy}`,
      columnas: prepararColumnasLibroDiario(),
      filas: movimientosAExportar,
      resumenSuperior: [
        { etiqueta: 'Grupo', valor: 'Grupo Scout Juan XXIII' },
        { etiqueta: 'Cuenta', valor: cuentaActiva?.nombre || '' },
        {
          etiqueta: 'Tipo de Cuenta',
          valor: cuentaActiva?.tipo === 'CAJA_EFECTIVO' ? 'Caja Chica / Efectivo' : 'Cuenta Bancaria',
        },
        { etiqueta: 'Período', valor: periodoTexto },
        { etiqueta: 'Saldo Anterior ($)', valor: libroDiario?.saldoAnterior ?? 0 },
        { etiqueta: 'Fecha de Emisión', valor: formatearFecha(new Date().toISOString()) },
      ],
      resumenInferior: [
        { etiqueta: 'Total Ingresos del Período ($)', valor: libroDiario?.totalIngresosPeriodo ?? 0 },
        { etiqueta: 'Total Egresos del Período ($)', valor: libroDiario?.totalEgresosPeriodo ?? 0 },
        { etiqueta: 'Saldo Final del Período ($)', valor: libroDiario?.saldoFinalPeriodo ?? 0 },
        { etiqueta: 'Saldo Actual Consolidado ($)', valor: libroDiario?.saldoActualConsolidado ?? 0 },
      ],
    });
    if (onToastRef.current) onToastRef.current('Libro diario exportado exitosamente a CSV.');
  };

  // Lista recortada a mostrar según la paginación progresiva
  const movimientosVisibles = useMemo(() => {
    if (!expandido) {
      return movimientosFiltrados.slice(0, Math.min(TAMANIO_BLOQUE, totalMovimientos));
    }
    return movimientosFiltrados.slice(0, cantidadVisible);
  }, [movimientosFiltrados, expandido, cantidadVisible, totalMovimientos]);

  const cargarMasBloque = useCallback(() => {
    setCantidadVisible((prev) => Math.min(prev + TAMANIO_BLOQUE, totalMovimientos));
  }, [totalMovimientos]);

  // IntersectionObserver para carga progresiva automática por bloques a medida que se baja
  useEffect(() => {
    if (!expandido || !hayMasMovimientos) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          cargarMasBloque();
        }
      },
      { rootMargin: '250px' },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [expandido, hayMasMovimientos, cargarMasBloque]);

  return (
    <div className="space-y-5">
      {/* 1. Dynamic Account Tabs Strip */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 max-w-full">
          {cargandoCuentas && cuentas.length === 0 ? (
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
            onClick={() => {
              setCuentaAEditar(null);
              setModalCrearAbierto(true);
            }}
            leftIcon={<PlusCircle className="w-4 h-4" />}
            className="shrink-0"
          >
            Nueva Cuenta
          </Button>
        )}
      </div>

      {/* 2. Top Summary Hero Strip */}
      {cuentaActiva ? (
        <div className="p-4 sm:p-5 rounded-2xl border border-rule bg-paper-2 shadow-2xs transition-colors space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand/15 text-brand flex items-center justify-center shrink-0">
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

            <div className="p-3 sm:p-0 rounded-xl bg-surface sm:bg-transparent border sm:border-0 border-rule flex flex-col md:items-end">
              <span className="block text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                Saldo Disponible en Tiempo Real
              </span>
              <span className="text-2xl sm:text-3xl font-black text-ink tracking-tight mt-0.5">
                {formatearMoneda(saldoHero)}
              </span>
            </div>
          </div>

          {puedeGestionarTesoreria && (
            <div className="pt-3 border-t border-rule grid grid-cols-2 sm:flex sm:flex-wrap sm:items-center sm:justify-end gap-2">
              <Button
                type="button"
                variant="primary"
                size="md"
                onClick={() => {
                  setIngresoAEditar(null);
                  setModalIngresoAbierto(true);
                }}
                leftIcon={<PlusCircle className="w-4 h-4 shrink-0" />}
                className="bg-emerald-600 hover:bg-emerald-700 text-white justify-center text-xs sm:text-sm"
                title="Registrar ingreso de dinero a esta cuenta"
              >
                + Ingreso
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={() => {
                  setGastoAEditar(null);
                  setModalGastoAbierto(true);
                }}
                leftIcon={<Receipt className="w-4 h-4 shrink-0" />}
                className="text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-900/60 hover:bg-rose-50 dark:hover:bg-rose-950/40 justify-center text-xs sm:text-sm"
                title="Registrar gasto o egreso desde esta cuenta"
              >
                - Gasto
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={() => setModalTraspasoAbierto(true)}
                leftIcon={<ArrowLeftRight className="w-4 h-4 shrink-0" />}
                className="justify-center text-xs sm:text-sm"
              >
                Traspaso
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={() => {
                  setCuentaAEditar(cuentaActiva);
                  setModalCrearAbierto(true);
                }}
                leftIcon={<Pencil className="w-4 h-4 shrink-0" />}
                className="justify-center text-xs sm:text-sm"
              >
                Editar
              </Button>
            </div>
          )}
        </div>
      ) : cargandoCuentas ? (
        <div className="p-5 rounded-2xl border border-rule bg-paper-2/60 animate-pulse h-[106px] sm:h-[90px]" />
      ) : null}

      {/* 3. Date Filter / Arqueo Bar & Search */}
      <div className="p-3.5 sm:p-4 rounded-2xl border border-rule bg-surface shadow-2xs space-y-3">
        {/* Buscador en vivo del Libro Diario */}
        <div className="relative w-full">
          <Search className="w-4 h-4 text-ink-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            inputMode="search"
            placeholder="Buscar por concepto, miembro, rubro, tipo o monto..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full min-h-[42px] pl-10 pr-10 py-2 rounded-xl border border-rule text-xs sm:text-sm focus:border-brand outline-none bg-paper-2 text-ink placeholder:text-ink-muted transition-colors [&::-webkit-search-cancel-button]:hidden"
          />
          {busqueda && (
            <button
              type="button"
              onClick={() => setBusqueda('')}
              aria-label="Limpiar búsqueda"
              className="min-w-[36px] min-h-[36px] flex items-center justify-center absolute right-1 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-1 border-t border-rule/50">
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
          <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 w-full lg:w-auto">
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-1.5 text-xs text-ink-2">
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
                className="w-full sm:w-auto min-h-[36px] rounded-xl border border-rule bg-paper-2 px-2.5 py-1 text-xs text-ink focus:border-brand outline-none"
              />
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-1.5 text-xs text-ink-2">
              <label htmlFor="fecha-hasta-input" className="font-semibold text-ink-muted">
                Hasta:
              </label>
              <div className="flex items-center gap-1 w-full sm:w-auto">
                <input
                  id="fecha-hasta-input"
                  type="date"
                  value={fechaHasta}
                  onChange={(e) => {
                    setFechaHasta(e.target.value);
                    setFiltroRapido('todo');
                  }}
                  className="flex-1 sm:w-auto min-h-[36px] rounded-xl border border-rule bg-paper-2 px-2.5 py-1 text-xs text-ink focus:border-brand outline-none"
                />

                {hayFiltroFecha && (
                  <button
                    type="button"
                    onClick={() => aplicarFiltroRapido('todo')}
                    className="min-h-[36px] min-w-[36px] flex items-center justify-center p-2 text-ink-muted hover:text-ink rounded-xl border border-rule hover:bg-paper-2 transition cursor-pointer shrink-0"
                    title="Limpiar fechas"
                    aria-label="Limpiar fechas"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Chronological Ledger Table (Libro Diario) */}
      <div className="bg-surface rounded-2xl border border-rule shadow-xs overflow-hidden transition-colors">
        <div className="p-4 sm:p-5 border-b border-rule flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-brand" />
            <h4 className="font-extrabold text-ink text-base">
              Libro Diario de Movimientos
            </h4>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-ink-muted">
              {expandido && totalMovimientos > TAMANIO_BLOQUE
                ? `Mostrando ${movimientosVisibles.length} de ${totalMovimientos} operaciones`
                : `${totalMovimientos} ${totalMovimientos === 1 ? 'operación' : 'operaciones'}`}
            </span>
            <BotonExportar
              size="sm"
              disabled={totalMovimientos === 0}
              onExportarExcel={handleExportarExcel}
              onExportarCSV={handleExportarCSV}
              tituloTooltip="Exportar libro diario filtrado como hoja de cálculo"
            />
          </div>
        </div>

        {/* Loading state */}
        {estaCargando && (
          <div className="p-8 space-y-3">
            <div className="h-8 bg-paper-2 animate-pulse rounded-xl w-full" />
            <div className="h-8 bg-paper-2 animate-pulse rounded-xl w-full" />
            <div className="h-8 bg-paper-2 animate-pulse rounded-xl w-full" />
          </div>
        )}

        {/* Error state */}
        {!estaCargando && errorLibro && (
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

        {/* Empty state: sin resultados de búsqueda */}
        {!estaCargando &&
          !errorLibro &&
          cuentaSeleccionadaId &&
          movimientosInvertidos.length > 0 &&
          totalMovimientos === 0 && (
            <div className="p-10 text-center space-y-3">
              <Search className="w-8 h-8 text-ink-muted opacity-40 mx-auto" />
              <p className="text-sm font-bold text-ink">
                No se encontraron movimientos que coincidan con &ldquo;{busqueda}&rdquo;
              </p>
              <p className="text-xs text-ink-muted">
                Intentá con otro término o limpiá la búsqueda.
              </p>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setBusqueda('')}
                leftIcon={<X className="w-3.5 h-3.5" />}
                className="mx-auto"
              >
                Limpiar búsqueda
              </Button>
            </div>
          )}

        {/* Empty state: cuenta seleccionada sin movimientos en el período */}
        {!estaCargando &&
          !errorLibro &&
          cuentaSeleccionadaId &&
          movimientosInvertidos.length === 0 && (
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

        {/* Empty state: sin cuentas creadas */}
        {!estaCargando && !errorLibro && cuentas.length === 0 && (
          <div className="p-10 text-center space-y-2">
            <p className="text-sm font-bold text-ink">
              No hay cuentas financieras creadas
            </p>
            <p className="text-xs text-ink-muted max-w-md mx-auto">
              Crea una caja chica o cuenta bancaria para comenzar a registrar movimientos.
            </p>
          </div>
        )}

        {/* Desktop Ledger Table */}
        {!estaCargando && !errorLibro && cuentaSeleccionadaId && (totalMovimientos > 0 || hayFiltroFecha) && (
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
                  {puedeGestionarTesoreria && (
                    <th scope="col" className="py-3 px-4 text-center">Acciones</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {/* Movimientos cronológicos invertidos (más recientes primero) */}
                {movimientosVisibles.map((m) => {
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
                            {m.rubro?.nombre && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                                <Tag className="w-2.5 h-2.5" />
                                <span>{m.rubro.nombre}</span>
                              </span>
                            )}
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

                      {puedeGestionarTesoreria && (
                        <td className="py-3 px-4 whitespace-nowrap text-center">
                          {m.tipo === 'INGRESO_OTRO' && (
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setIngresoAEditar({
                                    id: m.id,
                                    fecha: m.fecha,
                                    montoIngreso: Number(m.montoIngreso),
                                    conceptoTexto: m.conceptoTexto,
                                    rubroId: m.rubroId || m.rubro?.id,
                                    cuentaId: m.cuentaId,
                                  });
                                  setModalIngresoAbierto(true);
                                }}
                                className="p-1.5 rounded-lg text-ink-muted hover:text-ink hover:bg-paper-2 transition cursor-pointer"
                                title="Modificar este ingreso"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setMovimientoAEliminar(m);
                                  setModalConfirmarEliminar(true);
                                }}
                                disabled={eliminandoId === m.id}
                                className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition cursor-pointer"
                                title="Eliminar este ingreso (deshacer disponible)"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                          {m.tipo === 'EGRESO_GASTO' && m.gastoId && (
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setGastoAEditar({
                                    id: m.gastoId!,
                                    fecha: m.fecha,
                                    monto: Number(m.montoEgreso),
                                    descripcion: m.gasto?.descripcion || m.conceptoTexto,
                                    rubroId: m.rubroId || m.rubro?.id || 0,
                                    cuentaId: m.cuentaId,
                                    comprobanteNro: m.gasto?.comprobanteNro ?? null,
                                  });
                                  setModalGastoAbierto(true);
                                }}
                                className="p-1.5 rounded-lg text-ink-muted hover:text-ink hover:bg-paper-2 transition cursor-pointer"
                                title="Modificar este gasto"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}

                {/* Fila final de Saldo Anterior cuando hay filtro de fecha (al final del historial invertido) */}
                {hayFiltroFecha && (!hayMasMovimientos || !expandido) && (
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
                    {puedeGestionarTesoreria && (
                      <td className="py-2.5 px-4 text-center text-ink-muted">-</td>
                    )}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Mobile Responsive Cards Fallback */}
        {!estaCargando && !errorLibro && cuentaSeleccionadaId && totalMovimientos > 0 && (
          <div className="md:hidden divide-y divide-rule">
            {movimientosVisibles.map((m) => {
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
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`font-semibold px-2 py-0.5 rounded-full border ${tipoConfig.badgeClass}`}
                      >
                        {tipoConfig.texto}
                      </span>
                      {m.rubro?.nombre && (
                        <span className="inline-flex items-center gap-1 font-bold px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                          <Tag className="w-2.5 h-2.5" />
                          <span>{m.rubro.nombre}</span>
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-ink-muted truncate">{usuarioNombre}</span>
                      {puedeGestionarTesoreria && m.tipo === 'INGRESO_OTRO' && (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setIngresoAEditar({
                                id: m.id,
                                fecha: m.fecha,
                                montoIngreso: Number(m.montoIngreso),
                                conceptoTexto: m.conceptoTexto,
                                rubroId: m.rubroId || m.rubro?.id,
                                cuentaId: m.cuentaId,
                              });
                              setModalIngresoAbierto(true);
                            }}
                            className="min-h-[34px] min-w-[34px] flex items-center justify-center p-1.5 rounded-lg text-ink-muted hover:text-ink hover:bg-paper-2 transition cursor-pointer"
                            title="Modificar ingreso"
                            aria-label="Modificar ingreso"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setMovimientoAEliminar(m);
                              setModalConfirmarEliminar(true);
                            }}
                            className="min-h-[34px] min-w-[34px] flex items-center justify-center p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition cursor-pointer"
                            title="Eliminar ingreso"
                            aria-label="Eliminar ingreso"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                      {puedeGestionarTesoreria && m.tipo === 'EGRESO_GASTO' && m.gastoId && (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setGastoAEditar({
                                id: m.gastoId!,
                                fecha: m.fecha,
                                monto: Number(m.montoEgreso),
                                descripcion: m.gasto?.descripcion || m.conceptoTexto,
                                rubroId: m.rubroId || m.rubro?.id || 0,
                                cuentaId: m.cuentaId,
                                comprobanteNro: m.gasto?.comprobanteNro ?? null,
                              });
                              setModalGastoAbierto(true);
                            }}
                            className="min-h-[34px] min-w-[34px] flex items-center justify-center p-1.5 rounded-lg text-ink-muted hover:text-ink hover:bg-paper-2 transition cursor-pointer"
                            title="Modificar gasto"
                            aria-label="Modificar gasto"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {hayFiltroFecha && (!hayMasMovimientos || !expandido) && (
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
          </div>
        )}

        {/* Sentinel para carga progresiva automática por bloques */}
        <div ref={sentinelRef} className="h-1 w-full" />

        {/* 1. Botón inicial: Ver movimientos anteriores */}
        {!expandido && totalMovimientos > TAMANIO_BLOQUE && (
          <div className="p-4 sm:p-5 text-center bg-paper-2/40 border-t border-rule flex flex-col items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => {
                setExpandido(true);
                setCantidadVisible(Math.min(TAMANIO_BLOQUE * 2, totalMovimientos));
              }}
              className="min-h-[42px] px-5 py-2.5 rounded-xl bg-brand text-brand-contrast font-extrabold text-xs hover:opacity-90 active:scale-98 transition flex items-center gap-2 cursor-pointer shadow-2xs"
            >
              <ChevronDown className="w-4 h-4" />
              <span>Ver movimientos anteriores ({totalMovimientos - TAMANIO_BLOQUE} más)</span>
            </button>
            <span className="text-[11px] text-ink-muted">
              Mostrando los {TAMANIO_BLOQUE} movimientos más recientes de {totalMovimientos}
            </span>
          </div>
        )}

        {/* 2. Estado expandido con más bloques pendientes */}
        {expandido && hayMasMovimientos && (
          <div className="p-4 text-center border-t border-rule flex flex-col sm:flex-row items-center justify-center gap-3 bg-paper-2/30">
            <div className="flex items-center gap-2 text-xs font-semibold text-ink-muted">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-brand" />
              <span>
                Cargando movimientos anteriores ({movimientosVisibles.length} de {totalMovimientos})...
              </span>
            </div>
            <button
              type="button"
              onClick={cargarMasBloque}
              className="text-[11px] font-bold text-brand hover:underline cursor-pointer"
            >
              Cargar siguientes {Math.min(TAMANIO_BLOQUE, totalMovimientos - cantidadVisible)} ahora
            </button>
          </div>
        )}

        {/* 3. Estado expandido: todos los movimientos cargados */}
        {expandido && !hayMasMovimientos && totalMovimientos > TAMANIO_BLOQUE && (
          <div className="p-3 bg-paper-2/40 border-t border-rule text-center text-[11px] text-ink-muted flex items-center justify-center gap-3 flex-wrap">
            <span>✓ Se mostraron todos los movimientos ({totalMovimientos})</span>
            <button
              type="button"
              onClick={() => {
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="font-bold text-brand hover:underline cursor-pointer flex items-center gap-1"
            >
              <ArrowUp className="w-3 h-3" />
              Volver arriba
            </button>
          </div>
        )}

        {/* 5. Bottom summary bar */}
        {!estaCargando && datosLibroListos && libroDiario && (
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
          cuentaAEditar={cuentaAEditar}
          onCerrar={() => {
            setModalCrearAbierto(false);
            setCuentaAEditar(null);
          }}
          onCuentaCreada={(cuentaGuardada) => {
            const nuevoId = cuentaGuardada?.id ?? cuentaAEditar?.id;
            cargarCuentas(nuevoId);
          }}
          onCuentaEliminada={(cuenta, eliminadoPermanente) => {
            cargarCuentas();
            mostrarToastConDeshacer(
              eliminadoPermanente
                ? `Cuenta "${cuenta.nombre}" eliminada.`
                : `Cuenta "${cuenta.nombre}" archivada como inactiva.`,
              async () => {
                try {
                  if (eliminadoPermanente) {
                    await api.post('/tesoreria/cuentas', {
                      nombre: cuenta.nombre,
                      tipo: cuenta.tipo,
                    });
                  } else {
                    await api.patch(`/tesoreria/cuentas/${cuenta.id}`, {
                      activa: true,
                    });
                  }
                  await cargarCuentas(cuenta.id);
                  useToastStore.getState().mostrarToast(`Cuenta "${cuenta.nombre}" restaurada.`);
                } catch (err: any) {
                  const msg = traducirErrorAmigable(err, 'No se pudo restaurar la cuenta.');
                  useToastStore.getState().mostrarToast(msg, 'error');
                }
              },
            );
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

      {modalIngresoAbierto && (
        <ModalRegistrarIngreso
          abierto={modalIngresoAbierto}
          ingresoAEditar={ingresoAEditar}
          cuentaIdInicial={cuentaSeleccionadaId}
          onCerrar={() => {
            setModalIngresoAbierto(false);
            setIngresoAEditar(null);
          }}
          onIngresoRegistrado={(msg) => {
            if (onToast) onToast(msg, 'exito');
            cargarCuentas(cuentaSeleccionadaId ?? undefined);
            cargarLibroDiario();
          }}
        />
      )}

      {modalGastoAbierto && (
        <ModalRegistrarGasto
          abierto={modalGastoAbierto}
          gastoAEditar={gastoAEditar}
          onCerrar={() => {
            setModalGastoAbierto(false);
            setGastoAEditar(null);
          }}
          onGastoRegistrado={(msg) => {
            if (onToast) onToast(msg, 'exito');
            cargarCuentas(cuentaSeleccionadaId ?? undefined);
            cargarLibroDiario();
          }}
        />
      )}

      {modalConfirmarEliminar && movimientoAEliminar && (
        <ModalConfirmacion
          abierto={modalConfirmarEliminar}
          onCerrar={() => !eliminandoId && setModalConfirmarEliminar(false)}
          onConfirmar={ejecutarEliminacionIngreso}
          titulo="Eliminar Ingreso"
          tipo="peligro"
          textoConfirmar={eliminandoId ? 'Eliminando...' : 'Sí, Eliminar Ingreso'}
          textoCancelar="Cancelar"
          cargando={Boolean(eliminandoId)}
          mensaje={
            <div className="space-y-3">
              <p className="text-sm text-ink leading-relaxed">
                ¿Estás seguro de que deseas eliminar el ingreso{' '}
                <strong className="text-ink font-bold">"{movimientoAEliminar.conceptoTexto}"</strong> por{' '}
                <strong className="text-ink font-bold">{formatearMoneda(Number(movimientoAEliminar.montoIngreso))}</strong>?
              </p>
              <p className="text-xs text-ink-muted leading-relaxed">
                El saldo de la cuenta se recalculará automáticamente. Podrás deshacer esta acción durante unos segundos.
              </p>
            </div>
          }
        />
      )}
    </div>
  );
};
