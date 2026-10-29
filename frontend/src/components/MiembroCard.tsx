import React from 'react';
import { useAuthStore } from '../store/authStore';
import { obtenerConfigRama } from '../lib/ramaColors';
import {
  ESTADO_FICHA_CONFIG,
  calcularCamada,
  calcularEdad,
  esRolDeEducador,
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
  const { tienePermiso } = useAuthStore();
  const puedeVerFicha = tienePermiso('legajos.ver');
  const puedeValidarFisico = tienePermiso('legajos.validar_fisico');
  const puedeEjecutarPases = tienePermiso('pases.ejecutar');
  const puedeVerCuotas = tienePermiso('cuotas.ver') || tienePermiso('tesoreria.gestionar');

  const asig = miembro.asignaciones?.[0];
  const cfgRama = obtenerConfigRama(miembro, unidades);
  const edad = calcularEdad(miembro.fechaNacimiento);
  const camada = calcularCamada(miembro.fechaNacimiento);
  const esEducador = esRolDeEducador(asig?.rol) || cfgRama.key === 'adultos';
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
      className={`bg-surface rounded-2xl border border-rule border-l-4 p-4 shadow-2xs active:scale-[0.99] transition cursor-pointer ${
        !miembro.activo
          ? 'border-l-rule opacity-65'
          : cfgRama.borderClases
      }`}
    >
      {/* Cabecera de la tarjeta: Avatar + Nombre + Estado de Ficha */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`w-11 h-11 rounded-2xl flex items-center justify-center text-sm shrink-0 shadow-2xs ${
              !miembro.activo
                ? 'bg-paper-3 text-ink-muted'
                : cfgRama.avatarClases
            }`}
          >
            {miembro.nombre?.[0]}
            {miembro.apellido?.[0]}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h3 className="font-bold text-ink text-sm truncate">
                {miembro.apellido}, {miembro.nombre}
              </h3>
              {!miembro.activo && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-paper-2 text-ink-muted border border-rule">
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

              {asig?.rol?.nombre && (
                <span className="text-[10px] font-semibold text-ink-2 bg-paper-2 px-2 py-0.5 rounded-full border border-rule">
                  {asig.rol.nombre}
                </span>
              )}

              {edad !== null && (
                <span className="text-[11px] text-ink-muted font-medium">
                  • {edad} años
                </span>
              )}

              {!esEducador && camada !== null && (
                <span className="px-2 py-0.5 rounded-md bg-paper-2 text-ink-2 text-[10px] font-bold border border-rule">
                  Camada {camada}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Badge Semántico de Ficha (1-Tap a pestaña Ficha) */}
        {puedeVerFicha ? (
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
        ) : (
          <div
            className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] font-bold border ${cfgFicha.badgeClass}`}
          >
            {esValidada ? (
              <CheckCircle2 className="w-3 h-3" />
            ) : esPendienteFirma ? (
              <Clock className="w-3 h-3" />
            ) : (
              <AlertTriangle className="w-3 h-3" />
            )}
            <span>{cfgFicha.shortLabel}</span>
          </div>
        )}
      </div>

      {/* Acciones Rápidas (1-Tap) con área táctil >= 44px */}
      <div
        className="mt-3 pt-2.5 border-t border-rule flex items-center gap-2 flex-wrap"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 1-Tap: Validar Ficha Física si está pendiente de firma */}
        {esPendienteFirma && puedeValidarFisico && onValidarFichaDirecto && (
          <button
            type="button"
            disabled={validandoDirecto}
            onClick={() => onValidarFichaDirecto(entrega)}
            className="min-h-[42px] px-3 rounded-xl bg-brand hover:opacity-90 active:opacity-100 text-brand-contrast font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs disabled:opacity-50"
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
        {tienePaseSugerido && puedeEjecutarPases && (
          <button
            type="button"
            onClick={() => onAbrirDetalle('pase')}
            className="min-h-[42px] px-3 rounded-xl bg-brand hover:opacity-90 active:opacity-100 text-brand-contrast font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Pasar de Rama</span>
          </button>
        )}

        {/* 1-Tap: Ver Ficha del Miembro sin descargar */}
        {puedeVerFicha && (
          <button
            type="button"
            onClick={() => onAbrirDetalle('ficha')}
            className="min-h-[42px] px-3 rounded-xl bg-paper-2 hover:bg-surface text-ink font-semibold text-xs flex items-center gap-1.5 transition cursor-pointer border border-rule"
          >
            <FileText className="w-3.5 h-3.5 text-brand" />
            <span>Ver Ficha</span>
          </button>
        )}

        {/* 1-Tap: Ir directo a Cuotas con indicador de deuda */}
        {puedeVerCuotas && (
          <button
            type="button"
            onClick={() => onAbrirDetalle('cuotas')}
            className={`min-h-[42px] px-3 rounded-xl font-bold text-xs flex items-center gap-1.5 transition cursor-pointer ${
              deudaTotal > 0
                ? 'bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60'
                : 'bg-paper-2 hover:bg-surface text-ink border border-rule'
            }`}
          >
            <CreditCard
              className={`w-3.5 h-3.5 ${
                deudaTotal > 0
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-brand'
              }`}
            />
            <span>{deudaTotal > 0 ? `Debe ${formatearMoneda(deudaTotal)}` : 'Cuotas al día'}</span>
          </button>
        )}

        {/* 1-Tap: Selector para llamar (Miembro, Madre, Padre, Tutor) */}
        <BotonLlamarMiembro miembro={miembro} entrega={entrega} />

        {extraerTelefonosMiembro(miembro, entrega).length === 0 && !tienePaseSugerido && puedeEjecutarPases && (
          <button
            type="button"
            onClick={() => onAbrirDetalle('pase')}
            className="min-h-[42px] px-2.5 rounded-xl text-ink-muted hover:bg-paper-2 text-xs font-semibold flex items-center gap-1 transition ml-auto cursor-pointer"
          >
            <ArrowRightLeft className="w-3.5 h-3.5" />
            <span>Pase</span>
          </button>
        )}
      </div>
    </div>
  );
};
