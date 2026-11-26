import React, { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  BellRing,
  Loader2,
  Mail,
  Search,
  Tent,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { api } from '../../api/client';
import { useCapabilities } from '../../core/capabilities';
import { useCanalesAvisosEstado } from '../../hooks/useAvisos';
import { invalidarCampamentosQueries } from '../../hooks/useCampamentos';
import {
  normalizarTextoBusqueda,
  obtenerCicloAnioActual,
  obtenerHoyLocalISO,
  traducirErrorAmigable,
} from '../../lib/formatters';
import { filtrarUnidadesPorAlcance } from '../../lib/permisos';
import {
  crearCampamento,
  editarCampamento,
  type CampamentoGestionItem,
  type DestinatarioCampamentoTipo,
  type EstadoCampamento,
} from '../../services/campamentos.service';
import { useAuthStore } from '../../store/authStore';
import { useToastStore } from '../../store/toastStore';
import { Drawer } from '../../components/ui/Drawer';
import { Input, Select, Textarea } from '../../components/ui/Input';

interface MiembroResumen {
  id: number;
  nombre: string;
  apellido: string;
  dni: string;
}

interface RubroItem {
  id: number;
  nombre: string;
}

interface ModalCampamentoProps {
  abierto: boolean;
  campamentoAEditar?: CampamentoGestionItem | null;
  unidades: Array<{ id: number; nombre: string }>;
  onCerrar: () => void;
}

export const ModalCampamento: React.FC<ModalCampamentoProps> = ({
  abierto,
  campamentoAEditar = null,
  unidades,
  onCerrar,
}) => {
  const queryClient = useQueryClient();
  const caps = useCapabilities();
  const asignaciones = useAuthStore((s) => s.asignaciones);
  const tienePermisoGlobal = useAuthStore((s) => s.tienePermisoGlobal);
  const obtenerUnidadesConPermiso = useAuthStore((s) => s.obtenerUnidadesConPermiso);
  const mostrarToast = useToastStore((s) => s.mostrarToast);
  const { data: canales } = useCanalesAvisosEstado(abierto);

  const esGlobal = tienePermisoGlobal('campamentos.editar');
  const unidadesCampIds = useMemo(
    () => obtenerUnidadesConPermiso('campamentos.editar'),
    [asignaciones, obtenerUnidadesConPermiso],
  );
  const unidadesBase = useMemo(() => {
    if (unidades.length > 0) return unidades;
    return caps.unidadesAsignadas.map((u) => ({ id: u.id, nombre: u.nombre }));
  }, [unidades, caps.unidadesAsignadas]);

  const unidadesPermitidas = useMemo(
    () =>
      esGlobal
        ? unidadesBase
        : filtrarUnidadesPorAlcance(unidadesBase, {
            esGlobal: false,
            asignaciones: unidadesCampIds.map((id) => ({
              alcance: 'UNIDAD' as const,
              unidadId: id,
            })),
          }),
    [unidadesBase, esGlobal, unidadesCampIds],
  );

  const [rubros, setRubros] = useState<RubroItem[]>([]);
  const [titulo, setTitulo] = useState('');
  const [lugar, setLugar] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [fechaLimite, setFechaLimite] = useState('');
  const [estado, setEstado] = useState<EstadoCampamento>('PUBLICADO');
  const [costoBase, setCostoBase] = useState<string>('0');
  const [rubroId, setRubroId] = useState<number | null>(null);
  const [permiteDescuentoHermanos, setPermiteDescuentoHermanos] = useState(true);
  const [usarPorcentajePersonalizado, setUsarPorcentajePersonalizado] = useState(false);
  const [porcentajeDescuento, setPorcentajeDescuento] = useState<string>('');
  const [destinatarioTipo, setDestinatarioTipo] =
    useState<DestinatarioCampamentoTipo>('PROTAGONISTAS');
  const [todoElGrupo, setTodoElGrupo] = useState(false);
  const [unidadesIds, setUnidadesIds] = useState<number[]>([]);
  const [filtroUnidadBusqueda, setFiltroUnidadBusqueda] = useState<number | null>(null);
  const [usuariosSeleccionados, setUsuariosSeleccionados] = useState<MiembroResumen[]>([]);

  const [notificarAviso, setNotificarAviso] = useState(false);
  const [notificarPush, setNotificarPush] = useState(true);
  const [notificarEmail, setNotificarEmail] = useState(false);

  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState<MiembroResumen[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState<string | null>(null);

  const esEdicion = Boolean(campamentoAEditar?.id);
  const pushHabilitado = Boolean(canales?.pushHabilitado);
  const emailHabilitado = Boolean(canales?.emailHabilitado);

  useEffect(() => {
    if (!abierto) return;
    api
      .get('/tesoreria/rubros?tipo=INGRESO')
      .then((r) => setRubros(Array.isArray(r.data) ? r.data : []))
      .catch(() => setRubros([]));

    if (campamentoAEditar) {
      setTitulo(campamentoAEditar.titulo);
      setLugar(campamentoAEditar.lugar);
      setDescripcion(campamentoAEditar.descripcion ?? '');
      setFechaInicio(String(campamentoAEditar.fechaInicio).slice(0, 10));
      setFechaFin(String(campamentoAEditar.fechaFin).slice(0, 10));
      setFechaLimite(
        campamentoAEditar.fechaLimiteConfirmacion
          ? String(campamentoAEditar.fechaLimiteConfirmacion).slice(0, 10)
          : '',
      );
      setEstado(campamentoAEditar.estado);
      setCostoBase(String(campamentoAEditar.costoBase ?? 0));
      setRubroId(campamentoAEditar.rubroId ?? null);
      setPermiteDescuentoHermanos(campamentoAEditar.permiteDescuentoHermanos ?? true);
      if (
        campamentoAEditar.porcentajeDescuentoHermanos !== null &&
        campamentoAEditar.porcentajeDescuentoHermanos !== undefined
      ) {
        setUsarPorcentajePersonalizado(true);
        setPorcentajeDescuento(String(campamentoAEditar.porcentajeDescuentoHermanos));
      } else {
        setUsarPorcentajePersonalizado(false);
        setPorcentajeDescuento('');
      }
      setDestinatarioTipo(campamentoAEditar.destinatarioTipo);
      const idsInit =
        campamentoAEditar.unidadesIds?.length > 0
          ? campamentoAEditar.unidadesIds
          : campamentoAEditar.unidadId != null
            ? [campamentoAEditar.unidadId]
            : [];
      setUnidadesIds(idsInit);
      setTodoElGrupo(
        campamentoAEditar.destinatarioTipo !== 'USUARIOS' && idsInit.length === 0 && esGlobal,
      );
      setFiltroUnidadBusqueda(idsInit.length === 1 ? idsInit[0] : null);
      setUsuariosSeleccionados(campamentoAEditar.usuariosInvitados ?? []);
      setNotificarAviso(false);
    } else {
      const hoy = obtenerHoyLocalISO();
      setTitulo('');
      setLugar('');
      setDescripcion('');
      setFechaInicio(hoy);
      setFechaFin(hoy);
      setFechaLimite('');
      setEstado('PUBLICADO');
      setCostoBase('0');
      setRubroId(null);
      setPermiteDescuentoHermanos(true);
      setUsarPorcentajePersonalizado(false);
      setPorcentajeDescuento('');
      setDestinatarioTipo('PROTAGONISTAS');
      if (esGlobal) {
        setTodoElGrupo(true);
        setUnidadesIds([]);
      } else {
        setTodoElGrupo(false);
        setUnidadesIds(unidadesPermitidas.map((u) => u.id));
      }
      setFiltroUnidadBusqueda(null);
      setUsuariosSeleccionados([]);
      setNotificarAviso(true);
    }
    setNotificarPush(canales?.pushHabilitado ?? true);
    setNotificarEmail(false);
    setBusqueda('');
    setResultados([]);
    setErrorForm(null);
  }, [abierto, campamentoAEditar, esGlobal, unidadesPermitidas, canales?.pushHabilitado]);

  useEffect(() => {
    if (!abierto || esGlobal || destinatarioTipo === 'USUARIOS') return;
    if (unidadesIds.length === 0 && unidadesPermitidas.length > 0) {
      setUnidadesIds(unidadesPermitidas.map((u) => u.id));
    }
  }, [abierto, esGlobal, destinatarioTipo, unidadesIds.length, unidadesPermitidas]);

  useEffect(() => {
    if (!abierto || destinatarioTipo !== 'USUARIOS') {
      setResultados([]);
      setBuscando(false);
      return;
    }
    const termino = normalizarTextoBusqueda(busqueda);
    if (termino.length < 2) {
      setResultados([]);
      setBuscando(false);
      return;
    }

    let cancelado = false;
    const timer = setTimeout(async () => {
      setBuscando(true);
      try {
        const res = await api.get('/miembros', {
          params: {
            q: busqueda.trim(),
            busqueda: busqueda.trim(),
            porPagina: 20,
            incluirInactivos: false,
            ...(filtroUnidadBusqueda !== null ? { unidadId: filtroUnidadBusqueda } : {}),
          },
        });
        if (cancelado) return;
        const items: MiembroResumen[] = res.data?.items || res.data || [];
        const filtrados = items.filter((m) => {
          const full1 = normalizarTextoBusqueda(`${m.nombre} ${m.apellido}`);
          const full2 = normalizarTextoBusqueda(`${m.apellido} ${m.nombre}`);
          const dni = normalizarTextoBusqueda(m.dni);
          return full1.includes(termino) || full2.includes(termino) || dni.includes(termino);
        });
        setResultados(filtrados);
      } catch {
        if (!cancelado) setResultados([]);
      } finally {
        if (!cancelado) setBuscando(false);
      }
    }, 200);

    return () => {
      cancelado = true;
      clearTimeout(timer);
    };
  }, [abierto, destinatarioTipo, busqueda, filtroUnidadBusqueda]);

  const toggleUnidad = (id: number) => {
    setTodoElGrupo(false);
    setUnidadesIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleToggleTodoElGrupo = (checked: boolean) => {
    setTodoElGrupo(checked);
    if (checked) {
      setUnidadesIds([]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorForm(null);

    if (titulo.trim().length < 2) {
      setErrorForm('El título debe tener al menos 2 caracteres.');
      return;
    }
    if (lugar.trim().length < 2) {
      setErrorForm('Indicá el lugar del campamento.');
      return;
    }
    if (!fechaInicio || !fechaFin || fechaFin < fechaInicio) {
      setErrorForm('La fecha de fin debe ser igual o posterior al inicio.');
      return;
    }
    const costoNum = Number(costoBase === '' ? 0 : costoBase);
    if (!Number.isFinite(costoNum) || costoNum < 0) {
      setErrorForm('Indicá un costo válido (0 si es gratuito).');
      return;
    }
    if (destinatarioTipo === 'USUARIOS' && usuariosSeleccionados.length === 0) {
      setErrorForm('Seleccioná al menos una persona invitada.');
      return;
    }
    if (destinatarioTipo !== 'USUARIOS' && !todoElGrupo && unidadesIds.length === 0) {
      setErrorForm('Seleccioná al menos una rama o sección destinataria.');
      return;
    }

    const unidadesFinales =
      destinatarioTipo === 'USUARIOS'
        ? filtroUnidadBusqueda !== null
          ? [filtroUnidadBusqueda]
          : []
        : todoElGrupo
          ? []
          : unidadesIds;

    setGuardando(true);
    try {
      const porcentajeNum =
        permiteDescuentoHermanos && usarPorcentajePersonalizado && porcentajeDescuento !== ''
          ? Number(porcentajeDescuento)
          : null;

      if (campamentoAEditar?.id) {
        await editarCampamento(campamentoAEditar.id, {
          titulo: titulo.trim(),
          lugar: lugar.trim(),
          descripcion: descripcion.trim() ? descripcion.trim() : null,
          fechaInicio,
          fechaFin,
          fechaLimiteConfirmacion: fechaLimite.trim() ? fechaLimite.trim() : null,
          estado,
          destinatarioTipo,
          unidadesIds: unidadesFinales,
          usuariosIds:
            destinatarioTipo === 'USUARIOS' ? usuariosSeleccionados.map((u) => u.id) : undefined,
          costoBase: costoNum,
          permiteDescuentoHermanos,
          porcentajeDescuentoHermanos: porcentajeNum,
          rubroId,
          notificarAviso,
          notificarPush: pushHabilitado ? notificarPush : false,
          notificarEmail: emailHabilitado ? notificarEmail : false,
        });
        await invalidarCampamentosQueries(queryClient);
        mostrarToast('Campamento y destinatarios actualizados correctamente.', 'exito');
      } else {
        const res = await crearCampamento({
          titulo: titulo.trim(),
          lugar: lugar.trim(),
          descripcion: descripcion.trim() ? descripcion.trim() : null,
          fechaInicio,
          fechaFin,
          fechaLimiteConfirmacion: fechaLimite.trim() ? fechaLimite.trim() : null,
          estado: estado === 'BORRADOR' ? 'BORRADOR' : 'PUBLICADO',
          destinatarioTipo,
          unidadesIds: unidadesFinales,
          usuariosIds:
            destinatarioTipo === 'USUARIOS' ? usuariosSeleccionados.map((u) => u.id) : undefined,
          cicloAnio: Number(fechaInicio.slice(0, 4)) || obtenerCicloAnioActual(),
          costoBase: costoNum,
          permiteDescuentoHermanos,
          porcentajeDescuentoHermanos: porcentajeNum,
          rubroId,
          notificarAviso,
          notificarPush: pushHabilitado ? notificarPush : false,
          notificarEmail: emailHabilitado ? notificarEmail : false,
        });
        await invalidarCampamentosQueries(queryClient);
        mostrarToast(
          `Campamento creado con ${res.totalInvitados ?? 0} invitado(s). La deuda se asignará cuando confirmen asistencia.`,
          'exito',
        );
      }
      onCerrar();
    } catch (err) {
      setErrorForm(traducirErrorAmigable(err, 'No se pudo guardar el campamento.'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Drawer
      abierto={abierto}
      onCerrar={onCerrar}
      bloqueado={guardando}
      titulo={esEdicion ? 'Editar campamento' : 'Nuevo campamento'}
      subtitulo="Las deudas se generan automáticamente recién cuando cada miembro confirma asistencia"
      mode="sheet"
      maxWidthClass="sm:max-w-2xl"
      footer={
        <div className="flex items-center justify-end gap-2.5">
          <button
            type="button"
            disabled={guardando}
            onClick={onCerrar}
            className="s-btn-sec s-touch px-4 py-2.5 rounded-xl text-sm font-bold cursor-pointer disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="form-campamento"
            disabled={guardando}
            className="s-btn-brand s-touch px-5 py-2.5 rounded-xl text-sm inline-flex items-center gap-2 cursor-pointer disabled:opacity-60"
          >
            {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Tent className="w-4 h-4" />}
            <span>
              {guardando
                ? 'Guardando…'
                : esEdicion
                  ? 'Guardar cambios'
                  : 'Crear campamento'}
            </span>
          </button>
        </div>
      }
    >
      <form id="form-campamento" onSubmit={handleSubmit} className="space-y-4">
        {errorForm && (
          <div role="alert" className="s-badge-err rounded-xl px-3.5 py-2.5 text-sm font-semibold">
            {errorForm}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <Input
            label="Nombre del campamento"
            required
            maxLength={150}
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Ej. Campamento de Primavera"
          />
          <Input
            label="Lugar"
            required
            maxLength={200}
            value={lugar}
            onChange={(e) => setLugar(e.target.value)}
            placeholder="Ej. Campo Scout Tandil"
          />
        </div>

        <Textarea
          label="Información e indicaciones (qué llevar, horarios, transporte)"
          rows={3}
          maxLength={4000}
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          placeholder="Detallá horario de salida y regreso, equipo necesario, punto de encuentro…"
        />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          <Input
            type="date"
            label="Fecha inicio"
            required
            value={fechaInicio}
            onChange={(e) => {
              setFechaInicio(e.target.value);
              if (fechaFin < e.target.value) setFechaFin(e.target.value);
            }}
          />
          <Input
            type="date"
            label="Fecha fin"
            required
            min={fechaInicio || undefined}
            value={fechaFin}
            onChange={(e) => setFechaFin(e.target.value)}
          />
          <Input
            type="date"
            label="Límite para confirmar (opcional)"
            value={fechaLimite}
            onChange={(e) => setFechaLimite(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          <Input
            type="number"
            label="Costo base ($)"
            min={0}
            step="0.01"
            value={costoBase}
            onChange={(e) => setCostoBase(e.target.value)}
            helperText="Poné 0 si el campamento es gratuito."
          />

          <Select
            label="Rubro contable"
            value={rubroId ?? ''}
            onChange={(e) => setRubroId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Sin rubro</option>
            {rubros.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nombre}
              </option>
            ))}
          </Select>

          <Select
            label="Estado"
            value={estado}
            disabled={campamentoAEditar?.estado === 'CANCELADO'}
            onChange={(e) => setEstado(e.target.value as EstadoCampamento)}
          >
            <option value="PUBLICADO">Publicado (visible e invitable)</option>
            <option value="BORRADOR">Borrador (oculto)</option>
            {esEdicion && <option value="CERRADO">Cerrado (sin más confirmaciones)</option>}
            {esEdicion && <option value="FINALIZADO">Finalizado</option>}
            {esEdicion && <option value="CANCELADO">Cancelado</option>}
          </Select>
        </div>

        {esEdicion && estado === 'CANCELADO' && campamentoAEditar?.estado !== 'CANCELADO' && (
          <p className="rounded-xl border border-rule bg-paper-2 p-3 text-xs text-ink-2">
            Al cancelar se anulan las deudas del campamento y lo que ya se pagó pasa al Saldo a favor
            de cada familia. Un campamento cancelado no se puede reactivar.
          </p>
        )}

        {Number(costoBase || 0) > 0 && (
          <div className="rounded-2xl border border-rule bg-paper-2 p-4 space-y-2.5">
            <label className="flex items-center gap-2.5 cursor-pointer text-sm font-bold text-ink">
              <input
                type="checkbox"
                checked={permiteDescuentoHermanos}
                onChange={(e) => setPermiteDescuentoHermanos(e.target.checked)}
                className="w-4 h-4 rounded accent-brand"
              />
              <span>Permitir descuento por hermanos / grupo familiar</span>
            </label>

            {permiteDescuentoHermanos && (
              <div className="pl-6 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-ink-muted">
                  <input
                    type="checkbox"
                    checked={usarPorcentajePersonalizado}
                    onChange={(e) => setUsarPorcentajePersonalizado(e.target.checked)}
                    className="w-4 h-4 rounded accent-brand"
                  />
                  <span>Fijar porcentaje específico para este campamento</span>
                </label>
                {usarPorcentajePersonalizado && (
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    placeholder="Ej. 20"
                    value={porcentajeDescuento}
                    onChange={(e) => setPorcentajeDescuento(e.target.value)}
                    containerClassName="max-w-[180px]"
                  />
                )}
              </div>
            )}
          </div>
        )}

        {/* Destinatarios (creación y edición) */}
        <div className="rounded-2xl border border-rule bg-paper-2 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 text-sm font-bold text-ink">
              <Users className="w-4 h-4 text-brand" />
              <span>Miembros invitados</span>
            </div>
            {destinatarioTipo !== 'USUARIOS' && (
              <span className="text-xs font-semibold text-ink-muted">
                {todoElGrupo
                  ? 'Todo el grupo'
                  : `${unidadesIds.length} ${unidadesIds.length === 1 ? 'sección' : 'secciones'}`}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(
              [
                { id: 'PROTAGONISTAS', label: 'Protagonistas' },
                { id: 'EDUCADORES', label: 'Educadores' },
                { id: 'TODOS', label: 'Todos' },
                { id: 'USUARIOS', label: 'Puntuales' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setDestinatarioTipo(opt.id)}
                className={`min-h-[40px] px-2.5 py-2 rounded-xl text-xs font-bold border cursor-pointer transition-colors ${
                  destinatarioTipo === opt.id
                    ? 'bg-brand text-brand-contrast border-brand'
                    : 'bg-surface text-ink-2 border-rule hover:bg-paper-3'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {destinatarioTipo !== 'USUARIOS' ? (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs font-bold text-ink-2">
                  Elegí las ramas o secciones
                </span>
                {unidadesPermitidas.length > 1 && (
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setTodoElGrupo(false);
                        setUnidadesIds(unidadesPermitidas.map((u) => u.id));
                      }}
                      className="font-bold text-brand hover:underline cursor-pointer"
                    >
                      Todas
                    </button>
                    <span className="text-ink-muted">·</span>
                    <button
                      type="button"
                      onClick={() => {
                        setTodoElGrupo(false);
                        setUnidadesIds([]);
                      }}
                      className="font-bold text-ink-muted hover:text-ink cursor-pointer"
                    >
                      Limpiar
                    </button>
                  </div>
                )}
              </div>

              {esGlobal && (
                <label className="flex items-center gap-2.5 p-2.5 rounded-xl border border-rule bg-surface cursor-pointer text-sm font-bold text-ink">
                  <input
                    type="checkbox"
                    checked={todoElGrupo}
                    onChange={(e) => handleToggleTodoElGrupo(e.target.checked)}
                    className="w-4 h-4 rounded accent-brand shrink-0"
                  />
                  <span>Todo el grupo scout (todas las ramas y secciones)</span>
                </label>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {unidadesPermitidas.map((u) => {
                  const marcada = !todoElGrupo && unidadesIds.includes(u.id);
                  return (
                    <label
                      key={u.id}
                      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-xs sm:text-sm font-semibold cursor-pointer transition-colors ${
                        marcada
                          ? 'bg-brand-soft/35 border-brand/50 text-ink'
                          : 'bg-surface border-rule text-ink-2 hover:bg-paper-3'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={marcada}
                        onChange={() => toggleUnidad(u.id)}
                        className="w-4 h-4 rounded accent-brand shrink-0"
                      />
                      <span className="truncate">{u.nombre}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              <Select
                label="Filtrar búsqueda por sección (opcional)"
                value={filtroUnidadBusqueda === null ? '' : String(filtroUnidadBusqueda)}
                onChange={(e) =>
                  setFiltroUnidadBusqueda(e.target.value ? Number(e.target.value) : null)
                }
              >
                <option value="">
                  {esGlobal ? 'Todo el grupo scout' : 'Todas tus secciones habilitadas'}
                </option>
                {unidadesPermitidas.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nombre}
                  </option>
                ))}
              </Select>

              <div className="relative">
                <Search className="w-4 h-4 text-ink-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar miembro por nombre, apellido o DNI…"
                  className="w-full min-h-[42px] rounded-xl border border-rule bg-surface pl-10 pr-9 py-2 text-sm text-ink placeholder:text-ink-muted outline-none focus:border-brand"
                />
                {busqueda && (
                  <button
                    type="button"
                    onClick={() => {
                      setBusqueda('');
                      setResultados([]);
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-ink-muted hover:text-ink cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}

                {busqueda.trim().length >= 2 && (
                  <div className="mt-1 rounded-xl border border-rule bg-surface shadow-lg max-h-48 overflow-y-auto">
                    {buscando ? (
                      <div className="p-3 text-center text-xs text-ink-muted">Buscando…</div>
                    ) : resultados.length > 0 ? (
                      resultados.map((m) => {
                        const ya = usuariosSeleccionados.some((x) => x.id === m.id);
                        return (
                          <button
                            key={m.id}
                            type="button"
                            disabled={ya}
                            onClick={() => {
                              setUsuariosSeleccionados((prev) => [...prev, m]);
                              setBusqueda('');
                              setResultados([]);
                            }}
                            className="w-full text-left px-3.5 py-2 text-xs hover:bg-paper-2 flex items-center justify-between border-b border-rule last:border-0 cursor-pointer disabled:opacity-50"
                          >
                            <span>
                              <strong className="text-ink">
                                {m.nombre} {m.apellido}
                              </strong>{' '}
                              <span className="text-ink-muted">DNI {m.dni}</span>
                            </span>
                            <span className="font-bold text-brand">
                              {ya ? 'Agregado' : '+ Agregar'}
                            </span>
                          </button>
                        );
                      })
                    ) : (
                      <div className="p-3 text-center text-xs text-ink-muted">Sin resultados.</div>
                    )}
                  </div>
                )}
              </div>

              {usuariosSeleccionados.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {usuariosSeleccionados.map((m) => (
                    <span
                      key={m.id}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-soft/60 border border-brand/30 text-ink text-xs font-bold"
                    >
                      <UserCheck className="w-3.5 h-3.5 text-brand" />
                      <span>
                        {m.nombre} {m.apellido}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setUsuariosSeleccionados((prev) => prev.filter((x) => x.id !== m.id))
                        }
                        className="hover:text-rose-600 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {esEdicion && (
            <p className="text-xs text-ink-muted">
              Al agregar ramas o personas se invitan como pendientes. Si quitás ramas con miembros que ya abonaron, dalos de baja primero desde Asistentes.
            </p>
          )}
        </div>

        {estado === 'PUBLICADO' && (!esEdicion || campamentoAEditar?.estado === 'BORRADOR') && (
          <div className="rounded-2xl border border-rule bg-paper-2 p-4 space-y-2.5">
            <label className="flex items-center gap-2.5 cursor-pointer text-sm font-bold text-ink">
              <input
                type="checkbox"
                checked={notificarAviso}
                onChange={(e) => setNotificarAviso(e.target.checked)}
                className="w-4 h-4 rounded accent-brand"
              />
              <Bell className="w-4 h-4 text-brand" />
              <span>Enviar aviso automático a los invitados al publicar</span>
            </label>

            {notificarAviso && (
              <div className="pl-6 space-y-2">
                <label
                  className={`flex items-center gap-2 text-xs ${
                    pushHabilitado ? 'cursor-pointer text-ink-2' : 'opacity-60 cursor-not-allowed text-ink-muted'
                  }`}
                >
                  <input
                    type="checkbox"
                    disabled={!pushHabilitado}
                    checked={pushHabilitado && notificarPush}
                    onChange={(e) => setNotificarPush(e.target.checked)}
                    className="w-4 h-4 rounded accent-brand"
                  />
                  <BellRing className="w-3.5 h-3.5 text-brand" />
                  <span>Incluir notificación push (celulares / PWA)</span>
                </label>

                <label
                  className={`flex items-center gap-2 text-xs ${
                    emailHabilitado ? 'cursor-pointer text-ink-2' : 'opacity-60 cursor-not-allowed text-ink-muted'
                  }`}
                >
                  <input
                    type="checkbox"
                    disabled={!emailHabilitado}
                    checked={emailHabilitado && notificarEmail}
                    onChange={(e) => setNotificarEmail(e.target.checked)}
                    className="w-4 h-4 rounded accent-brand"
                  />
                  <Mail className="w-3.5 h-3.5 text-brand" />
                  <span>Incluir copia por correo electrónico</span>
                </label>
              </div>
            )}
          </div>
        )}
      </form>
    </Drawer>
  );
};
