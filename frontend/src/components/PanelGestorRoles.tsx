import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { traducirErrorAmigable } from '../lib/formatters';
import { ModalConfirmacion, type ModalConfirmacionProps } from './ModalConfirmacion';
import { useModalOverlay } from '../hooks/useModalOverlay';
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
  Eye,
} from 'lucide-react';

interface Props {
  roles: any[];
  permisosCatalogo: any[];
  onRecargar: () => Promise<void>;
  onToast: (texto: string, tipo?: 'exito' | 'error') => void;
}

type NivelPanel = 'NINGUNO' | 'VER' | 'EDITAR';

interface DefinicionPanelRol {
  id: string;
  titulo: string;
  pestanas: string;
  detalle: string;
  permisoVer: string;
  permisoEditar: string;
  soloGlobal?: boolean;
  edicionSoloGlobal?: boolean;
}

export const PANELES_SISTEMA: readonly DefinicionPanelRol[] = [
  {
    id: 'padron',
    titulo: 'Padrón y Ficha de Miembro',
    pestanas: 'Menú Miembros + Pestañas Datos y Seguridad (360°)',
    detalle: 'Solo lectura consulta el padrón; Edición permite inscribir, modificar todos los datos (identidad, contacto, familia), dar de baja y resetear clave.',
    permisoVer: 'padron.ver',
    permisoEditar: 'padron.editar',
  },
  {
    id: 'legajos',
    titulo: 'Legajos y Colaboradores',
    pestanas: 'Legajos (Cumplimiento y Colaboradores) + Pestaña Ficha (360°)',
    detalle: 'Solo lectura consulta entregas y descarga PDF; Edición permite completar fichas médicas y validar entregas físicas con lector QR.',
    permisoVer: 'legajos.ver',
    permisoEditar: 'legajos.editar',
  },
  {
    id: 'plantillas',
    titulo: 'Plantillas de Formularios PDF',
    pestanas: 'Legajos → Pestaña Plantillas',
    detalle: 'Permite ver o diseñar los moldes y preguntas de las fichas de inscripción anuales del grupo.',
    permisoVer: 'plantillas.ver',
    permisoEditar: 'plantillas.editar',
    soloGlobal: true,
  },
  {
    id: 'pases',
    titulo: 'Pases y Progresión',
    pestanas: 'Menú Pases + Pestaña Pase y Rol (360°)',
    detalle: 'Solo lectura consulta candidatos por camada al 30/06; Edición ejecuta pases de rama y gestiona asignaciones de rol.',
    permisoVer: 'pases.ver',
    permisoEditar: 'pases.editar',
  },
  {
    id: 'cobranzas',
    titulo: 'Cobranzas y Estado de Cuenta',
    pestanas: 'Tesorería → Cobranzas y Familias + Pestaña Cuotas (360°)',
    detalle: 'Solo lectura consulta deudas y pagos; Edición habilita cobrar, generar/anular cargos, ajustar saldos y descuentos familiares.',
    permisoVer: 'cobranzas.ver',
    permisoEditar: 'cobranzas.editar',
  },
  {
    id: 'planes',
    titulo: 'Planes y Conceptos',
    pestanas: 'Tesorería → Pestaña Planes y Conceptos',
    detalle: 'Solo lectura consulta planes anuales y campamentos; Edición permite crear y modificar planes de cuota y campamentos.',
    permisoVer: 'planes.ver',
    permisoEditar: 'planes.editar',
  },
  {
    id: 'caja',
    titulo: 'Caja, Bancos y Balance',
    pestanas: 'Tesorería → Caja, Bancos y Gastos + Cuadro de Resultados',
    detalle: 'Solo lectura consulta saldos, libro diario y balance; Edición permite registrar ingresos/gastos, traspasos, cuentas y rubros.',
    permisoVer: 'caja.ver',
    permisoEditar: 'caja.editar',
    soloGlobal: true,
  },
  {
    id: 'eventos',
    titulo: 'Eventos Económicos',
    pestanas: 'Menú Eventos + Pestañas POS, Pedidos y Liquidación',
    detalle: 'Solo lectura consulta eventos y pedidos; Edición permite vender en POS, cobrar pedidos, validar entradas QR y configurar eventos.',
    permisoVer: 'eventos.ver',
    permisoEditar: 'eventos.editar',
  },
  {
    id: 'organizacion',
    titulo: 'Organización y Sistema',
    pestanas: 'Menú Organización → Ramas, Roles y Correo Institucional',
    detalle: 'Solo lectura consulta estructura de ramas y roles; Edición (Todo el grupo) administra ramas, unidades, roles y correo SMTP.',
    permisoVer: 'organizacion.ver',
    permisoEditar: 'organizacion.editar',
    edicionSoloGlobal: true,
  },
];

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
    subtitulo: 'Únicamente ve sus propios datos personales, su ficha médica y el estado de sus cuotas en Mi Espacio.',
    badgeClass: 'bg-paper-2 text-ink-2 border-rule',
    Icono: UserCheck,
  },
  UNIDAD: {
    titulo: 'Solo su rama / unidad asignada',
    tituloCorto: 'Solo su rama asignada',
    subtitulo: 'Ve y opera los paneles habilitados únicamente para las personas que pertenecen a su misma rama o sección.',
    badgeClass: 'bg-brand/10 text-brand border-brand/30',
    Icono: Users,
  },
  GLOBAL: {
    titulo: 'Todo el grupo',
    tituloCorto: 'Todo el grupo',
    subtitulo: 'Ve y opera los paneles habilitados sobre todas las ramas y el grupo general.',
    badgeClass:
      'bg-neutral-100 text-neutral-800 border-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:border-neutral-700',
    Icono: Globe,
  },
};

function resolverNivelPanel(permisos: readonly string[], panel: DefinicionPanelRol): NivelPanel {
  if (permisos.includes(panel.permisoEditar)) return 'EDITAR';
  if (permisos.includes(panel.permisoVer)) return 'VER';
  return 'NINGUNO';
}

export const PanelGestorRoles: React.FC<Props> = ({
  roles,
  onRecargar,
  onToast,
}) => {
  const puedeGestionarRoles = useAuthStore(
    (s) => s.tieneGlobal() && s.tienePermiso('organizacion.editar'),
  );
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
          r.permisos.includes('organizacion.editar'),
      )
      .map((r) => r.id);
  }, [roles]);

  const abrirNuevoRol = () => {
    setRolEditando(null);
    setNombreRol('');
    setTipoMiembro('EDUCADOR');
    setRequiereRama(true);
    setAlcancePorDefecto('UNIDAD');
    setPermisosSeleccionados([
      'organizacion.ver',
      'padron.ver',
      'legajos.ver',
      'cobranzas.ver',
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

  const { backdropProps, contentProps } = useModalOverlay({
    abierto: Boolean(puedeGestionarRoles && modalAbierto),
    onCerrar: cerrarModal,
    bloqueado: guardando || Boolean(eliminandoId) || Boolean(modalConfirmacion),
  });

  const handleCambiarTipoMiembro = (nuevoTipo: 'PROTAGONISTA' | 'EDUCADOR') => {
    setTipoMiembro(nuevoTipo);
    if (nuevoTipo === 'PROTAGONISTA') {
      setRequiereRama(true);
      if (!rolEditando) {
        setAlcancePorDefecto('PROPIO');
        setPermisosSeleccionados(['padron.ver', 'padron.editar', 'legajos.ver', 'legajos.editar', 'cobranzas.ver', 'eventos.ver']);
      }
    } else if (!rolEditando && alcancePorDefecto === 'PROPIO') {
      setAlcancePorDefecto('UNIDAD');
      setPermisosSeleccionados([
        'organizacion.ver',
        'padron.ver',
        'legajos.ver',
        'cobranzas.ver',
      ]);
    }
  };

  const handleCambiarRequiereRama = (requiere: boolean) => {
    setRequiereRama(requiere);
    if (!requiere && alcancePorDefecto === 'UNIDAD') {
      setAlcancePorDefecto('GLOBAL');
    }
  };

  const cambiarNivelPanel = (panel: DefinicionPanelRol, nivel: NivelPanel) => {
    setPermisosSeleccionados((prev) => {
      const sinPanel = prev.filter((c) => c !== panel.permisoVer && c !== panel.permisoEditar);
      if (nivel === 'VER') {
        return [...sinPanel, panel.permisoVer];
      }
      if (nivel === 'EDITAR') {
        return [...sinPanel, panel.permisoVer, panel.permisoEditar];
      }
      return sinPanel;
    });
  };

  const seleccionarTodosEdicion = () => {
    const esGlobal = alcancePorDefecto === 'GLOBAL';
    const nuevos: string[] = [];
    for (const panel of PANELES_SISTEMA) {
      if (panel.soloGlobal && !esGlobal) continue;
      nuevos.push(panel.permisoVer);
      if (!panel.edicionSoloGlobal || esGlobal) {
        nuevos.push(panel.permisoEditar);
      }
    }
    setPermisosSeleccionados(nuevos);
  };

  const seleccionarTodosLectura = () => {
    const esGlobal = alcancePorDefecto === 'GLOBAL';
    const nuevos: string[] = [];
    for (const panel of PANELES_SISTEMA) {
      if (panel.soloGlobal && !esGlobal) continue;
      nuevos.push(panel.permisoVer);
    }
    setPermisosSeleccionados(nuevos);
  };

  const limpiarTodos = () => {
    setPermisosSeleccionados([]);
  };

  const handleGuardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombreRol.trim()) return;

    const esGlobal = alcancePorDefecto === 'GLOBAL';
    const permisosFinales = new Set<string>();

    for (const panel of PANELES_SISTEMA) {
      if (panel.soloGlobal && !esGlobal) continue;
      const tieneEditar =
        permisosSeleccionados.includes(panel.permisoEditar) &&
        (!panel.edicionSoloGlobal || esGlobal);
      const tieneVer = tieneEditar || permisosSeleccionados.includes(panel.permisoVer);

      if (tieneVer) permisosFinales.add(panel.permisoVer);
      if (tieneEditar) permisosFinales.add(panel.permisoEditar);
    }

    if (permisosFinales.has('plantillas.ver') || permisosFinales.has('plantillas.editar')) {
      permisosFinales.add('legajos.ver');
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
        `No puedes eliminar "${r.nombre}" porque es el único rol con edición de Organización y Roles. Asígnale ese permiso a otro rol primero para no quedar bloqueado.`,
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

  const panelesActivosModalCount = useMemo(
    () =>
      PANELES_SISTEMA.filter(
        (panel) => resolverNivelPanel(permisosSeleccionados, panel) !== 'NINGUNO',
      ).length,
    [permisosSeleccionados],
  );

  return (
    <div className="space-y-4">
      {/* Cabecera Mobile-First */}
      <div className="bg-surface rounded-2xl border border-rule p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-ink flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-brand shrink-0" />
            <span>Roles y Paneles Habilitados</span>
          </h2>
          <p className="text-[13px] text-ink-muted mt-0.5">
            Cada rol define qué paneles o pestañas puede ver o editar. Los cambios aplican en el acto a todas las personas con ese rol.
          </p>
        </div>

        {puedeGestionarRoles && (
          <button
            type="button"
            onClick={abrirNuevoRol}
            className="min-h-[46px] px-4 py-2.5 rounded-xl bg-brand hover:opacity-90 active:opacity-100 text-brand-contrast font-bold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer shrink-0 shadow-xs"
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

          const panelesRol = PANELES_SISTEMA.map((panel) => ({
            panel,
            nivel: resolverNivelPanel(permisosRol, panel),
          })).filter((x) => x.nivel !== 'NINGUNO');

          return (
            <div
              key={r.id}
              className="bg-surface rounded-2xl border border-rule p-5 shadow-xs flex flex-col justify-between gap-4"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-[17px] font-extrabold text-ink">
                        {r.nombre}
                      </h3>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                          esProtagonista
                            ? 'bg-brand/10 text-brand border-brand/30'
                            : 'bg-paper-2 text-ink border-rule'
                        }`}
                      >
                        {esProtagonista ? 'Protagonista / Beneficiario' : 'Educador / Adulto'}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5 text-[13px] text-ink-muted">
                      <span className="font-semibold text-ink-2">
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
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold border shrink-0 ${alcanceCfg.badgeClass}`}
                  >
                    <IconoAlcance className="w-4 h-4" />
                    <span>{alcanceCfg.tituloCorto}</span>
                  </span>
                </div>

                <p className="text-[13px] text-ink-muted bg-paper-2 p-3 rounded-xl border border-rule leading-relaxed">
                  {alcanceCfg.subtitulo}
                </p>

                <div>
                  <span className="text-[13px] font-semibold text-ink-muted block mb-2">
                    Paneles y pestañas habilitadas ({panelesRol.length} de {PANELES_SISTEMA.length}):
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {panelesRol.map(({ panel, nivel }) => (
                      <span
                        key={panel.id}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold ${
                          nivel === 'EDITAR'
                            ? 'bg-brand/10 text-ink border-brand/30'
                            : 'bg-paper-2 text-ink-2 border-rule'
                        }`}
                      >
                        {nivel === 'EDITAR' ? (
                          <Pencil className="w-3 h-3 text-brand shrink-0" />
                        ) : (
                          <Eye className="w-3 h-3 text-ink-muted shrink-0" />
                        )}
                        <span>{panel.titulo}</span>
                        <span className="text-[11px] opacity-75">
                          ({nivel === 'EDITAR' ? 'Edición' : 'Lectura'})
                        </span>
                      </span>
                    ))}
                    {panelesRol.length === 0 && (
                      <span className="text-[13px] text-ink-muted italic">
                        Solo acceso a Inicio y Mi Espacio personal
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {puedeGestionarRoles && (
                <div className="flex items-center justify-between gap-2.5 pt-3 border-t border-rule">
                  <button
                    type="button"
                    disabled={eliminando}
                    onClick={() => solicitarEliminarRol(r)}
                    title={
                      esUltimoAdmin
                        ? 'Protegido: único rol administrador del sistema'
                        : 'Eliminar este rol'
                    }
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/40 text-rose-700 dark:text-rose-300 border border-rose-200/70 dark:border-rose-800/60 font-bold text-[13px] flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
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
                    className="flex-1 sm:flex-initial min-h-[44px] px-4 py-2 rounded-xl bg-brand hover:opacity-90 active:opacity-100 text-brand-contrast font-bold text-[13px] flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                  >
                    <Pencil className="w-4 h-4" />
                    <span>Editar Rol y Paneles</span>
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Bottom Sheet (Móvil) / Modal (Escritorio) para Crear o Editar Rol */}
      {puedeGestionarRoles &&
        modalAbierto &&
        createPortal(
          <div
            className="s-anim-backdrop fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4"
            {...backdropProps}
          >
            <div
              className="bg-surface border-t sm:border border-rule rounded-t-3xl sm:rounded-3xl w-full max-w-2xl max-h-[92dvh] overflow-hidden shadow-2xl flex flex-col s-anim-sheet-up sm:s-anim-modal-pop"
              {...contentProps}
            >
              {/* Cabecera del Bottom Sheet */}
              <div className="p-4 sm:p-5 border-b border-rule flex items-center justify-between bg-paper-2 shrink-0">
                <div>
                  <h3 className="text-lg font-extrabold text-ink">
                    {rolEditando ? `Editar Rol: ${rolEditando.nombre}` : 'Crear Nuevo Rol'}
                  </h3>
                  <p className="text-[13px] text-ink-muted mt-0.5">
                    Elegí para cada panel o pestaña si estará oculto, en solo lectura o con edición completa.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={cerrarModal}
                  className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center text-ink-muted hover:text-ink hover:bg-paper-3 transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Cuerpo scrollable del formulario */}
              <form
                id="form-gestor-rol"
                onSubmit={handleGuardar}
                className="p-5 sm:p-6 space-y-5 overflow-y-auto flex-1 text-sm"
              >
                {/* 1. Nombre libre del Rol */}
                <div>
                  <label className="block text-sm font-extrabold text-ink mb-1.5">
                    1. Nombre del rol *
                  </label>
                  <input
                    type="text"
                    required
                    value={nombreRol}
                    onChange={(e) => setNombreRol(e.target.value)}
                    placeholder="Ej: Jefe de Grupo, Tesorero, Educador de Rama, Protagonista..."
                    className="w-full min-h-[46px] px-4 py-2.5 rounded-xl border border-rule bg-surface text-ink text-base sm:text-[15px] font-bold focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none transition-colors"
                  />
                </div>

                {/* 2. Comportamiento / Naturaleza del Rol y Vínculo con Rama */}
                <div className="space-y-3">
                  <label className="block text-sm font-extrabold text-ink">
                    2. Naturaleza del rol y vínculo con rama
                  </label>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => handleCambiarTipoMiembro('PROTAGONISTA')}
                      className={`p-4 rounded-2xl border text-left transition cursor-pointer flex items-start gap-3 ${
                        tipoMiembro === 'PROTAGONISTA'
                          ? 'border-brand bg-brand/10 ring-2 ring-brand/30'
                          : 'border-rule bg-surface'
                      }`}
                    >
                      <Sparkles className="w-5 h-5 text-brand shrink-0 mt-0.5" />
                      <div>
                        <span className="font-extrabold text-ink block text-sm">
                          Protagonista / Beneficiario
                        </span>
                        <span className="text-xs text-ink-muted block mt-1 leading-snug">
                          Niños y jóvenes que progresan de rama por edad y usan ficha de protagonista.
                        </span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleCambiarTipoMiembro('EDUCADOR')}
                      className={`p-4 rounded-2xl border text-left transition cursor-pointer flex items-start gap-3 ${
                        tipoMiembro === 'EDUCADOR'
                          ? 'border-neutral-900 bg-neutral-100 dark:bg-neutral-800 ring-2 ring-neutral-400/30'
                          : 'border-rule bg-surface'
                      }`}
                    >
                      <Compass className="w-5 h-5 text-neutral-800 dark:text-neutral-200 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-extrabold text-ink block text-sm">
                          Educador / Adulto / Gestión
                        </span>
                        <span className="text-xs text-ink-muted block mt-1 leading-snug">
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
                    className="w-full p-4 rounded-2xl bg-paper-2 border border-rule flex items-center justify-between gap-3 text-left cursor-pointer"
                  >
                    <div>
                      <span className="font-bold text-ink block text-sm">
                        {requiereRama
                          ? 'Requiere estar asignado a una Rama específica (Lobatos, Scouts, Caminantes, Rovers)'
                          : 'No pertenece a una rama específica (Actúa en el grupo general / equipo de apoyo)'}
                      </span>
                      <span className="text-xs text-ink-muted block mt-1">
                        {requiereRama
                          ? 'Al inscribir o cambiar a este rol se pedirá elegir su rama.'
                          : 'Ideal para Jefes de Grupo, Tesoreros o Educadores sin rama asignada.'}
                      </span>
                    </div>
                    <div
                      className={`w-12 h-7 rounded-full p-1 transition-colors shrink-0 flex items-center ${
                        requiereRama ? 'bg-brand justify-end' : 'bg-paper-3 justify-start'
                      }`}
                    >
                      <div className="w-5 h-5 rounded-full bg-white shadow-xs" />
                    </div>
                  </button>
                </div>

                {/* 3. Selección de Alcance */}
                <div className="space-y-2.5">
                  <label className="block text-sm font-extrabold text-ink">
                    3. Nivel de acceso y visibilidad
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
                          className={`p-3.5 rounded-2xl border text-left transition cursor-pointer flex flex-col justify-between gap-2 ${
                            activo
                              ? 'border-brand bg-brand/10 ring-2 ring-brand/30'
                              : 'border-rule bg-surface/50'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1.5">
                            <span className="font-extrabold text-ink text-sm">
                              {info.titulo}
                            </span>
                            <Icono
                              className={`w-4 h-4 shrink-0 ${
                                activo ? 'text-brand' : 'text-ink-muted'
                              }`}
                            />
                          </div>
                          <span className="text-xs text-ink-muted leading-snug">
                            {info.subtitulo}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 4. Selección por Panel / Pestaña: Sin acceso | Solo lectura | Edición */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <label className="text-sm font-extrabold text-ink">
                      4. Paneles y pestañas ({panelesActivosModalCount} de {PANELES_SISTEMA.length} activos)
                    </label>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={seleccionarTodosEdicion}
                        className="px-3 py-1.5 rounded-xl bg-paper-3 hover:bg-brand/10 text-ink-2 hover:text-brand font-bold text-xs cursor-pointer transition-colors"
                      >
                        Todo en Edición
                      </button>
                      <button
                        type="button"
                        onClick={seleccionarTodosLectura}
                        className="px-3 py-1.5 rounded-xl bg-paper-3 hover:bg-brand/10 text-ink-2 hover:text-brand font-bold text-xs cursor-pointer transition-colors"
                      >
                        Todo en Lectura
                      </button>
                      <button
                        type="button"
                        onClick={limpiarTodos}
                        className="px-3 py-1.5 rounded-xl bg-paper-3 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-ink-muted font-bold text-xs cursor-pointer transition-colors"
                      >
                        Ocultar todos
                      </button>
                    </div>
                  </div>

                  {rolEditando &&
                    rolesAdministradoresIds.length === 1 &&
                    rolesAdministradoresIds[0] === rolEditando.id && (
                      <div className="p-3.5 rounded-xl bg-brand/10 border border-brand/30 flex items-start gap-2.5 text-ink text-xs">
                        <AlertTriangle className="w-4 h-4 text-brand shrink-0 mt-0.5" />
                        <span>
                          Este es actualmente el único rol administrador del grupo. Para evitar que el grupo quede bloqueado, conservá el alcance <strong>Todo el grupo</strong> y el panel <strong>Organización y Sistema</strong> en modo <strong>Edición</strong>.
                        </span>
                      </div>
                    )}

                  <div className="space-y-2.5">
                    {PANELES_SISTEMA.map((panel) => {
                      const esGlobal = alcancePorDefecto === 'GLOBAL';
                      const bloqueadoPorGlobal = Boolean(panel.soloGlobal && !esGlobal);
                      const edicionBloqueadaPorGlobal = Boolean(panel.edicionSoloGlobal && !esGlobal);
                      const nivelActual: NivelPanel = bloqueadoPorGlobal
                        ? 'NINGUNO'
                        : edicionBloqueadaPorGlobal &&
                            resolverNivelPanel(permisosSeleccionados, panel) === 'EDITAR'
                          ? 'VER'
                          : resolverNivelPanel(permisosSeleccionados, panel);

                      return (
                        <div
                          key={panel.id}
                          className={`p-4 rounded-2xl border transition ${
                            nivelActual === 'EDITAR'
                              ? 'bg-brand/5 border-brand/40'
                              : nivelActual === 'VER'
                                ? 'bg-surface border-rule'
                                : 'bg-paper-2/70 border-rule opacity-85'
                          }`}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="min-w-0 space-y-0.5">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-extrabold text-ink">
                                  {panel.titulo}
                                </span>
                                {(panel.soloGlobal || panel.edicionSoloGlobal) && (
                                  <span className="px-2 py-0.5 rounded-md bg-paper-3 text-ink-muted text-[11px] font-bold">
                                    {panel.soloGlobal ? 'Solo alcance Todo el grupo' : 'Edición solo Todo el grupo'}
                                  </span>
                                )}
                              </div>
                              <span className="text-xs font-semibold text-brand block">
                                {panel.pestanas}
                              </span>
                              <p className="text-xs text-ink-muted leading-snug pt-0.5">
                                {panel.detalle}
                              </p>
                            </div>

                            <div className=" inline-grid grid-cols-3 rounded-xl bg-paper-3 p-1 gap-1 shrink-0">
                              {(
                                [
                                  { id: 'NINGUNO', label: 'Sin acceso' },
                                  { id: 'VER', label: 'Solo lectura' },
                                  { id: 'EDITAR', label: 'Edición' },
                                ] as const
                              ).map((op) => {
                                const deshabilitado =
                                  (op.id !== 'NINGUNO' && bloqueadoPorGlobal) ||
                                  (op.id === 'EDITAR' && edicionBloqueadaPorGlobal);
                                const seleccionado = nivelActual === op.id;

                                return (
                                  <button
                                    key={op.id}
                                    type="button"
                                    disabled={deshabilitado}
                                    onClick={() => cambiarNivelPanel(panel, op.id)}
                                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                                      seleccionado
                                        ? op.id === 'EDITAR'
                                          ? 'bg-brand text-brand-contrast shadow-xs'
                                          : op.id === 'VER'
                                            ? 'bg-surface text-ink shadow-xs'
                                            : 'bg-surface text-ink-muted shadow-xs'
                                        : 'text-ink-muted hover:text-ink'
                                    }`}
                                  >
                                    {op.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </form>

              {/* Pie fijo con botones táctiles */}
              <div className="p-4 sm:p-5 border-t border-rule bg-paper-2 flex items-center justify-end gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={cerrarModal}
                  className="min-h-[46px] px-5 py-2.5 rounded-xl bg-paper-3 text-ink-2 text-sm font-bold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  form="form-gestor-rol"
                  disabled={guardando}
                  className="min-h-[46px] px-5 py-2.5 rounded-xl bg-brand hover:opacity-90 active:opacity-100 text-brand-contrast text-sm font-bold flex items-center gap-2 cursor-pointer disabled:opacity-50 shadow-xs transition-colors"
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
          </div>,
          document.body,
        )}

      {modalConfirmacion && <ModalConfirmacion {...modalConfirmacion} />}
    </div>
  );
};
