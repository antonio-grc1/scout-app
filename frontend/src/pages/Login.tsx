import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { ThemeToggle } from '../components/ThemeToggle';
import { BotonInstalarPwa } from '../components/BotonInstalarPwa';
import { AlertCircle, Eye, EyeOff } from 'lucide-react';

export const Login: React.FC = () => {
  const [dni, setDni] = useState('');
  const [password, setPassword] = useState('');
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const setSesion = useAuthStore((state) => state.setSesion);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setCargando(true);

    try {
      // Regla inquebrantable 1: Login exclusivo con DNI + Contraseña
      const res = await api.post('/auth/login', {
        dni: dni.trim(),
        password,
      });

      setSesion(res.data);

      if (res.data.requiereCambioClave) {
        navigate('/cambiar-clave');
        return;
      }

      // Redirección inteligente según el alcance de sus asignaciones (pestaña por defecto: Padrón)
      const asignaciones = res.data.asignaciones || [];
      const esGlobal = asignaciones.some((a: any) => a.alcance === 'GLOBAL');
      const esUnidad = asignaciones.some((a: any) => a.alcance === 'UNIDAD');

      if (esGlobal || esUnidad) {
        navigate('/rama');
      } else {
        navigate('/autogestion');
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || 'DNI o contraseña incorrectos.';
      setError(msg);
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-100 dark:bg-zinc-950 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 relative transition-colors">
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <BotonInstalarPwa variante="navbar" />
        <ThemeToggle variant="segmented" />
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="w-18 h-18 bg-zinc-950 text-amber-400 border-2 border-amber-400 text-4xl font-black rounded-2xl flex items-center justify-center mx-auto shadow-lg">
          ⚜
        </div>
        <h2 className="mt-4 text-2xl sm:text-3xl font-black text-zinc-950 dark:text-amber-400 tracking-tight">
          Grupo Scout Juan XXIII
        </h2>
        <p className="mt-1.5 text-sm font-medium text-zinc-600 dark:text-zinc-400">
          Ingreso exclusivo para Protagonistas, Familias y Educadores
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white dark:bg-zinc-900 py-8 px-6 shadow-md border-2 border-zinc-200 dark:border-zinc-800 border-t-4 border-t-amber-400 rounded-2xl sm:px-10 transition-colors">
          <form className="space-y-6" onSubmit={handleSubmit}>
            {error && (
              <div className="p-3.5 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 rounded-xl text-sm flex items-center gap-2">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label htmlFor="dni" className="block text-sm font-bold text-zinc-800 dark:text-zinc-200">
                Número de DNI
              </label>
              <div className="mt-1.5">
                <input
                  id="dni"
                  type="text"
                  inputMode="numeric"
                  autoComplete="username"
                  required
                  value={dni}
                  onChange={(e) => setDni(e.target.value.replace(/\D/g, ''))}
                  placeholder="Sin puntos ni espacios"
                  className="w-full min-h-[48px] px-4 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 text-base focus:border-amber-500 focus:ring-2 focus:ring-amber-200 dark:focus:ring-amber-950/40 outline-none transition"
                />
              </div>
            </div>

            <div>
              <label htmlFor="clave" className="block text-sm font-bold text-zinc-800 dark:text-zinc-200">
                Contraseña
              </label>
              <div className="mt-1.5 relative">
                <input
                  id="clave"
                  type={mostrarPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full min-h-[48px] pl-4 pr-12 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 text-base focus:border-amber-500 focus:ring-2 focus:ring-amber-200 dark:focus:ring-amber-950/40 outline-none transition"
                />
                <button
                  type="button"
                  onClick={() => setMostrarPassword((prev) => !prev)}
                  aria-label={mostrarPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                  className="absolute inset-y-0 right-0 px-3.5 flex items-center justify-center text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition cursor-pointer"
                >
                  {mostrarPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1.5">
                Si ingresas por primera vez, tu clave inicial es tu DNI.
              </p>
            </div>

            <div>
              <button
                type="submit"
                disabled={cargando}
                className="w-full min-h-[50px] flex items-center justify-center py-3 px-4 rounded-xl shadow-sm text-base font-black text-zinc-950 bg-amber-400 hover:bg-amber-500 transition cursor-pointer disabled:opacity-50"
              >
                {cargando ? 'Ingresando...' : 'Ingresar'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
