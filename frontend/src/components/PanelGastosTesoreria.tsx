import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { useToastStore, mostrarToastConDeshacer } from '../store/toastStore';
import { esErrorOffline, formatearMoneda, traducirErrorAmigable, formatearFechaHora, normalizarTextoBusqueda } from '../lib/formatters';
import { Button } from './ui/Button';
import { ModalRegistrarGasto } from './ModalRegistrarGasto';
import { ModalRegistrarIngreso } from './ModalRegistrarIngreso';
import { ModalConfirmacion } from './ModalConfirmacion';
import { ModalGestionRubros } from './ModalGestionRubros';
import {
  PlusCircle,
  Pencil,
  Calendar,
  RotateCcw,
  Ban,
  Building2,
  Wallet,
  Tag,
  AlertCircle,
  Search,
  X,
} from 'lucide-react';

export interface GastoItem {
  id: number;
  fecha: string;
  monto: number;
  descripcion: string;
  rubroId: number;
  cuentaId: number;
  comprobanteNro: string | null;
  comprobanteUrl: string | null;
  anulado: boolean;
  registradoPorId: number;
  rubro?: {
    id: number;
    nombre: string;
    tipo: string;
  };
  cuenta?: {
    id: number;
    nombre: string;
    tipo: 'CAJA_EFECTIVO' | 'BANCO';
  };
  registradoPor?: {
    id: number;
    nombre: string;
    apellido: string;
  };
}

export interface PanelGastosTesoreriaProps {
  onToast?: (texto: string, tipo?: 'exito' | 'error') => void;
}

export const PanelGastosTesoreria: React.FC<PanelGastosTesoreriaProps> = ({ onToast }) => {
  const onToastRef = useRef(onToast);
  useEffect(() => {
    onToastRef.current = onToast;
  }, [onToast]);
  const puedeGestionarTesoreria = useAuthStore((s) => s.tienePermiso('tesoreria.gestionar'));
  const [gastos, setGastos] = useState<GastoItem[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros
  const [busqueda, setBusqueda] = useState('');
  const [filtroCuentaId, setFiltroCuentaId] = useState<string>('TODAS');
  const [filtroRubroId, setFiltroRubroId] = useState<string>('TODOS');
  const [incluirAnulados, setIncluirAnulados] = useState(false);

  // Listas para filtros
  const [cuentas, setCuentas] = useState<Array<{ id: number; nombre: string }>>([]);
  const [rubros, setRubros] = useState<Array<{ id: number; nombre: string }>>([]);

  // Modal
  const [modalGastoAbierto, setModalGastoAbierto] = useState(false);
  const [modalIngresoAbierto, setModalIngresoAbierto] = useState(false);
  const [modalGestionRubrosAbierto, setModalGestionRubrosAbierto] = useState(false);
  const [gastoAEditar, setGastoAEditar] = useState<GastoItem | null>(null);
  const [gastoAAnular, setGastoAAnular] = useState<GastoItem | null>(null);
  const [modalConfirmarAnular, setModalConfirmarAnular] = useState(false);
  const [anulandoId, setAnulandoId] = useState<number | null>(null);

  const cargarDatos = useCallback(async () => {
    try {
      setCargando(true);
      setError(null);

      const params = new URLSearchParams();
      if (filtroCuentaId !== 'TODAS') params.append('cuentaId', filtroCuentaId);
      if (filtroRubroId !== 'TODOS') params.append('rubroId', filtroRubroId);
      if (incluirAnulados) params.append('incluirAnulados', 'true');

      const [resGastos, resCuentas, resRubros] = await Promise.all([
        api.get(`/tesoreria/gastos?${params.toString()}`),
        api.get('/tesoreria/cuentas'),
        api.get('/tesoreria/rubros?tipo=EGRESO'),
      ]);

      setGastos(Array.isArray(resGastos.data) ? resGastos.data : []);
      setCuentas(Array.isArray(resCuentas.data) ? resCuentas.data : []);
      setRubros(Array.isArray(resRubros.data) ? resRubros.data : []);
    } catch (err) {
      const msg = traducirErrorAmigable(err, 'No se pudieron cargar los gastos.');
      if (esErrorOffline(err, msg)) {
        setGastos((prev) => {
          if (prev.length === 0) {
            setError('Estás sin conexión y los gastos aún no han sido sincronizados en este dispositivo.');
          } else {
            setError(null);
          }
          return prev;
        });
      } else {
        setError(msg);
        onToastRef.current?.(msg, 'error');
      }
    } finally {
      setCargando(false);
    }
  }, [filtroCuentaId, filtroRubroId, incluirAnulados]);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  const handleAnular = (gasto: GastoItem) => {
    setGastoAAnular(gasto);
    setModalConfirmarAnular(true);
  };

  const ejecutarAnulacion = async () => {
    if (!gastoAAnular) return;
    const g = gastoAAnular;
    try {
      setAnulandoId(g.id);
      await api.post(`/tesoreria/gastos/${g.id}/anular`);
      setModalConfirmarAnular(false);
      setGastoAAnular(null);
      await cargarDatos();

      mostrarToastConDeshacer(
        `Gasto "${g.descripcion}" anulado (saldo restituido).`,
        async () => {
          try {
            await api.post(`/tesoreria/gastos/${g.id}/restaurar`);
            await cargarDatos();
            useToastStore.getState().mostrarToast('Gasto restaurado correctamente.');
          } catch (err: any) {
            const msg = traducirErrorAmigable(err, 'No se pudo restaurar el gasto.');
            useToastStore.getState().mostrarToast(msg, 'error');
          }
        },
      );
    } catch (err) {
      const msg = traducirErrorAmigable(err, 'No se pudo anular el gasto.');
      if (onToast) onToast(msg, 'error');
    } finally {
      setAnulandoId(null);
    }
  };

  // Métricas
  const gastosActivos = gastos.filter((g) => !g.anulado);
  const totalGastos = gastosActivos.reduce((acc, cur) => acc + Number(cur.monto), 0);
  const totalCaja = gastosActivos
    .filter((g) => g.cuenta?.tipo === 'CAJA_EFECTIVO')
    .reduce((acc, cur) => acc + Number(cur.monto), 0);
  const totalBanco = gastosActivos
    .filter((g) => g.cuenta?.tipo === 'BANCO')
    .reduce((acc, cur) => acc + Number(cur.monto), 0);

  // Filtrado reactivo por texto de búsqueda
  const gastosFiltrados = useMemo(() => {
    const q = normalizarTextoBusqueda(busqueda);
    if (!q) return gastos;

    return gastos.filter((g) => {
      const matchDesc = normalizarTextoBusqueda(g.descripcion).includes(q);
      const matchComprobante = g.comprobanteNro ? normalizarTextoBusqueda(g.comprobanteNro).includes(q) : false;
      const matchRubro = g.rubro?.nombre ? normalizarTextoBusqueda(g.rubro.nombre).includes(q) : false;
      const matchCuenta = g.cuenta?.nombre ? normalizarTextoBusqueda(g.cuenta.nombre).includes(q) : false;
      const matchMonto = String(g.monto).includes(q);
      const matchUsuario = g.registradoPor
        ? normalizarTextoBusqueda(`${g.registradoPor.nombre} ${g.registradoPor.apellido}`).includes(q)
        : false;

      return matchDesc || matchComprobante || matchRubro || matchCuenta || matchMonto || matchUsuario;
    });
  }, [gastos, busqueda]);

  return (
    <div className="space-y-4">
      {/* Barra Superior de Acciones de Egresos */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-extrabold text-ink leading-tight">
            Gestión de Gastos y Egresos
          </h3>
          <p className="text-xs text-ink-muted">
            Control de compras, facturas y salidas de fondos en tiempo real.
          </p>
        </div>

        {puedeGestionarTesoreria && (
          <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 w-full sm:w-auto">
            <Button
              variant="secondary"
              onClick={() => setModalIngresoAbierto(true)}
              className="gap-1.5 text-xs py-2 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 justify-center"
              title="Registrar ingreso manual de dinero"
            >
              <PlusCircle className="w-4 h-4 shrink-0" />
              <span>+ Ingreso</span>
            </Button>
            <Button
              variant="secondary"
              onClick={() => setModalGestionRubrosAbierto(true)}
              className="gap-1.5 text-xs py-2 justify-center"
              title="Administrar rubros contables"
            >
              <Tag className="w-4 h-4 shrink-0" />
              <span>Rubros</span>
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setGastoAEditar(null);
                setModalGastoAbierto(true);
              }}
              className="col-span-2 sm:col-span-1 gap-1.5 text-xs py-2 justify-center"
            >
              <PlusCircle className="w-4 h-4 shrink-0" />
              <span>Registrar Gasto</span>
            </Button>
          </div>
        )}
      </div>

      {/* Tarjetas de Resumen de Egresos */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-4 rounded-2xl bg-paper-2 border border-rule flex flex-col justify-between">
          <span className="text-xs font-semibold text-ink-muted">Total Gastos (Período)</span>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            {cargando ? (
              <>
                <div className="h-8 w-32 rounded-lg bg-paper-3 animate-pulse" aria-label="Cargando total de gastos" />
                <div className="h-4 w-16 rounded-md bg-paper-3 animate-pulse" />
              </>
            ) : (
              <>
                <span className="text-2xl font-black text-rose-600 dark:text-rose-400">
                  {formatearMoneda(totalGastos)}
                </span>
                <span className="text-xs font-bold text-ink-muted">
                  {gastosFiltrados.length} {gastosFiltrados.length === 1 ? 'gasto' : 'gastos'}
                  {busqueda && ` (de ${gastosActivos.length})`}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-paper-2 border border-rule flex flex-col justify-between">
          <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
            <Wallet className="w-3.5 h-3.5" />
            Pagado en Efectivo (Cajas)
          </span>
          <div className="mt-2">
            {cargando ? (
              <div className="h-8 w-32 rounded-lg bg-paper-3 animate-pulse" aria-label="Cargando total en efectivo" />
            ) : (
              <span className="text-2xl font-black text-ink">
                {formatearMoneda(totalCaja)}
              </span>
            )}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-paper-2 border border-rule flex flex-col justify-between">
          <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5" />
            Pagado por Transferencia (Bancos)
          </span>
          <div className="mt-2">
            {cargando ? (
              <div className="h-8 w-32 rounded-lg bg-paper-3 animate-pulse" aria-label="Cargando total por transferencia" />
            ) : (
              <span className="text-2xl font-black text-ink">
                {formatearMoneda(totalBanco)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Barra de Filtros y Buscador */}
      <div className="p-3.5 rounded-2xl bg-paper-2 border border-rule flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 flex-1 flex-wrap">
          {/* Input de Búsqueda */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por descripción, comprobante, rubro..."
              className="w-full pl-8 pr-7 py-2 rounded-xl bg-paper border border-rule text-xs font-medium text-ink placeholder:text-ink-muted focus:outline-brand"
            />
            {busqueda && (
              <button
                type="button"
                onClick={() => setBusqueda('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-ink-muted hover:text-ink rounded cursor-pointer"
                title="Limpiar búsqueda"
                aria-label="Limpiar búsqueda"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={filtroCuentaId}
              onChange={(e) => setFiltroCuentaId(e.target.value)}
              className="h-9 px-2.5 rounded-xl bg-paper border border-rule text-xs font-semibold text-ink focus:outline-none w-full sm:w-auto"
            >
              <option value="TODAS">Todas las Cuentas</option>
              {cuentas.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.nombre}
                </option>
              ))}
            </select>

            <select
              value={filtroRubroId}
              onChange={(e) => setFiltroRubroId(e.target.value)}
              className="h-9 px-2.5 rounded-xl bg-paper border border-rule text-xs font-semibold text-ink focus:outline-none w-full sm:w-auto"
            >
              <option value="TODOS">Todos los Rubros</option>
              {rubros.map((r) => (
                <option key={r.id} value={String(r.id)}>
                  {r.nombre}
                </option>
              ))}
            </select>

            <label className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-paper border border-rule text-xs font-semibold text-ink cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={incluirAnulados}
                onChange={(e) => setIncluirAnulados(e.target.checked)}
                className="rounded text-brand"
              />
              <span>Ver anulados</span>
            </label>
          </div>
        </div>

        <button
          type="button"
          onClick={cargarDatos}
          disabled={cargando}
          className="text-xs font-bold text-ink-muted hover:text-ink flex items-center justify-center sm:justify-start gap-1 cursor-pointer transition shrink-0 py-1"
        >
          <RotateCcw className={`w-3.5 h-3.5 ${cargando ? 'animate-spin' : ''}`} />
          <span>Actualizar</span>
        </button>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Tabla y Lista Responsive de Gastos */}
      <div className="rounded-2xl border border-rule bg-paper overflow-hidden shadow-xs">
        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-rule bg-paper-2 font-bold text-ink-muted">
                <th className="py-3 px-4">Fecha</th>
                <th className="py-3 px-4">Descripción</th>
                <th className="py-3 px-4">Rubro</th>
                <th className="py-3 px-4">Cuenta de Pago</th>
                <th className="py-3 px-4">Comprobante</th>
                <th className="py-3 px-4 text-right">Monto</th>
                <th className="py-3 px-4">Registrado por</th>
                <th className="py-3 px-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule font-medium">
              {cargando && gastos.length === 0 ? (
                <>
                  {[1, 2, 3, 4].map((i) => (
                    <tr key={i} className="animate-pulse">
                      <td className="py-3.5 px-4"><div className="h-3.5 w-24 rounded bg-paper-2" /></td>
                      <td className="py-3.5 px-4"><div className="h-3.5 w-40 rounded bg-paper-2" /></td>
                      <td className="py-3.5 px-4"><div className="h-5 w-20 rounded-md bg-paper-2" /></td>
                      <td className="py-3.5 px-4"><div className="h-5 w-24 rounded-md bg-paper-2" /></td>
                      <td className="py-3.5 px-4"><div className="h-3.5 w-16 rounded bg-paper-2" /></td>
                      <td className="py-3.5 px-4 text-right"><div className="h-4 w-20 rounded bg-paper-2 ml-auto" /></td>
                      <td className="py-3.5 px-4"><div className="h-3.5 w-24 rounded bg-paper-2" /></td>
                      <td className="py-3.5 px-4"><div className="h-4 w-12 rounded bg-paper-2 mx-auto" /></td>
                    </tr>
                  ))}
                </>
              ) : gastos.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-ink-muted">
                    No hay gastos registrados para los filtros seleccionados.
                  </td>
                </tr>
              ) : gastosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-ink-muted">
                    <p>No se encontraron gastos que coincidan con "{busqueda}".</p>
                    <button
                      type="button"
                      onClick={() => setBusqueda('')}
                      className="mt-1 text-xs text-brand font-bold hover:underline cursor-pointer"
                    >
                      Limpiar búsqueda
                    </button>
                  </td>
                </tr>
              ) : (
                gastosFiltrados.map((gasto) => (
                  <tr
                    key={gasto.id}
                    className={`hover:bg-paper-2/50 transition-colors ${
                      gasto.anulado ? 'opacity-50 line-through' : ''
                    }`}
                  >
                    <td className="py-3 px-4 whitespace-nowrap text-ink">
                      {formatearFechaHora(gasto.fecha)}
                    </td>

                    <td className="py-3 px-4 text-ink font-bold">
                      {gasto.descripcion}
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                        <Tag className="w-3 h-3" />
                        {gasto.rubro?.nombre || 'Sin rubro'}
                      </span>
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold border ${
                          gasto.cuenta?.tipo === 'CAJA_EFECTIVO'
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                            : 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                        }`}
                      >
                        {gasto.cuenta?.tipo === 'CAJA_EFECTIVO' ? (
                          <Wallet className="w-3 h-3" />
                        ) : (
                          <Building2 className="w-3 h-3" />
                        )}
                        {gasto.cuenta?.nombre || 'Cuenta'}
                      </span>
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap text-ink-muted font-mono text-[11px]">
                      {gasto.comprobanteNro || '-'}
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap text-right font-black text-rose-600 dark:text-rose-400">
                      {formatearMoneda(Number(gasto.monto))}
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap text-ink-muted text-[11px]">
                      {gasto.registradoPor
                        ? `${gasto.registradoPor.nombre} ${gasto.registradoPor.apellido}`
                        : '-'}
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap text-center">
                      {!gasto.anulado ? (
                        puedeGestionarTesoreria ? (
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setGastoAEditar(gasto);
                                setModalGastoAbierto(true);
                              }}
                              className="p-1.5 rounded-lg text-ink-muted hover:text-ink hover:bg-paper-2 transition cursor-pointer"
                              title="Modificar gasto"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAnular(gasto)}
                              disabled={anulandoId === gasto.id}
                              className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition cursor-pointer"
                              title="Anular gasto y restituir saldo a la cuenta"
                            >
                              <Ban className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] font-bold text-ink-muted">-</span>
                        )
                      ) : (
                        <span className="text-[11px] font-bold text-rose-500">Anulado</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Responsive Cards View */}
        <div className="md:hidden divide-y divide-rule">
          {cargando && gastos.length === 0 ? (
            <div className="p-3.5 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="p-3 rounded-xl bg-paper-2/60 animate-pulse space-y-2">
                  <div className="flex justify-between gap-3">
                    <div className="space-y-1.5 flex-1">
                      <div className="h-4 w-40 rounded bg-paper-3" />
                      <div className="h-3 w-24 rounded bg-paper-3" />
                    </div>
                    <div className="h-5 w-20 rounded bg-paper-3" />
                  </div>
                </div>
              ))}
            </div>
          ) : gastos.length === 0 ? (
            <div className="p-8 text-center text-xs text-ink-muted">
              No hay gastos registrados para los filtros seleccionados.
            </div>
          ) : gastosFiltrados.length === 0 ? (
            <div className="p-8 text-center text-xs text-ink-muted">
              <p>No se encontraron gastos que coincidan con "{busqueda}".</p>
              <button
                type="button"
                onClick={() => setBusqueda('')}
                className="mt-1 text-xs text-brand font-bold hover:underline cursor-pointer"
              >
                Limpiar búsqueda
              </button>
            </div>
          ) : (
            gastosFiltrados.map((gasto) => (
              <div
                key={gasto.id}
                className={`p-3.5 space-y-2 hover:bg-paper-2/40 transition ${
                  gasto.anulado ? 'opacity-50 line-through' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h5 className="font-bold text-ink text-sm leading-snug">
                      {gasto.descripcion}
                    </h5>
                    <span className="text-[11px] text-ink-muted flex items-center gap-1 mt-0.5">
                      <Calendar className="w-3 h-3 shrink-0" />
                      <span>{formatearFechaHora(gasto.fecha)}</span>
                    </span>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="font-black text-sm text-rose-600 dark:text-rose-400 block">
                      {formatearMoneda(Number(gasto.monto))}
                    </span>
                    {gasto.anulado ? (
                      <span className="text-[10px] font-bold text-rose-500">Anulado</span>
                    ) : (
                      gasto.comprobanteNro && (
                        <span className="text-[10px] text-ink-muted font-mono block">
                          #{gasto.comprobanteNro}
                        </span>
                      )
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-1 border-t border-rule/50">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                      <Tag className="w-2.5 h-2.5" />
                      <span>{gasto.rubro?.nombre || 'Sin rubro'}</span>
                    </span>

                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                        gasto.cuenta?.tipo === 'CAJA_EFECTIVO'
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                          : 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                      }`}
                    >
                      {gasto.cuenta?.tipo === 'CAJA_EFECTIVO' ? (
                        <Wallet className="w-2.5 h-2.5" />
                      ) : (
                        <Building2 className="w-2.5 h-2.5" />
                      )}
                      <span>{gasto.cuenta?.nombre || 'Cuenta'}</span>
                    </span>
                  </div>

                  {!gasto.anulado && puedeGestionarTesoreria && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setGastoAEditar(gasto);
                          setModalGastoAbierto(true);
                        }}
                        className="min-h-[34px] min-w-[34px] flex items-center justify-center p-1.5 rounded-lg text-ink-muted hover:text-ink hover:bg-paper-2 transition cursor-pointer"
                        title="Modificar gasto"
                        aria-label="Modificar gasto"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAnular(gasto)}
                        disabled={anulandoId === gasto.id}
                        className="min-h-[34px] min-w-[34px] flex items-center justify-center p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition cursor-pointer"
                        title="Anular gasto"
                        aria-label="Anular gasto"
                      >
                        <Ban className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <ModalRegistrarGasto
        abierto={modalGastoAbierto}
        gastoAEditar={gastoAEditar}
        onCerrar={() => {
          setModalGastoAbierto(false);
          setGastoAEditar(null);
        }}
        onGastoRegistrado={(msg) => {
          if (onToast) onToast(msg, 'exito');
          cargarDatos();
        }}
      />

      <ModalRegistrarIngreso
        abierto={modalIngresoAbierto}
        onCerrar={() => setModalIngresoAbierto(false)}
        onIngresoRegistrado={(msg) => {
          if (onToast) onToast(msg, 'exito');
          cargarDatos();
        }}
      />

      <ModalGestionRubros
        abierto={modalGestionRubrosAbierto}
        onCerrar={() => setModalGestionRubrosAbierto(false)}
        tipoFiltroInicial="EGRESO"
        onRubrosCambiados={cargarDatos}
      />

      {modalConfirmarAnular && gastoAAnular && (
        <ModalConfirmacion
          abierto={modalConfirmarAnular}
          onCerrar={() => !anulandoId && setModalConfirmarAnular(false)}
          onConfirmar={ejecutarAnulacion}
          titulo="Anular Gasto"
          tipo="peligro"
          textoConfirmar={anulandoId ? 'Anulando...' : 'Sí, Anular Gasto'}
          textoCancelar="Cancelar"
          cargando={Boolean(anulandoId)}
          mensaje={
            <div className="space-y-3">
              <p className="text-sm text-ink leading-relaxed">
                ¿Estás seguro de que deseas anular el gasto{' '}
                <strong className="text-ink font-bold">"{gastoAAnular.descripcion}"</strong> por{' '}
                <strong className="text-ink font-bold">{formatearMoneda(Number(gastoAAnular.monto))}</strong>?
              </p>
              <p className="text-xs text-ink-muted leading-relaxed">
                El dinero se restituirá al saldo de {gastoAAnular.cuenta?.nombre || 'la cuenta'}. Podrás deshacer esta acción durante unos segundos.
              </p>
            </div>
          }
        />
      )}
    </div>
  );
};
