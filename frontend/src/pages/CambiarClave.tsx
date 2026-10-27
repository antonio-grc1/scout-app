import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { ThemeToggle } from '../components/ThemeToggle';
import { Navbar } from '../components/Navbar';
import { KeyRound, AlertCircle, Eye, EyeOff, CheckCircle2, ArrowLeft } from 'lucide-react';

export const CambiarClave: React.FC = () => {
  const [claveActual, setClaveActual] = useState('');
  const [claveNueva, setClaveNueva] = useState('');
  const [claveRepetir, setClaveRepetir] = useState('');
  const [mostrarActual, setMostrarActual] = useState(false);
  const [mostrarNueva, setMostrarNueva] = useState(false);
  const [mostrarRepetir, setMostrarRepetir] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const { requiereCambioClave, setRequiereCambioClave, setSesion, tieneGlobal, tieneUnidad } =
    useAuthStore();
  const navigate = useNavigate();

  const rutaDestino = () => {
    if (tieneGlobal() || tieneUnidad()) return '/rama';
    return '/autogestion';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setExito(null);

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
      setExito('Contraseña actualizada correctamente.');
      setClaveActual('');
      setClaveNueva('');
      setClaveRepetir('');

      setTimeout(() => {
        navigate(rutaDestino());
      }, 1000);
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Error al actualizar la contraseña.';
      setError(msg);
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex flex-col transition-colors">
      {!requiereCambioClave ? (
        <Navbar />
      ) : (
        <div className="absolute top-4 right-4">
          <ThemeToggle variant="segmented" />
        </div>
      )}

      <div className="flex-1 flex flex-col justify-center py-10 px-4 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md w-full">
          <div className="bg-white dark:bg-slate-900 py-8 px-6 shadow-sm border border-slate-200 dark:border-slate-800 rounded-2xl sm:px-10 transition-colors">
            <div className="flex items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-2">
                <KeyRound className="w-6 h-6 text-emerald-600" />
                <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                  {requiereCambioClave ? 'Actualizar Contraseña Inicial' : 'Cambiar Contraseña'}
                </h3>
              </div>

              {!requiereCambioClave && (
                <button
                  type="button"
                  onClick={() => navigate(-1)}
                  className="min-h-[38px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1 transition cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Volver</span>
                </button>
              )}
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">
              {requiereCambioClave
                ? 'Por seguridad institucional, debes cambiar tu clave de acceso provisional por una clave personal secreta de al menos 8 caracteres.'
                : 'Ingresa tu contraseña actual y define una nueva clave personal de al menos 8 caracteres.'}
            </p>

            <form className="space-y-5" onSubmit={handleSubmit}>
              {error && (
                <div className="p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 rounded-xl text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {exito && (
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 rounded-xl text-xs font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{exito}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Contraseña Actual {requiereCambioClave ? '(o DNI)' : ''}
                </label>
                <div className="mt-1 relative">
                  <input
                    type={mostrarActual ? 'text' : 'password'}
                    required
                    value={claveActual}
                    onChange={(e) => setClaveActual(e.target.value)}
                    placeholder="••••••••"
                    className="w-full min-h-[44px] pl-3.5 pr-11 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:border-emerald-500 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setMostrarActual((v) => !v)}
                    aria-label={mostrarActual ? 'Ocultar contraseña actual' : 'Ver contraseña actual'}
                    className="absolute inset-y-0 right-0 px-3 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition cursor-pointer"
                  >
                    {mostrarActual ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Nueva Contraseña (mínimo 8 caracteres)
                </label>
                <div className="mt-1 relative">
                  <input
                    type={mostrarNueva ? 'text' : 'password'}
                    required
                    value={claveNueva}
                    onChange={(e) => setClaveNueva(e.target.value)}
                    placeholder="••••••••"
                    className="w-full min-h-[44px] pl-3.5 pr-11 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:border-emerald-500 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setMostrarNueva((v) => !v)}
                    aria-label={mostrarNueva ? 'Ocultar nueva contraseña' : 'Ver nueva contraseña'}
                    className="absolute inset-y-0 right-0 px-3 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition cursor-pointer"
                  >
                    {mostrarNueva ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Repetir Nueva Contraseña
                </label>
                <div className="mt-1 relative">
                  <input
                    type={mostrarRepetir ? 'text' : 'password'}
                    required
                    value={claveRepetir}
                    onChange={(e) => setClaveRepetir(e.target.value)}
                    placeholder="••••••••"
                    className="w-full min-h-[44px] pl-3.5 pr-11 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:border-emerald-500 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setMostrarRepetir((v) => !v)}
                    aria-label={mostrarRepetir ? 'Ocultar repetición de contraseña' : 'Ver repetición de contraseña'}
                    className="absolute inset-y-0 right-0 px-3 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition cursor-pointer"
                  >
                    {mostrarRepetir ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={cargando}
                className="w-full min-h-[46px] py-2.5 px-4 rounded-xl text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition cursor-pointer disabled:opacity-50"
              >
                {cargando ? 'Guardando...' : 'Confirmar Nueva Contraseña'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
