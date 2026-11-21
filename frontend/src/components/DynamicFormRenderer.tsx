import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import {
  FileText,
  HeartPulse,
  ShieldCheck,
  Compass,
  Sparkles,
  UserCheck,
  Users,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Save,
  Download,
  AlertCircle,
  Plus,
  Check,
  Loader2,
  Tent,
  Hammer,
  Eye,
  Trash2,
  Info,
} from 'lucide-react';
import {
  MATERIALES_CAMPAMENTO,
  MATERIALES_CONSTRUCCION,
  obtenerCicloAnioActual,
} from '../lib/formatters';
import {
  CHIPS_RAPIDOS,
  DETALLE_POR_BOOLEAN,
  FAMILIAR_CORE_SUFFIXES,
  FAMILIAR_TABS,
  SELECTOR_POR_BOOLEAN,
  VACUNAS_TEXTO_KEYS,
  esCampoRequeridoEnEsquema,
  esCampoVisibleEnSeccion,
  evaluarEstadoFamiliar,
  limpiarDependenciasDesactivadas,
  normalizarValoresInicialesFormulario,
  obtenerNombreCortoSeccion,
  requiereResponsableFamiliar,
  validarSeccionFormulario,
  validarFormularioCompleto,
  type CampoSchema,
  type EsquemaCampos,
  type FamiliarTab,
  type MembreteDocumento,
  type SeccionSchema,
} from '../lib/formValidation';

export type { CampoSchema, EsquemaCampos, MembreteDocumento, SeccionSchema };

interface Props {
  esquema: EsquemaCampos;
  valoresIniciales?: Record<string, unknown>;
  onSubmit: (datos: Record<string, unknown>, finalizarParaFirma: boolean) => Promise<void>;
  onPreviewPdf?: (datosActuales: Record<string, unknown>) => void;
  cargando?: boolean;
  enDrawer?: boolean;
  onDirtyChange?: (isDirty: boolean) => void;
  datosExternosAAplicar?: { nonce: number; datos: Record<string, unknown> } | null;
  obtenerValoresRef?: React.MutableRefObject<(() => Record<string, unknown>) | null>;
}

const PASO_ICONOS: Record<string, React.ReactNode> = {
  seccion_inscripcion: <FileText className="w-4 h-4" />,
  seccion_salud: <HeartPulse className="w-4 h-4" />,
  seccion_autorizacion_ingreso: <ShieldCheck className="w-4 h-4" />,
  seccion_autorizacion_salidas: <Compass className="w-4 h-4" />,
  seccion_necesidades_especiales: <Sparkles className="w-4 h-4" />,
  seccion_retiro_menores: <UserCheck className="w-4 h-4" />,
  seccion_ficha_adultos: <Users className="w-4 h-4" />,
};

const PLACEHOLDERS_CAMPO: Record<string, string> = {
  protagonista_domicilio: 'Ej: Av. Colón 1234, B° Alberdi, Córdoba',
  protagonista_telefono: 'Ej: 3515123456',
  escolaridad_institucion: 'Ej: Colegio Juan XXIII',
  escolaridad_grado: 'Ej: 4° grado / 3er año',
  obra_social: 'Ej: APROSS / OSDE / Sin cobertura',
  obra_social_afiliado: 'N° de credencial',
  tel_emergencia_1: 'Ej: 3515123456',
  tel_emergencia_2: 'Teléfono alternativo',
  vacuna_quintuple: 'dd/mm/aaaa',
  vacuna_triple_celular: 'dd/mm/aaaa',
  vacuna_triple_acelular: 'dd/mm/aaaa',
  vacuna_doble_bacteriana: 'dd/mm/aaaa',
  peso_kg: 'Ej: 52 o 52.5',
  talla_m: 'Ej: 1.58 (en metros)',
  autorizante_nombre: 'Nombre y apellido completo',
  autorizante_dni: 'Solo números, sin puntos',
  autorizante_telefono: 'Ej: 3515123456',
  adulto_codigo_postal: 'Ej: 5000',
};

const SALUD_GRUPOS: Array<{ id: string; titulo: string; subtitulo?: string; keys: string[] }> = [
  {
    id: 'emergencias',
    titulo: 'Emergencias, cobertura y control médico',
    keys: [
      'protagonista_domicilio',
      'tel_emergencia_1',
      'tel_emergencia_2',
      'obra_social',
      'obra_social_afiliado',
      'tel_emergencia_obra_social',
      'fecha_control_medico',
    ],
  },
  {
    id: 'vacunas',
    titulo: 'Vacunación',
    subtitulo: 'Indicá la fecha de última dosis o marcá si no corresponde.',
    keys: [
      'vacuna_quintuple',
      'vacuna_triple_celular',
      'vacuna_triple_acelular',
      'vacuna_doble_bacteriana',
      'no_tiene_vacunas_mencionadas',
      'no_sabe_vacunas',
    ],
  },
  {
    id: 'antecedentes',
    titulo: 'Antecedentes médicos, alimentación y salud mental',
    keys: [
      'toma_medicacion',
      'medicacion_tipos',
      'toma_medicacion_detalle',
      'enfermedad_cronica',
      'condiciones_medicas_tipos',
      'enfermedad_cronica_detalle',
      'requiere_tratamiento',
      'requiere_tratamiento_detalle',
      'tiene_cud',
      'sufre_alergia',
      'alergias_tipos',
      'sufre_alergia_detalle',
      'esta_anticoagulado',
      'anticoagulado_droga',
      'regimen_dietario',
      'regimen_dietario_tipos',
      'regimen_dietario_detalle',
      'ataques_panico_ansiedad',
      'ataques_panico_frecuencia',
      'diagnostico_salud_mental',
      'diagnostico_salud_mental_detalle',
      'recibe_tratamiento_salud_mental',
      'recibe_tratamiento_salud_mental_detalle',
      'miedo_fobia_excesivo',
      'miedo_fobia_detalle',
    ],
  },
  {
    id: 'situaciones',
    titulo: 'Situaciones clínicas y actividad física',
    keys: [
      'sit_hemorragias_nasales',
      'sit_sangrado_encias',
      'sit_dolor_cabeza',
      'sit_presion_alta',
      'sit_presion_baja',
      'sit_transfusiones',
      'sit_convulsiones',
      'sit_cirugias_ultimo_anio',
      'sit_internaciones_ultimo_anio',
      'sit_actividad_fisica',
      'sit_cualquier_actividad_fisica',
      'sit_actividad_fisica_no_especifique',
    ],
  },
  {
    id: 'biometria',
    titulo: 'Datos biométricos y aviso a educadores',
    keys: [
      'grupo_sanguineo',
      'factor_rh',
      'peso_kg',
      'talla_m',
      'comunicacion_educador_necesaria',
    ],
  },
];

const SALUD_CLAVES_CONOCIDAS = new Set(SALUD_GRUPOS.flatMap((g) => g.keys));

function interpolarTextoLegalPreview(
  plantillaTexto: string,
  datos: Record<string, unknown>,
): string {
  const resolver = (rawKey: string): unknown => {
    const k = rawKey.trim();
    if (k in datos && datos[k] !== undefined && datos[k] !== '') return datos[k];
    if (k === 'nombre_completo' || k === 'protagonista_nombre_completo') {
      const a = String(datos.protagonista_apellido || '').trim();
      const n = String(datos.protagonista_nombre || '').trim();
      if (a || n) return `${a}${a && n ? ', ' : ''}${n}`;
    }
    if (k === 'dni' || k === 'protagonista_dni') return datos.protagonista_dni;
    if (k === 'rama' || k === 'rama_nombre') return datos.rama_nombre;
    if (k === 'domicilio') return datos.protagonista_domicilio || datos.domicilio;
    if (k === 'ciclo_anio') return String(obtenerCicloAnioActual());
    if (k === 'fecha_actual') {
      const hoy = new Date();
      return `${String(hoy.getDate()).padStart(2, '0')}/${String(hoy.getMonth() + 1).padStart(2, '0')}/${hoy.getFullYear()}`;
    }
    return undefined;
  };

  return plantillaTexto.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, rawKey: string) => {
    const val = resolver(rawKey);
    if (Array.isArray(val)) return val.length > 0 ? val.join(', ') : `[${rawKey.trim()}]`;
    if (typeof val === 'boolean') return val ? 'SÍ' : 'NO';
    const str = String(val ?? '').trim();
    return str || `[${rawKey.trim()}]`;
  });
}

function obtenerPlaceholderCampo(campo: CampoSchema): string | undefined {
  if (PLACEHOLDERS_CAMPO[campo.key]) return PLACEHOLDERS_CAMPO[campo.key];
  if (campo.key.endsWith('_dni')) return 'Solo números, sin puntos';
  if (campo.key.endsWith('_email')) return 'ejemplo@correo.com';
  if (campo.key.endsWith('_telefono') || campo.type === 'tel') return 'Ej: 3515123456';
  return undefined;
}

export const DynamicFormRenderer: React.FC<Props> = ({
  esquema,
  valoresIniciales = {},
  onSubmit,
  onPreviewPdf,
  cargando = false,
  enDrawer = false,
  onDirtyChange,
  datosExternosAAplicar,
  obtenerValoresRef,
}) => {
  const [pasoActivo, setPasoActivo] = useState(0);
  const [familiarTab, setFamiliarTab] = useState<FamiliarTab>('madre');
  const [catMateriales, setCatMateriales] = useState<'construccion' | 'campamento'>('campamento');
  const [errorValidacion, setErrorValidacion] = useState<string | null>(null);
  const [pasosConError, setPasosConError] = useState<number[]>([]);
  const formTopRef = useRef<HTMLDivElement>(null);

  const valoresInicialesNormalizados = useMemo(
    () => normalizarValoresInicialesFormulario(esquema, valoresIniciales),
    [esquema, valoresIniciales],
  );

  const {
    register,
    control,
    getValues,
    setValue,
    setError,
    clearErrors,
    reset,
    formState: { errors, isDirty },
  } = useForm<Record<string, unknown>>({
    defaultValues: valoresInicialesNormalizados,
    shouldFocusError: false,
  });

  const watchedValues = useWatch({ control });
  const formData = useMemo(
    () => ({ ...valoresInicialesNormalizados, ...(watchedValues || {}) }) as Record<string, unknown>,
    [valoresInicialesNormalizados, watchedValues],
  );

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const obtenerValoresLimpios = useCallback(
    () => limpiarDependenciasDesactivadas(esquema, getValues() as Record<string, unknown>),
    [esquema, getValues],
  );

  useEffect(() => {
    if (!obtenerValoresRef) return;
    obtenerValoresRef.current = obtenerValoresLimpios;
    return () => {
      obtenerValoresRef.current = null;
    };
  }, [obtenerValoresRef, obtenerValoresLimpios]);

  // Aplicar datos externos (ej. "Copiar datos de hermano") sin remontar el componente ni perder avances
  const lastAppliedNonceRef = useRef<number | null>(null);
  useEffect(() => {
    if (!datosExternosAAplicar || datosExternosAAplicar.nonce === lastAppliedNonceRef.current) {
      return;
    }
    lastAppliedNonceRef.current = datosExternosAAplicar.nonce;
    const entries = Object.entries(datosExternosAAplicar.datos || {});
    for (const [key, val] of entries) {
      setValue(key, val, { shouldDirty: true, shouldValidate: false });
    }
    if (entries.length > 0) {
      clearErrors(entries.map(([k]) => k));
    }
  }, [datosExternosAAplicar, setValue, clearErrors]);

  // Cantidad de personas autorizadas visibles en Paso 6 (Retiro)
  const [personasRetiroVisibles, setPersonasRetiroVisibles] = useState<number>(() => {
    if (valoresIniciales.ret_persona3_nombre) return 3;
    if (valoresIniciales.ret_persona2_nombre) return 2;
    return 1;
  });

  const secciones = esquema.secciones || [];
  const seccionActual = secciones[pasoActivo] || secciones[0];

  // Mapa rápido de campos de la sección actual por key
  const camposPorKey = useMemo(() => {
    const map = new Map<string, CampoSchema>();
    seccionActual?.campos.forEach((c) => map.set(c.key, c));
    return map;
  }, [seccionActual]);

  // Prellenado del Adulto Autorizante en Paso 3 sin mezclar datos residuales entre Madre/Padre/Tutor
  const autorizanteTipo = formData.autorizante_tipo;
  const prevAutorizanteTipoRef = useRef<unknown>(valoresInicialesNormalizados.autorizante_tipo);
  const prevAutoSyncAutorizanteRef = useRef<{
    prefix: FamiliarTab;
    nombre: string;
    dni: string;
    telefono: string;
    domicilio: string;
  } | null>(null);

  const aplicarFamiliarEnAutorizante = useCallback(
    (prefix: FamiliarTab, currentValues: Record<string, unknown>, markDirty: boolean) => {
      const mapCaract: Record<FamiliarTab, string> = {
        madre: 'Madre',
        padre: 'Padre',
        tutor: 'Tutor judicial',
      };
      const str = (v: unknown) => (v !== undefined && v !== null ? String(v) : '');
      const nombre = str(currentValues[`${prefix}_nombres`]);
      const dni = str(currentValues[`${prefix}_dni`]);
      const telefono = str(currentValues[`${prefix}_telefono`]);
      const domicilio = str(currentValues[`${prefix}_domicilio`]);

      setValue('autorizante_nombre', nombre, { shouldDirty: markDirty });
      setValue('autorizante_dni', dni, { shouldDirty: markDirty });
      setValue('autorizante_telefono', telefono, { shouldDirty: markDirty });
      setValue('autorizante_domicilio', domicilio, { shouldDirty: markDirty });
      setValue('autorizante_caracter', mapCaract[prefix], { shouldDirty: markDirty });
      if (!currentValues.autorizante_nacionalidad) {
        setValue('autorizante_nacionalidad', 'Argentina', { shouldDirty: markDirty });
      }
      if (!currentValues.menor_nacionalidad) {
        setValue('menor_nacionalidad', 'Argentina', { shouldDirty: markDirty });
      }
      clearErrors([
        'autorizante_nombre',
        'autorizante_dni',
        'autorizante_telefono',
        'autorizante_domicilio',
        'autorizante_caracter',
      ]);
      prevAutoSyncAutorizanteRef.current = { prefix, nombre, dni, telefono, domicilio };
    },
    [setValue, clearErrors],
  );

  useEffect(() => {
    if (!autorizanteTipo || prevAutorizanteTipoRef.current === autorizanteTipo) {
      prevAutorizanteTipoRef.current = autorizanteTipo;
      return;
    }
    prevAutorizanteTipoRef.current = autorizanteTipo;
    const prefix = String(autorizanteTipo) as FamiliarTab;
    if (!FAMILIAR_TABS.includes(prefix)) return;
    aplicarFamiliarEnAutorizante(prefix, getValues() as Record<string, unknown>, true);
  }, [autorizanteTipo, getValues, aplicarFamiliarEnAutorizante]);

  // Al entrar al Paso 3: autoseleccionar primer responsable si está vacío, o sincronizar si fue corregido en Paso 1
  useEffect(() => {
    if (seccionActual?.id !== 'seccion_autorizacion_ingreso') return;
    const currentValues = getValues() as Record<string, unknown>;
    const tipoActual = currentValues.autorizante_tipo as FamiliarTab | undefined;

    if (!tipoActual && !String(currentValues.autorizante_nombre ?? '').trim()) {
      const candidato =
        FAMILIAR_TABS.find((t) => evaluarEstadoFamiliar(currentValues, t).estado === 'completo') ||
        FAMILIAR_TABS.find((t) => String(currentValues[`${t}_nombres`] ?? '').trim() !== '');
      if (candidato) {
        prevAutorizanteTipoRef.current = candidato;
        setValue('autorizante_tipo', candidato, { shouldDirty: false });
        aplicarFamiliarEnAutorizante(candidato, currentValues, false);
      }
      return;
    }

    if (tipoActual && FAMILIAR_TABS.includes(tipoActual)) {
      const prev = prevAutoSyncAutorizanteRef.current;
      const srcNombre = String(currentValues[`${tipoActual}_nombres`] ?? '');
      const srcDni = String(currentValues[`${tipoActual}_dni`] ?? '');
      const srcTel = String(currentValues[`${tipoActual}_telefono`] ?? '');
      const srcDom = String(currentValues[`${tipoActual}_domicilio`] ?? '');

      if (prev && prev.prefix === tipoActual) {
        if (String(currentValues.autorizante_nombre ?? '') === prev.nombre && srcNombre !== prev.nombre) {
          setValue('autorizante_nombre', srcNombre, { shouldDirty: true });
        }
        if (String(currentValues.autorizante_dni ?? '') === prev.dni && srcDni !== prev.dni) {
          setValue('autorizante_dni', srcDni, { shouldDirty: true });
        }
        if (String(currentValues.autorizante_telefono ?? '') === prev.telefono && srcTel !== prev.telefono) {
          setValue('autorizante_telefono', srcTel, { shouldDirty: true });
        }
        if (String(currentValues.autorizante_domicilio ?? '') === prev.domicilio && srcDom !== prev.domicilio) {
          setValue('autorizante_domicilio', srcDom, { shouldDirty: true });
        }
        prevAutoSyncAutorizanteRef.current = {
          prefix: tipoActual,
          nombre: srcNombre,
          dni: srcDni,
          telefono: srcTel,
          domicilio: srcDom,
        };
      }
    }
  }, [seccionActual?.id, getValues, setValue, aplicarFamiliarEnAutorizante]);

  // Copiar/mantener domicilio sincronizado cuando el familiar marca que convive en el mismo hogar
  const protagonistaDomicilio = formData.protagonista_domicilio;
  const madreConvive = formData.madre_convive;
  const padreConvive = formData.padre_convive;
  const tutorConvive = formData.tutor_convive;
  const prevProtagonistaDomRef = useRef<unknown>(valoresInicialesNormalizados.protagonista_domicilio);

  useEffect(() => {
    const domStr = String(protagonistaDomicilio ?? '').trim();
    const prevDomStr = String(prevProtagonistaDomRef.current ?? '').trim();
    if (!domStr) {
      prevProtagonistaDomRef.current = protagonistaDomicilio;
      return;
    }

    const current = getValues() as Record<string, unknown>;
    const pares: Array<{ prefix: FamiliarTab; convive: unknown }> = [
      { prefix: 'madre', convive: madreConvive },
      { prefix: 'padre', convive: padreConvive },
      { prefix: 'tutor', convive: tutorConvive },
    ];

    for (const { prefix, convive } of pares) {
      if (convive === true) {
        const key = `${prefix}_domicilio`;
        const famDom = String(current[key] ?? '').trim();
        if (!famDom || famDom === prevDomStr) {
          setValue(key, protagonistaDomicilio, { shouldDirty: true });
          clearErrors(key);
        }
      }
    }

    prevProtagonistaDomRef.current = protagonistaDomicilio;
  }, [madreConvive, padreConvive, tutorConvive, protagonistaDomicilio, getValues, setValue, clearErrors]);

  const esVisibleCampo = (campo: CampoSchema): boolean =>
    esCampoVisibleEnSeccion(campo, seccionActual, formData);

  const esRequeridoCampo = (campo: CampoSchema): boolean =>
    esCampoRequeridoEnEsquema(esquema, seccionActual, campo, formData);

  const irAPaso = (index: number, opts?: { preservarError?: boolean }) => {
    if (index >= 0 && index < secciones.length) {
      setPasoActivo(index);
      if (!opts?.preservarError) {
        setErrorValidacion(null);
      }
      formTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const actualizarCampo = (key: string, value: unknown, markDirty = true) => {
    setValue(key, value, { shouldDirty: markDirty, shouldValidate: false });
    if (errors[key]) {
      clearErrors(key);
    }
  };

  const handleGuardarBorrador = async () => {
    setErrorValidacion(null);
    const datosLimpios = obtenerValoresLimpios();
    await onSubmit(datosLimpios, false);
    reset(datosLimpios, { keepValues: true });
  };

  const handlePreviewPdf = () => {
    if (!onPreviewPdf) return;
    onPreviewPdf(obtenerValoresLimpios());
  };

  const aplicarResultadoValidacion = (res: ReturnType<typeof validarSeccionFormulario>) => {
    clearErrors();
    for (const [k, msg] of Object.entries(res.errores)) {
      setError(k, { type: 'manual', message: msg });
    }
    setPasosConError(res.pasosConError);
    if (res.tabFamiliarSugerida) {
      setFamiliarTab(res.tabFamiliarSugerida);
    }
    if (res.primeraClaveError?.startsWith('ret_persona3_')) {
      setPersonasRetiroVisibles((n) => Math.max(n, 3));
    } else if (res.primeraClaveError?.startsWith('ret_persona2_')) {
      setPersonasRetiroVisibles((n) => Math.max(n, 2));
    }
    if (res.primeraClaveError) {
      const clave = res.primeraClaveError;
      setTimeout(() => {
        const el = document.getElementById(clave) ?? document.querySelector<HTMLElement>('[aria-describedby="' + clave + '-error"]');
        el?.focus({ preventScroll: false });
      }, 80);
    }
    setErrorValidacion(
      res.mensajeResumen || 'Completá los campos obligatorios marcados con * antes de continuar.',
    );
  };

  const handleSiguientePaso = () => {
    const datos = getValues() as Record<string, unknown>;
    const res = validarSeccionFormulario(esquema, seccionActual, datos, pasoActivo);
    if (!res.valido) {
      aplicarResultadoValidacion(res);
      formTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    clearErrors();
    setPasosConError((prev) => prev.filter((p) => p !== pasoActivo));
    irAPaso(pasoActivo + 1);
  };

  const handleFinalizarFirma = async () => {
    const datos = getValues() as Record<string, unknown>;
    const res = validarFormularioCompleto(esquema, datos);
    if (!res.valido) {
      aplicarResultadoValidacion(res);
      if (res.primerPasoConError !== -1 && res.primerPasoConError !== pasoActivo) {
        irAPaso(res.primerPasoConError, { preservarError: true });
      } else {
        formTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      return;
    }

    clearErrors();
    setPasosConError([]);
    setErrorValidacion(null);
    const datosLimpios = limpiarDependenciasDesactivadas(esquema, datos);
    await onSubmit(datosLimpios, true);
    reset(datosLimpios, { keepValues: true });
  };

  // Limpia prefijos repetitivos en etiquetas agrupadas
  const limpiarLabel = (label: string) =>
    label
      .replace(/^(Madre|Padre|Tutor):\s*/i, '')
      .replace(/^Persona \d+( autorizada a retirar)?:\s*/i, '');

  const tieneAlgunFamiliarCompleto = useMemo(
    () => FAMILIAR_TABS.some((t) => evaluarEstadoFamiliar(formData, t).estado === 'completo'),
    [formData],
  );

  const vacunasBloqueadas = Boolean(
    formData.no_tiene_vacunas_mencionadas || formData.no_sabe_vacunas,
  );

  // Renderizador individual de un campo optimizado para el pulgar
  const renderCampo = (campo: CampoSchema, opts?: { esFamiliarCore?: boolean }) => {
    const error = errors[campo.key]?.message as string | undefined;
    const errorId = `${campo.key}-error`;
    const esRequerido = esRequeridoCampo(campo) || Boolean(opts?.esFamiliarCore);
    const labelLimpio = limpiarLabel(campo.label);

    // 0. Selector Múltiple por Chips (multiselect)
    if (campo.type === 'multiselect') {
      const opciones = campo.options || [];
      const seleccionados = Array.isArray(formData[campo.key])
        ? (formData[campo.key] as unknown[]).map((x) => String(x))
        : [];

      return (
        <div key={campo.key} className="space-y-2 md:col-span-2">
          <label className="block text-sm font-bold text-ink-2">
            {labelLimpio}{' '}
            {esRequerido && <span aria-hidden="true" className="text-rose-600 dark:text-rose-400">*</span>}
          </label>
          {opciones.length === 0 ? (
            <p className="text-xs text-ink-muted">Sin opciones configuradas para este selector.</p>
          ) : (
            <div className="flex flex-wrap gap-2" role="group" aria-label={labelLimpio} aria-invalid={error ? "true" : undefined} aria-describedby={error ? errorId : undefined}>
              {opciones.map((opt) => {
                const activo = seleccionados.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    aria-pressed={activo}
                    onClick={() => {
                      const next = activo
                        ? seleccionados.filter((v) => v !== opt.value)
                        : [...seleccionados, opt.value];
                      actualizarCampo(campo.key, next);
                    }}
                    className={`min-h-[44px] px-3.5 py-2 rounded-xl font-bold text-[13px] transition flex items-center gap-1.5 cursor-pointer border ${
                      activo
                        ? 'bg-brand text-brand-contrast border-brand'
                        : error
                          ? 'bg-paper-2 text-ink-2 border-rose-500/70 hover:border-rose-600'
                          : 'bg-paper-2 text-ink-2 border-rule-strong hover:border-brand/70 hover:bg-surface'
                    }`}
                  >
                    {activo && <Check className="w-4 h-4 stroke-[3]" />}
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          )}
          {error && (
            <p id={errorId} role="alert" className="text-[13px] font-bold text-rose-700 dark:text-rose-400">
              {error}
            </p>
          )}
        </div>
      );
    }

    // 1. Selector Rápido por Chips (Reemplaza <select> y campos como Grupo Sanguíneo / Factor RH)
    const opcionesChips = campo.options || CHIPS_RAPIDOS[campo.key];
    if (opcionesChips) {
      const valorActual = String(formData[campo.key] || '');
      return (
        <div key={campo.key} className="space-y-1.5">
          <label className="block text-sm font-bold text-ink-2">
            {labelLimpio}{' '}
            {esRequerido && <span aria-hidden="true" className="text-rose-600 dark:text-rose-400">*</span>}
          </label>
          <div className="flex flex-wrap gap-2" role="group" aria-label={labelLimpio} aria-invalid={error ? "true" : undefined} aria-describedby={error ? errorId : undefined}>
            {opcionesChips.map((opt) => {
              const activo = valorActual === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  aria-pressed={activo}
                  onClick={() => actualizarCampo(campo.key, opt.value)}
                  className={`flex-1 min-w-[82px] min-h-[46px] px-3.5 py-2 rounded-xl font-bold text-[13px] transition flex items-center justify-center gap-1.5 cursor-pointer border ${
                    activo
                      ? 'bg-brand text-brand-contrast border-brand font-bold'
                      : error
                        ? 'bg-paper-2 text-ink-2 border-rose-500/70 hover:border-rose-600'
                        : 'bg-paper-2 text-ink-2 border-rule-strong hover:border-brand/70 hover:bg-surface'
                  }`}
                >
                  {activo && <Check className="w-4 h-4 stroke-[3]" />}
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>
          {error && (
            <p id={errorId} role="alert" className="text-[13px] font-bold text-rose-700 dark:text-rose-400">
              {error}
            </p>
          )}
        </div>
      );
    }

    // 2. Interruptor Táctil (Switch Card) + Selector de Chips + Campo de Detalle integrado cuando está activo
    if (campo.type === 'boolean') {
      const isChecked = Boolean(formData[campo.key]);
      const campoMultiselectSchema = seccionActual?.campos.find(
        (c) => c.esDetalleDe === campo.key && c.type === 'multiselect',
      );
      const selectorFallback = SELECTOR_POR_BOOLEAN[campo.key];
      const selectorKey = campoMultiselectSchema?.key || selectorFallback?.key;
      const selectorTitulo = campoMultiselectSchema?.label || selectorFallback?.titulo;
      const selectorOpciones =
        campoMultiselectSchema?.options && campoMultiselectSchema.options.length > 0
          ? campoMultiselectSchema.options
          : selectorFallback?.opciones || [];
      const seleccionadosIntegrados =
        selectorKey && Array.isArray(formData[selectorKey])
          ? (formData[selectorKey] as unknown[]).map((x) => String(x))
          : [];

      const detalleKey = campo.detalleKey || DETALLE_POR_BOOLEAN[campo.key];
      const campoDetalle =
        seccionActual?.campos.find(
          (c) => c.esDetalleDe === campo.key && c.type !== 'multiselect',
        ) || (detalleKey ? camposPorKey.get(detalleKey) : undefined);

      const tieneContenidoExpandible =
        Boolean(selectorKey && selectorOpciones.length > 0) ||
        Boolean(campoDetalle) ||
        campo.key === 'confirma_autorizacion_salidas' ||
        campo.key === 'completar_ficha_adultos' ||
        campo.key === 'ret_autoriza_retirarse_solo';

      const handleToggleSwitch = () => {
        const next = !isChecked;
        actualizarCampo(campo.key, next);
        if (next && campo.key === 'no_tiene_vacunas_mencionadas') {
          actualizarCampo('no_sabe_vacunas', false);
        } else if (next && campo.key === 'no_sabe_vacunas') {
          actualizarCampo('no_tiene_vacunas_mencionadas', false);
        }
      };

      const detalleError = campoDetalle
        ? (errors[campoDetalle.key]?.message as string | undefined)
        : undefined;

      return (
        <div
          key={campo.key}
          className={`rounded-2xl border transition-colors ${
            tieneContenidoExpandible ? 'md:col-span-2' : ''
          } ${
            error
              ? 'bg-rose-50/70 dark:bg-rose-950/30 border-rose-600 dark:border-rose-400'
              : isChecked
                ? 'bg-brand/12 border-brand/50'
                : 'bg-paper-2 border-rule-strong'
          }`}
        >
          <button
            type="button"
            id={campo.key}
            role="switch"
            aria-checked={isChecked}
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={error ? errorId : undefined}
            onClick={handleToggleSwitch}
            className="w-full min-h-[54px] px-4 py-3.5 flex items-center justify-between gap-3 text-left cursor-pointer"
          >
            <span className="text-sm sm:text-[15px] font-bold text-ink leading-snug">
              {labelLimpio}{' '}
              {esRequerido && <span aria-hidden="true" className="text-rose-600 dark:text-rose-400">*</span>}
            </span>

            <span
              className={`shrink-0 inline-flex items-center w-14 h-8 rounded-full p-1 transition-colors ${
                isChecked
                  ? 'bg-brand justify-end'
                  : 'bg-zinc-400/75 dark:bg-zinc-600 justify-start'
              }`}
            >
              <span className="w-6 h-6 rounded-full bg-white shadow-xs flex items-center justify-center text-xs font-extrabold text-[#18181b]">
                {isChecked ? 'SÍ' : 'NO'}
              </span>
            </span>
          </button>

          {error && (
            <p
              id={errorId}
              role="alert"
              className="px-4 pb-3 text-[13px] font-bold text-rose-700 dark:text-rose-400"
            >
              {error}
            </p>
          )}

          {isChecked && ((selectorKey && selectorOpciones.length > 0) || campoDetalle) && (
            <div className="px-4 pb-4 pt-2.5 border-t border-brand/30 space-y-3">
              {selectorKey && selectorOpciones.length > 0 && (
                <div className="space-y-1.5">
                  <span className="block text-xs font-bold text-ink-2">
                    {selectorTitulo}
                  </span>
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label={selectorTitulo}>
                    {selectorOpciones.map((opt) => {
                      const activo = seleccionadosIntegrados.includes(opt.value);
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          aria-pressed={activo}
                          onClick={() => {
                            const next = activo
                              ? seleccionadosIntegrados.filter((v) => v !== opt.value)
                              : [...seleccionadosIntegrados, opt.value];
                            actualizarCampo(selectorKey, next);
                          }}
                          className={`min-h-[38px] px-3 py-1.5 rounded-xl font-bold text-xs transition flex items-center gap-1.5 cursor-pointer border ${
                            activo
                              ? 'bg-brand text-brand-contrast border-brand'
                              : 'bg-surface text-ink-2 border-rule-strong hover:border-brand/60'
                          }`}
                        >
                          {activo && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                          <span>{opt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {campoDetalle && (
                <div className="space-y-1">
                  <input
                    type={campoDetalle.type === 'tel' ? 'tel' : campoDetalle.type === 'email' ? 'email' : 'text'}
                    id={campoDetalle.key}
                    aria-label={campoDetalle.label}
                    aria-invalid={detalleError ? 'true' : undefined}
                    placeholder={`${campoDetalle.label}...`}
                    {...register(campoDetalle.key, {
                      onChange: () => {
                        if (errors[campoDetalle.key]) clearErrors(campoDetalle.key);
                      },
                    })}
                    className={`w-full min-h-[46px] px-3.5 py-2.5 bg-surface border rounded-xl text-base sm:text-[15px] text-ink focus:outline-none focus:ring-2 ${
                      detalleError
                        ? 'border-rose-600 dark:border-rose-400 focus:ring-rose-500/25'
                        : 'border-brand/50 focus:ring-brand'
                    }`}
                  />
                  {detalleError && (
                    <p role="alert" className="text-[13px] font-bold text-rose-700 dark:text-rose-400">
                      {detalleError}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      );
    }

    // 3. Tarjetas Compactas de Materiales con Chips Táctiles (Prestar / Donar)
    if (campo.type === 'materiales_tabla') {
      const lista =
        catMateriales === 'construccion' ? MATERIALES_CONSTRUCCION : MATERIALES_CAMPAMENTO;

      const contarActivos = (items: ReadonlyArray<{ key: string }>) =>
        items.filter(
          (it) => Boolean(formData[`mat_${it.key}_prestamo`]) || Boolean(formData[`mat_${it.key}_donacion`]),
        ).length;

      const countCamp = contarActivos(MATERIALES_CAMPAMENTO);
      const countConst = contarActivos(MATERIALES_CONSTRUCCION);

      return (
        <div key={campo.key} className="md:col-span-2 space-y-3 pt-1">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-sm font-semibold text-ink-2">
              Materiales para Prestar o Donar
            </span>
            <div
              role="tablist"
              aria-label="Categoría de materiales"
              className="flex bg-paper-3 p-1 rounded-xl border border-rule"
            >
              <button
                type="button"
                role="tab"
                aria-selected={catMateriales === 'campamento'}
                onClick={() => setCatMateriales('campamento')}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-[13px] font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                  catMateriales === 'campamento'
                    ? 'bg-surface text-brand-ink shadow-xs'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                <Tent className="w-4 h-4 shrink-0" />
                <span>Campamento{countCamp > 0 ? ` (${countCamp})` : ''}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={catMateriales === 'construccion'}
                onClick={() => setCatMateriales('construccion')}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-[13px] font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                  catMateriales === 'construccion'
                    ? 'bg-surface text-brand-ink shadow-xs'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                <Hammer className="w-4 h-4 shrink-0" />
                <span>Construcción{countConst > 0 ? ` (${countConst})` : ''}</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {lista.map((item) => {
              const preKey = `mat_${item.key}_prestamo`;
              const donKey = `mat_${item.key}_donacion`;
              const isPre = Boolean(formData[preKey]);
              const isDon = Boolean(formData[donKey]);

              return (
                <div
                  key={item.key}
                  className={`p-3 rounded-xl border flex flex-wrap items-center justify-between gap-2 transition ${
                    isPre || isDon
                      ? 'bg-brand/10 border-brand/50'
                      : 'bg-surface border-rule-strong'
                  }`}
                >
                  <span className="text-[13px] font-bold text-ink leading-snug">
                    {item.label}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                    <button
                      type="button"
                      aria-pressed={isPre}
                      onClick={() => actualizarCampo(preKey, !isPre)}
                      className={`min-h-[38px] px-3 rounded-lg text-xs font-bold transition cursor-pointer border ${
                        isPre
                          ? 'bg-brand text-brand-contrast border-brand'
                          : 'bg-paper-2 text-ink-2 border-rule-strong hover:border-brand/60'
                      }`}
                    >
                      Prestar
                    </button>
                    <button
                      type="button"
                      aria-pressed={isDon}
                      onClick={() => actualizarCampo(donKey, !isDon)}
                      className={`min-h-[38px] px-3 rounded-lg text-xs font-bold transition cursor-pointer border ${
                        isDon
                          ? 'bg-brand text-brand-contrast border-brand font-bold'
                          : 'bg-paper-2 text-ink-2 border-rule-strong hover:border-brand/60'
                      }`}
                    >
                      Donar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    // 4. Textarea compacto
    if (campo.type === 'textarea') {
      return (
        <div key={campo.key} className="space-y-1.5 md:col-span-2">
          <label htmlFor={campo.key} className="block text-sm font-bold text-ink-2">
            {labelLimpio}{' '}
            {esRequerido && <span aria-hidden="true" className="text-rose-600 dark:text-rose-400">*</span>}
          </label>
          <textarea
            id={campo.key}
            rows={2}
            aria-invalid={error ? 'true' : undefined}
            aria-required={esRequerido || undefined}
            aria-describedby={error ? errorId : undefined}
            placeholder={obtenerPlaceholderCampo(campo)}
            {...register(campo.key, {
              onChange: () => {
                if (errors[campo.key]) clearErrors(campo.key);
              },
            })}
            className={`w-full px-3.5 py-2.5 bg-surface border rounded-xl text-base sm:text-[15px] text-ink placeholder:text-ink-muted focus:ring-2 outline-none transition-colors ${
              error
                ? 'border-rose-600 dark:border-rose-400 focus:border-rose-600 focus:ring-rose-500/25'
                : 'border-rule-strong focus:border-brand focus:ring-brand/20'
            }`}
          />
          {error && (
            <p id={errorId} role="alert" className="text-[13px] font-bold text-rose-700 dark:text-rose-400">
              {error}
            </p>
          )}
        </div>
      );
    }

    // 5. Input estándar con teclado móvil adecuado (numeric/decimal/tel/email/date)
    const esVacunaTexto = (VACUNAS_TEXTO_KEYS as readonly string[]).includes(campo.key);
    const deshabilitado = esVacunaTexto && vacunasBloqueadas;
    const inputModeCampo: React.HTMLAttributes<HTMLInputElement>['inputMode'] =
      campo.type === 'tel'
        ? 'tel'
        : campo.type === 'email'
          ? 'email'
          : campo.key.includes('dni')
            ? 'numeric'
            : campo.key === 'peso_kg' || campo.key === 'talla_m'
              ? 'decimal'
              : undefined;

    return (
      <div key={campo.key} className="space-y-1.5">
        <label htmlFor={campo.key} className="block text-sm font-bold text-ink-2">
          {labelLimpio}{' '}
          {esRequerido && <span aria-hidden="true" className="text-rose-600 dark:text-rose-400">*</span>}
        </label>
        <input
          type={campo.type || 'text'}
          id={campo.key}
          disabled={deshabilitado}
          inputMode={inputModeCampo}
          aria-invalid={error ? 'true' : undefined}
            aria-required={esRequerido || undefined}
          aria-describedby={error ? errorId : undefined}
          placeholder={obtenerPlaceholderCampo(campo)}
          {...register(campo.key, {
            onChange: () => {
              if (errors[campo.key]) clearErrors(campo.key);
            },
          })}
          className={`w-full min-h-[46px] px-3.5 py-2 border rounded-xl text-base sm:text-[15px] text-ink placeholder:text-ink-muted focus:ring-2 outline-none transition-colors ${
            deshabilitado
              ? 'bg-paper-2 border-rule opacity-55 cursor-not-allowed'
              : error
                ? 'bg-surface border-rose-600 dark:border-rose-400 focus:border-rose-600 focus:ring-rose-500/25'
                : 'bg-surface border-rule-strong focus:border-brand focus:ring-brand/20'
          }`}
        />
        {error && (
          <p id={errorId} role="alert" className="text-[13px] font-bold text-rose-700 dark:text-rose-400">
            {error}
          </p>
        )}
      </div>
    );
  };

  // Filtrado inteligente de campos por paso para reducir scroll en móvil
  const renderContenidoSeccion = () => {
    if (!seccionActual) return null;

    // PASO 1: Separar datos del protagonista y pestañas Madre / Padre / Tutor
    if (seccionActual.id === 'seccion_inscripcion') {
      const camposProtagonista = seccionActual.campos.filter(
        (c) =>
          !c.key.startsWith('madre_') &&
          !c.key.startsWith('padre_') &&
          !c.key.startsWith('tutor_') &&
          esVisibleCampo(c),
      );
      const exigeAlgunAdulto = requiereResponsableFamiliar(esquema, seccionActual);

      return (
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {camposProtagonista.map((c) => renderCampo(c))}
          </div>

          {/* Selector de Familiares por Pestañas Táctiles (montados en DOM para preservar valores) */}
          <div className="pt-4 border-t border-rule space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="space-y-0.5">
                <span className="text-[13px] font-bold text-ink block">
                  {exigeAlgunAdulto
                    ? 'Datos de familiares (al menos 1 adulto responsable completo)'
                    : 'Datos de familiares (opcionales)'}
                </span>
                {exigeAlgunAdulto && (
                  <span className="text-xs text-ink-muted block">
                    {tieneAlgunFamiliarCompleto
                      ? 'Ya completaste un responsable. Los demás familiares son opcionales.'
                      : 'Completá Madre, Padre o Tutor (Nombre, DNI, Domicilio, E-mail y Teléfono).'}
                  </span>
                )}
              </div>

              <div
                role="tablist"
                aria-label="Familiares del protagonista"
                className="flex bg-paper-3 p-1 rounded-xl border border-rule w-full sm:w-auto"
              >
                {(
                  [
                    { id: 'madre', label: 'Madre' },
                    { id: 'padre', label: 'Padre' },
                    { id: 'tutor', label: 'Tutor' },
                  ] as const
                ).map((t) => {
                  const evalFam = evaluarEstadoFamiliar(formData, t.id);
                  const tieneErrores = Object.keys(errors).some((k) => k.startsWith(`${t.id}_`));
                  const esTabActiva = familiarTab === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      role="tab"
                      aria-selected={esTabActiva}
                      onClick={() => setFamiliarTab(t.id)}
                      className={`flex-1 sm:flex-initial min-h-[42px] px-4 py-1.5 rounded-lg text-[13px] font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
                        esTabActiva
                          ? 'bg-surface text-brand-ink shadow-xs'
                          : tieneErrores
                            ? 'text-rose-700 dark:text-rose-400 hover:bg-surface/60'
                            : 'text-ink-muted hover:text-ink'
                      }`}
                    >
                      <span>{t.label}</span>
                      {tieneErrores ? (
                        <span
                          className="w-2 h-2 rounded-full bg-rose-600 dark:bg-rose-400 animate-pulse"
                          aria-label="Con errores"
                        />
                      ) : evalFam.estado === 'completo' ? (
                        <CheckCircle2
                          className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400 shrink-0"
                          aria-label="Completo"
                        />
                      ) : evalFam.estado === 'parcial' ? (
                        <span
                          className="w-2 h-2 rounded-full bg-amber-600 dark:bg-amber-400"
                          aria-label="Incompleto"
                        />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-4">
              {FAMILIAR_TABS.map((tabId) => {
                const campos = seccionActual.campos.filter((c) => c.key.startsWith(`${tabId}_`));
                const esActivo = familiarTab === tabId;
                const evalTab = evaluarEstadoFamiliar(formData, tabId);
                const mostrarAsteriscoCore =
                  exigeAlgunAdulto && (!tieneAlgunFamiliarCompleto || evalTab.estado === 'parcial');

                return (
                  <div
                    key={tabId}
                    role="tabpanel"
                    aria-label={tabId}
                    className={`grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-2xl bg-paper-2 border border-rule ${
                      esActivo ? '' : 'hidden'
                    }`}
                  >
                    {campos.map((c) => {
                      const suf = c.key.slice(tabId.length + 1);
                      const esCore = (FAMILIAR_CORE_SUFFIXES as readonly string[]).includes(suf);
                      return renderCampo(c, {
                        esFamiliarCore: mostrarAsteriscoCore && esCore,
                      });
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      );
    }

    // PASO 2: Salud agrupada en sub-bloques claros
    if (seccionActual.id === 'seccion_salud') {
      const camposVisiblesSalud = seccionActual.campos.filter(esVisibleCampo);
      const camposPorClaveSalud = new Map(camposVisiblesSalud.map((c) => [c.key, c]));
      const restantesSalud = camposVisiblesSalud.filter((c) => !SALUD_CLAVES_CONOCIDAS.has(c.key));

      return (
        <div className="space-y-5">
          {SALUD_GRUPOS.map((grupo) => {
            const camposGrupo = grupo.keys
              .map((k) => camposPorClaveSalud.get(k))
              .filter((c): c is CampoSchema => Boolean(c));
            if (camposGrupo.length === 0) return null;

            return (
              <section
                key={grupo.id}
                className="p-4 rounded-2xl bg-paper-2/70 border border-rule space-y-3.5"
              >
                <div className="space-y-0.5">
                  <h3 className="text-sm font-extrabold text-ink">{grupo.titulo}</h3>
                  {grupo.subtitulo && (
                    <p className="text-xs text-ink-muted">{grupo.subtitulo}</p>
                  )}
                  {grupo.id === 'vacunas' && vacunasBloqueadas && (
                    <p className="text-xs font-semibold text-brand-ink pt-0.5">
                      Las fechas de vacunas quedaron deshabilitadas porque marcaste que no tiene o no sabe.
                    </p>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {camposGrupo.map((c) => renderCampo(c))}
                </div>
              </section>
            );
          })}

          {restantesSalud.length > 0 && (
            <section className="p-4 rounded-2xl bg-paper-2/70 border border-rule space-y-3.5">
              <h3 className="text-sm font-extrabold text-ink">Otros datos de salud</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {restantesSalud.map((c) => renderCampo(c))}
              </div>
            </section>
          )}
        </div>
      );
    }

    // PASO 6: Retiro de Menores en tarjetas diferenciadas por persona + quitar persona agregada
    if (seccionActual.id === 'seccion_retiro_menores') {
      const limpiarPersonaRetiro = (idx: 2 | 3) => {
        const camposPersona = ['nombre', 'dni', 'telefono', 'caracter'];
        if (idx === 2 && personasRetiroVisibles === 3) {
          for (const suf of camposPersona) {
            const val3 = getValues(`ret_persona3_${suf}`);
            setValue(`ret_persona2_${suf}`, val3 ?? '', { shouldDirty: true });
            setValue(`ret_persona3_${suf}`, '', { shouldDirty: true });
          }
          clearErrors([
            ...camposPersona.map((s) => `ret_persona2_${s}`),
            ...camposPersona.map((s) => `ret_persona3_${s}`),
          ]);
          setPersonasRetiroVisibles(2);
          return;
        }
        for (const suf of camposPersona) {
          setValue(`ret_persona${idx}_${suf}`, '', { shouldDirty: true });
        }
        clearErrors(camposPersona.map((s) => `ret_persona${idx}_${s}`));
        setPersonasRetiroVisibles(idx === 3 ? 2 : 1);
      };

      const indicesPersonas = [1, 2, 3].filter((n) => n <= personasRetiroVisibles);
      const otrosCamposRetiro = seccionActual.campos.filter(
        (c) => !/^ret_persona[123]_/.test(c.key) && esVisibleCampo(c),
      );

      return (
        <div className="space-y-4">
          {indicesPersonas.map((num) => {
            const camposPersona = seccionActual.campos.filter(
              (c) => c.key.startsWith(`ret_persona${num}_`) && esVisibleCampo(c),
            );
            if (camposPersona.length === 0) return null;

            return (
              <div
                key={`retiro-persona-${num}`}
                className="p-4 rounded-2xl bg-paper-2 border border-rule space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-extrabold text-ink">
                    Persona autorizada {num}
                  </h3>
                  {num > 1 && (
                    <button
                      type="button"
                      onClick={() => limpiarPersonaRetiro(num as 2 | 3)}
                      className="min-h-[34px] px-2.5 py-1 rounded-lg text-xs font-bold text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 inline-flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Quitar</span>
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {camposPersona.map((c) => renderCampo(c))}
                </div>
              </div>
            );
          })}

          {personasRetiroVisibles < 3 && (
            <button
              type="button"
              onClick={() => setPersonasRetiroVisibles((n) => Math.min(3, n + 1))}
              className="w-full min-h-[46px] py-2.5 px-4 rounded-xl border border-dashed border-brand/60 text-brand-ink font-bold text-[13px] flex items-center justify-center gap-1.5 hover:bg-brand/10 transition-colors cursor-pointer text-center"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span>Agregar otra persona autorizada ({personasRetiroVisibles}/3)</span>
            </button>
          )}

          {otrosCamposRetiro.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-rule">
              {otrosCamposRetiro.map((c) => renderCampo(c))}
            </div>
          )}
        </div>
      );
    }

    // PASO 7: Voluntariado (áreas colab_* como chips multi-selección compactos) y Materiales
    if (seccionActual.id === 'seccion_ficha_adultos') {
      const switchPrincipal = seccionActual.campos.find((c) => c.key === 'completar_ficha_adultos');
      const deseaColaborar = Boolean(formData.completar_ficha_adultos);
      const camposAdultoDatos = seccionActual.campos.filter(
        (c) =>
          c.key !== 'completar_ficha_adultos' &&
          !c.key.startsWith('colab_') &&
          c.type !== 'materiales_tabla' &&
          c.key !== 'adulto_observaciones' &&
          esVisibleCampo(c),
      );
      const camposColab = seccionActual.campos.filter(
        (c) => c.type === 'boolean' && c.key.startsWith('colab_'),
      );
      const campoColabOtrosDetalle = camposPorKey.get('colab_otros_detalle');
      const campoMateriales = seccionActual.campos.find((c) => c.type === 'materiales_tabla');
      const campoObservaciones = seccionActual.campos.find((c) => c.key === 'adulto_observaciones');

      const colabSeleccionadasCount = camposColab.filter((c) => Boolean(formData[c.key])).length;

      return (
        <div className="space-y-4">
          {switchPrincipal && renderCampo(switchPrincipal)}

          {deseaColaborar && (
            <div className="space-y-5 pt-2">
              {camposAdultoDatos.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {camposAdultoDatos.map((c) => renderCampo(c))}
                </div>
              )}

              {camposColab.length > 0 && (
                <div className="p-4 rounded-2xl bg-paper-2 border border-rule space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-sm font-extrabold text-ink">
                      Áreas en las que podés colaborar
                    </span>
                    {colabSeleccionadasCount > 0 && (
                      <span className="s-badge-brand px-2.5 py-0.5 rounded-full text-xs font-bold">
                        {colabSeleccionadasCount}{' '}
                        {colabSeleccionadasCount === 1 ? 'seleccionada' : 'seleccionadas'}
                      </span>
                    )}
                  </div>

                  <div
                    className="flex flex-wrap gap-2"
                    role="group"
                    aria-label="Áreas de colaboración"
                  >
                    {camposColab.map((c) => {
                      const activo = Boolean(formData[c.key]);
                      return (
                        <button
                          key={c.key}
                          type="button"
                          aria-pressed={activo}
                          onClick={() => actualizarCampo(c.key, !activo)}
                          className={`min-h-[42px] px-3.5 py-2 rounded-xl text-[13px] font-bold transition flex items-center gap-1.5 cursor-pointer border text-left ${
                            activo
                              ? 'bg-brand text-brand-contrast border-brand'
                              : 'bg-surface text-ink-2 border-rule-strong hover:border-brand/60'
                          }`}
                        >
                          {activo && <Check className="w-4 h-4 stroke-[3] shrink-0" />}
                          <span>{c.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  {Boolean(formData.colab_otros) && campoColabOtrosDetalle && (
                    <div className="pt-1">
                      <input
                        type="text"
                        id={campoColabOtrosDetalle.key}
                        aria-label={campoColabOtrosDetalle.label}
                        placeholder={`${campoColabOtrosDetalle.label}...`}
                        {...register(campoColabOtrosDetalle.key, {
                          onChange: () => {
                            if (errors[campoColabOtrosDetalle.key]) {
                              clearErrors(campoColabOtrosDetalle.key);
                            }
                          },
                        })}
                        className="w-full min-h-[46px] px-3.5 py-2.5 bg-surface border border-brand/50 rounded-xl text-base sm:text-[15px] text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-brand"
                      />
                    </div>
                  )}
                </div>
              )}

              {campoMateriales && renderCampo(campoMateriales)}
              {campoObservaciones && esVisibleCampo(campoObservaciones) && renderCampo(campoObservaciones)}
            </div>
          )}
        </div>
      );
    }

    // RESTO DE PASOS (Ingreso, Salidas, Apoyos y plantillas personalizadas)
    const camposVisibles = seccionActual.campos.filter(esVisibleCampo);

    return (
      <div className="space-y-4">
        {seccionActual.id === 'seccion_necesidades_especiales' && (
          <div
            className={`p-3.5 rounded-xl border text-[13px] flex items-start gap-2.5 ${
              formData.tiene_cud
                ? 's-badge-warn'
                : 'bg-paper-2 border-rule text-ink-2'
            }`}
          >
            <Info className="w-4 h-4 shrink-0 mt-0.5 text-brand-ink" />
            <span>
              {formData.tiene_cud
                ? 'Marcaste que posee CUD en Salud: completá al menos Diagnóstico o patología y Vencimiento y orientación prestacional.'
                : 'Esta ficha es opcional. Si no aplica al protagonista, podés dejarla en blanco y continuar al siguiente paso (no se imprimirá esa hoja en el PDF).'}
            </span>
          </div>
        )}

        {seccionActual.id === 'seccion_autorizacion_salidas' && !seccionActual.textoLegal && (
          <div className="p-4 rounded-xl bg-paper-2 border border-rule text-[13px] text-ink-2 space-y-1.5">
            <p className="font-bold text-ink">
              Salidas por el día sin pernocte (Ciclo {obtenerCicloAnioActual()})
            </p>
            <p>
              Habilita paseos barriales, visitas a parques, actividades comunitarias y traslados del
              Grupo Scout.
            </p>
            {Boolean(formData.autorizante_nombre) && (
              <p className="pt-1 text-brand-ink font-bold">
                Firma: {String(formData.autorizante_nombre)} (
                {String(formData.autorizante_caracter || 'Familiar')})
              </p>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {camposVisibles.map((c) => renderCampo(c))}
        </div>
      </div>
    );
  };

  if (secciones.length === 0) {
    return (
      <div className="bg-surface rounded-2xl p-8 border border-rule text-center space-y-2 text-ink-muted">
        <FileText className="w-8 h-8 mx-auto opacity-45" />
        <p className="text-sm font-bold text-ink">
          Esta plantilla aún no tiene secciones ni campos configurados.
        </p>
        <p className="text-xs">Agregale secciones y campos desde Legajos → Plantillas y Editor PDF.</p>
      </div>
    );
  }

  return (
    <form
      ref={formTopRef as unknown as React.RefObject<HTMLFormElement>}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        // Enter en un input dispara submit implícito: fuera del último paso solo avanza,
        // para no finalizar (y descargar) un legajo precargado por accidente.
        if (pasoActivo < secciones.length - 1) {
          handleSiguientePaso();
          return;
        }
        void handleFinalizarFirma();
      }}
      className="space-y-4 scroll-mt-20"
    >
      {/* Navegador de Pasos Compacto Sticky */}
      <div
        className={`sticky ${enDrawer ? 'top-0' : 'top-16'} z-20 bg-surface rounded-2xl p-3 sm:p-4 border border-rule shadow-xs space-y-2.5`}
      >
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            {secciones.length > 1 && (
              <span className="px-2.5 py-0.5 rounded-md bg-paper-2 text-ink-2 font-bold text-xs shrink-0 border border-rule">
                Paso {pasoActivo + 1} de {secciones.length}
              </span>
            )}
            <h2 className="text-base sm:text-lg font-extrabold text-ink truncate">
              {obtenerNombreCortoSeccion(seccionActual, pasoActivo)}
            </h2>
          </div>

          <button
            type="button"
            onClick={() => void handleGuardarBorrador()}
            disabled={cargando}
            className="min-h-[40px] px-3.5 rounded-xl bg-paper-2 hover:bg-paper-3 border border-rule-strong text-ink font-bold text-[13px] flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 disabled:opacity-50"
          >
            <Save className="w-4 h-4 text-brand-ink" />
            <span>Guardar avance</span>
          </button>
        </div>

        {secciones.length > 1 && (
          <>
            {/* Barra de Progreso Dinámica de Carga y Avance */}
            <div
              role="progressbar"
              aria-label="Avance del formulario"
              aria-valuemin={1}
              aria-valuemax={Math.max(secciones.length, 1)}
              aria-valuenow={pasoActivo + 1}
              aria-valuetext={`Paso ${pasoActivo + 1} de ${secciones.length}`}
              className="w-full bg-paper-3 rounded-full h-1.5 overflow-hidden"
            >
              <div
                className="bg-brand h-full rounded-full transition-all duration-300 ease-out"
                style={{ width: `${((pasoActivo + 1) / Math.max(secciones.length, 1)) * 100}%` }}
              />
            </div>

            {/* Chips Horizontales de Pasos */}
            <div
              className="flex items-center gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1"
              role="navigation"
              aria-label="Pasos del formulario"
            >
              {secciones.map((sec, idx) => {
                const esActivo = idx === pasoActivo;
                const esPasado = idx < pasoActivo;
                const tieneErrorPaso = pasosConError.includes(idx);
                const nombreCorto = obtenerNombreCortoSeccion(sec, idx);

                return (
                  <button
                    aria-pressed={esActivo}
                    key={sec.id}
                    type="button"
                    aria-current={esActivo ? 'step' : undefined}
                    onClick={() => irAPaso(idx)}
                    className={`min-h-[36px] sm:min-h-[40px] px-3 py-1 rounded-xl text-xs sm:text-[13px] font-bold whitespace-nowrap flex items-center gap-1.5 transition cursor-pointer shrink-0 border ${
                      esActivo
                        ? 'bg-brand text-brand-contrast font-bold border-brand'
                        : tieneErrorPaso
                          ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-400 dark:border-rose-700'
                          : esPasado
                            ? 'bg-brand-soft/75 text-brand-ink border-brand/40'
                            : 'bg-paper-2 text-ink-muted border-rule hover:text-ink'
                    }`}
                  >
                    {tieneErrorPaso ? (
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    ) : esPasado ? (
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    ) : (
                      PASO_ICONOS[sec.id] || <FileText className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {idx + 1}. {nombreCorto}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Alerta de Validación Directa */}
      {errorValidacion && (
        <div
          role="alert"
          aria-live="assertive"
          className="bg-rose-50 dark:bg-rose-950/50 border border-rose-300 dark:border-rose-800 rounded-2xl p-4 flex items-center gap-2.5 text-rose-800 dark:text-rose-200 text-[13px] font-bold"
        >
          <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
          <span>{errorValidacion}</span>
        </div>
      )}

      {/* Cuerpo de Campos del Paso Actual */}
      <div className="bg-surface rounded-2xl p-4 sm:p-6 border border-rule space-y-4">
        <div className="space-y-1 pb-2 border-b border-rule">
          <h3 className="text-base sm:text-lg font-extrabold text-ink">
            {seccionActual.titulo}
          </h3>
          {seccionActual.descripcion && (
            <p className="text-[13px] text-ink-muted leading-relaxed">
              {seccionActual.descripcion}
            </p>
          )}
        </div>

        {seccionActual?.textoLegal && (
          <div className="p-4 rounded-xl bg-paper-2 border border-rule text-[13px] leading-relaxed text-ink-2 space-y-1.5">
            <div className="text-xs font-extrabold uppercase tracking-wider text-brand-ink flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 shrink-0" />
              <span>Declaración / Texto del Documento</span>
            </div>
            <p className="whitespace-pre-line text-ink">
              {interpolarTextoLegalPreview(seccionActual.textoLegal, formData)}
            </p>
          </div>
        )}
        {renderContenidoSeccion()}
      </div>

      {/* Barra de Acción Inferior Optimizada para el Pulgar */}
      <div className="bg-surface rounded-2xl p-4 sm:p-5 border border-rule space-y-3">
        {pasoActivo < secciones.length - 1 ? (
          <div className="space-y-3">
            {/* Fila Principal: Botón Siguiente Destacado y Botón Anterior */}
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                disabled={pasoActivo === 0}
                onClick={() => irAPaso(pasoActivo - 1)}
                className="min-h-[52px] sm:min-h-[56px] px-4 rounded-2xl border border-rule-strong text-ink-2 font-bold text-sm flex items-center justify-center gap-1 disabled:opacity-30 cursor-pointer shrink-0"
                aria-label="Paso anterior"
              >
                <ChevronLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Anterior</span>
              </button>

              <button
                type="button"
                onClick={handleSiguientePaso}
                className="flex-1 min-h-[52px] sm:min-h-[56px] px-4 sm:px-6 rounded-2xl bg-brand hover:bg-brand-hover active:opacity-100 text-brand-contrast font-extrabold text-[15px] sm:text-base flex items-center justify-center gap-2 transition-colors cursor-pointer text-center"
              >
                <span>
                  Siguiente: {obtenerNombreCortoSeccion(secciones[pasoActivo + 1], pasoActivo + 1)}
                </span>
                <ChevronRight className="w-5 h-5 stroke-[2.5] shrink-0" />
              </button>
            </div>

            {/* Acción Secundaria: Vista Previa y Finalizar */}
            <div className="flex items-center justify-between gap-2 flex-wrap pt-2 border-t border-rule text-[13px]">
              <span className="text-xs font-semibold text-ink-muted">
                Paso {pasoActivo + 1} de {secciones.length}
              </span>
              <div className="flex items-center gap-2 flex-wrap">
                {onPreviewPdf && (
                  <button
                    type="button"
                    onClick={handlePreviewPdf}
                    disabled={cargando}
                    className="text-brand-ink hover:bg-brand/10 font-bold text-[13px] flex items-center gap-1.5 transition-colors py-1.5 px-3 rounded-lg cursor-pointer disabled:opacity-50"
                  >
                    <Eye className="w-4 h-4 shrink-0" />
                    <span>Vista Previa PDF</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void handleFinalizarFirma()}
                  disabled={cargando}
                  className="text-ink-2 hover:text-ink font-bold text-[13px] flex items-center gap-1.5 transition-colors py-1.5 px-3 rounded-lg hover:bg-paper-2 cursor-pointer disabled:opacity-50"
                >
                  <Download className="w-4 h-4 text-ink-muted shrink-0" />
                  <span>Finalizar y descargar PDF</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Último Paso: Aquí Finalizar y Descargar es el CTA Principal Gigante */
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            {pasoActivo > 0 && (
              <button
                type="button"
                onClick={() => irAPaso(pasoActivo - 1)}
                className="min-h-[52px] sm:min-h-[56px] px-4 rounded-2xl border border-rule-strong text-ink-2 font-bold text-sm flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
              >
                <ChevronLeft className="w-4 h-4 shrink-0" />
                <span>Paso anterior</span>
              </button>
            )}

            {onPreviewPdf && (
              <button
                type="button"
                onClick={handlePreviewPdf}
                disabled={cargando}
                className="min-h-[52px] sm:min-h-[56px] px-4 rounded-2xl border border-rule-strong bg-paper-2 hover:bg-paper-3 text-ink font-bold text-sm flex items-center justify-center gap-2 cursor-pointer transition-colors disabled:opacity-50"
              >
                <Eye className="w-4 h-4 text-brand-ink shrink-0" />
                <span>Vista Previa PDF</span>
              </button>
            )}

            <button
              type="submit"
              disabled={cargando}
              className="flex-1 min-h-[54px] sm:min-h-[58px] px-5 sm:px-6 rounded-2xl bg-brand hover:bg-brand-hover active:opacity-100 text-brand-contrast font-black text-[15px] sm:text-base flex items-center justify-center gap-2.5 transition-colors cursor-pointer disabled:opacity-50 text-center"
            >
              {cargando ? (
                <Loader2 className="w-5 h-5 animate-spin shrink-0" />
              ) : (
                <Download className="w-5 h-5 stroke-[2.5] shrink-0" />
              )}
              <span>Finalizar y descargar PDF oficial</span>
            </button>
          </div>
        )}
      </div>
    </form>
  );
};
