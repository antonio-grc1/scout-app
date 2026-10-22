import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { ThemeToggle } from '../components/ThemeToggle';
import { ShieldCheck, AlertCircle } from 'lucide-react';

export const Login: React.FC = () => {
  const [dni, setDni] = useState('');
  const [password, setPassword] = useState('');
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
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative transition-colors">
      <div className="absolute top-4 right-4">
        <ThemeToggle variant="segmented" />
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="w-16 h-16 bg-emerald-600 text-white text-3xl font-bold rounded-2xl flex items-center justify-center mx-auto shadow-md">
          ⚜
        </div>
        <h2 className="mt-4 text-2xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
          Grupo Scout Juan XXIII
        </h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Ingreso exclusivo para Protagonistas, Familias y Educadores
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white dark:bg-slate-900 py-8 px-6 shadow-sm border border-slate-200 dark:border-slate-800 rounded-2xl sm:px-10 transition-colors">
          <form className="space-y-6" onSubmit={handleSubmit}>
            {error && (
              <div className="p-3.5 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 rounded-xl text-sm flex items-center gap-2">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label htmlFor="dni" className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
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
                  className="w-full min-h-[46px] px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-base focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 dark:focus:ring-emerald-950/40 outline-none transition"
                />
              </div>
            </div>

            <div>
              <label htmlFor="clave" className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                Contraseña
              </label>
              <div className="mt-1.5">
                <input
                  id="clave"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full min-h-[46px] px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-base focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 dark:focus:ring-emerald-950/40 outline-none transition"
                />
              </div>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1.5">
                Si ingresas por primera vez, tu clave inicial es tu DNI.
              </p>
            </div>

            <div>
              <button
                type="submit"
                disabled={cargando}
                className="w-full min-h-[48px] flex items-center justify-center py-3 px-4 rounded-xl shadow-xs text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition cursor-pointer disabled:opacity-50"
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
