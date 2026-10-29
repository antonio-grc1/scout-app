import React, { useEffect, useState } from 'react';
import { Navbar } from '../../components/Navbar';
import { BotonInstalarPwa } from '../../components/BotonInstalarPwa';
import { api } from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { useThemeStore } from '../../store/themeStore';
import { obtenerConfigRama } from '../../lib/ramaColors';
import { Button } from '../../components/ui/Button';
import { ThemeCustomizerModal } from '../../components/ThemeCustomizerModal';
import {
  calcularEdad,
  traducirErrorAmigable,
} from '../../lib/formatters';
import {
  User,
  Phone,
  Mail,
  MapPin,
  ShieldCheck,
  Users,
  KeyRound,
  Save,
  Loader2,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Palette,
} from 'lucide-react';

export const PerfilPage: React.FC = () => {
  const { usuario, setSesion } = useAuthStore();
  const { customization } = useThemeStore();
  const [perfil, setPerfil] = useState<any | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardandoContacto, setGuardandoContacto] = useState(false);
  const [guardandoClave, setGuardandoClave] = useState(false);
  const [customizerAbierto, setCustomizerAbierto] = useState(false);
  const [alertaContacto, setAlertaContacto] = useState<{
    tipo: 'exito' | 'error';
    texto: string;
  } | null>(null);
  const [alertaClave, setAlertaClave] = useState<{
    tipo: 'exito' | 'error';
    texto: string;
  } | null>(null);

  const [formContacto, setFormContacto] = useState({
    emailContacto: '',
    telefonoContacto: '',
    madreNombres: '',
    madreTelefono: '',
    padreNombres: '',
    padreTelefono: '',
    tutorNombres: '',
    tutorTelefono: '',
    telefonoUrgencias: '',
    domicilio: '',
    obraSocial: '',
  });

  const [formClave, setFormClave] = useState({
    passwordActual: '',
    passwordNueva: '',
    confirmar: '',
  });
  const [verActual, setVerActual] = useState(false);
  const [verNueva, setVerNueva] = useState(false);
  const [verConfirmar, setVerConfirmar] = useState(false);

  const cargarPerfil = async () => {
    setCargando(true);
    try {
      const res = await api.get('/miembros/mi-perfil');
      const m = res.data;
      setPerfil(m);
      setFormContacto({
        emailContacto: m.emailContacto || '',
        telefonoContacto: m.telefonoContacto || m.datosFijosJson?.protagonista_telefono || '',
        madreNombres: m.datosFijosJson?.madre_nombres || '',
        madreTelefono: m.datosFijosJson?.madre_telefono || '',
        padreNombres: m.datosFijosJson?.padre_nombres || '',
        padreTelefono: m.datosFijosJson?.padre_telefono || '',
        tutorNombres: m.datosFijosJson?.tutor_nombres || '',
        tutorTelefono: m.datosFijosJson?.tutor_telefono || '',
        telefonoUrgencias: m.datosFijosJson?.telefono_urgencias || '',
        domicilio: m.datosFijosJson?.domicilio || '',
        obraSocial: m.datosFijosJson?.obra_social || '',
      });
    } catch (err) {
      setAlertaContacto({
        tipo: 'error',
        texto: traducirErrorAmigable(err, 'No se pudo cargar tu perfil.'),
      });
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarPerfil();
  }, []);

  const handleGuardarContacto = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardandoContacto(true);
    setAlertaContacto(null);
    try {
      const res = await api.patch('/miembros/mi-perfil', {
        emailContacto: formContacto.emailContacto.trim() || null,
        telefonoContacto: formContacto.telefonoContacto.trim() || null,
        datosFijosJson: {
          protagonista_telefono: formContacto.telefonoContacto.trim(),
          madre_nombres: formContacto.madreNombres.trim(),
          madre_telefono: formContacto.madreTelefono.trim(),
          padre_nombres: formContacto.padreNombres.trim(),
          padre_telefono: formContacto.padreTelefono.trim(),
          tutor_nombres: formContacto.tutorNombres.trim(),
          tutor_telefono: formContacto.tutorTelefono.trim(),
          telefono_urgencias: formContacto.telefonoUrgencias.trim(),
          domicilio: formContacto.domicilio.trim(),
          obra_social: formContacto.obraSocial.trim(),
        },
      });
      setPerfil(res.data);
      setAlertaContacto({
        tipo: 'exito',
        texto: 'Tus datos de contacto y teléfonos fueron actualizados.',
      });
    } catch (err) {
      setAlertaContacto({
        tipo: 'error',
        texto: traducirErrorAmigable(err, 'No se pudieron actualizar tus datos.'),
      });
    } finally {
      setGuardandoContacto(false);
    }
  };

  const handleCambiarClave = async (e: React.FormEvent) => {
    e.preventDefault();
    setAlertaClave(null);

    if (formClave.passwordNueva !== formClave.confirmar) {
      setAlertaClave({ tipo: 'error', texto: 'Las contraseñas nuevas no coinciden.' });
      return;
    }
    if (formClave.passwordNueva.length < 8) {
      setAlertaClave({
        tipo: 'error',
        texto: 'La nueva contraseña debe tener al menos 8 caracteres.',
      });
      return;
    }

    setGuardandoClave(true);
    try {
      const res = await api.post('/auth/cambiar-clave', {
        claveActual: formClave.passwordActual.trim(),
        claveNueva: formClave.passwordNueva.trim(),
      });
      if (res.data?.accessToken) {
        setSesion(res.data);
      }
      setFormClave({ passwordActual: '', passwordNueva: '', confirmar: '' });
      setAlertaClave({
        tipo: 'exito',
        texto: 'Tu contraseña se actualizó correctamente.',
      });
    } catch (err) {
      setAlertaClave({
        tipo: 'error',
        texto: traducirErrorAmigable(err, 'No se pudo cambiar la contraseña.'),
      });
    } finally {
      setGuardandoClave(false);
    }
  };

  const asigPrincipal = perfil?.asignaciones?.[0];
  const cfgRama = obtenerConfigRama(asigPrincipal?.unidad);
  const hermanos = (perfil?.grupoFamiliar?.miembros || []).filter(
    (h: any) => h.id !== perfil?.id,
  );

  return (
    <div className="min-h-screen bg-paper pb-24 sm:pb-10 transition-colors">
      <Navbar />

      <main className="max-w-4xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-5">
        {cargando ? (
          <div className="bg-surface rounded-2xl p-10 border border-rule flex flex-col items-center justify-center gap-3 text-ink-muted">
            <Loader2 className="w-6 h-6 animate-spin text-brand" />
            <span className="text-xs font-bold">Cargando tu perfil…</span>
          </div>
        ) : (
          <>
            {/* Tarjeta de Identidad Institucional */}
            <div className="bg-surface rounded-2xl p-5 border border-rule shadow-2xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div
                    className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black text-lg shrink-0 ${
                      cfgRama?.avatarClases || 'bg-amber-400 text-neutral-950 font-black'
                    }`}
                  >
                    {perfil?.nombre?.[0] || usuario?.nombre?.[0] || ''}
                    {perfil?.apellido?.[0] || usuario?.apellido?.[0] || ''}
                  </div>
                  <div>
                    <h1 className="text-xl font-black text-ink">
                      {perfil?.nombre || usuario?.nombre} {perfil?.apellido || usuario?.apellido}
                    </h1>
                    <p className="text-xs text-ink-muted mt-0.5 font-medium">
                      DNI {perfil?.dni || usuario?.dni} •{' '}
                      {calcularEdad(perfil?.fechaNacimiento) ?? '—'} años
                    </p>
                  </div>
                </div>

                {/* Asignaciones activas */}
                <div className="flex flex-wrap gap-1.5">
                  {(perfil?.asignaciones || []).map((a: any) => {
                    const c = obtenerConfigRama(a.unidad);
                    return (
                      <span
                        key={a.id}
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-extrabold border ${
                          c?.badgeClases ||
                          'bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800'
                        }`}
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>
                          {a.rol?.nombre} • {a.unidad?.nombre}
                        </span>
                      </span>
                    );
                  })}
                </div>
              </div>

              {/* Grupo Familiar si tiene hermanos vinculados */}
              {hermanos.length > 0 && (
                <div className="mt-4 pt-3.5 border-t border-rule flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-ink-muted">
                    <Users className="w-3.5 h-3.5 text-brand" />
                    Grupo Familiar:
                  </span>
                  {hermanos.map((h: any) => (
                    <span
                      key={h.id}
                      className="px-2.5 py-1 rounded-lg bg-paper-2 text-xs font-bold text-ink"
                    >
                      {h.nombre} {h.apellido} (DNI {h.dni})
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Tarjeta de Personalización y Apariencia */}
            <div className="bg-surface rounded-2xl p-5 border border-rule shadow-2xs space-y-4 transition-colors">
              <div className="flex items-center gap-2 border-b border-rule pb-3">
                <Palette className="w-4 h-4 text-brand" />
                <div>
                  <h2 className="text-sm font-extrabold text-ink">
                    Personalización y Apariencia
                  </h2>
                  <p className="text-[11px] text-ink-muted">
                    Configurá la paleta institucional, escala tipográfica y tamaño del logo en este dispositivo.
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  {/* Muestras de color activas */}
                  <div className="flex items-center -space-x-1.5 overflow-hidden p-1">
                    <span
                      className="inline-block w-6 h-6 rounded-full border-2 border-surface shadow-2xs bg-brand"
                      title="Color Primario"
                    />
                    <span
                      style={{ backgroundColor: 'var(--color-navbar)' }}
                      className="inline-block w-6 h-6 rounded-full border-2 border-surface shadow-2xs"
                      title="Barra de Navegación"
                    />
                    <span
                      className="inline-block w-6 h-6 rounded-full border-2 border-surface shadow-2xs bg-paper"
                      title="Fondo General"
                    />
                    <span
                      className="inline-block w-6 h-6 rounded-full border-2 border-surface shadow-2xs bg-ink"
                      title="Color de Texto"
                    />
                  </div>

                  <div>
                    <span className="text-xs font-bold text-ink block">
                      Tema en uso:{' '}
                      <span className="text-brand font-extrabold">
                        {customization?.preset === 'nautical'
                          ? 'Azul Marino & Oro'
                          : customization?.preset === 'forest'
                            ? 'Bosque & Arena'
                            : customization?.preset === 'contrast'
                              ? 'Alto Contraste'
                              : customization?.preset === 'custom'
                                ? 'Personalizado'
                                : 'Scout Tradicional'}
                      </span>
                    </span>
                    <span className="text-[11px] text-ink-muted">
                      Escala de texto: {customization?.fontScale || '100%'}
                    </span>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="primary"
                  onClick={() => setCustomizerAbierto(true)}
                  leftIcon={<Palette className="w-4 h-4" />}
                  className="min-h-[44px] cursor-pointer whitespace-nowrap"
                >
                  <span>Personalizar Tema</span>
                </Button>
              </div>
            </div>

            <ThemeCustomizerModal
              abierto={customizerAbierto}
              onCerrar={() => setCustomizerAbierto(false)}
            />

            {/* Formulario de Contacto y Teléfonos Familiares */}
            <form
              onSubmit={handleGuardarContacto}
              className="bg-surface rounded-2xl p-5 border border-rule shadow-2xs space-y-4"
            >
              <div className="flex items-center gap-2 border-b border-rule pb-3">
                <Phone className="w-4 h-4 text-brand" />
                <div>
                  <h2 className="text-sm font-extrabold text-ink">
                    Datos de Contacto y Teléfonos
                  </h2>
                  <p className="text-[11px] text-ink-muted">
                    Esta información es vital ante emergencias y salidas de grupo.
                  </p>
                </div>
              </div>

              {alertaContacto && (
                <div
                  className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 border ${
                    alertaContacto.tipo === 'exito'
                      ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-900 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800'
                      : 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-200 border-rose-200 dark:border-rose-800'
                  }`}
                >
                  {alertaContacto.tipo === 'exito' ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0" />
                  )}
                  <span>{alertaContacto.texto}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-ink font-bold mb-1">
                    Email de Contacto
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="email"
                      placeholder="correo@ejemplo.com"
                      value={formContacto.emailContacto}
                      onChange={(e) =>
                        setFormContacto({ ...formContacto, emailContacto: e.target.value })
                      }
                      className="w-full min-h-[42px] pl-9 pr-3 py-2 rounded-xl border border-rule bg-surface text-ink focus:border-[var(--color-focus)] focus:ring-2 focus:ring-[var(--color-focus)]/25 outline-none transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-ink font-bold mb-1">
                    Teléfono del Miembro
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="tel"
                      placeholder="Ej: 3511234567"
                      value={formContacto.telefonoContacto}
                      onChange={(e) =>
                        setFormContacto({ ...formContacto, telefonoContacto: e.target.value })
                      }
                      className="w-full min-h-[42px] pl-9 pr-3 py-2 rounded-xl border border-rule bg-surface text-ink focus:border-[var(--color-focus)] focus:ring-2 focus:ring-[var(--color-focus)]/25 outline-none transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-ink font-bold mb-1">
                    Madre: Nombre Completo
                  </label>
                  <input
                    type="text"
                    value={formContacto.madreNombres}
                    onChange={(e) =>
                      setFormContacto({ ...formContacto, madreNombres: e.target.value })
                    }
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-rule bg-surface text-ink focus:border-[var(--color-focus)] focus:ring-2 focus:ring-[var(--color-focus)]/25 outline-none transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-ink font-bold mb-1">
                    Madre: Teléfono
                  </label>
                  <input
                    type="tel"
                    value={formContacto.madreTelefono}
                    onChange={(e) =>
                      setFormContacto({ ...formContacto, madreTelefono: e.target.value })
                    }
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-rule bg-surface text-ink focus:border-[var(--color-focus)] focus:ring-2 focus:ring-[var(--color-focus)]/25 outline-none transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-ink font-bold mb-1">
                    Padre: Nombre Completo
                  </label>
                  <input
                    type="text"
                    value={formContacto.padreNombres}
                    onChange={(e) =>
                      setFormContacto({ ...formContacto, padreNombres: e.target.value })
                    }
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-rule bg-surface text-ink focus:border-[var(--color-focus)] focus:ring-2 focus:ring-[var(--color-focus)]/25 outline-none transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-ink font-bold mb-1">
                    Padre: Teléfono
                  </label>
                  <input
                    type="tel"
                    value={formContacto.padreTelefono}
                    onChange={(e) =>
                      setFormContacto({ ...formContacto, padreTelefono: e.target.value })
                    }
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-rule bg-surface text-ink focus:border-[var(--color-focus)] focus:ring-2 focus:ring-[var(--color-focus)]/25 outline-none transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-ink font-bold mb-1">
                    Tutor/a Legal: Nombre
                  </label>
                  <input
                    type="text"
                    value={formContacto.tutorNombres}
                    onChange={(e) =>
                      setFormContacto({ ...formContacto, tutorNombres: e.target.value })
                    }
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-rule bg-surface text-ink focus:border-[var(--color-focus)] focus:ring-2 focus:ring-[var(--color-focus)]/25 outline-none transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-ink font-bold mb-1">
                    Tutor/a Legal: Teléfono
                  </label>
                  <input
                    type="tel"
                    value={formContacto.tutorTelefono}
                    onChange={(e) =>
                      setFormContacto({ ...formContacto, tutorTelefono: e.target.value })
                    }
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-rule bg-surface text-ink focus:border-[var(--color-focus)] focus:ring-2 focus:ring-[var(--color-focus)]/25 outline-none transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-ink font-bold mb-1">
                    Teléfono alternativo para Urgencias
                  </label>
                  <input
                    type="tel"
                    placeholder="Teléfono fijo o pariente cercano"
                    value={formContacto.telefonoUrgencias}
                    onChange={(e) =>
                      setFormContacto({ ...formContacto, telefonoUrgencias: e.target.value })
                    }
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-rule bg-surface text-ink focus:border-[var(--color-focus)] focus:ring-2 focus:ring-[var(--color-focus)]/25 outline-none transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-ink font-bold mb-1">
                    Domicilio
                  </label>
                  <div className="relative">
                    <MapPin className="w-4 h-4 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Calle y número"
                      value={formContacto.domicilio}
                      onChange={(e) =>
                        setFormContacto({ ...formContacto, domicilio: e.target.value })
                      }
                      className="w-full min-h-[42px] pl-9 pr-3 py-2 rounded-xl border border-rule bg-surface text-ink focus:border-[var(--color-focus)] focus:ring-2 focus:ring-[var(--color-focus)]/25 outline-none transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-ink font-bold mb-1">
                    Obra Social / Prepaga
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="OSDE, Apross, etc."
                      value={formContacto.obraSocial}
                      onChange={(e) =>
                        setFormContacto({ ...formContacto, obraSocial: e.target.value })
                      }
                      className="w-full min-h-[42px] pl-9 pr-3 py-2 rounded-xl border border-rule bg-surface text-ink focus:border-[var(--color-focus)] focus:ring-2 focus:ring-[var(--color-focus)]/25 outline-none transition-colors"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  type="submit"
                  disabled={guardandoContacto}
                  loading={guardandoContacto}
                  variant="primary"
                  leftIcon={<Save className="w-4 h-4" />}
                  className="min-h-[44px] px-5 py-2.5 rounded-xl text-xs font-extrabold flex items-center gap-2 cursor-pointer whitespace-nowrap"
                >
                  <span className="whitespace-nowrap">Guardar datos de contacto</span>
                </Button>
              </div>
            </form>

            {/* Sección Cambiar Contraseña */}
            <form
              onSubmit={handleCambiarClave}
              className="bg-surface rounded-2xl p-5 border border-rule shadow-2xs space-y-4"
            >
              <div className="flex items-center gap-2 border-b border-rule pb-3">
                <KeyRound className="w-4 h-4 text-brand" />
                <div>
                  <h2 className="text-sm font-extrabold text-ink">
                    Seguridad y Contraseña
                  </h2>
                  <p className="text-[11px] text-ink-muted">
                    Podés actualizar tu clave de acceso cuando quieras (mínimo 8 caracteres).
                  </p>
                </div>
              </div>

              {alertaClave && (
                <div
                  className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 border ${
                    alertaClave.tipo === 'exito'
                      ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-900 dark:text-amber-200 border-amber-200 dark:border-amber-800'
                      : 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-200 border-rose-200 dark:border-rose-800'
                  }`}
                >
                  {alertaClave.tipo === 'exito' ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0" />
                  )}
                  <span>{alertaClave.texto}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block text-ink font-bold mb-1">
                    Contraseña Actual
                  </label>
                  <div className="relative">
                    <input
                      type={verActual ? 'text' : 'password'}
                      required
                      value={formClave.passwordActual}
                      onChange={(e) =>
                        setFormClave({ ...formClave, passwordActual: e.target.value })
                      }
                      className="w-full min-h-[42px] px-3 pr-10 py-2 rounded-xl border border-rule bg-surface text-ink focus:border-[var(--color-focus)] focus:ring-2 focus:ring-[var(--color-focus)]/25 outline-none transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setVerActual((v) => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-ink-muted hover:text-ink cursor-pointer"
                    >
                      {verActual ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-ink font-bold mb-1">
                    Nueva Contraseña
                  </label>
                  <div className="relative">
                    <input
                      type={verNueva ? 'text' : 'password'}
                      required
                      minLength={8}
                      placeholder="Mínimo 8 caracteres"
                      value={formClave.passwordNueva}
                      onChange={(e) =>
                        setFormClave({ ...formClave, passwordNueva: e.target.value })
                      }
                      className="w-full min-h-[42px] px-3 pr-10 py-2 rounded-xl border border-rule bg-surface text-ink focus:border-[var(--color-focus)] focus:ring-2 focus:ring-[var(--color-focus)]/25 outline-none transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setVerNueva((v) => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-ink-muted hover:text-ink cursor-pointer"
                    >
                      {verNueva ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-ink font-bold mb-1">
                    Repetir Nueva Contraseña
                  </label>
                  <div className="relative">
                    <input
                      type={verConfirmar ? 'text' : 'password'}
                      required
                      minLength={8}
                      value={formClave.confirmar}
                      onChange={(e) => setFormClave({ ...formClave, confirmar: e.target.value })}
                      className="w-full min-h-[42px] px-3 pr-10 py-2 rounded-xl border border-rule bg-surface text-ink focus:border-[var(--color-focus)] focus:ring-2 focus:ring-[var(--color-focus)]/25 outline-none transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setVerConfirmar((v) => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-ink-muted hover:text-ink cursor-pointer"
                    >
                      {verConfirmar ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  type="submit"
                  disabled={guardandoClave}
                  loading={guardandoClave}
                  variant="primary"
                  leftIcon={<KeyRound className="w-4 h-4" />}
                  className="min-h-[44px] px-5 py-2.5 rounded-xl text-xs font-extrabold flex items-center gap-2 cursor-pointer shadow-2xs"
                >
                  <span>Actualizar Contraseña</span>
                </Button>
              </div>
            </form>

            {/* Banner descarga App Celular (PWA) */}
            <BotonInstalarPwa variante="card" />
          </>
        )}
      </main>
    </div>
  );
};
