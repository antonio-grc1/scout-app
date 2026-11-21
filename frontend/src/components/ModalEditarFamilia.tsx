import React, { useEffect, useMemo, useState } from 'react';
import { useModalOverlay } from '../hooks/useModalOverlay';
import { useConfirmar } from '../hooks/useConfirmar';
import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { X, Users, Percent, Check, AlertCircle, UserMinus, Trash2 } from 'lucide-react';
import { obtenerRolPrincipal, traducirErrorAmigable } from '../lib/formatters';
import { puedeDesvincularIntegrantePorAlcance } from '../lib/permisos';

interface Props {
  abierto: boolean;
  familia: {
    id: number;
    nombreFamilia: string;
    porcentajeDescuentoHermanos: number | string;
    miembros?: any[];
  } | null;
  onCerrar: () => void;
  /** Recibe el mensaje de la acción realizada (guardar, quitar a alguien, disolver). */
  onGuardado: (mensaje: string) => void;
  embedded?: boolean;
}

export const ModalEditarFamilia: React.FC<Props> = ({
  abierto,
  familia,
  onCerrar,
  onGuardado,
  embedded = false,
}) => {
  const { tienePermisoGlobal, obtenerUnidadesConPermiso, asignaciones } = useAuthStore();
  const puedeDisolverGrupo = tienePermisoGlobal(['cobranzas.editar', 'caja.editar']);
  const esGlobalFamilia = tienePermisoGlobal([
    'padron.editar',
    'cobranzas.editar',
    'caja.editar',
  ]);
  const unidadesFamiliaIds = useMemo(
    () =>
      obtenerUnidadesConPermiso(['padron.editar', 'cobranzas.editar', 'caja.editar']),
    [obtenerUnidadesConPermiso, asignaciones],
  );
  const puedeOperarFamilia = esGlobalFamilia || unidadesFamiliaIds.length > 0;
  const [nombreFamilia, setNombreFamilia] = useState('');
  const [porcentajeDescuento, setPorcentajeDescuento] = useState<number>(0);
  const [miembrosLocal, setMiembrosLocal] = useState<any[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [desvinculandoId, setDesvinculandoId] = useState<number | null>(null);
  const [eliminandoGrupo, setEliminandoGrupo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { pedir: pedirConfirmacion, dialogo: dialogoConfirmacion } = useConfirmar();

  const { backdropProps, contentProps } = useModalOverlay({
    abierto: !embedded && abierto,
    onCerrar,
    bloqueado: guardando || Boolean(desvinculandoId) || eliminandoGrupo,
  });

  useEffect(() => {
    if (familia) {
      setNombreFamilia(familia.nombreFamilia || '');
      setPorcentajeDescuento(Number(familia.porcentajeDescuentoHermanos ?? 0));
      setMiembrosLocal(familia.miembros || []);
      setError(null);
    }
  }, [familia]);

  if (!abierto || !familia) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombreFamilia.trim()) {
      setError('El nombre de la familia no puede estar vacío.');
      return;
    }
    if (porcentajeDescuento < 0 || porcentajeDescuento > 100) {
      setError('El porcentaje de descuento debe ser un valor entre 0 y 100.');
      return;
    }

    setGuardando(true);
    setError(null);
    try {
      await api.patch(`/tesoreria/familias/${familia.id}`, {
        nombreFamilia: nombreFamilia.trim(),
        porcentajeDescuentoHermanos: porcentajeDescuento,
      });
      onGuardado('Grupo familiar y descuento actualizados.');
      onCerrar();
    } catch (err: any) {
      setError(traducirErrorAmigable(err, 'No se pudo actualizar el grupo familiar.'));
    } finally {
      setGuardando(false);
    }
  };

  const handleDesvincularMiembro = async (usuarioId: number) => {
    setDesvinculandoId(usuarioId);
    setError(null);
    try {
      const res = await api.post('/tesoreria/familias/desvincular-hermano', { usuarioId });
      const quitado = miembrosLocal.find((m) => m.id === usuarioId);
      const restantes = miembrosLocal.filter((m) => m.id !== usuarioId);
      setMiembrosLocal(restantes);
      // La subvista sigue abierta salvo que el grupo haya quedado vacío.
      onGuardado(
        quitado
          ? `${quitado.nombre} ${quitado.apellido} fue quitado del grupo familiar.`
          : 'Integrante quitado del grupo familiar.',
      );
      if (res.data?.grupoEliminado || restantes.length === 0) {
        onCerrar();
      }
    } catch (err: any) {
      setError(traducirErrorAmigable(err, 'No se pudo desvincular al miembro.'));
    } finally {
      setDesvinculandoId(null);
    }
  };

  const handleDisolverGrupo = async () => {
    setEliminandoGrupo(true);
    setError(null);
    try {
      await api.delete(`/tesoreria/familias/${familia.id}`);
      onGuardado('Grupo familiar disuelto.');
      onCerrar();
    } catch (err: any) {
      setError(traducirErrorAmigable(err, 'No se pudo disolver el grupo familiar.'));
    } finally {
      setEliminandoGrupo(false);
    }
  };

  const aplicarPredefinido = (pct: number) => {
    setPorcentajeDescuento(pct);
  };

  const contenido = (
    <div
      className={
        embedded
          ? 'bg-surface border border-rule rounded-2xl w-full overflow-hidden flex flex-col'
          : 'bg-surface border border-rule rounded-3xl max-w-lg w-full shadow-md overflow-hidden flex flex-col max-h-[90dvh]'
      }
      {...(embedded ? {} : contentProps)}
    >
      {dialogoConfirmacion}
      {/* Encabezado */}
      <div className="flex items-center justify-between p-5 border-b border-rule bg-paper-2">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-brand/10 text-brand">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-extrabold text-ink text-lg">
              Grupo Familiar y Descuento por Hermanos
            </h3>
            <p className="text-[13px] text-ink-muted">
              Al guardar, se recalculan automáticamente las cuotas pendientes de los hermanos
            </p>
          </div>
        </div>
        {!embedded && (
          <button
            type="button"
            onClick={onCerrar}
            className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center p-1.5 rounded-xl hover:bg-paper-2 text-ink-muted hover:text-ink transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Formulario */}
      <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-5 overflow-y-auto flex-1">
        {error && (
          <div role="alert" className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800/60 text-rose-800 dark:text-rose-300 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Nombre de la Familia */}
        <div>
          <label className="block text-[13px] font-semibold text-ink-2 mb-1.5">
            Nombre del Grupo Familiar *
          </label>
          <input
            type="text"
            required
            value={nombreFamilia}
            onChange={(e) => setNombreFamilia(e.target.value)}
            placeholder="Ej: Familia Gómez, Hermanos Pérez"
            className="w-full min-h-[46px] px-3.5 py-2.5 rounded-xl border border-rule bg-surface text-ink focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none text-base sm:text-[15px]"
          />
        </div>

        {/* Configuración de Porcentaje de Descuento */}
        <div className="p-4 rounded-2xl bg-brand/10 border border-brand/30 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Percent className="w-4 h-4 text-brand" />
              <span className="text-sm font-bold text-ink">
                Porcentaje de Descuento por Hermanos
              </span>
            </div>
            <span className="text-xl font-black text-brand">
              {porcentajeDescuento}%
            </span>
          </div>

          <p className="text-xs text-ink-muted leading-relaxed">
            Este porcentaje se aplica a todas las cuotas pendientes y futuras de los integrantes de la familia.
          </p>

          <div className="flex items-center gap-3 pt-1">
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={porcentajeDescuento}
              onChange={(e) => setPorcentajeDescuento(Number(e.target.value))}
              className="w-full accent-brand cursor-pointer"
            />
            <input
              type="number"
              min="0"
              max="100"
              value={porcentajeDescuento}
              onChange={(e) => setPorcentajeDescuento(Math.min(100, Math.max(0, Number(e.target.value))))}
              className="w-20 min-h-[40px] px-2.5 py-1.5 text-center font-bold text-sm rounded-lg border border-brand/40 bg-surface text-ink focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
            <span className="font-bold text-sm text-ink-muted">%</span>
          </div>

          {/* Accesos rápidos a porcentajes comunes */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-xs text-ink-muted font-semibold mr-1">
              Rápido:
            </span>
            {[0, 10, 15, 20, 25, 50].map((val) => (
              <button
                key={val}
                type="button"
                onClick={() => aplicarPredefinido(val)}
                className={`min-h-[32px] px-2.5 py-1 rounded-md text-xs font-bold transition cursor-pointer border ${
                  porcentajeDescuento === val
                    ? 'bg-brand text-brand-contrast border-brand font-extrabold'
                    : 'bg-surface text-ink-2 border-rule hover:border-brand'
                }`}
              >
                {val === 0 ? 'Sin desc. (0%)' : `${val}%`}
              </button>
            ))}
          </div>
        </div>

        {/* Miembros / Hermanos integrantes de esta familia */}
        {miembrosLocal.length > 0 && (
          <div className="space-y-2.5 pt-2.5 border-t border-rule">
            <span className="text-[13px] font-bold text-ink-2 block">
              Integrantes vinculados ({miembrosLocal.length}):
            </span>
            <div className="space-y-2 max-h-44 overflow-y-auto">
              {miembrosLocal.map((m: any) => {
                const unidadNombre = obtenerRolPrincipal(m)?.unidad?.nombre || 'Sin sección';
                return (
                  <div
                    key={m.id}
                    className="p-3 rounded-xl bg-paper-2 border border-rule flex items-center justify-between gap-2.5 text-[13px]"
                  >
                    <div className="min-w-0">
                      <span className="font-bold text-ink block truncate">
                        {m.nombre} {m.apellido}
                      </span>
                      <span className="text-ink-muted dark:text-ink-muted text-xs">
                        DNI {m.dni} • {unidadNombre}
                      </span>
                    </div>
                    {puedeOperarFamilia &&
                      puedeDesvincularIntegrantePorAlcance(m, {
                        esGlobal: esGlobalFamilia,
                        unidadesEnAlcanceIds: unidadesFamiliaIds,
                      }) && (
                        <button
                          type="button"
                          disabled={desvinculandoId === m.id}
                          onClick={() =>
                            pedirConfirmacion(
                              {
                                titulo: 'Desvincular de la familia',
                                mensaje: (
                                  <>
                                    ¿Desvincular a <strong>{m.nombre} {m.apellido}</strong> de este grupo familiar?
                                  </>
                                ),
                                impacto: 'Se recalcularán los descuentos y las cuotas del grupo. Podés volver a vincularlo después.',
                                textoConfirmar: 'Desvincular',
                              },
                              () => handleDesvincularMiembro(m.id),
                            )
                          }
                          title="Desvincular de la familia"
                          className="min-h-[36px] px-3 py-1 rounded-lg bg-surface border border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-bold flex items-center gap-1.5 cursor-pointer shrink-0 disabled:opacity-50"
                        >
                          <UserMinus className="w-3.5 h-3.5" />
                          <span>{desvinculandoId === m.id ? 'Quitando...' : 'Desvincular'}</span>
                        </button>
                      )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Botones de acción */}
        <div className="flex flex-wrap justify-between items-center gap-2.5 pt-4 border-t border-rule">
          {puedeDisolverGrupo ? (
            <button
              type="button"
              disabled={eliminandoGrupo}
              onClick={() =>
                pedirConfirmacion(
                  {
                    titulo: 'Disolver grupo familiar',
                    mensaje: '¿Disolver este grupo familiar? Todos los integrantes quedarán sin grupo.',
                    impacto: 'Se recalcularán las cuotas de todos los integrantes. Para rearmarlo hay que volver a vincular cada hermano.',
                    tipoImpacto: 'danger',
                    textoConfirmar: 'Disolver grupo',
                  },
                  handleDisolverGrupo,
                )
              }
              className="min-h-[42px] px-3.5 py-2 rounded-xl text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 font-bold text-[13px] flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              <span>{eliminandoGrupo ? 'Disolviendo...' : 'Disolver grupo'}</span>
            </button>
          ) : (
            <span />
          )}

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onCerrar}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-rule text-ink-2 hover:bg-paper-2 font-semibold text-sm transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="min-h-[44px] px-5 py-2 rounded-xl bg-brand hover:opacity-90 active:opacity-100 text-brand-contrast font-extrabold text-sm transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>{guardando ? 'Guardando...' : 'Guardar Descuento'}</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );

  if (embedded) return contenido;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 motion-safe:animate-in motion-safe:fade-in motion-reduce:animate-none"
      {...backdropProps}
    >
      {contenido}
    </div>
  );
};
