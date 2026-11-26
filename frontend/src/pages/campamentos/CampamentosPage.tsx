import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Tent,
  Trash2,
  Users,
  XCircle,
} from 'lucide-react';
import { api } from '../../api/client';
import { useActiveUnitStore, useCapabilities } from '../../core/capabilities';
import { invalidarCampamentosQueries, useMisCampamentos } from '../../hooks/useCampamentos';
import { useConfirmar } from '../../hooks/useConfirmar';
import {
  ESTADO_CARGO_CONFIG,
  formatearFechaHora,
  formatearFechaLargaUTC,
  formatearMoneda,
  obtenerCicloAnioActual,
  traducirErrorAmigable,
} from '../../lib/formatters';
import {
  eliminarCampamento,
  obtenerCampamentosGestion,
  responderCampamento,
  type CampamentoGestionItem,
  type EstadoCampamento,
  type MiCampamentoItem,
} from '../../services/campamentos.service';
import { useAuthStore } from '../../store/authStore';
import { useToastStore } from '../../store/toastStore';
import { SegmentedTabs, type SegmentedTabItem } from '../../components/ui';
import { DrawerDetalleCampamento } from './DrawerDetalleCampamento';
import { ModalCampamento } from './ModalCampamento';

type TabCampamentos = 'mios' | 'gestion';

const ESTADO_CAMP_BADGE: Record<EstadoCampamento, { label: string; cls: string }> = {
  BORRADOR: { label: 'Borrador', cls: 'bg-paper-2 text-ink-muted border border-rule' },
  PUBLICADO: { label: 'Publicado', cls: 's-badge-ok' },
  CERRADO: { label: 'Cerrado', cls: 's-badge-warn' },
  FINALIZADO: { label: 'Finalizado', cls: 's-badge-info' },
  CANCELADO: { label: 'Cancelado', cls: 's-badge-err' },
};

export const CampamentosPage: React.FC = () => {
  const usuario = useAuthStore((s) => s.usuario);
  const caps = useCapabilities();
  const activeUnitId = useActiveUnitStore((s) => s.activeUnitId);
  const queryClient = useQueryClient();
  const mostrarToast = useToastStore((s) => s.mostrarToast);
  const [searchParams, setSearchParams] = useSearchParams();
  const { pedir: pedirConfirmacion, dialogo: dialogoConfirmacion } = useConfirmar();

  const [tab, setTab] = useState<TabCampamentos>(() =>
    caps.canManageCampamentos && searchParams.get('tab') === 'gestion' ? 'gestion' : 'mios',
  );
  const [modalAbierto, setModalAbierto] = useState(false);
  const [campamentoAEditar, setCampamentoAEditar] = useState<CampamentoGestionItem | null>(null);
  const [detalleCampId, setDetalleCampId] = useState<number | null>(null);
  const [respondiendoId, setRespondiendoId] = useState<number | null>(null);

  useEffect(() => {
    if (searchParams.get('nuevo') === '1' && caps.canEditCampamentos) {
      setCampamentoAEditar(null);
      setModalAbierto(true);
      if (caps.canManageCampamentos) setTab('gestion');
      const next = new URLSearchParams(searchParams);
      next.delete('nuevo');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams, caps.canEditCampamentos, caps.canManageCampamentos]);

  useEffect(() => {
    if (tab === 'gestion' && !caps.canManageCampamentos) {
      setTab('mios');
    }
  }, [tab, caps.canManageCampamentos]);

  const misCampamentosQuery = useMisCampamentos();

  const unidadesQuery = useQuery({
    queryKey: ['unidades-org', usuario?.id],
    enabled:
      Boolean(usuario?.id) &&
      caps.canEditCampamentos &&
      caps.hasAnyPermiso('organizacion.ver', 'organizacion.editar'),
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const res = await api.get('/organizacion/unidades');
      return Array.isArray(res.data)
        ? (res.data as Array<{ id: number; nombre: string; activa?: boolean }>)
        : [];
    },
  });

  const unidadesActivas = useMemo(
    () => (unidadesQuery.data ?? []).filter((u) => u.activa !== false),
    [unidadesQuery.data],
  );

  const gestionQuery = useQuery({
    queryKey: ['campamentos-gestion', usuario?.id, activeUnitId],
    enabled: Boolean(usuario?.id) && tab === 'gestion' && caps.canManageCampamentos,
    staleTime: 15_000,
    queryFn: () =>
      obtenerCampamentosGestion({
        unidadId: activeUnitId !== 'ALL' ? activeUnitId : undefined,
      }),
  });

  const misItems = misCampamentosQuery.data ?? [];
  const pendientesCount = useMemo(
    () =>
      misItems.filter(
        (c) =>
          c.estadoInscripcion === 'PENDIENTE' &&
          c.campamento.estado === 'PUBLICADO' &&
          !c.limiteVencido,
      ).length,
    [misItems],
  );

  const handleConfirmarAsistencia = (item: MiCampamentoItem) => {
    const montoFinal = item.montoEstimado.montoFinal;
    pedirConfirmacion(
      {
        titulo: `Confirmar asistencia a ${item.campamento.titulo}`,
        mensaje: `Vas a confirmar tu asistencia al campamento en ${item.campamento.lugar} (${formatearFechaLargaUTC(item.campamento.fechaInicio)} al ${formatearFechaLargaUTC(item.campamento.fechaFin)}).`,
        impacto:
          montoFinal > 0
            ? `Al confirmar se generará una deuda de ${formatearMoneda(montoFinal)} en tu cuenta corriente (Mis cuotas).`
            : 'Este campamento es gratuito: no generará deuda en tu cuenta.',
        textoConfirmar: 'Sí, confirmar asistencia',
        peligroso: false,
        tipoImpacto: 'info',
      },
      async () => {
        setRespondiendoId(item.campamento.id);
        try {
          await responderCampamento(item.campamento.id, 'CONFIRMAR');
          await invalidarCampamentosQueries(queryClient);
          mostrarToast(
            montoFinal > 0
              ? `Asistencia confirmada. Se generó el cargo de ${formatearMoneda(montoFinal)} en Mis cuotas.`
              : 'Asistencia confirmada.',
            'exito',
          );
        } catch (err) {
          mostrarToast(traducirErrorAmigable(err, 'No se pudo confirmar la asistencia.'), 'error');
        } finally {
          setRespondiendoId(null);
        }
      },
    );
  };

  const handleNoAsiste = (item: MiCampamentoItem) => {
    const estabaConfirmado = item.estadoInscripcion === 'CONFIRMADO';
    pedirConfirmacion(
      {
        titulo: estabaConfirmado
          ? `Cancelar asistencia a ${item.campamento.titulo}`
          : `Marcar que no asistís a ${item.campamento.titulo}`,
        mensaje: estabaConfirmado
          ? 'Se cancelará tu confirmación de asistencia.'
          : 'Tus educadores verán que no participás de este campamento.',
        impacto:
          estabaConfirmado && item.cargo
            ? 'La deuda pendiente generada por este campamento se anulará automáticamente.'
            : undefined,
        textoConfirmar: estabaConfirmado ? 'Cancelar asistencia' : 'Confirmar que no asisto',
        peligroso: estabaConfirmado,
        tipoImpacto: estabaConfirmado ? 'warn' : 'info',
      },
      async () => {
        setRespondiendoId(item.campamento.id);
        try {
          await responderCampamento(item.campamento.id, 'NO_ASISTE');
          await invalidarCampamentosQueries(queryClient);
          mostrarToast(
            estabaConfirmado
              ? 'Asistencia cancelada y deuda pendiente anulada.'
              : 'Respuesta registrada.',
            'exito',
          );
        } catch (err) {
          mostrarToast(traducirErrorAmigable(err, 'No se pudo registrar tu respuesta.'), 'error');
        } finally {
          setRespondiendoId(null);
        }
      },
    );
  };

  const handleEliminarCampamento = (c: CampamentoGestionItem) => {
    pedirConfirmacion(
      {
        titulo: 'Eliminar campamento',
        mensaje: `¿Seguro que querés eliminar "${c.titulo}"? Se borrarán las invitaciones y cargos impagos asociados.`,
        textoConfirmar: 'Eliminar campamento',
        peligroso: true,
        tipoImpacto: 'danger',
      },
      async () => {
        try {
          await eliminarCampamento(c.id);
          await invalidarCampamentosQueries(queryClient);
          mostrarToast('Campamento eliminado.', 'exito');
        } catch (err) {
          mostrarToast(traducirErrorAmigable(err, 'No se pudo eliminar el campamento.'), 'error');
        }
      },
    );
  };

  const tabsItems: SegmentedTabItem<TabCampamentos>[] = [
    {
      id: 'mios',
      label: 'Mis campamentos',
      icon: <Tent className="w-4 h-4" />,
      badge: pendientesCount > 0 ? pendientesCount : undefined,
    },
    ...(caps.canManageCampamentos
      ? [
          {
            id: 'gestion' as const,
            label: 'Gestión',
            icon: <Users className="w-4 h-4" />,
          },
        ]
      : []),
  ];

  const gestionItems = gestionQuery.data ?? [];

  return (
    <div className="s-anim-view space-y-5">
      {/* Cabecera */}
      <section className="s-card rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-brand">
            <Tent className="w-4 h-4" />
            <span>Salidas y vida en naturaleza · {obtenerCicloAnioActual()}</span>
          </div>
          <h1 className="text-2xl font-extrabold text-ink tracking-tight">Campamentos</h1>
          <p className="text-sm text-ink-muted">
            Consultá la información de tus campamentos y confirmá asistencia desde la app.
          </p>
        </div>

        {caps.canEditCampamentos && (
          <button
            type="button"
            onClick={() => {
              setCampamentoAEditar(null);
              setModalAbierto(true);
            }}
            className="s-btn-brand s-touch px-4.5 py-2.5 rounded-xl text-sm inline-flex items-center justify-center gap-2 shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Nuevo campamento</span>
          </button>
        )}
      </section>

      {tabsItems.length > 1 && (
        <SegmentedTabs
          items={tabsItems}
          activeId={tab}
          onChange={setTab}
          ariaLabel="Vistas de campamentos"
        />
      )}

      {/* Pestaña Mis Campamentos */}
      {tab === 'mios' && (
        <section className="space-y-4">
          {misCampamentosQuery.isLoading ? (
            <div className="py-12 text-center text-sm text-ink-muted flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-brand" />
              <span>Cargando campamentos…</span>
            </div>
          ) : misCampamentosQuery.isError ? (
            <div className="s-badge-warn rounded-2xl p-4 text-sm font-semibold flex items-center justify-between gap-3">
              <span>No pudimos cargar tus campamentos.</span>
              <button
                type="button"
                onClick={() => void misCampamentosQuery.refetch()}
                className="s-btn-sec px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer"
              >
                Reintentar
              </button>
            </div>
          ) : misItems.length === 0 ? (
            <div className="s-card rounded-2xl p-10 text-center space-y-2.5">
              <Tent className="w-10 h-10 text-ink-muted mx-auto opacity-60" />
              <p className="text-base font-bold text-ink">No tenés campamentos asignados</p>
              <p className="text-sm text-ink-muted max-w-md mx-auto">
                Cuando tus educadores o Jefatura publiquen un campamento para tu sección o grupo, va a aparecer acá como tarjeta para confirmar tu asistencia.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {misItems.map((item) => {
                const camp = item.campamento;
                const ocupado = respondiendoId === camp.id;
                const cargoCfg = item.cargo
                  ? ESTADO_CARGO_CONFIG[item.cargo.estado] ?? ESTADO_CARGO_CONFIG.PENDIENTE
                  : null;
                const tieneDescuento = item.montoEstimado.montoDescuento > 0;

                return (
                  <article
                    key={item.inscripcionId}
                    className={`s-card rounded-2xl p-5 flex flex-col justify-between gap-4 ${
                      item.estadoInscripcion === 'PENDIENTE' && !item.limiteVencido
                        ? 'ring-1 ring-brand/45'
                        : ''
                    }`}
                  >
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          {item.estadoInscripcion === 'CONFIRMADO' && (
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold s-badge-ok inline-flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Asistencia confirmada</span>
                            </span>
                          )}
                          {item.estadoInscripcion === 'PENDIENTE' && (
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold s-badge-warn inline-flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5" />
                              <span>Pendiente de confirmar</span>
                            </span>
                          )}
                          {(item.estadoInscripcion === 'NO_ASISTE' ||
                            item.estadoInscripcion === 'CANCELADO') && (
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-paper-2 text-ink-muted border border-rule inline-flex items-center gap-1">
                              <XCircle className="w-3.5 h-3.5" />
                              <span>
                                {item.estadoInscripcion === 'NO_ASISTE'
                                  ? 'No asistís'
                                  : 'Baja registrada'}
                              </span>
                            </span>
                          )}
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-paper-2 text-ink-2 border border-rule">
                            {camp.unidadNombre ?? 'Todo el grupo'}
                          </span>
                        </div>

                        {camp.estado !== 'PUBLICADO' && (
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${ESTADO_CAMP_BADGE[camp.estado].cls}`}
                          >
                            {ESTADO_CAMP_BADGE[camp.estado].label}
                          </span>
                        )}
                      </div>

                      <div>
                        <h2 className="text-lg font-extrabold text-ink leading-snug">
                          {camp.titulo}
                        </h2>
                        <div className="mt-2 space-y-1 text-sm text-ink-2">
                          <div className="flex items-center gap-2">
                            <MapPin className="w-4 h-4 text-brand shrink-0" />
                            <span>{camp.lugar}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-brand shrink-0" />
                            <span>
                              {formatearFechaLargaUTC(camp.fechaInicio)} al{' '}
                              {formatearFechaLargaUTC(camp.fechaFin)}
                            </span>
                          </div>
                          {camp.fechaLimiteConfirmacion && (
                            <div className="flex items-center gap-2 text-xs text-ink-muted">
                              <Clock className="w-3.5 h-3.5 shrink-0" />
                              <span>
                                Límite para confirmar:{' '}
                                <strong className="text-ink-2">
                                  {formatearFechaHora(camp.fechaLimiteConfirmacion)}
                                </strong>
                                {item.limiteVencido ? ' (plazo vencido)' : ''}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {camp.descripcion && (
                        <div className="s-panel rounded-xl p-3 text-sm text-ink-2 whitespace-pre-line leading-relaxed">
                          {camp.descripcion}
                        </div>
                      )}

                      {/* Costo y estado de deuda */}
                      <div className="s-panel rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-2">
                        <div className="space-y-0.5">
                          <div className="text-xs font-bold uppercase text-ink-muted">
                            {item.cargo ? 'Deuda asignada' : 'Costo del campamento'}
                          </div>
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <span className="text-lg font-extrabold s-tabular text-ink">
                              {item.montoEstimado.montoFinal > 0
                                ? formatearMoneda(item.montoEstimado.montoFinal)
                                : 'Gratuito'}
                            </span>
                            {tieneDescuento && (
                              <span className="text-xs text-ink-muted line-through s-tabular">
                                {formatearMoneda(item.montoEstimado.montoOriginal)}
                              </span>
                            )}
                            {tieneDescuento && (
                              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold s-badge-brand">
                                Con desc. hermanos
                              </span>
                            )}
                          </div>
                        </div>

                        {item.cargo && cargoCfg ? (
                          <div className="text-right space-y-1">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${cargoCfg.badgeClass}`}
                            >
                              <CreditCard className="w-3.5 h-3.5" />
                              <span>{cargoCfg.label}</span>
                            </span>
                            {item.cargo.estado !== 'PAGADO' && (
                              <div className="text-xs text-ink-muted s-tabular">
                                Pagado: {formatearMoneda(item.cargo.montoPagado)}
                              </div>
                            )}
                          </div>
                        ) : (
                          item.montoEstimado.montoFinal > 0 && (
                            <span className="text-xs text-ink-muted">
                              Se asigna al confirmar asistencia
                            </span>
                          )
                        )}
                      </div>

                      {/* Advertencia no bloqueante de Ficha Médica */}
                      {!item.fichaValidada && (
                        <div className="s-badge-warn rounded-xl px-3.5 py-2.5 text-xs flex items-start justify-between gap-2.5">
                          <div className="flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>
                              Tu ficha médica del ciclo {camp.cicloAnio} aún no está validada
                              físicamente. Podés confirmar igual, pero recordá presentarla antes de
                              salir.
                            </span>
                          </div>
                          <Link
                            to="/mi-espacio?tab=legajo"
                            className="font-extrabold underline shrink-0"
                          >
                            Ver legajo
                          </Link>
                        </div>
                      )}
                    </div>

                    {/* Acciones */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-rule">
                      {item.estadoInscripcion !== 'CONFIRMADO' && item.puedeConfirmar && (
                        <div className="flex flex-wrap items-center gap-2 w-full">
                          <button
                            type="button"
                            disabled={ocupado}
                            onClick={() => handleConfirmarAsistencia(item)}
                            className="s-btn-brand s-touch flex-1 px-4 py-2.5 rounded-xl text-sm inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
                          >
                            {ocupado ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <CheckCircle2 className="w-4 h-4" />
                            )}
                            <span>Confirmar asistencia</span>
                          </button>
                          {item.estadoInscripcion !== 'NO_ASISTE' && (
                            <button
                              type="button"
                              disabled={ocupado}
                              onClick={() => handleNoAsiste(item)}
                              className="s-btn-sec s-touch px-4 py-2.5 rounded-xl text-sm font-bold cursor-pointer disabled:opacity-60"
                            >
                              No asisto
                            </button>
                          )}
                        </div>
                      )}

                      {item.estadoInscripcion === 'CONFIRMADO' && (
                        <div className="flex flex-wrap items-center justify-between gap-2 w-full">
                          {item.cargo && item.cargo.estado !== 'PAGADO' && (
                            <Link
                              to="/mi-espacio?tab=cuotas"
                              className="text-xs font-extrabold text-brand hover:underline inline-flex items-center gap-1"
                            >
                              <CreditCard className="w-3.5 h-3.5" />
                              <span>Ver deuda en Mis cuotas →</span>
                            </Link>
                          )}
                          {item.puedeCancelar ? (
                            <button
                              type="button"
                              disabled={ocupado}
                              onClick={() => handleNoAsiste(item)}
                              className="s-btn-sec min-h-[38px] px-3.5 rounded-xl text-xs font-bold ml-auto cursor-pointer disabled:opacity-60"
                            >
                              Cancelar asistencia
                            </button>
                          ) : item.cargo && item.cargo.montoPagado > 0 ? (
                            <span className="text-xs text-ink-muted ml-auto">
                              Ya tiene pagos registrados: para darte de baja hablá con un educador.
                            </span>
                          ) : null}
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Pestaña Gestión */}
      {tab === 'gestion' && caps.canManageCampamentos && (
        <section className="space-y-3">
          {gestionQuery.isLoading ? (
            <div className="py-12 text-center text-sm text-ink-muted flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-brand" />
              <span>Cargando campamentos…</span>
            </div>
          ) : gestionQuery.isError ? (
            <div className="s-badge-warn rounded-2xl p-4 text-sm font-semibold flex items-center justify-between gap-3">
              <span>No pudimos cargar los campamentos de tu alcance.</span>
              <button
                type="button"
                onClick={() => void gestionQuery.refetch()}
                className="s-btn-sec px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer"
              >
                Reintentar
              </button>
            </div>
          ) : gestionItems.length === 0 ? (
            <div className="s-card rounded-2xl p-10 text-center space-y-2.5">
              <Tent className="w-10 h-10 text-ink-muted mx-auto opacity-60" />
              <p className="text-base font-bold text-ink">Todavía no hay campamentos creados</p>
              <p className="text-sm text-ink-muted">
                Creá el primer campamento para invitar a tu sección o grupo y seguir las confirmaciones en vivo.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {gestionItems.map((c) => {
                const badge = ESTADO_CAMP_BADGE[c.estado];
                return (
                  <article key={c.id} className="s-card rounded-2xl p-4 sm:p-5 space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${badge.cls}`}>
                            {badge.label}
                          </span>
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-paper-2 text-ink-2 border border-rule">
                            {c.unidadNombre ?? 'Todo el grupo'}
                          </span>
                          <span className="text-xs font-bold text-ink-muted s-tabular">
                            {c.costoBase > 0 ? formatearMoneda(c.costoBase) : 'Gratuito'}
                          </span>
                        </div>
                        <h2 className="text-base sm:text-lg font-extrabold text-ink">{c.titulo}</h2>
                        <div className="text-xs sm:text-sm text-ink-muted flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-brand" />
                            <span>{c.lugar}</span>
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 text-brand" />
                            <span>
                              {formatearFechaLargaUTC(c.fechaInicio)} al{' '}
                              {formatearFechaLargaUTC(c.fechaFin)}
                            </span>
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => setDetalleCampId(c.id)}
                          className="s-btn-brand min-h-[38px] px-3.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <Users className="w-3.5 h-3.5" />
                          <span>
                            Asistentes ({c.resumen.confirmados}/{c.resumen.totalInvitados})
                          </span>
                        </button>
                        {caps.canEditCampamentos && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setCampamentoAEditar(c);
                                setModalAbierto(true);
                              }}
                              aria-label={`Editar ${c.titulo}`}
                              className="s-btn-sec min-h-[38px] px-3 rounded-xl text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">Editar</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleEliminarCampamento(c)}
                              aria-label={`Eliminar ${c.titulo}`}
                              className="s-btn-danger min-h-[38px] px-3 rounded-xl text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-rule text-xs">
                      <div>
                        <span className="text-ink-muted">Confirmados: </span>
                        <strong className="text-emerald-600 dark:text-emerald-400 s-tabular">
                          {c.resumen.confirmados}
                        </strong>
                      </div>
                      <div>
                        <span className="text-ink-muted">Pendientes: </span>
                        <strong className="text-amber-600 dark:text-amber-400 s-tabular">
                          {c.resumen.pendientes}
                        </strong>
                      </div>
                      <div>
                        <span className="text-ink-muted">No asisten: </span>
                        <strong className="text-ink s-tabular">
                          {c.resumen.noAsisten + c.resumen.cancelados}
                        </strong>
                      </div>
                      <div>
                        <span className="text-ink-muted">Recaudado: </span>
                        <strong className="text-ink s-tabular">
                          {formatearMoneda(c.resumen.totalRecaudado)} /{' '}
                          {formatearMoneda(c.resumen.totalFacturado)}
                        </strong>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      <ModalCampamento
        abierto={modalAbierto}
        campamentoAEditar={campamentoAEditar}
        unidades={unidadesActivas}
        onCerrar={() => setModalAbierto(false)}
      />

      <DrawerDetalleCampamento
        campamentoId={detalleCampId}
        onCerrar={() => setDetalleCampId(null)}
      />

      {dialogoConfirmacion}
    </div>
  );
};
