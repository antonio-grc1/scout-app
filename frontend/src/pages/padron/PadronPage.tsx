import React, { useEffect, useState, useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../../api/client';
import { Navbar } from '../../components/Navbar';
import { ModalDetalleMiembro } from '../../components/ModalDetalleMiembro';
import { ModalAltaMiembro } from '../../components/ModalAltaMiembro';
import { useAuthStore } from '../../store/authStore';
import { obtenerConfigRama, obtenerOrdenRama, RAMA_COLORS } from '../../lib/ramaColors';
import {
  Users,
  Search,
  UserPlus,
  Filter,
  Eye,
  KeyRound,
  Shield,
  GraduationCap,
  Sparkles,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  SlidersHorizontal,
  UserX,
} from 'lucide-react';

type CampoOrden = 'miembro' | 'dni' | 'rama' | 'rol';
type DireccionOrden = 'asc' | 'desc';

export const PadronPage: React.FC = () => {
  const { tieneGlobal, tieneUnidad, usuario } = useAuthStore();
  const esSoloEducadorUnidad = tieneUnidad() && !tieneGlobal();

  const [miembros, setMiembros] = useState<any[]>([]);
  const [unidades, setUnidades] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [ramas, setRamas] = useState<any[]>([]);
  const [cargando, setCargando] = useState(false);

  // Filtros
  const [filtroTexto, setFiltroTexto] = useState('');
  const [filtroTipoRol, setFiltroTipoRol] = useState<'TODOS' | 'PROTAGONISTAS' | 'EDUCADORES'>('TODOS');
  const [filtroEstadoMiembro, setFiltroEstadoMiembro] = useState<'ACTIVOS' | 'TODOS' | 'INACTIVOS'>('ACTIVOS');
  const [filtroRama, setFiltroRama] = useState<string>('TODAS');
  const [unidadSeleccionada, setUnidadSeleccionada] = useState<string>('TODAS');

  // Ordenamiento por columnas
  const [campoOrden, setCampoOrden] = useState<CampoOrden>('rama');
  const [direccionOrden, setDireccionOrden] = useState<DireccionOrden>('asc');

  // Modales
  const [miembroSeleccionadoId, setMiembroSeleccionadoId] = useState<number | null>(null);
  const [modalAltaAbierto, setModalAltaAbierto] = useState(false);
  const [notificacion, setNotificacion] = useState<string | null>(null);

  useEffect(() => {
    cargarDatosIniciales();
  }, [unidadSeleccionada]);

  const cargarDatosIniciales = async () => {
    setCargando(true);
    try {
      const urlUnidad = unidadSeleccionada !== 'TODAS' ? `&unidadId=${unidadSeleccionada}` : '';
      const [resMiembros, resUnidades, resRoles, resRamas] = await Promise.all([
        api.get(`/miembros?porPagina=200&incluirInactivos=true${urlUnidad}`),
        api.get('/organizacion/unidades').catch(() => ({ data: [] })),
        api.get('/organizacion/roles').catch(() => ({ data: [] })),
        api.get('/organizacion/ramas').catch(() => ({ data: [] })),
      ]);

      setMiembros(resMiembros.data.items || []);
      setUnidades(resUnidades.data || []);
      setRoles(resRoles.data || []);
      setRamas(resRamas.data || []);
    } catch (err) {
      console.error('Error al cargar datos del padrón', err);
    } finally {
      setCargando(false);
    }
  };

  const handleOrdenar = (campo: CampoOrden) => {
    if (campoOrden === campo) {
      setDireccionOrden(direccionOrden === 'asc' ? 'desc' : 'asc');
    } else {
      setCampoOrden(campo);
      setDireccionOrden('asc');
    }
  };

  const renderIconoOrden = (campo: CampoOrden) => {
    if (campoOrden !== campo) {
      return <ArrowUpDown className="w-3 h-3 text-slate-300 group-hover:text-slate-500 transition ml-1 shrink-0" />;
    }
    return direccionOrden === 'asc' ? (
      <ArrowUp className="w-3.5 h-3.5 text-emerald-600 transition ml-1 shrink-0 font-bold" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-emerald-600 transition ml-1 shrink-0 font-bold" />
    );
  };

  // Filtrado y ordenamiento reactivo
  const miembrosFiltradosYOrdenados = useMemo(() => {
    const filtrados = miembros.filter((m) => {
      // 1. Filtro de estado (Activo / Inactivo)
      if (filtroEstadoMiembro === 'ACTIVOS' && !m.activo) return false;
      if (filtroEstadoMiembro === 'INACTIVOS' && m.activo) return false;

      // 2. Filtro de tipo de rol
      const asig = m.asignaciones?.[0];
      const esEdu = asig?.rol?.nombre?.toLowerCase().includes('educador') || asig?.rol?.nombre?.toLowerCase().includes('jefe');

      if (filtroTipoRol === 'PROTAGONISTAS' && esEdu) return false;
      if (filtroTipoRol === 'EDUCADORES' && !esEdu) return false;

      // 3. Filtro por Rama específica
      if (filtroRama !== 'TODAS') {
        const cfg = obtenerConfigRama(m, unidades);
        if (cfg.key !== filtroRama) return false;
      }

      // 4. Filtro de texto
      const q = filtroTexto.toLowerCase().trim();
      if (q) {
        const coincideTexto =
          m.nombre.toLowerCase().includes(q) ||
          m.apellido.toLowerCase().includes(q) ||
          m.dni.includes(q) ||
          (m.emailContacto && m.emailContacto.toLowerCase().includes(q)) ||
          (m.telefonoContacto && m.telefonoContacto.includes(q)) ||
          (m.grupoFamiliar?.nombreFamilia && m.grupoFamiliar.nombreFamilia.toLowerCase().includes(q));
        if (!coincideTexto) return false;
      }

      return true;
    });

    return filtrados.sort((a, b) => {
      let comp = 0;
      switch (campoOrden) {
        case 'dni': {
          comp = a.dni.localeCompare(b.dni, undefined, { numeric: true });
          break;
        }
        case 'miembro': {
          const nomA = `${a.apellido} ${a.nombre}`.toLowerCase();
          const nomB = `${b.apellido} ${b.nombre}`.toLowerCase();
          comp = nomA.localeCompare(nomB, 'es');
          break;
        }
        case 'rama': {
          const ordenA = obtenerOrdenRama(a, unidades, ramas);
          const ordenB = obtenerOrdenRama(b, unidades, ramas);
          if (ordenA !== ordenB) {
            comp = ordenA - ordenB;
          } else {
            const nomA = `${a.apellido} ${a.nombre}`.toLowerCase();
            const nomB = `${b.apellido} ${b.nombre}`.toLowerCase();
            comp = nomA.localeCompare(nomB, 'es');
          }
          break;
        }
        case 'rol': {
          const rolA = a.asignaciones?.[0]?.rol?.nombre || '';
          const rolB = b.asignaciones?.[0]?.rol?.nombre || '';
          comp = rolA.localeCompare(rolB, 'es');
          if (comp === 0) {
            const nomA = `${a.apellido} ${a.nombre}`.toLowerCase();
            const nomB = `${b.apellido} ${b.nombre}`.toLowerCase();
            comp = nomA.localeCompare(nomB, 'es');
          }
          break;
        }
      }
      return direccionOrden === 'asc' ? comp : -comp;
    });
  }, [miembros, filtroEstadoMiembro, filtroTipoRol, filtroRama, filtroTexto, campoOrden, direccionOrden, unidades, ramas]);

  const totalActivos = miembros.filter((m) => m.activo).length;
  const totalInactivos = miembros.filter((m) => !m.activo).length;

  const totalProtagonistas = miembros.filter(
    (m) =>
      m.activo &&
      !m.asignaciones?.some(
        (a: any) =>
          a.rol.nombre.toLowerCase().includes('educador') || a.rol.nombre.toLowerCase().includes('jefe'),
      ),
  ).length;

  const totalEducadores = miembros.filter(
    (m) =>
      m.activo &&
      m.asignaciones?.some(
        (a: any) =>
          a.rol.nombre.toLowerCase().includes('educador') || a.rol.nombre.toLowerCase().includes('jefe'),
      ),
  ).length;

  // Conteo por ramas (activos)
  const totalLobatos = miembros.filter(
    (m) => m.activo && obtenerConfigRama(m, unidades).key === 'lobatos',
  ).length;
  const totalScout = miembros.filter(
    (m) => m.activo && obtenerConfigRama(m, unidades).key === 'scout',
  ).length;
  const totalCaminantes = miembros.filter(
    (m) => m.activo && obtenerConfigRama(m, unidades).key === 'caminantes',
  ).length;
  const totalRover = miembros.filter(
    (m) => m.activo && obtenerConfigRama(m, unidades).key === 'rover',
  ).length;

  if (esSoloEducadorUnidad) {
    return <Navigate to="/rama" replace />;
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Encabezado y acciones principales */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Users className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                Padrón General del Grupo Scout
              </h1>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Visualización y gestión integral de protagonistas y educadores (Alcance Global)
            </p>
          </div>

          <button
            onClick={() => setModalAltaAbierto(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition shadow-xs cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>Dar de Alta Nuevo Miembro</span>
          </button>
        </div>

        {/* Tarjetas de estadísticas (Filtros interactivos al hacer clic) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {/* 1. Total Activos */}
          <div
            onClick={() => {
              setFiltroEstadoMiembro('ACTIVOS');
              setFiltroTipoRol('TODOS');
            }}
            className={`p-4 rounded-xl border shadow-xs flex items-center justify-between cursor-pointer transition hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700 ${
              filtroEstadoMiembro === 'ACTIVOS' && filtroTipoRol === 'TODOS'
                ? 'bg-slate-100/70 dark:bg-slate-800 border-slate-400 dark:border-slate-600 ring-2 ring-slate-400 dark:ring-slate-500'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
            }`}
            title="Haz clic para ver todos los miembros activos"
          >
            <div>
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block uppercase tracking-wider">
                Total Activos
              </span>
              <span className="text-2xl font-black text-slate-900 dark:text-slate-100">{totalActivos}</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 font-bold">
              👥
            </div>
          </div>

          {/* 2. Protagonistas */}
          <div
            onClick={() => {
              setFiltroEstadoMiembro('ACTIVOS');
              setFiltroTipoRol(
                filtroTipoRol === 'PROTAGONISTAS' && filtroEstadoMiembro === 'ACTIVOS'
                  ? 'TODOS'
                  : 'PROTAGONISTAS'
              );
            }}
            className={`p-4 rounded-xl border shadow-xs flex items-center justify-between cursor-pointer transition hover:shadow-md hover:border-emerald-300 dark:hover:border-emerald-700 ${
              filtroTipoRol === 'PROTAGONISTAS' && filtroEstadoMiembro === 'ACTIVOS'
                ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-400 dark:border-emerald-600 ring-2 ring-emerald-500'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
            }`}
            title="Haz clic para filtrar u alternar protagonistas activos"
          >
            <div>
              <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 block uppercase tracking-wider">
                Protagonistas
              </span>
              <span className="text-2xl font-black text-emerald-700 dark:text-emerald-300">{totalProtagonistas}</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400 font-bold">
              ⚜
            </div>
          </div>

          {/* 3. Educadores */}
          <div
            onClick={() => {
              setFiltroEstadoMiembro('ACTIVOS');
              setFiltroTipoRol(
                filtroTipoRol === 'EDUCADORES' && filtroEstadoMiembro === 'ACTIVOS'
                  ? 'TODOS'
                  : 'EDUCADORES'
              );
            }}
            className={`p-4 rounded-xl border shadow-xs flex items-center justify-between cursor-pointer transition hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-700 ${
              filtroTipoRol === 'EDUCADORES' && filtroEstadoMiembro === 'ACTIVOS'
                ? 'bg-indigo-50 dark:bg-indigo-950/50 border-indigo-400 dark:border-indigo-600 ring-2 ring-indigo-500'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
            }`}
            title="Haz clic para filtrar u alternar educadores activos"
          >
            <div>
              <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 block uppercase tracking-wider">
                Educadores
              </span>
              <span className="text-2xl font-black text-indigo-700 dark:text-indigo-300">{totalEducadores}</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold">
              🎓
            </div>
          </div>

          {/* 4. Tarjeta de Inactivos */}
          <div
            onClick={() => {
              setFiltroTipoRol('TODOS');
              setFiltroEstadoMiembro(filtroEstadoMiembro === 'INACTIVOS' ? 'ACTIVOS' : 'INACTIVOS');
            }}
            className={`p-4 rounded-xl border shadow-xs flex items-center justify-between cursor-pointer transition hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700 ${
              filtroEstadoMiembro === 'INACTIVOS'
                ? 'bg-slate-100 dark:bg-slate-800 border-slate-400 dark:border-slate-600 ring-2 ring-slate-400'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
            }`}
            title="Haz clic para alternar ver miembros dados de baja"
          >
            <div>
              <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 block uppercase tracking-wider">
                Inactivos / Bajas
              </span>
              <span className="text-2xl font-black text-slate-700 dark:text-slate-300">{totalInactivos}</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400 font-bold text-lg">
              <UserX className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Guía Visual de Colores por Rama */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-3.5 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 font-semibold text-xs shrink-0">
            <span>Identificación por Ramas:</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setFiltroRama(filtroRama === 'lobatos' ? 'TODAS' : 'lobatos')}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-bold text-xs border transition cursor-pointer shadow-2xs ${
                filtroRama === 'lobatos' ? 'ring-2 ring-amber-500 scale-105' : 'hover:opacity-80'
              } ${RAMA_COLORS.lobatos.badgeClases}`}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              <span>Lobatos ({totalLobatos})</span>
            </button>

            <button
              onClick={() => setFiltroRama(filtroRama === 'scout' ? 'TODAS' : 'scout')}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-bold text-xs border transition cursor-pointer shadow-2xs ${
                filtroRama === 'scout' ? 'ring-2 ring-emerald-500 scale-105' : 'hover:opacity-80'
              } ${RAMA_COLORS.scout.badgeClases}`}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span>Scout ({totalScout})</span>
            </button>

            <button
              onClick={() => setFiltroRama(filtroRama === 'caminantes' ? 'TODAS' : 'caminantes')}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-bold text-xs border transition cursor-pointer shadow-2xs ${
                filtroRama === 'caminantes' ? 'ring-2 ring-sky-500 scale-105' : 'hover:opacity-80'
              } ${RAMA_COLORS.caminantes.badgeClases}`}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-sky-500" />
              <span>Caminantes ({totalCaminantes})</span>
            </button>

            <button
              onClick={() => setFiltroRama(filtroRama === 'rover' ? 'TODAS' : 'rover')}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-bold text-xs border transition cursor-pointer shadow-2xs ${
                filtroRama === 'rover' ? 'ring-2 ring-red-500 scale-105' : 'hover:opacity-80'
              } ${RAMA_COLORS.rover.badgeClases}`}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
              <span>Rover ({totalRover})</span>
            </button>

            {filtroRama !== 'TODAS' && (
              <button
                onClick={() => setFiltroRama('TODAS')}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs font-semibold underline ml-1 cursor-pointer"
              >
                Ver todas las ramas
              </button>
            )}
          </div>
        </div>

        {notificacion && (
          <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 rounded-xl text-xs font-semibold flex items-center justify-between">
            <span>{notificacion}</span>
            <button onClick={() => setNotificacion(null)} className="text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer">
              Cerrar
            </button>
          </div>
        )}

        {/* Barra de Filtros interactiva y Ordenamiento */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          {/* Pestañas Principales (Activos, Protagonistas, Educadores, Inactivos, Todos) */}
          <div className="flex flex-wrap bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs font-semibold shrink-0 gap-1">
            <button
              onClick={() => {
                setFiltroTipoRol('TODOS');
                setFiltroEstadoMiembro('ACTIVOS');
              }}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                filtroEstadoMiembro === 'ACTIVOS' && filtroTipoRol === 'TODOS'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              Activos ({totalActivos})
            </button>
            <button
              onClick={() => {
                setFiltroTipoRol('PROTAGONISTAS');
                setFiltroEstadoMiembro('ACTIVOS');
              }}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                filtroTipoRol === 'PROTAGONISTAS' && filtroEstadoMiembro === 'ACTIVOS'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              Protagonistas ({totalProtagonistas})
            </button>
            <button
              onClick={() => {
                setFiltroTipoRol('EDUCADORES');
                setFiltroEstadoMiembro('ACTIVOS');
              }}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                filtroTipoRol === 'EDUCADORES' && filtroEstadoMiembro === 'ACTIVOS'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              Educadores ({totalEducadores})
            </button>

            {/* Pestaña explícita para Ver Inactivos */}
            <button
              onClick={() => {
                setFiltroTipoRol('TODOS');
                setFiltroEstadoMiembro('INACTIVOS');
              }}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                filtroEstadoMiembro === 'INACTIVOS'
                  ? 'bg-slate-700 dark:bg-slate-600 text-white shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              <UserX className="w-3.5 h-3.5" />
              <span>Inactivos ({totalInactivos})</span>
            </button>

            <button
              onClick={() => {
                setFiltroTipoRol('TODOS');
                setFiltroEstadoMiembro('TODOS');
              }}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                filtroEstadoMiembro === 'TODOS'
                  ? 'bg-slate-800 dark:bg-slate-600 text-white shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              Todos ({miembros.length})
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Selector de ordenamiento explícito */}
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400 dark:text-slate-500 font-medium text-[11px]">Ordenar:</span>
              <select
                value={
                  campoOrden === 'rama' && direccionOrden === 'asc'
                    ? 'rama_asc'
                    : campoOrden === 'rama' && direccionOrden === 'desc'
                    ? 'rama_desc'
                    : campoOrden === 'miembro' && direccionOrden === 'asc'
                    ? 'alfabetico_asc'
                    : campoOrden === 'miembro' && direccionOrden === 'desc'
                    ? 'alfabetico_desc'
                    : campoOrden === 'dni' && direccionOrden === 'asc'
                    ? 'dni_asc'
                    : 'dni_desc'
                }
                onChange={(e) => {
                  switch (e.target.value) {
                    case 'rama_asc':
                      setCampoOrden('rama');
                      setDireccionOrden('asc');
                      break;
                    case 'rama_desc':
                      setCampoOrden('rama');
                      setDireccionOrden('desc');
                      break;
                    case 'alfabetico_asc':
                      setCampoOrden('miembro');
                      setDireccionOrden('asc');
                      break;
                    case 'alfabetico_desc':
                      setCampoOrden('miembro');
                      setDireccionOrden('desc');
                      break;
                    case 'dni_asc':
                      setCampoOrden('dni');
                      setDireccionOrden('asc');
                      break;
                    case 'dni_desc':
                      setCampoOrden('dni');
                      setDireccionOrden('desc');
                      break;
                  }
                }}
                className="px-2.5 py-1.5 rounded-xl border border-emerald-300 dark:border-emerald-700 font-semibold text-xs bg-emerald-50/50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 outline-none focus:border-emerald-500 cursor-pointer"
              >
                <option value="rama_asc">Rama (Menor a Mayor) + Alfabético</option>
                <option value="rama_desc">Rama (Mayor a Menor)</option>
                <option value="alfabetico_asc">Miembro: Apellido (A - Z)</option>
                <option value="alfabetico_desc">Miembro: Apellido (Z - A)</option>
                <option value="dni_asc">DNI (Menor a Mayor)</option>
                <option value="dni_desc">DNI (Mayor a Menor)</option>
              </select>
            </div>

            {/* Selector de Rama/Unidad */}
            {unidades.length > 0 && (
              <div className="w-full sm:w-auto">
                <select
                  value={unidadSeleccionada}
                  onChange={(e) => setUnidadSeleccionada(e.target.value)}
                  className="w-full sm:w-44 px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-medium bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 outline-none focus:border-emerald-500 cursor-pointer"
                >
                  <option value="TODAS">Todas las Ramas</option>
                  {unidades.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nombre}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Buscador de texto */}
            <div className="relative w-full sm:w-56">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Buscar por nombre, DNI..."
                value={filtroTexto}
                onChange={(e) => setFiltroTexto(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs focus:border-emerald-500 outline-none bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
              />
            </div>
          </div>
        </div>

        {/* Tabla de Miembros con cabeceras clickeables y colores de rama */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
              <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 text-slate-400 dark:text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                <tr>
                  <th
                    onClick={() => handleOrdenar('miembro')}
                    className="py-3 px-4 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition select-none group"
                    title="Haz clic para ordenar por miembro (apellido y nombre)"
                  >
                    <div className="flex items-center gap-1">
                      <span>Miembro</span>
                      {renderIconoOrden('miembro')}
                    </div>
                  </th>

                  <th
                    onClick={() => handleOrdenar('dni')}
                    className="py-3 px-4 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition select-none group"
                    title="Haz clic para ordenar por DNI"
                  >
                    <div className="flex items-center gap-1">
                      <span>DNI</span>
                      {renderIconoOrden('dni')}
                    </div>
                  </th>

                  <th
                    onClick={() => handleOrdenar('rol')}
                    className="py-3 px-4 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition select-none group"
                    title="Haz clic para ordenar por rol"
                  >
                    <div className="flex items-center gap-1">
                      <span>Rol / Categoría</span>
                      {renderIconoOrden('rol')}
                    </div>
                  </th>

                  <th
                    onClick={() => handleOrdenar('rama')}
                    className="py-3 px-4 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition select-none group"
                    title="Haz clic para ordenar por rama de menor a mayor (Lobatos -> Scout -> Caminantes -> Rover)"
                  >
                    <div className="flex items-center gap-1">
                      <span>Rama Asignada / Unidad</span>
                      {renderIconoOrden('rama')}
                    </div>
                  </th>

                  <th className="py-3 px-4">Contacto Familiar</th>
                  <th className="py-3 px-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {miembrosFiltradosYOrdenados.map((m) => {
                  const asig = m.asignaciones?.[0];
                  const cfg = obtenerConfigRama(m, unidades);

                  return (
                    <tr
                      key={m.id}
                      className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition border-l-4 ${
                        !m.activo
                          ? 'border-l-slate-300 dark:border-l-slate-700 bg-slate-50/50 dark:bg-slate-800/30 opacity-60'
                          : cfg.borderClases
                      }`}
                    >
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          {/* Avatar con Color de Rama */}
                          <div
                            className={`w-8 h-8 rounded-xl flex items-center justify-center text-[11px] shrink-0 shadow-2xs ${
                              !m.activo ? 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400' : cfg.avatarClases
                            }`}
                          >
                            {m.nombre[0]}
                            {m.apellido[0]}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-slate-900 dark:text-slate-100 block">
                                {m.apellido}, {m.nombre}
                              </span>
                              {!m.activo && (
                                <span className="px-1.5 py-0.2 rounded-full text-[9px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                                  Inactivo
                                </span>
                              )}
                            </div>
                            {m.grupoFamiliar && (
                              <span className="text-[10px] text-slate-400 dark:text-slate-500 block">
                                Fam. {m.grupoFamiliar.nombreFamilia}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono font-medium text-slate-800 dark:text-slate-200">{m.dni}</td>
                      <td className="py-3.5 px-4">
                        <span className="inline-block px-2.5 py-0.5 rounded-full font-bold text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          {asig?.rol?.nombre || 'Sin Rol'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-bold text-[10px] border shadow-2xs ${cfg.badgeClases}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dotColor}`} />
                            {cfg.nombre}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-600 dark:text-slate-400 font-medium mt-0.5">
                          {asig?.unidad?.nombre || 'Sin Rama'}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="text-slate-700 dark:text-slate-300">{m.telefonoContacto || '—'}</div>
                        <div className="text-[10px] text-slate-400 dark:text-slate-500">{m.emailContacto || '—'}</div>
                      </td>
                      <td className="py-3.5 px-4 text-right space-x-2">
                        <button
                          onClick={() => setMiembroSeleccionadoId(m.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-lg text-xs transition cursor-pointer"
                        >
                          <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                          <span>Gestionar</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {miembrosFiltradosYOrdenados.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-slate-400 dark:text-slate-500 text-xs">
                      {cargando ? 'Cargando padrón...' : 'No se encontraron miembros con los filtros seleccionados.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Modal Ficha Completa del Miembro */}
      {miembroSeleccionadoId !== null && (
        <ModalDetalleMiembro
          usuarioId={miembroSeleccionadoId}
          onCerrar={() => setMiembroSeleccionadoId(null)}
          onActualizado={() => {
            cargarDatosIniciales();
            setNotificacion('Miembro actualizado exitosamente.');
          }}
          onClaveReseteada={(msg) => setNotificacion(msg)}
        />
      )}

      {/* Modal Alta de Miembro */}
      <ModalAltaMiembro
        abierto={modalAltaAbierto}
        onCerrar={() => setModalAltaAbierto(false)}
        onCreado={() => {
          cargarDatosIniciales();
          setNotificacion('Nuevo miembro creado exitosamente.');
        }}
        unidadesDisponibles={unidades}
        rolesDisponibles={roles}
      />
    </div>
  );
};
