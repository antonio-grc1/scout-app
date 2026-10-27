import React, { useEffect, useState, useCallback } from 'react';
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
  formatearMoneda,
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
} from 'lucide-react';
import { PdfViewerModal } from '../../components/PdfViewerModal';

export const AutogestionPage: React.FC = () => {
  const { usuario, asignaciones } = useAuthStore();
  const [vistaActiva, setVistaActiva] = useState<'papeles' | 'cuotas'>('papeles');
  const [plantillaSeleccionada, setPlantillaSeleccionada] = useState<any | null>(null);
  const [precarga, setPrecarga] = useState<any | null>(null);
  const [cargandoInicial, setCargandoInicial] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [generandoVistaPrevia, setGenerandoVistaPrevia] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [toast, setToast] = useState<{ texto: string; tipo: 'exito' | 'error' } | null>(null);
  const [estadoCuenta, setEstadoCuenta] = useState<any | null>(null);

  const mostrarToast = (texto: string, tipo: 'exito' | 'error' = 'exito') => {
    setToast({ texto, tipo });
  };

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const inicializarAutogestion = useCallback(async () => {
    setCargandoInicial(true);
    setErrorCarga(null);

    try {
      let targetUserId = usuario?.id;
      let usuarioMe = usuario;
      let asignacionesMe = asignaciones;
      try {
        const resMe = await api.get('/auth/me');
        if (resMe.data?.usuario?.id) {
          targetUserId = resMe.data.usuario.id;
          usuarioMe = resMe.data.usuario;
          localStorage.setItem('scout_user', JSON.stringify(resMe.data.usuario));
          if (Array.isArray(resMe.data.asignaciones)) {
            asignacionesMe = resMe.data.asignaciones;
            localStorage.setItem('scout_asignaciones', JSON.stringify(resMe.data.asignaciones));
          }
        }
      } catch {
        // Fallback al usuario en sesión
      }

      if (!targetUserId) {
        setErrorCarga('No se pudo identificar tu usuario. Volvé a iniciar sesión.');
        setCargandoInicial(false);
        return;
      }

      api
        .get(`/tesoreria/estado-cuenta/${targetUserId}`)
        .then((res) => setEstadoCuenta(res.data))
        .catch(() => {});

      const [resPlantillas, resMiembro] = await Promise.all([
        api.get('/legajos/plantillas?cicloAnio=2026'),
        api.get(`/miembros/${targetUserId}`).catch(() => ({ data: null })),
      ]);
      let listaPlantillas: any[] = Array.isArray(resPlantillas.data) ? resPlantillas.data : [];

      if (listaPlantillas.length === 0) {
        const resTodas = await api.get('/legajos/plantillas');
        listaPlantillas = Array.isArray(resTodas.data) ? resTodas.data : [];
      }

      if (listaPlantillas.length === 0) {
        setErrorCarga('No hay formularios activos en este momento.');
        setCargandoInicial(false);
        return;
      }

      const perfilMiembro = resMiembro.data || usuarioMe;
      const plantilla =
        seleccionarPlantillaPorMiembro(listaPlantillas, perfilMiembro, asignacionesMe) ||
        listaPlantillas[0];
      setPlantillaSeleccionada(plantilla);

      const ciclo = plantilla.cicloAnio || 2026;
      const resPrecarga = await api.get(
        `/legajos/miembro/${targetUserId}/plantilla/${plantilla.id}/precarga?cicloAnio=${ciclo}`,
      );
      setPrecarga(resPrecarga.data);
    } catch (err) {
      const msg = traducirErrorAmigable(err, 'No se pudo cargar tu ficha.');
      setErrorCarga(msg);
      mostrarToast(msg, 'error');
    } finally {
      setCargandoInicial(false);
    }
  }, [usuario?.id]);

  useEffect(() => {
    inicializarAutogestion();
  }, [inicializarAutogestion]);

  const obtenerDatosUsuarioPdf = () => ({
    nombre: precarga?.usuario?.nombre || usuario?.nombre || '',
    apellido: precarga?.usuario?.apellido || usuario?.apellido || '',
    dni: precarga?.usuario?.dni || usuario?.dni || '',
    fechaNacimiento: precarga?.usuario?.fechaNacimiento,
    ramaNombre:
      precarga?.usuario?.asignaciones?.[0]?.unidad?.nombre ||
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
        cicloAnio: plantillaSeleccionada.cicloAnio || 2026,
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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-24 sm:pb-10 transition-colors">
      <Navbar />

      {/* Modal Visor de PDF en pantalla sin descarga obligatoria (compatible con celulares Android/iOS) */}
      <PdfViewerModal
        url={pdfPreviewUrl}
        titulo={`Vista Previa: ${apellidoVisible}, ${nombreVisible}`}
        subtitulo={plantillaSeleccionada?.nombre || 'Planilla Oficial 2026'}
        onCerrar={cerrarVistaPreviaPdf}
        onDescargar={handleDescargarCopiaPdf}
      />

      {toast && (
        <div className="fixed bottom-20 sm:bottom-6 right-4 left-4 sm:left-auto sm:max-w-sm z-50 animate-in fade-in slide-in-from-bottom-4 duration-200">
          <div
            className={`p-3.5 rounded-2xl shadow-lg border flex items-center justify-between gap-3 text-xs font-bold ${
              toast.tipo === 'exito'
                ? 'bg-emerald-900 text-white border-emerald-700'
                : 'bg-rose-900 text-white border-rose-700'
            }`}
          >
            <span className="leading-snug">{toast.texto}</span>
            <button
              onClick={() => setToast(null)}
              className="p-1 opacity-80 hover:opacity-100 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <main className="max-w-4xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-4">
        {/* Cabecera Compacta + Acciones 1-Tap Ver / Descargar PDF */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-2xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-extrabold text-slate-900 dark:text-slate-100">
                  {nombreVisible} {apellidoVisible}
                </h1>
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${fichaConfig.badgeClass}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${fichaConfig.dotClass}`} />
                  <span>{fichaConfig.label}</span>
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                DNI {dniVisible}
                {precarga?.usuario?.asignaciones?.[0]?.unidad?.nombre && (
                  <span className="ml-1.5 font-bold text-emerald-700 dark:text-emerald-400">
                    • {precarga.usuario.asignaciones[0].unidad.nombre}
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
                  className="flex-1 sm:flex-initial min-h-[44px] px-3.5 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800 text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer transition disabled:opacity-50"
                >
                  {generandoVistaPrevia ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Eye className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  )}
                  <span>Ver Ficha</span>
                </button>

                <button
                  type="button"
                  onClick={handleDescargarCopiaPdf}
                  disabled={guardando}
                  className="flex-1 sm:flex-initial min-h-[44px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center justify-center gap-2 cursor-pointer transition shadow-2xs disabled:opacity-50"
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

          {/* Selector Rápido de Vista (Papeles vs Cuotas) */}
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setVistaActiva('papeles')}
              className={`min-h-[42px] px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                vistaActiva === 'papeles'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>Ficha y Papeles</span>
            </button>

            <button
              type="button"
              onClick={() => setVistaActiva('cuotas')}
              className={`min-h-[42px] px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                vistaActiva === 'cuotas'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              <CreditCard className="w-4 h-4" />
              <span>Mis Cuotas</span>
              {saldoPendiente > 0 && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                    vistaActiva === 'cuotas'
                      ? 'bg-white text-emerald-700'
                      : 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                  }`}
                >
                  {formatearMoneda(saldoPendiente)}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* VISTA 1: PAPELES / FORMULARIO */}
        {vistaActiva === 'papeles' && (
          <div>
            {cargandoInicial ? (
              <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 border border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center gap-3 text-slate-500">
                <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
                <span className="text-xs font-bold">Cargando formulario...</span>
              </div>
            ) : errorCarga ? (
              <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-rose-200 dark:border-rose-900/60 flex flex-col items-center text-center gap-3">
                <AlertCircle className="w-8 h-8 text-rose-500" />
                <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{errorCarga}</p>
                <button
                  type="button"
                  onClick={inicializarAutogestion}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition"
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
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-2xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <span className="text-sm font-extrabold text-slate-800 dark:text-slate-100">
                Estado de Cuenta
              </span>
              <div className="flex items-center gap-2 flex-wrap">
                {Number(estadoCuenta?.resumen?.saldoAFavor || 0) > 0 && (
                  <span className="px-2.5 py-1 rounded-xl text-xs font-extrabold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                    Saldo a favor: {formatearMoneda(estadoCuenta.resumen.saldoAFavor)}
                  </span>
                )}
                <span
                  className={`text-base font-black ${
                    saldoPendiente > 0
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-emerald-600 dark:text-emerald-400'
                  }`}
                >
                  {saldoPendiente > 0 ? `Deuda: ${formatearMoneda(saldoPendiente)}` : 'Cuotas al día'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {estadoCuenta?.cargos?.map((cargo: any) => {
                const cConf = ESTADO_CARGO_CONFIG[cargo.estado] || ESTADO_CARGO_CONFIG.PENDIENTE;
                return (
                  <div
                    key={cargo.id}
                    className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 space-y-1.5"
                  >
                    <div className="flex justify-between items-start gap-2">
                      <span className="font-bold text-xs text-slate-900 dark:text-slate-100">
                        {cargo.concepto?.nombre}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold border ${cConf.badgeClass}`}>
                        {cConf.label}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 flex justify-between">
                      <span>Total: {formatearMoneda(cargo.montoFinal)}</span>
                      <span className="font-bold text-slate-700 dark:text-slate-300">
                        Pagado: {formatearMoneda(cargo.montoPagado)}
                      </span>
                    </div>
                  </div>
                );
              })}

              {(!estadoCuenta?.cargos || estadoCuenta.cargos.length === 0) && (
                <div className="col-span-full py-6 text-center text-xs text-slate-400">
                  No tenés cuotas pendientes este año.
                </div>
              )}
            </div>

            {estadoCuenta?.pagos?.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-1.5">
                  <Receipt className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <h3 className="text-xs font-bold text-slate-500 uppercase">Pagos Realizados</h3>
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
                        className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0">
                          <span className="font-bold text-slate-800 dark:text-slate-200 block truncate">
                            {conceptosTexto}
                          </span>
                          <span className="text-[11px] text-slate-500">
                            {new Date(pago.fechaPago).toLocaleDateString('es-AR')} •{' '}
                            {METODO_PAGO_LABELS[pago.metodoPago] || 'Efectivo'}
                          </span>
                        </div>
                        <span className="font-extrabold text-emerald-600 dark:text-emerald-400 shrink-0">
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
      </main>
    </div>
  );
};
