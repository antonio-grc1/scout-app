import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { ThemeToggle } from '../components/ThemeToggle';
import { KeyRound, AlertCircle } from 'lucide-react';

export const CambiarClave: React.FC = () => {
  const [claveActual, setClaveActual] = useState('');
  const [claveNueva, setClaveNueva] = useState('');
  const [claveRepetir, setClaveRepetir] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const { setRequiereCambioClave, setSesion } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (claveNueva.length < 8) {
      setError('La nueva contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (claveNueva !== claveRepetir) {
      setError('Las contraseñas nuevas no coinciden.');
      return;
    }

    setCargando(true);
    try {
      const res = await api.post('/auth/cambiar-clave', {
        claveActual,
        claveNueva,
      });

      setSesion(res.data);
      setRequiereCambioClave(false);
      navigate('/autogestion');
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Error al actualizar la contraseña.';
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

      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white dark:bg-slate-900 py-8 px-6 shadow-sm border border-slate-200 dark:border-slate-800 rounded-2xl sm:px-10 transition-colors">
          <div className="flex items-center gap-2 mb-4">
            <KeyRound className="w-6 h-6 text-emerald-600" />
            <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">Actualizar Contraseña</h3>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">
            Por seguridad institucional, debes cambiar tu clave de acceso provisional por una clave personal secreta de al menos 8 caracteres.
          </p>

          <form className="space-y-5" onSubmit={handleSubmit}>
            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 rounded-xl text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Contraseña Actual (o DNI)</label>
              <input
                type="password"
                required
                value={claveActual}
                onChange={(e) => setClaveActual(e.target.value)}
                className="mt-1 w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:border-emerald-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Nueva Contraseña (mínimo 8 caracteres)</label>
              <input
                type="password"
                required
                value={claveNueva}
                onChange={(e) => setClaveNueva(e.target.value)}
                className="mt-1 w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:border-emerald-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Repetir Nueva Contraseña</label>
              <input
                type="password"
                required
                value={claveRepetir}
                onChange={(e) => setClaveRepetir(e.target.value)}
                className="mt-1 w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:border-emerald-500 outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={cargando}
              className="w-full py-2.5 px-4 rounded-xl text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition cursor-pointer disabled:opacity-50"
            >
              {cargando ? 'Guardando...' : 'Confirmar Nueva Contraseña'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
