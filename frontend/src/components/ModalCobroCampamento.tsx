import React, { useState, useEffect, useMemo } from 'react';
import { useModalOverlay } from '../hooks/useModalOverlay';
import { api } from '../api/client';
import { SelectorDestinatarios } from './SelectorDestinatarios';
import { filtrarUnidadesPorAlcance } from '../lib/permisos';
import { useAuthStore } from '../store/authStore';
import {
  X,
  Tent,
  CheckCircle2,
} from 'lucide-react';
import { traducirErrorAmigable } from '../lib/formatters';

interface Props {
  abierto: boolean;
  conceptoAEditar?: any | null;
  unidades: Array<{ id: number; nombre: string; tipo?: string }>;
  onCerrar: () => void;
  onGenerado: (mensaje: string) => void;
}

export const ModalCobroCampamento: React.FC<Props> = ({
  abierto,
  conceptoAEditar = null,
  unidades,
  onCerrar,
  onGenerado,
}) => {
  const anioActual = new Date().getFullYear();
  const asignaciones = useAuthStore((s) => s.asignaciones);
  const tienePermisoGlobal = useAuthStore((s) => s.tienePermisoGlobal);
  const obtenerUnidadesConPermiso = useAuthStore((s) => s.obtenerUnidadesConPermiso);
  const esGlobal = tienePermisoGlobal(['planes.editar', 'caja.editar']);
  const unidadesConceptosIds = useMemo(
    () => obtenerUnidadesConPermiso(['planes.editar', 'caja.editar']),
    [asignaciones, obtenerUnidadesConPermiso],
  );
  const unidadesPermitidas = useMemo(
    () =>
      esGlobal
        ? [...unidades]
        : filtrarUnidadesPorAlcance(unidades, {
            esGlobal: false,
            asignaciones: unidadesConceptosIds.map((id) => ({
              alcance: 'UNIDAD' as const,
              unidadId: id,
            })),
          }),
    [unidades, esGlobal, unidadesConceptosIds],
  );

  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState<'CAMPAMENTO' | 'EVENTO' | 'INSCRIPCION' | 'MATERIALES' | 'OTRO'>('CAMPAMENTO');
  const [montoBase, setMontoBase] = useState<number | ''>('');
  const [cicloAnio, setCicloAnio] = useState(anioActual);
  const [fechaVencimiento, setFechaVencimiento] = useState('');
  const [destinatarioTipo, setDestinatarioTipo] = useState<'TODOS' | 'PROTAGONISTAS' | 'EDUCADORES'>('PROTAGONISTAS');
  const [unidadId, setUnidadId] = useState<number | null>(null);
  const [rubroId, setRubroId] = useState<number | null>(null);
  const [rubros, setRubros] = useState<any[]>([]);
  const [permiteDescuentoHermanos, setPermiteDescuentoHermanos] = useState(true);
  const [usarPorcentajePersonalizado, setUsarPorcentajePersonalizado] = useState(false);
  const [porcentajeDescuentoHermanos, setPorcentajeDescuentoHermanos] = useState<number | ''>('');
  const [excepcionesIds, setExcepcionesIds] = useState<number[]>([]);

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { backdropProps, contentProps } = useModalOverlay({
    abierto,
    onCerrar,
    bloqueado: guardando,
  });

  useEffect(() => {
    if (abierto) {
      api.get('/tesoreria/rubros?tipo=INGRESO').then((r) => setRubros(r.data || [])).catch(() => {});
      if (conceptoAEditar) {
        setNombre(conceptoAEditar.nombre || '');
        setTipo(conceptoAEditar.tipo || 'CAMPAMENTO');
        setMontoBase(conceptoAEditar.montoBase ? Number(conceptoAEditar.montoBase) : '');
        setCicloAnio(conceptoAEditar.cicloAnio || anioActual);
        setFechaVencimiento(
          conceptoAEditar.fechaVencimiento
            ? String(conceptoAEditar.fechaVencimiento).split('T')[0]
            : '',
        );
        const dest = conceptoAEditar.destinatarioTipo;
        setDestinatarioTipo(
          dest === 'TODOS' || dest === 'EDUCADORES' ? dest : 'PROTAGONISTAS',
        );
        setUnidadId(conceptoAEditar.unidadId ?? null);
        setRubroId(conceptoAEditar.rubroId ?? null);
        setPermiteDescuentoHermanos(conceptoAEditar.permiteDescuentoHermanos ?? true);
        if (
          conceptoAEditar.porcentajeDescuentoHermanos !== null &&
          conceptoAEditar.porcentajeDescuentoHermanos !== undefined
        ) {
          setUsarPorcentajePersonalizado(true);
          setPorcentajeDescuentoHermanos(Number(conceptoAEditar.porcentajeDescuentoHermanos));
        } else {
          setUsarPorcentajePersonalizado(false);
          setPorcentajeDescuentoHermanos('');
        }
        setExcepcionesIds(
          Array.isArray(conceptoAEditar.excepcionesJson) ? conceptoAEditar.excepcionesJson : [],
        );
      } else {
        setNombre('');
        setTipo('CAMPAMENTO');
        setMontoBase('');
        setCicloAnio(anioActual);
        setFechaVencimiento('');
        setDestinatarioTipo('PROTAGONISTAS');
        setUnidadId(esGlobal ? null : (unidadesPermitidas[0]?.id ?? null));
        setRubroId(null);
        setPermiteDescuentoHermanos(true);
        setUsarPorcentajePersonalizado(false);
        setPorcentajeDescuentoHermanos('');
        setExcepcionesIds([]);
      }
      setError(null);
    }
  }, [abierto, conceptoAEditar, anioActual]);

  if (!abierto) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!nombre.trim()) {
      setError('El nombre del cobro puntual es obligatorio');
      return;
    }

    if (montoBase === '' || Number(montoBase) <= 0) {
      setError('Debe indicar un monto válido');
      return;
    }

    setGuardando(true);
    try {
      const payload = {
        nombre: nombre.trim(),
        tipo,
        montoBase: Number(montoBase),
        cicloAnio: Number(cicloAnio),
        fechaVencimiento: fechaVencimiento ? fechaVencimiento : null,
        destinatarioTipo,
        unidadId: unidadId ?? null,
        rubroId: rubroId ?? null,
        permiteDescuentoHermanos,
        porcentajeDescuentoHermanos:
          permiteDescuentoHermanos && usarPorcentajePersonalizado && porcentajeDescuentoHermanos !== ''
            ? Number(porcentajeDescuentoHermanos)
            : null,
        excepcionesIds,
        sincronizarCargos: true,
      };

      if (conceptoAEditar?.id) {
        await api.patch(`/tesoreria/conceptos/${conceptoAEditar.id}`, payload);
        onGenerado(`Cobro "${nombre.trim()}" actualizado y cargos sincronizados.`);
      } else {
        await api.post('/tesoreria/conceptos', payload);
        onGenerado(`Cobro "${nombre.trim()}" creado y asignado automáticamente.`);
      }

      onCerrar();
    } catch (err: any) {
      setError(traducirErrorAmigable(err, 'No se pudo guardar el cobro puntual.'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      {...backdropProps}
    >
      <div
        className="bg-surface rounded-3xl border border-rule shadow-md w-full max-w-2xl max-h-[92dvh] flex flex-col overflow-hidden motion-safe:animate-in motion-safe:fade-in motion-reduce:animate-none"
        {...contentProps}
      >
        {/* Header */}
        <div className="p-5 border-b border-rule flex items-center justify-between shrink-0 bg-paper-2">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-brand/10 text-brand">
              <Tent className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-ink text-lg">
                {conceptoAEditar
                  ? 'Editar Cobro Puntual'
                  : 'Nuevo Cobro Puntual'}
              </h3>
              <p className="text-[13px] text-ink-muted">
                Definí el monto, a quiénes aplica y quiénes están becados o exentos
              </p>
            </div>
          </div>
          <button
            onClick={onCerrar}
            className="p-2 rounded-xl text-ink-muted hover:text-ink hover:bg-paper-2 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-sm font-semibold">
              {error}
            </div>
          )}

          {/* Nombre, Categoría y Rubro Contable */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3.5">
            <div className="sm:col-span-2">
              <label className="block text-[13px] font-bold text-ink-2 mb-1.5">
                Nombre del Cobro Puntual *
              </label>
              <input
                type="text"
                required
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder={`Ej. Campamento de Verano ${anioActual}, Acantonamiento, Pañuelo...`}
                className="w-full min-h-[46px] rounded-xl border border-rule bg-surface px-3.5 py-2.5 text-base sm:text-[15px] font-medium text-ink focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none transition-colors"
              />
            </div>

            <div>
              <label className="block text-[13px] font-bold text-ink-2 mb-1.5">
                Categoría
              </label>
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value as any)}
                className="w-full min-h-[46px] rounded-xl border border-rule bg-surface px-3.5 py-2.5 text-base sm:text-[15px] font-medium text-ink focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none transition-colors"
              >
                <option value="CAMPAMENTO">Campamento</option>
                <option value="EVENTO">Evento Especial</option>
                <option value="INSCRIPCION">Inscripción / Afiliación</option>
                <option value="MATERIALES">Materiales / Indumentaria</option>
                <option value="OTRO">Otro Cobro</option>
              </select>
            </div>

            <div>
              <label className="block text-[13px] font-bold text-ink-2 mb-1.5">
                Rubro Contable
              </label>
              <select
                value={rubroId ?? ''}
                onChange={(e) => setRubroId(e.target.value ? Number(e.target.value) : null)}
                className="w-full min-h-[46px] rounded-xl border border-rule bg-surface px-3.5 py-2.5 text-base sm:text-[15px] font-medium text-ink focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none transition-colors"
              >
                <option value="">Sin rubro contable</option>
                {rubros.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Monto, Año y Fecha de Vencimiento */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div>
              <label className="block text-[13px] font-bold text-ink-2 mb-1.5">
                Monto Base ($) *
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[15px] font-bold text-ink-muted pointer-events-none">
                  $
                </span>
                <input
                  type="number"
                  step="0.01"
                  required
                  min={1}
                  value={montoBase}
                  onChange={(e) => setMontoBase(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="25000.00"
                  className="w-full min-h-[46px] rounded-xl border border-rule bg-surface pl-8 pr-3.5 py-2.5 text-base sm:text-[15px] font-bold text-ink focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-[13px] font-bold text-ink-2 mb-1.5">
                Ciclo / Año
              </label>
              <input
                type="number"
                min={2020}
                max={2100}
                value={cicloAnio}
                onChange={(e) => setCicloAnio(Number(e.target.value))}
                className="w-full min-h-[46px] rounded-xl border border-rule bg-surface px-3.5 py-2.5 text-base sm:text-[15px] font-medium text-ink focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none transition-colors"
              />
            </div>

            <div>
              <label className="block text-[13px] font-bold text-ink-2 mb-1.5">
                Fecha de Vencimiento (opcional)
              </label>
              <input
                type="date"
                value={fechaVencimiento}
                onChange={(e) => setFechaVencimiento(e.target.value)}
                className="w-full min-h-[46px] rounded-xl border border-rule bg-surface px-3.5 py-2.5 text-base sm:text-[15px] font-medium text-ink focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none transition-colors"
              />
            </div>
          </div>

          {/* SELECTOR BIDIMENSIONAL DE DESTINATARIOS */}
          <SelectorDestinatarios
            destinatarioTipo={destinatarioTipo}
            onChangeDestinatarioTipo={setDestinatarioTipo}
            unidadId={unidadId}
            onChangeUnidadId={setUnidadId}
            excepcionesIds={excepcionesIds}
            onChangeExcepcionesIds={setExcepcionesIds}
            unidades={unidades}
          />

          {/* REGLA DE DESCUENTO FAMILIAR */}
          <div className="p-4 rounded-2xl border border-rule bg-paper-2 space-y-3">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={permiteDescuentoHermanos}
                onChange={(e) => setPermiteDescuentoHermanos(e.target.checked)}
                className="w-4 h-4 rounded text-brand focus:ring-brand/20"
              />
              <span className="text-sm font-bold text-ink">
                Permitir descuento por hermanos / grupo familiar
              </span>
            </label>

            {permiteDescuentoHermanos && (
              <div className="pl-6 space-y-2.5 pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-[13px] text-ink-muted">
                  <input
                    type="checkbox"
                    checked={usarPorcentajePersonalizado}
                    onChange={(e) => setUsarPorcentajePersonalizado(e.target.checked)}
                    className="w-4 h-4 rounded text-brand focus:ring-brand/20"
                  />
                  <span>Fijar porcentaje de descuento específico para este cobro</span>
                </label>

                {usarPorcentajePersonalizado && (
                  <div className="w-48 pt-1">
                    <div className="relative">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={porcentajeDescuentoHermanos}
                        onChange={(e) =>
                          setPorcentajeDescuentoHermanos(e.target.value === '' ? '' : Number(e.target.value))
                        }
                        placeholder="Ej. 20"
                        className="w-full min-h-[42px] rounded-xl border border-rule bg-surface px-3.5 py-2 text-sm font-semibold text-ink focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none transition-colors"
                      />
                      <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-ink-muted">%</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Nota informativa */}
          <div className="p-3.5 rounded-2xl bg-brand/10 border border-brand/30 text-xs text-ink-2 leading-relaxed">
            Al guardar, las deudas se asignan y actualizan automáticamente en la cuenta de los miembros seleccionados. Si quitás a alguien que ya había pagado, el dinero pagado pasa automáticamente a su <strong>Saldo a Favor</strong>.
          </div>

          {/* Footer del Formulario */}
          <div className="pt-3.5 border-t border-rule flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onCerrar}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-rule text-ink-2 font-semibold text-sm hover:bg-paper-2 transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="min-h-[44px] px-5 py-2 rounded-xl bg-brand hover:opacity-90 active:opacity-100 text-brand-contrast font-bold text-sm transition-colors shadow-xs cursor-pointer disabled:opacity-50 flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {guardando
                  ? 'Guardando...'
                  : conceptoAEditar
                    ? 'Guardar Cambios'
                    : 'Crear y Asignar Cobro'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
