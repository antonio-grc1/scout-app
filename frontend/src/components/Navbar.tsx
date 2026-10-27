import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { ThemeToggle } from './ThemeToggle';
import { BotonInstalarPwa } from './BotonInstalarPwa';
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
      <header className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 sticky top-0 z-40 transition-colors">
        {requiereCambioClave && (
          <div className="bg-amber-500 text-amber-950 px-4 py-2.5 text-xs font-bold flex items-center justify-between">
            <div className="flex items-center gap-2 mx-auto">
              <KeyRound className="w-4 h-4 shrink-0" />
              <span>Actualiza tu contraseña inicial para continuar.</span>
              <Link to="/cambiar-clave" className="underline font-extrabold ml-1 text-black">
                Cambiar ahora
              </Link>
            </div>
          </div>
        )}

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16">
            {/* Identidad del Grupo */}
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-lg shadow-xs shrink-0">
                ⚜
              </div>
              <div>
                <span className="font-bold text-slate-900 dark:text-slate-100 text-sm sm:text-base leading-tight block">
                  Grupo Scout Juan XXIII
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 leading-none">
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
                    className={`flex items-center gap-1.5 px-3.5 min-h-[40px] rounded-xl text-xs font-bold transition ${
                      esRama || esPadron
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {tieneGlobal() ? <Contact className="w-4 h-4" /> : <Users className="w-4 h-4" />}
                    <span>{tieneGlobal() ? 'Padrón' : 'Mi Rama'}</span>
                  </Link>
                )}

                {puedeAccederPanelGestion() && (
                  <Link
                    to="/global"
                    className={`flex items-center gap-1.5 px-3.5 min-h-[40px] rounded-xl text-xs font-bold transition ${
                      esGlobal
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Shield className="w-4 h-4" />
                    <span>Gestión y Config.</span>
                  </Link>
                )}

                <Link
                  to="/autogestion"
                  className={`flex items-center gap-1.5 px-3.5 min-h-[40px] rounded-xl text-xs font-bold transition ${
                    esAutogestion
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <Compass className="w-4 h-4" />
                  <span>Mi Legajo</span>
                </Link>

                <Link
                  to="/perfil"
                  className={`flex items-center gap-1.5 px-3.5 min-h-[40px] rounded-xl text-xs font-bold transition ${
                    esPerfil
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
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
                className="min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition cursor-pointer"
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
        className="sm:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 px-2 py-1 flex items-center justify-around shadow-lg"
      >
        {puedeVerPadron() && (
          <Link
            to="/rama"
            className={`flex-1 flex flex-col items-center justify-center min-h-[48px] py-1 rounded-xl text-[11px] font-bold transition ${
              esRama || esPadron
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <Users className="w-5 h-5 mb-0.5" />
            <span>{tieneGlobal() ? 'Padrón' : 'Mi Rama'}</span>
          </Link>
        )}

        {puedeAccederPanelGestion() && (
          <Link
            to="/global"
            className={`flex-1 flex flex-col items-center justify-center min-h-[48px] py-1 rounded-xl text-[11px] font-bold transition ${
              esGlobal
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <Shield className="w-5 h-5 mb-0.5" />
            <span>Gestión</span>
          </Link>
        )}

        <Link
          to="/autogestion"
          className={`flex-1 flex flex-col items-center justify-center min-h-[48px] py-1 rounded-xl text-[11px] font-bold transition ${
            esAutogestion
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <Compass className="w-5 h-5 mb-0.5" />
          <span>Mi Legajo</span>
        </Link>

        <Link
          to="/perfil"
          className={`flex-1 flex flex-col items-center justify-center min-h-[48px] py-1 rounded-xl text-[11px] font-bold transition ${
            esPerfil
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <UserCircle2 className="w-5 h-5 mb-0.5" />
          <span>Mi Perfil</span>
        </Link>
      </nav>
    </>
  );
};
