import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRightLeft,
  CreditCard,
  FileCheck2,
  HeartPulse,
  KeyRound,
  Loader2,
  Phone,
  ShieldAlert,
  User,
  X,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { useOfflineStore } from '../../store/offlineStore';
import { useToastStore } from '../../store/toastStore';
import { computeCapabilities } from '../../core/capabilities';
import { ModalCobrarDeuda } from '../../components/ModalCobrarDeuda';
import { ModalGenerarDeudaManual } from '../../components/ModalGenerarDeudaManual';
import { ModalEditarFamilia } from '../../components/ModalEditarFamilia';
import { ModalVincularHermano } from '../../components/ModalVincularHermano';
import { BotonLlamarMiembro } from '../../components/BotonLlamarMiembro';
import {
  PestanaDatosMiembro,
  type FormDatosMiembro,
} from '../../components/detalle-miembro/PestanaDatosMiembro';
import {
  PestanaCuotasTesoreria,
  type CargoEditando,
  type PagoEditando,
} from '../../components/detalle-miembro/PestanaCuotasTesoreria';
import { PestanaLegajosFichas } from '../../components/detalle-miembro/PestanaLegajosFichas';
import { PestanaPaseRol } from '../../components/detalle-miembro/PestanaPaseRol';
import { PestanaSeguridad } from '../../components/detalle-miembro/PestanaSeguridad';
import { SegmentedTabs, type SegmentedTabItem } from '../../components/ui';
import { extraerInfoMedicaMiembro } from '../../lib/alertasMedicas';
import { obtenerConfigRama } from '../../lib/ramaColors';
import {
  calcularEdad,
  esRolAlcanceGlobal,
  esRolDeEducador,
  esRolDeProtagonista,
  esRolJefe,
  esRolRama,
  esRolSinRama,
  filtrarPlantillasParaMiembro,
  formatearMoneda,
  obtenerAsignacionesActivas,
  obtenerCicloAnioActual,
  obtenerRolPrincipal,
  obtenerRolesSecundarios,
  seleccionarPlantillaPorMiembro,
  traducirErrorAmigable,
  type OpcionTelefonoContacto,
} from '../../lib/formatters';
import {
  actorDominaPermisosRol,
  esUnidadJefatura,
  esUnidadRama,
  esUnidadSinRama,
  miembroEsEducador,
  miembroTieneAlcanceGlobal,
  puedeCerrarAsignacionPorAlcance,
  puedeEditarFamiliaPorAlcance,
  usePermisosUI,
} from '../../lib/permisos';
import {
  crearUrlPdfBlob,
  descargarPdfBlob,
  generarFichaPdf,
  type MapeoPdf,
} from '../../services/pdfGenerator';

const PdfViewerModal = lazy(() =>
  import('../../components/PdfViewerModal').then((m) => ({ default: m.PdfViewerModal })),
);

export type TabExpediente360 = 'datos' | 'cuotas' | 'ficha' | 'pase' | 'seguridad';

type SubVistaExpediente =
  | null
  | 'cobrar'
  | 'nuevo-cargo'
  | 'editar-familia'
  | 'vincular-hermano'
  | 'llamar'
  | 'pdf'
  | 'confirmar';

interface ConfirmInlineConfig {
  tipo: 'peligro' | 'alerta';
  titulo: string;
  mensaje: string;
  textoConfirmar: string;
  textoCancelar: string | null;
  cargando?: boolean;
  onConfirmar: () => void | Promise<void>;
}

export interface ExpedienteMiembro360Props {
  usuarioId: number;
  tabInicial?: TabExpediente360;
  enDrawer?: boolean;
  onTabChange?: (tab: TabExpediente360) => void;
  onCerrar?: () => void;
  onActualizado?: () => void;
  onEliminado?: (mensaje: string) => void;
  onClaveReseteada?: (mensaje: string) => void;
  mostrarBotonCerrar?: boolean;
}

const CARGOS_VACIOS: any[] = [];

export const ExpedienteMiembro360: React.FC<ExpedienteMiembro360Props> = ({
  usuarioId,
  tabInicial = 'datos',
  enDrawer = false,
  onTabChange,
  onCerrar,
  onActualizado,
  onEliminado,
  onClaveReseteada,
  mostrarBotonCerrar = false,
}) => {
  const {
    usuario: usuarioActual,
    asignaciones: asignacionesActuales,
    tienePermisoGlobal,
    tienePermisoUnidadOGlobal,
    obtenerUnidadesConPermiso,
    refrescarSesionDesdeServidor,
  } = useAuthStore();
  const isOnline = useOfflineStore((s) => s.isOnline);
  const mostrarToast = useToastStore((s) => s.mostrarToast);
  const { canEditInScope, canViewInScope } = usePermisosUI();
  // El expediente opera sobre otros miembros: un permiso con alcance PROPIO (solo la ficha propia)
  // no habilita ver ni editar a terceros, así que se exige como mínimo alcance UNIDAD.
  const canEdit = (modulo: string, campo: string) => canEditInScope(modulo, campo, 'UNIDAD');
  const canView = (modulo: string) => canViewInScope(modulo, 'UNIDAD');

  const esGlobalPadron = tienePermisoGlobal('padron.editar');
  const tieneBajaGlobal = esGlobalPadron;
  const esGlobalPases = tienePermisoGlobal('pases.editar');
  const unidadesPasesIds = useMemo(
    () => obtenerUnidadesConPermiso('pases.editar'),
    [obtenerUnidadesConPermiso, asignacionesActuales],
  );
  const esGlobalFamilia = tienePermisoGlobal([
    'padron.editar',
    'cobranzas.editar',
    'caja.editar',
  ]);
  const unidadesFamiliaIds = useMemo(
    () =>
      obtenerUnidadesConPermiso(['padron.editar', 'cobranzas.editar', 'caja.editar']),
    [obtenerUnidadesConPermiso, asignacionesActuales],
  );
  const esGlobalDescuentoFamilia = tienePermisoGlobal([
    'cobranzas.editar',
    'planes.editar',
    'caja.editar',
  ]);
  const unidadesDescuentoIds = useMemo(
    () =>
      obtenerUnidadesConPermiso(['cobranzas.editar', 'planes.editar', 'caja.editar']),
    [obtenerUnidadesConPermiso, asignacionesActuales],
  );

  const [tab, setTab] = useState<TabExpediente360>(tabInicial);
  useEffect(() => {
    setTab(tabInicial);
  }, [tabInicial, usuarioId]);

  const cambiarTab = (next: TabExpediente360) => {
    setTab(next);
    setSubVista(null);
    onTabChange?.(next);
  };

  const [miembro, setMiembro] = useState<any | null>(null);
  const [estadoCuenta, setEstadoCuenta] = useState<any | null>(null);
  const [estadoCuentaNoDisponible, setEstadoCuentaNoDisponible] = useState(false);
  const usuarioIdEnCursoRef = useRef<number | null>(null);
  const [entregas, setEntregas] = useState<any[]>([]);
  // true si la consulta de fichas falló (403/red): no se puede afirmar "sin alertas".
  const [entregasNoDisponibles, setEntregasNoDisponibles] = useState(false);
  const [unidades, setUnidades] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [ramas, setRamas] = useState<any[]>([]);
  const [candidatosPase, setCandidatosPase] = useState<any[]>([]);

  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [eliminandoDefinitivo, setEliminandoDefinitivo] = useState(false);
  const [ejecutandoPase, setEjecutandoPase] = useState(false);
  const [reseteandoClave, setReseteandoClave] = useState(false);
  const [claveTemporalGenerada, setClaveTemporalGenerada] = useState<string | null>(null);
  const [validandoFichaId, setValidandoFichaId] = useState<number | null>(null);
  const [descargandoPdfId, setDescargandoPdfId] = useState<number | null>(null);
  const [generandoVistaPrevia, setGenerandoVistaPrevia] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [editandoFicha, setEditandoFicha] = useState(false);
  const [plantillasAplicables, setPlantillasAplicables] = useState<any[]>([]);
  const [plantillaActiva, setPlantillaActiva] = useState<any | null>(null);
  const [precargaFicha, setPrecargaFicha] = useState<any | null>(null);
  const [cargandoFichaEditor, setCargandoFichaEditor] = useState(false);
  const [alerta, setAlerta] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null);
  const datosPreviewVivoRef = useRef<Record<string, unknown> | undefined>(undefined);

  // Sub-vista inline para mantener máximo 1 overlay (cero portales apilados)
  const [subVista, setSubVista] = useState<SubVistaExpediente>(null);
  const [cargoIdACobrar, setCargoIdACobrar] = useState<number | null>(null);
  const [telefonosInline, setTelefonosInline] = useState<OpcionTelefonoContacto[]>([]);
  const [confirmInline, setConfirmInline] = useState<ConfirmInlineConfig | null>(null);

  // Estados de edición y reversión en pestaña Cuotas
  const [mostrarAnulados, setMostrarAnulados] = useState(false);
  const [cargoEditando, setCargoEditando] = useState<CargoEditando | null>(null);
  const [pagoEditando, setPagoEditando] = useState<PagoEditando | null>(null);
  const [ajustandoSaldo, setAjustandoSaldo] = useState(false);
  const [tipoAjusteSaldo, setTipoAjusteSaldo] = useState<'CARGAR' | 'DESCONTAR' | 'FIJAR'>('CARGAR');
  const [montoAjusteSaldo, setMontoAjusteSaldo] = useState('');
  const [motivoAjusteSaldo, setMotivoAjusteSaldo] = useState('');
  const [procesandoAccionCuota, setProcesandoAccionCuota] = useState(false);
  const [desvinculandoMiembroId, setDesvinculandoMiembroId] = useState<number | null>(null);

  // Formulario de edición de datos
  const [formData, setFormData] = useState<FormDatosMiembro>({
    nombre: '',
    apellido: '',
    dni: '',
    fechaNacimiento: '',
    tipoMiembro: 'PROTAGONISTA',
    emailContacto: '',
    telefonoContacto: '',
    madreNombres: '',
    madreTelefono: '',
    padreNombres: '',
    padreTelefono: '',
    tutorNombres: '',
    tutorTelefono: '',
    domicilio: '',
    obraSocial: '',
    telefonoUrgencias: '',
    alergias: '',
    alergiasTipos: [],
    regimenDietarioTipos: [],
    regimenDietarioDetalle: '',
    activo: true,
  });

  // Formulario de pase
  const [categoriaDestino, setCategoriaDestino] = useState<'RAMA' | 'SIN_RAMA' | 'JEFATURA'>('RAMA');
  const [ramaSeleccionadaId, setRamaSeleccionadaId] = useState<number | null>(null);
  const [unidadDestinoId, setUnidadDestinoId] = useState<string>('');
  const [rolDestinoId, setRolDestinoId] = useState<string>('');

  const targetEsGlobal = useMemo(() => miembroTieneAlcanceGlobal(miembro), [miembro]);
  const targetEsEducador = useMemo(() => miembroEsEducador(miembro), [miembro]);
  const esMismoUsuario = Boolean(miembro && usuarioActual && miembro.id === usuarioActual.id);

  const puedeVerCuotas = canView('cuotas');
  const puedeCobrarCuotas = canEdit('cuotas', 'cobrar');
  const puedeCrearCargoIndividual = canEdit('cuotas', 'cargoIndividual');
  const puedeAjustarCuotas = canEdit('cuotas', 'editarCargo');
  const puedeGestionarTesoreria = tienePermisoUnidadOGlobal(['cobranzas.editar', 'caja.editar']);
  const puedeVerFicha = canView('ficha');
  const puedeCompletarFicha = canEdit('ficha', 'completar');
  const puedeValidarFisico = canEdit('ficha', 'validarFisico') && !esMismoUsuario;
  const puedeEditarIdentidad =
    canEdit('miembro', 'identidad') && (!targetEsGlobal || esGlobalPadron);
  const puedeEditarContacto =
    canEdit('miembro', 'contacto') && (!targetEsGlobal || esGlobalPadron);
  // Alergias y dieta (datos de salud): además de editar contacto, exigen legajos.editar
  // sobre el miembro, salvo en el propio perfil. El backend aplica la misma regla.
  const puedeEditarSalud =
    puedeEditarContacto && (esMismoUsuario || tienePermisoUnidadOGlobal('legajos.editar'));
  const puedeDarBaja =
    canEdit('miembro', 'estado') && (!targetEsGlobal || tieneBajaGlobal) && !esMismoUsuario;
  const puedeEditarMiembro = puedeEditarIdentidad || puedeEditarContacto || puedeDarBaja;
  const puedeHacerPases =
    canEdit('miembro', 'pase') &&
    (!targetEsGlobal || esGlobalPases) &&
    !(!esGlobalPases && (esMismoUsuario || targetEsEducador));
  const puedeResetearClave =
    canEdit('miembro', 'clave') && (!targetEsGlobal || esGlobalPadron) && !esMismoUsuario; // la propia clave se cambia en Mi Espacio

  const ramaSeleccionadaObj = useMemo(
    () => ramas.find((r) => r.id === ramaSeleccionadaId),
    [ramas, ramaSeleccionadaId],
  );

  const unidadesRamaSeleccionada = useMemo(
    () => unidades.filter((u) => u.ramaId === ramaSeleccionadaId && esUnidadRama(u)),
    [unidades, ramaSeleccionadaId],
  );

  const candidatoPase = candidatosPase.find((c) => c.usuario?.id === miembro?.id);

  const esEgreso = useMemo(() => {
    if (candidatoPase?.tipo === 'EGRESO' || candidatoPase?.tipo === 'EGRESO_SIN_RAMA') return true;
    const edad = miembro?.fechaNacimiento ? calcularEdad(miembro.fechaNacimiento) : 0;
    const asigActiva = obtenerRolPrincipal(miembro) ?? miembro?.asignaciones?.[0];
    const esRover = asigActiva?.unidad?.rama?.nombre?.toLowerCase().includes('rover');
    return Boolean(esRover && (edad ?? 0) >= 21);
  }, [candidatoPase, miembro]);

  const rolesActivosDominados = useMemo(
    () =>
      roles.filter(
        (r) => r.activo !== false && actorDominaPermisosRol(asignacionesActuales, r),
      ),
    [roles, asignacionesActuales],
  );

  const rolesRama = rolesActivosDominados.filter(
    (r) => esGlobalPases || !esRolAlcanceGlobal(r),
  );

  // Con o sin rama el conjunto asignable es el mismo (antes eran dos filtros idénticos)
  const rolesSinRama = rolesRama;

  const rolesJefatura = esGlobalPases ? rolesActivosDominados : [];

  const familiaActual = miembro?.grupoFamiliar || estadoCuenta?.grupoFamiliar;
  const puedeVincularHermano =
    canEdit('miembro', 'familia') && (!targetEsGlobal || esGlobalFamilia);
  const puedeEditarDescuentoFamilia = Boolean(
    familiaActual &&
      (!targetEsGlobal || esGlobalDescuentoFamilia) &&
      canEdit('miembro', 'descuentoFamiliar') &&
      puedeEditarFamiliaPorAlcance(familiaActual, {
        esGlobal: esGlobalDescuentoFamilia,
        unidadesEnAlcanceIds: unidadesDescuentoIds,
      }),
  );

  const asignacionPrincipal = miembro ? obtenerRolPrincipal(miembro) : null;
  const asignacionesActivas = useMemo(() => obtenerAsignacionesActivas(miembro), [miembro]);
  const rolesSecundarios = useMemo(() => obtenerRolesSecundarios(miembro), [miembro]);

  const esMismoDestino = useMemo(() => {
    if (!asignacionPrincipal) return false;
    const unidadIdActual = asignacionPrincipal.unidad?.id ?? asignacionPrincipal.unidadId;
    const rolIdActual = asignacionPrincipal.rol?.id ?? asignacionPrincipal.rolId;
    return Number(unidadDestinoId) === unidadIdActual && Number(rolDestinoId) === rolIdActual;
  }, [asignacionPrincipal, unidadDestinoId, rolDestinoId]);

  const esEducador = targetEsEducador;

  const guardOffline = (accion = 'realizar esta acción'): boolean => {
    if (!isOnline) {
      mostrarToast(`Estás sin conexión. Recuperá señal para ${accion}.`, 'advertencia');
      return true;
    }
    return false;
  };

  const queryClient = useQueryClient();
  /**
   * Catálogos que no dependen del miembro (unidades, roles, ramas, plantillas): se toman de la
   * caché de react-query (5 min) y se comparten con Inicio/Tesorería, en vez de volver a bajarlos
   * cada vez que se abre un expediente. Devuelve la forma `{ data }` que usa cargarDatos.
   */
  const obtenerCatalogo = useCallback(
    async (clave: string, url: string): Promise<{ data: any[] }> => {
      const usuarioActualId = useAuthStore.getState().usuario?.id;
      const data = await queryClient.fetchQuery({
        queryKey: [clave, usuarioActualId],
        staleTime: 5 * 60 * 1000,
        queryFn: async () => {
          const res = await api.get(url);
          return Array.isArray(res.data) ? (res.data as any[]) : [];
        },
      });
      return { data };
    },
    [queryClient],
  );

  const cargarDatos = useCallback(
    async (id: number, opts?: { silencioso?: boolean }) => {
      if (!opts?.silencioso) {
        setCargando(true);
      }
      try {
        // Catálogos de organización solo con permiso (si no, 403); abajo hay respaldo sintético.
        const capsCarga = computeCapabilities(useAuthStore.getState().asignaciones);
        const [
          resMiembro,
          resCuenta,
          resEntregas,
          resPlantillas,
          resUnidades,
          resRoles,
          resCandidatos,
          resRamas,
        ] = await Promise.all([
          api.get(`/miembros/${id}`),
          api.get(`/tesoreria/estado-cuenta/${id}`).catch(() => null),
          // Solo el ciclo actual: sin filtro se mezclaban fichas y alertas de años anteriores.
          api.get(`/legajos/entregas?usuarioId=${id}&cicloAnio=${obtenerCicloAnioActual()}`).catch(() => null),
          obtenerCatalogo(
            `legajos-plantillas-${obtenerCicloAnioActual()}`,
            `/legajos/plantillas?cicloAnio=${obtenerCicloAnioActual()}`,
          ).catch(() => ({ data: [] })),
          capsCarga.canViewOrganizacion
            ? obtenerCatalogo('unidades-org', '/organizacion/unidades').catch(() => ({ data: [] }))
            : Promise.resolve({ data: [] }),
          capsCarga.canViewRoles
            ? obtenerCatalogo('organizacion-roles', '/organizacion/roles').catch(() => ({ data: [] }))
            : Promise.resolve({ data: [] }),
          api.get('/pases/candidatos').catch(() => ({ data: [] })),
          capsCarga.canViewOrganizacion
            ? obtenerCatalogo('organizacion-ramas', '/organizacion/ramas').catch(() => ({ data: [] }))
            : Promise.resolve({ data: [] }),
        ]);

        // Si mientras tanto se abrió otro miembro, descartar esta respuesta.
        if (usuarioIdEnCursoRef.current !== id) return;
        const m = resMiembro.data;
        setMiembro(m);
        if (resCuenta) setEstadoCuenta(resCuenta.data);
        setEstadoCuentaNoDisponible(!resCuenta);
        if (resEntregas) setEntregas(resEntregas.data);
        setEntregasNoDisponibles(!resEntregas);

        let listaPlantillas: any[] = Array.isArray(resPlantillas?.data) ? resPlantillas.data : [];
        if (listaPlantillas.length === 0) {
          const resTodas = await obtenerCatalogo('legajos-plantillas-todas', '/legajos/plantillas').catch(
            () => ({ data: [] }),
          );
          listaPlantillas = Array.isArray(resTodas?.data) ? resTodas.data : [];
        }
        const aplicables = filtrarPlantillasParaMiembro(listaPlantillas, m);
        const disponibles = aplicables.length > 0 ? aplicables : listaPlantillas;
        setPlantillasAplicables(disponibles);
        if (disponibles.length > 0) {
          setPlantillaActiva((prev: any) =>
            prev && disponibles.some((p) => p.id === prev.id)
              ? disponibles.find((p) => p.id === prev.id)
              : seleccionarPlantillaPorMiembro(disponibles, m) || disponibles[0],
          );
        }

        // Fallback sintético de organización cuando /organizacion/* devuelve [] para roles sin permiso organizacion.ver
        let unidadesResueltas: any[] = Array.isArray(resUnidades.data) ? resUnidades.data : [];
        let rolesResueltos: any[] = Array.isArray(resRoles.data) ? resRoles.data : [];
        let ramasResueltas: any[] = Array.isArray(resRamas.data) ? resRamas.data : [];

        if (unidadesResueltas.length === 0) {
          const mapaU = new Map<number, any>();
          for (const a of m?.asignaciones || []) {
            if (a.unidad?.id && !mapaU.has(a.unidad.id)) {
              mapaU.set(a.unidad.id, a.unidad);
            }
          }
          const unidadesAsignadas = computeCapabilities(
            useAuthStore.getState().asignaciones,
          ).unidadesAsignadas;
          for (const u of unidadesAsignadas) {
            if (!mapaU.has(u.id)) {
              mapaU.set(u.id, { id: u.id, nombre: u.nombre, activa: true });
            }
          }
          unidadesResueltas = Array.from(mapaU.values());
        }

        if (rolesResueltos.length === 0) {
          const mapaR = new Map<number, any>();
          for (const a of m?.asignaciones || []) {
            if (a.rol?.id && !mapaR.has(a.rol.id)) {
              mapaR.set(a.rol.id, a.rol);
            }
          }
          rolesResueltos = Array.from(mapaR.values());
        }

        if (ramasResueltas.length === 0) {
          const mapaRa = new Map<number, any>();
          for (const a of m?.asignaciones || []) {
            if (a.unidad?.rama?.id && !mapaRa.has(a.unidad.rama.id)) {
              mapaRa.set(a.unidad.rama.id, a.unidad.rama);
            }
          }
          ramasResueltas = Array.from(mapaRa.values());
        }

        setUnidades(unidadesResueltas);
        setRoles(rolesResueltos);
        setRamas(ramasResueltas);
        setCandidatosPase(Array.isArray(resCandidatos.data) ? resCandidatos.data : []);

        const fechaNac = m.fechaNacimiento
          ? new Date(m.fechaNacimiento).toISOString().split('T')[0]
          : '';
        setFormData({
          nombre: m.nombre || '',
          apellido: m.apellido || '',
          dni: m.dni || '',
          fechaNacimiento: fechaNac,
          tipoMiembro:
            m.tipoMiembro === 'EDUCADOR' || (m.tipoMiembro == null && miembroEsEducador(m))
              ? 'EDUCADOR'
              : 'PROTAGONISTA',
          emailContacto: m.emailContacto || '',
          telefonoContacto: m.telefonoContacto || m.datosFijosJson?.protagonista_telefono || '',
          madreNombres: m.datosFijosJson?.madre_nombres || '',
          madreTelefono: m.datosFijosJson?.madre_telefono || '',
          padreNombres: m.datosFijosJson?.padre_nombres || '',
          padreTelefono: m.datosFijosJson?.padre_telefono || '',
          tutorNombres: m.datosFijosJson?.tutor_nombres || '',
          tutorTelefono: m.datosFijosJson?.tutor_telefono || '',
          domicilio: m.datosFijosJson?.domicilio || '',
          obraSocial: m.datosFijosJson?.obra_social || '',
          telefonoUrgencias: m.datosFijosJson?.telefono_urgencias || '',
          alergias: m.datosFijosJson?.sufre_alergia_detalle || m.datosFijosJson?.alergias || '',
          alergiasTipos: Array.isArray(m.datosFijosJson?.alergias_tipos)
            ? m.datosFijosJson.alergias_tipos
            : [],
          regimenDietarioTipos: Array.isArray(m.datosFijosJson?.regimen_dietario_tipos)
            ? m.datosFijosJson.regimen_dietario_tipos
            : [],
          regimenDietarioDetalle:
            m.datosFijosJson?.regimen_dietario_detalle ||
            m.datosFijosJson?.dieta_especial_detalle ||
            '',
          activo: m.activo ?? true,
        });

        const asig = obtenerRolPrincipal(m) ?? m.asignaciones?.[0];
        const asigUnidadId = asig?.unidad?.id ?? asig?.unidadId;
        const candidato = (resCandidatos.data || []).find((c: any) => c.usuario?.id === id);

        let catIni: 'RAMA' | 'SIN_RAMA' | 'JEFATURA' = 'RAMA';
        let ramaIniId: number | null = null;
        let unidadIni = '';
        let rolIni = '';

        if (candidato) {
          if (candidato.tipo === 'EGRESO' || candidato.tipo === 'EGRESO_SIN_RAMA') {
            catIni = 'SIN_RAMA';
            const uSin = unidadesResueltas.find(esUnidadSinRama);
            const rSin = rolesResueltos.find(esRolSinRama) || rolesResueltos[0];
            if (uSin) unidadIni = String(uSin.id);
            if (rSin) rolIni = String(rSin.id);
          } else if (candidato.ramaSugerida) {
            catIni = 'RAMA';
            ramaIniId = candidato.ramaSugerida.id;
            if (candidato.unidadesDestino?.length > 0) {
              unidadIni = String(candidato.unidadesDestino[0].id);
            } else {
              const uRama = unidadesResueltas.find((u: any) => u.ramaId === ramaIniId);
              if (uRama) unidadIni = String(uRama.id);
            }
            const rProt = rolesResueltos.find(
              (r: any) => esRolDeProtagonista(r) && esRolRama(r),
            );
            if (rProt) rolIni = String(rProt.id);
          }
        } else {
          const uActual = unidadesResueltas.find((u: any) => u.id === asigUnidadId);
          if (uActual && esUnidadSinRama(uActual)) {
            catIni = 'SIN_RAMA';
            unidadIni = String(uActual.id);
            const rSin = asig?.rol?.id || rolesResueltos.find(esRolSinRama)?.id || rolesResueltos[0]?.id;
            if (rSin) rolIni = String(rSin);
          } else if (uActual && esUnidadJefatura(uActual)) {
            catIni = 'JEFATURA';
            unidadIni = String(uActual.id);
            const rJefe = asig?.rol?.id || rolesResueltos.find(esRolJefe)?.id || rolesResueltos[0]?.id;
            if (rJefe) rolIni = String(rJefe);
          } else {
            catIni = 'RAMA';
            let ramaTarget: any = null;
            if (uActual?.ramaId != null) {
              const idx = ramasResueltas.findIndex((r: any) => r.id === uActual.ramaId);
              if (idx >= 0 && idx + 1 < ramasResueltas.length) {
                ramaTarget = ramasResueltas[idx + 1];
              } else if (idx >= 0) {
                ramaTarget = ramasResueltas[idx];
              }
            }
            if (!ramaTarget && ramasResueltas.length > 0) {
              ramaTarget = ramasResueltas[0];
            }
            if (ramaTarget) {
              ramaIniId = ramaTarget.id;
              const uDest = unidadesResueltas.find((u: any) => u.ramaId === ramaTarget.id);
              if (uDest) unidadIni = String(uDest.id);
            }
            const eraEdu = esRolDeEducador(asig?.rol);
            const rolDef = eraEdu
              ? rolesResueltos.find((r: any) => esRolDeEducador(r) && esRolRama(r))
              : rolesResueltos.find((r: any) => esRolDeProtagonista(r) && esRolRama(r));
            if (rolDef) rolIni = String(rolDef.id);
          }
        }

        setCategoriaDestino(catIni);
        setRamaSeleccionadaId(ramaIniId);
        setUnidadDestinoId(unidadIni);
        setRolDestinoId(rolIni);
      } catch (err: any) {
        setAlerta({
          tipo: 'error',
          texto: traducirErrorAmigable(err, 'No se pudieron cargar los datos.'),
        });
      } finally {
        setCargando(false);
      }
    },
    [obtenerCatalogo],
  );

  useEffect(() => {
    // Limpiar el miembro anterior: si no, el header y la tira médica mostraban a la persona
    // previa mientras cargaba (o para siempre si la carga fallaba).
    usuarioIdEnCursoRef.current = usuarioId;
    setMiembro(null);
    setEstadoCuenta(null);
    setEntregas([]);
    setAlerta(null);
    setClaveTemporalGenerada(null);
    setEditandoFicha(false);
    setPlantillasAplicables([]);
    setPlantillaActiva(null);
    setSubVista(null);
    void cargarDatos(usuarioId);
  }, [usuarioId, cargarDatos]);

  // Limpieza ObjectURL PDF
  useEffect(() => {
    return () => {
      if (pdfPreviewUrl) {
        URL.revokeObjectURL(pdfPreviewUrl);
      }
    };
  }, [pdfPreviewUrl]);

  const cerrarVistaPreviaPdf = () => {
    if (pdfPreviewUrl) {
      URL.revokeObjectURL(pdfPreviewUrl);
      setPdfPreviewUrl(null);
    }
    datosPreviewVivoRef.current = undefined;
    if (subVista === 'pdf') setSubVista(null);
  };

  const handleGuardarDatos = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!miembro || guardOffline('guardar los datos del miembro')) return;
    setGuardando(true);
    setAlerta(null);

    try {
      const payload: Record<string, unknown> = {};
      if (puedeEditarIdentidad) {
        payload.nombre = formData.nombre.trim();
        payload.apellido = formData.apellido.trim();
        payload.dni = formData.dni.trim();
        payload.fechaNacimiento = formData.fechaNacimiento || undefined;
        payload.tipoMiembro = formData.tipoMiembro;
      }
      if (puedeDarBaja) payload.activo = formData.activo;
      if (puedeEditarContacto) {
        payload.emailContacto = formData.emailContacto.trim() || null;
        payload.telefonoContacto = formData.telefonoContacto.trim() || null;

        const datosFijosPrevios =
          miembro.datosFijosJson && typeof miembro.datosFijosJson === 'object'
            ? miembro.datosFijosJson
            : {};

        const camposEditados: Record<string, unknown> = {
          protagonista_telefono: formData.telefonoContacto.trim(),
          madre_nombres: formData.madreNombres.trim(),
          madre_telefono: formData.madreTelefono.trim(),
          padre_nombres: formData.padreNombres.trim(),
          padre_telefono: formData.padreTelefono.trim(),
          tutor_nombres: formData.tutorNombres.trim(),
          tutor_telefono: formData.tutorTelefono.trim(),
          domicilio: formData.domicilio.trim(),
          obra_social: formData.obraSocial.trim(),
          telefono_urgencias: formData.telefonoUrgencias.trim(),
          alergias: formData.alergias.trim(),
          sufre_alergia_detalle: formData.alergias.trim(),
          alergias_tipos: formData.alergiasTipos,
          sufre_alergia:
            formData.alergiasTipos.length > 0 || Boolean(formData.alergias.trim()),
          regimen_dietario_tipos: formData.regimenDietarioTipos,
          regimen_dietario_detalle: formData.regimenDietarioDetalle.trim(),
          regimen_dietario:
            formData.regimenDietarioTipos.length > 0 ||
            Boolean(formData.regimenDietarioDetalle.trim()),
        };

        // Solo reescribir datos médicos si el usuario los tocó: si no, guardar un teléfono
        // pisaba regimen_dietario/sufre_alergia (a veces texto con el detalle) con booleanos.
        const prev = datosFijosPrevios as Record<string, any>;
        const mismaLista = (a: unknown, b: unknown) =>
          JSON.stringify(Array.isArray(a) ? a : []) === JSON.stringify(Array.isArray(b) ? b : []);
        const dietaCambio =
          !mismaLista(formData.regimenDietarioTipos, prev.regimen_dietario_tipos) ||
          formData.regimenDietarioDetalle.trim() !==
            String(prev.regimen_dietario_detalle || prev.dieta_especial_detalle || '').trim();
        const alergiaCambio =
          !mismaLista(formData.alergiasTipos, prev.alergias_tipos) ||
          formData.alergias.trim() !==
            String(prev.sufre_alergia_detalle || prev.alergias || '').trim();
        if (!dietaCambio) {
          delete camposEditados.regimen_dietario_tipos;
          delete camposEditados.regimen_dietario_detalle;
          delete camposEditados.regimen_dietario;
        }
        if (!alergiaCambio) {
          delete camposEditados.alergias;
          delete camposEditados.sufre_alergia_detalle;
          delete camposEditados.alergias_tipos;
          delete camposEditados.sufre_alergia;
        }

        const datosFijosMergeados: Record<string, any> = { ...datosFijosPrevios };
        for (const [k, v] of Object.entries(camposEditados)) {
          if (
            typeof v === 'boolean' ||
            Array.isArray(v) ||
            v !== '' ||
            datosFijosPrevios[k] !== undefined
          ) {
            datosFijosMergeados[k] = v;
          }
        }
        payload.datosFijosJson = datosFijosMergeados;
      }

      await api.patch(`/miembros/${miembro.id}`, payload);
      setAlerta({ tipo: 'exito', texto: 'Datos guardados.' });
      onActualizado?.();
      void cargarDatos(miembro.id);
    } catch (err: any) {
      setAlerta({
        tipo: 'error',
        texto: traducirErrorAmigable(err, 'No se pudieron guardar los datos.'),
      });
    } finally {
      setGuardando(false);
    }
  };

  const puedeEliminarDefinitivo = Boolean(
    miembro && !miembro.activo && tieneBajaGlobal && miembro.id !== usuarioActual?.id,
  );

  const handleEjecutarEliminarDefinitivo = async (miembroObjetivo: any, forzarFichas = false) => {
    if (guardOffline('eliminar definitivamente al miembro')) return;
    setEliminandoDefinitivo(true);
    setConfirmInline((prev) => (prev ? { ...prev, cargando: true } : null));
    try {
      const res = await api.delete(`/miembros/${miembroObjetivo.id}`, {
        params: forzarFichas ? { forzarFichas: true } : undefined,
      });
      const msg =
        res.data?.mensaje ||
        `Miembro "${miembroObjetivo.nombre} ${miembroObjetivo.apellido}" eliminado definitivamente.`;
      setConfirmInline(null);
      setSubVista(null);
      if (onEliminado) {
        onEliminado(msg);
      } else {
        mostrarToast(msg, 'exito');
        onActualizado?.();
      }
      onCerrar?.();
    } catch (err: any) {
      if (err?.response?.status === 409) {
        const msg =
          err.response?.data?.message ||
          'No se puede eliminar definitivamente porque posee historial asociado.';
        const puedeForzarFichas = Boolean(err.response?.data?.puedeForzarFichas) && !forzarFichas;
        if (puedeForzarFichas) {
          setConfirmInline({
            tipo: 'peligro',
            titulo: 'El miembro posee fichas médicas emitidas o validadas',
            mensaje: `${msg}\n\nSi deseas eliminar este registro (por ejemplo, una cuenta de prueba), puedes forzar la eliminación definitiva borrando también sus fichas médicas. Esta acción es irreversible.`,
            textoConfirmar: 'Sí, eliminar con sus fichas médicas',
            textoCancelar: 'Cancelar',
            cargando: false,
            onConfirmar: () => handleEjecutarEliminarDefinitivo(miembroObjetivo, true),
          });
        } else {
          setConfirmInline({
            tipo: 'alerta',
            titulo: 'No se puede eliminar definitivamente',
            mensaje: `${msg}\n\nPara proteger el legajo histórico y la integridad contable del Grupo, este miembro debe permanecer dado de baja.`,
            textoConfirmar: 'Entendido',
            textoCancelar: null,
            cargando: false,
            onConfirmar: () => {
              setConfirmInline(null);
              setSubVista(null);
            },
          });
        }
      } else {
        setConfirmInline(null);
        setSubVista(null);
        setAlerta({
          tipo: 'error',
          texto: traducirErrorAmigable(err, 'No se pudo eliminar definitivamente el miembro.'),
        });
      }
    } finally {
      setEliminandoDefinitivo(false);
    }
  };

  const handleSolicitarEliminarDefinitivo = () => {
    if (!miembro || !puedeEliminarDefinitivo) return;
    if (guardOffline('eliminar el miembro')) return;
    setConfirmInline({
      tipo: 'peligro',
      titulo: `Eliminar definitivamente a ${miembro.nombre} ${miembro.apellido}`,
      mensaje: `¿Estás seguro de que deseas eliminar permanentemente a ${miembro.nombre} ${miembro.apellido} (DNI ${miembro.dni})?\n\nEsta acción es irreversible y solo se completará si no posee historial contable, pagos, cargos activos ni fichas médicas emitidas o validadas.`,
      textoConfirmar: 'Eliminar definitivamente',
      textoCancelar: 'Cancelar',
      cargando: false,
      onConfirmar: () => handleEjecutarEliminarDefinitivo(miembro),
    });
    setSubVista('confirmar');
  };

  const handleDesvincularRapido = async (targetUserId: number, targetNombre: string) => {
    if (!miembro || guardOffline('desvincular del grupo familiar')) return;
    setDesvinculandoMiembroId(targetUserId);
    setAlerta(null);
    try {
      await api.post('/tesoreria/familias/desvincular-hermano', { usuarioId: targetUserId });
      setAlerta({
        tipo: 'exito',
        texto: `${targetNombre} fue eliminado del grupo familiar.`,
      });
      onActualizado?.();
      await cargarDatos(miembro.id);
    } catch (err: any) {
      setAlerta({
        tipo: 'error',
        texto: traducirErrorAmigable(err, 'No se pudo eliminar del grupo familiar.'),
      });
    } finally {
      setDesvinculandoMiembroId(null);
    }
  };

  const handleCambioCategoria = (cat: 'RAMA' | 'SIN_RAMA' | 'JEFATURA') => {
    setCategoriaDestino(cat);
    if (cat === 'SIN_RAMA') {
      setRamaSeleccionadaId(null);
      const u = unidades.find(esUnidadSinRama) || unidades.find((x) => !esUnidadRama(x));
      const r = roles.find(esRolSinRama) || roles[0];
      if (u) setUnidadDestinoId(String(u.id));
      if (r) setRolDestinoId(String(r.id));
    } else if (cat === 'JEFATURA') {
      setRamaSeleccionadaId(null);
      const u = unidades.find(esUnidadJefatura) || unidades.find((x) => !esUnidadRama(x));
      const r = roles.find(esRolJefe) || roles[0];
      if (u) setUnidadDestinoId(String(u.id));
      if (r) setRolDestinoId(String(r.id));
    } else if (cat === 'RAMA') {
      let targetRamaId = ramaSeleccionadaId;
      if (!targetRamaId || !ramas.some((r) => r.id === targetRamaId)) {
        if (candidatoPase?.ramaSugerida?.id) {
          targetRamaId = candidatoPase.ramaSugerida.id;
        } else if (ramas.length > 0) {
          targetRamaId = ramas[0].id;
        }
      }
      setRamaSeleccionadaId(targetRamaId || null);

      if (targetRamaId) {
        const units = unidades.filter((u) => u.ramaId === targetRamaId && esUnidadRama(u));
        const candUnit = candidatoPase?.unidadesDestino?.find((cu: any) =>
          units.some((u) => u.id === cu.id),
        );
        if (candUnit) {
          setUnidadDestinoId(String(candUnit.id));
        } else if (units.length > 0) {
          setUnidadDestinoId(String(units[0].id));
        }
      }

      const currentRol = roles.find((r) => r.id === Number(rolDestinoId));
      if (!currentRol || !esRolRama(currentRol) || (esEgreso && !esRolDeEducador(currentRol))) {
        const asig = asignacionPrincipal;
        const eraEdu = esRolDeEducador(asig?.rol);
        const rolDefecto =
          eraEdu || esEgreso
            ? roles.find((r) => esRolDeEducador(r) && esRolRama(r))
            : roles.find((r) => esRolDeProtagonista(r) && esRolRama(r));
        if (rolDefecto) setRolDestinoId(String(rolDefecto.id));
      }
    }
  };

  const handleSeleccionarRama = (rama: any) => {
    setRamaSeleccionadaId(rama.id);
    const units = unidades.filter((u) => u.ramaId === rama.id && esUnidadRama(u));
    const candUnit = candidatoPase?.unidadesDestino?.find((cu: any) =>
      units.some((u) => u.id === cu.id),
    );
    if (candUnit) {
      setUnidadDestinoId(String(candUnit.id));
    } else if (units.length > 0) {
      setUnidadDestinoId(String(units[0].id));
    }

    const currentRol = roles.find((r) => r.id === Number(rolDestinoId));
    if (!currentRol || !esRolRama(currentRol) || (esEgreso && !esRolDeEducador(currentRol))) {
      const asig = asignacionPrincipal;
      const eraEdu = esRolDeEducador(asig?.rol);
      const rolDefecto =
        eraEdu || esEgreso
          ? roles.find((r) => esRolDeEducador(r) && esRolRama(r))
          : roles.find((r) => esRolDeProtagonista(r) && esRolRama(r));
      if (rolDefecto) setRolDestinoId(String(rolDefecto.id));
    }
  };

  const handleEjecutarPase = async () => {
    if (!asignacionPrincipal || (!unidadDestinoId && !rolDestinoId)) return;
    if (guardOffline('ejecutar el pase de rama')) return;
    const destinoUnidad = unidades.find((u) => u.id === Number(unidadDestinoId));
    const destinoRol = roles.find((r) => r.id === Number(rolDestinoId));
    const nombreDestino = destinoUnidad?.nombre || destinoRol?.nombre || 'la nueva función';

    setEjecutandoPase(true);
    setAlerta(null);
    try {
      const resPase = await api.post('/pases', {
        asignacionOrigenId: asignacionPrincipal.id,
        unidadDestinoId: unidadDestinoId ? Number(unidadDestinoId) : undefined,
        rolDestinoId: rolDestinoId ? Number(rolDestinoId) : undefined,
      });

      setAlerta({
        tipo: 'exito',
        texto: resPase.data?.pendienteAprobacion
          ? `Solicitud de pase a ${nombreDestino} enviada para confirmación de la sección receptora.`
          : `Pase / cambio de rol a ${nombreDestino} realizado.`,
      });
      await refrescarSesionDesdeServidor();
      onActualizado?.();
      void cargarDatos(miembro.id);
    } catch (err: any) {
      setAlerta({
        tipo: 'error',
        texto: traducirErrorAmigable(err, 'No se pudo realizar el pase.'),
      });
    } finally {
      setEjecutandoPase(false);
    }
  };

  const handleAgregarAsignacion = async (datos: { rolId: number; unidadId?: number }) => {
    if (!miembro || guardOffline('asignar un rol adicional')) return;
    setEjecutandoPase(true);
    setAlerta(null);
    try {
      await api.post(`/miembros/${miembro.id}/asignaciones`, datos);
      setAlerta({
        tipo: 'exito',
        texto: 'Rol adicional asignado correctamente al miembro.',
      });
      await refrescarSesionDesdeServidor();
      onActualizado?.();
      void cargarDatos(miembro.id);
    } catch (err: any) {
      setAlerta({
        tipo: 'error',
        texto: traducirErrorAmigable(err, 'No se pudo asignar el rol adicional.'),
      });
    } finally {
      setEjecutandoPase(false);
    }
  };

  const handleCerrarAsignacion = async (asigId: number) => {
    if (!miembro || guardOffline('finalizar la asignación')) return;
    setEjecutandoPase(true);
    setAlerta(null);
    try {
      await api.delete(`/miembros/${miembro.id}/asignaciones/${asigId}`);
      setAlerta({
        tipo: 'exito',
        texto: 'Asignación de rol finalizada.',
      });
      await refrescarSesionDesdeServidor();
      onActualizado?.();
      void cargarDatos(miembro.id);
    } catch (err: any) {
      setAlerta({
        tipo: 'error',
        texto: traducirErrorAmigable(err, 'No se pudo finalizar la asignación.'),
      });
    } finally {
      setEjecutandoPase(false);
    }
  };

  const handleResetClave = (soloPorCorreo = false) => {
    if (!miembro || guardOffline('restablecer la contraseña')) return;
    setConfirmInline({
      tipo: 'peligro',
      titulo: soloPorCorreo ? 'Enviar Contraseña Solo por Correo' : 'Restablecer Contraseña',
      mensaje: soloPorCorreo
        ? `Se generará una nueva contraseña temporal para ${miembro.nombre} ${miembro.apellido}, se enviará únicamente a ${miembro.emailContacto || 'su correo'} (sin mostrarla en pantalla) y se revocarán sus sesiones activas.`
        : `Se generará una nueva contraseña temporal para ${miembro.nombre} ${miembro.apellido} y se revocarán sus sesiones activas.`,
      textoConfirmar: soloPorCorreo ? 'Enviar por correo' : 'Generar contraseña temporal',
      textoCancelar: 'Cancelar',
      cargando: false,
      onConfirmar: async () => {
        setReseteandoClave(true);
        setConfirmInline((prev) => (prev ? { ...prev, cargando: true } : null));
        setAlerta(null);
        try {
          const res = await api.post(`/auth/usuarios/${miembro.id}/resetear-clave`, {
            soloPorCorreo,
          });
          const claveTemporal: string | undefined = res.data?.claveTemporal;
          const emailEnviado = Boolean(res.data?.emailEnviado);
          const emailDestino: string | undefined = res.data?.emailDestino;
          setClaveTemporalGenerada(claveTemporal ?? null);
          setConfirmInline(null);
          setSubVista(null);
          const detalleEmail = emailEnviado
            ? ` Se envió por correo a ${emailDestino}.`
            : emailDestino
              ? ' No se pudo enviar por correo; compartila manualmente.'
              : ' El miembro no tiene email registrado; compartila manualmente.';
          setAlerta({
            tipo: 'exito',
            texto: claveTemporal
              ? `Nueva contraseña temporal generada (se muestra en la sección Contraseña).${detalleEmail}`
              : res.data?.mensaje ||
                (emailDestino
                  ? `Se generó una nueva contraseña temporal y se envió únicamente por correo a ${emailDestino}.`
                  : 'Se generó una nueva contraseña temporal.'),
          });
          onClaveReseteada?.(res.data?.mensaje || 'Contraseña restablecida.');
          void cargarDatos(miembro.id);
        } catch (err: any) {
          setConfirmInline(null);
          setSubVista(null);
          setAlerta({
            tipo: 'error',
            texto: traducirErrorAmigable(err, 'No se pudo restablecer la contraseña.'),
          });
        } finally {
          setReseteandoClave(false);
        }
      },
    });
    setSubVista('confirmar');
  };

  const handleAnularCargo = (cargo: any) => {
    if (guardOffline('anular la cuota')) return;
    const conceptoNombre = cargo.concepto?.nombre || 'Cuota';
    const pagado = Number(cargo.montoPagado ?? 0);
    const mensajeDetalle =
      pagado > 0
        ? `¿Seguro que quieres anular "${conceptoNombre}"? Los ${formatearMoneda(pagado)} que ya estaban abonados pasarán automáticamente al Saldo a Favor del miembro.`
        : `¿Seguro que quieres anular "${conceptoNombre}"? Ya no figurará como deuda (podrás reactivarla cuando quieras desde Cuotas Anuladas).`;

    setConfirmInline({
      tipo: 'peligro',
      titulo: 'Anular Cuota',
      mensaje: mensajeDetalle,
      textoConfirmar: 'Sí, anular cuota',
      textoCancelar: 'Cancelar',
      cargando: false,
      onConfirmar: async () => {
        setConfirmInline((prev) => (prev ? { ...prev, cargando: true } : null));
        try {
          const res = await api.post(`/tesoreria/cargos/${cargo.id}/anular`);
          setConfirmInline(null);
          setSubVista(null);
          setAlerta({
            tipo: 'exito',
            texto: res.data?.mensaje || `"${conceptoNombre}" fue anulada.`,
          });
          void cargarDatos(usuarioId);
          onActualizado?.();
        } catch (err: any) {
          setConfirmInline(null);
          setSubVista(null);
          setAlerta({
            tipo: 'error',
            texto: traducirErrorAmigable(err, 'No se pudo anular el cargo.'),
          });
        }
      },
    });
    setSubVista('confirmar');
  };

  const handleReactivarCargo = async (cargoId: number, conceptoNombre: string) => {
    if (guardOffline('reactivar la cuota')) return;
    setProcesandoAccionCuota(true);
    setAlerta(null);
    try {
      await api.post(`/tesoreria/cargos/${cargoId}/reactivar`);
      setAlerta({ tipo: 'exito', texto: `"${conceptoNombre}" reactivada.` });
      void cargarDatos(usuarioId);
      onActualizado?.();
    } catch (err: any) {
      setAlerta({
        tipo: 'error',
        texto: traducirErrorAmigable(err, 'No se pudo reactivar la cuota.'),
      });
    } finally {
      setProcesandoAccionCuota(false);
    }
  };

  const handleEliminarCargoDefinitivo = (cargoId: number, conceptoNombre: string) => {
    if (guardOffline('eliminar el cargo')) return;
    setConfirmInline({
      tipo: 'peligro',
      titulo: 'Eliminar Cuota Definitivamente',
      mensaje: `¿Seguro que quieres borrar para siempre "${conceptoNombre}"?`,
      textoConfirmar: 'Eliminar definitivamente',
      textoCancelar: 'Cancelar',
      cargando: false,
      onConfirmar: async () => {
        setConfirmInline((prev) => (prev ? { ...prev, cargando: true } : null));
        try {
          await api.delete(`/tesoreria/cargos/${cargoId}`);
          setConfirmInline(null);
          setSubVista(null);
          setAlerta({ tipo: 'exito', texto: `"${conceptoNombre}" eliminada.` });
          void cargarDatos(usuarioId);
          onActualizado?.();
        } catch (err: any) {
          setConfirmInline(null);
          setSubVista(null);
          setAlerta({
            tipo: 'error',
            texto: traducirErrorAmigable(err, 'No se pudo eliminar el cargo.'),
          });
        }
      },
    });
    setSubVista('confirmar');
  };

  const handleIniciarEdicionCargo = (c: any) => {
    setCargoEditando({
      id: c.id,
      nombreConcepto: c.concepto?.nombre || '',
      esIndividual: c.concepto?.destinatarioTipo === 'INDIVIDUAL',
      montoOriginal: String(Number(c.montoOriginal ?? c.montoFinal ?? 0)),
      montoDescuento: String(Number(c.montoDescuento ?? 0)),
      fechaVencimiento: c.concepto?.fechaVencimiento
        ? String(c.concepto.fechaVencimiento).split('T')[0]
        : '',
    });
  };

  const handleGuardarEdicionCargo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cargoEditando || guardOffline('actualizar la cuota')) return;
    const montoOriginalNum = Number(cargoEditando.montoOriginal);
    const montoDescuentoNum = Number(cargoEditando.montoDescuento || 0);
    if (!Number.isFinite(montoOriginalNum) || montoOriginalNum < 0) {
      setAlerta({ tipo: 'error', texto: 'El monto original debe ser un número mayor o igual a 0.' });
      return;
    }
    if (!Number.isFinite(montoDescuentoNum) || montoDescuentoNum < 0) {
      setAlerta({ tipo: 'error', texto: 'El descuento no puede ser negativo.' });
      return;
    }
    if (montoDescuentoNum > montoOriginalNum) {
      setAlerta({
        tipo: 'error',
        texto: 'El descuento no puede superar el monto original de la cuota.',
      });
      return;
    }

    setProcesandoAccionCuota(true);
    setAlerta(null);
    try {
      const payload: any = {
        montoOriginal: montoOriginalNum,
        montoDescuento: montoDescuentoNum,
      };
      if (cargoEditando.esIndividual) {
        payload.nombreConcepto = cargoEditando.nombreConcepto.trim();
        payload.fechaVencimiento = cargoEditando.fechaVencimiento || null;
      }
      const res = await api.patch(`/tesoreria/cargos/${cargoEditando.id}`, payload);
      const exc = Number(res.data?.excedenteAcreditado ?? 0);
      setCargoEditando(null);
      setAlerta({
        tipo: 'exito',
        texto:
          exc > 0
            ? `Cuota actualizada. Se acreditaron ${formatearMoneda(exc)} a Saldo a Favor.`
            : 'Cuota actualizada.',
      });
      void cargarDatos(usuarioId);
      onActualizado?.();
    } catch (err: any) {
      setAlerta({
        tipo: 'error',
        texto: traducirErrorAmigable(err, 'No se pudo actualizar la cuota.'),
      });
    } finally {
      setProcesandoAccionCuota(false);
    }
  };

  const handleRevertirPago = (pago: any) => {
    if (guardOffline('revertir el pago')) return;
    setConfirmInline({
      tipo: 'peligro',
      titulo: 'Revertir / Anular Pago',
      mensaje: `¿Seguro que quieres revertir este pago de ${formatearMoneda(pago.montoTotal)}? Las cuotas volverán a quedar pendientes por ese importe y se ajustará el saldo a favor correspondiente.`,
      textoConfirmar: 'Sí, revertir pago',
      textoCancelar: 'Cancelar',
      cargando: false,
      onConfirmar: async () => {
        setConfirmInline((prev) => (prev ? { ...prev, cargando: true } : null));
        try {
          const res = await api.delete(`/tesoreria/pagos/${pago.id}`);
          setConfirmInline(null);
          setSubVista(null);
          setAlerta({
            tipo: 'exito',
            texto: res.data?.mensaje || 'Pago revertido correctamente.',
          });
          void cargarDatos(usuarioId);
          onActualizado?.();
        } catch (err: any) {
          setConfirmInline(null);
          setSubVista(null);
          setAlerta({
            tipo: 'error',
            texto: traducirErrorAmigable(err, 'No se pudo revertir el pago.'),
          });
        }
      },
    });
    setSubVista('confirmar');
  };

  const handleGuardarEdicionPago = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pagoEditando || guardOffline('editar el pago')) return;
    setProcesandoAccionCuota(true);
    setAlerta(null);
    try {
      await api.patch(`/tesoreria/pagos/${pagoEditando.id}`, {
        metodoPago: pagoEditando.metodoPago,
        referenciaComprobante: pagoEditando.referenciaComprobante.trim() || null,
        observaciones: pagoEditando.observaciones.trim() || null,
      });
      setPagoEditando(null);
      setAlerta({ tipo: 'exito', texto: 'Datos del pago actualizados.' });
      void cargarDatos(usuarioId);
      onActualizado?.();
    } catch (err: any) {
      setAlerta({
        tipo: 'error',
        texto: traducirErrorAmigable(err, 'No se pudo editar el pago.'),
      });
    } finally {
      setProcesandoAccionCuota(false);
    }
  };

  const handleGuardarAjusteSaldo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!miembro || montoAjusteSaldo === '' || guardOffline('ajustar el saldo a favor')) return;
    setProcesandoAccionCuota(true);
    setAlerta(null);
    try {
      const res = await api.post('/tesoreria/saldo-a-favor/ajustar', {
        usuarioId: miembro.id,
        tipoAjuste: tipoAjusteSaldo,
        monto: Number(montoAjusteSaldo),
        motivo: motivoAjusteSaldo.trim() || undefined,
      });
      setAjustandoSaldo(false);
      setMontoAjusteSaldo('');
      setMotivoAjusteSaldo('');
      setAlerta({
        tipo: 'exito',
        texto: res.data?.mensaje || 'Saldo a favor actualizado.',
      });
      void cargarDatos(miembro.id);
      onActualizado?.();
    } catch (err: any) {
      setAlerta({
        tipo: 'error',
        texto: traducirErrorAmigable(err, 'No se pudo ajustar el saldo a favor.'),
      });
    } finally {
      setProcesandoAccionCuota(false);
    }
  };

  const handleValidarFisicoDirecto = async (entrega: any) => {
    if (guardOffline('validar la entrega física')) return;
    setValidandoFichaId(entrega.id);
    setAlerta(null);
    try {
      await api.post(`/legajos/qr/validar/${entrega.hashVerificacion}`);
      setAlerta({
        tipo: 'exito',
        texto: 'Papel firmado registrado como recibido.',
      });
      onActualizado?.();
      void cargarDatos(miembro.id);
    } catch (err: any) {
      setAlerta({
        tipo: 'error',
        texto: traducirErrorAmigable(err, 'No se pudo validar la ficha.'),
      });
    } finally {
      setValidandoFichaId(null);
    }
  };

  const obtenerPlantillaActiva = async (target = miembro) => {
    if (plantillaActiva) return plantillaActiva;
    try {
      const res = await api.get(`/legajos/plantillas?cicloAnio=${obtenerCicloAnioActual()}`);
      let lista = Array.isArray(res.data) ? res.data : [];
      if (lista.length === 0) {
        const resTodas = await api.get('/legajos/plantillas').catch(() => ({ data: [] }));
        lista = Array.isArray(resTodas.data) ? resTodas.data : [];
      }
      const p = seleccionarPlantillaPorMiembro(lista, target) || lista[0] || null;
      setPlantillaActiva(p);
      return p;
    } catch {
      return null;
    }
  };

  const generarBytesPdfMiembro = async (
    ent?: any,
    respuestasCustom?: Record<string, unknown>,
  ): Promise<Uint8Array> => {
    const plantilla =
      (ent?.plantillaId
        ? plantillasAplicables.find((p) => p.id === ent.plantillaId)
        : null) ||
      plantillaActiva ||
      (await obtenerPlantillaActiva(miembro));
    const mapeo: MapeoPdf = plantilla?.mapeoPdfJson || { pdfBaseUrl: '', campos: {} };
    const ramaNombre = obtenerRolPrincipal(miembro)?.unidad?.nombre || '';
    const respuestasBase =
      respuestasCustom ||
      ent?.respuestasSnapshotJson || {
        protagonista_telefono: miembro.telefonoContacto || '',
        protagonista_domicilio: miembro.datosFijosJson?.domicilio || '',
        ...(miembro.datosFijosJson || {}),
      };

    return await generarFichaPdf(
      mapeo,
      respuestasBase,
      ent?.hashVerificacion || `FICHA-${miembro.dni}-${obtenerCicloAnioActual()}`,
      {
        nombre: miembro.nombre,
        apellido: miembro.apellido,
        dni: miembro.dni,
        fechaNacimiento: miembro.fechaNacimiento,
        ramaNombre,
        telefonoContacto: miembro.telefonoContacto,
      },
      ent?.versionImpresion || 1,
      plantilla?.esquemaCamposJson,
    );
  };

  const handleVerPdfEducador = async (
    ent?: any,
    respuestasCustom?: Record<string, unknown>,
  ) => {
    if (!miembro) return;
    setGenerandoVistaPrevia(true);
    setAlerta(null);
    try {
      datosPreviewVivoRef.current = respuestasCustom;
      const pdfBytes = await generarBytesPdfMiembro(ent, respuestasCustom);
      if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
      setPdfPreviewUrl(crearUrlPdfBlob(pdfBytes));
      setSubVista('pdf');
    } catch (err) {
      setAlerta({
        tipo: 'error',
        texto: traducirErrorAmigable(err, 'No se pudo previsualizar el PDF.'),
      });
    } finally {
      setGenerandoVistaPrevia(false);
    }
  };

  const handleDescargarPdfEducador = async (
    ent?: any,
    respuestasCustom?: Record<string, unknown>,
  ) => {
    if (!miembro) return;
    setDescargandoPdfId(ent?.id ?? -1);
    try {
      const pdfBytes = await generarBytesPdfMiembro(ent, respuestasCustom);
      descargarPdfBlob(pdfBytes, `Ficha_${miembro.apellido}_${miembro.nombre}.pdf`);
      setAlerta({ tipo: 'exito', texto: 'PDF descargado.' });
    } catch (err) {
      setAlerta({
        tipo: 'error',
        texto: traducirErrorAmigable(err, 'No se pudo generar el PDF.'),
      });
    } finally {
      setDescargandoPdfId(null);
    }
  };

  const handleAbrirEditorFicha = async () => {
    if (!miembro || guardOffline('cargar el editor de ficha')) return;
    setCargandoFichaEditor(true);
    setAlerta(null);
    try {
      const p = await obtenerPlantillaActiva(miembro);
      if (!p) {
        setAlerta({ tipo: 'error', texto: 'No hay formulario activo configurado.' });
        return;
      }
      const resPrecarga = await api.get(
        `/legajos/miembro/${miembro.id}/plantilla/${p.id}/precarga?cicloAnio=${p.cicloAnio || obtenerCicloAnioActual()}`,
      );
      setPrecargaFicha(resPrecarga.data);
      setEditandoFicha(true);
    } catch (err) {
      setAlerta({
        tipo: 'error',
        texto: traducirErrorAmigable(err, 'No se pudo abrir el formulario.'),
      });
    } finally {
      setCargandoFichaEditor(false);
    }
  };

  const handleGuardarFichaEducador = async (
    datos: Record<string, unknown>,
    finalizarParaFirma: boolean,
  ) => {
    if (!miembro || !plantillaActiva || guardOffline('guardar la ficha')) return;
    setGuardando(true);
    setAlerta(null);
    try {
      const res = await api.post('/legajos/entregas', {
        usuarioId: miembro.id,
        plantillaId: plantillaActiva.id,
        cicloAnio: plantillaActiva.cicloAnio || obtenerCicloAnioActual(),
        respuestas: datos,
        finalizarParaFirma,
        actualizarDatosFijos: true,
      });

      const entrega = res.data;
      if (finalizarParaFirma && entrega.hashVerificacion) {
        const ramaNombre = obtenerRolPrincipal(miembro)?.unidad?.nombre || '';
        const pdfBytes = await generarFichaPdf(
          plantillaActiva.mapeoPdfJson || { pdfBaseUrl: '', campos: {} },
          datos,
          entrega.hashVerificacion,
          {
            nombre: miembro.nombre,
            apellido: miembro.apellido,
            dni: miembro.dni,
            fechaNacimiento: miembro.fechaNacimiento,
            ramaNombre,
            telefonoContacto: miembro.telefonoContacto,
          },
          entrega.versionImpresion,
          plantillaActiva.esquemaCamposJson,
        );
        descargarPdfBlob(pdfBytes, `Ficha_${miembro.apellido}_${miembro.nombre}.pdf`);
        setAlerta({ tipo: 'exito', texto: 'Ficha guardada y PDF descargado.' });
        setEditandoFicha(false);
      } else {
        setAlerta({ tipo: 'exito', texto: 'Avance de ficha guardado.' });
      }

      onActualizado?.();
      void cargarDatos(miembro.id, { silencioso: true });
    } catch (err) {
      setAlerta({
        tipo: 'error',
        texto: traducirErrorAmigable(err, 'No se pudo guardar la ficha.'),
      });
      throw err;
    } finally {
      setGuardando(false);
    }
  };

  const saldoPendiente = Number(estadoCuenta?.resumen?.saldoPendiente ?? 0);
  const saldoAFavor = Number(estadoCuenta?.resumen?.saldoAFavor ?? 0);
  const cfgRama = miembro ? obtenerConfigRama(miembro, unidades) : null;
  const infoMedica = useMemo(
    () => (miembro ? extraerInfoMedicaMiembro(miembro, entregas, plantillasAplicables) : null),
    [miembro, entregas, plantillasAplicables],
  );

  const tabsItems = useMemo<SegmentedTabItem<TabExpediente360>[]>(() => {
    const items: SegmentedTabItem<TabExpediente360>[] = [
      { id: 'datos', label: 'Datos', icon: <User className="w-3.5 h-3.5" /> },
    ];
    if (puedeVerCuotas) {
      items.push({
        id: 'cuotas',
        label: 'Cuotas',
        icon: <CreditCard className="w-3.5 h-3.5" />,
        badge: saldoPendiente > 0 ? formatearMoneda(saldoPendiente) : undefined,
      });
    }
    if (puedeVerFicha) {
      items.push({
        id: 'ficha',
        label: 'Ficha',
        icon: <FileCheck2 className="w-3.5 h-3.5" />,
      });
    }
    if (puedeHacerPases) {
      items.push({
        id: 'pase',
        label: 'Pase',
        icon: <ArrowRightLeft className="w-3.5 h-3.5" />,
        badge: candidatoPase ? 'Sugerido' : undefined,
      });
    }
    if (puedeResetearClave) {
      items.push({
        id: 'seguridad',
        label: 'Contraseña',
        icon: <KeyRound className="w-3.5 h-3.5" />,
      });
    }
    return items;
  }, [
    puedeVerCuotas,
    puedeVerFicha,
    puedeHacerPases,
    puedeResetearClave,
    saldoPendiente,
    candidatoPase,
  ]);

  // La pestaña pedida (URL o prop) solo se muestra si el usuario tiene permiso para verla;
  // si no, cae en "Datos" (evita ver acciones con ?tab=seguridad|pase|cuotas sin permiso).
  const tabVisible: TabExpediente360 = tabsItems.some((t) => t.id === tab) ? tab : 'datos';

  const titulosSubVista: Record<Exclude<SubVistaExpediente, null>, string> = {
    cobrar: 'Registrar Cobro',
    'nuevo-cargo': 'Generar Cargo Individual',
    'editar-familia': 'Descuento y Grupo Familiar',
    'vincular-hermano': 'Vincular con Hermano / Familia',
    llamar: 'Contactos de Emergencia',
    pdf: `Ficha Médica · ${miembro?.apellido || ''}, ${miembro?.nombre || ''}`,
    confirmar: confirmInline?.titulo || 'Confirmar Acción',
  };

  return (
    <div className="space-y-4 text-ink min-w-0">
      {/* Cabecera Identidad del Expediente */}
      <div className="s-panel rounded-2xl p-4 sm:p-5 flex items-start justify-between gap-3.5 min-w-0">
        <div className="flex items-center gap-3.5 min-w-0">
          <div
            className={`w-12 h-12 rounded-2xl flex items-center justify-center font-extrabold text-base shrink-0 ${
              !miembro?.activo
                ? 'bg-paper-3 text-ink-muted'
                : cfgRama?.avatarClases ||
                  (esEducador ? 'bg-paper-3 text-brand' : 'bg-brand text-brand-contrast')
            }`}
          >
            {miembro ? `${miembro.nombre?.[0] || ''}${miembro.apellido?.[0] || ''}` : '…'}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg sm:text-xl font-extrabold text-ink truncate">
                {miembro ? `${miembro.apellido}, ${miembro.nombre}` : 'Cargando…'}
              </h2>
              {miembro && !miembro.activo && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold s-badge-info whitespace-nowrap shrink-0">
                  Baja
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap mt-1">
              <span className="text-[13px] text-ink-muted">
                DNI {miembro?.dni || '—'} · {calcularEdad(miembro?.fechaNacimiento) ?? '—'} años
              </span>
              {asignacionPrincipal && (
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full s-badge-brand whitespace-nowrap shrink-0">
                  {asignacionPrincipal.rol?.nombre} ({asignacionPrincipal.unidad?.nombre})
                </span>
              )}
              {rolesSecundarios.map((sec: any) => (
                <span
                  key={sec.id}
                  className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-paper-3 text-ink-2 border border-rule whitespace-nowrap shrink-0"
                >
                  +{sec.rol?.nombre} ({sec.unidad?.nombre || 'Global'})
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {miembro && (
            <BotonLlamarMiembro
              miembro={miembro}
              entrega={entregas?.[0]}
              onAbrirCustom={(telefonos) => {
                setTelefonosInline(telefonos);
                setSubVista('llamar');
              }}
              className="s-btn-sec min-h-[42px] min-w-[42px] px-3 rounded-xl inline-flex items-center justify-center gap-1.5 cursor-pointer"
            />
          )}
          {mostrarBotonCerrar && onCerrar && (
            <button
              type="button"
              onClick={onCerrar}
              aria-label="Cerrar"
              className="s-btn-sec min-w-[42px] min-h-[42px] rounded-xl inline-flex items-center justify-center cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Tira de Seguridad Vital fija arriba */}
      {miembro && infoMedica && puedeVerFicha && (
        <div
          className={`rounded-2xl p-3.5 sm:p-4 border text-[13px] space-y-2 ${
            infoMedica.criticasCount > 0
              ? 's-badge-err'
              : infoMedica.tieneAlertas
                ? 's-badge-warn'
                : 's-panel'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-extrabold">
              <HeartPulse className="w-4 h-4 shrink-0" />
              <span>Seguridad Vital</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap text-xs">
              {infoMedica.grupoSanguineo && (
                <span className="px-2.5 py-0.5 rounded-md bg-surface/80 border border-rule font-bold text-ink">
                  Grupo {infoMedica.grupoSanguineo}
                </span>
              )}
              {infoMedica.obraSocial && (
                <span className="px-2.5 py-0.5 rounded-md bg-surface/80 border border-rule font-semibold text-ink">
                  {infoMedica.obraSocial}
                  {infoMedica.afiliadoObraSocial ? ` (${infoMedica.afiliadoObraSocial})` : ''}
                </span>
              )}
              {!infoMedica.grupoSanguineo && !infoMedica.obraSocial && !infoMedica.tieneAlertas && (
                <span className="text-ink-muted font-medium">
                  {entregasNoDisponibles
                    ? 'No se pudo consultar la ficha médica: no asumas que no hay alertas.'
                    : 'Sin alertas médicas declaradas'}
                </span>
              )}
            </div>
          </div>

          {infoMedica.tieneAlertas && (
            <div className="flex flex-wrap gap-1.5">
              {infoMedica.alertas.map((al) => (
                <span
                  key={al.id}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface/85 border border-rule text-xs font-bold text-ink"
                >
                  <AlertTriangle
                    className={`w-3.5 h-3.5 shrink-0 ${
                      al.critico ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600'
                    }`}
                  />
                  <span>
                    {al.titulo}
                    {al.detalle && al.detalle !== 'Sí' ? `: ${al.detalle}` : ''}
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Alerta interna */}
      {alerta && (
        <div
          role={alerta.tipo === 'error' ? 'alert' : 'status'}
          className={`p-3.5 rounded-xl text-sm font-bold flex items-center justify-between gap-2 ${
            alerta.tipo === 'exito' ? 's-badge-ok' : 's-badge-err'
          }`}
        >
          <span>{alerta.texto}</span>
          <button
            type="button"
            onClick={() => setAlerta(null)}
            aria-label="Cerrar alerta"
            className="p-1 cursor-pointer shrink-0 s-touch-icon"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Pestañas o Sub-vista Inline (nunca apila modales; mantiene montadas las pestañas para no perder ediciones en vivo) */}
      {subVista && (
        <div className="space-y-3.5">
          <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-rule">
            <button
              type="button"
              onClick={() => {
                if (subVista === 'pdf') {
                  cerrarVistaPreviaPdf();
                } else {
                  setConfirmInline(null);
                  setSubVista(null);
                }
              }}
              className="s-btn-sec min-h-[40px] px-3.5 rounded-xl text-[13px] font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Volver al Expediente</span>
            </button>
            <span className="text-sm font-extrabold text-ink truncate">
              {titulosSubVista[subVista]}
            </span>
          </div>

          {subVista === 'cobrar' && miembro && (
            <ModalCobrarDeuda
              abierto={true}
              embedded={true}
              miembro={{
                id: miembro.id,
                nombre: miembro.nombre,
                apellido: miembro.apellido,
                dni: miembro.dni,
                saldoAFavor,
              }}
              cargosPendientes={estadoCuenta?.cargos || CARGOS_VACIOS}
              cargoInicialId={cargoIdACobrar}
              onCerrar={() => setSubVista(null)}
              onPagoExitoso={(mensaje) => {
                setSubVista(null);
                setAlerta({ tipo: 'exito', texto: mensaje });
                void cargarDatos(miembro.id);
                onActualizado?.();
              }}
            />
          )}

          {subVista === 'nuevo-cargo' && miembro && (
            <ModalGenerarDeudaManual
              abierto={true}
              embedded={true}
              miembro={{
                id: miembro.id,
                nombre: miembro.nombre,
                apellido: miembro.apellido,
                dni: miembro.dni,
              }}
              onCerrar={() => setSubVista(null)}
              onGenerado={(mensaje) => {
                setSubVista(null);
                setAlerta({ tipo: 'exito', texto: mensaje });
                void cargarDatos(miembro.id);
                onActualizado?.();
              }}
            />
          )}

          {subVista === 'editar-familia' && familiaActual && (
            <ModalEditarFamilia
              abierto={true}
              embedded={true}
              familia={familiaActual}
              onCerrar={() => setSubVista(null)}
              // El modal cierra la subvista cuando corresponde (al guardar o disolver); al
              // quitar a un integrante queda abierta para seguir editando.
              onGuardado={(mensaje) => {
                setAlerta({ tipo: 'exito', texto: mensaje });
                if (miembro) void cargarDatos(miembro.id);
                onActualizado?.();
              }}
            />
          )}

          {subVista === 'vincular-hermano' && miembro && (
            <ModalVincularHermano
              abierto={true}
              embedded={true}
              usuarioId={miembro.id}
              usuarioNombre={`${miembro.nombre} ${miembro.apellido}`}
              onCerrar={() => setSubVista(null)}
              onVinculado={() => {
                setSubVista(null);
                setAlerta({ tipo: 'exito', texto: 'Hermano vinculado.' });
                void cargarDatos(miembro.id);
                onActualizado?.();
              }}
            />
          )}

          {subVista === 'llamar' && (
            <div className="space-y-2.5">
              {telefonosInline.map((item, idx) => (
                <a
                  key={`${item.etiqueta}-${idx}`}
                  href={`tel:${item.telefono}`}
                  className="s-card s-card-hover p-4 rounded-2xl flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 space-y-0.5">
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold s-badge-info inline-block">
                      {item.etiqueta}
                    </span>
                    <div className="text-[15px] font-extrabold text-ink truncate">
                      {item.nombre || `${miembro?.nombre} ${miembro?.apellido}`}
                    </div>
                    <div className="text-[13px] font-mono text-ink-muted">{item.telefono}</div>
                  </div>
                  <span className="s-btn-brand min-h-[40px] px-3.5 py-2 rounded-xl text-[13px] inline-flex items-center gap-1.5 shrink-0">
                    <Phone className="w-4 h-4" />
                    <span>Llamar</span>
                  </span>
                </a>
              ))}
            </div>
          )}

          {subVista === 'pdf' && pdfPreviewUrl && (
            <Suspense
              fallback={
                <div className="py-10 flex items-center justify-center gap-2 text-ink-muted">
                  <Loader2 className="w-5 h-5 animate-spin text-brand" />
                  <span className="text-sm font-bold">Preparando visor PDF…</span>
                </div>
              }
            >
              <PdfViewerModal
                url={pdfPreviewUrl}
                titulo={`Ficha: ${miembro?.apellido || ''}, ${miembro?.nombre || ''}`}
                subtitulo={`Legajo Anual ${obtenerCicloAnioActual()}`}
                embedded={true}
                onCerrar={cerrarVistaPreviaPdf}
                onDescargar={() =>
                  void handleDescargarPdfEducador(entregas?.[0], datosPreviewVivoRef.current)
                }
              />
            </Suspense>
          )}

          {subVista === 'confirmar' && confirmInline && (
            <div className="s-panel rounded-2xl p-5 sm:p-6 space-y-4">
              <div className="flex items-start gap-3.5">
                <div
                  className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                    confirmInline.tipo === 'peligro' ? 's-badge-err' : 's-badge-warn'
                  }`}
                >
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div className="space-y-1.5 min-w-0">
                  <h3 className="text-base font-extrabold text-ink">{confirmInline.titulo}</h3>
                  <p className="text-sm text-ink-2 whitespace-pre-line leading-relaxed">
                    {confirmInline.mensaje}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2.5 border-t border-rule">
                {confirmInline.textoCancelar !== null && (
                  <button
                    type="button"
                    disabled={confirmInline.cargando}
                    onClick={() => {
                      setConfirmInline(null);
                      setSubVista(null);
                    }}
                    className="s-btn-sec s-touch px-4 py-2.5 rounded-xl text-sm font-bold cursor-pointer disabled:opacity-50"
                  >
                    {confirmInline.textoCancelar}
                  </button>
                )}
                <button
                  type="button"
                  disabled={confirmInline.cargando}
                  onClick={() => void confirmInline.onConfirmar()}
                  className={`s-touch px-4 py-2.5 rounded-xl text-sm inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                    confirmInline.tipo === 'peligro' ? 's-btn-danger' : 's-btn-brand'
                  }`}
                >
                  {confirmInline.cargando && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{confirmInline.textoConfirmar}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className={subVista ? 'hidden' : 'space-y-4'}>
        <div className="pb-1 border-b border-rule">
            <SegmentedTabs
              items={tabsItems}
              activeId={tabVisible}
              onChange={cambiarTab}
              ariaLabel="Pestañas del expediente del miembro"
            />
          </div>

          {cargando ? (
            <div className="py-12 text-center text-ink-muted space-y-2">
              <Loader2 className="w-6 h-6 animate-spin text-brand mx-auto" />
              <p className="text-sm font-semibold">Cargando expediente…</p>
            </div>
          ) : miembro ? (
            <div className="s-anim-tab text-sm">
              {tabVisible === 'datos' && (
                <PestanaDatosMiembro
                  miembro={miembro}
                  estadoCuenta={estadoCuenta}
                  formData={formData}
                  setFormData={setFormData}
                  guardando={guardando}
                  desvinculandoMiembroId={desvinculandoMiembroId}
                  puedeEditarIdentidad={puedeEditarIdentidad}
                  puedeEditarContacto={puedeEditarContacto}
                  puedeEditarSalud={puedeEditarSalud}
                  puedeDarBaja={puedeDarBaja}
                  puedeEditarMiembro={puedeEditarMiembro}
                  puedeGestionarTesoreria={puedeGestionarTesoreria}
                  puedeVincularHermano={puedeVincularHermano}
                  puedeEditarDescuentoFamilia={puedeEditarDescuentoFamilia}
                  esGlobal={esGlobalFamilia}
                  unidadesEnAlcanceIds={unidadesFamiliaIds}
                  puedeEliminarDefinitivo={puedeEliminarDefinitivo}
                  eliminandoDefinitivo={eliminandoDefinitivo}
                  onGuardarDatos={handleGuardarDatos}
                  onDesvincularRapido={handleDesvincularRapido}
                  onAbrirEditarFamilia={() => {
                    if (!guardOffline('editar el grupo familiar')) setSubVista('editar-familia');
                  }}
                  onAbrirVincularHermano={() => {
                    if (!guardOffline('vincular un hermano')) setSubVista('vincular-hermano');
                  }}
                  onSolicitarEliminarDefinitivo={handleSolicitarEliminarDefinitivo}
                />
              )}

              {tabVisible === 'cuotas' && (
                <PestanaCuotasTesoreria
                  miembro={miembro}
                  estadoCuenta={estadoCuenta}
                  estadoCuentaNoDisponible={estadoCuentaNoDisponible}
                  saldoPendiente={saldoPendiente}
                  saldoAFavor={saldoAFavor}
                  puedeGestionarTesoreria={puedeGestionarTesoreria}
                  puedeCobrarCuotas={puedeCobrarCuotas}
                  puedeCrearCargoIndividual={puedeCrearCargoIndividual}
                  puedeAjustarCuotas={puedeAjustarCuotas}
                  puedeVincularHermano={puedeVincularHermano}
                  puedeEditarDescuentoFamilia={puedeEditarDescuentoFamilia}
                  esGlobal={esGlobalFamilia}
                  unidadesEnAlcanceIds={unidadesFamiliaIds}
                  ajustandoSaldo={ajustandoSaldo}
                  setAjustandoSaldo={setAjustandoSaldo}
                  tipoAjusteSaldo={tipoAjusteSaldo}
                  setTipoAjusteSaldo={setTipoAjusteSaldo}
                  montoAjusteSaldo={montoAjusteSaldo}
                  setMontoAjusteSaldo={setMontoAjusteSaldo}
                  motivoAjusteSaldo={motivoAjusteSaldo}
                  setMotivoAjusteSaldo={setMotivoAjusteSaldo}
                  procesandoAccionCuota={procesandoAccionCuota}
                  desvinculandoMiembroId={desvinculandoMiembroId}
                  cargoEditando={cargoEditando}
                  setCargoEditando={setCargoEditando}
                  mostrarAnulados={mostrarAnulados}
                  setMostrarAnulados={setMostrarAnulados}
                  pagoEditando={pagoEditando}
                  setPagoEditando={setPagoEditando}
                  onGuardarAjusteSaldo={handleGuardarAjusteSaldo}
                  onIniciarEdicionCargo={handleIniciarEdicionCargo}
                  onGuardarEdicionCargo={handleGuardarEdicionCargo}
                  onAnularCargo={handleAnularCargo}
                  onReactivarCargo={handleReactivarCargo}
                  onEliminarCargoDefinitivo={handleEliminarCargoDefinitivo}
                  onRevertirPago={handleRevertirPago}
                  onGuardarEdicionPago={handleGuardarEdicionPago}
                  onDesvincularRapido={handleDesvincularRapido}
                  onCobrarCargo={(cId) => {
                    if (guardOffline('registrar un cobro')) return;
                    setCargoIdACobrar(cId ?? null);
                    setSubVista('cobrar');
                  }}
                  onAbrirModalGenerarDeuda={() => {
                    if (!guardOffline('generar un cargo individual')) setSubVista('nuevo-cargo');
                  }}
                  onAbrirModalEditarFamilia={() => {
                    if (!guardOffline('editar el grupo familiar')) setSubVista('editar-familia');
                  }}
                  onAbrirModalVincularHermano={() => {
                    if (!guardOffline('vincular un hermano')) setSubVista('vincular-hermano');
                  }}
                />
              )}

              {tabVisible === 'ficha' && (
                <PestanaLegajosFichas
                  miembro={miembro}
                  entregas={entregas}
                  plantillasAplicables={plantillasAplicables}
                  editandoFicha={editandoFicha}
                  setEditandoFicha={setEditandoFicha}
                  plantillaActiva={plantillaActiva}
                  onSeleccionarPlantilla={(p) => {
                    setPlantillaActiva(p);
                    setEditandoFicha(false);
                  }}
                  precargaFicha={precargaFicha}
                  guardando={guardando}
                  validandoFichaId={validandoFichaId}
                  descargandoPdfId={descargandoPdfId}
                  generandoVistaPrevia={generandoVistaPrevia}
                  pdfPreviewUrl={pdfPreviewUrl}
                  ocultarModalPdf={true}
                  cargandoFichaEditor={cargandoFichaEditor}
                  puedeValidarFisico={puedeValidarFisico}
                  puedeCompletarFicha={puedeCompletarFicha}
                  enDrawer={enDrawer}
                  onPreviewPdf={(datos) => void handleVerPdfEducador(undefined, datos)}
                  onGuardarFichaEducador={handleGuardarFichaEducador}
                  onValidarFisicoDirecto={handleValidarFisicoDirecto}
                  onVerPdfEducador={handleVerPdfEducador}
                  onDescargarPdfEducador={handleDescargarPdfEducador}
                  onAbrirEditorFicha={handleAbrirEditorFicha}
                  onCerrarPdfPreview={cerrarVistaPreviaPdf}
                />
              )}

              {tabVisible === 'pase' && (
                <PestanaPaseRol
                  candidatoPase={candidatoPase}
                  categoriaDestino={categoriaDestino}
                  onCambioCategoria={handleCambioCategoria}
                  tieneGlobal={() => esGlobalPases}
                  unidades={unidades}
                  unidadesEnAlcanceIds={unidadesPasesIds}
                  ramaOrigenId={asignacionPrincipal?.unidad?.ramaId ?? null}
                  ramas={ramas}
                  ramaSeleccionadaId={ramaSeleccionadaId}
                  ramaSeleccionadaObj={ramaSeleccionadaObj}
                  unidadesRamaSeleccionada={unidadesRamaSeleccionada}
                  unidadDestinoId={unidadDestinoId}
                  setUnidadDestinoId={setUnidadDestinoId}
                  rolDestinoId={rolDestinoId}
                  setRolDestinoId={setRolDestinoId}
                  rolesRama={rolesRama}
                  rolesSinRama={rolesSinRama}
                  rolesJefatura={rolesJefatura}
                  todosRoles={esGlobalPases ? rolesActivosDominados : undefined}
                  onSeleccionarRama={handleSeleccionarRama}
                  onEjecutarPase={handleEjecutarPase}
                  ejecutandoPase={ejecutandoPase}
                  esMismoDestino={esMismoDestino}
                  asignacionesActivas={asignacionesActivas}
                  puedeCerrarAsignacion={(asig) =>
                    puedeCerrarAsignacionPorAlcance(asig, {
                      esGlobal: esGlobalPases,
                      unidadesEnAlcanceIds: unidadesPasesIds,
                      esMismoUsuario,
                    })
                  }
                  onCerrarAsignacion={handleCerrarAsignacion}
                  onAgregarAsignacion={
                    esGlobalPases || unidadesPasesIds.length > 0
                      ? handleAgregarAsignacion
                      : undefined
                  }
                  asignacionPrincipalId={asignacionPrincipal?.id}
                />
              )}

              {tabVisible === 'seguridad' && (
                <PestanaSeguridad
                  miembro={miembro}
                  reseteandoClave={reseteandoClave}
                  claveTemporalGenerada={claveTemporalGenerada}
                  onResetClave={handleResetClave}
                />
              )}
            </div>
          ) : null}
      </div>
    </div>
  );
};
