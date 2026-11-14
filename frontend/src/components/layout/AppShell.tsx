import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Home,
  User,
  Users,
  FileText,
  Repeat,
  Ticket,
  Wallet,
  Shield,
  QrCode,
  Search,
  LogOut,
  Menu,
  KeyRound,
  WifiOff,
  Contrast,
} from 'lucide-react';
import { api } from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { useOfflineStore } from '../../store/offlineStore';
import { useThemeStore } from '../../store/themeStore';
import { useCapabilities, useActiveUnitStore } from '../../core/capabilities';
import { obtenerCicloAnioActual } from '../../lib/formatters';
import { BrandLogo } from '../ui/BrandLogo';
import { Drawer } from '../ui/Drawer';
import { ThemeToggle } from '../ThemeToggle';
import { BotonInstalarPwa } from '../BotonInstalarPwa';
import { CommandPaletteModal } from './CommandPaletteModal';
import { QrScannerModal } from '../QrScannerModal';
import { ModalScannerQR } from '../ModalScannerQR';

export const InsideAppShellContext = React.createContext(false);
export const useInsideAppShell = () => React.useContext(InsideAppShellContext);

interface AppShellProps {
  children: React.ReactNode;
  title?: string;
}

type NavGroup = 'Personal' | 'Operación Scout' | 'Administración';

interface NavItem {
  id: string;
  to: string;
  label: string;
  icon: React.ReactNode;
  group: NavGroup;
  show: boolean;
}

export const AppShell: React.FC<AppShellProps> = ({ children, title }) => {
  const { usuario, logout, requiereCambioClave } = useAuthStore();
  const isOnline = useOfflineStore((s) => s.isOnline);
  const openCustomizer = useThemeStore((s) => s.openCustomizer);
  const caps = useCapabilities();
  const { activeUnitId, setActiveUnitId } = useActiveUnitStore();

  const location = useLocation();
  const navigate = useNavigate();

  const [cmdkOpen, setCmdkOpen] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [qrModeAbierto, setQrModeAbierto] = useState<'none' | 'selector' | 'legajo' | 'evento'>('none');

  const cicloAnio = obtenerCicloAnioActual();

  // Unidades disponibles según alcance (si es GLOBAL con organizacion.ver trae todas; sino usa unidades asignadas)
  const { data: unidadesOrg } = useQuery({
    queryKey: ['shell-unidades-org'],
    enabled: Boolean(usuario) && caps.esGlobal && caps.hasAnyPermiso('organizacion.ver', 'organizacion.gestionar'),
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const res = await api.get('/organizacion/unidades');
      return Array.isArray(res.data) ? res.data : [];
    },
  });

  const visibleUnits = useMemo(() => {
    if (caps.esGlobal && Array.isArray(unidadesOrg) && unidadesOrg.length > 0) {
      return unidadesOrg
        .filter((u: any) => u.activa !== false)
        .map((u: any) => ({ id: Number(u.id), nombre: String(u.nombre) }));
    }
    return caps.unidadesAsignadas.map((u) => ({ id: u.id, nombre: u.nombre }));
  }, [caps.esGlobal, caps.unidadesAsignadas, unidadesOrg]);

  // Asegurar que activeUnitId sea válido cuando cambia el alcance o las unidades
  useEffect(() => {
    if (activeUnitId !== 'ALL' && visibleUnits.length > 0 && !visibleUnits.some((u) => u.id === activeUnitId)) {
      setActiveUnitId('ALL');
    }
  }, [activeUnitId, visibleUnits, setActiveUnitId]);

  // Atajo global Ctrl/Cmd + K
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdkOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Cerrar sheet "Más" cuando cambia la ruta
  useEffect(() => {
    setMobileMoreOpen(false);
  }, [location.pathname, location.search]);

  if (!usuario) return null;

  const allNavItems: NavItem[] = [
    {
      id: 'inicio',
      to: '/inicio',
      label: 'Inicio',
      icon: <Home className="w-4 h-4 shrink-0" />,
      group: 'Personal',
      show: true,
    },
    {
      id: 'mi-espacio',
      to: '/mi-espacio',
      label: 'Mi Espacio',
      icon: <User className="w-4 h-4 shrink-0" />,
      group: 'Personal',
      show: true,
    },
    {
      id: 'miembros',
      to: '/miembros',
      label: 'Miembros',
      icon: <Users className="w-4 h-4 shrink-0" />,
      group: 'Operación Scout',
      show: caps.canViewMiembros,
    },
    {
      id: 'legajos',
      to: '/legajos',
      label: 'Legajos',
      icon: <FileText className="w-4 h-4 shrink-0" />,
      group: 'Operación Scout',
      show: caps.canViewLegajosModule,
    },
    {
      id: 'pases',
      to: '/pases',
      label: 'Pases',
      icon: <Repeat className="w-4 h-4 shrink-0" />,
      group: 'Operación Scout',
      show: caps.canViewPases,
    },
    {
      id: 'eventos',
      to: '/eventos',
      label: 'Eventos',
      icon: <Ticket className="w-4 h-4 shrink-0" />,
      group: 'Operación Scout',
      show: caps.canViewEventos,
    },
    {
      id: 'tesoreria',
      to: '/tesoreria',
      label: 'Tesorería',
      icon: <Wallet className="w-4 h-4 shrink-0" />,
      group: 'Administración',
      show: caps.canSeeTesoreriaGestion,
    },
    {
      id: 'organizacion',
      to: '/organizacion',
      label: 'Organización',
      icon: <Shield className="w-4 h-4 shrink-0" />,
      group: 'Administración',
      show: caps.canViewOrganizacion,
    },
  ];
  const navItems = allNavItems.filter((item) => item.show);

  const isRouteActive = (to: string) =>
    location.pathname === to || location.pathname.startsWith(`${to}/`);

  const activeNav = navItems.find((it) => isRouteActive(it.to));
  const currentTitle = title || activeNav?.label || 'Juan XXIII';

  const handleOpenQr = () => {
    if (caps.canValidateQr && caps.canSellEventos) {
      setQrModeAbierto('selector');
    } else if (caps.canValidateQr) {
      setQrModeAbierto('legajo');
    } else if (caps.canSellEventos) {
      setQrModeAbierto('evento');
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  // Barra inferior móvil (4 tabs + FAB central)
  const mobileBottomSlots: Array<
    | { kind: 'link'; to: string; label: string; icon: React.ReactNode }
    | { kind: 'fab' }
    | { kind: 'more' }
  > = caps.canViewMiembros
    ? [
        { kind: 'link', to: '/inicio', label: 'Inicio', icon: <Home className="w-5 h-5" /> },
        { kind: 'link', to: '/miembros', label: 'Miembros', icon: <Users className="w-5 h-5" /> },
        { kind: 'fab' },
        caps.canSeeTesoreriaGestion
          ? { kind: 'link', to: '/tesoreria', label: 'Tesorería', icon: <Wallet className="w-5 h-5" /> }
          : { kind: 'link', to: '/eventos', label: 'Eventos', icon: <Ticket className="w-5 h-5" /> },
        { kind: 'more' },
      ]
    : [
        { kind: 'link', to: '/inicio', label: 'Inicio', icon: <Home className="w-5 h-5" /> },
        { kind: 'link', to: '/mi-espacio', label: 'Mi Espacio', icon: <User className="w-5 h-5" /> },
        { kind: 'fab' },
        caps.canSeeTesoreriaGestion
          ? { kind: 'link', to: '/tesoreria', label: 'Tesorería', icon: <Wallet className="w-5 h-5" /> }
          : { kind: 'link', to: '/eventos', label: 'Eventos', icon: <Ticket className="w-5 h-5" /> },
        { kind: 'more' },
      ];

  return (
    <InsideAppShellContext.Provider value={true}>
      <div className="min-h-screen flex bg-paper text-ink">
      {/* Sidebar Desktop */}
      <aside className="hidden md:flex w-60 lg:w-64 shrink-0 border-r border-rule bg-paper-2 flex-col justify-between p-3 sticky top-0 h-screen">
        <div className="space-y-4 overflow-y-auto no-scrollbar pr-0.5">
          <Link to="/inicio" className="flex items-center gap-2.5 px-2 py-1 rounded-xl hover:bg-surface/60 transition-colors">
            <BrandLogo variant="icon" size="sm" className="m-0 shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-extrabold leading-tight tracking-tight truncate">
                Juan XXIII N° 196
              </div>
              <div className="text-[10px] text-ink-muted truncate">Gestión Scout {cicloAnio}</div>
            </div>
          </Link>

          {(['Personal', 'Operación Scout', 'Administración'] as NavGroup[]).map((group) => {
            const items = navItems.filter((n) => n.group === group);
            if (!items.length) return null;
            return (
              <div key={group} className="space-y-1">
                <div className="px-2.5 text-[10px] uppercase font-bold tracking-wider text-ink-muted">
                  {group}
                </div>
                {items.map((it) => {
                  const active = isRouteActive(it.to);
                  return (
                    <Link
                      key={it.id}
                      to={it.to}
                      aria-current={active ? 'page' : undefined}
                      className={`s-nav-item w-full px-2.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2.5 ${
                        active
                          ? 's-btn-brand is-active'
                          : 'text-ink-2 hover:text-ink hover:bg-brand-soft/45'
                      }`}
                    >
                      {it.icon}
                      <span className="truncate">{it.label}</span>
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </div>

        <div className="space-y-2 pt-3 border-t border-rule shrink-0">
          <Link
            to="/mi-espacio?tab=perfil"
            className="s-card s-card-hover block rounded-xl p-2.5 text-[11px] space-y-0.5"
          >
            <div className="font-bold text-ink truncate">
              {usuario.nombre} {usuario.apellido}
            </div>
            <div className="text-ink-muted truncate">{caps.rolPrincipalLabel}</div>
            <div className="text-[10px] font-bold text-brand">Ver Mi Perfil y PWA →</div>
          </Link>

          <button
            type="button"
            onClick={handleLogout}
            className="w-full min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold text-ink-muted hover:text-rose-600 dark:hover:text-rose-400 hover:bg-surface border border-transparent hover:border-rule flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </aside>

      {/* Columna Principal */}
      <div className="flex-1 flex flex-col min-w-0">
        {requiereCambioClave && (
          <div className="bg-brand text-brand-contrast px-4 py-2 text-xs font-bold flex items-center justify-center gap-2">
            <KeyRound className="w-4 h-4 shrink-0" />
            <span>Actualizá tu contraseña inicial para operar con normalidad.</span>
            <Link to="/cambiar-clave" className="underline font-extrabold">
              Cambiar ahora
            </Link>
          </div>
        )}

        {/* Topbar Desktop & Mobile */}
        <header className="s-glass-bar sticky top-0 z-30 border-b border-rule px-3 sm:px-5 py-2.5 flex items-center justify-between gap-2">
          {/* Izquierda: Mobile Branding / Desktop Ctrl+K & Selector Unidad */}
          <div className="flex items-center gap-2 min-w-0">
            <Link to="/inicio" className="md:hidden flex items-center gap-2 min-w-0">
              <BrandLogo variant="icon" size="sm" className="m-0 shrink-0" />
              <span className="text-xs font-extrabold uppercase tracking-wide truncate">
                {currentTitle}
              </span>
            </Link>

            <button
              type="button"
              onClick={() => setCmdkOpen(true)}
              className="hidden md:flex s-input px-3 py-1.5 rounded-xl text-xs items-center gap-2 min-w-[220px] lg:min-w-[260px] text-ink-muted hover:border-brand cursor-pointer"
            >
              <Search className="w-3.5 h-3.5 shrink-0 text-brand" />
              <span className="flex-1 text-left truncate">
                Buscar miembro, DNI o acción…
              </span>
              <kbd className="px-1.5 py-0.5 rounded text-[10px] border border-rule bg-paper-2 font-mono">
                Ctrl K
              </kbd>
            </button>

            {!caps.esPropio && visibleUnits.length > 0 && (
              <select
                aria-label="Unidad activa"
                value={String(activeUnitId)}
                onChange={(e) => {
                  const val = e.target.value;
                  setActiveUnitId(val === 'ALL' ? 'ALL' : Number(val));
                }}
                className="s-input px-2 sm:px-2.5 py-1.5 rounded-xl text-[11px] sm:text-xs font-semibold max-w-[130px] sm:max-w-[220px] cursor-pointer"
              >
                <option value="ALL">
                  {caps.esGlobal ? 'Unidad: Todo el grupo' : 'Todas mis unidades'}
                </option>
                {visibleUnits.map((u) => (
                  <option key={u.id} value={String(u.id)}>
                    {u.nombre}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Derecha: Offline Pill, Search Mobile, PWA, Tema, QR Universal */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {!isOnline && (
              <span className="s-badge-warn px-2 py-1 rounded-lg text-[11px] font-bold hidden sm:inline-flex items-center gap-1">
                <WifiOff className="w-3 h-3" />
                <span>Offline</span>
              </span>
            )}

            <button
              type="button"
              onClick={() => setCmdkOpen(true)}
              aria-label="Buscador rápido"
              className="md:hidden s-btn-sec min-w-[38px] min-h-[38px] p-1.5 rounded-xl flex items-center justify-center cursor-pointer"
            >
              <Search className="w-4 h-4" />
            </button>

            <div className="hidden sm:block">
              <BotonInstalarPwa variante="navbar" />
            </div>

            <ThemeToggle variant="dropdown" />

            {caps.canUseQrScanner && (
              <button
                type="button"
                onClick={handleOpenQr}
                className="hidden md:inline-flex s-btn-brand px-3.5 min-h-[40px] rounded-xl text-xs items-center gap-1.5 cursor-pointer"
              >
                <QrCode className="w-4 h-4 shrink-0" />
                <span>Escáner QR</span>
              </button>
            )}
          </div>
        </header>

        {/* Contenido de Vista */}
        <main className="flex-1 min-w-0 p-3 sm:p-5 pb-24 md:pb-6">
          <div key={location.pathname} className="max-w-7xl mx-auto s-anim-view">
            {children}
          </div>
        </main>
      </div>

      {/* Bottom Bar Móvil */}
      <nav
        aria-label="Navegación principal móvil"
        className="md:hidden s-glass-bar fixed bottom-0 inset-x-0 z-30 border-t border-rule px-2 pt-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))] grid grid-cols-5 items-center"
      >
        {mobileBottomSlots.map((slot, idx) => {
          if (slot.kind === 'fab') {
            return (
              <div key={`fab-${idx}`} className="flex justify-center -mt-6">
                <button
                  type="button"
                  onClick={caps.canUseQrScanner ? handleOpenQr : () => navigate('/eventos')}
                  aria-label={caps.canUseQrScanner ? 'Abrir escáner QR' : 'Ver Eventos'}
                  className="s-btn-brand s-fab-btn w-14 h-14 rounded-full flex items-center justify-center border-4 border-paper cursor-pointer"
                >
                  {caps.canUseQrScanner ? (
                    <QrCode className="w-6 h-6" />
                  ) : (
                    <Ticket className="w-6 h-6" />
                  )}
                </button>
              </div>
            );
          }

          if (slot.kind === 'more') {
            return (
              <button
                key="more"
                type="button"
                onClick={() => setMobileMoreOpen(true)}
                aria-label="Más módulos y ajustes"
                className={`s-mob-tab flex flex-col items-center justify-center py-1 text-[10px] font-semibold cursor-pointer ${
                  mobileMoreOpen ? 'is-active text-brand' : 'text-ink-muted hover:text-ink'
                }`}
              >
                <Menu className="w-5 h-5" />
                <span className="mt-0.5">Más</span>
              </button>
            );
          }

          const active = isRouteActive(slot.to);
          return (
            <Link
              key={slot.to}
              to={slot.to}
              aria-current={active ? 'page' : undefined}
              className={`s-mob-tab flex flex-col items-center justify-center py-1 text-[10px] font-semibold ${
                active ? 'is-active text-brand font-bold' : 'text-ink-muted hover:text-ink'
              }`}
            >
              {slot.icon}
              <span className="mt-0.5 truncate max-w-full px-1">{slot.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Sheet Móvil "Más" */}
      <Drawer
        abierto={mobileMoreOpen}
        onCerrar={() => setMobileMoreOpen(false)}
        titulo="Módulos y Cuenta"
        subtitulo={`${usuario.nombre} ${usuario.apellido} · ${caps.rolPrincipalLabel}`}
        mode="sheet"
        maxWidthClass="sm:max-w-md"
      >
        <div className="grid grid-cols-2 gap-2">
          {navItems.map((it) => {
            const active = isRouteActive(it.to);
            return (
              <button
                key={it.id}
                type="button"
                onClick={() => {
                  setMobileMoreOpen(false);
                  navigate(it.to);
                }}
                className={`s-touch px-3 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 min-w-0 cursor-pointer ${
                  active ? 's-btn-brand' : 's-btn-sec'
                }`}
              >
                {it.icon}
                <span className="truncate">{it.label}</span>
              </button>
            );
          })}
        </div>

        <div className="pt-2 border-t border-rule space-y-2">
          <BotonInstalarPwa variante="card" />

          <button
            type="button"
            onClick={() => {
              setMobileMoreOpen(false);
              openCustomizer();
            }}
            className="w-full s-btn-sec s-touch px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center justify-between cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <Contrast className="w-4 h-4 text-brand" />
              <span>Apariencia (Claro / Oscuro / AAA)</span>
            </span>
            <span className="text-ink-muted">Ajustar →</span>
          </button>

          <button
            type="button"
            onClick={handleLogout}
            className="w-full s-btn-danger s-touch px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </Drawer>

      {/* Selector Rápido de Escáner (unificado completamente en Fase 2) */}
      <Drawer
        abierto={qrModeAbierto === 'selector'}
        onCerrar={() => setQrModeAbierto('none')}
        titulo="Escáner QR Universal"
        subtitulo="Elegí qué tipo de código vas a escanear"
        mode="sheet"
        maxWidthClass="sm:max-w-sm"
      >
        <div className="space-y-2.5">
          <button
            type="button"
            onClick={() => setQrModeAbierto('legajo')}
            className="w-full s-card s-card-hover p-3.5 rounded-xl text-left flex items-center gap-3 cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-brand-soft text-brand-soft-ink flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold text-ink">Validar Legajo Físico</div>
              <div className="text-xs text-ink-muted">Escanear QR SHA-256 al pie de la ficha</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setQrModeAbierto('evento')}
            className="w-full s-card s-card-hover p-3.5 rounded-xl text-left flex items-center gap-3 cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-brand-soft text-brand-soft-ink flex items-center justify-center shrink-0">
              <Ticket className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold text-ink">Canjear Vale / Entrada de Evento</div>
              <div className="text-xs text-ink-muted">Modo puerta continuo y cobro pendiente</div>
            </div>
          </button>
        </div>
      </Drawer>

      {qrModeAbierto === 'legajo' && (
        <QrScannerModal
          abierto={true}
          onCerrar={() => setQrModeAbierto('none')}
          onValidadoExitoso={() => setQrModeAbierto('none')}
        />
      )}

      {qrModeAbierto === 'evento' && (
        <ModalScannerQR
          abierto={true}
          onCerrar={() => setQrModeAbierto('none')}
          onTicketValidado={() => {}}
        />
      )}

      {/* Buscador Global Ctrl+K */}
      <CommandPaletteModal
        abierto={cmdkOpen}
        onCerrar={() => setCmdkOpen(false)}
        onAbrirQr={caps.canUseQrScanner ? handleOpenQr : undefined}
      />
      </div>
    </InsideAppShellContext.Provider>
  );
};
