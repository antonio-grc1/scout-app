import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { ThemeToggle } from './ThemeToggle';
import { BotonInstalarPwa } from './BotonInstalarPwa';
import { BrandLogo } from './ui/BrandLogo';
import { Compass, Users, Shield, LogOut, KeyRound, Contact, UserCircle2 } from 'lucide-react';

export const Navbar: React.FC = () => {
  const {
    usuario,
    logout,
    tieneGlobal,
    puedeVerPadron,
    puedeAccederPanelGestion,
    requiereCambioClave,
  } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();

  if (!usuario) return null;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const esAutogestion = location.pathname.startsWith('/autogestion');
  const esPadron = location.pathname.startsWith('/padron');
  const esRama = location.pathname.startsWith('/rama') || location.pathname.startsWith('/unidad');
  const esGlobal = location.pathname.startsWith('/global');
  const esPerfil = location.pathname.startsWith('/perfil');

  return (
    <>
      <header className="bg-navbar border-b border-navbar-rule sticky top-0 z-40 transition-colors backdrop-blur-xs">
        {requiereCambioClave && (
          <div className="bg-brand text-brand-contrast px-4 py-2.5 text-xs font-bold flex items-center justify-between">
            <div className="flex items-center gap-2 mx-auto">
              <KeyRound className="w-4 h-4 shrink-0" />
              <span>Actualiza tu contraseña inicial para continuar.</span>
              <Link to="/cambiar-clave" className="underline font-extrabold ml-1 text-inherit">
                Cambiar ahora
              </Link>
            </div>
          </div>
        )}

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16">
            {/* Identidad del Grupo con Logo Oficial */}
            <div className="flex items-center gap-2.5">
              <BrandLogo variant="icon" size="sm" className="shrink-0 drop-shadow-xs m-1" />
              <div>
                <span className="font-bold text-navbar-ink text-sm sm:text-base leading-tight block">
                  Grupo Scout Juan XXIII
                </span>
                <span className="text-[11px] text-navbar-muted leading-none">
                  {usuario.nombre} {usuario.apellido}
                </span>
              </div>
            </div>

            {/* Navegación Desktop (sm/md+) y Acciones Rápidas */}
            <nav className="flex items-center gap-1.5 sm:gap-2">
              <div className="hidden sm:flex items-center gap-1">
                {puedeVerPadron() && (
                  <Link
                    to="/rama"
                    className={`flex items-center gap-1.5 px-3.5 min-h-[40px] rounded-xl text-xs font-bold transition-colors ${
                      esRama || esPadron
                        ? 'bg-brand text-brand-contrast font-extrabold shadow-2xs'
                        : 'text-navbar-ink hover:bg-navbar-hover opacity-90 hover:opacity-100'
                    }`}
                  >
                    {tieneGlobal() ? <Contact className="w-4 h-4" /> : <Users className="w-4 h-4" />}
                    <span>{tieneGlobal() ? 'Padrón' : 'Mi Rama'}</span>
                  </Link>
                )}

                {puedeAccederPanelGestion() && (
                  <Link
                    to="/global"
                    className={`flex items-center gap-1.5 px-3.5 min-h-[40px] rounded-xl text-xs font-bold transition-colors ${
                      esGlobal
                        ? 'bg-brand text-brand-contrast font-extrabold shadow-2xs'
                        : 'text-navbar-ink hover:bg-navbar-hover opacity-90 hover:opacity-100'
                    }`}
                  >
                    <Shield className="w-4 h-4" />
                    <span>Gestión y Config.</span>
                  </Link>
                )}

                <Link
                  to="/autogestion"
                  className={`flex items-center gap-1.5 px-3.5 min-h-[40px] rounded-xl text-xs font-bold transition-colors ${
                    esAutogestion
                      ? 'bg-brand text-brand-contrast font-extrabold shadow-2xs'
                      : 'text-navbar-ink hover:bg-navbar-hover opacity-90 hover:opacity-100'
                  }`}
                >
                  <Compass className="w-4 h-4" />
                  <span>Mi Legajo</span>
                </Link>

                <Link
                  to="/perfil"
                  className={`flex items-center gap-1.5 px-3.5 min-h-[40px] rounded-xl text-xs font-bold transition-colors ${
                    esPerfil
                      ? 'bg-brand text-brand-contrast font-extrabold shadow-2xs'
                      : 'text-navbar-ink hover:bg-navbar-hover opacity-90 hover:opacity-100'
                  }`}
                >
                  <UserCircle2 className="w-4 h-4" />
                  <span>Mi Perfil</span>
                </Link>
              </div>

              <BotonInstalarPwa variante="navbar" />

              <ThemeToggle variant="dropdown" />

              <button
                onClick={handleLogout}
                title="Salir"
                aria-label="Cerrar sesión"
                className="min-w-[44px] min-h-[44px] flex items-center justify-center text-navbar-muted hover:text-rose-600 dark:hover:text-rose-400 hover:bg-navbar-hover rounded-xl transition-colors cursor-pointer"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </nav>
          </div>
        </div>
      </header>

      {/* Bottom Navigation Bar exclusiva para Móvil (Ergonomía para el pulgar) */}
      <nav
        aria-label="Navegación principal móvil"
        className="sm:hidden fixed bottom-0 inset-x-0 z-40 bg-navbar border-t border-navbar-rule px-2 py-1 flex items-center justify-around shadow-lg transition-colors backdrop-blur-xs"
      >
        {puedeVerPadron() && (
          <Link
            to="/rama"
            className={`flex-1 flex flex-col items-center justify-center min-h-[48px] py-1 rounded-xl text-[11px] font-bold transition-colors ${
              esRama || esPadron
                ? 'text-brand'
                : 'text-navbar-muted hover:text-navbar-ink'
            }`}
          >
            <Users className="w-5 h-5 mb-0.5" />
            <span>{tieneGlobal() ? 'Padrón' : 'Mi Rama'}</span>
          </Link>
        )}

        {puedeAccederPanelGestion() && (
          <Link
            to="/global"
            className={`flex-1 flex flex-col items-center justify-center min-h-[48px] py-1 rounded-xl text-[11px] font-bold transition-colors ${
              esGlobal
                ? 'text-brand'
                : 'text-navbar-muted hover:text-navbar-ink'
            }`}
          >
            <Shield className="w-5 h-5 mb-0.5" />
            <span>Gestión</span>
          </Link>
        )}

        <Link
          to="/autogestion"
          className={`flex-1 flex flex-col items-center justify-center min-h-[48px] py-1 rounded-xl text-[11px] font-bold transition-colors ${
            esAutogestion
              ? 'text-brand'
              : 'text-navbar-muted hover:text-navbar-ink'
          }`}
        >
          <Compass className="w-5 h-5 mb-0.5" />
          <span>Mi Legajo</span>
        </Link>

        <Link
          to="/perfil"
          className={`flex-1 flex flex-col items-center justify-center min-h-[48px] py-1 rounded-xl text-[11px] font-bold transition-colors ${
            esPerfil
              ? 'text-brand'
              : 'text-navbar-muted hover:text-navbar-ink'
          }`}
        >
          <UserCircle2 className="w-5 h-5 mb-0.5" />
          <span>Mi Perfil</span>
        </Link>
      </nav>
    </>
  );
};
