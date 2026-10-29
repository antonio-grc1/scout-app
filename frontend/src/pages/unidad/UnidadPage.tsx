import React, { useEffect, useState, useMemo } from 'react';
import { api } from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { Navbar } from '../../components/Navbar';
import { QrScannerModal } from '../../components/QrScannerModal';
import { ModalDetalleMiembro } from '../../components/ModalDetalleMiembro';
import { ModalAltaMiembro } from '../../components/ModalAltaMiembro';
import { MiembroCard } from '../../components/MiembroCard';
import { BotonLlamarMiembro } from '../../components/BotonLlamarMiembro';
import { obtenerConfigRama } from '../../lib/ramaColors';
import {
  ESTADO_FICHA_CONFIG,
  calcularCamada,
  calcularEdad,
  esRolDeEducador,
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
  ArrowRightLeft,
  GitBranch,
  Shield,
  Calendar,
  ChevronDown,
  RotateCcw,
} from 'lucide-react';

type CampoOrden = 'miembro' | 'edad' | 'seccion' | 'ficha';
type DireccionOrden = 'asc' | 'desc';
type ChipFiltro =
  | 'TODOS'
  | 'FALTA_FICHA'
  | 'CON_DEUDA'
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
  const { tienePermiso } = useAuthStore();
  const puedeVerPases = tienePermiso('pases.ver') || tienePermiso('pases.ejecutar');
  const puedeEjecutarPases = tienePermiso('pases.ejecutar');
  const puedeVerCuotas = tienePermiso('cuotas.ver') || tienePermiso('tesoreria.gestionar');
  const puedeVerFichas = tienePermiso('legajos.ver');
  const puedeValidarFisico = tienePermiso('legajos.validar_fisico');

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

  // Filtros rápidos (1-Tap) y selectores con multi-selección de Checkboxes
  const [busqueda, setBusqueda] = useState('');
  const [seccionesFiltro, setSeccionesFiltro] = useState<number[]>([]);
  const [rolesFiltro, setRolesFiltro] = useState<number[]>([]);
  const [camadasFiltro, setCamadasFiltro] = useState<number[]>([]);
  const [menuSeccionesAbierto, setMenuSeccionesAbierto] = useState(false);
  const [menuRolesAbierto, setMenuRolesAbierto] = useState(false);
  const [menuCamadasAbierto, setMenuCamadasAbierto] = useState(false);
  const [chipActivo, setChipActivo] = useState<ChipFiltro>('TODOS');
  const [destinoPorCamada, setDestinoPorCamada] = useState<Record<string, number>>({});
  const [ejecutandoCamadaKey, setEjecutandoCamadaKey] = useState<string | null>(null);

  // Ordenamiento
  const [campoOrden, setCampoOrden] = useState<CampoOrden>('seccion');
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
          puedeVerPases ? api.get('/pases/candidatos').catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
          puedeVerFichas ? api.get('/legajos/entregas?cicloAnio=2026').catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
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
      return <ArrowUpDown className="w-3.5 h-3.5 text-ink-muted opacity-40 ml-1 shrink-0" />;
    }
    return direccionOrden === 'asc' ? (
      <ArrowUp className="w-3.5 h-3.5 text-brand ml-1 shrink-0" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-brand ml-1 shrink-0" />
    );
  };

  // Conteos de miembros activos por sección y rol para badges y selector
  const conteoPorUnidad = useMemo(() => {
    const mapa = new Map<number, number>();
    for (const m of miembros) {
      if (!m.activo) continue;
      for (const a of m.asignaciones || []) {
        if (a.activo !== false) {
          const uId = a.unidadId || a.unidad?.id;
          if (uId) mapa.set(uId, (mapa.get(uId) || 0) + 1);
        }
      }
    }
    return mapa;
  }, [miembros]);

  const conteoPorRol = useMemo(() => {
    const mapa = new Map<number, number>();
    for (const m of miembros) {
      if (!m.activo) continue;
      for (const a of m.asignaciones || []) {
        if (a.activo !== false) {
          const rId = a.rolId || a.rol?.id;
          if (rId) mapa.set(rId, (mapa.get(rId) || 0) + 1);
        }
      }
    }
    return mapa;
  }, [miembros]);

  const toggleSeccion = (id: number) => {
    setSeccionesFiltro((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const toggleRol = (id: number) => {
    setRolesFiltro((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const toggleCamada = (anio: number) => {
    setCamadasFiltro((prev) =>
      prev.includes(anio) ? prev.filter((x) => x !== anio) : [...prev, anio],
    );
  };

  const textoBotonSecciones = useMemo(() => {
    if (seccionesFiltro.length === 0) return 'Todas las secciones';
    if (seccionesFiltro.length === 1) {
      const u = unidades.find((item) => item.id === seccionesFiltro[0]);
      return u?.nombre || '1 sección';
    }
    return `${seccionesFiltro.length} secciones seleccionadas`;
  }, [seccionesFiltro, unidades]);

  const textoBotonRoles = useMemo(() => {
    if (rolesFiltro.length === 0) return 'Todos los roles';
    if (rolesFiltro.length === 1) {
      const r = roles.find((item) => item.id === rolesFiltro[0]);
      return r?.nombre || '1 rol';
    }
    return `${rolesFiltro.length} roles seleccionados`;
  }, [rolesFiltro, roles]);

  const textoBotonCamadas = useMemo(() => {
    if (camadasFiltro.length === 0) return 'Todas las camadas';
    if (camadasFiltro.length === 1) {
      return `Camada ${camadasFiltro[0]}`;
    }
    return `${camadasFiltro.length} camadas seleccionadas`;
  }, [camadasFiltro]);

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
      const esEdu = esRolDeEducador(asig?.rol);
      const entrega = entregasPorUsuario.get(m.id);

      // Filtro por Sección (Unidades Operativas seleccionadas)
      if (seccionesFiltro.length > 0) {
        const enSeccion = m.asignaciones?.some(
          (a: any) =>
            a.activo !== false &&
            (seccionesFiltro.includes(a.unidadId) || seccionesFiltro.includes(a.unidad?.id)),
        );
        if (!enSeccion) return false;
      }

      // Filtro por Rol (Roles seleccionados)
      if (rolesFiltro.length > 0) {
        const conRol = m.asignaciones?.some(
          (a: any) =>
            a.activo !== false &&
            (rolesFiltro.includes(a.rolId) || rolesFiltro.includes(a.rol?.id)),
        );
        if (!conRol) return false;
      }

      // Filtros rápidos de estado operativo
      if (chipActivo === 'FALTA_FICHA' && entrega?.estado === 'VALIDADO_FISICAMENTE') {
        return false;
      }
      if (chipActivo === 'CON_DEUDA' && calcularDeudaMiembro(m) <= 0) {
        return false;
      }
      if (chipActivo === 'PASE_SUGERIDO' && !candidatosIds.has(m.id)) {
        return false;
      }

      const camadaMiembro = calcularCamada(m.fechaNacimiento);
      if (
        camadasFiltro.length > 0 &&
        (esEdu || camadaMiembro === null || !camadasFiltro.includes(camadaMiembro))
      ) {
        return false;
      }

      if (q) {
        const cfg = obtenerConfigRama(m, unidades);
        const coincide =
          normalizarTextoBusqueda(m.nombre).includes(q) ||
          normalizarTextoBusqueda(m.apellido).includes(q) ||
          normalizarTextoBusqueda(`${m.nombre} ${m.apellido}`).includes(q) ||
          normalizarTextoBusqueda(`${m.apellido} ${m.nombre}`).includes(q) ||
          normalizarTextoBusqueda(m.dni).includes(q) ||
          normalizarTextoBusqueda(m.telefonoContacto).includes(q) ||
          normalizarTextoBusqueda(m.grupoFamiliar?.nombreFamilia).includes(q) ||
          normalizarTextoBusqueda(cfg.nombre).includes(q) ||
          m.asignaciones?.some(
            (a: any) =>
              normalizarTextoBusqueda(a.unidad?.nombre).includes(q) ||
              normalizarTextoBusqueda(a.rol?.nombre || (typeof a.rol === 'string' ? a.rol : '')).includes(q),
          ) ||
          (camadaMiembro !== null && normalizarTextoBusqueda(`camada ${camadaMiembro}`).includes(q));
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
        case 'seccion': {
          const seccionA = a.asignaciones?.[0]?.unidad?.nombre || '';
          const seccionB = b.asignaciones?.[0]?.unidad?.nombre || '';
          comp =
            seccionA.localeCompare(seccionB, 'es') ||
            `${a.apellido} ${a.nombre}`
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
    seccionesFiltro,
    rolesFiltro,
    chipActivo,
    camadasFiltro,
    busqueda,
    entregasPorUsuario,
    candidatosIds,
    campoOrden,
    direccionOrden,
    unidades,
  ]);

  // Camadas disponibles de protagonistas según sección y rol actuales
  const camadasDisponibles = useMemo(() => {
    const mapa = new Map<number, number>();
    for (const m of miembros) {
      if (!m.activo) continue;
      const asig = m.asignaciones?.[0];
      const esEdu = esRolDeEducador(asig?.rol);
      if (esEdu) continue;
      if (seccionesFiltro.length > 0) {
        const enSeccion = m.asignaciones?.some(
          (a: any) =>
            a.activo !== false &&
            (seccionesFiltro.includes(a.unidadId) || seccionesFiltro.includes(a.unidad?.id)),
        );
        if (!enSeccion) continue;
      }
      if (rolesFiltro.length > 0) {
        const conRol = m.asignaciones?.some(
          (a: any) =>
            a.activo !== false &&
            (rolesFiltro.includes(a.rolId) || rolesFiltro.includes(a.rol?.id)),
        );
        if (!conRol) continue;
      }
      if (chipActivo === 'PASE_SUGERIDO' && !candidatosIds.has(m.id)) continue;
      const cam = calcularCamada(m.fechaNacimiento);
      if (cam !== null) {
        mapa.set(cam, (mapa.get(cam) || 0) + 1);
      }
    }
    return Array.from(mapa.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([anio, total]) => ({ anio, total }));
  }, [miembros, seccionesFiltro, rolesFiltro, chipActivo, candidatosIds]);

  // Agrupación de candidatos a pase por Camada y Rama actual
  const gruposCamadaPase = useMemo(() => {
    const grupos = new Map<
      string,
      {
        key: string;
        camada: number;
        edadAlCorte: number;
        unidadActual: string;
        ramaSugeridaNombre: string;
        unidadesDestino: Array<{ id: number; nombre: string }>;
        miembros: any[];
      }
    >();

    for (const c of candidatosPase) {
      const cam = c.camada ?? calcularCamada(c.usuario?.fechaNacimiento) ?? 0;
      const key = `${c.unidadActual?.id || 0}-${cam}`;
      if (!grupos.has(key)) {
        grupos.set(key, {
          key,
          camada: cam,
          edadAlCorte: c.edad,
          unidadActual: c.unidadActual?.nombre || 'Rama',
          ramaSugeridaNombre:
            c.tipo === 'PROGRESION' ? c.ramaSugerida?.nombre || 'Siguiente Rama' : 'Educador / Apoyo',
          unidadesDestino: c.unidadesDestino || [],
          miembros: [],
        });
      }
      grupos.get(key)!.miembros.push(c);
    }

    return Array.from(grupos.values()).sort((a, b) => a.camada - b.camada);
  }, [candidatosPase]);

  const handleEjecutarPaseCamada = async (grupo: {
    key: string;
    camada: number;
    ramaSugeridaNombre: string;
    unidadesDestino: Array<{ id: number; nombre: string }>;
    miembros: any[];
  }) => {
    const destinoId =
      destinoPorCamada[grupo.key] ||
      grupo.unidadesDestino?.[0]?.id ||
      unidades.find(
        (u) =>
          u.tipo === 'SIN_RAMA_APOYO' ||
          u.nombre?.toLowerCase().includes('sin rama') ||
          u.nombre?.toLowerCase().includes('apoyo'),
      )?.id;

    if (!destinoId) {
      mostrarToast('Seleccioná una sección de destino para ejecutar el pase.', 'error');
      return;
    }

    setEjecutandoCamadaKey(grupo.key);
    try {
      await api.post('/pases/lote', {
        pases: grupo.miembros.map((c) => ({
          asignacionOrigenId: c.asignacionId,
          unidadDestinoId: Number(destinoId),
        })),
      });
      const destNombre =
        grupo.unidadesDestino.find((u) => u.id === Number(destinoId))?.nombre ||
        grupo.ramaSugeridaNombre;
      mostrarToast(
        `Camada ${grupo.camada} (${grupo.miembros.length} miembro${grupo.miembros.length === 1 ? '' : 's'}) pasó a ${destNombre}.`,
      );
      await cargarDatos();
    } catch (err) {
      mostrarToast(traducirErrorAmigable(err, 'No se pudo ejecutar el pase de la camada.'), 'error');
    } finally {
      setEjecutandoCamadaKey(null);
    }
  };

  // Contadores rápidos para los chips
  const conteos = useMemo(() => {
    const activos = miembros.filter((m) => m.activo);
    return {
      todos: activos.length,
      faltaFicha: activos.filter(
        (m) => entregasPorUsuario.get(m.id)?.estado !== 'VALIDADO_FISICAMENTE',
      ).length,
      conDeuda: activos.filter((m) => calcularDeudaMiembro(m) > 0).length,
      bajas: miembros.filter((m) => !m.activo).length,
    };
  }, [miembros, entregasPorUsuario]);

  const abrirMiembro = (
    id: number,
    tab: 'datos' | 'pase' | 'seguridad' | 'ficha' | 'cuotas' = 'datos',
  ) => {
    setMiembroSeleccionadoId(id);
    setTabInicialModal(tab);
  };

  return (
    <div className="min-h-screen bg-paper text-ink pb-24 sm:pb-10 transition-colors">
      <Navbar />

      {/* Toast Flotante No Bloqueante */}
      {toast && (
        <div className="fixed bottom-20 sm:bottom-6 right-4 left-4 sm:left-auto sm:max-w-sm z-50 animate-in fade-in slide-in-from-bottom-4">
          <div
            className={`px-4 py-3 rounded-2xl shadow-lg border text-xs font-bold flex items-center justify-between gap-3 ${
              toast.tipo === 'exito'
                ? 'bg-brand text-brand-contrast border-brand font-extrabold'
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
              <h1 className="text-xl sm:text-2xl font-extrabold text-ink">
                Padrón del Grupo
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-brand/10 text-brand border border-brand/30">
                {miembrosFiltrados.length}
              </span>
            </div>
          </div>

          {/* Botones de Acción Principal según capacidades del rol (Touch target >= 44px) */}
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
            {tienePermiso('legajos.validar_fisico') && (
              <button
                onClick={() => setScannerAbierto(true)}
                className="flex-1 sm:flex-initial min-h-[44px] px-4 rounded-xl bg-surface border border-rule hover:bg-paper-2 text-ink font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-2xs"
              >
                <QrCode className="w-4 h-4 text-ink-2 shrink-0" />
                <span>Escanear QR</span>
              </button>
            )}

            {tienePermiso('miembros.crear') && (
              <button
                onClick={() => setModalAltaAbierto(true)}
                className="flex-1 sm:flex-initial min-h-[44px] px-4 rounded-xl bg-brand text-brand-contrast hover:opacity-95 font-extrabold text-xs flex items-center justify-center gap-2 transition-colors shadow-2xs cursor-pointer"
              >
                <UserPlus className="w-4 h-4 shrink-0" />
                <span>Nuevo Miembro</span>
              </button>
            )}
          </div>
        </div>

        {/* Buscador Único en Vivo */}
        <div className="relative w-full">
          <Search className="w-4 h-4 text-ink-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            inputMode="search"
            placeholder="Buscar por nombre, apellido, DNI, familia, sección o rol..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full min-h-[44px] pl-10 pr-10 py-2 rounded-2xl border border-rule text-sm focus:border-[var(--color-focus)] focus:ring-2 focus:ring-[var(--color-focus)]/25 outline-none bg-surface text-ink placeholder:text-ink-muted shadow-2xs transition-colors [&::-webkit-search-cancel-button]:hidden"
          />
          {busqueda && (
            <button
              type="button"
              onClick={() => setBusqueda('')}
              aria-label="Limpiar búsqueda"
              className="min-w-[40px] min-h-[40px] flex items-center justify-center absolute right-1 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Filtros Primarios: Sección (Unidad Operativa) y Rol con soporte Multi-Select Checkboxes */}
        <div className="space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {/* Selector de Sección con Checkboxes */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setMenuSeccionesAbierto(!menuSeccionesAbierto);
                  setMenuRolesAbierto(false);
                  setMenuCamadasAbierto(false);
                }}
                aria-expanded={menuSeccionesAbierto}
                aria-label="Filtrar por secciones operativas"
                className={`w-full min-h-[44px] px-3.5 py-2 rounded-xl border flex items-center justify-between gap-2 text-xs sm:text-sm font-semibold transition cursor-pointer shadow-2xs ${
                  seccionesFiltro.length > 0
                    ? 'border-brand/50 bg-brand/10 text-brand'
                    : 'border-rule bg-surface text-ink hover:border-brand'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <GitBranch className="w-4 h-4 text-brand shrink-0" />
                  <span className="truncate">{textoBotonSecciones}</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {seccionesFiltro.length > 0 && (
                    <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-brand text-brand-contrast text-[10px] font-extrabold flex items-center justify-center">
                      {seccionesFiltro.length}
                    </span>
                  )}
                  <ChevronDown
                    className={`w-4 h-4 text-ink-muted transition-transform ${
                      menuSeccionesAbierto ? 'rotate-180 text-brand' : ''
                    }`}
                  />
                </div>
              </button>

              {/* Menú Flotante con Checkboxes para Secciones */}
              {menuSeccionesAbierto && (
                <>
                  <div
                    className="fixed inset-0 z-20"
                    onClick={() => setMenuSeccionesAbierto(false)}
                  />
                  <div className="absolute left-0 right-0 sm:right-auto sm:w-80 top-full mt-1.5 z-30 bg-surface border border-rule rounded-2xl shadow-md p-3 space-y-2 motion-safe:animate-in motion-safe:fade-in motion-reduce:animate-none">
                    <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-rule">
                      <span className="font-bold text-xs text-ink">
                        Secciones ({unidades.length})
                      </span>
                      <div className="flex items-center gap-2 text-[11px] font-bold">
                        <button
                          type="button"
                          onClick={() => setSeccionesFiltro(unidades.map((u) => u.id))}
                          className="text-brand hover:underline cursor-pointer"
                        >
                          Marcar todas
                        </button>
                        <span className="text-ink-muted opacity-40">•</span>
                        <button
                          type="button"
                          onClick={() => setSeccionesFiltro([])}
                          className="text-ink-muted hover:underline cursor-pointer"
                        >
                          Desmarcar
                        </button>
                      </div>
                    </div>

                    {/* Opción Todas las secciones */}
                    <label className="min-h-[40px] px-2.5 py-1.5 rounded-xl flex items-center gap-2.5 hover:bg-paper-2 cursor-pointer select-none transition">
                      <input
                        type="checkbox"
                        checked={seccionesFiltro.length === 0}
                        onChange={() => setSeccionesFiltro([])}
                        className="w-4 h-4 rounded accent-[var(--color-brand)] cursor-pointer shrink-0"
                      />
                      <span className="text-xs font-bold text-ink">
                        Todas las secciones
                      </span>
                    </label>

                    {/* Lista con Checkboxes */}
                    <div className="max-h-56 overflow-y-auto space-y-0.5 divide-y divide-rule pr-1">
                      {unidades.map((u) => {
                        const estaMarcada = seccionesFiltro.includes(u.id);
                        const cant = conteoPorUnidad.get(u.id) || 0;
                        return (
                          <label
                            key={u.id}
                            className="min-h-[40px] px-2.5 py-2 rounded-xl flex items-center justify-between gap-2 hover:bg-paper-2 cursor-pointer select-none transition"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <input
                                type="checkbox"
                                checked={estaMarcada}
                                onChange={() => toggleSeccion(u.id)}
                                className="w-4 h-4 rounded accent-[var(--color-brand)] cursor-pointer shrink-0"
                              />
                              <span className="text-xs font-medium text-ink truncate">
                                {u.nombre}
                              </span>
                            </div>
                            <span className="text-[11px] font-bold text-ink-muted shrink-0">
                              {cant}
                            </span>
                          </label>
                        );
                      })}
                    </div>

                    <button
                      type="button"
                      onClick={() => setMenuSeccionesAbierto(false)}
                      className="w-full min-h-[36px] py-1.5 rounded-xl bg-brand text-brand-contrast hover:opacity-90 active:opacity-100 font-extrabold text-xs transition-colors cursor-pointer"
                    >
                      Listo
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Selector de Rol con Checkboxes */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setMenuRolesAbierto(!menuRolesAbierto);
                  setMenuSeccionesAbierto(false);
                  setMenuCamadasAbierto(false);
                }}
                aria-expanded={menuRolesAbierto}
                aria-label="Filtrar por roles"
                className={`w-full min-h-[44px] px-3.5 py-2 rounded-xl border flex items-center justify-between gap-2 text-xs sm:text-sm font-semibold transition cursor-pointer shadow-2xs ${
                  rolesFiltro.length > 0
                    ? 'border-indigo-500 bg-indigo-50/60 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-200'
                    : 'border-rule bg-surface text-ink hover:border-brand'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <Shield className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <span className="truncate">{textoBotonRoles}</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {rolesFiltro.length > 0 && (
                    <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center">
                      {rolesFiltro.length}
                    </span>
                  )}
                  <ChevronDown
                    className={`w-4 h-4 text-ink-muted transition-transform ${
                      menuRolesAbierto ? 'rotate-180 text-indigo-600' : ''
                    }`}
                  />
                </div>
              </button>

              {/* Menú Flotante con Checkboxes para Roles */}
              {menuRolesAbierto && (
                <>
                  <div
                    className="fixed inset-0 z-20"
                    onClick={() => setMenuRolesAbierto(false)}
                  />
                  <div className="absolute left-0 right-0 sm:right-auto sm:w-80 top-full mt-1.5 z-30 bg-surface border border-rule rounded-2xl shadow-md p-3 space-y-2 motion-safe:animate-in motion-safe:fade-in motion-reduce:animate-none">
                    <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-rule">
                      <span className="font-bold text-xs text-ink">
                        Roles ({roles.length})
                      </span>
                      <div className="flex items-center gap-2 text-[11px] font-bold">
                        <button
                          type="button"
                          onClick={() => setRolesFiltro(roles.map((r) => r.id))}
                          className="text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                        >
                          Marcar todos
                        </button>
                        <span className="text-ink-muted opacity-40">•</span>
                        <button
                          type="button"
                          onClick={() => setRolesFiltro([])}
                          className="text-ink-muted hover:underline cursor-pointer"
                        >
                          Desmarcar
                        </button>
                      </div>
                    </div>

                    {/* Opción Todos los roles */}
                    <label className="min-h-[40px] px-2.5 py-1.5 rounded-xl flex items-center gap-2.5 hover:bg-paper-2 cursor-pointer select-none transition">
                      <input
                        type="checkbox"
                        checked={rolesFiltro.length === 0}
                        onChange={() => setRolesFiltro([])}
                        className="w-4 h-4 rounded accent-indigo-600 cursor-pointer shrink-0"
                      />
                      <span className="text-xs font-bold text-ink">
                        Todos los roles
                      </span>
                    </label>

                    {/* Lista con Checkboxes */}
                    <div className="max-h-56 overflow-y-auto space-y-0.5 divide-y divide-rule pr-1">
                      {roles.map((r) => {
                        const estaMarcado = rolesFiltro.includes(r.id);
                        const cant = conteoPorRol.get(r.id) || 0;
                        return (
                          <label
                            key={r.id}
                            className="min-h-[40px] px-2.5 py-2 rounded-xl flex items-center justify-between gap-2 hover:bg-paper-2 cursor-pointer select-none transition"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <input
                                type="checkbox"
                                checked={estaMarcado}
                                onChange={() => toggleRol(r.id)}
                                className="w-4 h-4 rounded accent-indigo-600 cursor-pointer shrink-0"
                              />
                              <span className="text-xs font-medium text-ink truncate">
                                {r.nombre}
                              </span>
                            </div>
                            <span className="text-[11px] font-bold text-ink-muted shrink-0">
                              {cant}
                            </span>
                          </label>
                        );
                      })}
                    </div>

                    <button
                      type="button"
                      onClick={() => setMenuRolesAbierto(false)}
                      className="w-full min-h-[36px] py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition cursor-pointer"
                    >
                      Listo
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Selector de Camada con Checkboxes */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setMenuCamadasAbierto(!menuCamadasAbierto);
                  setMenuSeccionesAbierto(false);
                  setMenuRolesAbierto(false);
                }}
                aria-expanded={menuCamadasAbierto}
                aria-label="Filtrar por camadas"
                className={`w-full min-h-[44px] px-3.5 py-2 rounded-xl border flex items-center justify-between gap-2 text-xs sm:text-sm font-semibold transition cursor-pointer shadow-2xs ${
                  camadasFiltro.length > 0
                    ? 'border-brand/50 bg-brand/10 text-brand'
                    : 'border-rule bg-surface text-ink hover:border-brand'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <Calendar className="w-4 h-4 text-brand shrink-0" />
                  <span className="truncate">{textoBotonCamadas}</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {camadasFiltro.length > 0 && (
                    <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-brand text-brand-contrast text-[10px] font-bold flex items-center justify-center">
                      {camadasFiltro.length}
                    </span>
                  )}
                  <ChevronDown
                    className={`w-4 h-4 text-ink-muted transition-transform ${
                      menuCamadasAbierto ? 'rotate-180 text-brand' : ''
                    }`}
                  />
                </div>
              </button>

              {/* Menú Flotante con Checkboxes para Camadas */}
              {menuCamadasAbierto && (
                <>
                  <div
                    className="fixed inset-0 z-20"
                    onClick={() => setMenuCamadasAbierto(false)}
                  />
                  <div className="absolute left-0 right-0 sm:right-auto sm:w-80 top-full mt-1.5 z-30 bg-surface border border-rule rounded-2xl shadow-md p-3 space-y-2 motion-safe:animate-in motion-safe:fade-in motion-reduce:animate-none">
                    <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-rule">
                      <span className="font-bold text-xs text-ink">
                        Camadas ({camadasDisponibles.length})
                      </span>
                      <div className="flex items-center gap-2 text-[11px] font-bold">
                        <button
                          type="button"
                          onClick={() => setCamadasFiltro(camadasDisponibles.map((c) => c.anio))}
                          className="text-brand hover:underline cursor-pointer"
                        >
                          Marcar todas
                        </button>
                        <span className="text-ink-muted opacity-40">•</span>
                        <button
                          type="button"
                          onClick={() => setCamadasFiltro([])}
                          className="text-ink-muted hover:underline cursor-pointer"
                        >
                          Desmarcar
                        </button>
                      </div>
                    </div>

                    {/* Opción Todas las camadas */}
                    <label className="min-h-[40px] px-2.5 py-1.5 rounded-xl flex items-center gap-2.5 hover:bg-paper-2 cursor-pointer select-none transition">
                      <input
                        type="checkbox"
                        checked={camadasFiltro.length === 0}
                        onChange={() => setCamadasFiltro([])}
                        className="w-4 h-4 rounded accent-[var(--color-brand)] cursor-pointer shrink-0"
                      />
                      <span className="text-xs font-bold text-ink">
                        Todas las camadas
                      </span>
                    </label>

                    {/* Lista con Checkboxes */}
                    <div className="max-h-56 overflow-y-auto space-y-0.5 divide-y divide-rule pr-1">
                      {camadasDisponibles.length === 0 ? (
                        <p className="text-xs text-ink-muted py-3 text-center">
                          No hay camadas para los filtros seleccionados
                        </p>
                      ) : (
                        camadasDisponibles.map((c) => {
                          const estaMarcada = camadasFiltro.includes(c.anio);
                          return (
                            <label
                              key={c.anio}
                              className="min-h-[40px] px-2.5 py-2 rounded-xl flex items-center justify-between gap-2 hover:bg-paper-2 cursor-pointer select-none transition"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <input
                                  type="checkbox"
                                  checked={estaMarcada}
                                  onChange={() => toggleCamada(c.anio)}
                                  className="w-4 h-4 rounded accent-[var(--color-brand)] cursor-pointer shrink-0"
                                />
                                <span className="text-xs font-medium text-ink truncate">
                                  Camada {c.anio}
                                </span>
                              </div>
                              <span className="text-[11px] font-bold text-ink-muted shrink-0">
                                {c.total}
                              </span>
                            </label>
                          );
                        })
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => setMenuCamadasAbierto(false)}
                      className="w-full min-h-[36px] py-1.5 rounded-xl bg-brand text-brand-contrast hover:opacity-90 active:opacity-100 font-extrabold text-xs transition cursor-pointer"
                    >
                      Listo
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Etiquetas / Pills de Filtros Activos para remoción en 1 tap */}
          {(seccionesFiltro.length > 0 || rolesFiltro.length > 0 || camadasFiltro.length > 0) && (
            <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
              <span className="text-xs font-semibold text-ink-muted mr-1">
                Filtros activos:
              </span>
              {seccionesFiltro.map((id) => {
                const u = unidades.find((item) => item.id === id);
                if (!u) return null;
                return (
                  <span
                    key={`sec-tag-${id}`}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-brand/10 text-brand border border-brand/30"
                  >
                    <GitBranch className="w-3 h-3 text-brand shrink-0" />
                    <span>{u.nombre}</span>
                    <button
                      type="button"
                      onClick={() => setSeccionesFiltro((prev) => prev.filter((x) => x !== id))}
                      className="hover:bg-brand/20 p-0.5 rounded cursor-pointer"
                      aria-label={`Quitar filtro ${u.nombre}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                );
              })}
              {rolesFiltro.map((id) => {
                const r = roles.find((item) => item.id === id);
                if (!r) return null;
                return (
                  <span
                    key={`rol-tag-${id}`}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-indigo-100 dark:bg-indigo-950/70 text-indigo-800 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-800"
                  >
                    <Shield className="w-3 h-3 text-indigo-600 dark:text-indigo-400 shrink-0" />
                    <span>{r.nombre}</span>
                    <button
                      type="button"
                      onClick={() => setRolesFiltro((prev) => prev.filter((x) => x !== id))}
                      className="hover:bg-indigo-200 dark:hover:bg-indigo-900 p-0.5 rounded cursor-pointer"
                      aria-label={`Quitar filtro ${r.nombre}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                );
              })}
              {camadasFiltro.map((anio) => (
                <span
                  key={`camada-tag-${anio}`}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-brand/10 text-brand border border-brand/30"
                >
                  <Calendar className="w-3 h-3 text-brand shrink-0" />
                  <span>Camada {anio}</span>
                  <button
                    type="button"
                    onClick={() => setCamadasFiltro((prev) => prev.filter((x) => x !== anio))}
                    className="hover:bg-brand/20 p-0.5 rounded cursor-pointer"
                    aria-label={`Quitar filtro Camada ${anio}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              <button
                type="button"
                onClick={() => {
                  setSeccionesFiltro([]);
                  setRolesFiltro([]);
                  setCamadasFiltro([]);
                }}
                className="text-xs font-bold text-rose-600 dark:text-rose-400 hover:underline px-1.5 py-0.5 cursor-pointer ml-0.5"
              >
                Limpiar
              </button>
            </div>
          )}
        </div>

        {/* Barra de Chips Táctiles de Estado Operativo */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar -mx-3 px-3 sm:mx-0 sm:px-0 sm:flex-wrap">
          <button
            onClick={() => setChipActivo('TODOS')}
            className={`min-h-[40px] px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition cursor-pointer border ${
              chipActivo === 'TODOS'
                ? 'bg-brand text-brand-contrast border-brand shadow-2xs font-extrabold'
                : 'bg-surface text-ink-2 border-rule hover:bg-paper-2'
            }`}
          >
            Todos ({conteos.todos})
          </button>

          <button
            onClick={() => setChipActivo(chipActivo === 'FALTA_FICHA' ? 'TODOS' : 'FALTA_FICHA')}
            className={`min-h-[40px] px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap inline-flex items-center gap-1.5 transition cursor-pointer border ${
              chipActivo === 'FALTA_FICHA'
                ? 'bg-rose-600 text-white border-rose-600 shadow-2xs'
                : 'bg-surface text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-900/60'
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
                  : 'bg-surface text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-900/60'
              }`}
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span>Con Deuda ({conteos.conDeuda})</span>
            </button>
          )}

          {puedeVerPases && candidatosPase.length > 0 && (
            <button
              onClick={() =>
                setChipActivo(chipActivo === 'PASE_SUGERIDO' ? 'TODOS' : 'PASE_SUGERIDO')
              }
              className={`min-h-[40px] px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap inline-flex items-center gap-1.5 transition cursor-pointer border ${
                chipActivo === 'PASE_SUGERIDO'
                  ? 'bg-brand text-brand-contrast border-brand shadow-2xs font-extrabold'
                  : 'bg-brand/10 text-brand border-brand/30'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Pases por Camada ({candidatosPase.length})</span>
            </button>
          )}

          {conteos.bajas > 0 && (
            <button
              onClick={() => setChipActivo(chipActivo === 'BAJAS' ? 'TODOS' : 'BAJAS')}
              className={`min-h-[40px] px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap inline-flex items-center gap-1.5 transition cursor-pointer border ${
                chipActivo === 'BAJAS'
                  ? 'bg-ink text-surface border-ink'
                  : 'bg-surface text-ink-muted border-rule'
              }`}
            >
              <UserX className="w-3.5 h-3.5" />
              <span>Bajas ({conteos.bajas})</span>
            </button>
          )}
        </div>


        {/* Panel de Pase en Lote por Camada cuando se activa el filtro PASE_SUGERIDO */}
        {puedeVerPases && chipActivo === 'PASE_SUGERIDO' && gruposCamadaPase.length > 0 && (
          <div className="bg-brand/10 border border-brand/30 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <h2 className="text-sm font-extrabold text-brand flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-brand" />
                  <span>Sugerencias de Pase por Camada</span>
                </h2>
                <p className="text-xs text-ink-muted">
                  Podés pasar a toda una camada junta eligiendo la sección de destino, o revisar miembro por miembro abajo.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {gruposCamadaPase.map((g) => {
                const destinoActual =
                  destinoPorCamada[g.key] ?? g.unidadesDestino?.[0]?.id ?? '';
                const ejecutando = ejecutandoCamadaKey === g.key;
                return (
                  <div
                    key={g.key}
                    className="bg-surface rounded-xl p-3.5 border border-rule flex flex-col justify-between gap-3 shadow-2xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2.5 py-0.5 rounded-lg bg-brand/15 text-brand font-black text-xs">
                            Camada {g.camada}
                          </span>
                          <span className="text-xs font-bold text-ink">
                            {g.unidadActual} → {g.ramaSugeridaNombre}
                          </span>
                        </div>
                        <p className="text-[11px] text-ink-muted mt-1">
                          {g.miembros.length} {g.miembros.length === 1 ? 'integrante' : 'integrantes'} • Cumplen {g.edadAlCorte} años
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      {g.unidadesDestino.length > 1 && (
                        <select
                          value={destinoActual}
                          onChange={(e) =>
                            setDestinoPorCamada((prev) => ({
                              ...prev,
                              [g.key]: Number(e.target.value),
                            }))
                          }
                          className="min-h-[38px] px-3 py-1.5 rounded-xl border border-rule bg-paper-2 text-xs font-bold text-ink outline-none flex-1"
                        >
                          {g.unidadesDestino.map((u) => (
                            <option key={u.id} value={u.id}>
                              Destino: {u.nombre}
                            </option>
                          ))}
                        </select>
                      )}

                      {puedeEjecutarPases ? (
                        <button
                          type="button"
                          disabled={ejecutando}
                          onClick={() => handleEjecutarPaseCamada(g)}
                          className="min-h-[38px] px-4 py-1.5 rounded-xl bg-brand text-brand-contrast hover:opacity-90 active:opacity-100 font-extrabold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 shadow-2xs"
                        >
                          {ejecutando ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <ArrowRightLeft className="w-3.5 h-3.5" />
                          )}
                          <span>
                            Pasar Camada {g.camada} ({g.miembros.length})
                          </span>
                        </button>
                      ) : (
                        <span className="text-xs text-brand font-semibold px-2">
                          Sugerencia de pase por edad
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Estado de Carga (Skeleton) */}
        {cargando ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-24 rounded-2xl bg-surface border border-rule animate-pulse p-4 flex items-center gap-3"
              >
                <div className="w-11 h-11 rounded-2xl bg-paper-3 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-40 bg-paper-3 rounded" />
                  <div className="h-3 w-28 bg-paper-2 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : miembrosFiltrados.length === 0 ? (
          <div className="bg-surface rounded-2xl border border-rule p-10 text-center space-y-3">
            <Users className="w-10 h-10 text-ink-muted opacity-40 mx-auto" />
            <p className="text-sm font-bold text-ink">
              No encontramos personas con este filtro
            </p>
            {(busqueda ||
              chipActivo !== 'TODOS' ||
              seccionesFiltro.length > 0 ||
              rolesFiltro.length > 0 ||
              camadasFiltro.length > 0) && (
              <button
                onClick={() => {
                  setBusqueda('');
                  setChipActivo('TODOS');
                  setSeccionesFiltro([]);
                  setRolesFiltro([]);
                  setCamadasFiltro([]);
                }}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-paper-2 hover:bg-surface text-ink font-bold text-xs cursor-pointer transition-colors border border-rule"
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
                  tienePaseSugerido={puedeVerPases && candidatosIds.has(m.id)}
                  validandoDirecto={validandoId === entregasPorUsuario.get(m.id)?.id}
                  onAbrirDetalle={(tab) => abrirMiembro(m.id, tab)}
                  onValidarFichaDirecto={handleValidarFichaDirecto}
                />
              ))}
            </div>

            {/* ============================================================== */}
            {/* VISTA ESCRITORIO (md+): Tabla Limpia enfocada en lo Vital       */}
            {/* ============================================================== */}
            <div className="hidden md:block bg-surface rounded-2xl border border-rule shadow-2xs overflow-hidden">
              <table className="w-full text-left text-xs text-ink-2">
                <thead className="bg-paper-2 border-b border-rule text-ink font-semibold text-xs">
                  <tr>
                    <th
                      onClick={() => handleOrdenar('miembro')}
                      className="py-3.5 px-4 cursor-pointer hover:bg-surface transition select-none"
                    >
                      <div className="flex items-center">
                        <span>Nombre y Familia</span>
                        {renderIconoOrden('miembro')}
                      </div>
                    </th>
                    <th
                      onClick={() => handleOrdenar('seccion')}
                      className="py-3.5 px-4 cursor-pointer hover:bg-surface transition select-none"
                    >
                      <div className="flex items-center">
                        <span>Sección y Rol</span>
                        {renderIconoOrden('seccion')}
                      </div>
                    </th>
                    <th
                      onClick={() => handleOrdenar('edad')}
                      className="py-3.5 px-4 cursor-pointer hover:bg-surface transition select-none"
                    >
                      <div className="flex items-center">
                        <span>Edad / Camada</span>
                        {renderIconoOrden('edad')}
                      </div>
                    </th>
                    <th
                      onClick={() => handleOrdenar('ficha')}
                      className="py-3.5 px-4 cursor-pointer hover:bg-surface transition select-none"
                    >
                      <div className="flex items-center">
                        <span>Ficha 2026</span>
                        {renderIconoOrden('ficha')}
                      </div>
                    </th>
                    <th className="py-3.5 px-4 text-right">Acciones Rápidas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rule">
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
                        className={`hover:bg-paper-2 transition border-l-4 cursor-pointer ${
                          !m.activo
                            ? 'border-l-rule opacity-60'
                            : cfg.borderClases
                        }`}
                      >
                        {/* Nombre y Familia */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs shrink-0 ${
                                !m.activo
                                  ? 'bg-paper-3 text-ink-muted'
                                  : cfg.avatarClases
                              }`}
                            >
                              {m.nombre?.[0]}
                              {m.apellido?.[0]}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-bold text-ink text-sm">
                                  {m.apellido}, {m.nombre}
                                </span>
                                {!m.activo && (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-paper-2 text-ink-muted border border-rule">
                                    Baja
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-ink-muted flex items-center gap-2">
                                <span>DNI {m.dni}</span>
                                {m.grupoFamiliar && (
                                  <span>• {formatearNombreFamilia(m.grupoFamiliar.nombreFamilia)}</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Sección y Rol */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-bold text-[10px] border ${cfg.badgeClases}`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${cfg.dotColor}`} />
                              {asig?.unidad?.nombre || cfg.nombre}
                            </span>
                            {asig?.rol?.nombre && (
                              <span className="text-[10px] font-semibold text-ink-2 bg-paper-2 px-2 py-0.5 rounded-full border border-rule">
                                {asig.rol.nombre}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Edad y Camada */}
                        <td className="py-3.5 px-4">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-semibold text-ink">
                              {edad !== null ? `${edad} años` : '—'}
                            </span>
                            {cfg.key !== 'adultos' && calcularCamada(m.fechaNacimiento) !== null && (
                              <span className="text-[10px] font-bold text-ink-muted">
                                Camada {calcularCamada(m.fechaNacimiento)}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Estado Semántico de Ficha (1-Tap a pestaña Ficha) */}
                        <td
                          className="py-3.5 px-4"
                          onClick={(e) => {
                            if (!puedeVerFichas) return;
                            e.stopPropagation();
                            abrirMiembro(m.id, 'ficha');
                          }}
                        >
                          <button
                            type="button"
                            disabled={!puedeVerFichas}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                              puedeVerFichas ? 'cursor-pointer' : 'cursor-default'
                            } ${cfgFicha.badgeClass}`}
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
                            {esPendienteFirma && puedeValidarFisico && (
                              <button
                                type="button"
                                disabled={validandoId === entrega.id}
                                onClick={() => handleValidarFichaDirecto(entrega)}
                                className="min-h-[36px] px-3 rounded-xl bg-brand hover:opacity-90 active:opacity-100 text-brand-contrast font-extrabold text-xs inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs disabled:opacity-50"
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

                            {tienePase && puedeEjecutarPases && (
                              <button
                                type="button"
                                onClick={() => abrirMiembro(m.id, 'pase')}
                                className="min-h-[36px] px-3 rounded-xl bg-brand hover:opacity-90 text-brand-contrast font-bold text-xs inline-flex items-center gap-1 transition cursor-pointer shadow-2xs"
                              >
                                <Sparkles className="w-3.5 h-3.5" />
                                <span>Pasar de Rama</span>
                              </button>
                            )}

                            {puedeVerCuotas && (
                              <button
                                type="button"
                                onClick={() => abrirMiembro(m.id, 'cuotas')}
                                className={`min-h-[36px] px-3 rounded-xl font-bold text-xs inline-flex items-center gap-1.5 transition cursor-pointer ${
                                  deudaMiembro > 0
                                    ? 'bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 dark:hover:bg-rose-950/80 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/60'
                                    : 'bg-paper-2 hover:bg-surface text-ink border border-rule'
                                }`}
                              >
                                <CreditCard
                                  className={`w-3.5 h-3.5 ${
                                    deudaMiembro > 0
                                      ? 'text-rose-600 dark:text-rose-400'
                                      : 'text-brand'
                                  }`}
                                />
                                <span>
                                  {deudaMiembro > 0
                                    ? `Debe $${deudaMiembro.toLocaleString('es-AR')}`
                                    : 'Cuotas al día'}
                                </span>
                              </button>
                            )}

                            <BotonLlamarMiembro
                              miembro={m}
                              entrega={entrega}
                              className="min-h-[36px] min-w-[36px] px-2 rounded-xl bg-paper-2 hover:bg-brand/10 text-ink-muted hover:text-brand inline-flex items-center justify-center gap-1 transition-colors cursor-pointer border border-rule"
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
