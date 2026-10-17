import React, { useEffect, useState, useMemo } from 'react';
import { api } from '../../api/client';
import { Navbar } from '../../components/Navbar';
import { QrScannerModal } from '../../components/QrScannerModal';
import { ModalDetalleMiembro } from '../../components/ModalDetalleMiembro';
import { ModalAltaMiembro } from '../../components/ModalAltaMiembro';
import { useAuthStore } from '../../store/authStore';
import { obtenerConfigRama, obtenerOrdenRama, RAMA_COLORS } from '../../lib/ramaColors';
import {
  Users,
  QrCode,
  UserPlus,
  Search,
  Filter,
  ArrowRightLeft,
  CheckCircle2,
  Clock,
  AlertTriangle,
  FileText,
  SlidersHorizontal,
  XCircle,
  Eye,
  Sparkles,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  UserX,
  UserCheck,
} from 'lucide-react';

type CampoOrden = 'miembro' | 'dni' | 'edad' | 'rama' | 'ficha';
type DireccionOrden = 'asc' | 'desc';

export const UnidadPage: React.FC = () => {
  const { tieneGlobal, tieneUnidad, usuario } = useAuthStore();
  const [miembros, setMiembros] = useState<any[]>([]);
  const [candidatosPase, setCandidatosPase] = useState<any[]>([]);
  const [entregas, setEntregas] = useState<any[]>([]);
  const [unidades, setUnidades] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [ramas, setRamas] = useState<any[]>([]);
  const [cargando, setCargando] = useState(false);
  const [notificacion, setNotificacion] = useState<string | null>(null);

  // Modales
  const [scannerAbierto, setScannerAbierto] = useState(false);
  const [modalAltaAbierto, setModalAltaAbierto] = useState(false);
  const [miembroSeleccionadoId, setMiembroSeleccionadoId] = useState<number | null>(null);
  const [tabInicialModal, setTabInicialModal] = useState<'datos' | 'pase' | 'seguridad' | 'ficha' | 'cuotas'>('datos');

  // Filtros
  const [filtroTexto, setFiltroTexto] = useState('');
  const [filtroTipoRol, setFiltroTipoRol] = useState<'TODOS' | 'PROTAGONISTAS' | 'EDUCADORES'>('TODOS');
  const [filtroFicha, setFiltroFicha] = useState<'TODAS' | 'VALIDADA' | 'PENDIENTE' | 'SIN_FICHA'>('TODAS');
  const [filtroEstadoMiembro, setFiltroEstadoMiembro] = useState<'ACTIVOS' | 'TODOS' | 'INACTIVOS'>('ACTIVOS');
  const [filtroRama, setFiltroRama] = useState<string>('TODAS');
  const [soloPaseSugerido, setSoloPaseSugerido] = useState(false);
  const [unidadSeleccionada, setUnidadSeleccionada] = useState<string>('TODAS');

  // Ordenamiento por columnas (por defecto: Rama menor a mayor + Alfabético)
  const [campoOrden, setCampoOrden] = useState<CampoOrden>('rama');
  const [direccionOrden, setDireccionOrden] = useState<DireccionOrden>('asc');

  useEffect(() => {
    cargarDatos();
  }, [unidadSeleccionada]);

  const cargarDatos = async () => {
    setCargando(true);
    try {
      const urlUnidad = unidadSeleccionada !== 'TODAS' ? `&unidadId=${unidadSeleccionada}` : '';
      const [resMiembros, resCandidatos, resEntregas, resUnidades, resRoles, resRamas] =
        await Promise.all([
          api.get(`/miembros?porPagina=200${urlUnidad}&incluirInactivos=true`),
          api.get('/pases/candidatos').catch(() => ({ data: [] })),
          api.get('/legajos/entregas?cicloAnio=2026').catch(() => ({ data: [] })),
          api.get('/organizacion/unidades').catch(() => ({ data: [] })),
          api.get('/organizacion/roles').catch(() => ({ data: [] })),
          api.get('/organizacion/ramas').catch(() => ({ data: [] })),
        ]);

      setMiembros(resMiembros.data.items || []);
      setCandidatosPase(resCandidatos.data || []);
      setEntregas(resEntregas.data || []);
      setUnidades(resUnidades.data || []);
      setRoles(resRoles.data || []);
      setRamas(resRamas.data || []);
    } catch (err) {
      console.error('Error al cargar datos de unidad', err);
    } finally {
      setCargando(false);
    }
  };

  // Diccionario rápido de entregas de formularios por usuarioId
  const entregasPorUsuario = useMemo(() => {
    const mapa = new Map<number, any>();
    for (const ent of entregas) {
      if (!mapa.has(ent.usuarioId) || ent.estado === 'VALIDADO_FISICAMENTE') {
        mapa.set(ent.usuarioId, ent);
      }
    }
    return mapa;
  }, [entregas]);

  // Set de IDs de miembros con pase sugerido
  const candidatosIds = useMemo(() => {
    return new Set(candidatosPase.map((c) => c.usuario?.id));
  }, [candidatosPase]);


  // Manejador de clic en cabeceras para ordenar
  const handleOrdenar = (campo: CampoOrden) => {
    if (campoOrden === campo) {
      setDireccionOrden(direccionOrden === 'asc' ? 'desc' : 'asc');
    } else {
      setCampoOrden(campo);
      setDireccionOrden('asc');
    }
  };

  // Renderiza el icono de ordenamiento de cada columna
  const renderIconoOrden = (campo: CampoOrden) => {
    if (campoOrden !== campo) {
      return (
        <ArrowUpDown className="w-3 h-3 text-slate-300 dark:text-slate-600 group-hover:text-slate-500 dark:group-hover:text-slate-400 transition ml-1 shrink-0" />
      );
    }
    return direccionOrden === 'asc' ? (
      <ArrowUp className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 transition ml-1 shrink-0 font-bold" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 transition ml-1 shrink-0 font-bold" />
    );
  };

  // Filtrado y Ordenamiento reactivo completo
  const miembrosFiltradosYOrdenados = useMemo(() => {
    // 1. Filtrado
    const filtrados = miembros.filter((m) => {
      // Filtro de estado (Activo / Inactivo)
      if (filtroEstadoMiembro === 'ACTIVOS' && !m.activo) return false;
      if (filtroEstadoMiembro === 'INACTIVOS' && m.activo) return false;

      // Filtro de Rol / Categoría
      const asig = m.asignaciones?.[0];
      const esEdu =
        asig?.rol?.nombre?.toLowerCase().includes('educador') ||
        asig?.rol?.nombre?.toLowerCase().includes('jefe');

      if (filtroTipoRol === 'PROTAGONISTAS' && esEdu) return false;
      if (filtroTipoRol === 'EDUCADORES' && !esEdu) return false;

      // Filtro por Rama específica (Lobatos, Scout, Caminantes, Rover)
      if (filtroRama !== 'TODAS') {
        const cfg = obtenerConfigRama(m, unidades);
        if (cfg.key !== filtroRama) return false;
      }

      // Filtro de Ficha Médica
      const entrega = entregasPorUsuario.get(m.id);
      if (filtroFicha === 'VALIDADA' && entrega?.estado !== 'VALIDADO_FISICAMENTE') return false;
      if (filtroFicha === 'PENDIENTE' && entrega?.estado !== 'PENDIENTE_FIRMA_FISICA') return false;
      if (filtroFicha === 'SIN_FICHA' && entrega) return false;

      // Filtro de Solo con Pase Sugerido
      if (soloPaseSugerido && !candidatosIds.has(m.id)) return false;

      // Filtro de Texto
      if (filtroTexto.trim()) {
        const q = filtroTexto.toLowerCase().trim();
        const coincide =
          m.nombre.toLowerCase().includes(q) ||
          m.apellido.toLowerCase().includes(q) ||
          m.dni.includes(q) ||
          (m.emailContacto && m.emailContacto.toLowerCase().includes(q)) ||
          (m.telefonoContacto && m.telefonoContacto.includes(q)) ||
          (m.grupoFamiliar?.nombreFamilia &&
            m.grupoFamiliar.nombreFamilia.toLowerCase().includes(q));
        if (!coincide) return false;
      }

      return true;
    });

    // 2. Ordenamiento
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
            // Desempate por orden alfabético
            const nomA = `${a.apellido} ${a.nombre}`.toLowerCase();
            const nomB = `${b.apellido} ${b.nombre}`.toLowerCase();
            comp = nomA.localeCompare(nomB, 'es');
          }
          break;
        }

        case 'edad': {
          const tA = new Date(a.fechaNacimiento).getTime();
          const tB = new Date(b.fechaNacimiento).getTime();
          comp = tB - tA;
          break;
        }

        case 'ficha': {
          const jerarquiaFicha = (ent: any) => {
            if (!ent) return 4;
            if (ent.estado === 'VALIDADO_FISICAMENTE') return 1;
            if (ent.estado === 'PENDIENTE_FIRMA_FISICA') return 2;
            return 3;
          };
          const entA = entregasPorUsuario.get(a.id);
          const entB = entregasPorUsuario.get(b.id);
          comp = jerarquiaFicha(entA) - jerarquiaFicha(entB);
          if (comp === 0) {
            const nomA = `${a.apellido} ${a.nombre}`.toLowerCase();
            const nomB = `${b.apellido} ${b.nombre}`.toLowerCase();
            comp = nomA.localeCompare(nomB, 'es');
          }
          break;
        }

        default:
          comp = 0;
      }

      return direccionOrden === 'asc' ? comp : -comp;
    });
  }, [
    miembros,
    filtroEstadoMiembro,
    filtroTipoRol,
    filtroRama,
    filtroFicha,
    soloPaseSugerido,
    filtroTexto,
    entregasPorUsuario,
    candidatosIds,
    campoOrden,
    direccionOrden,
    unidades,
    ramas,
  ]);

  // Contadores para métricas
  const totalActivos = miembros.filter((m) => m.activo).length;
  const totalInactivos = miembros.filter((m) => !m.activo).length;

  const totalProtagonistas = miembros.filter(
    (m) =>
      m.activo &&
      !m.asignaciones.some(
        (a: any) =>
          a.rol.nombre.toLowerCase().includes('educador') ||
          a.rol.nombre.toLowerCase().includes('jefe'),
      ),
  ).length;

  const totalEducadores = miembros.filter(
    (m) =>
      m.activo &&
      m.asignaciones.some(
        (a: any) =>
          a.rol.nombre.toLowerCase().includes('educador') ||
          a.rol.nombre.toLowerCase().includes('jefe'),
      ),
  ).length;

  // Conteo por ramas (solo activos)
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

  const totalFichasValidadas = miembros.filter((m) => {
    const e = entregasPorUsuario.get(m.id);
    return m.activo && e?.estado === 'VALIDADO_FISICAMENTE';
  }).length;

  const calcularEdad = (fechaNacStr?: string) => {
    if (!fechaNacStr) return '—';
    const nac = new Date(fechaNacStr);
    const hoy = new Date();
    let edad = hoy.getFullYear() - nac.getFullYear();
    const m = hoy.getMonth() - nac.getMonth();
    if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--;
    return `${edad} años`;
  };

  const hayFiltrosActivos =
    filtroTexto !== '' ||
    filtroTipoRol !== 'TODOS' ||
    filtroFicha !== 'TODAS' ||
    filtroEstadoMiembro !== 'ACTIVOS' ||
    filtroRama !== 'TODAS' ||
    soloPaseSugerido ||
    unidadSeleccionada !== 'TODAS' ||
    campoOrden !== 'rama' ||
    direccionOrden !== 'asc';

  const limpiarFiltros = () => {
    setFiltroTexto('');
    setFiltroTipoRol('TODOS');
    setFiltroFicha('TODAS');
    setFiltroEstadoMiembro('ACTIVOS');
    setFiltroRama('TODAS');
    setSoloPaseSugerido(false);
    setUnidadSeleccionada('TODAS');
    setCampoOrden('rama');
    setDireccionOrden('asc');
  };

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
                Padrón de Rama y Unidad
              </h1>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Gestión integral de protagonistas, seguimiento pedagógico y control de fichas médicas
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
            <button
              onClick={() => setScannerAbierto(true)}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold text-xs transition cursor-pointer shadow-xs"
            >
              <QrCode className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Validar QR Físico</span>
            </button>

            <button
              onClick={() => setModalAltaAbierto(true)}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition shadow-xs cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>Dar de Alta Nuevo Miembro</span>
            </button>
          </div>
        </div>

        {/* Notificación de acciones */}
        {notificacion && (
          <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 rounded-xl text-xs font-semibold flex items-center justify-between">
            <span>{notificacion}</span>
            <button
              onClick={() => setNotificacion(null)}
              className="text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
            >
              Cerrar
            </button>
          </div>
        )}

        {/* Banner informativo de Pases de Rama Sugeridos */}
        {candidatosPase.length > 0 && (
          <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center text-amber-700 dark:text-amber-400 shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-amber-900 dark:text-amber-200 text-sm">
                  {candidatosPase.length === 1
                    ? 'Hay 1 protagonista con pase de rama sugerido por edad'
                    : `Hay ${candidatosPase.length} protagonistas con pase de rama sugerido por edad`}
                </h3>
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  Cumplieron la edad máxima de su rama actual y están listos para pasar a la siguiente sección.
                </p>
              </div>
            </div>
            <button
              onClick={() => setSoloPaseSugerido(!soloPaseSugerido)}
              className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs transition cursor-pointer flex items-center gap-1.5 shrink-0 shadow-xs"
            >
              <ArrowRightLeft className="w-4 h-4" />
              <span>{soloPaseSugerido ? 'Ver todo el padrón' : `Ver candidatos (${candidatosPase.length})`}</span>
            </button>
          </div>
        )}

        {/* Tarjetas de Estadísticas de la Unidad y Ramas (Filtros interactivos al hacer clic) */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
          {/* 1. Total Activos */}
          <div
            onClick={() => {
              setFiltroEstadoMiembro('ACTIVOS');
              setFiltroTipoRol('TODOS');
              setFiltroFicha('TODAS');
            }}
            className={`p-4 rounded-xl border shadow-xs flex items-center justify-between cursor-pointer transition hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700 ${
              filtroEstadoMiembro === 'ACTIVOS' && filtroTipoRol === 'TODOS' && filtroFicha === 'TODAS'
                ? 'bg-slate-100/70 dark:bg-slate-800 border-slate-400 dark:border-slate-600 ring-2 ring-slate-400 dark:ring-slate-500'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
            }`}
            title="Haz clic para ver todos los miembros activos"
          >
            <div>
              <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 block uppercase tracking-wider">
                Total Activos
              </span>
              <span className="text-2xl font-black text-slate-900 dark:text-slate-100">{totalActivos}</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 text-lg">
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
              <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 block uppercase tracking-wider">
                Protagonistas
              </span>
              <span className="text-2xl font-black text-emerald-700 dark:text-emerald-300">{totalProtagonistas}</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400 text-lg">
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
              <span className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 block uppercase tracking-wider">
                Educadores
              </span>
              <span className="text-2xl font-black text-indigo-700 dark:text-indigo-300">{totalEducadores}</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400 text-lg">
              🎓
            </div>
          </div>

          {/* 4. Fichas Validadas */}
          <div
            onClick={() => {
              setFiltroEstadoMiembro('ACTIVOS');
              setFiltroFicha(
                filtroFicha === 'VALIDADA' && filtroEstadoMiembro === 'ACTIVOS' ? 'TODAS' : 'VALIDADA'
              );
            }}
            className={`p-4 rounded-xl border shadow-xs flex items-center justify-between cursor-pointer transition hover:shadow-md hover:border-blue-300 dark:hover:border-blue-700 ${
              filtroFicha === 'VALIDADA' && filtroEstadoMiembro === 'ACTIVOS'
                ? 'bg-blue-50 dark:bg-blue-950/50 border-blue-400 dark:border-blue-600 ring-2 ring-blue-500'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
            }`}
            title="Haz clic para filtrar u alternar fichas médicas validadas"
          >
            <div>
              <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 block uppercase tracking-wider">
                Fichas Validadas
              </span>
              <span className="text-2xl font-black text-blue-700 dark:text-blue-300">
                {totalFichasValidadas} / {totalActivos}
              </span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/50 flex items-center justify-center text-blue-600 dark:text-blue-400 text-lg">
              📋
            </div>
          </div>

          {/* 5. Inactivos / Bajas (Discreto, neutro y clicable) */}
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
            <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400 text-lg">
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
                filtroRama === 'lobatos'
                  ? 'ring-2 ring-amber-500 scale-105'
                  : 'hover:opacity-80'
              } ${RAMA_COLORS.lobatos.badgeClases}`}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              <span>Lobatos ({totalLobatos})</span>
            </button>

            <button
              onClick={() => setFiltroRama(filtroRama === 'scout' ? 'TODAS' : 'scout')}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-bold text-xs border transition cursor-pointer shadow-2xs ${
                filtroRama === 'scout'
                  ? 'ring-2 ring-emerald-500 scale-105'
                  : 'hover:opacity-80'
              } ${RAMA_COLORS.scout.badgeClases}`}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span>Scout ({totalScout})</span>
            </button>

            <button
              onClick={() => setFiltroRama(filtroRama === 'caminantes' ? 'TODAS' : 'caminantes')}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-bold text-xs border transition cursor-pointer shadow-2xs ${
                filtroRama === 'caminantes'
                  ? 'ring-2 ring-sky-500 scale-105'
                  : 'hover:opacity-80'
              } ${RAMA_COLORS.caminantes.badgeClases}`}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-sky-500" />
              <span>Caminantes ({totalCaminantes})</span>
            </button>

            <button
              onClick={() => setFiltroRama(filtroRama === 'rover' ? 'TODAS' : 'rover')}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-bold text-xs border transition cursor-pointer shadow-2xs ${
                filtroRama === 'rover'
                  ? 'ring-2 ring-red-500 scale-105'
                  : 'hover:opacity-80'
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

        {/* Panel de Filtros Completo */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-xs space-y-3">
          {/* Fila 1: Pestañas de Estado, Rol y Buscador */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
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

            {/* Buscador de texto */}
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Buscar por nombre, apellido, DNI, teléfono, familia..."
                value={filtroTexto}
                onChange={(e) => setFiltroTexto(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs focus:border-emerald-500 outline-none bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
              />
            </div>
          </div>

          {/* Fila 2: Filtros secundarios y selector de orden */}
          <div className="flex flex-wrap items-center gap-2.5 pt-1 text-xs">
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
                    : campoOrden === 'dni' && direccionOrden === 'desc'
                    ? 'dni_desc'
                    : campoOrden === 'edad' && direccionOrden === 'asc'
                    ? 'edad_asc'
                    : campoOrden === 'edad' && direccionOrden === 'desc'
                    ? 'edad_desc'
                    : 'ficha_asc'
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
                    case 'edad_asc':
                      setCampoOrden('edad');
                      setDireccionOrden('asc');
                      break;
                    case 'edad_desc':
                      setCampoOrden('edad');
                      setDireccionOrden('desc');
                      break;
                    case 'ficha_asc':
                      setCampoOrden('ficha');
                      setDireccionOrden('asc');
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
                <option value="edad_asc">Edad (Menor a Mayor)</option>
                <option value="edad_desc">Edad (Mayor a Menor)</option>
                <option value="ficha_asc">Ficha Médica (Validadas primero)</option>
              </select>
            </div>

            {/* Filtro de Ficha Médica */}
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400 dark:text-slate-500 font-medium text-[11px]">Ficha 2026:</span>
              <select
                value={filtroFicha}
                onChange={(e) => setFiltroFicha(e.target.value as any)}
                className="px-2.5 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-medium bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 outline-none focus:border-emerald-500 cursor-pointer"
              >
                <option value="TODAS">Todas las fichas</option>
                <option value="VALIDADA">✓ Validada Físicamente</option>
                <option value="PENDIENTE">⏳ Pendiente de Firma Física</option>
                <option value="SIN_FICHA">⚠️ Sin Ficha Entregada</option>
              </select>
            </div>

            {/* Selector de Rama */}
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400 dark:text-slate-500 font-medium text-[11px]">Rama:</span>
              <select
                value={filtroRama}
                onChange={(e) => setFiltroRama(e.target.value)}
                className="px-2.5 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-medium bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 outline-none focus:border-emerald-500 cursor-pointer"
              >
                <option value="TODAS">Todas las Ramas</option>
                <option value="lobatos">Lobatos (Amarillo)</option>
                <option value="scout">Scout (Verde)</option>
                <option value="caminantes">Caminantes (Celeste)</option>
                <option value="rover">Rover (Rojo)</option>
                <option value="adultos">Educadores / Jefatura</option>
              </select>
            </div>

            {/* Selector de Unidad (si hay más de 1 unidad) */}
            {unidades.length > 1 && (
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400 dark:text-slate-500 font-medium text-[11px]">Unidad:</span>
                <select
                  value={unidadSeleccionada}
                  onChange={(e) => setUnidadSeleccionada(e.target.value)}
                  className="px-2.5 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-medium bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 outline-none focus:border-emerald-500 cursor-pointer"
                >
                  <option value="TODAS">Todas mis unidades</option>
                  {unidades.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nombre}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Toggle de Pases Sugeridos */}
            {candidatosPase.length > 0 && (
              <button
                type="button"
                onClick={() => setSoloPaseSugerido(!soloPaseSugerido)}
                className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                  soloPaseSugerido
                    ? 'bg-amber-100 dark:bg-amber-950/60 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 shadow-2xs'
                    : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <span>Pases sugeridos ({candidatosPase.length})</span>
              </button>
            )}

            {/* Limpiar Filtros */}
            {hayFiltrosActivos && (
              <button
                onClick={limpiarFiltros}
                className="ml-auto text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 font-semibold text-[11px] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <XCircle className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                <span>Limpiar filtros</span>
              </button>
            )}
          </div>
        </div>

        {/* Resumen de resultados y aviso si se ven inactivos */}
        <div className="flex flex-wrap items-center justify-between text-xs text-slate-500 dark:text-slate-400 px-1 gap-2">
          <div className="flex items-center gap-2">
            <span>
              Mostrando <strong>{miembrosFiltradosYOrdenados.length}</strong> de {miembros.length} miembros
            </span>
            {filtroEstadoMiembro === 'INACTIVOS' && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-700 flex items-center gap-1">
                <UserX className="w-3 h-3 text-slate-500 dark:text-slate-400" />
                Mostrando solo miembros dados de baja
              </span>
            )}
            {filtroEstadoMiembro === 'TODOS' && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200">
                Mostrando activos e inactivos
              </span>
            )}
          </div>

          <span className="text-[11px] text-slate-400 dark:text-slate-500">
            Ordenado por:{' '}
            <strong className="text-slate-700 dark:text-slate-300">
              {campoOrden === 'rama'
                ? 'Rama (Menor a Mayor) + Alfabético'
                : campoOrden === 'miembro'
                ? `Alfabético (${direccionOrden.toUpperCase()})`
                : campoOrden === 'dni'
                ? `DNI (${direccionOrden === 'asc' ? 'Menor a Mayor' : 'Mayor a Menor'})`
                : campoOrden === 'edad'
                ? `Edad (${direccionOrden === 'asc' ? 'Menor a Mayor' : 'Mayor a Menor'})`
                : 'Ficha Médica'}
            </strong>{' '}
            (haz clic en la columna para cambiar)
          </span>
        </div>

        {/* Tabla de Miembros del Padrón con Colores por Rama */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
              <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 text-slate-400 dark:text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                <tr>
                  {/* Columna Miembro (Ordenable) */}
                  <th
                    onClick={() => handleOrdenar('miembro')}
                    className="py-3 px-4 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition select-none group"
                    title="Haz clic para ordenar por nombre y apellido"
                  >
                    <div className="flex items-center gap-1">
                      <span>Miembro</span>
                      {renderIconoOrden('miembro')}
                    </div>
                  </th>

                  {/* Columna DNI (Ordenable) */}
                  <th
                    onClick={() => handleOrdenar('dni')}
                    className="py-3 px-4 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition select-none group"
                    title="Haz clic para ordenar por número de DNI"
                  >
                    <div className="flex items-center gap-1">
                      <span>DNI</span>
                      {renderIconoOrden('dni')}
                    </div>
                  </th>

                  {/* Columna Edad (Ordenable) */}
                  <th
                    onClick={() => handleOrdenar('edad')}
                    className="py-3 px-4 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition select-none group"
                    title="Haz clic para ordenar por edad"
                  >
                    <div className="flex items-center gap-1">
                      <span>Edad</span>
                      {renderIconoOrden('edad')}
                    </div>
                  </th>

                  {/* Columna Rama / Unidad (Ordenable de menor a mayor) */}
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

                  {/* Columna Ficha Médica 2026 (Ordenable) */}
                  <th
                    onClick={() => handleOrdenar('ficha')}
                    className="py-3 px-4 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition select-none group"
                    title="Haz clic para ordenar por estado de ficha médica"
                  >
                    <div className="flex items-center gap-1">
                      <span>Ficha Médica 2026</span>
                      {renderIconoOrden('ficha')}
                    </div>
                  </th>

                  <th className="py-3 px-4">Contacto Familiar</th>
                  <th className="py-3 px-4 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {miembrosFiltradosYOrdenados.map((m) => {
                  const asig = m.asignaciones?.[0];
                  const entrega = entregasPorUsuario.get(m.id);
                  const tienePase = candidatosIds.has(m.id);
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
                      {/* Miembro */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          {/* Avatar con Color de la Rama */}
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
                              {tienePase && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setMiembroSeleccionadoId(m.id);
                                    setTabInicialModal('pase');
                                  }}
                                  title="Cumplió la edad para cambio de rama. Clic para gestionar pase."
                                  className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 hover:bg-amber-200 dark:bg-amber-950/70 dark:hover:bg-amber-900/80 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700/60 flex items-center gap-1 cursor-pointer transition shadow-2xs"
                                >
                                  <Sparkles className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                                  <span>Pase</span>
                                </button>
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

                      {/* DNI */}
                      <td className="py-3.5 px-4">
                        <span className="font-mono font-medium text-slate-800 dark:text-slate-200 block">{m.dni}</span>
                      </td>

                      {/* Edad */}
                      <td className="py-3.5 px-4">
                        <span className="font-medium text-slate-700 dark:text-slate-300 block">
                          {calcularEdad(m.fechaNacimiento)}
                        </span>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 block">
                          {new Date(m.fechaNacimiento).toLocaleDateString()}
                        </span>
                      </td>

                      {/* Rama Asignada / Unidad con Badge de Color */}
                      <td className="py-3.5 px-4">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-bold text-[10px] border shadow-2xs ${cfg.badgeClases}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dotColor}`} />
                            {cfg.nombre}
                          </span>
                          {asig?.rol?.nombre && (
                            <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                              {asig.rol.nombre}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-600 dark:text-slate-400 font-medium mt-0.5">
                          {asig?.unidad?.nombre || 'Sin Unidad'}
                        </div>
                      </td>

                      {/* Ficha Médica */}
                      <td className="py-3.5 px-4">
                        {entrega?.estado === 'VALIDADO_FISICAMENTE' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                            Validada
                          </span>
                        ) : entrega?.estado === 'PENDIENTE_FIRMA_FISICA' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                            <Clock className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                            Pendiente Firma
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                            Sin Ficha
                          </span>
                        )}
                      </td>

                      {/* Contacto Familiar */}
                      <td className="py-3.5 px-4">
                        <div className="font-medium text-slate-700 dark:text-slate-300">
                          {m.telefonoContacto || 'Sin teléfono'}
                        </div>
                        <div className="text-[10px] text-slate-400 dark:text-slate-500">
                          {m.emailContacto || 'Sin email'}
                        </div>
                      </td>

                      {/* Acción: Editar miembro o Gestionar Pase directo */}
                      <td className="py-3.5 px-4 text-right">
                        {tienePase ? (
                          <button
                            onClick={() => {
                              setMiembroSeleccionadoId(m.id);
                              setTabInicialModal('pase');
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs transition cursor-pointer shadow-xs"
                          >
                            <ArrowRightLeft className="w-3.5 h-3.5" />
                            <span>Gestionar Pase</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              setMiembroSeleccionadoId(m.id);
                              setTabInicialModal('datos');
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-xl text-xs transition cursor-pointer"
                          >
                            <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                            <span>Gestionar</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {miembrosFiltradosYOrdenados.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400 dark:text-slate-500 text-xs">
                      {cargando
                        ? 'Cargando padrón de la unidad...'
                        : 'No se encontraron miembros con los filtros seleccionados.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Modal Ficha Completa y Edición del Miembro */}
      {miembroSeleccionadoId !== null && (
        <ModalDetalleMiembro
          usuarioId={miembroSeleccionadoId}
          tabInicial={tabInicialModal}
          onCerrar={() => setMiembroSeleccionadoId(null)}
          onActualizado={() => {
            cargarDatos();
            setNotificacion('Información del miembro actualizada con éxito.');
          }}
          onClaveReseteada={(msg) => setNotificacion(msg)}
        />
      )}

      {/* Modal Alta de Miembro */}
      <ModalAltaMiembro
        abierto={modalAltaAbierto}
        onCerrar={() => setModalAltaAbierto(false)}
        onCreado={() => {
          cargarDatos();
          setNotificacion('Nuevo miembro dado de alta exitosamente en la unidad.');
        }}
        unidadesDisponibles={unidades}
        rolesDisponibles={roles}
      />

      {/* Modal Scanner QR Físico */}
      <QrScannerModal
        abierto={scannerAbierto}
        onCerrar={() => setScannerAbierto(false)}
        onValidadoExitoso={(detalle) => {
          setNotificacion(
            `Ficha médica de ${detalle.usuario.nombre} ${detalle.usuario.apellido} validada físicamente con éxito.`,
          );
          cargarDatos();
        }}
      />
    </div>
  );
};
