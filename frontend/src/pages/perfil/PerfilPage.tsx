import React, { useEffect, useState } from 'react';
import { Navbar } from '../../components/Navbar';
import { api } from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { obtenerConfigRama } from '../../lib/ramaColors';
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
} from 'lucide-react';

export const PerfilPage: React.FC = () => {
  const { usuario } = useAuthStore();
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
      await api.post('/auth/cambiar-password', {
        passwordActual: formClave.passwordActual,
        passwordNueva: formClave.passwordNueva,
      });
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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-24 sm:pb-10 transition-colors">
      <Navbar />

      <main className="max-w-4xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-5">
        {cargando ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-10 border border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center gap-3 text-slate-500">
            <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
            <span className="text-xs font-bold">Cargando tu perfil...</span>
          </div>
        ) : (
          <>
            {/* Tarjeta de Identidad Institucional */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-2xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div
                    className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black text-lg shrink-0 ${
                      cfgRama?.avatarClases || 'bg-emerald-600 text-white'
                    }`}
                  >
                    {perfil?.nombre?.[0] || usuario?.nombre?.[0] || ''}
                    {perfil?.apellido?.[0] || usuario?.apellido?.[0] || ''}
                  </div>
                  <div>
                    <h1 className="text-xl font-black text-slate-900 dark:text-slate-100">
                      {perfil?.nombre || usuario?.nombre} {perfil?.apellido || usuario?.apellido}
                    </h1>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-medium">
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
                          'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
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
                <div className="mt-4 pt-3.5 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-slate-400">
                    <Users className="w-3.5 h-3.5 text-emerald-600" />
                    Grupo Familiar:
                  </span>
                  {hermanos.map((h: any) => (
                    <span
                      key={h.id}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200"
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
              className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-2xs space-y-4"
            >
              <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                <Phone className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <div>
                  <h2 className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
                    Datos de Contacto y Teléfonos
                  </h2>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Mantené actualizados tus teléfonos para emergencias y comunicaciones del grupo.
                  </p>
                </div>
              </div>

              {alertaContacto && (
                <div
                  className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 border ${
                    alertaContacto.tipo === 'exito'
                      ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800'
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
                  <label className="block text-slate-600 dark:text-slate-300 font-bold mb-1">
                    Teléfono del Miembro
                  </label>
                  <input
                    type="tel"
                    inputMode="tel"
                    placeholder="Ej: 3511234567"
                    value={formContacto.telefonoContacto}
                    onChange={(e) =>
                      setFormContacto({ ...formContacto, telefonoContacto: e.target.value })
                    }
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:border-emerald-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 dark:text-slate-300 font-bold mb-1">
                    Email
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="email"
                      placeholder="correo@ejemplo.com"
                      value={formContacto.emailContacto}
                      onChange={(e) =>
                        setFormContacto({ ...formContacto, emailContacto: e.target.value })
                      }
                      className="w-full min-h-[42px] pl-9 pr-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:border-emerald-500 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-600 dark:text-slate-300 font-bold mb-1">
                    Nombre y Apellido Madre
                  </label>
                  <input
                    type="text"
                    placeholder="Nombre y apellido de la madre"
                    value={formContacto.madreNombres}
                    onChange={(e) =>
                      setFormContacto({ ...formContacto, madreNombres: e.target.value })
                    }
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:border-emerald-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 dark:text-slate-300 font-bold mb-1">
                    Teléfono Madre
                  </label>
                  <input
                    type="tel"
                    inputMode="tel"
                    placeholder="Celular madre"
                    value={formContacto.madreTelefono}
                    onChange={(e) =>
                      setFormContacto({ ...formContacto, madreTelefono: e.target.value })
                    }
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:border-emerald-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 dark:text-slate-300 font-bold mb-1">
                    Nombre y Apellido Padre
                  </label>
                  <input
                    type="text"
                    placeholder="Nombre y apellido del padre"
                    value={formContacto.padreNombres}
                    onChange={(e) =>
                      setFormContacto({ ...formContacto, padreNombres: e.target.value })
                    }
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:border-emerald-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 dark:text-slate-300 font-bold mb-1">
                    Teléfono Padre
                  </label>
                  <input
                    type="tel"
                    inputMode="tel"
                    placeholder="Celular padre"
                    value={formContacto.padreTelefono}
                    onChange={(e) =>
                      setFormContacto({ ...formContacto, padreTelefono: e.target.value })
                    }
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:border-emerald-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 dark:text-slate-300 font-bold mb-1">
                    Nombre y Apellido Tutor/a
                  </label>
                  <input
                    type="text"
                    placeholder="Nombre y apellido del tutor/a"
                    value={formContacto.tutorNombres}
                    onChange={(e) =>
                      setFormContacto({ ...formContacto, tutorNombres: e.target.value })
                    }
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:border-emerald-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 dark:text-slate-300 font-bold mb-1">
                    Teléfono Tutor/a
                  </label>
                  <input
                    type="tel"
                    inputMode="tel"
                    placeholder="Celular tutor/a"
                    value={formContacto.tutorTelefono}
                    onChange={(e) =>
                      setFormContacto({ ...formContacto, tutorTelefono: e.target.value })
                    }
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:border-emerald-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 dark:text-slate-300 font-bold mb-1">
                    Teléfono de Urgencias
                  </label>
                  <input
                    type="tel"
                    inputMode="tel"
                    placeholder="Alternativo para emergencias"
                    value={formContacto.telefonoUrgencias}
                    onChange={(e) =>
                      setFormContacto({ ...formContacto, telefonoUrgencias: e.target.value })
                    }
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:border-emerald-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 dark:text-slate-300 font-bold mb-1">
                    Domicilio
                  </label>
                  <div className="relative">
                    <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Calle y número"
                      value={formContacto.domicilio}
                      onChange={(e) =>
                        setFormContacto({ ...formContacto, domicilio: e.target.value })
                      }
                      className="w-full min-h-[42px] pl-9 pr-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:border-emerald-500 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-600 dark:text-slate-300 font-bold mb-1">
                    Obra Social / Prepaga
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="OSDE, Apross, etc."
                      value={formContacto.obraSocial}
                      onChange={(e) =>
                        setFormContacto({ ...formContacto, obraSocial: e.target.value })
                      }
                      className="w-full min-h-[42px] pl-9 pr-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:border-emerald-500 outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={guardandoContacto}
                  className="min-h-[44px] px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center gap-2 transition cursor-pointer disabled:opacity-50"
                >
                  {guardandoContacto ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  <span>Guardar Datos de Contacto</span>
                </button>
              </div>
            </form>

            {/* Sección Cambiar Contraseña */}
            <form
              onSubmit={handleCambiarClave}
              className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-2xs space-y-4"
            >
              <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                <KeyRound className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <div>
                  <h2 className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
                    Seguridad y Contraseña
                  </h2>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Podés actualizar tu clave de acceso cuando quieras (mínimo 8 caracteres).
                  </p>
                </div>
              </div>

              {alertaClave && (
                <div
                  className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 border ${
                    alertaClave.tipo === 'exito'
                      ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800'
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
                  <label className="block text-slate-600 dark:text-slate-300 font-bold mb-1">
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
                      className="w-full min-h-[42px] px-3 pr-10 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:border-emerald-500 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setVerActual((v) => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                    >
                      {verActual ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-slate-600 dark:text-slate-300 font-bold mb-1">
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
                      className="w-full min-h-[42px] px-3 pr-10 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:border-emerald-500 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setVerNueva((v) => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                    >
                      {verNueva ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-slate-600 dark:text-slate-300 font-bold mb-1">
                    Repetir Nueva Contraseña
                  </label>
                  <div className="relative">
                    <input
                      type={verConfirmar ? 'text' : 'password'}
                      required
                      minLength={8}
                      value={formClave.confirmar}
                      onChange={(e) => setFormClave({ ...formClave, confirmar: e.target.value })}
                      className="w-full min-h-[42px] px-3 pr-10 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:border-emerald-500 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setVerConfirmar((v) => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                    >
                      {verConfirmar ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={guardandoClave}
                  className="min-h-[44px] px-5 py-2.5 rounded-xl bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center gap-2 transition cursor-pointer disabled:opacity-50"
                >
                  {guardandoClave ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <KeyRound className="w-4 h-4" />
                  )}
                  <span>Actualizar Contraseña</span>
                </button>
              </div>
            </form>
          </>
        )}
      </main>
    </div>
  );
};
