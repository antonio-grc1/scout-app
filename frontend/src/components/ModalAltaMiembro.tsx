import React, { useEffect, useState, useMemo } from 'react';
import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';
import {
  agruparCandidatosPorFamilia,
  type OpcionGrupoHermanos,
} from '../lib/formatters';
import {
  X,
  UserPlus,
  Search,
  CheckCircle2,
  AlertCircle,
  Users,
  Loader2,
  MapPin,
} from 'lucide-react';

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
  const [madreNombres, setMadreNombres] = useState('');
  const [madreTelefono, setMadreTelefono] = useState('');
  const [padreNombres, setPadreNombres] = useState('');
  const [padreTelefono, setPadreTelefono] = useState('');
  const [tutorNombres, setTutorNombres] = useState('');
  const [tutorTelefono, setTutorTelefono] = useState('');
  const [unidadId, setUnidadId] = useState<number | ''>('');
  const [rolId, setRolId] = useState<number | ''>('');
  const [domicilio, setDomicilio] = useState('');
  const [obraSocial, setObraSocial] = useState('');

  // Buscador en vivo de hermano y selección de grupo familiar
  const [dniHermano, setDniHermano] = useState('');
  const [gruposOpciones, setGruposOpciones] = useState<OpcionGrupoHermanos[]>([]);
  const [grupoPreseleccionado, setGrupoPreseleccionado] = useState<OpcionGrupoHermanos | null>(null);
  const [grupoConfirmado, setGrupoConfirmado] = useState<OpcionGrupoHermanos | null>(null);
  const [buscandoHermano, setBuscandoHermano] = useState(false);

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

  // Búsqueda automática en vivo al escribir DNI, Nombre o Apellido
  useEffect(() => {
    if (!abierto) return;
    const q = dniHermano.trim();
    if (q.length < 2) {
      setGruposOpciones([]);
      setGrupoPreseleccionado(null);
      setBuscandoHermano(false);
      return;
    }

    const timer = setTimeout(async () => {
      setBuscandoHermano(true);
      try {
        const res = await api.get(`/miembros/hermanos/buscar?q=${encodeURIComponent(q)}`);
        const lista = Array.isArray(res.data) ? res.data : [];
        const agrupados = agruparCandidatosPorFamilia(lista);
        setGruposOpciones(agrupados);
        if (agrupados.length === 1) {
          setGrupoPreseleccionado(agrupados[0]);
        } else {
          setGrupoPreseleccionado((prev) =>
            prev ? agrupados.find((g) => g.key === prev.key) || null : null,
          );
        }
      } catch {
        setGruposOpciones([]);
      } finally {
        setBuscandoHermano(false);
      }
    }, 220);

    return () => clearTimeout(timer);
  }, [dniHermano, abierto]);

  if (!abierto) return null;

  const handleConfirmarAdhesionGrupo = (grupo: OpcionGrupoHermanos) => {
    setGrupoConfirmado(grupo);
    const hermano = grupo.representante;
    const comp = hermano?.datosCompartidos || hermano?.datosFijosJson || {};
    if (hermano?.emailContacto && !emailContacto) setEmailContacto(hermano.emailContacto);
    if (comp.domicilio) setDomicilio(comp.domicilio);
    if (comp.obra_social) setObraSocial(comp.obra_social);
    if (comp.madre_nombres) setMadreNombres(comp.madre_nombres);
    if (comp.madre_telefono) setMadreTelefono(comp.madre_telefono);
    if (comp.padre_nombres) setPadreNombres(comp.padre_nombres);
    if (comp.padre_telefono) setPadreTelefono(comp.padre_telefono);
    if (comp.tutor_nombres) setTutorNombres(comp.tutor_nombres);
    if (comp.tutor_telefono) setTutorTelefono(comp.tutor_telefono);
    if (hermano?.apellido && !apellido) setApellido(hermano.apellido);
    setDniHermano('');
    setGruposOpciones([]);
    setGrupoPreseleccionado(null);
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
        hermanoDni: grupoConfirmado?.representante?.dni || undefined,
        copiarDatosHermano: Boolean(grupoConfirmado),
        datosFijosJson: {
          domicilio: domicilio.trim() || undefined,
          obra_social: obraSocial.trim() || undefined,
          protagonista_telefono: telefonoContacto.trim() || undefined,
          madre_nombres: madreNombres.trim() || undefined,
          madre_telefono: madreTelefono.trim() || undefined,
          padre_nombres: padreNombres.trim() || undefined,
          padre_telefono: padreTelefono.trim() || undefined,
          tutor_nombres: tutorNombres.trim() || undefined,
          tutor_telefono: tutorTelefono.trim() || undefined,
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

          {/* Buscador en vivo y adhesión al grupo familiar */}
          <div className="p-3.5 bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900/60 rounded-2xl space-y-2.5">
            <span className="font-extrabold text-indigo-950 dark:text-indigo-200 flex items-center gap-1.5 text-xs">
              <Users className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              ¿Tiene hermanos/as ya inscriptos? Buscá por DNI, Nombre o Apellido:
            </span>

            {!grupoConfirmado ? (
              <>
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Escribí DNI, nombre o apellido para ver los grupos de hermanos..."
                    value={dniHermano}
                    onChange={(e) => setDniHermano(e.target.value)}
                    className="w-full min-h-[42px] pl-9 pr-9 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 outline-none focus:border-indigo-500"
                  />
                  {buscandoHermano && (
                    <Loader2 className="w-4 h-4 text-indigo-600 animate-spin absolute right-3 top-1/2 -translate-y-1/2" />
                  )}
                </div>

                {dniHermano.trim().length >= 2 && !buscandoHermano && gruposOpciones.length === 0 && (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 px-1">
                    No se encontraron coincidencias para "{dniHermano.trim()}".
                  </p>
                )}

                {gruposOpciones.length > 0 && (
                  <div className="space-y-2 pt-1">
                    <span className="text-[11px] font-bold text-indigo-900 dark:text-indigo-200 block">
                      Seleccioná el grupo de hermanos correspondiente:
                    </span>
                    <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                      {gruposOpciones.map((grupo) => {
                        const seleccionado = grupoPreseleccionado?.key === grupo.key;
                        return (
                          <button
                            key={grupo.key}
                            type="button"
                            onClick={() => setGrupoPreseleccionado(grupo)}
                            className={`w-full text-left p-2.5 rounded-xl border transition cursor-pointer space-y-1.5 ${
                              seleccionado
                                ? 'bg-indigo-100/90 dark:bg-indigo-950/90 border-indigo-500 ring-1 ring-indigo-500'
                                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-indigo-300'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-extrabold text-xs text-slate-900 dark:text-slate-100">
                                {grupo.esGrupoExistente
                                  ? `${grupo.nombreFamilia} (${grupo.integrantes.length} hermanos)`
                                  : `Nuevo grupo con ${grupo.representante.nombre} ${grupo.representante.apellido}`}
                              </span>
                              {seleccionado && (
                                <CheckCircle2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                              )}
                            </div>

                            <div className="flex flex-wrap gap-1">
                              {grupo.integrantes.map((m) => (
                                <span
                                  key={m.id}
                                  className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-900 text-[11px] font-semibold text-slate-700 dark:text-slate-300"
                                >
                                  {m.nombre} {m.apellido} (DNI {m.dni} • {m.ramaNombre})
                                </span>
                              ))}
                            </div>

                            {(grupo.madreNombre || grupo.padreNombre || grupo.domicilio) && (
                              <div className="text-[10px] text-slate-500 dark:text-slate-400 flex flex-wrap gap-x-2.5">
                                {grupo.madreNombre && <span>Madre: {grupo.madreNombre}</span>}
                                {grupo.padreNombre && <span>Padre: {grupo.padreNombre}</span>}
                                {grupo.domicilio && (
                                  <span className="inline-flex items-center gap-0.5">
                                    <MapPin className="w-2.5 h-2.5" />
                                    {grupo.domicilio}
                                  </span>
                                )}
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {grupoPreseleccionado && (
                      <button
                        type="button"
                        onClick={() => handleConfirmarAdhesionGrupo(grupoPreseleccionado)}
                        className="w-full min-h-[40px] px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer shadow-2xs"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Confirmar adhesión al grupo familiar</span>
                      </button>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="p-3 bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-800 rounded-xl flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <div className="min-w-0">
                    <span className="font-bold text-slate-900 dark:text-slate-100 block truncate">
                      Adherido a {grupoConfirmado.nombreFamilia}
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block truncate">
                      Hermanos:{' '}
                      {grupoConfirmado.integrantes.map((i) => `${i.nombre} ${i.apellido}`).join(', ')}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setGrupoConfirmado(null)}
                  className="px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 text-rose-700 dark:text-rose-300 font-bold text-[11px] shrink-0 cursor-pointer"
                >
                  Quitar
                </button>
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
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Teléfono del Miembro</label>
              <input
                type="tel"
                inputMode="tel"
                value={telefonoContacto}
                onChange={(e) => setTelefonoContacto(e.target.value)}
                placeholder="Ej. 351 456 7890"
                className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:border-emerald-500 outline-none"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Email</label>
              <input
                type="email"
                value={emailContacto}
                onChange={(e) => setEmailContacto(e.target.value)}
                placeholder="correo@ejemplo.com"
                className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:border-emerald-500 outline-none"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Nombre y Apellido Madre</label>
              <input
                type="text"
                value={madreNombres}
                onChange={(e) => setMadreNombres(e.target.value)}
                placeholder="Opcional"
                className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:border-emerald-500 outline-none"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Teléfono Madre</label>
              <input
                type="tel"
                inputMode="tel"
                value={madreTelefono}
                onChange={(e) => setMadreTelefono(e.target.value)}
                placeholder="Opcional"
                className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:border-emerald-500 outline-none"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Nombre y Apellido Padre</label>
              <input
                type="text"
                value={padreNombres}
                onChange={(e) => setPadreNombres(e.target.value)}
                placeholder="Opcional"
                className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:border-emerald-500 outline-none"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Teléfono Padre</label>
              <input
                type="tel"
                inputMode="tel"
                value={padreTelefono}
                onChange={(e) => setPadreTelefono(e.target.value)}
                placeholder="Opcional"
                className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:border-emerald-500 outline-none"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Nombre y Apellido Tutor/a</label>
              <input
                type="text"
                value={tutorNombres}
                onChange={(e) => setTutorNombres(e.target.value)}
                placeholder="Opcional (si aplica)"
                className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:border-emerald-500 outline-none"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Teléfono Tutor/a</label>
              <input
                type="tel"
                inputMode="tel"
                value={tutorTelefono}
                onChange={(e) => setTutorTelefono(e.target.value)}
                placeholder="Opcional (si aplica)"
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
