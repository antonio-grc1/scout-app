import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import { formatearMoneda, traducirErrorAmigable } from '../lib/formatters';
import { Button } from './ui/Button';
import { ModalRegistrarGasto } from './ModalRegistrarGasto';
import {
  Receipt,
  PlusCircle,
  Filter,
  Calendar,
  RotateCcw,
  Ban,
  Building2,
  Wallet,
  Tag,
  AlertCircle,
  FileSpreadsheet,
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

function formatearFecha(fechaIso?: string | null): string {
  if (!fechaIso) return '-';
  try {
    const d = new Date(fechaIso);
    if (isNaN(d.getTime())) return fechaIso;
    return d.toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return fechaIso;
  }
}

export const PanelGastosTesoreria: React.FC<PanelGastosTesoreriaProps> = ({ onToast }) => {
  const [gastos, setGastos] = useState<GastoItem[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filtros
  const [filtroCuentaId, setFiltroCuentaId] = useState<string>('TODAS');
  const [filtroRubroId, setFiltroRubroId] = useState<string>('TODOS');
  const [incluirAnulados, setIncluirAnulados] = useState(false);

  // Listas para filtros
  const [cuentas, setCuentas] = useState<Array<{ id: number; nombre: string }>>([]);
  const [rubros, setRubros] = useState<Array<{ id: number; nombre: string }>>([]);

  // Modal
  const [modalGastoAbierto, setModalGastoAbierto] = useState(false);
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
      setError(msg);
      if (onToast) onToast(msg, 'error');
    } finally {
      setCargando(false);
    }
  }, [filtroCuentaId, filtroRubroId, incluirAnulados, onToast]);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  const handleAnular = async (gasto: GastoItem) => {
    if (
      !window.confirm(
        `¿Seguro que deseas anular el gasto "${gasto.descripcion}" por ${formatearMoneda(
          Number(gasto.monto),
        )}? El dinero se restituirá al saldo de ${gasto.cuenta?.nombre || 'la cuenta'}.`,
      )
    ) {
      return;
    }

    try {
      setAnulandoId(gasto.id);
      await api.post(`/tesoreria/gastos/${gasto.id}/anular`);
      if (onToast) onToast('Gasto anulado y saldo restituido correctamente', 'exito');
      cargarDatos();
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

  return (
    <div className="space-y-4">
      {/* Tarjetas de Resumen de Egresos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-4 rounded-2xl bg-paper-2 border border-rule flex flex-col justify-between">
          <span className="text-xs font-semibold text-ink-muted">Total Gastos (Período)</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black text-rose-600 dark:text-rose-400">
              {formatearMoneda(totalGastos)}
            </span>
            <span className="text-xs font-bold text-ink-muted">
              {gastosActivos.length} {gastosActivos.length === 1 ? 'gasto' : 'gastos'}
            </span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-paper-2 border border-rule flex flex-col justify-between">
          <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
            <Wallet className="w-3.5 h-3.5" />
            Pagado en Efectivo (Cajas)
          </span>
          <div className="mt-2">
            <span className="text-2xl font-black text-ink">
              {formatearMoneda(totalCaja)}
            </span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-paper-2 border border-rule flex flex-col justify-between">
          <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5" />
            Pagado por Transferencia (Bancos)
          </span>
          <div className="mt-2">
            <span className="text-2xl font-black text-ink">
              {formatearMoneda(totalBanco)}
            </span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-paper-2 border border-rule flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-ink-muted block">¿Tenés un nuevo gasto?</span>
            <span className="text-xs text-ink-muted block mt-0.5">Impacta en tiempo real</span>
          </div>
          <Button
            variant="primary"
            onClick={() => setModalGastoAbierto(true)}
            className="gap-1.5 shrink-0"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Registrar Gasto</span>
          </Button>
        </div>
      </div>

      {/* Barra de Filtros */}
      <div className="p-3.5 rounded-2xl bg-paper-2 border border-rule flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs font-bold text-ink-muted">
            <Filter className="w-3.5 h-3.5" />
            <span>Filtrar:</span>
          </div>

          <select
            value={filtroCuentaId}
            onChange={(e) => setFiltroCuentaId(e.target.value)}
            className="h-9 px-2.5 rounded-xl bg-paper border border-rule text-xs font-semibold text-ink focus:outline-none"
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
            className="h-9 px-2.5 rounded-xl bg-paper border border-rule text-xs font-semibold text-ink focus:outline-none"
          >
            <option value="TODOS">Todos los Rubros</option>
            {rubros.map((r) => (
              <option key={r.id} value={String(r.id)}>
                {r.nombre}
              </option>
            ))}
          </select>

          <label className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-paper border border-rule text-xs font-semibold text-ink cursor-pointer">
            <input
              type="checkbox"
              checked={incluirAnulados}
              onChange={(e) => setIncluirAnulados(e.target.checked)}
              className="rounded text-brand"
            />
            <span>Ver anulados</span>
          </label>
        </div>

        <button
          type="button"
          onClick={cargarDatos}
          disabled={cargando}
          className="text-xs font-bold text-ink-muted hover:text-ink flex items-center gap-1 cursor-pointer transition"
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

      {/* Tabla de Gastos */}
      <div className="rounded-2xl border border-rule bg-paper overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
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
                <tr>
                  <td colSpan={8} className="py-12 text-center text-ink-muted">
                    Cargando gastos operativos...
                  </td>
                </tr>
              ) : gastos.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-ink-muted">
                    No hay gastos registrados para los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                gastos.map((gasto) => (
                  <tr
                    key={gasto.id}
                    className={`hover:bg-paper-2/50 transition-colors ${
                      gasto.anulado ? 'opacity-50 line-through' : ''
                    }`}
                  >
                    <td className="py-3 px-4 whitespace-nowrap text-ink">
                      {formatearFecha(gasto.fecha)}
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
                        <button
                          type="button"
                          onClick={() => handleAnular(gasto)}
                          disabled={anulandoId === gasto.id}
                          className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition cursor-pointer"
                          title="Anular gasto y restituir saldo a la cuenta"
                        >
                          <Ban className="w-4 h-4" />
                        </button>
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
      </div>

      <ModalRegistrarGasto
        abierto={modalGastoAbierto}
        onCerrar={() => setModalGastoAbierto(false)}
        onGastoRegistrado={(msg) => {
          if (onToast) onToast(msg, 'exito');
          cargarDatos();
        }}
      />
    </div>
  );
};
