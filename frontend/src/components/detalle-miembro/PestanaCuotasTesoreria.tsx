import React from 'react';
import {
  Wallet,
  CreditCard,
  PlusCircle,
  Pencil,
  Ban,
  RotateCcw,
  Trash2,
  Receipt,
  X,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import {
  formatearFecha,
  formatearMoneda,
  ESTADO_CARGO_CONFIG,
  NOMBRES_MESES_CORTOS,
  METODO_PAGO_LABELS,
} from '../../lib/formatters';
import { puedeDesvincularIntegrantePorAlcance } from '../../lib/permisos';
import { BloqueGrupoFamiliar } from './BloqueGrupoFamiliar';

export interface CargoEditando {
  id: number;
  nombreConcepto: string;
  esIndividual: boolean;
  montoOriginal: string;
  montoDescuento: string;
  fechaVencimiento: string;
}

export interface PagoEditando {
  id: number;
  metodoPago: 'EFECTIVO' | 'TRANSFERENCIA' | 'OTRO';
  referenciaComprobante: string;
  observaciones: string;
}

export interface PestanaCuotasTesoreriaProps {
  miembro: any;
  estadoCuenta: any;
  /** true si la consulta del estado de cuenta falló (no mostrar $0 como si fuera real). */
  estadoCuentaNoDisponible?: boolean;
  saldoPendiente: number;
  saldoAFavor: number;
  puedeGestionarTesoreria: boolean;
  puedeCobrarCuotas: boolean;
  puedeCrearCargoIndividual?: boolean;
  puedeAjustarCuotas?: boolean;
  puedeVincularHermano?: boolean;
  puedeEditarDescuentoFamilia?: boolean;
  esGlobal?: boolean;
  unidadesEnAlcanceIds?: readonly number[];
  ajustandoSaldo: boolean;
  setAjustandoSaldo: (val: boolean) => void;
  tipoAjusteSaldo: 'CARGAR' | 'DESCONTAR' | 'FIJAR';
  setTipoAjusteSaldo: (tipo: 'CARGAR' | 'DESCONTAR' | 'FIJAR') => void;
  montoAjusteSaldo: string;
  setMontoAjusteSaldo: (monto: string) => void;
  motivoAjusteSaldo: string;
  setMotivoAjusteSaldo: (motivo: string) => void;
  procesandoAccionCuota: boolean;
  desvinculandoMiembroId: number | null;
  cargoEditando: CargoEditando | null;
  setCargoEditando: (cargo: CargoEditando | null) => void;
  mostrarAnulados: boolean;
  setMostrarAnulados: (val: boolean) => void;
  pagoEditando: PagoEditando | null;
  setPagoEditando: (pago: PagoEditando | null) => void;
  onGuardarAjusteSaldo: (e: React.FormEvent) => Promise<void>;
  onIniciarEdicionCargo: (cargo: any) => void;
  onGuardarEdicionCargo: (e: React.FormEvent) => Promise<void>;
  onAnularCargo: (cargo: any) => void;
  onReactivarCargo: (cargoId: number, conceptoNombre: string) => Promise<void>;
  onEliminarCargoDefinitivo: (cargoId: number, conceptoNombre: string) => void;
  onRevertirPago: (pago: any) => void;
  onGuardarEdicionPago: (e: React.FormEvent) => Promise<void>;
  onDesvincularRapido: (targetUserId: number, targetNombre: string) => Promise<void>;
  onCobrarCargo: (cargoId: number | null) => void;
  onAbrirModalGenerarDeuda: () => void;
  onAbrirModalEditarFamilia: () => void;
  onAbrirModalVincularHermano: () => void;
}

export const PestanaCuotasTesoreria: React.FC<PestanaCuotasTesoreriaProps> = ({
  miembro,
  estadoCuenta,
  estadoCuentaNoDisponible = false,
  saldoPendiente,
  saldoAFavor,
  puedeGestionarTesoreria,
  puedeCobrarCuotas,
  puedeCrearCargoIndividual,
  puedeAjustarCuotas,
  puedeVincularHermano,
  puedeEditarDescuentoFamilia,
  esGlobal = true,
  unidadesEnAlcanceIds = [],
  ajustandoSaldo,
  setAjustandoSaldo,
  tipoAjusteSaldo,
  setTipoAjusteSaldo,
  montoAjusteSaldo,
  setMontoAjusteSaldo,
  motivoAjusteSaldo,
  setMotivoAjusteSaldo,
  procesandoAccionCuota,
  desvinculandoMiembroId,
  cargoEditando,
  setCargoEditando,
  mostrarAnulados,
  setMostrarAnulados,
  pagoEditando,
  setPagoEditando,
  onGuardarAjusteSaldo,
  onIniciarEdicionCargo,
  onGuardarEdicionCargo,
  onAnularCargo,
  onReactivarCargo,
  onEliminarCargoDefinitivo,
  onRevertirPago,
  onGuardarEdicionPago,
  onDesvincularRapido,
  onCobrarCargo,
  onAbrirModalGenerarDeuda,
  onAbrirModalEditarFamilia,
  onAbrirModalVincularHermano,
}) => {
  const familiar = miembro?.grupoFamiliar || estadoCuenta?.grupoFamiliar;
  const integrantesFamilia = familiar?.miembros || [];
  const pctDesc = familiar ? Number(familiar.porcentajeDescuentoHermanos ?? 0) : 0;
  const habilitarCargoIndividual =
    puedeCrearCargoIndividual ?? (puedeGestionarTesoreria || puedeCobrarCuotas);
  const habilitarAjustes = puedeAjustarCuotas ?? puedeGestionarTesoreria;
  const habilitarVincularHermano = puedeVincularHermano ?? puedeGestionarTesoreria;
  const habilitarEditarDescuento = puedeEditarDescuentoFamilia ?? puedeGestionarTesoreria;
  const puedeDesvincularIntegrante = (h: any) =>
    habilitarVincularHermano &&
    puedeDesvincularIntegrantePorAlcance(h, {
      esGlobal,
      unidadesEnAlcanceIds,
      miembroActualId: miembro?.id,
    });

  return (
    <div className="space-y-4">
      {estadoCuentaNoDisponible && (
        <div role="alert" className="s-badge-warn rounded-2xl p-3.5 text-[13px] font-semibold">
          No se pudo consultar el estado de cuenta. Los montos de abajo no son reales: actualizá el
          expediente antes de cobrar o ajustar.
        </div>
      )}
      {/* Resumen Financiero + Botones de Acción Directa */}
      <div className="p-4 sm:p-5 rounded-2xl bg-paper-2 border border-rule flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
        <div className="flex items-center gap-5 flex-wrap">
          <div>
            <span className="text-xs sm:text-[13px] font-semibold text-ink-muted block">
              Deuda Total
            </span>
            <span
              className={`text-2xl font-black ${
                saldoPendiente > 0
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-ink'
              }`}
            >
              {formatearMoneda(saldoPendiente)}
            </span>
          </div>

          <div className="pl-5 border-l border-rule">
            <div className="flex items-center gap-2">
              <span className="text-xs sm:text-[13px] font-semibold text-teal-600 dark:text-teal-400">
                Saldo a Favor
              </span>
              {habilitarAjustes && (
                <button
                  type="button"
                  onClick={() => {
                    setAjustandoSaldo(!ajustandoSaldo);
                    setMontoAjusteSaldo('');
                    setMotivoAjusteSaldo('');
                  }}
                  className="text-xs font-bold text-teal-700 dark:text-teal-300 underline hover:opacity-80 cursor-pointer"
                >
                  {ajustandoSaldo ? 'Cerrar' : 'Ajustar'}
                </button>
              )}
            </div>
            <span className="text-2xl font-black text-teal-600 dark:text-teal-400">
              {formatearMoneda(saldoAFavor)}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {habilitarCargoIndividual && (
            <button
              type="button"
              onClick={onAbrirModalGenerarDeuda}
              className="min-h-[44px] px-4 rounded-xl border border-rule bg-surface text-ink-2 font-bold text-[13px] flex items-center gap-1.5 cursor-pointer"
            >
              <PlusCircle className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>+ Cargo</span>
            </button>
          )}

          {puedeCobrarCuotas && (
            <button
              type="button"
              onClick={() => onCobrarCargo(null)}
              className="min-h-[44px] px-4 rounded-xl bg-brand hover:opacity-90 active:opacity-100 text-brand-contrast font-bold text-[13px] flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <CreditCard className="w-4 h-4" />
              <span>{saldoPendiente > 0 ? 'Cobrar / Pagar' : 'Registrar Adelanto'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Panel desplegable de Ajuste Manual de Saldo a Favor */}
      {ajustandoSaldo && (
        <form
          onSubmit={onGuardarAjusteSaldo}
          className="p-4 sm:p-5 rounded-2xl bg-teal-50/70 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800/60 space-y-3.5 animate-in fade-in"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-extrabold text-teal-950 dark:text-teal-100 flex items-center gap-2">
              <Wallet className="w-4 h-4 text-teal-600" />
              Ajustar Saldo a Favor Manualmente
            </span>
            <button
              type="button"
              onClick={() => setAjustandoSaldo(false)}
              className="text-ink-muted hover:text-ink cursor-pointer p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {([
              { k: 'CARGAR', label: '+ Cargar saldo' },
              { k: 'DESCONTAR', label: '- Devolver / Descontar' },
              { k: 'FIJAR', label: '= Fijar saldo exacto' },
            ] as const).map((opt) => (
              <button
                key={opt.k}
                type="button"
                onClick={() => setTipoAjusteSaldo(opt.k)}
                className={`min-h-[40px] py-2 px-2.5 rounded-xl text-xs sm:text-[13px] font-bold border transition cursor-pointer ${
                  tipoAjusteSaldo === opt.k
                    ? 'bg-teal-600 text-white border-teal-600'
                    : 'bg-surface text-ink-2 border-rule'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs sm:text-[13px] font-bold text-teal-900 dark:text-teal-200 mb-1.5">
                {tipoAjusteSaldo === 'FIJAR' ? 'Nuevo Saldo ($)' : 'Monto ($)'} *
              </label>
              <input
                type="number"
                step="0.01"
                min={tipoAjusteSaldo === 'FIJAR' ? 0 : 0.01}
                required
                value={montoAjusteSaldo}
                onChange={(e) => setMontoAjusteSaldo(e.target.value)}
                placeholder="Ej: 5000"
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-teal-300 dark:border-teal-700 bg-surface text-sm font-bold text-ink"
              />
            </div>
            <div>
              <label className="block text-xs sm:text-[13px] font-bold text-teal-900 dark:text-teal-200 mb-1.5">
                Motivo / Nota (opcional)
              </label>
              <input
                type="text"
                value={motivoAjusteSaldo}
                onChange={(e) => setMotivoAjusteSaldo(e.target.value)}
                placeholder="Ej: Devolución en mano, saldo año anterior..."
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-teal-300 dark:border-teal-700 bg-surface text-sm text-ink"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setAjustandoSaldo(false)}
              className="min-h-[40px] px-3.5 py-2 rounded-xl border border-rule text-[13px] font-semibold text-ink-2 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={procesandoAccionCuota || montoAjusteSaldo === ''}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-[13px] font-bold cursor-pointer disabled:opacity-50"
            >
              {procesandoAccionCuota ? 'Guardando...' : 'Aplicar Ajuste'}
            </button>
          </div>
        </form>
      )}

      {/* Grupo Familiar y Descuento Hermanos (bloque compartido con la pestaña Datos) */}
      <BloqueGrupoFamiliar
        familiar={familiar}
        pctDesc={pctDesc}
        integrantesFamilia={integrantesFamilia}
        habilitarVincularHermano={habilitarVincularHermano}
        habilitarEditarDescuento={habilitarEditarDescuento}
        onEditarFamilia={onAbrirModalEditarFamilia}
        onVincularHermano={onAbrirModalVincularHermano}
        puedeDesvincularIntegrante={puedeDesvincularIntegrante}
        desvinculandoMiembroId={desvinculandoMiembroId}
        onDesvincularRapido={onDesvincularRapido}
      />

      {/* Lista de Cuotas / Cargos en Tarjetas Mobile-First */}
      <div className="space-y-2.5">
        <span className="text-[13px] font-semibold text-ink-muted block">
          Cuotas y Conceptos Activos ({estadoCuenta?.cargos?.length || 0})
        </span>

        {estadoCuenta?.cargos?.length > 0 ? (
          <div className="space-y-2.5">
            {estadoCuenta.cargos.map((c: any) => {
              const pendiente = Math.max(
                0,
                Number(c.montoFinal) - Number(c.montoPagado),
              );
              const desc = Number(c.montoDescuento ?? 0);
              const cfgEstado =
                ESTADO_CARGO_CONFIG[c.estado] || ESTADO_CARGO_CONFIG.PENDIENTE;
              const puedeCobrar =
                puedeCobrarCuotas && c.estado !== 'PAGADO' && c.estado !== 'ANULADO';
              const estaEditandoEste = cargoEditando?.id === c.id;

              return (
                <div
                  key={c.id}
                  className="p-4 rounded-2xl bg-surface border border-rule space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-ink text-[15px]">
                          {c.concepto?.nombre || 'Cuota'}
                        </span>
                        {c.concepto?.mes && (
                          <span className="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-xs font-bold">
                            {NOMBRES_MESES_CORTOS[c.concepto.mes]}
                          </span>
                        )}
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${cfgEstado.badgeClass}`}
                        >
                          {cfgEstado.label}
                        </span>
                      </div>

                      <div className="text-[13px] text-ink-muted flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span>
                          Total: <strong>{formatearMoneda(c.montoFinal)}</strong>
                        </span>
                        {desc > 0 && (
                          <span className="text-brand font-semibold">
                            (Base {formatearMoneda(c.montoOriginal)} • Desc. -{formatearMoneda(desc)})
                          </span>
                        )}
                        {Number(c.montoPagado) > 0 && (
                          <span className="text-teal-700 dark:text-teal-300 font-semibold">
                            Abonado: {formatearMoneda(c.montoPagado)}
                          </span>
                        )}
                        {pendiente > 0 && c.estado !== 'ANULADO' && (
                          <span className="text-rose-600 dark:text-rose-400 font-bold">
                            Resta: {formatearMoneda(pendiente)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Acciones 1-Tap por Cuota */}
                    <div className="flex items-center gap-2 shrink-0">
                      {puedeCobrar && (
                        <button
                          type="button"
                          onClick={() => onCobrarCargo(c.id)}
                          className="min-h-[42px] px-4 rounded-xl bg-brand hover:opacity-90 active:opacity-100 text-brand-contrast font-bold text-[13px] flex items-center gap-1.5 cursor-pointer transition-colors"
                        >
                          <CreditCard className="w-4 h-4" />
                          <span>Cobrar {formatearMoneda(pendiente)}</span>
                        </button>
                      )}

                      {habilitarAjustes && (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              estaEditandoEste
                                ? setCargoEditando(null)
                                : onIniciarEdicionCargo(c)
                            }
                            title="Editar monto o descuento de esta cuota"
                            className="min-h-[42px] px-3 rounded-xl border border-rule text-ink-2 hover:bg-paper-2 font-semibold text-xs flex items-center gap-1 cursor-pointer"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            onClick={() => onAnularCargo(c)}
                            title="Anular cuota (si tiene pagos, pasan a Saldo a Favor)"
                            className="min-h-[42px] px-3 rounded-xl border border-rose-200/70 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 font-semibold text-xs flex items-center gap-1 cursor-pointer"
                          >
                            <Ban className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Editor en línea de la cuota */}
                  {estaEditandoEste && cargoEditando && (
                    <form
                      onSubmit={onGuardarEdicionCargo}
                      className="pt-3 border-t border-rule grid grid-cols-1 sm:grid-cols-3 gap-3 animate-in fade-in"
                    >
                      {cargoEditando.esIndividual && (
                        <div className="sm:col-span-3">
                          <label className="block text-xs font-bold text-ink-2 mb-1">
                            Concepto / Motivo
                          </label>
                          <input
                            type="text"
                            required
                            value={cargoEditando.nombreConcepto}
                            onChange={(e) =>
                              setCargoEditando({
                                ...cargoEditando,
                                nombreConcepto: e.target.value,
                              })
                            }
                            className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-rule bg-paper-2 text-sm"
                          />
                        </div>
                      )}
                      <div>
                        <label className="block text-xs font-bold text-ink-2 mb-1">
                          Monto Original ($)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          required
                          value={cargoEditando.montoOriginal}
                          onChange={(e) =>
                            setCargoEditando({
                              ...cargoEditando,
                              montoOriginal: e.target.value,
                            })
                          }
                          className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-rule bg-paper-2 text-sm font-bold"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-ink-2 mb-1">
                          Descuento ($)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max={cargoEditando.montoOriginal || undefined}
                          value={cargoEditando.montoDescuento}
                          onChange={(e) =>
                            setCargoEditando({
                              ...cargoEditando,
                              montoDescuento: e.target.value,
                            })
                          }
                          className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-rule bg-paper-2 text-sm font-bold text-brand"
                        />
                      </div>
                      <div className="flex items-end justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setCargoEditando(null)}
                          className="min-h-[42px] px-3.5 py-2 rounded-xl border border-rule text-[13px] font-semibold cursor-pointer"
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          disabled={procesandoAccionCuota}
                          className="min-h-[42px] px-4 py-2 rounded-xl bg-brand hover:opacity-90 active:opacity-100 text-brand-contrast text-[13px] font-bold cursor-pointer disabled:opacity-50 transition-colors"
                        >
                          Guardar
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-6 text-center text-sm bg-paper-2 rounded-2xl border border-rule text-ink-muted">
            Sin cuotas activas asignadas.
          </div>
        )}
      </div>

      {/* Cuotas Anuladas (Colapsable, permite Reactivar o Eliminar definitivamente) */}
      {estadoCuenta?.cargosAnulados?.length > 0 && (
        <div className="border border-rule rounded-2xl overflow-hidden">
          <button
            type="button"
            onClick={() => setMostrarAnulados(!mostrarAnulados)}
            className="w-full p-3.5 bg-paper-2 flex items-center justify-between text-[13px] font-bold text-ink-2 cursor-pointer"
          >
            <span>
              Cuotas anuladas ({estadoCuenta.cargosAnulados.length})
            </span>
            {mostrarAnulados ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>

          {mostrarAnulados && (
            <div className="p-3.5 space-y-2.5 bg-surface divide-y divide-rule">
              {estadoCuenta.cargosAnulados.map((ca: any) => (
                <div
                  key={ca.id}
                  className="pt-2.5 first:pt-0 flex items-center justify-between gap-2 text-[13px]"
                >
                  <div>
                    <span className="font-bold text-ink-2 line-through">
                      {ca.concepto?.nombre || 'Cuota'}
                    </span>
                    <span className="ml-2 text-ink-muted">
                      ({formatearMoneda(ca.montoFinal)})
                    </span>
                  </div>
                  {habilitarAjustes && (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={procesandoAccionCuota}
                        onClick={() =>
                          onReactivarCargo(ca.id, ca.concepto?.nombre || 'Cuota')
                        }
                        className="min-h-[34px] px-2.5 py-1 rounded-lg bg-brand/10 text-brand border border-brand/30 font-bold text-xs flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Reactivar</span>
                      </button>
                      <button
                        type="button"
                        disabled={procesandoAccionCuota}
                        onClick={() =>
                          onEliminarCargoDefinitivo(
                            ca.id,
                            ca.concepto?.nombre || 'Cuota',
                          )
                        }
                        title="Eliminar definitivamente"
                        className="p-2 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Historial de Pagos (con Edición y Reversión) */}
      {estadoCuenta?.pagos?.length > 0 && (
        <div className="space-y-2.5 pt-2.5 border-t border-rule">
          <span className="text-[13px] font-semibold text-ink-muted flex items-center gap-1.5">
            <Receipt className="w-4 h-4" />
            <span>Pagos Registrados ({estadoCuenta.pagos.length})</span>
          </span>

          <div className="space-y-2">
            {estadoCuenta.pagos.map((p: any) => {
              const editandoEstePago = pagoEditando?.id === p.id;
              const conceptosImputados =
                p.imputaciones
                  ?.map((imp: any) => imp.cargo?.concepto?.nombre)
                  .filter(Boolean)
                  .join(', ') || 'Pago a cuenta / Saldo a favor';

              return (
                <div
                  key={p.id}
                  className="p-3.5 rounded-xl bg-paper-2 border border-rule space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-extrabold text-brand text-[15px]">
                          +{formatearMoneda(p.montoTotal)}
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-surface text-ink-2 text-xs font-bold border border-rule">
                          {METODO_PAGO_LABELS[p.metodoPago] || p.metodoPago}
                        </span>
                        <span className="text-xs sm:text-[13px] text-ink-muted font-semibold truncate">
                          {conceptosImputados}
                        </span>
                      </div>
                      <span className="text-xs text-ink-muted block mt-1">
                        {formatearFecha(p.fechaPago)}
                        {p.referenciaComprobante &&
                          ` • Comprobante: ${p.referenciaComprobante}`}
                        {p.observaciones && ` • ${p.observaciones}`}
                      </span>
                    </div>

                    {habilitarAjustes && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            editandoEstePago
                              ? setPagoEditando(null)
                              : setPagoEditando({
                                  id: p.id,
                                  metodoPago: p.metodoPago || 'EFECTIVO',
                                  referenciaComprobante: p.referenciaComprobante || '',
                                  observaciones: p.observaciones || '',
                                })
                          }
                          title="Editar método o comprobante"
                          className="p-2 rounded-lg text-ink-muted hover:bg-paper-3 cursor-pointer"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onRevertirPago(p)}
                          title="Revertir / Anular este pago"
                          className="min-h-[34px] px-2.5 py-1 rounded-lg text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 font-bold text-xs flex items-center gap-1 cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Revertir</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {editandoEstePago && pagoEditando && (
                    <form
                      onSubmit={onGuardarEdicionPago}
                      className="pt-2.5 border-t border-rule grid grid-cols-1 sm:grid-cols-3 gap-2.5 animate-in fade-in"
                    >
                      <select
                        value={pagoEditando.metodoPago}
                        onChange={(e) =>
                          setPagoEditando({
                            ...pagoEditando,
                            metodoPago: e.target.value as any,
                          })
                        }
                        className="min-h-[40px] px-3 py-1.5 rounded-xl border border-rule bg-surface text-[13px] font-semibold"
                      >
                        <option value="EFECTIVO">Efectivo</option>
                        <option value="TRANSFERENCIA">Transferencia</option>
                        <option value="OTRO">Otro</option>
                      </select>
                      <input
                        type="text"
                        value={pagoEditando.referenciaComprobante}
                        onChange={(e) =>
                          setPagoEditando({
                            ...pagoEditando,
                            referenciaComprobante: e.target.value,
                          })
                        }
                        placeholder="N° Comprobante"
                        className="min-h-[40px] px-3 py-1.5 rounded-xl border border-rule bg-surface text-[13px]"
                      />
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={pagoEditando.observaciones}
                          onChange={(e) =>
                            setPagoEditando({
                              ...pagoEditando,
                              observaciones: e.target.value,
                            })
                          }
                          placeholder="Observaciones"
                          className="flex-1 min-h-[40px] px-3 py-1.5 rounded-xl border border-rule bg-surface text-[13px]"
                        />
                        <button
                          type="submit"
                          disabled={procesandoAccionCuota}
                          className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-brand hover:opacity-90 active:opacity-100 text-brand-contrast text-[13px] font-bold cursor-pointer transition-colors"
                        >
                          OK
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
