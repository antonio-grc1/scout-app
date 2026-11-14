import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { obtenerRutaInicialUsuario } from '../lib/permisos';
import { traducirErrorAmigable } from '../lib/formatters';
import { ThemeToggle } from '../components/ThemeToggle';
import { AppShell } from '../components/layout/AppShell';
import { Button } from '../components/ui/Button';
import { KeyRound, AlertCircle, Eye, EyeOff, CheckCircle2, ArrowLeft, Check } from 'lucide-react';

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

  const {
    usuario,
    requiereCambioClave,
    setRequiereCambioClave,
    setSesion,
  } = useAuthStore();
  const navigate = useNavigate();
  const redirectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (redirectTimeoutRef.current) {
        clearTimeout(redirectTimeoutRef.current);
      }
    };
  }, []);

  const actual = claveActual.trim();
  const nueva = claveNueva.trim();
  const repetir = claveRepetir.trim();

  const reglaLargoOk = nueva.length >= 8;
  const reglaDistintaOk =
    nueva.length > 0 &&
    nueva !== (usuario?.dni || '') &&
    (requiereCambioClave || nueva !== actual);
  const reglaCoincideOk = nueva.length > 0 && nueva === repetir;
  const formularioValido =
    (requiereCambioClave || actual.length > 0) &&
    reglaLargoOk &&
    reglaDistintaOk &&
    reglaCoincideOk;

  const rutaDestino = () =>
    obtenerRutaInicialUsuario({
      token: useAuthStore.getState().token,
      requiereCambioClave: false,
    });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setExito(null);

    if (!requiereCambioClave && !actual) {
      setError('Ingresá tu contraseña actual.');
      return;
    }
    if (!reglaLargoOk) {
      setError('La nueva contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (!reglaCoincideOk) {
      setError('Las contraseñas nuevas no coinciden.');
      return;
    }
    if (!reglaDistintaOk) {
      setError('La nueva contraseña debe ser distinta a tu DNI y contraseña actual.');
      return;
    }

    setCargando(true);
    try {
      const res = await api.post('/auth/cambiar-clave', {
        ...(requiereCambioClave ? {} : { claveActual: actual }),
        claveNueva: nueva,
      });

      const payload = res.data;
      if (
        payload?.accessToken &&
        payload?.usuario &&
        Array.isArray(payload?.asignaciones)
      ) {
        setSesion({
          accessToken: payload.accessToken,
          usuario: payload.usuario,
          requiereCambioClave: Boolean(payload.requiereCambioClave),
          asignaciones: payload.asignaciones,
        });
      }
      setRequiereCambioClave(false);
      setExito('Contraseña actualizada correctamente.');
      setClaveActual('');
      setClaveNueva('');
      setClaveRepetir('');

      if (redirectTimeoutRef.current) {
        clearTimeout(redirectTimeoutRef.current);
      }
      redirectTimeoutRef.current = setTimeout(() => {
        navigate(rutaDestino(), { replace: true });
      }, 900);
    } catch (err: any) {
      setError(traducirErrorAmigable(err, 'Error al actualizar la contraseña.'));
    } finally {
      setCargando(false);
    }
  };

  const cardContenido = (
    <div className="sm:mx-auto sm:w-full sm:max-w-md w-full s-anim-view">
      <div className="s-card py-7 px-5 sm:px-8 rounded-2xl">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <KeyRound className="w-5 h-5 text-brand shrink-0" />
            <h1 className="text-lg sm:text-xl font-extrabold text-ink truncate">
              {requiereCambioClave ? 'Cambio Obligatorio de Clave' : 'Cambiar Contraseña'}
            </h1>
          </div>

          {!requiereCambioClave && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              leftIcon={<ArrowLeft className="w-3.5 h-3.5" />}
              onClick={() => navigate(-1)}
            >
              Volver
            </Button>
          )}
        </div>

        <div
          className={`${
            requiereCambioClave ? 's-badge-warn rounded-xl p-3 text-xs font-medium' : 'text-xs text-ink-muted'
          } mb-5 leading-relaxed`}
        >
          {requiereCambioClave
            ? 'Ingresaste con clave temporal o alta inicial. Por seguridad, definí una contraseña personal de al menos 8 caracteres para continuar.'
            : 'Ingresá tu contraseña actual y definí una nueva clave personal de al menos 8 caracteres.'}
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          {error && (
            <div
              role="alert"
              className="s-badge-err p-3 rounded-xl text-xs font-semibold flex items-center gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {exito && (
            <div
              role="status"
              className="s-badge-ok p-3 rounded-xl text-xs font-bold flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{exito}</span>
            </div>
          )}

          {!requiereCambioClave && (
            <div>
              <label htmlFor="clave-actual" className="block text-xs font-semibold text-ink">
                Contraseña Actual
              </label>
              <div className="mt-1 relative">
                <input
                  id="clave-actual"
                  type={mostrarActual ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={claveActual}
                  onChange={(e) => setClaveActual(e.target.value)}
                  placeholder="••••••••"
                  className="s-input w-full min-h-[44px] pl-3.5 pr-11 py-2 rounded-xl text-sm"
                />
                <button
                  type="button"
                  onClick={() => setMostrarActual((v) => !v)}
                  aria-label={mostrarActual ? 'Ocultar contraseña actual' : 'Ver contraseña actual'}
                  className="absolute inset-y-0 right-0 px-3 flex items-center justify-center text-ink-muted hover:text-ink transition-colors cursor-pointer"
                >
                  {mostrarActual ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}

          <div>
            <label htmlFor="clave-nueva" className="block text-xs font-semibold text-ink">
              Nueva Contraseña
            </label>
            <div className="mt-1 relative">
              <input
                id="clave-nueva"
                type={mostrarNueva ? 'text' : 'password'}
                autoComplete="new-password"
                required
                value={claveNueva}
                onChange={(e) => setClaveNueva(e.target.value)}
                placeholder="••••••••"
                className="s-input w-full min-h-[44px] pl-3.5 pr-11 py-2 rounded-xl text-sm"
              />
              <button
                type="button"
                onClick={() => setMostrarNueva((v) => !v)}
                aria-label={mostrarNueva ? 'Ocultar nueva contraseña' : 'Ver nueva contraseña'}
                className="absolute inset-y-0 right-0 px-3 flex items-center justify-center text-ink-muted hover:text-ink transition-colors cursor-pointer"
              >
                {mostrarNueva ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="clave-repetir" className="block text-xs font-semibold text-ink">
              Repetir Nueva Contraseña
            </label>
            <div className="mt-1 relative">
              <input
                id="clave-repetir"
                type={mostrarRepetir ? 'text' : 'password'}
                autoComplete="new-password"
                required
                value={claveRepetir}
                onChange={(e) => setClaveRepetir(e.target.value)}
                placeholder="••••••••"
                className="s-input w-full min-h-[44px] pl-3.5 pr-11 py-2 rounded-xl text-sm"
              />
              <button
                type="button"
                onClick={() => setMostrarRepetir((v) => !v)}
                aria-label={
                  mostrarRepetir
                    ? 'Ocultar repetición de contraseña'
                    : 'Ver repetición de contraseña'
                }
                className="absolute inset-y-0 right-0 px-3 flex items-center justify-center text-ink-muted hover:text-ink transition-colors cursor-pointer"
              >
                {mostrarRepetir ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Lista de verificación en vivo */}
          <div className="s-panel rounded-xl p-3 space-y-1.5 text-xs">
            <div
              className={`flex items-center gap-2 ${
                reglaLargoOk ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-ink-muted'
              }`}
            >
              {reglaLargoOk ? <Check className="w-3.5 h-3.5 shrink-0" /> : <span className="w-3.5 text-center">○</span>}
              <span>Mínimo 8 caracteres</span>
            </div>
            <div
              className={`flex items-center gap-2 ${
                reglaDistintaOk ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-ink-muted'
              }`}
            >
              {reglaDistintaOk ? <Check className="w-3.5 h-3.5 shrink-0" /> : <span className="w-3.5 text-center">○</span>}
              <span>Distinta a tu DNI y contraseña actual</span>
            </div>
            <div
              className={`flex items-center gap-2 ${
                reglaCoincideOk ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-ink-muted'
              }`}
            >
              {reglaCoincideOk ? <Check className="w-3.5 h-3.5 shrink-0" /> : <span className="w-3.5 text-center">○</span>}
              <span>Ambas contraseñas coinciden</span>
            </div>
          </div>

          <Button
            type="submit"
            disabled={cargando || !formularioValido}
            loading={cargando}
            variant="primary"
            size="lg"
            className="w-full"
          >
            {cargando ? 'Guardando…' : 'Confirmar Nueva Contraseña'}
          </Button>
        </form>
      </div>
    </div>
  );

  if (!requiereCambioClave) {
    return (
      <AppShell title="Cambiar Contraseña">
        <div className="py-4 sm:py-8 flex justify-center">{cardContenido}</div>
      </AppShell>
    );
  }

  return (
    <div className="min-h-screen bg-paper text-ink flex flex-col">
      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle variant="segmented" />
      </div>
      <div className="flex-1 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
        {cardContenido}
      </div>
    </div>
  );
};
