import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import * as pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs';
import {
  ChevronLeft,
  ChevronRight,
  Crosshair,
  FileText,
  Layers,
  Loader2,
  Plus,
  Save,
  Trash2,
} from 'lucide-react';
import { api } from '../../api/client';
import { traducirErrorAmigable } from '../../lib/formatters';
import { generarMoldeEnBlancoPdf } from '../../services/pdfGenerator';
import type { CoordenadaCampo, MapeoPdf } from '../../services/pdfGenerator';
import type { CampoSchema, EsquemaCampos, SeccionSchema } from '../../components/DynamicFormRenderer';
import { Button, Drawer, Input, Select } from '../../components/ui';

if (typeof window !== 'undefined') {
  (window as any).pdfjsWorker = pdfjsWorker;
}

const PDF_TEMPLATES_CONOCIDOS = [
  { label: 'Molde Oficial Dinámico (7 páginas)', value: '__MOLDE_OFICIAL__' },
  { label: 'Ingreso Menores Base (PDF público)', value: '/pdf-templates/legajo_ingreso_menores_2026.pdf' },
  { label: 'Ficha Inscripción Base (PDF público)', value: '/pdf-templates/ficha_inscripcion_base.pdf' },
];

export interface VisualPdfEditorDrawerProps {
  abierto: boolean;
  plantilla: any | null;
  onCerrar: () => void;
  onGuardado: () => Promise<void> | void;
  onToast: (texto: string, tipo?: 'exito' | 'error') => void;
}

function normalizarEsquema(raw: any): EsquemaCampos {
  const secs = Array.isArray(raw?.secciones) ? raw.secciones : [];
  return {
    secciones: secs.map((s: any, i: number) => ({
      id: String(s?.id || `seccion_${i + 1}`),
      titulo: String(s?.titulo || `Sección ${i + 1}`),
      descripcion: s?.descripcion ? String(s.descripcion) : undefined,
      permiteCopiarHermano: Boolean(s?.permiteCopiarHermano),
      campos: Array.isArray(s?.campos)
        ? s.campos.map((c: any, j: number) => ({
            key: String(c?.key || `campo_${i + 1}_${j + 1}`),
            label: String(c?.label || `Campo ${j + 1}`),
            type: String(c?.type || 'text'),
            required: Boolean(c?.required),
            options: Array.isArray(c?.options) ? c.options : undefined,
          }))
        : [],
    })),
  };
}

function normalizarMapeo(raw: any): MapeoPdf {
  const campos = raw?.campos && typeof raw.campos === 'object' ? { ...raw.campos } : {};
  return {
    pdfBaseUrl: typeof raw?.pdfBaseUrl === 'string' && raw.pdfBaseUrl ? raw.pdfBaseUrl : '__MOLDE_OFICIAL__',
    campos,
    qrVerificacion: raw?.qrVerificacion,
  };
}

export const VisualPdfEditorDrawer: React.FC<VisualPdfEditorDrawerProps> = ({
  abierto,
  plantilla,
  onCerrar,
  onGuardado,
  onToast,
}) => {
  const [esquema, setEsquema] = useState<EsquemaCampos>({ secciones: [] });
  const [mapeo, setMapeo] = useState<MapeoPdf>({ pdfBaseUrl: '__MOLDE_OFICIAL__', campos: {} });
  const [seccionActivaIdx, setSeccionActivaIdx] = useState(0);
  const [campoActivoKey, setCampoActivoKey] = useState<string>('');
  const [guardando, setGuardando] = useState(false);

  // Nuevo campo rápido
  const [nuevoCampoKey, setNuevoCampoKey] = useState('');
  const [nuevoCampoLabel, setNuevoCampoLabel] = useState('');
  const [nuevoCampoType, setNuevoCampoType] = useState<'text' | 'boolean' | 'textarea' | 'date'>('text');

  // PDF.js state
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [paginaActual, setPaginaActual] = useState(1);
  const [cargandoPdf, setCargandoPdf] = useState(false);
  const [pageViewportDims, setPageViewportDims] = useState<{
    cssW: number;
    cssH: number;
    pdfW: number;
    pdfH: number;
  }>({ cssW: 612, cssH: 792, pdfW: 612, pdfH: 792 });

  useEffect(() => {
    if (!abierto || !plantilla) return;
    const normEsq = normalizarEsquema(plantilla.esquemaCamposJson);
    const normMap = normalizarMapeo(plantilla.mapeoPdfJson);
    setEsquema(normEsq);
    setMapeo(normMap);
    setSeccionActivaIdx(0);
    const firstKey = normEsq.secciones[0]?.campos[0]?.key || Object.keys(normMap.campos)[0] || '';
    setCampoActivoKey(firstKey);
    setPaginaActual(1);
  }, [abierto, plantilla]);

  // Cargar PDF base con pdfjs-dist cuando cambia pdfBaseUrl o abre
  useEffect(() => {
    if (!abierto) return;
    let cancelado = false;
    let loadedDoc: pdfjsLib.PDFDocumentProxy | null = null;

    const cargarDocumento = async () => {
      setCargandoPdf(true);
      try {
        let bytes: Uint8Array;
        const sourceUrl = mapeo.pdfBaseUrl;
        if (!sourceUrl || sourceUrl === '__MOLDE_OFICIAL__') {
          bytes = await generarMoldeEnBlancoPdf();
        } else {
          const resp = await fetch(sourceUrl);
          if (!resp.ok) {
            bytes = await generarMoldeEnBlancoPdf();
          } else {
            bytes = new Uint8Array(await resp.arrayBuffer());
          }
        }
        if (cancelado) return;
        const task = pdfjsLib.getDocument({ data: bytes });
        const doc = await task.promise;
        const destroyDoc = (doc as unknown as { destroy?: () => Promise<void> }).destroy;
        if (cancelado) {
          if (typeof destroyDoc === 'function') await destroyDoc.call(doc);
          return;
        }
        loadedDoc = doc;
        setPdfDoc(doc);
        setNumPages(doc.numPages);
        setPaginaActual((prev) => Math.min(Math.max(1, prev), doc.numPages));
      } catch (err) {
        if (!cancelado) {
          onToast(traducirErrorAmigable(err, 'No se pudo cargar el PDF base para el editor visual.'), 'error');
        }
      } finally {
        if (!cancelado) setCargandoPdf(false);
      }
    };

    void cargarDocumento();
    return () => {
      cancelado = true;
      const destroyLoaded = loadedDoc
        ? (loadedDoc as unknown as { destroy?: () => Promise<void> }).destroy
        : undefined;
      if (loadedDoc && typeof destroyLoaded === 'function') {
        void destroyLoaded.call(loadedDoc);
      }
    };
  }, [abierto, mapeo.pdfBaseUrl, onToast]);

  // Renderizar página activa del PDF
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current || paginaActual < 1 || paginaActual > pdfDoc.numPages) return;
    let cancelado = false;
    let renderTask: pdfjsLib.RenderTask | null = null;

    const render = async () => {
      try {
        const page = await pdfDoc.getPage(paginaActual);
        if (cancelado) return;
        const pdfVp = page.getViewport({ scale: 1 });
        const scale = Math.min(1.25, 620 / pdfVp.width);
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        setPageViewportDims({
          cssW: viewport.width,
          cssH: viewport.height,
          pdfW: pdfVp.width,
          pdfH: pdfVp.height,
        });

        renderTask = page.render({ canvasContext: ctx, viewport, canvas });
        await renderTask.promise;
      } catch {
        // Ignore cancelled renders
      }
    };

    void render();
    return () => {
      cancelado = true;
      renderTask?.cancel();
    };
  }, [pdfDoc, paginaActual]);

  const seccionActiva: SeccionSchema | undefined = esquema.secciones[seccionActivaIdx];

  const coordActiva: CoordenadaCampo | undefined = campoActivoKey
    ? mapeo.campos[campoActivoKey]
    : undefined;

  const camposEnPaginaActual = useMemo(() => {
    return Object.entries(mapeo.campos).filter(
      ([, c]) => (c?.page ?? 1) === paginaActual && Number.isFinite(c?.x) && Number.isFinite(c?.y),
    );
  }, [mapeo.campos, paginaActual]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!campoActivoKey) {
      onToast('Seleccioná primero un campo en el panel derecho para ubicarlo en la hoja.', 'error');
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // Convertir coordenadas viewport (top-left) -> PDF points (bottom-left)
    const pdfX = Math.round((clickX / rect.width) * pageViewportDims.pdfW);
    const pdfY = Math.round(
      pageViewportDims.pdfH - (clickY / rect.height) * pageViewportDims.pdfH,
    );

    setMapeo((prev) => ({
      ...prev,
      campos: {
        ...prev.campos,
        [campoActivoKey]: {
          ...(prev.campos[campoActivoKey] || { size: 9, type: 'text' }),
          page: paginaActual,
          x: pdfX,
          y: pdfY,
        },
      },
    }));
  };

  const handleAgregarSeccion = () => {
    const num = esquema.secciones.length + 1;
    const nueva: SeccionSchema = {
      id: `seccion_custom_${Date.now()}`,
      titulo: `Nueva Sección ${num}`,
      permiteCopiarHermano: false,
      campos: [],
    };
    setEsquema((prev) => ({ secciones: [...prev.secciones, nueva] }));
    setSeccionActivaIdx(esquema.secciones.length);
  };

  const handleAgregarCampo = () => {
    if (!seccionActiva) {
      onToast('Creá o seleccioná una sección primero.', 'error');
      return;
    }
    const cleanKey = nuevoCampoKey
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_');
    const cleanLabel = nuevoCampoLabel.trim();
    if (!cleanKey || !cleanLabel) {
      onToast('Completá clave (snake_case) y etiqueta visible del campo.', 'error');
      return;
    }

    const existe = esquema.secciones.some((s) => s.campos.some((c) => c.key === cleanKey));
    if (existe) {
      onToast(`Ya existe un campo con clave "${cleanKey}".`, 'error');
      return;
    }

    const nuevo: CampoSchema = {
      key: cleanKey,
      label: cleanLabel,
      type: nuevoCampoType,
      required: false,
    };

    // Sincronización bidireccional: agrega el campo al esquema Y crea coordenada inicial en página actual
    setEsquema((prev) => ({
      secciones: prev.secciones.map((s, idx) =>
        idx === seccionActivaIdx ? { ...s, campos: [...s.campos, nuevo] } : s,
      ),
    }));
    setMapeo((prev) => ({
      ...prev,
      campos: {
        ...prev.campos,
        [cleanKey]: {
          page: paginaActual,
          x: 120,
          y: Math.round(pageViewportDims.pdfH * 0.65),
          size: 9,
          type: nuevoCampoType === 'boolean' ? 'checkbox_x' : 'text',
        },
      },
    }));
    setCampoActivoKey(cleanKey);
    setNuevoCampoKey('');
    setNuevoCampoLabel('');
  };

  const handleEliminarCampo = (key: string) => {
    setEsquema((prev) => ({
      secciones: prev.secciones.map((s, idx) =>
        idx === seccionActivaIdx
          ? { ...s, campos: s.campos.filter((c) => c.key !== key) }
          : s,
      ),
    }));
    setMapeo((prev) => {
      const nextCampos = { ...prev.campos };
      delete nextCampos[key];
      return { ...prev, campos: nextCampos };
    });
    if (campoActivoKey === key) setCampoActivoKey('');
  };

  const handleUpdateCampoSchema = (key: string, patch: Partial<CampoSchema>) => {
    setEsquema((prev) => ({
      secciones: prev.secciones.map((s, idx) =>
        idx === seccionActivaIdx
          ? {
              ...s,
              campos: s.campos.map((c) => (c.key === key ? { ...c, ...patch } : c)),
            }
          : s,
      ),
    }));
  };

  const handleUpdateCoord = (key: string, patch: Partial<CoordenadaCampo>) => {
    setMapeo((prev) => ({
      ...prev,
      campos: {
        ...prev.campos,
        [key]: {
          ...(prev.campos[key] || { page: paginaActual, x: 100, y: 500, size: 9 }),
          ...patch,
        },
      },
    }));
  };

  const handleGuardarCambios = async () => {
    if (!plantilla?.id) return;
    setGuardando(true);
    try {
      await api.patch(`/legajos/plantillas/${plantilla.id}`, {
        esquemaCamposJson: esquema,
        mapeoPdfJson: mapeo,
      });
      onToast(`Esquema y mapeo visual de "${plantilla.titulo}" guardados.`);
      await onGuardado();
      onCerrar();
    } catch (err) {
      onToast(traducirErrorAmigable(err, 'No se pudo guardar la plantilla.'), 'error');
    } finally {
      setGuardando(false);
    }
  };

  if (!plantilla) return null;

  return (
    <Drawer
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={`Editor Visual PDF — ${plantilla.titulo}`}
      subtitulo={`Bidireccional: clic en el lienzo posiciona el campo en PDF · v${plantilla.version}`}
      mode="drawer"
      maxWidthClass="sm:max-w-5xl"
      allowFullscreen={true}
      bloqueado={guardando}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="primary"
            loading={guardando}
            onClick={() => void handleGuardarCambios()}
            leftIcon={<Save className="w-4 h-4" />}
          >
            Guardar Esquema y Mapeo PDF
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Columna Izquierda: Lienzo PDF Interactivo */}
        <div className="lg:col-span-7 space-y-3">
          <div className="s-panel rounded-xl p-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <FileText className="w-4 h-4 text-brand shrink-0" />
              <select
                value={mapeo.pdfBaseUrl}
                onChange={(e) =>
                  setMapeo((prev) => ({ ...prev, pdfBaseUrl: e.target.value }))
                }
                aria-label="PDF Base"
                className="s-input min-h-[36px] px-2.5 py-1 rounded-lg text-xs font-semibold flex-1 min-w-[160px]"
              >
                {PDF_TEMPLATES_CONOCIDOS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
                {!PDF_TEMPLATES_CONOCIDOS.some((t) => t.value === mapeo.pdfBaseUrl) && (
                  <option value={mapeo.pdfBaseUrl}>{mapeo.pdfBaseUrl}</option>
                )}
              </select>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={paginaActual <= 1 || cargandoPdf}
                onClick={() => setPaginaActual((p) => Math.max(1, p - 1))}
                aria-label="Página anterior"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </Button>
              <span className="text-xs font-bold s-tabular px-2">
                Hoja {paginaActual} / {Math.max(1, numPages)}
              </span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={paginaActual >= numPages || cargandoPdf}
                onClick={() => setPaginaActual((p) => Math.min(numPages, p + 1))}
                aria-label="Página siguiente"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          <div className="s-badge-info rounded-xl px-3 py-2 text-[11px] font-semibold flex items-center gap-2">
            <Crosshair className="w-3.5 h-3.5 shrink-0" />
            <span>
              {campoActivoKey ? (
                <>
                  Campo seleccionado: <strong className="font-mono">{campoActivoKey}</strong>. Hacé clic en cualquier lugar de la hoja para ubicar su coordenada PDF.
                </>
              ) : (
                'Seleccioná un campo a la derecha para ubicarlo sobre la hoja.'
              )}
            </span>
          </div>

          <div className="overflow-auto rounded-2xl border border-rule bg-paper-3 p-3 flex justify-center min-h-[340px]">
            {cargandoPdf ? (
              <div className="flex flex-col items-center justify-center gap-2 text-ink-muted py-16">
                <Loader2 className="w-6 h-6 animate-spin text-brand" />
                <span className="text-xs font-semibold">Renderizando hoja PDF…</span>
              </div>
            ) : (
              <div
                className="relative inline-block cursor-crosshair select-none border border-rule bg-white"
                style={{
                  width: pageViewportDims.cssW,
                  height: pageViewportDims.cssH,
                }}
                onClick={handleCanvasClick}
              >
                <canvas ref={canvasRef} className="block" />
                {camposEnPaginaActual.map(([key, coord]) => {
                  const leftPct = (coord.x / Math.max(1, pageViewportDims.pdfW)) * 100;
                  const topPct =
                    ((pageViewportDims.pdfH - coord.y) / Math.max(1, pageViewportDims.pdfH)) * 100;
                  const activo = key === campoActivoKey;

                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCampoActivoKey(key);
                      }}
                      style={{
                        left: `${Math.min(96, Math.max(2, leftPct))}%`,
                        top: `${Math.min(96, Math.max(2, topPct))}%`,
                        transform: 'translate(-4px, -50%)',
                      }}
                      className={`absolute px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border whitespace-nowrap cursor-pointer ${
                        activo
                          ? 'bg-brand text-brand-contrast border-brand z-20'
                          : 'bg-amber-200/90 text-slate-900 border-amber-500 z-10 hover:z-20'
                      }`}
                      title={`${key} (${coord.x}, ${coord.y})`}
                    >
                      {key}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Columna Derecha: Inspector Sincronizado Esquema ↔ Coordenadas */}
        <div className="lg:col-span-5 space-y-4">
          {/* Secciones */}
          <div className="s-panel rounded-2xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-black text-ink flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-brand" />
                <span>Secciones del Formulario ({esquema.secciones.length})</span>
              </h3>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleAgregarSeccion}
                leftIcon={<Plus className="w-3 h-3" />}
              >
                Sección
              </Button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {esquema.secciones.map((sec, idx) => (
                <button
                  key={sec.id}
                  type="button"
                  onClick={() => setSeccionActivaIdx(idx)}
                  className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold border cursor-pointer transition ${
                    idx === seccionActivaIdx
                      ? 's-btn-brand border-brand'
                      : 's-btn-sec text-ink-2'
                  }`}
                >
                  {idx + 1}. {sec.titulo}
                </button>
              ))}
            </div>

            {seccionActiva && (
              <div className="pt-2 border-t border-rule grid grid-cols-1 gap-2">
                <Input
                  label="Título de sección"
                  value={seccionActiva.titulo}
                  onChange={(e) => {
                    const val = e.target.value;
                    setEsquema((prev) => ({
                      secciones: prev.secciones.map((s, idx) =>
                        idx === seccionActivaIdx ? { ...s, titulo: val } : s,
                      ),
                    }));
                  }}
                />
                <label className="flex items-center gap-2 text-xs font-semibold text-ink-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(seccionActiva.permiteCopiarHermano)}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setEsquema((prev) => ({
                        secciones: prev.secciones.map((s, idx) =>
                          idx === seccionActivaIdx
                            ? { ...s, permiteCopiarHermano: checked }
                            : s,
                        ),
                      }));
                    }}
                  />
                  <span>Permite copiar datos entre hermanos</span>
                </label>
              </div>
            )}
          </div>

          {/* Inspector Coordenada Activa */}
          {campoActivoKey && (
            <div className="s-card rounded-2xl p-3.5 space-y-2.5 border-brand/50">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-black text-brand font-mono truncate">
                  {campoActivoKey}
                </span>
                <span className="text-[10px] font-bold text-ink-muted">Coordenada PDF</span>
              </div>

              <div className="grid grid-cols-4 gap-2">
                <Input
                  label="Hoja"
                  type="number"
                  min={1}
                  max={Math.max(1, numPages)}
                  value={coordActiva?.page ?? paginaActual}
                  onChange={(e) => {
                    const p = Number(e.target.value) || 1;
                    handleUpdateCoord(campoActivoKey, { page: p });
                    if (p >= 1 && p <= numPages) setPaginaActual(p);
                  }}
                />
                <Input
                  label="X (pt)"
                  type="number"
                  value={coordActiva?.x ?? 100}
                  onChange={(e) =>
                    handleUpdateCoord(campoActivoKey, { x: Number(e.target.value) || 0 })
                  }
                />
                <Input
                  label="Y (pt)"
                  type="number"
                  value={coordActiva?.y ?? 500}
                  onChange={(e) =>
                    handleUpdateCoord(campoActivoKey, { y: Number(e.target.value) || 0 })
                  }
                />
                <Input
                  label="Tam."
                  type="number"
                  min={5}
                  max={24}
                  value={coordActiva?.size ?? 9}
                  onChange={(e) =>
                    handleUpdateCoord(campoActivoKey, { size: Number(e.target.value) || 9 })
                  }
                />
              </div>
            </div>
          )}

          {/* Lista de Campos de la Sección */}
          <div className="s-panel rounded-2xl p-3.5 space-y-3">
            <h3 className="text-xs font-black text-ink">
              Campos de "{seccionActiva?.titulo || 'Sin sección'}" (
              {seccionActiva?.campos.length || 0})
            </h3>

            <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
              {(!seccionActiva || seccionActiva.campos.length === 0) && (
                <p className="text-xs text-ink-muted py-3 text-center">
                  Sin campos en esta sección aún.
                </p>
              )}
              {seccionActiva?.campos.map((campo) => {
                const seleccionado = campoActivoKey === campo.key;
                const mapped = mapeo.campos[campo.key];
                return (
                  <div
                    key={campo.key}
                    onClick={() => {
                      setCampoActivoKey(campo.key);
                      if (mapped?.page && mapped.page <= numPages) {
                        setPaginaActual(mapped.page);
                      }
                    }}
                    className={`p-2.5 rounded-xl border text-xs cursor-pointer flex items-center justify-between gap-2 transition ${
                      seleccionado
                        ? 'bg-brand-soft/35 border-brand'
                        : 'bg-surface border-rule hover:border-brand/50'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-ink truncate">{campo.label}</div>
                      <div className="text-[10px] font-mono text-ink-muted flex items-center gap-2">
                        <span>{campo.key}</span>
                        <span>· {campo.type}</span>
                        {mapped ? (
                          <span className="text-brand font-bold">
                            P{mapped.page || 1} ({mapped.x},{mapped.y})
                          </span>
                        ) : (
                          <span className="text-amber-600">Sin coord.</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleUpdateCampoSchema(campo.key, { required: !campo.required });
                        }}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold border cursor-pointer ${
                          campo.required ? 's-badge-warn' : 'bg-paper-2 text-ink-muted border-rule'
                        }`}
                        title="Alternar obligatorio"
                      >
                        {campo.required ? 'Req*' : 'Opc'}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEliminarCampo(campo.key);
                        }}
                        className="p-1 rounded text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                        aria-label={`Eliminar campo ${campo.key}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Agregar nuevo campo */}
            {seccionActiva && (
              <div className="pt-2 border-t border-rule space-y-2">
                <span className="text-[11px] font-bold text-ink-2 block">
                  Agregar campo sincronizado (Esquema + PDF)
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="clave_campo"
                    value={nuevoCampoKey}
                    onChange={(e) => setNuevoCampoKey(e.target.value)}
                  />
                  <Select
                    value={nuevoCampoType}
                    onChange={(e) => setNuevoCampoType(e.target.value as any)}
                  >
                    <option value="text">Texto</option>
                    <option value="date">Fecha</option>
                    <option value="boolean">Sí / No</option>
                    <option value="textarea">Párrafo</option>
                  </Select>
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="Etiqueta visible en formulario"
                    value={nuevoCampoLabel}
                    onChange={(e) => setNuevoCampoLabel(e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={handleAgregarCampo}
                    leftIcon={<Plus className="w-3.5 h-3.5" />}
                  >
                    Agregar
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Drawer>
  );
};
