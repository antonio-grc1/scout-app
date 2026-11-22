import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  AlertTriangle,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  Edit2,
  Eye,
  FileCheck2,
  FileText,
  Hammer,
  HeartHandshake,
  HeartPulse,
  Layers,
  Loader2,
  PenTool,
  Phone,
  Pill,
  PlusCircle,
  Power,
  RefreshCw,
  Search,
  ShieldAlert,
  Tent,
  Truck,
  Utensils,
  Wrench,
  X,
} from 'lucide-react';
import { api } from '../../api/client';
import {
  useActiveUnitStore,
  useCapabilities,
  obtenerNombreUnidadActiva,
} from '../../core/capabilities';
import { useQrModalStore } from '../../core/qrModalStore';
import { useAuthStore } from '../../store/authStore';
import { tienePermisoConAlcance, tienePermisoSobreMiembro } from '../../lib/permisos';
import { useConfirmar } from '../../hooks/useConfirmar';
import { useToastStore } from '../../store/toastStore';
import {
  extraerCatalogosMedicosDinamicos,
  extraerInfoMedicaMiembro,
} from '../../lib/alertasMedicas';
import {
  esErrorOffline,
  esPlantillaPrincipal,
  filtrarPlantillasParaMiembro,
  normalizarTextoBusqueda,
  obtenerCicloAnioActual,
  obtenerRolPrincipal,
  resolverDestinatarioPlantilla,
  seleccionarPlantillaPorMiembro,
  traducirErrorAmigable,
} from '../../lib/formatters';
import {
  crearUrlPdfBlob,
  descargarPdfBlob,
  generarFichaPdf,
  type MapeoPdf,
} from '../../services/pdfGenerator';
import {
  exportarACSV,
  exportarAExcel,
  type ColumnaExportacion,
} from '../../utils/exportadorPlanillas';
import {
  BotonExportar,
  Button,
  KpiCard,
  SegmentedTabs,
  Select,
} from '../../components/ui';
import { VisualPdfEditorDrawer } from './VisualPdfEditorDrawer';

const PdfViewerModal = lazy(() =>
  import('../../components/PdfViewerModal').then((m) => ({ default: m.PdfViewerModal })),
);

type TabLegajos = 'cumplimiento' | 'salud' | 'colaboradores' | 'plantillas';
type FiltroEstadoEntrega =
  | 'TODOS'
  | 'PENDIENTES' // Sin ficha + Borrador (lo que cuenta la KPI "Sin ficha / Borrador")
  | 'SIN_FICHA'
  | 'BORRADOR'
  | 'LISTO_PARA_FIRMA'
  | 'VALIDADO_FISICO';
type FiltroSaludCategoria =
  | 'TODOS'
  | 'DIETA'
  | 'ALERGIA'
  | 'MEDICACION_CRONICA'
  | 'RESTRICCION_CUD'
  | 'ALERGIA_ALIMENTOS'
  | 'ALERGIA_MEDICAMENTOS'
  | 'ALERGIA_PICADURAS'
  | 'ALERGIA_AMBIENTALES'
  | 'TOMA_MEDICACION'
  | 'ENFERMEDAD_CRONICA'
  | 'RESTRICCION_FISICA'
  | 'TIENE_CUD';

function normalizarEstadoFiltro(rawEstado?: string | null): FiltroEstadoEntrega {
  if (rawEstado === 'VALIDADO_FISICAMENTE' || rawEstado === 'VALIDADO_FISICO') {
    return 'VALIDADO_FISICO';
  }
  if (rawEstado === 'PENDIENTE_FIRMA_FISICA' || rawEstado === 'LISTO_PARA_FIRMA') {
    return 'LISTO_PARA_FIRMA';
  }
  if (rawEstado === 'BORRADOR' || rawEstado === 'DESACTUALIZADO_REQUIERE_REIMPRESION') {
    return 'BORRADOR';
  }
  return 'SIN_FICHA';
}
type FiltroDisciplina =
  | 'TODAS'
  | 'COCINA'
  | 'CAMPAMENTO'
  | 'TRANSPORTE'
  | 'MANTENIMIENTO'
  | 'ENSENANZA'
  | 'ADMIN'
  | 'SERVICIO';
type FiltroMaterial = 'TODOS' | 'CAMPAMENTO' | 'CONSTRUCCION' | 'CUALQUIERA';

export const LegajosPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const caps = useCapabilities();
  const usuarioActual = useAuthStore((s) => s.usuario);
  const asignacionesActor = useAuthStore((s) => s.asignaciones);
  const tienePermisoGlobal = useAuthStore((s) => s.tienePermisoGlobal);
  // Completar/editar/validar el legajo de otro miembro exige legajos.editar sobre SU unidad.
  const puedeEditarLegajoDe = (miembro: any) =>
    tienePermisoSobreMiembro(asignacionesActor, 'legajos.editar', miembro);
  const esGlobalPlantillas = tienePermisoGlobal(['plantillas.ver', 'plantillas.editar']);
  const activeUnitId = useActiveUnitStore((s) => s.activeUnitId);
  const abrirQr = useQrModalStore((s) => s.abrirQr);
  const lastValidationAt = useQrModalStore((s) => s.lastValidationAt);
  const mostrarToast = useToastStore((s) => s.mostrarToast);
  const { pedir: pedirConfirmacion, dialogo: dialogoConfirmacion } = useConfirmar();

  const puedeVerPlantillasTab =
    esGlobalPlantillas && caps.hasAnyPermiso('plantillas.ver', 'plantillas.editar');
  // Cumplimiento, Salud y Colaboradores muestran fichas y datos médicos: exigen legajos.ver/editar.
  // Diseñar plantillas (plantillas.*) no habilita ver esos datos.
  const puedeVerDatosLegajos = tienePermisoConAlcance(
    asignacionesActor,
    ['legajos.ver', 'legajos.editar'],
    'UNIDAD',
  );
  const tabUrl = searchParams.get('tab') as TabLegajos | null;
  const tabInicial: TabLegajos =
    (tabUrl === 'plantillas' || !puedeVerDatosLegajos) && puedeVerPlantillasTab
      ? 'plantillas'
      : tabUrl === 'salud'
        ? 'salud'
        : tabUrl === 'colaboradores'
          ? 'colaboradores'
          : 'cumplimiento';
  const [tab, setTab] = useState<TabLegajos>(tabInicial);

  useEffect(() => {
    if (tabUrl === 'plantillas' && puedeVerPlantillasTab) setTab('plantillas');
    else if (!puedeVerDatosLegajos) return;
    else if (tabUrl === 'salud') setTab('salud');
    else if (tabUrl === 'colaboradores') setTab('colaboradores');
    else if (tabUrl === 'cumplimiento') setTab('cumplimiento');
  }, [tabUrl, puedeVerPlantillasTab, puedeVerDatosLegajos]);

  const cambiarTab = (next: TabLegajos) => {
    setTab(next);
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.set('tab', next);
        return p;
      },
      { replace: true },
    );
  };

  // Cumplimiento state
  const [miembros, setMiembros] = useState<any[]>([]);
  const [entregas, setEntregas] = useState<any[]>([]);
  const [plantillas, setPlantillas] = useState<any[]>([]);
  const [cargandoCumplimiento, setCargandoCumplimiento] = useState(true);
  const [busquedaCumplimiento, setBusquedaCumplimiento] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstadoEntrega>('TODOS');
  const [plantillaFiltroId, setPlantillaFiltroId] = useState<'PRINCIPAL' | number>('PRINCIPAL');
  const [validandoHash, setValidandoHash] = useState<string | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [pdfPreviewTitle, setPdfPreviewTitle] = useState('Vista Previa PDF');
  const [pdfPreviewBytes, setPdfPreviewBytes] = useState<Uint8Array | null>(null);

  // Salud y Alimentación state
  const [busquedaSalud, setBusquedaSalud] = useState('');
  const [filtroDietaSalud, setFiltroDietaSalud] = useState<string>('TODAS');
  const [filtroSaludCat, setFiltroSaludCat] = useState<FiltroSaludCategoria>('TODOS');
  const [filtroGrupoSanguineo, setFiltroGrupoSanguineo] = useState<string>('TODOS');
  const [soloNovedadesSalud, setSoloNovedadesSalud] = useState(false);

  // Colaboradores state
  const [colaboradores, setColaboradores] = useState<any[]>([]);
  const [cargandoColab, setCargandoColab] = useState(false);
  const [busquedaColab, setBusquedaColab] = useState('');
  const [filtroDisciplina, setFiltroDisciplina] = useState<FiltroDisciplina>('TODAS');
  const [filtroMaterial, setFiltroMaterial] = useState<FiltroMaterial>('TODOS');

  // Plantillas CRUD + Editor state
  const [plantillasAdmin, setPlantillasAdmin] = useState<any[]>([]);
  const [cargandoPlantillas, setCargandoPlantillas] = useState(false);
  const [procesandoPlantillaId, setProcesandoPlantillaId] = useState<number | null>(null);
  const [mostrarPlantillasPausadas, setMostrarPlantillasPausadas] = useState(false);
  const [editorDocumentoEstado, setEditorDocumentoEstado] = useState<{
    abierto: boolean;
    plantilla: any | null;
    modoCrear: boolean;
    plantillaBaseDuplicar: any | null;
  }>({
    abierto: false,
    plantilla: null,
    modoCrear: false,
    plantillaBaseDuplicar: null,
  });

  const cargarCumplimiento = useCallback(async () => {
    setCargandoCumplimiento(true);
    try {
      const ciclo = obtenerCicloAnioActual();
      const cargarMiembrosPaginados = async (): Promise<any[]> => {
        const porPagina = 200;
        const primera = await api.get(`/miembros?pagina=1&porPagina=${porPagina}`);
        const rawPrimera = primera.data;
        if (Array.isArray(rawPrimera)) return rawPrimera;
        const primerosItems: any[] = Array.isArray(rawPrimera?.items) ? rawPrimera.items : [];
        const total = Number(rawPrimera?.total ?? primerosItems.length);
        const totalPaginas = Math.ceil(total / porPagina);
        if (totalPaginas <= 1) return primerosItems;

        const resto = await Promise.all(
          Array.from({ length: totalPaginas - 1 }, (_, i) =>
            api.get(`/miembros?pagina=${i + 2}&porPagina=${porPagina}`),
          ),
        );
        const acumulados = [...primerosItems];
        for (const r of resto) {
          if (Array.isArray(r.data?.items)) acumulados.push(...r.data.items);
        }
        return acumulados;
      };

      const [listaMiembros, resE, resP] = await Promise.all([
        cargarMiembrosPaginados(),
        api.get(`/legajos/entregas?cicloAnio=${ciclo}`),
        api.get(`/legajos/plantillas?cicloAnio=${ciclo}`).catch(() => ({ data: [] })),
      ]);
      setMiembros(listaMiembros);
      setEntregas(Array.isArray(resE.data) ? resE.data : []);
      let pList = Array.isArray(resP.data) ? resP.data : [];
      if (pList.length === 0) {
        const resTodas = await api.get('/legajos/plantillas').catch(() => ({ data: [] }));
        pList = Array.isArray(resTodas.data) ? resTodas.data : [];
      }
      setPlantillas(pList);
    } catch (err) {
      if (!esErrorOffline(err)) {
        mostrarToast(traducirErrorAmigable(err, 'No se pudo cargar el cumplimiento.'), 'error');
      }
    } finally {
      setCargandoCumplimiento(false);
    }
  }, [mostrarToast]);

  const cargarColaboradores = useCallback(async () => {
    setCargandoColab(true);
    try {
      const res = await api.get(
        `/legajos/colaboradores-adultos?cicloAnio=${obtenerCicloAnioActual()}`,
      );
      setColaboradores(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      if (!esErrorOffline(err)) {
        mostrarToast(traducirErrorAmigable(err, 'No se pudieron cargar los colaboradores.'), 'error');
      }
    } finally {
      setCargandoColab(false);
    }
  }, [mostrarToast]);

  const cargarPlantillasAdmin = useCallback(async () => {
    setCargandoPlantillas(true);
    try {
      const res = await api.get(
        `/legajos/plantillas${esGlobalPlantillas ? '?incluirInactivas=true' : ''}`,
      );
      setPlantillasAdmin(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      if (!esErrorOffline(err)) {
        mostrarToast(traducirErrorAmigable(err, 'No se pudieron cargar las plantillas.'), 'error');
      }
    } finally {
      setCargandoPlantillas(false);
    }
  }, [esGlobalPlantillas, mostrarToast]);

  useEffect(() => {
    if (tab === 'cumplimiento' || tab === 'salud') void cargarCumplimiento();
    else if (tab === 'colaboradores') void cargarColaboradores();
    else if (tab === 'plantillas') void cargarPlantillasAdmin();
  }, [tab, cargarCumplimiento, cargarColaboradores, cargarPlantillasAdmin, lastValidationAt]);

  useEffect(() => {
    return () => {
      if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
    };
  }, [pdfPreviewUrl]);

  // Mapa de entregas del ciclo por usuarioId (soporta múltiples documentos por miembro)
  const entregasPorUsuarioLista = useMemo(() => {
    const map = new Map<number, any[]>();
    for (const e of entregas) {
      const lista = map.get(e.usuarioId) || [];
      lista.push(e);
      map.set(e.usuarioId, lista);
    }
    return map;
  }, [entregas]);

  const filasBaseCumplimiento = useMemo(() => {
    const baseMiembros = miembros
      .filter((m) => m.activo !== false)
      .filter((m) => {
        if (activeUnitId === 'ALL') return true;
        return Boolean(
          m.asignaciones?.some(
            (a: any) => a.activo && Number(a.unidadId ?? a.unidad?.id) === activeUnitId,
          ),
        );
      });

    const filas: Array<{
      miembro: any;
      entrega: any | null;
      plantilla: any | null;
      totalAplicables: number;
      completadasCount: number;
      estado: FiltroEstadoEntrega;
      estadoRaw: string | null;
      unidadNombre: string;
    }> = [];

    for (const m of baseMiembros) {
      const entList = entregasPorUsuarioLista.get(m.id) || [];
      const aplicables = filtrarPlantillasParaMiembro(plantillas, m, m.asignaciones);
      const completadasCount = entList.filter(
        (e) => e.estado === 'PENDIENTE_FIRMA_FISICA' || e.estado === 'VALIDADO_FISICAMENTE',
      ).length;

      if (plantillaFiltroId !== 'PRINCIPAL') {
        const aplica = aplicables.some((p) => p.id === plantillaFiltroId);
        const entEsp = entList.find((e) => e.plantillaId === plantillaFiltroId) || null;
        if (!aplica && !entEsp) continue;

        const plantillaObj =
          aplicables.find((p) => p.id === plantillaFiltroId) ||
          plantillas.find((p) => p.id === plantillaFiltroId) ||
          null;
        const rolP = obtenerRolPrincipal(m);
        filas.push({
          miembro: m,
          entrega: entEsp,
          plantilla: plantillaObj,
          totalAplicables: aplicables.length,
          completadasCount,
          estado: normalizarEstadoFiltro(entEsp?.estado),
          estadoRaw: entEsp?.estado || null,
          unidadNombre: rolP?.unidad?.nombre || 'Sin unidad',
        });
      } else {
        const plantillaPrincipal =
          aplicables[0] ||
          seleccionarPlantillaPorMiembro(plantillas, m, m.asignaciones) ||
          plantillas[0] ||
          null;
        const ent =
          (plantillaPrincipal
            ? entList.find((e) => e.plantillaId === plantillaPrincipal.id)
            : null) ||
          entList[0] ||
          null;
        const rolP = obtenerRolPrincipal(m);
        filas.push({
          miembro: m,
          entrega: ent,
          plantilla: plantillaPrincipal,
          totalAplicables: aplicables.length,
          completadasCount,
          estado: normalizarEstadoFiltro(ent?.estado),
          estadoRaw: ent?.estado || null,
          unidadNombre: rolP?.unidad?.nombre || 'Sin unidad',
        });
      }
    }

    return filas;
  }, [miembros, entregasPorUsuarioLista, plantillas, activeUnitId, plantillaFiltroId]);

  const registrosCumplimiento = useMemo(() => {
    const q = normalizarTextoBusqueda(busquedaCumplimiento);
    return filasBaseCumplimiento.filter((row) => {
      if (filtroEstado === 'PENDIENTES') {
        if (row.estado !== 'SIN_FICHA' && row.estado !== 'BORRADOR') return false;
      } else if (filtroEstado !== 'TODOS' && row.estado !== filtroEstado) {
        return false;
      }
      if (!q) return true;
      const full = normalizarTextoBusqueda(`${row.miembro.nombre} ${row.miembro.apellido}`);
      const inv = normalizarTextoBusqueda(`${row.miembro.apellido} ${row.miembro.nombre}`);
      return (
        full.includes(q) ||
        inv.includes(q) ||
        String(row.miembro.dni || '').includes(q) ||
        normalizarTextoBusqueda(row.unidadNombre).includes(q) ||
        normalizarTextoBusqueda(row.plantilla?.titulo || '').includes(q)
      );
    });
  }, [filasBaseCumplimiento, filtroEstado, busquedaCumplimiento]);

  const kpisCumplimiento = useMemo(() => {
    let validados = 0;
    let listos = 0;
    let pendientes = 0;
    for (const row of filasBaseCumplimiento) {
      if (row.estado === 'VALIDADO_FISICO') validados++;
      else if (row.estado === 'LISTO_PARA_FIRMA') listos++;
      else pendientes++;
    }
    return { total: filasBaseCumplimiento.length, validados, listos, pendientes };
  }, [filasBaseCumplimiento]);

  // Catálogos y registros consolidados de Salud y Alimentación
  const catalogosMedicos = useMemo(
    () => extraerCatalogosMedicosDinamicos(plantillas),
    [plantillas],
  );

  const registrosSaludBase = useMemo(() => {
    return miembros
      .filter((m) => m.activo !== false)
      .filter((m) => {
        if (activeUnitId === 'ALL') return true;
        return Boolean(
          m.asignaciones?.some(
            (a: any) => a.activo && Number(a.unidadId ?? a.unidad?.id) === activeUnitId,
          ),
        );
      })
      .map((m) => {
        const entList = entregasPorUsuarioLista.get(m.id) || [];
        const info = extraerInfoMedicaMiembro(m, entList, plantillas);
        const plantillaPrincipal = seleccionarPlantillaPorMiembro(
          plantillas,
          m,
          m.asignaciones,
        );
        const entregaPrincipal =
          (plantillaPrincipal
            ? entList.find((e) => e.plantillaId === plantillaPrincipal.id)
            : null) ||
          entList[0] ||
          null;
        const rolP = obtenerRolPrincipal(m);
        const tieneNovedad =
          info.tieneDieta ||
          info.tieneAlergia ||
          info.tomaMedicacion ||
          info.tieneCondicionCronica ||
          info.tieneRestriccionFisica ||
          info.tieneCud ||
          info.tieneAlertas;

        return {
          miembro: m,
          info,
          entregaPrincipal,
          entList,
          unidadNombre: rolP?.unidad?.nombre || 'Sin unidad',
          tieneNovedad,
        };
      });
  }, [miembros, activeUnitId, entregasPorUsuarioLista, plantillas]);

  const conteosDieta = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of registrosSaludBase) {
      for (const d of row.info.dietas) {
        map.set(d, (map.get(d) || 0) + 1);
      }
    }
    return map;
  }, [registrosSaludBase]);

  const gruposSanguineosDisponibles = useMemo(() => {
    const set = new Set<string>();
    for (const row of registrosSaludBase) {
      if (row.info.grupoSanguineo) set.add(row.info.grupoSanguineo);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [registrosSaludBase]);

  const kpisSalud = useMemo(() => {
    let conDieta = 0;
    let conAlergia = 0;
    let conMedicacionOCond = 0;
    let conRestriccionOCud = 0;
    let conDietaOAlergia = 0;
    for (const row of registrosSaludBase) {
      if (row.info.tieneDieta || row.info.tieneAlergia) conDietaOAlergia++;
      if (row.info.tieneDieta) conDieta++;
      if (row.info.tieneAlergia) conAlergia++;
      if (row.info.tomaMedicacion || row.info.tieneCondicionCronica) conMedicacionOCond++;
      if (row.info.tieneRestriccionFisica || row.info.tieneCud) conRestriccionOCud++;
    }
    return {
      total: registrosSaludBase.length,
      conDieta,
      conAlergia,
      conMedicacionOCond,
      conRestriccionOCud,
      conDietaOAlergia,
    };
  }, [registrosSaludBase]);

  const registrosSalud = useMemo(() => {
    const q = normalizarTextoBusqueda(busquedaSalud);
    return registrosSaludBase.filter((row) => {
      const { info, miembro, unidadNombre, tieneNovedad } = row;
      if (soloNovedadesSalud && !tieneNovedad) return false;

      if (filtroDietaSalud === 'CUALQUIERA' && !info.tieneDieta) return false;
      if (
        filtroDietaSalud !== 'TODAS' &&
        filtroDietaSalud !== 'CUALQUIERA' &&
        !info.dietas.includes(filtroDietaSalud)
      ) {
        return false;
      }

      if (filtroSaludCat === 'DIETA' && !info.tieneDieta) return false;
      if (filtroSaludCat === 'ALERGIA' && !info.tieneAlergia) return false;
      if (
        filtroSaludCat === 'MEDICACION_CRONICA' &&
        !info.tomaMedicacion &&
        !info.tieneCondicionCronica
      ) {
        return false;
      }
      if (
        filtroSaludCat === 'RESTRICCION_CUD' &&
        !info.tieneRestriccionFisica &&
        !info.tieneCud
      ) {
        return false;
      }
      if (filtroSaludCat === 'ALERGIA_ALIMENTOS' && !info.alergiasTipos.includes('ALIMENTOS')) {
        return false;
      }
      if (
        filtroSaludCat === 'ALERGIA_MEDICAMENTOS' &&
        !info.alergiasTipos.includes('MEDICAMENTOS')
      ) {
        return false;
      }
      if (filtroSaludCat === 'ALERGIA_PICADURAS' && !info.alergiasTipos.includes('PICADURAS')) {
        return false;
      }
      if (filtroSaludCat === 'ALERGIA_AMBIENTALES' && !info.alergiasTipos.includes('AMBIENTALES')) {
        return false;
      }
      if (filtroSaludCat === 'TOMA_MEDICACION' && !info.tomaMedicacion) return false;
      if (filtroSaludCat === 'ENFERMEDAD_CRONICA' && !info.tieneCondicionCronica) return false;
      if (filtroSaludCat === 'RESTRICCION_FISICA' && !info.tieneRestriccionFisica) return false;
      if (filtroSaludCat === 'TIENE_CUD' && !info.tieneCud) return false;

      if (filtroGrupoSanguineo !== 'TODOS' && info.grupoSanguineo !== filtroGrupoSanguineo) {
        return false;
      }

      if (!q) return true;
      const haystack = normalizarTextoBusqueda(
        [
          `${miembro.nombre} ${miembro.apellido}`,
          `${miembro.apellido} ${miembro.nombre}`,
          String(miembro.dni || ''),
          unidadNombre,
          info.grupoSanguineo || '',
          info.obraSocial || '',
          ...info.dietasLabels,
          info.dietaDetalle || '',
          ...info.alergiasLabels,
          info.alergiasDetalle || '',
          ...info.medicacionLabels,
          info.medicacionDetalle || '',
          ...info.condicionesLabels,
          info.condicionesDetalle || '',
          info.restriccionFisica || '',
          info.resumenAlertas,
        ].join(' '),
      );
      return haystack.includes(q);
    });
  }, [
    registrosSaludBase,
    busquedaSalud,
    soloNovedadesSalud,
    filtroDietaSalud,
    filtroSaludCat,
    filtroGrupoSanguineo,
  ]);

  const handleExportarSalud = (formato: 'xlsx' | 'csv') => {
    const columnas: ColumnaExportacion<(typeof registrosSalud)[number]>[] = [
      {
        header: 'Apellido y nombre',
        formatear: (r) => `${r.miembro.apellido || ''}, ${r.miembro.nombre || ''}`.trim(),
      },
      { header: 'DNI', formatear: (r) => String(r.miembro.dni || '') },
      { header: 'Unidad / rama', formatear: (r) => r.unidadNombre },
      { header: 'Grupo sanguíneo', formatear: (r) => r.info.grupoSanguineo || '' },
      {
        header: 'Obra social',
        formatear: (r) =>
          [r.info.obraSocial, r.info.afiliadoObraSocial ? `N° ${r.info.afiliadoObraSocial}` : '']
            .filter(Boolean)
            .join(' · '),
      },
      {
        header: 'Régimen alimentario',
        formatear: (r) =>
          [...r.info.dietasLabels, r.info.dietaDetalle].filter(Boolean).join(' — '),
      },
      {
        header: 'Alergias',
        formatear: (r) =>
          [...r.info.alergiasLabels, r.info.alergiasDetalle].filter(Boolean).join(' — '),
      },
      {
        header: 'Medicación',
        formatear: (r) =>
          [...r.info.medicacionLabels, r.info.medicacionDetalle].filter(Boolean).join(' — '),
      },
      {
        header: 'Condiciones crónicas',
        formatear: (r) =>
          [...r.info.condicionesLabels, r.info.condicionesDetalle].filter(Boolean).join(' — '),
      },
      {
        header: 'Restricción física / CUD',
        formatear: (r) =>
          [r.info.tieneCud ? 'Posee CUD' : '', r.info.restriccionFisica]
            .filter(Boolean)
            .join(' — '),
      },
      {
        header: 'Teléfonos emergencia',
        formatear: (r) =>
          [r.info.telEmergencia1, r.info.telEmergencia2].filter(Boolean).join(' / '),
      },
    ];
    const nombreArchivo = `Salud_y_Alimentacion_${obtenerCicloAnioActual()}`;
    if (formato === 'xlsx') {
      return exportarAExcel({
        filas: registrosSalud,
        columnas,
        nombreArchivo,
        nombreHoja: 'Salud_Alimentacion',
      });
    } else {
      exportarACSV({
        filas: registrosSalud,
        columnas,
        nombreArchivo,
      });
    }
    mostrarToast(`Planilla ${formato.toUpperCase()} descargada.`);
  };

  const handleValidarFisico = async (entrega: any, miembro: any) => {
    if (!entrega?.hashVerificacion) return;
    setValidandoHash(entrega.hashVerificacion);
    try {
      await api.post(`/legajos/qr/validar/${entrega.hashVerificacion}`);
      mostrarToast(`Legajo de ${miembro.nombre} ${miembro.apellido} validado físicamente.`);
      await cargarCumplimiento();
    } catch (err) {
      mostrarToast(traducirErrorAmigable(err, 'No se pudo validar el legajo.'), 'error');
    } finally {
      setValidandoHash(null);
    }
  };

  const generandoPdfRef = useRef(false);
  const handleVerPdfMiembro = async (miembro: any, entrega: any) => {
    if (generandoPdfRef.current) return; // evita doble toque mientras se genera
    generandoPdfRef.current = true;
    mostrarToast('Generando PDF…', 'exito');
    try {
      const plantilla =
        plantillas.find((p) => p.id === entrega?.plantillaId) ||
        seleccionarPlantillaPorMiembro(plantillas, miembro, miembro.asignaciones) ||
        plantillas[0];
      const mapeo: MapeoPdf = plantilla?.mapeoPdfJson || { pdfBaseUrl: '', campos: {} };
      const rolP = obtenerRolPrincipal(miembro);
      const usuarioPdf = {
        nombre: miembro.nombre,
        apellido: miembro.apellido,
        dni: miembro.dni,
        fechaNacimiento: miembro.fechaNacimiento,
        ramaNombre: rolP?.unidad?.nombre || '',
        telefonoContacto: miembro.telefonoContacto,
      };
      const bytes = await generarFichaPdf(
        mapeo,
        entrega?.respuestasSnapshotJson || miembro.datosFijosJson || {},
        entrega?.hashVerificacion || `FICHA-${miembro.dni}-${obtenerCicloAnioActual()}`,
        usuarioPdf,
        entrega?.versionImpresion || 1,
        plantilla?.esquemaCamposJson,
      );
      if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
      setPdfPreviewBytes(bytes);
      setPdfPreviewTitle(`Legajo: ${miembro.apellido}, ${miembro.nombre}`);
      setPdfPreviewUrl(crearUrlPdfBlob(bytes));
    } catch (err) {
      mostrarToast(traducirErrorAmigable(err, 'No se pudo generar el PDF.'), 'error');
    } finally {
      generandoPdfRef.current = false;
    }
  };

  // Colaboradores filtrados
  const colaboradoresFiltrados = useMemo(() => {
    const q = normalizarTextoBusqueda(busquedaColab);
    return colaboradores.filter((c) => {
      if (filtroDisciplina === 'COCINA' && !c.areas?.cocinaCampamento) return false;
      if (filtroDisciplina === 'CAMPAMENTO' && !c.areas?.campamento) return false;
      if (
        filtroDisciplina === 'TRANSPORTE' &&
        !(c.areas?.transporte || c.areas?.camion || c.areas?.camioneta || c.areas?.colectivo)
      ) {
        return false;
      }
      if (filtroDisciplina === 'MANTENIMIENTO' && !c.areas?.manoObra) return false;
      if (filtroDisciplina === 'ENSENANZA' && !c.areas?.ensenando) return false;
      if (filtroDisciplina === 'ADMIN' && !c.areas?.administrativo) return false;
      if (filtroDisciplina === 'SERVICIO' && !c.areas?.servicioComunitario) return false;

      const matCamp = Boolean(
        c.materiales?.campamentoPrestamo || c.materiales?.campamentoDonacion,
      );
      const matConst = Boolean(
        c.materiales?.construccionPrestamo || c.materiales?.construccionDonacion,
      );
      if (filtroMaterial === 'CAMPAMENTO' && !matCamp) return false;
      if (filtroMaterial === 'CONSTRUCCION' && !matConst) return false;
      if (filtroMaterial === 'CUALQUIERA' && !matCamp && !matConst) return false;

      if (!q) return true;
      return (
        normalizarTextoBusqueda(c.adulto?.nombre || '').includes(q) ||
        normalizarTextoBusqueda(c.adulto?.profesion || '').includes(q) ||
        normalizarTextoBusqueda(
          `${c.protagonista?.nombre || ''} ${c.protagonista?.apellido || ''}`,
        ).includes(q) ||
        normalizarTextoBusqueda(c.protagonista?.unidad || '').includes(q)
      );
    });
  }, [colaboradores, busquedaColab, filtroDisciplina, filtroMaterial]);

  const handleExportarColaboradores = (formato: 'xlsx' | 'csv') => {
    const columnas: ColumnaExportacion<(typeof colaboradoresFiltrados)[number]>[] = [
      { header: 'Adulto colaborador', formatear: (r) => r.adulto?.nombre || '' },
      { header: 'Profesión / oficio', formatear: (r) => r.adulto?.profesion || '' },
      { header: 'Teléfono', formatear: (r) => r.adulto?.telefono || '' },
      { header: 'Preferencia', formatear: (r) => r.adulto?.preferenciaTrabajo || '' },
      {
        header: 'Protagonista',
        formatear: (r) => `${r.protagonista?.nombre || ''} ${r.protagonista?.apellido || ''}`.trim(),
      },
      { header: 'Unidad', formatear: (r) => r.protagonista?.unidad || '' },
      {
        header: 'Áreas de colaboración',
        formatear: (r) => {
          const a = r.areas || {};
          const lista: string[] = [];
          if (a.cocinaCampamento) lista.push('Cocina');
          if (a.campamento) lista.push('Campamento');
          if (a.transporte || a.camion || a.camioneta || a.colectivo) lista.push('Transporte');
          if (a.manoObra) lista.push('Mantenimiento');
          if (a.ensenando) lista.push('Talleres');
          if (a.administrativo) lista.push('Administrativo');
          if (a.servicioComunitario) lista.push('Servicio Comunitario');
          if (a.otros && a.otrosDetalle) lista.push(`Otros: ${a.otrosDetalle}`);
          return lista.join(', ');
        },
      },
      {
        header: 'Materiales campamento',
        formatear: (r) =>
          [r.materiales?.campamentoPrestamo, r.materiales?.campamentoDonacion]
            .filter(Boolean)
            .join(' / '),
      },
      {
        header: 'Materiales construcción',
        formatear: (r) =>
          [r.materiales?.construccionPrestamo, r.materiales?.construccionDonacion]
            .filter(Boolean)
            .join(' / '),
      },
    ];
    const nombreArchivo = `Colaboradores_Adultos_${obtenerCicloAnioActual()}`;
    if (formato === 'xlsx') {
      return exportarAExcel({
        filas: colaboradoresFiltrados,
        columnas,
        nombreArchivo,
        nombreHoja: 'Colaboradores',
      });
    } else {
      exportarACSV({
        filas: colaboradoresFiltrados,
        columnas,
        nombreArchivo,
      });
    }
    mostrarToast(`Planilla ${formato.toUpperCase()} descargada.`);
  };

  // Plantillas CRUD handlers (flujo unificado en VisualPdfEditorDrawer)
  const abrirNuevaPlantilla = () => {
    setEditorDocumentoEstado({
      abierto: true,
      plantilla: null,
      modoCrear: true,
      plantillaBaseDuplicar: null,
    });
  };

  const abrirEditarDocumento = (p: any) => {
    setEditorDocumentoEstado({
      abierto: true,
      plantilla: p,
      modoCrear: false,
      plantillaBaseDuplicar: null,
    });
  };

  const abrirDuplicarPlantilla = (p: any) => {
    setEditorDocumentoEstado({
      abierto: true,
      plantilla: null,
      modoCrear: true,
      plantillaBaseDuplicar: p,
    });
  };

  const handleToggleActivaPlantilla = async (p: any) => {
    if (!caps.canManagePlantillas) return;
    setProcesandoPlantillaId(p.id);
    try {
      const nextActiva = !p.activa;
      await api.patch(`/legajos/plantillas/${p.id}`, { activa: nextActiva });
      mostrarToast(
        nextActiva ? `Documento "${p.titulo}" activado.` : `Documento "${p.titulo}" pausado.`,
      );
      await cargarPlantillasAdmin();
    } catch (err) {
      mostrarToast(traducirErrorAmigable(err, 'No se pudo actualizar el estado.'), 'error');
    } finally {
      setProcesandoPlantillaId(null);
    }
  };

  const { plantillasActivasOrdenadas, plantillasPausadas } = useMemo(() => {
    const activas = plantillasAdmin
      .filter((p) => p.activa !== false)
      .sort((a, b) => {
        const oA = typeof a?.esquemaCamposJson?.orden === 'number' ? a.esquemaCamposJson.orden : 999;
        const oB = typeof b?.esquemaCamposJson?.orden === 'number' ? b.esquemaCamposJson.orden : 999;
        if (oA !== oB) return oA - oB;
        const pA = esPlantillaPrincipal(a) ? 0 : 1;
        const pB = esPlantillaPrincipal(b) ? 0 : 1;
        if (pA !== pB) return pA - pB;
        return Number(a.id) - Number(b.id);
      });
    const pausadas = plantillasAdmin.filter((p) => p.activa === false);
    return { plantillasActivasOrdenadas: activas, plantillasPausadas: pausadas };
  }, [plantillasAdmin]);

  const tabItems = useMemo(() => {
    type ItemTab = { id: TabLegajos; label: string; icon: React.ReactNode; badge?: number };
    const tabsDatos: ItemTab[] = [
      {
        id: 'cumplimiento',
        label: 'Cumplimiento',
        icon: <FileCheck2 className="w-3.5 h-3.5" />,
        badge: kpisCumplimiento.total,
      },
      {
        id: 'salud',
        label: 'Salud y alimentación',
        icon: <HeartPulse className="w-3.5 h-3.5" />,
        // Personas con dieta o alergia (antes sumaba ambas y contaba doble a quien tenía las dos).
        badge: kpisSalud.conDietaOAlergia,
      },
      {
        id: 'colaboradores',
        label: 'Adultos colaboradores',
        icon: <HeartHandshake className="w-3.5 h-3.5" />,
      },
    ];
    const items: ItemTab[] = puedeVerDatosLegajos ? tabsDatos : [];
    if (puedeVerPlantillasTab) {
      items.push({
        id: 'plantillas',
        label: 'Plantillas y editor PDF',
        icon: <PenTool className="w-3.5 h-3.5" />,
      });
    }
    return items;
  }, [
    puedeVerPlantillasTab,
    puedeVerDatosLegajos,
    kpisCumplimiento.total,
    kpisSalud.conDieta,
    kpisSalud.conAlergia,
  ]);

  return (
    <div className="space-y-5 s-anim-view">
      {dialogoConfirmacion}
      {pdfPreviewUrl && (
        <Suspense fallback={null}>
          <PdfViewerModal
            url={pdfPreviewUrl}
            titulo={pdfPreviewTitle}
            subtitulo={`Ciclo ${obtenerCicloAnioActual()}`}
            onCerrar={() => {
              if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
              setPdfPreviewUrl(null);
              setPdfPreviewBytes(null);
            }}
            onDescargar={() => {
              if (pdfPreviewBytes) {
                descargarPdfBlob(pdfPreviewBytes, `${pdfPreviewTitle.replace(/\s+/g, '_')}.pdf`);
              }
            }}
          />
        </Suspense>
      )}

      {/* Cabecera */}
      <div className="s-card rounded-2xl p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5 min-w-0">
          <div className="flex items-center gap-2.5">
            <FileCheck2 className="w-6 h-6 text-brand shrink-0" />
            <h1 className="text-xl sm:text-2xl font-black text-ink tracking-tight">
              Legajos, salud y colaboración familiar
            </h1>
          </div>
          <p className="text-sm text-ink-muted">
            Control de fichas del ciclo {obtenerCicloAnioActual()}, validación QR en mano, voluntariado adulto y editor visual de plantillas PDF.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {caps.canValidateQr && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => abrirQr('legajo')}
              leftIcon={<Camera className="w-4 h-4 text-brand" />}
            >
              Validar QR
            </Button>
          )}
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => navigate('/legajos/completar')}
            leftIcon={<FileText className="w-4 h-4" />}
          >
            Completar mi legajo
          </Button>
        </div>
      </div>

      {/* Sub-tabs */}
      <SegmentedTabs
        items={tabItems}
        activeId={tab}
        onChange={cambiarTab}
        ariaLabel="Secciones de Legajos"
      />

      {/* TAB 1: CUMPLIMIENTO */}
      {tab === 'cumplimiento' && (
        <div className="space-y-4 s-anim-tab">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard
              label="Miembros"
              value={kpisCumplimiento.total}
              hint={obtenerNombreUnidadActiva(activeUnitId, caps)}
              tone="neutral"
              onClick={() => setFiltroEstado('TODOS')}
              active={filtroEstado === 'TODOS'}
            />
            <KpiCard
              label="Validado físico"
              value={kpisCumplimiento.validados}
              hint="Firma y recepción confirmada"
              tone="ok"
              icon={<CheckCircle2 className="w-4 h-4" />}
              onClick={() => setFiltroEstado('VALIDADO_FISICO')}
              active={filtroEstado === 'VALIDADO_FISICO'}
            />
            <KpiCard
              label="Listo para firma"
              value={kpisCumplimiento.listos}
              hint="Pendiente entrega papel/QR"
              tone="brand"
              icon={<Clock className="w-4 h-4" />}
              onClick={() => setFiltroEstado('LISTO_PARA_FIRMA')}
              active={filtroEstado === 'LISTO_PARA_FIRMA'}
            />
            <KpiCard
              label="Sin ficha / borrador"
              value={kpisCumplimiento.pendientes}
              hint="Requiere completar"
              tone="warn"
              icon={<AlertCircle className="w-4 h-4" />}
              onClick={() => setFiltroEstado('PENDIENTES')}
              active={filtroEstado === 'PENDIENTES'}
            />
          </div>

          <div className="s-card rounded-2xl overflow-hidden">
            <div className="p-4 sm:p-5 bg-paper-2 border-b border-rule flex flex-col gap-3">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      { id: 'TODOS', label: 'Todos' },
                      { id: 'LISTO_PARA_FIRMA', label: 'Listos p/ validar' },
                      { id: 'VALIDADO_FISICO', label: 'Validados' },
                      { id: 'BORRADOR', label: 'Borrador' },
                      { id: 'SIN_FICHA', label: 'Sin ficha' },
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      aria-pressed={filtroEstado === f.id}
                      onClick={() => setFiltroEstado(f.id)}
                      className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-[13px] font-bold border cursor-pointer transition ${
                        filtroEstado === f.id ? 's-btn-brand border-brand' : 's-btn-sec text-ink-2'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  {plantillas.length > 0 && (
                    <Select
                      value={plantillaFiltroId === 'PRINCIPAL' ? 'PRINCIPAL' : String(plantillaFiltroId)}
                      onChange={(e) =>
                        setPlantillaFiltroId(
                          e.target.value === 'PRINCIPAL' ? 'PRINCIPAL' : Number(e.target.value),
                        )
                      }
                      aria-label="Filtrar por documento o plantilla"
                      className="sm:w-64"
                    >
                      <option value="PRINCIPAL">Documento principal por miembro</option>
                      {plantillas.map((p) => (
                        <option key={p.id} value={String(p.id)}>
                          {p.titulo} ({p.cicloAnio})
                        </option>
                      ))}
                    </Select>
                  )}

                  <div className="flex items-center gap-2">
                    <div className="relative flex-1 sm:w-64">
                      <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
                      <input
                        type="text"
                        value={busquedaCumplimiento}
                        onChange={(e) => setBusquedaCumplimiento(e.target.value)}
                        placeholder="Buscar miembro, DNI o sección..."
                        className="s-input w-full min-h-[44px] pl-10 pr-9 rounded-xl text-base sm:text-[15px]"
                      />
                      {busquedaCumplimiento && (
                        <button
                          type="button"
                          onClick={() => setBusquedaCumplimiento('')}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => void cargarCumplimiento()}
                      aria-label="Refrescar cumplimiento"
                    >
                      <RefreshCw className={`w-4 h-4 ${cargandoCumplimiento ? 'animate-spin' : ''}`} />
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {cargandoCumplimiento && miembros.length === 0 ? (
              <div className="p-10 text-center text-sm text-ink-muted flex flex-col items-center gap-2.5">
                <Loader2 className="w-6 h-6 animate-spin text-brand" />
                <span>Cargando estado de legajos…</span>
              </div>
            ) : registrosCumplimiento.length === 0 ? (
              <div className="p-10 text-center text-sm text-ink-muted">
                No se encontraron miembros con los filtros actuales.
              </div>
            ) : (
              <div className="divide-y divide-rule">
                {registrosCumplimiento.map(
                  ({
                    miembro,
                    entrega,
                    plantilla,
                    totalAplicables,
                    completadasCount,
                    estado,
                    estadoRaw,
                    unidadNombre,
                  }) => {
                    const badge =
                      estadoRaw === 'DESACTUALIZADO_REQUIERE_REIMPRESION'
                        ? { cls: 's-badge-warn', label: 'Desactualizado (reimprimir)' }
                        : estado === 'VALIDADO_FISICO'
                          ? { cls: 's-badge-ok', label: 'Validado físico' }
                          : estado === 'LISTO_PARA_FIRMA'
                            ? { cls: 's-badge-brand', label: 'Listo para firma' }
                            : estado === 'BORRADOR'
                              ? { cls: 's-badge-info', label: 'Borrador' }
                              : { cls: 's-badge-warn', label: 'Sin ficha' };

                    const completarUrl = `/legajos/completar?usuarioId=${miembro.id}${
                      plantilla?.id ? `&plantillaId=${plantilla.id}` : ''
                    }`;

                    return (
                      <div
                        key={miembro.id}
                        className="p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-paper-2/40 transition"
                      >
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Link
                              to={`/miembros/${miembro.id}?tab=ficha`}
                              className="text-[15px] font-black text-ink hover:text-brand-ink transition-colors"
                            >
                              {miembro.apellido}, {miembro.nombre}
                            </Link>
                            <span
                              className={`${badge.cls} px-2.5 py-0.5 rounded-full text-xs font-bold whitespace-nowrap`}
                            >
                              {badge.label}
                            </span>
                            {totalAplicables > 1 && (
                              <span className="px-2 py-0.5 rounded-full bg-paper-2 border border-rule text-xs font-bold text-ink-2 s-tabular">
                                {completadasCount}/{totalAplicables} docs
                              </span>
                            )}
                          </div>
                          <div className="text-[13px] text-ink-muted flex items-center gap-2 flex-wrap s-tabular">
                            <span>DNI {miembro.dni}</span>
                            <span>·</span>
                            <span className="font-semibold text-ink-2">{unidadNombre}</span>
                            {plantilla?.titulo && (
                              <>
                                <span>·</span>
                                <span className="truncate max-w-xs">{plantilla.titulo}</span>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          {puedeEditarLegajoDe(miembro) &&
                            miembro?.id !== usuarioActual?.id &&
                            estado === 'LISTO_PARA_FIRMA' &&
                            entrega?.hashVerificacion && (
                              <Button
                                type="button"
                                variant="primary"
                                size="sm"
                                loading={validandoHash === entrega.hashVerificacion}
                                onClick={() =>
                                  pedirConfirmacion(
                                    {
                                      titulo: 'Validar legajo físico',
                                      mensaje: (
                                        <>
                                          ¿Confirmás que recibiste el legajo físico firmado de <strong>{miembro.nombre} {miembro.apellido}</strong>?
                                        </>
                                      ),
                                      impacto: 'La entrega quedará marcada como validada en el sistema.',
                                      peligroso: false,
                                      textoConfirmar: 'Validar',
                                    },
                                    () => handleValidarFisico(entrega, miembro),
                                  )
                                }
                                leftIcon={<CheckCircle2 className="w-4 h-4" />}
                              >
                                Validar físico
                              </Button>
                            )}

                          {entrega && (
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => void handleVerPdfMiembro(miembro, entrega)}
                              leftIcon={<Eye className="w-4 h-4" />}
                            >
                              Ver PDF
                            </Button>
                          )}

                          {(miembro?.id === usuarioActual?.id || puedeEditarLegajoDe(miembro)) && (
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => navigate(completarUrl)}
                              leftIcon={<Edit2 className="w-4 h-4" />}
                            >
                              {entrega ? 'Editar' : 'Completar'}
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  },
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: SALUD Y ALIMENTACIÓN */}
      {tab === 'salud' && (
        <div className="space-y-4 s-anim-tab">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard
              label="Régimen de comidas"
              value={kpisSalud.conDieta}
              hint={`${kpisSalud.total} activos en ${obtenerNombreUnidadActiva(activeUnitId, caps)}`}
              tone="brand"
              icon={<Utensils className="w-4 h-4" />}
              // Usa el mismo filtro que el chip "Con régimen especial" (antes eran dos filtros distintos).
              onClick={() =>
                setFiltroDietaSalud((prev) => (prev === 'CUALQUIERA' ? 'TODAS' : 'CUALQUIERA'))
              }
              active={filtroDietaSalud === 'CUALQUIERA'}
            />
            <KpiCard
              label="Con alergias"
              value={kpisSalud.conAlergia}
              hint="Alimentos, fármacos, picaduras"
              tone="warn"
              icon={<AlertTriangle className="w-4 h-4" />}
              onClick={() =>
                setFiltroSaludCat((prev) => (prev === 'ALERGIA' ? 'TODOS' : 'ALERGIA'))
              }
              active={filtroSaludCat === 'ALERGIA'}
            />
            <KpiCard
              label="Medicación / crónicas"
              value={kpisSalud.conMedicacionOCond}
              hint="Seguimiento botiquín y enfermería"
              tone="neutral"
              icon={<Pill className="w-4 h-4" />}
              onClick={() =>
                setFiltroSaludCat((prev) =>
                  prev === 'MEDICACION_CRONICA' ? 'TODOS' : 'MEDICACION_CRONICA',
                )
              }
              active={filtroSaludCat === 'MEDICACION_CRONICA'}
            />
            <KpiCard
              label="Restricciones / CUD"
              value={kpisSalud.conRestriccionOCud}
              hint="Cuidados físicos y acompañamiento"
              tone="warn"
              icon={<ShieldAlert className="w-4 h-4" />}
              onClick={() =>
                setFiltroSaludCat((prev) =>
                  prev === 'RESTRICCION_CUD' ? 'TODOS' : 'RESTRICCION_CUD',
                )
              }
              active={filtroSaludCat === 'RESTRICCION_CUD'}
            />
          </div>

          <div className="s-card rounded-2xl overflow-hidden">
            <div className="p-4 sm:p-5 bg-paper-2 border-b border-rule space-y-3">
              {/* Filtros rápidos de régimen alimentario (cocina) */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-black uppercase tracking-wider text-ink-muted mr-1 flex items-center gap-1.5">
                  <Utensils className="w-3.5 h-3.5 text-brand" />
                  Cocina / dieta:
                </span>
                <button
                  aria-pressed={filtroDietaSalud === 'TODAS'}
                  type="button"
                  onClick={() => setFiltroDietaSalud('TODAS')}
                  className={`min-h-[34px] px-3 py-1 rounded-xl text-xs font-bold border cursor-pointer transition ${
                    filtroDietaSalud === 'TODAS' ? 's-btn-brand border-brand' : 's-btn-sec text-ink-2'
                  }`}
                >
                  Todas
                </button>
                <button
                  aria-pressed={filtroDietaSalud === 'CUALQUIERA'}
                  type="button"
                  onClick={() => setFiltroDietaSalud('CUALQUIERA')}
                  className={`min-h-[34px] px-3 py-1 rounded-xl text-xs font-bold border cursor-pointer transition ${
                    filtroDietaSalud === 'CUALQUIERA'
                      ? 's-btn-brand border-brand'
                      : 's-btn-sec text-ink-2'
                  }`}
                >
                  Con régimen especial ({kpisSalud.conDieta})
                </button>
                {catalogosMedicos.dietas.map((op) => {
                  const count = conteosDieta.get(op.value) || 0;
                  return (
                    <button
                      key={op.value}
                      type="button"
                      aria-pressed={filtroDietaSalud === op.value}
                      onClick={() =>
                        setFiltroDietaSalud((prev) => (prev === op.value ? 'TODAS' : op.value))
                      }
                      className={`min-h-[34px] px-3 py-1 rounded-xl text-xs font-bold border cursor-pointer transition ${
                        filtroDietaSalud === op.value
                          ? 's-btn-brand border-brand'
                          : 's-btn-sec text-ink-2'
                      }`}
                    >
                      {op.label} ({count})
                    </button>
                  );
                })}
              </div>

              {/* Barra combinada de búsqueda + selectores + exportación */}
              <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 flex-1">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
                    <input
                      type="text"
                      value={busquedaSalud}
                      onChange={(e) => setBusquedaSalud(e.target.value)}
                      aria-label="Buscar miembro, dieta, alergia, medicación" placeholder="Buscar..."
                      className="s-input w-full min-h-[44px] pl-10 pr-8 rounded-xl text-base sm:text-[15px]"
                    />
                    {busquedaSalud && (
                      <button
                        type="button"
                        onClick={() => setBusquedaSalud('')}
                        aria-label="Borrar búsqueda"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <Select
                    value={filtroSaludCat}
                    onChange={(e) => setFiltroSaludCat(e.target.value as FiltroSaludCategoria)}
                    aria-label="Filtrar por categoría clínica"
                  >
                    <option value="TODOS">Todas las categorías</option>
                    <option value="ALERGIA">Cualquier alergia</option>
                    <option value="ALERGIA_ALIMENTOS">Alergia a alimentos</option>
                    <option value="ALERGIA_MEDICAMENTOS">Alergia a medicamentos</option>
                    <option value="ALERGIA_PICADURAS">Alergia a picaduras / insectos</option>
                    <option value="ALERGIA_AMBIENTALES">Alergia ambiental / respiratoria</option>
                    <option value="MEDICACION_CRONICA">Medicación o condición crónica</option>
                    <option value="TOMA_MEDICACION">Toma medicación</option>
                    <option value="ENFERMEDAD_CRONICA">Condición crónica / preexistente</option>
                    <option value="RESTRICCION_CUD">Restricción física o CUD</option>
                    <option value="RESTRICCION_FISICA">Restricción física</option>
                    <option value="TIENE_CUD">Posee CUD</option>
                  </Select>

                  <Select
                    value={filtroGrupoSanguineo}
                    onChange={(e) => setFiltroGrupoSanguineo(e.target.value)}
                    aria-label="Filtrar por grupo sanguíneo"
                  >
                    <option value="TODOS">Todos los grupos sanguíneos</option>
                    {gruposSanguineosDisponibles.map((gs) => (
                      <option key={gs} value={gs}>
                        Grupo {gs}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="flex flex-wrap items-center gap-3 shrink-0">
                  {(filtroDietaSalud !== 'TODAS' ||
                    filtroSaludCat !== 'TODOS' ||
                    filtroGrupoSanguineo !== 'TODOS' ||
                    soloNovedadesSalud ||
                    busquedaSalud) && (
                    <button
                      type="button"
                      onClick={() => {
                        setFiltroDietaSalud('TODAS');
                        setFiltroSaludCat('TODOS');
                        setFiltroGrupoSanguineo('TODOS');
                        setSoloNovedadesSalud(false);
                        setBusquedaSalud('');
                      }}
                      className="s-btn-sec min-h-[40px] px-3.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                      Limpiar filtros
                    </button>
                  )}
                  <label className="flex items-center gap-2 text-xs font-bold text-ink cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={soloNovedadesSalud}
                      onChange={(e) => setSoloNovedadesSalud(e.target.checked)}
                      className="w-4 h-4 accent-brand"
                    />
                    <span>Solo con novedades</span>
                  </label>

                  <BotonExportar
                    onExportarExcel={() => handleExportarSalud('xlsx')}
                    onExportarCSV={() => handleExportarSalud('csv')}
                    disabled={registrosSalud.length === 0}
                    texto="Exportar salud/cocina"
                  />
                </div>
              </div>
            </div>

            {cargandoCumplimiento && miembros.length === 0 ? (
              <div className="p-10 text-center text-sm text-ink-muted flex flex-col items-center gap-2.5">
                <Loader2 className="w-6 h-6 animate-spin text-brand" />
                <span>Cargando información médica y alimentaria…</span>
              </div>
            ) : registrosSalud.length === 0 ? (
              <div className="p-10 text-center text-sm text-ink-muted">
                No hay miembros que coincidan con los filtros de salud o alimentación.
              </div>
            ) : (
              <div className="divide-y divide-rule">
                {registrosSalud.map(({ miembro, info, entregaPrincipal, unidadNombre }) => (
                  <div
                    key={miembro.id}
                    className="p-4 sm:px-5 flex flex-col lg:flex-row lg:items-start justify-between gap-3 hover:bg-paper-2/40 transition"
                  >
                    <div className="min-w-0 space-y-2 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link
                          to={`/miembros/${miembro.id}`}
                          className="text-[15px] font-black text-ink hover:text-brand transition-colors"
                        >
                          {miembro.apellido}, {miembro.nombre}
                        </Link>
                        {info.grupoSanguineo && (
                          <span className="px-2 py-0.5 rounded-full bg-paper-2 border border-rule text-xs font-black text-ink">
                            {info.grupoSanguineo}
                          </span>
                        )}
                        {info.tieneCud && (
                          <span className="s-badge-info px-2 py-0.5 rounded-full text-xs font-bold">
                            CUD
                          </span>
                        )}
                      </div>

                      <div className="text-[13px] text-ink-muted flex items-center gap-2 flex-wrap s-tabular">
                        <span>DNI {miembro.dni}</span>
                        <span>·</span>
                        <span className="font-semibold text-ink-2">{unidadNombre}</span>
                        {info.obraSocial && (
                          <>
                            <span>·</span>
                            <span>
                              {info.obraSocial}
                              {info.afiliadoObraSocial ? ` (N° ${info.afiliadoObraSocial})` : ''}
                            </span>
                          </>
                        )}
                        {info.telEmergencia1 && (
                          <>
                            <span>·</span>
                            <span className="inline-flex items-center gap-1 text-ink-2 font-semibold">
                              <Phone className="w-3.5 h-3.5 text-brand" />
                              {info.telEmergencia1}
                            </span>
                          </>
                        )}
                      </div>

                      {/* Chips estructurados de dieta, alergias, medicación y condiciones */}
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {info.tieneDieta && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold s-badge-brand">
                            <Utensils className="w-3.5 h-3.5 shrink-0" />
                            <span>
                              Dieta:{' '}
                              {[...info.dietasLabels, info.dietaDetalle]
                                .filter(Boolean)
                                .join(' — ') || 'Especial'}
                            </span>
                          </span>
                        )}
                        {info.tieneAlergia && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold s-badge-warn">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            <span>
                              Alergias:{' '}
                              {[...info.alergiasLabels, info.alergiasDetalle]
                                .filter(Boolean)
                                .join(' — ') || 'Declarada'}
                            </span>
                          </span>
                        )}
                        {info.tomaMedicacion && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold s-badge-info">
                            <Pill className="w-3.5 h-3.5 shrink-0" />
                            <span>
                              Medicación:{' '}
                              {[...info.medicacionLabels, info.medicacionDetalle]
                                .filter(Boolean)
                                .join(' — ') || 'Declarada'}
                            </span>
                          </span>
                        )}
                        {info.tieneCondicionCronica && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold bg-paper-2 border border-rule text-ink-2">
                            <HeartPulse className="w-3.5 h-3.5 text-brand shrink-0" />
                            <span>
                              Condición:{' '}
                              {[...info.condicionesLabels, info.condicionesDetalle]
                                .filter(Boolean)
                                .join(' — ') || 'Declarada'}
                            </span>
                          </span>
                        )}
                        {info.tieneRestriccionFisica && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold s-badge-warn">
                            <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                            <span>
                              Restricción: {info.restriccionFisica || 'Declarada'}
                            </span>
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {entregaPrincipal && (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => void handleVerPdfMiembro(miembro, entregaPrincipal)}
                          leftIcon={<Eye className="w-4 h-4" />}
                        >
                          Ver PDF
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => navigate(`/miembros/${miembro.id}?tab=ficha`)}
                        leftIcon={<Edit2 className="w-4 h-4" />}
                      >
                        Ver ficha
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: ADULTOS COLABORADORES */}
      {tab === 'colaboradores' && (
        <div className="space-y-4 s-anim-tab">
          <div className="s-card rounded-2xl p-4 space-y-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 flex-1">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
                  <input
                    type="text"
                    value={busquedaColab}
                    onChange={(e) => setBusquedaColab(e.target.value)}
                    placeholder="Buscar adulto, profesión, scout..."
                    className="s-input w-full min-h-[46px] pl-10 pr-3 rounded-xl text-base sm:text-[15px]"
                  />
                </div>

                <Select
                  value={filtroDisciplina}
                  onChange={(e) => setFiltroDisciplina(e.target.value as FiltroDisciplina)}
                  aria-label="Filtrar por disciplina"
                >
                  <option value="TODAS">Todas las disciplinas</option>
                  <option value="COCINA">Cocina de campamento</option>
                  <option value="CAMPAMENTO">Apoyo en campamento</option>
                  <option value="TRANSPORTE">Transporte / vehículos</option>
                  <option value="MANTENIMIENTO">Mano de obra / mantenimiento</option>
                  <option value="ENSENANZA">Talleres / enseñanza</option>
                  <option value="ADMIN">Tareas administrativas</option>
                  <option value="SERVICIO">Servicio comunitario</option>
                </Select>

                <Select
                  value={filtroMaterial}
                  onChange={(e) => setFiltroMaterial(e.target.value as FiltroMaterial)}
                  aria-label="Filtrar por material declarado"
                >
                  <option value="TODOS">Todos los materiales</option>
                  <option value="CUALQUIERA">Con algún material ofrecido</option>
                  <option value="CAMPAMENTO">Material de campamento</option>
                  <option value="CONSTRUCCION">Material de construcción</option>
                </Select>
              </div>

              <div className="shrink-0">
                <BotonExportar
                  onExportarExcel={() => handleExportarColaboradores('xlsx')}
                  onExportarCSV={() => handleExportarColaboradores('csv')}
                  disabled={colaboradoresFiltrados.length === 0}
                  texto="Exportar listado"
                />
              </div>
            </div>
          </div>

          {cargandoColab && colaboradores.length === 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="s-card rounded-2xl p-5 h-28 animate-pulse bg-paper-2" />
              ))}
            </div>
          ) : colaboradoresFiltrados.length === 0 ? (
            <div className="s-card rounded-2xl p-10 text-center text-ink-muted space-y-2">
              <HeartHandshake className="w-10 h-10 mx-auto opacity-45" />
              <p className="text-sm font-bold text-ink">
                No hay colaboradores adultos que coincidan con la búsqueda.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {colaboradoresFiltrados.map((col, idx) => (
                <div
                  key={col.entregaId || idx}
                  className="s-card rounded-2xl p-4 sm:p-5 space-y-3"
                >
                  <div className="flex justify-between items-start gap-2.5">
                    <div className="min-w-0">
                      <h3 className="font-black text-[15px] text-ink truncate">
                        {col.adulto.nombre}
                      </h3>
                      <p className="text-[13px] text-ink-muted mt-0.5">
                        {col.adulto.profesion} · Familia de{' '}
                        <strong className="text-brand-ink">
                          {col.protagonista.nombre} {col.protagonista.apellido}
                        </strong>{' '}
                        ({col.protagonista.unidad})
                      </p>
                    </div>
                    {col.adulto.telefono && col.adulto.telefono !== '-' && (
                      <a
                        href={`tel:${col.adulto.telefono}`}
                        className="s-badge-brand min-h-[40px] px-3.5 py-1.5 rounded-xl font-bold text-[13px] inline-flex items-center gap-1.5 shrink-0"
                      >
                        <Phone className="w-4 h-4" />
                        <span>Llamar</span>
                      </a>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {col.areas?.cocinaCampamento && (
                      <span className="s-badge-brand text-xs px-2.5 py-0.5 rounded-md inline-flex items-center gap-1 font-semibold">
                        <Utensils className="w-3.5 h-3.5" /> Cocina
                      </span>
                    )}
                    {col.areas?.campamento && (
                      <span className="s-badge-info text-xs px-2.5 py-0.5 rounded-md inline-flex items-center gap-1 font-semibold">
                        <Tent className="w-3.5 h-3.5" /> Campamento
                      </span>
                    )}
                    {(col.areas?.transporte ||
                      col.areas?.camion ||
                      col.areas?.camioneta ||
                      col.areas?.colectivo) && (
                      <span className="s-badge-info text-xs px-2.5 py-0.5 rounded-md inline-flex items-center gap-1 font-semibold">
                        <Truck className="w-3.5 h-3.5" /> Transporte
                      </span>
                    )}
                    {col.areas?.manoObra && (
                      <span className="bg-paper-2 border border-rule text-ink text-xs px-2.5 py-0.5 rounded-md inline-flex items-center gap-1 font-semibold">
                        <Wrench className="w-3.5 h-3.5" /> Mantenimiento
                      </span>
                    )}
                    {col.areas?.ensenando && (
                      <span className="s-badge-ok text-xs px-2.5 py-0.5 rounded-md font-semibold">
                        Talleres
                      </span>
                    )}
                    {col.areas?.administrativo && (
                      <span className="bg-paper-2 border border-rule text-ink-2 text-xs px-2.5 py-0.5 rounded-md font-semibold">
                        Admin.
                      </span>
                    )}
                    {col.areas?.servicioComunitario && (
                      <span className="bg-paper-2 border border-rule text-ink-2 text-xs px-2.5 py-0.5 rounded-md font-semibold">
                        Servicio
                      </span>
                    )}
                  </div>

                  {(col.materiales?.campamentoPrestamo ||
                    col.materiales?.campamentoDonacion ||
                    col.materiales?.construccionPrestamo ||
                    col.materiales?.construccionDonacion) && (
                    <div className="s-panel rounded-xl p-3 text-xs text-ink-2 space-y-1.5">
                      {(col.materiales?.campamentoPrestamo || col.materiales?.campamentoDonacion) && (
                        <div className="flex items-center gap-1.5">
                          <Tent className="w-3.5 h-3.5 text-brand shrink-0" />
                          <span>
                            Campamento:{' '}
                            {[col.materiales.campamentoPrestamo, col.materiales.campamentoDonacion]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        </div>
                      )}
                      {(col.materiales?.construccionPrestamo ||
                        col.materiales?.construccionDonacion) && (
                        <div className="flex items-center gap-1.5">
                          <Hammer className="w-3.5 h-3.5 text-brand shrink-0" />
                          <span>
                            Construcción:{' '}
                            {[
                              col.materiales.construccionPrestamo,
                              col.materiales.construccionDonacion,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: DOCUMENTOS Y PLANTILLAS */}
      {tab === 'plantillas' && (
        <div className="space-y-4 s-anim-tab">
          <div className="s-card rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-ink flex items-center gap-2">
                <Layers className="w-5 h-5 text-brand shrink-0" />
                <span>Documentos y fichas del grupo</span>
              </h2>
              <p className="text-[13px] text-ink-muted mt-0.5">
                Creá autorizaciones, fichas médicas o relevamientos editables con membrete, texto legal automático y vista previa PDF en vivo.
              </p>
            </div>

            {caps.canManagePlantillas && (
              <div className="shrink-0">
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={abrirNuevaPlantilla}
                  leftIcon={<PlusCircle className="w-4 h-4" />}
                >
                  Nuevo documento
                </Button>
              </div>
            )}
          </div>

          {cargandoPlantillas && plantillasAdmin.length === 0 ? (
            <div className="p-12 flex flex-col items-center justify-center text-ink-muted gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-brand" />
              <span className="text-sm">Cargando documentos…</span>
            </div>
          ) : plantillasAdmin.length === 0 ? (
            <div className="s-card rounded-2xl p-10 text-center text-sm text-ink-muted">
              No hay documentos cargados en el sistema.
            </div>
          ) : (
            (() => {
              const renderTarjetaPlantilla = (p: any) => {
                const secciones = Array.isArray(p.esquemaCamposJson?.secciones)
                  ? p.esquemaCamposJson.secciones
                  : [];
                const cantCampos = secciones.reduce(
                  (acc: number, s: any) => acc + (Array.isArray(s.campos) ? s.campos.length : 0),
                  0,
                );
                const destinatario = resolverDestinatarioPlantilla(p);
                const principal = esPlantillaPrincipal(p);
                const tienePdfPropio = Boolean(p.mapeoPdfJson?.pdfBaseDataUrl);
                const modoPdf = p.mapeoPdfJson?.modoRender;
                const modoLabel =
                  modoPdf === 'DISENO_SECCIONES' ||
                  p.mapeoPdfJson?.pdfBaseUrl === '__DISENO_SECCIONES__'
                    ? 'Documento editable'
                    : tienePdfPropio ||
                        modoPdf === 'PDF_ACROFORM' ||
                        modoPdf === 'ESTAMPAR_COORDENADAS'
                      ? 'PDF externo'
                      : 'Molde antiguo (7 págs.)';
                const enProceso = procesandoPlantillaId === p.id;

                return (
                  <div
                    key={p.id}
                    className={`s-card rounded-2xl p-5 flex flex-col justify-between gap-4 ${
                      !p.activa ? 'opacity-80' : ''
                    }`}
                  >
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                            p.activa ? 's-badge-ok' : 'bg-paper-3 text-ink-muted border border-rule'
                          }`}
                        >
                          {p.activa ? 'Activo' : 'Pausado'}
                        </span>
                        <span className="px-2.5 py-0.5 rounded-md bg-paper-2 border border-rule text-xs font-bold s-tabular">
                          Ciclo {p.cicloAnio}
                        </span>
                        <span className="px-2.5 py-0.5 rounded-md bg-paper-2 border border-rule text-xs font-bold text-ink-2">
                          {destinatario}
                        </span>
                        {principal && (
                          <span className="s-badge-brand px-2.5 py-0.5 rounded-full text-xs font-bold">
                            Principal
                          </span>
                        )}
                      </div>

                      <div>
                        <h3 className="text-[17px] font-black text-ink">{p.titulo}</h3>
                      </div>

                      <div className="s-panel rounded-xl p-3.5 text-[13px] flex items-center justify-between gap-2">
                        <span className="text-ink-2 font-semibold">
                          {secciones.length} {secciones.length === 1 ? 'sección' : 'secciones'} ·{' '}
                          {cantCampos} {cantCampos === 1 ? 'pregunta' : 'preguntas'}
                        </span>
                        <span className="text-brand-ink font-bold">{modoLabel}</span>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-rule flex flex-wrap items-center justify-between gap-2">
                      {caps.canManagePlantillas && (
                        <>
                          <Button
                            type="button"
                            variant="primary"
                            size="sm"
                            onClick={() => abrirEditarDocumento(p)}
                            leftIcon={<PenTool className="w-3.5 h-3.5" />}
                          >
                            Editar documento
                          </Button>

                          <div className="flex flex-wrap items-center gap-1.5">
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => abrirDuplicarPlantilla(p)}
                              leftIcon={<Copy className="w-3.5 h-3.5" />}
                            >
                              Duplicar
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              disabled={enProceso}
                              onClick={() =>
                                p.activa
                                  ? pedirConfirmacion(
                                      {
                                        titulo: 'Pausar plantilla',
                                        mensaje: `¿Pausar "${p.titulo ?? p.nombre ?? 'la plantilla'}"?`,
                                        impacto: 'Dejará de mostrarse a las familias hasta que la actives de nuevo.',
                                        textoConfirmar: 'Pausar',
                                      },
                                      () => handleToggleActivaPlantilla(p),
                                    )
                                  : void handleToggleActivaPlantilla(p)
                              }
                              leftIcon={<Power className="w-3.5 h-3.5" />}
                            >
                              {p.activa ? 'Pausar' : 'Activar'}
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              };

              return (
                <div className="space-y-4">
                  {plantillasActivasOrdenadas.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {plantillasActivasOrdenadas.map(renderTarjetaPlantilla)}
                    </div>
                  ) : (
                    <div className="s-card rounded-2xl p-8 text-center text-sm text-ink-muted">
                      No hay documentos activos. Creá uno nuevo o reactivá un documento pausado.
                    </div>
                  )}

                  {plantillasPausadas.length > 0 && (
                    <div className="space-y-3 pt-2">
                      <button
                        type="button"
                        onClick={() => setMostrarPlantillasPausadas((v) => !v)}
                        className="s-btn-sec min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-2 cursor-pointer"
                      >
                        {mostrarPlantillasPausadas ? (
                          <ChevronUp className="w-4 h-4 text-ink-muted" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-ink-muted" />
                        )}
                        <span>
                          Pausados / anteriores ({plantillasPausadas.length})
                        </span>
                      </button>

                      {mostrarPlantillasPausadas && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {plantillasPausadas.map(renderTarjetaPlantilla)}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()
          )}
        </div>
      )}

      {/* Constructor y Diseñador Unificado de Documentos */}
      <VisualPdfEditorDrawer
        abierto={editorDocumentoEstado.abierto}
        plantilla={editorDocumentoEstado.plantilla}
        modoCrear={editorDocumentoEstado.modoCrear}
        plantillaBaseDuplicar={editorDocumentoEstado.plantillaBaseDuplicar}
        onCerrar={() =>
          setEditorDocumentoEstado({
            abierto: false,
            plantilla: null,
            modoCrear: false,
            plantillaBaseDuplicar: null,
          })
        }
        onGuardado={async () => {
          await Promise.all([cargarPlantillasAdmin(), cargarCumplimiento()]);
          // El Expediente cachea las plantillas (legajos-plantillas-*): que tome la versión nueva.
          void queryClient.invalidateQueries({
            predicate: (query) => String(query.queryKey[0]).startsWith('legajos-plantillas'),
          });
        }}
        onToast={(texto, tipo) => mostrarToast(texto, tipo === 'error' ? 'error' : 'exito')}
      />
    </div>
  );
};
