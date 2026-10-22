import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useForm } from 'react-hook-form';
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
} from 'lucide-react';

export interface CampoSchema {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  options?: { label: string; value: string }[];
}

export interface SeccionSchema {
  id: string;
  titulo: string;
  descripcion?: string;
  permiteCopiarHermano?: boolean;
  campos: CampoSchema[];
}

export interface EsquemaCampos {
  secciones: SeccionSchema[];
}

interface Props {
  esquema: EsquemaCampos;
  valoresIniciales?: Record<string, unknown>;
  onSubmit: (datos: Record<string, unknown>, finalizarParaFirma: boolean) => Promise<void>;
  cargando?: boolean;
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

const NOMBRES_CORTOS_PASO: Record<string, string> = {
  seccion_inscripcion: 'Inscripción',
  seccion_salud: 'Salud',
  seccion_autorizacion_ingreso: 'Ingreso',
  seccion_autorizacion_salidas: 'Salidas',
  seccion_necesidades_especiales: 'Apoyos',
  seccion_retiro_menores: 'Retiro',
  seccion_ficha_adultos: 'Voluntariado',
};

const MATERIALES_CONSTRUCCION = [
  { key: 'chapas', label: 'Chapas de Cinc' },
  { key: 'puntales', label: 'Puntales de Madera' },
  { key: 'tablas', label: 'Tablas Grandes' },
  { key: 'paneles', label: 'Paneles terciados' },
  { key: 'postes', label: 'Postes de Madera' },
  { key: 'clavos', label: 'Clavos y Tornillos' },
  { key: 'alambrado', label: 'Alambrado' },
  { key: 'alambre_fardo', label: 'Alambre de Fardo' },
  { key: 'ladrillos', label: 'Ladrillos' },
  { key: 'cemento', label: 'Cemento' },
  { key: 'pala', label: 'Pala' },
  { key: 'serrucho', label: 'Serrucho o sierra' },
  { key: 'pinzas', label: 'Pinzas o tenazas' },
  { key: 'destornilladores', label: 'Destornilladores' },
];

const MATERIALES_CAMPAMENTO = [
  { key: 'carpas', label: 'Carpas' },
  { key: 'tablones', label: 'Tablones o mesas' },
  { key: 'lonas', label: 'Lonas' },
  { key: 'media_sombras', label: 'Media sombras' },
  { key: 'sogas', label: 'Sogas o Soguines' },
  { key: 'estacas', label: 'Estacas' },
  { key: 'cajones', label: 'Cajones' },
  { key: 'tachos', label: 'Tachos' },
  { key: 'bidones', label: 'Bidones para Agua' },
  { key: 'bancos', label: 'Bancos o sillas' },
  { key: 'quemadores', label: 'Quemadores cocina' },
  { key: 'utensilios', label: 'Utensilios de cocina' },
  { key: 'otros_camp', label: 'Otros materiales' },
];

// Mapa: interruptor booleano -> campo de detalle asociado (se muestra solo cuando aplica)
const DETALLE_POR_BOOLEAN: Record<string, string> = {
  realiza_hobby: 'hobby_detalle',
  toma_medicacion: 'toma_medicacion_detalle',
  enfermedad_cronica: 'enfermedad_cronica_detalle',
  requiere_tratamiento: 'requiere_tratamiento_detalle',
  sufre_alergia: 'sufre_alergia_detalle',
  esta_anticoagulado: 'anticoagulado_droga',
  regimen_dietario: 'regimen_dietario_detalle',
  ataques_panico_ansiedad: 'ataques_panico_frecuencia',
  diagnostico_salud_mental: 'diagnostico_salud_mental_detalle',
  recibe_tratamiento_salud_mental: 'recibe_tratamiento_salud_mental_detalle',
  miedo_fobia_excesivo: 'miedo_fobia_detalle',
  ret_autoriza_retirarse_solo: 'ret_retiro_solo_aclaracion',
  colab_otros: 'colab_otros_detalle',
};

const CAMPOS_DETALLE_OCULTOS = new Set(Object.values(DETALLE_POR_BOOLEAN));

const CHIPS_RAPIDOS: Record<string, { label: string; value: string }[]> = {
  grupo_sanguineo: [
    { label: '0', value: '0' },
    { label: 'A', value: 'A' },
    { label: 'B', value: 'B' },
    { label: 'AB', value: 'AB' },
  ],
  factor_rh: [
    { label: 'RH +', value: '+' },
    { label: 'RH -', value: '-' },
  ],
};

export const DynamicFormRenderer: React.FC<Props> = ({
  esquema,
  valoresIniciales = {},
  onSubmit,
  cargando = false,
}) => {
  const [pasoActivo, setPasoActivo] = useState(0);
  const [familiarTab, setFamiliarTab] = useState<'madre' | 'padre' | 'tutor'>('madre');
  const [catMateriales, setCatMateriales] = useState<'construccion' | 'campamento'>('campamento');
  const [errorValidacion, setErrorValidacion] = useState<string | null>(null);
  const formTopRef = useRef<HTMLDivElement>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    trigger,
    formState: { errors },
  } = useForm({
    defaultValues: valoresIniciales,
    shouldFocusError: false,
  });

  const formData = watch();

  // Cantidad de personas autorizadas visibles en Paso 6 (Retiro)
  const [personasRetiroVisibles, setPersonasRetiroVisibles] = useState<number>(() => {
    if (valoresIniciales.ret_persona3_nombre) return 3;
    if (valoresIniciales.ret_persona2_nombre) return 2;
    return 1;
  });

  // Prellenado del Adulto Autorizante en el Paso 3 solo cuando el usuario elige quién firma (evita tipear dos veces al mismo familiar)
  const autorizanteTipo = watch('autorizante_tipo');
  useEffect(() => {
    if (!autorizanteTipo) return;
    const mapCaract: Record<string, string> = {
      madre: 'Madre',
      padre: 'Padre',
      tutor: 'Tutor judicial',
    };
    const prefix = autorizanteTipo as 'madre' | 'padre' | 'tutor';
    if (formData[`${prefix}_nombres`]) setValue('autorizante_nombre', formData[`${prefix}_nombres`]);
    if (formData[`${prefix}_dni`]) setValue('autorizante_dni', formData[`${prefix}_dni`]);
    if (formData[`${prefix}_telefono`]) setValue('autorizante_telefono', formData[`${prefix}_telefono`]);
    if (formData[`${prefix}_domicilio`]) setValue('autorizante_domicilio', formData[`${prefix}_domicilio`]);
    if (mapCaract[prefix]) setValue('autorizante_caracter', mapCaract[prefix]);
    if (!formData.autorizante_nacionalidad) setValue('autorizante_nacionalidad', 'Argentina');
    if (!formData.menor_nacionalidad) setValue('menor_nacionalidad', 'Argentina');
  }, [autorizanteTipo, setValue]);

  // Solo copiar el domicilio del protagonista si el familiar marca explícitamente que convive en el mismo hogar y su domicilio está vacío
  const protagonistaDomicilio = watch('protagonista_domicilio');
  const madreConvive = watch('madre_convive');
  const padreConvive = watch('padre_convive');
  const tutorConvive = watch('tutor_convive');

  useEffect(() => {
    if (madreConvive === true && protagonistaDomicilio && !formData.madre_domicilio) {
      setValue('madre_domicilio', protagonistaDomicilio);
    }
  }, [madreConvive, protagonistaDomicilio, setValue]);

  useEffect(() => {
    if (padreConvive === true && protagonistaDomicilio && !formData.padre_domicilio) {
      setValue('padre_domicilio', protagonistaDomicilio);
    }
  }, [padreConvive, protagonistaDomicilio, setValue]);

  useEffect(() => {
    if (
      tutorConvive === true &&
      protagonistaDomicilio &&
      formData.tutor_nombres &&
      !formData.tutor_domicilio
    ) {
      setValue('tutor_domicilio', protagonistaDomicilio);
    }
  }, [tutorConvive, protagonistaDomicilio, setValue]);

  const secciones = esquema.secciones || [];
  const seccionActual = secciones[pasoActivo] || secciones[0];

  // Mapa rápido de campos de la sección actual por key
  const camposPorKey = useMemo(() => {
    const map = new Map<string, CampoSchema>();
    seccionActual?.campos.forEach((c) => map.set(c.key, c));
    return map;
  }, [seccionActual]);

  const irAPaso = (index: number) => {
    if (index >= 0 && index < secciones.length) {
      setPasoActivo(index);
      setErrorValidacion(null);
      formTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleGuardarBorrador = () => {
    setErrorValidacion(null);
    return onSubmit(watch(), false);
  };

  const onFinalizarValido = (data: Record<string, unknown>) => {
    setErrorValidacion(null);
    return onSubmit(data, true);
  };

  const onFinalizarError = (formErrors: Record<string, unknown>) => {
    const errorKeys = Object.keys(formErrors);
    if (errorKeys.length === 0) return;
    const primeraClave = errorKeys[0];

    // Si el error pertenece a un familiar en el Paso 1, abrimos la pestaña correspondiente
    if (primeraClave.startsWith('madre_')) setFamiliarTab('madre');
    else if (primeraClave.startsWith('padre_')) setFamiliarTab('padre');
    else if (primeraClave.startsWith('tutor_')) setFamiliarTab('tutor');

    const pasoConError = secciones.findIndex((sec) =>
      sec.campos.some((c) => c.key === primeraClave),
    );

    if (pasoConError !== -1) {
      const nombreCorto =
        NOMBRES_CORTOS_PASO[secciones[pasoConError].id] || `Paso ${pasoConError + 1}`;
      setErrorValidacion(`Completá los datos obligatorios en "${nombreCorto}"`);
      irAPaso(pasoConError);
    }
  };

  const handleFinalizarFirma = handleSubmit(onFinalizarValido, onFinalizarError);

  // Validador de campos requeridos: todos los campos de madre y padre son obligatorios (excepto switch convive)
  const esRequeridoCampo = (campo: CampoSchema) => {
    if (campo.key === 'madre_convive' || campo.key === 'padre_convive') {
      return false; // Switch booleano SÍ / NO, no debe forzarse a true
    }
    return Boolean(
      campo.required ||
        campo.key.startsWith('madre_') ||
        campo.key.startsWith('padre_') ||
        (seccionActual?.id === 'seccion_necesidades_especiales' &&
          formData.tiene_cud &&
          (campo.key === 'ne_diagnostico' || campo.key === 'ne_cud_vencimiento_prestacion')),
    );
  };

  // Avanza al siguiente paso validando campos obligatorios de la sección actual
  const handleSiguientePaso = async () => {
    if (seccionActual) {
      const camposRequeridosActuales: string[] = [];

      seccionActual.campos.forEach((campo) => {
        if (!CAMPOS_DETALLE_OCULTOS.has(campo.key) && esRequeridoCampo(campo)) {
          camposRequeridosActuales.push(campo.key);
        }
      });

      if (camposRequeridosActuales.length > 0) {
        const esValido = await trigger(camposRequeridosActuales);
        if (!esValido) {
          const valores = watch();
          const primerInvalido =
            camposRequeridosActuales.find((k) => errors[k]) ||
            camposRequeridosActuales.find((k) => {
              const val = valores[k];
              return val === undefined || val === null || String(val).trim() === '';
            });

          if (primerInvalido?.startsWith('madre_')) setFamiliarTab('madre');
          else if (primerInvalido?.startsWith('padre_')) setFamiliarTab('padre');
          else if (primerInvalido?.startsWith('tutor_')) setFamiliarTab('tutor');

          setErrorValidacion(
            'Por favor completá los campos obligatorios marcados con * antes de continuar.',
          );
          formTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          return;
        }
      }
    }

    irAPaso(pasoActivo + 1);
  };

  // Limpia prefijos repetitivos en etiquetas agrupadas
  const limpiarLabel = (label: string) =>
    label
      .replace(/^(Madre|Padre|Tutor):\s*/i, '')
      .replace(/^Persona \d+( autorizada a retirar)?:\s*/i, '');

  // Renderizador individual de un campo optimizado para el pulgar
  const renderCampo = (campo: CampoSchema) => {
    const error = errors[campo.key]?.message as string | undefined;
    const esRequerido = esRequeridoCampo(campo);
    const labelLimpio = limpiarLabel(campo.label);

    // 1. Selector Rápido por Chips (Reemplaza <select> y campos como Grupo Sanguíneo / Factor RH)
    const opcionesChips = campo.options || CHIPS_RAPIDOS[campo.key];
    if (opcionesChips) {
      const valorActual = String(formData[campo.key] || '');
      return (
        <div key={campo.key} className="space-y-1.5">
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">
            {labelLimpio} {esRequerido && <span className="text-rose-500">*</span>}
          </label>
          <input
            type="hidden"
            {...register(campo.key, {
              required: esRequerido ? 'Seleccioná una opción' : false,
            })}
          />
          <div className="flex flex-wrap gap-2">
            {opcionesChips.map((opt) => {
              const activo = valorActual === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setValue(campo.key, opt.value, { shouldValidate: true })}
                  className={`flex-1 min-w-[76px] min-h-[44px] px-3 py-2 rounded-xl font-bold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer border ${
                    activo
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {activo && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>
          {error && <p className="text-xs font-bold text-rose-500">{error}</p>}
        </div>
      );
    }

    // 2. Interruptor Táctil (Switch Card) + Campo de Detalle integrado cuando está activo
    if (campo.type === 'boolean') {
      const isChecked = Boolean(formData[campo.key]);
      const detalleKey = DETALLE_POR_BOOLEAN[campo.key];
      const campoDetalle = detalleKey ? camposPorKey.get(detalleKey) : undefined;

      return (
        <div
          key={campo.key}
          className={`rounded-2xl border transition-all md:col-span-2 ${
            isChecked
              ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800'
              : 'bg-slate-50/70 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800'
          }`}
        >
          <button
            type="button"
            onClick={() => setValue(campo.key, !isChecked, { shouldValidate: true })}
            className="w-full min-h-[52px] px-4 py-3 flex items-center justify-between gap-3 text-left cursor-pointer"
          >
            <span className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 leading-snug">
              {labelLimpio} {esRequerido && <span className="text-rose-500">*</span>}
            </span>

            <span
              className={`shrink-0 inline-flex items-center w-14 h-8 rounded-full p-1 transition-colors ${
                isChecked ? 'bg-emerald-600 justify-end' : 'bg-slate-300 dark:bg-slate-700 justify-start'
              }`}
            >
              <span className="w-6 h-6 rounded-full bg-white shadow-xs flex items-center justify-center text-[10px] font-extrabold text-slate-700">
                {isChecked ? 'SÍ' : 'NO'}
              </span>
            </span>
          </button>

          {isChecked && campoDetalle && (
            <div className="px-4 pb-3.5 pt-1 border-t border-emerald-200/60 dark:border-emerald-800/50">
              <input
                type="text"
                placeholder={`${campoDetalle.label}...`}
                {...register(campoDetalle.key)}
                className="w-full min-h-[42px] px-3.5 py-2 bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          )}
        </div>
      );
    }

    // 3. Tarjetas Compactas de Materiales con Chips Táctiles (Prestar / Donar)
    if (campo.type === 'materiales_tabla') {
      const lista =
        catMateriales === 'construccion' ? MATERIALES_CONSTRUCCION : MATERIALES_CAMPAMENTO;

      return (
        <div key={campo.key} className="md:col-span-2 space-y-3 pt-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-extrabold text-slate-700 dark:text-slate-200">
              Materiales para Prestar o Donar
            </span>
            <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setCatMateriales('campamento')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  catMateriales === 'campamento'
                    ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-2xs'
                    : 'text-slate-500'
                }`}
              >
                ⛺ Campamento
              </button>
              <button
                type="button"
                onClick={() => setCatMateriales('construccion')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  catMateriales === 'construccion'
                    ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-2xs'
                    : 'text-slate-500'
                }`}
              >
                🏗️ Construcción
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {lista.map((item) => {
              const preKey = `mat_${item.key}_prestamo`;
              const donKey = `mat_${item.key}_donacion`;
              const isPre = Boolean(formData[preKey]);
              const isDon = Boolean(formData[donKey]);

              return (
                <div
                  key={item.key}
                  className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 transition ${
                    isPre || isDon
                      ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800'
                      : 'bg-white dark:bg-slate-800/60 border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                    {item.label}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setValue(preKey, !isPre)}
                      className={`min-h-[36px] px-2.5 rounded-lg text-[11px] font-bold transition cursor-pointer border ${
                        isPre
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      Prestar
                    </button>
                    <button
                      type="button"
                      onClick={() => setValue(donKey, !isDon)}
                      className={`min-h-[36px] px-2.5 rounded-lg text-[11px] font-bold transition cursor-pointer border ${
                        isDon
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
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
          <label htmlFor={campo.key} className="block text-xs font-bold text-slate-700 dark:text-slate-200">
            {labelLimpio} {esRequerido && <span className="text-rose-500">*</span>}
          </label>
          <textarea
            id={campo.key}
            rows={2}
            {...register(campo.key, {
              required: esRequerido ? 'Completá este campo' : false,
            })}
            className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          {error && <p className="text-xs font-bold text-rose-500">{error}</p>}
        </div>
      );
    }

    // 5. Input estándar con teclado móvil adecuado (numeric/tel/email/date)
    const esDniOPeso =
      campo.key.includes('dni') || campo.key === 'peso_kg' || campo.key === 'escolaridad_grado';

    return (
      <div key={campo.key} className="space-y-1.5">
        <label htmlFor={campo.key} className="block text-xs font-bold text-slate-700 dark:text-slate-200">
          {labelLimpio} {esRequerido && <span className="text-rose-500">*</span>}
        </label>
        <input
          type={campo.type || 'text'}
          id={campo.key}
          inputMode={campo.type === 'tel' ? 'tel' : esDniOPeso ? 'numeric' : undefined}
          {...register(campo.key, {
            required: esRequerido ? 'Completá este campo' : false,
          })}
          className="w-full min-h-[44px] px-3.5 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        {error && <p className="text-xs font-bold text-rose-500">{error}</p>}
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
          !CAMPOS_DETALLE_OCULTOS.has(c.key),
      );

      return (
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {camposProtagonista.map(renderCampo)}
          </div>

          {/* Selector de Familiares por Pestañas Táctiles (montados en DOM para validación completa) */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
                Datos de Familiares Obligatorios
              </span>
              <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl w-full sm:w-auto">
                {(
                  [
                    { id: 'madre', label: 'Madre', req: true },
                    { id: 'padre', label: 'Padre', req: true },
                    { id: 'tutor', label: 'Tutor', req: false },
                  ] as const
                ).map((t) => {
                  const tieneDatos = Boolean(formData[`${t.id}_nombres`]);
                  const tieneErrores = Object.keys(errors).some((k) => k.startsWith(`${t.id}_`));
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setFamiliarTab(t.id)}
                      className={`flex-1 sm:flex-initial min-h-[40px] px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                        familiarTab === t.id
                          ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-2xs'
                          : tieneErrores
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      <span>{t.label}</span>
                      {t.req && <span className="text-rose-500 font-extrabold">*</span>}
                      {tieneDatos && !tieneErrores && (
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      )}
                      {tieneErrores && (
                        <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-4">
              {(['madre', 'padre', 'tutor'] as const).map((tabId) => {
                const campos = seccionActual.campos.filter((c) => c.key.startsWith(`${tabId}_`));
                const esActivo = familiarTab === tabId;
                return (
                  <div
                    key={tabId}
                    className={`grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-2xl bg-slate-50/70 dark:bg-slate-800/30 border border-slate-200/80 dark:border-slate-800 ${
                      esActivo ? '' : 'hidden'
                    }`}
                  >
                    {campos.map(renderCampo)}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      );
    }

    // PASO 6: Retiro de Menores con despliegue progresivo (Persona 1 -> + Agregar otra)
    if (seccionActual.id === 'seccion_retiro_menores') {
      const camposRetiro = seccionActual.campos.filter((c) => {
        if (CAMPOS_DETALLE_OCULTOS.has(c.key)) return false;
        if (c.key.startsWith('ret_persona2_') && personasRetiroVisibles < 2) return false;
        if (c.key.startsWith('ret_persona3_') && personasRetiroVisibles < 3) return false;
        return true;
      });

      return (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {camposRetiro.map(renderCampo)}
          </div>

          {personasRetiroVisibles < 3 && (
            <button
              type="button"
              onClick={() => setPersonasRetiroVisibles((n) => Math.min(3, n + 1))}
              className="w-full min-h-[44px] py-2.5 px-4 rounded-xl border border-dashed border-emerald-400 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/30 transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Agregar otra persona autorizada ({personasRetiroVisibles}/3)</span>
            </button>
          )}
        </div>
      );
    }

    // PASO 7: Voluntariado y Materiales (Oculta los 25 campos si el switch principal está apagado)
    if (seccionActual.id === 'seccion_ficha_adultos') {
      const switchPrincipal = seccionActual.campos.find((c) => c.key === 'completar_ficha_adultos');
      const deseaColaborar = Boolean(formData.completar_ficha_adultos);
      const restoCampos = seccionActual.campos.filter(
        (c) => c.key !== 'completar_ficha_adultos' && !CAMPOS_DETALLE_OCULTOS.has(c.key),
      );

      return (
        <div className="space-y-4">
          {switchPrincipal && renderCampo(switchPrincipal)}

          {deseaColaborar && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              {restoCampos.map(renderCampo)}
            </div>
          )}
        </div>
      );
    }

    // RESTO DE PASOS (Salud, Ingreso, Salidas, Apoyos)
    const camposVisibles = seccionActual.campos.filter((c) => {
      if (CAMPOS_DETALLE_OCULTOS.has(c.key)) return false;
      // Solo pedir aclaración de restricción física si marcó que NO puede hacer cualquier actividad
      if (
        c.key === 'sit_actividad_fisica_no_especifique' &&
        formData.sit_cualquier_actividad_fisica
      ) {
        return false;
      }
      return true;
    });

    return (
      <div className="space-y-4">
        {seccionActual.id === 'seccion_autorizacion_salidas' && (
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 space-y-1">
            <p className="font-bold text-slate-800 dark:text-slate-100">
              Salidas por el día sin pernocte (Ciclo 2026)
            </p>
            <p>
              Habilita paseos barriales, visitas a parques, actividades comunitarias y traslados del
              Grupo Scout.
            </p>
            {Boolean(formData.autorizante_nombre) && (
              <p className="pt-1 text-emerald-700 dark:text-emerald-400 font-bold">
                Firma: {String(formData.autorizante_nombre)} (
                {String(formData.autorizante_caracter || 'Familiar')})
              </p>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {camposVisibles.map(renderCampo)}
        </div>
      </div>
    );
  };

  return (
    <div ref={formTopRef} className="space-y-4 scroll-mt-20">
      {/* Navegador de Pasos Compacto (1 fila deslizable con el pulgar) */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-3 sm:p-4 border border-slate-200 dark:border-slate-800 shadow-2xs space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-extrabold text-xs flex items-center justify-center shrink-0">
              {pasoActivo + 1}/{secciones.length}
            </span>
            <h2 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-slate-100 truncate">
              {NOMBRES_CORTOS_PASO[seccionActual?.id] || seccionActual?.titulo}
            </h2>
          </div>

          <button
            type="button"
            onClick={handleGuardarBorrador}
            disabled={cargando}
            className="min-h-[36px] px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shrink-0 disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Guardar avance</span>
          </button>
        </div>

        {/* Chips Horizontales de Pasos */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1">
          {secciones.map((sec, idx) => {
            const esActivo = idx === pasoActivo;
            const esPasado = idx < pasoActivo;
            const nombreCorto = NOMBRES_CORTOS_PASO[sec.id] || `Paso ${idx + 1}`;

            return (
              <button
                key={sec.id}
                type="button"
                onClick={() => irAPaso(idx)}
                className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap flex items-center gap-1.5 transition cursor-pointer shrink-0 border ${
                  esActivo
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                    : esPasado
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                      : 'bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-800'
                }`}
              >
                {esPasado ? (
                  <CheckCircle2 className="w-3.5 h-3.5" />
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
      </div>

      {/* Alerta de Validación Directa */}
      {errorValidacion && (
        <div className="bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 rounded-2xl p-3.5 flex items-center gap-2.5 text-rose-800 dark:text-rose-200 text-xs font-bold">
          <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
          <span>{errorValidacion}</span>
        </div>
      )}

      {/* Cuerpo de Campos del Paso Actual */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-2xs">
        {renderContenidoSeccion()}
      </div>

      {/* Barra de Acción Inferior Optimizada para el Pulgar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-3.5 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-2xs space-y-3">
        {pasoActivo < secciones.length - 1 ? (
          <div className="space-y-3">
            {/* Fila Principal: Botón Siguiente Destacado y Botón Anterior */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={pasoActivo === 0}
                onClick={() => irAPaso(pasoActivo - 1)}
                className="min-h-[52px] sm:min-h-[56px] px-4 rounded-2xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs flex items-center justify-center gap-1 disabled:opacity-30 cursor-pointer shrink-0"
                aria-label="Paso anterior"
              >
                <ChevronLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Anterior</span>
              </button>

              <button
                type="button"
                onClick={handleSiguientePaso}
                className="flex-1 min-h-[52px] sm:min-h-[56px] px-5 sm:px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white font-extrabold text-sm sm:text-base shadow-md shadow-emerald-600/25 flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <span>
                  Siguiente:{' '}
                  {NOMBRES_CORTOS_PASO[secciones[pasoActivo + 1]?.id] ||
                    `Paso ${pasoActivo + 2}`}
                </span>
                <ChevronRight className="w-5 h-5 stroke-[2.5]" />
              </button>
            </div>

            {/* Acción Secundaria: Finalizar y Descargar PDF (discreto para no confundir al usuario) */}
            <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800 text-xs">
              <span className="text-[11px] font-semibold text-slate-400">
                Paso {pasoActivo + 1} de {secciones.length}
              </span>
              <button
                type="button"
                onClick={handleFinalizarFirma}
                disabled={cargando}
                className="text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 font-bold text-xs flex items-center gap-1.5 transition py-1.5 px-2.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5 text-slate-400" />
                <span>Finalizar y Descargar PDF</span>
              </button>
            </div>
          </div>
        ) : (
          /* Último Paso (Paso 7): Aquí Finalizar y Descargar es el CTA Principal Gigante */
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => irAPaso(pasoActivo - 1)}
              className="min-h-[52px] sm:min-h-[56px] px-4 rounded-2xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Paso anterior</span>
            </button>

            <button
              type="button"
              onClick={handleFinalizarFirma}
              disabled={cargando}
              className="flex-1 min-h-[54px] sm:min-h-[58px] px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white font-black text-sm sm:text-base shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-2.5 transition cursor-pointer disabled:opacity-50"
            >
              {cargando ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Download className="w-5 h-5 stroke-[2.5]" />
              )}
              <span>Finalizar y Descargar PDF Oficial</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
