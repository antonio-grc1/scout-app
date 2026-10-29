import React, { useEffect, useState, useMemo } from 'react';
import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';
import {
  agruparCandidatosPorFamilia,
  esRolAlcanceGlobal,
  esRolDeProtagonista,
  rolRequiereRama,
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
  const esUnidadJefatura = (u: any) => u?.tipo === 'JEFATURA';
  const esUnidadSinRama = (u: any) => u?.tipo === 'SIN_RAMA_APOYO';

  const esRolJefe = (r: any) => !rolRequiereRama(r) && esRolAlcanceGlobal(r);
  const esRolSinRama = (r: any) => !rolRequiereRama(r) && !esRolAlcanceGlobal(r);
  const esRolRama = (r: any) => rolRequiereRama(r);

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
      list = list.filter((r) => !esRolAlcanceGlobal(r));
    }
    if (unidadSeleccionada) {
      if (esUnidadRama(unidadSeleccionada)) {
        const deRama = list.filter(esRolRama);
        return deRama.length > 0 ? deRama : list;
      }
      if (esUnidadSinRama(unidadSeleccionada)) {
        const sinRama = list.filter((r) => !rolRequiereRama(r));
        return sinRama.length > 0 ? sinRama : list;
      }
      if (esUnidadJefatura(unidadSeleccionada)) {
        const jefe = list.filter(esRolJefe);
        return jefe.length > 0 ? jefe : list.filter((r) => !rolRequiereRama(r));
      }
    }
    return list;
  }, [rolesDisponibles, unidadSeleccionada, tieneGlobal]);

  const unidadesFiltradas = useMemo(() => {
    if (rolSeleccionado) {
      if (!rolRequiereRama(rolSeleccionado)) {
        if (esRolAlcanceGlobal(rolSeleccionado)) {
          const uJef = unidadesDisponibles.filter(esUnidadJefatura);
          if (uJef.length > 0) return uJef;
        }
        const uSin = unidadesDisponibles.filter((u) => !esUnidadRama(u));
        if (uSin.length > 0) return uSin;
      } else {
        const uRama = unidadesDisponibles.filter(esUnidadRama);
        if (uRama.length > 0) return uRama;
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
      if (!rActual || !rolRequiereRama(rActual)) {
        const prota =
          rolesDisponibles.find((r) => esRolDeProtagonista(r) && rolRequiereRama(r)) ||
          rolesDisponibles.find(esRolRama);
        if (prota) setRolId(prota.id);
      }
    } else if (esUnidadSinRama(u)) {
      const rSinRama = rolesDisponibles.find(esRolSinRama) || rolesDisponibles.find((r) => !rolRequiereRama(r));
      if (rSinRama) setRolId(rSinRama.id);
    } else if (esUnidadJefatura(u)) {
      const rJefe = rolesDisponibles.find(esRolJefe) || rolesDisponibles.find((r) => !rolRequiereRama(r));
      if (rJefe) setRolId(rJefe.id);
    }
  };

  const handleCambioRol = (nuevoRolId: number) => {
    setRolId(nuevoRolId);
    const r = rolesDisponibles.find((x) => x.id === nuevoRolId);
    if (!r) return;

    if (!rolRequiereRama(r)) {
      if (esRolAlcanceGlobal(r)) {
        const uJefatura = unidadesDisponibles.find(esUnidadJefatura) || unidadesDisponibles.find((u) => !esUnidadRama(u));
        setUnidadId(uJefatura ? uJefatura.id : '');
      } else {
        const uSinRama = unidadesDisponibles.find(esUnidadSinRama) || unidadesDisponibles.find((u) => !esUnidadRama(u));
        setUnidadId(uSinRama ? uSinRama.id : '');
      }
    } else {
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
      const prota =
        rolesDisponibles.find((r) => esRolDeProtagonista(r) && rolRequiereRama(r)) ||
        rolesDisponibles[0];
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
    if (!rolId || (rolRequiereRama(rolSeleccionado) && !unidadId)) {
      setError('Debe seleccionar una función y, si corresponde, su rama asignada.');
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
        unidadId: unidadId ? Number(unidadId) : undefined,
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
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4 motion-safe:animate-in motion-safe:fade-in motion-reduce:animate-none">
      <div className="bg-surface border-t sm:border border-rule rounded-t-3xl sm:rounded-2xl w-full max-w-xl max-h-[92vh] overflow-hidden shadow-2xl flex flex-col transition-colors">
        <div className="p-4 sm:p-5 border-b border-rule flex items-center justify-between bg-paper-2 shrink-0">
          <div className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-brand" />
            <h3 className="font-bold text-ink text-base">Nuevo Miembro</h3>
          </div>
          <button
            onClick={onCerrar}
            className="w-10 h-10 rounded-xl flex items-center justify-center text-ink-muted hover:text-ink hover:bg-paper-3 transition cursor-pointer"
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
          <div className="p-3.5 bg-brand/10 border border-brand/30 rounded-2xl space-y-2.5">
            <span className="font-extrabold text-ink flex items-center gap-1.5 text-xs">
              <Users className="w-4 h-4 text-brand" />
              ¿Tiene hermanos/as ya inscriptos? Buscá por DNI, Nombre o Apellido:
            </span>

            {!grupoConfirmado ? (
              <>
                <div className="relative">
                  <Search className="w-4 h-4 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Escribí DNI, nombre o apellido para ver los grupos de hermanos..."
                    value={dniHermano}
                    onChange={(e) => setDniHermano(e.target.value)}
                    className="w-full min-h-[42px] pl-9 pr-9 py-2 rounded-xl border border-rule text-xs bg-surface text-ink placeholder:text-ink-muted outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-colors"
                  />
                  {buscandoHermano && (
                    <Loader2 className="w-4 h-4 text-brand animate-spin absolute right-3 top-1/2 -translate-y-1/2" />
                  )}
                </div>

                {dniHermano.trim().length >= 2 && !buscandoHermano && gruposOpciones.length === 0 && (
                  <p className="text-[11px] text-ink-muted px-1">
                    No se encontraron coincidencias para "{dniHermano.trim()}".
                  </p>
                )}

                {gruposOpciones.length > 0 && (
                  <div className="space-y-2 pt-1">
                    <span className="text-[11px] font-bold text-ink block">
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
                                ? 'bg-brand/15 border-brand ring-1 ring-brand'
                                : 'bg-surface border-rule hover:border-brand'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-extrabold text-xs text-ink">
                                {grupo.esGrupoExistente
                                  ? `${grupo.nombreFamilia} (${grupo.integrantes.length} hermanos)`
                                  : `Nuevo grupo con ${grupo.representante.nombre} ${grupo.representante.apellido}`}
                              </span>
                              {seleccionado && (
                                <CheckCircle2 className="w-4 h-4 text-brand shrink-0" />
                              )}
                            </div>

                            <div className="flex flex-wrap gap-1">
                              {grupo.integrantes.map((m) => (
                                <span
                                  key={m.id}
                                  className="px-2 py-0.5 rounded-md bg-paper-3 text-[11px] font-semibold text-ink-2"
                                >
                                  {m.nombre} {m.apellido} (DNI {m.dni} • {m.ramaNombre})
                                </span>
                              ))}
                            </div>

                            {(grupo.madreNombre || grupo.padreNombre || grupo.domicilio) && (
                              <div className="text-[10px] text-ink-muted flex flex-wrap gap-x-2.5">
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
                        className="w-full min-h-[40px] px-4 py-2 rounded-xl bg-brand hover:opacity-90 text-brand-contrast font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-2xs whitespace-nowrap"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span className="whitespace-nowrap">Confirmar adhesión al grupo familiar</span>
                      </button>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="p-3 bg-surface border border-brand/40 rounded-xl flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <CheckCircle2 className="w-4 h-4 text-brand shrink-0" />
                  <div className="min-w-0">
                    <span className="font-bold text-ink block truncate">
                      Adherido a {grupoConfirmado.nombreFamilia}
                    </span>
                    <span className="text-[11px] text-ink-muted block truncate">
                      Hermanos:{' '}
                      {grupoConfirmado.integrantes.map((i) => `${i.nombre} ${i.apellido}`).join(', ')}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setGrupoConfirmado(null)}
                  className="px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 font-bold text-[11px] shrink-0 cursor-pointer transition-colors"
                >
                  Quitar
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block font-semibold text-ink-2 mb-1">DNI *</label>
              <input
                type="text"
                inputMode="numeric"
                required
                placeholder="Sin puntos"
                value={dni}
                onChange={(e) => setDni(e.target.value.replace(/\D/g, ''))}
                className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-rule bg-surface text-ink text-sm focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block font-semibold text-ink-2 mb-1">Fecha de Nacimiento *</label>
              <input
                type="date"
                required
                value={fechaNacimiento}
                onChange={(e) => setFechaNacimiento(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-rule bg-surface text-ink text-sm focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block font-semibold text-ink-2 mb-1">Nombre *</label>
              <input
                type="text"
                required
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-rule bg-surface text-ink text-sm focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block font-semibold text-ink-2 mb-1">Apellido *</label>
              <input
                type="text"
                required
                value={apellido}
                onChange={(e) => setApellido(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-rule bg-surface text-ink text-sm focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none transition-colors"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block font-semibold text-ink-2 mb-1">Rama / Sección *</label>
              <select
                value={unidadId}
                onChange={(e) => handleCambioUnidad(Number(e.target.value))}
                className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-rule text-sm focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none transition-colors bg-surface text-ink"
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
              <label className="block font-semibold text-ink-2 mb-1">Función en el Grupo *</label>
              <select
                value={rolId}
                onChange={(e) => handleCambioRol(Number(e.target.value))}
                className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-rule text-sm focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none transition-colors bg-surface text-ink"
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
              <label className="block font-semibold text-ink-2 mb-1">Teléfono del Miembro</label>
              <input
                type="tel"
                inputMode="tel"
                value={telefonoContacto}
                onChange={(e) => setTelefonoContacto(e.target.value)}
                placeholder="Ej. 351 456 7890"
                className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-rule bg-surface text-ink text-sm focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block font-semibold text-ink-2 mb-1">Email</label>
              <input
                type="email"
                value={emailContacto}
                onChange={(e) => setEmailContacto(e.target.value)}
                placeholder="correo@ejemplo.com"
                className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-rule bg-surface text-ink text-sm focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none transition-colors"
              />
            </div>

            <div>
              <label className="block font-semibold text-ink-2 mb-1">Nombre y Apellido Madre</label>
              <input
                type="text"
                value={madreNombres}
                onChange={(e) => setMadreNombres(e.target.value)}
                placeholder="Opcional"
                className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-rule bg-surface text-ink text-sm focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block font-semibold text-ink-2 mb-1">Teléfono Madre</label>
              <input
                type="tel"
                inputMode="tel"
                value={madreTelefono}
                onChange={(e) => setMadreTelefono(e.target.value)}
                placeholder="Opcional"
                className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-rule bg-surface text-ink text-sm focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none transition-colors"
              />
            </div>

            <div>
              <label className="block font-semibold text-ink-2 mb-1">Nombre y Apellido Padre</label>
              <input
                type="text"
                value={padreNombres}
                onChange={(e) => setPadreNombres(e.target.value)}
                placeholder="Opcional"
                className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-rule bg-surface text-ink text-sm focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block font-semibold text-ink-2 mb-1">Teléfono Padre</label>
              <input
                type="tel"
                inputMode="tel"
                value={padreTelefono}
                onChange={(e) => setPadreTelefono(e.target.value)}
                placeholder="Opcional"
                className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-rule bg-surface text-ink text-sm focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none transition-colors"
              />
            </div>

            <div>
              <label className="block font-semibold text-ink-2 mb-1">Nombre y Apellido Tutor/a</label>
              <input
                type="text"
                value={tutorNombres}
                onChange={(e) => setTutorNombres(e.target.value)}
                placeholder="Opcional (si aplica)"
                className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-rule bg-surface text-ink text-sm focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block font-semibold text-ink-2 mb-1">Teléfono Tutor/a</label>
              <input
                type="tel"
                inputMode="tel"
                value={tutorTelefono}
                onChange={(e) => setTutorTelefono(e.target.value)}
                placeholder="Opcional (si aplica)"
                className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-rule bg-surface text-ink text-sm focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none transition-colors"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block font-semibold text-ink-2 mb-1">Domicilio</label>
              <input
                type="text"
                value={domicilio}
                onChange={(e) => setDomicilio(e.target.value)}
                placeholder="Calle y número"
                className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-rule bg-surface text-ink text-sm focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block font-semibold text-ink-2 mb-1">Obra Social / Prepaga</label>
              <input
                type="text"
                value={obraSocial}
                onChange={(e) => setObraSocial(e.target.value)}
                placeholder="Opcional"
                className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-rule bg-surface text-ink text-sm focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none transition-colors"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2.5 pt-3 border-t border-rule">
            <button
              type="button"
              onClick={onCerrar}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-rule text-ink-2 font-bold text-xs hover:bg-paper-2 transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={cargando}
              className="min-h-[44px] px-5 py-2 rounded-xl bg-brand hover:opacity-90 active:opacity-100 text-brand-contrast font-bold text-xs shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              {cargando ? 'Guardando...' : 'Guardar Miembro'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
