import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { traducirErrorAmigable } from '../lib/formatters';
import {
  FileText,
  CheckCircle2,
  AlertCircle,
  Pencil,
  PlusCircle,
  Calendar,
  X,
  Loader2,
  Check,
  Eye,
  Power,
} from 'lucide-react';

interface Props {
  onToast: (texto: string, tipo?: 'exito' | 'error') => void;
}

export const PanelAdminPlantillas: React.FC<Props> = ({ onToast }) => {
  const puedeGestionar = useAuthStore((s) => s.tienePermiso('legajos.plantillas_gestionar'));
  const [plantillas, setPlantillas] = useState<any[]>([]);
  const [cargando, setCargando] = useState(false);
  const [procesandoId, setProcesandoId] = useState<number | null>(null);

  // Modal Crear / Editar
  const [modalAbierto, setModalAbierto] = useState(false);
  const [plantillaEditando, setPlantillaEditando] = useState<any | null>(null);
  const [form, setForm] = useState({
    codigo: '',
    titulo: '',
    version: '1.0',
    cicloAnio: new Date().getFullYear(),
    activa: true,
  });
  const [guardando, setGuardando] = useState(false);

  // Ver detalle de secciones
  const [plantillaDetalle, setPlantillaDetalle] = useState<any | null>(null);

  const cargarPlantillas = async () => {
    setCargando(true);
    try {
      const res = await api.get('/legajos/plantillas?incluirInactivas=true');
      setPlantillas(res.data || []);
    } catch (err) {
      onToast(traducirErrorAmigable(err, 'No se pudieron cargar los formularios.'), 'error');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarPlantillas();
  }, []);

  const abrirNueva = () => {
    setPlantillaEditando(null);
    setForm({
      codigo: `FORM_${new Date().getFullYear()}`,
      titulo: `Ficha Médica e Inscripción ${new Date().getFullYear()}`,
      version: '1.0',
      cicloAnio: new Date().getFullYear(),
      activa: true,
    });
    setModalAbierto(true);
  };

  const abrirEditar = (p: any) => {
    setPlantillaEditando(p);
    setForm({
      codigo: p.codigo,
      titulo: p.titulo,
      version: p.version,
      cicloAnio: Number(p.cicloAnio),
      activa: Boolean(p.activa),
    });
    setModalAbierto(true);
  };

  const handleToggleActiva = async (p: any) => {
    if (!puedeGestionar) return;
    setProcesandoId(p.id);
    try {
      const nuevoEstado = !p.activa;
      await api.patch(`/legajos/plantillas/${p.id}`, { activa: nuevoEstado });
      onToast(
        nuevoEstado
          ? `Formulario "${p.titulo}" activado.`
          : `Formulario "${p.titulo}" pausado.`,
      );
      await cargarPlantillas();
    } catch (err) {
      onToast(traducirErrorAmigable(err, 'No se pudo cambiar el estado del formulario.'), 'error');
    } finally {
      setProcesandoId(null);
    }
  };

  const handleGuardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.titulo.trim() || !form.codigo.trim()) return;

    setGuardando(true);
    try {
      if (plantillaEditando) {
        await api.patch(`/legajos/plantillas/${plantillaEditando.id}`, {
          titulo: form.titulo.trim(),
          version: form.version.trim(),
          cicloAnio: Number(form.cicloAnio),
          activa: form.activa,
        });
        onToast(`Formulario "${form.titulo}" actualizado.`);
      } else {
        await api.post('/legajos/plantillas', {
          codigo: form.codigo.trim().toUpperCase(),
          titulo: form.titulo.trim(),
          version: form.version.trim(),
          cicloAnio: Number(form.cicloAnio),
          activa: form.activa,
          esquemaCamposJson: { secciones: [] },
          mapeoPdfJson: {},
        });
        onToast(`Formulario "${form.titulo}" creado.`);
      }
      setModalAbierto(false);
      await cargarPlantillas();
    } catch (err) {
      onToast(traducirErrorAmigable(err, 'No se pudo guardar el formulario.'), 'error');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Cabecera */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <FileText className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>Formularios de Inscripción y Fichas Médicas</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Configuración de las plantillas oficiales que completan las familias cada ciclo anual.
          </p>
        </div>

        {puedeGestionar && (
          <button
            type="button"
            onClick={abrirNueva}
            className="min-h-[44px] px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer shrink-0 shadow-xs"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Nuevo Formulario</span>
          </button>
        )}
      </div>

      {/* Lista de Plantillas */}
      {cargando ? (
        <div className="p-12 flex flex-col items-center justify-center text-slate-400 gap-2">
          <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
          <span className="text-xs">Cargando formularios...</span>
        </div>
      ) : plantillas.length === 0 ? (
        <div className="p-10 text-center rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 text-sm text-slate-400">
          No hay formularios registrados en el sistema.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {plantillas.map((p) => {
            const esquema = p.esquemaCamposJson || {};
            const secciones = Array.isArray(esquema.secciones) ? esquema.secciones : [];
            const cantCampos = secciones.reduce(
              (acc: number, sec: any) => acc + (Array.isArray(sec.campos) ? sec.campos.length : 0),
              0,
            );
            const enProceso = procesandoId === p.id;

            return (
              <div
                key={p.id}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-xs flex flex-col justify-between gap-4"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border flex items-center gap-1 ${
                            p.activa
                              ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          {p.activa ? (
                            <>
                              <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                              <span>Activo en este ciclo</span>
                            </>
                          ) : (
                            <>
                              <AlertCircle className="w-3 h-3 text-slate-400" />
                              <span>Pausado / Inactivo</span>
                            </>
                          )}
                        </span>

                        <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-bold border border-slate-200 dark:border-slate-700">
                          Ciclo {p.cicloAnio}
                        </span>

                        <span className="text-[10px] font-bold text-slate-400">
                          v{p.version}
                        </span>
                      </div>

                      <h3 className="font-extrabold text-slate-900 dark:text-slate-100 text-base mt-1.5">
                        {p.titulo}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                        Código: {p.codigo}
                      </p>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between text-slate-700 dark:text-slate-300 font-semibold">
                      <span>Estructura de la ficha:</span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                        {secciones.length} secciones • {cantCampos} preguntas
                      </span>
                    </div>
                    {secciones.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {secciones.map((sec: any) => (
                          <span
                            key={sec.id || sec.titulo}
                            className="px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] text-slate-600 dark:text-slate-300"
                          >
                            {sec.titulo}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setPlantillaDetalle(plantillaDetalle?.id === p.id ? null : p)}
                    className="min-h-[38px] px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5 text-slate-500" />
                    <span>{plantillaDetalle?.id === p.id ? 'Ocultar preguntas' : 'Ver preguntas'}</span>
                  </button>

                  {puedeGestionar && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={enProceso}
                        onClick={() => handleToggleActiva(p)}
                        className={`min-h-[38px] px-3 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer border disabled:opacity-50 ${
                          p.activa
                            ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800/60 hover:bg-rose-100'
                            : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100'
                        }`}
                        title={p.activa ? 'Pausar formulario' : 'Habilitar formulario'}
                      >
                        {enProceso ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Power className="w-3.5 h-3.5" />
                        )}
                        <span>{p.activa ? 'Pausar' : 'Activar'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => abrirEditar(p)}
                        className="min-h-[38px] px-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700"
                      >
                        <Pencil className="w-3.5 h-3.5 text-slate-500" />
                        <span>Editar</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Vista previa de preguntas */}
                {plantillaDetalle?.id === p.id && secciones.length > 0 && (
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-3">
                    <h4 className="text-xs font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                      Preguntas del Formulario ({cantCampos})
                    </h4>
                    <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                      {secciones.map((sec: any) => (
                        <div
                          key={sec.id || sec.titulo}
                          className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-1.5"
                        >
                          <div className="font-bold text-xs text-slate-900 dark:text-slate-100">
                            {sec.titulo}
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] text-slate-600 dark:text-slate-300">
                            {(sec.campos || []).map((c: any) => (
                              <div
                                key={c.key}
                                className="flex items-center gap-1 bg-white dark:bg-slate-900 px-2 py-1 rounded-md border border-slate-200/80 dark:border-slate-700/80"
                              >
                                <span className="font-medium truncate flex-1">{c.label}</span>
                                {c.required && (
                                  <span className="text-rose-500 text-[10px] font-bold shrink-0">*</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Crear / Editar Plantilla */}
      {modalAbierto && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl p-5 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                <h3 className="font-extrabold text-base text-slate-900 dark:text-slate-100">
                  {plantillaEditando ? 'Modificar Formulario' : 'Nuevo Formulario Oficial'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setModalAbierto(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleGuardar} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Nombre del Formulario
                </label>
                <input
                  type="text"
                  required
                  value={form.titulo}
                  onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                  placeholder="Ej: Ficha Médica e Inscripción 2026"
                  className="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:border-emerald-500 font-medium"
                />
              </div>

              {!plantillaEditando && (
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Código de Identificación Único
                  </label>
                  <input
                    type="text"
                    required
                    value={form.codigo}
                    onChange={(e) => setForm({ ...form, codigo: e.target.value })}
                    placeholder="Ej: OFICIAL_2026"
                    className="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:border-emerald-500 font-mono uppercase"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Ciclo Anual
                  </label>
                  <input
                    type="number"
                    min={2000}
                    max={2100}
                    required
                    value={form.cicloAnio}
                    onChange={(e) => setForm({ ...form, cicloAnio: Number(e.target.value) })}
                    className="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:border-emerald-500 font-bold"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Versión
                  </label>
                  <input
                    type="text"
                    required
                    value={form.version}
                    onChange={(e) => setForm({ ...form, version: e.target.value })}
                    placeholder="1.0"
                    className="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:border-emerald-500 font-medium"
                  />
                </div>
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-800 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={form.activa}
                    onChange={(e) => setForm({ ...form, activa: e.target.checked })}
                    className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300"
                  />
                  <span>Formulario activo para ser completado por las familias</span>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setModalAbierto(false)}
                  className="min-h-[42px] px-4 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  className="min-h-[42px] px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 shadow-xs"
                >
                  {guardando ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  <span>{plantillaEditando ? 'Guardar Cambios' : 'Crear Formulario'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
