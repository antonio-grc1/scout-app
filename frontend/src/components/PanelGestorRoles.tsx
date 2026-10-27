import React, { useState, useMemo } from 'react';
import { api } from '../api/client';
import { traducirErrorAmigable } from '../lib/formatters';
import {
  ShieldCheck,
  PlusCircle,
  Pencil,
  Trash2,
  Check,
  X,
  Loader2,
  Lock,
  Users,
  Globe,
  UserCheck,
  CheckSquare,
  Square,
} from 'lucide-react';

interface Props {
  roles: any[];
  permisosCatalogo: any[];
  onRecargar: () => Promise<void>;
  onToast: (texto: string, tipo?: 'exito' | 'error') => void;
}

const ALCANCE_INFO: Record<
  'PROPIO' | 'UNIDAD' | 'GLOBAL',
  {
    titulo: string;
    subtitulo: string;
    badgeClass: string;
    Icono: React.FC<{ className?: string }>;
  }
> = {
  PROPIO: {
    titulo: 'Alcance Personal (Propio)',
    subtitulo: 'Solo accede a su propio legajo, perfil y estado de cuenta.',
    badgeClass:
      'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
    Icono: UserCheck,
  },
  UNIDAD: {
    titulo: 'Alcance de Rama / Sección',
    subtitulo: 'Opera únicamente sobre la planilla y miembros de su rama asignada.',
    badgeClass:
      'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800',
    Icono: Users,
  },
  GLOBAL: {
    titulo: 'Alcance Global (Todo el Grupo)',
    subtitulo: 'Visualiza y actúa sobre todas las ramas y secciones del grupo según sus permisos.',
    badgeClass:
      'bg-indigo-50 text-indigo-800 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800',
    Icono: Globe,
  },
};

const ETIQUETAS_PERMISOS_HUMANAS: Record<
  string,
  { titulo: string; detalle: string; categoria: string }
> = {
  'miembros.ver': {
    titulo: 'Ver planilla de rama / padrón de miembros',
    detalle: 'Permite ver el listado de miembros, teléfonos y grupos familiares dentro de su alcance.',
    categoria: 'Padrón y Miembros',
  },
  'miembros.crear': {
    titulo: 'Dar de alta nuevos miembros',
    detalle: 'Permite inscribir nuevos protagonistas o educadores en la rama.',
    categoria: 'Padrón y Miembros',
  },
  'miembros.editar': {
    titulo: 'Modificar miembros de la rama / datos de contacto',
    detalle: 'Permite editar datos personales, teléfonos familiares y dar de baja o reactivar miembros.',
    categoria: 'Padrón y Miembros',
  },
  'auth.resetear_clave': {
    titulo: 'Blanquear contraseña al DNI',
    detalle: 'Permite restablecer la clave de acceso de un miembro cuando la olvida.',
    categoria: 'Padrón y Miembros',
  },
  'legajos.ver': {
    titulo: 'Ver fichas médicas y legajos',
    detalle: 'Permite consultar y visualizar el PDF de las fichas médicas.',
    categoria: 'Fichas Médicas y Legajos',
  },
  'legajos.completar': {
    titulo: 'Completar y actualizar fichas médicas',
    detalle: 'Permite llenar el formulario médico y generar el PDF con código QR.',
    categoria: 'Fichas Médicas y Legajos',
  },
  'legajos.validar_fisico': {
    titulo: 'Recibir y validar fichas en papel (Escáner QR)',
    detalle: 'Permite escanear el QR o ingresar código manual para dar por entregada la ficha firmada.',
    categoria: 'Fichas Médicas y Legajos',
  },
  'legajos.plantillas_gestionar': {
    titulo: 'Administrar plantillas oficiales de formularios',
    detalle: 'Permite crear o modificar la estructura de las plantillas de legajo.',
    categoria: 'Fichas Médicas y Legajos',
  },
  'pases.ver': {
    titulo: 'Ver camadas y sugerencias de pase de rama',
    detalle: 'Permite ver qué miembros cumplen la edad de pase al 30/06.',
    categoria: 'Camadas y Pases de Rama',
  },
  'pases.ejecutar': {
    titulo: 'Ejecutar pases de rama y cambios de sección',
    detalle: 'Permite pasar miembros individualmente o por camada completa a otra rama.',
    categoria: 'Camadas y Pases de Rama',
  },
  'cuotas.ver': {
    titulo: 'Ver planilla de cuotas y estado de cuenta',
    detalle: 'Permite consultar deudas, pagos e historial económico de los miembros.',
    categoria: 'Cuotas y Tesorería',
  },
  'cuotas.cobrar': {
    titulo: 'Registrar cobros de cuotas y eventos',
    detalle: 'Permite asentar pagos en efectivo o transferencia en la cuenta del miembro.',
    categoria: 'Cuotas y Tesorería',
  },
  'tesoreria.gestionar': {
    titulo: 'Gestionar planes anuales, campamentos y descuentos familiares',
    detalle: 'Permite crear cuadros de cuotas, cobros especiales, revertir pagos y configurar descuentos.',
    categoria: 'Cuotas y Tesorería',
  },
  'organizacion.ver': {
    titulo: 'Ver configuración de ramas, secciones y roles',
    detalle: 'Permite consultar las ramas, rangos de edad y roles disponibles.',
    categoria: 'Organización y Roles',
  },
  'organizacion.gestionar': {
    titulo: 'Modificar ramas, edades, secciones y roles del grupo',
    detalle: 'Permite agregar o quitar ramas, cambiar edades de pase y administrar roles.',
    categoria: 'Organización y Roles',
  },
};

export const PanelGestorRoles: React.FC<Props> = ({
  roles,
  permisosCatalogo,
  onRecargar,
  onToast,
}) => {
  const [rolEditando, setRolEditando] = useState<any | null>(null);
  const [creandoRol, setCreandoRol] = useState(false);
  const [nombreRol, setNombreRol] = useState('');
  const [alcancePorDefecto, setAlcancePorDefecto] = useState<'PROPIO' | 'UNIDAD' | 'GLOBAL'>('UNIDAD');
  const [permisosSeleccionados, setPermisosSeleccionados] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [eliminandoId, setEliminandoId] = useState<number | null>(null);

  const permisosPorCategoria = useMemo(() => {
    const mapa = new Map<
      string,
      Array<{ clave: string; titulo: string; detalle: string }>
    >();

    for (const p of permisosCatalogo) {
      const meta = ETIQUETAS_PERMISOS_HUMANAS[p.clave] || {
        titulo: p.descripcion || p.clave,
        detalle: `Permiso técnico: ${p.clave}`,
        categoria: 'Otros Permisos',
      };
      if (!mapa.has(meta.categoria)) {
        mapa.set(meta.categoria, []);
      }
      mapa.get(meta.categoria)!.push({
        clave: p.clave,
        titulo: meta.titulo,
        detalle: meta.detalle,
      });
    }

    return Array.from(mapa.entries());
  }, [permisosCatalogo]);

  const abrirNuevoRol = () => {
    setRolEditando(null);
    setNombreRol('');
    setAlcancePorDefecto('UNIDAD');
    setPermisosSeleccionados([
      'organizacion.ver',
      'miembros.ver',
      'legajos.ver',
      'cuotas.ver',
    ]);
    setCreandoRol(true);
  };

  const abrirEditarRol = (r: any) => {
    setCreandoRol(false);
    setRolEditando(r);
    setNombreRol(r.nombre);
    setAlcancePorDefecto(r.alcancePorDefecto || 'UNIDAD');
    setPermisosSeleccionados(Array.isArray(r.permisos) ? [...r.permisos] : []);
  };

  const togglePermiso = (clave: string) => {
    setPermisosSeleccionados((prev) =>
      prev.includes(clave) ? prev.filter((c) => c !== clave) : [...prev, clave],
    );
  };

  const seleccionarTodos = () => {
    setPermisosSeleccionados(permisosCatalogo.map((p) => p.clave));
  };

  const limpiarTodos = () => {
    setPermisosSeleccionados([]);
  };

  const handleGuardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombreRol.trim()) return;

    setGuardando(true);
    try {
      if (rolEditando) {
        const payload: Record<string, any> = {
          alcancePorDefecto,
          permisos: permisosSeleccionados,
        };
        if (!rolEditando.esSistema) {
          payload.nombre = nombreRol.trim();
        }
        await api.patch(`/organizacion/roles/${rolEditando.id}`, payload);
        onToast(`Rol "${nombreRol.trim()}" actualizado correctamente.`);
      } else {
        await api.post('/organizacion/roles', {
          nombre: nombreRol.trim(),
          alcancePorDefecto,
          permisos: permisosSeleccionados,
        });
        onToast(`Nuevo rol "${nombreRol.trim()}" creado.`);
      }
      setCreandoRol(false);
      setRolEditando(null);
      await onRecargar();
    } catch (err) {
      onToast(traducirErrorAmigable(err, 'No se pudo guardar el rol.'), 'error');
    } finally {
      setGuardando(false);
    }
  };

  const handleEliminarRol = async (r: any) => {
    setEliminandoId(r.id);
    try {
      const res = await api.delete(`/organizacion/roles/${r.id}`);
      onToast(res.data?.mensaje || `Rol "${r.nombre}" eliminado.`);
      if (rolEditando?.id === r.id) {
        setRolEditando(null);
      }
      await onRecargar();
    } catch (err) {
      onToast(traducirErrorAmigable(err, 'No se pudo eliminar el rol.'), 'error');
    } finally {
      setEliminandoId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Cabecera */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <span>Gestión de Roles, Alcances y Permisos</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Revisá el alcance de cada rol, habilitá o quitá acciones (ver planilla de rama, modificar miembros, cobrar cuotas) o creá nuevos roles personalizados.
          </p>
        </div>

        <button
          type="button"
          onClick={abrirNuevoRol}
          className="min-h-[42px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer shrink-0 shadow-2xs"
        >
          <PlusCircle className="w-4 h-4" />
          <span>Agregar Nuevo Rol</span>
        </button>
      </div>

      {/* Formulario Editor / Creador de Rol */}
      {(creandoRol || rolEditando) && (
        <form
          onSubmit={handleGuardar}
          className="bg-white dark:bg-slate-900 rounded-2xl border-2 border-emerald-500 dark:border-emerald-600 p-5 shadow-md space-y-5 animate-in fade-in duration-150"
        >
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
                {rolEditando
                  ? `Configurar Rol: ${rolEditando.nombre}`
                  : 'Crear Nuevo Rol Personalizado'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Definí su alcance territorial dentro del grupo y marcá qué acciones puede realizar.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setCreandoRol(false);
                setRolEditando(null);
              }}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Nombre del Rol
              </label>
              <input
                type="text"
                required
                disabled={Boolean(rolEditando?.esSistema)}
                value={nombreRol}
                onChange={(e) => setNombreRol(e.target.value)}
                placeholder="Ej: Subjefe de Rama, Tesorero de Grupo, Intendente..."
                className="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs font-semibold outline-none focus:border-emerald-500 disabled:opacity-60"
              />
              {rolEditando?.esSistema && (
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Los roles base del sistema conservan su nombre original, pero podés ajustar su alcance y todos sus permisos.
                </span>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Alcance del Rol (Sobre quiénes puede actuar)
              </label>
              <select
                value={alcancePorDefecto}
                onChange={(e) =>
                  setAlcancePorDefecto(e.target.value as 'PROPIO' | 'UNIDAD' | 'GLOBAL')
                }
                className="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs font-bold outline-none focus:border-emerald-500"
              >
                <option value="PROPIO">PROPIO — Solo sus propios datos y ficha personal</option>
                <option value="UNIDAD">UNIDAD — Planilla y miembros de su Rama asignada</option>
                <option value="GLOBAL">GLOBAL — Todas las ramas y miembros del Grupo</option>
              </select>
              <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium mt-1 block">
                {ALCANCE_INFO[alcancePorDefecto].subtitulo}
              </span>
            </div>
          </div>

          {/* Matriz de Permisos por Categoría */}
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-xs font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                Permisos habilitados ({permisosSeleccionados.length} de {permisosCatalogo.length})
              </span>
              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={seleccionarTodos}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-emerald-50 text-slate-700 dark:text-slate-300 font-bold cursor-pointer"
                >
                  Marcar todos
                </button>
                <button
                  type="button"
                  onClick={limpiarTodos}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-rose-50 text-slate-600 dark:text-slate-400 font-bold cursor-pointer"
                >
                  Desmarcar todos
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {permisosPorCategoria.map(([categoria, items]) => (
                <div
                  key={categoria}
                  className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-2.5"
                >
                  <h4 className="text-xs font-extrabold text-slate-900 dark:text-slate-100 border-b border-slate-200/80 dark:border-slate-700 pb-1.5">
                    {categoria}
                  </h4>
                  <div className="space-y-2">
                    {items.map((item) => {
                      const marcado = permisosSeleccionados.includes(item.clave);
                      return (
                        <button
                          key={item.clave}
                          type="button"
                          onClick={() => togglePermiso(item.clave)}
                          className={`w-full p-2.5 rounded-xl border text-left flex items-start gap-2.5 transition cursor-pointer ${
                            marcado
                              ? 'bg-emerald-50/90 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-800 text-slate-900 dark:text-slate-100'
                              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                          }`}
                        >
                          {marcado ? (
                            <CheckSquare className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                          )}
                          <div className="min-w-0">
                            <span className="text-xs font-bold block leading-snug">
                              {item.titulo}
                            </span>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5 leading-tight">
                              {item.detalle}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => {
                setCreandoRol(false);
                setRolEditando(null);
              }}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="min-h-[42px] px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              <span>Guardar Configuración del Rol</span>
            </button>
          </div>
        </form>
      )}

      {/* Tarjetas de Roles Actuales */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {roles.map((r) => {
          const alcanceCfg =
            ALCANCE_INFO[(r.alcancePorDefecto as 'PROPIO' | 'UNIDAD' | 'GLOBAL') || 'PROPIO'];
          const IconoAlcance = alcanceCfg.Icono;
          const permisosRol: string[] = Array.isArray(r.permisos) ? r.permisos : [];
          const eliminando = eliminandoId === r.id;

          return (
            <div
              key={r.id}
              className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs flex flex-col justify-between gap-4"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100">
                        {r.nombre}
                      </h3>
                      {r.esSistema ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                          <Lock className="w-2.5 h-2.5" /> Rol Base
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                          Personalizado
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-slate-500 dark:text-slate-400 block mt-0.5">
                      {r.asignacionesActivas || 0}{' '}
                      {r.asignacionesActivas === 1 ? 'miembro activo' : 'miembros activos'} con este rol
                    </span>
                  </div>

                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-bold border shrink-0 ${alcanceCfg.badgeClass}`}
                  >
                    <IconoAlcance className="w-3.5 h-3.5" />
                    <span>{alcanceCfg.titulo}</span>
                  </span>
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
                  {alcanceCfg.subtitulo}
                </p>

                <div>
                  <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1.5">
                    Capacidades habilitadas ({permisosRol.length}):
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {permisosRol.map((clave) => {
                      const info = ETIQUETAS_PERMISOS_HUMANAS[clave];
                      return (
                        <span
                          key={clave}
                          className="px-2 py-0.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border border-emerald-200/70 dark:border-emerald-800/60 text-[11px] font-semibold"
                        >
                          {info ? info.titulo : clave}
                        </span>
                      );
                    })}
                    {permisosRol.length === 0 && (
                      <span className="text-xs text-slate-400 italic">
                        Sin permisos asignados
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => abrirEditarRol(r)}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 text-slate-800 dark:text-slate-200 hover:text-emerald-700 dark:hover:text-emerald-300 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  <span>Modificar Permisos y Alcance</span>
                </button>

                {!r.esSistema && (
                  <button
                    type="button"
                    disabled={eliminando}
                    onClick={() => handleEliminarRol(r)}
                    className="min-h-[38px] px-3 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                  >
                    {eliminando ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                    <span>Eliminar</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
