import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { ThemeToggle } from './ThemeToggle';
import { BotonInstalarPwa } from './BotonInstalarPwa';
import { Compass, Users, Shield, LogOut, KeyRound, Contact, UserCircle2 } from 'lucide-react';

export const Navbar: React.FC = () => {
  const { usuario, logout, tieneGlobal, tieneUnidad, requiereCambioClave } = useAuthStore();
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
      <header className="bg-zinc-950 text-white border-b-2 border-amber-400 sticky top-0 z-40 shadow-sm transition-colors">
        {requiereCambioClave && (
          <div className="bg-amber-400 text-zinc-950 px-4 py-2.5 text-xs font-extrabold flex items-center justify-between">
            <div className="flex items-center gap-2 mx-auto">
              <KeyRound className="w-4 h-4 shrink-0" />
              <span>Actualiza tu contraseña inicial para continuar.</span>
              <Link to="/cambiar-clave" className="underline font-black ml-1 text-black">
                Cambiar ahora
              </Link>
            </div>
          </div>
        )}

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Identidad del Grupo (Amarillo y Negro Institucional) */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-400 text-zinc-950 border-2 border-amber-300 flex items-center justify-center font-black text-xl shadow-xs shrink-0">
                ⚜
              </div>
              <div>
                <span className="font-black text-amber-400 text-sm sm:text-base leading-tight block tracking-tight">
                  Grupo Scout Juan XXIII
                </span>
                <span className="text-xs text-zinc-300 leading-none font-medium">
                  {usuario.nombre} {usuario.apellido}
                </span>
              </div>
            </div>

            {/* Navegación Desktop (sm/md+) y Acciones Rápidas */}
            <nav className="flex items-center gap-2">
              <div className="hidden sm:flex items-center gap-1.5">
                {tieneUnidad() && !tieneGlobal() && (
                  <Link
                    to="/rama"
                    className={`flex items-center gap-1.5 px-4 min-h-[42px] rounded-xl text-xs font-extrabold transition ${
                      esRama
                        ? 'bg-amber-400 text-zinc-950 shadow-xs'
                        : 'text-zinc-200 hover:bg-zinc-800 hover:text-amber-300'
                    }`}
                  >
                    <Users className="w-4 h-4" />
                    <span>Mi Rama</span>
                  </Link>
                )}

                {tieneGlobal() && (
                  <>
                    <Link
                      to="/rama"
                      className={`flex items-center gap-1.5 px-4 min-h-[42px] rounded-xl text-xs font-extrabold transition ${
                        esRama || esPadron
                          ? 'bg-amber-400 text-zinc-950 shadow-xs'
                          : 'text-zinc-200 hover:bg-zinc-800 hover:text-amber-300'
                      }`}
                    >
                      <Contact className="w-4 h-4" />
                      <span>Padrón</span>
                    </Link>

                    <Link
                      to="/global"
                      className={`flex items-center gap-1.5 px-4 min-h-[42px] rounded-xl text-xs font-extrabold transition ${
                        esGlobal
                          ? 'bg-amber-400 text-zinc-950 shadow-xs'
                          : 'text-zinc-200 hover:bg-zinc-800 hover:text-amber-300'
                      }`}
                    >
                      <Shield className="w-4 h-4" />
                      <span>Jefatura y Cuotas</span>
                    </Link>
                  </>
                )}

                <Link
                  to="/autogestion"
                  className={`flex items-center gap-1.5 px-4 min-h-[42px] rounded-xl text-xs font-extrabold transition ${
                    esAutogestion
                      ? 'bg-amber-400 text-zinc-950 shadow-xs'
                      : 'text-zinc-200 hover:bg-zinc-800 hover:text-amber-300'
                  }`}
                >
                  <Compass className="w-4 h-4" />
                  <span>Mi Legajo</span>
                </Link>

                <Link
                  to="/perfil"
                  className={`flex items-center gap-1.5 px-4 min-h-[42px] rounded-xl text-xs font-extrabold transition ${
                    esPerfil
                      ? 'bg-amber-400 text-zinc-950 shadow-xs'
                      : 'text-zinc-200 hover:bg-zinc-800 hover:text-amber-300'
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
                className="min-w-[44px] min-h-[44px] flex items-center justify-center text-zinc-300 hover:text-rose-400 hover:bg-zinc-800 rounded-xl transition cursor-pointer"
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
        className="sm:hidden fixed bottom-0 inset-x-0 z-40 bg-zinc-950/95 backdrop-blur-md border-t-2 border-amber-400 px-2 py-1.5 flex items-center justify-around shadow-lg"
      >
        {(tieneUnidad() || tieneGlobal()) && (
          <Link
            to="/rama"
            className={`flex-1 flex flex-col items-center justify-center min-h-[50px] py-1 rounded-xl text-xs font-extrabold transition ${
              esRama || esPadron
                ? 'text-amber-400 bg-zinc-900'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Users className="w-5 h-5 mb-0.5" />
            <span>{tieneGlobal() ? 'Padrón' : 'Mi Rama'}</span>
          </Link>
        )}

        {tieneGlobal() && (
          <Link
            to="/global"
            className={`flex-1 flex flex-col items-center justify-center min-h-[50px] py-1 rounded-xl text-xs font-extrabold transition ${
              esGlobal
                ? 'text-amber-400 bg-zinc-900'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Shield className="w-5 h-5 mb-0.5" />
            <span>Jefatura</span>
          </Link>
        )}

        <Link
          to="/autogestion"
          className={`flex-1 flex flex-col items-center justify-center min-h-[50px] py-1 rounded-xl text-xs font-extrabold transition ${
            esAutogestion
              ? 'text-amber-400 bg-zinc-900'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Compass className="w-5 h-5 mb-0.5" />
          <span>Mi Legajo</span>
        </Link>

        <Link
          to="/perfil"
          className={`flex-1 flex flex-col items-center justify-center min-h-[50px] py-1 rounded-xl text-xs font-extrabold transition ${
            esPerfil
              ? 'text-amber-400 bg-zinc-900'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <UserCircle2 className="w-5 h-5 mb-0.5" />
          <span>Mi Perfil</span>
        </Link>
      </nav>
    </>
  );
};
