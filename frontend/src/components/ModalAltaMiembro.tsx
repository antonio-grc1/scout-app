import React, { useEffect, useState, useMemo } from 'react';
import { esDniValido } from '../lib/formValidation';
import { obtenerHoyLocalISO, traducirErrorAmigable } from '../lib/formatters';
import { useModalOverlay } from '../hooks/useModalOverlay';
import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';
import {
  agruparCandidatosPorFamilia,
  esRolDeProtagonista,
  type OpcionGrupoHermanos,
} from '../lib/formatters';
import {
  esUnidadRama,
  filtrarRolesAsignablesPorAlcance,
} from '../lib/permisos';
import {
  X,
  UserPlus,
  Search,
  CheckCircle2,
  AlertCircle,
  Users,
  Loader2,
  MapPin,
  Copy,
  Check,
  Mail,
} from 'lucide-react';
import { Button, Input, Select } from './ui';

interface Props {
  abierto: boolean;
  embedded?: boolean;
  onCerrar: () => void;
  onCreado: () => void;
  unidadesDisponibles: any[];
  rolesDisponibles: any[];
}

export const ModalAltaMiembro: React.FC<Props> = ({
  abierto,
  embedded = false,
  onCerrar,
  onCreado,
  unidadesDisponibles,
  rolesDisponibles,
}) => {
  const { tienePermisoGlobal, obtenerUnidadesConPermiso, asignaciones } = useAuthStore();
  const esGlobal = tienePermisoGlobal('padron.editar');
  const unidadesCrearIds = useMemo(
    () => obtenerUnidadesConPermiso('padron.editar'),
    [obtenerUnidadesConPermiso, asignaciones],
  );
  const [dni, setDni] = useState('');
  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [fechaNacimiento, setFechaNacimiento] = useState('');
  const [fechaIngreso, setFechaIngreso] = useState(() => obtenerHoyLocalISO());
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
  const [tipoMiembro, setTipoMiembro] = useState<'PROTAGONISTA' | 'EDUCADOR'>('PROTAGONISTA');
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
  const [soloEnviarPorCorreo, setSoloEnviarPorCorreo] = useState(false);
  const [altaResultado, setAltaResultado] = useState<{
    nombreCompleto: string;
    dni: string;
    claveTemporal?: string;
    emailDestino?: string;
    emailEnviado?: boolean;
  } | null>(null);
  const [copiadaClave, setCopiadaClave] = useState(false);

  const cerrarModal = () => {
    setAltaResultado(null);
    setCopiadaClave(false);
    setSoloEnviarPorCorreo(false);
    setError(null);
    onCerrar();
  };

  const { backdropProps, contentProps } = useModalOverlay({
    abierto: !embedded && abierto,
    onCerrar: cerrarModal,
    bloqueado: cargando,
  });

  const unidadesPermitidas = useMemo(
    () =>
      esGlobal
        ? unidadesDisponibles
        : unidadesDisponibles.filter((u) => unidadesCrearIds.includes(u.id)),
    [unidadesDisponibles, esGlobal, unidadesCrearIds],
  );

  const rolesPermitidos = useMemo(
    () => filtrarRolesAsignablesPorAlcance(rolesDisponibles, unidadesPermitidas, esGlobal, asignaciones),
    [rolesDisponibles, unidadesPermitidas, esGlobal, asignaciones],
  );

  // A3: Cualquier rol asignable puede combinarse con cualquier unidad en alcance
  const rolesFiltrados = rolesPermitidos;
  const unidadesFiltradas = unidadesPermitidas;

  const handleCambioUnidad = (nuevaUnidadId: number) => {
    setUnidadId(nuevaUnidadId);
  };

  const handleCambioRol = (nuevoRolId: number) => {
    setRolId(nuevoRolId);
  };

  useEffect(() => {
    if (unidadesPermitidas.length > 0 && (!unidadId || !unidadesPermitidas.some((u) => u.id === Number(unidadId)))) {
      const primeraRama = unidadesPermitidas.find(esUnidadRama) || unidadesPermitidas[0];
      setUnidadId(primeraRama.id);
    }
    if (rolesPermitidos.length > 0 && (!rolId || !rolesPermitidos.some((r) => r.id === Number(rolId)))) {
      const prota = rolesPermitidos.find(esRolDeProtagonista) || rolesPermitidos[0];
      setRolId(prota.id);
    }
  }, [unidadesPermitidas, rolesPermitidos, unidadId, rolId]);

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
    const dom = comp.protagonista_domicilio || comp.domicilio;
    if (dom) setDomicilio(dom);
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
    if (!esDniValido(dni)) {
      setError('Ingresá un DNI válido (7 a 9 números).');
      return;
    }
    if (fechaNacimiento && fechaNacimiento > new Date().toISOString().slice(0, 10)) {
      setError('La fecha de nacimiento no puede ser futura.');
      return;
    }
    if (!rolId || !unidadId) {
      setError('Debe seleccionar una unidad y el rol asignado en el sistema.');
      return;
    }

    setCargando(true);
    setError(null);

    try {
      const res = await api.post('/miembros', {
        dni: dni.trim(),
        nombre: nombre.trim(),
        apellido: apellido.trim(),
        fechaNacimiento,
        fechaIngreso: fechaIngreso || undefined,
        tipoMiembro,
        emailContacto: emailContacto.trim() || undefined,
        telefonoContacto: telefonoContacto.trim() || undefined,
        unidadId: Number(unidadId),
        rolId: Number(rolId),
        hermanoDni: grupoConfirmado?.representante?.dni || undefined,
        copiarDatosHermano: Boolean(grupoConfirmado),
        soloEnviarPorCorreo: Boolean(soloEnviarPorCorreo && emailContacto.trim()),
        datosFijosJson: {
          protagonista_domicilio: domicilio.trim() || undefined,
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
      const claveTemporal: string | undefined = res.data?.claveTemporal;
      const emailEnviado = Boolean(res.data?.emailEnviado);
      const emailDestino: string | undefined = res.data?.emailDestino;
      if (claveTemporal || emailEnviado) {
        setAltaResultado({
          nombreCompleto: `${nombre.trim()} ${apellido.trim()}`,
          dni: dni.trim(),
          claveTemporal,
          emailDestino,
          emailEnviado,
        });
      } else {
        cerrarModal();
      }
    } catch (err: any) {
      setError(traducirErrorAmigable(err, 'No se pudo crear el miembro.'));
    } finally {
      setCargando(false);
    }
  };

  const cuerpo = altaResultado ? (
    <div className={embedded ? 'space-y-4 text-sm' : 'p-5 sm:p-6 space-y-4 text-sm'}>
            <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 space-y-2">
              <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 font-bold text-sm">
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                <span>Miembro registrado correctamente</span>
              </div>
              <p className="text-ink-2">
                {altaResultado.claveTemporal ? (
                  <>
                    Entregá esta contraseña temporal a <strong>{altaResultado.nombreCompleto}</strong>{' '}
                    (DNI <strong>{altaResultado.dni}</strong>). Al ingresar por primera vez el
                    sistema le pedirá elegir una contraseña propia.
                    {altaResultado.emailEnviado && altaResultado.emailDestino && (
                      <>
                        {' '}
                        También se envió por correo a{' '}
                        <strong>{altaResultado.emailDestino}</strong>.
                      </>
                    )}
                  </>
                ) : (
                  <>
                    Se generó una contraseña temporal para{' '}
                    <strong>{altaResultado.nombreCompleto}</strong> (DNI{' '}
                    <strong>{altaResultado.dni}</strong>) y se envió únicamente por correo a{' '}
                    <strong>{altaResultado.emailDestino}</strong>. Al ingresar por primera vez el
                    sistema le pedirá elegir una contraseña propia.
                  </>
                )}
              </p>
            </div>

            {altaResultado.claveTemporal && (
              <div className="p-4 rounded-2xl bg-paper-2 border border-rule flex items-center justify-between gap-3">
                <div>
                  <span className="block text-xs font-semibold text-ink-muted">
                    Contraseña temporal generada (se muestra una única vez):
                  </span>
                  <code className="text-base font-mono font-extrabold text-ink select-all">
                    {altaResultado.claveTemporal}
                  </code>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    if (!altaResultado.claveTemporal) return;
                    try {
                      await navigator.clipboard.writeText(altaResultado.claveTemporal);
                      setCopiadaClave(true);
                      setTimeout(() => setCopiadaClave(false), 2000);
                    } catch {
                      // Clipboard no disponible
                    }
                  }}
                  className="min-h-[40px] px-3.5 rounded-xl border border-rule bg-surface hover:bg-paper-3 text-ink font-bold inline-flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  {copiadaClave ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  <span>{copiadaClave ? 'Copiada' : 'Copiar contraseña'}</span>
                </button>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={cerrarModal}
                className="min-h-[44px] px-5 py-2.5 rounded-xl bg-brand text-brand-contrast font-bold text-sm cursor-pointer"
              >
                Listo
              </button>
            </div>
          </div>
        ) : (
        <form
          onSubmit={handleSubmit}
          className={embedded ? 'space-y-4 text-[13px]' : 'p-4 sm:p-6 space-y-4 text-[13px] overflow-y-auto flex-1'}
        >
          {error && (
            <div role="alert" className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 rounded-xl flex items-center gap-2 text-xs font-medium">
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
                    className="w-full min-h-[44px] pl-9 pr-9 py-2.5 rounded-xl border border-rule text-base sm:text-[15px] bg-surface text-ink placeholder:text-ink-muted outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-colors"
                  />
                  {buscandoHermano && (
                    <Loader2 className="w-4 h-4 text-brand animate-spin absolute right-3 top-1/2 -translate-y-1/2" />
                  )}
                </div>

                {dniHermano.trim().length >= 2 && !buscandoHermano && gruposOpciones.length === 0 && (
                  <p className="text-xs text-ink-muted px-1">
                    No se encontraron coincidencias para "{dniHermano.trim()}".
                  </p>
                )}

                {gruposOpciones.length > 0 && (
                  <div className="space-y-2 pt-1">
                    <span className="text-xs font-bold text-ink block">
                      Seleccioná el grupo de hermanos correspondiente:
                    </span>
                    <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                      {gruposOpciones.map((grupo) => {
                        const seleccionado = grupoPreseleccionado?.key === grupo.key;
                        return (
                          <button
                            aria-pressed={seleccionado}
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
                                  className="px-2 py-0.5 rounded-md bg-paper-3 text-xs font-semibold text-ink-2"
                                >
                                  {m.nombre} {m.apellido} (DNI {m.dni} • {m.ramaNombre})
                                </span>
                              ))}
                            </div>

                            {(grupo.madreNombre || grupo.padreNombre || grupo.domicilio) && (
                              <div className="text-xs text-ink-muted flex flex-wrap gap-x-2.5">
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
                        className="w-full min-h-[42px] px-4 py-2 rounded-xl bg-brand hover:opacity-90 text-brand-contrast font-bold text-[13px] flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
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
                    <span className="text-xs text-ink-muted block truncate">
                      Hermanos:{' '}
                      {grupoConfirmado.integrantes.map((i) => `${i.nombre} ${i.apellido}`).join(', ')}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setGrupoConfirmado(null)}
                  className="px-3 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 font-bold text-xs shrink-0 cursor-pointer transition-colors"
                >
                  Quitar
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <Input
              label="DNI"
              type="text"
              inputMode="numeric"
              required
              placeholder="Sin puntos"
              value={dni}
              onChange={(e) => setDni(e.target.value.replace(/\D/g, ''))}
            />
            <Input
              label="Fecha de nacimiento"
              type="date"
              max={new Date().toISOString().slice(0, 10)}
              required
              value={fechaNacimiento}
              onChange={(e) => setFechaNacimiento(e.target.value)}
            />
            <Input
              label="Nombre"
              type="text"
              required
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />
            <Input
              label="Apellido"
              type="text"
              required
              value={apellido}
              onChange={(e) => setApellido(e.target.value)}
            />
          </div>

          {/* Categoría Scout en el grupo (independiente del rol de permisos) */}
          <div className="space-y-1.5">
            <label className="block font-semibold text-ink-2">Categoría en el grupo *</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {(
                [
                  {
                    id: 'PROTAGONISTA' as const,
                    titulo: 'Protagonista / beneficiario',
                    desc: 'Utiliza ficha y cobros de beneficiario.',
                  },
                  {
                    id: 'EDUCADOR' as const,
                    titulo: 'Educador / adulto',
                    desc: 'Adulto, dirigente o colaborador con ficha y cuotas de educador.',
                  },
                ] as const
              ).map((cat) => {
                const activo = tipoMiembro === cat.id;
                return (
                  <button
                    aria-pressed={activo}
                    key={cat.id}
                    type="button"
                    onClick={() => setTipoMiembro(cat.id)}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                      activo
                        ? 'border-brand bg-brand/10 ring-1 ring-brand/40'
                        : 'border-rule bg-surface hover:bg-paper-2'
                    }`}
                  >
                    <span className="font-bold text-ink block text-xs sm:text-[13px]">
                      {cat.titulo}
                    </span>
                    <span className="text-xs text-ink-muted block mt-0.5 leading-snug">
                      {cat.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <Select
              label="Rama / sección"
              required
              value={unidadId}
              onChange={(e) => handleCambioUnidad(Number(e.target.value))}
            >
              {unidadesFiltradas.some(esUnidadRama) && (
                <optgroup label="Ramas del grupo">
                  {unidadesFiltradas.filter(esUnidadRama).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nombre}
                    </option>
                  ))}
                </optgroup>
              )}
              {unidadesFiltradas.some((u) => !esUnidadRama(u)) && (
                <optgroup label="Adultos y equipo">
                  {unidadesFiltradas.filter((u) => !esUnidadRama(u)).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nombre}
                    </option>
                  ))}
                </optgroup>
              )}
            </Select>
            <Select
              label="Rol y permisos"
              required
              value={rolId}
              onChange={(e) => handleCambioRol(Number(e.target.value))}
            >
              {rolesFiltrados.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nombre}
                </option>
              ))}
            </Select>
            <Input
              label="Fecha de ingreso al grupo"
              type="date"
              value={fechaIngreso}
              onChange={(e) => setFechaIngreso(e.target.value)}
              helperText="Las cuotas mensuales se le cobran desde este mes."
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <Input
              label="Teléfono del miembro"
              type="tel"
              inputMode="tel"
              value={telefonoContacto}
              onChange={(e) => setTelefonoContacto(e.target.value)}
              placeholder="Ej. 351 456 7890"
            />
            <div>
              <Input
                label="Email"
                type="email"
                value={emailContacto}
                onChange={(e) => {
                  const next = e.target.value;
                  setEmailContacto(next);
                  if (!next.trim()) setSoloEnviarPorCorreo(false);
                }}
                placeholder="correo@ejemplo.com"
              />
              {emailContacto.trim() && (
                <label className="mt-2 flex items-start gap-2 text-xs text-ink-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={soloEnviarPorCorreo}
                    onChange={(e) => setSoloEnviarPorCorreo(e.target.checked)}
                    className="mt-0.5 rounded border-rule text-brand focus:ring-brand/30"
                  />
                  <span className="inline-flex items-center gap-1 leading-snug">
                    <Mail className="w-3.5 h-3.5 text-brand shrink-0" />
                    Enviar credenciales solo por correo (no mostrar contraseña en pantalla)
                  </span>
                </label>
              )}
            </div>

            <Input

              label="Nombre y apellido madre"

              type="text"

              value={madreNombres}

              onChange={(e) => setMadreNombres(e.target.value)}

              placeholder="Opcional"

            />
            <Input
              label="Teléfono madre"
              type="tel"
              inputMode="tel"
              value={madreTelefono}
              onChange={(e) => setMadreTelefono(e.target.value)}
              placeholder="Opcional"
            />

            <Input

              label="Nombre y apellido padre"

              type="text"

              value={padreNombres}

              onChange={(e) => setPadreNombres(e.target.value)}

              placeholder="Opcional"

            />
            <Input
              label="Teléfono padre"
              type="tel"
              inputMode="tel"
              value={padreTelefono}
              onChange={(e) => setPadreTelefono(e.target.value)}
              placeholder="Opcional"
            />

            <Input

              label="Nombre y apellido tutor/a"

              type="text"

              value={tutorNombres}

              onChange={(e) => setTutorNombres(e.target.value)}

              placeholder="Opcional (si aplica)"

            />
            <Input
              label="Teléfono tutor/a"
              type="tel"
              inputMode="tel"
              value={tutorTelefono}
              onChange={(e) => setTutorTelefono(e.target.value)}
              placeholder="Opcional (si aplica)"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <Input
              label="Domicilio"
              type="text"
              value={domicilio}
              onChange={(e) => setDomicilio(e.target.value)}
              placeholder="Calle y número"
            />
            <Input
              label="Obra social / prepaga"
              type="text"
              value={obraSocial}
              onChange={(e) => setObraSocial(e.target.value)}
              placeholder="Opcional"
            />
          </div>

          <div className="flex justify-end gap-2.5 pt-3 border-t border-rule">
            <Button type="button" variant="secondary" onClick={cerrarModal}>
              Cancelar
            </Button>
            <Button type="submit" loading={cargando} loadingText="Guardando...">
              Guardar miembro
            </Button>
          </div>
        </form>
  );

  if (embedded) return cuerpo;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4 motion-safe:animate-in motion-safe:fade-in motion-reduce:animate-none"
      {...backdropProps}
    >
      <div
        className="bg-surface border border-rule rounded-t-3xl sm:rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[92dvh] transition-colors text-ink"
        {...contentProps}
      >
        {/* Cabecera */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-rule shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-brand/15 text-brand">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-ink text-lg">Nuevo miembro</h3>
              <span className="text-[13px] text-ink-muted">
                Alta en padrón con credencial temporal
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={cerrarModal}
            aria-label="Cerrar modal"
            className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center p-1.5 rounded-xl text-ink-muted hover:text-ink hover:bg-paper-2 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {cuerpo}
      </div>
    </div>
  );
};
