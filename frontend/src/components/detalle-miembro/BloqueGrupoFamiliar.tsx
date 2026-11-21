import React from 'react';
import { Users } from 'lucide-react';

interface BloqueGrupoFamiliarProps {
  familiar: { nombreFamilia?: string } | null | undefined;
  pctDesc: number;
  integrantesFamilia: any[];
  habilitarVincularHermano: boolean;
  habilitarEditarDescuento: boolean;
  onEditarFamilia: () => void;
  onVincularHermano: () => void;
  puedeDesvincularIntegrante: (integrante: any) => boolean;
  desvinculandoMiembroId: number | null | undefined;
  onDesvincularRapido: (id: number, nombre: string) => void;
}

/**
 * Grupo familiar y descuento por hermanos del expediente. Antes estaba copiado en las
 * pestañas Datos y Cuotas con textos distintos; ahora ambas usan este bloque.
 */
export const BloqueGrupoFamiliar: React.FC<BloqueGrupoFamiliarProps> = ({
  familiar,
  pctDesc,
  integrantesFamilia,
  habilitarVincularHermano,
  habilitarEditarDescuento,
  onEditarFamilia,
  onVincularHermano,
  puedeDesvincularIntegrante,
  desvinculandoMiembroId,
  onDesvincularRapido,
}) => (
  <div className="p-4 rounded-2xl bg-brand/10 border border-brand/30 space-y-3">
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
      <div className="flex items-center gap-2 flex-wrap">
        <Users className="w-[18px] h-[18px] text-brand shrink-0" />
        <span className="font-bold text-[15px] text-ink">
          {familiar ? familiar.nombreFamilia : 'Sin grupo familiar'}
        </span>
        {familiar && pctDesc > 0 && (
          <span className="px-2.5 py-0.5 rounded-full bg-brand/20 text-brand font-bold text-xs">
            -{pctDesc}% desc. hermanos
          </span>
        )}
      </div>

      {(habilitarVincularHermano || habilitarEditarDescuento) && (
        <div className="flex items-center gap-2">
          {familiar && habilitarEditarDescuento && (
            <button
              type="button"
              onClick={onEditarFamilia}
              className="min-h-[40px] px-3.5 rounded-xl border border-brand/40 bg-surface text-brand font-bold text-[13px] cursor-pointer"
            >
              Editar familia ({pctDesc}%)
            </button>
          )}
          {habilitarVincularHermano && (
            <button
              type="button"
              onClick={onVincularHermano}
              className="min-h-[40px] px-3.5 rounded-xl bg-brand hover:opacity-90 active:opacity-100 text-brand-contrast font-bold text-[13px] cursor-pointer transition-colors"
            >
              + Hermano
            </button>
          )}
        </div>
      )}
    </div>

    {integrantesFamilia.length > 0 && (
      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-rule">
        <span className="text-xs font-bold text-ink-muted mr-1">Integrantes:</span>
        {integrantesFamilia.map((h: any) => (
          <span
            key={h.id}
            className="inline-flex items-center gap-1.5 pl-3 pr-2 py-1 rounded-xl bg-surface border border-brand/30 text-[13px] font-bold text-ink"
          >
            <span>
              {h.nombre} {h.apellido}
            </span>
            {puedeDesvincularIntegrante(h) && (
              <button
                type="button"
                disabled={desvinculandoMiembroId === h.id}
                onClick={() => onDesvincularRapido(h.id, `${h.nombre} ${h.apellido}`)}
                aria-label={`Quitar a ${h.nombre} ${h.apellido} del grupo familiar`}
                className="min-h-[32px] px-2 py-0.5 rounded-lg bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 text-rose-600 dark:text-rose-400 text-xs font-extrabold transition cursor-pointer disabled:opacity-50"
              >
                {desvinculandoMiembroId === h.id ? '...' : 'Quitar'}
              </button>
            )}
          </span>
        ))}
      </div>
    )}
  </div>
);
