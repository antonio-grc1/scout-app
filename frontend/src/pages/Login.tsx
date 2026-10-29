import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { ThemeToggle } from '../components/ThemeToggle';
import { BotonInstalarPwa } from '../components/BotonInstalarPwa';
import { Button } from '../components/ui/Button';
import { BrandLogo } from '../components/ui/BrandLogo';
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
    <div className="min-h-screen bg-paper flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative transition-colors">
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <BotonInstalarPwa variante="navbar" />
        <ThemeToggle variant="segmented" />
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <BrandLogo
          variant="transparent"
          size="lg"
          center
          className="drop-shadow-sm my-3"
        />
        <h2 className="mt-4 text-2xl font-extrabold text-ink tracking-tight font-display">
          Grupo Scout Juan XXIII
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          Ingreso exclusivo para Protagonistas, Familias y Educadores
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-surface py-8 px-6 shadow-sm border border-rule rounded-2xl sm:px-10 transition-colors">
          <form className="space-y-6" onSubmit={handleSubmit}>
            {error && (
              <div className="p-3.5 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 rounded-xl text-sm flex items-center gap-2">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label htmlFor="dni" className="block text-sm font-semibold text-ink">
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
                  className="w-full min-h-[46px] px-3.5 py-2.5 rounded-xl border border-rule bg-surface text-ink placeholder:text-ink-muted text-base focus:border-[var(--color-focus)] focus:ring-2 focus:ring-[var(--color-focus)]/25 outline-none transition-colors"
                />
              </div>
            </div>

            <div>
              <label htmlFor="clave" className="block text-sm font-semibold text-ink">
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
                  className="w-full min-h-[46px] pl-3.5 pr-11 py-2.5 rounded-xl border border-rule bg-surface text-ink placeholder:text-ink-muted text-base focus:border-[var(--color-focus)] focus:ring-2 focus:ring-[var(--color-focus)]/25 outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setMostrarPassword((prev) => !prev)}
                  aria-label={mostrarPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                  className="absolute inset-y-0 right-0 px-3 flex items-center justify-center text-ink-muted hover:text-ink transition-colors cursor-pointer"
                >
                  {mostrarPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              <p className="text-xs text-ink-muted mt-1.5">
                Si ingresas por primera vez, tu clave inicial es tu DNI.
              </p>
            </div>

            <div>
              <Button
                type="submit"
                disabled={cargando}
                loading={cargando}
                variant="primary"
                size="lg"
                className="w-full"
              >
                {cargando ? 'Ingresando…' : 'Ingresar'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
