import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Copy,
  Download,
  Eye,
  FileCheck2,
  Loader2,
  RefreshCw,
  Trash2,
  UploadCloud,
  WifiOff,
} from 'lucide-react';
import { api } from '../../api/client';
import { useCapabilities } from '../../core/capabilities';
import {
  eliminarBorradorLegajoLocal,
  guardarBorradorLegajoLocal,
  obtenerBorradorLegajoLocal,
  type BorradorLegajoLocal,
} from '../../core/offline/campamentoSync';
import { useAuthStore } from '../../store/authStore';
import { useOfflineStore } from '../../store/offlineStore';
import { useToastStore } from '../../store/toastStore';
import {
  esErrorOffline,
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
import { DynamicFormRenderer, type EsquemaCampos } from '../../components/DynamicFormRenderer';
import { Button } from '../../components/ui';

const PdfViewerModal = lazy(() =>
  import('../../components/PdfViewerModal').then((m) => ({ default: m.PdfViewerModal })),
);

const ESTADO_BADGE: Record<string, { label: string; cls: string }> = {
  SIN_FICHA: { label: 'Sin completar', cls: 's-badge-warn' },
  BORRADOR: { label: 'Borrador guardado', cls: 's-badge-info' },
  LISTO_PARA_FIRMA: { label: 'Listo para firma física', cls: 's-badge-brand' },
  VALIDADO_FISICO: { label: 'Validado físicamente', cls: 's-badge-ok' },
};

export const CompletarLegajoPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const caps = useCapabilities();
  const usuarioSesion = useAuthStore((s) => s.usuario);
  const asignacionesSesion = useAuthStore((s) => s.asignaciones);
  const isOnline = useOfflineStore((s) => s.isOnline);
  const mostrarToast = useToastStore((s) => s.mostrarToast);

  const paramUsuarioId = searchParams.get('usuarioId');
  const targetUserId = useMemo(() => {
    const parsed = paramUsuarioId ? Number(paramUsuarioId) : NaN;
    if (
      Number.isFinite(parsed) &&
      parsed > 0 &&
      (caps.canViewLegajosModule || caps.canEditMiembros || parsed === usuarioSesion?.id)
    ) {
      return parsed;
    }
    return usuarioSesion?.id ?? 0;
  }, [paramUsuarioId, caps.canViewLegajosModule, caps.canEditMiembros, usuarioSesion?.id]);

  const esOtroMiembro = Boolean(usuarioSesion?.id && targetUserId !== usuarioSesion.id);

  const [plantillaSeleccionada, setPlantillaSeleccionada] = useState<any | null>(null);
  const [precarga, setPrecarga] = useState<any | null>(null);
  const [borradorLocal, setBorradorLocal] = useState<BorradorLegajoLocal | null>(null);
  const [sincronizandoBorrador, setSincronizandoBorrador] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [generandoPreview, setGenerandoPreview] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [previewBytes, setPreviewBytes] = useState<Uint8Array | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [aplicandoHermanoKey, setAplicandoHermanoKey] = useState(0);
  const [datosHermanoAplicados, setDatosHermanoAplicados] = useState<Record<string, unknown> | null>(
    null,
  );

  const cargarDatos = useCallback(async () => {
    if (!targetUserId) {
      setCargando(false);
      return;
    }
    setCargando(true);
    setErrorCarga(null);
    try {
      const ciclo = obtenerCicloAnioActual();
      const [resPlantillas, resMiembro] = await Promise.all([
        api.get(`/legajos/plantillas?cicloAnio=${ciclo}`).catch(() => ({ data: [] })),
        api.get(`/miembros/${targetUserId}`).catch(() => ({ data: null })),
      ]);

      let listaPlantillas: any[] = Array.isArray(resPlantillas.data) ? resPlantillas.data : [];
      if (listaPlantillas.length === 0) {
        const resTodas = await api.get('/legajos/plantillas').catch(() => ({ data: [] }));
        listaPlantillas = Array.isArray(resTodas.data) ? resTodas.data : [];
      }

      const perfilMiembro = resMiembro.data || usuarioSesion;
      if (listaPlantillas.length === 0) {
        setPlantillaSeleccionada(null);
        setBorradorLocal(null);
        setPrecarga({
          usuario: perfilMiembro,
          plantilla: null,
          ultimaEntrega: null,
          datosFamiliaresSugeridos: {},
        });
        setCargando(false);
        return;
      }

      const asignacionesObj = perfilMiembro?.asignaciones || asignacionesSesion;
      const plantilla =
        seleccionarPlantillaPorMiembro(listaPlantillas, perfilMiembro, asignacionesObj) ||
        listaPlantillas[0];
      setPlantillaSeleccionada(plantilla);

      const cicloPlantilla = plantilla.cicloAnio || ciclo;
      let datosPrecarga: any = null;
      try {
        const resPrecarga = await api.get(
          `/legajos/miembro/${targetUserId}/plantilla/${plantilla.id}/precarga?cicloAnio=${cicloPlantilla}`,
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
        ownerUserId: usuarioSesion?.id,
        usuarioId: targetUserId,
        plantillaId: plantilla.id,
        cicloAnio: cicloPlantilla,
      });

      setPrecarga(datosPrecarga);
      setBorradorLocal(borradorGuardado);
      setDatosHermanoAplicados(null);
    } catch (err) {
      const msg = traducirErrorAmigable(err, 'No se pudo cargar la ficha de inscripción.');
      if (!esErrorOffline(err, msg)) {
        setErrorCarga(msg);
        mostrarToast(msg, 'error');
      }
    } finally {
      setCargando(false);
    }
  }, [targetUserId, usuarioSesion, asignacionesSesion, mostrarToast]);

  useEffect(() => {
    void cargarDatos();
  }, [cargarDatos]);

  useEffect(() => {
    return () => {
      if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
    };
  }, [pdfPreviewUrl]);

  const cerrarPreview = () => {
    if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
    setPdfPreviewUrl(null);
    setPreviewBytes(null);
  };

  const obtenerDatosUsuarioPdf = () => ({
    nombre: precarga?.usuario?.nombre || usuarioSesion?.nombre || '',
    apellido: precarga?.usuario?.apellido || usuarioSesion?.apellido || '',
    dni: precarga?.usuario?.dni || usuarioSesion?.dni || '',
    fechaNacimiento: precarga?.usuario?.fechaNacimiento,
    ramaNombre:
      obtenerRolPrincipal(precarga?.usuario)?.unidad?.nombre ||
      asignacionesSesion?.[0]?.unidadNombre ||
      '',
    telefonoContacto: precarga?.usuario?.telefonoContacto,
  });

  const sugeridosHermano = useMemo(() => {
    const raw = precarga?.datosFamiliaresSugeridos;
    if (!raw || typeof raw !== 'object') return {};
    return Object.fromEntries(
      Object.entries(raw).filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== ''),
    );
  }, [precarga?.datosFamiliaresSugeridos]);

  const tieneSugeridosHermano = Object.keys(sugeridosHermano).length > 0;

  const valoresFormularioIniciales = useMemo(() => {
    const base: Record<string, unknown> = {
      protagonista_telefono: precarga?.usuario?.telefonoContacto || '',
      protagonista_domicilio:
        (precarga?.usuario?.datosFijosJson as any)?.protagonista_domicilio ||
        (precarga?.usuario?.datosFijosJson as any)?.domicilio ||
        '',
      ...sugeridosHermano,
      ...(precarga?.usuario?.datosFijosJson || {}),
      ...(precarga?.ultimaEntrega?.respuestasSnapshotJson || {}),
      ...(borradorLocal?.respuestas || {}),
      ...(datosHermanoAplicados || {}),
    };
    return base;
  }, [precarga, sugeridosHermano, borradorLocal, datosHermanoAplicados]);

  const handleCopiarHermano = () => {
    if (!tieneSugeridosHermano) return;
    setDatosHermanoAplicados({ ...sugeridosHermano });
    setAplicandoHermanoKey((k) => k + 1);
    mostrarToast('Datos familiares sugeridos de hermano aplicados al formulario.');
  };

  const generarBytesPreview = async (respuestasCustom?: Record<string, unknown>) => {
    if (!plantillaSeleccionada) return null;
    const entrega = precarga?.ultimaEntrega;
    const mapeo: MapeoPdf = plantillaSeleccionada.mapeoPdfJson;
    const usuarioParaPdf = obtenerDatosUsuarioPdf();
    const respuestas =
      respuestasCustom ||
      borradorLocal?.respuestas ||
      entrega?.respuestasSnapshotJson ||
      valoresFormularioIniciales;

    return await generarFichaPdf(
      mapeo,
      respuestas,
      entrega?.hashVerificacion || `BORRADOR-${usuarioParaPdf.dni}-${obtenerCicloAnioActual()}`,
      usuarioParaPdf,
      entrega?.versionImpresion || 1,
    );
  };

  const handleVistaPreviaPdf = async (datosActuales?: Record<string, unknown>) => {
    if (!plantillaSeleccionada) return;
    setGenerandoPreview(true);
    try {
      const bytes = await generarBytesPreview(datosActuales);
      if (!bytes) return;
      if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
      setPreviewBytes(bytes);
      setPdfPreviewUrl(crearUrlPdfBlob(bytes));
    } catch (err) {
      mostrarToast(traducirErrorAmigable(err, 'No se pudo generar la vista previa PDF.'), 'error');
    } finally {
      setGenerandoPreview(false);
    }
  };

  const handleDescargarPdf = async () => {
    const usuarioParaPdf = obtenerDatosUsuarioPdf();
    try {
      const bytes = previewBytes || (await generarBytesPreview());
      if (!bytes) return;
      descargarPdfBlob(bytes, `Ficha_${usuarioParaPdf.apellido}_${usuarioParaPdf.nombre}.pdf`);
      mostrarToast('PDF descargado.');
    } catch (err) {
      mostrarToast(traducirErrorAmigable(err, 'No se pudo descargar el PDF.'), 'error');
    }
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
        ownerUserId: usuarioSesion?.id,
        usuarioId: borradorLocal.usuarioId,
        plantillaId: borradorLocal.plantillaId,
        cicloAnio: borradorLocal.cicloAnio,
      });
      setBorradorLocal(null);
      mostrarToast('Borrador local sincronizado con el servidor.', 'exito');
      await cargarDatos();
    } catch (err) {
      mostrarToast(traducirErrorAmigable(err, 'No se pudo sincronizar el borrador local.'), 'error');
    } finally {
      setSincronizandoBorrador(false);
    }
  };

  const handleDescartarBorradorLocal = async () => {
    if (!borradorLocal) return;
    await eliminarBorradorLegajoLocal({
      ownerUserId: usuarioSesion?.id,
      usuarioId: borradorLocal.usuarioId,
      plantillaId: borradorLocal.plantillaId,
      cicloAnio: borradorLocal.cicloAnio,
    });
    setBorradorLocal(null);
    setAplicandoHermanoKey((k) => k + 1);
    mostrarToast('Borrador local descartado.', 'info');
  };

  const handleSubmitFormulario = async (
    datos: Record<string, unknown>,
    finalizarParaFirma: boolean,
  ) => {
    if (!targetUserId || !plantillaSeleccionada) return;
    const cicloPlantilla = plantillaSeleccionada.cicloAnio || obtenerCicloAnioActual();

    if (!isOnline || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
      setGuardando(true);
      try {
        const guardado = await guardarBorradorLegajoLocal({
          ownerUserId: usuarioSesion?.id,
          usuarioId: targetUserId,
          plantillaId: plantillaSeleccionada.id,
          cicloAnio: cicloPlantilla,
          respuestas: datos,
        });
        setBorradorLocal(guardado);
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
        setGuardando(false);
      }
      return;
    }

    setGuardando(true);
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
        ownerUserId: usuarioSesion?.id,
        usuarioId: targetUserId,
        plantillaId: plantillaSeleccionada.id,
        cicloAnio: cicloPlantilla,
      });
      setBorradorLocal(null);

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
        mostrarToast('¡Listo! Ficha finalizada y PDF descargado para firma.');
      } else {
        mostrarToast('Avance del legajo guardado como borrador.');
      }

      await cargarDatos();
    } catch (err) {
      if (esErrorOffline(err)) {
        const guardado = await guardarBorradorLegajoLocal({
          ownerUserId: usuarioSesion?.id,
          usuarioId: targetUserId,
          plantillaId: plantillaSeleccionada.id,
          cicloAnio: cicloPlantilla,
          respuestas: datos,
        });
        setBorradorLocal(guardado);
        mostrarToast(
          'Sin señal: tu avance quedó guardado localmente (pendiente de sincronizar).',
          'advertencia',
          5000,
        );
      } else {
        mostrarToast(traducirErrorAmigable(err, 'No se pudo guardar el formulario.'), 'error');
      }
    } finally {
      setGuardando(false);
    }
  };

  const estadoActual = precarga?.ultimaEntrega?.estado || 'SIN_FICHA';
  const badge = ESTADO_BADGE[estadoActual] || ESTADO_BADGE.SIN_FICHA;
  const nombreVisible = precarga?.usuario?.nombre || usuarioSesion?.nombre || '';
  const apellidoVisible = precarga?.usuario?.apellido || usuarioSesion?.apellido || '';
  const dniVisible = precarga?.usuario?.dni || usuarioSesion?.dni || '';
  const rutaVolver = esOtroMiembro ? '/legajos' : '/mi-espacio';

  return (
    <div className="max-w-4xl mx-auto space-y-4 s-anim-view">
      {pdfPreviewUrl && (
        <Suspense fallback={null}>
          <PdfViewerModal
            url={pdfPreviewUrl}
            titulo={`Vista Previa PDF: ${apellidoVisible}, ${nombreVisible}`}
            subtitulo={plantillaSeleccionada?.titulo || `Ciclo ${obtenerCicloAnioActual()}`}
            onCerrar={cerrarPreview}
            onDescargar={handleDescargarPdf}
          />
        </Suspense>
      )}

      {/* Cabecera Contextual */}
      <div className="s-card rounded-2xl p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <Link
            to={rutaVolver}
            className="s-btn-sec min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
            <span>{esOtroMiembro ? 'Volver a Legajos' : 'Volver a Mi Espacio'}</span>
          </Link>

          <div className="flex items-center gap-2 flex-wrap">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void cargarDatos()}
              disabled={cargando}
              leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${cargando ? 'animate-spin' : ''}`} />}
            >
              Refrescar
            </Button>
            {plantillaSeleccionada && (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  loading={generandoPreview}
                  onClick={() => void handleVistaPreviaPdf()}
                  leftIcon={<Eye className="w-3.5 h-3.5 text-brand" />}
                >
                  Vista Previa PDF
                </Button>
                {precarga?.ultimaEntrega && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => void handleDescargarPdf()}
                    leftIcon={<Download className="w-3.5 h-3.5" />}
                  >
                    Descargar
                  </Button>
                )}
              </>
            )}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-rule">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <FileCheck2 className="w-5 h-5 text-brand shrink-0" />
              <h1 className="text-lg sm:text-xl font-black text-ink">
                {nombreVisible} {apellidoVisible}
              </h1>
              <span className={`${badge.cls} px-2.5 py-0.5 rounded-full text-[11px] font-bold`}>
                {badge.label}
              </span>
              {borradorLocal && (
                <span className="s-badge-warn px-2.5 py-0.5 rounded-full text-[11px] font-bold inline-flex items-center gap-1">
                  <WifiOff className="w-3 h-3 shrink-0" />
                  <span>Pendiente de sincronizar</span>
                </span>
              )}
            </div>
            <p className="text-xs text-ink-muted mt-0.5 s-tabular">
              DNI {dniVisible}
              {plantillaSeleccionada && (
                <>
                  {' '}
                  · {plantillaSeleccionada.titulo} (Ciclo{' '}
                  {plantillaSeleccionada.cicloAnio || obtenerCicloAnioActual()})
                </>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Borrador local offline pendiente de sincronizar */}
      {borradorLocal && (
        <div className="s-badge-warn rounded-2xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 text-xs leading-relaxed">
            <WifiOff className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <strong className="block">Borrador local pendiente de sincronizar</strong>
              <span>
                {isOnline
                  ? 'Tenés cambios guardados en este dispositivo sin conexión. Sincronizalos para subirlos al servidor.'
                  : 'Guardado en este dispositivo sin señal. Apenas recuperes conexión vas a poder sincronizarlo.'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {isOnline && (
              <Button
                type="button"
                variant="primary"
                size="sm"
                loading={sincronizandoBorrador}
                onClick={() => void handleSincronizarBorradorLocal()}
                leftIcon={<UploadCloud className="w-3.5 h-3.5" />}
              >
                Sincronizar ahora
              </Button>
            )}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={sincronizandoBorrador}
              onClick={() => void handleDescartarBorradorLocal()}
              leftIcon={<Trash2 className="w-3.5 h-3.5" />}
            >
              Descartar
            </Button>
          </div>
        </div>
      )}

      {/* Auto-copia de hermano */}
      {tieneSugeridosHermano && (
        <div className="s-badge-info rounded-2xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 text-xs leading-relaxed">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <strong className="block">Datos familiares compartidos detectados</strong>
              <span>
                Ya precargamos los datos de grupo familiar y domicilio de un hermano vinculado. Podés reaplicarlos en 1 toque si modificaste algo.
              </span>
            </div>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleCopiarHermano}
            leftIcon={<Copy className="w-3.5 h-3.5" />}
          >
            Copiar datos de hermano
          </Button>
        </div>
      )}

      {cargando ? (
        <div className="s-card rounded-2xl p-12 flex flex-col items-center justify-center gap-3 text-ink-muted">
          <Loader2 className="w-6 h-6 animate-spin text-brand" />
          <span className="text-xs font-semibold">Cargando plantilla oficial y precarga…</span>
        </div>
      ) : errorCarga ? (
        <div className="s-badge-err rounded-2xl p-6 text-center space-y-3">
          <AlertCircle className="w-8 h-8 mx-auto" />
          <p className="text-sm font-bold">{errorCarga}</p>
          <Button type="button" variant="secondary" size="sm" onClick={() => void cargarDatos()}>
            Reintentar
          </Button>
        </div>
      ) : !plantillaSeleccionada ? (
        <div className="s-card rounded-2xl p-10 text-center space-y-2 text-ink-muted">
          <AlertCircle className="w-8 h-8 mx-auto opacity-50" />
          <p className="text-sm font-bold text-ink">No hay plantillas oficiales activas.</p>
          <p className="text-xs">
            Un administrador debe activar o crear la plantilla del ciclo actual en Legajos.
          </p>
        </div>
      ) : (
        <DynamicFormRenderer
          key={`${plantillaSeleccionada.id}-${targetUserId}-${aplicandoHermanoKey}`}
          esquema={(plantillaSeleccionada.esquemaCamposJson || { secciones: [] }) as EsquemaCampos}
          valoresIniciales={valoresFormularioIniciales}
          onSubmit={handleSubmitFormulario}
          onPreviewPdf={(datos) => void handleVistaPreviaPdf(datos)}
          cargando={guardando || generandoPreview}
        />
      )}
    </div>
  );
};
