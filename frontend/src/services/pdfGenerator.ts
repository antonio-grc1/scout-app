import {
  degrees,
  PDFCheckBox,
  PDFDocument,
  PDFDropdown,
  type PDFFont,
  type PDFPage,
  PDFRadioGroup,
  PDFTextField,
  rgb,
  StandardFonts,
} from 'pdf-lib';
import QRCode from 'qrcode';
import { PDF_ASSETS } from './pdfAssets';
import {
  OPCIONES_ALERGIA_ESTANDAR,
  OPCIONES_CONDICION_ESTANDAR,
  OPCIONES_DIETA_ESTANDAR,
  OPCIONES_MEDICACION_ESTANDAR,
} from '../lib/alertasMedicas';
import {
  obtenerCicloAnioActual,
  resumirMaterialesAdultos,
} from '../lib/formatters';

const WINANSI_TRANSLITERATIONS: Record<string, string> = {
  '≥': '>=',
  '≤': '<=',
  '≠': '!=',
  '≈': '~',
  '→': '->',
  '←': '<-',
  '↔': '<->',
  '✓': '[x]',
  '✔': '[x]',
  '✗': '[ ]',
  '✘': '[ ]',
  '×': 'x',
  '÷': '/',
  '−': '-',
  '‐': '-',
  '‑': '-',
  '\u00A0': ' ',
  '\u200B': '',
  '\uFEFF': '',
};

const MESES_ES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

/**
 * Normaliza y sanitiza texto para fuentes estándar WinAnsi (StandardFonts.Helvetica),
 * transliterando símbolos frecuentes y descartando caracteres no codificables (ej. emojis).
 */
export function sanitizarTextoWinAnsi(
  texto: unknown,
  puedeCodificar?: (candidato: string) => boolean,
): string {
  if (texto === null || texto === undefined) return '';
  const limpio = String(texto)
    .normalize('NFC')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[\r\n\t]+/g, ' ');

  let out = '';
  for (const ch of limpio) {
    out += WINANSI_TRANSLITERATIONS[ch] ?? ch;
  }

  if (puedeCodificar) {
    try {
      if (puedeCodificar(out)) return out;
    } catch {
      // Continuar con filtrado carácter por carácter
    }
    let seguro = '';
    for (const ch of out) {
      try {
        if (puedeCodificar(ch)) {
          seguro += ch;
        }
      } catch {
        // Omitir caracteres fuera de WinAnsi
      }
    }
    return seguro;
  }

  return out.replace(/[^\x20-\x7E\xA0-\xFF€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]/g, '');
}

/**
 * Crea una hoja A4 en blanco mínima como respaldo cuando un mapeo sin archivo subido
 * no logra descargar su plantilla base.
 */
export async function generarMoldeEnBlancoPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([595.28, 841.89]);
  return await doc.save();
}

function dataUriToBytes(dataUri: string): Uint8Array {
  const base64 = dataUri.includes(',') ? dataUri.split(',')[1] || '' : dataUri;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export interface CoordenadaCampo {
  page?: number;
  x?: number;
  y?: number;
  size?: number;
  maxWidth?: number;
  acroFieldName?: string;
  type?: 'text' | 'checkbox_x';
  trueCoords?: { page?: number; x: number; y: number };
  falseCoords?: { page?: number; x: number; y: number };
}

export interface PaginaCondicionalPdf {
  page: number;
  incluirSiAlguno: string[];
  incluirSiPrefijoTruthy?: string[];
}

export interface QrUbicacionPdf {
  page?: number;
  x: number;
  y: number;
  width?: number;
}

export interface MapeoPdf {
  pdfBaseUrl: string;
  pdfBaseDataUrl?: string;
  pdfFileName?: string;
  modoRender?: 'DISENO_SECCIONES' | 'ESTAMPAR_COORDENADAS' | 'PDF_ACROFORM';
  indexBase?: 0 | 1;
  esquemaDocumento?: Record<string, any>;
  campos: Record<string, CoordenadaCampo>;
  qrVerificacion?: QrUbicacionPdf;
  qrPaginas?: QrUbicacionPdf[];
  paginasCondicionales?: PaginaCondicionalPdf[];
}

export interface CampoAcroFormDetectado {
  key: string;
  acroFieldName: string;
  label: string;
  type: 'text' | 'boolean' | 'select';
  options?: { label: string; value: string }[];
}

export interface ResultadoValidacionAcroForm {
  totalCamposPdf: number;
  vinculados: string[];
  sinPreguntaEnFormulario: CampoAcroFormDetectado[];
}

function calcularEdadSimple(fechaNac?: string | Date): number | null {
  if (!fechaNac) return null;
  let y = 0;
  let m = 0;
  let d = 0;
  if (typeof fechaNac === 'string' && /^\d{4}-\d{2}-\d{2}/.test(fechaNac)) {
    const [ys, ms, ds] = fechaNac.slice(0, 10).split('-');
    y = Number(ys);
    m = Number(ms);
    d = Number(ds);
  } else {
    const parsed = new Date(fechaNac);
    if (isNaN(parsed.getTime())) return null;
    y = parsed.getUTCFullYear();
    m = parsed.getUTCMonth() + 1;
    d = parsed.getUTCDate();
  }
  if (!y || !m || !d) return null;
  const hoy = new Date();
  let edad = hoy.getFullYear() - y;
  const diffMes = hoy.getMonth() + 1 - m;
  if (diffMes < 0 || (diffMes === 0 && hoy.getDate() < d)) edad--;
  return edad;
}

const LABELS_ESTANDAR_POR_VALOR = new Map<string, string>([
  ...OPCIONES_DIETA_ESTANDAR.map((o) => [o.value, o.label] as [string, string]),
  ...OPCIONES_ALERGIA_ESTANDAR.map((o) => [o.value, o.label] as [string, string]),
  ...OPCIONES_MEDICACION_ESTANDAR.map((o) => [o.value, o.label] as [string, string]),
  ...OPCIONES_CONDICION_ESTANDAR.map((o) => [o.value, o.label] as [string, string]),
]);

function formatearChipsYDetalle(
  tiposRaw: unknown,
  detalleRaw: unknown,
  opcionesMap?: Map<string, string>,
): { textoChips: string; combinado: string } {
  const arr = Array.isArray(tiposRaw)
    ? tiposRaw.map((x) => String(x).trim()).filter(Boolean)
    : [];
  const labels = arr.map((v) => opcionesMap?.get(v) || LABELS_ESTANDAR_POR_VALOR.get(v) || v);
  const textoChips = labels.join(', ');
  const detalle = String(detalleRaw ?? '').trim();

  if (textoChips && detalle) return { textoChips, combinado: `${textoChips} — ${detalle}` };
  if (textoChips) return { textoChips, combinado: textoChips };
  return { textoChips: '', combinado: detalle };
}

/**
 * Normaliza y enriquece las respuestas brutas del formulario con textos legibles,
 * desglose de fechas, datos de usuario y prellenado de autorizaciones.
 */
export function prepararRespuestasParaImpresion(
  rawResp: Record<string, unknown>,
  usuario?: {
    nombre: string;
    apellido: string;
    dni: string;
    fechaNacimiento?: string | Date;
    ramaNombre?: string;
    telefonoContacto?: string;
    tipoMiembro?: string;
  },
  esquema?: {
    destinatario?: string;
    tituloDocumento?: string;
    secciones?: Array<{
      campos?: Array<{ key: string; label?: string; options?: { label: string; value: string }[] }>;
    }>;
  },
): Record<string, unknown> {
  const resp: Record<string, unknown> = { ...rawResp };

  // Mapa de etiquetas por campo desde el esquema (si se proveyó)
  const mapaOpcionesPorCampo = new Map<string, Map<string, string>>();
  if (Array.isArray(esquema?.secciones)) {
    for (const sec of esquema.secciones) {
      for (const c of sec?.campos || []) {
        if (Array.isArray(c?.options) && c.options.length > 0) {
          mapaOpcionesPorCampo.set(
            c.key,
            new Map(c.options.map((o) => [String(o.value), String(o.label || o.value)])),
          );
        }
      }
    }
  }

  // 1. Datos básicos del protagonista
  if (usuario) {
    resp.protagonista_nombre_completo = `${usuario.apellido.toUpperCase()}, ${usuario.nombre}`;
    resp.protagonista_apellido = resp.protagonista_apellido || usuario.apellido.toUpperCase();
    resp.protagonista_nombre = resp.protagonista_nombre || usuario.nombre;
    resp.protagonista_dni = usuario.dni;
    resp.salud_apellido = usuario.apellido.toUpperCase();
    resp.salud_nombre = usuario.nombre;
    resp.salud_dni = usuario.dni;
    resp.menor_nombre_p3 = `${usuario.apellido.toUpperCase()}, ${usuario.nombre}`;
    resp.menor_dni_p3 = usuario.dni;
    resp.menor_nombre_p4 = `${usuario.apellido.toUpperCase()}, ${usuario.nombre}`;
    resp.menor_dni_p4 = usuario.dni;
    resp.ret_menor_nombre = `${usuario.apellido.toUpperCase()}, ${usuario.nombre}`;
    resp.ret_menor_dni = usuario.dni;
    if (!resp.adulto_hijo_nombre && esquema?.destinatario !== 'MAYORES') {
      resp.adulto_hijo_nombre = `${usuario.nombre} ${usuario.apellido}`;
    }

    if (usuario.fechaNacimiento) {
      let dd = '';
      let mm = '';
      let yyyy = '';

      if (typeof usuario.fechaNacimiento === 'string' && /^\d{4}-\d{2}-\d{2}/.test(usuario.fechaNacimiento)) {
        [yyyy, mm, dd] = usuario.fechaNacimiento.slice(0, 10).split('-');
      } else {
        const d = new Date(usuario.fechaNacimiento);
        if (!isNaN(d.getTime())) {
          dd = String(d.getUTCDate()).padStart(2, '0');
          mm = String(d.getUTCMonth() + 1).padStart(2, '0');
          yyyy = String(d.getUTCFullYear());
        }
      }

      if (dd && mm && yyyy) {
        const mesNombre = MESES_ES[parseInt(mm, 10) - 1] || mm;
        resp.protagonista_fecha_nac = `${dd} / ${mm} / ${yyyy}`;
        resp.salud_fecha_nac = `${dd} / ${mm} / ${yyyy}`;
        resp.menor_nac_dia_p3 = dd;
        resp.menor_nac_mes_p3 = mesNombre;
        resp.menor_nac_anio_p3 = yyyy;
        resp.menor_nac_dia_p4 = dd;
        resp.menor_nac_mes_p4 = mesNombre;
        resp.menor_nac_anio_p4 = yyyy;
        resp.ret_menor_nac = `${dd} / ${mm} / ${yyyy}`;
        resp.ret_menor_nac_dia_mes = `${dd} / ${mm}`;
        resp.ret_menor_nac_anio = yyyy;
      }
    }

    if (usuario.ramaNombre) {
      resp.rama_nombre = usuario.ramaNombre;
    }
  }

  // 2. Fijos institucionales
  resp.salud_zona = '22';
  resp.salud_distrito = '1';
  resp.salud_grupo = '196';
  resp.ingreso_localidad = 'Córdoba';
  resp.ingreso_departamento = 'Capital';
  resp.ingreso_provincia = 'Córdoba';
  resp.salidas_localidad = 'Córdoba';
  resp.salidas_departamento = 'Capital';
  resp.salidas_provincia = 'Córdoba';
  resp.salidas_ciclo_anio = String(obtenerCicloAnioActual());
  resp.ret_provincia_ciudad = 'Córdoba, Capital';

  // Fecha actual para autorizaciones
  const hoy = new Date();
  resp.ingreso_dia = String(hoy.getDate());
  resp.ingreso_mes = MESES_ES[hoy.getMonth()];
  resp.ingreso_anio = String(hoy.getFullYear());
  resp.salidas_dia = String(hoy.getDate());
  resp.salidas_mes = MESES_ES[hoy.getMonth()];
  resp.salidas_anio = String(hoy.getFullYear());
  resp.salud_firmante_fecha = `${String(hoy.getDate()).padStart(2, '0')} / ${String(hoy.getMonth() + 1).padStart(2, '0')} / ${hoy.getFullYear()}`;
  resp.ret_fecha_completa = `${String(hoy.getDate()).padStart(2, '0')} / ${String(hoy.getMonth() + 1).padStart(2, '0')} / ${hoy.getFullYear()}`;

  // Domicilios compartidos con protagonista
  const domProtagonista = String(
    resp.protagonista_domicilio ||
    resp.domicilio ||
    resp.madre_domicilio ||
    resp.padre_domicilio ||
    resp.tutor_domicilio ||
    ''
  );
  resp.protagonista_domicilio = domProtagonista;
  resp.domicilio = domProtagonista;
  resp.salud_domicilio = domProtagonista;
  resp.menor_domicilio_p3 = domProtagonista;
  resp.menor_domicilio_p4 = domProtagonista;
  resp.ret_menor_domicilio = domProtagonista;

  // Teléfonos compartidos
  const telProtagonista = String(
    resp.protagonista_telefono ||
    resp.telefono_contacto ||
    resp.telefono ||
    resp.madre_telefono ||
    resp.padre_telefono ||
    resp.tutor_telefono ||
    resp.tel_emergencia_1 ||
    usuario?.telefonoContacto ||
    ''
  );
  resp.protagonista_telefono = telProtagonista;
  resp.telefono_contacto = telProtagonista;
  if (!resp.tel_emergencia_1) resp.tel_emergencia_1 = telProtagonista;

  // Domicilio adulto (solo heredar del protagonista si explícitamente convive y la persona está cargada)
  if (domProtagonista && !resp.madre_domicilio && resp.madre_convive === true && resp.madre_nombres) {
    resp.madre_domicilio = domProtagonista;
  }
  if (domProtagonista && !resp.padre_domicilio && resp.padre_convive === true && resp.padre_nombres) {
    resp.padre_domicilio = domProtagonista;
  }
  if (domProtagonista && !resp.tutor_domicilio && resp.tutor_convive === true && resp.tutor_nombres) {
    resp.tutor_domicilio = domProtagonista;
  }

  // Booleans a textos SI/NO
  const formatBool = (val: unknown): string => (val ? 'SÍ' : 'NO');

  resp.tiene_hermanos_texto = formatBool(resp.tiene_hermanos);
  resp.hobby_texto = resp.realiza_hobby ? (resp.hobby_detalle ? `SÍ: ${resp.hobby_detalle}` : 'SÍ') : 'NO';
  resp.condicion_salud_preexistente_texto = formatBool(resp.condicion_salud_preexistente);
  resp.madre_convive_texto = resp.madre_nombres ? formatBool(resp.madre_convive) : '';
  resp.padre_convive_texto = resp.padre_nombres ? formatBool(resp.padre_convive) : '';
  resp.tutor_convive_texto = resp.tutor_nombres ? formatBool(resp.tutor_convive) : '';

  // Salud booleans, chips multiselect y textos combinados
  const medFmt = formatearChipsYDetalle(
    resp.medicacion_tipos,
    resp.toma_medicacion_detalle,
    mapaOpcionesPorCampo.get('medicacion_tipos'),
  );
  const tieneMed = Boolean(resp.toma_medicacion || medFmt.textoChips || medFmt.combinado);
  resp.salud_toma_medicacion = formatBool(tieneMed);
  resp.toma_medicacion_texto = resp.salud_toma_medicacion;
  resp.salud_toma_medicacion_detalle = medFmt.combinado;
  resp.toma_medicacion_detalle = medFmt.combinado;

  const condFmt = formatearChipsYDetalle(
    resp.condiciones_medicas_tipos,
    resp.enfermedad_cronica_detalle,
    mapaOpcionesPorCampo.get('condiciones_medicas_tipos'),
  );
  const tieneCond = Boolean(resp.enfermedad_cronica || condFmt.textoChips || condFmt.combinado);
  resp.salud_enfermedad_cronica = formatBool(tieneCond);
  resp.enfermedad_cronica_texto = resp.salud_enfermedad_cronica;
  resp.salud_enfermedad_cronica_detalle = condFmt.combinado;
  resp.enfermedad_cronica_detalle = condFmt.combinado;

  resp.salud_requiere_tratamiento = formatBool(resp.requiere_tratamiento);
  resp.requiere_tratamiento_texto = resp.salud_requiere_tratamiento;
  resp.salud_requiere_tratamiento_detalle = resp.requiere_tratamiento_detalle || '';

  resp.salud_tiene_cud = formatBool(resp.tiene_cud);
  resp.tiene_cud_texto = resp.salud_tiene_cud;

  const alerFmt = formatearChipsYDetalle(
    resp.alergias_tipos,
    resp.sufre_alergia_detalle,
    mapaOpcionesPorCampo.get('alergias_tipos'),
  );
  const tieneAler = Boolean(resp.sufre_alergia || alerFmt.textoChips || alerFmt.combinado);
  resp.salud_sufre_alergia = formatBool(tieneAler);
  resp.sufre_alergia_texto = resp.salud_sufre_alergia;
  resp.salud_sufre_alergia_detalle = alerFmt.combinado;
  resp.sufre_alergia_detalle = alerFmt.combinado;

  resp.salud_anticoagulado = formatBool(resp.esta_anticoagulado);
  resp.esta_anticoagulado_texto = resp.salud_anticoagulado;
  resp.salud_anticoagulado_droga = resp.anticoagulado_droga || '';

  const dietaFmt = formatearChipsYDetalle(
    resp.regimen_dietario_tipos,
    resp.regimen_dietario_detalle,
    mapaOpcionesPorCampo.get('regimen_dietario_tipos'),
  );
  const tieneDieta = Boolean(resp.regimen_dietario || dietaFmt.textoChips || dietaFmt.combinado);
  resp.salud_regimen_dietario = formatBool(tieneDieta);
  resp.regimen_dietario_texto = resp.salud_regimen_dietario;
  resp.salud_regimen_dietario_detalle = dietaFmt.combinado;
  resp.regimen_dietario_detalle = dietaFmt.combinado;

  resp.salud_ataques_panico = formatBool(resp.ataques_panico_ansiedad);
  resp.ataques_panico_ansiedad_texto = resp.salud_ataques_panico;
  resp.salud_ataques_panico_frecuencia = resp.ataques_panico_frecuencia || '';

  resp.salud_salud_mental = formatBool(resp.diagnostico_salud_mental);
  resp.diagnostico_salud_mental_texto = resp.salud_salud_mental;
  resp.salud_salud_mental_detalle = resp.diagnostico_salud_mental_detalle || '';

  resp.salud_tratamiento_mental = formatBool(resp.recibe_tratamiento_salud_mental);
  resp.recibe_tratamiento_salud_mental_texto = resp.salud_tratamiento_mental;
  resp.salud_tratamiento_mental_detalle = resp.recibe_tratamiento_salud_mental_detalle || '';

  resp.salud_fobia = formatBool(resp.miedo_fobia_excesivo);
  resp.miedo_fobia_excesivo_texto = resp.salud_fobia;
  resp.salud_fobia_detalle = resp.miedo_fobia_detalle || '';

  // Situaciones (tabla derecha)
  resp.sit_hemorragias_nasales = formatBool(resp.sit_hemorragias_nasales);
  resp.sit_hemorragias_nasales_texto = resp.sit_hemorragias_nasales;
  resp.sit_sangrado_encias = formatBool(resp.sit_sangrado_encias);
  resp.sit_sangrado_encias_texto = resp.sit_sangrado_encias;
  resp.sit_dolor_cabeza = formatBool(resp.sit_dolor_cabeza);
  resp.sit_dolor_cabeza_texto = resp.sit_dolor_cabeza;
  resp.sit_presion_alta = formatBool(resp.sit_presion_alta);
  resp.sit_presion_alta_texto = resp.sit_presion_alta;
  resp.sit_presion_baja = formatBool(resp.sit_presion_baja);
  resp.sit_presion_baja_texto = resp.sit_presion_baja;
  resp.sit_transfusiones = formatBool(resp.sit_transfusiones);
  resp.sit_transfusiones_texto = resp.sit_transfusiones;
  resp.sit_convulsiones = formatBool(resp.sit_convulsiones);
  resp.sit_convulsiones_texto = resp.sit_convulsiones;
  resp.sit_cirugias_ultimo_anio = formatBool(resp.sit_cirugias_ultimo_anio);
  resp.sit_cirugias_ultimo_anio_texto = resp.sit_cirugias_ultimo_anio;
  resp.sit_internaciones_ultimo_anio = formatBool(resp.sit_internaciones_ultimo_anio);
  resp.sit_internaciones_ultimo_anio_texto = resp.sit_internaciones_ultimo_anio;
  resp.sit_actividad_fisica = formatBool(resp.sit_actividad_fisica);
  resp.sit_actividad_fisica_texto = resp.sit_actividad_fisica;
  resp.sit_cualquier_actividad_fisica = formatBool(resp.sit_cualquier_actividad_fisica);
  resp.sit_cualquier_actividad_fisica_texto = resp.sit_cualquier_actividad_fisica;
  resp.sit_actividad_fisica_no_detalle = resp.sit_actividad_fisica_no_especifique || '';

  // Biometría y teléfonos
  resp.salud_tel_emergencia1 = resp.tel_emergencia_1 || resp.salud_tel_emergencia1 || '';
  resp.salud_tel_emergencia2 = resp.tel_emergencia_2 || resp.salud_tel_emergencia2 || '';

  if (resp.fecha_control_medico) {
    const fcmParts = String(resp.fecha_control_medico).split(/[-/]/);
    if (fcmParts.length === 3) {
      if (fcmParts[0].length === 4) {
        resp.salud_control_medico_fecha = `${fcmParts[2]} / ${fcmParts[1]} / ${fcmParts[0]}`;
      } else {
        resp.salud_control_medico_fecha = `${fcmParts[0]} / ${fcmParts[1]} / ${fcmParts[2]}`;
      }
    } else {
      resp.salud_control_medico_fecha = String(resp.fecha_control_medico);
    }
  } else {
    resp.salud_control_medico_fecha = '';
  }
  resp.fecha_control_medico = resp.salud_control_medico_fecha;

  resp.salud_grupo_sanguineo = resp.grupo_sanguineo || '';
  resp.salud_factor_rh = resp.factor_rh || '';
  resp.salud_peso = resp.peso_kg || '';
  resp.salud_talla = resp.talla_m || '';
  resp.salud_obra_social_emergencia = resp.tel_emergencia_obra_social || '';
  resp.salud_comunicacion_educador_detalle = resp.comunicacion_educador_necesaria || '';

  // Vacunas
  resp.salud_vac_quintuple = resp.vacuna_quintuple || '';
  resp.salud_vac_triple_celular = resp.vacuna_triple_celular || '';
  resp.salud_vac_triple_acelular = resp.vacuna_triple_acelular || '';
  resp.salud_vac_doble_bacteriana = resp.vacuna_doble_bacteriana || '';

  // Obra social en salud
  resp.salud_obra_social = resp.obra_social || '';
  resp.salud_obra_social_afiliado = resp.obra_social_afiliado || '';

  // 3. Selección y prellenado del Adulto Autorizante
  const tipoAut = (resp.autorizante_tipo as string) || 'madre';
  let autNombre = String(resp.autorizante_nombre || '');
  let autDni = String(resp.autorizante_dni || '');
  let autTel = String(resp.autorizante_telefono || '');
  let autDom = String(resp.autorizante_domicilio || '');
  let autCaracter = String(resp.autorizante_caracter || '');

  if (tipoAut === 'madre') {
    autNombre = autNombre || String(resp.madre_nombres || '');
    autDni = autDni || String(resp.madre_dni || '');
    autTel = autTel || String(resp.madre_telefono || '');
    autDom = autDom || String(resp.madre_domicilio || domProtagonista);
    autCaracter = autCaracter || 'Madre';
  } else if (tipoAut === 'padre') {
    autNombre = autNombre || String(resp.padre_nombres || '');
    autDni = autDni || String(resp.padre_dni || '');
    autTel = autTel || String(resp.padre_telefono || '');
    autDom = autDom || String(resp.padre_domicilio || domProtagonista);
    autCaracter = autCaracter || 'Padre';
  } else if (tipoAut === 'tutor') {
    autNombre = autNombre || String(resp.tutor_nombres || '');
    autDni = autDni || String(resp.tutor_dni || '');
    autTel = autTel || String(resp.tutor_telefono || '');
    autDom = autDom || String(resp.tutor_domicilio || domProtagonista);
    autCaracter = autCaracter || 'Tutor judicial';
  }

  const menorNacionalidad = String(resp.menor_nacionalidad || 'Argentina');
  resp.autorizante_nombre_p3 = autNombre;
  resp.autorizante_nacionalidad_p3 = resp.autorizante_nacionalidad || 'Argentina';
  resp.autorizante_dni_p3 = autDni;
  resp.autorizante_telefono_p3 = autTel;
  resp.autorizante_domicilio_p3 = autDom;
  resp.autorizante_caracter_p3 = autCaracter;
  resp.menor_nacionalidad_p3 = menorNacionalidad;

  resp.autorizante_nombre_p4 = autNombre;
  resp.autorizante_nacionalidad_p4 = resp.autorizante_nacionalidad || 'Argentina';
  resp.autorizante_dni_p4 = autDni;
  resp.autorizante_telefono_p4 = autTel;
  resp.autorizante_domicilio_p4 = autDom;
  resp.autorizante_caracter_p4 = autCaracter;
  resp.menor_nacionalidad_p4 = menorNacionalidad;

  resp.ret_autorizante_nombre = autNombre;
  resp.ret_autorizante_nacionalidad = resp.autorizante_nacionalidad || 'Argentina';
  resp.ret_autorizante_dni = autDni;
  resp.ret_autorizante_telefono = autTel;
  resp.ret_autorizante_domicilio = autDom;
  resp.ret_menor_nacionalidad = menorNacionalidad;
  resp.ret_firmante_aclaracion = autNombre;

  resp.salud_firmante_aclaracion = autNombre;
  resp.salud_firmante_dni = autDni;

  const edadUsuario = calcularEdadSimple(usuario?.fechaNacimiento);
  const esFirmantePropio =
    Boolean(usuario) &&
    (usuario?.tipoMiembro === 'EDUCADOR' ||
      esquema?.destinatario === 'EDUCADORES' ||
      esquema?.destinatario === 'MAYORES' ||
      (edadUsuario !== null && edadUsuario >= 18) ||
      !autNombre);

  if (esFirmantePropio && usuario) {
    const nombrePropio = `${usuario.apellido.toUpperCase()}, ${usuario.nombre}`.trim();
    if (nombrePropio) resp.salud_firmante_aclaracion = nombrePropio;
    if (usuario.dni) resp.salud_firmante_dni = usuario.dni;
  }

  // Fecha de nacimiento del adulto (mes legible para 07-21)
  if (resp.autorizante_fecha_nac) {
    const fnParts = String(resp.autorizante_fecha_nac).split(/[-/]/);
    if (fnParts.length === 3) {
      const mesNombreAut = (rawMes: string) => MESES_ES[parseInt(rawMes, 10) - 1] || rawMes;
      if (fnParts[0].length === 4) {
        resp.autorizante_nac_anio_p3 = fnParts[0];
        resp.autorizante_nac_mes_p3 = mesNombreAut(fnParts[1]);
        resp.autorizante_nac_dia_p3 = fnParts[2];
        resp.autorizante_nac_anio_p4 = fnParts[0];
        resp.autorizante_nac_mes_p4 = mesNombreAut(fnParts[1]);
        resp.autorizante_nac_dia_p4 = fnParts[2];
        resp.ret_autorizante_nac = `${fnParts[2]} / ${fnParts[1]} / ${fnParts[0]}`;
      } else {
        resp.autorizante_nac_dia_p3 = fnParts[0];
        resp.autorizante_nac_mes_p3 = mesNombreAut(fnParts[1]);
        resp.autorizante_nac_anio_p3 = fnParts[2];
        resp.autorizante_nac_dia_p4 = fnParts[0];
        resp.autorizante_nac_mes_p4 = mesNombreAut(fnParts[1]);
        resp.autorizante_nac_anio_p4 = fnParts[2];
        resp.ret_autorizante_nac = `${fnParts[0]} / ${fnParts[1]} / ${fnParts[2]}`;
      }
    }
  }

  // Prellenado de escolaridad y obra social en Necesidades Especiales
  if (!resp.ne_escolaridad) {
    const esc = [resp.escolaridad_institucion, resp.escolaridad_grado]
      .map((v) => String(v ?? '').trim())
      .filter(Boolean)
      .join(' - ');
    if (esc) resp.ne_escolaridad = esc;
  }
  if (!resp.ne_obra_social && resp.obra_social) {
    resp.ne_obra_social = resp.obra_social;
  }

  // Retiro de menores solo
  if (resp.ret_autoriza_retirarse_solo) {
    resp.ret_retiro_solo_texto = `SÍ: ${resp.ret_retiro_solo_aclaracion || 'Al finalizar actividades scout'}`;
  } else {
    resp.ret_retiro_solo_texto = 'NO (Solo con personas autorizadas)';
  }

  // Ficha de adultos (solo prellenar si el usuario activó completar_ficha_adultos)
  if (resp.completar_ficha_adultos) {
    if (!resp.adulto_nombre) {
      resp.adulto_nombre =
        autNombre ||
        (esFirmantePropio && usuario ? `${usuario.apellido.toUpperCase()}, ${usuario.nombre}` : '');
    }
    if (!resp.adulto_telefono) {
      resp.adulto_telefono = autTel || telProtagonista;
    }
    if (!resp.adulto_direccion) {
      resp.adulto_direccion = resp.adulto_domicilio || autDom || domProtagonista;
    }
    if (!resp.adulto_localidad) resp.adulto_localidad = 'Córdoba';
    if (!resp.adulto_codigo_postal) resp.adulto_codigo_postal = '5000';
    if (resp.adulto_preferencia_trabajo === 'JOVENES') {
      resp.adulto_preferencia_trabajo = 'Jóvenes';
    } else if (resp.adulto_preferencia_trabajo === 'ADULTOS') {
      resp.adulto_preferencia_trabajo = 'Adultos';
    } else if (resp.adulto_preferencia_trabajo === 'AMBOS') {
      resp.adulto_preferencia_trabajo = 'Jóvenes / Adultos';
    }
  }

  const resumenMat = resumirMaterialesAdultos(resp);
  if (resumenMat.mat_construccion_prestamo || !resp.mat_construccion_prestamo) {
    resp.mat_construccion_prestamo = resumenMat.mat_construccion_prestamo || resp.mat_construccion_prestamo || '';
  }
  if (resumenMat.mat_construccion_donacion || !resp.mat_construccion_donacion) {
    resp.mat_construccion_donacion = resumenMat.mat_construccion_donacion || resp.mat_construccion_donacion || '';
  }
  if (resumenMat.mat_campamento_prestamo || !resp.mat_campamento_prestamo) {
    resp.mat_campamento_prestamo = resumenMat.mat_campamento_prestamo || resp.mat_campamento_prestamo || '';
  }
  if (resumenMat.mat_campamento_donacion || !resp.mat_campamento_donacion) {
    resp.mat_campamento_donacion = resumenMat.mat_campamento_donacion || resp.mat_campamento_donacion || '';
  }

  // Convertir cualquier array restante (campos multiselect personalizados) a texto legible
  for (const [k, v] of Object.entries(resp)) {
    if (Array.isArray(v)) {
      const opMap = mapaOpcionesPorCampo.get(k);
      resp[k] = v
        .map((item) => {
          const code = String(item).trim();
          return opMap?.get(code) || LABELS_ESTANDAR_POR_VALOR.get(code) || code;
        })
        .filter(Boolean)
        .join(', ');
    }
  }

  return resp;
}

function esValorVerdaderoPdf(val: unknown): boolean {
  if (val === true) return true;
  const s = String(val ?? '').trim().toUpperCase();
  return s === 'TRUE' || s === 'SÍ' || s === 'SI' || s === '1';
}

function formatearValorTextoPdf(val: unknown): string {
  if (val === undefined || val === null) return '';
  if (typeof val === 'boolean') return val ? 'SÍ' : 'NO';
  if (Array.isArray(val)) {
    return val
      .map((item) => {
        const code = String(item).trim();
        return LABELS_ESTANDAR_POR_VALOR.get(code) || code;
      })
      .filter(Boolean)
      .join(', ');
  }
  return String(val).trim();
}

function resolverIndicePaginaPdf(
  rawPage: number | undefined,
  totalPages: number,
  usesOneBased: boolean,
): number {
  if (totalPages <= 1) return 0;
  const p = Number.isFinite(rawPage) ? Number(rawPage) : usesOneBased ? 1 : 0;
  const idx = usesOneBased ? Math.max(0, p - 1) : Math.max(0, p);
  return Math.min(idx, totalPages - 1);
}

interface CampoAnexo {
  key: string;
  acroFieldName: string;
  label: string;
  valor: string;
}

const LABELS_ANEXO_ESTANDAR: Record<string, string> = {
  salud_apellido: 'Apellido',
  salud_nombre: 'Nombre',
  salud_domicilio: 'Domicilio real',
  salud_tel_emergencia1: 'Teléfono para Emergencia 1',
  salud_tel_emergencia2: 'Teléfono para Emergencia 2',
  salud_control_medico_fecha: 'Último control médico',
  salud_toma_medicacion_detalle: 'Medicación habitual (nombre, dosis y horarios)',
  toma_medicacion_detalle: 'Medicación habitual (nombre, dosis y horarios)',
  salud_enfermedad_cronica_detalle: 'Enfermedad o condición crónica (detalle)',
  enfermedad_cronica_detalle: 'Enfermedad o condición crónica (detalle)',
  salud_requiere_tratamiento_detalle: 'Tratamiento requerido',
  requiere_tratamiento_detalle: 'Tratamiento requerido',
  salud_sufre_alergia_detalle: 'Alergias (alimentos, medicamentos, picaduras, otras)',
  sufre_alergia_detalle: 'Alergias (alimentos, medicamentos, picaduras, otras)',
  salud_anticoagulado_droga: 'Medicación anticoagulante (droga)',
  anticoagulado_droga: 'Medicación anticoagulante (droga)',
  salud_regimen_dietario_detalle: 'Régimen dietario / alimentación especial',
  regimen_dietario_detalle: 'Régimen dietario / alimentación especial',
  salud_ataques_panico_frecuencia: 'Ataques de pánico / ansiedad (frecuencia)',
  ataques_panico_frecuencia: 'Ataques de pánico / ansiedad (frecuencia)',
  salud_salud_mental_detalle: 'Diagnóstico de salud mental',
  diagnostico_salud_mental_detalle: 'Diagnóstico de salud mental',
  salud_tratamiento_mental_detalle: 'Tratamiento de salud mental',
  recibe_tratamiento_salud_mental_detalle: 'Tratamiento de salud mental',
  salud_fobia_detalle: 'Miedo excesivo o fobia (detalle)',
  miedo_fobia_detalle: 'Miedo excesivo o fobia (detalle)',
  sit_actividad_fisica_no_detalle: 'Restricción para actividad física',
  sit_actividad_fisica_no_especifique: 'Restricción para actividad física',
  salud_comunicacion_educador_detalle: 'Mensaje o aviso importante para el equipo de educadores',
  comunicacion_educador_necesaria: 'Mensaje o aviso importante para el equipo de educadores',
  salud_obra_social: 'Obra Social o Prepaga',
  salud_obra_social_afiliado: 'N° de Credencial / Afiliado',
  salud_obra_social_emergencia: 'Teléfono de Emergencia de Obra Social',
  salud_firmante_aclaracion: 'Aclaración del firmante',
  protagonista_domicilio: 'Domicilio real del protagonista',
  hobby_texto: 'Actividad o hobby',
  escolaridad_institucion: 'Escolaridad (Institución)',
  autorizante_nombre_p3: 'Adulto autorizante (Ingreso)',
  autorizante_domicilio_p3: 'Domicilio del autorizante (Ingreso)',
  autorizante_nombre_p4: 'Adulto autorizante (Salidas)',
  autorizante_domicilio_p4: 'Domicilio del autorizante (Salidas)',
  aclaraciones_tenencia_guarda: 'Aclaraciones sobre tenencia o guarda',
  ne_diagnostico: 'Diagnóstico o patología',
  ne_evolucion: 'Evolución médica',
  ne_medico_cabecera: 'Médico de cabecera',
  ne_medicacion: 'Medicación habitual',
  ne_otros_antecedentes: 'Otros antecedentes médicos',
  ne_medicamento_horarios: 'Medicamento y horarios',
  ne_cud_vencimiento_prestacion: 'Certificado de discapacidad (vencimiento y orientación prestacional)',
  ne_grupo_acompanante: 'Grupo acompañante / profesionales',
  ne_terapias_previas: 'Terapias previas',
  ne_situaciones_estres_abordaje: 'Situaciones de estrés y abordaje',
  ne_descripcion_hijo_gustos_miedos: 'Descripción: gustos, preferencias y miedos',
  ne_expectativas_familia: 'Expectativas de la familia',
  ret_autorizante_domicilio: 'Domicilio del autorizante (Retiro)',
  ret_menor_domicilio: 'Domicilio del menor (Retiro)',
  ret_persona1_nombre: 'Persona 1 autorizada a retirar',
  ret_persona2_nombre: 'Persona 2 autorizada a retirar',
  ret_persona3_nombre: 'Persona 3 autorizada a retirar',
  ret_retiro_solo_texto: 'Retiro autónomo',
  adulto_observaciones: 'Observaciones de colaborador adulto',
  colab_otros_detalle: 'Detalle de otras colaboraciones',
};

const ALIAS_CAMPO_A_ESQUEMA: Record<string, string[]> = {
  tiene_hermanos_texto: ['tiene_hermanos'],
  hobby_texto: ['realiza_hobby', 'hobby_detalle'],
  condicion_salud_preexistente_texto: ['condicion_salud_preexistente'],
  madre_convive_texto: ['madre_convive'],
  padre_convive_texto: ['padre_convive'],
  tutor_convive_texto: ['tutor_convive'],
  salud_domicilio: ['protagonista_domicilio', 'domicilio'],
  salud_obra_social: ['obra_social'],
  salud_obra_social_afiliado: ['obra_social_afiliado'],
  salud_tel_emergencia1: ['tel_emergencia_1'],
  salud_tel_emergencia2: ['tel_emergencia_2'],
  salud_control_medico_fecha: ['fecha_control_medico'],
  salud_vac_quintuple: ['vacuna_quintuple'],
  salud_vac_triple_celular: ['vacuna_triple_celular'],
  salud_vac_triple_acelular: ['vacuna_triple_acelular'],
  salud_vac_doble_bacteriana: ['vacuna_doble_bacteriana'],
  salud_toma_medicacion: ['toma_medicacion', 'medicacion_tipos'],
  salud_toma_medicacion_detalle: ['medicacion_tipos', 'toma_medicacion_detalle'],
  salud_enfermedad_cronica: ['enfermedad_cronica', 'condiciones_medicas_tipos'],
  salud_enfermedad_cronica_detalle: ['condiciones_medicas_tipos', 'enfermedad_cronica_detalle'],
  salud_requiere_tratamiento: ['requiere_tratamiento'],
  salud_requiere_tratamiento_detalle: ['requiere_tratamiento_detalle'],
  salud_tiene_cud: ['tiene_cud'],
  salud_sufre_alergia: ['sufre_alergia', 'alergias_tipos'],
  salud_sufre_alergia_detalle: ['alergias_tipos', 'sufre_alergia_detalle'],
  salud_anticoagulado: ['esta_anticoagulado'],
  salud_anticoagulado_droga: ['anticoagulado_droga'],
  salud_regimen_dietario: ['regimen_dietario', 'regimen_dietario_tipos'],
  salud_regimen_dietario_detalle: ['regimen_dietario_tipos', 'regimen_dietario_detalle'],
  salud_ataques_panico: ['ataques_panico_ansiedad'],
  salud_ataques_panico_frecuencia: ['ataques_panico_frecuencia'],
  salud_salud_mental: ['diagnostico_salud_mental'],
  salud_salud_mental_detalle: ['diagnostico_salud_mental_detalle'],
  salud_tratamiento_mental: ['recibe_tratamiento_salud_mental'],
  salud_tratamiento_mental_detalle: ['recibe_tratamiento_salud_mental_detalle'],
  salud_fobia: ['miedo_fobia_excesivo'],
  salud_fobia_detalle: ['miedo_fobia_detalle'],
  sit_actividad_fisica_no_detalle: ['sit_actividad_fisica_no_especifique'],
  salud_grupo_sanguineo: ['grupo_sanguineo'],
  salud_factor_rh: ['factor_rh'],
  salud_peso: ['peso_kg'],
  salud_talla: ['talla_m'],
  salud_comunicacion_educador_detalle: ['comunicacion_educador_necesaria'],
  salud_obra_social_emergencia: ['tel_emergencia_obra_social'],
  autorizante_nombre_p3: ['autorizante_nombre', 'madre_nombres', 'padre_nombres'],
  autorizante_nacionalidad_p3: ['autorizante_nacionalidad'],
  autorizante_nac_dia_p3: ['autorizante_fecha_nac'],
  autorizante_nac_mes_p3: ['autorizante_fecha_nac'],
  autorizante_nac_anio_p3: ['autorizante_fecha_nac'],
  autorizante_dni_p3: ['autorizante_dni', 'madre_dni', 'padre_dni'],
  autorizante_telefono_p3: ['autorizante_telefono', 'madre_telefono', 'padre_telefono'],
  autorizante_domicilio_p3: ['autorizante_domicilio', 'madre_domicilio', 'padre_domicilio'],
  autorizante_caracter_p3: ['autorizante_caracter', 'autorizante_tipo'],
  menor_nacionalidad_p3: ['menor_nacionalidad'],
  autorizante_nombre_p4: ['autorizante_nombre', 'madre_nombres', 'padre_nombres'],
  autorizante_nacionalidad_p4: ['autorizante_nacionalidad'],
  autorizante_nac_dia_p4: ['autorizante_fecha_nac'],
  autorizante_nac_mes_p4: ['autorizante_fecha_nac'],
  autorizante_nac_anio_p4: ['autorizante_fecha_nac'],
  autorizante_dni_p4: ['autorizante_dni', 'madre_dni', 'padre_dni'],
  autorizante_telefono_p4: ['autorizante_telefono', 'madre_telefono', 'padre_telefono'],
  autorizante_domicilio_p4: ['autorizante_domicilio', 'madre_domicilio', 'padre_domicilio'],
  autorizante_caracter_p4: ['autorizante_caracter', 'autorizante_tipo'],
  menor_nacionalidad_p4: ['menor_nacionalidad'],
  ne_escolaridad: ['escolaridad_institucion', 'escolaridad_grado'],
  ne_obra_social: ['obra_social'],
  ret_autorizante_nombre: ['autorizante_nombre', 'madre_nombres', 'padre_nombres'],
  ret_autorizante_nacionalidad: ['autorizante_nacionalidad'],
  ret_autorizante_nac: ['autorizante_fecha_nac'],
  ret_autorizante_dni: ['autorizante_dni', 'madre_dni', 'padre_dni'],
  ret_autorizante_telefono: ['autorizante_telefono', 'madre_telefono', 'padre_telefono'],
  ret_autorizante_domicilio: ['autorizante_domicilio', 'madre_domicilio', 'padre_domicilio'],
  ret_menor_nacionalidad: ['menor_nacionalidad'],
  ret_retiro_solo_texto: ['ret_autoriza_retirarse_solo', 'ret_retiro_solo_aclaracion'],
  ret_firmante_aclaracion: ['autorizante_nombre', 'madre_nombres', 'padre_nombres'],
  adulto_direccion: ['adulto_domicilio', 'adulto_direccion'],
};

const CLAVES_PERFIL_AUTOMATICAS = new Set([
  'protagonista_nombre_completo',
  'protagonista_apellido',
  'protagonista_nombre',
  'protagonista_dni',
  'protagonista_fecha_nac',
  'protagonista_domicilio',
  'domicilio',
  'protagonista_telefono',
  'telefono_contacto',
  'rama_nombre',
  'salud_apellido',
  'salud_nombre',
  'salud_fecha_nac',
  'salud_dni',
  'salud_zona',
  'salud_distrito',
  'salud_grupo',
  'salud_domicilio',
  'salud_obra_social',
  'salud_obra_social_afiliado',
  'salud_firmante_aclaracion',
  'salud_firmante_dni',
  'salud_firmante_fecha',
  'obra_social',
  'obra_social_afiliado',
  'ingreso_localidad',
  'ingreso_departamento',
  'ingreso_provincia',
  'ingreso_dia',
  'ingreso_mes',
  'ingreso_anio',
  'menor_nombre_p3',
  'menor_nac_dia_p3',
  'menor_nac_mes_p3',
  'menor_nac_anio_p3',
  'menor_dni_p3',
  'menor_domicilio_p3',
  'salidas_localidad',
  'salidas_departamento',
  'salidas_provincia',
  'salidas_dia',
  'salidas_mes',
  'salidas_anio',
  'salidas_ciclo_anio',
  'menor_nombre_p4',
  'menor_nac_dia_p4',
  'menor_nac_mes_p4',
  'menor_nac_anio_p4',
  'menor_dni_p4',
  'menor_domicilio_p4',
  'ret_menor_nombre',
  'ret_menor_nac',
  'ret_menor_nac_dia_mes',
  'ret_menor_nac_anio',
  'ret_menor_dni',
  'ret_menor_domicilio',
  'ret_fecha_completa',
  'ret_provincia_ciudad',
  'adulto_hijo_nombre',
]);

function construirMapaLabelsAnexo(esquema?: Record<string, any>): Map<string, string> {
  const map = new Map<string, string>();
  if (Array.isArray(esquema?.secciones)) {
    for (const sec of esquema.secciones) {
      for (const c of sec?.campos || []) {
        if (c?.key && c?.label) {
          map.set(String(c.key), String(c.label));
        }
      }
    }
  }
  return map;
}

function resolverLabelAnexo(
  key: string,
  acroName: string,
  labelsEsquema: Map<string, string>,
): string {
  if (LABELS_ANEXO_ESTANDAR[key]) return LABELS_ANEXO_ESTANDAR[key];
  if (LABELS_ANEXO_ESTANDAR[acroName]) return LABELS_ANEXO_ESTANDAR[acroName];
  if (labelsEsquema.get(key)) return labelsEsquema.get(key)!;
  if (labelsEsquema.get(acroName)) return labelsEsquema.get(acroName)!;
  const sinPrefijo = key.replace(/^salud_/, '');
  if (labelsEsquema.get(sinPrefijo)) return labelsEsquema.get(sinPrefijo)!;
  return (key || acroName)
    .replace(/^salud_/, '')
    .replace(/_/g, ' ')
    .replace(/^\w/, (ch) => ch.toUpperCase());
}

function construirTextoPunteroAnexo(
  texto: string,
  usableWidth: number,
  font: PDFFont,
  fontSize: number,
  sanitizar: (v: unknown) => string,
): string {
  const medir = (candidate: string) => font.widthOfTextAtSize(sanitizar(candidate), fontSize);

  if (usableWidth < 135) {
    if (medir('Ver Anexo') <= usableWidth) return 'Ver Anexo';
    if (medir('Anexo') <= usableWidth) return 'Anexo';
    return '*';
  }

  const sufijo = '... (VER ANEXO)';
  const sufijoCorto = 'VER ANEXO';
  if (medir(sufijo) > usableWidth) {
    return medir(sufijoCorto) <= usableWidth ? sufijoCorto : 'Ver Anexo';
  }

  let mejor = '';
  for (let i = 1; i <= texto.length; i++) {
    const slice = texto.slice(0, i);
    const candidato = `${slice}${sufijo}`;
    if (medir(candidato) <= usableWidth) {
      mejor = slice;
    } else {
      break;
    }
  }

  const limpio = mejor.trimEnd();
  if (!limpio) return medir(sufijoCorto) <= usableWidth ? sufijoCorto : 'Ver Anexo';
  return `${limpio}${sufijo}`;
}

async function agregarPaginasAnexo(
  pdfDoc: PDFDocument,
  camposAnexo: CampoAnexo[],
  opts: {
    fontRegular: PDFFont;
    fontBold: PDFFont;
    fontItalic: PDFFont;
    sanitizar: (v: unknown) => string;
    tituloDocumento: string;
    usuario?: {
      nombre: string;
      apellido: string;
      dni: string;
      ramaNombre?: string;
    };
    hashVerificacion: string;
    versionImpresion: number;
    qrImage: Awaited<ReturnType<PDFDocument['embedPng']>> | null;
  },
): Promise<void> {
  if (camposAnexo.length === 0) return;

  const { fontRegular, fontBold, fontItalic, sanitizar } = opts;
  const PAGE_W = 595.28;
  const PAGE_H = 841.89;
  const MARGIN_X = 40;
  const CONTENT_W = PAGE_W - MARGIN_X * 2;
  const BOTTOM_MARGIN = 48;

  const accentBlue = rgb(0.08, 0.34, 0.65);
  const black = rgb(0.08, 0.09, 0.12);
  const muted = rgb(0.35, 0.37, 0.42);
  const inkData = rgb(0.03, 0.2, 0.52);
  const borderGray = rgb(0.78, 0.8, 0.84);
  const cardBg = rgb(0.97, 0.98, 0.995);
  const warnBg = rgb(0.996, 0.965, 0.89);
  const warnBorder = rgb(0.88, 0.68, 0.28);
  const warnText = rgb(0.45, 0.28, 0.03);

  const hoy = new Date();
  const fechaHoy = `${String(hoy.getDate()).padStart(2, '0')}/${String(
    hoy.getMonth() + 1,
  ).padStart(2, '0')}/${hoy.getFullYear()}`;

  const paginasAnexo: PDFPage[] = [];
  let page: PDFPage;
  let cursorY = 0;

  const crearPaginaAnexo = (esPrimera: boolean): PDFPage => {
    const p = pdfDoc.addPage([PAGE_W, PAGE_H]);
    paginasAnexo.push(p);

    if (esPrimera) {
      p.drawRectangle({
        x: MARGIN_X,
        y: PAGE_H - 40,
        width: CONTENT_W,
        height: 4,
        color: accentBlue,
      });
      p.drawText(sanitizar('ANEXO DE INFORMACIÓN AMPLIADA'), {
        x: MARGIN_X,
        y: PAGE_H - 60,
        size: 13.5,
        font: fontBold,
        color: accentBlue,
      });
      p.drawText(
        sanitizar(`${opts.tituloDocumento} · Detalle completo sin recortes`),
        {
          x: MARGIN_X,
          y: PAGE_H - 74,
          size: 8.5,
          font: fontRegular,
          color: muted,
        },
      );

      // Caja con datos del miembro
      const boxTop = PAGE_H - 84;
      const boxH = 42;
      p.drawRectangle({
        x: MARGIN_X,
        y: boxTop - boxH,
        width: CONTENT_W,
        height: boxH,
        color: cardBg,
        borderColor: borderGray,
        borderWidth: 0.7,
      });

      const nombreComp = opts.usuario
        ? `${opts.usuario.apellido.toUpperCase()}, ${opts.usuario.nombre}`
        : '—';
      const dniStr = opts.usuario?.dni || '—';
      const ramaStr = opts.usuario?.ramaNombre || '—';

      const drawPair = (lbl: string, val: string, x: number, y: number) => {
        const cleanLbl = sanitizar(lbl);
        p.drawText(cleanLbl, { x, y, size: 7.8, font: fontBold, color: muted });
        const lw = fontBold.widthOfTextAtSize(cleanLbl, 7.8);
        p.drawText(sanitizar(val), {
          x: x + lw + 4,
          y,
          size: 8.5,
          font: fontBold,
          color: inkData,
        });
      };

      drawPair('Miembro:', nombreComp, MARGIN_X + 10, boxTop - 15);
      drawPair('DNI:', dniStr, MARGIN_X + 340, boxTop - 15);
      drawPair('Rama / Sección:', ramaStr, MARGIN_X + 10, boxTop - 31);
      drawPair('Fecha:', fechaHoy, MARGIN_X + 340, boxTop - 31);

      // Aviso clínico destacado
      const warnTop = boxTop - boxH - 10;
      const warnH = 26;
      p.drawRectangle({
        x: MARGIN_X,
        y: warnTop - warnH,
        width: CONTENT_W,
        height: warnH,
        color: warnBg,
        borderColor: warnBorder,
        borderWidth: 0.7,
      });
      p.drawText(
        sanitizar(
          'Los siguientes campos superaron el espacio de la planilla oficial y se transcriben completos para resguardo clínico.',
        ),
        {
          x: MARGIN_X + 9,
          y: warnTop - 16,
          size: 8,
          font: fontBold,
          color: warnText,
        },
      );

      cursorY = warnTop - warnH - 14;
    } else {
      p.drawText(sanitizar('ANEXO DE INFORMACIÓN AMPLIADA — Continuación'), {
        x: MARGIN_X,
        y: PAGE_H - 36,
        size: 9.5,
        font: fontBold,
        color: accentBlue,
      });
      p.drawLine({
        start: { x: MARGIN_X, y: PAGE_H - 43 },
        end: { x: PAGE_W - MARGIN_X, y: PAGE_H - 43 },
        thickness: 0.75,
        color: borderGray,
      });
      cursorY = PAGE_H - 60;
    }
    return p;
  };

  page = crearPaginaAnexo(true);

  for (const item of camposAnexo) {
    const labelClean = sanitizar(item.label);
    const valClean = sanitizar(item.valor);
    const titleLines = dividirTextoEnLineas(labelClean, fontBold, 9, CONTENT_W - 22);
    const valLines = dividirTextoEnLineas(valClean, fontRegular, 9.5, CONTENT_W - 22);

    // Dividir bloques largos si superan el espacio disponible en la página actual
    let offset = 0;
    let primeraParte = true;

    while (offset < valLines.length || primeraParte) {
      const headerHeight = primeraParte ? titleLines.length * 12 + 4 : 13;
      const disponible = cursorY - BOTTOM_MARGIN - 16;
      const maxValLinesHere = Math.max(1, Math.floor((disponible - headerHeight - 10) / 13));

      if (disponible < headerHeight + 24) {
        page = crearPaginaAnexo(false);
        continue;
      }

      const slice = valLines.slice(offset, offset + maxValLinesHere);
      const blockH = headerHeight + Math.max(1, slice.length) * 13 + 10;

      page.drawRectangle({
        x: MARGIN_X,
        y: cursorY - blockH,
        width: CONTENT_W,
        height: blockH,
        color: cardBg,
        borderColor: borderGray,
        borderWidth: 0.6,
      });
      page.drawRectangle({
        x: MARGIN_X,
        y: cursorY - blockH,
        width: 3,
        height: blockH,
        color: accentBlue,
      });

      let ty = cursorY - 14;
      if (primeraParte) {
        for (const tl of titleLines) {
          page.drawText(sanitizar(tl), {
            x: MARGIN_X + 11,
            y: ty,
            size: 9,
            font: fontBold,
            color: black,
          });
          ty -= 12;
        }
        ty -= 2;
      } else {
        page.drawText(sanitizar(`${labelClean} (cont.)`), {
          x: MARGIN_X + 11,
          y: ty,
          size: 8,
          font: fontItalic,
          color: muted,
        });
        ty -= 13;
      }

      for (const vl of slice) {
        if (vl) {
          page.drawText(sanitizar(vl), {
            x: MARGIN_X + 11,
            y: ty,
            size: 9.5,
            font: fontRegular,
            color: inkData,
          });
        }
        ty -= 13;
      }

      cursorY -= blockH + 9;
      offset += slice.length;
      primeraParte = false;

      if (offset >= valLines.length) break;
      page = crearPaginaAnexo(false);
    }
  }

  // Bloque final de firma + QR de verificación en el Anexo
  const bloqueFirmaH = 74;
  if (cursorY - bloqueFirmaH < BOTTOM_MARGIN) {
    page = crearPaginaAnexo(false);
  }

  const firmaY = BOTTOM_MARGIN + 38;
  const lineW = opts.qrImage ? CONTENT_W - 88 : CONTENT_W;
  const colW = (lineW - 24) / 2;

  page.drawLine({
    start: { x: MARGIN_X, y: firmaY },
    end: { x: MARGIN_X + colW, y: firmaY },
    thickness: 0.8,
    color: black,
  });
  page.drawText(sanitizar('Firma del Declarante / Responsable'), {
    x: MARGIN_X,
    y: firmaY - 11,
    size: 7.5,
    font: fontBold,
    color: black,
  });

  const xCol2 = MARGIN_X + colW + 24;
  page.drawLine({
    start: { x: xCol2, y: firmaY },
    end: { x: xCol2 + colW, y: firmaY },
    thickness: 0.8,
    color: black,
  });
  page.drawText(sanitizar('Aclaración, DNI y Fecha'), {
    x: xCol2,
    y: firmaY - 11,
    size: 7.5,
    font: fontBold,
    color: black,
  });

  if (opts.qrImage && opts.hashVerificacion) {
    const qrW = 54;
    const qrX = PAGE_W - MARGIN_X - qrW;
    const qrY = BOTTOM_MARGIN + 14;
    page.drawImage(opts.qrImage, { x: qrX, y: qrY, width: qrW, height: qrW });
    const metaTxt = sanitizar(
      `Verif: ${opts.hashVerificacion.slice(0, 10)} · v${opts.versionImpresion} · Anexo`,
    );
    const metaW = fontRegular.widthOfTextAtSize(metaTxt, 6);
    page.drawText(metaTxt, {
      x: Math.max(MARGIN_X, Math.min(qrX - 6, PAGE_W - MARGIN_X - metaW)),
      y: BOTTOM_MARGIN + 4,
      size: 6,
      font: fontRegular,
      color: muted,
    });
  }

  const totalAnexo = paginasAnexo.length;
  paginasAnexo.forEach((p, idx) => {
    p.drawText(sanitizar(`Anexo pág. ${idx + 1} de ${totalAnexo}`), {
      x: MARGIN_X,
      y: BOTTOM_MARGIN - 12,
      size: 7,
      font: fontRegular,
      color: muted,
    });
  });
}

function resolverPaginasWidget(
  field: PDFTextField | PDFCheckBox | PDFDropdown | PDFRadioGroup,
  pages: PDFPage[],
): Set<number> {
  const result = new Set<number>();
  const pageIndexByRef = new Map<string, number>();
  pages.forEach((p, idx) => pageIndexByRef.set(p.ref.toString(), idx));

  const widgets = field.acroField.getWidgets();
  for (const widget of widgets) {
    const pRef = widget.P();
    if (pRef) {
      const idx = pageIndexByRef.get(pRef.toString());
      if (idx !== undefined) {
        result.add(idx);
        continue;
      }
    }
  }

  if (result.size === 0) {
    const kids = field.acroField.Kids()?.asArray() || [];
    const kidSet = new Set(kids.map((k) => k.toString()));
    if (kidSet.size > 0) {
      pages.forEach((p, idx) => {
        const annots = p.node.Annots()?.asArray() || [];
        if (annots.some((a) => kidSet.has(a.toString()))) {
          result.add(idx);
        }
      });
    }
  }
  return result;
}

function esValorTruthyCondicional(val: unknown): boolean {
  if (val === true) return true;
  if (typeof val === 'string') {
    const norm = val.trim().toUpperCase();
    return norm !== '' && norm !== 'NO' && norm !== 'FALSE';
  }
  if (Array.isArray(val)) return val.length > 0;
  return false;
}

function resolverPaginasAOmitir(
  mapeo: MapeoPdf,
  rawRespuestas: Record<string, unknown>,
  respuestasFormateadas: Record<string, unknown>,
  totalPages: number,
  usesOneBased: boolean,
  blankMode: boolean,
): Set<number> {
  const omitir = new Set<number>();
  if (blankMode || !Array.isArray(mapeo?.paginasCondicionales)) return omitir;

  const combinadas = { ...rawRespuestas, ...respuestasFormateadas };
  for (const cfg of mapeo.paginasCondicionales) {
    if (!cfg || !Number.isFinite(cfg.page)) continue;
    const pageIdx = resolverIndicePaginaPdf(cfg.page, totalPages, usesOneBased);
    const alguno = (cfg.incluirSiAlguno || []).some((k) =>
      esValorTruthyCondicional(rawRespuestas[k] ?? respuestasFormateadas[k]),
    );
    const prefijo = (cfg.incluirSiPrefijoTruthy || []).some((pref) =>
      Object.entries(combinadas).some(
        ([k, v]) => k.startsWith(pref) && esValorTruthyCondicional(v),
      ),
    );
    if (!alguno && !prefijo) {
      omitir.add(pageIdx);
    }
  }
  return omitir;
}

/**
 * Carga el PDF base configurado en `mapeo` (Base64 subido, URL o molde en blanco),
 * rellena campos AcroForm si existen (con control de desborde, páginas condicionales
 * y Anexo automático), aplana el formulario con `flatten()`, estampa coordenadas y dibuja el QR.
 */
export async function estampadoDinamicoPdf(
  mapeo: MapeoPdf,
  respuestasFormateadas: Record<string, unknown>,
  hashVerificacion: string,
  versionImpresion = 1,
  opciones?: {
    esquema?: Record<string, any>;
    rawRespuestas?: Record<string, unknown>;
    usuario?: {
      nombre: string;
      apellido: string;
      dni: string;
      fechaNacimiento?: string | Date;
      ramaNombre?: string;
      telefonoContacto?: string;
      tipoMiembro?: string;
    };
    blank?: boolean;
  },
): Promise<Uint8Array> {
  let baseBytes: Uint8Array | null = null;

  if (mapeo?.pdfBaseDataUrl && typeof mapeo.pdfBaseDataUrl === 'string') {
    baseBytes = dataUriToBytes(mapeo.pdfBaseDataUrl);
  } else if (
    mapeo?.pdfBaseUrl &&
    mapeo.pdfBaseUrl !== '__MOLDE_OFICIAL__' &&
    mapeo.pdfBaseUrl !== '__UPLOADED_PDF__' &&
    typeof fetch === 'function'
  ) {
    try {
      const resp = await fetch(mapeo.pdfBaseUrl);
      if (resp.ok) {
        baseBytes = new Uint8Array(await resp.arrayBuffer());
      }
    } catch {
      baseBytes = null;
    }
  }

  if (!baseBytes) {
    baseBytes = await generarMoldeEnBlancoPdf();
  }

  const pdfDoc = await PDFDocument.load(baseBytes, { ignoreEncryption: true });
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
  const inkColor = rgb(0.03, 0.2, 0.52);
  const metaColor = rgb(0.3, 0.3, 0.35);

  const sanitizar = (texto: unknown): string =>
    sanitizarTextoWinAnsi(texto, (candidato) => {
      fontBold.encodeText(candidato);
      return true;
    });

  for (const font of [fontRegular, fontBold, fontItalic]) {
    const origWidth = font.widthOfTextAtSize.bind(font);
    font.widthOfTextAtSize = (text: string, size: number) => origWidth(sanitizar(text), size);
  }

  const pages = pdfDoc.getPages();
  const coordsEntries = Object.entries(mapeo?.campos || {});
  const tienePaginaCero =
    coordsEntries.some(
      ([, c]) => c?.page === 0 || c?.trueCoords?.page === 0 || c?.falseCoords?.page === 0,
    ) ||
    mapeo?.qrVerificacion?.page === 0 ||
    Boolean(mapeo?.qrPaginas?.some((q) => q?.page === 0)) ||
    Boolean(mapeo?.paginasCondicionales?.some((p) => p?.page === 0));
  const usesOneBased =
    mapeo?.indexBase === 1 ? true : mapeo?.indexBase === 0 ? false : !tienePaginaCero;

  const blankMode = Boolean(opciones?.blank);
  const paginasAOmitir = resolverPaginasAOmitir(
    mapeo,
    opciones?.rawRespuestas || {},
    respuestasFormateadas,
    pages.length,
    usesOneBased,
    blankMode,
  );
  const labelsPorCampo = construirMapaLabelsAnexo(opciones?.esquema);
  const camposAnexo: CampoAnexo[] = [];

  // 1. Rellenado automático de campos AcroForm nativos (omitido en modo en blanco)
  const clavesRellenadasAcroForm = new Set<string>();
  if (!blankMode) {
    try {
      const form = pdfDoc.getForm();
      const fields = form.getFields();
      if (fields.length > 0) {
        for (const field of fields) {
          const name = field.getName();
          let matchedKey = name in respuestasFormateadas ? name : undefined;
          if (!matchedKey) {
            const found = coordsEntries.find(([, c]) => c?.acroFieldName === name);
            if (found) matchedKey = found[0];
          }
          if (!matchedKey) continue;

          if (
            paginasAOmitir.size > 0 &&
            (field instanceof PDFCheckBox ||
              field instanceof PDFTextField ||
              field instanceof PDFDropdown ||
              field instanceof PDFRadioGroup)
          ) {
            const paginasField = resolverPaginasWidget(field, pages);
            if (
              paginasField.size > 0 &&
              Array.from(paginasField).every((pIdx) => paginasAOmitir.has(pIdx))
            ) {
              clavesRellenadasAcroForm.add(matchedKey);
              continue;
            }
          }

          const rawVal = respuestasFormateadas[matchedKey];
          if (field instanceof PDFCheckBox) {
            if (esValorVerdaderoPdf(rawVal)) field.check();
            else field.uncheck();
            clavesRellenadasAcroForm.add(matchedKey);
          } else if (field instanceof PDFTextField) {
            const texto = sanitizar(formatearValorTextoPdf(rawVal));
            if (texto) {
              const widget = field.acroField.getWidgets()[0];
              const rect = widget?.getRectangle();
              const usableWidth = rect && rect.width > 8 ? rect.width - 4 : 180;
              const boxHeight = rect && rect.height > 4 ? rect.height : 12;
              const baseSize = boxHeight <= 11 ? 7.8 : 8.5;
              const minSize = 7.0;
              const isMultiline = field.isMultiline() || boxHeight >= 18;

              const cabeEnCaja = (txt: string, size: number): boolean => {
                if (!isMultiline) {
                  return fontBold.widthOfTextAtSize(txt, size) <= usableWidth;
                }
                const maxLines = Math.max(1, Math.floor((boxHeight - 2) / (size * 1.15)));
                return dividirTextoEnLineas(txt, fontBold, size, usableWidth).length <= maxLines;
              };

              if (cabeEnCaja(texto, baseSize)) {
                field.setFontSize(baseSize);
                field.setText(texto);
              } else if (cabeEnCaja(texto, minSize)) {
                field.setFontSize(minSize);
                field.setText(texto);
              } else {
                camposAnexo.push({
                  key: matchedKey,
                  acroFieldName: name,
                  label: resolverLabelAnexo(matchedKey, name, labelsPorCampo),
                  valor: texto,
                });
                const puntero = construirTextoPunteroAnexo(
                  texto,
                  usableWidth,
                  fontBold,
                  minSize,
                  sanitizar,
                );
                field.setFontSize(minSize);
                field.setText(puntero);
              }
            }
            clavesRellenadasAcroForm.add(matchedKey);
          } else if (field instanceof PDFDropdown) {
            const texto = sanitizar(formatearValorTextoPdf(rawVal));
            if (texto && field.getOptions().includes(texto)) {
              field.select(texto);
            }
            clavesRellenadasAcroForm.add(matchedKey);
          } else if (field instanceof PDFRadioGroup) {
            const texto = sanitizar(formatearValorTextoPdf(rawVal));
            if (texto && field.getOptions().includes(texto)) {
              field.select(texto);
            }
            clavesRellenadasAcroForm.add(matchedKey);
          }
        }

        // Renderizar apariencias con fuente embebida y aplanar campos editables
        try {
          form.updateFieldAppearances(fontBold);
          form.flatten();
        } catch {
          // Si algún PDF externo tiene diccionarios de apariencia incompletos, mantener documento válido
        }
      }
    } catch {
      // Algunos PDFs no tienen AcroForm o tienen diccionarios inválidos; continuamos con coordenadas
    }
  }

  // 2. Estampado por coordenadas (omite campos ya rellenados vía AcroForm y páginas omitidas)
  if (!blankMode) {
    for (const [key, coord] of coordsEntries) {
      if (!coord || clavesRellenadasAcroForm.has(key)) continue;
      const rawVal = respuestasFormateadas[key];

      if (coord.type === 'checkbox_x') {
        const activo = esValorVerdaderoPdf(rawVal);
        const target = activo ? coord.trueCoords || coord : coord.falseCoords;
        if (
          !target ||
          typeof target.x !== 'number' ||
          typeof target.y !== 'number' ||
          !Number.isFinite(target.x) ||
          !Number.isFinite(target.y)
        ) {
          continue;
        }
        const pageIdx = resolverIndicePaginaPdf(
          target.page ?? coord.page,
          pages.length,
          usesOneBased,
        );
        if (paginasAOmitir.has(pageIdx)) continue;
        const page = pages[pageIdx];
        page.drawText('X', {
          x: target.x,
          y: target.y,
          size: coord.size || 10,
          font: fontBold,
          color: inkColor,
        });
        continue;
      }

      if (
        typeof coord.x !== 'number' ||
        typeof coord.y !== 'number' ||
        !Number.isFinite(coord.x) ||
        !Number.isFinite(coord.y)
      ) {
        continue;
      }
      const texto = sanitizar(formatearValorTextoPdf(rawVal));
      if (!texto) continue;

      const pageIdx = resolverIndicePaginaPdf(coord.page, pages.length, usesOneBased);
      if (paginasAOmitir.has(pageIdx)) continue;
      const page = pages[pageIdx];
      page.drawText(texto, {
        x: coord.x,
        y: coord.y,
        size: coord.size || 9,
        font: fontBold,
        color: inkColor,
        maxWidth: coord.maxWidth,
      });
    }
  }

  // 3. Estampar QR de verificación (soporta múltiples páginas con qrPaginas)
  let qrImage: Awaited<ReturnType<PDFDocument['embedPng']>> | null = null;
  if (pages.length > 0 && hashVerificacion) {
    const qrDataUrl = await QRCode.toDataURL(hashVerificacion, { margin: 1, width: 160 });
    qrImage = await pdfDoc.embedPng(dataUriToBytes(qrDataUrl));
    const ubicacionesQr: QrUbicacionPdf[] =
      Array.isArray(mapeo?.qrPaginas) && mapeo.qrPaginas.length > 0
        ? mapeo.qrPaginas
        : [mapeo?.qrVerificacion || { page: usesOneBased ? 1 : 0, x: -1, y: 26, width: 56 }];
    const verifText = sanitizar(`Verif: ${hashVerificacion.slice(0, 10)} · v${versionImpresion}`);
    const verifWidth = fontRegular.widthOfTextAtSize(verifText, 6.2);

    const paginasEstampadasQr = new Set<number>();
    for (const qrCfg of ubicacionesQr) {
      const qrPageIdx = resolverIndicePaginaPdf(qrCfg?.page, pages.length, usesOneBased);
      if (paginasAOmitir.has(qrPageIdx) || paginasEstampadasQr.has(qrPageIdx)) continue;
      paginasEstampadasQr.add(qrPageIdx);
      const qrPage = pages[qrPageIdx];
      const { width } = qrPage.getSize();
      const qrWidth = qrCfg?.width || 56;
      const qrX =
        qrCfg && Number.isFinite(qrCfg.x) && qrCfg.x >= 0
          ? qrCfg.x
          : Math.max(20, width - qrWidth - 26);
      const qrY = qrCfg && Number.isFinite(qrCfg.y) ? qrCfg.y : 26;

      qrPage.drawImage(qrImage, {
        x: qrX,
        y: qrY,
        width: qrWidth,
        height: qrWidth,
      });

      qrPage.drawText(verifText, {
        x: Math.max(12, Math.min(qrX, width - verifWidth - 12)),
        y: Math.max(6, qrY - 8),
        size: 6.2,
        font: fontRegular,
        color: metaColor,
      });
    }
  }

  // 4. Quitar páginas condicionales no aplicables ANTES de anexar información ampliada
  if (paginasAOmitir.size > 0) {
    const indicesDesc = Array.from(paginasAOmitir).sort((a, b) => b - a);
    for (const idx of indicesDesc) {
      if (idx >= 0 && idx < pdfDoc.getPageCount()) {
        pdfDoc.removePage(idx);
      }
    }
  }

  // 5. Agregar Anexo automático si algún campo superó el espacio disponible
  if (!blankMode && camposAnexo.length > 0) {
    await agregarPaginasAnexo(pdfDoc, camposAnexo, {
      fontRegular,
      fontBold,
      fontItalic,
      sanitizar,
      tituloDocumento:
        String(opciones?.esquema?.tituloDocumento || 'Legajo Scout 2026').trim(),
      usuario: opciones?.usuario,
      hashVerificacion,
      versionImpresion,
      qrImage,
    });
  }

  return await pdfDoc.save();
}

/**
 * Valida qué campos detectados en un molde AcroForm quedan vinculados
 * automáticamente (por coincidencia directa, mapeo explícito, perfil o alias de impresión)
 * y cuáles no tienen pregunta definida en el esquema del formulario.
 */
export function validarCamposAcroFormContraEsquema(
  camposPdf: CampoAcroFormDetectado[],
  esquema?: {
    secciones?: Array<{ campos?: Array<{ key: string }> }>;
  },
  mapeoCampos?: Record<string, CoordenadaCampo>,
): ResultadoValidacionAcroForm {
  const clavesEsquema = new Set<string>();
  if (Array.isArray(esquema?.secciones)) {
    for (const sec of esquema.secciones) {
      for (const c of sec?.campos || []) {
        if (c?.key) clavesEsquema.add(String(c.key));
      }
    }
  }

  const nombresMapeados = new Set<string>();
  for (const [key, cfg] of Object.entries(mapeoCampos || {})) {
    if (cfg?.acroFieldName) nombresMapeados.add(cfg.acroFieldName);
    if (cfg && (typeof cfg.x === 'number' || cfg.acroFieldName)) nombresMapeados.add(key);
  }

  const tieneTablaMateriales = clavesEsquema.has('materiales_prestamo_donacion_tabla');
  const vinculados: string[] = [];
  const sinPreguntaEnFormulario: CampoAcroFormDetectado[] = [];

  for (const c of camposPdf) {
    const esDirecto = clavesEsquema.has(c.key) || clavesEsquema.has(c.acroFieldName);
    const esMapeado = nombresMapeados.has(c.acroFieldName) || nombresMapeados.has(c.key);
    const esPerfilAuto =
      CLAVES_PERFIL_AUTOMATICAS.has(c.acroFieldName) || CLAVES_PERFIL_AUTOMATICAS.has(c.key);
    const aliasOrigen = ALIAS_CAMPO_A_ESQUEMA[c.acroFieldName] || ALIAS_CAMPO_A_ESQUEMA[c.key];
    const esAliasVinculado = Boolean(
      aliasOrigen && aliasOrigen.some((origKey) => clavesEsquema.has(origKey)),
    );
    const esMateriales =
      tieneTablaMateriales && /^mat_.+_(prestamo|donacion)$/.test(c.acroFieldName);

    if (esDirecto || esMapeado || esPerfilAuto || esAliasVinculado || esMateriales) {
      vinculados.push(c.acroFieldName);
    } else {
      sinPreguntaEnFormulario.push(c);
    }
  }

  return {
    totalCamposPdf: camposPdf.length,
    vinculados,
    sinPreguntaEnFormulario,
  };
}

/**
 * Detecta campos AcroForm rellenables en un archivo PDF subido para auto-generar
 * el esquema del formulario en el Editor Visual.
 */
export async function extraerCamposAcroFormPdf(
  pdfBytes: Uint8Array,
): Promise<CampoAcroFormDetectado[]> {
  try {
    const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    const form = pdfDoc.getForm();
    const fields = form.getFields();
    const usados = new Set<string>();
    const out: CampoAcroFormDetectado[] = [];

    for (let i = 0; i < fields.length; i++) {
      const field = fields[i];
      const rawName = field.getName() || `Campo ${i + 1}`;
      let baseKey = rawName
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, '_')
        .replace(/^_+|_+$/g, '');
      if (!baseKey) baseKey = `campo_${i + 1}`;

      let key = baseKey;
      let sufijo = 2;
      while (usados.has(key)) {
        key = `${baseKey}_${sufijo++}`;
      }
      usados.add(key);

      if (field instanceof PDFCheckBox) {
        out.push({ key, acroFieldName: rawName, label: rawName, type: 'boolean' });
      } else if (field instanceof PDFDropdown || field instanceof PDFRadioGroup) {
        const opts = field.getOptions().map((o) => ({ label: o, value: o }));
        out.push({
          key,
          acroFieldName: rawName,
          label: rawName,
          type: 'select',
          options: opts,
        });
      } else {
        out.push({ key, acroFieldName: rawName, label: rawName, type: 'text' });
      }
    }

    return out;
  } catch {
    return [];
  }
}

function dividirTextoEnLineas(
  texto: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number,
): string[] {
  const limpio = String(texto ?? '').replace(/\r/g, '');
  if (!limpio.trim()) return [];
  const parrafos = limpio.split('\n');
  const lineas: string[] = [];

  for (const parrafo of parrafos) {
    const trimmed = parrafo.trim();
    if (!trimmed) {
      lineas.push('');
      continue;
    }
    const palabras = trimmed.split(/\s+/);
    let lineaActual = '';

    for (const palabra of palabras) {
      const candidato = lineaActual ? `${lineaActual} ${palabra}` : palabra;
      if (font.widthOfTextAtSize(candidato, fontSize) <= maxWidth) {
        lineaActual = candidato;
      } else {
        if (lineaActual) lineas.push(lineaActual);
        if (font.widthOfTextAtSize(palabra, fontSize) <= maxWidth) {
          lineaActual = palabra;
        } else {
          // Partir palabra larga si supera el ancho de la columna
          let chunk = '';
          for (const ch of palabra) {
            if (font.widthOfTextAtSize(chunk + ch, fontSize) <= maxWidth) {
              chunk += ch;
            } else {
              if (chunk) lineas.push(chunk);
              chunk = ch;
            }
          }
          lineaActual = chunk;
        }
      }
    }
    if (lineaActual) lineas.push(lineaActual);
  }

  return lineas;
}

export function interpolarTextoLegal(
  plantillaTexto: string,
  respuestasFormateadas: Record<string, unknown>,
  blankMode = false,
): string {
  const hoy = new Date();
  const fechaActualStr = `${String(hoy.getDate()).padStart(2, '0')}/${String(
    hoy.getMonth() + 1,
  ).padStart(2, '0')}/${hoy.getFullYear()}`;
  const cicloStr = String(obtenerCicloAnioActual());

  return plantillaTexto.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, rawKey: string) => {
    const k = rawKey.trim();
    if (k === 'ciclo_anio') return cicloStr;
    if (blankMode) return '....................';
    if (k === 'fecha_actual') return fechaActualStr;

    const aliasMap: Record<string, unknown> = {
      nombre_completo: respuestasFormateadas.protagonista_nombre_completo,
      dni: respuestasFormateadas.protagonista_dni,
      fecha_nac: respuestasFormateadas.protagonista_fecha_nac,
      rama: respuestasFormateadas.rama_nombre,
      domicilio:
        respuestasFormateadas.protagonista_domicilio || respuestasFormateadas.domicilio,
      telefono:
        respuestasFormateadas.protagonista_telefono ||
        respuestasFormateadas.telefono_contacto,
      autorizante_nacionalidad:
        respuestasFormateadas.autorizante_nacionalidad ||
        (respuestasFormateadas.autorizante_nombre ? 'Argentina' : undefined),
      menor_nacionalidad:
        respuestasFormateadas.menor_nacionalidad ||
        (respuestasFormateadas.protagonista_nombre_completo ? 'Argentina' : undefined),
    };

    const rawVal = k in respuestasFormateadas ? respuestasFormateadas[k] : aliasMap[k];
    const str = formatearValorTextoPdf(rawVal);
    return str || '....................';
  });
}

const FIRMAS_LABELS: Record<string, { titulo: string; subtitulo: string }> = {
  ADULTO_RESPONSABLE: {
    titulo: 'Firma Adulto Responsable / Madre / Padre / Tutor',
    subtitulo: 'Aclaración y DNI',
  },
  PROTAGONISTA: {
    titulo: 'Firma Protagonista / Rover',
    subtitulo: 'Aclaración y DNI',
  },
  EDUCADOR: {
    titulo: 'Firma Educador / Jefatura de Grupo',
    subtitulo: 'Cargo y Fecha de Recepción',
  },
};

export async function generarPdfPorSecciones(
  esquema: Record<string, any> | undefined,
  respuestasFormateadas: Record<string, unknown>,
  hashVerificacion: string,
  usuario?: {
    nombre: string;
    apellido: string;
    dni: string;
    fechaNacimiento?: string | Date;
    ramaNombre?: string;
    telefonoContacto?: string;
  },
  versionImpresion = 1,
  blankMode = false,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  const sanitizar = (texto: unknown): string =>
    sanitizarTextoWinAnsi(texto, (candidato) => {
      fontRegular.encodeText(candidato);
      return true;
    });

  // Limpiar cualquier carácter no soportado al dibujar o medir ancho
  for (const font of [fontRegular, fontBold, fontItalic]) {
    const origWidth = font.widthOfTextAtSize.bind(font);
    font.widthOfTextAtSize = (text: string, size: number) => origWidth(sanitizar(text), size);
  }

  const PAGE_W = 595.28;
  const PAGE_H = 841.89;
  const MARGIN_X = 40;
  const CONTENT_W = PAGE_W - MARGIN_X * 2;
  const membrete = String(esquema?.membrete || 'GRUPO_JUAN_XXIII').toUpperCase();
  const BOTTOM_MARGIN = membrete === 'AUTORIZACION_OFICIAL' ? 62 : 42;

  const black = rgb(0.08, 0.09, 0.12);
  const muted = rgb(0.35, 0.37, 0.42);
  const inkData = rgb(0.03, 0.2, 0.52);
  const borderGray = rgb(0.78, 0.8, 0.84);
  const bandBg = rgb(0.93, 0.95, 0.98);
  const legalBg = rgb(0.97, 0.97, 0.99);
  const accentBlue = rgb(0.08, 0.34, 0.65);

  const safeEmbed = async (key: keyof typeof PDF_ASSETS) => {
    try {
      const bytes = dataUriToBytes(PDF_ASSETS[key]);
      if (PDF_ASSETS[key].includes('image/png')) return await pdfDoc.embedPng(bytes);
      return await pdfDoc.embedJpg(bytes);
    } catch {
      return null;
    }
  };

  const logoScouts = membrete === 'GRUPO_JUAN_XXIII' ? await safeEmbed('logoScoutsColor') : null;
  const logoJuan = membrete === 'GRUPO_JUAN_XXIII' ? await safeEmbed('logoJuanXXIII') : null;
  const logoSalud = membrete === 'SALUD_NACIONAL' ? await safeEmbed('logoScoutsSalud') : null;
  const logoAuthHead =
    membrete === 'AUTORIZACION_OFICIAL' ? await safeEmbed('logoScoutsHeaderAuth') : null;
  const logoAuthFoot =
    membrete === 'AUTORIZACION_OFICIAL' ? await safeEmbed('logoScoutsFooterPurple') : null;

  const tituloDoc = sanitizar(
    esquema?.tituloDocumento ||
      respuestasFormateadas.titulo_documento ||
      'DOCUMENTO INSTITUCIONAL',
  );
  const subtituloDoc = sanitizar(
    esquema?.subtituloDocumento || `Ciclo Scout ${obtenerCicloAnioActual()}`,
  );

  const dimensionesProporcionales = (
    img: { width: number; height: number },
    maxW: number,
    maxH: number,
  ) => {
    const scale = Math.min(maxW / img.width, maxH / img.height);
    return { width: img.width * scale, height: img.height * scale };
  };

  const pagesCreated: PDFPage[] = [];
  let cursorY = 0;

  const crearPagina = (esPrimera: boolean): PDFPage => {
    const p = pdfDoc.addPage([PAGE_W, PAGE_H]);
    pagesCreated.push(p);

    if (esPrimera) {
      if (membrete === 'GRUPO_JUAN_XXIII') {
        if (logoScouts) {
          const dim = dimensionesProporcionales(logoScouts, 64, 48);
          p.drawImage(logoScouts, {
            x: MARGIN_X,
            y: PAGE_H - 22 - dim.height,
            width: dim.width,
            height: dim.height,
          });
        }
        if (logoJuan) {
          const dim = dimensionesProporcionales(logoJuan, 82, 38);
          p.drawImage(logoJuan, {
            x: PAGE_W - MARGIN_X - dim.width,
            y: PAGE_H - 26 - dim.height,
            width: dim.width,
            height: dim.height,
          });
        }

        const drawCentered = (txt: string, y: number, size: number, f: PDFFont) => {
          const clean = sanitizar(txt);
          p.drawText(clean, {
            x: (PAGE_W - f.widthOfTextAtSize(clean, size)) / 2,
            y,
            size,
            font: f,
            color: black,
          });
        };
        drawCentered('Grupo Scout "Juan XXIII" N° 196', PAGE_H - 32, 10.5, fontBold);
        drawCentered('Distrito 1 | Zona 22 Córdoba Norte - La Rioja', PAGE_H - 44, 7.5, fontRegular);
        drawCentered('Vera y Zárate 3069 | Córdoba | Argentina | CP 5000', PAGE_H - 54, 7, fontRegular);
        drawCentered('Mail: gsjuanxxiii@gmail.com', PAGE_H - 64, 7, fontRegular);

        p.drawLine({
          start: { x: MARGIN_X, y: PAGE_H - 76 },
          end: { x: PAGE_W - MARGIN_X, y: PAGE_H - 76 },
          thickness: 1,
          color: borderGray,
        });
        cursorY = PAGE_H - 96;
      } else if (membrete === 'SALUD_NACIONAL') {
        let textX = MARGIN_X;
        if (logoSalud) {
          const dim = dimensionesProporcionales(logoSalud, 64, 48);
          p.drawImage(logoSalud, {
            x: MARGIN_X,
            y: PAGE_H - 22 - dim.height,
            width: dim.width,
            height: dim.height,
          });
          textX = MARGIN_X + dim.width + 12;
        }
        p.drawText(sanitizar('Scouts de Argentina · Ficha de Salud'), {
          x: textX,
          y: PAGE_H - 40,
          size: 10.5,
          font: fontBold,
          color: accentBlue,
        });
        p.drawText(subtituloDoc, {
          x: textX,
          y: PAGE_H - 54,
          size: 8,
          font: fontRegular,
          color: muted,
        });
        p.drawLine({
          start: { x: MARGIN_X, y: PAGE_H - 76 },
          end: { x: PAGE_W - MARGIN_X, y: PAGE_H - 76 },
          thickness: 1,
          color: accentBlue,
        });
        cursorY = PAGE_H - 96;
      } else if (membrete === 'AUTORIZACION_OFICIAL') {
        if (logoAuthHead) {
          const dim = dimensionesProporcionales(logoAuthHead, 66, 52);
          p.drawImage(logoAuthHead, {
            x: MARGIN_X,
            y: PAGE_H - 22 - dim.height,
            width: dim.width,
            height: dim.height,
          });
          const textX = MARGIN_X + dim.width + 14;
          p.drawText(sanitizar('Scouts de Argentina Asociación Civil'), {
            x: textX,
            y: PAGE_H - 36,
            size: 10.5,
            font: fontBold,
            color: accentBlue,
          });
          p.drawText(
            sanitizar('Grupo Scout "Juan XXIII" N° 196 · Distrito 1 · Zona 22 Córdoba Norte - La Rioja'),
            {
              x: textX,
              y: PAGE_H - 50,
              size: 8,
              font: fontRegular,
              color: black,
            },
          );
          p.drawText(sanitizar('www.scouts.org.ar · gsjuanxxiii@gmail.com'), {
            x: textX,
            y: PAGE_H - 62,
            size: 7.5,
            font: fontRegular,
            color: muted,
          });
          p.drawLine({
            start: { x: MARGIN_X, y: PAGE_H - 80 },
            end: { x: PAGE_W - MARGIN_X, y: PAGE_H - 80 },
            thickness: 1,
            color: accentBlue,
          });
          cursorY = PAGE_H - 100;
        } else {
          cursorY = PAGE_H - 52;
        }
      } else {
        cursorY = PAGE_H - 52;
      }

      const titleLines = dividirTextoEnLineas(tituloDoc, fontBold, 13.5, CONTENT_W);
      for (const line of titleLines) {
        p.drawText(sanitizar(line), {
          x: MARGIN_X,
          y: cursorY,
          size: 13.5,
          font: fontBold,
          color: black,
        });
        cursorY -= 17;
      }
      if (membrete !== 'SALUD_NACIONAL' && subtituloDoc) {
        p.drawText(subtituloDoc, {
          x: MARGIN_X,
          y: cursorY,
          size: 8.5,
          font: fontRegular,
          color: muted,
        });
        cursorY -= 14;
      } else {
        cursorY -= 4;
      }
    } else {
      p.drawText(sanitizar(`${tituloDoc} — Continuación`), {
        x: MARGIN_X,
        y: PAGE_H - 32,
        size: 9,
        font: fontBold,
        color: muted,
      });
      p.drawLine({
        start: { x: MARGIN_X, y: PAGE_H - 40 },
        end: { x: PAGE_W - MARGIN_X, y: PAGE_H - 40 },
        thickness: 0.75,
        color: borderGray,
      });
      cursorY = PAGE_H - 58;
    }

    if (membrete === 'AUTORIZACION_OFICIAL' && logoAuthFoot) {
      const dim = dimensionesProporcionales(logoAuthFoot, 72, 30);
      p.drawLine({
        start: { x: MARGIN_X, y: 45 },
        end: { x: PAGE_W - MARGIN_X, y: 45 },
        thickness: 0.6,
        color: borderGray,
      });
      p.drawImage(logoAuthFoot, { x: MARGIN_X, y: 12, width: dim.width, height: dim.height });
      const footX = MARGIN_X + dim.width + 10;
      p.drawText(
        sanitizar('Scouts de Argentina Asociación Civil · Personería Jurídica Nacional N° 1645416'),
        { x: footX, y: 31, size: 6.5, font: fontBold, color: muted },
      );
      p.drawText(
        sanitizar('Grupo Scout "Juan XXIII" N° 196 · Vera y Zárate 3069 · Córdoba · Argentina'),
        { x: footX, y: 22, size: 6.5, font: fontRegular, color: muted },
      );
      p.drawText(
        sanitizar('Mail: gsjuanxxiii@gmail.com · www.scouts.org.ar'),
        { x: footX, y: 13, size: 6.5, font: fontRegular, color: muted },
      );
    }
    return p;
  };

  let page: PDFPage = crearPagina(true);

  const iniciarPagina = (esPrimera: boolean) => {
    page = crearPagina(esPrimera);
  };

  const asegurarEspacio = (alturaNecesaria: number) => {
    if (cursorY - alturaNecesaria < BOTTOM_MARGIN) {
      iniciarPagina(false);
    }
  };

  // Recuadro resumen del miembro (si mostrarResumenMiembro !== false)
  if (esquema?.mostrarResumenMiembro !== false) {
    const nombreResumen = blankMode
      ? '................................................'
      : sanitizar(
          respuestasFormateadas.protagonista_nombre_completo ||
            (usuario ? `${usuario.apellido.toUpperCase()}, ${usuario.nombre}` : '—'),
        );
    const dniResumen = blankMode
      ? '........................'
      : sanitizar(respuestasFormateadas.protagonista_dni || usuario?.dni || '—');
    const fnacResumen = blankMode
      ? '.... / .... / ........'
      : sanitizar(respuestasFormateadas.protagonista_fecha_nac || '—');
    const ramaResumen = blankMode
      ? '............................'
      : sanitizar(respuestasFormateadas.rama_nombre || usuario?.ramaNombre || '—');
    const domResumen = blankMode
      ? '................................................'
      : sanitizar(respuestasFormateadas.protagonista_domicilio || '—');
    const telResumen = blankMode
      ? '........................'
      : sanitizar(
          respuestasFormateadas.protagonista_telefono || usuario?.telefonoContacto || '—',
        );

    const boxH = 56;
    asegurarEspacio(boxH + 8);
    page.drawRectangle({
      x: MARGIN_X,
      y: cursorY - boxH,
      width: CONTENT_W,
      height: boxH,
      color: legalBg,
      borderColor: borderGray,
      borderWidth: 0.8,
    });

    const drawPair = (lbl: string, val: string, x: number, y: number) => {
      page.drawText(sanitizar(lbl), { x, y, size: 7.5, font: fontBold, color: muted });
      const lw = fontBold.widthOfTextAtSize(sanitizar(lbl), 7.5);
      page.drawText(sanitizar(val), {
        x: x + lw + 4,
        y,
        size: 8.5,
        font: fontBold,
        color: blankMode ? black : inkData,
      });
    };

    drawPair('Apellido y Nombre:', nombreResumen, MARGIN_X + 10, cursorY - 15);
    drawPair('DNI:', dniResumen, MARGIN_X + 310, cursorY - 15);
    drawPair('Fecha Nac.:', fnacResumen, MARGIN_X + 10, cursorY - 31);
    drawPair('Rama / Sección:', ramaResumen, MARGIN_X + 310, cursorY - 31);
    drawPair('Domicilio:', domResumen, MARGIN_X + 10, cursorY - 47);
    drawPair('Teléfono:', telResumen, MARGIN_X + 310, cursorY - 47);
    cursorY -= boxH + 12;
  }

  // Texto introductorio del documento (opcional)
  if (typeof esquema?.textoIntroduccion === 'string' && esquema.textoIntroduccion.trim()) {
    const introInterp = interpolarTextoLegal(
      esquema.textoIntroduccion,
      respuestasFormateadas,
      blankMode,
    );
    const introLines = dividirTextoEnLineas(introInterp, fontRegular, 9.5, CONTENT_W - 8);
    for (const line of introLines) {
      asegurarEspacio(14);
      if (line) {
        page.drawText(sanitizar(line), {
          x: MARGIN_X,
          y: cursorY - 9,
          size: 9.5,
          font: fontRegular,
          color: black,
        });
      }
      cursorY -= line ? 13 : 7;
    }
    cursorY -= 6;
  }

  // Mapa rápido de campos por sección para omitir detalles integrados duplicados si aplica
  const secciones = Array.isArray(esquema?.secciones) ? esquema.secciones : [];
  for (let sIdx = 0; sIdx < secciones.length; sIdx++) {
    const sec = secciones[sIdx];
    if (!sec) continue;

    if (sec.saltoPaginaAntes && sIdx > 0 && cursorY < PAGE_H - 130) {
      iniciarPagina(false);
    }

    // Cabecera de sección
    const hasDesc = Boolean(sec.descripcion && String(sec.descripcion).trim());
    const headerH = hasDesc ? 30 : 21;
    asegurarEspacio(headerH + 24);
    page.drawRectangle({
      x: MARGIN_X,
      y: cursorY - headerH,
      width: CONTENT_W,
      height: headerH,
      color: bandBg,
      borderColor: borderGray,
      borderWidth: 0.7,
    });
    page.drawText(sanitizar(`${sIdx + 1}. ${sec.titulo || `Sección ${sIdx + 1}`}`), {
      x: MARGIN_X + 8,
      y: cursorY - 14,
      size: 10,
      font: fontBold,
      color: accentBlue,
    });
    if (hasDesc) {
      page.drawText(sanitizar(String(sec.descripcion).trim()), {
        x: MARGIN_X + 8,
        y: cursorY - 25,
        size: 7.5,
        font: fontItalic,
        color: muted,
      });
    }
    cursorY -= headerH + 8;

    // Párrafo Legal / Declaración de la sección
    if (typeof sec.textoLegal === 'string' && sec.textoLegal.trim()) {
      const textoInterp = interpolarTextoLegal(sec.textoLegal, respuestasFormateadas, blankMode);
      const legalLines = dividirTextoEnLineas(textoInterp, fontRegular, 9.5, CONTENT_W - 22);
      const lineH = 13;

      let lineIdx = 0;
      while (lineIdx < legalLines.length) {
        const espacioDisp = Math.max(24, cursorY - BOTTOM_MARGIN - 12);
        const maxLinesHere = Math.max(1, Math.floor(espacioDisp / lineH));
        const chunk = legalLines.slice(lineIdx, lineIdx + maxLinesHere);
        const chunkH = chunk.length * lineH + 14;

        page.drawRectangle({
          x: MARGIN_X,
          y: cursorY - chunkH,
          width: CONTENT_W,
          height: chunkH,
          color: legalBg,
          borderColor: borderGray,
          borderWidth: 0.6,
        });
        page.drawRectangle({
          x: MARGIN_X,
          y: cursorY - chunkH,
          width: 3,
          height: chunkH,
          color: accentBlue,
        });

        let ty = cursorY - 15;
        for (const l of chunk) {
          if (l) {
            page.drawText(sanitizar(l), {
              x: MARGIN_X + 11,
              y: ty,
              size: 9.5,
              font: fontRegular,
              color: black,
            });
          }
          ty -= lineH;
        }

        cursorY -= chunkH + 8;
        lineIdx += chunk.length;
        if (lineIdx < legalLines.length) {
          iniciarPagina(false);
        }
      }
    }

    // Tabla autoajustable de preguntas y respuestas
    const camposSec = Array.isArray(sec.campos) ? sec.campos : [];
    if (!sec.ocultarTablaCamposEnPdf && camposSec.length > 0) {
      const colLabelW = Math.round(CONTENT_W * 0.44);
      const colValW = CONTENT_W - colLabelW;
      const camposKeysEnSec = new Set(camposSec.map((c: any) => String(c?.key || '')));

      for (let cIdx = 0; cIdx < camposSec.length; cIdx++) {
        const c = camposSec[cIdx];
        if (!c?.key) continue;

        let valTexto = '';
        if (blankMode) {
          if (c.type === 'materiales_tabla') {
            valTexto =
              'Construcción (Préstamo / Donación): ...................................\nCampamento (Préstamo / Donación): ...................................';
          } else if (c.type === 'boolean') {
            valTexto = '[  ] SÍ    [  ] NO';
          } else if (
            (c.type === 'select' || c.type === 'multiselect') &&
            Array.isArray(c.options) &&
            c.options.length > 0
          ) {
            valTexto = c.options.map((o: any) => `[ ] ${o.label || o.value}`).join('   ');
          } else {
            valTexto = '....................................................';
          }
        } else {
          // Si este campo es detalle de un boolean false en la misma sección y está vacío, omitir
          if (
            c.esDetalleDe &&
            camposKeysEnSec.has(c.esDetalleDe) &&
            respuestasFormateadas[c.esDetalleDe] === false &&
            !respuestasFormateadas[c.key]
          ) {
            continue;
          }

          if (c.type === 'materiales_tabla') {
            const partesMat = [
              respuestasFormateadas.mat_construccion_prestamo
                ? `Construcción (Préstamo): ${String(respuestasFormateadas.mat_construccion_prestamo)}`
                : '',
              respuestasFormateadas.mat_construccion_donacion
                ? `Construcción (Donación): ${String(respuestasFormateadas.mat_construccion_donacion)}`
                : '',
              respuestasFormateadas.mat_campamento_prestamo
                ? `Campamento (Préstamo): ${String(respuestasFormateadas.mat_campamento_prestamo)}`
                : '',
              respuestasFormateadas.mat_campamento_donacion
                ? `Campamento (Donación): ${String(respuestasFormateadas.mat_campamento_donacion)}`
                : '',
            ].filter(Boolean);
            valTexto = partesMat.length > 0 ? partesMat.join('\n') : '—';
          } else {
            const rawVal = respuestasFormateadas[c.key];
            if (c.type === 'boolean') {
              valTexto = esValorVerdaderoPdf(rawVal) ? 'SÍ' : 'NO';
            } else if (Array.isArray(c.options) && typeof rawVal === 'string') {
              const matchedOpt = c.options.find((o: any) => String(o.value) === rawVal);
              valTexto = matchedOpt ? String(matchedOpt.label || rawVal) : rawVal;
            } else {
              valTexto = formatearValorTextoPdf(rawVal);
            }
          }

          // Si el campo es select/multiselect con chips y su valor ya es texto legible o vacío:
          if (!valTexto) valTexto = '—';
        }

        const labelLines = dividirTextoEnLineas(
          sanitizar(c.label || c.key),
          fontBold,
          8.5,
          colLabelW - 14,
        );
        const valLines = dividirTextoEnLineas(sanitizar(valTexto), fontBold, 8.8, colValW - 14);
        const maxLines = Math.max(1, labelLines.length, valLines.length);
        const rowH = Math.max(20, maxLines * 11.5 + 8);

        if (cursorY - rowH < BOTTOM_MARGIN) {
          iniciarPagina(false);
        }

        const isAlt = cIdx % 2 === 1;
        page.drawRectangle({
          x: MARGIN_X,
          y: cursorY - rowH,
          width: CONTENT_W,
          height: rowH,
          color: isAlt ? rgb(0.985, 0.988, 0.995) : rgb(1, 1, 1),
          borderColor: borderGray,
          borderWidth: 0.45,
        });
        page.drawLine({
          start: { x: MARGIN_X + colLabelW, y: cursorY },
          end: { x: MARGIN_X + colLabelW, y: cursorY - rowH },
          thickness: 0.45,
          color: borderGray,
        });

        let ly = cursorY - 12.5;
        for (const ll of labelLines) {
          if (ll) {
            page.drawText(sanitizar(ll), {
              x: MARGIN_X + 7,
              y: ly,
              size: 8.5,
              font: fontBold,
              color: muted,
            });
          }
          ly -= 11;
        }

        let vy = cursorY - 12.5;
        for (const vl of valLines) {
          if (vl) {
            page.drawText(sanitizar(vl), {
              x: MARGIN_X + colLabelW + 7,
              y: vy,
              size: 8.8,
              font: blankMode ? fontRegular : fontBold,
              color: blankMode || valTexto === '—' ? muted : inkData,
            });
          }
          vy -= 11.5;
        }

        cursorY -= rowH;
      }
      cursorY -= 10;
    }

    // Firmas opcionales al cierre de esta sección
    const firmasSec: string[] = Array.isArray(sec.firmasSeccion) ? sec.firmasSeccion : [];
    if (firmasSec.length > 0) {
      asegurarEspacio(48);
      const slotW = (CONTENT_W - (firmasSec.length - 1) * 16) / firmasSec.length;
      firmasSec.forEach((fId, idx) => {
        const fx = MARGIN_X + idx * (slotW + 16);
        const cfg = FIRMAS_LABELS[fId] || { titulo: fId, subtitulo: 'Aclaración y DNI' };
        page.drawLine({
          start: { x: fx + 8, y: cursorY - 26 },
          end: { x: fx + slotW - 8, y: cursorY - 26 },
          thickness: 0.8,
          color: black,
        });
        page.drawText(sanitizar(cfg.titulo), {
          x: fx + 8,
          y: cursorY - 36,
          size: 7.2,
          font: fontBold,
          color: black,
        });
      });
      cursorY -= 46;
    }
  }

  // Texto de cierre + firmas finales + QR de verificación
  const textoCierre =
    typeof esquema?.textoCierre === 'string' && esquema.textoCierre.trim()
      ? interpolarTextoLegal(esquema.textoCierre, respuestasFormateadas, blankMode)
      : '';
  const cierreLines = textoCierre
    ? dividirTextoEnLineas(textoCierre, fontItalic, 8.8, CONTENT_W - 8)
    : [];
  const firmasDoc: string[] =
    Array.isArray(esquema?.firmas) && esquema.firmas.length > 0
      ? esquema.firmas
      : ['ADULTO_RESPONSABLE'];

  const bloqueFinalH =
    (cierreLines.length > 0 ? cierreLines.length * 12 + 10 : 0) +
    (firmasDoc.length > 0 ? 58 : 0) +
    74;
  if (cursorY - bloqueFinalH < BOTTOM_MARGIN) {
    iniciarPagina(false);
  }

  for (const cl of cierreLines) {
    if (cl) {
      page.drawText(sanitizar(cl), {
        x: MARGIN_X,
        y: cursorY - 9,
        size: 8.8,
        font: fontItalic,
        color: muted,
      });
    }
    cursorY -= 12;
  }
  if (cierreLines.length > 0) cursorY -= 8;

  // Reservar franja derecha (84pt) si hay QR para que firmas y QR convivan sin pisarse
  const anchoFirmasArea = hashVerificacion ? CONTENT_W - 90 : CONTENT_W;
  if (firmasDoc.length > 0) {
    const cols = Math.min(3, firmasDoc.length);
    const colW = (anchoFirmasArea - (cols - 1) * 14) / cols;
    firmasDoc.slice(0, 3).forEach((fId, idx) => {
      const fx = MARGIN_X + idx * (colW + 14);
      const cfg = FIRMAS_LABELS[fId] || { titulo: fId, subtitulo: 'Aclaración y DNI' };
      page.drawLine({
        start: { x: fx, y: BOTTOM_MARGIN + 38 },
        end: { x: fx + colW, y: BOTTOM_MARGIN + 38 },
        thickness: 0.8,
        color: black,
      });
      page.drawText(sanitizar(cfg.titulo), {
        x: fx,
        y: BOTTOM_MARGIN + 27,
        size: 7.2,
        font: fontBold,
        color: black,
        maxWidth: colW,
      });
      page.drawText(sanitizar(cfg.subtitulo), {
        x: fx,
        y: BOTTOM_MARGIN + 17,
        size: 6.8,
        font: fontRegular,
        color: muted,
      });
    });
  }

  if (hashVerificacion) {
    try {
      const qrDataUrl = await QRCode.toDataURL(hashVerificacion, { margin: 1, width: 160 });
      const qrImg = await pdfDoc.embedPng(dataUriToBytes(qrDataUrl));
      const qrW = 54;
      const qrX = PAGE_W - MARGIN_X - qrW;
      const qrY = BOTTOM_MARGIN + 16;
      page.drawImage(qrImg, { x: qrX, y: qrY, width: qrW, height: qrW });
      page.drawText(sanitizar(`Verif: ${hashVerificacion.slice(0, 10)} · v${versionImpresion}`), {
        x: qrX - 6,
        y: BOTTOM_MARGIN + 6,
        size: 6.2,
        font: fontRegular,
        color: muted,
      });
    } catch {
      // Omitir QR si fallara en entorno sin soporte
    }
  }

  // Numeración de páginas discreta
  const totalP = pagesCreated.length;
  pagesCreated.forEach((p, idx) => {
    p.drawText(sanitizar(`Página ${idx + 1} de ${totalP}`), {
      x: MARGIN_X,
      y: BOTTOM_MARGIN - 12,
      size: 7,
      font: fontRegular,
      color: muted,
    });
  });

  return await pdfDoc.save();
}

/**
 * Genera el documento PDF final con las respuestas y el código QR de verificación.
 * Si usa `DISENO_SECCIONES`, construye un documento estructurado desde el esquema;
 * para todos los legajos oficiales y PDFs externos aplica rellenado AcroForm / estampado dinámico.
 */
export async function generarFichaPdf(
  mapeo: MapeoPdf,
  respuestas: Record<string, unknown>,
  hashVerificacion: string,
  usuario?: {
    nombre: string;
    apellido: string;
    dni: string;
    fechaNacimiento?: string | Date;
    ramaNombre?: string;
    telefonoContacto?: string;
    tipoMiembro?: string;
  },
  versionImpresion = 1,
  esquema?: Record<string, any>,
  opcionesExtra?: { blank?: boolean },
): Promise<Uint8Array> {
  const esquemaEfectivo = esquema || mapeo?.esquemaDocumento;
  const respuestasFormateadas = prepararRespuestasParaImpresion(
    respuestas,
    usuario,
    esquemaEfectivo,
  );

  const bytes =
    mapeo?.modoRender === 'DISENO_SECCIONES' || mapeo?.pdfBaseUrl === '__DISENO_SECCIONES__'
      ? await generarPdfPorSecciones(
          esquemaEfectivo,
          respuestasFormateadas,
          hashVerificacion,
          usuario,
          versionImpresion,
          Boolean(opcionesExtra?.blank),
        )
      : await estampadoDinamicoPdf(mapeo, respuestasFormateadas, hashVerificacion, versionImpresion, {
          esquema: esquemaEfectivo,
          rawRespuestas: respuestas,
          usuario,
          blank: Boolean(opcionesExtra?.blank),
        });

  return esHashBorrador(hashVerificacion) ? await aplicarMarcaBorrador(bytes) : bytes;
}

/** Prefijo de hash para PDFs que NO corresponden a una entrega finalizada en el servidor. */
export const PREFIJO_HASH_BORRADOR = 'BORRADOR-';

export function esHashBorrador(hash: string | null | undefined): boolean {
  return typeof hash === 'string' && hash.startsWith(PREFIJO_HASH_BORRADOR);
}

/**
 * Estampa "BORRADOR — NO VÁLIDO" en diagonal sobre cada página, para que un PDF con datos
 * sin guardar no pueda confundirse con el documento oficial que valida el QR.
 */
async function aplicarMarcaBorrador(bytes: Uint8Array): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes);
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const texto = sanitizarTextoWinAnsi('BORRADOR - NO VÁLIDO');
  for (const page of doc.getPages()) {
    const { width, height } = page.getSize();
    const size = Math.min(width, height) / 9;
    const ancho = font.widthOfTextAtSize(texto, size);
    page.drawText(texto, {
      x: width / 2 - (ancho / 2) * Math.cos(Math.PI / 4),
      y: height / 2 - (ancho / 2) * Math.sin(Math.PI / 4),
      size,
      font,
      color: rgb(0.8, 0.1, 0.1),
      opacity: 0.18,
      rotate: degrees(45),
    });
  }
  return await doc.save();
}

/**
 * Crea una URL temporal en memoria (Blob URL) para visualizar el PDF en pantalla sin descargarlo.
 */
export function crearUrlPdfBlob(bytes: Uint8Array): string {
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
  return URL.createObjectURL(blob);
}

/**
 * Abre el PDF directamente en una nueva pestaña del navegador para lectura sin descarga forzada.
 */
export function abrirPdfEnPestana(bytes: Uint8Array): void {
  const url = crearUrlPdfBlob(bytes);
  window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * Descarga directamente el PDF generado en el navegador del usuario.
 */
export function descargarPdfBlob(bytes: Uint8Array, nombreArchivo: string): void {
  const url = crearUrlPdfBlob(bytes);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revocar en el acto puede cortar la descarga en iOS Safari/Firefox.
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
