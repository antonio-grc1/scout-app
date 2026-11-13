import React, { useEffect, useState } from 'react';
import { Navbar } from '../../components/Navbar';
import { BotonInstalarPwa } from '../../components/BotonInstalarPwa';
import { api } from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { obtenerConfigRama } from '../../lib/ramaColors';
import { Button } from '../../components/ui/Button';
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
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

export const PerfilPage: React.FC = () => {
  const { usuario, setSesion } = useAuthStore();
  const [perfil, setPerfil] = useState<any | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardandoContacto, setGuardandoContacto] = useState(false);
  const [guardandoClave, setGuardandoClave] = useState(false);
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

    const actual = formClave.passwordActual.trim();
    const nueva = formClave.passwordNueva.trim();
    const confirmar = formClave.confirmar.trim();

    if (nueva.length < 8) {
      setAlertaClave({
        tipo: 'error',
        texto: 'La nueva contraseña debe tener al menos 8 caracteres.',
      });
      return;
    }
    if (nueva !== confirmar) {
      setAlertaClave({ tipo: 'error', texto: 'Las contraseñas nuevas no coinciden.' });
      return;
    }
    if (nueva === actual) {
      setAlertaClave({
        tipo: 'error',
        texto: 'La nueva contraseña debe ser distinta de la actual.',
      });
      return;
    }

    setGuardandoClave(true);
    try {
      const res = await api.post('/auth/cambiar-clave', {
        claveActual: actual,
        claveNueva: nueva,
      });
      if (
        res.data?.accessToken &&
        res.data?.usuario &&
        Array.isArray(res.data?.asignaciones)
      ) {
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

  const asigPrincipal =
    perfil?.asignaciones?.find((a: any) => a.activo !== false) ?? perfil?.asignaciones?.[0];
  const cfgRama = obtenerConfigRama(
    asigPrincipal ? { asignaciones: [asigPrincipal] } : null,
  );
  const hermanos = (perfil?.grupoFamiliar?.miembros || []).filter(
    (h: any) => h.id !== perfil?.id,
  );
  const asignacionesActivas = (perfil?.asignaciones || []).filter((a: any) => a.activo);

  return (
    <div className="min-h-screen bg-paper pb-24 sm:pb-10 transition-colors">
      <Navbar />

      <main className="max-w-4xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-5">
        {cargando ? (
          <div className="space-y-5">
            <div className="bg-surface rounded-2xl p-5 border border-rule animate-pulse flex items-center gap-3.5">
              <div className="w-14 h-14 rounded-2xl bg-paper-3 shrink-0" />
              <div className="space-y-2 flex-1">
                <div className="h-5 w-48 bg-paper-3 rounded" />
                <div className="h-3.5 w-32 bg-paper-2 rounded" />
              </div>
            </div>
            <div className="bg-surface rounded-2xl p-5 border border-rule animate-pulse space-y-4">
              <div className="h-4 w-56 bg-paper-3 rounded" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-11 rounded-xl bg-paper-2" />
                ))}
              </div>
            </div>
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
                  {asignacionesActivas.map((a: any) => {
                    const c = obtenerConfigRama({ asignaciones: [a] });
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
                  role={alertaContacto.tipo === 'error' ? 'alert' : 'status'}
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
                  role={alertaClave.tipo === 'error' ? 'alert' : 'status'}
                  className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 border ${
                    alertaClave.tipo === 'exito'
                      ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-900 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800'
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
                  <label htmlFor="perfil-clave-actual" className="block text-ink font-bold mb-1">
                    Contraseña Actual
                  </label>
                  <div className="relative">
                    <input
                      id="perfil-clave-actual"
                      type={verActual ? 'text' : 'password'}
                      autoComplete="current-password"
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
                      aria-label={verActual ? 'Ocultar contraseña actual' : 'Ver contraseña actual'}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-ink-muted hover:text-ink cursor-pointer"
                    >
                      {verActual ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label htmlFor="perfil-clave-nueva" className="block text-ink font-bold mb-1">
                    Nueva Contraseña
                  </label>
                  <div className="relative">
                    <input
                      id="perfil-clave-nueva"
                      type={verNueva ? 'text' : 'password'}
                      autoComplete="new-password"
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
                      aria-label={verNueva ? 'Ocultar nueva contraseña' : 'Ver nueva contraseña'}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-ink-muted hover:text-ink cursor-pointer"
                    >
                      {verNueva ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label htmlFor="perfil-clave-confirmar" className="block text-ink font-bold mb-1">
                    Repetir Nueva Contraseña
                  </label>
                  <div className="relative">
                    <input
                      id="perfil-clave-confirmar"
                      type={verConfirmar ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      minLength={8}
                      value={formClave.confirmar}
                      onChange={(e) => setFormClave({ ...formClave, confirmar: e.target.value })}
                      className="w-full min-h-[42px] px-3 pr-10 py-2 rounded-xl border border-rule bg-surface text-ink focus:border-[var(--color-focus)] focus:ring-2 focus:ring-[var(--color-focus)]/25 outline-none transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setVerConfirmar((v) => !v)}
                      aria-label={verConfirmar ? 'Ocultar repetición de contraseña' : 'Ver repetición de contraseña'}
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
