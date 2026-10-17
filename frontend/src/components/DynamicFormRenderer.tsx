import React, { useState, useEffect } from 'react';
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
  HelpCircle,
} from 'lucide-react';

export interface CampoSchema {
  key: string;
  label: string;
  type: string; // 'text' | 'textarea' | 'boolean' | 'date' | 'number' | 'email' | 'tel' | 'select'
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
  edadMiembro?: number;
}

const PASO_ICONOS: Record<string, React.ReactNode> = {
  seccion_inscripcion: <FileText className="w-5 h-5" />,
  seccion_salud: <HeartPulse className="w-5 h-5" />,
  seccion_autorizacion_ingreso: <ShieldCheck className="w-5 h-5" />,
  seccion_autorizacion_salidas: <Compass className="w-5 h-5" />,
  seccion_necesidades_especiales: <Sparkles className="w-5 h-5" />,
  seccion_retiro_menores: <UserCheck className="w-5 h-5" />,
  seccion_ficha_adultos: <Users className="w-5 h-5" />,
};

const MATERIALES_CONSTRUCCION = [
  { key: 'chapas', label: 'Chapas de Cinc / Zinc' },
  { key: 'puntales', label: 'Puntales de Madera' },
  { key: 'tablas', label: 'Tablas Grandes' },
  { key: 'paneles', label: 'Paneles terciados u otros' },
  { key: 'postes', label: 'Postes de Madera' },
  { key: 'clavos', label: 'Clavos y Tornillos' },
  { key: 'alambrado', label: 'Alambrado' },
  { key: 'alambre_fardo', label: 'Alambre de Fardo' },
  { key: 'ladrillos', label: 'Ladrillos' },
  { key: 'cemento', label: 'Cemento' },
  { key: 'pala', label: 'Pala de punta o ancha' },
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
  { key: 'cajones', label: 'Cajones para guardar' },
  { key: 'tachos', label: 'Tachos' },
  { key: 'bidones', label: 'Bidones para Agua' },
  { key: 'bancos', label: 'Bancos o sillas' },
  { key: 'quemadores', label: 'Quemadores p/ cocina' },
  { key: 'utensilios', label: 'Utensilios de cocina' },
  { key: 'otros_camp', label: 'Otros materiales' },
];

const COMPANION_BOOLEANS: Record<string, string> = {
  toma_medicacion_detalle: 'toma_medicacion',
  enfermedad_cronica_detalle: 'enfermedad_cronica',
  requiere_tratamiento_detalle: 'requiere_tratamiento',
  sufre_alergia_detalle: 'sufre_alergia',
  anticoagulado_droga: 'esta_anticoagulado',
  regimen_dietario_detalle: 'regimen_dietario',
  ataques_panico_frecuencia: 'ataques_panico_ansiedad',
  diagnostico_salud_mental_detalle: 'diagnostico_salud_mental',
  recibe_tratamiento_salud_mental_detalle: 'recibe_tratamiento_salud_mental',
  miedo_fobia_detalle: 'miedo_fobia_excesivo',
};

export const DynamicFormRenderer: React.FC<Props> = ({
  esquema,
  valoresIniciales = {},
  onSubmit,
  cargando = false,
  edadMiembro,
}) => {
  const [pasoActivo, setPasoActivo] = useState(0);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm({
    defaultValues: valoresIniciales,
  });

  const formData = watch();

  // Prellenado inteligente del Adulto Autorizante en el Paso 3 según el tipo seleccionado
  const autorizanteTipo = watch('autorizante_tipo');
  useEffect(() => {
    if (!autorizanteTipo) return;

    if (autorizanteTipo === 'madre') {
      if (formData.madre_nombres) setValue('autorizante_nombre', formData.madre_nombres);
      if (formData.madre_dni) setValue('autorizante_dni', formData.madre_dni);
      if (formData.madre_telefono) setValue('autorizante_telefono', formData.madre_telefono);
      if (formData.madre_domicilio) setValue('autorizante_domicilio', formData.madre_domicilio);
      setValue('autorizante_caracter', 'Madre');
      if (!formData.autorizante_nacionalidad) setValue('autorizante_nacionalidad', 'Argentina');
    } else if (autorizanteTipo === 'padre') {
      if (formData.padre_nombres) setValue('autorizante_nombre', formData.padre_nombres);
      if (formData.padre_dni) setValue('autorizante_dni', formData.padre_dni);
      if (formData.padre_telefono) setValue('autorizante_telefono', formData.padre_telefono);
      if (formData.padre_domicilio) setValue('autorizante_domicilio', formData.padre_domicilio);
      setValue('autorizante_caracter', 'Padre');
      if (!formData.autorizante_nacionalidad) setValue('autorizante_nacionalidad', 'Argentina');
    } else if (autorizanteTipo === 'tutor') {
      if (formData.tutor_nombres) setValue('autorizante_nombre', formData.tutor_nombres);
      if (formData.tutor_dni) setValue('autorizante_dni', formData.tutor_dni);
      if (formData.tutor_telefono) setValue('autorizante_telefono', formData.tutor_telefono);
      if (formData.tutor_domicilio) setValue('autorizante_domicilio', formData.tutor_domicilio);
      setValue('autorizante_caracter', 'Tutor judicial');
      if (!formData.autorizante_nacionalidad) setValue('autorizante_nacionalidad', 'Argentina');
    }
  }, [autorizanteTipo, setValue]);

  // Sincronización inteligente de Domicilio y Teléfono entre protagonista y familia
  const madreDomicilio = watch('madre_domicilio');
  const madreConvive = watch('madre_convive');
  const padreDomicilio = watch('padre_domicilio');
  const padreConvive = watch('padre_convive');
  const protagonistaDomicilio = watch('protagonista_domicilio');
  const madreTelefono = watch('madre_telefono');
  const padreTelefono = watch('padre_telefono');
  const protagonistaTelefono = watch('protagonista_telefono');

  useEffect(() => {
    if (!protagonistaDomicilio) {
      if (madreDomicilio && madreConvive !== false) {
        setValue('protagonista_domicilio', madreDomicilio);
      } else if (padreDomicilio && padreConvive !== false) {
        setValue('protagonista_domicilio', padreDomicilio);
      }
    }
  }, [madreDomicilio, madreConvive, padreDomicilio, padreConvive, protagonistaDomicilio, setValue]);

  useEffect(() => {
    if (protagonistaDomicilio) {
      if (!madreDomicilio && madreConvive !== false) setValue('madre_domicilio', protagonistaDomicilio);
      if (!padreDomicilio && padreConvive !== false) setValue('padre_domicilio', protagonistaDomicilio);
    }
  }, [protagonistaDomicilio, madreDomicilio, madreConvive, padreDomicilio, padreConvive, setValue]);

  useEffect(() => {
    if (!protagonistaTelefono) {
      if (madreTelefono) setValue('protagonista_telefono', madreTelefono);
      else if (padreTelefono) setValue('protagonista_telefono', padreTelefono);
    }
  }, [protagonistaTelefono, madreTelefono, padreTelefono, setValue]);

  useEffect(() => {
    if (!formData.tel_emergencia_1) {
      if (protagonistaTelefono) setValue('tel_emergencia_1', protagonistaTelefono);
      else if (madreTelefono) setValue('tel_emergencia_1', madreTelefono);
    }
    if (!formData.tel_emergencia_2 && padreTelefono && padreTelefono !== formData.tel_emergencia_1) {
      setValue('tel_emergencia_2', padreTelefono);
    }
  }, [protagonistaTelefono, madreTelefono, padreTelefono, formData.tel_emergencia_1, formData.tel_emergencia_2, setValue]);

  const tieneCondicionEspecial = Boolean(
    formData.condicion_salud_preexistente || formData.tiene_cud || formData.enfermedad_cronica,
  );

  const secciones = esquema.secciones || [];
  const seccionActual = secciones[pasoActivo] || secciones[0];

  const [errorValidacion, setErrorValidacion] = useState<string | null>(null);

  const irAPaso = (index: number) => {
    if (index >= 0 && index < secciones.length) {
      setPasoActivo(index);
      setErrorValidacion(null);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Guardar borrador NO debe bloquearse con validaciones estrictas
  const handleGuardarBorrador = () => {
    setErrorValidacion(null);
    return onSubmit(watch(), false);
  };

  // Finalizar valida y, si hay error, salta automáticamente al paso donde falta completar
  const onFinalizarValido = (data: Record<string, unknown>) => {
    setErrorValidacion(null);
    return onSubmit(data, true);
  };

  const onFinalizarError = (formErrors: any) => {
    const errorKeys = Object.keys(formErrors);
    if (errorKeys.length === 0) return;
    const primeraClave = errorKeys[0];

    const pasoConError = secciones.findIndex((sec) =>
      sec.campos.some((c) => c.key === primeraClave),
    );

    if (pasoConError !== -1) {
      const nombrePaso = secciones[pasoConError]?.titulo || `Paso ${pasoConError + 1}`;
      setErrorValidacion(`Falta completar campos obligatorios en: ${nombrePaso}`);
      irAPaso(pasoConError);
    }
  };

  const handleFinalizarFirma = handleSubmit(onFinalizarValido, onFinalizarError);

  const getBadgeInfo = (sec: SeccionSchema) => {
    if (sec.id === 'seccion_necesidades_especiales') {
      if (formData.tiene_cud) {
        return {
          label: 'Obligatorio (por CUD)',
          stepperSub: '(Obligatorio)',
          className: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300',
        };
      }
      return {
        label: 'Si aplica',
        stepperSub: '(Si aplica)',
        className: 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300',
      };
    }
    if (sec.id === 'seccion_retiro_menores') {
      return {
        label: 'Si aplica',
        stepperSub: '(Si aplica)',
        className: 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300',
      };
    }
    if (sec.id === 'seccion_ficha_adultos') {
      return {
        label: 'Voluntario',
        stepperSub: '(Voluntario)',
        className: 'bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300',
      };
    }
    return {
      label: 'Obligatorio',
      stepperSub: '',
      className: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300',
    };
  };

  const badgeActual = seccionActual ? getBadgeInfo(seccionActual) : null;

  return (
    <div className="space-y-6">
      {/* Barra de progreso y pestañas de pasos */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 md:p-6 border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg md:text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <span>Paso {pasoActivo + 1} de {secciones.length}:</span>
              <span className="text-emerald-700 dark:text-emerald-400">{seccionActual?.titulo}</span>
            </h2>
            <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              {seccionActual?.descripcion || 'Complete los campos solicitados para el legajo oficial.'}
            </p>
          </div>
          {badgeActual && (
            <span className={`text-xs px-3 py-1 rounded-full font-semibold ${badgeActual.className}`}>
              {badgeActual.label}
            </span>
          )}
        </div>

        {/* Stepper horizontal responsivo */}
        <div className="grid grid-cols-4 md:grid-cols-7 gap-2 pt-2">
          {secciones.map((sec, idx) => {
            const esActivo = idx === pasoActivo;
            const esPasado = idx < pasoActivo;
            const badge = getBadgeInfo(sec);

            return (
              <button
                key={sec.id}
                type="button"
                onClick={() => irAPaso(idx)}
                className={`flex flex-col items-center p-2 rounded-xl text-center transition-all ${
                  esActivo
                    ? 'bg-emerald-700 text-white shadow-md shadow-emerald-700/20 ring-2 ring-emerald-500'
                    : esPasado
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                    : 'bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <div className="mb-1">
                  {esPasado ? <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" /> : (PASO_ICONOS[sec.id] || <FileText className="w-5 h-5" />)}
                </div>
                <span className="text-[11px] font-medium line-clamp-1 leading-tight">
                  {idx + 1}. {sec.titulo.split('.')[1] ? sec.titulo.split('.')[1].trim() : sec.titulo}
                </span>
                {badge.stepperSub && (
                  <span className={`text-[9px] mt-0.5 ${esActivo ? 'text-emerald-100' : 'text-slate-500 dark:text-slate-400'}`}>
                    {badge.stepperSub}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Sugerencia inteligente si marcó condición especial */}
      {tieneCondicionEspecial && pasoActivo < 4 && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 rounded-xl p-4 flex items-start gap-3 text-amber-900 dark:text-amber-200 text-sm">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-semibold">Atención pedagógica:</span> Notamos que indicaste alguna condición médica preexistente, CUD o enfermedad crónica. Recuerda que en el <strong>Paso 5 (Ficha de Necesidades Especiales)</strong> podrás detallar los cuidados, gustos y apoyos para que los educadores adapten las actividades de la mejor forma.
          </div>
          <button
            type="button"
            onClick={() => irAPaso(4)}
            className="text-xs bg-amber-200 dark:bg-amber-900/60 hover:bg-amber-300 dark:hover:bg-amber-800 px-3 py-1.5 rounded-lg font-medium text-amber-900 dark:text-amber-100 shrink-0"
          >
            Ir al Paso 5
          </button>
        </div>
      )}

      {errorValidacion && (
        <div className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-xl p-4 flex items-center gap-3 text-red-800 dark:text-red-200 text-sm animate-pulse">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0" />
          <span className="font-semibold">{errorValidacion}</span>
        </div>
      )}

      {/* Contenido del paso actual */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 md:p-8 border border-slate-200 dark:border-slate-800 shadow-xs space-y-6">
        <div className="border-b border-slate-100 dark:border-slate-800 pb-4 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2.5">
              <span className="p-2 bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 rounded-xl">
                {PASO_ICONOS[seccionActual?.id] || <FileText className="w-5 h-5" />}
              </span>
              {seccionActual?.titulo}
            </h3>
            {seccionActual?.permiteCopiarHermano && (
              <span className="inline-block text-xs bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 px-2.5 py-0.5 rounded-full font-medium">
                👨‍👩‍👧‍👦 Datos compartidos con hermanos
              </span>
            )}
          </div>
          {seccionActual?.descripcion && (
            <p className="text-xs md:text-sm text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 p-3.5 rounded-xl border border-slate-100 dark:border-slate-800">
              {seccionActual.descripcion}
            </p>
          )}
        </div>

        {/* Banner informativo y términos oficiales para Salidas Cercanas */}
        {Boolean(seccionActual?.id === 'seccion_autorizacion_salidas') && (
          <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 rounded-xl p-5 space-y-3 text-slate-700 dark:text-slate-300 text-xs md:text-sm">
            <div className="flex items-start gap-3 text-emerald-800 dark:text-emerald-300 font-semibold text-sm md:text-base border-b border-slate-200 dark:border-slate-700 pb-2">
              <Compass className="w-5 h-5 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
              <span>Condiciones Oficiales de la Autorización Anual para Salidas Cercanas (SAAC 07-21)</span>
            </div>
            <p className="leading-relaxed">
              De conformidad con las normas de <strong>Scouts de Argentina Asociación Civil (Capítulo 4 del Manual General de Normas)</strong>, esta autorización habilita al menor a realizar actividades planificadas por los Educadores Scout fuera de la sede del Grupo durante el <strong>ciclo 2026</strong>, <em>siempre y cuando la salida no requiera pernocte</em>:
            </p>
            <ul className="list-disc list-inside space-y-1 pl-1 text-slate-600 dark:text-slate-300">
              <li>Juegos por el barrio o localidad, y visitas a plazas o parques cercanos.</li>
              <li>Actividades comunitarias, religiosas, servicios, recolección o eventos barriales.</li>
              <li>Traslado oficial por parte de la Institución por los medios de transporte dispuestos por la misma.</li>
            </ul>
            <p className="text-[11px] md:text-xs text-slate-500 dark:text-slate-400 italic bg-white dark:bg-slate-900/60 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
              📌 <strong>Nota:</strong> Para campamentos, salidas con pernocte o actividades especiales fuera de este marco, la jefatura solicitará la autorización individual correspondiente previa al evento.
            </p>
            <div className="flex flex-wrap gap-4 pt-1 text-xs text-slate-600 dark:text-slate-300">
              <span><strong>Autorizante:</strong> {String(formData.autorizante_nombre || 'Madre / Padre / Tutor asignado en Paso 3')}</span>
              <span><strong>DNI:</strong> {String(formData.autorizante_dni || '---')}</span>
              <span><strong>Carácter:</strong> {String(formData.autorizante_caracter || 'Madre / Padre / Tutor')}</span>
            </div>
          </div>
        )}

        {/* Banner especial para Retiro de Menores */}
        {Boolean(seccionActual?.id === 'seccion_retiro_menores') && (
          <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/80 rounded-xl p-4 flex items-start gap-3 text-blue-900 dark:text-blue-200 text-xs md:text-sm">
            <UserCheck className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block mb-1">Personas Autorizadas a Retirar al Protagonista:</span>
              Indique a continuación a las personas mayores autorizadas expresamente por la familia para retirar al menor de las actividades scout (abuelos, tíos, vecinos, etc.). Si autoriza a que el menor se retire solo/a por sus propios medios, indíquelo al pie en la casilla correspondiente.
            </div>
          </div>
        )}

        {/* Banner especial para CUD en Necesidades Especiales */}
        {Boolean(seccionActual?.id === 'seccion_necesidades_especiales' && formData.tiene_cud) && (
          <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/80 rounded-xl p-4 flex items-start gap-3 text-emerald-900 dark:text-emerald-200 text-xs md:text-sm">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block mb-0.5">Sección obligatoria por CUD:</span>
              Al haber indicado que el protagonista cuenta con CUD en la Declaración Jurada de Salud, es obligatorio completar el diagnóstico y vencimiento/orientación prestacional para su correcta integración scout.
            </div>
          </div>
        )}

        {/* Formulario de campos */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {seccionActual?.campos.map((campo) => {
            const error = errors[campo.key]?.message as string | undefined;

            // Obligatoriedad condicional para CUD en Necesidades Especiales
            const esRequerido = Boolean(
              campo.required ||
              (seccionActual?.id === 'seccion_necesidades_especiales' &&
                formData.tiene_cud &&
                (campo.key === 'ne_diagnostico' || campo.key === 'ne_cud_vencimiento_prestacion'))
            );

            // Tipo Boolean (Checkbox)
            if (campo.type === 'boolean') {
              const isChecked = Boolean(formData[campo.key]);
              return (
                <div
                  key={campo.key}
                  className={`flex items-start gap-3 p-3.5 rounded-xl border transition-all md:col-span-2 ${
                    isChecked
                      ? 'bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800'
                      : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <input
                    type="checkbox"
                    id={campo.key}
                    {...register(campo.key)}
                    className="h-5 w-5 rounded border-slate-300 dark:border-slate-700 text-emerald-700 focus:ring-emerald-500 bg-white dark:bg-slate-800 mt-0.5 cursor-pointer"
                  />
                  <label htmlFor={campo.key} className="text-sm font-medium text-slate-800 dark:text-slate-200 cursor-pointer flex-1">
                    {campo.label} {esRequerido && <span className="text-red-500">*</span>}
                  </label>
                </div>
              );
            }

            // Tipo Select (Dropdown)
            if (campo.type === 'select' && campo.options) {
              return (
                <div key={campo.key} className="space-y-1.5 md:col-span-2">
                  <label htmlFor={campo.key} className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    {campo.label} {esRequerido && <span className="text-red-500">*</span>}
                  </label>
                  <select
                    id={campo.key}
                    {...register(campo.key, {
                      required: esRequerido ? 'Este campo es obligatorio' : false,
                    })}
                    className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors cursor-pointer"
                  >
                    <option value="">-- Seleccionar opción --</option>
                    {campo.options.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  {error && <p className="text-xs text-red-500">{error}</p>}
                </div>
              );
            }

            // Tipo Textarea
            if (campo.type === 'textarea') {
              return (
                <div key={campo.key} className="space-y-1.5 md:col-span-2">
                  <label htmlFor={campo.key} className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    {campo.label} {esRequerido && <span className="text-red-500">*</span>}
                  </label>
                  <textarea
                    id={campo.key}
                    rows={3}
                    {...register(campo.key, {
                      required: esRequerido ? 'Este campo es obligatorio' : false,
                    })}
                    className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors"
                  />
                  {error && <p className="text-xs text-red-500">{error}</p>}
                </div>
              );
            }

            // Tipo Tabla de Materiales (Préstamo y Donación)
            if (campo.type === 'materiales_tabla') {
              return (
                <div key={campo.key} className="md:col-span-2 space-y-4 pt-2">
                  <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 md:p-6">
                    <div className="flex items-center gap-2.5 mb-2">
                      <span className="p-1.5 bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 rounded-lg">
                        <Sparkles className="w-4 h-4" />
                      </span>
                      <h4 className="font-bold text-slate-800 dark:text-slate-100 text-sm md:text-base">
                        Relevamiento de Materiales y Herramientas (Préstamo o Donación)
                      </h4>
                    </div>
                    <p className="text-xs md:text-sm text-slate-600 dark:text-slate-300 mb-5 leading-relaxed">
                      Marque con una tilde en la casilla correspondiente si su familia puede <strong>prestar</strong> (para uso durante actividades o campamentos y luego devolver) o <strong>donar</strong> al Grupo Scout:
                    </p>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Columna Materiales de Construcción */}
                      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
                        <div className="bg-slate-100 dark:bg-slate-800/90 px-3.5 py-2.5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                          <span className="font-bold text-xs md:text-sm text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                            <span>🏗️</span> Material de Construcción
                          </span>
                          <div className="flex items-center gap-2 text-[11px] font-bold text-slate-600 dark:text-slate-400">
                            <span className="w-16 text-center text-blue-700 dark:text-blue-400">Préstamo</span>
                            <span className="w-16 text-center text-emerald-700 dark:text-emerald-400">Donación</span>
                          </div>
                        </div>
                        <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
                          {MATERIALES_CONSTRUCCION.map((item) => {
                            const preKey = `mat_${item.key}_prestamo`;
                            const donKey = `mat_${item.key}_donacion`;
                            const isPre = Boolean(formData[preKey]);
                            const isDon = Boolean(formData[donKey]);

                            return (
                              <div
                                key={item.key}
                                className={`flex items-center justify-between px-3.5 py-2 text-xs transition-colors ${
                                  isPre || isDon
                                    ? 'bg-emerald-50/50 dark:bg-emerald-950/20'
                                    : 'hover:bg-slate-50/60 dark:hover:bg-slate-800/40'
                                }`}
                              >
                                <span className="font-medium text-slate-700 dark:text-slate-300 pr-2">
                                  {item.label}
                                </span>
                                <div className="flex items-center gap-2 shrink-0">
                                  <label
                                    title={`Prestar ${item.label}`}
                                    className="w-16 flex items-center justify-center py-1 cursor-pointer hover:bg-blue-50/50 dark:hover:bg-blue-950/20 rounded"
                                  >
                                    <input
                                      type="checkbox"
                                      {...register(preKey)}
                                      className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                    />
                                  </label>
                                  <label
                                    title={`Donar ${item.label}`}
                                    className="w-16 flex items-center justify-center py-1 cursor-pointer hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20 rounded"
                                  >
                                    <input
                                      type="checkbox"
                                      {...register(donKey)}
                                      className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                                    />
                                  </label>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Columna Materiales de Campamento */}
                      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
                        <div className="bg-slate-100 dark:bg-slate-800/90 px-3.5 py-2.5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                          <span className="font-bold text-xs md:text-sm text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                            <span>⛺</span> Material de Campamento
                          </span>
                          <div className="flex items-center gap-2 text-[11px] font-bold text-slate-600 dark:text-slate-400">
                            <span className="w-16 text-center text-blue-700 dark:text-blue-400">Préstamo</span>
                            <span className="w-16 text-center text-emerald-700 dark:text-emerald-400">Donación</span>
                          </div>
                        </div>
                        <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
                          {MATERIALES_CAMPAMENTO.map((item) => {
                            const preKey = `mat_${item.key}_prestamo`;
                            const donKey = `mat_${item.key}_donacion`;
                            const isPre = Boolean(formData[preKey]);
                            const isDon = Boolean(formData[donKey]);

                            return (
                              <div
                                key={item.key}
                                className={`flex items-center justify-between px-3.5 py-2 text-xs transition-colors ${
                                  isPre || isDon
                                    ? 'bg-emerald-50/50 dark:bg-emerald-950/20'
                                    : 'hover:bg-slate-50/60 dark:hover:bg-slate-800/40'
                                }`}
                              >
                                <span className="font-medium text-slate-700 dark:text-slate-300 pr-2">
                                  {item.label}
                                </span>
                                <div className="flex items-center gap-2 shrink-0">
                                  <label
                                    title={`Prestar ${item.label}`}
                                    className="w-16 flex items-center justify-center py-1 cursor-pointer hover:bg-blue-50/50 dark:hover:bg-blue-950/20 rounded"
                                  >
                                    <input
                                      type="checkbox"
                                      {...register(preKey)}
                                      className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                    />
                                  </label>
                                  <label
                                    title={`Donar ${item.label}`}
                                    className="w-16 flex items-center justify-center py-1 cursor-pointer hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20 rounded"
                                  >
                                    <input
                                      type="checkbox"
                                      {...register(donKey)}
                                      className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                                    />
                                  </label>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            }

            // Tipos de Input común (text, date, email, tel, number)
            const esMiedoFobia = campo.key === 'miedo_fobia_detalle';
            const companionBoolKey = COMPANION_BOOLEANS[campo.key];

            return (
              <div key={campo.key} className={`space-y-1.5 ${esMiedoFobia ? 'md:col-span-2' : ''}`}>
                <label htmlFor={campo.key} className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  {campo.label} {esRequerido && <span className="text-red-500">*</span>}
                </label>
                <input
                  type={campo.type || 'text'}
                  id={campo.key}
                  placeholder={
                    esMiedoFobia
                      ? 'Especifique el miedo o fobia (ej. alturas, oscuridad, perros, encierro, etc.)'
                      : undefined
                  }
                  {...register(campo.key, {
                    required: esRequerido ? 'Este campo es obligatorio' : false,
                    onChange: (e) => {
                      if (companionBoolKey && e.target.value && e.target.value.trim().length > 0) {
                        setValue(companionBoolKey, true);
                      }
                    },
                  })}
                  className={`w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border rounded-xl text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-colors ${
                    esMiedoFobia && formData.miedo_fobia_excesivo
                      ? 'border-emerald-400 dark:border-emerald-700 ring-1 ring-emerald-400/30'
                      : 'border-slate-200 dark:border-slate-700'
                  }`}
                />
                {esMiedoFobia && (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    💡 Si el protagonista padece algún miedo excesivo o fobia, descríbalo aquí para que los educadores tomen los recaudos pedagógicos necesarios durante las actividades y campamentos.
                  </p>
                )}
                {error && <p className="text-xs text-red-500">{error}</p>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Barra de navegación inferior y acciones */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 md:p-6 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={pasoActivo === 0}
            onClick={() => irAPaso(pasoActivo - 1)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed font-medium text-sm transition-all cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
            Anterior
          </button>

          <button
            type="button"
            disabled={pasoActivo === secciones.length - 1}
            onClick={() => irAPaso(pasoActivo + 1)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 dark:bg-slate-700 text-white hover:bg-slate-900 dark:hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed font-medium text-sm transition-all cursor-pointer"
          >
            Siguiente
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-3 ml-auto">
          <button
            type="button"
            onClick={handleGuardarBorrador}
            disabled={cargando}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium text-sm transition-all cursor-pointer"
          >
            <Save className="w-4 h-4 text-slate-500" />
            Guardar Borrador
          </button>

          <button
            type="button"
            onClick={handleFinalizarFirma}
            disabled={cargando}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-medium text-sm shadow-md shadow-emerald-700/20 transition-all cursor-pointer"
          >
            <Download className="w-4 h-4" />
            Finalizar y Generar PDF Oficial
          </button>
        </div>
      </div>
    </div>
  );
};
