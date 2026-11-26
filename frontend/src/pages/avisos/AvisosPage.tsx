import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  BellRing,
  CheckCheck,
  CheckCircle2,
  Eye,
  Inbox,
  Loader2,
  Mail,
  Plus,
  Send,
  Trash2,
} from 'lucide-react';
import { api } from '../../api/client';
import { useActiveUnitStore, useCapabilities } from '../../core/capabilities';
import { invalidarAvisosQueries, useAvisosNoLeidosCount } from '../../hooks/useAvisos';
import { useConfirmar } from '../../hooks/useConfirmar';
import { formatearFecha, formatearFechaHora, traducirErrorAmigable } from '../../lib/formatters';
import {
  eliminarAviso,
  marcarAvisoLeido,
  marcarTodosAvisosLeidos,
  obtenerAvisosEnviados,
  obtenerBandejaAvisos,
} from '../../services/avisos.service';
import { useAuthStore } from '../../store/authStore';
import { useToastStore } from '../../store/toastStore';
import { SegmentedTabs, type SegmentedTabItem } from '../../components/ui';
import {
  DESTINATARIO_AVISO_LABELS,
  PRIORIDAD_AVISO_CONFIG,
} from '../../components/avisos/avisosUi';
import { BannerActivarPush } from '../../components/avisos/BannerActivarPush';
import { DrawerLecturasAviso } from './DrawerLecturasAviso';
import { ModalNuevoAviso } from './ModalNuevoAviso';

type TabAvisos = 'recibidos' | 'enviados';

export const AvisosPage: React.FC = () => {
  const usuario = useAuthStore((s) => s.usuario);
  const caps = useCapabilities();
  const activeUnitId = useActiveUnitStore((s) => s.activeUnitId);
  const queryClient = useQueryClient();
  const mostrarToast = useToastStore((s) => s.mostrarToast);
  const [searchParams, setSearchParams] = useSearchParams();
  const { pedir: pedirConfirmacion, dialogo: dialogoConfirmacion } = useConfirmar();

  const [tab, setTab] = useState<TabAvisos>('recibidos');
  const [soloNoLeidos, setSoloNoLeidos] = useState(false);
  const [incluirExpirados, setIncluirExpirados] = useState(false);
  const [modalNuevoAbierto, setModalNuevoAbierto] = useState(false);
  const [lecturasAvisoId, setLecturasAvisoId] = useState<number | null>(null);
  const [marcandoId, setMarcandoId] = useState<number | null>(null);
  const [marcandoTodos, setMarcandoTodos] = useState(false);

  // Abrir modal automáticamente si viene con ?nuevo=1
  useEffect(() => {
    if (searchParams.get('nuevo') === '1' && caps.canSendAvisos) {
      setModalNuevoAbierto(true);
      const next = new URLSearchParams(searchParams);
      next.delete('nuevo');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams, caps.canSendAvisos]);

  // Si pierde acceso a enviados, volver a recibidos
  useEffect(() => {
    if (tab === 'enviados' && !caps.canViewAvisosEnviados) {
      setTab('recibidos');
    }
  }, [tab, caps.canViewAvisosEnviados]);

  const { data: countData } = useAvisosNoLeidosCount();
  const noLeidos = countData ?? 0;

  const unidadesQuery = useQuery({
    queryKey: ['unidades-org', usuario?.id],
    enabled:
      Boolean(usuario?.id) &&
      caps.canSendAvisos &&
      caps.hasAnyPermiso('organizacion.ver', 'organizacion.editar'),
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const res = await api.get('/organizacion/unidades');
      return Array.isArray(res.data) ? (res.data as Array<{ id: number; nombre: string; activa?: boolean }>) : [];
    },
  });

  const unidadesActivas = useMemo(
    () => (unidadesQuery.data ?? []).filter((u) => u.activa !== false),
    [unidadesQuery.data],
  );

  const bandejaQuery = useQuery({
    queryKey: ['avisos-bandeja', usuario?.id, soloNoLeidos, incluirExpirados],
    enabled: Boolean(usuario?.id) && tab === 'recibidos',
    staleTime: 15_000,
    queryFn: () =>
      obtenerBandejaAvisos({
        soloNoLeidos: soloNoLeidos || undefined,
        incluirExpirados: incluirExpirados || undefined,
        porPagina: 50,
      }),
  });

  const enviadosQuery = useQuery({
    queryKey: ['avisos-enviados', usuario?.id, activeUnitId],
    enabled: Boolean(usuario?.id) && tab === 'enviados' && caps.canViewAvisosEnviados,
    staleTime: 15_000,
    queryFn: () =>
      obtenerAvisosEnviados({
        unidadId: activeUnitId !== 'ALL' ? activeUnitId : undefined,
        porPagina: 50,
      }),
  });

  const handleMarcarLeido = async (avisoId: number) => {
    setMarcandoId(avisoId);
    try {
      await marcarAvisoLeido(avisoId);
      await invalidarAvisosQueries(queryClient);
    } catch (err) {
      mostrarToast(traducirErrorAmigable(err, 'No se pudo marcar el aviso como leído.'), 'error');
    } finally {
      setMarcandoId(null);
    }
  };

  const handleMarcarTodos = async () => {
    if (marcandoTodos || noLeidos === 0) return;
    setMarcandoTodos(true);
    try {
      await marcarTodosAvisosLeidos();
      await invalidarAvisosQueries(queryClient);
      mostrarToast('Todos los avisos fueron marcados como leídos.', 'exito');
    } catch (err) {
      mostrarToast(traducirErrorAmigable(err, 'No se pudieron marcar los avisos.'), 'error');
    } finally {
      setMarcandoTodos(false);
    }
  };

  const handleEliminarAviso = (id: number, titulo: string) => {
    pedirConfirmacion(
      {
        titulo: 'Eliminar aviso',
        mensaje: `¿Seguro que querés eliminar el aviso "${titulo}"? Desaparecerá de la bandeja de todos los destinatarios.`,
        textoConfirmar: 'Eliminar aviso',
        peligroso: true,
        tipoImpacto: 'danger',
      },
      async () => {
        try {
          await eliminarAviso(id);
          await invalidarAvisosQueries(queryClient);
          mostrarToast('Aviso eliminado.', 'exito');
        } catch (err) {
          mostrarToast(traducirErrorAmigable(err, 'No se pudo eliminar el aviso.'), 'error');
        }
      },
    );
  };

  const tabsItems: SegmentedTabItem<TabAvisos>[] = [
    {
      id: 'recibidos',
      label: 'Recibidos',
      icon: <Inbox className="w-4 h-4" />,
      badge: noLeidos > 0 ? noLeidos : undefined,
    },
    ...(caps.canViewAvisosEnviados
      ? [
          {
            id: 'enviados' as const,
            label: 'Enviados',
            icon: <Send className="w-4 h-4" />,
          },
        ]
      : []),
  ];

  const recibidos = bandejaQuery.data?.items ?? [];
  const enviados = enviadosQuery.data?.items ?? [];

  return (
    <div className="s-anim-view space-y-5">
      {/* Cabecera */}
      <section className="s-card rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-brand">
            <Bell className="w-4 h-4" />
            <span>Comunicación interna</span>
          </div>
          <h1 className="text-2xl font-extrabold text-ink tracking-tight">
            Avisos y comunicados
          </h1>
          <p className="text-sm text-ink-muted">
            {noLeidos > 0
              ? `Tenés ${noLeidos} ${noLeidos === 1 ? 'aviso pendiente' : 'avisos pendientes'} de lectura.`
              : 'Estás al día con los avisos recibidos.'}
          </p>
        </div>

        {caps.canSendAvisos && (
          <button
            type="button"
            onClick={() => setModalNuevoAbierto(true)}
            className="s-btn-brand s-touch px-4.5 py-2.5 rounded-xl text-sm inline-flex items-center justify-center gap-2 shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Nuevo aviso</span>
          </button>
        )}
      </section>

      {/* Banner activación Web Push */}
      <BannerActivarPush />

      {/* Tabs */}
      {tabsItems.length > 1 && (
        <SegmentedTabs
          items={tabsItems}
          activeId={tab}
          onChange={setTab}
          ariaLabel="Vistas de avisos"
        />
      )}

      {/* Contenido Recibidos */}
      {tab === 'recibidos' && (
        <section className="space-y-4">
          <div className="s-panel rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setSoloNoLeidos(false)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border cursor-pointer transition-colors ${
                  !soloNoLeidos
                    ? 'bg-brand text-brand-contrast border-brand'
                    : 'bg-surface text-ink-2 border-rule hover:bg-paper-2'
                }`}
              >
                Todos
              </button>
              <button
                type="button"
                onClick={() => setSoloNoLeidos(true)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border cursor-pointer transition-colors ${
                  soloNoLeidos
                    ? 'bg-brand text-brand-contrast border-brand'
                    : 'bg-surface text-ink-2 border-rule hover:bg-paper-2'
                }`}
              >
                Solo no leídos {noLeidos > 0 ? `(${noLeidos})` : ''}
              </button>
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-ink-2 pl-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={incluirExpirados}
                  onChange={(e) => setIncluirExpirados(e.target.checked)}
                  className="rounded border-rule accent-brand w-4 h-4"
                />
                <span>Incluir vencidos</span>
              </label>
            </div>

            {noLeidos > 0 && (
              <button
                type="button"
                onClick={handleMarcarTodos}
                disabled={marcandoTodos}
                className="s-btn-sec min-h-[38px] px-3.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                {marcandoTodos ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CheckCheck className="w-3.5 h-3.5 text-brand" />
                )}
                <span>Marcar todos como leídos</span>
              </button>
            )}
          </div>

          {bandejaQuery.isLoading ? (
            <div className="py-12 text-center text-sm text-ink-muted flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-brand" />
              <span>Cargando avisos…</span>
            </div>
          ) : bandejaQuery.isError ? (
            <div className="s-badge-warn rounded-2xl p-4 text-sm font-semibold flex items-center justify-between gap-3">
              <span>No pudimos cargar tus avisos.</span>
              <button
                type="button"
                onClick={() => void bandejaQuery.refetch()}
                className="s-btn-sec px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer"
              >
                Reintentar
              </button>
            </div>
          ) : recibidos.length === 0 ? (
            <div className="s-card rounded-2xl p-10 text-center space-y-2">
              <Inbox className="w-10 h-10 text-ink-muted mx-auto opacity-60" />
              <p className="text-base font-bold text-ink">
                {soloNoLeidos ? 'No tenés avisos sin leer' : 'No tenés avisos en tu bandeja'}
              </p>
              <p className="text-sm text-ink-muted">
                {soloNoLeidos
                  ? 'Cambiá el filtro a "Todos" para revisar avisos ya leídos.'
                  : 'Cuando se envíe un comunicado para tu sección o grupo aparecerá acá.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {recibidos.map((aviso) => {
                const prio = PRIORIDAD_AVISO_CONFIG[aviso.prioridad] ?? PRIORIDAD_AVISO_CONFIG.NORMAL;
                return (
                  <article
                    key={aviso.id}
                    className={`s-card rounded-2xl p-4 sm:p-5 space-y-3 ${
                      !aviso.leido ? 'ring-1 ring-brand/45 bg-brand-soft/10' : ''
                    } ${prio.borderClass}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2.5">
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          {!aviso.leido && (
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold s-badge-brand">
                              Nuevo
                            </span>
                          )}
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${prio.badgeClass}`}>
                            {prio.label}
                          </span>
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-paper-2 text-ink-2 border border-rule">
                            {aviso.unidadNombre ?? 'Todo el grupo'}
                          </span>
                        </div>
                        <h2 className="text-base sm:text-lg font-extrabold text-ink break-words">
                          {aviso.titulo}
                        </h2>
                      </div>

                      {!aviso.leido ? (
                        <button
                          type="button"
                          disabled={marcandoId === aviso.id}
                          onClick={() => void handleMarcarLeido(aviso.id)}
                          className="s-btn-brand min-h-[38px] px-3.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shrink-0 cursor-pointer disabled:opacity-60"
                        >
                          {marcandoId === aviso.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          )}
                          <span>Marcar leído</span>
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-ink-muted shrink-0">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                          <span>Leído {aviso.leidoAt ? formatearFechaHora(aviso.leidoAt) : ''}</span>
                        </span>
                      )}
                    </div>

                    <p className="text-sm text-ink-2 whitespace-pre-line leading-relaxed">
                      {aviso.mensaje}
                    </p>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-rule text-xs text-ink-muted">
                      <span>
                        Enviado por{' '}
                        <strong className="text-ink-2">
                          {aviso.creadoPor.nombre} {aviso.creadoPor.apellido}
                        </strong>
                      </span>
                      <div className="flex items-center gap-3">
                        {aviso.fechaExpiracion && (
                          <span>Vence: {formatearFecha(aviso.fechaExpiracion)}</span>
                        )}
                        <span>{formatearFechaHora(aviso.createdAt)}</span>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Contenido Enviados */}
      {tab === 'enviados' && caps.canViewAvisosEnviados && (
        <section className="space-y-3">
          {enviadosQuery.isLoading ? (
            <div className="py-12 text-center text-sm text-ink-muted flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-brand" />
              <span>Cargando historial enviado…</span>
            </div>
          ) : enviadosQuery.isError ? (
            <div className="s-badge-warn rounded-2xl p-4 text-sm font-semibold flex items-center justify-between gap-3">
              <span>No pudimos cargar el historial de avisos enviados.</span>
              <button
                type="button"
                onClick={() => void enviadosQuery.refetch()}
                className="s-btn-sec px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer"
              >
                Reintentar
              </button>
            </div>
          ) : enviados.length === 0 ? (
            <div className="s-card rounded-2xl p-10 text-center space-y-2.5">
              <Send className="w-10 h-10 text-ink-muted mx-auto opacity-60" />
              <p className="text-base font-bold text-ink">No hay avisos enviados</p>
              <p className="text-sm text-ink-muted">
                Todavía no se enviaron comunicados dentro de tu alcance.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {enviados.map((aviso) => {
                const prio = PRIORIDAD_AVISO_CONFIG[aviso.prioridad] ?? PRIORIDAD_AVISO_CONFIG.NORMAL;
                const pct =
                  aviso.totalDestinatarios > 0
                    ? Math.round((aviso.totalLeidos / aviso.totalDestinatarios) * 100)
                    : 0;
                return (
                  <article key={aviso.id} className={`s-card rounded-2xl p-4 sm:p-5 space-y-3 ${prio.borderClass}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${prio.badgeClass}`}>
                            {prio.label}
                          </span>
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-paper-2 text-ink-2 border border-rule">
                            {DESTINATARIO_AVISO_LABELS[aviso.destinatarioTipo]} ·{' '}
                            {aviso.unidadNombre ?? 'Todo el grupo'}
                          </span>
                          {aviso.enviarPush && (
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-paper-2 text-ink-2 border border-rule inline-flex items-center gap-1">
                              <BellRing className="w-3 h-3 text-brand" />
                              <span className="s-tabular">Push: {aviso.pushEnviados}</span>
                            </span>
                          )}
                          {aviso.enviarEmail && (
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-paper-2 text-ink-2 border border-rule inline-flex items-center gap-1">
                              <Mail className="w-3 h-3 text-brand" />
                              <span className="s-tabular">Correo: {aviso.emailsEnviados}</span>
                            </span>
                          )}
                        </div>
                        <h2 className="text-base sm:text-lg font-extrabold text-ink break-words">
                          {aviso.titulo}
                        </h2>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => setLecturasAvisoId(aviso.id)}
                          className="s-btn-sec min-h-[38px] px-3 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5 text-brand" />
                          <span className="s-tabular">
                            {aviso.totalLeidos}/{aviso.totalDestinatarios} leyeron ({pct}%)
                          </span>
                        </button>
                        {caps.canSendAvisos && (
                          <button
                            type="button"
                            onClick={() => handleEliminarAviso(aviso.id, aviso.titulo)}
                            aria-label={`Eliminar aviso ${aviso.titulo}`}
                            title="Eliminar aviso"
                            className="s-btn-danger min-h-[38px] px-3 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Eliminar</span>
                          </button>
                        )}
                      </div>
                    </div>

                    <p className="text-sm text-ink-2 whitespace-pre-line leading-relaxed">
                      {aviso.mensaje}
                    </p>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-rule text-xs text-ink-muted">
                      <span>
                        Por{' '}
                        <strong className="text-ink-2">
                          {aviso.creadoPor.nombre} {aviso.creadoPor.apellido}
                        </strong>
                      </span>
                      <div className="flex items-center gap-3">
                        {aviso.fechaExpiracion && (
                          <span>Vence: {formatearFecha(aviso.fechaExpiracion)}</span>
                        )}
                        <span>{formatearFechaHora(aviso.createdAt)}</span>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      <ModalNuevoAviso
        abierto={modalNuevoAbierto}
        onCerrar={() => setModalNuevoAbierto(false)}
        unidades={unidadesActivas}
      />

      <DrawerLecturasAviso
        avisoId={lecturasAvisoId}
        onCerrar={() => setLecturasAvisoId(null)}
      />

      {dialogoConfirmacion}
    </div>
  );
};
