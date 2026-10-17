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
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl my-6 flex flex-col transition-colors">
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/80">
          <div className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <h3 className="font-bold text-slate-800 dark:text-slate-100 text-base">Dar de Alta Miembro</h3>
          </div>
          <button onClick={onCerrar} className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 text-xs overflow-y-auto max-h-[80vh]">
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 rounded-xl flex items-center gap-2 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Autocompletado de hermano */}
          <div className="p-3.5 bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 rounded-xl space-y-2">
            <span className="font-semibold text-emerald-900 dark:text-emerald-200 block text-xs">
              ¿Tiene un hermano/a ya registrado en el Grupo Scout?
            </span>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Ingresar DNI del hermano..."
                value={dniHermano}
                onChange={(e) => setDniHermano(e.target.value)}
                className="flex-1 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:border-emerald-500"
              />
              <button
                type="button"
                onClick={handleBuscarHermano}
                disabled={buscandoHermano || !dniHermano.trim()}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg text-xs flex items-center gap-1 cursor-pointer disabled:opacity-50"
              >
                <Search className="w-3.5 h-3.5" />
                <span>{buscandoHermano ? 'Buscando...' : 'Buscar'}</span>
              </button>
            </div>

            {hermanoEncontrado && (
              <div className="p-2.5 bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-800 rounded-lg text-emerald-900 dark:text-emerald-200 flex items-center gap-2 text-[11px]">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>
                  Hermano encontrado: <strong>{hermanoEncontrado.nombre} {hermanoEncontrado.apellido}</strong>. Se vincularán al mismo Grupo Familiar y se autocompletaron domicilio y contacto.
                </span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">DNI del nuevo miembro *</label>
              <input
                type="text"
                required
                value={dni}
                onChange={(e) => setDni(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs focus:border-emerald-500 outline-none"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Fecha de Nacimiento *</label>
              <input
                type="date"
                required
                value={fechaNacimiento}
                onChange={(e) => setFechaNacimiento(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs focus:border-emerald-500 outline-none"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Nombre *</label>
              <input
                type="text"
                required
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs focus:border-emerald-500 outline-none"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Apellido *</label>
              <input
                type="text"
                required
                value={apellido}
                onChange={(e) => setApellido(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs focus:border-emerald-500 outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Rama / Sección *</label>
              <select
                value={unidadId}
                onChange={(e) => handleCambioUnidad(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs focus:border-emerald-500 outline-none bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              >
                {unidadesFiltradas.some(esUnidadRama) && (
                  <optgroup label="Ramas / Secciones Pedagógicas">
                    {unidadesFiltradas.filter(esUnidadRama).map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nombre}
                      </option>
                    ))}
                  </optgroup>
                )}
                {unidadesFiltradas.some((u) => !esUnidadRama(u)) && (
                  <optgroup label="Institucional / Sin Rama">
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
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Rol a Asignar *</label>
              <select
                value={rolId}
                onChange={(e) => handleCambioRol(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs focus:border-emerald-500 outline-none bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              >
                {rolesFiltrados.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nombre} ({r.alcancePorDefecto})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Teléfono Familiar de Contacto</label>
              <input
                type="tel"
                value={telefonoContacto}
                onChange={(e) => setTelefonoContacto(e.target.value)}
                placeholder="11-XXXX-XXXX"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-xs focus:border-emerald-500 outline-none"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Email de Contacto</label>
              <input
                type="email"
                value={emailContacto}
                onChange={(e) => setEmailContacto(e.target.value)}
                placeholder="familia@email.com"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-xs focus:border-emerald-500 outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Domicilio Real</label>
              <input
                type="text"
                value={domicilio}
                onChange={(e) => setDomicilio(e.target.value)}
                placeholder="Calle, número, localidad"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-xs focus:border-emerald-500 outline-none"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Obra Social / Prepaga</label>
              <input
                type="text"
                value={obraSocial}
                onChange={(e) => setObraSocial(e.target.value)}
                placeholder="OSDE, Swiss Medical, etc."
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-xs focus:border-emerald-500 outline-none"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onCerrar}
              className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={cargando}
              className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-xs transition cursor-pointer disabled:opacity-50"
            >
              {cargando ? 'Guardando...' : 'Crear Miembro'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
