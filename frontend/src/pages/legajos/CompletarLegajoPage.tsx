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
} from 'lucide-react';
import { api } from '../../api/client';
import { useCapabilities } from '../../core/capabilities';
import { useAuthStore } from '../../store/authStore';
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
      setPrecarga(datosPrecarga);
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
      ...(datosHermanoAplicados || {}),
    };
    return base;
  }, [precarga, sugeridosHermano, datosHermanoAplicados]);

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
      respuestasCustom || entrega?.respuestasSnapshotJson || valoresFormularioIniciales;

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

  const handleSubmitFormulario = async (
    datos: Record<string, unknown>,
    finalizarParaFirma: boolean,
  ) => {
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
        mostrarToast('¡Listo! Ficha finalizada y PDF descargado para firma.');
      } else {
        mostrarToast('Avance del legajo guardado como borrador.');
      }

      await cargarDatos();
    } catch (err) {
      mostrarToast(traducirErrorAmigable(err, 'No se pudo guardar el formulario.'), 'error');
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
