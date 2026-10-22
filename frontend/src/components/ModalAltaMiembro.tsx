import React, { useEffect, useState, useMemo } from 'react';
import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { X, UserPlus, Search, CheckCircle2, AlertCircle } from 'lucide-react';

interface Props {
  abierto: boolean;
  onCerrar: () => void;
  onCreado: () => void;
  unidadesDisponibles: any[];
  rolesDisponibles: any[];
}

export const ModalAltaMiembro: React.FC<Props> = ({
  abierto,
  onCerrar,
  onCreado,
  unidadesDisponibles,
  rolesDisponibles,
}) => {
  const { tieneGlobal } = useAuthStore();
  const [dni, setDni] = useState('');
  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [fechaNacimiento, setFechaNacimiento] = useState('');
  const [emailContacto, setEmailContacto] = useState('');
  const [telefonoContacto, setTelefonoContacto] = useState('');
  const [unidadId, setUnidadId] = useState<number | ''>('');
  const [rolId, setRolId] = useState<number | ''>('');
  const [domicilio, setDomicilio] = useState('');
  const [obraSocial, setObraSocial] = useState('');

  // Hermano
  const [dniHermano, setDniHermano] = useState('');
  const [buscandoHermano, setBuscandoHermano] = useState(false);
  const [hermanoEncontrado, setHermanoEncontrado] = useState<any | null>(null);

  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const esUnidadRama = (u: any) => u?.tipo === 'SECCION_RAMA' || u?.ramaId != null;
  const esUnidadJefatura = (u: any) => u?.tipo === 'JEFATURA' || u?.nombre?.toLowerCase().includes('jefatura');
  const esUnidadSinRama = (u: any) => u?.tipo === 'SIN_RAMA_APOYO' || u?.nombre?.toLowerCase().includes('sin rama');

  const esRolJefe = (r: any) => r?.nombre?.toLowerCase().includes('jefe');
  const esRolSinRama = (r: any) => r?.nombre?.toLowerCase().includes('sin rama');
  const esRolRama = (r: any) => !esRolJefe(r) && !esRolSinRama(r);

  const unidadSeleccionada = useMemo(
    () => unidadesDisponibles.find((u) => u.id === Number(unidadId)),
    [unidadesDisponibles, unidadId],
  );

  const rolSeleccionado = useMemo(
    () => rolesDisponibles.find((r) => r.id === Number(rolId)),
    [rolesDisponibles, rolId],
  );

  const rolesFiltrados = useMemo(() => {
    let list = rolesDisponibles;
    if (!tieneGlobal()) {
      list = list.filter((r) => !esRolJefe(r));
    }
    if (unidadSeleccionada) {
      if (esUnidadRama(unidadSeleccionada)) {
        return list.filter(esRolRama);
      }
      if (esUnidadSinRama(unidadSeleccionada)) {
        return list.filter(esRolSinRama);
      }
      if (esUnidadJefatura(unidadSeleccionada)) {
        return list.filter(esRolJefe);
      }
    }
    return list;
  }, [rolesDisponibles, unidadSeleccionada, tieneGlobal]);

  const unidadesFiltradas = useMemo(() => {
    if (rolSeleccionado) {
      if (esRolSinRama(rolSeleccionado)) {
        return unidadesDisponibles.filter(esUnidadSinRama);
      }
      if (esRolJefe(rolSeleccionado)) {
        return unidadesDisponibles.filter(esUnidadJefatura);
      }
      if (esRolRama(rolSeleccionado)) {
        return unidadesDisponibles.filter(esUnidadRama);
      }
    }
    return unidadesDisponibles;
  }, [unidadesDisponibles, rolSeleccionado]);

  const handleCambioUnidad = (nuevaUnidadId: number) => {
    setUnidadId(nuevaUnidadId);
    const u = unidadesDisponibles.find((x) => x.id === nuevaUnidadId);
    if (!u) return;

    if (esUnidadRama(u)) {
      const rActual = rolesDisponibles.find((r) => r.id === Number(rolId));
      if (!rActual || esRolSinRama(rActual) || esRolJefe(rActual)) {
        const prota = rolesDisponibles.find((r) => r.nombre === 'Protagonista') || rolesDisponibles.find(esRolRama);
        if (prota) setRolId(prota.id);
      }
    } else if (esUnidadSinRama(u)) {
      const rSinRama = rolesDisponibles.find(esRolSinRama);
      if (rSinRama) setRolId(rSinRama.id);
    } else if (esUnidadJefatura(u)) {
      const rJefe = rolesDisponibles.find(esRolJefe);
      if (rJefe) setRolId(rJefe.id);
    }
  };

  const handleCambioRol = (nuevoRolId: number) => {
    setRolId(nuevoRolId);
    const r = rolesDisponibles.find((x) => x.id === nuevoRolId);
    if (!r) return;

    if (esRolSinRama(r)) {
      const uSinRama = unidadesDisponibles.find(esUnidadSinRama);
      if (uSinRama) setUnidadId(uSinRama.id);
    } else if (esRolJefe(r)) {
      const uJefatura = unidadesDisponibles.find(esUnidadJefatura);
      if (uJefatura) setUnidadId(uJefatura.id);
    } else if (esRolRama(r)) {
      const uActual = unidadesDisponibles.find((x) => x.id === Number(unidadId));
      if (!uActual || !esUnidadRama(uActual)) {
        const primerRama = unidadesDisponibles.find(esUnidadRama);
        if (primerRama) setUnidadId(primerRama.id);
      }
    }
  };

  useEffect(() => {
    if (unidadesDisponibles.length > 0 && !unidadId) {
      setUnidadId(unidadesDisponibles[0].id);
    }
    if (rolesDisponibles.length > 0 && !rolId) {
      const prota = rolesDisponibles.find((r) => r.nombre === 'Protagonista');
      setRolId(prota ? prota.id : rolesDisponibles[0].id);
    }
  }, [unidadesDisponibles, rolesDisponibles]);

  if (!abierto) return null;

  const handleBuscarHermano = async () => {
    if (!dniHermano.trim()) return;
    setBuscandoHermano(true);
    setError(null);
    try {
      const res = await api.get(`/miembros/hermano/${dniHermano.trim()}`);
      setHermanoEncontrado(res.data);
      // Prellenar automáticamente datos compartidos
      if (res.data.emailContacto) setEmailContacto(res.data.emailContacto);
      if (res.data.telefonoContacto) setTelefonoContacto(res.data.telefonoContacto);
      if (res.data.datosCompartidos?.domicilio) setDomicilio(res.data.datosCompartidos.domicilio);
      if (res.data.datosCompartidos?.obra_social) setObraSocial(res.data.datosCompartidos.obra_social);
      if (res.data.apellido && !apellido) setApellido(res.data.apellido);
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se encontró ningún miembro activo con ese DNI.');
      setHermanoEncontrado(null);
    } finally {
      setBuscandoHermano(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unidadId || !rolId) {
      setError('Debe seleccionar una rama y un rol.');
      return;
    }

    setCargando(true);
    setError(null);

    try {
      await api.post('/miembros', {
        dni: dni.trim(),
        nombre: nombre.trim(),
        apellido: apellido.trim(),
        fechaNacimiento,
        emailContacto: emailContacto.trim() || undefined,
        telefonoContacto: telefonoContacto.trim() || undefined,
        unidadId: Number(unidadId),
        rolId: Number(rolId),
        hermanoDni: hermanoEncontrado ? dniHermano.trim() : undefined,
        copiarDatosHermano: Boolean(hermanoEncontrado),
        datosFijosJson: {
          domicilio: domicilio.trim() || undefined,
          obra_social: obraSocial.trim() || undefined,
        },
      });

      onCreado();
      onCerrar();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error al crear el miembro.');
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-xs">
      <div className="bg-white dark:bg-slate-900 border-t sm:border border-slate-200 dark:border-slate-800 rounded-t-3xl sm:rounded-2xl w-full max-w-xl max-h-[92vh] overflow-hidden shadow-2xl flex flex-col transition-colors">
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/80 shrink-0">
          <div className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <h3 className="font-bold text-slate-800 dark:text-slate-100 text-base">Nuevo Miembro</h3>
          </div>
          <button
            onClick={onCerrar}
            className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 text-xs overflow-y-auto flex-1">
          {error && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 rounded-xl flex items-center gap-2 text-xs font-medium">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Autocompletado de hermano */}
          <div className="p-3.5 bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 rounded-xl space-y-2">
            <span className="font-semibold text-emerald-900 dark:text-emerald-200 block text-xs">
              ¿Tiene un hermano/a ya inscripto? Copiar datos familiares:
            </span>
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="numeric"
                placeholder="DNI del hermano/a..."
                value={dniHermano}
                onChange={(e) => setDniHermano(e.target.value.replace(/\D/g, ''))}
                className="flex-1 min-h-[42px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 outline-none focus:border-emerald-500"
              />
              <button
                type="button"
                onClick={handleBuscarHermano}
                disabled={buscandoHermano || !dniHermano.trim()}
                className="min-h-[42px] px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Search className="w-4 h-4" />
                <span>{buscandoHermano ? 'Buscando...' : 'Copiar'}</span>
              </button>
            </div>

            {hermanoEncontrado && (
              <div className="p-2.5 bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-800 rounded-xl text-emerald-900 dark:text-emerald-200 flex items-center gap-2 text-xs">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>
                  Datos copiados de <strong>{hermanoEncontrado.nombre} {hermanoEncontrado.apellido}</strong>.
                </span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">DNI *</label>
              <input
                type="text"
                inputMode="numeric"
                required
                placeholder="Sin puntos"
                value={dni}
                onChange={(e) => setDni(e.target.value.replace(/\D/g, ''))}
                className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:border-emerald-500 outline-none"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Fecha de Nacimiento *</label>
              <input
                type="date"
                required
                value={fechaNacimiento}
                onChange={(e) => setFechaNacimiento(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:border-emerald-500 outline-none"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Nombre *</label>
              <input
                type="text"
                required
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:border-emerald-500 outline-none"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Apellido *</label>
              <input
                type="text"
                required
                value={apellido}
                onChange={(e) => setApellido(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:border-emerald-500 outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Rama / Sección *</label>
              <select
                value={unidadId}
                onChange={(e) => handleCambioUnidad(Number(e.target.value))}
                className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-sm focus:border-emerald-500 outline-none bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              >
                {unidadesFiltradas.some(esUnidadRama) && (
                  <optgroup label="Ramas del Grupo">
                    {unidadesFiltradas.filter(esUnidadRama).map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nombre}
                      </option>
                    ))}
                  </optgroup>
                )}
                {unidadesFiltradas.some((u) => !esUnidadRama(u)) && (
                  <optgroup label="Adultos y Equipo">
                    {unidadesFiltradas.filter((u) => !esUnidadRama(u)).map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nombre}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Función en el Grupo *</label>
              <select
                value={rolId}
                onChange={(e) => handleCambioRol(Number(e.target.value))}
                className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-sm focus:border-emerald-500 outline-none bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              >
                {rolesFiltrados.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Teléfono de Contacto</label>
              <input
                type="tel"
                inputMode="tel"
                value={telefonoContacto}
                onChange={(e) => setTelefonoContacto(e.target.value)}
                placeholder="Ej. 11 4567 8901"
                className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:border-emerald-500 outline-none"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Email Familiar</label>
              <input
                type="email"
                value={emailContacto}
                onChange={(e) => setEmailContacto(e.target.value)}
                placeholder="familia@email.com"
                className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:border-emerald-500 outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Domicilio</label>
              <input
                type="text"
                value={domicilio}
                onChange={(e) => setDomicilio(e.target.value)}
                placeholder="Calle y número"
                className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:border-emerald-500 outline-none"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Obra Social / Prepaga</label>
              <input
                type="text"
                value={obraSocial}
                onChange={(e) => setObraSocial(e.target.value)}
                placeholder="Opcional"
                className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:border-emerald-500 outline-none"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onCerrar}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={cargando}
              className="min-h-[44px] px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition cursor-pointer disabled:opacity-50"
            >
              {cargando ? 'Guardando...' : 'Guardar Miembro'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
