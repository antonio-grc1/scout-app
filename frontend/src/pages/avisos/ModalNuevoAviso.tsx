import React, { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, Mail, BellRing, Search, Send, Users, UserCheck, X } from 'lucide-react';
import { api } from '../../api/client';
import { useCapabilities } from '../../core/capabilities';
import { invalidarAvisosQueries, useCanalesAvisosEstado } from '../../hooks/useAvisos';
import {
  normalizarTextoBusqueda,
  obtenerHoyLocalISO,
  traducirErrorAmigable,
} from '../../lib/formatters';
import { filtrarUnidadesPorAlcance } from '../../lib/permisos';
import {
  crearAviso,
  type DestinatarioAvisoTipo,
  type PrioridadAviso,
} from '../../services/avisos.service';
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

interface ModalNuevoAvisoProps {
  abierto: boolean;
  onCerrar: () => void;
  unidades: Array<{ id: number; nombre: string }>;
}

export const ModalNuevoAviso: React.FC<ModalNuevoAvisoProps> = ({
  abierto,
  onCerrar,
  unidades,
}) => {
  const queryClient = useQueryClient();
  const caps = useCapabilities();
  const asignaciones = useAuthStore((s) => s.asignaciones);
  const tienePermisoGlobal = useAuthStore((s) => s.tienePermisoGlobal);
  const obtenerUnidadesConPermiso = useAuthStore((s) => s.obtenerUnidadesConPermiso);
  const mostrarToast = useToastStore((s) => s.mostrarToast);

  const esGlobalAvisos = tienePermisoGlobal('avisos.editar');
  const unidadesAvisosIds = useMemo(
    () => obtenerUnidadesConPermiso('avisos.editar'),
    [asignaciones, obtenerUnidadesConPermiso],
  );

  const unidadesBase = useMemo(() => {
    if (unidades.length > 0) return unidades;
    return caps.unidadesAsignadas.map((u) => ({ id: u.id, nombre: u.nombre }));
  }, [unidades, caps.unidadesAsignadas]);

  const unidadesPermitidas = useMemo(
    () =>
      esGlobalAvisos
        ? unidadesBase
        : filtrarUnidadesPorAlcance(unidadesBase, {
            esGlobal: false,
            asignaciones: unidadesAvisosIds.map((id) => ({
              alcance: 'UNIDAD' as const,
              unidadId: id,
            })),
          }),
    [unidadesBase, esGlobalAvisos, unidadesAvisosIds],
  );

  const [titulo, setTitulo] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [prioridad, setPrioridad] = useState<PrioridadAviso>('NORMAL');
  const [destinatarioTipo, setDestinatarioTipo] = useState<DestinatarioAvisoTipo>('TODOS');
  const [unidadId, setUnidadId] = useState<number | null>(null);
  const [fechaExpiracion, setFechaExpiracion] = useState('');
  const [enviarPush, setEnviarPush] = useState(true);
  const [enviarEmail, setEnviarEmail] = useState(false);
  const [usuariosSeleccionados, setUsuariosSeleccionados] = useState<MiembroResumen[]>([]);

  const { data: canales } = useCanalesAvisosEstado(abierto);
  const pushHabilitado = Boolean(canales?.pushHabilitado);
  const emailHabilitado = Boolean(canales?.emailHabilitado);

  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState<MiembroResumen[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [errorForm, setErrorForm] = useState<string | null>(null);

  // Resetear al abrir
  useEffect(() => {
    if (!abierto) return;
    setTitulo('');
    setMensaje('');
    setPrioridad('NORMAL');
    setDestinatarioTipo('TODOS');
    setUnidadId(esGlobalAvisos ? null : (unidadesPermitidas[0]?.id ?? null));
    setFechaExpiracion('');
    setEnviarPush(canales?.pushHabilitado ?? true);
    setEnviarEmail(false);
    setUsuariosSeleccionados([]);
    setBusqueda('');
    setResultados([]);
    setErrorForm(null);
  }, [abierto, esGlobalAvisos, unidadesPermitidas, canales?.pushHabilitado]);

  // Si no es global y el modo no es USUARIOS, nunca dejar unidadId en null
  useEffect(() => {
    if (!abierto) return;
    if (!esGlobalAvisos && destinatarioTipo !== 'USUARIOS' && unidadId === null && unidadesPermitidas.length > 0) {
      setUnidadId(unidadesPermitidas[0].id);
    }
  }, [abierto, esGlobalAvisos, destinatarioTipo, unidadId, unidadesPermitidas]);

  // Buscador de miembros para modo USUARIOS
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
            ...(unidadId !== null ? { unidadId } : {}),
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
  }, [abierto, destinatarioTipo, busqueda, unidadId]);

  const agregarUsuario = (m: MiembroResumen) => {
    setUsuariosSeleccionados((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
    setBusqueda('');
    setResultados([]);
  };

  const quitarUsuario = (id: number) => {
    setUsuariosSeleccionados((prev) => prev.filter((x) => x.id !== id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorForm(null);

    if (titulo.trim().length < 2) {
      setErrorForm('El título debe tener al menos 2 caracteres.');
      return;
    }
    if (mensaje.trim().length < 2) {
      setErrorForm('El mensaje debe tener al menos 2 caracteres.');
      return;
    }
    if (destinatarioTipo === 'USUARIOS' && usuariosSeleccionados.length === 0) {
      setErrorForm('Seleccioná al menos una persona destinataria.');
      return;
    }
    if (!esGlobalAvisos && destinatarioTipo !== 'USUARIOS' && unidadId === null) {
      setErrorForm('Seleccioná la sección destinataria.');
      return;
    }

    setEnviando(true);
    try {
      const creado = await crearAviso({
        titulo: titulo.trim(),
        mensaje: mensaje.trim(),
        prioridad,
        destinatarioTipo,
        unidadId,
        usuariosIds:
          destinatarioTipo === 'USUARIOS' ? usuariosSeleccionados.map((u) => u.id) : undefined,
        fechaExpiracion: fechaExpiracion.trim() ? fechaExpiracion.trim() : null,
        enviarPush: pushHabilitado ? enviarPush : false,
        enviarEmail: emailHabilitado ? enviarEmail : false,
      });
      await invalidarAvisosQueries(queryClient);
      mostrarToast(
        `Aviso enviado a ${creado.totalDestinatarios} ${creado.totalDestinatarios === 1 ? 'persona' : 'personas'}.`,
        'exito',
      );
      onCerrar();
    } catch (err) {
      setErrorForm(traducirErrorAmigable(err, 'No se pudo enviar el aviso.'));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Drawer
      abierto={abierto}
      onCerrar={onCerrar}
      bloqueado={enviando}
      titulo="Nuevo aviso"
      subtitulo="Redactá un comunicado para tu sección o todo el grupo"
      mode="sheet"
      maxWidthClass="sm:max-w-xl"
      footer={
        <div className="flex items-center justify-end gap-2.5">
          <button
            type="button"
            disabled={enviando}
            onClick={onCerrar}
            className="s-btn-sec s-touch px-4 py-2.5 rounded-xl text-sm font-bold cursor-pointer disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="form-nuevo-aviso"
            disabled={enviando}
            className="s-btn-brand s-touch px-5 py-2.5 rounded-xl text-sm inline-flex items-center gap-2 cursor-pointer disabled:opacity-60"
          >
            {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            <span>{enviando ? 'Enviando…' : 'Enviar aviso'}</span>
          </button>
        </div>
      }
    >
      <form id="form-nuevo-aviso" onSubmit={handleSubmit} className="space-y-4">
        {errorForm && (
          <div role="alert" className="s-badge-err rounded-xl px-3.5 py-2.5 text-sm font-semibold">
            {errorForm}
          </div>
        )}

        <Input
          label="Título"
          required
          maxLength={150}
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder="Ej. Reunión de padres o cambio de horario"
        />

        <Textarea
          label="Mensaje"
          required
          rows={4}
          maxLength={4000}
          value={mensaje}
          onChange={(e) => setMensaje(e.target.value)}
          placeholder="Escribí el detalle del aviso…"
        />

        {/* Prioridad */}
        <div className="space-y-1.5">
          <span className="block text-sm font-bold text-ink">Prioridad</span>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { id: 'NORMAL', label: 'Normal' },
                { id: 'IMPORTANTE', label: 'Importante' },
                { id: 'URGENTE', label: 'Urgente' },
              ] as const
            ).map((opt) => {
              const active = prioridad === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setPrioridad(opt.id)}
                  className={`min-h-[42px] px-3 py-2 rounded-xl text-xs sm:text-sm font-bold border transition-colors cursor-pointer ${
                    active
                      ? 'bg-brand text-brand-contrast border-brand'
                      : 'bg-surface text-ink-2 border-rule hover:bg-paper-2'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Destinatarios */}
        <div className="rounded-2xl border border-rule bg-paper-2 p-4 space-y-3.5">
          <div className="flex items-center gap-2 text-sm font-bold text-ink">
            <Users className="w-4 h-4 text-brand" />
            <span>Destinatarios</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(
              [
                { id: 'TODOS', label: 'Todos' },
                { id: 'PROTAGONISTAS', label: 'Protagonistas' },
                { id: 'EDUCADORES', label: 'Educadores' },
                { id: 'USUARIOS', label: 'Puntuales' },
              ] as const
            ).map((opt) => {
              const active = destinatarioTipo === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setDestinatarioTipo(opt.id)}
                  className={`min-h-[40px] px-2.5 py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                    active
                      ? 'bg-brand text-brand-contrast border-brand'
                      : 'bg-surface text-ink-2 border-rule hover:bg-paper-3'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          <Select
            label={destinatarioTipo === 'USUARIOS' ? 'Filtrar búsqueda por sección (opcional)' : 'Rama o sección'}
            value={unidadId === null ? '' : String(unidadId)}
            disabled={!esGlobalAvisos && unidadesPermitidas.length <= 1 && destinatarioTipo !== 'USUARIOS'}
            onChange={(e) => {
              const val = e.target.value;
              setUnidadId(val === '' ? null : Number(val));
            }}
          >
            {(esGlobalAvisos || destinatarioTipo === 'USUARIOS') && (
              <option value="">
                {esGlobalAvisos
                  ? 'Todo el grupo scout (todas las secciones)'
                  : 'Todas tus secciones habilitadas'}
              </option>
            )}
            {unidadesPermitidas.map((u) => (
              <option key={u.id} value={String(u.id)}>
                {u.nombre}
              </option>
            ))}
          </Select>

          {destinatarioTipo === 'USUARIOS' && (
            <div className="space-y-2.5 pt-1">
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
                    aria-label="Limpiar búsqueda"
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
                        const yaAgregado = usuariosSeleccionados.some((x) => x.id === m.id);
                        return (
                          <button
                            key={m.id}
                            type="button"
                            disabled={yaAgregado}
                            onClick={() => agregarUsuario(m)}
                            className="w-full text-left px-3.5 py-2.5 text-[13px] hover:bg-paper-2 flex items-center justify-between border-b border-rule last:border-0 cursor-pointer disabled:opacity-50"
                          >
                            <span>
                              <strong className="text-ink">
                                {m.nombre} {m.apellido}
                              </strong>{' '}
                              <span className="text-ink-muted text-xs">DNI {m.dni}</span>
                            </span>
                            <span className="text-xs font-bold text-brand">
                              {yaAgregado ? 'Agregado' : '+ Agregar'}
                            </span>
                          </button>
                        );
                      })
                    ) : (
                      <div className="p-3 text-center text-xs text-ink-muted">
                        Sin resultados para "{busqueda.trim()}".
                      </div>
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
                        onClick={() => quitarUsuario(m.id)}
                        aria-label={`Quitar a ${m.nombre} ${m.apellido}`}
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
        </div>

        <Input
          type="date"
          label="Vence el (opcional)"
          min={obtenerHoyLocalISO()}
          value={fechaExpiracion}
          onChange={(e) => setFechaExpiracion(e.target.value)}
          helperText="Si la dejás vacía, el aviso permanece visible en la bandeja."
        />

        {/* Canales de entrega */}
        <div className="rounded-2xl border border-rule bg-paper-2 p-4 space-y-2.5">
          <div className="text-sm font-bold text-ink">Canales de entrega</div>
          <p className="text-xs text-ink-muted">
            Siempre se publica en la bandeja y campana interna de la app.
          </p>

          <label
            className={`flex items-start gap-2.5 text-sm select-none ${
              pushHabilitado ? 'cursor-pointer' : 'opacity-60 cursor-not-allowed'
            }`}
          >
            <input
              type="checkbox"
              disabled={!pushHabilitado}
              checked={pushHabilitado && enviarPush}
              onChange={(e) => setEnviarPush(e.target.checked)}
              className="mt-1 rounded border-rule accent-brand w-4 h-4 shrink-0"
            />
            <span className="min-w-0">
              <span className="font-semibold text-ink inline-flex items-center gap-1.5">
                <BellRing className="w-3.5 h-3.5 text-brand" />
                <span>Notificación push (celulares / PWA)</span>
              </span>
              {!pushHabilitado && (
                <span className="block text-xs text-ink-muted">
                  Requiere configurar claves VAPID en el servidor.
                </span>
              )}
            </span>
          </label>

          <label
            className={`flex items-start gap-2.5 text-sm select-none ${
              emailHabilitado ? 'cursor-pointer' : 'opacity-60 cursor-not-allowed'
            }`}
          >
            <input
              type="checkbox"
              disabled={!emailHabilitado}
              checked={emailHabilitado && enviarEmail}
              onChange={(e) => setEnviarEmail(e.target.checked)}
              className="mt-1 rounded border-rule accent-brand w-4 h-4 shrink-0"
            />
            <span className="min-w-0">
              <span className="font-semibold text-ink inline-flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-brand" />
                <span>Enviar también copia por correo electrónico</span>
              </span>
              <span className="block text-xs text-ink-muted">
                {emailHabilitado
                  ? 'Si hermanos comparten el mismo email, se envía un solo correo.'
                  : 'Configurá SMTP en Organización → Correo para habilitar este canal.'}
              </span>
            </span>
          </label>
        </div>
      </form>
    </Drawer>
  );
};
