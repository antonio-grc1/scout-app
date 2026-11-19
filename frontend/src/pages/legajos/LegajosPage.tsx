import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  Clock,
  Download,
  Edit2,
  Eye,
  FileCheck2,
  FileText,
  Hammer,
  HeartHandshake,
  Layers,
  Loader2,
  PenTool,
  Phone,
  PlusCircle,
  Power,
  RefreshCw,
  Search,
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
import { useToastStore } from '../../store/toastStore';
import {
  esErrorOffline,
  normalizarTextoBusqueda,
  obtenerCicloAnioActual,
  obtenerRolPrincipal,
  seleccionarPlantillaPorMiembro,
  traducirErrorAmigable,
} from '../../lib/formatters';
import {
  crearUrlPdfBlob,
  descargarPdfBlob,
  generarFichaPdf,
  generarMoldeEnBlancoPdf,
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
  Drawer,
  Input,
  KpiCard,
  SegmentedTabs,
  Select,
} from '../../components/ui';
import { VisualPdfEditorDrawer } from './VisualPdfEditorDrawer';

const PdfViewerModal = lazy(() =>
  import('../../components/PdfViewerModal').then((m) => ({ default: m.PdfViewerModal })),
);

type TabLegajos = 'cumplimiento' | 'colaboradores' | 'plantillas';
type FiltroEstadoEntrega =
  | 'TODOS'
  | 'SIN_FICHA'
  | 'BORRADOR'
  | 'LISTO_PARA_FIRMA'
  | 'VALIDADO_FISICO';
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
  const [searchParams, setSearchParams] = useSearchParams();
  const caps = useCapabilities();
  const usuarioActual = useAuthStore((s) => s.usuario);
  const tienePermisoGlobal = useAuthStore((s) => s.tienePermisoGlobal);
  const esGlobalPlantillas = tienePermisoGlobal(['plantillas.ver', 'plantillas.editar']);
  const activeUnitId = useActiveUnitStore((s) => s.activeUnitId);
  const abrirQr = useQrModalStore((s) => s.abrirQr);
  const lastValidationAt = useQrModalStore((s) => s.lastValidationAt);
  const mostrarToast = useToastStore((s) => s.mostrarToast);

  const puedeVerPlantillasTab =
    esGlobalPlantillas && caps.hasAnyPermiso('plantillas.ver', 'plantillas.editar');
  const tabUrl = searchParams.get('tab') as TabLegajos | null;
  const tabInicial: TabLegajos =
    tabUrl === 'plantillas' && puedeVerPlantillasTab
      ? 'plantillas'
      : tabUrl === 'colaboradores'
        ? 'colaboradores'
        : 'cumplimiento';
  const [tab, setTab] = useState<TabLegajos>(tabInicial);

  useEffect(() => {
    if (tabUrl === 'plantillas' && puedeVerPlantillasTab) setTab('plantillas');
    else if (tabUrl === 'colaboradores') setTab('colaboradores');
    else if (tabUrl === 'cumplimiento') setTab('cumplimiento');
  }, [tabUrl, puedeVerPlantillasTab]);

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
  const [validandoHash, setValidandoHash] = useState<string | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [pdfPreviewTitle, setPdfPreviewTitle] = useState('Vista Previa PDF');
  const [pdfPreviewBytes, setPdfPreviewBytes] = useState<Uint8Array | null>(null);

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
  const [drawerMetaAbierto, setDrawerMetaAbierto] = useState(false);
  const [plantillaMetaEditando, setPlantillaMetaEditando] = useState<any | null>(null);
  const [metaForm, setMetaForm] = useState({
    codigo: '',
    titulo: '',
    version: '1.0',
    cicloAnio: obtenerCicloAnioActual(),
    activa: true,
  });
  const [guardandoMeta, setGuardandoMeta] = useState(false);
  const [plantillaEditorVisual, setPlantillaEditorVisual] = useState<any | null>(null);

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
    if (tab === 'cumplimiento') void cargarCumplimiento();
    else if (tab === 'colaboradores') void cargarColaboradores();
    else if (tab === 'plantillas') void cargarPlantillasAdmin();
  }, [tab, cargarCumplimiento, cargarColaboradores, cargarPlantillasAdmin, lastValidationAt]);

  useEffect(() => {
    return () => {
      if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
    };
  }, [pdfPreviewUrl]);

  // Mapa entrega más reciente por usuarioId
  const entregaPorUsuario = useMemo(() => {
    const map = new Map<number, any>();
    for (const e of entregas) {
      if (!map.has(e.usuarioId)) map.set(e.usuarioId, e);
    }
    return map;
  }, [entregas]);

  const registrosCumplimiento = useMemo(() => {
    const q = normalizarTextoBusqueda(busquedaCumplimiento);
    return miembros
      .filter((m) => m.activo !== false)
      .filter((m) => {
        if (activeUnitId === 'ALL') return true;
        return Boolean(
          m.asignaciones?.some((a: any) => a.activo && Number(a.unidadId ?? a.unidad?.id) === activeUnitId),
        );
      })
      .map((m) => {
        const ent = entregaPorUsuario.get(m.id);
        const estado: FiltroEstadoEntrega = ent?.estado || 'SIN_FICHA';
        const rolP = obtenerRolPrincipal(m);
        return {
          miembro: m,
          entrega: ent || null,
          estado,
          unidadNombre: rolP?.unidad?.nombre || 'Sin unidad',
        };
      })
      .filter((row) => {
        if (filtroEstado !== 'TODOS' && row.estado !== filtroEstado) return false;
        if (!q) return true;
        const full = normalizarTextoBusqueda(`${row.miembro.nombre} ${row.miembro.apellido}`);
        const inv = normalizarTextoBusqueda(`${row.miembro.apellido} ${row.miembro.nombre}`);
        return (
          full.includes(q) ||
          inv.includes(q) ||
          String(row.miembro.dni || '').includes(q) ||
          normalizarTextoBusqueda(row.unidadNombre).includes(q)
        );
      });
  }, [miembros, entregaPorUsuario, activeUnitId, filtroEstado, busquedaCumplimiento]);

  const kpisCumplimiento = useMemo(() => {
    const base = miembros.filter((m) => {
      if (m.activo === false) return false;
      if (activeUnitId === 'ALL') return true;
      return Boolean(
        m.asignaciones?.some((a: any) => a.activo && Number(a.unidadId ?? a.unidad?.id) === activeUnitId),
      );
    });
    let validados = 0;
    let listos = 0;
    let pendientes = 0;
    for (const m of base) {
      const est = entregaPorUsuario.get(m.id)?.estado || 'SIN_FICHA';
      if (est === 'VALIDADO_FISICO') validados++;
      else if (est === 'LISTO_PARA_FIRMA') listos++;
      else pendientes++;
    }
    return { total: base.length, validados, listos, pendientes };
  }, [miembros, entregaPorUsuario, activeUnitId]);

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

  const handleVerPdfMiembro = async (miembro: any, entrega: any) => {
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
      );
      if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
      setPdfPreviewBytes(bytes);
      setPdfPreviewTitle(`Legajo: ${miembro.apellido}, ${miembro.nombre}`);
      setPdfPreviewUrl(crearUrlPdfBlob(bytes));
    } catch (err) {
      mostrarToast(traducirErrorAmigable(err, 'No se pudo generar el PDF.'), 'error');
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
      { header: 'Adulto Colaborador', formatear: (r) => r.adulto?.nombre || '' },
      { header: 'Profesión / Oficio', formatear: (r) => r.adulto?.profesion || '' },
      { header: 'Teléfono', formatear: (r) => r.adulto?.telefono || '' },
      { header: 'Preferencia', formatear: (r) => r.adulto?.preferenciaTrabajo || '' },
      {
        header: 'Protagonista',
        formatear: (r) => `${r.protagonista?.nombre || ''} ${r.protagonista?.apellido || ''}`.trim(),
      },
      { header: 'Unidad', formatear: (r) => r.protagonista?.unidad || '' },
      {
        header: 'Áreas de Colaboración',
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
        header: 'Materiales Campamento',
        formatear: (r) =>
          [r.materiales?.campamentoPrestamo, r.materiales?.campamentoDonacion]
            .filter(Boolean)
            .join(' / '),
      },
      {
        header: 'Materiales Construcción',
        formatear: (r) =>
          [r.materiales?.construccionPrestamo, r.materiales?.construccionDonacion]
            .filter(Boolean)
            .join(' / '),
      },
    ];
    const nombreArchivo = `Colaboradores_Adultos_${obtenerCicloAnioActual()}`;
    if (formato === 'xlsx') {
      void exportarAExcel({
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

  // Plantillas CRUD handlers
  const abrirNuevaPlantilla = () => {
    const anio = obtenerCicloAnioActual();
    setPlantillaMetaEditando(null);
    setMetaForm({
      codigo: `FORM_${anio}`,
      titulo: `Ficha Médica e Inscripción ${anio}`,
      version: '1.0',
      cicloAnio: anio,
      activa: true,
    });
    setDrawerMetaAbierto(true);
  };

  const abrirEditarMeta = (p: any) => {
    setPlantillaMetaEditando(p);
    setMetaForm({
      codigo: p.codigo,
      titulo: p.titulo,
      version: p.version,
      cicloAnio: Number(p.cicloAnio),
      activa: Boolean(p.activa),
    });
    setDrawerMetaAbierto(true);
  };

  const handleGuardarMetaPlantilla = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!metaForm.titulo.trim() || !metaForm.codigo.trim()) return;
    setGuardandoMeta(true);
    try {
      if (plantillaMetaEditando) {
        await api.patch(`/legajos/plantillas/${plantillaMetaEditando.id}`, {
          titulo: metaForm.titulo.trim(),
          version: metaForm.version.trim(),
          cicloAnio: Number(metaForm.cicloAnio),
          activa: metaForm.activa,
        });
        mostrarToast(`Plantilla "${metaForm.titulo}" actualizada.`);
      } else {
        await api.post('/legajos/plantillas', {
          codigo: metaForm.codigo.trim().toUpperCase(),
          titulo: metaForm.titulo.trim(),
          version: metaForm.version.trim(),
          cicloAnio: Number(metaForm.cicloAnio),
          activa: metaForm.activa,
          esquemaCamposJson: { secciones: [] },
          mapeoPdfJson: { pdfBaseUrl: '__MOLDE_OFICIAL__', campos: {} },
        });
        mostrarToast(`Plantilla "${metaForm.titulo}" creada.`);
      }
      setDrawerMetaAbierto(false);
      await cargarPlantillasAdmin();
    } catch (err) {
      mostrarToast(traducirErrorAmigable(err, 'No se pudo guardar la plantilla.'), 'error');
    } finally {
      setGuardandoMeta(false);
    }
  };

  const handleToggleActivaPlantilla = async (p: any) => {
    if (!caps.canManagePlantillas) return;
    setProcesandoPlantillaId(p.id);
    try {
      const nextActiva = !p.activa;
      await api.patch(`/legajos/plantillas/${p.id}`, { activa: nextActiva });
      mostrarToast(
        nextActiva ? `Plantilla "${p.titulo}" activada.` : `Plantilla "${p.titulo}" pausada.`,
      );
      await cargarPlantillasAdmin();
    } catch (err) {
      mostrarToast(traducirErrorAmigable(err, 'No se pudo actualizar el estado.'), 'error');
    } finally {
      setProcesandoPlantillaId(null);
    }
  };

  const handleDescargarMoldeBlanco = async () => {
    try {
      const bytes = await generarMoldeEnBlancoPdf();
      descargarPdfBlob(bytes, `Molde_Oficial_Blanco_${obtenerCicloAnioActual()}.pdf`);
      mostrarToast('Molde oficial en blanco descargado.');
    } catch (err) {
      mostrarToast(traducirErrorAmigable(err, 'No se pudo generar el molde en blanco.'), 'error');
    }
  };

  const tabItems = useMemo(() => {
    const items: Array<{
      id: TabLegajos;
      label: string;
      icon: React.ReactNode;
      badge?: number;
    }> = [
      {
        id: 'cumplimiento',
        label: 'Cumplimiento',
        icon: <FileCheck2 className="w-3.5 h-3.5" />,
        badge: kpisCumplimiento.total,
      },
      {
        id: 'colaboradores',
        label: 'Adultos Colaboradores',
        icon: <HeartHandshake className="w-3.5 h-3.5" />,
      },
    ];
    if (puedeVerPlantillasTab) {
      items.push({
        id: 'plantillas',
        label: 'Plantillas y Editor PDF',
        icon: <PenTool className="w-3.5 h-3.5" />,
      });
    }
    return items;
  }, [puedeVerPlantillasTab, kpisCumplimiento.total]);

  return (
    <div className="space-y-5 s-anim-view">
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
              Legajos, Salud y Colaboración Familiar
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
            Completar Mi Legajo
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
              label="Sin ficha / Borrador"
              value={kpisCumplimiento.pendientes}
              hint="Requiere completar"
              tone="warn"
              icon={<AlertCircle className="w-4 h-4" />}
              onClick={() => setFiltroEstado('SIN_FICHA')}
              active={filtroEstado === 'SIN_FICHA'}
            />
          </div>

          <div className="s-card rounded-2xl overflow-hidden">
            <div className="p-4 sm:p-5 bg-paper-2 border-b border-rule flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    { id: 'TODOS', label: 'Todos' },
                    { id: 'LISTO_PARA_FIRMA', label: 'Listos p/ Validar' },
                    { id: 'VALIDADO_FISICO', label: 'Validados' },
                    { id: 'BORRADOR', label: 'Borrador' },
                    { id: 'SIN_FICHA', label: 'Sin Ficha' },
                  ] as const
                ).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFiltroEstado(f.id)}
                    className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-[13px] font-bold border cursor-pointer transition ${
                      filtroEstado === f.id ? 's-btn-brand border-brand' : 's-btn-sec text-ink-2'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <div className="relative flex-1 sm:w-72">
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
                {registrosCumplimiento.map(({ miembro, entrega, estado, unidadNombre }) => {
                  const badge =
                    estado === 'VALIDADO_FISICO'
                      ? { cls: 's-badge-ok', label: 'Validado físico' }
                      : estado === 'LISTO_PARA_FIRMA'
                        ? { cls: 's-badge-brand', label: 'Listo para firma' }
                        : estado === 'BORRADOR'
                          ? { cls: 's-badge-info', label: 'Borrador' }
                          : { cls: 's-badge-warn', label: 'Sin ficha' };

                  return (
                    <div
                      key={miembro.id}
                      className="p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-paper-2/40 transition"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link
                            to={`/miembros/${miembro.id}?tab=legajos`}
                            className="text-[15px] font-black text-ink hover:text-brand transition-colors"
                          >
                            {miembro.apellido}, {miembro.nombre}
                          </Link>
                          <span className={`${badge.cls} px-2.5 py-0.5 rounded-full text-xs font-bold whitespace-nowrap`}>
                            {badge.label}
                          </span>
                        </div>
                        <div className="text-[13px] text-ink-muted flex items-center gap-2 flex-wrap s-tabular">
                          <span>DNI {miembro.dni}</span>
                          <span>·</span>
                          <span className="font-semibold text-ink-2">{unidadNombre}</span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {caps.canValidateQr &&
                          miembro?.id !== usuarioActual?.id &&
                          estado === 'LISTO_PARA_FIRMA' &&
                          entrega?.hashVerificacion && (
                            <Button
                              type="button"
                              variant="primary"
                              size="sm"
                              loading={validandoHash === entrega.hashVerificacion}
                              onClick={() => void handleValidarFisico(entrega, miembro)}
                              leftIcon={<CheckCircle2 className="w-4 h-4" />}
                            >
                              Validar Físico
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

                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => navigate(`/legajos/completar?usuarioId=${miembro.id}`)}
                          leftIcon={<Edit2 className="w-4 h-4" />}
                        >
                          {entrega ? 'Editar' : 'Completar'}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: ADULTOS COLABORADORES */}
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
                  <option value="TRANSPORTE">Transporte / Vehículos</option>
                  <option value="MANTENIMIENTO">Mano de obra / Mantenimiento</option>
                  <option value="ENSENANZA">Talleres / Enseñanza</option>
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
                        <strong className="text-brand">
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

      {/* TAB 3: PLANTILLAS Y EDITOR VISUAL PDF */}
      {tab === 'plantillas' && (
        <div className="space-y-4 s-anim-tab">
          <div className="s-card rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-ink flex items-center gap-2">
                <Layers className="w-5 h-5 text-brand shrink-0" />
                <span>Plantillas Oficiales y Editor Visual PDF</span>
              </h2>
              <p className="text-[13px] text-ink-muted mt-0.5">
                Administrá las plantillas del ciclo, descargá el molde en blanco o editá coordenadas y campos visualmente.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => void handleDescargarMoldeBlanco()}
                leftIcon={<Download className="w-4 h-4" />}
              >
                Molde en Blanco
              </Button>
              {caps.canManagePlantillas && (
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={abrirNuevaPlantilla}
                  leftIcon={<PlusCircle className="w-4 h-4" />}
                >
                  Nueva Plantilla
                </Button>
              )}
            </div>
          </div>

          {cargandoPlantillas && plantillasAdmin.length === 0 ? (
            <div className="p-12 flex flex-col items-center justify-center text-ink-muted gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-brand" />
              <span className="text-sm">Cargando plantillas…</span>
            </div>
          ) : plantillasAdmin.length === 0 ? (
            <div className="s-card rounded-2xl p-10 text-center text-sm text-ink-muted">
              No hay plantillas cargadas en el sistema.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {plantillasAdmin.map((p) => {
                const secciones = Array.isArray(p.esquemaCamposJson?.secciones)
                  ? p.esquemaCamposJson.secciones
                  : [];
                const cantCampos = secciones.reduce(
                  (acc: number, s: any) => acc + (Array.isArray(s.campos) ? s.campos.length : 0),
                  0,
                );
                const coordsCount = Object.keys(p.mapeoPdfJson?.campos || {}).length;
                const enProceso = procesandoPlantillaId === p.id;

                return (
                  <div
                    key={p.id}
                    className="s-card rounded-2xl p-5 flex flex-col justify-between gap-4"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                            p.activa ? 's-badge-ok' : 'bg-paper-3 text-ink-muted border border-rule'
                          }`}
                        >
                          {p.activa ? 'Activa' : 'Pausada'}
                        </span>
                        <span className="px-2.5 py-0.5 rounded-md bg-paper-2 border border-rule text-xs font-bold s-tabular">
                          Ciclo {p.cicloAnio}
                        </span>
                        <span className="text-xs font-semibold text-ink-muted">
                          v{p.version}
                        </span>
                      </div>

                      <div>
                        <h3 className="text-[17px] font-black text-ink">{p.titulo}</h3>
                        <p className="text-[13px] text-ink-muted font-mono">{p.codigo}</p>
                      </div>

                      <div className="s-panel rounded-xl p-3.5 text-[13px] flex items-center justify-between gap-2">
                        <span className="text-ink-2 font-semibold">
                          {secciones.length} secciones · {cantCampos} campos
                        </span>
                        <span className="text-brand font-bold s-tabular">
                          {coordsCount} coords PDF
                        </span>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-rule flex flex-wrap items-center justify-between gap-2">
                      {caps.canManagePlantillas && (
                        <>
                          <Button
                            type="button"
                            variant="primary"
                            size="sm"
                            onClick={() => setPlantillaEditorVisual(p)}
                            leftIcon={<PenTool className="w-3.5 h-3.5" />}
                          >
                            Editor Visual PDF
                          </Button>

                          <div className="flex items-center gap-1.5">
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => abrirEditarMeta(p)}
                              leftIcon={<Edit2 className="w-3.5 h-3.5" />}
                            >
                              Metadatos
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              disabled={enProceso}
                              onClick={() => void handleToggleActivaPlantilla(p)}
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
              })}
            </div>
          )}
        </div>
      )}

      {/* Drawer Metadata Plantilla */}
      <Drawer
        abierto={drawerMetaAbierto}
        onCerrar={() => setDrawerMetaAbierto(false)}
        titulo={plantillaMetaEditando ? 'Editar Metadatos de Plantilla' : 'Nueva Plantilla Oficial'}
        mode="sheet"
        maxWidthClass="sm:max-w-lg"
        bloqueado={guardandoMeta}
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setDrawerMetaAbierto(false)}
              disabled={guardandoMeta}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              form="form-meta-plantilla"
              variant="primary"
              loading={guardandoMeta}
            >
              Guardar Plantilla
            </Button>
          </>
        }
      >
        <form id="form-meta-plantilla" onSubmit={handleGuardarMetaPlantilla} className="space-y-4">
          <Input
            label="Nombre de la plantilla"
            required
            value={metaForm.titulo}
            onChange={(e) => setMetaForm({ ...metaForm, titulo: e.target.value })}
            placeholder={`Ej: Ficha Médica e Inscripción ${obtenerCicloAnioActual()}`}
          />

          {!plantillaMetaEditando && (
            <Input
              label="Código único"
              required
              value={metaForm.codigo}
              onChange={(e) => setMetaForm({ ...metaForm, codigo: e.target.value })}
              placeholder={`Ej: OFICIAL_${obtenerCicloAnioActual()}`}
            />
          )}

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Ciclo Anual"
              type="number"
              min={2000}
              max={2100}
              required
              value={metaForm.cicloAnio}
              onChange={(e) => setMetaForm({ ...metaForm, cicloAnio: Number(e.target.value) })}
            />
            <Input
              label="Versión"
              required
              value={metaForm.version}
              onChange={(e) => setMetaForm({ ...metaForm, version: e.target.value })}
              placeholder="1.0"
            />
          </div>

          <label className="flex items-center gap-2.5 text-sm font-bold text-ink cursor-pointer">
            <input
              type="checkbox"
              checked={metaForm.activa}
              onChange={(e) => setMetaForm({ ...metaForm, activa: e.target.checked })}
              className="w-4 h-4 accent-brand"
            />
            <span>Plantilla activa para completar en este ciclo</span>
          </label>
        </form>
      </Drawer>

      {/* Editor Visual Bidireccional PDF */}
      <VisualPdfEditorDrawer
        abierto={Boolean(plantillaEditorVisual)}
        plantilla={plantillaEditorVisual}
        onCerrar={() => setPlantillaEditorVisual(null)}
        onGuardado={cargarPlantillasAdmin}
        onToast={(texto, tipo) => mostrarToast(texto, tipo === 'error' ? 'error' : 'exito')}
      />
    </div>
  );
};
