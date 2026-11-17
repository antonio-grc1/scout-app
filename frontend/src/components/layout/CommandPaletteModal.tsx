import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import {
  Search,
  QrCode,
  Wallet,
  Ticket,
  FileText,
  Repeat,
  Shield,
  User,
  Palette,
  ArrowRight,
  Users,
} from 'lucide-react';
import { api } from '../../api/client';
import { useCapabilities, useActiveUnitStore } from '../../core/capabilities';
import { useModalOverlay } from '../../hooks/useModalOverlay';
import { useThemeStore } from '../../store/themeStore';
import { normalizarTextoBusqueda } from '../../lib/formatters';

interface CommandPaletteModalProps {
  abierto: boolean;
  onCerrar: () => void;
  onAbrirQr?: () => void;
}

interface MiembroQuickItem {
  id: number;
  nombre: string;
  apellido: string;
  dni: string;
  activo?: boolean;
  asignaciones?: Array<{
    activo?: boolean;
    unidad?: { id: number; nombre: string } | null;
    rol?: { nombre: string } | null;
  }>;
}

export const CommandPaletteModal: React.FC<CommandPaletteModalProps> = ({
  abierto,
  onCerrar,
  onAbrirQr,
}) => {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const caps = useCapabilities();
  const activeUnitId = useActiveUnitStore((s) => s.activeUnitId);
  const openCustomizer = useThemeStore((s) => s.openCustomizer);

  const { backdropProps, contentProps } = useModalOverlay({
    abierto,
    onCerrar,
  });

  useEffect(() => {
    if (!abierto) {
      setQuery('');
      setDebouncedQuery('');
      return;
    }
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 30);
    return () => clearTimeout(timer);
  }, [abierto]);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 180);
    return () => clearTimeout(t);
  }, [query]);

  const { data: miembrosData, isFetching } = useQuery({
    queryKey: ['cmdk-miembros', debouncedQuery, activeUnitId, caps.canBajaMiembros],
    enabled: abierto && caps.canViewMiembros,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const params: Record<string, unknown> = {
        porPagina: 25,
        incluirInactivos: caps.canBajaMiembros ? true : undefined,
      };
      if (debouncedQuery) params.q = debouncedQuery;
      if (activeUnitId !== 'ALL') params.unidadId = activeUnitId;
      const res = await api.get('/miembros', { params });
      const items = Array.isArray(res.data?.items)
        ? res.data.items
        : Array.isArray(res.data)
          ? res.data
          : [];
      return items as MiembroQuickItem[];
    },
  });

  const miembrosFiltrados = useMemo(() => {
    const lista = miembrosData ?? [];
    const q = normalizarTextoBusqueda(query);
    const filtrados = q
      ? lista.filter((m) =>
          normalizarTextoBusqueda(`${m.nombre} ${m.apellido} ${m.dni}`).includes(q),
        )
      : lista;
    return filtrados.slice(0, 7);
  }, [miembrosData, query]);

  const acciones = useMemo(() => {
    const items: Array<{
      id: string;
      label: string;
      hint: string;
      icon: React.ReactNode;
      onSelect: () => void;
    }> = [];

    if (caps.canUseQrScanner && onAbrirQr) {
      items.push({
        id: 'qr',
        label: 'Abrir Escáner QR Universal',
        hint: 'Legajos físicos y Vales de evento',
        icon: <QrCode className="w-4 h-4 text-brand shrink-0" />,
        onSelect: () => {
          onCerrar();
          onAbrirQr();
        },
      });
    }

    if (caps.canSeeTesoreriaGestion) {
      items.push({
        id: 'tesoreria',
        label: 'Ir a Tesorería y Cobranzas',
        hint: 'Familias, cuotas, planes y caja',
        icon: <Wallet className="w-4 h-4 text-brand shrink-0" />,
        onSelect: () => {
          onCerrar();
          navigate('/tesoreria');
        },
      });
    }

    if (caps.canViewEventos) {
      items.push({
        id: 'eventos',
        label: 'Ir a Eventos del Grupo',
        hint: 'Catálogo en tarjetas, POS y vales',
        icon: <Ticket className="w-4 h-4 text-brand shrink-0" />,
        onSelect: () => {
          onCerrar();
          navigate('/eventos');
        },
      });
    }

    if (caps.canViewMiembros) {
      items.push({
        id: 'miembros',
        label: 'Ir al Padrón de Miembros',
        hint: 'Filtros por sección, bajas y ficha 360°',
        icon: <Users className="w-4 h-4 text-brand shrink-0" />,
        onSelect: () => {
          onCerrar();
          navigate('/miembros');
        },
      });
    }

    if (caps.canViewLegajosModule) {
      items.push({
        id: 'legajos',
        label: 'Ir a Legajos y Plantillas',
        hint: 'Cumplimiento anual y editor PDF',
        icon: <FileText className="w-4 h-4 text-brand shrink-0" />,
        onSelect: () => {
          onCerrar();
          navigate('/legajos');
        },
      });
    }

    if (caps.canViewPases) {
      items.push({
        id: 'pases',
        label: 'Ir a Pases y Camadas',
        hint: 'Progresión anual y solicitudes',
        icon: <Repeat className="w-4 h-4 text-brand shrink-0" />,
        onSelect: () => {
          onCerrar();
          navigate('/pases');
        },
      });
    }

    if (caps.canViewOrganizacion) {
      items.push({
        id: 'organizacion',
        label: 'Ir a Organización y Roles',
        hint: 'Ramas, unidades, roles y correo',
        icon: <Shield className="w-4 h-4 text-brand shrink-0" />,
        onSelect: () => {
          onCerrar();
          navigate('/organizacion');
        },
      });
    }

    items.push({
      id: 'mi-espacio',
      label: 'Ir a Mi Espacio Personal',
      hint: 'Mi legajo, cuotas, vales y perfil',
      icon: <User className="w-4 h-4 text-brand shrink-0" />,
      onSelect: () => {
        onCerrar();
        navigate('/mi-espacio');
      },
    });

    items.push({
      id: 'tema',
      label: 'Apariencia (Claro / Oscuro)',
      hint: 'Cambiar tema visual y escala tipográfica',
      icon: <Palette className="w-4 h-4 text-brand shrink-0" />,
      onSelect: () => {
        onCerrar();
        openCustomizer();
      },
    });

    const q = normalizarTextoBusqueda(query);
    if (!q) return items;
    return items.filter((it) => normalizarTextoBusqueda(`${it.label} ${it.hint}`).includes(q));
  }, [caps, query, onAbrirQr, onCerrar, navigate, openCustomizer]);

  if (!abierto) return null;

  return createPortal(
    <div
      className="s-anim-backdrop fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-end sm:items-start sm:pt-20 justify-center p-0 sm:p-4"
      role="presentation"
      {...backdropProps}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Buscador rápido"
        className="s-anim-sheet-up sm:s-anim-modal-pop w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl overflow-hidden bg-surface text-ink border border-rule shadow-2xl"
        {...contentProps}
      >
        <div className="px-4 py-3.5 border-b border-rule flex items-center gap-3">
          <Search className="w-[18px] h-[18px] text-brand shrink-0" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              caps.canViewMiembros
                ? 'Buscar miembro, DNI o acción rápida…'
                : 'Buscar acción o módulo rápido…'
            }
            className="flex-1 min-w-0 bg-transparent outline-none text-base text-ink placeholder:text-ink-muted"
          />
          <button
            type="button"
            onClick={onCerrar}
            className="s-btn-sec text-xs font-bold px-2.5 py-1 rounded-lg cursor-pointer shrink-0"
          >
            Esc
          </button>
        </div>

        <div className="p-2.5 max-h-[65dvh] sm:max-h-[420px] overflow-y-auto space-y-2.5">
          {caps.canViewMiembros && (
            <div className="space-y-1">
              <div className="px-3 pt-1 text-xs uppercase font-bold tracking-wider text-ink-muted flex items-center justify-between">
                <span>Miembros</span>
                {isFetching && <span className="text-xs lowercase font-medium">buscando…</span>}
              </div>

              {miembrosFiltrados.length > 0 ? (
                miembrosFiltrados.map((m) => {
                  const asigActiva =
                    m.asignaciones?.find((a) => a.activo !== false) ?? m.asignaciones?.[0];
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        onCerrar();
                        navigate(`/miembros/${m.id}`);
                      }}
                      className="w-full px-3 py-2.5 rounded-xl text-left text-sm flex items-center justify-between gap-2.5 hover:bg-brand-soft/45 transition-colors cursor-pointer"
                    >
                      <div className="min-w-0 flex-1 flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-ink truncate">
                          {m.apellido}, {m.nombre}
                        </span>
                        <span className="text-ink-muted s-tabular text-[13px]">DNI {m.dni}</span>
                        {m.activo === false && (
                          <span className="s-badge-err px-2 py-0.5 rounded text-xs font-bold">
                            BAJA
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-ink-muted shrink-0 truncate max-w-[150px]">
                        {asigActiva?.unidad?.nombre ?? asigActiva?.rol?.nombre ?? 'Sin unidad'}
                      </span>
                    </button>
                  );
                })
              ) : (
                <div className="px-3 py-2.5 text-sm text-ink-muted">
                  Sin coincidencias para tu búsqueda.
                </div>
              )}
            </div>
          )}

          <div className="space-y-1">
            <div className="px-3 pt-1 text-xs uppercase font-bold tracking-wider text-ink-muted">
              Acciones Rápidas
            </div>
            {acciones.length > 0 ? (
              acciones.map((acc) => (
                <button
                  key={acc.id}
                  type="button"
                  onClick={acc.onSelect}
                  className="w-full px-3 py-2.5 rounded-xl text-left text-sm flex items-center justify-between gap-2.5 hover:bg-brand-soft/45 transition-colors cursor-pointer group"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {acc.icon}
                    <div className="min-w-0">
                      <div className="font-semibold text-ink truncate">{acc.label}</div>
                      <div className="text-xs text-ink-muted truncate">{acc.hint}</div>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-ink-muted group-hover:text-brand shrink-0" />
                </button>
              ))
            ) : (
              <div className="px-3 py-2.5 text-sm text-ink-muted">
                No se encontraron acciones para “{query}”.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};
