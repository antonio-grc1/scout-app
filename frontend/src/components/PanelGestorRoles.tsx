import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api/client';
import {
  obtenerAlcancePermisoEnAsignacionUI,
  useAuthStore,
} from '../store/authStore';
import { traducirErrorAmigable } from '../lib/formatters';
import { type AlcanceRolUI } from '../lib/permisos';
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
  AlertTriangle,
  Eye,
  RotateCcw,
} from 'lucide-react';

interface Props {
  roles: any[];
  permisosCatalogo: any[];
  mostrarInactivos?: boolean;
  onToggleMostrarInactivos?: (val: boolean) => void;
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
  alcanceMinimoVer: AlcanceRolUI;
  alcanceMinimoEditar: AlcanceRolUI;
}

const PESO_ALCANCE: Record<AlcanceRolUI, number> = {
  PROPIO: 1,
  UNIDAD: 2,
  GLOBAL: 3,
};

function alcanceMayor(a: AlcanceRolUI, b: AlcanceRolUI): AlcanceRolUI {
  return PESO_ALCANCE[a] >= PESO_ALCANCE[b] ? a : b;
}

export const PANELES_SISTEMA: readonly DefinicionPanelRol[] = [
  {
    id: 'padron',
    titulo: 'Padrón y Ficha de Miembro',
    pestanas: 'Menú Miembros + Pestañas Datos y Seguridad',
    detalle:
      'Solo lectura consulta el padrón; Edición permite inscribir, modificar datos (identidad, contacto, familia), dar de baja y resetear clave.',
    permisoVer: 'padron.ver',
    permisoEditar: 'padron.editar',
    alcanceMinimoVer: 'PROPIO',
    alcanceMinimoEditar: 'PROPIO',
  },
  {
    id: 'legajos',
    titulo: 'Legajos y Colaboradores',
    pestanas: 'Legajos (Cumplimiento y Colaboradores) + Pestaña Ficha',
    detalle:
      'Solo lectura consulta entregas y descarga PDF; Edición permite completar fichas médicas y validar entregas físicas con lector QR.',
    permisoVer: 'legajos.ver',
    permisoEditar: 'legajos.editar',
    alcanceMinimoVer: 'PROPIO',
    alcanceMinimoEditar: 'PROPIO',
  },
  {
    id: 'plantillas',
    titulo: 'Plantillas de Formularios PDF',
    pestanas: 'Legajos → Pestaña Plantillas',
    detalle:
      'Solo lectura consulta plantillas de formularios; Edición (Todo el grupo) permite diseñar y editar los moldes anuales.',
    permisoVer: 'plantillas.ver',
    permisoEditar: 'plantillas.editar',
    alcanceMinimoVer: 'UNIDAD',
    alcanceMinimoEditar: 'GLOBAL',
  },
  {
    id: 'pases',
    titulo: 'Pases y Progresión',
    pestanas: 'Menú Pases + Pestaña Pase y Rol',
    detalle:
      'Solo lectura consulta candidatos por camada; Edición ejecuta pases de rama y gestiona asignaciones de rol.',
    permisoVer: 'pases.ver',
    permisoEditar: 'pases.editar',
    alcanceMinimoVer: 'UNIDAD',
    alcanceMinimoEditar: 'UNIDAD',
  },
  {
    id: 'cobranzas',
    titulo: 'Cobranzas y Estado de Cuenta',
    pestanas: 'Tesorería → Cobranzas y Familias + Pestaña Cuotas',
    detalle:
      'Solo lectura consulta deudas y pagos; Edición habilita cobrar, generar/anular cargos, ajustar saldos y descuentos familiares.',
    permisoVer: 'cobranzas.ver',
    permisoEditar: 'cobranzas.editar',
    alcanceMinimoVer: 'PROPIO',
    alcanceMinimoEditar: 'UNIDAD',
  },
  {
    id: 'planes',
    titulo: 'Planes y Conceptos',
    pestanas: 'Tesorería → Pestaña Planes y Conceptos',
    detalle:
      'Solo lectura consulta cobros mensuales y cobros puntuales; Edición permite crear y modificar cobros mensuales y cobros puntuales.',
    permisoVer: 'planes.ver',
    permisoEditar: 'planes.editar',
    alcanceMinimoVer: 'UNIDAD',
    alcanceMinimoEditar: 'UNIDAD',
  },
  {
    id: 'caja',
    titulo: 'Caja, Bancos y Balance',
    pestanas: 'Tesorería → Caja, Bancos y Gastos + Cuadro de Resultados',
    detalle:
      'Solo lectura consulta saldos, libro diario y balance de su alcance (sección o grupo); Edición permite registrar ingresos/gastos, traspasos, cuentas y rubros.',
    permisoVer: 'caja.ver',
    permisoEditar: 'caja.editar',
    alcanceMinimoVer: 'UNIDAD',
    alcanceMinimoEditar: 'UNIDAD',
  },
  {
    id: 'eventos',
    titulo: 'Eventos Económicos',
    pestanas: 'Menú Eventos + Mi Espacio (Ventas propias) + POS y Pedidos',
    detalle:
      'Solo lectura consulta eventos y permite registrar ventas propias en Mi Espacio; Edición habilita vender en POS, gestionar pedidos y validar QR (cobro PAGADO y Venta General en Todo el grupo).',
    permisoVer: 'eventos.ver',
    permisoEditar: 'eventos.editar',
    alcanceMinimoVer: 'PROPIO',
    alcanceMinimoEditar: 'UNIDAD',
  },
  {
    id: 'organizacion',
    titulo: 'Organización y Correo Institucional',
    pestanas: 'Menú Organización → Ramas, Unidades y Correo SMTP',
    detalle:
      'Solo lectura consulta estructura de ramas y secciones; Edición (Todo el grupo) administra ramas, unidades y correo institucional SMTP.',
    permisoVer: 'organizacion.ver',
    permisoEditar: 'organizacion.editar',
    alcanceMinimoVer: 'UNIDAD',
    alcanceMinimoEditar: 'GLOBAL',
  },
  {
    id: 'roles',
    titulo: 'Roles y Permisos del Sistema',
    pestanas: 'Menú Organización → Pestaña Roles y Permisos',
    detalle:
      'Solo lectura consulta roles y permisos; Edición (Todo el grupo) permite crear, modificar, archivar y reactivar roles.',
    permisoVer: 'roles.ver',
    permisoEditar: 'roles.editar',
    alcanceMinimoVer: 'UNIDAD',
    alcanceMinimoEditar: 'GLOBAL',
  },
];

const ALCANCE_INFO: Record<
  AlcanceRolUI,
  {
    tituloCorto: string;
    labelCompacto: string;
    badgeClass: string;
    Icono: React.FC<{ className?: string }>;
  }
> = {
  PROPIO: {
    tituloCorto: 'Solo ficha propia',
    labelCompacto: 'Propio',
    badgeClass: 'bg-paper-2 text-ink-2 border-rule',
    Icono: UserCheck,
  },
  UNIDAD: {
    tituloCorto: 'Su sección',
    labelCompacto: 'Sección',
    badgeClass: 'bg-brand/10 text-brand border-brand/30',
    Icono: Users,
  },
  GLOBAL: {
    tituloCorto: 'Todo el grupo',
    labelCompacto: 'Grupo',
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

function resolverAlcancePanel(
  panel: DefinicionPanelRol,
  nivel: NivelPanel,
  permisosAlcance: Record<string, AlcanceRolUI>,
  fallback: AlcanceRolUI = 'UNIDAD',
): AlcanceRolUI {
  if (nivel === 'EDITAR') {
    const raw = permisosAlcance[panel.permisoEditar] ?? permisosAlcance[panel.permisoVer] ?? fallback;
    return alcanceMayor(raw, panel.alcanceMinimoEditar);
  }
  if (nivel === 'VER') {
    const raw = permisosAlcance[panel.permisoVer] ?? fallback;
    return alcanceMayor(raw, panel.alcanceMinimoVer);
  }
  return fallback;
}

export const PanelGestorRoles: React.FC<Props> = ({
  roles,
  mostrarInactivos = false,
  onToggleMostrarInactivos,
  onRecargar,
  onToast,
}) => {
  const tienePermisoGlobal = useAuthStore((s) => s.tienePermisoGlobal);
  const asignacionesActor = useAuthStore((s) => s.asignaciones);
  const puedeGestionarRoles = tienePermisoGlobal('roles.editar');
  const puedeVerArchivados = tienePermisoGlobal(['roles.editar', 'roles.ver', 'organizacion.ver']);

  const actorTienePermisoConAlcance = (clave: string, alcanceReq: AlcanceRolUI): boolean => {
    const pesoReq = PESO_ALCANCE[alcanceReq];
    return asignacionesActor.some((a) => {
      const alc = obtenerAlcancePermisoEnAsignacionUI(a, clave);
      return alc !== null && PESO_ALCANCE[alc] >= pesoReq;
    });
  };

  const actorDominaRol = (r: any): boolean => {
    if (!puedeGestionarRoles) return false;
    const perms: string[] = Array.isArray(r?.permisos) ? r.permisos : [];
    const fallback = (r?.alcancePorDefecto as AlcanceRolUI) || 'PROPIO';
    const mapa: Record<string, AlcanceRolUI> = r?.permisosAlcance || {};
    return perms.every((p) => actorTienePermisoConAlcance(p, mapa[p] ?? fallback));
  };

  const [rolEditando, setRolEditando] = useState<any | null>(null);
  const [modalAbierto, setModalAbierto] = useState(false);

  const [nombreRol, setNombreRol] = useState('');
  const [permisosSeleccionados, setPermisosSeleccionados] = useState<string[]>([]);
  const [permisosAlcanceMap, setPermisosAlcanceMap] = useState<Record<string, AlcanceRolUI>>({});

  const [guardando, setGuardando] = useState(false);
  const [eliminandoId, setEliminandoId] = useState<number | null>(null);
  const [reactivandoId, setReactivandoId] = useState<number | null>(null);
  const [modalConfirmacion, setModalConfirmacion] = useState<ModalConfirmacionProps | null>(null);

  // Roles administradores globales independientes por capacidad crítica (A5 / COD-02)
  const rolesAdminRolesIds = useMemo(
    () =>
      roles
        .filter((r) => {
          if (r.activo === false || !Array.isArray(r.permisos) || !r.permisos.includes('roles.editar')) {
            return false;
          }
          const alc = r.permisosAlcance?.['roles.editar'] ?? r.alcancePorDefecto;
          return alc === 'GLOBAL';
        })
        .map((r) => r.id),
    [roles],
  );

  const rolesAdminOrgIds = useMemo(
    () =>
      roles
        .filter((r) => {
          if (
            r.activo === false ||
            !Array.isArray(r.permisos) ||
            !r.permisos.includes('organizacion.editar')
          ) {
            return false;
          }
          const alc = r.permisosAlcance?.['organizacion.editar'] ?? r.alcancePorDefecto;
          return alc === 'GLOBAL';
        })
        .map((r) => r.id),
    [roles],
  );

  const esUltimoAdminDe = (rolId: number): { esUltimo: boolean; capacidades: string[] } => {
    const capacidades: string[] = [];
    if (rolesAdminRolesIds.length === 1 && rolesAdminRolesIds[0] === rolId) {
      capacidades.push('Roles y Permisos (roles.editar)');
    }
    if (rolesAdminOrgIds.length === 1 && rolesAdminOrgIds[0] === rolId) {
      capacidades.push('Organización y Correo (organizacion.editar)');
    }
    return { esUltimo: capacidades.length > 0, capacidades };
  };

  const mejorAlcanceCompatibleActor = (
    clave: string,
    alcanceMinimo: AlcanceRolUI,
    preferido: AlcanceRolUI,
  ): AlcanceRolUI | null => {
    const objetivo = alcanceMayor(preferido, alcanceMinimo);
    if (actorTienePermisoConAlcance(clave, objetivo)) return objetivo;
    for (const candidato of ['GLOBAL', 'UNIDAD', 'PROPIO'] as const) {
      if (
        PESO_ALCANCE[candidato] >= PESO_ALCANCE[alcanceMinimo] &&
        actorTienePermisoConAlcance(clave, candidato)
      ) {
        return candidato;
      }
    }
    return null;
  };

  const abrirNuevoRol = () => {
    setRolEditando(null);
    setNombreRol('');
    const iniciales: string[] = [];
    const alcances: Record<string, AlcanceRolUI> = {};
    for (const p of ['padron.ver', 'legajos.ver', 'cobranzas.ver', 'eventos.ver']) {
      if (actorTienePermisoConAlcance(p, 'PROPIO')) {
        iniciales.push(p);
        alcances[p] = 'PROPIO';
      }
    }
    setPermisosSeleccionados(iniciales);
    setPermisosAlcanceMap(alcances);
    setModalAbierto(true);
  };

  const abrirEditarRol = (r: any) => {
    setRolEditando(r);
    setNombreRol(r.nombre || '');
    const perms = Array.isArray(r.permisos) ? [...r.permisos] : [];
    const fallback = (r.alcancePorDefecto as AlcanceRolUI) || 'PROPIO';
    const alcMap: Record<string, AlcanceRolUI> = {};
    for (const clave of perms) {
      alcMap[clave] = r.permisosAlcance?.[clave] ?? fallback;
    }
    setPermisosSeleccionados(perms);
    setPermisosAlcanceMap(alcMap);
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
    bloqueado: guardando || Boolean(eliminandoId) || Boolean(reactivandoId) || Boolean(modalConfirmacion),
  });

  const puedeNivelEnPanel = (panel: DefinicionPanelRol, nivel: Exclude<NivelPanel, 'NINGUNO'>): boolean => {
    if (nivel === 'VER') {
      return actorTienePermisoConAlcance(panel.permisoVer, panel.alcanceMinimoVer);
    }
    return (
      actorTienePermisoConAlcance(panel.permisoVer, panel.alcanceMinimoEditar) &&
      actorTienePermisoConAlcance(panel.permisoEditar, panel.alcanceMinimoEditar)
    );
  };

  const puedeAlcanceEnPanel = (
    panel: DefinicionPanelRol,
    nivel: Exclude<NivelPanel, 'NINGUNO'>,
    alc: AlcanceRolUI,
  ): boolean => {
    const min = nivel === 'EDITAR' ? panel.alcanceMinimoEditar : panel.alcanceMinimoVer;
    if (PESO_ALCANCE[alc] < PESO_ALCANCE[min]) return false;
    if (!actorTienePermisoConAlcance(panel.permisoVer, alc)) return false;
    if (nivel === 'EDITAR' && !actorTienePermisoConAlcance(panel.permisoEditar, alc)) return false;
    return true;
  };

  const cambiarNivelPanel = (panel: DefinicionPanelRol, nivel: NivelPanel) => {
    if (nivel !== 'NINGUNO' && !puedeNivelEnPanel(panel, nivel)) return;

    const nivelPrevio = resolverNivelPanel(permisosSeleccionados, panel);
    const alcActual =
      nivelPrevio !== 'NINGUNO'
        ? resolverAlcancePanel(panel, nivelPrevio, permisosAlcanceMap)
        : panel.alcanceMinimoVer;

    setPermisosSeleccionados((prev) => {
      const sinPanel = prev.filter((c) => c !== panel.permisoVer && c !== panel.permisoEditar);
      if (nivel === 'VER') return [...sinPanel, panel.permisoVer];
      if (nivel === 'EDITAR') return [...sinPanel, panel.permisoVer, panel.permisoEditar];
      return sinPanel;
    });

    setPermisosAlcanceMap((prev) => {
      const next = { ...prev };
      delete next[panel.permisoVer];
      delete next[panel.permisoEditar];
      if (nivel === 'VER') {
        const alcFinal =
          mejorAlcanceCompatibleActor(panel.permisoVer, panel.alcanceMinimoVer, alcActual) ??
          panel.alcanceMinimoVer;
        next[panel.permisoVer] = alcFinal;
      } else if (nivel === 'EDITAR') {
        const alcFinal =
          mejorAlcanceCompatibleActor(panel.permisoEditar, panel.alcanceMinimoEditar, alcActual) ??
          panel.alcanceMinimoEditar;
        next[panel.permisoVer] = alcFinal;
        next[panel.permisoEditar] = alcFinal;
      }
      return next;
    });
  };

  const cambiarAlcancePanel = (panel: DefinicionPanelRol, alc: AlcanceRolUI) => {
    const nivel = resolverNivelPanel(permisosSeleccionados, panel);
    if (nivel === 'NINGUNO' || !puedeAlcanceEnPanel(panel, nivel, alc)) return;
    setPermisosAlcanceMap((prev) => ({
      ...prev,
      [panel.permisoVer]: alc,
      ...(nivel === 'EDITAR' ? { [panel.permisoEditar]: alc } : {}),
    }));
  };

  const aplicarNivelATodos = (modo: 'EDITAR' | 'VER') => {
    const nuevos: string[] = [];
    const nuevosAlcances: Record<string, AlcanceRolUI> = {};
    for (const panel of PANELES_SISTEMA) {
      const nivelActual = resolverNivelPanel(permisosSeleccionados, panel);
      const preferido =
        nivelActual !== 'NINGUNO'
          ? resolverAlcancePanel(panel, nivelActual, permisosAlcanceMap)
          : 'UNIDAD';
      if (modo === 'EDITAR' && puedeNivelEnPanel(panel, 'EDITAR')) {
        const alc =
          mejorAlcanceCompatibleActor(panel.permisoEditar, panel.alcanceMinimoEditar, preferido) ??
          panel.alcanceMinimoEditar;
        nuevos.push(panel.permisoVer, panel.permisoEditar);
        nuevosAlcances[panel.permisoVer] = alc;
        nuevosAlcances[panel.permisoEditar] = alc;
      } else if (puedeNivelEnPanel(panel, 'VER')) {
        const alc =
          mejorAlcanceCompatibleActor(panel.permisoVer, panel.alcanceMinimoVer, preferido) ??
          panel.alcanceMinimoVer;
        nuevos.push(panel.permisoVer);
        nuevosAlcances[panel.permisoVer] = alc;
      }
    }
    setPermisosSeleccionados(nuevos);
    setPermisosAlcanceMap(nuevosAlcances);
  };

  const aplicarAlcanceActivosATodos = (alcObjetivo: AlcanceRolUI) => {
    setPermisosAlcanceMap((prev) => {
      const next = { ...prev };
      for (const panel of PANELES_SISTEMA) {
        const nivel = resolverNivelPanel(permisosSeleccionados, panel);
        if (nivel === 'NINGUNO') continue;
        const min = nivel === 'EDITAR' ? panel.alcanceMinimoEditar : panel.alcanceMinimoVer;
        const claveCheck = nivel === 'EDITAR' ? panel.permisoEditar : panel.permisoVer;
        const alc = mejorAlcanceCompatibleActor(claveCheck, min, alcObjetivo);
        if (!alc) continue;
        next[panel.permisoVer] = alc;
        if (nivel === 'EDITAR') next[panel.permisoEditar] = alc;
      }
      return next;
    });
  };

  const limpiarTodos = () => {
    setPermisosSeleccionados([]);
    setPermisosAlcanceMap({});
  };

  const handleGuardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombreRol.trim()) return;

    const permisosFinales: string[] = [];
    const permisosAlcanceFinal: Record<string, AlcanceRolUI> = {};

    for (const panel of PANELES_SISTEMA) {
      const nivel = resolverNivelPanel(permisosSeleccionados, panel);
      if (nivel === 'NINGUNO') continue;
      const alc = resolverAlcancePanel(panel, nivel, permisosAlcanceMap);
      if (nivel === 'EDITAR') {
        permisosFinales.push(panel.permisoVer, panel.permisoEditar);
        permisosAlcanceFinal[panel.permisoVer] = alc;
        permisosAlcanceFinal[panel.permisoEditar] = alc;
      } else {
        permisosFinales.push(panel.permisoVer);
        permisosAlcanceFinal[panel.permisoVer] = alc;
      }
    }

    // Conservar permisos que no pertenecen a ningún panel de la UI (p. ej. claves nuevas del
    // backend): antes se borraban en silencio al guardar el rol.
    const clavesDePaneles = new Set(
      PANELES_SISTEMA.flatMap((p) => [p.permisoVer, p.permisoEditar]),
    );
    for (const clave of permisosSeleccionados) {
      if (clavesDePaneles.has(clave) || permisosFinales.includes(clave)) continue;
      permisosFinales.push(clave);
      const alc = permisosAlcanceMap[clave];
      if (alc) permisosAlcanceFinal[clave] = alc;
    }

    const payload = {
      nombre: nombreRol.trim(),
      permisos: permisosFinales,
      permisosAlcance: permisosAlcanceFinal,
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

  const handleReactivarRol = async (r: any) => {
    setReactivandoId(r.id);
    try {
      await api.patch(`/organizacion/roles/${r.id}`, { activo: true });
      onToast(`Rol "${r.nombre}" reactivado.`);
      await onRecargar();
    } catch (err) {
      onToast(traducirErrorAmigable(err, 'No se pudo reactivar el rol.'), 'error');
    } finally {
      setReactivandoId(null);
    }
  };

  const solicitarEliminarRol = (r: any) => {
    if (r.esSistema) {
      onToast(`El rol base del sistema "${r.nombre}" está protegido y no puede eliminarse.`, 'error');
      return;
    }

    const { esUltimo, capacidades } = esUltimoAdminDe(r.id);
    if (esUltimo) {
      onToast(
        `No puedes eliminar "${r.nombre}" porque es el único rol global activo con: ${capacidades.join(', ')}. Asígnale ese permiso a otro rol primero.`,
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
        } el rol "${r.nombre}". Cámbiales el rol desde su ficha en el Padrón antes de eliminar o archivar este rol.`,
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
      titulo: `Eliminar o archivar rol "${r.nombre}"`,
      mensaje: `¿Confirmas que deseas eliminar el rol "${r.nombre}"? Si posee historial de asignaciones o pases anteriores, se archivará automáticamente para preservar la trazabilidad.`,
      tipo: 'peligro',
      textoConfirmar: 'Sí, continuar',
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
            <span>Roles y Permisos del Grupo</span>
          </h2>
          <p className="text-[13px] text-ink-muted mt-0.5">
            Cada rol define qué paneles puede consultar o editar y sobre qué alcance (ficha propia, sección asignada o todo el grupo).
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {puedeVerArchivados && onToggleMostrarInactivos && (
            <label className="min-h-[44px] px-3.5 py-2 rounded-xl bg-paper-2 border border-rule text-xs font-bold text-ink-2 inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={mostrarInactivos}
                onChange={(e) => onToggleMostrarInactivos(e.target.checked)}
                className="w-4 h-4 rounded text-brand border-rule cursor-pointer"
              />
              <span>Ver archivados</span>
            </label>
          )}

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
      </div>

      {/* Tarjetas de Roles Actuales */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {roles.map((r) => {
          const permisosRol: string[] = Array.isArray(r.permisos) ? r.permisos : [];
          const alcFallback = (r.alcancePorDefecto as AlcanceRolUI) || 'PROPIO';
          const permAlcMap: Record<string, AlcanceRolUI> = r.permisosAlcance || {};
          const eliminando = eliminandoId === r.id;
          const reactivando = reactivandoId === r.id;
          const esInactivo = r.activo === false;
          const { esUltimo, capacidades } = esUltimoAdminDe(r.id);
          const puedeOperarEsteRol = puedeGestionarRoles && actorDominaRol(r);

          const panelesRol = PANELES_SISTEMA.map((panel) => {
            const nivel = resolverNivelPanel(permisosRol, panel);
            const alcancePanel =
              nivel === 'NINGUNO'
                ? alcFallback
                : resolverAlcancePanel(panel, nivel, permAlcMap, alcFallback);
            return { panel, nivel, alcancePanel };
          }).filter((x) => x.nivel !== 'NINGUNO');

          const alcancesUnicos = Array.from(new Set(panelesRol.map((p) => p.alcancePanel)));
          const esMixto = alcancesUnicos.length > 1;
          const alcanceBadgeKey: AlcanceRolUI =
            alcancesUnicos.length === 1 ? alcancesUnicos[0] : alcFallback;
          const alcanceCfg = ALCANCE_INFO[alcanceBadgeKey];
          const IconoAlcance = alcanceCfg.Icono;

          return (
            <div
              key={r.id}
              className={`bg-surface rounded-2xl border border-rule p-5 shadow-xs flex flex-col justify-between gap-4 ${
                esInactivo ? 'opacity-70 border-dashed' : ''
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-[17px] font-extrabold text-ink">{r.nombre}</h3>
                      {esInactivo && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60">
                          Archivado
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-[13px] text-ink-muted">
                      <span className="font-semibold text-ink-2">
                        {r.asignacionesActivas || 0}{' '}
                        {r.asignacionesActivas === 1 ? 'persona activa' : 'personas activas'}
                      </span>
                    </div>
                  </div>

                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold border shrink-0 ${
                      esMixto
                        ? 'bg-brand/10 text-brand border-brand/30'
                        : alcanceCfg.badgeClass
                    }`}
                  >
                    <IconoAlcance className="w-4 h-4" />
                    <span>{esMixto ? 'Alcance por panel' : alcanceCfg.tituloCorto}</span>
                  </span>
                </div>

                <div>
                  <span className="text-[13px] font-semibold text-ink-muted block mb-2">
                    Paneles habilitados ({panelesRol.length} de {PANELES_SISTEMA.length}):
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {panelesRol.map(({ panel, nivel, alcancePanel }) => (
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
                        <span className="text-xs opacity-75">
                          ({nivel === 'EDITAR' ? 'Edición' : 'Lectura'} · {ALCANCE_INFO[alcancePanel].labelCompacto})
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
                  {esInactivo ? (
                    <button
                      type="button"
                      disabled={reactivando || !puedeOperarEsteRol}
                      onClick={() => void handleReactivarRol(r)}
                      className="min-h-[44px] px-4 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 font-bold text-[13px] flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                    >
                      {reactivando ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <RotateCcw className="w-4 h-4" />
                      )}
                      <span>Reactivar Rol</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={eliminando || Boolean(r.esSistema) || !puedeOperarEsteRol}
                      onClick={() => solicitarEliminarRol(r)}
                      title={
                        r.esSistema
                          ? 'Rol base del sistema protegido'
                          : !puedeOperarEsteRol
                            ? 'Este rol contiene permisos que usted no posee'
                            : esUltimo
                              ? `Protegido: único rol con ${capacidades.join(', ')}`
                              : 'Eliminar o archivar este rol'
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
                  )}

                  <button
                    type="button"
                    disabled={!puedeOperarEsteRol}
                    onClick={() => abrirEditarRol(r)}
                    title={
                      !puedeOperarEsteRol
                        ? 'No puede modificar un rol que posee permisos superiores a los suyos'
                        : undefined
                    }
                    className="flex-1 sm:flex-initial min-h-[44px] px-4 py-2 rounded-xl bg-brand hover:opacity-90 active:opacity-100 text-brand-contrast font-bold text-[13px] flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs disabled:opacity-50"
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
                    Definí el nombre del rol y elegí el nivel y alcance para cada panel del sistema.
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
                    placeholder="Ej: Jefe de Grupo, Tesorero, Educador, Colaborador..."
                    className="w-full min-h-[46px] px-4 py-2.5 rounded-xl border border-rule bg-surface text-ink text-base sm:text-[15px] font-bold focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none transition-colors"
                  />
                </div>

                {/* 2. Permisos y alcance por Panel */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <label className="text-sm font-extrabold text-ink">
                      2. Permisos y alcance por panel ({panelesActivosModalCount} de {PANELES_SISTEMA.length} activos)
                    </label>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => aplicarNivelATodos('EDITAR')}
                        className="px-3 py-1.5 rounded-xl bg-paper-3 hover:bg-brand/10 text-ink-2 hover:text-brand font-bold text-xs cursor-pointer transition-colors"
                      >
                        Todo en Edición
                      </button>
                      <button
                        type="button"
                        onClick={() => aplicarNivelATodos('VER')}
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

                  {/* Atajo rápido para alcance en paneles activos */}
                  {panelesActivosModalCount > 0 && (
                    <div className="p-2.5 rounded-xl bg-paper-2 border border-rule flex items-center justify-between flex-wrap gap-2">
                      <span className="text-xs font-bold text-ink-muted">
                        Aplicar alcance a paneles activos:
                      </span>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {(
                          [
                            { id: 'PROPIO', label: 'Ficha propia' },
                            { id: 'UNIDAD', label: 'Su sección' },
                            { id: 'GLOBAL', label: 'Todo el grupo' },
                          ] as const
                        ).map((alc) => (
                          <button
                            key={alc.id}
                            type="button"
                            onClick={() => aplicarAlcanceActivosATodos(alc.id)}
                            className="px-2.5 py-1 rounded-lg bg-surface hover:bg-brand/10 border border-rule text-xs font-bold text-ink-2 hover:text-brand cursor-pointer transition-colors"
                          >
                            {alc.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {rolEditando && esUltimoAdminDe(rolEditando.id).esUltimo && (
                    <div className="p-3.5 rounded-xl bg-brand/10 border border-brand/30 flex items-start gap-2.5 text-ink text-xs">
                      <AlertTriangle className="w-4 h-4 text-brand shrink-0 mt-0.5" />
                      <span>
                        Este es actualmente el único rol activo con:{' '}
                        <strong>{esUltimoAdminDe(rolEditando.id).capacidades.join(', ')}</strong>. Conservá ese panel en{' '}
                        <strong>Edición</strong> con alcance <strong>Todo el grupo</strong> para evitar bloqueos.
                      </span>
                    </div>
                  )}

                  <div className="space-y-2.5">
                    {PANELES_SISTEMA.map((panel) => {
                      const nivelActual = resolverNivelPanel(permisosSeleccionados, panel);
                      const alcanceActual =
                        nivelActual === 'NINGUNO'
                          ? panel.alcanceMinimoVer
                          : resolverAlcancePanel(panel, nivelActual, permisosAlcanceMap);
                      const verPermitido = puedeNivelEnPanel(panel, 'VER');
                      const editarPermitido = puedeNivelEnPanel(panel, 'EDITAR');

                      return (
                        <div
                          key={panel.id}
                          className={`p-4 rounded-2xl border transition space-y-3 ${
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
                                {panel.alcanceMinimoEditar === 'GLOBAL' && (
                                  <span className="px-2 py-0.5 rounded-md bg-paper-3 text-ink-2 text-xs font-bold">
                                    Edición en Todo el grupo
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

                            <div className="inline-grid grid-cols-3 rounded-xl bg-paper-3 p-1 gap-1 shrink-0">
                              {(
                                [
                                  { id: 'NINGUNO', label: 'Sin acceso' },
                                  { id: 'VER', label: 'Solo lectura' },
                                  { id: 'EDITAR', label: 'Edición' },
                                ] as const
                              ).map((op) => {
                                const deshabilitado =
                                  (op.id === 'VER' && !verPermitido) ||
                                  (op.id === 'EDITAR' && !editarPermitido);
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
                                        : 'text-ink-2 hover:text-ink'
                                    }`}
                                  >
                                    {op.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {nivelActual !== 'NINGUNO' && (
                            <div className="pt-2.5 border-t border-rule/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <span className="text-xs font-bold text-ink-2">
                                Alcance en este panel:
                              </span>
                              <div className="inline-grid grid-cols-3 rounded-xl bg-paper-3 p-1 gap-1">
                                {(
                                  [
                                    { id: 'PROPIO', label: 'Ficha propia', Icono: UserCheck },
                                    { id: 'UNIDAD', label: 'Su sección', Icono: Users },
                                    { id: 'GLOBAL', label: 'Todo el grupo', Icono: Globe },
                                  ] as const
                                ).map((alc) => {
                                  const habilitado = puedeAlcanceEnPanel(panel, nivelActual, alc.id);
                                  const sel = alcanceActual === alc.id;
                                  const Ic = alc.Icono;
                                  return (
                                    <button
                                      key={alc.id}
                                      type="button"
                                      disabled={!habilitado}
                                      onClick={() => cambiarAlcancePanel(panel, alc.id)}
                                      className={`px-2.5 py-1.5 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed ${
                                        sel
                                          ? 'bg-surface text-brand shadow-xs ring-1 ring-brand/30'
                                          : 'text-ink-2 hover:text-ink'
                                      }`}
                                    >
                                      <Ic className="w-3.5 h-3.5 shrink-0" />
                                      <span>{alc.label}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
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
