import React, { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
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
  User,
  Users,
} from 'lucide-react';
import { api } from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { useOfflineStore } from '../../store/offlineStore';
import { useToastStore } from '../../store/toastStore';
import { DynamicFormRenderer, type EsquemaCampos } from '../../components/DynamicFormRenderer';
import { ModalCargarPedidoEvento } from '../../components/ModalCargarPedidoEvento';
import { ModalTicketQR } from '../../components/ModalTicketQR';
import { BotonInstalarPwa } from '../../components/BotonInstalarPwa';
import { Drawer, KpiCard, SegmentedTabs, type SegmentedTabItem } from '../../components/ui';
import { obtenerConfigRama } from '../../lib/ramaColors';
import {
  ESTADO_CARGO_CONFIG,
  ESTADO_FICHA_CONFIG,
  METODO_PAGO_LABELS,
  calcularEdad,
  esErrorOffline,
  formatearFechaLargaUTC,
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
  const [searchParams, setSearchParams] = useSearchParams();

  const cicloActual = obtenerCicloAnioActual();

  const [tabActiva, setTabActiva] = useState<TabMiEspacio>(() =>
    resolverTabDesdeParams(searchParams),
  );

  useEffect(() => {
    const resuelta = resolverTabDesdeParams(searchParams);
    if (resuelta !== tabActiva) {
      setTabActiva(resuelta);
    }
  }, [searchParams, tabActiva]);

  const cambiarTab = (nuevoTab: TabMiEspacio) => {
    if (nuevoTab === tabActiva) return;
    setTabActiva(nuevoTab);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', nuevoTab);
      next.delete('vista');
      return next;
    });
  };

  // Estados de Legajo + Cuotas
  const [plantillaSeleccionada, setPlantillaSeleccionada] = useState<any | null>(null);
  const [precarga, setPrecarga] = useState<any | null>(null);
  const [estadoCuenta, setEstadoCuenta] = useState<any | null>(null);
  const [cargandoInicial, setCargandoInicial] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [guardandoLegajo, setGuardandoLegajo] = useState(false);
  const [generandoVistaPrevia, setGenerandoVistaPrevia] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);

  // Estados de Eventos y Pedidos (SIN auto-selección)
  const [misPedidos, setMisPedidos] = useState<any[]>([]);
  const [eventosActivos, setEventosActivos] = useState<any[]>([]);
  const [cargandoEventos, setCargandoEventos] = useState(true);
  const [eventoSeleccionado, setEventoSeleccionado] = useState<any | null>(null);
  const [modalCargarPedidoAbierto, setModalCargarPedidoAbierto] = useState(false);
  const [pedidoAEditar, setPedidoAEditar] = useState<any | null>(null);
  const [modalTicketQR, setModalTicketQR] = useState<{ abierto: boolean; ticket: any | null }>({
    abierto: false,
    ticket: null,
  });

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
  const [verConfirmar, setVerConfirmar] = useState(false);

  const inicializarMiEspacio = useCallback(async () => {
    const usuarioActual = useAuthStore.getState().usuario;
    const asignacionesActuales = useAuthStore.getState().asignaciones;
    const targetUserId = usuarioActual?.id;

    if (!targetUserId) {
      setErrorCarga('No se pudo identificar tu usuario. Volvé a iniciar sesión.');
      setCargandoInicial(false);
      return;
    }

    setCargandoInicial(true);
    setErrorCarga(null);

    try {
      api
        .get(`/tesoreria/estado-cuenta/${targetUserId}`)
        .then((res) => setEstadoCuenta(res.data))
        .catch(() => {});

      const [resPlantillas, resMiembro] = await Promise.all([
        api.get(`/legajos/plantillas?cicloAnio=${obtenerCicloAnioActual()}`).catch(() => ({
          data: [],
        })),
        api.get(`/miembros/${targetUserId}`).catch(() => ({ data: null })),
      ]);

      let listaPlantillas: any[] = Array.isArray(resPlantillas.data) ? resPlantillas.data : [];
      if (listaPlantillas.length === 0) {
        const resTodas = await api.get('/legajos/plantillas').catch(() => ({ data: [] }));
        listaPlantillas = Array.isArray(resTodas.data) ? resTodas.data : [];
      }

      const perfilMiembro = resMiembro.data || usuarioActual;

      if (listaPlantillas.length === 0) {
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

      const plantilla =
        seleccionarPlantillaPorMiembro(listaPlantillas, perfilMiembro, asignacionesActuales) ||
        listaPlantillas[0];
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
      setPrecarga(datosPrecarga);
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
      setEventoSeleccionado((prev: any) =>
        prev ? evList.find((e: any) => e.id === prev.id) || prev : null,
      );
    } finally {
      setCargandoEventos(false);
    }
  }, []);

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

  const valoresFormularioIniciales = {
    protagonista_telefono: precarga?.usuario?.telefonoContacto || '',
    protagonista_domicilio:
      (precarga?.usuario?.datosFijosJson as any)?.protagonista_domicilio ||
      (precarga?.usuario?.datosFijosJson as any)?.domicilio ||
      '',
    ...(precarga?.datosFamiliaresSugeridos || {}),
    ...(precarga?.usuario?.datosFijosJson || {}),
    ...(precarga?.ultimaEntrega?.respuestasSnapshotJson || {}),
  };

  const generarBytesPdfPropio = async (): Promise<Uint8Array> => {
    const entrega = precarga?.ultimaEntrega;
    const mapeo: MapeoPdf = plantillaSeleccionada?.mapeoPdfJson || { pdfBaseUrl: '', campos: {} };
    const usuarioParaPdf = obtenerDatosUsuarioPdf();
    const respuestas = entrega?.respuestasSnapshotJson || valoresFormularioIniciales;

    return await generarFichaPdf(
      mapeo,
      respuestas,
      entrega?.hashVerificacion || `FICHA-${usuarioParaPdf.dni}-${obtenerCicloAnioActual()}`,
      usuarioParaPdf,
      entrega?.versionImpresion || 1,
    );
  };

  const handleVerCopiaPdf = async () => {
    if (!plantillaSeleccionada) return;
    setGenerandoVistaPrevia(true);
    try {
      const pdfBytes = await generarBytesPdfPropio();
      if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
      setPdfPreviewUrl(crearUrlPdfBlob(pdfBytes));
    } catch (err) {
      mostrarToast(traducirErrorAmigable(err, 'No se pudo visualizar el PDF.'), 'error');
    } finally {
      setGenerandoVistaPrevia(false);
    }
  };

  const handleDescargarCopiaPdf = async () => {
    if (!plantillaSeleccionada) return;
    setGuardandoLegajo(true);
    try {
      const usuarioParaPdf = obtenerDatosUsuarioPdf();
      const pdfBytes = await generarBytesPdfPropio();
      descargarPdfBlob(pdfBytes, `Ficha_${usuarioParaPdf.apellido}_${usuarioParaPdf.nombre}.pdf`);
      mostrarToast('PDF descargado listo para imprimir.', 'exito');
    } catch (err) {
      mostrarToast(traducirErrorAmigable(err, 'No se pudo generar el PDF.'), 'error');
    } finally {
      setGuardandoLegajo(false);
    }
  };

  const handleSubmitFormulario = async (
    datos: Record<string, unknown>,
    finalizarParaFirma: boolean,
  ) => {
    if (!isOnline) {
      mostrarToast(
        'Estás sin conexión. Conectate a internet para enviar tu legajo al servidor.',
        'advertencia',
      );
      return;
    }
    const targetUserId = precarga?.usuario?.id || usuario?.id;
    if (!targetUserId || !plantillaSeleccionada) return;
    setGuardandoLegajo(true);

    try {
      const res = await api.post('/legajos/entregas', {
        usuarioId: targetUserId,
        plantillaId: plantillaSeleccionada.id,
        cicloAnio: plantillaSeleccionada.cicloAnio || obtenerCicloAnioActual(),
        respuestas: datos,
        finalizarParaFirma,
        actualizarDatosFijos: true,
      });

      const entrega = res.data;

      if (finalizarParaFirma && entrega.hashVerificacion) {
        const mapeo: MapeoPdf = plantillaSeleccionada.mapeoPdfJson || { pdfBaseUrl: '', campos: {} };
        const usuarioParaPdf = obtenerDatosUsuarioPdf();
        const pdfBytes = await generarFichaPdf(
          mapeo,
          datos,
          entrega.hashVerificacion,
          usuarioParaPdf,
          entrega.versionImpresion,
        );
        descargarPdfBlob(pdfBytes, `Ficha_${usuarioParaPdf.apellido}_${usuarioParaPdf.nombre}.pdf`);
        mostrarToast('¡Listo! Imprimí y entregá el papel firmado a tu educador.', 'exito');
      } else {
        mostrarToast('Avance guardado.', 'exito');
      }

      await inicializarMiEspacio();
    } catch (err) {
      mostrarToast(traducirErrorAmigable(err, 'No se pudo guardar el formulario.'), 'error');
    } finally {
      setGuardandoLegajo(false);
    }
  };

  const handleGuardarContacto = async (e: React.FormEvent) => {
    e.preventDefault();
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

    if (nueva.length < 8) {
      setAlertaClave({
        tipo: 'error',
        texto: 'La nueva contraseña debe tener al menos 8 caracteres.',
      });
      return;
    }
    if (nueva !== confirmar) {
      setAlertaClave({ tipo: 'error', texto: 'Las contraseñas nuevas no coinciden.' });
      return;
    }
    if (nueva === actual) {
      setAlertaClave({
        tipo: 'error',
        texto: 'La nueva contraseña debe ser distinta de la actual.',
      });
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
    () => eventosActivos.filter((e) => e.estado !== 'PUBLICADO'),
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

  const tabsItems: readonly SegmentedTabItem<TabMiEspacio>[] = [
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

  // Datos de perfil
  const asigPrincipal =
    perfil?.asignaciones?.find((a: any) => a.activo !== false) ?? perfil?.asignaciones?.[0];
  const cfgRamaPerfil = obtenerConfigRama(asigPrincipal ? { asignaciones: [asigPrincipal] } : null);
  const hermanos = (perfil?.grupoFamiliar?.miembros || []).filter((h: any) => h.id !== perfil?.id);
  const asignacionesActivasPerfil = (perfil?.asignaciones || []).filter((a: any) => a.activo);

  return (
    <div className="s-anim-view max-w-4xl mx-auto space-y-4">
      {/* Cabecera Compacta + Navegación 4 tabs */}
      <section className="s-card rounded-2xl p-4 sm:p-5 space-y-3.5 min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 min-w-0">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg sm:text-xl font-extrabold text-ink truncate">
                {nombreVisible} {apellidoVisible}
              </h1>
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border whitespace-nowrap shrink-0 ${fichaConfig.badgeClass}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${fichaConfig.dotClass}`} />
                <span>{fichaConfig.label}</span>
              </span>
            </div>
            <p className="text-xs text-ink-muted truncate">
              DNI {dniVisible}
              {unidadPrincipalNombre ? ` · ${unidadPrincipalNombre}` : ''}
              {` · Ciclo ${cicloActual}`}
            </p>
          </div>

          {tabActiva === 'legajo' && plantillaSeleccionada && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleVerCopiaPdf}
                disabled={generandoVistaPrevia}
                className="s-btn-sec s-touch flex-1 sm:flex-initial px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {generandoVistaPrevia ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Eye className="w-4 h-4 text-brand" />
                )}
                <span>Ver Ficha</span>
              </button>

              <button
                type="button"
                onClick={handleDescargarCopiaPdf}
                disabled={guardandoLegajo}
                className="s-btn-brand s-touch flex-1 sm:flex-initial px-4 py-2 rounded-xl text-xs inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {guardandoLegajo ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                <span>Descargar PDF</span>
              </button>
            </div>
          )}
        </div>

        <div className="pt-2 border-t border-rule">
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
              <span className="text-xs font-bold">Cargando formulario…</span>
            </div>
          ) : errorCarga ? (
            <div className="s-card rounded-2xl p-6 border-rose-300 dark:border-rose-900 flex flex-col items-center text-center gap-3">
              <AlertCircle className="w-8 h-8 text-rose-500" />
              <p className="text-sm font-bold text-ink">{errorCarga}</p>
              <button
                type="button"
                onClick={inicializarMiEspacio}
                className="s-btn-brand s-touch px-4 py-2 rounded-xl text-xs inline-flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Reintentar</span>
              </button>
            </div>
          ) : plantillaSeleccionada && precarga ? (
            <DynamicFormRenderer
              esquema={plantillaSeleccionada.esquemaCamposJson as EsquemaCampos}
              valoresIniciales={valoresFormularioIniciales}
              onSubmit={handleSubmitFormulario}
              cargando={guardandoLegajo}
            />
          ) : null}
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB 2: MIS CUOTAS Y RECIBOS                                       */}
      {/* ================================================================= */}
      {tabActiva === 'cuotas' && (
        <div className="s-anim-tab s-card rounded-2xl p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule pb-3">
            <span className="text-sm font-extrabold text-ink">Estado de Cuenta Personal</span>
            <div className="flex items-center gap-2 flex-wrap">
              {cargandoInicial ? (
                <div className="h-6 w-28 rounded-lg bg-paper-3 animate-pulse" />
              ) : (
                <>
                  {saldoAFavor > 0 && (
                    <span className="px-2.5 py-1 rounded-xl text-xs font-extrabold s-badge-brand whitespace-nowrap shrink-0">
                      Saldo a favor: {formatearMoneda(saldoAFavor)}
                    </span>
                  )}
                  <span
                    className={`px-2.5 py-1 rounded-xl text-xs font-extrabold whitespace-nowrap shrink-0 ${
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {cargandoInicial ? (
              Array.from({ length: 2 }).map((_, idx) => (
                <div
                  key={`skel-cuota-${idx}`}
                  className="p-3.5 rounded-xl border border-rule bg-paper-2 animate-pulse space-y-2"
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
                      className="s-panel p-3.5 rounded-xl space-y-1.5 min-w-0"
                    >
                      <div className="flex justify-between items-start gap-2">
                        <span className="font-bold text-xs text-ink truncate">
                          {cargo.concepto?.nombre}
                        </span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-md font-bold border whitespace-nowrap shrink-0 ${cConf.badgeClass}`}
                        >
                          {cConf.label}
                        </span>
                      </div>
                      <div className="text-xs text-ink-muted flex justify-between s-tabular">
                        <span>Total: {formatearMoneda(cargo.montoFinal)}</span>
                        <span className="font-bold text-ink">
                          Pagado: {formatearMoneda(cargo.montoPagado)}
                        </span>
                      </div>
                    </div>
                  );
                })}

                {(!estadoCuenta?.cargos || estadoCuenta.cargos.length === 0) && (
                  <div className="col-span-full py-6 text-center text-xs text-ink-muted">
                    No tenés cuotas pendientes este año.
                  </div>
                )}
              </>
            )}
          </div>

          {estadoCuenta?.pagos?.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-rule">
              <div className="flex items-center gap-1.5">
                <Receipt className="w-4 h-4 text-brand" />
                <h2 className="text-xs font-bold text-ink-muted uppercase tracking-wider">
                  Pagos y Recibos Realizados
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {estadoCuenta.pagos.map((pago: any) => {
                  const conceptosTexto =
                    pago.imputaciones
                      ?.map((imp: any) => imp.cargo?.concepto?.nombre)
                      .filter(Boolean)
                      .join(', ') || 'Pago de cuota';

                  return (
                    <div
                      key={pago.id}
                      className="s-panel p-3 rounded-xl flex items-center justify-between gap-2 text-xs min-w-0"
                    >
                      <div className="min-w-0">
                        <span className="font-bold text-ink block truncate">{conceptosTexto}</span>
                        <span className="text-[11px] text-ink-muted">
                          {new Date(pago.fechaPago).toLocaleDateString('es-AR')} ·{' '}
                          {METODO_PAGO_LABELS[pago.metodoPago] || 'Efectivo'}
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
        <div className="s-anim-tab space-y-4">
          {cargandoEventos ? (
            <div className="s-card rounded-2xl p-8 flex flex-col items-center justify-center gap-2 text-ink-muted">
              <Loader2 className="w-6 h-6 animate-spin text-brand" />
              <span className="text-xs font-bold">Cargando campañas y pedidos…</span>
            </div>
          ) : !eventoSeleccionado ? (
            /* NIVEL 1: Catálogo de Tarjetas Tocables de Eventos */
            <div className="s-card rounded-2xl p-4 sm:p-5 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-rule pb-3">
                <div>
                  <h2 className="text-sm font-extrabold text-ink flex items-center gap-1.5">
                    <Ticket className="w-4 h-4 text-brand" />
                    <span>Elegí un Evento para ver tus Pedidos y Vales QR</span>
                  </h2>
                  <p className="text-xs text-ink-muted mt-0.5">
                    Tocá una tarjeta para cargar nuevas ventas a tu saldo o descargar tus vales QR.
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-xl text-xs font-bold s-badge-brand whitespace-nowrap shrink-0">
                  Saldo a favor: {formatearMoneda(saldoAFavor)}
                </span>
              </div>

              {eventosActivos.length === 0 ? (
                <div className="py-10 text-center space-y-2 text-ink-muted">
                  <ShoppingBag className="w-9 h-9 mx-auto opacity-50" />
                  <p className="text-xs font-semibold">
                    No hay eventos publicados en este momento.
                  </p>
                </div>
              ) : (
                <div className="space-y-5">
                  {eventosHabilitados.length > 0 && (
                    <div className="space-y-2.5">
                      <h3 className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                        Habilitados para Venta ({eventosHabilitados.length})
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {eventosHabilitados.map((ev) => {
                          const cantPedidos = conteoPedidosPorEvento.get(ev.id) || 0;
                          return (
                            <button
                              key={ev.id}
                              type="button"
                              onClick={() => setEventoSeleccionado(ev)}
                              className="s-card s-card-hover s-event-card rounded-2xl p-4 text-left flex flex-col justify-between gap-3 cursor-pointer min-w-0"
                            >
                              <div className="space-y-1.5 min-w-0 w-full">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold s-badge-ok whitespace-nowrap shrink-0">
                                    Habilitado
                                  </span>
                                  {cantPedidos > 0 && (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold s-badge-brand whitespace-nowrap shrink-0">
                                      {cantPedidos} pedido{cantPedidos === 1 ? '' : 's'}
                                    </span>
                                  )}
                                </div>
                                <h4 className="text-sm font-extrabold text-ink truncate">
                                  {ev.titulo}
                                </h4>
                                <div className="text-[11px] text-ink-muted flex flex-wrap items-center gap-x-3 gap-y-1">
                                  {ev.fechaEvento && (
                                    <span className="inline-flex items-center gap-1">
                                      <Calendar className="w-3 h-3 shrink-0" />
                                      {formatearFechaLargaUTC(ev.fechaEvento)}
                                    </span>
                                  )}
                                  {ev.lugarEntrega && (
                                    <span className="inline-flex items-center gap-1 truncate">
                                      <MapPin className="w-3 h-3 shrink-0" />
                                      <span className="truncate">{ev.lugarEntrega}</span>
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="pt-2 border-t border-rule w-full flex items-center justify-between text-xs font-bold text-brand">
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
                    <div className="space-y-2.5">
                      <h3 className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                        Finalizados ({eventosFinalizados.length})
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {eventosFinalizados.map((ev) => {
                          const cantPedidos = conteoPedidosPorEvento.get(ev.id) || 0;
                          return (
                            <button
                              key={ev.id}
                              type="button"
                              onClick={() => setEventoSeleccionado(ev)}
                              className="s-card s-card-hover s-event-card rounded-2xl p-4 text-left flex flex-col justify-between gap-3 cursor-pointer opacity-90 min-w-0"
                            >
                              <div className="space-y-1.5 min-w-0 w-full">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold s-badge-info whitespace-nowrap shrink-0">
                                    Finalizado
                                  </span>
                                  {cantPedidos > 0 && (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold s-badge-brand whitespace-nowrap shrink-0">
                                      {cantPedidos} pedido{cantPedidos === 1 ? '' : 's'}
                                    </span>
                                  )}
                                </div>
                                <h4 className="text-sm font-extrabold text-ink truncate">
                                  {ev.titulo}
                                </h4>
                                {ev.fechaEvento && (
                                  <div className="text-[11px] text-ink-muted inline-flex items-center gap-1">
                                    <Calendar className="w-3 h-3 shrink-0" />
                                    {formatearFechaLargaUTC(ev.fechaEvento)}
                                  </div>
                                )}
                              </div>
                              <div className="pt-2 border-t border-rule w-full flex items-center justify-between text-xs font-bold text-ink-2">
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
            <div className="s-card rounded-2xl p-4 sm:p-5 space-y-4">
              {/* Banner "Evento seleccionado" + Cambiar */}
              <div className="s-panel rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => {
                        setEventoSeleccionado(null);
                        setModalCargarPedidoAbierto(false);
                        setModalTicketQR({ abierto: false, ticket: null });
                      }}
                      className="s-btn-sec min-h-[34px] px-2.5 py-1 rounded-xl text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Cambiar evento</span>
                    </button>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap shrink-0 ${
                        eventoSeleccionado.estado === 'PUBLICADO' ? 's-badge-ok' : 's-badge-info'
                      }`}
                    >
                      {eventoSeleccionado.estado === 'PUBLICADO' ? 'Habilitado' : 'Finalizado'}
                    </span>
                  </div>
                  <div className="text-xs font-bold uppercase tracking-wider text-brand">
                    Evento seleccionado
                  </div>
                  <h2 className="text-base sm:text-lg font-extrabold text-ink truncate">
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
                    className="s-btn-brand s-touch px-4 py-2 rounded-xl text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <PlusCircle className="w-4 h-4" />
                    <span>Cargar Nueva Venta</span>
                  </button>
                ) : (
                  <span className="px-3 py-1.5 rounded-xl s-badge-info text-xs font-bold inline-flex items-center gap-1.5 shrink-0">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Cerrado a nuevas ventas</span>
                  </span>
                )}
              </div>

              {/* Resumen KPI del Evento */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                  icon={<Sparkles className="w-4 h-4" />}
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
                  <ShoppingBag className="w-8 h-8 text-ink-muted mx-auto" />
                  <p className="text-xs font-medium text-ink-muted max-w-sm mx-auto">
                    {eventoSeleccionado.estado === 'PUBLICADO'
                      ? 'Aún no registraste ventas para este evento. Hacé clic en "Cargar Nueva Venta" para sumar ganancia a tu saldo.'
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
                        className="s-panel rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                      >
                        <div className="space-y-1.5 min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-extrabold text-ink">Pedido #{p.id}</span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap shrink-0 ${
                                p.estado === 'PAGADO' ? 's-badge-ok' : 's-badge-warn'
                              }`}
                            >
                              {p.estado === 'PAGADO' ? 'Pagado' : 'Pendiente de cobro'}
                            </span>
                          </div>

                          <p className="text-xs font-bold text-ink">
                            Cliente: {p.compradorNombre}
                            {p.compradorContacto && (
                              <span className="text-ink-muted font-normal ml-1">
                                ({p.compradorContacto})
                              </span>
                            )}
                          </p>

                          <div className="text-xs text-ink-muted flex flex-wrap gap-x-2 gap-y-0.5">
                            {p.detalles?.map((d: any) => (
                              <span key={d.id}>
                                <strong className="text-ink">{d.cantidad}x</strong> {d.item?.nombre}
                              </span>
                            ))}
                          </div>

                          <div className="flex items-center gap-3 flex-wrap pt-1 text-xs s-tabular">
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
                          <div className="flex items-center gap-1.5 flex-wrap">
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
                                className={`min-h-[36px] px-2.5 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer ${
                                  t.estado === 'UTILIZADO'
                                    ? 's-btn-sec line-through opacity-70'
                                    : 's-btn-brand'
                                }`}
                              >
                                <QrCode className="w-3.5 h-3.5" />
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
                              className="s-btn-sec px-2.5 py-1 rounded-lg text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Edit2 className="w-3 h-3" />
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
        <div className="s-anim-tab space-y-4">
          {cargandoPerfil ? (
            <div className="s-card rounded-2xl p-6 flex items-center justify-center gap-2 text-ink-muted">
              <Loader2 className="w-5 h-5 animate-spin text-brand" />
              <span className="text-xs font-bold">Cargando tu perfil…</span>
            </div>
          ) : (
            <>
              {/* Identidad y asignaciones activas */}
              <div className="s-card rounded-2xl p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div
                      className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black text-lg shrink-0 ${
                        cfgRamaPerfil?.avatarClases || 'bg-brand text-brand-contrast'
                      }`}
                    >
                      {perfil?.nombre?.[0] || usuario?.nombre?.[0] || ''}
                      {perfil?.apellido?.[0] || usuario?.apellido?.[0] || ''}
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-lg font-extrabold text-ink truncate">
                        {perfil?.nombre || usuario?.nombre}{' '}
                        {perfil?.apellido || usuario?.apellido}
                      </h2>
                      <p className="text-xs text-ink-muted">
                        DNI {perfil?.dni || usuario?.dni} ·{' '}
                        {calcularEdad(perfil?.fechaNacimiento) ?? '—'} años
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {asignacionesActivasPerfil.map((a: any) => {
                      const c = obtenerConfigRama({ asignaciones: [a] });
                      return (
                        <span
                          key={a.id}
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold border whitespace-nowrap shrink-0 ${
                            c?.badgeClases || 's-badge-brand'
                          }`}
                        >
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>
                            {a.rol?.nombre} · {a.unidad?.nombre}
                          </span>
                        </span>
                      );
                    })}
                  </div>
                </div>

                {hermanos.length > 0 && (
                  <div className="pt-3 border-t border-rule flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-ink-muted">
                      <Users className="w-3.5 h-3.5 text-brand" />
                      Grupo Familiar:
                    </span>
                    {hermanos.map((h: any) => (
                      <span
                        key={h.id}
                        className="px-2.5 py-1 rounded-lg bg-paper-2 text-xs font-bold text-ink"
                      >
                        {h.nombre} {h.apellido} (DNI {h.dni})
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <BotonInstalarPwa variante="card" />

              {/* Formulario de Contacto y Teléfonos (11 campos) */}
              <form onSubmit={handleGuardarContacto} className="s-card rounded-2xl p-5 space-y-4">
                <div className="flex items-center gap-2 border-b border-rule pb-3">
                  <Phone className="w-4 h-4 text-brand" />
                  <div>
                    <h2 className="text-sm font-extrabold text-ink">
                      Datos de Contacto y Teléfonos
                    </h2>
                    <p className="text-[11px] text-ink-muted">
                      Información vital ante emergencias y salidas de grupo.
                    </p>
                  </div>
                </div>

                {alertaContacto && (
                  <div
                    role={alertaContacto.tipo === 'error' ? 'alert' : 'status'}
                    className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 ${
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block text-ink font-bold mb-1">Email de Contacto</label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="email"
                        placeholder="correo@ejemplo.com"
                        value={formContacto.emailContacto}
                        onChange={(e) =>
                          setFormContacto({ ...formContacto, emailContacto: e.target.value })
                        }
                        className="s-input w-full min-h-[42px] pl-9 pr-3 py-2 rounded-xl"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-ink font-bold mb-1">Teléfono del Miembro</label>
                    <div className="relative">
                      <Phone className="w-4 h-4 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="tel"
                        placeholder="Ej: 3511234567"
                        value={formContacto.telefonoContacto}
                        onChange={(e) =>
                          setFormContacto({ ...formContacto, telefonoContacto: e.target.value })
                        }
                        className="s-input w-full min-h-[42px] pl-9 pr-3 py-2 rounded-xl"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-ink font-bold mb-1">Madre: Nombre Completo</label>
                    <input
                      type="text"
                      value={formContacto.madreNombres}
                      onChange={(e) =>
                        setFormContacto({ ...formContacto, madreNombres: e.target.value })
                      }
                      className="s-input w-full min-h-[42px] px-3 py-2 rounded-xl"
                    />
                  </div>

                  <div>
                    <label className="block text-ink font-bold mb-1">Madre: Teléfono</label>
                    <input
                      type="tel"
                      value={formContacto.madreTelefono}
                      onChange={(e) =>
                        setFormContacto({ ...formContacto, madreTelefono: e.target.value })
                      }
                      className="s-input w-full min-h-[42px] px-3 py-2 rounded-xl"
                    />
                  </div>

                  <div>
                    <label className="block text-ink font-bold mb-1">Padre: Nombre Completo</label>
                    <input
                      type="text"
                      value={formContacto.padreNombres}
                      onChange={(e) =>
                        setFormContacto({ ...formContacto, padreNombres: e.target.value })
                      }
                      className="s-input w-full min-h-[42px] px-3 py-2 rounded-xl"
                    />
                  </div>

                  <div>
                    <label className="block text-ink font-bold mb-1">Padre: Teléfono</label>
                    <input
                      type="tel"
                      value={formContacto.padreTelefono}
                      onChange={(e) =>
                        setFormContacto({ ...formContacto, padreTelefono: e.target.value })
                      }
                      className="s-input w-full min-h-[42px] px-3 py-2 rounded-xl"
                    />
                  </div>

                  <div>
                    <label className="block text-ink font-bold mb-1">Tutor/a Legal: Nombre</label>
                    <input
                      type="text"
                      value={formContacto.tutorNombres}
                      onChange={(e) =>
                        setFormContacto({ ...formContacto, tutorNombres: e.target.value })
                      }
                      className="s-input w-full min-h-[42px] px-3 py-2 rounded-xl"
                    />
                  </div>

                  <div>
                    <label className="block text-ink font-bold mb-1">Tutor/a Legal: Teléfono</label>
                    <input
                      type="tel"
                      value={formContacto.tutorTelefono}
                      onChange={(e) =>
                        setFormContacto({ ...formContacto, tutorTelefono: e.target.value })
                      }
                      className="s-input w-full min-h-[42px] px-3 py-2 rounded-xl"
                    />
                  </div>

                  <div>
                    <label className="block text-ink font-bold mb-1">Teléfono de Urgencias</label>
                    <input
                      type="tel"
                      placeholder="Teléfono fijo o pariente cercano"
                      value={formContacto.telefonoUrgencias}
                      onChange={(e) =>
                        setFormContacto({ ...formContacto, telefonoUrgencias: e.target.value })
                      }
                      className="s-input w-full min-h-[42px] px-3 py-2 rounded-xl"
                    />
                  </div>

                  <div>
                    <label className="block text-ink font-bold mb-1">Obra Social / Prepaga</label>
                    <input
                      type="text"
                      value={formContacto.obraSocial}
                      onChange={(e) =>
                        setFormContacto({ ...formContacto, obraSocial: e.target.value })
                      }
                      className="s-input w-full min-h-[42px] px-3 py-2 rounded-xl"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-ink font-bold mb-1">Domicilio</label>
                    <div className="relative">
                      <MapPin className="w-4 h-4 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={formContacto.domicilio}
                        onChange={(e) =>
                          setFormContacto({ ...formContacto, domicilio: e.target.value })
                        }
                        className="s-input w-full min-h-[42px] pl-9 pr-3 py-2 rounded-xl"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    disabled={guardandoContacto}
                    className="s-btn-brand s-touch px-5 py-2.5 rounded-xl text-xs inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
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
              <form onSubmit={handleCambiarClave} className="s-card rounded-2xl p-5 space-y-4">
                <div className="flex items-center gap-2 border-b border-rule pb-3">
                  <KeyRound className="w-4 h-4 text-brand" />
                  <div>
                    <h2 className="text-sm font-extrabold text-ink">Cambiar Contraseña</h2>
                    <p className="text-[11px] text-ink-muted">
                      Mínimo 8 caracteres. Tu sesión actual seguirá activa al actualizarla.
                    </p>
                  </div>
                </div>

                {alertaClave && (
                  <div
                    role={alertaClave.tipo === 'error' ? 'alert' : 'status'}
                    className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 ${
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

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <label className="block text-ink font-bold mb-1">Contraseña Actual</label>
                    <div className="relative">
                      <input
                        type={verActual ? 'text' : 'password'}
                        required
                        value={formClave.passwordActual}
                        onChange={(e) =>
                          setFormClave({ ...formClave, passwordActual: e.target.value })
                        }
                        className="s-input w-full min-h-[42px] pl-3 pr-10 py-2 rounded-xl"
                      />
                      <button
                        type="button"
                        onClick={() => setVerActual((v) => !v)}
                        aria-label="Mostrar u ocultar clave actual"
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink cursor-pointer"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-ink font-bold mb-1">Nueva Contraseña</label>
                    <div className="relative">
                      <input
                        type={verNueva ? 'text' : 'password'}
                        required
                        value={formClave.passwordNueva}
                        onChange={(e) =>
                          setFormClave({ ...formClave, passwordNueva: e.target.value })
                        }
                        className="s-input w-full min-h-[42px] pl-3 pr-10 py-2 rounded-xl"
                      />
                      <button
                        type="button"
                        onClick={() => setVerNueva((v) => !v)}
                        aria-label="Mostrar u ocultar clave nueva"
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink cursor-pointer"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-ink font-bold mb-1">Confirmar Nueva</label>
                    <div className="relative">
                      <input
                        type={verConfirmar ? 'text' : 'password'}
                        required
                        value={formClave.confirmar}
                        onChange={(e) =>
                          setFormClave({ ...formClave, confirmar: e.target.value })
                        }
                        className="s-input w-full min-h-[42px] pl-3 pr-10 py-2 rounded-xl"
                      />
                      <button
                        type="button"
                        onClick={() => setVerConfirmar((v) => !v)}
                        aria-label="Mostrar u ocultar confirmación"
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink cursor-pointer"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    disabled={guardandoClave}
                    className="s-btn-sec s-touch px-5 py-2.5 rounded-xl text-xs font-bold inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
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
        subtitulo={plantillaSeleccionada?.nombre || `Planilla Oficial ${cicloActual}`}
        mode="sheet"
        allowFullscreen={true}
        maxWidthClass="sm:max-w-4xl"
      >
        {pdfPreviewUrl && (
          <Suspense
            fallback={
              <div className="py-12 flex items-center justify-center gap-2 text-ink-muted">
                <Loader2 className="w-5 h-5 animate-spin text-brand" />
                <span className="text-xs font-bold">Preparando visor PDF…</span>
              </div>
            }
          >
            <PdfViewerModal
              url={pdfPreviewUrl}
              titulo={`Vista Previa: ${apellidoVisible}, ${nombreVisible}`}
              subtitulo={plantillaSeleccionada?.nombre || `Planilla Oficial ${cicloActual}`}
              embedded={true}
              onCerrar={cerrarVistaPreviaPdf}
              onDescargar={handleDescargarCopiaPdf}
            />
          </Suspense>
        )}
      </Drawer>
    </div>
  );
};
