import React, { useEffect, useState, useMemo } from 'react';
import { api } from '../../api/client';
import { Navbar } from '../../components/Navbar';
import { QrScannerModal } from '../../components/QrScannerModal';
import { ModalDetalleMiembro } from '../../components/ModalDetalleMiembro';
import { ModalAltaMiembro } from '../../components/ModalAltaMiembro';
import { MiembroCard } from '../../components/MiembroCard';
import { BotonLlamarMiembro } from '../../components/BotonLlamarMiembro';
import { obtenerConfigRama, obtenerOrdenRama, RAMA_COLORS } from '../../lib/ramaColors';
import {
  ESTADO_FICHA_CONFIG,
  calcularEdad,
  formatearMoneda,
  formatearNombreFamilia,
  normalizarTextoBusqueda,
  traducirErrorAmigable,
} from '../../lib/formatters';
import {
  Users,
  QrCode,
  UserPlus,
  Search,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Sparkles,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  UserX,
  X,
  CreditCard,
  FileCheck2,
  Loader2,
} from 'lucide-react';

type CampoOrden = 'miembro' | 'edad' | 'rama' | 'ficha';
type DireccionOrden = 'asc' | 'desc';
type ChipFiltro =
  | 'TODOS'
  | 'lobatos'
  | 'scout'
  | 'caminantes'
  | 'rover'
  | 'EDUCADORES'
  | 'CON_DEUDA'
  | 'FALTA_FICHA'
  | 'PASE_SUGERIDO'
  | 'BAJAS';

const calcularDeudaMiembro = (m: any): number =>
  Math.round(
    (m?.cargos || []).reduce(
      (acc: number, c: any) => acc + Math.max(0, Number(c.montoFinal) - Number(c.montoPagado)),
      0,
    ) * 100,
  ) / 100;

export const UnidadPage: React.FC = () => {
  const [miembros, setMiembros] = useState<any[]>([]);
  const [candidatosPase, setCandidatosPase] = useState<any[]>([]);
  const [entregas, setEntregas] = useState<any[]>([]);
  const [unidades, setUnidades] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [ramas, setRamas] = useState<any[]>([]);
  const [cargando, setCargando] = useState(false);
  const [validandoId, setValidandoId] = useState<number | null>(null);
  const [toast, setToast] = useState<{ texto: string; tipo: 'exito' | 'error' } | null>(null);

  // Modales
  const [scannerAbierto, setScannerAbierto] = useState(false);
  const [modalAltaAbierto, setModalAltaAbierto] = useState(false);
  const [miembroSeleccionadoId, setMiembroSeleccionadoId] = useState<number | null>(null);
  const [tabInicialModal, setTabInicialModal] = useState<
    'datos' | 'pase' | 'seguridad' | 'ficha' | 'cuotas'
  >('datos');

  // Filtros rápidos (1-Tap)
  const [busqueda, setBusqueda] = useState('');
  const [chipActivo, setChipActivo] = useState<ChipFiltro>('TODOS');

  // Ordenamiento
  const [campoOrden, setCampoOrden] = useState<CampoOrden>('rama');
  const [direccionOrden, setDireccionOrden] = useState<DireccionOrden>('asc');

  const mostrarToast = (texto: string, tipo: 'exito' | 'error' = 'exito') => {
    setToast({ texto, tipo });
  };

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    setCargando(true);
    try {
      const [resMiembros, resCandidatos, resEntregas, resUnidades, resRoles, resRamas] =
        await Promise.all([
          api.get('/miembros?porPagina=200&incluirInactivos=true'),
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
      mostrarToast(traducirErrorAmigable(err, 'No se pudo cargar el padrón.'), 'error');
    } finally {
      setCargando(false);
    }
  };

  // Diccionario rápido de entregas por usuarioId
  const entregasPorUsuario = useMemo(() => {
    const mapa = new Map<number, any>();
    for (const ent of entregas) {
      if (!mapa.has(ent.usuarioId) || ent.estado === 'VALIDADO_FISICAMENTE') {
        mapa.set(ent.usuarioId, ent);
      }
    }
    return mapa;
  }, [entregas]);

  const candidatosIds = useMemo(() => {
    return new Set(candidatosPase.map((c) => c.usuario?.id));
  }, [candidatosPase]);

  // Acción rápida 1-Tap: Recibir y validar ficha física sin abrir modales
  const handleValidarFichaDirecto = async (entrega: any) => {
    if (!entrega?.hashVerificacion) return;
    setValidandoId(entrega.id);
    try {
      await api.post(`/legajos/qr/validar/${entrega.hashVerificacion}`);
      mostrarToast('Ficha validada como entregada en papel.');
      await cargarDatos();
    } catch (err) {
      mostrarToast(traducirErrorAmigable(err, 'No se pudo validar la ficha.'), 'error');
    } finally {
      setValidandoId(null);
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
      return <ArrowUpDown className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 ml-1 shrink-0" />;
    }
    return direccionOrden === 'asc' ? (
      <ArrowUp className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 ml-1 shrink-0" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 ml-1 shrink-0" />
    );
  };

  // Filtrado y Ordenamiento reactivo
  const miembrosFiltrados = useMemo(() => {
    const q = normalizarTextoBusqueda(busqueda);

    const filtrados = miembros.filter((m) => {
      // Estado activo/baja según chip
      if (chipActivo === 'BAJAS') {
        if (m.activo) return false;
      } else {
        if (!m.activo) return false;
      }

      const asig = m.asignaciones?.[0];
      const esEdu =
        asig?.rol?.nombre?.toLowerCase().includes('educador') ||
        asig?.rol?.nombre?.toLowerCase().includes('jefe');
      const cfg = obtenerConfigRama(m, unidades);
      const entrega = entregasPorUsuario.get(m.id);

      if (chipActivo === 'EDUCADORES' && !esEdu) return false;
      if (
        (chipActivo === 'lobatos' ||
          chipActivo === 'scout' ||
          chipActivo === 'caminantes' ||
          chipActivo === 'rover') &&
        cfg.key !== chipActivo
      ) {
        return false;
      }
      if (chipActivo === 'FALTA_FICHA' && entrega?.estado === 'VALIDADO_FISICAMENTE') {
        return false;
      }
      if (chipActivo === 'CON_DEUDA' && calcularDeudaMiembro(m) <= 0) {
        return false;
      }
      if (chipActivo === 'PASE_SUGERIDO' && !candidatosIds.has(m.id)) {
        return false;
      }

      if (q) {
        const asig = m.asignaciones?.[0];
        const cfg = obtenerConfigRama(m, unidades);
        const coincide =
          normalizarTextoBusqueda(m.nombre).includes(q) ||
          normalizarTextoBusqueda(m.apellido).includes(q) ||
          normalizarTextoBusqueda(`${m.nombre} ${m.apellido}`).includes(q) ||
          normalizarTextoBusqueda(`${m.apellido} ${m.nombre}`).includes(q) ||
          normalizarTextoBusqueda(m.dni).includes(q) ||
          normalizarTextoBusqueda(m.telefonoContacto).includes(q) ||
          normalizarTextoBusqueda(m.grupoFamiliar?.nombreFamilia).includes(q) ||
          normalizarTextoBusqueda(asig?.unidad?.nombre).includes(q) ||
          normalizarTextoBusqueda(cfg.nombre).includes(q);
        if (!coincide) return false;
      }

      return true;
    });

    return filtrados.sort((a, b) => {
      let comp = 0;
      switch (campoOrden) {
        case 'miembro': {
          comp = `${a.apellido} ${a.nombre}`
            .toLowerCase()
            .localeCompare(`${b.apellido} ${b.nombre}`.toLowerCase(), 'es');
          break;
        }
        case 'rama': {
          const ordenA = obtenerOrdenRama(a, unidades, ramas);
          const ordenB = obtenerOrdenRama(b, unidades, ramas);
          comp =
            ordenA !== ordenB
              ? ordenA - ordenB
              : `${a.apellido} ${a.nombre}`
                  .toLowerCase()
                  .localeCompare(`${b.apellido} ${b.nombre}`.toLowerCase(), 'es');
          break;
        }
        case 'edad': {
          comp = new Date(b.fechaNacimiento).getTime() - new Date(a.fechaNacimiento).getTime();
          break;
        }
        case 'ficha': {
          const peso = (ent: any) => {
            if (!ent) return 3;
            if (ent.estado === 'PENDIENTE_FIRMA_FISICA') return 1;
            if (ent.estado === 'VALIDADO_FISICAMENTE') return 2;
            return 3;
          };
          comp = peso(entregasPorUsuario.get(a.id)) - peso(entregasPorUsuario.get(b.id));
          break;
        }
      }
      return direccionOrden === 'asc' ? comp : -comp;
    });
  }, [
    miembros,
    chipActivo,
    busqueda,
    entregasPorUsuario,
    candidatosIds,
    campoOrden,
    direccionOrden,
    unidades,
    ramas,
  ]);

  // Contadores rápidos para los chips
  const conteos = useMemo(() => {
    const activos = miembros.filter((m) => m.activo);
    return {
      todos: activos.length,
      lobatos: activos.filter((m) => obtenerConfigRama(m, unidades).key === 'lobatos').length,
      scout: activos.filter((m) => obtenerConfigRama(m, unidades).key === 'scout').length,
      caminantes: activos.filter((m) => obtenerConfigRama(m, unidades).key === 'caminantes').length,
      rover: activos.filter((m) => obtenerConfigRama(m, unidades).key === 'rover').length,
      educadores: activos.filter((m) =>
        m.asignaciones?.some(
          (a: any) =>
            a.rol?.nombre?.toLowerCase().includes('educador') ||
            a.rol?.nombre?.toLowerCase().includes('jefe'),
        ),
      ).length,
      faltaFicha: activos.filter(
        (m) => entregasPorUsuario.get(m.id)?.estado !== 'VALIDADO_FISICAMENTE',
      ).length,
      conDeuda: activos.filter((m) => calcularDeudaMiembro(m) > 0).length,
      bajas: miembros.filter((m) => !m.activo).length,
    };
  }, [miembros, unidades, entregasPorUsuario]);

  const abrirMiembro = (
    id: number,
    tab: 'datos' | 'pase' | 'seguridad' | 'ficha' | 'cuotas' = 'datos',
  ) => {
    setMiembroSeleccionadoId(id);
    setTabInicialModal(tab);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 pb-24 sm:pb-10 transition-colors">
      <Navbar />

      {/* Toast Flotante No Bloqueante */}
      {toast && (
        <div className="fixed bottom-20 sm:bottom-6 right-4 left-4 sm:left-auto sm:max-w-sm z-50 animate-in fade-in slide-in-from-bottom-4">
          <div
            className={`px-4 py-3 rounded-2xl shadow-lg border text-xs font-bold flex items-center justify-between gap-3 ${
              toast.tipo === 'exito'
                ? 'bg-emerald-600 text-white border-emerald-500'
                : 'bg-rose-600 text-white border-rose-500'
            }`}
          >
            <span>{toast.texto}</span>
            <button
              onClick={() => setToast(null)}
              className="p-1 hover:bg-white/20 rounded-lg cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4">
        {/* Cabecera Compacta */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-slate-100">
                Padrón del Grupo
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300">
                {miembrosFiltrados.length}
              </span>
            </div>
          </div>

          {/* Botones de Acción Principal (Touch target >= 44px) */}
          <div className="grid grid-cols-2 sm:flex items-center gap-2">
            <button
              onClick={() => setScannerAbierto(true)}
              className="min-h-[44px] px-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100 font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-2xs"
            >
              <QrCode className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>Escanear QR</span>
            </button>

            <button
              onClick={() => setModalAltaAbierto(true)}
              className="min-h-[44px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-2 transition shadow-2xs cursor-pointer"
            >
              <UserPlus className="w-4 h-4 shrink-0" />
              <span>Nuevo Miembro</span>
            </button>
          </div>
        </div>

        {/* Buscador Único en Vivo */}
        <div className="relative w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            inputMode="search"
            placeholder="Buscar por nombre, apellido, DNI, familia o rama..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full min-h-[44px] pl-10 pr-10 py-2 rounded-2xl border border-slate-300 dark:border-slate-700 text-sm focus:border-emerald-500 outline-none bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 shadow-2xs [&::-webkit-search-cancel-button]:hidden"
          />
          {busqueda && (
            <button
              type="button"
              onClick={() => setBusqueda('')}
              aria-label="Limpiar búsqueda"
              className="min-w-[40px] min-h-[40px] flex items-center justify-center absolute right-1 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Barra de Chips Táctiles (1-Tap Filters) con Scroll Horizontal en Móvil */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar -mx-3 px-3 sm:mx-0 sm:px-0 sm:flex-wrap">
          <button
            onClick={() => setChipActivo('TODOS')}
            className={`min-h-[40px] px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition cursor-pointer border ${
              chipActivo === 'TODOS'
                ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white shadow-2xs'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800'
            }`}
          >
            Todos ({conteos.todos})
          </button>

          <button
            onClick={() => setChipActivo(chipActivo === 'lobatos' ? 'TODOS' : 'lobatos')}
            className={`min-h-[40px] px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap inline-flex items-center gap-1.5 transition cursor-pointer border ${
              chipActivo === 'lobatos'
                ? 'ring-2 ring-amber-500 ' + RAMA_COLORS.lobatos.badgeClases
                : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800'
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            <span>Lobatos ({conteos.lobatos})</span>
          </button>

          <button
            onClick={() => setChipActivo(chipActivo === 'scout' ? 'TODOS' : 'scout')}
            className={`min-h-[40px] px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap inline-flex items-center gap-1.5 transition cursor-pointer border ${
              chipActivo === 'scout'
                ? 'ring-2 ring-emerald-500 ' + RAMA_COLORS.scout.badgeClases
                : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800'
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span>Scout ({conteos.scout})</span>
          </button>

          <button
            onClick={() => setChipActivo(chipActivo === 'caminantes' ? 'TODOS' : 'caminantes')}
            className={`min-h-[40px] px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap inline-flex items-center gap-1.5 transition cursor-pointer border ${
              chipActivo === 'caminantes'
                ? 'ring-2 ring-sky-500 ' + RAMA_COLORS.caminantes.badgeClases
                : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800'
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-sky-500" />
            <span>Caminantes ({conteos.caminantes})</span>
          </button>

          <button
            onClick={() => setChipActivo(chipActivo === 'rover' ? 'TODOS' : 'rover')}
            className={`min-h-[40px] px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap inline-flex items-center gap-1.5 transition cursor-pointer border ${
              chipActivo === 'rover'
                ? 'ring-2 ring-red-500 ' + RAMA_COLORS.rover.badgeClases
                : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800'
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
            <span>Rover ({conteos.rover})</span>
          </button>

          <button
            onClick={() => setChipActivo(chipActivo === 'EDUCADORES' ? 'TODOS' : 'EDUCADORES')}
            className={`min-h-[40px] px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap inline-flex items-center gap-1.5 transition cursor-pointer border ${
              chipActivo === 'EDUCADORES'
                ? 'ring-2 ring-indigo-500 ' + RAMA_COLORS.adultos.badgeClases
                : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800'
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
            <span>Educadores ({conteos.educadores})</span>
          </button>

          <button
            onClick={() => setChipActivo(chipActivo === 'FALTA_FICHA' ? 'TODOS' : 'FALTA_FICHA')}
            className={`min-h-[40px] px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap inline-flex items-center gap-1.5 transition cursor-pointer border ${
              chipActivo === 'FALTA_FICHA'
                ? 'bg-rose-600 text-white border-rose-600 shadow-2xs'
                : 'bg-white dark:bg-slate-900 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-900/60'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Falta Ficha ({conteos.faltaFicha})</span>
          </button>

          {conteos.conDeuda > 0 && (
            <button
              onClick={() => setChipActivo(chipActivo === 'CON_DEUDA' ? 'TODOS' : 'CON_DEUDA')}
              className={`min-h-[40px] px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap inline-flex items-center gap-1.5 transition cursor-pointer border ${
                chipActivo === 'CON_DEUDA'
                  ? 'bg-rose-600 text-white border-rose-600 shadow-2xs'
                  : 'bg-white dark:bg-slate-900 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-900/60'
              }`}
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span>Con Deuda ({conteos.conDeuda})</span>
            </button>
          )}

          {candidatosPase.length > 0 && (
            <button
              onClick={() =>
                setChipActivo(chipActivo === 'PASE_SUGERIDO' ? 'TODOS' : 'PASE_SUGERIDO')
              }
              className={`min-h-[40px] px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap inline-flex items-center gap-1.5 transition cursor-pointer border ${
                chipActivo === 'PASE_SUGERIDO'
                  ? 'bg-amber-500 text-slate-950 border-amber-500 shadow-2xs'
                  : 'bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Pases por edad ({candidatosPase.length})</span>
            </button>
          )}

          {conteos.bajas > 0 && (
            <button
              onClick={() => setChipActivo(chipActivo === 'BAJAS' ? 'TODOS' : 'BAJAS')}
              className={`min-h-[40px] px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap inline-flex items-center gap-1.5 transition cursor-pointer border ${
                chipActivo === 'BAJAS'
                  ? 'bg-slate-700 text-white border-slate-700'
                  : 'bg-white dark:bg-slate-900 text-slate-500 border-slate-200 dark:border-slate-800'
              }`}
            >
              <UserX className="w-3.5 h-3.5" />
              <span>Bajas ({conteos.bajas})</span>
            </button>
          )}
        </div>

        {/* Estado de Carga (Skeleton) */}
        {cargando ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-24 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-pulse p-4 flex items-center gap-3"
              >
                <div className="w-11 h-11 rounded-2xl bg-slate-200 dark:bg-slate-800 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-40 bg-slate-200 dark:bg-slate-800 rounded" />
                  <div className="h-3 w-28 bg-slate-100 dark:bg-slate-800/60 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : miembrosFiltrados.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-10 text-center space-y-3">
            <Users className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto" />
            <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
              No encontramos personas con este filtro
            </p>
            {(busqueda || chipActivo !== 'TODOS') && (
              <button
                onClick={() => {
                  setBusqueda('');
                  setChipActivo('TODOS');
                }}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold text-xs cursor-pointer"
              >
                Mostrar todos
              </button>
            )}
          </div>
        ) : (
          <>
            {/* ============================================================== */}
            {/* VISTA MÓVIL (< md): Tarjetas Apiladas con Acciones 1-Tap       */}
            {/* ============================================================== */}
            <div className="grid grid-cols-1 gap-3 md:hidden">
              {miembrosFiltrados.map((m) => (
                <MiembroCard
                  key={m.id}
                  miembro={m}
                  unidades={unidades}
                  entrega={entregasPorUsuario.get(m.id)}
                  tienePaseSugerido={candidatosIds.has(m.id)}
                  validandoDirecto={validandoId === entregasPorUsuario.get(m.id)?.id}
                  onAbrirDetalle={(tab) => abrirMiembro(m.id, tab)}
                  onValidarFichaDirecto={handleValidarFichaDirecto}
                />
              ))}
            </div>

            {/* ============================================================== */}
            {/* VISTA ESCRITORIO (md+): Tabla Limpia enfocada en lo Vital       */}
            {/* ============================================================== */}
            <div className="hidden md:block bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden">
              <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
                <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th
                      onClick={() => handleOrdenar('miembro')}
                      className="py-3.5 px-4 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition select-none"
                    >
                      <div className="flex items-center">
                        <span>Nombre y Familia</span>
                        {renderIconoOrden('miembro')}
                      </div>
                    </th>
                    <th
                      onClick={() => handleOrdenar('rama')}
                      className="py-3.5 px-4 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition select-none"
                    >
                      <div className="flex items-center">
                        <span>Rama / Sección</span>
                        {renderIconoOrden('rama')}
                      </div>
                    </th>
                    <th
                      onClick={() => handleOrdenar('edad')}
                      className="py-3.5 px-4 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition select-none"
                    >
                      <div className="flex items-center">
                        <span>Edad</span>
                        {renderIconoOrden('edad')}
                      </div>
                    </th>
                    <th
                      onClick={() => handleOrdenar('ficha')}
                      className="py-3.5 px-4 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition select-none"
                    >
                      <div className="flex items-center">
                        <span>Ficha 2026</span>
                        {renderIconoOrden('ficha')}
                      </div>
                    </th>
                    <th className="py-3.5 px-4 text-right">Acciones Rápidas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {miembrosFiltrados.map((m) => {
                    const asig = m.asignaciones?.[0];
                    const entrega = entregasPorUsuario.get(m.id);
                    const tienePase = candidatosIds.has(m.id);
                    const cfg = obtenerConfigRama(m, unidades);
                    const edad = calcularEdad(m.fechaNacimiento);
                    const estadoKey = entrega?.estado || 'SIN_FICHA';
                    const cfgFicha = ESTADO_FICHA_CONFIG[estadoKey] || ESTADO_FICHA_CONFIG.SIN_FICHA;
                    const esPendienteFirma = entrega?.estado === 'PENDIENTE_FIRMA_FISICA';
                    const deudaMiembro = calcularDeudaMiembro(m);

                    return (
                      <tr
                        key={m.id}
                        onClick={() => abrirMiembro(m.id, 'datos')}
                        className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition border-l-4 cursor-pointer ${
                          !m.activo
                            ? 'border-l-slate-300 dark:border-l-slate-700 opacity-60'
                            : cfg.borderClases
                        }`}
                      >
                        {/* Nombre y Familia */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs shrink-0 ${
                                !m.activo
                                  ? 'bg-slate-200 dark:bg-slate-700 text-slate-500'
                                  : cfg.avatarClases
                              }`}
                            >
                              {m.nombre?.[0]}
                              {m.apellido?.[0]}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                                  {m.apellido}, {m.nombre}
                                </span>
                                {!m.activo && (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700">
                                    Baja
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-400 flex items-center gap-2">
                                <span>DNI {m.dni}</span>
                                {m.grupoFamiliar && (
                                  <span>• {formatearNombreFamilia(m.grupoFamiliar.nombreFamilia)}</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Rama / Sección */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-bold text-[10px] border ${cfg.badgeClases}`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${cfg.dotColor}`} />
                              {asig?.unidad?.nombre || cfg.nombre}
                            </span>
                            {asig?.rol?.nombre && asig.rol.nombre !== 'Protagonista' && (
                              <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                                {asig.rol.nombre}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Edad */}
                        <td className="py-3.5 px-4 font-semibold text-slate-700 dark:text-slate-300">
                          {edad !== null ? `${edad} años` : '—'}
                        </td>

                        {/* Estado Semántico de Ficha (1-Tap a pestaña Ficha) */}
                        <td
                          className="py-3.5 px-4"
                          onClick={(e) => {
                            e.stopPropagation();
                            abrirMiembro(m.id, 'ficha');
                          }}
                        >
                          <button
                            type="button"
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border cursor-pointer ${cfgFicha.badgeClass}`}
                          >
                            {entrega?.estado === 'VALIDADO_FISICAMENTE' ? (
                              <CheckCircle2 className="w-3 h-3" />
                            ) : esPendienteFirma ? (
                              <Clock className="w-3 h-3" />
                            ) : (
                              <AlertTriangle className="w-3 h-3" />
                            )}
                            {cfgFicha.shortLabel}
                          </button>
                        </td>

                        {/* Acciones Rápidas (1-Tap) */}
                        <td
                          className="py-3.5 px-4 text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="inline-flex items-center justify-end gap-1.5">
                            {esPendienteFirma && (
                              <button
                                type="button"
                                disabled={validandoId === entrega.id}
                                onClick={() => handleValidarFichaDirecto(entrega)}
                                className="min-h-[36px] px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs inline-flex items-center gap-1.5 transition cursor-pointer shadow-2xs disabled:opacity-50"
                                title="Confirmar que entregó la ficha en papel firmada"
                              >
                                {validandoId === entrega.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <FileCheck2 className="w-3.5 h-3.5" />
                                )}
                                <span>Recibir Ficha</span>
                              </button>
                            )}

                            {tienePase && (
                              <button
                                type="button"
                                onClick={() => abrirMiembro(m.id, 'pase')}
                                className="min-h-[36px] px-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs inline-flex items-center gap-1 transition cursor-pointer shadow-2xs"
                              >
                                <Sparkles className="w-3.5 h-3.5" />
                                <span>Pasar de Rama</span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => abrirMiembro(m.id, 'cuotas')}
                              className={`min-h-[36px] px-3 rounded-xl font-bold text-xs inline-flex items-center gap-1.5 transition cursor-pointer ${
                                deudaMiembro > 0
                                  ? 'bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 dark:hover:bg-rose-950/80 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/60'
                                  : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200'
                              }`}
                            >
                              <CreditCard
                                className={`w-3.5 h-3.5 ${
                                  deudaMiembro > 0
                                    ? 'text-rose-600 dark:text-rose-400'
                                    : 'text-emerald-600 dark:text-emerald-400'
                                }`}
                              />
                              <span>
                                {deudaMiembro > 0
                                  ? `Debe $${deudaMiembro.toLocaleString('es-AR')}`
                                  : 'Cuotas al día'}
                              </span>
                            </button>

                            <BotonLlamarMiembro
                              miembro={m}
                              entrega={entrega}
                              className="min-h-[36px] min-w-[36px] px-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 text-slate-600 dark:text-slate-300 hover:text-emerald-600 inline-flex items-center justify-center gap-1 transition cursor-pointer"
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>

      {/* Modal Detalle y Gestión Rápida */}
      {miembroSeleccionadoId !== null && (
        <ModalDetalleMiembro
          usuarioId={miembroSeleccionadoId}
          tabInicial={tabInicialModal}
          onCerrar={() => setMiembroSeleccionadoId(null)}
          onActualizado={() => {
            cargarDatos();
            mostrarToast('Cambios guardados.');
          }}
          onClaveReseteada={(msg) => mostrarToast(msg)}
        />
      )}

      {/* Modal Alta de Miembro */}
      <ModalAltaMiembro
        abierto={modalAltaAbierto}
        onCerrar={() => setModalAltaAbierto(false)}
        onCreado={() => {
          cargarDatos();
          mostrarToast('Nueva persona registrada en el padrón.');
        }}
        unidadesDisponibles={unidades}
        rolesDisponibles={roles}
      />

      {/* Modal Escáner QR Físico */}
      <QrScannerModal
        abierto={scannerAbierto}
        onCerrar={() => setScannerAbierto(false)}
        onValidadoExitoso={(detalle) => {
          const nombre = `${detalle?.usuario?.nombre || ''} ${detalle?.usuario?.apellido || ''}`.trim();
          mostrarToast(
            `Ficha${nombre ? ` de ${nombre}` : ''} validada con éxito.`,
          );
          cargarDatos();
        }}
      />
    </div>
  );
};
