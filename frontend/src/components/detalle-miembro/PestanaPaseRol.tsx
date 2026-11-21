import React, { useEffect, useMemo, useState } from 'react';
import { Sparkles, ArrowRightLeft, PlusCircle, Trash2, ShieldCheck } from 'lucide-react';
import { RAMA_COLORS } from '../../lib/ramaColors';
import {
  esUnidadRama,
  filtrarRolesParaPase,
  obtenerRamasPermitidasParaPase,
} from '../../lib/permisos';

export interface PestanaPaseRolProps {
  candidatoPase: any;
  categoriaDestino: 'RAMA' | 'SIN_RAMA' | 'JEFATURA';
  onCambioCategoria: (cat: 'RAMA' | 'SIN_RAMA' | 'JEFATURA') => void;
  tieneGlobal: () => boolean;
  unidades?: any[];
  unidadesEnAlcanceIds?: readonly number[];
  ramaOrigenId?: number | null;
  ramas: any[];
  ramaSeleccionadaId: number | null;
  ramaSeleccionadaObj: any;
  unidadesRamaSeleccionada: any[];
  unidadDestinoId: string;
  setUnidadDestinoId: (id: string) => void;
  rolDestinoId: string;
  setRolDestinoId: (id: string) => void;
  rolesRama: any[];
  rolesSinRama: any[];
  rolesJefatura: any[];
  todosRoles?: any[];
  onSeleccionarRama: (rama: any) => void;
  onEjecutarPase: () => Promise<void>;
  ejecutandoPase: boolean;
  esMismoDestino: boolean;
  asignacionesActivas?: any[];
  puedeCerrarAsignacion?: (asignacion: any) => boolean;
  onCerrarAsignacion?: (asignacionId: number) => Promise<void>;
  onAgregarAsignacion?: (datos: { rolId: number; unidadId?: number }) => Promise<void>;
  asignacionPrincipalId?: number;
}

const getRamaColorConfig = (nombreRama: string) => {
  const n = (nombreRama || '').toLowerCase();
  if (n.includes('lobat')) return RAMA_COLORS.lobatos;
  if (n.includes('scout')) return RAMA_COLORS.scout;
  if (n.includes('caminant')) return RAMA_COLORS.caminantes;
  if (n.includes('rover')) return RAMA_COLORS.rover;
  return RAMA_COLORS.otro;
};

export const PestanaPaseRol: React.FC<PestanaPaseRolProps> = ({
  candidatoPase,
  categoriaDestino,
  onCambioCategoria,
  tieneGlobal,
  unidades = [],
  unidadesEnAlcanceIds = [],
  ramaOrigenId = null,
  ramas,
  ramaSeleccionadaId,
  ramaSeleccionadaObj,
  unidadesRamaSeleccionada,
  unidadDestinoId,
  setUnidadDestinoId,
  rolDestinoId,
  setRolDestinoId,
  rolesRama,
  rolesSinRama,
  rolesJefatura,
  todosRoles,
  onSeleccionarRama,
  onEjecutarPase,
  ejecutandoPase,
  esMismoDestino,
  asignacionesActivas = [],
  puedeCerrarAsignacion,
  onCerrarAsignacion,
  onAgregarAsignacion,
  asignacionPrincipalId,
}) => {
  const [modoAccion, setModoAccion] = useState<'MUDAR' | 'AGREGAR'>('MUDAR');
  const [cerrandoId, setCerrandoId] = useState<number | null>(null);
  const [asigACerrarId, setAsigACerrarId] = useState<number | null>(null);

  const esGlobal = tieneGlobal();
  const alcanceSet = useMemo(() => new Set(unidadesEnAlcanceIds), [unidadesEnAlcanceIds]);
  const unidadesPermitidas = useMemo(
    () => (esGlobal ? unidades : unidades.filter((u) => alcanceSet.has(u.id))),
    [unidades, esGlobal, alcanceSet],
  );
  // Sin Rama / Apoyo y Jefatura requieren rol de Educador o alcance Global.
  const puedeMostrarSinRama = esGlobal;

  // Sin alcance GLOBAL: MUDAR solo muestra misma rama o inmediatamente siguiente; AGREGAR solo unidades en alcance.
  const ramasVisibles = useMemo(() => {
    const permitidasPorProgresion = obtenerRamasPermitidasParaPase({
      esGlobal,
      ramas,
      ramaOrigenId,
    });
    if (esGlobal || modoAccion === 'MUDAR') return permitidasPorProgresion;
    return permitidasPorProgresion.filter((r) =>
      unidadesPermitidas.some((u) => esUnidadRama(u) && u.ramaId === r.id),
    );
  }, [ramas, esGlobal, modoAccion, unidadesPermitidas, ramaOrigenId]);

  const unidadesRamaVisibles = useMemo(() => {
    if (esGlobal || modoAccion === 'MUDAR') return unidadesRamaSeleccionada;
    return unidadesRamaSeleccionada.filter((u) => alcanceSet.has(u.id));
  }, [unidadesRamaSeleccionada, esGlobal, modoAccion, alcanceSet]);

  const unidadDestinoEnAlcance = useMemo(() => {
    if (esGlobal) return true;
    const uid = Number(unidadDestinoId);
    return Number.isFinite(uid) && alcanceSet.has(uid);
  }, [esGlobal, unidadDestinoId, alcanceSet]);

  const rolesMostrados = useMemo(
    () =>
      filtrarRolesParaPase({
        categoriaDestino,
        modoAccion,
        esGlobal,
        unidadDestinoEnAlcance,
        rolesRama,
        rolesSinRama,
        rolesJefatura,
        todosRoles,
      }),
    [
      categoriaDestino,
      modoAccion,
      esGlobal,
      unidadDestinoEnAlcance,
      rolesRama,
      rolesSinRama,
      rolesJefatura,
      todosRoles,
    ],
  );

  useEffect(() => {
    if (categoriaDestino === 'JEFATURA' && !esGlobal) {
      onCambioCategoria('RAMA');
      return;
    }
    if (categoriaDestino === 'SIN_RAMA' && !puedeMostrarSinRama) {
      onCambioCategoria('RAMA');
      return;
    }
    if (
      categoriaDestino === 'RAMA' &&
      ramasVisibles.length > 0 &&
      !ramasVisibles.some((r) => r.id === ramaSeleccionadaId)
    ) {
      onSeleccionarRama(ramasVisibles[0]);
      return;
    }
    if (
      categoriaDestino === 'RAMA' &&
      unidadesRamaVisibles.length > 0 &&
      !unidadesRamaVisibles.some((u) => u.id === Number(unidadDestinoId))
    ) {
      setUnidadDestinoId(String(unidadesRamaVisibles[0].id));
      return;
    }
    if (
      rolesMostrados.length > 0 &&
      !rolesMostrados.some((r) => r.id === Number(rolDestinoId))
    ) {
      setRolDestinoId(String(rolesMostrados[0].id));
    }
  }, [
    categoriaDestino,
    esGlobal,
    puedeMostrarSinRama,
    ramasVisibles,
    ramaSeleccionadaId,
    unidadesRamaVisibles,
    unidadDestinoId,
    rolesMostrados,
    rolDestinoId,
  ]);

  const handleCerrar = (asigId: number) => {
    if (!onCerrarAsignacion) return;
    setAsigACerrarId(asigId);
  };

  const confirmarCierreAsignacion = async () => {
    if (!onCerrarAsignacion || asigACerrarId === null) return;
    const targetId = asigACerrarId;
    setAsigACerrarId(null);
    setCerrandoId(targetId);
    try {
      await onCerrarAsignacion(targetId);
    } finally {
      setCerrandoId(null);
    }
  };

  const handleConfirmar = async () => {
    if (modoAccion === 'MUDAR') {
      await onEjecutarPase();
    } else if (onAgregarAsignacion) {
      await onAgregarAsignacion({
        rolId: Number(rolDestinoId),
        unidadId: unidadDestinoId ? Number(unidadDestinoId) : undefined,
      });
    }
  };

  return (
    <div className="space-y-4">
      {/* Listado de Roles Activos (Multirrol) */}
      {asignacionesActivas.length > 0 && (
        <div className="bg-paper-2 border border-rule p-4 rounded-2xl space-y-2.5">
          <span className="text-[13px] font-bold text-ink-2 block">
            Roles y Funciones Activas ({asignacionesActivas.length}):
          </span>
          <div className="space-y-2">
            {asignacionesActivas.map((asig: any) => {
              const esPrincipal = asig.id === asignacionPrincipalId;
              const enConfirmacion = asigACerrarId === asig.id;
              return (
                <div
                  key={asig.id}
                  className="flex flex-wrap items-center justify-between p-2.5 rounded-xl bg-surface border border-rule gap-2"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <ShieldCheck className="w-[18px] h-[18px] text-brand shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-ink truncate">
                        {asig.rol?.nombre || 'Rol'}{' '}
                        <span className="font-normal text-ink-muted">
                          • {asig.unidad?.nombre || 'Global'}
                        </span>
                      </p>
                      {esPrincipal && (
                        <span className="text-xs font-semibold text-brand">
                          Rol Principal
                        </span>
                      )}
                    </div>
                  </div>

                  {asignacionesActivas.length > 1 &&
                    onCerrarAsignacion &&
                    (!puedeCerrarAsignacion || puedeCerrarAsignacion(asig)) &&
                    (enConfirmacion ? (
                      <div className="flex items-center gap-2 shrink-0 ml-auto">
                        <span className="text-xs font-bold text-rose-700 dark:text-rose-300">
                          ¿Finalizar rol?
                        </span>
                        <button
                          type="button"
                          onClick={() => setAsigACerrarId(null)}
                          className="min-h-[34px] px-2.5 py-1 text-xs font-bold text-ink-2 rounded-lg border border-rule hover:bg-paper-2 transition cursor-pointer"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          disabled={cerrandoId === asig.id || ejecutandoPase}
                          onClick={confirmarCierreAsignacion}
                          className="min-h-[34px] px-2.5 py-1 text-xs font-bold bg-rose-600 text-white rounded-lg hover:opacity-90 transition cursor-pointer disabled:opacity-40"
                        >
                          Sí, finalizar
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={cerrandoId === asig.id || ejecutandoPase}
                        onClick={() => handleCerrar(asig.id)}
                        title="Finalizar este rol"
                        className="min-h-[34px] px-2.5 py-1 text-xs font-bold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg border border-red-200 dark:border-red-800 transition cursor-pointer shrink-0 disabled:opacity-40"
                      >
                        <Trash2 className="w-3.5 h-3.5 inline mr-1" />
                        Cerrar Rol
                      </button>
                    ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {candidatoPase && (
        <div className="bg-brand/10 border border-brand/30 p-4 rounded-2xl flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Sparkles className="w-5 h-5 text-brand shrink-0" />
            <div>
              <span className="font-bold text-ink text-sm block">
                Cumplió {candidatoPase.edad} años
              </span>
              <span className="text-xs sm:text-[13px] text-ink-2">
                Sugerido:{' '}
                {candidatoPase.tipo === 'PROGRESION'
                  ? `Pasar a ${candidatoPase.ramaSugerida?.nombre}`
                  : 'Pasar a Educador (con rama o sin rama / apoyo)'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Selector de Modo: Mudar Rol vs Asignar Rol Adicional */}
      {onAgregarAsignacion && (
        <div className="flex rounded-xl p-1 bg-paper-2 border border-rule gap-1">
          <button
            type="button"
            onClick={() => setModoAccion('MUDAR')}
            className={`flex-1 min-h-[38px] py-1.5 px-3 rounded-lg text-[13px] font-bold transition cursor-pointer flex items-center justify-center gap-1.5 ${
              modoAccion === 'MUDAR'
                ? 'bg-surface text-ink border border-rule'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            <ArrowRightLeft className="w-4 h-4" />
            Pase de Rama / Mudar Rol
          </button>
          <button
            type="button"
            onClick={() => setModoAccion('AGREGAR')}
            className={`flex-1 min-h-[38px] py-1.5 px-3 rounded-lg text-[13px] font-bold transition cursor-pointer flex items-center justify-center gap-1.5 ${
              modoAccion === 'AGREGAR'
                ? 'bg-surface text-ink border border-rule'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            <PlusCircle className="w-4 h-4" />
            Asignar Rol Adicional
          </button>
        </div>
      )}

      {/* Tipo de Destino */}
      {(puedeMostrarSinRama || esGlobal) && (
        <div
          className={`grid gap-2 ${
            esGlobal && puedeMostrarSinRama
              ? 'grid-cols-3'
              : 'grid-cols-2'
          }`}
        >
          <button
            type="button"
            onClick={() => onCambioCategoria('RAMA')}
            className={`min-h-[46px] p-2.5 rounded-xl border font-bold text-[13px] transition cursor-pointer ${
              categoriaDestino === 'RAMA'
                ? 'border-brand bg-brand/10 text-brand ring-2 ring-brand/30 font-bold'
                : 'border-rule text-ink-2'
            }`}
          >
            Rama
          </button>
          {puedeMostrarSinRama && (
            <button
              type="button"
              onClick={() => onCambioCategoria('SIN_RAMA')}
              className={`min-h-[46px] p-2.5 rounded-xl border font-bold text-[13px] transition cursor-pointer ${
                categoriaDestino === 'SIN_RAMA'
                  ? 'border-neutral-900 dark:border-neutral-100 bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 ring-2 ring-neutral-400/30 font-bold'
                  : 'border-rule text-ink-2'
              }`}
            >
              Sin Rama / Apoyo
            </button>
          )}
          {esGlobal && (
            <button
              type="button"
              onClick={() => onCambioCategoria('JEFATURA')}
              className={`min-h-[46px] p-2.5 rounded-xl border font-bold text-[13px] transition cursor-pointer ${
                categoriaDestino === 'JEFATURA'
                  ? 'border-brand bg-brand/10 text-brand ring-2 ring-brand/30'
                  : 'border-rule text-ink-2'
              }`}
            >
              Jefatura / Global
            </button>
          )}
        </div>
      )}

      {categoriaDestino === 'RAMA' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {ramasVisibles.map((rama) => {
              const config = getRamaColorConfig(rama.nombre);
              const seleccionada = ramaSeleccionadaId === rama.id;
              return (
                <button
                  key={rama.id}
                  type="button"
                  onClick={() => onSeleccionarRama(rama)}
                  className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                    seleccionada
                      ? 'border-brand bg-brand/10 ring-2 ring-brand/40'
                      : 'border-rule bg-surface'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-[13px] text-ink">
                      {rama.nombre}
                    </span>
                    <span className={`w-2.5 h-2.5 rounded-full ${config.dotColor}`} />
                  </div>
                  <span className="text-xs text-ink-muted block">
                    {rama.edadMinima}-{rama.edadMaxima} años
                  </span>
                </button>
              );
            })}
          </div>

          {unidadesRamaVisibles.length > 1 && (
            <div className="space-y-1.5">
              <span className="text-[13px] font-bold text-ink-2 block">
                Sección de {ramaSeleccionadaObj?.nombre}:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {unidadesRamaVisibles.map((u) => {
                  const activa = Number(unidadDestinoId) === u.id;
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => setUnidadDestinoId(String(u.id))}
                      className={`min-h-[44px] px-3 py-2 rounded-xl text-[13px] font-bold transition border cursor-pointer ${
                        activa
                          ? 'bg-brand text-brand-contrast border-brand font-bold'
                          : 'bg-surface text-ink-2 border-rule'
                      }`}
                    >
                      {u.nombre}
                    </button>
                  );
                })}
              </div>
              {!esGlobal && modoAccion === 'MUDAR' && !unidadDestinoEnAlcance && (
                <p className="text-xs sm:text-[13px] text-amber-700 dark:text-amber-300 bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-xl px-3.5 py-2.5">
                  Como {ramaSeleccionadaObj?.nombre || 'esta rama'} tiene otras secciones, al confirmar se enviará una solicitud pendiente para que la sección receptora la apruebe.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Selector de Rol Dinámico para la categoría seleccionada */}
      <div className="space-y-1.5">
        <span className="text-[13px] font-bold text-ink-2 block">
          Función / Rol:
        </span>
        {rolesMostrados.length === 0 ? (
          <p className="text-[13px] text-ink-muted p-3.5 rounded-xl border border-rule bg-paper-2">
            No tenés permisos para asignar roles en esa sección.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {rolesMostrados.map((r) => {
              const activo = Number(rolDestinoId) === r.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setRolDestinoId(String(r.id))}
                  className={`min-h-[44px] px-3 py-2 rounded-xl border text-[13px] font-bold transition cursor-pointer ${
                    activo
                      ? 'border-brand bg-brand/10 text-brand font-bold'
                      : 'border-rule text-ink-2'
                  }`}
                >
                  {r.nombre}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <button
        type="button"
        disabled={
          ejecutandoPase ||
          rolesMostrados.length === 0 ||
          !rolDestinoId ||
          !rolesMostrados.some((r) => r.id === Number(rolDestinoId)) ||
          (categoriaDestino === 'RAMA' &&
            (!unidadDestinoId || (modoAccion === 'AGREGAR' && !unidadDestinoEnAlcance))) ||
          (modoAccion === 'MUDAR' && esMismoDestino)
        }
        onClick={handleConfirmar}
        className="w-full min-h-[48px] rounded-xl bg-brand hover:opacity-90 active:opacity-100 text-brand-contrast font-bold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-40"
      >
        {modoAccion === 'MUDAR' ? (
          <ArrowRightLeft className="w-4 h-4" />
        ) : (
          <PlusCircle className="w-4 h-4" />
        )}
        <span>
          {ejecutandoPase
            ? 'Procesando...'
            : modoAccion === 'MUDAR'
              ? esMismoDestino
                ? 'Ya pertenece a esta sección y rol'
                : 'Confirmar Pase / Cambio de Rol'
              : 'Asignar Rol Adicional al Miembro'}
        </span>
      </button>
    </div>
  );
};
