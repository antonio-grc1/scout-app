import React, { useState, useEffect, useMemo } from 'react';
import {
  History,
  X,
  Search,
  Calendar,
  Users,
  GraduationCap,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  AlertCircle,
  Inbox,
  Filter,
  Clock,
  Sparkles,
} from 'lucide-react';
import {
  obtenerHistorialUnidad,
  HistorialUnidadResponse,
  AsignacionHistorialUnidad,
  PersonaHistorialUnidad,
} from '../services/organizacion.service';
import {
  normalizarTextoBusqueda,
  traducirErrorAmigable,
  esRolDeEducador,
  esRolDeProtagonista,
  TIPO_UNIDAD_LABELS,
} from '../lib/formatters';
import { useModalOverlay } from '../hooks/useModalOverlay';

export interface ModalHistorialSeccionProps {
  unidadId: number;
  seccionInicial?: {
    id: number;
    nombre: string;
    tipo?: string;
    activa?: boolean;
    rama?: { nombre: string } | null;
  } | null;
  onCerrar: () => void;
}

function formatearFechaUTC(fechaStr?: string | null): string {
  if (!fechaStr) return '';
  const d = new Date(fechaStr);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-AR', {
    timeZone: 'UTC',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function obtenerPersona(asig: AsignacionHistorialUnidad): PersonaHistorialUnidad {
  if (asig.miembro) return asig.miembro;
  if (asig.usuario) return asig.usuario;
  return {
    id: 0,
    nombre: 'Miembro',
    apellido: '',
    dni: '—',
    activo: true,
  };
}

function obtenerIniciales(nombre: string, apellido: string): string {
  const n = (nombre || '').trim().charAt(0);
  const a = (apellido || '').trim().charAt(0);
  return (n + a).toUpperCase() || 'M';
}

export const ModalHistorialSeccion: React.FC<ModalHistorialSeccionProps> = ({
  unidadId,
  seccionInicial,
  onCerrar,
}) => {
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<HistorialUnidadResponse | null>(null);

  // Filtros y vistas
  const [busqueda, setBusqueda] = useState('');
  const [filtroCiclo, setFiltroCiclo] = useState<string>('TODOS');
  const [modoVista, setModoVista] = useState<'ciclo' | 'categoria'>('ciclo');
  const [subCategoria, setSubCategoria] = useState<'EDUCADORES' | 'PROTAGONISTAS'>('EDUCADORES');

  // Estado de acordeón por ciclo (true = colapsado, false/undefined = expandido)
  const [ciclosColapsados, setCiclosColapsados] = useState<Record<number, boolean>>({});

  const toggleCiclo = (ciclo: number) => {
    setCiclosColapsados((prev) => ({
      ...prev,
      [ciclo]: !prev[ciclo],
    }));
  };

  const expandirTodos = () => setCiclosColapsados({});
  const colapsarTodos = (ciclos: number[]) => {
    const todos: Record<number, boolean> = {};
    for (const c of ciclos) todos[c] = true;
    setCiclosColapsados(todos);
  };

  const [recargarTrigger, setRecargarTrigger] = useState(0);

  const reintentar = () => {
    setCargando(true);
    setError(null);
    setRecargarTrigger((prev) => prev + 1);
  };

  useEffect(() => {
    let cancelado = false;
    async function ejecutar() {
      try {
        const res = await obtenerHistorialUnidad(unidadId);
        if (!cancelado) {
          setData(res);
          setError(null);
        }
      } catch (err) {
        if (!cancelado) {
          setError(traducirErrorAmigable(err, 'No pudimos obtener el historial de la sección.'));
        }
      } finally {
        if (!cancelado) {
          setCargando(false);
        }
      }
    }

    ejecutar();
    return () => {
      cancelado = true;
    };
  }, [unidadId, recargarTrigger]);

  const { backdropProps, contentProps } = useModalOverlay({
    onCerrar,
  });

  const seccionInfo = useMemo(() => {
    return {
      nombre: data?.nombre || seccionInicial?.nombre || 'Sección',
      tipo: data?.tipo || seccionInicial?.tipo || 'SECCION_RAMA',
      activa: data ? data.activa : seccionInicial?.activa !== false,
      rama: data?.rama || seccionInicial?.rama || null,
    };
  }, [data, seccionInicial]);

  // Resumen Estadístico
  const resumen = useMemo(() => {
    const asignaciones = data?.asignaciones || [];
    const ciclosSet = new Set<number>();
    const educadoresSet = new Set<number>();
    const protagonistasSet = new Set<number>();

    for (const a of asignaciones) {
      if (a.cicloAnio) ciclosSet.add(a.cicloAnio);
      const persona = obtenerPersona(a);
      if (persona.id) {
        if (esRolDeEducador(a.rol)) {
          educadoresSet.add(persona.id);
        } else if (esRolDeProtagonista(a.rol)) {
          protagonistasSet.add(persona.id);
        } else {
          protagonistasSet.add(persona.id);
        }
      }
    }

    const ciclosOperativos = Array.from(ciclosSet).sort((a, b) => b - a);

    return {
      totalAsignaciones:
        data?.resumen?.totalAsignaciones ?? asignaciones.length,
      totalEducadoresUnicos:
        data?.resumen?.totalEducadoresUnicos ??
        data?.resumen?.totalEducadores ??
        educadoresSet.size,
      totalProtagonistasUnicos:
        data?.resumen?.totalProtagonistasUnicos ??
        data?.resumen?.totalProtagonistas ??
        protagonistasSet.size,
      ciclosOperativos:
        data?.resumen?.ciclosOperativos ??
        data?.resumen?.ciclos ??
        ciclosOperativos,
      totalCiclos:
        data?.resumen?.totalCiclos ??
        (data?.resumen?.ciclosOperativos?.length ?? ciclosOperativos.length),
    };
  }, [data]);

  // Filtrado de asignaciones
  const asignacionesFiltradas = useMemo(() => {
    const todas = data?.asignaciones || [];
    const q = normalizarTextoBusqueda(busqueda);

    return todas.filter((a) => {
      // Filtro por ciclo
      if (filtroCiclo !== 'TODOS' && String(a.cicloAnio) !== filtroCiclo) {
        return false;
      }

      // Filtro por búsqueda de texto
      if (!q) return true;

      const persona = obtenerPersona(a);
      const nombreCompleto = `${persona.nombre} ${persona.apellido}`;
      const textoTarget = `${nombreCompleto} ${persona.dni} ${a.rol?.nombre || ''} ${a.cicloAnio}`;
      return normalizarTextoBusqueda(textoTarget).includes(q);
    });
  }, [data?.asignaciones, busqueda, filtroCiclo]);

  // Agrupamiento por Ciclo Lectivo (para modo vista 'ciclo')
  const gruposPorCiclo = useMemo(() => {
    const map = new Map<
      number,
      { educadores: AsignacionHistorialUnidad[]; protagonistas: AsignacionHistorialUnidad[] }
    >();

    for (const a of asignacionesFiltradas) {
      const ciclo = a.cicloAnio;
      if (!map.has(ciclo)) {
        map.set(ciclo, { educadores: [], protagonistas: [] });
      }
      const entry = map.get(ciclo)!;
      if (esRolDeEducador(a.rol)) {
        entry.educadores.push(a);
      } else {
        entry.protagonistas.push(a);
      }
    }

    // Ordenar ciclos descendentemente
    const ciclosOrdenados = Array.from(map.keys()).sort((a, b) => b - a);
    return ciclosOrdenados.map((ciclo) => ({
      ciclo,
      educadores: map.get(ciclo)!.educadores,
      protagonistas: map.get(ciclo)!.protagonistas,
      total: map.get(ciclo)!.educadores.length + map.get(ciclo)!.protagonistas.length,
    }));
  }, [asignacionesFiltradas]);

  // Listas por categoría (para modo vista 'categoria')
  const listaPorCategoria = useMemo(() => {
    const educadores: AsignacionHistorialUnidad[] = [];
    const protagonistas: AsignacionHistorialUnidad[] = [];

    for (const a of asignacionesFiltradas) {
      if (esRolDeEducador(a.rol)) {
        educadores.push(a);
      } else {
        protagonistas.push(a);
      }
    }

    return { educadores, protagonistas };
  }, [asignacionesFiltradas]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-historial-seccion-titulo"
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 motion-safe:animate-in motion-safe:fade-in motion-reduce:animate-none"
      {...backdropProps}
    >
      <div
        className="bg-surface border-t sm:border border-rule rounded-t-3xl sm:rounded-3xl w-full max-w-4xl max-h-[92vh] overflow-hidden shadow-2xl flex flex-col animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-150 text-ink"
        {...contentProps}
      >
        {/* CABECERA DEL MODAL */}
        <div className="p-4 sm:p-5 border-b border-rule flex items-center justify-between bg-paper-2 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-brand/10 text-brand flex items-center justify-center shrink-0">
              <History className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2
                  id="modal-historial-seccion-titulo"
                  className="text-base sm:text-lg font-black text-ink tracking-tight truncate"
                >
                  Historial: {seccionInfo.nombre}
                </h2>
                <span className="px-2 py-0.5 rounded-md bg-paper-3 text-ink-2 text-xs font-bold border border-rule">
                  {seccionInfo.rama?.nombre || 'Adultos'}
                </span>
                {seccionInfo.activa ? (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 font-bold text-xs border border-emerald-200 dark:border-emerald-800/60">
                    Activa
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 font-bold text-xs border border-rose-200 dark:border-rose-800/60">
                    Sección Inactiva
                  </span>
                )}
              </div>
              <p className="text-xs text-ink-muted mt-0.5 truncate">
                {TIPO_UNIDAD_LABELS[seccionInfo.tipo] || 'Sección del Grupo'} • Registros históricos de educadores y protagonistas
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar modal"
            className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-ink-muted hover:text-ink hover:bg-paper-3 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* AVISO INFORMATIVO SI LA SECCIÓN ESTÁ INACTIVA */}
        {!seccionInfo.activa && (
          <div className="mx-4 sm:mx-6 mt-4 p-3 rounded-xl bg-rose-50/80 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-rose-800 dark:text-rose-200 text-xs flex items-center gap-2.5 shrink-0 shadow-2xs">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
            <p className="font-semibold">
              Esta sección se encuentra actualmente desactivada. Se visualizan sus registros históricos.
            </p>
          </div>
        )}

        {/* CONTENIDO PRINCIPAL CON SCROLL */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* SKELETON DE CARGA */}
          {cargando && (
            <div className="space-y-4 animate-pulse">
              {/* Tarjetas Skeleton */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-20 bg-paper-2 rounded-2xl border border-rule" />
                ))}
              </div>
              <div className="h-11 bg-paper-2 rounded-xl border border-rule" />
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-28 bg-paper-2 rounded-2xl border border-rule" />
                ))}
              </div>
            </div>
          )}

          {/* BANNER DE ERROR */}
          {!cargando && error && (
            <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-rose-800 dark:text-rose-200 space-y-3">
              <div className="flex items-center gap-2.5">
                <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />
                <span className="font-bold text-sm">No se pudo cargar el historial</span>
              </div>
              <p className="text-xs text-rose-700 dark:text-rose-300">{error}</p>
              <button
                type="button"
                onClick={reintentar}
                className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-surface hover:bg-paper-2 text-ink-2 border border-rule font-bold text-xs flex items-center gap-2 cursor-pointer transition shadow-2xs"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reintentar</span>
              </button>
            </div>
          )}

          {/* CUERPO PRINCIPAL CUANDO NO HAY ERROR Y YA CARGÓ */}
          {!cargando && !error && (
            <>
              {/* RESUMEN ESTADÍSTICO (4 TARJETAS) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* 1. Ciclos Lectivos */}
                <div className="bg-paper-2 border border-rule rounded-2xl p-3.5 flex flex-col justify-between shadow-2xs">
                  <div className="flex items-center justify-between text-ink-muted mb-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider">Ciclos</span>
                    <Calendar className="w-4 h-4 text-brand" />
                  </div>
                  <div>
                    <span className="text-2xl font-black text-ink">{resumen.totalCiclos}</span>
                    <span className="text-[11px] text-ink-muted block font-medium">
                      {resumen.ciclosOperativos.length > 0
                        ? `${resumen.ciclosOperativos[resumen.ciclosOperativos.length - 1]} - ${resumen.ciclosOperativos[0]}`
                        : 'registrados'}
                    </span>
                  </div>
                </div>

                {/* 2. Educadores Históricos */}
                <div className="bg-paper-2 border border-rule rounded-2xl p-3.5 flex flex-col justify-between shadow-2xs">
                  <div className="flex items-center justify-between text-ink-muted mb-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider">Educadores</span>
                    <GraduationCap className="w-4 h-4 text-indigo-500" />
                  </div>
                  <div>
                    <span className="text-2xl font-black text-ink">{resumen.totalEducadoresUnicos}</span>
                    <span className="text-[11px] text-ink-muted block font-medium">
                      históricos únicos
                    </span>
                  </div>
                </div>

                {/* 3. Protagonistas */}
                <div className="bg-paper-2 border border-rule rounded-2xl p-3.5 flex flex-col justify-between shadow-2xs">
                  <div className="flex items-center justify-between text-ink-muted mb-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider">Protagonistas</span>
                    <Users className="w-4 h-4 text-emerald-500" />
                  </div>
                  <div>
                    <span className="text-2xl font-black text-ink">{resumen.totalProtagonistasUnicos}</span>
                    <span className="text-[11px] text-ink-muted block font-medium">
                      miembros históricos
                    </span>
                  </div>
                </div>

                {/* 4. Total Asignaciones */}
                <div className="bg-paper-2 border border-rule rounded-2xl p-3.5 flex flex-col justify-between shadow-2xs">
                  <div className="flex items-center justify-between text-ink-muted mb-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider">Asignaciones</span>
                    <Clock className="w-4 h-4 text-amber-500" />
                  </div>
                  <div>
                    <span className="text-2xl font-black text-ink">{resumen.totalAsignaciones}</span>
                    <span className="text-[11px] text-ink-muted block font-medium">
                      registros totales
                    </span>
                  </div>
                </div>
              </div>

              {/* BARRA DE HERRAMIENTAS: BÚSQUEDA + SELECTOR DE CICLO + VISTA */}
              <div className="space-y-2.5">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                  {/* Buscador */}
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
                    <input
                      type="text"
                      value={busqueda}
                      onChange={(e) => setBusqueda(e.target.value)}
                      placeholder="Buscar por nombre, apellido, DNI, rol..."
                      className="w-full min-h-[40px] pl-9.5 pr-8 py-2 rounded-xl border border-rule bg-surface text-ink text-xs font-semibold focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none transition"
                    />
                    {busqueda && (
                      <button
                        type="button"
                        onClick={() => setBusqueda('')}
                        aria-label="Limpiar búsqueda"
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink cursor-pointer p-0.5"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Filtro por ciclo */}
                  <div className="flex items-center gap-2">
                    <div className="relative shrink-0">
                      <select
                        value={filtroCiclo}
                        onChange={(e) => setFiltroCiclo(e.target.value)}
                        className="min-h-[40px] pl-3 pr-8 py-1.5 rounded-xl border border-rule bg-surface text-ink text-xs font-bold cursor-pointer outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition"
                      >
                        <option value="TODOS">Todos los ciclos</option>
                        {resumen.ciclosOperativos.map((c) => (
                          <option key={c} value={String(c)}>
                            Ciclo {c}
                          </option>
                        ))}
                      </select>
                      <Filter className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
                    </div>

                    {/* Alternador de Vista (Por Ciclo vs Por Categoría) */}
                    <div className="flex items-center bg-paper-2 p-1 rounded-xl border border-rule shrink-0">
                      <button
                        type="button"
                        onClick={() => setModoVista('ciclo')}
                        className={`min-h-[32px] px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition ${
                          modoVista === 'ciclo'
                            ? 'bg-brand text-brand-contrast shadow-xs'
                            : 'text-ink-2 hover:text-ink'
                        }`}
                      >
                        <Calendar className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Por Ciclo</span>
                        <span className="sm:hidden">Ciclos</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setModoVista('categoria')}
                        className={`min-h-[32px] px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition ${
                          modoVista === 'categoria'
                            ? 'bg-brand text-brand-contrast shadow-xs'
                            : 'text-ink-2 hover:text-ink'
                        }`}
                      >
                        <Users className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Por Categoría</span>
                        <span className="sm:hidden">Categorías</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Acciones auxiliares en modo ciclo (Expandir / Colapsar todos) */}
                {modoVista === 'ciclo' && gruposPorCiclo.length > 1 && (
                  <div className="flex items-center justify-between text-[11px] text-ink-muted px-1">
                    <span>
                      Mostrando {asignacionesFiltradas.length}{' '}
                      {asignacionesFiltradas.length === 1 ? 'asignación' : 'asignaciones'} en{' '}
                      {gruposPorCiclo.length} {gruposPorCiclo.length === 1 ? 'ciclo' : 'ciclos'}
                    </span>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={expandirTodos}
                        className="hover:text-brand font-semibold cursor-pointer underline"
                      >
                        Expandir todos
                      </button>
                      <span>•</span>
                      <button
                        type="button"
                        onClick={() => colapsarTodos(gruposPorCiclo.map((g) => g.ciclo))}
                        className="hover:text-brand font-semibold cursor-pointer underline"
                      >
                        Colapsar todos
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* ESTADO VACÍO GENERAL */}
              {(data?.asignaciones || []).length === 0 && (
                <div className="p-8 text-center bg-paper-2 rounded-2xl border border-rule space-y-2">
                  <Inbox className="w-10 h-10 text-ink-muted mx-auto" />
                  <h3 className="font-bold text-sm text-ink">Sin asignaciones registradas</h3>
                  <p className="text-xs text-ink-muted max-w-md mx-auto">
                    Esta sección no registra miembros ni educadores asignados en el historial del sistema.
                  </p>
                </div>
              )}

              {/* ESTADO VACÍO DE BÚSQUEDA */}
              {(data?.asignaciones || []).length > 0 && asignacionesFiltradas.length === 0 && (
                <div className="p-8 text-center bg-paper-2 rounded-2xl border border-rule space-y-3">
                  <Search className="w-8 h-8 text-ink-muted mx-auto" />
                  <h3 className="font-bold text-sm text-ink">Sin resultados</h3>
                  <p className="text-xs text-ink-muted">
                    No encontramos asignaciones que coincidan con &ldquo;{busqueda}&rdquo;
                    {filtroCiclo !== 'TODOS' ? ` en el ciclo ${filtroCiclo}` : ''}.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setBusqueda('');
                      setFiltroCiclo('TODOS');
                    }}
                    className="min-h-[36px] px-3.5 py-1.5 rounded-xl bg-surface hover:bg-paper-3 text-ink-2 border border-rule font-bold text-xs cursor-pointer inline-flex items-center gap-1.5 shadow-2xs"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Limpiar filtros</span>
                  </button>
                </div>
              )}

              {/* LISTADO: VISTA POR CICLO LECTIVO */}
              {modoVista === 'ciclo' && gruposPorCiclo.length > 0 && (
                <div className="space-y-3">
                  {gruposPorCiclo.map(({ ciclo, educadores, protagonistas, total }) => {
                    const colapsado = ciclosColapsados[ciclo] ?? false;
                    return (
                      <div
                        key={ciclo}
                        className="bg-paper-2 border border-rule rounded-2xl overflow-hidden shadow-2xs transition-colors"
                      >
                        {/* Cabecera del Ciclo (Botón Colapsable) */}
                        <button
                          type="button"
                          onClick={() => toggleCiclo(ciclo)}
                          className="w-full p-4 flex items-center justify-between text-left hover:bg-paper-3/60 transition cursor-pointer"
                        >
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <span className="w-7 h-7 rounded-lg bg-brand/10 text-brand font-black text-xs flex items-center justify-center">
                              {ciclo}
                            </span>
                            <span className="font-black text-sm text-ink">
                              Ciclo Lectivo {ciclo}
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-paper-3 text-ink-2 font-bold text-[11px] border border-rule">
                              {total} {total === 1 ? 'miembro' : 'miembros'}
                            </span>
                            <span className="text-[11px] text-ink-muted">
                              ({educadores.length} {educadores.length === 1 ? 'educador' : 'educadores'} • {protagonistas.length} {protagonistas.length === 1 ? 'protagonista' : 'protagonistas'})
                            </span>
                          </div>

                          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-muted hover:text-ink">
                            {colapsado ? (
                              <ChevronDown className="w-4 h-4" />
                            ) : (
                              <ChevronUp className="w-4 h-4" />
                            )}
                          </div>
                        </button>

                        {/* Contenido expandible del ciclo */}
                        {!colapsado && (
                          <div className="p-4 pt-0 space-y-4 border-t border-rule/60 mt-1">
                            {/* Subsección: Educadores a cargo */}
                            <div className="space-y-2 mt-3">
                              <div className="flex items-center gap-1.5 text-xs font-bold text-ink-2">
                                <GraduationCap className="w-4 h-4 text-indigo-500" />
                                <span>Educadores a cargo ({educadores.length})</span>
                              </div>

                              {educadores.length === 0 ? (
                                <p className="text-xs text-ink-muted italic pl-5 py-1">
                                  No hay educadores registrados en este ciclo.
                                </p>
                              ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                  {educadores.map((a) => (
                                    <FilaMiembroHistorial key={a.id} asig={a} esEducador={true} />
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Subsección: Protagonistas */}
                            <div className="space-y-2 pt-2 border-t border-rule/40">
                              <div className="flex items-center gap-1.5 text-xs font-bold text-ink-2">
                                <Users className="w-4 h-4 text-emerald-500" />
                                <span>Protagonistas ({protagonistas.length})</span>
                              </div>

                              {protagonistas.length === 0 ? (
                                <p className="text-xs text-ink-muted italic pl-5 py-1">
                                  No hay protagonistas registrados en este ciclo.
                                </p>
                              ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                  {protagonistas.map((a) => (
                                    <FilaMiembroHistorial key={a.id} asig={a} esEducador={false} />
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* LISTADO: VISTA POR CATEGORÍA */}
              {modoVista === 'categoria' && asignacionesFiltradas.length > 0 && (
                <div className="space-y-4">
                  {/* Pestañas de categoría */}
                  <div className="flex border-b border-rule gap-2">
                    <button
                      type="button"
                      onClick={() => setSubCategoria('EDUCADORES')}
                      className={`min-h-[40px] px-4 py-2 font-bold text-xs flex items-center gap-2 border-b-2 cursor-pointer transition ${
                        subCategoria === 'EDUCADORES'
                          ? 'border-brand text-brand font-black'
                          : 'border-transparent text-ink-muted hover:text-ink'
                      }`}
                    >
                      <GraduationCap className="w-4 h-4" />
                      <span>Educadores ({listaPorCategoria.educadores.length})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSubCategoria('PROTAGONISTAS')}
                      className={`min-h-[40px] px-4 py-2 font-bold text-xs flex items-center gap-2 border-b-2 cursor-pointer transition ${
                        subCategoria === 'PROTAGONISTAS'
                          ? 'border-brand text-brand font-black'
                          : 'border-transparent text-ink-muted hover:text-ink'
                      }`}
                    >
                      <Users className="w-4 h-4" />
                      <span>Protagonistas ({listaPorCategoria.protagonistas.length})</span>
                    </button>
                  </div>

                  {/* Lista de asignaciones según la categoría activa */}
                  {subCategoria === 'EDUCADORES' ? (
                    listaPorCategoria.educadores.length === 0 ? (
                      <p className="text-xs text-ink-muted italic py-4 text-center">
                        No hay educadores que coincidan con los filtros seleccionados.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                        {listaPorCategoria.educadores.map((a) => (
                          <FilaMiembroHistorial
                            key={a.id}
                            asig={a}
                            esEducador={true}
                            mostrarCicloBadge={true}
                          />
                        ))}
                      </div>
                    )
                  ) : listaPorCategoria.protagonistas.length === 0 ? (
                    <p className="text-xs text-ink-muted italic py-4 text-center">
                      No hay protagonistas que coincidan con los filtros seleccionados.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      {listaPorCategoria.protagonistas.map((a) => (
                        <FilaMiembroHistorial
                          key={a.id}
                          asig={a}
                          esEducador={false}
                          mostrarCicloBadge={true}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* PIE DEL MODAL */}
        <div className="p-4 sm:p-5 border-t border-rule bg-paper-2 flex items-center justify-between shrink-0">
          <span className="text-xs text-ink-muted font-medium flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-brand" />
            <span>Visualización histórica de grupo</span>
          </span>
          <button
            type="button"
            onClick={onCerrar}
            className="min-h-[40px] px-5 py-2 rounded-xl bg-surface hover:bg-paper-3 text-ink-2 hover:text-ink border border-rule font-bold text-xs cursor-pointer transition shadow-2xs"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

interface FilaMiembroProps {
  asig: AsignacionHistorialUnidad;
  esEducador: boolean;
  mostrarCicloBadge?: boolean;
}

const FilaMiembroHistorial: React.FC<FilaMiembroProps> = ({
  asig,
  esEducador,
  mostrarCicloBadge,
}) => {
  const persona = obtenerPersona(asig);
  const nombreCompleto = `${persona.nombre} ${persona.apellido}`.trim() || 'Miembro';
  const iniciales = obtenerIniciales(persona.nombre, persona.apellido);

  const inicio = formatearFechaUTC(asig.fechaInicio);
  const fin = asig.fechaFin ? formatearFechaUTC(asig.fechaFin) : 'Actualidad';
  const asignacionActiva = asig.activo && !asig.fechaFin;

  return (
    <div className="flex items-center justify-between gap-2.5 p-3 rounded-xl bg-surface border border-rule hover:border-brand/30 transition shadow-2xs">
      <div className="flex items-center gap-2.5 min-w-0">
        {/* Avatar de Iniciales */}
        <div
          className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-xs shrink-0 ${
            esEducador
              ? 'bg-indigo-600 text-white'
              : 'bg-paper-3 text-ink-2 border border-rule'
          }`}
        >
          {iniciales}
        </div>

        <div className="min-w-0 space-y-0.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-bold text-ink text-xs truncate max-w-[160px] sm:max-w-[200px]">
              {nombreCompleto}
            </span>
            {mostrarCicloBadge && (
              <span className="px-1.5 py-0.5 rounded-md bg-brand/10 text-brand font-black text-[10px]">
                {asig.cicloAnio}
              </span>
            )}
            {!persona.activo && (
              <span className="px-1.5 py-0.5 rounded-md bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 font-bold text-[10px]">
                Baja
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 text-[11px] text-ink-muted flex-wrap">
            <span>DNI {persona.dni || '—'}</span>
            <span>•</span>
            <span className="text-ink-2 font-medium">{asig.rol?.nombre || 'Miembro'}</span>
          </div>

          <div className="text-[10px] text-ink-muted">
            {inicio ? `${inicio} — ${fin}` : `Ciclo ${asig.cicloAnio}`}
          </div>
        </div>
      </div>

      {/* Insignia de Estado de Asignación */}
      <div className="shrink-0">
        {asignacionActiva ? (
          <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 font-bold text-[10px] border border-emerald-200 dark:border-emerald-800/60">
            Actual
          </span>
        ) : (
          <span className="px-2 py-0.5 rounded-full bg-paper-3 text-ink-muted font-semibold text-[10px] border border-rule">
            Finalizada
          </span>
        )}
      </div>
    </div>
  );
};
