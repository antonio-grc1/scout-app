import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { validarNuevaContrasena } from '../../lib/formValidation';
import { BotonVerContrasena } from '../../components/ui/BotonVerContrasena';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  Edit2,
  Eye,
  FileText,
  KeyRound,
  Loader2,
  Mail,
  MapPin,
  Phone,
  PlusCircle,
  QrCode,
  Receipt,
  RotateCcw,
  Save,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Ticket,
  Trash2,
  UploadCloud,
  User,
  Users,
  WifiOff,
} from 'lucide-react';
import { api } from '../../api/client';
import {
  eliminarBorradorLegajoLocal,
  guardarBorradorLegajoLocal,
  obtenerBorradorLegajoLocal,
  type BorradorLegajoLocal,
} from '../../core/offline/campamentoSync';
import { useAuthStore } from '../../store/authStore';
import { pedirConfirmacionDescarte, useCambiosSinGuardarStore } from '../../store/cambiosSinGuardarStore';
import { useCapabilities } from '../../core/capabilities';
import { useOfflineStore } from '../../store/offlineStore';
import { useConfirmar } from '../../hooks/useConfirmar';
import { useToastStore } from '../../store/toastStore';
import { DynamicFormRenderer, type EsquemaCampos } from '../../components/DynamicFormRenderer';
import { ModalCargarPedidoEvento } from '../../components/ModalCargarPedidoEvento';
import { ModalTicketQR } from '../../components/ModalTicketQR';
import { BotonInstalarPwa } from '../../components/BotonInstalarPwa';
import { Drawer, KpiCard, SegmentedTabs, type SegmentedTabItem, Input } from '../../components/ui';
import { obtenerConfigRama } from '../../lib/ramaColors';
import {
  ESTADO_CARGO_CONFIG,
  ESTADO_FICHA_CONFIG,
  METODO_PAGO_LABELS,
  calcularEdad,
  esErrorOffline,
  filtrarPlantillasParaMiembro,
  formatearFechaLargaUTC,
  formatearFecha,
  formatearMoneda,
  obtenerCicloAnioActual,
  obtenerRolPrincipal,
  seleccionarPlantillaPorMiembro,
  traducirErrorAmigable,
} from '../../lib/formatters';
import {
  crearUrlPdfBlob,
  descargarPdfBlob,
  generarFichaPdf,
  PREFIJO_HASH_BORRADOR,
  type MapeoPdf,
} from '../../services/pdfGenerator';

const PdfViewerModal = lazy(() =>
  import('../../components/PdfViewerModal').then((m) => ({ default: m.PdfViewerModal })),
);

export type TabMiEspacio = 'legajo' | 'cuotas' | 'pedidos' | 'perfil';
const TABS_VALIDAS: readonly TabMiEspacio[] = ['legajo', 'cuotas', 'pedidos', 'perfil'];

function resolverTabDesdeParams(searchParams: URLSearchParams): TabMiEspacio {
  const tabParam = searchParams.get('tab') as TabMiEspacio | null;
  if (tabParam && TABS_VALIDAS.includes(tabParam)) return tabParam;

  const vistaParam = searchParams.get('vista');
  if (vistaParam === 'cuotas') return 'cuotas';
  if (vistaParam === 'eventos') return 'pedidos';
  if (vistaParam === 'papeles') return 'legajo';
  return 'legajo';
}

export const MiEspacioPage: React.FC = () => {
  const { usuario, asignaciones, setSesion } = useAuthStore();
  const isOnline = useOfflineStore((s) => s.isOnline);
  const mostrarToast = useToastStore((s) => s.mostrarToast);
  const { pedir: pedirConfirmacion, dialogo: dialogoConfirmacion } = useConfirmar();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();

  const cicloActual = obtenerCicloAnioActual();
  const caps = useCapabilities();
  // "Mis Pedidos y Vales" consulta /tesoreria/eventos, que exige eventos.ver: sin permiso no se muestra.
  const puedeVerPedidos = caps.canViewEventos;
  const resolverTabPermitida = (sp: URLSearchParams): TabMiEspacio => {
    const t = resolverTabDesdeParams(sp);
    return t === 'pedidos' && !puedeVerPedidos ? 'legajo' : t;
  };

  const [tabActiva, setTabActiva] = useState<TabMiEspacio>(() =>
    resolverTabPermitida(searchParams),
  );

  useEffect(() => {
    const resuelta = resolverTabPermitida(searchParams);
    if (resuelta !== tabActiva) {
      setTabActiva(resuelta);
    }
  }, [searchParams, tabActiva, puedeVerPedidos]);

  const cambiarTab = async (nuevoTab: TabMiEspacio) => {
    if (nuevoTab === tabActiva) return;
    if (tabActiva === 'legajo' && formDirty && !(await confirmarDescartarCambios())) return;
    // Al salir del legajo (ya confirmado) los cambios se descartan: no seguir marcándolo sucio.
    if (tabActiva === 'legajo') setFormDirty(false);
    setTabActiva(nuevoTab);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', nuevoTab);
      next.delete('vista');
      if (nuevoTab !== 'pedidos') {
        next.delete('evento');
      }
      return next;
    });
  };

  // Estados de Legajo + Cuotas
  const [plantillasDisponibles, setPlantillasDisponibles] = useState<any[]>([]);
  const [entregasMiembro, setEntregasMiembro] = useState<any[]>([]);
  const [plantillaSeleccionada, setPlantillaSeleccionada] = useState<any | null>(null);
  const plantillaSeleccionadaIdRef = useRef<number | null>(null);
  const [precarga, setPrecarga] = useState<any | null>(null);
  const [borradorLocal, setBorradorLocal] = useState<BorradorLegajoLocal | null>(null);
  const [sincronizandoBorrador, setSincronizandoBorrador] = useState(false);
  const [estadoCuenta, setEstadoCuenta] = useState<any | null>(null);
  const [estadoCuentaEstado, setEstadoCuentaEstado] = useState<'cargando' | 'ok' | 'error'>(
    'cargando',
  );
  const [cargandoInicial, setCargandoInicial] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [guardandoLegajo, setGuardandoLegajo] = useState(false);
  // Estado propio de la descarga: antes reutilizaba guardandoLegajo y bloqueaba el envío del formulario.
  const [descargandoPdf, setDescargandoPdf] = useState(false);
  const [generandoVistaPrevia, setGenerandoVistaPrevia] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [formDirty, setFormDirty] = useState(false);
  const setCambiosPendientes = useCambiosSinGuardarStore((s) => s.setPendiente);
  // Publica los cambios sin guardar del legajo para que la navegación del AppShell confirme antes de salir.
  useEffect(() => {
    setCambiosPendientes(formDirty && tabActiva === 'legajo');
    return () => setCambiosPendientes(false);
  }, [formDirty, tabActiva, setCambiosPendientes]);
  const [formResetNonce, setFormResetNonce] = useState(0);
  const [cambiandoDocumentoId, setCambiandoDocumentoId] = useState<number | null>(null);
  const obtenerValoresRef = useRef<(() => Record<string, unknown>) | null>(null);
  const datosPreviewVivoRef = useRef<Record<string, unknown> | undefined>(undefined);

  const confirmarDescartarCambios = async () => {
    if (!formDirty) return true;
    return pedirConfirmacionDescarte(
      'Tenés cambios sin guardar en tu legajo. ¿Querés continuar y descartarlos?',
    );
  };

  useEffect(() => {
    if (!formDirty || tabActiva !== 'legajo') return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [formDirty, tabActiva]);

  // Estados de Eventos y Pedidos (SIN auto-selección; sincronizado con ?evento= para soportar botón Atrás)
  const [misPedidos, setMisPedidos] = useState<any[]>([]);
  const [eventosActivos, setEventosActivos] = useState<any[]>([]);
  const [cargandoEventos, setCargandoEventos] = useState(true);
  const [modalCargarPedidoAbierto, setModalCargarPedidoAbierto] = useState(false);
  const [pedidoAEditar, setPedidoAEditar] = useState<any | null>(null);
  const [modalTicketQR, setModalTicketQR] = useState<{ abierto: boolean; ticket: any | null }>({
    abierto: false,
    ticket: null,
  });

  const eventoIdUrl = useMemo(() => {
    const raw = searchParams.get('evento');
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [searchParams]);

  const eventoSeleccionado = useMemo(() => {
    if (tabActiva !== 'pedidos' || eventoIdUrl === null) return null;
    return eventosActivos.find((e) => Number(e.id) === eventoIdUrl) ?? null;
  }, [tabActiva, eventoIdUrl, eventosActivos]);

  useEffect(() => {
    if (!eventoSeleccionado) {
      setModalCargarPedidoAbierto(false);
      setPedidoAEditar(null);
      setModalTicketQR({ abierto: false, ticket: null });
    }
  }, [eventoSeleccionado]);

  const seleccionarEvento = (ev: any) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('tab', 'pedidos');
        next.set('evento', String(ev.id));
        next.delete('vista');
        return next;
      },
      { state: { fromEventosSelector: true } },
    );
  };

  const volverASeleccionEventos = () => {
    setModalCargarPedidoAbierto(false);
    setPedidoAEditar(null);
    setModalTicketQR({ abierto: false, ticket: null });
    if ((location.state as { fromEventosSelector?: boolean } | null)?.fromEventosSelector) {
      navigate(-1);
      return;
    }
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('evento');
        return next;
      },
      { replace: true },
    );
  };

  // Estados de Mi Perfil
  const [perfil, setPerfil] = useState<any | null>(null);
  const [cargandoPerfil, setCargandoPerfil] = useState(false);
  const [guardandoContacto, setGuardandoContacto] = useState(false);
  const [guardandoClave, setGuardandoClave] = useState(false);
  const [alertaContacto, setAlertaContacto] = useState<{
    tipo: 'exito' | 'error';
    texto: string;
  } | null>(null);
  const [alertaClave, setAlertaClave] = useState<{
    tipo: 'exito' | 'error';
    texto: string;
  } | null>(null);

  const [formContacto, setFormContacto] = useState({
    emailContacto: '',
    telefonoContacto: '',
    madreNombres: '',
    madreTelefono: '',
    padreNombres: '',
    padreTelefono: '',
    tutorNombres: '',
    tutorTelefono: '',
    telefonoUrgencias: '',
    domicilio: '',
    obraSocial: '',
  });

  const [formClave, setFormClave] = useState({
    passwordActual: '',
    passwordNueva: '',
    confirmar: '',
  });
  const [verActual, setVerActual] = useState(false);
  const [verNueva, setVerNueva] = useState(false);
  const edadPerfil = calcularEdad(perfil?.fechaNacimiento);
  const [verConfirmar, setVerConfirmar] = useState(false);

  const inicializarMiEspacio = useCallback(async (opts?: { silencioso?: boolean }) => {
    const usuarioActual = useAuthStore.getState().usuario;
    const asignacionesActuales = useAuthStore.getState().asignaciones;
    const targetUserId = usuarioActual?.id;

    if (!targetUserId) {
      setErrorCarga('No se pudo identificar tu usuario. Volvé a iniciar sesión.');
      setCargandoInicial(false);
      return;
    }

    if (!opts?.silencioso) {
      setCargandoInicial(true);
    }
    setErrorCarga(null);

    try {
      // Estado propio para la cuenta: si falla, no se puede mostrar "Cuotas al día".
      setEstadoCuentaEstado('cargando');
      api
        .get(`/tesoreria/estado-cuenta/${targetUserId}`)
        .then((res) => {
          setEstadoCuenta(res.data);
          setEstadoCuentaEstado('ok');
        })
        .catch(() => setEstadoCuentaEstado('error'));

      const [resPlantillas, resMiembro, resEntregas] = await Promise.all([
        api.get(`/legajos/plantillas?cicloAnio=${obtenerCicloAnioActual()}`).catch(() => ({
          data: [],
        })),
        api.get(`/miembros/${targetUserId}`).catch(() => ({ data: null })),
        api
          .get(`/legajos/entregas?usuarioId=${targetUserId}&cicloAnio=${obtenerCicloAnioActual()}`)
          .catch(() => ({ data: [] })),
      ]);

      let listaPlantillas: any[] = Array.isArray(resPlantillas.data) ? resPlantillas.data : [];
      if (listaPlantillas.length === 0) {
        const resTodas = await api.get('/legajos/plantillas').catch(() => ({ data: [] }));
        listaPlantillas = Array.isArray(resTodas.data) ? resTodas.data : [];
      }

      setEntregasMiembro(Array.isArray(resEntregas.data) ? resEntregas.data : []);
      const perfilMiembro = resMiembro.data || usuarioActual;

      if (listaPlantillas.length === 0) {
        setPlantillasDisponibles([]);
        setBorradorLocal(null);
        if (!useOfflineStore.getState().isOnline) {
          setErrorCarga(
            'Estás sin conexión y aún no se guardaron los formularios en este dispositivo.',
          );
        } else {
          setErrorCarga('No hay formularios activos en este momento.');
        }
        setCargandoInicial(false);
        return;
      }

      const aplicables = filtrarPlantillasParaMiembro(
        listaPlantillas,
        perfilMiembro,
        asignacionesActuales,
      );
      // Antes, si ninguno aplicaba se ofrecían todos (p. ej. el legajo de educadores a una familia).
      if (aplicables.length === 0) {
        setPlantillasDisponibles([]);
        setBorradorLocal(null);
        setErrorCarga(
          'No hay formularios asignados a tu perfil en este ciclo. Si creés que falta alguno, consultá con tus educadores.',
        );
        setCargandoInicial(false);
        return;
      }
      const disponibles = aplicables;
      setPlantillasDisponibles(disponibles);

      const idPrevio = plantillaSeleccionadaIdRef.current;
      const plantilla =
        (idPrevio ? disponibles.find((p) => p.id === idPrevio) : null) ||
        seleccionarPlantillaPorMiembro(disponibles, perfilMiembro, asignacionesActuales) ||
        disponibles[0];
      plantillaSeleccionadaIdRef.current = plantilla.id;
      setPlantillaSeleccionada(plantilla);

      const ciclo = plantilla.cicloAnio || obtenerCicloAnioActual();
      let datosPrecarga: any = null;
      try {
        const resPrecarga = await api.get(
          `/legajos/miembro/${targetUserId}/plantilla/${plantilla.id}/precarga?cicloAnio=${ciclo}`,
        );
        datosPrecarga = resPrecarga.data;
      } catch {
        datosPrecarga = {
          usuario: perfilMiembro,
          plantilla,
          ultimaEntrega: null,
          datosFamiliaresSugeridos: {},
        };
      }
      const borradorGuardado = await obtenerBorradorLegajoLocal({
        ownerUserId: usuarioActual.id,
        usuarioId: targetUserId,
        plantillaId: plantilla.id,
        cicloAnio: ciclo,
      });
      setPrecarga(datosPrecarga);
      setBorradorLocal(borradorGuardado);
      if (!opts?.silencioso) {
        setFormDirty(false);
      }
    } catch (err) {
      if (esErrorOffline(err)) {
        if (usuarioActual) {
          setPrecarga(
            (prev: any) =>
              prev || {
                usuario: usuarioActual,
                plantilla: null,
                ultimaEntrega: null,
                datosFamiliaresSugeridos: {},
              },
          );
          setErrorCarga(null);
          return;
        }
      }
      const msg = traducirErrorAmigable(err, 'No se pudo cargar tu ficha.');
      if (!esErrorOffline(err)) {
        setErrorCarga(msg);
        mostrarToast(msg, 'error');
      }
    } finally {
      setCargandoInicial(false);
    }
  }, [mostrarToast]);

  const cargarMisPedidosYEventos = useCallback(async () => {
    setCargandoEventos(true);
    try {
      const [resPedidos, resEventos] = await Promise.all([
        api.get('/tesoreria/mis-pedidos').catch(() => ({ data: [] })),
        api.get('/tesoreria/eventos').catch(() => ({ data: [] })),
      ]);
      const pedList = Array.isArray(resPedidos.data) ? resPedidos.data : [];
      const evList = Array.isArray(resEventos.data) ? resEventos.data : [];
      setMisPedidos(pedList);
      setEventosActivos(evList);
    } finally {
      setCargandoEventos(false);
    }
  }, []);

  const recargarEstadoCuenta = async () => {
    const id = precarga?.usuario?.id || usuario?.id;
    if (!id) return;
    setEstadoCuentaEstado('cargando');
    try {
      const res = await api.get(`/tesoreria/estado-cuenta/${id}`);
      setEstadoCuenta(res.data);
      setEstadoCuentaEstado('ok');
    } catch {
      setEstadoCuentaEstado('error');
    }
  };

  const cargarPerfil = useCallback(async () => {
    setCargandoPerfil(true);
    try {
      const res = await api.get('/miembros/mi-perfil');
      const m = res.data;
      setPerfil(m);
      setFormContacto({
        emailContacto: m.emailContacto || '',
        telefonoContacto: m.telefonoContacto || m.datosFijosJson?.protagonista_telefono || '',
        madreNombres: m.datosFijosJson?.madre_nombres || '',
        madreTelefono: m.datosFijosJson?.madre_telefono || '',
        padreNombres: m.datosFijosJson?.padre_nombres || '',
        padreTelefono: m.datosFijosJson?.padre_telefono || '',
        tutorNombres: m.datosFijosJson?.tutor_nombres || '',
        tutorTelefono: m.datosFijosJson?.tutor_telefono || '',
        telefonoUrgencias: m.datosFijosJson?.telefono_urgencias || '',
        domicilio: m.datosFijosJson?.domicilio || '',
        obraSocial: m.datosFijosJson?.obra_social || '',
      });
    } catch (err) {
      if (!esErrorOffline(err)) {
        setAlertaContacto({
          tipo: 'error',
          texto: traducirErrorAmigable(err, 'No se pudo cargar tu perfil.'),
        });
      }
    } finally {
      setCargandoPerfil(false);
    }
  }, []);

  useEffect(() => {
    void inicializarMiEspacio();
  }, [inicializarMiEspacio, usuario?.id]);

  useEffect(() => {
    if (tabActiva === 'pedidos') {
      void cargarMisPedidosYEventos();
    } else if (tabActiva === 'perfil' && !perfil) {
      void cargarPerfil();
    }
  }, [tabActiva, cargarMisPedidosYEventos, cargarPerfil, perfil]);

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
  };

  const obtenerDatosUsuarioPdf = () => ({
    nombre: precarga?.usuario?.nombre || usuario?.nombre || '',
    apellido: precarga?.usuario?.apellido || usuario?.apellido || '',
    dni: precarga?.usuario?.dni || usuario?.dni || '',
    fechaNacimiento: precarga?.usuario?.fechaNacimiento,
    ramaNombre:
      obtenerRolPrincipal(precarga?.usuario)?.unidad?.nombre ||
      asignaciones?.[0]?.unidadNombre ||
      '',
    telefonoContacto: precarga?.usuario?.telefonoContacto,
  });

  const valoresFormularioIniciales = useMemo(
    () => ({
      protagonista_telefono: precarga?.usuario?.telefonoContacto || '',
      protagonista_domicilio:
        (precarga?.usuario?.datosFijosJson as any)?.protagonista_domicilio ||
        (precarga?.usuario?.datosFijosJson as any)?.domicilio ||
        '',
      ...(precarga?.datosFamiliaresSugeridos || {}),
      ...(precarga?.usuario?.datosFijosJson || {}),
      ...(precarga?.ultimaEntrega?.respuestasSnapshotJson || {}),
      ...(borradorLocal?.respuestas || {}),
    }),
    [precarga, borradorLocal],
  );

  const generarBytesPdfPropio = async (
    respuestasCustom?: Record<string, unknown>,
  ): Promise<Uint8Array> => {
    const entrega = precarga?.ultimaEntrega;
    const mapeo: MapeoPdf = plantillaSeleccionada?.mapeoPdfJson || { pdfBaseUrl: '', campos: {} };
    const usuarioParaPdf = obtenerDatosUsuarioPdf();
    const respuestas =
      respuestasCustom ||
      obtenerValoresRef.current?.() ||
      borradorLocal?.respuestas ||
      entrega?.respuestasSnapshotJson ||
      valoresFormularioIniciales;

    // El QR oficial solo va en un PDF idéntico a la entrega guardada; con cambios sin guardar
    // o sin entrega finalizada se usa un hash BORRADOR (marca de agua, QR no válido).
    const usarHashOficial =
      Boolean(entrega?.hashVerificacion) && entrega?.estado !== 'BORRADOR' && !formDirty;
    return await generarFichaPdf(
      mapeo,
      respuestas,
      usarHashOficial
        ? entrega.hashVerificacion
        : `${PREFIJO_HASH_BORRADOR}${usuarioParaPdf.dni}-${obtenerCicloAnioActual()}`,
      usuarioParaPdf,
      entrega?.versionImpresion || 1,
      plantillaSeleccionada?.esquemaCamposJson,
    );
  };

  const handleVerCopiaPdf = async (datosActuales?: Record<string, unknown>) => {
    if (!plantillaSeleccionada) return;
    setGenerandoVistaPrevia(true);
    try {
      datosPreviewVivoRef.current = datosActuales;
      const pdfBytes = await generarBytesPdfPropio(datosActuales);
      if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
      setPdfPreviewUrl(crearUrlPdfBlob(pdfBytes));
    } catch (err) {
      mostrarToast(traducirErrorAmigable(err, 'No se pudo visualizar el PDF.'), 'error');
    } finally {
      setGenerandoVistaPrevia(false);
    }
  };

  const handleDescargarCopiaPdf = async (datosCustom?: Record<string, unknown>) => {
    if (!plantillaSeleccionada) return;
    setDescargandoPdf(true);
    try {
      const usuarioParaPdf = obtenerDatosUsuarioPdf();
      const vivos = datosCustom || obtenerValoresRef.current?.();
      const pdfBytes = await generarBytesPdfPropio(vivos);
      descargarPdfBlob(pdfBytes, `Ficha_${usuarioParaPdf.apellido}_${usuarioParaPdf.nombre}.pdf`);
      mostrarToast('PDF descargado listo para imprimir.', 'exito');
    } catch (err) {
      mostrarToast(traducirErrorAmigable(err, 'No se pudo generar el PDF.'), 'error');
    } finally {
      setDescargandoPdf(false);
    }
  };

  const handleCambiarDocumento = async (p: any) => {
    const targetUserId = precarga?.usuario?.id || usuario?.id;
    if (!targetUserId || !p) return;
    if (p.id === plantillaSeleccionada?.id) {
      // Volver al documento actual cancela un cambio en curso.
      plantillaSeleccionadaIdRef.current = p.id;
      setCambiandoDocumentoId(null);
      return;
    }
    if (!(await confirmarDescartarCambios())) return;
    // Primero se traen precarga y borrador del documento nuevo; recién después se cambia la
    // plantilla, así el formulario se monta con sus propios valores y no con los del anterior.
    plantillaSeleccionadaIdRef.current = p.id;
    setCambiandoDocumentoId(p.id);
    const ciclo = p.cicloAnio || obtenerCicloAnioActual();
    let nuevaPrecarga: any;
    try {
      const resPrecarga = await api.get(
        `/legajos/miembro/${targetUserId}/plantilla/${p.id}/precarga?cicloAnio=${ciclo}`,
      );
      nuevaPrecarga = resPrecarga.data;
    } catch {
      const ent = entregasMiembro.find((e) => e.plantillaId === p.id) || null;
      nuevaPrecarga = {
        usuario: precarga?.usuario || usuario,
        datosFamiliaresSugeridos: precarga?.datosFamiliaresSugeridos || {},
        plantilla: p,
        ultimaEntrega: ent,
      };
    }
    const borradorGuardado = await obtenerBorradorLegajoLocal({
      ownerUserId: usuario?.id,
      usuarioId: targetUserId,
      plantillaId: p.id,
      cicloAnio: ciclo,
    });
    // Si mientras tanto el usuario eligió otro documento, descartar esta respuesta.
    if (plantillaSeleccionadaIdRef.current !== p.id) return;
    setPrecarga(nuevaPrecarga);
    setBorradorLocal(borradorGuardado);
    setPlantillaSeleccionada(p);
    setFormDirty(false);
    setCambiandoDocumentoId(null);
  };

  const handleSincronizarBorradorLocal = async () => {
    if (!borradorLocal || !plantillaSeleccionada) return;
    if (!isOnline) {
      mostrarToast(
        'Seguís sin conexión a internet. Apenas recuperes señal vas a poder sincronizar el borrador.',
        'advertencia',
      );
      return;
    }
    setSincronizandoBorrador(true);
    try {
      await api.post('/legajos/entregas', {
        usuarioId: borradorLocal.usuarioId,
        plantillaId: borradorLocal.plantillaId,
        cicloAnio: borradorLocal.cicloAnio,
        respuestas: borradorLocal.respuestas,
        finalizarParaFirma: false,
        actualizarDatosFijos: true,
      });
      await eliminarBorradorLegajoLocal({
        ownerUserId: usuario?.id,
        usuarioId: borradorLocal.usuarioId,
        plantillaId: borradorLocal.plantillaId,
        cicloAnio: borradorLocal.cicloAnio,
      });
      setBorradorLocal(null);
      setFormDirty(false);
      mostrarToast('Borrador local sincronizado con el servidor.', 'exito');
      await inicializarMiEspacio({ silencioso: true });
    } catch (err) {
      mostrarToast(traducirErrorAmigable(err, 'No se pudo sincronizar el borrador local.'), 'error');
    } finally {
      setSincronizandoBorrador(false);
    }
  };

  const handleDescartarBorradorLocal = async () => {
    if (!borradorLocal) return;
    await eliminarBorradorLegajoLocal({
      ownerUserId: usuario?.id,
      usuarioId: borradorLocal.usuarioId,
      plantillaId: borradorLocal.plantillaId,
      cicloAnio: borradorLocal.cicloAnio,
    });
    setBorradorLocal(null);
    setFormDirty(false);
    setFormResetNonce((k) => k + 1);
    mostrarToast('Borrador local descartado.', 'info');
  };

  const handleSubmitFormulario = async (
    datos: Record<string, unknown>,
    finalizarParaFirma: boolean,
  ) => {
    const targetUserId = precarga?.usuario?.id || usuario?.id;
    if (!targetUserId || !plantillaSeleccionada) return;
    const cicloPlantilla = plantillaSeleccionada.cicloAnio || obtenerCicloAnioActual();

    if (!isOnline || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
      setGuardandoLegajo(true);
      try {
        const guardado = await guardarBorradorLegajoLocal({
          ownerUserId: usuario?.id,
          usuarioId: targetUserId,
          plantillaId: plantillaSeleccionada.id,
          cicloAnio: cicloPlantilla,
          respuestas: datos,
        });
        setBorradorLocal(guardado);
        setFormDirty(false);
        if (finalizarParaFirma) {
          mostrarToast(
            'Avance guardado en este dispositivo (pendiente de sincronizar). Necesitás señal para emitir el PDF oficial con QR.',
            'advertencia',
            6000,
          );
        } else {
          mostrarToast(
            'Sin conexión: borrador guardado localmente (pendiente de sincronizar).',
            'info',
            5000,
          );
        }
      } finally {
        setGuardandoLegajo(false);
      }
      return;
    }

    setGuardandoLegajo(true);
    try {
      const res = await api.post('/legajos/entregas', {
        usuarioId: targetUserId,
        plantillaId: plantillaSeleccionada.id,
        cicloAnio: cicloPlantilla,
        respuestas: datos,
        finalizarParaFirma,
        actualizarDatosFijos: true,
      });

      await eliminarBorradorLegajoLocal({
        ownerUserId: usuario?.id,
        usuarioId: targetUserId,
        plantillaId: plantillaSeleccionada.id,
        cicloAnio: cicloPlantilla,
      });
      setBorradorLocal(null);
      setFormDirty(false);

      const entrega = res.data;

      if (finalizarParaFirma && entrega.hashVerificacion) {
        // La ficha ya quedó guardada: un fallo del PDF no debe informarse como fallo de guardado.
        try {
          const mapeo: MapeoPdf = plantillaSeleccionada.mapeoPdfJson || { pdfBaseUrl: '', campos: {} };
          const usuarioParaPdf = obtenerDatosUsuarioPdf();
          const pdfBytes = await generarFichaPdf(
            mapeo,
            datos,
            entrega.hashVerificacion,
            usuarioParaPdf,
            entrega.versionImpresion,
            plantillaSeleccionada.esquemaCamposJson,
          );
          descargarPdfBlob(pdfBytes, `Ficha_${usuarioParaPdf.apellido}_${usuarioParaPdf.nombre}.pdf`);
          mostrarToast('¡Listo! Imprimí y entregá el papel firmado a tu educador.', 'exito');
        } catch {
          mostrarToast(
            'Tu ficha se guardó, pero no se pudo generar el PDF. Reintentá con "Descargar PDF".',
            'advertencia',
          );
        }
      } else {
        mostrarToast('Avance guardado.', 'exito');
      }

      // Guardar el legajo puede actualizar datos fijos (teléfonos, domicilio): invalidar el perfil
      // cacheado para que "Guardar contacto" no pise los datos nuevos con los viejos.
      setPerfil(null);
      await inicializarMiEspacio({ silencioso: true });
    } catch (err) {
      if (esErrorOffline(err)) {
        const guardado = await guardarBorradorLegajoLocal({
          ownerUserId: usuario?.id,
          usuarioId: targetUserId,
          plantillaId: plantillaSeleccionada.id,
          cicloAnio: cicloPlantilla,
          respuestas: datos,
        });
        setBorradorLocal(guardado);
        setFormDirty(false);
        mostrarToast(
          'Sin señal: tu avance quedó guardado localmente (pendiente de sincronizar).',
          'advertencia',
          5000,
        );
      } else {
        mostrarToast(traducirErrorAmigable(err, 'No se pudo guardar el formulario.'), 'error');
        throw err;
      }
    } finally {
      setGuardandoLegajo(false);
    }
  };

  const handleGuardarContacto = async (e: React.FormEvent) => {
    e.preventDefault();
    // Si el perfil no cargó, el formulario está vacío: guardar borraría los teléfonos reales.
    if (!perfil) {
      setAlertaContacto({
        tipo: 'error',
        texto: 'No pudimos cargar tus datos actuales. Reintentá antes de guardar.',
      });
      return;
    }
    if (!isOnline) {
      mostrarToast(
        'Sin conexión. Recuperá señal para actualizar tus datos de contacto.',
        'advertencia',
      );
      return;
    }
    setGuardandoContacto(true);
    setAlertaContacto(null);
    try {
      const res = await api.patch('/miembros/mi-perfil', {
        emailContacto: formContacto.emailContacto.trim() || null,
        telefonoContacto: formContacto.telefonoContacto.trim() || null,
        datosFijosJson: {
          protagonista_telefono: formContacto.telefonoContacto.trim(),
          madre_nombres: formContacto.madreNombres.trim(),
          madre_telefono: formContacto.madreTelefono.trim(),
          padre_nombres: formContacto.padreNombres.trim(),
          padre_telefono: formContacto.padreTelefono.trim(),
          tutor_nombres: formContacto.tutorNombres.trim(),
          tutor_telefono: formContacto.tutorTelefono.trim(),
          telefono_urgencias: formContacto.telefonoUrgencias.trim(),
          domicilio: formContacto.domicilio.trim(),
          obra_social: formContacto.obraSocial.trim(),
        },
      });
      setPerfil(res.data);
      setAlertaContacto({
        tipo: 'exito',
        texto: 'Tus datos de contacto y teléfonos fueron actualizados.',
      });
      mostrarToast('Datos de contacto guardados.', 'exito');
      // Refrescar la precarga del legajo, que se arma con estos mismos datos fijos.
      void inicializarMiEspacio({ silencioso: true });
    } catch (err) {
      setAlertaContacto({
        tipo: 'error',
        texto: traducirErrorAmigable(err, 'No se pudieron actualizar tus datos.'),
      });
    } finally {
      setGuardandoContacto(false);
    }
  };

  const handleCambiarClave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOnline) {
      mostrarToast('Sin conexión. Necesitás internet para cambiar tu contraseña.', 'advertencia');
      return;
    }
    setAlertaClave(null);

    const actual = formClave.passwordActual.trim();
    const nueva = formClave.passwordNueva.trim();
    const confirmar = formClave.confirmar.trim();

    const errorClave = validarNuevaContrasena({
      nueva,
      repetir: confirmar,
      actual,
      dni: usuario?.dni,
    });
    if (errorClave) {
      setAlertaClave({ tipo: 'error', texto: errorClave });
      return;
    }

    setGuardandoClave(true);
    try {
      const res = await api.post('/auth/cambiar-clave', {
        claveActual: actual,
        claveNueva: nueva,
      });
      if (res.data?.accessToken && res.data?.usuario && Array.isArray(res.data?.asignaciones)) {
        setSesion(res.data);
      }
      setFormClave({ passwordActual: '', passwordNueva: '', confirmar: '' });
      setAlertaClave({
        tipo: 'exito',
        texto: 'Tu contraseña se actualizó correctamente.',
      });
      mostrarToast('Contraseña actualizada.', 'exito');
    } catch (err) {
      setAlertaClave({
        tipo: 'error',
        texto: traducirErrorAmigable(err, 'No se pudo cambiar la contraseña.'),
      });
    } finally {
      setGuardandoClave(false);
    }
  };

  // Eventos derivados
  const eventosHabilitados = useMemo(
    () => eventosActivos.filter((e) => e.estado === 'PUBLICADO'),
    [eventosActivos],
  );
  const eventosFinalizados = useMemo(
    // Solo FINALIZADO: a UNIDAD/GLOBAL el backend también envía BORRADOR y CANCELADO.
    () => eventosActivos.filter((e) => e.estado === 'FINALIZADO'),
    [eventosActivos],
  );

  const conteoPedidosPorEvento = useMemo(() => {
    const mapa = new Map<number, number>();
    for (const p of misPedidos) {
      const evId = Number(p.eventoId ?? p.evento?.id);
      if (evId) mapa.set(evId, (mapa.get(evId) || 0) + 1);
    }
    return mapa;
  }, [misPedidos]);

  const pedidosEventoSeleccionado = useMemo(() => {
    if (!eventoSeleccionado) return [];
    return misPedidos.filter(
      (p) => p.eventoId === eventoSeleccionado.id || p.evento?.id === eventoSeleccionado.id,
    );
  }, [misPedidos, eventoSeleccionado]);

  const estadoActual = precarga?.ultimaEntrega?.estado || 'SIN_FICHA';
  const fichaConfig = ESTADO_FICHA_CONFIG[estadoActual] || ESTADO_FICHA_CONFIG.SIN_FICHA;
  const nombreVisible = precarga?.usuario?.nombre || usuario?.nombre || '';
  const apellidoVisible = precarga?.usuario?.apellido || usuario?.apellido || '';
  const dniVisible = precarga?.usuario?.dni || usuario?.dni || '';
  const saldoPendiente = Number(estadoCuenta?.resumen?.saldoPendiente || 0);
  const saldoAFavor = Number(estadoCuenta?.resumen?.saldoAFavor || 0);
  const unidadPrincipalNombre =
    obtenerRolPrincipal(precarga?.usuario)?.unidad?.nombre || asignaciones?.[0]?.unidadNombre || '';

  const tabsItemsTodos: readonly SegmentedTabItem<TabMiEspacio>[] = [
    {
      id: 'legajo',
      label: 'Mi Legajo',
      icon: <FileText className="w-4 h-4" />,
    },
    {
      id: 'cuotas',
      label: 'Mis Cuotas',
      icon: <CreditCard className="w-4 h-4" />,
      badge: saldoPendiente > 0 ? formatearMoneda(saldoPendiente) : undefined,
    },
    {
      id: 'pedidos',
      label: 'Mis Pedidos y Vales',
      icon: <ShoppingBag className="w-4 h-4" />,
      badge: misPedidos.length > 0 ? misPedidos.length : undefined,
    },
    {
      id: 'perfil',
      label: 'Mi Perfil',
      icon: <User className="w-4 h-4" />,
    },
  ];
  const tabsItems = tabsItemsTodos.filter((t) => t.id !== 'pedidos' || puedeVerPedidos);

  // Datos de perfil
  const asigPrincipal =
    perfil?.asignaciones?.find((a: any) => a.activo !== false) ?? perfil?.asignaciones?.[0];
  const cfgRamaPerfil = obtenerConfigRama(asigPrincipal ? { asignaciones: [asigPrincipal] } : null);
  const hermanos = (perfil?.grupoFamiliar?.miembros || []).filter((h: any) => h.id !== perfil?.id);
  const asignacionesActivasPerfil = (perfil?.asignaciones || []).filter((a: any) => a.activo);

  return (
    <div className="s-anim-view max-w-5xl mx-auto space-y-5">
      {dialogoConfirmacion}
      {/* Cabecera Compacta + Navegación 4 tabs */}
      <section className="s-card rounded-2xl p-5 sm:p-6 space-y-4 min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 min-w-0">
          <div className="min-w-0 space-y-1.5">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-extrabold text-ink truncate">
                {nombreVisible} {apellidoVisible}
              </h1>
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border whitespace-nowrap shrink-0 ${fichaConfig.badgeClass}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${fichaConfig.dotClass}`} />
                <span>{fichaConfig.label}</span>
              </span>
            </div>
            <p className="text-sm text-ink-muted truncate">
              DNI {dniVisible}
              {unidadPrincipalNombre ? ` · ${unidadPrincipalNombre}` : ''}
              {` · Ciclo ${cicloActual}`}
            </p>
          </div>

          {tabActiva === 'legajo' && plantillaSeleccionada && (
            <div className="flex items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => void handleVerCopiaPdf()}
                disabled={generandoVistaPrevia}
                className="s-btn-sec s-touch flex-1 sm:flex-initial px-4 py-2.5 rounded-xl text-sm font-bold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {generandoVistaPrevia ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Eye className="w-4 h-4 text-brand-ink" />
                )}
                <span>Ver Ficha</span>
              </button>

              <button
                type="button"
                onClick={() => void handleDescargarCopiaPdf()}
                disabled={descargandoPdf || guardandoLegajo}
                className="s-btn-brand s-touch flex-1 sm:flex-initial px-4.5 py-2.5 rounded-xl text-sm inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {descargandoPdf ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                <span>Descargar PDF</span>
              </button>
            </div>
          )}
        </div>

        <div className="pt-2.5 border-t border-rule">
          <SegmentedTabs
            items={tabsItems}
            activeId={tabActiva}
            onChange={cambiarTab}
            ariaLabel="Secciones de Mi Espacio"
          />
        </div>
      </section>

      {/* ================================================================= */}
      {/* TAB 1: MI LEGAJO                                                  */}
      {/* ================================================================= */}
      {tabActiva === 'legajo' && (
        <div className="s-anim-tab">
          {cargandoInicial ? (
            <div className="s-card rounded-2xl p-8 flex flex-col items-center justify-center gap-3 text-ink-muted">
              <Loader2 className="w-6 h-6 animate-spin text-brand" />
              <span className="text-sm font-bold">Cargando formulario…</span>
            </div>
          ) : errorCarga ? (
            <div className="s-card rounded-2xl p-6 border-rose-300 dark:border-rose-900 flex flex-col items-center text-center gap-3">
              <AlertCircle className="w-8 h-8 text-rose-500" />
              <p className="text-base font-bold text-ink">{errorCarga}</p>
              <button
                type="button"
                onClick={() => void inicializarMiEspacio()}
                className="s-btn-brand s-touch px-4.5 py-2.5 rounded-xl text-sm inline-flex items-center gap-2 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Reintentar</span>
              </button>
            </div>
          ) : plantillaSeleccionada && precarga ? (
            <div className="space-y-4">
              {borradorLocal && (
                <div className="s-badge-warn rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-2.5 text-[13px] leading-relaxed">
                    <WifiOff className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      <strong className="block">Borrador local pendiente de sincronizar</strong>
                      <span>
                        {isOnline
                          ? 'Tenés cambios guardados en este dispositivo sin conexión. Sincronizalos para enviarlos.'
                          : 'Guardado en este dispositivo sin señal. Apenas recuperes conexión vas a poder sincronizarlo.'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    {isOnline && (
                      <button
                        type="button"
                        disabled={sincronizandoBorrador}
                        onClick={() => void handleSincronizarBorradorLocal()}
                        className="s-btn-brand min-h-[38px] px-3.5 py-2 rounded-xl text-[13px] inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <UploadCloud className="w-4 h-4" />
                        <span>Sincronizar ahora</span>
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={sincronizandoBorrador}
                      onClick={() =>
                        pedirConfirmacion(
                          {
                            titulo: 'Descartar borrador',
                            mensaje: '¿Descartar el borrador guardado en este dispositivo?',
                            impacto: 'Se perderán las respuestas que no se hayan sincronizado. No se puede deshacer.',
                            textoConfirmar: 'Descartar borrador',
                          },
                          handleDescartarBorradorLocal,
                        )
                      }
                      className="s-btn-sec min-h-[38px] px-3.5 py-2 rounded-xl text-[13px] font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Descartar</span>
                    </button>
                  </div>
                </div>
              )}

              {plantillasDisponibles.length > 1 && (
                <div className="s-card rounded-2xl p-4 space-y-2.5">
                  <span className="text-xs font-bold uppercase tracking-wide text-ink-muted block">
                    Documentos asignados ({plantillasDisponibles.length})
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {plantillasDisponibles.map((p) => {
                      const activa = p.id === plantillaSeleccionada.id;
                      const ent = entregasMiembro.find((e) => e.plantillaId === p.id);
                      const est = ent?.estado || 'SIN_FICHA';
                      const estCfg = ESTADO_FICHA_CONFIG[est] || ESTADO_FICHA_CONFIG.SIN_FICHA;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => void handleCambiarDocumento(p)}
                          aria-pressed={activa}
                          aria-busy={cambiandoDocumentoId === p.id}
                          className={`min-h-[42px] px-3.5 py-2 rounded-xl border text-left transition cursor-pointer flex items-center gap-2 ${
                            activa
                              ? 'bg-brand text-brand-contrast border-brand font-bold'
                              : 'bg-paper-2 text-ink border-rule hover:border-brand/50 font-semibold'
                          }`}
                        >
                          {cambiandoDocumentoId === p.id && (
                            <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden="true" />
                          )}
                          <span className="text-[13px] truncate max-w-[220px]">{p.titulo}</span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-bold border whitespace-nowrap ${
                              activa ? 'bg-surface text-ink border-transparent' : estCfg.badgeClass
                            }`}
                          >
                            {estCfg.shortLabel}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <DynamicFormRenderer
                key={`${plantillaSeleccionada.id}-${formResetNonce}`}
                esquema={plantillaSeleccionada.esquemaCamposJson as EsquemaCampos}
                valoresIniciales={valoresFormularioIniciales}
                onSubmit={handleSubmitFormulario}
                onPreviewPdf={(datos) => void handleVerCopiaPdf(datos)}
                onDirtyChange={setFormDirty}
                obtenerValoresRef={obtenerValoresRef}
                cargando={guardandoLegajo || generandoVistaPrevia}
              />
            </div>
          ) : null}
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB 2: MIS CUOTAS Y RECIBOS                                       */}
      {/* ================================================================= */}
      {tabActiva === 'cuotas' && (
        <div className="s-anim-tab s-card rounded-2xl p-5 sm:p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-rule pb-3.5">
            <span className="text-base font-extrabold text-ink">Estado de Cuenta Personal</span>
            <div className="flex items-center gap-2 flex-wrap">
              {estadoCuentaEstado === 'error' ? (
                <span className="px-3 py-1 rounded-xl text-[13px] font-extrabold s-badge-warn whitespace-nowrap shrink-0">
                  Sin datos de cuotas
                </span>
              ) : cargandoInicial || estadoCuentaEstado === 'cargando' ? (
                <div className="h-6 w-28 rounded-lg bg-paper-3 animate-pulse" />
              ) : (
                <>
                  {saldoAFavor > 0 && (
                    <span className="px-3 py-1 rounded-xl text-[13px] font-extrabold s-badge-brand whitespace-nowrap shrink-0">
                      Saldo a favor: {formatearMoneda(saldoAFavor)}
                    </span>
                  )}
                  <span
                    className={`px-3 py-1 rounded-xl text-[13px] font-extrabold whitespace-nowrap shrink-0 ${
                      saldoPendiente > 0 ? 's-badge-err' : 's-badge-ok'
                    }`}
                  >
                    {saldoPendiente > 0
                      ? `Deuda: ${formatearMoneda(saldoPendiente)}`
                      : 'Cuotas al día'}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {estadoCuentaEstado === 'error' ? (
              <div
                role="alert"
                className="col-span-full s-badge-warn rounded-xl p-4 flex items-center justify-between gap-3 flex-wrap"
              >
                <span className="text-sm font-semibold">
                  No pudimos consultar tus cuotas. No es que estés al día: reintentá en un momento.
                </span>
                <button
                  type="button"
                  onClick={() => void recargarEstadoCuenta()}
                  className="s-btn-sec s-touch px-4 py-2 rounded-xl text-sm font-bold cursor-pointer"
                >
                  Reintentar
                </button>
              </div>
            ) : cargandoInicial || estadoCuentaEstado === 'cargando' ? (
              Array.from({ length: 2 }).map((_, idx) => (
                <div
                  key={`skel-cuota-${idx}`}
                  className="p-4 rounded-xl border border-rule bg-paper-2 animate-pulse space-y-2"
                >
                  <div className="h-4 w-36 rounded bg-paper-3" />
                  <div className="h-3 w-24 rounded bg-paper-3" />
                  <div className="h-5 w-20 rounded bg-paper-3" />
                </div>
              ))
            ) : (
              <>
                {estadoCuenta?.cargos?.map((cargo: any) => {
                  const cConf = ESTADO_CARGO_CONFIG[cargo.estado] || ESTADO_CARGO_CONFIG.PENDIENTE;
                  return (
                    <div
                      key={cargo.id}
                      className="s-panel p-4 rounded-xl space-y-2 min-w-0"
                    >
                      <div className="flex justify-between items-start gap-2">
                        <span className="font-bold text-sm text-ink truncate">
                          {cargo.concepto?.nombre}
                        </span>
                        <span
                          className={`text-xs px-2.5 py-0.5 rounded-md font-bold border whitespace-nowrap shrink-0 ${cConf.badgeClass}`}
                        >
                          {cConf.label}
                        </span>
                      </div>
                      <div className="text-[13px] text-ink-muted flex justify-between s-tabular">
                        <span>Total: {formatearMoneda(cargo.montoFinal)}</span>
                        <span className="font-bold text-ink">
                          Pagado: {formatearMoneda(cargo.montoPagado)}
                        </span>
                      </div>
                    </div>
                  );
                })}

                {(!estadoCuenta?.cargos || estadoCuenta.cargos.length === 0) && (
                  <div className="col-span-full py-6 text-center text-sm text-ink-muted">
                    No tenés cuotas pendientes este año.
                  </div>
                )}
              </>
            )}
          </div>

          {estadoCuenta?.pagos?.length > 0 && (
            <div className="space-y-3 pt-3 border-t border-rule">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-brand" />
                <h2 className="text-xs sm:text-[13px] font-bold text-ink-muted uppercase tracking-wider">
                  Pagos y Recibos Realizados
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {estadoCuenta.pagos.map((pago: any) => {
                  const conceptosTexto =
                    pago.imputaciones
                      ?.map((imp: any) => imp.cargo?.concepto?.nombre)
                      .filter(Boolean)
                      .join(', ') || 'Pago de cuota';

                  return (
                    <div
                      key={pago.id}
                      className="s-panel p-3.5 rounded-xl flex items-center justify-between gap-2.5 text-sm min-w-0"
                    >
                      <div className="min-w-0">
                        <span className="font-bold text-ink block truncate">{conceptosTexto}</span>
                        <span className="text-xs text-ink-muted">
                          {formatearFecha(pago.fechaPago)} ·{' '}
                          {METODO_PAGO_LABELS[pago.metodoPago] || pago.metodoPago || 'Sin especificar'}
                        </span>
                      </div>
                      <span className="font-extrabold text-ink s-tabular shrink-0">
                        {formatearMoneda(pago.montoTotal)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB 3: MIS PEDIDOS Y VALES (Tarjetas de Evento SIN auto-select)   */}
      {/* ================================================================= */}
      {tabActiva === 'pedidos' && (
        <div className="s-anim-tab space-y-5">
          {cargandoEventos ? (
            <div className="s-card rounded-2xl p-8 flex flex-col items-center justify-center gap-2.5 text-ink-muted">
              <Loader2 className="w-6 h-6 animate-spin text-brand" />
              <span className="text-sm font-bold">Cargando campañas y pedidos…</span>
            </div>
          ) : !eventoSeleccionado ? (
            /* NIVEL 1: Catálogo de Tarjetas Tocables de Eventos */
            <div className="s-card rounded-2xl p-5 sm:p-6 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-rule pb-3.5">
                <div>
                  <h2 className="text-base font-extrabold text-ink flex items-center gap-2">
                    <Ticket className="w-[18px] h-[18px] text-brand" />
                    <span>Elegí un Evento para ver tus Pedidos y Vales QR</span>
                  </h2>
                  <p className="text-sm text-ink-muted mt-0.5">
                    Tocá una tarjeta para cargar nuevas ventas a tu saldo o descargar tus vales QR.
                  </p>
                </div>
                <span className="px-3 py-1 rounded-xl text-[13px] font-bold s-badge-brand whitespace-nowrap shrink-0">
                  Saldo a favor: {formatearMoneda(saldoAFavor)}
                </span>
              </div>

              {eventosActivos.length === 0 ? (
                <div className="py-10 text-center space-y-2.5 text-ink-muted">
                  <ShoppingBag className="w-10 h-10 mx-auto opacity-50" />
                  <p className="text-sm font-semibold">
                    No hay eventos publicados en este momento.
                  </p>
                </div>
              ) : (
                <div className="space-y-5">
                  {eventosHabilitados.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-ink-muted">
                        Habilitados para Venta ({eventosHabilitados.length})
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        {eventosHabilitados.map((ev) => {
                          const cantPedidos = conteoPedidosPorEvento.get(ev.id) || 0;
                          return (
                            <button
                              key={ev.id}
                              type="button"
                              onClick={() => seleccionarEvento(ev)}
                              className="s-card s-card-hover s-event-card rounded-2xl p-4 sm:p-5 text-left flex flex-col justify-between gap-3 cursor-pointer min-w-0"
                            >
                              <div className="space-y-2 min-w-0 w-full">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold s-badge-ok whitespace-nowrap shrink-0">
                                    Habilitado
                                  </span>
                                  {cantPedidos > 0 && (
                                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold s-badge-brand whitespace-nowrap shrink-0">
                                      {cantPedidos} pedido{cantPedidos === 1 ? '' : 's'}
                                    </span>
                                  )}
                                </div>
                                <h4 className="text-base font-extrabold text-ink truncate">
                                  {ev.titulo}
                                </h4>
                                <div className="text-xs sm:text-[13px] text-ink-muted flex flex-wrap items-center gap-x-3 gap-y-1">
                                  {ev.fechaEvento && (
                                    <span className="inline-flex items-center gap-1.5">
                                      <Calendar className="w-3.5 h-3.5 shrink-0" />
                                      {formatearFechaLargaUTC(ev.fechaEvento)}
                                    </span>
                                  )}
                                  {ev.lugarEntrega && (
                                    <span className="inline-flex items-center gap-1.5 truncate">
                                      <MapPin className="w-3.5 h-3.5 shrink-0" />
                                      <span className="truncate">{ev.lugarEntrega}</span>
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="pt-2.5 border-t border-rule w-full flex items-center justify-between text-sm font-bold text-brand">
                                <span>Ingresar al evento</span>
                                <span>→</span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {eventosFinalizados.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-ink-muted">
                        Finalizados ({eventosFinalizados.length})
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        {eventosFinalizados.map((ev) => {
                          const cantPedidos = conteoPedidosPorEvento.get(ev.id) || 0;
                          return (
                            <button
                              key={ev.id}
                              type="button"
                              onClick={() => seleccionarEvento(ev)}
                              className="s-card s-card-hover s-event-card rounded-2xl p-4 sm:p-5 text-left flex flex-col justify-between gap-3 cursor-pointer opacity-90 min-w-0"
                            >
                              <div className="space-y-2 min-w-0 w-full">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold s-badge-info whitespace-nowrap shrink-0">
                                    Finalizado
                                  </span>
                                  {cantPedidos > 0 && (
                                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold s-badge-brand whitespace-nowrap shrink-0">
                                      {cantPedidos} pedido{cantPedidos === 1 ? '' : 's'}
                                    </span>
                                  )}
                                </div>
                                <h4 className="text-base font-extrabold text-ink truncate">
                                  {ev.titulo}
                                </h4>
                                {ev.fechaEvento && (
                                  <div className="text-xs sm:text-[13px] text-ink-muted inline-flex items-center gap-1.5">
                                    <Calendar className="w-3.5 h-3.5 shrink-0" />
                                    {formatearFechaLargaUTC(ev.fechaEvento)}
                                  </div>
                                )}
                              </div>
                              <div className="pt-2.5 border-t border-rule w-full flex items-center justify-between text-sm font-bold text-ink-2">
                                <span>Ver historial y vales</span>
                                <span>→</span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* NIVEL 2: Evento Seleccionado Inequívoco */
            <div className="s-card rounded-2xl p-5 sm:p-6 space-y-5">
              {/* Banner "Evento seleccionado" + Cambiar */}
              <div className="s-panel rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1.5 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={volverASeleccionEventos}
                      className="s-btn-sec min-h-[38px] px-3 py-1.5 rounded-xl text-[13px] font-bold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      <span>Cambiar evento</span>
                    </button>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-xs font-bold whitespace-nowrap shrink-0 ${
                        eventoSeleccionado.estado === 'PUBLICADO' ? 's-badge-ok' : 's-badge-info'
                      }`}
                    >
                      {eventoSeleccionado.estado === 'PUBLICADO' ? 'Habilitado' : 'Finalizado'}
                    </span>
                  </div>
                  <div className="text-xs font-bold uppercase tracking-wider text-brand">
                    Evento seleccionado
                  </div>
                  <h2 className="text-lg sm:text-xl font-extrabold text-ink truncate">
                    {eventoSeleccionado.titulo}
                  </h2>
                </div>

                {eventoSeleccionado.estado === 'PUBLICADO' ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (!isOnline) {
                        mostrarToast(
                          'Sin conexión. Conectate a internet para cargar una nueva venta.',
                          'advertencia',
                        );
                        return;
                      }
                      setModalTicketQR({ abierto: false, ticket: null });
                      setPedidoAEditar(null);
                      setModalCargarPedidoAbierto(true);
                    }}
                    className="s-btn-brand s-touch px-4.5 py-2.5 rounded-xl text-sm inline-flex items-center justify-center gap-2 cursor-pointer shrink-0"
                  >
                    <PlusCircle className="w-4 h-4" />
                    <span>Cargar Nueva Venta</span>
                  </button>
                ) : (
                  <span className="px-3 py-1.5 rounded-xl s-badge-info text-[13px] font-bold inline-flex items-center gap-1.5 shrink-0">
                    <Clock className="w-4 h-4" />
                    <span>Cerrado a nuevas ventas</span>
                  </span>
                )}
              </div>

              {/* Resumen KPI del Evento */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <KpiCard
                  label="Pedidos en Evento"
                  value={pedidosEventoSeleccionado.length}
                  tone="neutral"
                />
                <KpiCard
                  label="Ganancia Acumulada"
                  value={`+${formatearMoneda(
                    pedidosEventoSeleccionado.reduce(
                      (acc, p) => acc + Number(p.totalGanancia || 0),
                      0,
                    ),
                  )}`}
                  tone="ok"
                  icon={<Sparkles className="w-[18px] h-[18px]" />}
                />
                <KpiCard
                  label="Saldo a Favor en Grupo"
                  value={formatearMoneda(saldoAFavor)}
                  tone="brand"
                />
              </div>

              {/* Lista de pedidos del evento seleccionado */}
              {pedidosEventoSeleccionado.length === 0 ? (
                <div className="s-panel rounded-2xl p-8 text-center space-y-3">
                  <ShoppingBag className="w-9 h-9 text-ink-muted mx-auto" />
                  <p className="text-sm font-medium text-ink-muted max-w-sm mx-auto">
                    {eventoSeleccionado.estado === 'PUBLICADO'
                      ? 'Aún no registraste ventas para este evento. Tocá "Cargar Nueva Venta" para sumar ganancia a tu saldo.'
                      : 'No tenés pedidos registrados en este evento finalizado.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {pedidosEventoSeleccionado.map((p: any) => {
                    const algunoRetirado = p.tickets?.some((t: any) => t.estado === 'UTILIZADO');
                    return (
                      <div
                        key={p.id}
                        className="s-panel rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                      >
                        <div className="space-y-1.5 min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-extrabold text-ink">Pedido #{p.id}</span>
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-xs font-bold whitespace-nowrap shrink-0 ${
                                p.estado === 'PAGADO' ? 's-badge-ok' : 's-badge-warn'
                              }`}
                            >
                              {p.estado === 'PAGADO' ? 'Pagado' : 'Pendiente de cobro'}
                            </span>
                          </div>

                          <p className="text-sm font-bold text-ink">
                            Cliente: {p.compradorNombre}
                            {p.compradorContacto && (
                              <span className="text-ink-muted font-normal ml-1">
                                ({p.compradorContacto})
                              </span>
                            )}
                          </p>

                          <div className="text-[13px] text-ink-muted flex flex-wrap gap-x-2.5 gap-y-0.5">
                            {p.detalles?.map((d: any) => (
                              <span key={d.id}>
                                <strong className="text-ink">{d.cantidad}x</strong> {d.item?.nombre}
                              </span>
                            ))}
                          </div>

                          <div className="flex items-center gap-3.5 flex-wrap pt-1 text-sm s-tabular">
                            <span className="font-extrabold text-ink">
                              Total: {formatearMoneda(Number(p.total))}
                            </span>
                            <span className="font-bold text-emerald-600 dark:text-emerald-400">
                              Tu Ganancia: +{formatearMoneda(Number(p.totalGanancia))}
                              {p.gananciaAcreditada && ' (Acreditada ✓)'}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-col items-start sm:items-end gap-2 shrink-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            {p.tickets?.map((t: any, idx: number) => (
                              <button
                                key={t.id}
                                type="button"
                                onClick={() => {
                                  setModalCargarPedidoAbierto(false);
                                  setModalTicketQR({
                                    abierto: true,
                                    ticket: {
                                      id: t.id,
                                      tokenQr: t.tokenQr,
                                      cantidad: t.cantidad,
                                      estado: t.estado,
                                      fechaUso: t.fechaUso,
                                      item: t.item,
                                      pedido: {
                                        id: p.id,
                                        compradorNombre: p.compradorNombre,
                                        compradorContacto: p.compradorContacto,
                                        evento: p.evento || eventoSeleccionado,
                                        vendedorUsuario: p.vendedorUsuario,
                                      },
                                    },
                                  });
                                }}
                                className={`min-h-[40px] px-3 py-1.5 rounded-xl text-[13px] font-bold inline-flex items-center gap-1.5 cursor-pointer ${
                                  t.estado === 'UTILIZADO'
                                    ? 's-btn-sec line-through opacity-70'
                                    : 's-btn-brand'
                                }`}
                              >
                                <QrCode className="w-4 h-4" />
                                <span>
                                  {t.estado === 'UTILIZADO'
                                    ? `Retirado #${idx + 1}`
                                    : `Vale QR #${idx + 1}`}
                                </span>
                              </button>
                            ))}
                          </div>

                          {!algunoRetirado && !p.gananciaAcreditada && (
                            <button
                              type="button"
                              onClick={() => {
                                if (!isOnline) {
                                  mostrarToast(
                                    'Sin conexión. Conectate para modificar un pedido.',
                                    'advertencia',
                                  );
                                  return;
                                }
                                setModalTicketQR({ abierto: false, ticket: null });
                                setPedidoAEditar(p);
                                setModalCargarPedidoAbierto(true);
                              }}
                              className="s-btn-sec px-3 py-1.5 rounded-lg text-[13px] font-bold inline-flex items-center gap-1.5 cursor-pointer"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                              <span>Editar Pedido</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Modales de Eventos mutuamente excluyentes */}
          {eventoSeleccionado && modalCargarPedidoAbierto && !modalTicketQR.abierto && (
            <ModalCargarPedidoEvento
              abierto={true}
              onCerrar={() => {
                setModalCargarPedidoAbierto(false);
                setPedidoAEditar(null);
              }}
              onGuardado={() => {
                void cargarMisPedidosYEventos();
                void inicializarMiEspacio();
              }}
              eventoId={eventoSeleccionado.id}
              eventoTitulo={eventoSeleccionado.titulo}
              itemsEvento={eventoSeleccionado.items || []}
              pedidoAEditar={pedidoAEditar}
              bloquearVendedor={true}
              vendedorFijoId={usuario?.id}
              vendedorFijoNombre={usuario ? `${usuario.nombre} ${usuario.apellido}` : ''}
              onToast={(texto, tipo = 'exito') => mostrarToast(texto, tipo)}
            />
          )}

          {modalTicketQR.abierto && !modalCargarPedidoAbierto && (
            <ModalTicketQR
              abierto={true}
              onCerrar={() => setModalTicketQR({ abierto: false, ticket: null })}
              ticket={modalTicketQR.ticket}
            />
          )}
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB 4: MI PERFIL                                                  */}
      {/* ================================================================= */}
      {tabActiva === 'perfil' && (
        <div className="s-anim-tab space-y-5">
          {cargandoPerfil ? (
            <div className="s-card rounded-2xl p-6 flex items-center justify-center gap-2.5 text-ink-muted">
              <Loader2 className="w-5 h-5 animate-spin text-brand" />
              <span className="text-sm font-bold">Cargando tu perfil…</span>
            </div>
          ) : (
            <>
              {!perfil && (
                <div
                  role="alert"
                  className="s-badge-err rounded-2xl p-4 flex items-center justify-between gap-3 flex-wrap"
                >
                  <span className="text-sm font-semibold">
                    No pudimos cargar tu perfil. Tus datos no se muestran ni se pueden guardar hasta reintentar.
                  </span>
                  <button
                    type="button"
                    onClick={() => void cargarPerfil()}
                    className="s-btn-sec s-touch px-4 py-2 rounded-xl text-sm font-bold cursor-pointer"
                  >
                    Reintentar
                  </button>
                </div>
              )}
              {/* Identidad y asignaciones activas */}
              <div className="s-card rounded-2xl p-5 sm:p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-4 min-w-0">
                    <div
                      className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black text-xl shrink-0 ${
                        cfgRamaPerfil?.avatarClases || 'bg-brand text-brand-contrast'
                      }`}
                    >
                      {perfil?.nombre?.[0] || usuario?.nombre?.[0] || ''}
                      {perfil?.apellido?.[0] || usuario?.apellido?.[0] || ''}
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-xl font-extrabold text-ink truncate">
                        {perfil?.nombre || usuario?.nombre}{' '}
                        {perfil?.apellido || usuario?.apellido}
                      </h2>
                      <p className="text-sm text-ink-muted">
                        DNI {perfil?.dni || usuario?.dni} ·{' '}
                        {calcularEdad(perfil?.fechaNacimiento) ?? '—'} años
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {asignacionesActivasPerfil.map((a: any) => {
                      const c = obtenerConfigRama({ asignaciones: [a] });
                      return (
                        <span
                          key={a.id}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[13px] font-bold border max-w-full min-w-0 ${
                            c?.badgeClases || 's-badge-brand'
                          }`}
                        >
                          <ShieldCheck className="w-4 h-4" />
                          <span>
                            {a.rol?.nombre} · {a.unidad?.nombre}
                          </span>
                        </span>
                      );
                    })}
                  </div>
                </div>

                {hermanos.length > 0 && (
                  <div className="pt-3.5 border-t border-rule flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 text-sm font-bold text-ink-muted">
                      <Users className="w-4 h-4 text-brand" />
                      Grupo Familiar:
                    </span>
                    {hermanos.map((h: any) => (
                      <span
                        key={h.id}
                        className="px-3 py-1 rounded-lg bg-paper-2 text-[13px] font-bold text-ink"
                      >
                        {h.nombre} {h.apellido} (DNI {h.dni})
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <BotonInstalarPwa variante="card" />

              {/* Formulario de Contacto y Teléfonos (11 campos) */}
              <form onSubmit={handleGuardarContacto} className="s-card rounded-2xl p-5 sm:p-6 space-y-5">
                <div className="flex items-center gap-2.5 border-b border-rule pb-3.5">
                  <Phone className="w-5 h-5 text-brand" />
                  <div>
                    <h2 className="text-base font-extrabold text-ink">
                      Datos de Contacto y Teléfonos
                    </h2>
                    <p className="text-xs sm:text-[13px] text-ink-muted">
                      Información vital ante emergencias y salidas de grupo.
                    </p>
                  </div>
                </div>

                {alertaContacto && (
                  <div
                    role={alertaContacto.tipo === 'error' ? 'alert' : 'status'}
                    className={`p-3.5 rounded-xl text-sm font-bold flex items-center gap-2 ${
                      alertaContacto.tipo === 'exito' ? 's-badge-ok' : 's-badge-err'
                    }`}
                  >
                    {alertaContacto.tipo === 'exito' ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 shrink-0" />
                    )}
                    <span>{alertaContacto.texto}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-sm">
                  <div>
                    <label className="block text-ink font-bold mb-1.5">Email de Contacto</label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-ink-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="email"
                        placeholder="correo@ejemplo.com"
                        value={formContacto.emailContacto}
                        onChange={(e) =>
                          setFormContacto({ ...formContacto, emailContacto: e.target.value })
                        }
                        className="s-input w-full min-h-[46px] pl-10 pr-3.5 py-2.5 rounded-xl text-base sm:text-[15px]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-ink font-bold mb-1.5">Teléfono del Miembro</label>
                    <div className="relative">
                      <Phone className="w-4 h-4 text-ink-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="tel"
                        placeholder="Ej: 3511234567"
                        value={formContacto.telefonoContacto}
                        onChange={(e) =>
                          setFormContacto({ ...formContacto, telefonoContacto: e.target.value })
                        }
                        className="s-input w-full min-h-[46px] pl-10 pr-3.5 py-2.5 rounded-xl text-base sm:text-[15px]"
                      />
                    </div>
                  </div>

                  {(edadPerfil === null || edadPerfil < 18) && (
                  <>
                  <Input
                    label="Madre: Nombre Completo"
                    type="text"
                    value={formContacto.madreNombres}
                    onChange={(e) =>
                    setFormContacto({ ...formContacto, madreNombres: e.target.value })
                    }
                  />

                  <Input
                    label="Madre: Teléfono"
                    type="tel"
                    value={formContacto.madreTelefono}
                    onChange={(e) =>
                    setFormContacto({ ...formContacto, madreTelefono: e.target.value })
                    }
                  />

                  <Input
                    label="Padre: Nombre Completo"
                    type="text"
                    value={formContacto.padreNombres}
                    onChange={(e) =>
                    setFormContacto({ ...formContacto, padreNombres: e.target.value })
                    }
                  />

                  <Input
                    label="Padre: Teléfono"
                    type="tel"
                    value={formContacto.padreTelefono}
                    onChange={(e) =>
                    setFormContacto({ ...formContacto, padreTelefono: e.target.value })
                    }
                  />

                  <Input
                    label="Tutor/a Legal: Nombre"
                    type="text"
                    value={formContacto.tutorNombres}
                    onChange={(e) =>
                    setFormContacto({ ...formContacto, tutorNombres: e.target.value })
                    }
                  />

                  <Input
                    label="Tutor/a Legal: Teléfono"
                    type="tel"
                    value={formContacto.tutorTelefono}
                    onChange={(e) =>
                    setFormContacto({ ...formContacto, tutorTelefono: e.target.value })
                    }
                  />
                  </>
                  )}

                  <Input
                    label="Teléfono de Urgencias"
                    type="tel"
                    placeholder="Teléfono fijo o pariente cercano"
                    value={formContacto.telefonoUrgencias}
                    onChange={(e) =>
                    setFormContacto({ ...formContacto, telefonoUrgencias: e.target.value })
                    }
                  />

                  <Input
                    label="Obra Social / Prepaga"
                    type="text"
                    value={formContacto.obraSocial}
                    onChange={(e) =>
                    setFormContacto({ ...formContacto, obraSocial: e.target.value })
                    }
                  />

                  <div className="sm:col-span-2">
                    <label className="block text-ink font-bold mb-1.5">Domicilio</label>
                    <div className="relative">
                      <MapPin className="w-4 h-4 text-ink-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={formContacto.domicilio}
                        onChange={(e) =>
                          setFormContacto({ ...formContacto, domicilio: e.target.value })
                        }
                        className="s-input w-full min-h-[46px] pl-10 pr-3.5 py-2.5 rounded-xl text-base sm:text-[15px]"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    disabled={guardandoContacto || !perfil}
                    className="s-btn-brand s-touch px-5 py-2.5 rounded-xl text-sm inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {guardandoContacto ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    <span>Guardar Contacto</span>
                  </button>
                </div>
              </form>

              {/* Cambio Voluntario de Clave */}
              <form onSubmit={handleCambiarClave} className="s-card rounded-2xl p-5 sm:p-6 space-y-5">
                <div className="flex items-center gap-2.5 border-b border-rule pb-3.5">
                  <KeyRound className="w-5 h-5 text-brand" />
                  <div>
                    <h2 className="text-base font-extrabold text-ink">Cambiar Contraseña</h2>
                    <p className="text-xs sm:text-[13px] text-ink-muted">
                      Mínimo 8 caracteres. Tu sesión actual seguirá activa al actualizarla.
                    </p>
                  </div>
                </div>

                {alertaClave && (
                  <div
                    role={alertaClave.tipo === 'error' ? 'alert' : 'status'}
                    className={`p-3.5 rounded-xl text-sm font-bold flex items-center gap-2 ${
                      alertaClave.tipo === 'exito' ? 's-badge-ok' : 's-badge-err'
                    }`}
                  >
                    {alertaClave.tipo === 'exito' ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 shrink-0" />
                    )}
                    <span>{alertaClave.texto}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 text-sm">
                  <div>
                    <label className="block text-ink font-bold mb-1.5">Contraseña Actual</label>
                    <div className="relative">
                      <input
                        type={verActual ? 'text' : 'password'}
                        required
                        value={formClave.passwordActual}
                        onChange={(e) =>
                          setFormClave({ ...formClave, passwordActual: e.target.value })
                        }
                        className="s-input w-full min-h-[46px] pl-3.5 pr-12 py-2.5 rounded-xl text-base sm:text-[15px]"
                      />
                      <BotonVerContrasena visible={verActual} onToggle={() => setVerActual((x) => !x)} etiqueta="contraseña actual" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-ink font-bold mb-1.5">Nueva Contraseña</label>
                    <div className="relative">
                      <input
                        type={verNueva ? 'text' : 'password'}
                        required
                        value={formClave.passwordNueva}
                        onChange={(e) =>
                          setFormClave({ ...formClave, passwordNueva: e.target.value })
                        }
                        className="s-input w-full min-h-[46px] pl-3.5 pr-12 py-2.5 rounded-xl text-base sm:text-[15px]"
                      />
                      <BotonVerContrasena visible={verNueva} onToggle={() => setVerNueva((x) => !x)} etiqueta="nueva contraseña" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-ink font-bold mb-1.5">Confirmar Nueva</label>
                    <div className="relative">
                      <input
                        type={verConfirmar ? 'text' : 'password'}
                        required
                        value={formClave.confirmar}
                        onChange={(e) =>
                          setFormClave({ ...formClave, confirmar: e.target.value })
                        }
                        className="s-input w-full min-h-[46px] pl-3.5 pr-12 py-2.5 rounded-xl text-base sm:text-[15px]"
                      />
                      <BotonVerContrasena visible={verConfirmar} onToggle={() => setVerConfirmar((x) => !x)} etiqueta="repetición de contraseña" />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    disabled={guardandoClave}
                    className="s-btn-sec s-touch px-5 py-2.5 rounded-xl text-sm font-bold inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {guardandoClave ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <KeyRound className="w-4 h-4 text-brand" />
                    )}
                    <span>Actualizar Contraseña</span>
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      )}

      {/* Drawer con PdfViewerModal embedded (cero portales apilados) */}
      <Drawer
        abierto={Boolean(pdfPreviewUrl)}
        onCerrar={cerrarVistaPreviaPdf}
        titulo={`Vista Previa: ${apellidoVisible}, ${nombreVisible}`}
        subtitulo={
          plantillaSeleccionada?.titulo ||
          plantillaSeleccionada?.nombre ||
          `Planilla Oficial ${cicloActual}`
        }
        mode="sheet"
        allowFullscreen={true}
        maxWidthClass="sm:max-w-4xl"
      >
        {pdfPreviewUrl && (
          <Suspense
            fallback={
              <div className="py-12 flex items-center justify-center gap-2.5 text-ink-muted">
                <Loader2 className="w-5 h-5 animate-spin text-brand" />
                <span className="text-sm font-bold">Preparando visor PDF…</span>
              </div>
            }
          >
            <PdfViewerModal
              url={pdfPreviewUrl}
              titulo={`Vista Previa: ${apellidoVisible}, ${nombreVisible}`}
              subtitulo={
                plantillaSeleccionada?.titulo ||
                plantillaSeleccionada?.nombre ||
                `Planilla Oficial ${cicloActual}`
              }
              embedded={true}
              onCerrar={cerrarVistaPreviaPdf}
              onDescargar={() => void handleDescargarCopiaPdf(datosPreviewVivoRef.current)}
            />
          </Suspense>
        )}
      </Drawer>
    </div>
  );
};
