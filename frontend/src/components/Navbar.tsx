import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { ThemeToggle } from './ThemeToggle';
import { Compass, Users, Shield, LogOut, KeyRound, ClipboardCheck, Contact } from 'lucide-react';

export const Navbar: React.FC = () => {
  const { usuario, logout, tieneGlobal, tieneUnidad, requiereCambioClave } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();

  if (!usuario) return null;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-40 transition-colors">
      {requiereCambioClave && (
        <div className="bg-amber-500 text-amber-950 px-4 py-2 text-xs font-semibold flex items-center justify-between">
          <div className="flex items-center gap-2 mx-auto">
            <KeyRound className="w-4 h-4" />
            <span>Debes actualizar tu clave de acceso inicial antes de operar normalmente.</span>
            <Link to="/cambiar-clave" className="underline font-bold ml-1 text-black">
              Cambiar clave ahora
            </Link>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-lg shadow-xs">
              ⚜
            </div>
            <div>
              <span className="font-bold text-slate-800 dark:text-slate-100 text-base leading-none block">
                Grupo Scout Juan XXIII
              </span>
              <span className="text-xs text-slate-400 dark:text-slate-500">Sistema de Gestión</span>
            </div>
          </div>

          <nav className="flex items-center gap-1 sm:gap-2">
            {/* Vista Propia (Familias / Protagonistas) */}
            <Link
              to="/autogestion"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                location.pathname.startsWith('/autogestion')
                  ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Compass className="w-4 h-4" />
              <span className="hidden sm:inline">Mi Familia</span>
            </Link>

            {/* Padrón General (Jefatura / Global) */}
            {tieneGlobal() && (
              <Link
                to="/padron"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  location.pathname.startsWith('/padron')
                    ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Contact className="w-4 h-4" />
                <span className="hidden sm:inline">Padrón</span>
              </Link>
            )}

            {/* Padrón de Rama Unificado (Educadores de Rama) */}
            {tieneUnidad() && !tieneGlobal() && (
              <Link
                to="/rama"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  location.pathname.startsWith('/rama') || location.pathname.startsWith('/unidad')
                    ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Users className="w-4 h-4" />
                <span className="hidden sm:inline">Padrón de Rama</span>
              </Link>
            )}

            {/* Vista Global (Jefatura) */}
            {tieneGlobal() && (
              <Link
                to="/global"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  location.pathname.startsWith('/global')
                    ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Shield className="w-4 h-4" />
                <span className="hidden sm:inline">Jefatura</span>
              </Link>
            )}

            <div className="h-6 w-[1px] bg-slate-200 dark:bg-slate-800 mx-1" />

            {/* Selector rápido de Tema Oscuro / Claro / Sistema */}
            <ThemeToggle variant="dropdown" />

            <div className="text-right hidden md:block">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 block">
                {usuario.nombre} {usuario.apellido}
              </span>
              <span className="text-[10px] text-slate-400 dark:text-slate-500">DNI {usuario.dni}</span>
            </div>

            <button
              onClick={handleLogout}
              title="Cerrar Sesión"
              className="p-2 text-slate-400 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </nav>
        </div>
      </div>
    </header>
  );
};
