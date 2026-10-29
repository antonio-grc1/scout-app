import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import {
  agruparCandidatosPorFamilia,
  type OpcionGrupoHermanos,
  traducirErrorAmigable,
} from '../lib/formatters';
import {
  X,
  UserPlus,
  Search,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Users,
  MapPin,
} from 'lucide-react';

interface Props {
  abierto: boolean;
  usuarioId: number;
  usuarioNombre: string;
  onCerrar: () => void;
  onVinculado: () => void;
}

export const ModalVincularHermano: React.FC<Props> = ({
  abierto,
  usuarioId,
  usuarioNombre,
  onCerrar,
  onVinculado,
}) => {
  const [busqueda, setBusqueda] = useState('');
  const [gruposOpciones, setGruposOpciones] = useState<OpcionGrupoHermanos[]>([]);
  const [grupoSeleccionado, setGrupoSeleccionado] = useState<OpcionGrupoHermanos | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!abierto) {
      setBusqueda('');
      setGruposOpciones([]);
      setGrupoSeleccionado(null);
      setError(null);
    }
  }, [abierto]);

  // Búsqueda automática en vivo al escribir DNI, Nombre o Apellido
  useEffect(() => {
    if (!abierto) return;
    const termino = busqueda.trim();
    if (termino.length < 2) {
      setGruposOpciones([]);
      setGrupoSeleccionado(null);
      setError(null);
      setBuscando(false);
      return;
    }

    const timer = setTimeout(async () => {
      setBuscando(true);
      setError(null);
      try {
        const res = await api.get(`/miembros/hermanos/buscar?q=${encodeURIComponent(termino)}`);
        const items = Array.isArray(res.data) ? res.data : [];
        const agrupados = agruparCandidatosPorFamilia(items, usuarioId);
        setGruposOpciones(agrupados);
        if (agrupados.length === 1) {
          setGrupoSeleccionado(agrupados[0]);
        } else {
          setGrupoSeleccionado((prev) =>
            prev ? agrupados.find((g) => g.key === prev.key) || null : null,
          );
        }
      } catch (err: any) {
        setError(traducirErrorAmigable(err, 'Error al buscar coincidencias.'));
      } finally {
        setBuscando(false);
      }
    }, 220);

    return () => clearTimeout(timer);
  }, [busqueda, abierto, usuarioId]);

  if (!abierto) return null;

  const handleConfirmar = async () => {
    if (!grupoSeleccionado?.representante?.dni) return;
    setGuardando(true);
    setError(null);

    try {
      await api.post('/tesoreria/familias/vincular-hermano', {
        usuarioId,
        hermanoDni: grupoSeleccionado.representante.dni,
      });
      onVinculado();
      onCerrar();
    } catch (err: any) {
      setError(traducirErrorAmigable(err, 'Error al vincular al grupo familiar.'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 motion-safe:animate-in motion-safe:fade-in motion-reduce:animate-none">
      <div className="bg-surface border border-rule rounded-3xl max-w-lg w-full shadow-md overflow-hidden flex flex-col max-h-[90vh]">
        {/* Encabezado */}
        <div className="flex items-center justify-between p-5 border-b border-rule bg-paper-2 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-brand/10 text-brand">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-ink text-base">
                Vincular al Grupo Familiar
              </h3>
              <p className="text-[11px] text-ink-muted">
                Buscá por DNI, Nombre o Apellido para asociar a {usuarioNombre}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            className="p-1.5 rounded-xl hover:bg-paper-2 text-ink-muted hover:text-ink transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Cuerpo */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800/60 text-rose-800 dark:text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-ink-2 mb-1.5">
              DNI, Nombre o Apellido del Hermano/a
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-ink-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                autoFocus
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Escribí DNI, nombre o apellido para ver coincidencias..."
                className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-rule bg-surface text-ink focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none transition-colors text-xs"
              />
              {buscando && (
                <Loader2 className="w-4 h-4 text-brand animate-spin absolute right-3.5 top-1/2 -translate-y-1/2" />
              )}
            </div>
          </div>

          {/* Lista desplegable de grupos de hermanos / candidatos coincidentes */}
          {busqueda.trim().length >= 2 && !buscando && gruposOpciones.length === 0 && (
            <div className="p-4 rounded-2xl bg-paper-2 border border-rule text-center text-xs text-ink-muted">
              No se encontraron miembros activos con "{busqueda.trim()}".
            </div>
          )}

          {gruposOpciones.length > 0 && (
            <div className="space-y-2">
              <span className="text-[11px] font-bold text-ink-muted block">
                Seleccioná el grupo de hermanos correspondiente ({gruposOpciones.length}{' '}
                {gruposOpciones.length === 1 ? 'opción encontrada' : 'opciones encontradas'}):
              </span>
              <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                {gruposOpciones.map((grupo) => {
                  const seleccionado = grupoSeleccionado?.key === grupo.key;
                  return (
                    <button
                      key={grupo.key}
                      type="button"
                      onClick={() => setGrupoSeleccionado(grupo)}
                      className={`w-full text-left p-3.5 rounded-2xl border transition cursor-pointer space-y-2 ${
                        seleccionado
                          ? 'bg-brand/15 border-brand ring-1 ring-brand'
                          : 'bg-paper-2 border-rule hover:bg-paper-2'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <Users className="w-4 h-4 text-brand shrink-0" />
                          <span className="text-xs font-extrabold text-ink">
                            {grupo.esGrupoExistente
                              ? `${grupo.nombreFamilia} (${grupo.integrantes.length} hermanos)`
                              : `Nuevo grupo con ${grupo.representante.nombre} ${grupo.representante.apellido}`}
                          </span>
                        </div>
                        {seleccionado && (
                          <CheckCircle2 className="w-4 h-4 text-brand shrink-0" />
                        )}
                      </div>

                      {/* Integrantes del grupo familiar */}
                      <div className="flex flex-wrap gap-1.5">
                        {grupo.integrantes.map((m) => (
                          <span
                            key={m.id}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface border border-rule text-[11px] font-bold text-ink"
                          >
                            <span>
                              {m.nombre} {m.apellido}
                            </span>
                            <span className="text-[10px] font-normal text-ink-muted">
                              (DNI {m.dni} • {m.ramaNombre})
                            </span>
                          </span>
                        ))}
                      </div>

                      {/* Datos adicionales para diferenciar familias con el mismo apellido */}
                      {(grupo.madreNombre || grupo.padreNombre || grupo.domicilio) && (
                        <div className="text-[11px] text-ink-muted flex flex-wrap gap-x-3 gap-y-0.5 pt-0.5">
                          {grupo.madreNombre && <span>Madre: {grupo.madreNombre}</span>}
                          {grupo.padreNombre && <span>Padre: {grupo.padreNombre}</span>}
                          {grupo.domicilio && (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {grupo.domicilio}
                            </span>
                          )}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Resumen de adhesión al grupo seleccionado */}
          {grupoSeleccionado && (
            <div className="p-3.5 rounded-2xl bg-brand/10 border border-brand/30 space-y-1.5 animate-in fade-in">
              <div className="flex items-center gap-2 text-ink font-extrabold text-xs">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>
                  Se vinculará a {usuarioNombre} con{' '}
                  {grupoSeleccionado.integrantes.map((i) => `${i.nombre} ${i.apellido}`).join(', ')}
                </span>
              </div>
              <p className="text-[11px] text-ink-muted leading-relaxed">
                Todos los miembros quedarán unidos en el mismo grupo familiar y compartirán los descuentos y teléfonos familiares.
              </p>
            </div>
          )}

          {/* Pie de Botones */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-rule">
            <button
              type="button"
              onClick={onCerrar}
              className="px-4 py-2.5 rounded-xl border border-rule text-ink-2 hover:bg-paper-2 font-bold text-xs transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirmar}
              disabled={!grupoSeleccionado || guardando}
              className="px-5 py-2.5 rounded-xl bg-brand hover:opacity-90 active:opacity-100 text-brand-contrast font-bold text-xs shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {guardando ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Users className="w-4 h-4" />
              )}
              <span>
                {guardando ? 'Vinculando...' : 'Confirmar adhesión al grupo familiar'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
