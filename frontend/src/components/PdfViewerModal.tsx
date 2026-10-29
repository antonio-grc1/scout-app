import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  ExternalLink,
  Download,
  X,
  ZoomIn,
  ZoomOut,
  Loader2,
  AlertTriangle,
  FileText,
} from 'lucide-react';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface PdfViewerModalProps {
  url?: string | null;
  titulo: string;
  subtitulo?: string;
  onCerrar?: () => void;
  onDescargar?: () => void;
}

interface PageCanvasProps {
  pdfDoc: pdfjsLib.PDFDocumentProxy;
  pageNumber: number;
  zoom: number;
  containerWidth: number;
}

const PdfPageCanvas: React.FC<PageCanvasProps> = ({
  pdfDoc,
  pageNumber,
  zoom,
  containerWidth,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [renderizando, setRenderizando] = useState(true);

  useEffect(() => {
    let cancelado = false;
    let renderTask: pdfjsLib.RenderTask | null = null;

    const renderPage = async () => {
      if (!canvasRef.current || containerWidth <= 0) return;
      setRenderizando(true);

      try {
        const page = await pdfDoc.getPage(pageNumber);
        if (cancelado) return;

        const baseViewport = page.getViewport({ scale: 1 });
        // Ajustar el ancho de la página al contenedor disponible (con margen) multiplicado por el zoom
        const targetWidth = Math.max(280, Math.min(containerWidth - 24, 860)) * zoom;
        const scale = targetWidth / baseViewport.width;
        const viewport = page.getViewport({ scale });

        const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
        const canvas = canvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext('2d');
        if (!context) return;

        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        context.setTransform(dpr, 0, 0, dpr, 0, 0);

        renderTask = page.render({
          canvasContext: context,
          canvas,
          viewport,
        });

        await renderTask.promise;
      } catch {
        // Ignorar cancelaciones de render al cambiar zoom rápidamente
      } finally {
        if (!cancelado) {
          setRenderizando(false);
        }
      }
    };

    void renderPage();

    return () => {
      cancelado = true;
      if (renderTask) {
        try {
          renderTask.cancel();
        } catch {
          // Ignorar
        }
      }
    };
  }, [pdfDoc, pageNumber, zoom, containerWidth]);

  return (
    <div className="relative bg-white shadow-md rounded-lg overflow-hidden border border-rule mx-auto my-2">
      <div className="bg-paper-2 px-3 py-1 text-[10px] font-bold text-ink-muted flex items-center justify-between border-b border-rule">
        <span>Hoja {pageNumber}</span>
        {renderizando && <span className="animate-pulse">Renderizando…</span>}
      </div>
      <div className="overflow-x-auto flex justify-center bg-white">
        <canvas ref={canvasRef} aria-label={`Página ${pageNumber} del documento PDF`} className="block max-w-none" />
      </div>
    </div>
  );
};

export const PdfViewerModal: React.FC<PdfViewerModalProps> = ({
  url,
  titulo,
  subtitulo = 'Planilla Oficial 2026',
  onCerrar,
  onDescargar,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [containerWidth, setContainerWidth] = useState(360);

  useEffect(() => {
    if (!url) return;

    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.clientWidth);
      }
    };

    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, [url]);

  useEffect(() => {
    if (!url) {
      setPdfDoc(null);
      setNumPages(0);
      return;
    }

    let cancelado = false;
    let currentTask: pdfjsLib.PDFDocumentLoadingTask | null = null;

    const cargarDocumento = async () => {
      setCargando(true);
      setError(null);
      setZoom(1);

      try {
        const response = await fetch(url);
        const buffer = await response.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: buffer });
        currentTask = loadingTask;
        const doc = await loadingTask.promise;

        if (cancelado) {
          void loadingTask.destroy();
          return;
        }

        setPdfDoc(doc);
        setNumPages(doc.numPages);
        if (containerRef.current) {
          setContainerWidth(containerRef.current.clientWidth);
        }
      } catch {
        if (!cancelado) {
          setError('No se pudo renderizar el documento PDF en pantalla.');
        }
      } finally {
        if (!cancelado) {
          setCargando(false);
        }
      }
    };

    void cargarDocumento();

    return () => {
      cancelado = true;
      if (currentTask) {
        void currentTask.destroy();
      }
    };
  }, [url]);

  if (!url) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 flex flex-col p-1.5 sm:p-5 motion-safe:animate-in motion-safe:fade-in motion-reduce:animate-none">
      <div className="bg-surface rounded-2xl w-full max-w-4xl mx-auto flex flex-col flex-1 overflow-hidden border border-rule shadow-2xl text-ink">
        {/* Cabecera y Controles */}
        <div className="p-2.5 sm:p-4 border-b border-rule flex flex-wrap items-center justify-between gap-2 bg-paper-2">
          <div className="min-w-0 flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-brand/15 text-brand flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h4 className="text-xs sm:text-sm font-extrabold text-ink truncate">
                {titulo}
              </h4>
              <p className="text-[11px] text-ink-muted">
                {subtitulo} {numPages > 0 ? `• ${numPages} hojas` : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0 ml-auto">
            {/* Controles de Zoom para celular y desktop */}
            <div className="flex items-center bg-paper-3 border border-rule rounded-xl p-0.5">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(0.75, Number((z - 0.25).toFixed(2))))}
                disabled={zoom <= 0.75}
                title="Alejar"
                className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg text-ink-2 hover:bg-surface disabled:opacity-40 transition cursor-pointer"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setZoom(1)}
                className="px-2 text-[11px] font-bold text-ink cursor-pointer"
                title="Restablecer zoom"
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(2.5, Number((z + 0.25).toFixed(2))))}
                disabled={zoom >= 2.5}
                title="Acercar"
                className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg text-ink-2 hover:bg-surface disabled:opacity-40 transition cursor-pointer"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>

            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:flex min-h-[38px] px-3 rounded-xl bg-paper-2 hover:bg-surface text-ink font-bold text-xs items-center gap-1.5 transition border border-rule"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Abrir pestaña</span>
            </a>

            {onDescargar && (
              <button
                type="button"
                onClick={onDescargar}
                className="min-h-[38px] px-3.5 rounded-xl bg-brand hover:opacity-90 active:opacity-100 text-brand-contrast font-extrabold text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden xs:inline">Descargar</span>
              </button>
            )}

            {onCerrar && (
              <button
                type="button"
                onClick={onCerrar}
                className="min-h-[38px] min-w-[38px] rounded-xl bg-paper-2 hover:bg-surface text-ink-muted hover:text-ink flex items-center justify-center transition cursor-pointer border border-rule"
                aria-label="Cerrar vista previa"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Área de Visualización Nativa en Canvas (compatible con celulares Android/iOS sin apps externas) */}
        <div
          ref={containerRef}
          className="flex-1 bg-paper-3 overflow-y-auto overflow-x-auto p-2 sm:p-4"
        >
          {cargando ? (
            <div className="h-full min-h-[280px] flex flex-col items-center justify-center gap-2 text-ink-muted">
              <Loader2 className="w-7 h-7 animate-spin text-brand" />
              <p className="text-xs font-bold">Preparando páginas del documento…</p>
            </div>
          ) : error ? (
            <div className="h-full min-h-[280px] flex flex-col items-center justify-center gap-3 p-6 text-center">
              <AlertTriangle className="w-8 h-8 text-brand" />
              <p className="text-xs font-bold text-ink">{error}</p>
              {onDescargar && (
                <button
                  type="button"
                  onClick={onDescargar}
                  className="px-4 py-2 rounded-xl bg-brand hover:opacity-90 active:opacity-100 text-brand-contrast text-xs font-extrabold cursor-pointer transition-colors shadow-2xs"
                >
                  Descargar PDF
                </button>
              )}
            </div>
          ) : (
            pdfDoc &&
            Array.from({ length: numPages }, (_, idx) => (
              <PdfPageCanvas
                key={idx + 1}
                pdfDoc={pdfDoc}
                pageNumber={idx + 1}
                zoom={zoom}
                containerWidth={containerWidth}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
};
