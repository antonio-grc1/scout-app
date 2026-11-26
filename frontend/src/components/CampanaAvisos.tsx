import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  Loader2,
  Plus,
  ArrowRight,
  Inbox,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useToastStore } from '../store/toastStore';
import { useCapabilities } from '../core/capabilities';
import { invalidarAvisosQueries, useAvisosNoLeidosCount } from '../hooks/useAvisos';
import {
  marcarAvisoLeido,
  marcarTodosAvisosLeidos,
  obtenerBandejaAvisos,
  type AvisoBandejaItem,
} from '../services/avisos.service';
import { formatearFechaHora, traducirErrorAmigable } from '../lib/formatters';
import { Drawer } from './ui/Drawer';
import { BannerActivarPush } from './avisos/BannerActivarPush';
import { PRIORIDAD_AVISO_CONFIG } from './avisos/avisosUi';

export const CampanaAvisos: React.FC = () => {
  const usuario = useAuthStore((s) => s.usuario);
  const caps = useCapabilities();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const mostrarToast = useToastStore((s) => s.mostrarToast);

  const [abierto, setAbierto] = useState(false);
  const [expandidoId, setExpandidoId] = useState<number | null>(null);
  const [marcandoTodos, setMarcandoTodos] = useState(false);

  const { data: countData } = useAvisosNoLeidosCount();
  const noLeidos = countData ?? 0;

  const bandejaQuery = useQuery({
    queryKey: ['avisos-bandeja', usuario?.id, 'campana'],
    enabled: abierto && Boolean(usuario?.id),
    staleTime: 15_000,
    queryFn: () => obtenerBandejaAvisos({ porPagina: 15 }),
  });

  const items = bandejaQuery.data?.items ?? [];

  const handleToggleAviso = async (aviso: AvisoBandejaItem) => {
    setExpandidoId((prev) => (prev === aviso.id ? null : aviso.id));
    if (!aviso.leido) {
      try {
        await marcarAvisoLeido(aviso.id);
        await invalidarAvisosQueries(queryClient);
      } catch {
        // Silencioso en expansión rápida; la bandeja conserva el estado real
      }
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

  if (!caps.canViewAvisos) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label={noLeidos > 0 ? `Avisos (${noLeidos} sin leer)` : 'Avisos'}
        title="Avisos y comunicados"
        className="s-btn-sec relative min-w-[42px] min-h-[42px] p-2 rounded-xl flex items-center justify-center cursor-pointer"
      >
        <Bell className="w-[18px] h-[18px]" />
        {noLeidos > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-extrabold s-tabular flex items-center justify-center leading-none shadow-xs">
            {noLeidos > 99 ? '99+' : noLeidos}
          </span>
        )}
      </button>

      <Drawer
        abierto={abierto}
        onCerrar={() => setAbierto(false)}
        titulo="Avisos y comunicados"
        subtitulo={
          noLeidos > 0
            ? `${noLeidos} ${noLeidos === 1 ? 'aviso sin leer' : 'avisos sin leer'}`
            : 'Estás al día con tus avisos'
        }
        mode="drawer"
        maxWidthClass="sm:max-w-md"
        headerExtra={
          noLeidos > 0 ? (
            <button
              type="button"
              onClick={handleMarcarTodos}
              disabled={marcandoTodos}
              title="Marcar todos como leídos"
              className="s-btn-sec min-h-[36px] px-2.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
            >
              {marcandoTodos ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <CheckCheck className="w-3.5 h-3.5 text-brand" />
              )}
              <span className="hidden sm:inline">Marcar leídos</span>
            </button>
          ) : undefined
        }
        footer={
          <div className="flex items-center justify-between gap-2 flex-wrap">
            {caps.canSendAvisos && (
              <button
                type="button"
                onClick={() => {
                  setAbierto(false);
                  navigate('/avisos?nuevo=1');
                }}
                className="s-btn-brand s-touch px-3.5 py-2.5 rounded-xl text-sm inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Nuevo aviso</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setAbierto(false);
                navigate('/avisos');
              }}
              className="s-btn-sec s-touch px-4 py-2.5 rounded-xl text-sm font-bold inline-flex items-center gap-1.5 ml-auto cursor-pointer"
            >
              <span>Ver todos los avisos</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <BannerActivarPush variante="compacto" />
          {bandejaQuery.isLoading ? (
            <div className="py-12 text-center text-sm text-ink-muted flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-brand" />
              <span>Cargando avisos…</span>
            </div>
          ) : bandejaQuery.isError ? (
            <div className="s-badge-warn rounded-2xl p-4 text-sm font-semibold text-center space-y-2">
              <p>No se pudieron cargar tus avisos en este momento.</p>
              <button
                type="button"
                onClick={() => void bandejaQuery.refetch()}
                className="s-btn-sec px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer"
              >
                Reintentar
              </button>
            </div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center space-y-2.5">
              <Inbox className="w-10 h-10 text-ink-muted mx-auto opacity-60" />
              <p className="text-base font-bold text-ink">Sin avisos vigentes</p>
              <p className="text-sm text-ink-muted max-w-xs mx-auto">
                Cuando Jefatura o los educadores envíen un comunicado para tu sección o grupo, lo vas a ver acá.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {items.map((aviso) => {
                const expandido = expandidoId === aviso.id;
                const prio = PRIORIDAD_AVISO_CONFIG[aviso.prioridad] ?? PRIORIDAD_AVISO_CONFIG.NORMAL;
                return (
                  <button
                    key={aviso.id}
                    type="button"
                    onClick={() => void handleToggleAviso(aviso)}
                    className={`w-full text-left s-panel rounded-2xl p-3.5 space-y-2 transition-colors cursor-pointer hover:border-brand/50 ${
                      !aviso.leido ? 'ring-1 ring-brand/40 bg-brand-soft/15' : ''
                    } ${prio.borderClass}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                        {!aviso.leido && (
                          <span
                            className="w-2 h-2 rounded-full bg-brand shrink-0"
                            aria-label="Sin leer"
                          />
                        )}
                        {aviso.prioridad !== 'NORMAL' && (
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${prio.badgeClass}`}>
                            {prio.label}
                          </span>
                        )}
                        <span className="text-xs font-semibold text-ink-muted truncate">
                          {aviso.unidadNombre ?? 'Todo el grupo'}
                        </span>
                      </div>
                      {expandido ? (
                        <ChevronUp className="w-4 h-4 text-ink-muted shrink-0" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-ink-muted shrink-0" />
                      )}
                    </div>

                    <div className={`text-sm font-extrabold text-ink leading-snug ${!aviso.leido ? '' : 'opacity-90'}`}>
                      {aviso.titulo}
                    </div>

                    <p
                      className={`text-[13px] text-ink-2 whitespace-pre-line ${
                        expandido ? '' : 'line-clamp-2'
                      }`}
                    >
                      {aviso.mensaje}
                    </p>

                    <div className="flex items-center justify-between gap-2 text-[11px] text-ink-muted pt-0.5">
                      <span className="truncate">
                        De {aviso.creadoPor.nombre} {aviso.creadoPor.apellido}
                      </span>
                      <span className="shrink-0">{formatearFechaHora(aviso.createdAt)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </Drawer>
    </>
  );
};
