import React, { lazy, Suspense, useEffect, useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import { DynamicFormRenderer, type EsquemaCampos } from '../../components/DynamicFormRenderer';
import { Navbar } from '../../components/Navbar';
import {
  descargarPdfBlob,
  crearUrlPdfBlob,
  generarFichaPdf,
  type MapeoPdf,
} from '../../services/pdfGenerator';
import { useAuthStore } from '../../store/authStore';
import {
  ESTADO_CARGO_CONFIG,
  ESTADO_FICHA_CONFIG,
  METODO_PAGO_LABELS,
  esErrorOffline,
  formatearMoneda,
  obtenerCicloAnioActual,
  obtenerRolPrincipal,
  seleccionarPlantillaPorMiembro,
  traducirErrorAmigable,
} from '../../lib/formatters';
import {
  FileText,
  CreditCard,
  Download,
  Receipt,
  X,
  RotateCcw,
  Loader2,
  AlertCircle,
  Eye,
  ShoppingBag,
  Sparkles,
  PlusCircle,
  QrCode,
  Edit2,
  Clock,
} from 'lucide-react';
import { ModalCargarPedidoEvento } from '../../components/ModalCargarPedidoEvento';
import { ModalTicketQR } from '../../components/ModalTicketQR';

const PdfViewerModal = lazy(() =>
  import('../../components/PdfViewerModal').then((m) => ({ default: m.PdfViewerModal })),
);

type VistaAutogestion = 'papeles' | 'cuotas' | 'eventos';
const VISTAS_VALIDAS: VistaAutogestion[] = ['papeles', 'cuotas', 'eventos'];

export const AutogestionPage: React.FC = () => {
  const { usuario, asignaciones } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [vistaActiva, setVistaActiva] = useState<VistaAutogestion>(() => {
    const desdeUrl = searchParams.get('vista') as VistaAutogestion | null;
    return desdeUrl && VISTAS_VALIDAS.includes(desdeUrl) ? desdeUrl : 'papeles';
  });

  // Sincronizar vista activa con searchParams (al presionar Atrás/Adelante en el navegador/móvil)
  useEffect(() => {
    const desdeUrl = searchParams.get('vista') as VistaAutogestion | null;
    const vistaValida = desdeUrl && VISTAS_VALIDAS.includes(desdeUrl) ? desdeUrl : 'papeles';
    if (vistaValida !== vistaActiva) {
      setVistaActiva(vistaValida);
    }
  }, [searchParams]);

  const cambiarVista = (nuevaVista: VistaAutogestion) => {
    if (nuevaVista === vistaActiva) return;
    setVistaActiva(nuevaVista);
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.set('vista', nuevaVista);
        return params;
      },
    );
  };
  const [plantillaSeleccionada, setPlantillaSeleccionada] = useState<any | null>(null);
  const [precarga, setPrecarga] = useState<any | null>(null);
  const [cargandoInicial, setCargandoInicial] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [generandoVistaPrevia, setGenerandoVistaPrevia] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [toast, setToast] = useState<{ texto: string; tipo: 'exito' | 'error' } | null>(null);
  const [estadoCuenta, setEstadoCuenta] = useState<any | null>(null);

  // Estados para Eventos y Vales QR
  const [misPedidos, setMisPedidos] = useState<any[]>([]);
  const [eventosActivos, setEventosActivos] = useState<any[]>([]);
  const [cargandoEventos, setCargandoEventos] = useState(true);
  const [modalCargarPedidoAbierto, setModalCargarPedidoAbierto] = useState(false);
  const [pedidoAEditar, setPedidoAEditar] = useState<any | null>(null);
  const [eventoParaCargar, setEventoParaCargar] = useState<any | null>(null);
  const [modalTicketQR, setModalTicketQR] = useState<{ abierto: boolean; ticket: any | null }>({
    abierto: false,
    ticket: null,
  });

  const eventosHabilitados = useMemo(
    () => eventosActivos.filter((e) => e.estado === 'PUBLICADO'),
    [eventosActivos],
  );
  const eventosFinalizados = useMemo(
    () => eventosActivos.filter((e) => e.estado !== 'PUBLICADO'),
    [eventosActivos],
  );

  const pedidosEventoSeleccionado = useMemo(() => {
    if (!eventoParaCargar) return misPedidos;
    return misPedidos.filter(
      (p) => p.eventoId === eventoParaCargar.id || p.evento?.id === eventoParaCargar.id,
    );
  }, [misPedidos, eventoParaCargar]);

  const mostrarToast = (texto: string, tipo: 'exito' | 'error' = 'exito') => {
    if (
      tipo === 'error' &&
      (texto.toLowerCase().includes('sin conexión') ||
        texto.toLowerCase().includes('sin conexion') ||
        texto.toLowerCase().includes('offline') ||
        texto.toLowerCase().includes('network error') ||
        (typeof navigator !== 'undefined' && !navigator.onLine))
    ) {
      return;
    }
    setToast({ texto, tipo });
  };

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const inicializarAutogestion = useCallback(async () => {
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
        api.get(`/legajos/plantillas?cicloAnio=${obtenerCicloAnioActual()}`).catch(() => ({ data: [] })),
        api.get(`/miembros/${targetUserId}`).catch(() => ({ data: null })),
      ]);
      let listaPlantillas: any[] = Array.isArray(resPlantillas.data) ? resPlantillas.data : [];

      if (listaPlantillas.length === 0) {
        const resTodas = await api.get('/legajos/plantillas').catch(() => ({ data: [] }));
        listaPlantillas = Array.isArray(resTodas.data) ? resTodas.data : [];
      }

      const perfilMiembro = resMiembro.data || usuarioActual;

      if (listaPlantillas.length === 0) {
        const esOffline = typeof navigator !== 'undefined' && !navigator.onLine;
        if (esOffline) {
          setErrorCarga('Estás sin conexión y aún no se guardaron los formularios en este dispositivo.');
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
        // Fallback offline con los datos del usuario en sesión
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
          setPrecarga((prev: any) => prev || {
            usuario: usuarioActual,
            plantilla: null,
            ultimaEntrega: null,
            datosFamiliaresSugeridos: {},
          });
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
  }, [usuario?.id]);

  useEffect(() => {
    inicializarAutogestion();
  }, [inicializarAutogestion]);

  const cargarMisPedidosYEventos = useCallback(async () => {
    setCargandoEventos(true);
    try {
      const [resPedidos, resEventos] = await Promise.all([
        api.get('/tesoreria/mis-pedidos').catch(() => ({ data: [] })),
        api.get('/tesoreria/eventos').catch(() => ({ data: [] })),
      ]);
      const pedList = Array.isArray(resPedidos.data) ? resPedidos.data : [];
      setMisPedidos(pedList);

      const evList = Array.isArray(resEventos.data) ? resEventos.data : [];
      setEventosActivos(evList);
      if (evList.length > 0) {
        setEventoParaCargar((prev: any) => {
          if (prev) return prev;
          const primerPublicado = evList.find((e: any) => e.estado === 'PUBLICADO');
          return primerPublicado || evList[0];
        });
      }
    } catch {
      // Ignorar
    } finally {
      setCargandoEventos(false);
    }
  }, []);

  useEffect(() => {
    if (vistaActiva === 'eventos') {
      cargarMisPedidosYEventos();
    }
  }, [vistaActiva, cargarMisPedidosYEventos]);

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
    const mapeo: MapeoPdf = plantillaSeleccionada.mapeoPdfJson;
    const usuarioParaPdf = obtenerDatosUsuarioPdf();
    const respuestas = entrega?.respuestasSnapshotJson || valoresFormularioIniciales;

    return await generarFichaPdf(
      mapeo,
      respuestas,
      entrega?.hashVerificacion || `FICHA-${usuarioParaPdf.dni}-2026`,
      usuarioParaPdf,
      entrega?.versionImpresion || 1,
    );
  };

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
    setGuardando(true);
    try {
      const usuarioParaPdf = obtenerDatosUsuarioPdf();
      const pdfBytes = await generarBytesPdfPropio();

      descargarPdfBlob(pdfBytes, `Ficha_${usuarioParaPdf.apellido}_${usuarioParaPdf.nombre}.pdf`);
      mostrarToast('PDF descargado listo para imprimir.');
    } catch (err) {
      mostrarToast(traducirErrorAmigable(err, 'No se pudo generar el PDF.'), 'error');
    } finally {
      setGuardando(false);
    }
  };

  const handleSubmitFormulario = async (
    datos: Record<string, unknown>,
    finalizarParaFirma: boolean,
  ) => {
    const targetUserId = precarga?.usuario?.id || usuario?.id;
    if (!targetUserId || !plantillaSeleccionada) return;
    setGuardando(true);

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
        const mapeo: MapeoPdf = plantillaSeleccionada.mapeoPdfJson;
        const usuarioParaPdf = obtenerDatosUsuarioPdf();

        const pdfBytes = await generarFichaPdf(
          mapeo,
          datos,
          entrega.hashVerificacion,
          usuarioParaPdf,
          entrega.versionImpresion,
        );

        descargarPdfBlob(pdfBytes, `Ficha_${usuarioParaPdf.apellido}_${usuarioParaPdf.nombre}.pdf`);
        mostrarToast('¡Listo! Imprimí y entregá el papel firmado a tu educador.');
      } else {
        mostrarToast('Avance guardado.');
      }

      await inicializarAutogestion();
    } catch (err) {
      mostrarToast(traducirErrorAmigable(err, 'No se pudo guardar el formulario.'), 'error');
    } finally {
      setGuardando(false);
    }
  };

  const estadoActual = precarga?.ultimaEntrega?.estado || 'SIN_FICHA';
  const fichaConfig = ESTADO_FICHA_CONFIG[estadoActual] || ESTADO_FICHA_CONFIG.SIN_FICHA;
  const nombreVisible = precarga?.usuario?.nombre || usuario?.nombre || '';
  const apellidoVisible = precarga?.usuario?.apellido || usuario?.apellido || '';
  const dniVisible = precarga?.usuario?.dni || usuario?.dni || '';
  const saldoPendiente = Number(estadoCuenta?.resumen?.saldoPendiente || 0);

  return (
    <div className="min-h-screen bg-paper text-ink pb-24 sm:pb-10 transition-colors">
      <Navbar />

      {/* Modal Visor de PDF en pantalla sin descarga obligatoria (compatible con celulares Android/iOS) */}
      {pdfPreviewUrl && (
        <Suspense fallback={null}>
          <PdfViewerModal
            url={pdfPreviewUrl}
            titulo={`Vista Previa: ${apellidoVisible}, ${nombreVisible}`}
            subtitulo={plantillaSeleccionada?.nombre || `Planilla Oficial ${obtenerCicloAnioActual()}`}
            onCerrar={cerrarVistaPreviaPdf}
            onDescargar={handleDescargarCopiaPdf}
          />
        </Suspense>
      )}

      {toast && (
        <div
          role={toast.tipo === 'error' ? 'alert' : 'status'}
          className="fixed bottom-20 sm:bottom-6 right-4 left-4 sm:left-auto sm:max-w-sm z-50 animate-in fade-in slide-in-from-bottom-4 duration-200"
        >
          <div
            className={`p-3.5 rounded-2xl shadow-lg border flex items-center justify-between gap-3 text-xs font-bold ${
              toast.tipo === 'exito'
                ? 'bg-brand text-brand-contrast border-brand font-extrabold'
                : 'bg-rose-900 text-white border-rose-700'
            }`}
          >
            <span className="leading-snug">{toast.texto}</span>
            <button
              onClick={() => setToast(null)}
              aria-label="Cerrar aviso"
              className="p-1 opacity-80 hover:opacity-100 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <main className="max-w-4xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-4">
        {/* Cabecera Compacta + Acciones 1-Tap Ver / Descargar PDF */}
        <div className="bg-surface rounded-2xl p-4 border border-rule shadow-2xs space-y-3 transition-colors">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-extrabold text-ink">
                  {nombreVisible} {apellidoVisible}
                </h1>
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${fichaConfig.badgeClass}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${fichaConfig.dotClass}`} />
                  <span>{fichaConfig.label}</span>
                </span>
              </div>
              <p className="text-xs text-ink-muted mt-0.5">
                DNI {dniVisible}
                {obtenerRolPrincipal(precarga?.usuario)?.unidad?.nombre && (
                  <span className="ml-1.5 font-bold text-brand">
                    • {obtenerRolPrincipal(precarga?.usuario)?.unidad?.nombre}
                  </span>
                )}
              </p>
            </div>

            {plantillaSeleccionada && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleVerCopiaPdf}
                  disabled={generandoVistaPrevia}
                  className="flex-1 sm:flex-initial min-h-[44px] px-3.5 py-2 rounded-xl bg-paper-2 hover:bg-surface text-ink border border-rule text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer transition-colors disabled:opacity-50"
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
                  disabled={guardando}
                  className="flex-1 sm:flex-initial min-h-[44px] px-4 py-2 rounded-xl bg-brand text-brand-contrast hover:opacity-95 text-xs font-extrabold flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-2xs disabled:opacity-50"
                >
                  {guardando ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  <span>Descargar PDF</span>
                </button>
              </div>
            )}
          </div>

          {/* Selector Rápido de Vista (Papeles vs Cuotas vs Eventos) */}
          <nav
            aria-label="Secciones de mi legajo"
            className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-rule"
          >
            <button
              type="button"
              onClick={() => cambiarVista('papeles')}
              aria-current={vistaActiva === 'papeles' ? 'page' : undefined}
              className={`min-h-[42px] px-3 py-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                vistaActiva === 'papeles'
                  ? 'bg-brand text-brand-contrast shadow-2xs'
                  : 'bg-paper-2 text-ink-2 hover:bg-surface hover:text-ink'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>Ficha y Papeles</span>
            </button>

            <button
              type="button"
              onClick={() => cambiarVista('cuotas')}
              aria-current={vistaActiva === 'cuotas' ? 'page' : undefined}
              className={`min-h-[42px] px-3 py-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                vistaActiva === 'cuotas'
                  ? 'bg-brand text-brand-contrast shadow-2xs'
                  : 'bg-paper-2 text-ink-2 hover:bg-surface hover:text-ink'
              }`}
            >
              <CreditCard className="w-4 h-4" />
              <span>Mis Cuotas</span>
              {saldoPendiente > 0 && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                    vistaActiva === 'cuotas'
                      ? 'bg-brand-contrast text-brand'
                      : 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                  }`}
                >
                  {formatearMoneda(saldoPendiente)}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => cambiarVista('eventos')}
              aria-current={vistaActiva === 'eventos' ? 'page' : undefined}
              className={`min-h-[42px] px-3 py-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                vistaActiva === 'eventos'
                  ? 'bg-brand text-brand-contrast shadow-2xs'
                  : 'bg-paper-2 text-ink-2 hover:bg-surface hover:text-ink'
              }`}
            >
              <ShoppingBag className="w-4 h-4" />
              <span>Eventos y Vales QR</span>
              {misPedidos.length > 0 && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                    vistaActiva === 'eventos'
                      ? 'bg-brand-contrast text-brand'
                      : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
                  }`}
                >
                  {misPedidos.length}
                </span>
              )}
            </button>
          </nav>
        </div>

        {/* VISTA 1: PAPELES / FORMULARIO */}
        {vistaActiva === 'papeles' && (
          <div>
            {cargandoInicial ? (
              <div className="bg-surface rounded-2xl p-8 border border-rule flex flex-col items-center justify-center gap-3 text-ink-muted">
                <Loader2 className="w-6 h-6 animate-spin text-brand" />
                <span className="text-xs font-bold">Cargando formulario…</span>
              </div>
            ) : errorCarga ? (
              <div className="bg-surface rounded-2xl p-6 border border-rose-200 dark:border-rose-900/60 flex flex-col items-center text-center gap-3">
                <AlertCircle className="w-8 h-8 text-rose-500" />
                <p className="text-sm font-bold text-ink">{errorCarga}</p>
                <button
                  type="button"
                  onClick={inicializarAutogestion}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-brand text-brand-contrast hover:opacity-90 active:opacity-100 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
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
                cargando={guardando}
              />
            ) : null}
          </div>
        )}

        {/* VISTA 2: MIS CUOTAS (Tarjetas Compactas Mobile-First) */}
        {vistaActiva === 'cuotas' && (
          <div className="bg-surface rounded-2xl p-4 sm:p-5 border border-rule shadow-2xs space-y-4 transition-colors">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule pb-3">
              <span className="text-sm font-extrabold text-ink">
                Estado de Cuenta
              </span>
              <div className="flex items-center gap-2 flex-wrap">
                {cargandoInicial ? (
                  <div className="h-6 w-28 rounded-lg bg-paper-3 animate-pulse" />
                ) : (
                  <>
                    {Number(estadoCuenta?.resumen?.saldoAFavor || 0) > 0 && (
                      <span className="px-2.5 py-1 rounded-xl text-xs font-extrabold bg-brand/10 text-brand border border-brand/30">
                        Saldo a favor: {formatearMoneda(estadoCuenta.resumen.saldoAFavor)}
                      </span>
                    )}
                    <span
                      className={`text-base font-black ${
                        saldoPendiente > 0
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-brand'
                      }`}
                    >
                      {saldoPendiente > 0 ? `Deuda: ${formatearMoneda(saldoPendiente)}` : 'Cuotas al día'}
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
                    className="p-3 rounded-xl border border-rule bg-paper-2 space-y-1.5"
                  >
                    <div className="flex justify-between items-start gap-2">
                      <span className="font-bold text-xs text-ink">
                        {cargo.concepto?.nombre}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold border ${cConf.badgeClass}`}>
                        {cConf.label}
                      </span>
                    </div>
                    <div className="text-xs text-ink-muted flex justify-between">
                      <span>Total: {formatearMoneda(cargo.montoFinal)}</span>
                      <span className="font-bold text-ink-2">
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
                  <h3 className="text-xs font-bold text-ink-muted">Pagos realizados</h3>
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
                        className="p-3 rounded-xl bg-paper-2 border border-rule flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0">
                          <span className="font-bold text-ink block truncate">
                            {conceptosTexto}
                          </span>
                          <span className="text-[11px] text-ink-muted">
                            {new Date(pago.fechaPago).toLocaleDateString('es-AR')} •{' '}
                            {METODO_PAGO_LABELS[pago.metodoPago] || 'Efectivo'}
                          </span>
                        </div>
                        <span className="font-extrabold text-ink shrink-0">
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

        {/* VISTA 3: MIS VENTAS Y VALES QR */}
        {vistaActiva === 'eventos' && (
          <div className="bg-surface rounded-2xl p-4 sm:p-5 border border-rule shadow-2xs space-y-4 transition-colors">
            {/* Header de la sección */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule pb-3">
              <div>
                <span className="text-sm font-extrabold text-ink flex items-center gap-1.5">
                  <ShoppingBag className="w-4 h-4 text-brand" />
                  Mis Ventas y Vales QR
                </span>
                <p className="text-[11px] text-ink-muted mt-0.5">
                  Cargá tus ventas para sumar ganancia a tu saldo personal y compartí los vales con tus clientes.
                </p>
              </div>

              {eventosActivos.length > 0 && eventoParaCargar?.estado === 'PUBLICADO' && (
                <button
                  type="button"
                  onClick={() => {
                    setPedidoAEditar(null);
                    setModalCargarPedidoAbierto(true);
                  }}
                  className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-brand text-brand-contrast hover:opacity-90 active:opacity-100 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>Cargar Nueva Venta</span>
                </button>
              )}
              {eventosActivos.length > 0 && eventoParaCargar && eventoParaCargar.estado !== 'PUBLICADO' && (
                <span className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-xs font-bold text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-slate-500" />
                  <span>Evento Finalizado (Cerrado a ventas)</span>
                </span>
              )}
            </div>

            {/* Selector Desplegable de Evento */}
            {eventosActivos.length > 0 && (
              <div className="flex items-center gap-2.5 flex-wrap">
                <label htmlFor="selector-evento-autogestion" className="text-xs font-bold text-ink-muted shrink-0">
                  Evento:
                </label>
                <select
                  id="selector-evento-autogestion"
                  value={eventoParaCargar?.id || ''}
                  onChange={(e) => {
                    const idSel = Number(e.target.value);
                    const encontrado = eventosActivos.find((ev) => ev.id === idSel);
                    if (encontrado) setEventoParaCargar(encontrado);
                  }}
                  className="py-1.5 px-3 rounded-xl bg-surface border border-rule text-xs font-bold text-ink focus:outline-brand cursor-pointer max-w-[280px] truncate"
                >
                  {eventosHabilitados.length > 0 && (
                    <optgroup label="🟢 Habilitados para venta">
                      {eventosHabilitados.map((ev) => (
                        <option key={ev.id} value={ev.id}>
                          {ev.titulo}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {eventosFinalizados.length > 0 && (
                    <optgroup label="⚪ Finalizados / Cerrados">
                      {eventosFinalizados.map((ev) => (
                        <option key={ev.id} value={ev.id}>
                          {ev.titulo} (Finalizado)
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>

                {eventoParaCargar && (
                  <span
                    className={`px-2.5 py-1 rounded-xl text-xs font-black flex items-center gap-1.5 border shrink-0 ${
                      eventoParaCargar.estado === 'PUBLICADO'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200 border-emerald-300 dark:border-emerald-800'
                        : 'bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300 border-slate-300 dark:border-slate-800'
                    }`}
                  >
                    {eventoParaCargar.estado === 'PUBLICADO' ? (
                      <>
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        <span>Habilitado</span>
                      </>
                    ) : (
                      <>
                        <Clock className="w-3.5 h-3.5 text-slate-500" />
                        <span>Finalizado</span>
                      </>
                    )}
                  </span>
                )}
              </div>
            )}

            {/* Aviso si el evento seleccionado está finalizado */}
            {eventoParaCargar && eventoParaCargar.estado !== 'PUBLICADO' && (
              <div className="p-3 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 flex items-center gap-2.5">
                <Clock className="w-4 h-4 text-slate-500 shrink-0" />
                <span>
                  <strong>Evento Finalizado:</strong> Este evento ya no recibe nuevas ventas. Podés consultar tus pedidos registrados y descargar o ver los vales QR ya generados.
                </span>
              </div>
            )}

            {/* Tarjetas Resumen */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3.5 rounded-2xl bg-paper-2 border border-rule flex flex-col justify-between">
                <span className="text-xs font-semibold text-ink-muted">Pedidos Registrados</span>
                {cargandoEventos ? (
                  <div className="h-7 w-12 mt-1.5 rounded-lg bg-paper-3 animate-pulse" />
                ) : (
                  <span className="text-2xl font-black text-ink mt-1">
                    {pedidosEventoSeleccionado.length}
                  </span>
                )}
              </div>

              <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex flex-col justify-between">
                <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                  Ganancia de Ventas
                </span>
                {cargandoEventos ? (
                  <div className="h-7 w-28 mt-1.5 rounded-lg bg-emerald-200/70 dark:bg-emerald-900/60 animate-pulse" />
                ) : (
                  <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
                    +{formatearMoneda(
                      pedidosEventoSeleccionado.reduce((acc, p) => acc + Number(p.totalGanancia || 0), 0),
                    )}
                  </span>
                )}
              </div>

              <div className="p-3.5 rounded-2xl bg-paper-2 border border-rule flex flex-col justify-between">
                <span className="text-xs font-semibold text-ink-muted">Saldo a Favor en Grupo</span>
                {cargandoInicial ? (
                  <div className="h-7 w-24 mt-1.5 rounded-lg bg-paper-3 animate-pulse" />
                ) : (
                  <span className="text-2xl font-black text-ink mt-1">
                    {formatearMoneda(estadoCuenta?.resumen?.saldoAFavor || 0)}
                  </span>
                )}
              </div>
            </div>

            {/* Listado de Pedidos y Vales */}
            {cargandoEventos ? (
              <div className="p-8 flex flex-col items-center justify-center gap-2 text-ink-muted">
                <Loader2 className="w-6 h-6 animate-spin text-brand" />
                <span className="text-xs font-bold">Cargando tus ventas...</span>
              </div>
            ) : pedidosEventoSeleccionado.length === 0 ? (
              <div className="p-8 rounded-2xl bg-paper-2/60 border border-rule text-center space-y-3">
                <ShoppingBag className="w-8 h-8 text-ink-muted mx-auto" />
                <p className="text-xs font-medium text-ink-muted max-w-sm mx-auto">
                  {eventoParaCargar?.estado === 'PUBLICADO'
                    ? 'Aún no registraste ventas para este evento. Hacé clic en "Cargar Nueva Venta" para empezar a sumar ganancia a tu saldo.'
                    : 'No tenés pedidos registrados en este evento finalizado.'}
                </p>
                {eventoParaCargar?.estado === 'PUBLICADO' && (
                  <button
                    type="button"
                    onClick={() => {
                      setPedidoAEditar(null);
                      setModalCargarPedidoAbierto(true);
                    }}
                    className="px-4 py-2 rounded-xl bg-brand text-brand-contrast text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-2xs hover:opacity-90"
                  >
                    <PlusCircle className="w-4 h-4" />
                    <span>Cargar Primer Pedido</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {pedidosEventoSeleccionado.map((p: any) => {
                  const algunoRetirado = p.tickets?.some((t: any) => t.estado === 'UTILIZADO');

                  return (
                    <div
                      key={p.id}
                      className="p-4 rounded-2xl bg-paper-2 border border-rule flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div className="space-y-1.5 min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-black text-ink">
                            Pedido #{p.id}
                          </span>
                          <span className="text-[11px] text-ink-muted">
                            • {p.evento?.titulo}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                              p.estado === 'PAGADO'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
                                : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200'
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

                        <div className="text-xs text-ink-muted space-x-2">
                          {p.detalles?.map((d: any) => (
                            <span key={d.id} className="inline-block">
                              <strong className="text-ink font-bold">{d.cantidad}x</strong> {d.item?.nombre}
                            </span>
                          ))}
                        </div>

                        <div className="flex items-center gap-3 pt-1 text-xs">
                          <span className="font-black text-ink">
                            Total: {formatearMoneda(Number(p.total))}
                          </span>
                          <span className="font-bold text-emerald-600 dark:text-emerald-400">
                            Tu Ganancia: +{formatearMoneda(Number(p.totalGanancia))}
                            {p.gananciaAcreditada && (
                              <span className="ml-1 text-[10px] text-emerald-500 font-normal">
                                (Acreditada en tu saldo ✓)
                              </span>
                            )}
                          </span>
                        </div>
                      </div>

                      {/* Vales QR y Acciones */}
                      <div className="flex flex-col items-start sm:items-end gap-2 shrink-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {p.tickets?.map((t: any, idx: number) => (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() =>
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
                                      evento: p.evento,
                                      vendedorUsuario: p.vendedorUsuario,
                                    },
                                  },
                                })
                              }
                              className={`px-2.5 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 border transition cursor-pointer ${
                                t.estado === 'UTILIZADO'
                                  ? 'bg-slate-100 text-slate-500 border-slate-300 dark:bg-slate-900 dark:border-slate-800 line-through'
                                  : 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700 shadow-2xs'
                              }`}
                              title={t.estado === 'UTILIZADO' ? 'Vale ya retirado' : 'Ver vale QR'}
                            >
                              <QrCode className="w-3.5 h-3.5" />
                              <span>{t.estado === 'UTILIZADO' ? `Retirado #${idx + 1}` : `Vale QR #${idx + 1}`}</span>
                            </button>
                          ))}
                        </div>

                        {!algunoRetirado && !p.gananciaAcreditada && (
                          <button
                            type="button"
                            onClick={() => {
                              setPedidoAEditar(p);
                              setEventoParaCargar(p.evento);
                              setModalCargarPedidoAbierto(true);
                            }}
                            className="px-2.5 py-1 rounded-lg text-xs font-bold text-ink-muted hover:text-brand hover:bg-paper-3 transition flex items-center gap-1 cursor-pointer"
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

        {/* Modales de Eventos para Beneficiarios */}
        {eventoParaCargar && (
          <ModalCargarPedidoEvento
            abierto={modalCargarPedidoAbierto}
            onCerrar={() => {
              setModalCargarPedidoAbierto(false);
              setPedidoAEditar(null);
            }}
            onGuardado={() => {
              cargarMisPedidosYEventos();
              inicializarAutogestion();
            }}
            eventoId={eventoParaCargar.id}
            eventoTitulo={eventoParaCargar.titulo}
            itemsEvento={eventoParaCargar.items || []}
            pedidoAEditar={pedidoAEditar}
            bloquearVendedor={true}
            vendedorFijoId={usuario?.id}
            vendedorFijoNombre={usuario ? `${usuario.nombre} ${usuario.apellido}` : ''}
            onToast={mostrarToast}
          />
        )}

        <ModalTicketQR
          abierto={modalTicketQR.abierto}
          onCerrar={() => setModalTicketQR({ abierto: false, ticket: null })}
          ticket={modalTicketQR.ticket}
        />
      </main>
    </div>
  );
};
