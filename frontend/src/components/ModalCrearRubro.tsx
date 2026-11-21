import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { ModalConfirmacion } from './ModalConfirmacion';
import { useModalOverlay } from '../hooks/useModalOverlay';
import { X, Tag, PlusCircle, Pencil, Trash2, Building2 } from 'lucide-react';
import { traducirErrorAmigable } from '../lib/formatters';
import { useToastStore, mostrarToastConDeshacer } from '../store/toastStore';

export interface RubroAEditarItem {
  id: number;
  nombre: string;
  tipo: 'INGRESO' | 'EGRESO';
  unidadId?: number | null;
  permiteDescuentoDefault?: boolean;
  activo?: boolean;
}

export interface ModalCrearRubroProps {
  abierto: boolean;
  tipoDefault?: 'INGRESO' | 'EGRESO';
  onCerrar: () => void;
  onRubroCreado: (rubro: { id: number; nombre: string; tipo: 'INGRESO' | 'EGRESO'; unidadId?: number | null }) => void;
  rubroAEditar?: RubroAEditarItem | null;
  onRubroEliminado?: (rubro: RubroAEditarItem) => void;
  onToast?: (texto: string, tipo?: 'exito' | 'error') => void;
}

export const ModalCrearRubro: React.FC<ModalCrearRubroProps> = ({
  abierto,
  tipoDefault = 'EGRESO',
  onCerrar,
  onRubroCreado,
  rubroAEditar,
  onRubroEliminado,
  onToast,
}) => {
  const esModoEdicion = Boolean(rubroAEditar);
  const asignaciones = useAuthStore((s) => s.asignaciones);
  const tienePermisoGlobal = useAuthStore((s) => s.tienePermisoGlobal);
  const obtenerUnidadesConPermiso = useAuthStore((s) => s.obtenerUnidadesConPermiso);
  const permisosRubros = [
    'caja.editar',
    'planes.editar',
    'caja.editar',
  ] as const;
  const esGlobalRubros = tienePermisoGlobal(permisosRubros);
  const unidadesPermitidasIds = useMemo(
    () => obtenerUnidadesConPermiso(permisosRubros),
    [asignaciones, obtenerUnidadesConPermiso],
  );

  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState<'INGRESO' | 'EGRESO'>(tipoDefault);
  const [unidadId, setUnidadId] = useState<string>('');
  const [unidadesCargadas, setUnidadesCargadas] = useState<
    Array<{ id: number; nombre: string; activa?: boolean }>
  >([]);
  const [permiteDescuentoDefault, setPermiteDescuentoDefault] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [modalConfirmarEliminar, setModalConfirmarEliminar] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { backdropProps, contentProps } = useModalOverlay({
    abierto,
    onCerrar,
    bloqueado: guardando || eliminando,
  });

  useEffect(() => {
    if (!abierto) return;
    api
      .get('/organizacion/unidades')
      .then((res) => {
        if (Array.isArray(res.data)) setUnidadesCargadas(res.data);
      })
      .catch(() => {
        // Fallback desde asignaciones del actor si no tiene organizacion.ver
      });
  }, [abierto]);

  const unidadesDisponibles = useMemo(() => {
    const base = unidadesCargadas.filter((u) => u.activa !== false);
    if (esGlobalRubros) return base;
    if (base.length > 0) {
      const filtradas = base.filter((u) => unidadesPermitidasIds.includes(u.id));
      if (filtradas.length > 0) return filtradas;
    }
    const desdeAsigs = new Map<number, string>();
    for (const a of asignaciones) {
      if (unidadesPermitidasIds.includes(a.unidadId)) {
        desdeAsigs.set(a.unidadId, a.unidadNombre);
      }
    }
    return Array.from(desdeAsigs.entries()).map(([id, nom]) => ({ id, nombre: nom }));
  }, [unidadesCargadas, esGlobalRubros, unidadesPermitidasIds, asignaciones]);

  useEffect(() => {
    if (abierto) {
      if (rubroAEditar) {
        setNombre(rubroAEditar.nombre);
        setTipo(rubroAEditar.tipo);
        setUnidadId(rubroAEditar.unidadId ? String(rubroAEditar.unidadId) : '');
        setPermiteDescuentoDefault(Boolean(rubroAEditar.permiteDescuentoDefault));
      } else {
        setNombre('');
        setTipo(tipoDefault);
        setUnidadId('');
        setPermiteDescuentoDefault(tipoDefault === 'INGRESO');
      }
      setError(null);
    }
    // Solo al abrir: si dependiera de unidadesDisponibles, la llegada de /organizacion/unidades
    // borraba lo que el usuario ya había escrito.
  }, [abierto, tipoDefault, rubroAEditar]);

  // Preseleccionar la unidad cuando llegan las unidades, sin tocar el resto del formulario.
  useEffect(() => {
    if (!abierto || rubroAEditar || esGlobalRubros || unidadesDisponibles.length === 0) return;
    setUnidadId((prev) => prev || String(unidadesDisponibles[0].id));
  }, [abierto, rubroAEditar, esGlobalRubros, unidadesDisponibles]);

  if (!abierto) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) {
      setError('El nombre de la categoría es obligatorio');
      return;
    }
    if (!esGlobalRubros && !unidadId) {
      setError('Seleccioná la rama a la que pertenece este rubro.');
      return;
    }

    const unidadIdPayload = esGlobalRubros
      ? unidadId
        ? Number(unidadId)
        : null
      : Number(unidadId);

    try {
      setGuardando(true);
      setError(null);

      if (esModoEdicion && rubroAEditar) {
        const nombreAnterior = rubroAEditar.nombre;
        const descuentoAnterior = rubroAEditar.permiteDescuentoDefault;
        const unidadAnterior = rubroAEditar.unidadId ?? null;
        const nombreNuevo = nombre.trim();
        const descuentoNuevo = tipo === 'INGRESO' ? permiteDescuentoDefault : false;

        const res = await api.patch(`/tesoreria/rubros/${rubroAEditar.id}`, {
          nombre: nombreNuevo,
          permiteDescuentoDefault: descuentoNuevo,
          ...(esGlobalRubros ? { unidadId: unidadIdPayload } : { unidadId: unidadIdPayload }),
        });
        onRubroCreado(res.data);
        onCerrar();

        mostrarToastConDeshacer(
          `Rubro modificado a "${nombreNuevo}".`,
          async () => {
            try {
              const resUndo = await api.patch(`/tesoreria/rubros/${rubroAEditar.id}`, {
                nombre: nombreAnterior,
                permiteDescuentoDefault: descuentoAnterior,
                ...(unidadAnterior !== null || esGlobalRubros
                  ? { unidadId: unidadAnterior }
                  : {}),
              });
              onRubroCreado(resUndo.data);
              useToastStore.getState().mostrarToast(`Rubro restaurado a "${nombreAnterior}".`);
            } catch (errUndo: any) {
              const msg = traducirErrorAmigable(errUndo, 'No se pudo revertir la modificación.');
              useToastStore.getState().mostrarToast(msg, 'error');
            }
          },
        );
      } else {
        const res = await api.post('/tesoreria/rubros', {
          nombre: nombre.trim(),
          tipo,
          unidadId: unidadIdPayload,
          permiteDescuentoDefault: tipo === 'INGRESO' ? permiteDescuentoDefault : false,
        });
        if (onToast) onToast(`Rubro "${nombre.trim()}" creado.`);
        onRubroCreado(res.data);
        onCerrar();
      }
    } catch (err) {
      setError(traducirErrorAmigable(err, esModoEdicion ? 'No se pudo actualizar el rubro.' : 'No se pudo crear la categoría o rubro.'));
    } finally {
      setGuardando(false);
    }
  };

  const handleEliminarRubro = async () => {
    if (!rubroAEditar) return;
    const rubroAEliminar = { ...rubroAEditar };
    setEliminando(true);
    try {
      const resDelete = await api.delete(`/tesoreria/rubros/${rubroAEliminar.id}`);
      const eliminadoPermanente = resDelete.data?.eliminadoPermanente === true;
      setModalConfirmarEliminar(false);
      onCerrar();
      if (onRubroEliminado) onRubroEliminado(rubroAEliminar);

      mostrarToastConDeshacer(
        `Rubro "${rubroAEliminar.nombre}" eliminado.`,
        async () => {
          try {
            if (!eliminadoPermanente) {
              await api.post(`/tesoreria/rubros/${rubroAEliminar.id}/restaurar`);
              if (onRubroEliminado) onRubroEliminado(rubroAEliminar);
            } else {
              const res = await api.post('/tesoreria/rubros', {
                nombre: rubroAEliminar.nombre,
                tipo: rubroAEliminar.tipo,
                unidadId: rubroAEliminar.unidadId ?? null,
                permiteDescuentoDefault: rubroAEliminar.permiteDescuentoDefault,
              });
              if (onRubroCreado && res.data?.id) onRubroCreado(res.data);
              else if (onRubroEliminado) onRubroEliminado(rubroAEliminar);
            }
            useToastStore.getState().mostrarToast(`Rubro "${rubroAEliminar.nombre}" restaurado.`);
          } catch (err2: any) {
            const msg = traducirErrorAmigable(err2, 'No se pudo restaurar el rubro.');
            useToastStore.getState().mostrarToast(msg, 'error');
          }
        },
      );
    } catch (err) {
      const msg = traducirErrorAmigable(err, 'No se pudo eliminar el rubro.');
      setError(msg);
      if (onToast) onToast(msg, 'error');
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
          className="bg-paper border border-rule w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col"
          {...contentProps}
        >
          <div className="px-5 py-4 border-b border-rule flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-brand/10 text-brand flex items-center justify-center">
                {esModoEdicion ? <Pencil className="w-4 h-4" /> : <Tag className="w-4 h-4" />}
              </div>
              <h3 className="text-base sm:text-lg font-black text-ink">
                {esModoEdicion ? 'Editar Categoría / Rubro' : 'Nueva Categoría / Rubro Contable'}
              </h3>
            </div>
            {!guardando && !eliminando && (
              <button
                type="button"
                onClick={onCerrar}
                className="p-1.5 rounded-lg text-ink-muted hover:text-ink hover:bg-paper-2 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            {error && (
              <div role="alert" className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-sm font-semibold">
                {error}
              </div>
            )}

            {!esModoEdicion && (
              <div>
                <label className="text-[13px] font-bold text-ink block mb-1.5">
                  Tipo de Rubro
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    aria-pressed={tipo === 'INGRESO'}
                    type="button"
                    onClick={() => {
                      setTipo('INGRESO');
                      setPermiteDescuentoDefault(true);
                    }}
                    className={`min-h-[44px] py-2 px-3.5 rounded-xl text-[13px] font-bold border transition cursor-pointer text-center ${
                      tipo === 'INGRESO'
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
                        : 'bg-paper-2 text-ink-muted border-rule hover:text-ink'
                    }`}
                  >
                    Ingreso (Cobro)
                  </button>
                  <button
                    aria-pressed={tipo === 'EGRESO'}
                    type="button"
                    onClick={() => {
                      setTipo('EGRESO');
                      setPermiteDescuentoDefault(false);
                    }}
                    className={`min-h-[44px] py-2 px-3.5 rounded-xl text-[13px] font-bold border transition cursor-pointer text-center ${
                      tipo === 'EGRESO'
                        ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-700'
                        : 'bg-paper-2 text-ink-muted border-rule hover:text-ink'
                    }`}
                  >
                    Egreso (Gasto)
                  </button>
                </div>
              </div>
            )}

            <div>
              <label className="text-[13px] font-bold text-ink block mb-1.5">
                Nombre de la Categoría
              </label>
              <Input
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder={
                  tipo === 'INGRESO'
                    ? 'Ej: Cuota Taller de Nudos, Remera de Grupo, Seguro'
                    : 'Ej: Ferretería y Pintura, Combustible, Azúcar'
                }
                autoFocus
                disabled={guardando || eliminando}
                required
              />
            </div>

            {esGlobalRubros ? (
              <div>
                <label className="text-xs font-bold text-ink block mb-1">
                  Alcance / Rama
                </label>
                <select
                  value={unidadId}
                  onChange={(e) => setUnidadId(e.target.value)}
                  disabled={guardando || eliminando}
                  className="w-full h-10 px-3 rounded-xl bg-paper-2 border border-rule text-xs font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-brand/30"
                >
                  <option value="">General del Grupo</option>
                  {unidadesDisponibles.map((u) => (
                    <option key={u.id} value={String(u.id)}>
                      {u.nombre}
                    </option>
                  ))}
                </select>
              </div>
            ) : unidadesDisponibles.length > 1 ? (
              <div>
                <label className="text-xs font-bold text-ink block mb-1">
                  Rama del Rubro *
                </label>
                <select
                  value={unidadId}
                  onChange={(e) => setUnidadId(e.target.value)}
                  disabled={guardando || eliminando}
                  required
                  className="w-full h-10 px-3 rounded-xl bg-paper-2 border border-rule text-xs font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-brand/30"
                >
                  {unidadesDisponibles.map((u) => (
                    <option key={u.id} value={String(u.id)}>
                      {u.nombre}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              unidadesDisponibles.length === 1 && (
                <div className="p-2.5 rounded-xl bg-paper-2 border border-rule text-xs flex items-center justify-between text-ink-2">
                  <span className="flex items-center gap-1.5 font-semibold">
                    <Building2 className="w-3.5 h-3.5 text-brand" />
                    <span>Alcance:</span>
                  </span>
                  <span className="font-bold text-ink">{unidadesDisponibles[0].nombre}</span>
                </div>
              )
            )}

            {tipo === 'INGRESO' && (
              <label className="flex items-start gap-2.5 p-3.5 rounded-xl bg-paper-2 border border-rule cursor-pointer">
                <input
                  type="checkbox"
                  checked={permiteDescuentoDefault}
                  onChange={(e) => setPermiteDescuentoDefault(e.target.checked)}
                  disabled={guardando || eliminando}
                  className="mt-0.5 w-4 h-4 rounded text-brand focus:ring-brand"
                />
                <span className="text-[13px] text-ink">
                  <strong>Permitir descuento por hermanos por defecto</strong>
                  <span className="block text-xs text-ink-muted mt-0.5">
                    Si se tilda, los cobros creados bajo este rubro aplicarán el % familiar predeterminado.
                  </span>
                </span>
              </label>
            )}

            <div className="pt-3 flex items-center justify-between gap-2 border-t border-rule">
              {esModoEdicion ? (
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  onClick={() => setModalConfirmarEliminar(true)}
                  disabled={guardando || eliminando}
                  className="gap-1.5"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Eliminar</span>
                </Button>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={onCerrar}
                  disabled={guardando || eliminando}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={guardando || eliminando || !nombre.trim()}
                  className="gap-1.5"
                >
                  {esModoEdicion ? <Pencil className="w-4 h-4" /> : <PlusCircle className="w-4 h-4" />}
                  <span>
                    {guardando
                      ? 'Guardando...'
                      : esModoEdicion
                      ? 'Guardar Modificaciones'
                      : 'Crear Categoría'}
                  </span>
                </Button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {modalConfirmarEliminar && rubroAEditar && (
        <ModalConfirmacion
          abierto={modalConfirmarEliminar}
          onCerrar={() => !eliminando && setModalConfirmarEliminar(false)}
          onConfirmar={handleEliminarRubro}
          titulo="Eliminar Rubro Contable"
          tipo="peligro"
          textoConfirmar={eliminando ? 'Eliminando...' : 'Sí, Eliminar Rubro'}
          textoCancelar="Cancelar"
          cargando={eliminando}
          mensaje={
            <div className="space-y-3">
              <p className="text-sm text-ink leading-relaxed">
                ¿Estás seguro de que deseas eliminar o desactivar el rubro{' '}
                <strong className="text-ink font-bold">"{rubroAEditar.nombre}"</strong>?
              </p>
              <p className="text-xs text-ink-muted leading-relaxed">
                Si el rubro ya tiene gastos o movimientos contables asociados, se archivará como inactivo para no alterar los libros históricos. Podrás deshacer esta acción durante unos segundos.
              </p>
            </div>
          }
        />
      )}
    </>
  );
};
