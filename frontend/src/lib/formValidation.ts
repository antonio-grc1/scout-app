import {
  OPCIONES_ALERGIA_ESTANDAR,
  OPCIONES_CONDICION_ESTANDAR,
  OPCIONES_DIETA_ESTANDAR,
  OPCIONES_MEDICACION_ESTANDAR,
  type OpcionMedica,
} from './alertasMedicas';
import {
  MATERIALES_CAMPAMENTO,
  MATERIALES_CONSTRUCCION,
  resumirMaterialesAdultos,
} from './formatters';

export interface CampoSchema {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  options?: { label: string; value: string }[];
  detalleKey?: string;
  esDetalleDe?: string;
  categoriaMedica?: string;
  critico?: boolean;
  persistirEnPerfil?: boolean;
  visibleSi?: {
    campo: string;
    valor?: unknown;
  };
}

export type MembreteDocumento =
  | 'GRUPO_JUAN_XXIII'
  | 'SALUD_NACIONAL'
  | 'AUTORIZACION_OFICIAL'
  | 'SIMPLE';

export interface SeccionSchema {
  id: string;
  titulo: string;
  nombreCorto?: string;
  icono?: string;
  descripcion?: string;
  textoLegal?: string;
  saltoPaginaAntes?: boolean;
  ocultarTablaCamposEnPdf?: boolean;
  firmasSeccion?: string[];
  permiteCopiarHermano?: boolean;
  campos: CampoSchema[];
}

export interface EsquemaCampos {
  destinatario?: 'TODOS' | 'MENORES' | 'MAYORES' | 'EDUCADORES';
  edadMinima?: number;
  edadMaxima?: number;
  tipoMiembro?: 'TODOS' | 'PROTAGONISTA' | 'EDUCADOR';
  esPrincipal?: boolean;
  orden?: number;
  tituloDocumento?: string;
  subtituloDocumento?: string;
  membrete?: MembreteDocumento;
  mostrarResumenMiembro?: boolean;
  textoIntroduccion?: string;
  textoCierre?: string;
  firmas?: string[];
  secciones: SeccionSchema[];
}

export type FamiliarTab = 'madre' | 'padre' | 'tutor';

export const FAMILIAR_TABS: readonly FamiliarTab[] = ['madre', 'padre', 'tutor'];

export const FAMILIAR_CORE_SUFFIXES = [
  'nombres',
  'dni',
  'domicilio',
  'email',
  'telefono',
] as const;

export const VACUNAS_TEXTO_KEYS = [
  'vacuna_quintuple',
  'vacuna_triple_celular',
  'vacuna_triple_acelular',
  'vacuna_doble_bacteriana',
] as const;

export const NOMBRES_CORTOS_PASO: Record<string, string> = {
  seccion_inscripcion: 'Inscripción',
  seccion_salud: 'Salud',
  seccion_autorizacion_ingreso: 'Ingreso',
  seccion_autorizacion_salidas: 'Salidas',
  seccion_necesidades_especiales: 'Apoyos',
  seccion_retiro_menores: 'Retiro',
  seccion_ficha_adultos: 'Voluntariado',
};

// Mapa: interruptor booleano -> campo de detalle asociado (se muestra solo cuando aplica)
export const DETALLE_POR_BOOLEAN: Record<string, string> = {
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

export const CAMPOS_DETALLE_OCULTOS = new Set(Object.values(DETALLE_POR_BOOLEAN));

export const SELECTOR_POR_BOOLEAN: Record<
  string,
  { key: string; titulo: string; opciones: readonly OpcionMedica[] }
> = {
  regimen_dietario: {
    key: 'regimen_dietario_tipos',
    titulo: 'Seleccioná el tipo de régimen o restricción',
    opciones: OPCIONES_DIETA_ESTANDAR,
  },
  sufre_alergia: {
    key: 'alergias_tipos',
    titulo: 'Categorías de alergia',
    opciones: OPCIONES_ALERGIA_ESTANDAR,
  },
  toma_medicacion: {
    key: 'medicacion_tipos',
    titulo: 'Tipo de medicación',
    opciones: OPCIONES_MEDICACION_ESTANDAR,
  },
  enfermedad_cronica: {
    key: 'condiciones_medicas_tipos',
    titulo: 'Condición o enfermedad crónica',
    opciones: OPCIONES_CONDICION_ESTANDAR,
  },
};

export const CHIPS_RAPIDOS: Record<string, { label: string; value: string }[]> = {
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

export function obtenerNombreCortoSeccion(sec: SeccionSchema | undefined, idx: number): string {
  return (
    sec?.nombreCorto ||
    (sec?.id ? NOMBRES_CORTOS_PASO[sec.id] : undefined) ||
    sec?.titulo ||
    `Paso ${idx + 1}`
  );
}

/**
 * Normaliza valores iniciales al abrir el formulario:
 * - Activa switches booleanos cuando ya existen chips seleccionados en el array asociado.
 * - Inicializa `sit_cualquier_actividad_fisica` en `true` (o `false` si ya hay una restricción cargada)
 *   cuando venía `undefined`, sin pisar nunca un `false` explícito.
 */
export function normalizarValoresInicialesFormulario(
  esquema: EsquemaCampos,
  valoresIniciales: Record<string, unknown> = {},
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...valoresIniciales };

  for (const [boolKey, cfg] of Object.entries(SELECTOR_POR_BOOLEAN)) {
    const arr = out[cfg.key];
    if (out[boolKey] === undefined && Array.isArray(arr) && arr.length > 0) {
      out[boolKey] = true;
    }
  }

  const tieneSitActividad = (esquema.secciones || []).some((sec) =>
    sec.campos?.some((c) => c.key === 'sit_cualquier_actividad_fisica'),
  );
  if (tieneSitActividad && out.sit_cualquier_actividad_fisica === undefined) {
    const detalle = String(out.sit_actividad_fisica_no_especifique ?? '').trim();
    out.sit_cualquier_actividad_fisica = detalle === '';
  }

  return out;
}

export interface EstadoFamiliar {
  estado: 'completo' | 'parcial' | 'vacio';
  faltantes: string[];
}

export function evaluarEstadoFamiliar(
  datos: Record<string, unknown>,
  prefijo: FamiliarTab,
): EstadoFamiliar {
  const faltantes = FAMILIAR_CORE_SUFFIXES.map((suf) => `${prefijo}_${suf}`).filter(
    (key) => String(datos[key] ?? '').trim() === '',
  );

  if (faltantes.length === 0) {
    return { estado: 'completo', faltantes: [] };
  }

  const tieneAlgunTexto = Object.entries(datos).some(
    ([k, v]) =>
      k.startsWith(`${prefijo}_`) &&
      typeof v !== 'boolean' &&
      String(v ?? '').trim() !== '',
  );

  return {
    estado: tieneAlgunTexto ? 'parcial' : 'vacio',
    faltantes,
  };
}

export function requiereResponsableFamiliar(
  esquema: EsquemaCampos,
  seccion?: SeccionSchema,
): boolean {
  if (!seccion || seccion.id !== 'seccion_inscripcion') return false;
  if (esquema.destinatario === 'MAYORES') return false;
  if (esquema.destinatario === 'MENORES') return true;
  return seccion.campos.some(
    (c) => (c.key.startsWith('madre_') || c.key.startsWith('padre_')) && Boolean(c.required),
  );
}

export function obtenerCamposOcultosEnSeccion(seccion?: SeccionSchema): Set<string> {
  const ocultos = new Set<string>(CAMPOS_DETALLE_OCULTOS);
  const campos = seccion?.campos || [];
  const keysEnSeccion = new Set(campos.map((c) => c.key));

  for (const c of campos) {
    if (c.detalleKey) ocultos.add(c.detalleKey);
    if (c.esDetalleDe && keysEnSeccion.has(c.esDetalleDe)) {
      ocultos.add(c.key);
    }
    if (c.type === 'boolean' && SELECTOR_POR_BOOLEAN[c.key]) {
      ocultos.add(SELECTOR_POR_BOOLEAN[c.key].key);
    }
  }
  return ocultos;
}

export function esCampoVisibleEnSeccion(
  campo: CampoSchema,
  seccion: SeccionSchema | undefined,
  datos: Record<string, unknown>,
): boolean {
  const ocultos = obtenerCamposOcultosEnSeccion(seccion);
  if (ocultos.has(campo.key)) return false;

  if (
    seccion?.id === 'seccion_ficha_adultos' &&
    campo.key !== 'completar_ficha_adultos' &&
    !datos.completar_ficha_adultos
  ) {
    return false;
  }

  if (
    campo.key === 'sit_actividad_fisica_no_especifique' &&
    Boolean(datos.sit_cualquier_actividad_fisica)
  ) {
    return false;
  }

  if (campo.visibleSi?.campo) {
    const depVal = datos[campo.visibleSi.campo];
    if (campo.visibleSi.valor !== undefined) {
      return depVal === campo.visibleSi.valor;
    }
    return Boolean(depVal);
  }

  return true;
}

export function esCampoRequeridoEnEsquema(
  _esquema: EsquemaCampos,
  seccion: SeccionSchema | undefined,
  campo: CampoSchema,
  datos: Record<string, unknown>,
): boolean {
  if (
    campo.key === 'madre_convive' ||
    campo.key === 'padre_convive' ||
    campo.key === 'tutor_convive'
  ) {
    return false;
  }

  // En Paso 1 la obligatoriedad familiar se valida como grupo ("al menos 1 adulto completo")
  if (
    seccion?.id === 'seccion_inscripcion' &&
    (campo.key.startsWith('madre_') ||
      campo.key.startsWith('padre_') ||
      campo.key.startsWith('tutor_'))
  ) {
    return false;
  }

  if (
    seccion?.id === 'seccion_necesidades_especiales' &&
    Boolean(datos.tiene_cud) &&
    (campo.key === 'ne_diagnostico' || campo.key === 'ne_cud_vencimiento_prestacion')
  ) {
    return true;
  }

  return Boolean(campo.required);
}

export function validarFormatoCampo(campo: CampoSchema, valor: unknown): string | null {
  if (valor === undefined || valor === null || typeof valor === 'boolean' || Array.isArray(valor)) {
    return null;
  }
  const str = String(valor).trim();
  if (!str) return null;

  if (campo.type === 'email') {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(str)) {
      return 'Ingresá un e-mail válido (ej. nombre@dominio.com)';
    }
  }

  if (campo.key.includes('dni')) {
    const soloDigitos = str.replace(/[.\s]/g, '');
    if (!/^\d{7,9}$/.test(soloDigitos)) {
      return 'Ingresá un DNI válido (7 a 9 números)';
    }
  }

  if (campo.type === 'tel') {
    const soloDigitos = str.replace(/[\s\-()+]/g, '');
    if (!/^\d{7,15}$/.test(soloDigitos)) {
      return 'Ingresá un teléfono válido (mínimo 7 números)';
    }
  }

  if (campo.key === 'peso_kg') {
    const norm = str.replace(',', '.');
    const num = Number(norm);
    if (!/^\d{1,3}([.,]\d{1,2})?$/.test(str) || !Number.isFinite(num) || num < 5 || num > 250) {
      return 'Ingresá un peso válido en kg (ej. 52 o 52.5)';
    }
  }

  if (campo.key === 'talla_m') {
    const norm = str.replace(',', '.');
    const num = Number(norm);
    if (!/^\d{1,3}([.,]\d{1,2})?$/.test(str) || !Number.isFinite(num)) {
      return 'Ingresá una altura válida en metros (ej. 1.45)';
    }
    if (num > 3) {
      return 'Ingresá la altura en metros, ej. 1.45 (no en cm)';
    }
    if (num < 0.4 || num > 2.5) {
      return 'Ingresá una altura válida en metros (ej. 1.45)';
    }
  }

  return null;
}

export interface ResultadoValidacion {
  valido: boolean;
  errores: Record<string, string>;
  primerPasoConError: number;
  primeraClaveError?: string;
  tabFamiliarSugerida?: FamiliarTab;
  mensajeResumen?: string;
  pasosConError: number[];
}

function esCampoVacioPorTipo(campo: CampoSchema, valor: unknown): string | null {
  if (campo.type === 'boolean') {
    return valor === true ? null : 'Debés confirmar esta autorización para continuar';
  }
  if (campo.type === 'multiselect') {
    return Array.isArray(valor) && valor.length > 0 ? null : 'Seleccioná al menos una opción';
  }
  if (campo.options || CHIPS_RAPIDOS[campo.key]) {
    return String(valor ?? '').trim() !== '' ? null : 'Seleccioná una opción';
  }
  return String(valor ?? '').trim() !== '' ? null : 'Completá este campo';
}

function resolverParentBooleanDeDetalle(
  campo: CampoSchema,
  seccion: SeccionSchema,
): string | null {
  if (campo.esDetalleDe) return campo.esDetalleDe;
  for (const [boolKey, detKey] of Object.entries(DETALLE_POR_BOOLEAN)) {
    if (detKey === campo.key) return boolKey;
  }
  for (const [boolKey, cfg] of Object.entries(SELECTOR_POR_BOOLEAN)) {
    if (cfg.key === campo.key) return boolKey;
  }
  for (const c of seccion.campos) {
    if (c.detalleKey === campo.key) return c.key;
  }
  return null;
}

export function validarSeccionFormulario(
  esquema: EsquemaCampos,
  seccion: SeccionSchema | undefined,
  datos: Record<string, unknown>,
  pasoIdx = 0,
): ResultadoValidacion {
  if (!seccion) {
    return { valido: true, errores: {}, primerPasoConError: -1, pasosConError: [] };
  }

  const errores: Record<string, string> = {};
  const ocultos = obtenerCamposOcultosEnSeccion(seccion);

  for (const campo of seccion.campos) {
    const estaOcultoPorIntegracion = ocultos.has(campo.key);
    let visible = false;

    if (estaOcultoPorIntegracion) {
      const parentBool = resolverParentBooleanDeDetalle(campo, seccion);
      const colabActiva =
        seccion.id !== 'seccion_ficha_adultos' || Boolean(datos.completar_ficha_adultos);
      visible = Boolean(parentBool && datos[parentBool] === true && colabActiva);
    } else {
      visible = esCampoVisibleEnSeccion(campo, seccion, datos);
    }

    if (!visible) continue;

    const val = datos[campo.key];
    const req = esCampoRequeridoEnEsquema(esquema, seccion, campo, datos);
    if (req) {
      const errReq = esCampoVacioPorTipo(campo, val);
      if (errReq) {
        errores[campo.key] = errReq;
        continue;
      }
    }

    const errFormato = validarFormatoCampo(campo, val);
    if (errFormato) {
      errores[campo.key] = errFormato;
    }
  }

  let tabFamiliarSugerida: FamiliarTab | undefined;
  let faltantesResponsableAgregados = false;

  if (requiereResponsableFamiliar(esquema, seccion)) {
    const evalMadre = evaluarEstadoFamiliar(datos, 'madre');
    const evalPadre = evaluarEstadoFamiliar(datos, 'padre');
    const evalTutor = evaluarEstadoFamiliar(datos, 'tutor');
    const algunoCompleto =
      evalMadre.estado === 'completo' ||
      evalPadre.estado === 'completo' ||
      evalTutor.estado === 'completo';

    if (!algunoCompleto) {
      const candidato =
        evalMadre.estado === 'parcial'
          ? { tab: 'madre' as FamiliarTab, faltantes: evalMadre.faltantes }
          : evalPadre.estado === 'parcial'
            ? { tab: 'padre' as FamiliarTab, faltantes: evalPadre.faltantes }
            : evalTutor.estado === 'parcial'
              ? { tab: 'tutor' as FamiliarTab, faltantes: evalTutor.faltantes }
              : { tab: 'madre' as FamiliarTab, faltantes: evalMadre.faltantes };

      tabFamiliarSugerida = candidato.tab;
      for (const key of candidato.faltantes) {
        if (!errores[key]) {
          errores[key] = 'Completá este campo';
        }
      }
      faltantesResponsableAgregados = candidato.faltantes.length > 0;
    }
  }

  const keysError = Object.keys(errores);
  if (keysError.length === 0) {
    return { valido: true, errores: {}, primerPasoConError: -1, pasosConError: [] };
  }

  const primeraClaveError = keysError[0];
  if (!tabFamiliarSugerida) {
    if (primeraClaveError.startsWith('madre_')) tabFamiliarSugerida = 'madre';
    else if (primeraClaveError.startsWith('padre_')) tabFamiliarSugerida = 'padre';
    else if (primeraClaveError.startsWith('tutor_')) tabFamiliarSugerida = 'tutor';
  }

  const soloErrorFamiliar =
    faltantesResponsableAgregados &&
    keysError.every(
      (k) => k.startsWith('madre_') || k.startsWith('padre_') || k.startsWith('tutor_'),
    );

  const mensajeResumen = soloErrorFamiliar
    ? 'Completá al menos un adulto responsable (Madre, Padre o Tutor): Nombre, DNI, Domicilio, E-mail y Teléfono.'
    : 'Revisá los campos obligatorios marcados con * y verificá el formato antes de continuar.';

  return {
    valido: false,
    errores,
    primerPasoConError: pasoIdx,
    primeraClaveError,
    tabFamiliarSugerida,
    mensajeResumen,
    pasosConError: [pasoIdx],
  };
}

export function validarFormularioCompleto(
  esquema: EsquemaCampos,
  datos: Record<string, unknown>,
): ResultadoValidacion {
  const secciones = esquema.secciones || [];
  const erroresTotales: Record<string, string> = {};
  const pasosConError: number[] = [];
  let primerResultadoInvalido: ResultadoValidacion | null = null;

  secciones.forEach((sec, idx) => {
    const res = validarSeccionFormulario(esquema, sec, datos, idx);
    if (!res.valido) {
      pasosConError.push(idx);
      Object.assign(erroresTotales, res.errores);
      if (!primerResultadoInvalido) {
        primerResultadoInvalido = res;
      }
    }
  });

  if (!primerResultadoInvalido) {
    return { valido: true, errores: {}, primerPasoConError: -1, pasosConError: [] };
  }

  const primerRes: ResultadoValidacion = primerResultadoInvalido;
  const idx = primerRes.primerPasoConError;
  const nombreCorto = obtenerNombreCortoSeccion(secciones[idx], idx);

  return {
    valido: false,
    errores: erroresTotales,
    primerPasoConError: idx,
    primeraClaveError: primerRes.primeraClaveError,
    tabFamiliarSugerida: primerRes.tabFamiliarSugerida,
    mensajeResumen: `Revisá los datos en "${nombreCorto}": ${primerRes.mensajeResumen || 'faltan campos obligatorios.'}`,
    pasosConError,
  };
}

export function limpiarDependenciasDesactivadas(
  esquema: EsquemaCampos,
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...raw };
  const secciones = esquema.secciones || [];

  for (const sec of secciones) {
    for (const c of sec.campos || []) {
      if (c.type === 'boolean' && out[c.key] === false) {
        const sel = SELECTOR_POR_BOOLEAN[c.key];
        if (sel) out[sel.key] = [];
        const detKey = c.detalleKey || DETALLE_POR_BOOLEAN[c.key];
        if (detKey && typeof out[detKey] === 'string') out[detKey] = '';
        for (const hijo of sec.campos || []) {
          if (hijo.esDetalleDe === c.key) {
            if (hijo.type === 'multiselect') out[hijo.key] = [];
            else if (typeof out[hijo.key] === 'string') out[hijo.key] = '';
          }
        }
      }
    }
  }

  if (out.sit_cualquier_actividad_fisica === true) {
    out.sit_actividad_fisica_no_especifique = '';
  }

  if (out.no_tiene_vacunas_mencionadas === true || out.no_sabe_vacunas === true) {
    for (const vacKey of VACUNAS_TEXTO_KEYS) {
      out[vacKey] = '';
    }
  }

  if (out.completar_ficha_adultos === false) {
    for (const item of [...MATERIALES_CONSTRUCCION, ...MATERIALES_CAMPAMENTO]) {
      out[`mat_${item.key}_prestamo`] = false;
      out[`mat_${item.key}_donacion`] = false;
    }
    for (const k of Object.keys(out)) {
      if (k.startsWith('colab_')) {
        out[k] = typeof out[k] === 'boolean' ? false : '';
      } else if (k.startsWith('adulto_') && k !== 'adulto_hijo_nombre') {
        out[k] = typeof out[k] === 'boolean' ? false : '';
      }
    }
    out.adulto_nombre = '';
    out.adulto_profesion = '';
    out.adulto_telefono = '';
    out.adulto_direccion = '';
    out.adulto_localidad = '';
    out.adulto_codigo_postal = '';
    out.adulto_preferencia_trabajo = '';
    out.adulto_observaciones = '';
    out.mat_construccion_prestamo = '';
    out.mat_construccion_donacion = '';
    out.mat_campamento_prestamo = '';
    out.mat_campamento_donacion = '';
  } else if (secciones.some((s) => s.campos?.some((c) => c.type === 'materiales_tabla'))) {
    Object.assign(out, resumirMaterialesAdultos(out));
  }

  return out;
}
