import React from 'react';
import { obtenerConfigRama } from '../lib/ramaColors';
import {
  ESTADO_FICHA_CONFIG,
  calcularEdad,
  extraerTelefonosMiembro,
  formatearMoneda,
} from '../lib/formatters';
import { BotonLlamarMiembro } from './BotonLlamarMiembro';
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  ArrowRightLeft,
  CreditCard,
  Sparkles,
  FileCheck2,
  FileText,
  Loader2,
} from 'lucide-react';

export interface MiembroCardProps {
  miembro: any;
  unidades: any[];
  entrega?: any;
  tienePaseSugerido: boolean;
  validandoDirecto?: boolean;
  onAbrirDetalle: (tab: 'datos' | 'pase' | 'seguridad' | 'ficha' | 'cuotas') => void;
  onValidarFichaDirecto?: (entrega: any) => void;
}

export const MiembroCard: React.FC<MiembroCardProps> = ({
  miembro,
  unidades,
  entrega,
  tienePaseSugerido,
  validandoDirecto = false,
  onAbrirDetalle,
  onValidarFichaDirecto,
}) => {
  const asig = miembro.asignaciones?.[0];
  const cfgRama = obtenerConfigRama(miembro, unidades);
  const edad = calcularEdad(miembro.fechaNacimiento);
  const estadoKey = entrega?.estado || 'SIN_FICHA';
  const cfgFicha = ESTADO_FICHA_CONFIG[estadoKey] || ESTADO_FICHA_CONFIG.SIN_FICHA;

  const esPendienteFirma = entrega?.estado === 'PENDIENTE_FIRMA_FISICA';
  const esValidada = entrega?.estado === 'VALIDADO_FISICAMENTE';

  const deudaTotal = Math.round(
    (miembro.cargos || []).reduce(
      (acc: number, c: any) => acc + Math.max(0, Number(c.montoFinal) - Number(c.montoPagado)),
      0,
    ) * 100,
  ) / 100;

  return (
    <div
      onClick={() => onAbrirDetalle('datos')}
      className={`bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 border-l-4 p-4 shadow-2xs active:scale-[0.99] transition cursor-pointer ${
        !miembro.activo
          ? 'border-l-slate-300 dark:border-l-slate-700 opacity-65'
          : cfgRama.borderClases
      }`}
    >
      {/* Cabecera de la tarjeta: Avatar + Nombre + Estado de Ficha */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`w-11 h-11 rounded-2xl flex items-center justify-center text-sm shrink-0 shadow-2xs ${
              !miembro.activo
                ? 'bg-slate-200 dark:bg-slate-700 text-slate-500'
                : cfgRama.avatarClases
            }`}
          >
            {miembro.nombre?.[0]}
            {miembro.apellido?.[0]}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm truncate">
                {miembro.apellido}, {miembro.nombre}
              </h3>
              {!miembro.activo && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700">
                  Baja
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 flex-wrap mt-1">
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold text-[10px] border ${cfgRama.badgeClases}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${cfgRama.dotColor}`} />
                {asig?.unidad?.nombre || cfgRama.nombre}
              </span>

              {edad !== null && (
                <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                  • {edad} años
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Badge Semántico de Ficha (1-Tap a pestaña Ficha) */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAbrirDetalle('ficha');
          }}
          className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] font-bold border cursor-pointer ${cfgFicha.badgeClass}`}
        >
          {esValidada ? (
            <CheckCircle2 className="w-3 h-3" />
          ) : esPendienteFirma ? (
            <Clock className="w-3 h-3" />
          ) : (
            <AlertTriangle className="w-3 h-3" />
          )}
          <span>{cfgFicha.shortLabel}</span>
        </button>
      </div>

      {/* Acciones Rápidas (1-Tap) con área táctil >= 44px */}
      <div
        className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center gap-2 flex-wrap"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 1-Tap: Validar Ficha Física si está pendiente de firma */}
        {esPendienteFirma && onValidarFichaDirecto && (
          <button
            type="button"
            disabled={validandoDirecto}
            onClick={() => onValidarFichaDirecto(entrega)}
            className="min-h-[42px] px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-2xs disabled:opacity-50"
          >
            {validandoDirecto ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <FileCheck2 className="w-3.5 h-3.5" />
            )}
            <span>Recibir Ficha</span>
          </button>
        )}

        {/* 1-Tap: Pase sugerido */}
        {tienePaseSugerido && (
          <button
            type="button"
            onClick={() => onAbrirDetalle('pase')}
            className="min-h-[42px] px-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Pasar de Rama</span>
          </button>
        )}

        {/* 1-Tap: Ver Ficha del Miembro sin descargar */}
        <button
          type="button"
          onClick={() => onAbrirDetalle('ficha')}
          className="min-h-[42px] px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs flex items-center gap-1.5 transition cursor-pointer"
        >
          <FileText className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          <span>Ver Ficha</span>
        </button>

        {/* 1-Tap: Ir directo a Cuotas con indicador de deuda */}
        <button
          type="button"
          onClick={() => onAbrirDetalle('cuotas')}
          className={`min-h-[42px] px-3 rounded-xl font-bold text-xs flex items-center gap-1.5 transition cursor-pointer ${
            deudaTotal > 0
              ? 'bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60'
              : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200'
          }`}
        >
          <CreditCard
            className={`w-3.5 h-3.5 ${
              deudaTotal > 0
                ? 'text-rose-600 dark:text-rose-400'
                : 'text-emerald-600 dark:text-emerald-400'
            }`}
          />
          <span>{deudaTotal > 0 ? `Debe ${formatearMoneda(deudaTotal)}` : 'Cuotas al día'}</span>
        </button>

        {/* 1-Tap: Selector para llamar (Miembro, Madre, Padre, Tutor) */}
        <BotonLlamarMiembro miembro={miembro} entrega={entrega} />

        {extraerTelefonosMiembro(miembro, entrega).length === 0 && !tienePaseSugerido && (
          <button
            type="button"
            onClick={() => onAbrirDetalle('pase')}
            className="min-h-[42px] px-2.5 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold flex items-center gap-1 transition ml-auto cursor-pointer"
          >
            <ArrowRightLeft className="w-3.5 h-3.5" />
            <span>Pase</span>
          </button>
        )}
      </div>
    </div>
  );
};
