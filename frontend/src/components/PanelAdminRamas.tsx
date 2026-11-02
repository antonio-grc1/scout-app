import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { TIPO_UNIDAD_LABELS, traducirErrorAmigable } from '../lib/formatters';
import {
  PlusCircle,
  Pencil,
  Trash2,
  RotateCcw,
  Check,
  X,
  Loader2,
  Layers,
  GitBranch,
  Eye,
  EyeOff,
} from 'lucide-react';

interface Props {
  ramas: any[];
  unidades: any[];
  mostrarInactivas: boolean;
  onToggleMostrarInactivas: (val: boolean) => void;
  onRecargar: () => Promise<void>;
  onToast: (texto: string, tipo?: 'exito' | 'error') => void;
}

export const PanelAdminRamas: React.FC<Props> = ({
  ramas,
  unidades,
  mostrarInactivas,
  onToggleMostrarInactivas,
  onRecargar,
  onToast,
}) => {
  const puedeGestionar = useAuthStore((s) => s.tienePermiso('organizacion.gestionar'));

  // Estado formulario de Rama (Crear / Editar)
  const [editandoRama, setEditandoRama] = useState<any | null>(null);
  const [creandoRama, setCreandoRama] = useState(false);
  const [formRama, setFormRama] = useState({
    nombre: '',
    edadMinima: 7,
    edadMaxima: 10,
    ordenProgresion: 1,
    crearSeccionAutomatica: true,
  });
  const [guardandoRama, setGuardandoRama] = useState(false);
  const [procesandoRamaId, setProcesandoRamaId] = useState<number | null>(null);

  // Estado formulario de Sección / Unidad (Crear / Editar)
  const [editandoUnidad, setEditandoUnidad] = useState<any | null>(null);
  const [creandoUnidad, setCreandoUnidad] = useState(false);
  const [formUnidad, setFormUnidad] = useState<{
    nombre: string;
    tipo: 'SECCION_RAMA' | 'JEFATURA' | 'SIN_RAMA_APOYO';
    ramaId: number | '';
  }>({
    nombre: '',
    tipo: 'SECCION_RAMA',
    ramaId: '',
  });
  const [guardandoUnidad, setGuardandoUnidad] = useState(false);
  const [procesandoUnidadId, setProcesandoUnidadId] = useState<number | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if ((creandoRama || editandoRama) && !guardandoRama) {
          setCreandoRama(false);
          setEditandoRama(null);
        }
        if ((creandoUnidad || editandoUnidad) && !guardandoUnidad) {
          setCreandoUnidad(false);
          setEditandoUnidad(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [creandoRama, editandoRama, guardandoRama, creandoUnidad, editandoUnidad, guardandoUnidad]);

  const abrirCrearRama = () => {
    const maxOrden = ramas.reduce((max, r) => Math.max(max, Number(r.ordenProgresion || 0)), 0);
    setEditandoRama(null);
    setFormRama({
      nombre: '',
      edadMinima: 7,
      edadMaxima: 10,
      ordenProgresion: maxOrden + 1,
      crearSeccionAutomatica: true,
    });
    setCreandoRama(true);
  };

  const abrirEditarRama = (r: any) => {
    setCreandoRama(false);
    setEditandoRama(r);
    setFormRama({
      nombre: r.nombre,
      edadMinima: Number(r.edadMinima),
      edadMaxima: Number(r.edadMaxima),
      ordenProgresion: Number(r.ordenProgresion),
      crearSeccionAutomatica: false,
    });
  };

  const handleGuardarRama = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formRama.nombre.trim()) return;
    if (Number(formRama.edadMinima) > Number(formRama.edadMaxima)) {
      onToast('La edad máxima debe ser mayor o igual a la edad mínima.', 'error');
      return;
    }

    setGuardandoRama(true);
    try {
      if (editandoRama) {
        await api.patch(`/organizacion/ramas/${editandoRama.id}`, {
          nombre: formRama.nombre.trim(),
          edadMinima: Number(formRama.edadMinima),
          edadMaxima: Number(formRama.edadMaxima),
          ordenProgresion: Number(formRama.ordenProgresion),
        });
        onToast(`Rama "${formRama.nombre.trim()}" actualizada.`);
      } else {
        const res = await api.post('/organizacion/ramas', {
          nombre: formRama.nombre.trim(),
          edadMinima: Number(formRama.edadMinima),
          edadMaxima: Number(formRama.edadMaxima),
          ordenProgresion: Number(formRama.ordenProgresion),
        });
        if (formRama.crearSeccionAutomatica && res.data?.id) {
          const nombreRama = formRama.nombre.trim();
          const nombreSeccion = nombreRama.toLowerCase().startsWith('rama ')
            ? nombreRama
            : `Rama ${nombreRama}`;
          await api
            .post('/organizacion/unidades', {
              nombre: nombreSeccion,
              tipo: 'SECCION_RAMA',
              ramaId: res.data.id,
            })
            .catch(() => null);
        }
        onToast(`Rama "${formRama.nombre.trim()}" creada.`);
      }
      setCreandoRama(false);
      setEditandoRama(null);
      await onRecargar();
    } catch (err) {
      onToast(traducirErrorAmigable(err, 'No se pudo guardar la rama.'), 'error');
    } finally {
      setGuardandoRama(false);
    }
  };

  const handleQuitarRama = async (r: any) => {
    setProcesandoRamaId(r.id);
    try {
      const res = await api.delete(`/organizacion/ramas/${r.id}`);
      onToast(res.data?.mensaje || `Rama "${r.nombre}" desactivada.`);
      await onRecargar();
    } catch (err) {
      onToast(traducirErrorAmigable(err, 'No se pudo desactivar la rama.'), 'error');
    } finally {
      setProcesandoRamaId(null);
    }
  };

  const handleReactivarRama = async (r: any) => {
    setProcesandoRamaId(r.id);
    try {
      await api.patch(`/organizacion/ramas/${r.id}`, { activa: true });
      onToast(`Rama "${r.nombre}" reactivada.`);
      await onRecargar();
    } catch (err) {
      onToast(traducirErrorAmigable(err, 'No se pudo reactivar la rama.'), 'error');
    } finally {
      setProcesandoRamaId(null);
    }
  };

  const abrirCrearUnidad = () => {
    const primeraRama = ramas.find((r) => r.activa !== false);
    setEditandoUnidad(null);
    setFormUnidad({
      nombre: '',
      tipo: 'SECCION_RAMA',
      ramaId: primeraRama?.id ?? '',
    });
    setCreandoUnidad(true);
  };

  const abrirEditarUnidad = (u: any) => {
    setCreandoUnidad(false);
    setEditandoUnidad(u);
    setFormUnidad({
      nombre: u.nombre,
      tipo: u.tipo || 'SECCION_RAMA',
      ramaId: u.rama?.id ?? u.ramaId ?? '',
    });
  };

  const handleGuardarUnidad = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formUnidad.nombre.trim()) return;
    if (formUnidad.tipo === 'SECCION_RAMA' && !formUnidad.ramaId) {
      onToast('Seleccioná la rama pedagógica para esta sección.', 'error');
      return;
    }

    setGuardandoUnidad(true);
    try {
      const payload = {
        nombre: formUnidad.nombre.trim(),
        tipo: formUnidad.tipo,
        ramaId: formUnidad.tipo === 'SECCION_RAMA' ? Number(formUnidad.ramaId) : null,
      };
      if (editandoUnidad) {
        await api.patch(`/organizacion/unidades/${editandoUnidad.id}`, payload);
        onToast(`Sección "${payload.nombre}" actualizada.`);
      } else {
        await api.post('/organizacion/unidades', payload);
        onToast(`Sección "${payload.nombre}" creada.`);
      }
      setCreandoUnidad(false);
      setEditandoUnidad(null);
      await onRecargar();
    } catch (err) {
      onToast(traducirErrorAmigable(err, 'No se pudo guardar la sección.'), 'error');
    } finally {
      setGuardandoUnidad(false);
    }
  };

  const handleQuitarUnidad = async (u: any) => {
    setProcesandoUnidadId(u.id);
    try {
      const res = await api.delete(`/organizacion/unidades/${u.id}`);
      onToast(res.data?.mensaje || `Sección "${u.nombre}" desactivada.`);
      await onRecargar();
    } catch (err) {
      onToast(traducirErrorAmigable(err, 'No se pudo desactivar la sección.'), 'error');
    } finally {
      setProcesandoUnidadId(null);
    }
  };

  const handleReactivarUnidad = async (u: any) => {
    setProcesandoUnidadId(u.id);
    try {
      await api.patch(`/organizacion/unidades/${u.id}`, { activa: true });
      onToast(`Sección "${u.nombre}" reactivada.`);
      await onRecargar();
    } catch (err) {
      onToast(traducirErrorAmigable(err, 'No se pudo reactivar la sección.'), 'error');
    } finally {
      setProcesandoUnidadId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Barra superior de control */}
      <div className="flex items-center justify-between gap-2 flex-wrap bg-surface rounded-2xl border border-rule p-4 shadow-xs">
        <div>
          <h2 className="text-sm font-extrabold text-ink">
            Configuración de Ramas, Edades de Pase y Secciones
          </h2>
          <p className="text-xs text-ink-muted">
            Modificá nombres, edades límite para sugerencias de pases o agregá y quitá ramas.
          </p>
        </div>

        <button
          type="button"
          onClick={() => onToggleMostrarInactivas(!mostrarInactivas)}
          className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition cursor-pointer ${
            mostrarInactivas
              ? 'bg-ink text-paper border-ink'
              : 'bg-paper-2 text-ink-2 border-rule'
          }`}
        >
          {mostrarInactivas ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          <span>{mostrarInactivas ? 'Ocultar inactivas' : 'Ver inactivas'}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* COLUMNA 1: RAMAS Y EDADES DE SUGERENCIA DE PASES */}
        <div className="bg-surface rounded-2xl border border-rule shadow-xs p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-brand" />
              <h3 className="text-base font-bold text-ink">
                Ramas y Edades de Pase
              </h3>
            </div>
            {puedeGestionar && (
              <button
                type="button"
                onClick={abrirCrearRama}
                className="min-h-[38px] px-3 py-1.5 rounded-xl bg-brand hover:opacity-90 active:opacity-100 text-brand-contrast text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>Agregar Rama</span>
              </button>
            )}
          </div>

          {/* Listado de Ramas */}
          <div className="space-y-2">
            {ramas.map((r) => {
              const inactiva = r.activa === false;
              const enProceso = procesandoRamaId === r.id;
              return (
                <div
                  key={r.id}
                  className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3.5 rounded-xl border text-xs transition-colors ${
                    inactiva
                      ? 'bg-paper-2 border-rule opacity-65'
                      : 'bg-paper-2 border-rule hover:border-brand/40 hover:bg-surface'
                  }`}
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="w-5 h-5 rounded-full bg-paper-3 text-ink-2 font-black text-[10px] flex items-center justify-center">
                        {r.ordenProgresion}
                      </span>
                      <span className="font-extrabold text-ink text-sm">
                        {r.nombre}
                      </span>
                      <span className="text-brand font-bold bg-brand/10 px-2.5 py-0.5 rounded-full border border-brand/30">
                        {r.edadMinima} a {r.edadMaxima} años
                      </span>
                      {inactiva && (
                        <span className="px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 font-bold text-[10px]">
                          Inactiva
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-ink-muted pl-7">
                      Sugiere pase a la siguiente rama al cumplir {Number(r.edadMaxima) + 1} años.
                    </p>
                  </div>

                  {puedeGestionar && (
                    <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                      <button
                        type="button"
                        onClick={() => abrirEditarRama(r)}
                        title="Modificar nombre o edades"
                        className="min-h-[34px] px-2.5 py-1 rounded-lg bg-surface hover:bg-paper-2 text-ink-2 border border-rule font-bold flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        <span>Editar</span>
                      </button>

                      {inactiva ? (
                        <button
                          type="button"
                          disabled={enProceso}
                          onClick={() => handleReactivarRama(r)}
                          className="min-h-[34px] px-2.5 py-1 rounded-lg bg-brand/10 text-ink-2 border border-brand/30 font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50 transition-colors"
                        >
                          {enProceso ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                          <span>Activar</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={enProceso}
                          onClick={() => handleQuitarRama(r)}
                          title="Desactivar rama"
                          className="min-h-[34px] px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60 font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                        >
                          {enProceso ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                          <span>Desactivar</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* COLUMNA 2: SECCIONES / UNIDADES DEL GRUPO */}
        <div className="bg-surface rounded-2xl border border-rule shadow-xs p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-brand" />
              <h3 className="text-base font-bold text-ink">
                Secciones Operativas del Grupo
              </h3>
            </div>
            {puedeGestionar && (
              <button
                type="button"
                onClick={abrirCrearUnidad}
                className="min-h-[38px] px-3 py-1.5 rounded-xl bg-brand hover:opacity-90 active:opacity-100 text-brand-contrast text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>Agregar Sección</span>
              </button>
            )}
          </div>

          {/* Listado de Secciones */}
          <div className="space-y-2">
            {unidades.map((u) => {
              const inactiva = u.activa === false;
              const enProceso = procesandoUnidadId === u.id;
              const miembrosActivos = u._count?.asignaciones ?? 0;
              return (
                <div
                  key={u.id}
                  className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3.5 rounded-xl border text-xs transition-colors ${
                    inactiva
                      ? 'bg-paper-2 border-rule opacity-65'
                      : 'bg-paper-2 border-rule hover:border-brand/40 hover:bg-surface'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-extrabold text-ink text-sm">
                        {u.nombre}
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-paper-3 text-ink-2 text-[10px] font-bold">
                        {u.rama?.nombre || 'Adultos'}
                      </span>
                      {inactiva && (
                        <span className="px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 font-bold text-[10px]">
                          Inactiva
                        </span>
                      )}
                    </div>
                    <span className="text-ink-muted text-[11px] block mt-0.5">
                      {TIPO_UNIDAD_LABELS[u.tipo] || 'Sección del Grupo'} • {miembrosActivos}{' '}
                      {miembrosActivos === 1 ? 'miembro activo' : 'miembros activos'}
                    </span>
                  </div>

                  {puedeGestionar && (
                    <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                      <button
                        type="button"
                        onClick={() => abrirEditarUnidad(u)}
                        className="min-h-[34px] px-2.5 py-1 rounded-lg bg-surface hover:bg-paper-2 text-ink-2 border border-rule font-bold flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        <span>Editar</span>
                      </button>

                      {inactiva ? (
                        <button
                          type="button"
                          disabled={enProceso}
                          onClick={() => handleReactivarUnidad(u)}
                          className="min-h-[34px] px-2.5 py-1 rounded-lg bg-brand/10 text-ink-2 border border-brand/30 font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50 transition-colors"
                        >
                          {enProceso ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                          <span>Activar</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={enProceso}
                          onClick={() => handleQuitarUnidad(u)}
                          title="Desactivar sección"
                          className="min-h-[34px] px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60 font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                        >
                          {enProceso ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                          <span>Desactivar</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Modal / Overlay Flotante para Crear o Editar Rama */}
      {puedeGestionar && (creandoRama || editandoRama) && (
        <div
          onClick={() => {
            if (!guardandoRama) {
              setCreandoRama(false);
              setEditandoRama(null);
            }
          }}
          className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4 motion-safe:animate-in motion-safe:fade-in motion-reduce:animate-none"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-surface border-t sm:border border-rule rounded-t-3xl sm:rounded-3xl w-full max-w-lg max-h-[92vh] overflow-hidden shadow-2xl flex flex-col animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-150"
          >
            {/* Cabecera del Modal */}
            <div className="p-4 sm:p-5 border-b border-rule flex items-center justify-between bg-paper-2 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-brand/10 text-brand flex items-center justify-center font-bold">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-ink">
                    {editandoRama ? `Editar Rama: ${editandoRama.nombre}` : 'Nueva Rama Pedagógica'}
                  </h3>
                  <p className="text-xs text-ink-muted">
                    {editandoRama
                      ? 'Modificá el nombre, rango de edades de permanencia y orden de progresión.'
                      : 'Definí los datos de la nueva rama pedagógica del grupo.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCreandoRama(false);
                  setEditandoRama(null);
                }}
                className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-ink-muted hover:text-ink hover:bg-paper-3 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Formulario */}
            <form
              id="form-modal-rama"
              onSubmit={handleGuardarRama}
              className="flex flex-col flex-1 overflow-hidden"
            >
              <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1 text-xs">
                <div>
                  <label className="block text-xs font-bold text-ink-2 mb-1.5">
                    Nombre de la Rama *
                  </label>
                  <input
                    type="text"
                    required
                    value={formRama.nombre}
                    onChange={(e) => setFormRama({ ...formRama, nombre: e.target.value })}
                    placeholder="Ej: Castores, Lobatos, Scout..."
                    className="w-full min-h-[42px] px-3.5 py-2.5 rounded-xl border border-rule bg-surface text-ink text-sm font-bold focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none transition-colors"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-ink-2 mb-1.5">
                      Edad Mínima (años) *
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={99}
                      required
                      value={formRama.edadMinima}
                      onChange={(e) => setFormRama({ ...formRama, edadMinima: Number(e.target.value) })}
                      className="w-full min-h-[42px] px-3.5 py-2.5 rounded-xl border border-rule bg-surface text-ink text-sm font-bold focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-ink-2 mb-1.5">
                      Edad Máxima *
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={99}
                      required
                      value={formRama.edadMaxima}
                      onChange={(e) => setFormRama({ ...formRama, edadMaxima: Number(e.target.value) })}
                      className="w-full min-h-[42px] px-3.5 py-2.5 rounded-xl border border-rule bg-surface text-ink text-sm font-bold focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none transition-colors"
                    />
                    <span className="text-[11px] text-ink-muted mt-1 block">
                      Sugiere pase al cumplir {Number(formRama.edadMaxima) + 1} años.
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-ink-2 mb-1.5">
                    Orden de Progresión (1°, 2°, 3°...) *
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    required
                    value={formRama.ordenProgresion}
                    onChange={(e) =>
                      setFormRama({ ...formRama, ordenProgresion: Number(e.target.value) })
                    }
                    className="w-full min-h-[42px] px-3.5 py-2.5 rounded-xl border border-rule bg-surface text-ink text-sm font-bold focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none transition-colors"
                  />
                </div>

                {creandoRama && (
                  <div className="pt-1">
                    <label className="flex items-center gap-2.5 p-3 rounded-xl bg-paper-2 border border-rule cursor-pointer text-ink-2 font-semibold">
                      <input
                        type="checkbox"
                        checked={formRama.crearSeccionAutomatica}
                        onChange={(e) =>
                          setFormRama({ ...formRama, crearSeccionAutomatica: e.target.checked })
                        }
                        className="w-4 h-4 rounded accent-brand"
                      />
                      <span>Crear sección operativa automáticamente para esta rama</span>
                    </label>
                  </div>
                )}
              </div>

              {/* Pie con Acciones */}
              <div className="p-4 sm:p-5 border-t border-rule bg-paper-2 flex items-center justify-end gap-2.5 shrink-0">
                <button
                  type="button"
                  disabled={guardandoRama}
                  onClick={() => {
                    setCreandoRama(false);
                    setEditandoRama(null);
                  }}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-surface hover:bg-paper-2 text-ink-2 border border-rule font-bold text-xs cursor-pointer disabled:opacity-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardandoRama}
                  className="min-h-[44px] px-5 py-2 rounded-xl bg-brand hover:opacity-90 active:opacity-100 text-brand-contrast text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-xs transition-colors"
                >
                  {guardandoRama ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  <span>{editandoRama ? 'Guardar Cambios' : 'Crear Rama'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal / Overlay Flotante para Crear o Editar Sección */}
      {puedeGestionar && (creandoUnidad || editandoUnidad) && (
        <div
          onClick={() => {
            if (!guardandoUnidad) {
              setCreandoUnidad(false);
              setEditandoUnidad(null);
            }
          }}
          className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4 motion-safe:animate-in motion-safe:fade-in motion-reduce:animate-none"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-surface border-t sm:border border-rule rounded-t-3xl sm:rounded-3xl w-full max-w-lg max-h-[92vh] overflow-hidden shadow-2xl flex flex-col animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-150"
          >
            {/* Cabecera del Modal */}
            <div className="p-4 sm:p-5 border-b border-rule flex items-center justify-between bg-paper-2 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-brand/10 text-brand flex items-center justify-center font-bold">
                  <GitBranch className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-ink">
                    {editandoUnidad ? `Editar Sección: ${editandoUnidad.nombre}` : 'Nueva Sección del Grupo'}
                  </h3>
                  <p className="text-xs text-ink-muted">
                    {editandoUnidad
                      ? 'Modificá el nombre, tipo de sección o su rama pedagógica asociada.'
                      : 'Configurá una nueva sección operativa para el grupo.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCreandoUnidad(false);
                  setEditandoUnidad(null);
                }}
                className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-ink-muted hover:text-ink hover:bg-paper-3 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Formulario */}
            <form
              id="form-modal-unidad"
              onSubmit={handleGuardarUnidad}
              className="flex flex-col flex-1 overflow-hidden"
            >
              <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1 text-xs">
                <div>
                  <label className="block text-xs font-bold text-ink-2 mb-1.5">
                    Nombre de la Sección *
                  </label>
                  <input
                    type="text"
                    required
                    value={formUnidad.nombre}
                    onChange={(e) => setFormUnidad({ ...formUnidad, nombre: e.target.value })}
                    placeholder="Ej: Rama Scout Cura Brochero"
                    className="w-full min-h-[42px] px-3.5 py-2.5 rounded-xl border border-rule bg-surface text-ink text-sm font-bold focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-ink-2 mb-1.5">
                    Tipo de Sección *
                  </label>
                  <select
                    value={formUnidad.tipo}
                    onChange={(e) =>
                      setFormUnidad({
                        ...formUnidad,
                        tipo: e.target.value as 'SECCION_RAMA' | 'JEFATURA' | 'SIN_RAMA_APOYO',
                      })
                    }
                    className="w-full min-h-[42px] px-3.5 py-2.5 rounded-xl border border-rule bg-surface text-ink text-sm font-bold focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none transition-colors"
                  >
                    <option value="SECCION_RAMA">Sección de Rama (Protagonistas)</option>
                    <option value="SIN_RAMA_APOYO">Equipo de Apoyo / Sin Rama</option>
                    <option value="JEFATURA">Jefatura de Grupo</option>
                  </select>
                </div>

                {formUnidad.tipo === 'SECCION_RAMA' && (
                  <div>
                    <label className="block text-xs font-bold text-ink-2 mb-1.5">
                      Rama Pedagógica Asociada *
                    </label>
                    <select
                      required
                      value={formUnidad.ramaId}
                      onChange={(e) =>
                        setFormUnidad({
                          ...formUnidad,
                          ramaId: e.target.value ? Number(e.target.value) : '',
                        })
                      }
                      className="w-full min-h-[42px] px-3.5 py-2.5 rounded-xl border border-rule bg-surface text-ink text-sm font-bold focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none transition-colors"
                    >
                      <option value="">Seleccionar rama…</option>
                      {ramas
                        .filter((r) => r.activa !== false)
                        .map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.nombre} ({r.edadMinima}-{r.edadMaxima} años)
                          </option>
                        ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Pie con Acciones */}
              <div className="p-4 sm:p-5 border-t border-rule bg-paper-2 flex items-center justify-end gap-2.5 shrink-0">
                <button
                  type="button"
                  disabled={guardandoUnidad}
                  onClick={() => {
                    setCreandoUnidad(false);
                    setEditandoUnidad(null);
                  }}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-surface hover:bg-paper-2 text-ink-2 border border-rule font-bold text-xs cursor-pointer disabled:opacity-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardandoUnidad}
                  className="min-h-[44px] px-5 py-2 rounded-xl bg-brand hover:opacity-90 active:opacity-100 text-brand-contrast text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-xs transition-colors"
                >
                  {guardandoUnidad ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  <span>{editandoUnidad ? 'Guardar Cambios' : 'Crear Sección'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
