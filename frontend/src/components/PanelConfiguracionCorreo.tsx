import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { traducirErrorAmigable } from '../lib/formatters';
import { CheckCircle2, Eye, EyeOff, Mail, Send, ShieldCheck, Loader2, AlertCircle } from 'lucide-react';

interface ConfiguracionCorreo {
  habilitado: boolean;
  host: string;
  port: number;
  user: string;
  tienePassword: boolean;
  from: string;
  appUrl: string;
  fuente: 'db' | 'env' | 'sin_configurar';
}

export interface PanelConfiguracionCorreoProps {
  onToast: (mensaje: string, tipo?: 'exito' | 'error') => void;
}

export const PanelConfiguracionCorreo: React.FC<PanelConfiguracionCorreoProps> = ({ onToast }) => {
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [probando, setProbando] = useState(false);

  const [habilitado, setHabilitado] = useState(true);
  const [host, setHost] = useState('');
  const [port, setPort] = useState('587');
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [mostrarPass, setMostrarPass] = useState(false);
  const [tienePassword, setTienePassword] = useState(false);
  const [from, setFrom] = useState('');
  const [appUrl, setAppUrl] = useState('');
  const [fuente, setFuente] = useState<'db' | 'env' | 'sin_configurar'>('sin_configurar');

  const [emailPrueba, setEmailPrueba] = useState('');
  const [resultadoPrueba, setResultadoPrueba] = useState<{ ok: boolean; texto: string } | null>(null);

  const cargarConfig = async () => {
    setCargando(true);
    try {
      const res = await api.get<ConfiguracionCorreo>('/configuracion/correo');
      const d = res.data;
      setHabilitado(Boolean(d.habilitado));
      setHost(d.host || '');
      setPort(String(d.port || 587));
      setUser(d.user || '');
      setTienePassword(Boolean(d.tienePassword));
      setPass('');
      setFrom(d.from || '');
      setAppUrl(d.appUrl || (typeof window !== 'undefined' ? window.location.origin : ''));
      setFuente(d.fuente || 'sin_configurar');
    } catch (err: any) {
      onToast(traducirErrorAmigable(err, 'No se pudo cargar la configuración de correo.'), 'error');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    void cargarConfig();
  }, []);

  const aplicarPreset = (tipo: 'gmail' | 'brevo') => {
    if (tipo === 'gmail') {
      setHost('smtp.gmail.com');
      setPort('587');
    } else {
      setHost('smtp-relay.brevo.com');
      setPort('587');
    }
  };

  const handleGuardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    setResultadoPrueba(null);
    try {
      const payload: Record<string, unknown> = {
        habilitado,
        host: host.trim() || null,
        port: Number(port) || 587,
        user: user.trim() || null,
        from: from.trim() || null,
        appUrl: appUrl.trim() || null,
      };
      if (pass.length > 0) {
        payload.pass = pass;
      }

      const res = await api.put<ConfiguracionCorreo>('/configuracion/correo', payload);
      const d = res.data;
      setHabilitado(Boolean(d.habilitado));
      setHost(d.host || '');
      setPort(String(d.port || 587));
      setUser(d.user || '');
      setTienePassword(Boolean(d.tienePassword));
      setPass('');
      setFrom(d.from || '');
      setAppUrl(d.appUrl || '');
      setFuente(d.fuente);
      onToast('Configuración de correo guardada correctamente.');
    } catch (err: any) {
      onToast(traducirErrorAmigable(err, 'No se pudo guardar la configuración de correo.'), 'error');
    } finally {
      setGuardando(false);
    }
  };

  const handleProbarEnvio = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailPrueba.trim()) return;
    setProbando(true);
    setResultadoPrueba(null);
    try {
      const res = await api.post('/configuracion/correo/probar', {
        destinatario: emailPrueba.trim(),
      });
      const texto = res.data?.mensaje || `Correo de prueba enviado a ${emailPrueba.trim()}.`;
      setResultadoPrueba({ ok: true, texto });
      onToast(texto);
    } catch (err: any) {
      const texto = traducirErrorAmigable(err, 'No se pudo enviar el correo de prueba.');
      setResultadoPrueba({ ok: false, texto });
    } finally {
      setProbando(false);
    }
  };

  if (cargando) {
    return (
      <div className="bg-surface rounded-2xl border border-rule p-8 flex items-center justify-center gap-2 text-sm text-ink-muted">
        <Loader2 className="w-5 h-5 animate-spin text-brand" />
        <span>Cargando configuración de correo...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-surface rounded-2xl border border-rule shadow-xs p-5 sm:p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-rule pb-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand/10 border border-brand/30 flex items-center justify-center shrink-0">
              <Mail className="w-5 h-5 text-brand" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-ink">Correo Saliente y Envío de Contraseñas</h2>
              <p className="text-xs text-ink-muted mt-0.5">
                Configurá el servidor SMTP desde la app para enviar altas, contraseñas temporales y recuperación de clave sin tocar variables de entorno.
              </p>
            </div>
          </div>

          <span
            className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${
              !habilitado
                ? 'bg-paper-2 text-ink-muted border-rule'
                : fuente === 'sin_configurar'
                  ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                  : 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
            }`}
          >
            {!habilitado
              ? 'Envío deshabilitado'
              : fuente === 'db'
                ? 'Activo (configurado en la app)'
                : fuente === 'env'
                  ? 'Activo (variables de servidor)'
                  : 'Sin configurar'}
          </span>
        </div>

        <form onSubmit={handleGuardar} className="space-y-5">
          <label className="flex items-start gap-3 p-3.5 rounded-xl bg-paper-2 border border-rule cursor-pointer">
            <input
              type="checkbox"
              checked={habilitado}
              onChange={(e) => setHabilitado(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-[var(--color-brand)] cursor-pointer"
            />
            <div className="text-xs">
              <span className="font-bold text-ink block">Habilitar envío automático de contraseñas y credenciales por correo</span>
              <span className="text-ink-muted">
                Permite enviar la clave inicial al dar de alta miembros, restablecer contraseñas y usar "¿Olvidaste tu contraseña?" en el login.
              </span>
            </div>
          </label>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-ink-muted font-semibold">Plantillas rápidas:</span>
            <button
              type="button"
              onClick={() => aplicarPreset('gmail')}
              className="px-3 py-1.5 rounded-lg border border-rule bg-paper-2 hover:bg-paper-3 text-ink font-semibold cursor-pointer transition-colors"
            >
              Gmail (smtp.gmail.com:587)
            </button>
            <button
              type="button"
              onClick={() => aplicarPreset('brevo')}
              className="px-3 py-1.5 rounded-lg border border-rule bg-paper-2 hover:bg-paper-3 text-ink font-semibold cursor-pointer transition-colors"
            >
              Brevo (smtp-relay.brevo.com:587)
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-ink mb-1">Servidor SMTP (Host)</label>
              <input
                type="text"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="smtp.gmail.com o smtp-relay.brevo.com"
                className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-rule bg-surface text-sm text-ink focus:border-[var(--color-focus)] outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-ink mb-1">Puerto</label>
              <input
                type="number"
                min={1}
                max={65535}
                value={port}
                onChange={(e) => setPort(e.target.value)}
                placeholder="587"
                className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-rule bg-surface text-sm text-ink focus:border-[var(--color-focus)] outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-ink mb-1">Usuario SMTP</label>
              <input
                type="text"
                value={user}
                onChange={(e) => setUser(e.target.value)}
                placeholder="notificaciones@grupo.org"
                className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-rule bg-surface text-sm text-ink focus:border-[var(--color-focus)] outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-ink mb-1">
                Contraseña / API Key SMTP
                {tienePassword && (
                  <span className="ml-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                    (guardada)
                  </span>
                )}
              </label>
              <div className="relative">
                <input
                  type={mostrarPass ? 'text' : 'password'}
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                  placeholder={tienePassword ? 'Dejar vacío para mantener la actual' : 'Clave de aplicación o SMTP key'}
                  autoComplete="new-password"
                  className="w-full min-h-[42px] pl-3 pr-10 py-2 rounded-xl border border-rule bg-surface text-sm text-ink focus:border-[var(--color-focus)] outline-none"
                />
                <button
                  type="button"
                  onClick={() => setMostrarPass((prev) => !prev)}
                  aria-label={mostrarPass ? 'Ocultar clave SMTP' : 'Ver clave SMTP'}
                  className="absolute inset-y-0 right-0 px-3 flex items-center text-ink-muted hover:text-ink cursor-pointer"
                >
                  {mostrarPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-ink mb-1">Remitente (From)</label>
              <input
                type="text"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                placeholder='"Grupo Scout Juan XXIII" <correo@grupo.org>'
                className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-rule bg-surface text-sm text-ink focus:border-[var(--color-focus)] outline-none"
              />
            </div>

            <div className="sm:col-span-3">
              <label className="block text-xs font-bold text-ink mb-1">
                URL pública de la aplicación (enlace en los correos)
              </label>
              <input
                type="url"
                value={appUrl}
                onChange={(e) => setAppUrl(e.target.value)}
                placeholder="https://scout-app.vercel.app"
                className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-rule bg-surface text-sm text-ink focus:border-[var(--color-focus)] outline-none"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <p className="text-[11px] text-ink-muted inline-flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>La contraseña SMTP se almacena cifrada en la base de datos y nunca se reenvía al navegador.</span>
            </p>
            <button
              type="submit"
              disabled={guardando}
              className="min-h-[42px] px-5 py-2 rounded-xl bg-brand hover:opacity-90 text-brand-contrast text-xs font-extrabold cursor-pointer disabled:opacity-50 inline-flex items-center gap-2"
            >
              {guardando && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{guardando ? 'Guardando...' : 'Guardar configuración'}</span>
            </button>
          </div>
        </form>
      </div>

      <div className="bg-surface rounded-2xl border border-rule shadow-xs p-5 sm:p-6 space-y-4">
        <div>
          <h3 className="text-sm font-extrabold text-ink">Probar envío de correo</h3>
          <p className="text-xs text-ink-muted mt-0.5">
            Guardá la configuración y enviá un mail de prueba para verificar que el servidor SMTP responde correctamente.
          </p>
        </div>

        <form onSubmit={handleProbarEnvio} className="flex flex-col sm:flex-row gap-3">
          <input
            type="email"
            required
            value={emailPrueba}
            onChange={(e) => setEmailPrueba(e.target.value)}
            placeholder="tu-correo@ejemplo.com"
            className="flex-1 min-h-[42px] px-3 py-2 rounded-xl border border-rule bg-surface text-sm text-ink focus:border-[var(--color-focus)] outline-none"
          />
          <button
            type="submit"
            disabled={probando || !emailPrueba.trim()}
            className="min-h-[42px] px-5 py-2 rounded-xl border border-rule bg-paper-2 hover:bg-paper-3 text-ink text-xs font-extrabold cursor-pointer disabled:opacity-50 inline-flex items-center justify-center gap-2 shrink-0"
          >
            {probando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            <span>{probando ? 'Enviando...' : 'Enviar correo de prueba'}</span>
          </button>
        </form>

        {resultadoPrueba && (
          <div
            role="status"
            className={`p-3.5 rounded-xl border text-xs flex items-start gap-2 ${
              resultadoPrueba.ok
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300'
            }`}
          >
            {resultadoPrueba.ok ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            )}
            <span>{resultadoPrueba.texto}</span>
          </div>
        )}
      </div>
    </div>
  );
};
