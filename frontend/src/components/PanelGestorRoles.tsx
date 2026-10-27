import React, { useState, useMemo } from 'react';
import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { traducirErrorAmigable } from '../lib/formatters';
import { ModalConfirmacion, type ModalConfirmacionProps } from './ModalConfirmacion';
import {
  ShieldCheck,
  PlusCircle,
  Pencil,
  Trash2,
  Check,
  X,
  Loader2,
  Users,
  Globe,
  UserCheck,
  Compass,
  Sparkles,
  AlertTriangle,
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
    tituloCorto: string;
    subtitulo: string;
    badgeClass: string;
    Icono: React.FC<{ className?: string }>;
  }
> = {
  PROPIO: {
    titulo: 'Solo su propia ficha y cuenta',
    tituloCorto: 'Solo su ficha personal',
    subtitulo: 'Únicamente ve sus propios datos personales, su ficha médica y el estado de sus cuotas.',
    badgeClass:
      'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
    Icono: UserCheck,
  },
  UNIDAD: {
    titulo: 'Solo su rama / unidad asignada',
    tituloCorto: 'Solo su rama asignada',
    subtitulo: 'Puede ver y gestionar únicamente a las personas que pertenecen a su misma rama o sección.',
    badgeClass:
      'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800',
    Icono: Users,
  },
  GLOBAL: {
    titulo: 'Todo el grupo',
    tituloCorto: 'Todo el grupo',
    subtitulo: 'Puede ver y gestionar personas y datos de todas las ramas y del grupo general.',
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
    titulo: 'Puede ver el padrón de personas',
    detalle: 'Permite consultar el listado de integrantes, teléfonos de contacto y grupos familiares.',
    categoria: 'Personas y Padrón',
  },
  'miembros.crear': {
    titulo: 'Puede inscribir nuevas personas',
    detalle: 'Permite dar de alta nuevos protagonistas o educadores en el grupo.',
    categoria: 'Personas y Padrón',
  },
  'miembros.editar': {
    titulo: 'Puede modificar datos de contacto y salud',
    detalle: 'Permite actualizar teléfonos, emails, domicilio, obra social, alergias y vincular hermanos.',
    categoria: 'Personas y Padrón',
  },
  'miembros.editar_identidad': {
    titulo: 'Puede modificar identidad (Nombre, DNI, Nacimiento)',
    detalle: 'Permite modificar nombre, apellido, documento y fecha de nacimiento de un miembro.',
    categoria: 'Personas y Padrón',
  },
  'miembros.baja': {
    titulo: 'Puede dar de baja o reactivar miembros',
    detalle: 'Permite cambiar el estado de un integrante entre Activo y Dado de baja.',
    categoria: 'Personas y Padrón',
  },
  'auth.resetear_clave': {
    titulo: 'Puede restablecer contraseñas olvidadas',
    detalle: 'Permite volver la clave de acceso de una persona a su número de DNI cuando no puede entrar.',
    categoria: 'Personas y Padrón',
  },
  'legajos.ver': {
    titulo: 'Puede consultar fichas médicas y papeles',
    detalle: 'Permite ver el estado de entrega y previsualizar o descargar el PDF de las fichas de inscripción.',
    categoria: 'Documentos y Papeles',
  },
  'legajos.completar': {
    titulo: 'Puede completar y modificar papeles de inscripción',
    detalle: 'Permite rellenar el formulario médico y generar el documento PDF listo para imprimir y firmar.',
    categoria: 'Documentos y Papeles',
  },
  'legajos.validar_fisico': {
    titulo: 'Puede recibir fichas firmadas en papel (Lector QR)',
    detalle: 'Permite usar la cámara para escanear el código QR de la hoja firmada y marcarla como entregada.',
    categoria: 'Documentos y Papeles',
  },
  'legajos.plantillas_gestionar': {
    titulo: 'Puede diseñar los formularios de inscripción',
    detalle: 'Permite modificar las preguntas de las fichas médicas del ciclo anual.',
    categoria: 'Documentos y Papeles',
  },
  'cuotas.ver': {
    titulo: 'Puede consultar el estado de cuotas y pagos',
    detalle: 'Permite ver qué cuotas están al día, cuáles están pendientes y el historial de pagos.',
    categoria: 'Pagos y Tesorería',
  },
  'cuotas.cobrar': {
    titulo: 'Puede registrar pagos de cuotas y eventos',
    detalle: 'Permite cobrar cuotas en efectivo o transferencia y emitir comprobantes.',
    categoria: 'Pagos y Tesorería',
  },
  'tesoreria.gestionar': {
    titulo: 'Puede administrar planes de cuotas, campamentos y descuentos',
    detalle: 'Permite lanzar cuadros de cuotas anuales, crear cobros especiales, anular cargos y ajustar saldos.',
    categoria: 'Pagos y Tesorería',
  },
  'pases.ver': {
    titulo: 'Puede ver sugerencias de pases y progresiones por edad',
    detalle: 'Permite consultar quiénes cumplen la edad para pasar a la siguiente rama.',
    categoria: 'Progresiones y Pases',
  },
  'pases.ejecutar': {
    titulo: 'Puede realizar pases de rama y cambios de rol',
    detalle: 'Permite pasar personas de una rama a otra o cambiar su función en el grupo sin perder su historial.',
    categoria: 'Progresiones y Pases',
  },
  'organizacion.ver': {
    titulo: 'Puede ver la estructura de ramas y roles del grupo',
    detalle: 'Permite consultar las ramas activas, sus edades y los roles existentes.',
    categoria: 'Configuración del Sistema',
  },
  'organizacion.gestionar': {
    titulo: 'Puede administrar roles, permisos y ramas del sistema',
    detalle: 'Permite crear, modificar o eliminar roles, configurar edades de ramas y administrar el grupo.',
    categoria: 'Configuración del Sistema',
  },
};

export const PanelGestorRoles: React.FC<Props> = ({
  roles,
  permisosCatalogo,
  onRecargar,
  onToast,
}) => {
  const puedeGestionarRoles = useAuthStore((s) => s.tienePermiso('organizacion.gestionar'));
  const [rolEditando, setRolEditando] = useState<any | null>(null);
  const [modalAbierto, setModalAbierto] = useState(false);

  const [nombreRol, setNombreRol] = useState('');
  const [tipoMiembro, setTipoMiembro] = useState<'PROTAGONISTA' | 'EDUCADOR'>('EDUCADOR');
  const [requiereRama, setRequiereRama] = useState<boolean>(true);
  const [alcancePorDefecto, setAlcancePorDefecto] = useState<'PROPIO' | 'UNIDAD' | 'GLOBAL'>('UNIDAD');
  const [permisosSeleccionados, setPermisosSeleccionados] = useState<string[]>([]);

  const [guardando, setGuardando] = useState(false);
  const [eliminandoId, setEliminandoId] = useState<number | null>(null);
  const [modalConfirmacion, setModalConfirmacion] = useState<ModalConfirmacionProps | null>(null);

  // Cantidad de roles administradores globales en el sistema (para aviso visual Anti-Lockout)
  const rolesAdministradoresIds = useMemo(() => {
    return roles
      .filter(
        (r) =>
          r.alcancePorDefecto === 'GLOBAL' &&
          Array.isArray(r.permisos) &&
          r.permisos.includes('organizacion.gestionar'),
      )
      .map((r) => r.id);
  }, [roles]);

  const permisosPorCategoria = useMemo(() => {
    const mapa = new Map<
      string,
      Array<{ clave: string; titulo: string; detalle: string }>
    >();

    for (const p of permisosCatalogo) {
      const meta = ETIQUETAS_PERMISOS_HUMANAS[p.clave] || {
        titulo: p.descripcion || 'Permiso adicional del sistema',
        detalle: 'Habilita esta función dentro de la aplicación.',
        categoria: 'Otras Funciones',
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
    setTipoMiembro('EDUCADOR');
    setRequiereRama(true);
    setAlcancePorDefecto('UNIDAD');
    setPermisosSeleccionados([
      'organizacion.ver',
      'miembros.ver',
      'legajos.ver',
      'cuotas.ver',
    ]);
    setModalAbierto(true);
  };

  const abrirEditarRol = (r: any) => {
    setRolEditando(r);
    setNombreRol(r.nombre || '');
    setTipoMiembro(r.tipoMiembro === 'PROTAGONISTA' ? 'PROTAGONISTA' : 'EDUCADOR');
    setRequiereRama(typeof r.requiereRama === 'boolean' ? r.requiereRama : true);
    setAlcancePorDefecto(r.alcancePorDefecto || 'UNIDAD');
    setPermisosSeleccionados(Array.isArray(r.permisos) ? [...r.permisos] : []);
    setModalAbierto(true);
  };

  const cerrarModal = () => {
    if (guardando) return;
    setModalAbierto(false);
    setRolEditando(null);
  };

  const handleCambiarTipoMiembro = (nuevoTipo: 'PROTAGONISTA' | 'EDUCADOR') => {
    setTipoMiembro(nuevoTipo);
    if (nuevoTipo === 'PROTAGONISTA') {
      setRequiereRama(true);
      if (!rolEditando) {
        setAlcancePorDefecto('PROPIO');
        setPermisosSeleccionados(['legajos.ver', 'legajos.completar', 'cuotas.ver']);
      }
    } else if (!rolEditando && alcancePorDefecto === 'PROPIO') {
      setAlcancePorDefecto('UNIDAD');
      setPermisosSeleccionados([
        'organizacion.ver',
        'miembros.ver',
        'legajos.ver',
        'cuotas.ver',
      ]);
    }
  };

  const handleCambiarRequiereRama = (requiere: boolean) => {
    setRequiereRama(requiere);
    if (!requiere && alcancePorDefecto === 'UNIDAD') {
      setAlcancePorDefecto('GLOBAL');
    }
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

    // Asegurar que si tiene organizar roles también pueda ver la estructura
    const permisosFinales = new Set(permisosSeleccionados);
    if (permisosFinales.has('organizacion.gestionar')) {
      permisosFinales.add('organizacion.ver');
    }
    if (permisosFinales.has('miembros.crear') || permisosFinales.has('miembros.editar')) {
      permisosFinales.add('miembros.ver');
    }
    if (permisosFinales.has('cuotas.cobrar') || permisosFinales.has('tesoreria.gestionar')) {
      permisosFinales.add('cuotas.ver');
    }
    if (permisosFinales.has('legajos.completar') || permisosFinales.has('legajos.validar_fisico')) {
      permisosFinales.add('legajos.ver');
    }
    if (permisosFinales.has('pases.ejecutar')) {
      permisosFinales.add('pases.ver');
    }

    const payload = {
      nombre: nombreRol.trim(),
      tipoMiembro,
      requiereRama,
      alcancePorDefecto,
      permisos: Array.from(permisosFinales),
    };

    setGuardando(true);
    try {
      if (rolEditando) {
        await api.patch(`/organizacion/roles/${rolEditando.id}`, payload);
        onToast(`Rol "${nombreRol.trim()}" actualizado.`);
      } else {
        await api.post('/organizacion/roles', payload);
        onToast(`Nuevo rol "${nombreRol.trim()}" creado.`);
      }
      setModalAbierto(false);
      setRolEditando(null);
      await onRecargar();
    } catch (err) {
      onToast(traducirErrorAmigable(err, 'No se pudo guardar el rol.'), 'error');
    } finally {
      setGuardando(false);
    }
  };

  const solicitarEliminarRol = (r: any) => {
    const esUltimoAdmin =
      rolesAdministradoresIds.length === 1 && rolesAdministradoresIds[0] === r.id;

    if (esUltimoAdmin) {
      onToast(
        `No puedes eliminar "${r.nombre}" porque es el único rol con permiso de Administrar Roles. Asígnale ese permiso a otro rol primero para no quedar bloqueado.`,
        'error',
      );
      return;
    }

    const activas = Number(r.asignacionesActivas || 0);
    if (activas > 0) {
      setModalConfirmacion({
        abierto: true,
        titulo: `No se puede eliminar "${r.nombre}" todavía`,
        mensaje: `Actualmente hay ${activas} ${
          activas === 1 ? 'persona activa usando' : 'personas activas usando'
        } el rol "${r.nombre}". Cámbiales el rol desde su ficha en el Padrón antes de eliminar este rol.`,
        tipo: 'peligro',
        textoConfirmar: 'Entendido',
        textoCancelar: 'Cerrar',
        onCerrar: () => setModalConfirmacion(null),
        onConfirmar: () => setModalConfirmacion(null),
      });
      return;
    }

    setModalConfirmacion({
      abierto: true,
      titulo: `Eliminar rol "${r.nombre}"`,
      mensaje: `¿Confirmas que deseas eliminar el rol "${r.nombre}"? Actualmente ninguna persona activa lo tiene asignado.`,
      tipo: 'peligro',
      textoConfirmar: 'Sí, eliminar rol',
      textoCancelar: 'Cancelar',
      onCerrar: () => setModalConfirmacion(null),
      onConfirmar: async () => {
        setModalConfirmacion(null);
        setEliminandoId(r.id);
        try {
          const res = await api.delete(`/organizacion/roles/${r.id}`);
          onToast(res.data?.mensaje || `Rol "${r.nombre}" eliminado.`);
          if (rolEditando?.id === r.id) {
            setRolEditando(null);
            setModalAbierto(false);
          }
          await onRecargar();
        } catch (err) {
          onToast(traducirErrorAmigable(err, 'No se pudo eliminar el rol.'), 'error');
        } finally {
          setEliminandoId(null);
        }
      },
    });
  };

  return (
    <div className="space-y-4">
      {/* Cabecera Mobile-First */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>Roles y Permisos del Grupo</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Creá, renombrá o ajustá cualquier rol libremente. Los cambios aplican en el acto a todas las personas que tengan ese rol.
          </p>
        </div>

        {puedeGestionarRoles && (
          <button
            type="button"
            onClick={abrirNuevoRol}
            className="min-h-[44px] px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer shrink-0 shadow-xs"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Crear Nuevo Rol</span>
          </button>
        )}
      </div>

      {/* Tarjetas de Roles Actuales */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {roles.map((r) => {
          const alcanceCfg =
            ALCANCE_INFO[(r.alcancePorDefecto as 'PROPIO' | 'UNIDAD' | 'GLOBAL') || 'PROPIO'];
          const IconoAlcance = alcanceCfg.Icono;
          const permisosRol: string[] = Array.isArray(r.permisos) ? r.permisos : [];
          const eliminando = eliminandoId === r.id;
          const esProtagonista = r.tipoMiembro === 'PROTAGONISTA';
          const usaRama = r.requiereRama !== false;
          const esUltimoAdmin =
            rolesAdministradoresIds.length === 1 && rolesAdministradoresIds[0] === r.id;

          return (
            <div
              key={r.id}
              className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-xs flex flex-col justify-between gap-4"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100">
                        {r.nombre}
                      </h3>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          esProtagonista
                            ? 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800'
                            : 'bg-indigo-50 text-indigo-800 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800'
                        }`}
                      >
                        {esProtagonista ? 'Protagonista / Beneficiario' : 'Educador / Adulto'}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        {r.asignacionesActivas || 0}{' '}
                        {r.asignacionesActivas === 1 ? 'persona activa' : 'personas activas'}
                      </span>
                      <span>•</span>
                      <span>
                        {usaRama ? 'Pertenece a una rama' : 'Sin rama fija (Grupo general)'}
                      </span>
                    </div>
                  </div>

                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-bold border shrink-0 ${alcanceCfg.badgeClass}`}
                  >
                    <IconoAlcance className="w-3.5 h-3.5" />
                    <span>{alcanceCfg.tituloCorto}</span>
                  </span>
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
                  {alcanceCfg.subtitulo}
                </p>

                <div>
                  <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1.5">
                    Permisos activos ({permisosRol.length}):
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {permisosRol.map((clave) => {
                      const info = ETIQUETAS_PERMISOS_HUMANAS[clave];
                      if (!info) return null;
                      return (
                        <span
                          key={clave}
                          className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border border-emerald-200/70 dark:border-emerald-800/60 text-[11px] font-semibold"
                        >
                          {info.titulo}
                        </span>
                      );
                    })}
                    {permisosRol.length === 0 && (
                      <span className="text-xs text-slate-400 italic">
                        Solo acceso a su perfil personal
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {puedeGestionarRoles && (
                <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    disabled={eliminando}
                    onClick={() => solicitarEliminarRol(r)}
                    title={
                      esUltimoAdmin
                        ? 'Protegido: único rol administrador del sistema'
                        : 'Eliminar este rol'
                    }
                    className="min-h-[42px] px-3.5 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 text-rose-700 dark:text-rose-300 border border-rose-200/70 dark:border-rose-800/60 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                  >
                    {eliminando ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                    <span>Eliminar</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => abrirEditarRol(r)}
                    className="flex-1 sm:flex-initial min-h-[42px] px-4 py-2 rounded-xl bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer shadow-2xs"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    <span>Editar Rol y Permisos</span>
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Bottom Sheet (Móvil) / Modal (Escritorio) para Crear o Editar Rol */}
      {puedeGestionarRoles && modalAbierto && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white dark:bg-slate-900 border-t sm:border border-slate-200 dark:border-slate-800 rounded-t-3xl sm:rounded-3xl w-full max-w-2xl max-h-[92vh] overflow-hidden shadow-2xl flex flex-col animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-150">
            {/* Cabecera del Bottom Sheet */}
            <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-800/80 shrink-0">
              <div>
                <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100">
                  {rolEditando ? `Editar Rol: ${rolEditando.nombre}` : 'Crear Nuevo Rol'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Personalizá su nombre, comportamiento, alcance y permisos con interruptores simples.
                </p>
              </div>
              <button
                type="button"
                onClick={cerrarModal}
                className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Cuerpo scrollable del formulario */}
            <form
              id="form-gestor-rol"
              onSubmit={handleGuardar}
              className="p-4 sm:p-6 space-y-5 overflow-y-auto flex-1 text-xs"
            >
              {/* 1. Nombre libre del Rol */}
              <div>
                <label className="block text-xs font-extrabold text-slate-800 dark:text-slate-200 mb-1.5">
                  1. Nombre del rol *
                </label>
                <input
                  type="text"
                  required
                  value={nombreRol}
                  onChange={(e) => setNombreRol(e.target.value)}
                  placeholder="Ej: Jefe de Grupo, Tesorero, Educador de Rama, Protagonista..."
                  className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm font-bold outline-none focus:border-emerald-500"
                />
              </div>

              {/* 2. Comportamiento / Naturaleza del Rol y Vínculo con Rama */}
              <div className="space-y-3">
                <label className="block text-xs font-extrabold text-slate-800 dark:text-slate-200">
                  2. Naturaleza del rol y vínculo con rama
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => handleCambiarTipoMiembro('PROTAGONISTA')}
                    className={`p-3.5 rounded-2xl border text-left transition cursor-pointer flex items-start gap-3 ${
                      tipoMiembro === 'PROTAGONISTA'
                        ? 'border-amber-500 bg-amber-50/70 dark:bg-amber-950/40 ring-2 ring-amber-500/30'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60'
                    }`}
                  >
                    <Sparkles className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-extrabold text-slate-900 dark:text-slate-100 block text-xs">
                        Protagonista / Beneficiario
                      </span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5 leading-snug">
                        Niños y jóvenes que progresan de rama por edad y usan ficha de protagonista.
                      </span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleCambiarTipoMiembro('EDUCADOR')}
                    className={`p-3.5 rounded-2xl border text-left transition cursor-pointer flex items-start gap-3 ${
                      tipoMiembro === 'EDUCADOR'
                        ? 'border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/40 ring-2 ring-indigo-500/30'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60'
                    }`}
                  >
                    <Compass className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-extrabold text-slate-900 dark:text-slate-100 block text-xs">
                        Educador / Adulto / Gestión
                      </span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5 leading-snug">
                        Adultos, dirigentes, tesoreros o colaboradores del grupo.
                      </span>
                    </div>
                  </button>
                </div>

                {/* Switch de asignación a Rama */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={requiereRama}
                  onClick={() => handleCambiarRequiereRama(!requiereRama)}
                  className="w-full p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3 text-left cursor-pointer"
                >
                  <div>
                    <span className="font-bold text-slate-900 dark:text-slate-100 block text-xs">
                      {requiereRama
                        ? 'Requiere estar asignado a una Rama específica (Lobatos, Scouts, Caminantes, Rovers)'
                        : 'No pertenece a una rama específica (Actúa en el grupo general / equipo de apoyo)'}
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">
                      {requiereRama
                        ? 'Al inscribir o cambiar a este rol se pedirá elegir su rama.'
                        : 'Ideal para Jefes de Grupo, Tesoreros o Educadores sin rama asignada.'}
                    </span>
                  </div>
                  <div
                    className={`w-12 h-7 rounded-full p-1 transition-colors shrink-0 flex items-center ${
                      requiereRama ? 'bg-emerald-600 justify-end' : 'bg-slate-300 dark:bg-slate-600 justify-start'
                    }`}
                  >
                    <div className="w-5 h-5 rounded-full bg-white shadow-xs" />
                  </div>
                </button>
              </div>

              {/* 3. Selección de Alcance */}
              <div className="space-y-2.5">
                <label className="block text-xs font-extrabold text-slate-800 dark:text-slate-200">
                  3. Alcance de visibilidad y acción
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {(['PROPIO', 'UNIDAD', 'GLOBAL'] as const).map((key) => {
                    const info = ALCANCE_INFO[key];
                    const Icono = info.Icono;
                    const activo = alcancePorDefecto === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setAlcancePorDefecto(key)}
                        className={`p-3 rounded-2xl border text-left transition cursor-pointer flex flex-col justify-between gap-2 ${
                          activo
                            ? 'border-emerald-600 bg-emerald-50/80 dark:bg-emerald-950/50 ring-2 ring-emerald-500/30'
                            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1.5">
                          <span className="font-extrabold text-slate-900 dark:text-slate-100 text-xs">
                            {info.titulo}
                          </span>
                          <Icono
                            className={`w-4 h-4 shrink-0 ${
                              activo ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'
                            }`}
                          />
                        </div>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                          {info.subtitulo}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 4. Interruptores (Switches) de Permisos agrupados por módulo */}
              <div className="space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <label className="text-xs font-extrabold text-slate-800 dark:text-slate-200">
                    4. Permisos habilitados ({permisosSeleccionados.length} de {permisosCatalogo.length})
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={seleccionarTodos}
                      className="px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-emerald-50 text-slate-700 dark:text-slate-300 font-bold text-[11px] cursor-pointer"
                    >
                      Activar todos
                    </button>
                    <button
                      type="button"
                      onClick={limpiarTodos}
                      className="px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-rose-50 text-slate-600 dark:text-slate-400 font-bold text-[11px] cursor-pointer"
                    >
                      Desactivar todos
                    </button>
                  </div>
                </div>

                {rolEditando &&
                  rolesAdministradoresIds.length === 1 &&
                  rolesAdministradoresIds[0] === rolEditando.id && (
                    <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 flex items-start gap-2 text-amber-900 dark:text-amber-200 text-[11px]">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <span>
                        Este es actualmente el único rol administrador del grupo. Para evitar que el grupo quede bloqueado, conserva el alcance <strong>Todo el grupo</strong> y el permiso de <strong>administrar roles</strong>.
                      </span>
                    </div>
                  )}

                <div className="space-y-3">
                  {permisosPorCategoria.map(([categoria, items]) => (
                    <div
                      key={categoria}
                      className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-2.5"
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
                              role="switch"
                              aria-checked={marcado}
                              onClick={() => togglePermiso(item.clave)}
                              className={`w-full p-3 rounded-xl border text-left flex items-center justify-between gap-3 transition cursor-pointer ${
                                marcado
                                  ? 'bg-emerald-50/90 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-slate-900 dark:text-slate-100'
                                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                              }`}
                            >
                              <div className="min-w-0">
                                <span className="text-xs font-bold block leading-snug">
                                  {item.titulo}
                                </span>
                                <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5 leading-tight">
                                  {item.detalle}
                                </span>
                              </div>

                              <div
                                className={`w-11 h-6 rounded-full p-0.5 transition-colors shrink-0 flex items-center ${
                                  marcado
                                    ? 'bg-emerald-600 justify-end'
                                    : 'bg-slate-300 dark:bg-slate-700 justify-start'
                                }`}
                              >
                                <div className="w-5 h-5 rounded-full bg-white shadow-xs" />
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </form>

            {/* Pie fijo con botones táctiles */}
            <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900 flex items-center justify-end gap-2.5 shrink-0">
              <button
                type="button"
                onClick={cerrarModal}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-200/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                form="form-gestor-rol"
                disabled={guardando}
                className="min-h-[44px] px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-xs"
              >
                {guardando ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                <span>{rolEditando ? 'Guardar Cambios' : 'Crear Rol'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {modalConfirmacion && <ModalConfirmacion {...modalConfirmacion} />}
    </div>
  );
};
