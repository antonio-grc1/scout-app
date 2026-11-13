import React, { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { obtenerRutaInicialUsuario } from '../lib/permisos';
import { ThemeToggle } from '../components/ThemeToggle';
import { BotonInstalarPwa } from '../components/BotonInstalarPwa';
import { Button } from '../components/ui/Button';
import { BrandLogo } from '../components/ui/BrandLogo';
import { AlertCircle, CheckCircle2, Eye, EyeOff, Mail } from 'lucide-react';

export const Login: React.FC = () => {
  const [dni, setDni] = useState('');
  const [password, setPassword] = useState('');
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [modoRecuperar, setModoRecuperar] = useState(false);
  const [enviandoRecupero, setEnviandoRecupero] = useState(false);
  const [mensajeRecupero, setMensajeRecupero] = useState<string | null>(null);
  const token = useAuthStore((state) => state.token);
  const usuario = useAuthStore((state) => state.usuario);
  const puedeVerPadron = useAuthStore((state) => state.puedeVerPadron);
  const puedeAccederPanelGestion = useAuthStore((state) => state.puedeAccederPanelGestion);
  const requiereCambioClave = useAuthStore((state) => state.requiereCambioClave);
  const setSesion = useAuthStore((state) => state.setSesion);
  const navigate = useNavigate();

  // Si ya tiene sesión activa, redirigir inmediatamente a su pantalla inicial
  // para evitar caer en el login al navegar hacia atrás en móviles.
  if (token && usuario) {
    const destino = obtenerRutaInicialUsuario({
      token,
      requiereCambioClave,
      puedeVerPadron,
      puedeAccederPanelGestion,
    });
    return <Navigate to={destino} replace />;
  }

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

      const estadoAuth = useAuthStore.getState();
      const destino = obtenerRutaInicialUsuario({
        token: estadoAuth.token,
        requiereCambioClave: Boolean(res.data?.requiereCambioClave),
        puedeVerPadron: estadoAuth.puedeVerPadron,
        puedeAccederPanelGestion: estadoAuth.puedeAccederPanelGestion,
      });
      navigate(destino, { replace: true });
    } catch (err: any) {
      const msg = err.response?.data?.message || 'DNI o contraseña incorrectos.';
      setError(msg);
    } finally {
      setCargando(false);
    }
  };

  const handleRecuperarClave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMensajeRecupero(null);
    setEnviandoRecupero(true);
    try {
      const res = await api.post('/auth/recuperar-clave', {
        dni: dni.trim(),
      });
      setMensajeRecupero(
        res.data?.mensaje ||
          'Si el DNI corresponde a una cuenta activa con correo electrónico registrado, recibirás una nueva contraseña temporal en tu casilla.',
      );
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo procesar la solicitud. Intentá en unos segundos.');
    } finally {
      setEnviandoRecupero(false);
    }
  };

  return (
    <div className="min-h-screen bg-paper flex flex-col justify-center py-10 px-4 sm:px-6 lg:px-8 relative transition-colors overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-32 top-1/4 size-72 rounded-full bg-brand/10 blur-3xl"
      />
      <div className="absolute top-4 right-4 flex items-center gap-2 z-20">
        <BotonInstalarPwa variante="navbar" />
        <ThemeToggle variant="segmented" />
      </div>

      <div className="relative z-10 w-full max-w-5xl mx-auto grid lg:grid-cols-[0.95fr_1.05fr] gap-8 lg:gap-16 items-center">
        <div className="hidden lg:flex flex-col gap-5 px-4">
          <p className="text-xs font-extrabold uppercase tracking-[0.22em] text-brand">
            Grupo Scout Juan XXIII
          </p>
          <p className="max-w-md text-4xl font-black leading-[1.05] tracking-[-0.03em] text-ink font-display">
            Portal de Gestión y Familias
          </p>
          <p className="max-w-md text-base leading-relaxed text-ink-muted">
            Ingresá con tu DNI para acceder a tu panel.
          </p>
        </div>

        <div className="w-full max-w-md mx-auto">
          <div className="flex items-center gap-3.5 sm:gap-4 text-left px-1">
            <BrandLogo
              variant="icon"
              size="lg"
              className="drop-shadow-sm shrink-0 m-0"
            />
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-extrabold text-ink tracking-tight font-display leading-tight">
                Grupo Scout Juan XXIII
              </h1>
              <p className="mt-1 text-xs sm:text-sm text-ink-muted leading-snug">
                Ingreso exclusivo para Protagonistas, Familias y Educadores
              </p>
            </div>
          </div>

          <div className="mt-8 text-left bg-surface py-7 px-5 shadow-md border border-rule rounded-3xl sm:px-8 transition-colors">
            {modoRecuperar ? (
              <form className="space-y-5" onSubmit={handleRecuperarClave}>
                <div className="space-y-1">
                  <h2 className="text-base font-extrabold text-ink flex items-center gap-2">
                    <Mail className="w-4 h-4 text-brand shrink-0" />
                    <span>Recuperar contraseña</span>
                  </h2>
                  <p className="text-xs text-ink-muted">
                    Ingresá tu DNI. Si tenés un correo electrónico registrado, te enviaremos una nueva contraseña temporal.
                  </p>
                </div>

                {error && (
                  <div
                    role="alert"
                    className="p-3.5 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 rounded-xl text-sm flex items-center gap-2"
                  >
                    <AlertCircle className="w-5 h-5 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                {mensajeRecupero && (
                  <div
                    role="status"
                    className="p-3.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 rounded-xl text-xs flex items-start gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{mensajeRecupero}</span>
                  </div>
                )}

                <div>
                  <label htmlFor="dni-recuperar" className="block text-sm font-semibold text-ink">
                    Número de DNI
                  </label>
                  <div className="mt-1.5">
                    <input
                      id="dni-recuperar"
                      type="text"
                      inputMode="numeric"
                      required
                      value={dni}
                      onChange={(e) => setDni(e.target.value.replace(/\D/g, ''))}
                      placeholder="Sin puntos ni espacios"
                      className="w-full min-h-[46px] px-3.5 py-2.5 rounded-xl border border-rule bg-surface text-ink placeholder:text-ink-muted text-base focus:border-[var(--color-focus)] focus:ring-2 focus:ring-[var(--color-focus)]/25 outline-none transition-colors"
                    />
                  </div>
                </div>

                <div className="space-y-2.5">
                  <Button
                    type="submit"
                    disabled={enviandoRecupero || !dni.trim()}
                    loading={enviandoRecupero}
                    variant="primary"
                    size="lg"
                    className="w-full"
                  >
                    {enviandoRecupero ? 'Enviando…' : 'Enviar nueva contraseña por correo'}
                  </Button>
                  <button
                    type="button"
                    onClick={() => {
                      setModoRecuperar(false);
                      setError(null);
                      setMensajeRecupero(null);
                    }}
                    className="w-full min-h-[40px] text-xs font-bold text-ink-muted hover:text-ink cursor-pointer transition-colors"
                  >
                    Volver al inicio de sesión
                  </button>
                </div>
              </form>
            ) : (
            <form className="space-y-6" onSubmit={handleSubmit}>
              {error && (
                <div
                  role="alert"
                  className="p-3.5 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 rounded-xl text-sm flex items-center gap-2"
                >
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
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="clave" className="block text-sm font-semibold text-ink">
                  Contraseña
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setModoRecuperar(true);
                    setError(null);
                    setMensajeRecupero(null);
                  }}
                  className="text-xs font-bold text-brand hover:underline cursor-pointer"
                >
                  ¿Olvidaste tu contraseña?
                </button>
              </div>
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
                Si ingresas por primera vez o te restablecieron el acceso, usá la clave temporal que recibiste al darte de alta o por correo.
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
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
