import React, { useEffect, useRef, useState } from 'react';
import { BotonVerContrasena } from '../components/ui/BotonVerContrasena';
import { useNavigate, Navigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { obtenerRutaInicialUsuario } from '../lib/permisos';
import { traducirErrorAmigable } from '../lib/formatters';
import { ThemeToggle } from '../components/ThemeToggle';
import { BotonInstalarPwa } from '../components/BotonInstalarPwa';
import { Button } from '../components/ui/Button';
import { BrandLogo } from '../components/ui/BrandLogo';
import { AlertCircle, CheckCircle2, Mail, Clock } from 'lucide-react';

export const Login: React.FC = () => {
  const [dni, setDni] = useState('');
  const [password, setPassword] = useState('');
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [rateLimitSecs, setRateLimitSecs] = useState(0);
  const [modoRecuperar, setModoRecuperar] = useState(false);
  const [enviandoRecupero, setEnviandoRecupero] = useState(false);
  const [mensajeRecupero, setMensajeRecupero] = useState<string | null>(null);

  // Al alternar login/recuperar, el botón que se tocó desaparece y el foco caía en <body>:
  // se lleva al DNI de la vista nueva (no en la carga inicial).
  const primerRenderRef = useRef(true);
  useEffect(() => {
    if (primerRenderRef.current) {
      primerRenderRef.current = false;
      return;
    }
    document.getElementById(modoRecuperar ? 'dni-recuperar' : 'dni')?.focus();
  }, [modoRecuperar]);

  const autenticado = useAuthStore((state) => state.autenticado);
  const usuario = useAuthStore((state) => state.usuario);
  const requiereCambioClave = useAuthStore((state) => state.requiereCambioClave);
  const setSesion = useAuthStore((state) => state.setSesion);
  const navigate = useNavigate();

  useEffect(() => {
    if (rateLimitSecs <= 0) return;
    const t = setInterval(() => {
      setRateLimitSecs((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [rateLimitSecs]);

  if (autenticado && usuario) {
    const destino = obtenerRutaInicialUsuario({
      autenticado,
      requiereCambioClave,
    });
    return <Navigate to={destino} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rateLimitSecs > 0) return;
    setError(null);
    setCargando(true);

    try {
      const res = await api.post(
        '/auth/login',
        {
          dni: dni.trim(),
          password,
        },
        { timeout: 45000 },
      );

      setSesion(res.data);

      const estadoAuth = useAuthStore.getState();
      const destino = obtenerRutaInicialUsuario({
        autenticado: estadoAuth.autenticado,
        requiereCambioClave: Boolean(res.data?.requiereCambioClave),
      });
      navigate(destino, { replace: true });
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 429) {
        setRateLimitSecs(30);
        setError('Demasiados intentos seguidos. Esperá unos segundos antes de volver a intentar.');
      } else if (!err?.response) {
        setError(
          traducirErrorAmigable(
            err,
            'No se pudo conectar con el servidor. Intentá nuevamente en unos segundos.',
          ),
        );
      } else {
        setError(traducirErrorAmigable(err, 'DNI o contraseña incorrectos.'));
      }
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
      const res = await api.post(
        '/auth/recuperar-clave',
        {
          dni: dni.trim(),
        },
        { timeout: 45000 },
      );
      setMensajeRecupero(
        res.data?.mensaje ||
          'Si el DNI corresponde a una cuenta activa con correo electrónico registrado, recibirás una nueva contraseña temporal en tu casilla.',
      );
    } catch (err: any) {
      setError(
        traducirErrorAmigable(
          err,
          err?.response?.data?.message || 'No se pudo procesar la solicitud. Intentá en unos segundos.',
        ),
      );
    } finally {
      setEnviandoRecupero(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center py-10 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-32 top-1/4 size-72 rounded-full bg-brand/10 blur-3xl"
      />
      <div className="absolute top-4 right-4 flex items-center gap-2 z-20">
        <BotonInstalarPwa variante="navbar" />
        <ThemeToggle variant="segmented" />
      </div>

      <div className="s-anim-view relative z-10 w-full max-w-5xl mx-auto grid lg:grid-cols-[0.95fr_1.05fr] gap-8 lg:gap-16 items-center">
        <div className="hidden lg:flex flex-col gap-4 px-4">
          <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-brand">
            Grupo Scout Juan XXIII N° 196
          </p>
          <p className="max-w-md text-4xl font-black leading-[1.06] tracking-tight text-ink">
            Portal de gestión y familias
          </p>
          <p className="max-w-md text-sm sm:text-base leading-relaxed text-ink-muted">
            Ingresá con tu DNI para consultar tu legajo, cuotas, eventos y gestionar las secciones del grupo.
          </p>
        </div>

        <div className="w-full max-w-md mx-auto">
          <div className="flex items-center gap-4 text-left px-1">
            <BrandLogo variant="icon" size="lg" className="shrink-0 m-0" />
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-[1.75rem] font-extrabold text-ink tracking-tight leading-tight">
                Grupo Scout Juan XXIII
              </h1>
              <p className="mt-1 text-sm sm:text-[15px] text-ink-muted leading-snug">
                Ingreso exclusivo para protagonistas, familias y educadores
              </p>
            </div>
          </div>

          <div className="s-card mt-6 text-left py-7 px-6 rounded-3xl sm:px-8">
            {modoRecuperar ? (
              <form className="space-y-5" onSubmit={handleRecuperarClave}>
                <div className="space-y-1.5">
                  <h2 className="text-lg font-extrabold text-ink flex items-center gap-2">
                    <Mail className="w-5 h-5 text-brand shrink-0" />
                    <span>Recuperar contraseña</span>
                  </h2>
                  <p className="text-sm text-ink-muted leading-relaxed">
                    Ingresá tu DNI. Si tenés un correo electrónico registrado en tu perfil, te enviaremos una nueva contraseña temporal.
                  </p>
                </div>

                {error && rateLimitSecs === 0 && (
                  <div
                    role="alert"
                    className="s-badge-err p-3.5 rounded-xl text-sm font-semibold flex items-center gap-2"
                  >
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                {mensajeRecupero && (
                  <div
                    role="status"
                    className="s-badge-ok p-3.5 rounded-xl text-sm font-medium flex items-start gap-2"
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
                      className="s-input w-full min-h-[48px] px-4 py-2.5 rounded-xl text-base s-tabular"
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
                    className="w-full min-h-[42px] text-sm font-bold text-ink-muted hover:text-ink cursor-pointer transition-colors"
                  >
                    ← Volver al inicio de sesión
                  </button>
                </div>
              </form>
            ) : (
              <form className="space-y-5" onSubmit={handleSubmit}>
                {rateLimitSecs > 0 && (
                  <div
                    role="alert"
                    className="s-badge-warn p-3.5 rounded-xl text-sm font-semibold flex items-center gap-2"
                  >
                    <Clock className="w-4 h-4 shrink-0" />
                    <span>Demasiados intentos. Podrás reintentar en {rateLimitSecs}s.</span>
                  </div>
                )}

                {error && (
                  <div
                    role="alert"
                    className="s-badge-err p-3.5 rounded-xl text-sm font-semibold flex items-center gap-2"
                  >
                    <AlertCircle className="w-4 h-4 shrink-0" />
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
                      className="s-input w-full min-h-[48px] px-4 py-2.5 rounded-xl text-base s-tabular"
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
                      className="min-h-[44px] inline-flex items-center text-sm font-bold text-brand hover:underline cursor-pointer"
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
                      className="s-input w-full min-h-[48px] pl-4 pr-12 py-2.5 rounded-xl text-base"
                    />
                    <BotonVerContrasena visible={mostrarPassword} onToggle={() => setMostrarPassword((x) => !x)} etiqueta="contraseña" />
                  </div>
                  <p className="text-[13px] text-ink-muted mt-2 leading-snug">
                    Si ingresás por primera vez o te restablecieron el acceso, usá tu DNI inicial o la contraseña temporal recibida.
                  </p>
                </div>

                <Button
                  type="submit"
                  disabled={cargando || rateLimitSecs > 0}
                  loading={cargando}
                  variant="primary"
                  size="lg"
                  className="w-full"
                >
                  {cargando ? 'Ingresando…' : 'Ingresar'}
                </Button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
