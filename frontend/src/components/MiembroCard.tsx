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
  obtenerRolPrincipal,
  obtenerRolesSecundarios,
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
import { Button } from './ui';

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
  const { usuario: usuarioActual, tienePermisoUnidadOGlobal } = useAuthStore();
  const puedeVerFicha = tienePermisoUnidadOGlobal('legajos.ver');
  const puedeValidarFisico =
    tienePermisoUnidadOGlobal('legajos.editar') && miembro?.id !== usuarioActual?.id;
  const puedeEjecutarPases = tienePermisoUnidadOGlobal('pases.editar');
  const puedeVerCuotas = tienePermisoUnidadOGlobal(['cobranzas.ver', 'caja.ver']);

  const asig = obtenerRolPrincipal(miembro);
  const rolesSecundarios = obtenerRolesSecundarios(miembro);
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
      (acc: number, c: any) =>
        c.estado === 'ANULADO' ? acc : acc + Math.max(0, Number(c.montoFinal) - Number(c.montoPagado)),
      0,
    ) * 100,
  ) / 100;

  return (
    <div
      tabIndex={0}
      onClick={() => onAbrirDetalle('datos')}
      onKeyDown={(e) => {
        // Teclado: Enter/Espacio abre el detalle (solo si el foco está en la tarjeta misma)
        if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onAbrirDetalle('datos');
        }
      }}
      className={`s-card s-card-hover rounded-2xl border-l-4 p-4 transition cursor-pointer ${
        !miembro.activo
          ? 'border-l-rule opacity-65'
          : cfgRama.borderClases
      }`}
    >
      {/* Cabecera de la tarjeta: Avatar + Nombre + Estado de Ficha */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`w-12 h-12 rounded-2xl flex items-center justify-center text-base font-bold shrink-0 ${
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
              <h3 className="font-bold text-ink text-base truncate">
                {miembro.apellido}, {miembro.nombre}
              </h3>
              {!miembro.activo && (
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-paper-2 text-ink-muted border border-rule">
                  Baja
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 flex-wrap mt-1">
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-bold text-xs border ${cfgRama.badgeClases}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${cfgRama.dotColor}`} />
                {asig?.unidad?.nombre || cfgRama.nombre}
              </span>

              {asig?.rol?.nombre && (
                <span className="text-xs font-semibold text-ink-2 bg-paper-2 px-2.5 py-0.5 rounded-full border border-rule">
                  {asig.rol.nombre}
                </span>
              )}

              {rolesSecundarios.map((sec: any) => (
                <span
                  key={sec.id}
                  className="text-xs font-semibold text-brand bg-brand/10 px-2.5 py-0.5 rounded-full border border-brand/20"
                >
                  +{sec.rol?.nombre || 'Rol'} ({sec.unidad?.nombre || 'Grupo'})
                </span>
              ))}

              {edad !== null && (
                <span className="text-xs text-ink-muted font-medium">
                  • {edad} años
                </span>
              )}

              {!esEducador && camada !== null && (
                <span className="px-2 py-0.5 rounded-md bg-paper-2 text-ink-2 text-xs font-bold border border-rule">
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
            className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-bold border cursor-pointer ${cfgFicha.badgeClass}`}
          >
            {esValidada ? (
              <CheckCircle2 className="w-3.5 h-3.5" />
            ) : esPendienteFirma ? (
              <Clock className="w-3.5 h-3.5" />
            ) : (
              <AlertTriangle className="w-3.5 h-3.5" />
            )}
            <span>{cfgFicha.shortLabel}</span>
          </button>
        ) : !puedeVerFicha ? null : (
          <div
            className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-bold border ${cfgFicha.badgeClass}`}
          >
            {esValidada ? (
              <CheckCircle2 className="w-3.5 h-3.5" />
            ) : esPendienteFirma ? (
              <Clock className="w-3.5 h-3.5" />
            ) : (
              <AlertTriangle className="w-3.5 h-3.5" />
            )}
            <span>{cfgFicha.shortLabel}</span>
          </div>
        )}
      </div>

      {/* Acciones Rápidas (1-Tap) con área táctil >= 44px */}
      <div
        className="mt-3.5 pt-3 border-t border-rule flex items-center gap-2 flex-wrap"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 1-Tap: Validar Ficha Física si está pendiente de firma */}
        {esPendienteFirma && puedeValidarFisico && onValidarFichaDirecto && (
          <Button
            type="button"
            disabled={validandoDirecto}
            onClick={() => onValidarFichaDirecto(entrega)}
          >
            {validandoDirecto ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FileCheck2 className="w-4 h-4" />
            )}
            <span>Recibir ficha</span>
          </Button>
        )}

        {/* 1-Tap: Pase sugerido */}
        {tienePaseSugerido && puedeEjecutarPases && (
          <Button
            type="button"
            onClick={() => onAbrirDetalle('pase')}
          >
            <Sparkles className="w-4 h-4" />
            <span>Pasar de rama</span>
          </Button>
        )}

        {/* 1-Tap: Ver Ficha del Miembro sin descargar */}
        {puedeVerFicha && (
          <button
            type="button"
            onClick={() => onAbrirDetalle('ficha')}
            className="min-h-[44px] px-3.5 rounded-xl bg-paper-2 hover:bg-surface text-ink font-semibold text-[13px] flex items-center gap-1.5 transition cursor-pointer border border-rule"
          >
            <FileText className="w-4 h-4 text-brand" />
            <span>Ver ficha</span>
          </button>
        )}

        {/* 1-Tap: Ir directo a Cuotas con indicador de deuda */}
        {puedeVerCuotas && (
          <button
            type="button"
            onClick={() => onAbrirDetalle('cuotas')}
            className={`min-h-[44px] px-3.5 rounded-xl font-bold text-[13px] flex items-center gap-1.5 transition cursor-pointer ${
              deudaTotal > 0
                ? 'bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60'
                : 'bg-paper-2 hover:bg-surface text-ink border border-rule'
            }`}
          >
            <CreditCard
              className={`w-4 h-4 ${
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
            className="min-h-[44px] px-3 rounded-xl text-ink-muted hover:bg-paper-2 text-[13px] font-semibold flex items-center gap-1.5 transition ml-auto cursor-pointer"
          >
            <ArrowRightLeft className="w-4 h-4" />
            <span>Pase</span>
          </button>
        )}
      </div>
    </div>
  );
};
