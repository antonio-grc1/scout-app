import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { useConfirmar } from '../../hooks/useConfirmar';
import * as pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs';
import {
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  AlertTriangle,
  ExternalLink,
  FileCheck2,
  FilePlus2,
  FileText,
  FileUp,
  HelpCircle,
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { api } from '../../api/client';
import {
  esPlantillaPrincipal,
  obtenerCicloAnioActual,
  resolverDestinatarioPlantilla,
  traducirErrorAmigable,
} from '../../lib/formatters';
import {
  abrirPdfEnPestana,
  descargarPdfBlob,
  extraerCamposAcroFormPdf,
  generarFichaPdf,
  validarCamposAcroFormContraEsquema,
  type CampoAcroFormDetectado,
  type MapeoPdf,
} from '../../services/pdfGenerator';
import type {
  CampoSchema,
  EsquemaCampos,
  MembreteDocumento,
  SeccionSchema,
} from '../../components/DynamicFormRenderer';
import { Button, Drawer, Input, Select } from '../../components/ui';

if (typeof window !== 'undefined') {
  (window as any).pdfjsWorker = pdfjsWorker;
}

type ModoDocumento = 'DISENO_SECCIONES' | 'PDF_ACROFORM';
type TabConstructor = 'portada' | 'texto' | 'preguntas';
type DestinatarioDoc = 'TODOS' | 'MENORES' | 'MAYORES' | 'EDUCADORES';
type PlantillaInicialTipo = 'AUTORIZACION' | 'FICHA' | 'BLANCO';

const MEMBRETES_OPCIONES: Array<{ value: MembreteDocumento; label: string }> = [
  { value: 'GRUPO_JUAN_XXIII', label: 'Grupo Scout Juan XXIII + Scouts de Argentina' },
  { value: 'SALUD_NACIONAL', label: 'Ficha Nacional de Salud (Scouts de Argentina)' },
  { value: 'AUTORIZACION_OFICIAL', label: 'Autorización Oficial Scouts de Argentina' },
  { value: 'SIMPLE', label: 'Encabezado Simple (Solo título institucional)' },
];

const FIRMAS_OPCIONES = [
  { id: 'ADULTO_RESPONSABLE', label: 'Adulto Responsable / Tutor' },
  { id: 'PROTAGONISTA', label: 'Protagonista / Rover' },
  { id: 'EDUCADOR', label: 'Educador / Jefatura' },
] as const;

const VARIABLES_SISTEMA: Array<{ key: string; label: string }> = [
  { key: 'nombre_completo', label: 'Nombre completo' },
  { key: 'dni', label: 'DNI' },
  { key: 'fecha_nac', label: 'Fecha Nac.' },
  { key: 'rama', label: 'Rama / Sección' },
  { key: 'domicilio', label: 'Domicilio' },
  { key: 'autorizante_nombre', label: 'Adulto Autorizante' },
  { key: 'autorizante_dni', label: 'DNI Autorizante' },
  { key: 'autorizante_caracter', label: 'Vínculo (Madre/Padre/Tutor)' },
  { key: 'fecha_actual', label: 'Fecha hoy' },
  { key: 'ciclo_anio', label: 'Ciclo anual' },
];

const TIPOS_CAMPO_OPCIONES = [
  { value: 'text', label: 'Texto corto' },
  { value: 'textarea', label: 'Párrafo largo' },
  { value: 'date', label: 'Fecha' },
  { value: 'tel', label: 'Teléfono' },
  { value: 'email', label: 'Correo electrónico' },
  { value: 'boolean', label: 'Sí / No' },
  { value: 'select', label: 'Elegir una opción' },
  { value: 'multiselect', label: 'Elegir varias (Chips)' },
] as const;

const CATEGORIAS_MEDICAS_OPCIONES = [
  { value: '', label: 'Sin vínculo especial' },
  { value: 'DIETA', label: 'Cocina: Régimen de comidas' },
  { value: 'ALERGIA', label: 'Salud: Alergias' },
  { value: 'MEDICACION', label: 'Botiquín: Medicación' },
  { value: 'ENFERMEDAD_CRONICA', label: 'Salud: Condición crónica' },
  { value: 'RESTRICCION_FISICA', label: 'Salud: Restricción física' },
] as const;

export interface VisualPdfEditorDrawerProps {
  abierto: boolean;
  plantilla: any | null;
  modoCrear?: boolean;
  plantillaBaseDuplicar?: any | null;
  onCerrar: () => void;
  onGuardado: () => Promise<void> | void;
  onToast: (texto: string, tipo?: 'exito' | 'error') => void;
}

function normalizarEsquema(raw: any, tituloDefault = ''): EsquemaCampos {
  const secs = Array.isArray(raw?.secciones) ? raw.secciones : [];
  return {
    ...(raw?.destinatario ? { destinatario: raw.destinatario } : {}),
    ...(typeof raw?.edadMinima === 'number' ? { edadMinima: raw.edadMinima } : {}),
    ...(typeof raw?.edadMaxima === 'number' ? { edadMaxima: raw.edadMaxima } : {}),
    ...(raw?.tipoMiembro ? { tipoMiembro: raw.tipoMiembro } : {}),
    ...(typeof raw?.esPrincipal === 'boolean' ? { esPrincipal: raw.esPrincipal } : {}),
    ...(typeof raw?.orden === 'number' ? { orden: raw.orden } : {}),
    tituloDocumento: raw?.tituloDocumento ? String(raw.tituloDocumento) : tituloDefault || undefined,
    subtituloDocumento: raw?.subtituloDocumento ? String(raw.subtituloDocumento) : undefined,
    membrete: (raw?.membrete as MembreteDocumento) || 'GRUPO_JUAN_XXIII',
    mostrarResumenMiembro: raw?.mostrarResumenMiembro !== false,
    textoIntroduccion: raw?.textoIntroduccion ? String(raw.textoIntroduccion) : undefined,
    textoCierre: raw?.textoCierre ? String(raw.textoCierre) : undefined,
    firmas: Array.isArray(raw?.firmas) ? raw.firmas.map(String) : ['ADULTO_RESPONSABLE'],
    secciones: secs.map((s: any, i: number) => ({
      id: String(s?.id || `seccion_${i + 1}`),
      titulo: String(s?.titulo || `Sección ${i + 1}`),
      nombreCorto: s?.nombreCorto ? String(s.nombreCorto) : undefined,
      icono: s?.icono ? String(s.icono) : undefined,
      descripcion: s?.descripcion ? String(s.descripcion) : undefined,
      textoLegal: s?.textoLegal ? String(s.textoLegal) : undefined,
      saltoPaginaAntes: Boolean(s?.saltoPaginaAntes),
      ocultarTablaCamposEnPdf: Boolean(s?.ocultarTablaCamposEnPdf),
      firmasSeccion: Array.isArray(s?.firmasSeccion) ? s.firmasSeccion.map(String) : undefined,
      permiteCopiarHermano: Boolean(s?.permiteCopiarHermano),
      campos: Array.isArray(s?.campos)
        ? s.campos.map((c: any, j: number) => ({
            key: String(c?.key || `campo_${i + 1}_${j + 1}`),
            label: String(c?.label || `Pregunta ${j + 1}`),
            type: String(c?.type || 'text'),
            required: Boolean(c?.required),
            options: Array.isArray(c?.options) ? c.options : undefined,
            detalleKey: c?.detalleKey ? String(c.detalleKey) : undefined,
            esDetalleDe: c?.esDetalleDe ? String(c.esDetalleDe) : undefined,
            categoriaMedica: c?.categoriaMedica ? String(c.categoriaMedica) : undefined,
            critico: typeof c?.critico === 'boolean' ? c.critico : undefined,
            persistirEnPerfil:
              typeof c?.persistirEnPerfil === 'boolean' ? c.persistirEnPerfil : undefined,
            visibleSi: c?.visibleSi && typeof c.visibleSi === 'object' ? c.visibleSi : undefined,
          }))
        : [],
    })),
  };
}

function normalizarMapeo(raw: any): MapeoPdf {
  const campos = raw?.campos && typeof raw.campos === 'object' ? { ...raw.campos } : {};
  return {
    pdfBaseUrl:
      typeof raw?.pdfBaseUrl === 'string' && raw.pdfBaseUrl
        ? raw.pdfBaseUrl
        : '__DISENO_SECCIONES__',
    ...(typeof raw?.pdfBaseDataUrl === 'string' && raw.pdfBaseDataUrl
      ? { pdfBaseDataUrl: raw.pdfBaseDataUrl }
      : {}),
    ...(typeof raw?.pdfFileName === 'string' && raw.pdfFileName
      ? { pdfFileName: raw.pdfFileName }
      : {}),
    ...(raw?.modoRender && raw.modoRender !== 'OFICIAL' ? { modoRender: raw.modoRender } : {}),
    ...(raw?.indexBase === 0 || raw?.indexBase === 1 ? { indexBase: raw.indexBase } : {}),
    ...(raw?.esquemaDocumento ? { esquemaDocumento: raw.esquemaDocumento } : {}),
    ...(Array.isArray(raw?.qrPaginas) ? { qrPaginas: raw.qrPaginas } : {}),
    ...(Array.isArray(raw?.paginasCondicionales)
      ? { paginasCondicionales: raw.paginasCondicionales }
      : {}),
    campos,
    qrVerificacion: raw?.qrVerificacion,
  };
}

function detectarModoInicial(mapeo: MapeoPdf): ModoDocumento {
  if (
    mapeo.pdfBaseDataUrl ||
    mapeo.modoRender === 'PDF_ACROFORM' ||
    mapeo.modoRender === 'ESTAMPAR_COORDENADAS' ||
    (mapeo.pdfBaseUrl &&
      mapeo.pdfBaseUrl !== '__DISENO_SECCIONES__' &&
      mapeo.pdfBaseUrl !== '__MOLDE_OFICIAL__')
  ) {
    return 'PDF_ACROFORM';
  }
  return 'DISENO_SECCIONES';
}

function aCodigoOpcion(label: string): string {
  return (
    label
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || `OP_${Date.now()}`
  );
}

function generarCodigoDocumento(titulo: string, cicloAnio: number): string {
  const slug =
    titulo
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 26) || 'DOCUMENTO';
  const sufijo = Date.now().toString(36).toUpperCase().slice(-5);
  return `DOC_${slug}_${cicloAnio}_${sufijo}`.slice(0, 50);
}

function construirPlantillaInicial(tipo: PlantillaInicialTipo, cicloAnio: number): {
  titulo: string;
  esquema: EsquemaCampos;
} {
  if (tipo === 'AUTORIZACION') {
    return {
      titulo: 'Autorización de Salida / Actividad',
      esquema: {
        destinatario: 'MENORES',
        esPrincipal: false,
        tituloDocumento: 'Autorización de Salida / Actividad',
        subtituloDocumento: `Ciclo Scout ${cicloAnio} · Grupo Scout Juan XXIII N° 196`,
        membrete: 'AUTORIZACION_OFICIAL',
        mostrarResumenMiembro: true,
        firmas: ['ADULTO_RESPONSABLE'],
        secciones: [
          {
            id: `sec_auth_${Date.now()}`,
            titulo: 'Autorización y Conformidad',
            textoLegal:
              'En la ciudad de Córdoba, el {{fecha_actual}}, YO {{autorizante_nombre}} (DNI {{autorizante_dni}}), en mi carácter de {{autorizante_caracter}}, autorizo a {{nombre_completo}} (DNI {{dni}}, Rama {{rama}}) a participar de la actividad programada del Grupo Scout N° 196 "Juan XXIII".',
            ocultarTablaCamposEnPdf: false,
            permiteCopiarHermano: false,
            campos: [
              {
                key: 'autoriza_participacion',
                label: 'Otorgo mi autorización expresa para la participación y traslado',
                type: 'boolean',
                required: true,
              },
              {
                key: 'observaciones_familia',
                label: 'Observaciones o indicaciones importantes de la familia',
                type: 'textarea',
                required: false,
              },
            ],
          },
        ],
      },
    };
  }

  if (tipo === 'FICHA') {
    return {
      titulo: 'Ficha o Relevamiento del Grupo',
      esquema: {
        destinatario: 'TODOS',
        esPrincipal: false,
        tituloDocumento: 'Ficha o Relevamiento del Grupo',
        subtituloDocumento: `Ciclo Scout ${cicloAnio} · Grupo Scout Juan XXIII N° 196`,
        membrete: 'GRUPO_JUAN_XXIII',
        mostrarResumenMiembro: true,
        firmas: ['ADULTO_RESPONSABLE'],
        secciones: [
          {
            id: `sec_ficha_${Date.now()}`,
            titulo: 'Datos del Relevamiento',
            permiteCopiarHermano: false,
            campos: [
              {
                key: 'confirma_asistencia',
                label: '¿Confirma asistencia / participación?',
                type: 'boolean',
                required: true,
              },
              {
                key: 'comentarios_adicionales',
                label: 'Comentarios o aclaraciones adicionales',
                type: 'textarea',
                required: false,
              },
            ],
          },
        ],
      },
    };
  }

  return {
    titulo: 'Nuevo Documento del Grupo',
    esquema: {
      destinatario: 'TODOS',
      esPrincipal: false,
      tituloDocumento: 'Nuevo Documento del Grupo',
      subtituloDocumento: `Ciclo Scout ${cicloAnio} · Grupo Scout Juan XXIII N° 196`,
      membrete: 'GRUPO_JUAN_XXIII',
      mostrarResumenMiembro: true,
      firmas: ['ADULTO_RESPONSABLE'],
      secciones: [
        {
          id: `sec_general_${Date.now()}`,
          titulo: 'Contenido Principal',
          permiteCopiarHermano: false,
          campos: [],
        },
      ],
    },
  };
}

export const VisualPdfEditorDrawer: React.FC<VisualPdfEditorDrawerProps> = ({
  abierto,
  plantilla,
  modoCrear = false,
  plantillaBaseDuplicar = null,
  onCerrar,
  onGuardado,
  onToast,
}) => {
  const { pedir: pedirConfirmacion, dialogo: dialogoConfirmacion } = useConfirmar();
  const [mostrarPickerInicial, setMostrarPickerInicial] = useState(false);
  const [tabBuilder, setTabBuilder] = useState<TabConstructor>('portada');

  const [tituloDoc, setTituloDoc] = useState('');
  const [versionDoc, setVersionDoc] = useState('1.0');
  const [cicloAnioDoc, setCicloAnioDoc] = useState<number>(obtenerCicloAnioActual());
  const [activaDoc, setActivaDoc] = useState(true);
  const [destinatarioDoc, setDestinatarioDoc] = useState<DestinatarioDoc>('TODOS');
  const [esPrincipalDoc, setEsPrincipalDoc] = useState(false);

  const [esquema, setEsquema] = useState<EsquemaCampos>({ secciones: [] });
  const [mapeo, setMapeo] = useState<MapeoPdf>({
    pdfBaseUrl: '__DISENO_SECCIONES__',
    modoRender: 'DISENO_SECCIONES',
    campos: {},
  });
  const [modoDocumento, setModoDocumento] = useState<ModoDocumento>('DISENO_SECCIONES');
  const [mostrarPdfExterno, setMostrarPdfExterno] = useState(false);

  const [seccionActivaIdx, setSeccionActivaIdx] = useState(0);
  const [campoActivoKey, setCampoActivoKey] = useState<string>('');
  const [guardando, setGuardando] = useState(false);
  const [camposAcroDetectados, setCamposAcroDetectados] = useState<CampoAcroFormDetectado[]>([]);

  // Nuevo campo rápido (sin pedir clave técnica)
  const [nuevoCampoLabel, setNuevoCampoLabel] = useState('');
  const [nuevoCampoType, setNuevoCampoType] = useState<string>('text');
  const [nuevasOpcionesTexto, setNuevasOpcionesTexto] = useState('');
  const [nuevaOpcionLabel, setNuevaOpcionLabel] = useState('');

  // Vista previa PDF en vivo
  const fileInputRef = useRef<HTMLInputElement>(null);
  const legalTextareaRef = useRef<HTMLTextAreaElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [vistaEnBlanco, setVistaEnBlanco] = useState(false);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [previewBytes, setPreviewBytes] = useState<Uint8Array | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [paginaActual, setPaginaActual] = useState(1);
  const [cargandoPreview, setCargandoPreview] = useState(false);
  // Error de la vista previa en línea: como se regenera mientras se escribe, un toast por
  // intento llenaba la pantalla de avisos repetidos.
  const [errorPreview, setErrorPreview] = useState<string | null>(null);
  const [previewNonce, setPreviewNonce] = useState(0);
  // B6-14: "foto" del contenido editable al abrir (o al elegir el punto de partida) para
  // avisar si se cierra con cambios. Se toma en el render posterior al reseteo de estado.
  const [baselineNonce, setBaselineNonce] = useState(0);
  const baselineRef = useRef<{ nonce: number; firma: string }>({ nonce: -1, firma: '' });

  useEffect(() => {
    if (!abierto) return;
    setBaselineNonce((n) => n + 1);
    const anioActual = obtenerCicloAnioActual();

    if (modoCrear && plantillaBaseDuplicar) {
      const clonedEsq = normalizarEsquema(
        JSON.parse(JSON.stringify(plantillaBaseDuplicar.esquemaCamposJson || { secciones: [] })),
        `${plantillaBaseDuplicar.titulo} (Copia)`,
      );
      const clonedMap = normalizarMapeo(
        JSON.parse(JSON.stringify(plantillaBaseDuplicar.mapeoPdfJson || {})),
      );
      const modo = detectarModoInicial(clonedMap);
      setMostrarPickerInicial(false);
      setTabBuilder('portada');
      setTituloDoc(`${plantillaBaseDuplicar.titulo} (Copia)`);
      setVersionDoc(String(plantillaBaseDuplicar.version || '1.0'));
      setCicloAnioDoc(anioActual);
      setActivaDoc(true);
      setDestinatarioDoc(
        (resolverDestinatarioPlantilla(plantillaBaseDuplicar) as DestinatarioDoc) || 'TODOS',
      );
      setEsPrincipalDoc(false);
      setEsquema({
        ...clonedEsq,
        tituloDocumento: `${plantillaBaseDuplicar.titulo} (Copia)`,
        esPrincipal: false,
      });
      setMapeo(clonedMap);
      setModoDocumento(modo);
      setMostrarPdfExterno(modo === 'PDF_ACROFORM');
      setSeccionActivaIdx(0);
      setCampoActivoKey(clonedEsq.secciones[0]?.campos[0]?.key || '');
      setPaginaActual(1);
      setCamposAcroDetectados([]);
      setPreviewNonce((n) => n + 1);
      return;
    }

    if (modoCrear && !plantilla) {
      const { titulo, esquema: esqDefault } = construirPlantillaInicial('BLANCO', anioActual);
      setMostrarPickerInicial(true);
      setTabBuilder('portada');
      setTituloDoc(titulo);
      setVersionDoc('1.0');
      setCicloAnioDoc(anioActual);
      setActivaDoc(true);
      setDestinatarioDoc('TODOS');
      setEsPrincipalDoc(false);
      setEsquema(esqDefault);
      setMapeo({
        pdfBaseUrl: '__DISENO_SECCIONES__',
        modoRender: 'DISENO_SECCIONES',
        campos: {},
      });
      setModoDocumento('DISENO_SECCIONES');
      setMostrarPdfExterno(false);
      setSeccionActivaIdx(0);
      setCampoActivoKey('');
      setPaginaActual(1);
      setCamposAcroDetectados([]);
      setPreviewNonce((n) => n + 1);
      return;
    }

    if (!plantilla) return;

    const normEsq = normalizarEsquema(plantilla.esquemaCamposJson, plantilla.titulo);
    const normMap = normalizarMapeo(plantilla.mapeoPdfJson);
    const modo = detectarModoInicial(normMap);

    setMostrarPickerInicial(false);
    setTabBuilder(modo === 'PDF_ACROFORM' ? 'portada' : 'texto');
    setTituloDoc(String(plantilla.titulo || ''));
    setVersionDoc(String(plantilla.version || '1.0'));
    setCicloAnioDoc(Number(plantilla.cicloAnio || anioActual));
    setActivaDoc(Boolean(plantilla.activa));
    setDestinatarioDoc((resolverDestinatarioPlantilla(plantilla) as DestinatarioDoc) || 'TODOS');
    setEsPrincipalDoc(esPlantillaPrincipal(plantilla));
    setEsquema(normEsq);
    setMapeo(normMap);
    setModoDocumento(modo);
    setMostrarPdfExterno(modo === 'PDF_ACROFORM');
    setSeccionActivaIdx(0);
    setCampoActivoKey(normEsq.secciones[0]?.campos[0]?.key || '');
    setPaginaActual(1);
    setCamposAcroDetectados([]);
    setPreviewNonce((n) => n + 1);
  }, [abierto, plantilla, modoCrear, plantillaBaseDuplicar]);

  const elegirPlantillaInicial = (tipo: PlantillaInicialTipo) => {
    const anio = cicloAnioDoc || obtenerCicloAnioActual();
    const { titulo, esquema: esq } = construirPlantillaInicial(tipo, anio);
    setTituloDoc(titulo);
    setDestinatarioDoc((esq.destinatario as DestinatarioDoc) || 'TODOS');
    setEsPrincipalDoc(false);
    setEsquema(esq);
    setMapeo({
      pdfBaseUrl: '__DISENO_SECCIONES__',
      modoRender: 'DISENO_SECCIONES',
      campos: {},
    });
    setModoDocumento('DISENO_SECCIONES');
    setMostrarPdfExterno(false);
    setSeccionActivaIdx(0);
    setCampoActivoKey(esq.secciones[0]?.campos[0]?.key || '');
    setTabBuilder('portada');
    setMostrarPickerInicial(false);
    setPreviewNonce((n) => n + 1);
    setBaselineNonce((n) => n + 1);
  };

  const firmaContenido = useMemo(
    () =>
      JSON.stringify([
        tituloDoc,
        versionDoc,
        cicloAnioDoc,
        activaDoc,
        destinatarioDoc,
        esPrincipalDoc,
        modoDocumento,
        esquema,
        // El PDF subido puede pesar varios MB: se compara por largo para no serializarlo en cada render.
        { ...mapeo, pdfBaseDataUrl: mapeo.pdfBaseDataUrl?.length ?? 0 },
      ]),
    [tituloDoc, versionDoc, cicloAnioDoc, activaDoc, destinatarioDoc, esPrincipalDoc, modoDocumento, esquema, mapeo],
  );

  useEffect(() => {
    if (baselineRef.current.nonce !== baselineNonce) {
      baselineRef.current = { nonce: baselineNonce, firma: firmaContenido };
    }
  }, [baselineNonce, firmaContenido]);

  const cerrarEditor = () => {
    if (guardando) return;
    const hayCambios = !mostrarPickerInicial && firmaContenido !== baselineRef.current.firma;
    if (!hayCambios) {
      onCerrar();
      return;
    }
    pedirConfirmacion(
      {
        titulo: 'Cambios sin guardar',
        mensaje: 'Hiciste cambios en este documento que todavía no guardaste. Si cerrás, se pierden.',
        textoConfirmar: 'Descartar cambios',
        tipoImpacto: 'warn',
      },
      onCerrar,
    );
  };

  const construirRespuestasEjemplo = useCallback((esq: EsquemaCampos): Record<string, unknown> => {
    const valoresEjemploConocidos: Record<string, unknown> = {
      obra_social: 'APROSS',
      obra_social_afiliado: '0012-458912-01',
      tel_emergencia_1: '3515551234',
      tel_emergencia_2: '3514449876',
      tel_emergencia_obra_social: '0800-555-2776',
      fecha_control_medico: '2026-03-01',
      vacuna_quintuple: '15/03/2020',
      vacuna_triple_celular: '15/03/2020',
      vacuna_triple_acelular: '12/06/2023',
      vacuna_doble_bacteriana: '10/08/2025',
      no_tiene_vacunas_mencionadas: false,
      no_sabe_vacunas: false,
      toma_medicacion: false,
      medicacion_tipos: [],
      toma_medicacion_detalle: '',
      enfermedad_cronica: false,
      condiciones_medicas_tipos: [],
      enfermedad_cronica_detalle: '',
      requiere_tratamiento: false,
      requiere_tratamiento_detalle: '',
      tiene_cud: false,
      sufre_alergia: true,
      alergias_tipos: ['ALIMENTOS'],
      sufre_alergia_detalle: 'Maní y picadura de abejas',
      esta_anticoagulado: false,
      anticoagulado_droga: '',
      regimen_dietario: true,
      regimen_dietario_tipos: ['VEGETARIANO'],
      regimen_dietario_detalle: 'Sin carnes',
      ataques_panico_ansiedad: false,
      ataques_panico_frecuencia: '',
      diagnostico_salud_mental: false,
      diagnostico_salud_mental_detalle: '',
      recibe_tratamiento_salud_mental: false,
      recibe_tratamiento_salud_mental_detalle: '',
      miedo_fobia_excesivo: false,
      miedo_fobia_detalle: '',
      sit_hemorragias_nasales: false,
      sit_sangrado_encias: false,
      sit_dolor_cabeza: false,
      sit_presion_alta: false,
      sit_presion_baja: false,
      sit_transfusiones: false,
      sit_convulsiones: false,
      sit_cirugias_ultimo_anio: false,
      sit_internaciones_ultimo_anio: false,
      sit_actividad_fisica: true,
      sit_cualquier_actividad_fisica: true,
      sit_actividad_fisica_no_especifique: '',
      grupo_sanguineo: '0',
      factor_rh: '+',
      peso_kg: '52',
      talla_m: '1.58',
      comunicacion_educador_necesaria: '',
    };

    const out: Record<string, unknown> = {
      autorizante_nombre: 'María Laura Pérez',
      autorizante_dni: '28.456.789',
      autorizante_caracter: 'Madre',
      autorizante_fecha_nac: '1984-05-12',
      autorizante_domicilio: 'Vera y Zárate 3069, Córdoba',
      autorizante_telefono: '3515551234',
      protagonista_domicilio: 'Vera y Zárate 3069, Córdoba',
      protagonista_telefono: '3515551234',
      escolaridad_institucion: 'Instituto Técnico Juan XXIII',
      escolaridad_grado: '3er Año',
      religion: 'Católica',
      menor_nacionalidad: 'Argentina',
      madre_nombres: 'Pérez, María Laura',
      madre_dni: '28.456.789',
      madre_domicilio: 'Vera y Zárate 3069, Córdoba',
      madre_email: 'mlaura.perez@ejemplo.com',
      madre_telefono: '3515551234',
      madre_profesion: 'Docente',
      madre_estado_civil: 'Casada',
      padre_nombres: 'Scout, Carlos Alberto',
      padre_dni: '27.654.321',
      padre_domicilio: 'Vera y Zárate 3069, Córdoba',
      padre_email: 'carlos.scout@ejemplo.com',
      padre_telefono: '3515559876',
      padre_profesion: 'Ingeniero',
      padre_estado_civil: 'Casado',
      ret_persona1_nombre: 'González, Marta Elena',
      ret_persona1_dni: '18.222.333',
      ret_persona1_telefono: '3514445566',
      ret_persona1_caracter: 'Abuela',
    };
    for (const sec of esq.secciones) {
      for (const c of sec.campos) {
        if (c.key in valoresEjemploConocidos) {
          out[c.key] = valoresEjemploConocidos[c.key];
        } else if (c.type === 'boolean') {
          out[c.key] = true;
        } else if (c.type === 'multiselect') {
          out[c.key] = c.options?.slice(0, 2).map((o) => o.value) || ['Ejemplo'];
        } else if (c.type === 'select') {
          out[c.key] = c.options?.[0]?.value || 'Ejemplo';
        } else if (c.type === 'date') {
          out[c.key] = '2026-05-15';
        } else if (!(c.key in out)) {
          out[c.key] = c.label.slice(0, 32);
        }
      }
    }
    return out;
  }, []);

  const construirEsquemaFinal = useCallback((): EsquemaCampos => {
    return {
      ...esquema,
      destinatario: destinatarioDoc,
      esPrincipal: esPrincipalDoc,
      tituloDocumento: (esquema.tituloDocumento || tituloDoc).trim() || tituloDoc.trim(),
    };
  }, [esquema, destinatarioDoc, esPrincipalDoc, tituloDoc]);

  const construirMapeoEfectivo = useCallback(
    (modo: ModoDocumento, baseMap: MapeoPdf, esq: EsquemaCampos): MapeoPdf => {
      if (modo === 'DISENO_SECCIONES') {
        const { pdfBaseDataUrl: _d, pdfFileName: _n, ...resto } = baseMap;
        return {
          ...resto,
          pdfBaseUrl: '__DISENO_SECCIONES__',
          modoRender: 'DISENO_SECCIONES',
          esquemaDocumento: esq,
        };
      }
      return {
        ...baseMap,
        modoRender: 'PDF_ACROFORM',
      };
    },
    [],
  );

  // Renderizado en vivo de la vista previa PDF
  useEffect(() => {
    if (!abierto || mostrarPickerInicial) return;
    let cancelado = false;
    let loadedDoc: pdfjsLib.PDFDocumentProxy | null = null;

    const timer = window.setTimeout(async () => {
      setCargandoPreview(true);
      try {
        const esqActual = construirEsquemaFinal();
        const mapeoEfectivo = construirMapeoEfectivo(modoDocumento, mapeo, esqActual);

        if (
          modoDocumento === 'PDF_ACROFORM' &&
          !mapeo.pdfBaseDataUrl &&
          !mapeo.pdfBaseUrl?.startsWith('/')
        ) {
          if (!cancelado) {
            setPdfDoc(null);
            setPreviewBytes(null);
            setNumPages(0);
            setCamposAcroDetectados([]);
          }
          return;
        }

        const bytes = await generarFichaPdf(
          mapeoEfectivo,
          vistaEnBlanco ? {} : construirRespuestasEjemplo(esqActual),
          'VISTA-PREVIA-DOC-0123456789',
          {
            nombre: 'Sofía',
            apellido: 'Scout',
            dni: '42123456',
            fechaNacimiento: '2012-06-15',
            ramaNombre: 'Unidad Scout',
            telefonoContacto: '3515551234',
          },
          1,
          esqActual,
          { blank: vistaEnBlanco },
        );

        if (cancelado) return;
        setPreviewBytes(bytes);

        if (
          modoDocumento === 'PDF_ACROFORM' &&
          (mapeo.pdfBaseDataUrl || mapeo.pdfBaseUrl?.startsWith('/'))
        ) {
          let baseSinAplanar: Uint8Array | null = null;
          if (mapeo.pdfBaseDataUrl) {
            const base64 = mapeo.pdfBaseDataUrl.split(',')[1] || '';
            const binary = atob(base64);
            baseSinAplanar = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
              baseSinAplanar[i] = binary.charCodeAt(i);
            }
          } else if (mapeo.pdfBaseUrl?.startsWith('/')) {
            const respBase = await fetch(mapeo.pdfBaseUrl).catch(() => null);
            if (respBase && respBase.ok) {
              baseSinAplanar = new Uint8Array(await respBase.arrayBuffer());
            }
          }
          const detectados = baseSinAplanar ? await extraerCamposAcroFormPdf(baseSinAplanar) : [];
          if (!cancelado) setCamposAcroDetectados(detectados);
        } else {
          setCamposAcroDetectados([]);
        }

        const task = pdfjsLib.getDocument({ data: bytes });
        const doc = await task.promise;
        const destroyDoc = (doc as unknown as { destroy?: () => Promise<void> }).destroy;
        if (cancelado) {
          if (typeof destroyDoc === 'function') await destroyDoc.call(doc);
          return;
        }
        loadedDoc = doc;
        setPdfDoc(doc);
        setErrorPreview(null);
        setNumPages(doc.numPages);
        setPaginaActual((prev) => Math.min(Math.max(1, prev), doc.numPages));
      } catch (err) {
        if (!cancelado) {
          setErrorPreview(traducirErrorAmigable(err, 'No se pudo generar la vista previa PDF.'));
        }
      } finally {
        if (!cancelado) setCargandoPreview(false);
      }
    }, 350);

    return () => {
      cancelado = true;
      window.clearTimeout(timer);
      const destroyLoaded = loadedDoc
        ? (loadedDoc as unknown as { destroy?: () => Promise<void> }).destroy
        : undefined;
      if (loadedDoc && typeof destroyLoaded === 'function') {
        void destroyLoaded.call(loadedDoc);
      }
    };
  }, [
    abierto,
    mostrarPickerInicial,
    modoDocumento,
    mapeo,
    vistaEnBlanco,
    previewNonce,
    construirEsquemaFinal,
    construirMapeoEfectivo,
    construirRespuestasEjemplo,
    onToast,
  ]);

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current || paginaActual < 1 || paginaActual > pdfDoc.numPages) return;
    let cancelado = false;
    let renderTask: pdfjsLib.RenderTask | null = null;

    const render = async () => {
      try {
        const page = await pdfDoc.getPage(paginaActual);
        if (cancelado) return;
        const pdfVp = page.getViewport({ scale: 1 });
        const scale = Math.min(1.15, 520 / pdfVp.width);
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        renderTask = page.render({ canvasContext: ctx, viewport, canvas });
        await renderTask.promise;
      } catch {
        // Ignorar cancelaciones de render rápido
      }
    };

    void render();
    return () => {
      cancelado = true;
      renderTask?.cancel();
    };
  }, [pdfDoc, paginaActual]);

  const seccionActiva: SeccionSchema | undefined = esquema.secciones[seccionActivaIdx];

  const campoActivoObj: CampoSchema | undefined = useMemo(() => {
    if (!campoActivoKey) return undefined;
    for (const s of esquema.secciones) {
      const found = s.campos.find((c) => c.key === campoActivoKey);
      if (found) return found;
    }
    return undefined;
  }, [esquema.secciones, campoActivoKey]);

  const handleSubirPdfExterno = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.type && !file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf')) {
      onToast('Seleccioná un archivo con formato PDF (.pdf).', 'error');
      return;
    }
    if (file.size > 6 * 1024 * 1024) {
      onToast('El archivo PDF supera el límite de 6 MB.', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl) return;
      if (mostrarPickerInicial) {
        const nombreSinExt = file.name.replace(/\.pdf$/i, '').trim() || 'Documento Externo';
        setTituloDoc(nombreSinExt);
        setMostrarPickerInicial(false);
      }
      setModoDocumento('PDF_ACROFORM');
      setTabBuilder('portada');
      setMostrarPdfExterno(true);
      setMapeo((prev) => ({
        ...prev,
        pdfBaseUrl: '__UPLOADED_PDF__',
        pdfBaseDataUrl: dataUrl,
        pdfFileName: file.name,
        modoRender: 'PDF_ACROFORM',
      }));
      setPaginaActual(1);
      onToast(`PDF "${file.name}" cargado.`);
    };
    reader.readAsDataURL(file);
  };

  const handleVolverADisenoEditable = () => {
    setModoDocumento('DISENO_SECCIONES');
    setMostrarPdfExterno(false);
    setMapeo((prev) => ({
      ...prev,
      pdfBaseUrl: '__DISENO_SECCIONES__',
      modoRender: 'DISENO_SECCIONES',
    }));
    onToast('Documento convertido al editor por secciones.');
  };

  const validacionAcro = useMemo(
    () => validarCamposAcroFormContraEsquema(camposAcroDetectados, esquema, mapeo.campos),
    [camposAcroDetectados, esquema, mapeo.campos],
  );

  const handleAutoImportarAcroForm = () => {
    if (camposAcroDetectados.length === 0) return;
    const existentes = new Set(esquema.secciones.flatMap((s) => s.campos.map((c) => c.key)));
    const nuevos = validacionAcro.sinPreguntaEnFormulario.filter((c) => !existentes.has(c.key));
    if (nuevos.length === 0) {
      onToast('Todos los campos detectados en el PDF ya están vinculados al formulario.');
      return;
    }

    const nuevosCamposSchema: CampoSchema[] = nuevos.map((c) => ({
      key: c.key,
      label: c.label,
      type: c.type,
      required: false,
      options: c.options,
    }));

    setEsquema((prev) => {
      if (prev.secciones.length === 0) {
        return {
          ...prev,
          secciones: [
            {
              id: `seccion_pdf_${Date.now()}`,
              titulo: 'Campos del PDF',
              permiteCopiarHermano: false,
              campos: nuevosCamposSchema,
            },
          ],
        };
      }
      return {
        ...prev,
        secciones: prev.secciones.map((s, idx) =>
          idx === seccionActivaIdx ? { ...s, campos: [...s.campos, ...nuevosCamposSchema] } : s,
        ),
      };
    });

    setMapeo((prev) => {
      const nextCampos = { ...prev.campos };
      for (const c of nuevos) {
        if (!nextCampos[c.key]) {
          nextCampos[c.key] = {
            acroFieldName: c.acroFieldName,
            type: c.type === 'boolean' ? 'checkbox_x' : 'text',
          };
        }
      }
      return { ...prev, modoRender: 'PDF_ACROFORM', campos: nextCampos };
    });

    setCampoActivoKey(nuevos[0].key);
    onToast(`Se importaron ${nuevos.length} campo(s) rellenables del PDF.`);
  };

  const handleToggleFirmaDoc = (firmaId: string) => {
    setEsquema((prev) => {
      const actuales = Array.isArray(prev.firmas) ? prev.firmas : ['ADULTO_RESPONSABLE'];
      const existe = actuales.includes(firmaId);
      const next = existe ? actuales.filter((f) => f !== firmaId) : [...actuales, firmaId];
      return { ...prev, firmas: next };
    });
  };

  const handleUpdateSeccionActiva = (patch: Partial<SeccionSchema>) => {
    setEsquema((prev) => ({
      ...prev,
      secciones: prev.secciones.map((s, idx) =>
        idx === seccionActivaIdx ? { ...s, ...patch } : s,
      ),
    }));
  };

  const handleInsertarVariableLegal = (clave: string) => {
    if (!seccionActiva) return;
    const token = `{{${clave}}}`;
    const textarea = legalTextareaRef.current;
    const actual = seccionActiva.textoLegal || '';

    if (textarea && typeof textarea.selectionStart === 'number') {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd ?? start;
      const next = `${actual.slice(0, start)}${token}${actual.slice(end)}`;
      handleUpdateSeccionActiva({ textoLegal: next });
      window.setTimeout(() => {
        textarea.focus();
        const pos = start + token.length;
        textarea.setSelectionRange(pos, pos);
      }, 0);
    } else {
      handleUpdateSeccionActiva({
        textoLegal: actual ? `${actual.trimEnd()} ${token}` : token,
      });
    }
  };

  const handleAgregarSeccion = () => {
    const num = esquema.secciones.length + 1;
    const nueva: SeccionSchema = {
      id: `seccion_${Date.now()}`,
      titulo: `Sección ${num}`,
      permiteCopiarHermano: false,
      campos: [],
    };
    setEsquema((prev) => ({ ...prev, secciones: [...prev.secciones, nueva] }));
    setSeccionActivaIdx(esquema.secciones.length);
  };

  const handleEliminarSeccion = (idx: number) => {
    if (esquema.secciones.length <= 1) {
      onToast('El documento debe mantener al menos una sección.', 'error');
      return;
    }
    const secEliminada = esquema.secciones[idx];
    setEsquema((prev) => ({
      ...prev,
      secciones: prev.secciones.filter((_, i) => i !== idx),
    }));
    if (secEliminada) {
      setMapeo((prev) => {
        const nextCampos = { ...prev.campos };
        for (const c of secEliminada.campos) delete nextCampos[c.key];
        return { ...prev, campos: nextCampos };
      });
    }
    setSeccionActivaIdx(0);
    setCampoActivoKey('');
  };

  const handleAgregarCampo = () => {
    if (!seccionActiva) {
      onToast('Creá o seleccioná una sección primero.', 'error');
      return;
    }
    const cleanLabel = nuevoCampoLabel.trim();
    if (!cleanLabel) {
      onToast('Escribí el texto de la pregunta.', 'error');
      return;
    }

    const usadas = new Set(esquema.secciones.flatMap((s) => s.campos.map((c) => c.key)));
    const baseKey = aCodigoOpcion(cleanLabel).toLowerCase().slice(0, 42) || 'pregunta';
    let cleanKey = baseKey;
    let idx = 2;
    while (usadas.has(cleanKey)) {
      cleanKey = `${baseKey.slice(0, 38)}_${idx++}`;
    }

    const esSelector = nuevoCampoType === 'select' || nuevoCampoType === 'multiselect';
    const opcionesParseadas = esSelector
      ? nuevasOpcionesTexto
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
          .map((label) => ({ label, value: aCodigoOpcion(label) }))
      : undefined;

    const nuevo: CampoSchema = {
      key: cleanKey,
      label: cleanLabel,
      type: nuevoCampoType,
      required: false,
      ...(esSelector ? { options: opcionesParseadas || [] } : {}),
    };

    handleUpdateSeccionActiva({ campos: [...seccionActiva.campos, nuevo] });
    setCampoActivoKey(cleanKey);
    setNuevoCampoLabel('');
    setNuevasOpcionesTexto('');
  };

  const handleEliminarCampo = (key: string) => {
    if (!seccionActiva) return;
    handleUpdateSeccionActiva({
      campos: seccionActiva.campos.filter((c) => c.key !== key),
    });
    setMapeo((prev) => {
      const nextCampos = { ...prev.campos };
      delete nextCampos[key];
      return { ...prev, campos: nextCampos };
    });
    if (campoActivoKey === key) setCampoActivoKey('');
  };

  const handleUpdateCampoSchema = (key: string, patch: Partial<CampoSchema>) => {
    setEsquema((prev) => ({
      ...prev,
      secciones: prev.secciones.map((sec) => ({
        ...sec,
        campos: sec.campos.map((c) => (c.key === key ? { ...c, ...patch } : c)),
      })),
    }));
  };

  const handleAgregarOpcionCampoActivo = () => {
    if (!campoActivoObj) return;
    const label = nuevaOpcionLabel.trim();
    if (!label) return;
    const value = aCodigoOpcion(label);
    const actuales = campoActivoObj.options || [];
    if (actuales.some((o) => o.value === value)) {
      onToast(`Ya existe la opción "${label}".`, 'error');
      return;
    }
    handleUpdateCampoSchema(campoActivoObj.key, {
      options: [...actuales, { label, value }],
    });
    setNuevaOpcionLabel('');
  };

  const handleEliminarOpcionCampoActivo = (value: string) => {
    if (!campoActivoObj) return;
    handleUpdateCampoSchema(campoActivoObj.key, {
      options: (campoActivoObj.options || []).filter((o) => o.value !== value),
    });
  };

  const handleAbrirPreviewPestana = () => {
    if (!previewBytes) return;
    try {
      abrirPdfEnPestana(previewBytes);
    } catch {
      descargarPdfBlob(previewBytes, `VistaPrevia_${tituloDoc.trim() || 'Documento'}.pdf`);
    }
  };

  const handleGuardarCambios = async () => {
    const tituloLimpio = tituloDoc.trim();
    if (tituloLimpio.length < 2) {
      onToast('Escribí un nombre de al menos 2 caracteres para el documento.', 'error');
      setTabBuilder('portada');
      return;
    }

    setGuardando(true);
    try {
      const esquemaFinal = construirEsquemaFinal();
      const mapeoFinal = construirMapeoEfectivo(modoDocumento, mapeo, esquemaFinal);

      if (plantilla?.id && !modoCrear) {
        await api.patch(`/legajos/plantillas/${plantilla.id}`, {
          titulo: tituloLimpio,
          version: versionDoc.trim() || '1.0',
          cicloAnio: Number(cicloAnioDoc),
          activa: activaDoc,
          esquemaCamposJson: esquemaFinal,
          mapeoPdfJson: mapeoFinal,
        });
        onToast(`Documento "${tituloLimpio}" guardado.`);
      } else {
        await api.post('/legajos/plantillas', {
          codigo: generarCodigoDocumento(tituloLimpio, Number(cicloAnioDoc)),
          titulo: tituloLimpio,
          version: versionDoc.trim() || '1.0',
          cicloAnio: Number(cicloAnioDoc),
          activa: activaDoc,
          esquemaCamposJson: esquemaFinal,
          mapeoPdfJson: mapeoFinal,
        });
        onToast(`Documento "${tituloLimpio}" creado.`);
      }

      await onGuardado();
      onCerrar();
    } catch (err) {
      onToast(traducirErrorAmigable(err, 'No se pudo guardar el documento.'), 'error');
    } finally {
      setGuardando(false);
    }
  };

  if (!abierto) return null;

  const esPdfAcroForm = modoDocumento === 'PDF_ACROFORM';
  const esLegajoOficial =
    esPdfAcroForm &&
    !modoCrear &&
    Boolean(plantilla?.codigo && /^LEGAJO_(MENORES|ROVERS|EDUCADORES)_/i.test(String(plantilla.codigo)));

  const tabsDisponibles: Array<{ id: TabConstructor; label: string; icon: React.ReactNode }> =
    esPdfAcroForm
      ? [
          { id: 'portada', label: '1. Datos y PDF', icon: <FileCheck2 className="w-3.5 h-3.5" /> },
          { id: 'preguntas', label: '2. Preguntas', icon: <HelpCircle className="w-3.5 h-3.5" /> },
        ]
      : [
          { id: 'portada', label: '1. Portada', icon: <FileCheck2 className="w-3.5 h-3.5" /> },
          { id: 'texto', label: '2. Texto y Secciones', icon: <Layers className="w-3.5 h-3.5" /> },
          { id: 'preguntas', label: '3. Preguntas', icon: <HelpCircle className="w-3.5 h-3.5" /> },
        ];

  return (
    <>
    {dialogoConfirmacion}
    <Drawer
      abierto={abierto}
      onCerrar={cerrarEditor}
      titulo={
        mostrarPickerInicial
          ? 'Crear Nuevo Documento'
          : modoCrear
            ? `Nuevo Documento — ${tituloDoc || 'Sin título'}`
            : `Editar Documento — ${tituloDoc || plantilla?.titulo || ''}`
      }
      subtitulo={
        mostrarPickerInicial
          ? 'Elegí un punto de partida y personalizalo a gusto.'
          : esPdfAcroForm
            ? 'Configurá datos generales, el archivo PDF rellenable y las preguntas vinculadas con vista previa en vivo.'
            : 'Configurá portada, texto legal con variables automáticas y preguntas viendo el PDF en vivo.'
      }
      mode="drawer"
      maxWidthClass="sm:max-w-6xl"
      allowFullscreen={true}
      bloqueado={guardando}
      footer={
        mostrarPickerInicial ? (
          <Button type="button" variant="secondary" onClick={cerrarEditor}>
            Cancelar
          </Button>
        ) : (
          <>
            <Button
              type="button"
              variant="secondary"
              disabled={!previewBytes}
              onClick={handleAbrirPreviewPestana}
              leftIcon={<ExternalLink className="w-4 h-4 text-brand" />}
            >
              Abrir PDF en pestaña
            </Button>
            <div className="flex-1" />
            <Button type="button" variant="secondary" onClick={cerrarEditor} disabled={guardando}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="primary"
              loading={guardando}
              onClick={() => void handleGuardarCambios()}
              leftIcon={<Save className="w-4 h-4" />}
            >
              {plantilla?.id && !modoCrear ? 'Guardar Cambios' : 'Crear Documento'}
            </Button>
          </>
        )
      }
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={handleSubirPdfExterno}
      />

      {mostrarPickerInicial ? (
        <div className="max-w-3xl mx-auto py-4 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <button
              type="button"
              onClick={() => elegirPlantillaInicial('AUTORIZACION')}
              className="s-card rounded-2xl p-5 text-left hover:border-brand transition cursor-pointer flex flex-col justify-between gap-4"
            >
              <div className="space-y-2.5">
                <div className="w-10 h-10 rounded-xl bg-brand/10 text-brand flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <h3 className="text-base font-black text-ink">Autorización o Declaración</h3>
                <p className="text-xs text-ink-muted leading-relaxed">
                  Trae membrete oficial, texto legal listo para editar con variables (nombre, DNI,
                  autorizante) y espacio de firma.
                </p>
              </div>
              <span className="text-xs font-black text-brand">Usar este modelo →</span>
            </button>

            <button
              type="button"
              onClick={() => elegirPlantillaInicial('FICHA')}
              className="s-card rounded-2xl p-5 text-left hover:border-brand transition cursor-pointer flex flex-col justify-between gap-4"
            >
              <div className="space-y-2.5">
                <div className="w-10 h-10 rounded-xl bg-brand/10 text-brand flex items-center justify-center">
                  <ClipboardList className="w-5 h-5" />
                </div>
                <h3 className="text-base font-black text-ink">Ficha o Encuesta</h3>
                <p className="text-xs text-ink-muted leading-relaxed">
                  Ideal para relevamientos de campamento, comida, talles o encuestas familiares con
                  preguntas personalizadas.
                </p>
              </div>
              <span className="text-xs font-black text-brand">Usar este modelo →</span>
            </button>

            <button
              type="button"
              onClick={() => elegirPlantillaInicial('BLANCO')}
              className="s-card rounded-2xl p-5 text-left hover:border-brand transition cursor-pointer flex flex-col justify-between gap-4"
            >
              <div className="space-y-2.5">
                <div className="w-10 h-10 rounded-xl bg-paper-2 border border-rule text-ink flex items-center justify-center">
                  <FilePlus2 className="w-5 h-5" />
                </div>
                <h3 className="text-base font-black text-ink">Documento en Blanco</h3>
                <p className="text-xs text-ink-muted leading-relaxed">
                  Arrancá de cero eligiendo membrete, redactando tus secciones y agregando las
                  preguntas que necesites.
                </p>
              </div>
              <span className="text-xs font-black text-brand">Empezar desde cero →</span>
            </button>
          </div>

          <div className="s-panel rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <FileUp className="w-5 h-5 text-brand shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-black text-ink">
                  ¿Tenés un archivo PDF cerrado de otra institución?
                </div>
                <p className="text-xs text-ink-muted">
                  Si una entidad externa exige su propio PDF rellenable, podés importarlo acá.
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              leftIcon={<Upload className="w-4 h-4 text-brand" />}
            >
              Importar PDF externo
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Columna Izquierda: Pestañas adaptadas al tipo de documento */}
          <div className="lg:col-span-6 space-y-4">
            <div
              className={`grid gap-1.5 p-1 rounded-2xl bg-paper-2 border border-rule ${
                esPdfAcroForm ? 'grid-cols-2' : 'grid-cols-3'
              }`}
            >
              {tabsDisponibles.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTabBuilder(t.id)}
                  className={`min-h-[40px] px-2.5 py-1.5 rounded-xl text-xs font-black inline-flex items-center justify-center gap-1.5 transition cursor-pointer ${
                    tabBuilder === t.id
                      ? 'bg-brand text-brand-contrast shadow-xs'
                      : 'text-ink-2 hover:bg-surface'
                  }`}
                >
                  {t.icon}
                  <span className="truncate">{t.label}</span>
                </button>
              ))}
            </div>

            {/* PESTAÑA 1: PORTADA Y DESTINATARIOS */}
            {tabBuilder === 'portada' && (
              <div className="space-y-4">
                <div className="s-card rounded-2xl p-4 space-y-3.5">
                  <Input
                    label="Nombre del documento"
                    required
                    value={tituloDoc}
                    onChange={(e) => {
                      const val = e.target.value;
                      setTituloDoc(val);
                      setEsquema((prev) => ({ ...prev, tituloDocumento: val }));
                    }}
                    placeholder="Ej: Autorización Campamento de Invierno"
                  />

                  <Select
                    label="¿Quién debe completarlo?"
                    value={destinatarioDoc}
                    onChange={(e) => setDestinatarioDoc(e.target.value as DestinatarioDoc)}
                  >
                    <option value="TODOS">Todos los miembros activos</option>
                    <option value="MENORES">Solo Protagonistas Menores (&lt; 18 años)</option>
                    <option value="MAYORES">Solo Protagonistas Mayores (Rovers / +18)</option>
                    <option value="EDUCADORES">Solo Educadores Scouts</option>
                  </Select>

                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      label="Ciclo anual"
                      type="number"
                      min={2000}
                      max={2100}
                      value={cicloAnioDoc}
                      onChange={(e) => setCicloAnioDoc(Number(e.target.value) || obtenerCicloAnioActual())}
                    />
                    <Input
                      label="Versión"
                      value={versionDoc}
                      onChange={(e) => setVersionDoc(e.target.value)}
                      placeholder="1.0"
                    />
                  </div>

                  <div className="flex flex-col gap-2 pt-1">
                    <label className="flex items-center gap-2 text-xs font-bold text-ink cursor-pointer">
                      <input
                        type="checkbox"
                        checked={activaDoc}
                        onChange={(e) => setActivaDoc(e.target.checked)}
                        className="w-4 h-4 accent-brand"
                      />
                      <span>Documento activo y visible para completar en este ciclo</span>
                    </label>
                    <label className="flex items-center gap-2 text-xs font-bold text-ink cursor-pointer">
                      <input
                        type="checkbox"
                        checked={esPrincipalDoc}
                        onChange={(e) => setEsPrincipalDoc(e.target.checked)}
                        className="w-4 h-4 accent-brand"
                      />
                      <span>Marcar como documento principal del legajo</span>
                    </label>
                  </div>
                </div>

                {modoDocumento === 'DISENO_SECCIONES' && (
                  <div className="s-card rounded-2xl p-4 space-y-3.5">
                    <Select
                      label="Membrete y logos del encabezado"
                      value={esquema.membrete || 'GRUPO_JUAN_XXIII'}
                      onChange={(e) =>
                        setEsquema((prev) => ({
                          ...prev,
                          membrete: e.target.value as MembreteDocumento,
                        }))
                      }
                    >
                      {MEMBRETES_OPCIONES.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </Select>

                    <Input
                      label="Subtítulo del encabezado (opcional)"
                      value={esquema.subtituloDocumento || ''}
                      onChange={(e) =>
                        setEsquema((prev) => ({ ...prev, subtituloDocumento: e.target.value }))
                      }
                      placeholder={`Ciclo Scout ${cicloAnioDoc}`}
                    />

                    <label className="flex items-center gap-2 text-xs font-bold text-ink cursor-pointer">
                      <input
                        type="checkbox"
                        checked={esquema.mostrarResumenMiembro !== false}
                        onChange={(e) =>
                          setEsquema((prev) => ({
                            ...prev,
                            mostrarResumenMiembro: e.target.checked,
                          }))
                        }
                        className="w-4 h-4 accent-brand"
                      />
                      <span>Incluir recuadro arriba con datos del miembro (DNI, Rama, Domicilio)</span>
                    </label>

                    <div className="pt-2 border-t border-rule space-y-2">
                      <span className="text-xs font-bold text-ink-2 block">Firmas al pie del PDF</span>
                      <div className="flex flex-wrap gap-2">
                        {FIRMAS_OPCIONES.map((f) => {
                          const checked = (esquema.firmas || ['ADULTO_RESPONSABLE']).includes(f.id);
                          return (
                            <label
                              key={f.id}
                              className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition ${
                                checked
                                  ? 'bg-brand/10 border-brand text-brand'
                                  : 'bg-paper-2 border-rule text-ink-2'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => handleToggleFirmaDoc(f.id)}
                                className="w-3.5 h-3.5 accent-brand"
                              />
                              <span>{f.label}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* Panel del molde PDF (siempre visible en PDF_ACROFORM; colapsable en modo editor propio) */}
                <div className="s-panel rounded-2xl p-3.5 space-y-2.5">
                  {esPdfAcroForm ? (
                    <div className="flex items-center gap-1.5 text-xs font-bold text-ink-2">
                      <FileUp className="w-4 h-4 text-brand shrink-0" />
                      <span>Molde PDF oficial / AcroForm adjunto</span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setMostrarPdfExterno((v) => !v)}
                      className="w-full flex items-center justify-between gap-2 text-left text-xs font-bold text-ink-2 hover:text-brand cursor-pointer"
                    >
                      <span className="flex items-center gap-1.5">
                        <FileUp className="w-4 h-4 text-brand shrink-0" />
                        <span>¿Necesitás usar un PDF externo de otra institución?</span>
                      </span>
                      <span className="text-brand">{mostrarPdfExterno ? 'Ocultar' : 'Configurar'}</span>
                    </button>
                  )}

                  {(esPdfAcroForm || mostrarPdfExterno) && (
                    <div
                      className={`${esPdfAcroForm ? 'pt-1' : 'pt-2 border-t border-rule'} space-y-2.5`}
                    >
                      <p className="text-xs text-ink-muted">
                        Usa un PDF rellenable (AcroForm) para mantener intacto el formato oficial e
                        imprimir automáticamente el Anexo si algún campo supera su casillero.
                      </p>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-ink truncate max-w-[230px]">
                          {mapeo.pdfFileName ||
                            (mapeo.pdfBaseUrl?.startsWith('/')
                              ? mapeo.pdfBaseUrl.split('/').pop()
                              : mapeo.pdfBaseDataUrl
                                ? 'PDF subido'
                                : 'Sin archivo adjunto')}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => fileInputRef.current?.click()}
                            leftIcon={<Upload className="w-3.5 h-3.5 text-brand" />}
                          >
                            {mapeo.pdfBaseDataUrl || mapeo.pdfBaseUrl?.startsWith('/')
                              ? 'Cambiar .pdf'
                              : 'Subir .pdf'}
                          </Button>
                          {esPdfAcroForm && !esLegajoOficial && (
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={handleVolverADisenoEditable}
                            >
                              Usar editor propio
                            </Button>
                          )}
                        </div>
                      </div>

                      {camposAcroDetectados.length > 0 && (
                        <div className="s-badge-brand rounded-xl px-3 py-2 text-xs font-bold flex items-center justify-between gap-2 flex-wrap">
                          <span className="flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 shrink-0" />
                            <span>
                              {validacionAcro.totalCamposPdf} campo(s) rellenables ·{' '}
                              {validacionAcro.vinculados.length} vinculado(s) automáticamente
                            </span>
                          </span>
                          {validacionAcro.sinPreguntaEnFormulario.length > 0 ? (
                            <Button
                              type="button"
                              variant="primary"
                              size="sm"
                              onClick={handleAutoImportarAcroForm}
                            >
                              Importar {validacionAcro.sinPreguntaEnFormulario.length} faltante(s)
                            </Button>
                          ) : (
                            <span className="text-xs font-black text-emerald-700 dark:text-emerald-300">
                              Todos vinculados ✓
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* PESTAÑA 2: TEXTO Y SECCIONES (solo en documentos propios editables) */}
            {tabBuilder === 'texto' && !esPdfAcroForm && (
              <div className="space-y-4">
                <div className="s-panel rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-black uppercase tracking-wider text-ink-muted">
                      Secciones del documento ({esquema.secciones.length})
                    </span>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={handleAgregarSeccion}
                      leftIcon={<Plus className="w-3.5 h-3.5" />}
                    >
                      Nueva sección
                    </Button>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {esquema.secciones.map((sec, idx) => (
                      <button
                        key={sec.id}
                        type="button"
                        onClick={() => {
                          setSeccionActivaIdx(idx);
                          setCampoActivoKey(sec.campos[0]?.key || '');
                        }}
                        className={`min-h-[34px] px-3 py-1.5 rounded-xl text-xs font-bold border cursor-pointer transition ${
                          idx === seccionActivaIdx
                            ? 's-btn-brand border-brand'
                            : 's-btn-sec text-ink-2'
                        }`}
                      >
                        {idx + 1}. {sec.titulo}
                      </button>
                    ))}
                  </div>

                  {seccionActiva && (
                    <div className="pt-2.5 border-t border-rule space-y-3">
                      <div className="flex items-end gap-2">
                        <div className="flex-1">
                          <Input
                            label="Título de esta sección"
                            value={seccionActiva.titulo}
                            onChange={(e) => handleUpdateSeccionActiva({ titulo: e.target.value })}
                          />
                        </div>
                        {esquema.secciones.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              pedirConfirmacion(
                                {
                                  titulo: 'Eliminar sección',
                                  mensaje: `¿Eliminar la sección "${esquema.secciones[seccionActivaIdx]?.titulo ?? ''}" con todas sus preguntas?`,
                                  impacto: 'Se quitarán también los mapeos al PDF de esas preguntas. Solo se recupera cerrando el editor sin guardar.',
                                  textoConfirmar: 'Eliminar sección',
                                },
                                () => handleEliminarSeccion(seccionActivaIdx),
                              )
                            }
                            className="min-h-[42px] px-2.5 rounded-xl border border-rose-200 dark:border-rose-900 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                            title="Eliminar sección"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      {modoDocumento === 'DISENO_SECCIONES' && (
                        <div className="space-y-2 p-3 rounded-xl bg-surface border border-rule">
                          <label className="text-xs font-black text-ink flex items-center gap-1.5">
                            <FileText className="w-3.5 h-3.5 text-brand" />
                            <span>Texto del documento / Párrafo legal</span>
                          </label>
                          <textarea
                            ref={legalTextareaRef}
                            rows={5}
                            value={seccionActiva.textoLegal || ''}
                            onChange={(e) =>
                              handleUpdateSeccionActiva({ textoLegal: e.target.value })
                            }
                            placeholder="Ej: Por la presente, yo {{autorizante_nombre}} (DNI {{autorizante_dni}}), autorizo a {{nombre_completo}} (DNI {{dni}})..."
                            className="s-input w-full rounded-xl px-3 py-2 text-sm resize-y"
                          />
                          <div className="space-y-1">
                            <span className="text-xs font-bold text-ink-muted block">
                              Tocá para insertar datos automáticos del miembro en el texto:
                            </span>
                            <div className="flex flex-wrap gap-1">
                              {VARIABLES_SISTEMA.map((v) => (
                                <button
                                  key={v.key}
                                  type="button"
                                  onClick={() => handleInsertarVariableLegal(v.key)}
                                  className="px-2 py-0.5 rounded-md bg-paper-2 hover:bg-brand/15 border border-rule text-xs font-semibold text-ink-2 hover:text-brand cursor-pointer transition"
                                >
                                  + {v.label}
                                </button>
                              ))}
                              {seccionActiva.campos.slice(0, 6).map((c) => (
                                <button
                                  key={`var_${c.key}`}
                                  type="button"
                                  onClick={() => handleInsertarVariableLegal(c.key)}
                                  className="px-2 py-0.5 rounded-md bg-brand/5 hover:bg-brand/15 border border-brand/30 text-xs font-semibold text-brand cursor-pointer transition"
                                >
                                  + {c.label.slice(0, 22)}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="flex flex-col gap-1.5">
                        {modoDocumento === 'DISENO_SECCIONES' && (
                          <>
                            <label className="flex items-center gap-2 text-xs font-semibold text-ink-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={Boolean(seccionActiva.saltoPaginaAntes)}
                                onChange={(e) =>
                                  handleUpdateSeccionActiva({ saltoPaginaAntes: e.target.checked })
                                }
                                className="w-4 h-4 accent-brand"
                              />
                              <span>Empezar esta sección en una hoja nueva en el PDF</span>
                            </label>
                            <label className="flex items-center gap-2 text-xs font-semibold text-ink-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={Boolean(seccionActiva.ocultarTablaCamposEnPdf)}
                                onChange={(e) =>
                                  handleUpdateSeccionActiva({
                                    ocultarTablaCamposEnPdf: e.target.checked,
                                  })
                                }
                                className="w-4 h-4 accent-brand"
                              />
                              <span>Imprimir solo el texto (sin tabla de preguntas en esta sección)</span>
                            </label>
                          </>
                        )}
                        <label className="flex items-center gap-2 text-xs font-semibold text-ink-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={Boolean(seccionActiva.permiteCopiarHermano)}
                            onChange={(e) =>
                              handleUpdateSeccionActiva({ permiteCopiarHermano: e.target.checked })
                            }
                            className="w-4 h-4 accent-brand"
                          />
                          <span>Permitir copiar respuestas entre hermanos</span>
                        </label>
                      </div>
                    </div>
                  )}
                </div>

                {modoDocumento === 'DISENO_SECCIONES' && (
                  <div className="s-card rounded-2xl p-4 space-y-2">
                    <label className="text-xs font-bold text-ink-2 block">
                      Nota o declaración jurada final antes de firmar (opcional)
                    </label>
                    <textarea
                      rows={2}
                      value={esquema.textoCierre || ''}
                      onChange={(e) =>
                        setEsquema((prev) => ({ ...prev, textoCierre: e.target.value }))
                      }
                      placeholder="Ej: Declaro bajo juramento que los datos informados son verídicos..."
                      className="s-input w-full rounded-xl px-3 py-2 text-sm resize-y"
                    />
                  </div>
                )}
              </div>
            )}

            {/* PESTAÑA 3: PREGUNTAS DEL FORMULARIO */}
            {tabBuilder === 'preguntas' && (
              <div className="s-panel rounded-2xl p-4 space-y-3.5">
                {esPdfAcroForm && (
                  <p className="text-xs text-ink-muted bg-surface border border-rule rounded-xl px-3 py-2">
                    Podés editar el texto mostrado en el formulario web, marcar preguntas como
                    obligatorias/opcionales o vincularlas a los filtros de Salud y Cocina. Para
                    agregar casilleros imprimibles nuevos, subí un `.pdf` actualizado desde la
                    pestaña <strong className="text-ink">1. Datos y PDF</strong>.
                  </p>
                )}
                {esquema.secciones.length > 1 && (
                  <div className="flex flex-wrap gap-1.5 pb-2 border-b border-rule">
                    {esquema.secciones.map((sec, idx) => (
                      <button
                        key={sec.id}
                        type="button"
                        onClick={() => {
                          setSeccionActivaIdx(idx);
                          setCampoActivoKey(sec.campos[0]?.key || '');
                        }}
                        className={`min-h-[32px] px-2.5 py-1 rounded-xl text-xs font-bold border cursor-pointer transition ${
                          idx === seccionActivaIdx
                            ? 's-btn-brand border-brand'
                            : 's-btn-sec text-ink-2'
                        }`}
                      >
                        {idx + 1}. {sec.titulo}
                      </button>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-black uppercase tracking-wider text-ink-muted">
                    Preguntas en &ldquo;{seccionActiva?.titulo || 'Sección'}&rdquo; (
                    {seccionActiva?.campos.length || 0})
                  </h3>
                </div>

                <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                  {(!seccionActiva || seccionActiva.campos.length === 0) && (
                    <p className="text-xs text-ink-muted py-4 text-center">
                      No hay preguntas en esta sección todavía. Agregá una abajo si necesitás que la
                      familia responda datos adicionales.
                    </p>
                  )}
                  {seccionActiva?.campos.map((campo) => {
                    const seleccionado = campoActivoKey === campo.key;
                    const tipoFriendly =
                      TIPOS_CAMPO_OPCIONES.find((t) => t.value === campo.type)?.label || campo.type;
                    return (
                      <div
                        key={campo.key}
                        tabIndex={0}
                        aria-current={seleccionado ? 'true' : undefined}
                        onClick={() => setCampoActivoKey(campo.key)}
                        onKeyDown={(e) => {
                          // Teclado: Enter/Espacio selecciona la pregunta para editarla
                          if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                            e.preventDefault();
                            setCampoActivoKey(campo.key);
                          }
                        }}
                        className={`p-2.5 rounded-xl border text-[13px] cursor-pointer flex items-center justify-between gap-2 transition ${
                          seleccionado
                            ? 'bg-brand-soft/35 border-brand'
                            : 'bg-surface border-rule hover:border-brand/50'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-ink truncate">{campo.label}</div>
                          <div className="text-xs text-ink-muted flex items-center gap-2 flex-wrap">
                            <span>{tipoFriendly}</span>
                            {campo.categoriaMedica && (
                              <span className="text-brand font-bold">
                                · Filtrable en Salud/Cocina
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleUpdateCampoSchema(campo.key, { required: !campo.required });
                            }}
                            className={`px-2 py-0.5 rounded text-xs font-bold border cursor-pointer ${
                              campo.required
                                ? 's-badge-warn'
                                : 'bg-paper-2 text-ink-muted border-rule'
                            }`}
                          >
                            {campo.required ? 'Obligatoria' : 'Opcional'}
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              pedirConfirmacion(
                                {
                                  titulo: 'Eliminar pregunta',
                                  mensaje: `¿Eliminar la pregunta "${campo.label}"?`,
                                  impacto: 'Se quitará también su mapeo al PDF.',
                                  textoConfirmar: 'Eliminar',
                                },
                                () => handleEliminarCampo(campo.key),
                              );
                            }}
                            className="p-1.5 rounded text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                            aria-label={`Eliminar pregunta ${campo.label}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {campoActivoObj && (
                  <div className="s-card rounded-xl p-3.5 space-y-2.5 border-brand/40">
                    <Input
                      label="Texto de la pregunta seleccionada"
                      value={campoActivoObj.label}
                      onChange={(e) =>
                        handleUpdateCampoSchema(campoActivoObj.key, { label: e.target.value })
                      }
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <Select
                        label="Tipo de respuesta"
                        value={campoActivoObj.type}
                        onChange={(e) => {
                          const nextType = e.target.value;
                          handleUpdateCampoSchema(campoActivoObj.key, {
                            type: nextType,
                            options:
                              (nextType === 'select' || nextType === 'multiselect') &&
                              !campoActivoObj.options
                                ? []
                                : campoActivoObj.options,
                          });
                        }}
                      >
                        {TIPOS_CAMPO_OPCIONES.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                        {campoActivoObj.type === 'materiales_tabla' && (
                          <option value="materiales_tabla">Tabla de Materiales (Especial)</option>
                        )}
                      </Select>
                      <Select
                        label="Vincular con filtros"
                        value={campoActivoObj.categoriaMedica || ''}
                        onChange={(e) =>
                          handleUpdateCampoSchema(campoActivoObj.key, {
                            categoriaMedica: e.target.value || undefined,
                          })
                        }
                      >
                        {CATEGORIAS_MEDICAS_OPCIONES.map((cat) => (
                          <option key={cat.value} value={cat.value}>
                            {cat.label}
                          </option>
                        ))}
                      </Select>
                    </div>

                    {(campoActivoObj.type === 'select' ||
                      campoActivoObj.type === 'multiselect') && (
                      <div className="p-2.5 rounded-xl bg-paper-2 border border-rule space-y-2">
                        <span className="text-xs font-bold text-ink-2 block">
                          Opciones elegibles ({campoActivoObj.options?.length || 0})
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {(campoActivoObj.options || []).map((opt) => (
                            <span
                              key={opt.value}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-surface border border-rule text-xs font-semibold text-ink"
                            >
                              <span>{opt.label}</span>
                              <button
                                type="button"
                                onClick={() => handleEliminarOpcionCampoActivo(opt.value)}
                                className="text-rose-500 hover:text-rose-700 cursor-pointer"
                                aria-label={`Quitar opción ${opt.label}`}
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                        <div className="flex gap-1.5">
                          <Input
                            placeholder="Nueva opción (ej. Vegetariano)"
                            value={nuevaOpcionLabel}
                            onChange={(e) => setNuevaOpcionLabel(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAgregarOpcionCampoActivo();
                              }
                            }}
                            className="flex-1"
                          />
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={handleAgregarOpcionCampoActivo}
                            leftIcon={<Plus className="w-3.5 h-3.5" />}
                          >
                            Opción
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {seccionActiva && !esPdfAcroForm && (
                  <div className="pt-3 border-t border-rule space-y-2.5">
                    <span className="text-xs font-black text-ink block">+ Agregar pregunta</span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <Input
                        placeholder="Ej: ¿Tiene restricción de comidas?"
                        value={nuevoCampoLabel}
                        onChange={(e) => setNuevoCampoLabel(e.target.value)}
                      />
                      <Select
                        value={nuevoCampoType}
                        onChange={(e) => setNuevoCampoType(e.target.value)}
                      >
                        {TIPOS_CAMPO_OPCIONES.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </Select>
                    </div>
                    {(nuevoCampoType === 'select' || nuevoCampoType === 'multiselect') && (
                      <Input
                        placeholder="Opciones separadas por coma (ej. Vegetariano, Celíaco, Sin lactosa)"
                        value={nuevasOpcionesTexto}
                        onChange={(e) => setNuevasOpcionesTexto(e.target.value)}
                      />
                    )}
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={handleAgregarCampo}
                        leftIcon={<Plus className="w-3.5 h-3.5" />}
                      >
                        Agregar pregunta
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Columna Derecha: Vista Previa Real en Vivo del PDF */}
          <div className="lg:col-span-6 space-y-3 lg:sticky lg:top-2">
            <div className="s-panel rounded-xl p-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setVistaEnBlanco(false)}
                  className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-bold border cursor-pointer transition ${
                    !vistaEnBlanco ? 's-btn-brand border-brand' : 's-btn-sec text-ink-2'
                  }`}
                >
                  Con datos ejemplo
                </button>
                <button
                  aria-pressed={vistaEnBlanco}
                  type="button"
                  onClick={() => setVistaEnBlanco(true)}
                  className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-bold border cursor-pointer transition ${
                    vistaEnBlanco ? 's-btn-brand border-brand' : 's-btn-sec text-ink-2'
                  }`}
                >
                  En blanco (p/ imprimir)
                </button>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setPreviewNonce((n) => n + 1)}
                  title="Actualizar vista previa"
                  aria-label="Actualizar vista previa"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${cargandoPreview ? 'animate-spin' : ''}`} />
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={paginaActual <= 1 || cargandoPreview}
                  onClick={() => setPaginaActual((p) => Math.max(1, p - 1))}
                  aria-label="Página anterior"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-xs font-bold s-tabular px-1.5">
                  Hoja {paginaActual} / {Math.max(1, numPages)}
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={paginaActual >= numPages || cargandoPreview}
                  onClick={() => setPaginaActual((p) => Math.min(numPages, p + 1))}
                  aria-label="Página siguiente"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {errorPreview && (
              <div role="status" className="s-badge-warn rounded-xl p-3 text-[13px] font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{errorPreview}</span>
              </div>
            )}
            <div className="overflow-auto rounded-2xl border border-rule bg-paper-3 p-3 flex justify-center min-h-[460px] max-h-[75vh]">
              {cargandoPreview && !pdfDoc ? (
                <div className="flex flex-col items-center justify-center gap-2.5 text-ink-muted py-16">
                  <Loader2 className="w-6 h-6 animate-spin text-brand" />
                  <span className="text-sm font-semibold">Generando vista previa del PDF…</span>
                </div>
              ) : (
                <div className="relative inline-block border border-rule bg-white shadow-sm">
                  <canvas ref={canvasRef} className="block" />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Drawer>
    </>
  );
};
