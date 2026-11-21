import React from 'react';
import { FileCheck2, Eye, Download, Pencil, Loader2 } from 'lucide-react';
import { ESTADO_FICHA_CONFIG, obtenerCicloAnioActual } from '../../lib/formatters';
import { DynamicFormRenderer, type EsquemaCampos } from '../DynamicFormRenderer';
import { VisorFichaMiembro } from '../VisorFichaMiembro';
import { Button } from '../ui';

export interface PestanaLegajosFichasProps {
  miembro: any;
  entregas: any[];
  plantillasAplicables?: any[];
  editandoFicha: boolean;
  setEditandoFicha: (val: boolean) => void;
  plantillaActiva: any;
  onSeleccionarPlantilla?: (plantilla: any) => void;
  precargaFicha: any;
  guardando: boolean;
  validandoFichaId: number | null;
  descargandoPdfId: number | null;
  generandoVistaPrevia: boolean;
  pdfPreviewUrl: string | null;
  ocultarModalPdf?: boolean;
  cargandoFichaEditor: boolean;
  puedeValidarFisico: boolean;
  puedeCompletarFicha: boolean;
  enDrawer?: boolean;
  onPreviewPdf?: (datosActuales: Record<string, unknown>) => void;
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
  plantillasAplicables = [],
  editandoFicha,
  setEditandoFicha,
  plantillaActiva,
  onSeleccionarPlantilla,
  precargaFicha,
  guardando,
  validandoFichaId,
  descargandoPdfId,
  generandoVistaPrevia,
  pdfPreviewUrl,
  ocultarModalPdf = false,
  cargandoFichaEditor,
  puedeValidarFisico,
  puedeCompletarFicha,
  enDrawer = false,
  onPreviewPdf,
  onGuardarFichaEducador,
  onValidarFisicoDirecto,
  onVerPdfEducador,
  onDescargarPdfEducador,
  onAbrirEditorFicha,
  onCerrarPdfPreview,
}) => {
  if (editandoFicha && plantillaActiva && precargaFicha) {
    return (
      <div className="space-y-3.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-extrabold text-ink-2 truncate">
            {plantillaActiva.titulo || `Completando Ficha ${obtenerCicloAnioActual()}`}
          </span>
          <button
            type="button"
            onClick={() => setEditandoFicha(false)}
            className="min-h-[40px] px-3.5 rounded-xl bg-paper-3 text-ink-2 font-bold text-[13px] cursor-pointer shrink-0"
          >
            Volver al resumen
          </button>
        </div>

        <DynamicFormRenderer
          key={`${plantillaActiva.id}-${miembro?.id}`}
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
          enDrawer={enDrawer}
          onPreviewPdf={onPreviewPdf}
          onSubmit={onGuardarFichaEducador}
          cargando={guardando}
        />
      </div>
    );
  }

  const plantillaSeleccionada =
    plantillaActiva || (plantillasAplicables.length > 0 ? plantillasAplicables[0] : null);

  const ent =
    plantillaSeleccionada && plantillasAplicables.length > 0
      ? entregas.find((e) => e.plantillaId === plantillaSeleccionada.id) || null
      : entregas[0] || null;

  const estadoKey = ent?.estado || 'SIN_FICHA';
  const cfgEstado = ESTADO_FICHA_CONFIG[estadoKey] || ESTADO_FICHA_CONFIG.SIN_FICHA;
  const esPendiente = ent?.estado === 'PENDIENTE_FIRMA_FISICA';

  return (
    <div className="space-y-3">
      {plantillasAplicables.length > 1 && onSeleccionarPlantilla && (
        <div className="p-3 bg-paper-2 rounded-2xl border border-rule space-y-2">
          <span className="text-xs font-bold uppercase tracking-wide text-ink-muted block">
            Documentos del Miembro ({plantillasAplicables.length})
          </span>
          <div className="flex flex-wrap gap-1.5">
            {plantillasAplicables.map((p) => {
              const activa = p.id === plantillaSeleccionada?.id;
              const entregaDoc = entregas.find((e) => e.plantillaId === p.id);
              const estDoc = entregaDoc?.estado || 'SIN_FICHA';
              const estCfg = ESTADO_FICHA_CONFIG[estDoc] || ESTADO_FICHA_CONFIG.SIN_FICHA;
              return (
                <button
                  aria-pressed={activa}
                  key={p.id}
                  type="button"
                  onClick={() => onSeleccionarPlantilla(p)}
                  className={`min-h-[38px] px-3 py-1.5 rounded-xl border text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                    activa
                      ? 'bg-brand text-brand-contrast border-brand'
                      : 'bg-surface text-ink border-rule hover:border-brand/50'
                  }`}
                >
                  <span className="truncate max-w-[190px]">{p.titulo}</span>
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

      <div className="p-4 bg-surface rounded-2xl border border-rule space-y-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5">
            <span className="font-extrabold text-ink text-[15px] block">
              {plantillaSeleccionada?.titulo || `Ficha Médica y Autorizaciones ${obtenerCicloAnioActual()}`}
            </span>
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`px-3 py-0.5 rounded-full font-bold text-xs border ${cfgEstado.badgeClass}`}
              >
                {cfgEstado.label}
              </span>
            </div>
            {ent?.validadoPor && (
              <span className="block text-xs text-brand-ink font-bold pt-0.5">
                ✓ Papel recibido por {ent.validadoPor.nombre} {ent.validadoPor.apellido}
              </span>
            )}
          </div>
        </div>

        {/* Acciones Táctiles 1-Tap */}
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
          {esPendiente && puedeValidarFisico && (
            <Button
              type="button"
              disabled={validandoFichaId === ent?.id}
              onClick={() => onValidarFisicoDirecto(ent)}
              className="col-span-2 sm:flex-1"
            >
              <FileCheck2 className="w-4 h-4" />
              <span>
                {validandoFichaId === ent?.id ? 'Guardando...' : 'Recibir Papel'}
              </span>
            </Button>
          )}

          <button
            type="button"
            disabled={generandoVistaPrevia}
            onClick={() => onVerPdfEducador(ent)}
            className="min-h-[46px] px-4 rounded-xl bg-brand-soft/70 hover:bg-brand-soft text-brand-ink border border-brand/40 font-extrabold text-[13px] flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
          >
            {generandoVistaPrevia ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Eye className="w-4 h-4 text-brand-ink" />
            )}
            <span>Ver Planilla PDF</span>
          </button>

          <button
            type="button"
            disabled={descargandoPdfId !== null}
            onClick={() => onDescargarPdfEducador(ent)}
            className="min-h-[46px] px-4 rounded-xl bg-paper-3 hover:opacity-90 text-ink font-bold text-[13px] flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
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
              className="col-span-2 sm:col-span-1 min-h-[46px] px-4 rounded-xl border border-rule bg-surface text-ink-2 hover:bg-paper-2 font-bold text-[13px] flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
            >
              {cargandoFichaEditor ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Pencil className="w-4 h-4 text-brand-ink" />
              )}
              <span>{ent ? 'Editar Ficha' : 'Rellenar Ficha'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Visualización Completa de la Ficha en Pantalla (Sin Descarga) */}
      <VisorFichaMiembro
        miembro={miembro}
        entrega={ent || entregas}
        plantillas={plantillasAplicables}
        pdfPreviewUrl={pdfPreviewUrl}
        ocultarModalPdf={ocultarModalPdf}
        onCerrarPdfPreview={onCerrarPdfPreview}
        onDescargarPdf={() => onDescargarPdfEducador(ent)}
        puedeCompletarFicha={puedeCompletarFicha}
      />
    </div>
  );
};
