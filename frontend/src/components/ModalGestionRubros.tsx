import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import { Button } from './ui/Button';
import { ModalConfirmacion } from './ModalConfirmacion';
import { ModalCrearRubro, type RubroAEditarItem } from './ModalCrearRubro';
import { useModalOverlay } from '../hooks/useModalOverlay';
import {
  Tag,
  PlusCircle,
  Pencil,
  Trash2,
  X,
  Search,
} from 'lucide-react';
import { traducirErrorAmigable } from '../lib/formatters';
import { useToastStore, mostrarToastConDeshacer } from '../store/toastStore';

export interface RubroContableCompleto {
  id: number;
  nombre: string;
  tipo: 'INGRESO' | 'EGRESO';
  permiteDescuentoDefault: boolean;
  activo: boolean;
  unidadId?: number | null;
  unidad?: { id: number; nombre: string } | null;
  _count?: {
    conceptos?: number;
    planesCuota?: number;
    gastos?: number;
    movimientos?: number;
  };
}

export interface ModalGestionRubrosProps {
  abierto: boolean;
  onCerrar: () => void;
  tipoFiltroInicial?: 'TODOS' | 'EGRESO' | 'INGRESO';
  onRubrosCambiados?: () => void;
}

export const ModalGestionRubros: React.FC<ModalGestionRubrosProps> = ({
  abierto,
  onCerrar,
  tipoFiltroInicial = 'TODOS',
  onRubrosCambiados,
}) => {
  const [rubros, setRubros] = useState<RubroContableCompleto[]>([]);
  const [cargando, setCargando] = useState(false);
  const [filtroTipo, setFiltroTipo] = useState<'TODOS' | 'EGRESO' | 'INGRESO'>(tipoFiltroInicial);
  const [busqueda, setBusqueda] = useState('');

  // Modales secundarios
  const [modalCrearAbierto, setModalCrearAbierto] = useState(false);
  const [rubroAEditar, setRubroAEditar] = useState<RubroAEditarItem | null>(null);
  const [rubroAEliminar, setRubroAEliminar] = useState<RubroContableCompleto | null>(null);
  const [modalConfirmarEliminar, setModalConfirmarEliminar] = useState(false);
  const [eliminando, setEliminando] = useState(false);

  const { backdropProps, contentProps } = useModalOverlay({
    abierto,
    onCerrar,
    bloqueado: eliminando || modalCrearAbierto || modalConfirmarEliminar,
  });

  const cargarRubros = useCallback(async () => {
    try {
      setCargando(true);
      const res = await api.get('/tesoreria/rubros');
      setRubros(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Error al cargar rubros:', err);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (abierto) {
      setFiltroTipo(tipoFiltroInicial);
      setBusqueda('');
      cargarRubros();
    }
  }, [abierto, tipoFiltroInicial, cargarRubros]);

  if (!abierto) return null;

  const rubrosFiltrados = rubros.filter((r) => {
    if (filtroTipo !== 'TODOS' && r.tipo !== filtroTipo) return false;
    if (busqueda.trim()) {
      return r.nombre.toLowerCase().includes(busqueda.trim().toLowerCase());
    }
    return true;
  });

  const handleEliminar = async () => {
    if (!rubroAEliminar) return;
    const r = { ...rubroAEliminar };
    setEliminando(true);

    try {
      const resDelete = await api.delete(`/tesoreria/rubros/${r.id}`);
      const eliminadoPermanente = resDelete.data?.eliminadoPermanente === true;
      setModalConfirmarEliminar(false);
      setRubroAEliminar(null);
      await cargarRubros();
      if (onRubrosCambiados) onRubrosCambiados();

      mostrarToastConDeshacer(
        `Rubro "${r.nombre}" eliminado.`,
        async () => {
          try {
            if (!eliminadoPermanente) {
              await api.post(`/tesoreria/rubros/${r.id}/restaurar`);
            } else {
              await api.post('/tesoreria/rubros', {
                nombre: r.nombre,
                tipo: r.tipo,
                permiteDescuentoDefault: r.permiteDescuentoDefault,
              });
            }
            await cargarRubros();
            if (onRubrosCambiados) onRubrosCambiados();
            useToastStore.getState().mostrarToast(`Rubro "${r.nombre}" restaurado.`);
          } catch (err2: any) {
            const msg = traducirErrorAmigable(err2, 'No se pudo restaurar el rubro.');
            useToastStore.getState().mostrarToast(msg, 'error');
          }
        },
      );
    } catch (err: any) {
      const msg = traducirErrorAmigable(err, 'No se pudo eliminar el rubro.');
      useToastStore.getState().mostrarToast(msg, 'error');
    } finally {
      setEliminando(false);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
        {...backdropProps}
      >
        <div
          className="bg-paper border border-rule w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[88dvh]"
          role="dialog"
          aria-modal="true"
          {...contentProps}
        >
          {/* Cabecera */}
          <div className="px-5 py-4 border-b border-rule flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-brand/15 text-brand flex items-center justify-center shrink-0">
                <Tag className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-ink">Administrar Rubros y Categorías</h3>
                <p className="text-xs text-ink-muted">
                  Gestiona las categorías de egresos (gastos) e ingresos (cuotas, eventos).
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onCerrar}
              className="p-1.5 rounded-lg text-ink-muted hover:text-ink hover:bg-paper-2 transition cursor-pointer"
              aria-label="Cerrar modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Barra de Filtros y Búsqueda */}
          <div className="p-4 border-b border-rule space-y-3 bg-paper-2/40 shrink-0">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              {/* Filtro por Tipo */}
              <div className="grid grid-cols-3 sm:flex items-center gap-1 bg-paper rounded-xl p-1 border border-rule w-full sm:w-fit">
                <button
                  type="button"
                  onClick={() => setFiltroTipo('TODOS')}
                  className={`px-2 sm:px-3 py-1.5 sm:py-1 rounded-lg text-xs font-bold transition cursor-pointer text-center ${
                    filtroTipo === 'TODOS'
                      ? 'bg-brand text-brand-contrast shadow-xs'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  Todos
                </button>
                <button
                  type="button"
                  onClick={() => setFiltroTipo('EGRESO')}
                  className={`px-2 sm:px-3 py-1.5 sm:py-1 rounded-lg text-xs font-bold transition cursor-pointer text-center ${
                    filtroTipo === 'EGRESO'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  Egresos
                </button>
                <button
                  type="button"
                  onClick={() => setFiltroTipo('INGRESO')}
                  className={`px-2 sm:px-3 py-1.5 sm:py-1 rounded-lg text-xs font-bold transition cursor-pointer text-center ${
                    filtroTipo === 'INGRESO'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  Ingresos
                </button>
              </div>

              {/* Botón Crear */}
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => {
                  setRubroAEditar(null);
                  setModalCrearAbierto(true);
                }}
                leftIcon={<PlusCircle className="w-4 h-4 shrink-0" />}
                className="w-full sm:w-auto justify-center"
              >
                Nuevo Rubro
              </Button>
            </div>

            {/* Buscador */}
            <div className="relative">
              <Search className="w-4 h-4 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar rubro por nombre..."
                className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-paper border border-rule text-xs font-medium text-ink focus:outline-none focus:ring-2 focus:ring-brand/30"
              />
              {busqueda && (
                <button
                  type="button"
                  onClick={() => setBusqueda('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-muted hover:text-ink"
                >
                  Limpiar
                </button>
              )}
            </div>
          </div>

          {/* Lista de Rubros */}
          <div className="p-4 overflow-y-auto flex-1 space-y-2">
            {cargando ? (
              <div className="py-12 text-center text-xs font-semibold text-ink-muted animate-pulse">
                Cargando categorías contables...
              </div>
            ) : rubrosFiltrados.length === 0 ? (
              <div className="py-12 text-center space-y-2">
                <Tag className="w-8 h-8 text-ink-muted mx-auto opacity-50" />
                <p className="text-xs font-bold text-ink">No se encontraron rubros.</p>
                <p className="text-[11px] text-ink-muted">
                  {busqueda ? 'Probá con otro término de búsqueda.' : 'Crea tu primera categoría con el botón superior.'}
                </p>
              </div>
            ) : (
              rubrosFiltrados.map((r) => (
                <div
                  key={r.id}
                  className="p-3 rounded-xl bg-surface border border-rule hover:border-rule-strong transition flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-black text-ink">{r.nombre}</span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider ${
                          r.tipo === 'EGRESO'
                            ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                            : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                        }`}
                      >
                        {r.tipo === 'EGRESO' ? 'Gasto' : 'Ingreso'}
                      </span>
                      {r.permiteDescuentoDefault && r.tipo === 'INGRESO' && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand/10 text-brand font-semibold">
                          Desc. Hermanos
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setRubroAEditar({
                          id: r.id,
                          nombre: r.nombre,
                          tipo: r.tipo,
                          permiteDescuentoDefault: r.permiteDescuentoDefault,
                          activo: r.activo,
                        });
                        setModalCrearAbierto(true);
                      }}
                      className="min-h-[34px] min-w-[34px] flex items-center justify-center p-1.5 rounded-lg text-ink-muted hover:text-ink hover:bg-paper-2 transition cursor-pointer"
                      title="Modificar rubro"
                      aria-label="Modificar rubro"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setRubroAEliminar(r);
                        setModalConfirmarEliminar(true);
                      }}
                      className="min-h-[34px] min-w-[34px] flex items-center justify-center p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition cursor-pointer"
                      title="Eliminar rubro"
                      aria-label="Eliminar rubro"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Pie */}
          <div className="p-3 border-t border-rule bg-paper-2/30 flex justify-end shrink-0">
            <Button type="button" variant="secondary" size="sm" onClick={onCerrar}>
              Cerrar
            </Button>
          </div>
        </div>
      </div>

      {/* Modal Crear / Editar Rubro Individual */}
      {modalCrearAbierto && (
        <ModalCrearRubro
          abierto={modalCrearAbierto}
          tipoDefault={filtroTipo !== 'TODOS' ? filtroTipo : 'EGRESO'}
          rubroAEditar={rubroAEditar}
          onCerrar={() => {
            setModalCrearAbierto(false);
            setRubroAEditar(null);
          }}
          onRubroCreado={() => {
            cargarRubros();
            if (onRubrosCambiados) onRubrosCambiados();
          }}
          onRubroEliminado={() => {
            cargarRubros();
            if (onRubrosCambiados) onRubrosCambiados();
          }}
        />
      )}

      {/* Modal Confirmación de Eliminación */}
      {modalConfirmarEliminar && rubroAEliminar && (
        <ModalConfirmacion
          abierto={modalConfirmarEliminar}
          onCerrar={() => !eliminando && setModalConfirmarEliminar(false)}
          onConfirmar={handleEliminar}
          titulo="Eliminar Rubro Contable"
          tipo="peligro"
          textoConfirmar={eliminando ? 'Eliminando...' : 'Sí, Eliminar Rubro'}
          textoCancelar="Cancelar"
          cargando={eliminando}
          mensaje={
            <div className="space-y-3">
              <p className="text-sm text-ink leading-relaxed">
                ¿Estás seguro de que deseas eliminar la categoría{' '}
                <strong className="text-ink font-bold">"{rubroAEliminar.nombre}"</strong>?
              </p>
              <p className="text-xs text-ink-muted leading-relaxed">
                Si la categoría ya tiene movimientos o gastos asociados, se archivará como inactiva para no alterar balances pasados. Podrás deshacer esta acción durante unos segundos.
              </p>
            </div>
          }
        />
      )}
    </>
  );
};
