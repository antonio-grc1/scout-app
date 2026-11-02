import React from 'react';
import { FileCheck2, Eye, Download, Pencil, Loader2 } from 'lucide-react';
import { ESTADO_FICHA_CONFIG } from '../../lib/formatters';
import { DynamicFormRenderer, type EsquemaCampos } from '../DynamicFormRenderer';
import { VisorFichaMiembro } from '../VisorFichaMiembro';

export interface PestanaLegajosFichasProps {
  miembro: any;
  entregas: any[];
  editandoFicha: boolean;
  setEditandoFicha: (val: boolean) => void;
  plantillaActiva: any;
  precargaFicha: any;
  guardando: boolean;
  validandoFichaId: number | null;
  descargandoPdfId: number | null;
  generandoVistaPrevia: boolean;
  pdfPreviewUrl: string | null;
  cargandoFichaEditor: boolean;
  puedeValidarFisico: boolean;
  puedeCompletarFicha: boolean;
  onGuardarFichaEducador: (
    datos: Record<string, unknown>,
    finalizarParaFirma: boolean,
  ) => Promise<void>;
  onValidarFisicoDirecto: (entrega: any) => Promise<void>;
  onVerPdfEducador: (entrega?: any) => Promise<void>;
  onDescargarPdfEducador: (entrega?: any) => Promise<void>;
  onAbrirEditorFicha: () => Promise<void>;
  onCerrarPdfPreview: () => void;
}

export const PestanaLegajosFichas: React.FC<PestanaLegajosFichasProps> = ({
  miembro,
  entregas,
  editandoFicha,
  setEditandoFicha,
  plantillaActiva,
  precargaFicha,
  guardando,
  validandoFichaId,
  descargandoPdfId,
  generandoVistaPrevia,
  pdfPreviewUrl,
  cargandoFichaEditor,
  puedeValidarFisico,
  puedeCompletarFicha,
  onGuardarFichaEducador,
  onValidarFisicoDirecto,
  onVerPdfEducador,
  onDescargarPdfEducador,
  onAbrirEditorFicha,
  onCerrarPdfPreview,
}) => {
  if (editandoFicha && plantillaActiva && precargaFicha) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-extrabold text-ink-2">
            Completando Ficha 2026
          </span>
          <button
            type="button"
            onClick={() => setEditandoFicha(false)}
            className="min-h-[36px] px-3 rounded-xl bg-paper-3 text-ink-2 font-bold text-xs cursor-pointer"
          >
            Volver al resumen
          </button>
        </div>

        <DynamicFormRenderer
          esquema={plantillaActiva.esquemaCamposJson as EsquemaCampos}
          valoresIniciales={{
            protagonista_telefono: precargaFicha.usuario?.telefonoContacto || '',
            protagonista_domicilio:
              (precargaFicha.usuario?.datosFijosJson as any)?.protagonista_domicilio ||
              (precargaFicha.usuario?.datosFijosJson as any)?.domicilio ||
              '',
            ...(precargaFicha.datosFamiliaresSugeridos || {}),
            ...(precargaFicha.usuario?.datosFijosJson || {}),
            ...(precargaFicha.ultimaEntrega?.respuestasSnapshotJson || {}),
          }}
          onSubmit={onGuardarFichaEducador}
          cargando={guardando}
        />
      </div>
    );
  }

  const ent = entregas[0] || null;
  const estadoKey = ent?.estado || 'SIN_FICHA';
  const cfgEstado = ESTADO_FICHA_CONFIG[estadoKey] || ESTADO_FICHA_CONFIG.SIN_FICHA;
  const esPendiente = ent?.estado === 'PENDIENTE_FIRMA_FISICA';

  return (
    <div className="space-y-3">
      <div className="p-4 bg-surface rounded-2xl border border-rule space-y-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <span className="font-extrabold text-ink text-sm block">
              Ficha Médica y Autorizaciones 2026
            </span>
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`px-2.5 py-0.5 rounded-full font-bold text-[11px] border ${cfgEstado.badgeClass}`}
              >
                {cfgEstado.label}
              </span>
            </div>
            {ent?.validadoPor && (
              <span className="block text-[11px] text-brand font-bold pt-0.5">
                ✓ Papel recibido por {ent.validadoPor.nombre} {ent.validadoPor.apellido}
              </span>
            )}
          </div>
        </div>

        {/* Acciones Táctiles 1-Tap */}
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
          {esPendiente && puedeValidarFisico && (
            <button
              type="button"
              disabled={validandoFichaId === ent?.id}
              onClick={() => onValidarFisicoDirecto(ent)}
              className="col-span-2 sm:flex-1 min-h-[44px] px-4 rounded-xl bg-brand hover:opacity-90 active:opacity-100 text-brand-contrast font-extrabold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-2xs disabled:opacity-50"
            >
              <FileCheck2 className="w-4 h-4" />
              <span>
                {validandoFichaId === ent?.id ? 'Guardando...' : 'Recibir Papel'}
              </span>
            </button>
          )}

          <button
            type="button"
            disabled={generandoVistaPrevia}
            onClick={() => onVerPdfEducador(ent)}
            className="min-h-[44px] px-3.5 rounded-xl bg-brand/10 hover:bg-brand/15 text-brand border border-brand/30 font-extrabold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
          >
            {generandoVistaPrevia ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Eye className="w-4 h-4 text-brand" />
            )}
            <span>Ver Planilla PDF</span>
          </button>

          <button
            type="button"
            disabled={descargandoPdfId !== null}
            onClick={() => onDescargarPdfEducador(ent)}
            className="min-h-[44px] px-3.5 rounded-xl bg-paper-3 hover:opacity-90 text-ink font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50"
          >
            {descargandoPdfId !== null ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            <span>Descargar PDF</span>
          </button>

          {puedeCompletarFicha && (
            <button
              type="button"
              disabled={cargandoFichaEditor}
              onClick={onAbrirEditorFicha}
              className="col-span-2 sm:col-span-1 min-h-[44px] px-3.5 rounded-xl border border-rule bg-surface text-ink-2 hover:bg-paper-2 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50"
            >
              {cargandoFichaEditor ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Pencil className="w-4 h-4 text-brand" />
              )}
              <span>{ent ? 'Editar Ficha' : 'Rellenar Ficha'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Visualización Completa de la Ficha en Pantalla (Sin Descarga) */}
      <VisorFichaMiembro
        miembro={miembro}
        entrega={ent}
        pdfPreviewUrl={pdfPreviewUrl}
        onCerrarPdfPreview={onCerrarPdfPreview}
        onDescargarPdf={() => onDescargarPdfEducador(ent)}
      />
    </div>
  );
};
