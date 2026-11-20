/**
 * Genera los 3 moldes AcroForm oficiales del Grupo Scout Juan XXIII N° 196 en
 * `frontend/public/pdf-templates/`:
 *   1. `planilla_salud_01_25_acroform.pdf`   (1 pág. — Educadores y Adultos)
 *   2. `legajo_menores_2026_acroform.pdf`   (7 págs. — Protagonistas menores de 18)
 *   3. `legajo_mayores_2026_acroform.pdf`   (4 págs. — Protagonistas +18 / Rovers, sin hoja 3 de salidas)
 *
 * Uso: node frontend/scripts/generar-acroform-legajos-2026.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts, TextAlignment, rgb } from 'pdf-lib';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.resolve(__dirname, '../public/pdf-templates');

const SOURCE_MENORES = path.join(TEMPLATES_DIR, 'legajo_ingreso_menores_2026_original.pdf');
const mayoresFile = fs
  .readdirSync(TEMPLATES_DIR)
  .find((f) => /mayores.*2026\.pdf$/i.test(f));

if (!fs.existsSync(SOURCE_MENORES)) {
  throw new Error(`No se encontró el PDF fuente de menores en ${SOURCE_MENORES}`);
}
if (!mayoresFile) {
  throw new Error(`No se encontró el PDF fuente de mayores (*mayores*2026.pdf) en ${TEMPLATES_DIR}`);
}
const SOURCE_MAYORES = path.join(TEMPLATES_DIR, mayoresFile);

const OUT_SALUD = path.join(TEMPLATES_DIR, 'planilla_salud_01_25_acroform.pdf');
const OUT_MENORES = path.join(TEMPLATES_DIR, 'legajo_menores_2026_acroform.pdf');
const OUT_MAYORES = path.join(TEMPLATES_DIR, 'legajo_mayores_2026_acroform.pdf');

const INK_BLUE = rgb(0.03, 0.2, 0.52);
const WHITE = rgb(1, 1, 1);

function agregarBloqueFamiliar(prefix, topY) {
  return [
    { name: `${prefix}_nombres`, x: 256, y: topY - 1.0, width: 198, height: 11.5 },
    { name: `${prefix}_dni`, x: 482, y: topY - 1.0, width: 84, height: 11.5 },
    { name: `${prefix}_domicilio`, x: 206, y: topY - 26.0, width: 360, height: 11.5 },
    { name: `${prefix}_convive_texto`, x: 342, y: topY - 38.0, width: 60, height: 11.5 },
    { name: `${prefix}_email`, x: 193, y: topY - 64.5, width: 174, height: 11.5 },
    { name: `${prefix}_telefono`, x: 418, y: topY - 63.0, width: 148, height: 11.5 },
    { name: `${prefix}_profesion`, x: 207, y: topY - 95.4, width: 160, height: 11.5 },
    { name: `${prefix}_estado_civil`, x: 416, y: topY - 95.4, width: 150, height: 11.5 },
  ];
}

// ---------------- PÁGINA 1: FICHA DE INSCRIPCIÓN (612 × 792) ----------------
const CAMPOS_INSCRIPCION = [
  { name: 'rama_nombre', x: 84, y: 661.5, width: 145, height: 11, whiteBg: true },
  { name: 'protagonista_nombre_completo', x: 138, y: 607.5, width: 154, height: 11.5 },
  { name: 'protagonista_dni', x: 320, y: 607.5, width: 90, height: 11.5 },
  { name: 'protagonista_fecha_nac', x: 487, y: 608.5, width: 74, height: 11.5, whiteBg: true, center: true },
  { name: 'protagonista_domicilio', x: 96, y: 583.5, width: 464, height: 11.5 },
  { name: 'protagonista_telefono', x: 92, y: 559.5, width: 310, height: 11.5 },
  { name: 'religion', x: 453, y: 559.5, width: 108, height: 11.5 },
  { name: 'escolaridad_institucion', x: 182, y: 535.5, width: 220, height: 11.5 },
  { name: 'escolaridad_grado', x: 465, y: 536.5, width: 96, height: 11.5 },
  { name: 'obra_social', x: 103, y: 512.5, width: 298, height: 11.5 },
  { name: 'obra_social_afiliado', x: 464, y: 510.0, width: 97, height: 11.5 },
  { name: 'tiene_hermanos_texto', x: 131, y: 486.8, width: 31, height: 11.5, whiteBg: true, center: true },
  { name: 'hobby_texto', x: 414, y: 486.8, width: 152, height: 11.5 },
  { name: 'condicion_salud_preexistente_texto', x: 358, y: 463.0, width: 48, height: 11.5 },
  ...agregarBloqueFamiliar('madre', 418.0),
  ...agregarBloqueFamiliar('padre', 287.0),
  ...agregarBloqueFamiliar('tutor', 158.0),
];

// ---------------- PÁGINA 2: DECLARACIÓN JURADA DE SALUD 01-25 (595.56 × 842.04) ----------------
const CAMPOS_SALUD_TEXTO = [
  { name: 'salud_apellido', x: 108, y: 671.5, width: 192, height: 11.5 },
  { name: 'salud_nombre', x: 108, y: 656.4, width: 192, height: 11.5 },
  { name: 'salud_fecha_nac', x: 160, y: 641.4, width: 140, height: 11.5, whiteBg: true },
  { name: 'salud_dni', x: 98, y: 626.4, width: 120, height: 11.5 },
  { name: 'salud_zona', x: 106, y: 606.8, width: 28, height: 10.5, center: true },
  { name: 'salud_distrito', x: 185, y: 606.8, width: 32, height: 10.5, center: true },
  { name: 'salud_grupo', x: 265, y: 606.8, width: 35, height: 10.5, center: true },
  { name: 'salud_domicilio', x: 114, y: 584.7, width: 186, height: 11.5 },
  { name: 'salud_tel_emergencia1', x: 191, y: 543.6, width: 108, height: 11.5 },
  { name: 'salud_tel_emergencia2', x: 191, y: 522.8, width: 108, height: 11.5 },

  { name: 'salud_vac_quintuple', x: 215.5, y: 449.2, width: 87, height: 9.2, center: true, whiteBg: true },
  { name: 'salud_vac_triple_celular', x: 215.5, y: 437.8, width: 87, height: 9.2, center: true, whiteBg: true },
  { name: 'salud_vac_triple_acelular', x: 215.5, y: 426.5, width: 87, height: 9.2, center: true, whiteBg: true },
  { name: 'salud_vac_doble_bacteriana', x: 215.5, y: 415.2, width: 87, height: 9.2, center: true, whiteBg: true },

  { name: 'salud_toma_medicacion', x: 249, y: 373.2, width: 52, height: 11 },
  { name: 'salud_toma_medicacion_detalle', x: 71, y: 363.2, width: 232, height: 10.5 },
  { name: 'salud_enfermedad_cronica', x: 295, y: 339.2, width: 25, height: 11 },
  { name: 'salud_enfermedad_cronica_detalle', x: 71, y: 329.3, width: 232, height: 10.5 },
  { name: 'salud_requiere_tratamiento', x: 232, y: 310.2, width: 68, height: 11 },
  { name: 'salud_requiere_tratamiento_detalle', x: 71, y: 300.0, width: 232, height: 10.5 },
  { name: 'salud_tiene_cud', x: 164, y: 286.2, width: 60, height: 11 },
  { name: 'salud_sufre_alergia', x: 229, y: 269.2, width: 72, height: 11 },
  { name: 'salud_sufre_alergia_detalle', x: 71, y: 259.1, width: 232, height: 10.5 },
  { name: 'salud_anticoagulado', x: 270, y: 245.4, width: 34, height: 11 },
  { name: 'salud_anticoagulado_droga', x: 71, y: 235.3, width: 232, height: 10.5 },
  { name: 'salud_regimen_dietario', x: 297, y: 216.3, width: 25, height: 11 },
  { name: 'salud_regimen_dietario_detalle', x: 71, y: 206.1, width: 232, height: 10.5 },
  { name: 'salud_ataques_panico', x: 273, y: 180.3, width: 32, height: 11 },
  { name: 'salud_ataques_panico_frecuencia', x: 151, y: 169.8, width: 152, height: 10.5 },
  { name: 'salud_salud_mental', x: 172, y: 134.0, width: 80, height: 11 },
  { name: 'salud_salud_mental_detalle', x: 71, y: 123.7, width: 232, height: 10.5 },
  { name: 'salud_tratamiento_mental', x: 216, y: 109.9, width: 80, height: 11 },
  { name: 'salud_tratamiento_mental_detalle', x: 71, y: 88.2, width: 232, height: 19, multiline: true },
  { name: 'salud_fobia', x: 260, y: 61.9, width: 44, height: 11 },
  { name: 'salud_fobia_detalle', x: 71, y: 49.5, width: 232, height: 11 },

  { name: 'salud_control_medico_fecha', x: 338, y: 648.1, width: 222, height: 11.5 },
  { name: 'sit_hemorragias_nasales', x: 544.2, y: 610.3, width: 23.8, height: 9.6, center: true },
  { name: 'sit_sangrado_encias', x: 544.2, y: 598.9, width: 23.8, height: 9.6, center: true },
  { name: 'sit_dolor_cabeza', x: 544.2, y: 587.5, width: 23.8, height: 9.6, center: true },
  { name: 'sit_presion_alta', x: 544.2, y: 576.3, width: 23.8, height: 9.6, center: true },
  { name: 'sit_presion_baja', x: 544.2, y: 564.9, width: 23.8, height: 9.6, center: true },
  { name: 'sit_transfusiones', x: 544.2, y: 553.7, width: 23.8, height: 9.6, center: true },
  { name: 'sit_convulsiones', x: 544.2, y: 542.3, width: 23.8, height: 9.6, center: true },
  { name: 'sit_cirugias_ultimo_anio', x: 544.2, y: 530.8, width: 23.8, height: 9.6, center: true },
  { name: 'sit_internaciones_ultimo_anio', x: 544.2, y: 519.6, width: 23.8, height: 9.6, center: true },
  { name: 'sit_actividad_fisica', x: 544.2, y: 508.3, width: 23.8, height: 9.6, center: true },
  { name: 'sit_cualquier_actividad_fisica', x: 544.2, y: 497.0, width: 23.8, height: 9.6, center: true },
  { name: 'sit_actividad_fisica_no_detalle', x: 336, y: 472.0, width: 232, height: 11 },
  { name: 'salud_grupo_sanguineo', x: 410, y: 458.5, width: 50, height: 11, center: true },
  { name: 'salud_factor_rh', x: 518, y: 458.5, width: 46, height: 11, center: true },
  { name: 'salud_peso', x: 365, y: 430.5, width: 68, height: 11, center: true },
  { name: 'salud_talla', x: 492, y: 430.5, width: 44, height: 11, center: true },
  { name: 'salud_comunicacion_educador_detalle', x: 336, y: 354.8, width: 232, height: 11.5 },
  { name: 'salud_obra_social', x: 434, y: 279.4, width: 134, height: 11.5 },
  { name: 'salud_obra_social_afiliado', x: 400, y: 258.5, width: 166, height: 11.5 },
  { name: 'salud_obra_social_emergencia', x: 458, y: 237.6, width: 110, height: 11.5 },
  { name: 'salud_firmante_aclaracion', x: 383, y: 99.6, width: 183, height: 11.5 },
  { name: 'salud_firmante_dni', x: 356, y: 78.9, width: 101, height: 11.5 },
  { name: 'salud_firmante_fecha', x: 496, y: 78.9, width: 72, height: 11.5, whiteBg: true, center: true },
];

const CAMPOS_SALUD_CHECKBOXES = [
  { name: 'no_tiene_vacunas_mencionadas', x: 254, y: 403.8, width: 8.8, height: 8.8 },
  { name: 'no_sabe_vacunas', x: 254, y: 392.4, width: 8.8, height: 8.8 },
];

// ---------------- PÁGINA 3: AUTORIZACIÓN INGRESO MENORES 07-21 (595.32 × 841.92) ----------------
const CAMPOS_INGRESO_0721 = [
  { name: 'ingreso_localidad', x: 158, y: 640.2, width: 122, height: 11, whiteBg: true },
  { name: 'ingreso_departamento', x: 406, y: 640.2, width: 124, height: 11, whiteBg: true },
  { name: 'ingreso_provincia', x: 127, y: 627.0, width: 162, height: 11, whiteBg: true },
  { name: 'ingreso_dia', x: 318, y: 627.0, width: 21, height: 11, whiteBg: true, center: true },
  { name: 'ingreso_mes', x: 416, y: 627.0, width: 78, height: 11, whiteBg: true, center: true },
  { name: 'ingreso_anio', x: 528, y: 627.0, width: 26, height: 11, whiteBg: true, center: true },

  { name: 'autorizante_nombre_p3', x: 103, y: 613.8, width: 184, height: 11, whiteBg: true },
  { name: 'autorizante_nacionalidad_p3', x: 365, y: 613.8, width: 95, height: 11, whiteBg: true },
  { name: 'autorizante_nac_dia_p3', x: 536, y: 613.8, width: 22, height: 11, whiteBg: true, center: true },
  { name: 'autorizante_nac_mes_p3', x: 83, y: 600.6, width: 52, height: 11, whiteBg: true, center: true },
  { name: 'autorizante_nac_anio_p3', x: 158, y: 600.6, width: 38, height: 11, whiteBg: true, center: true },
  { name: 'autorizante_dni_p3', x: 217, y: 600.6, width: 78, height: 11, whiteBg: true },
  { name: 'autorizante_telefono_p3', x: 356, y: 600.6, width: 122, height: 11, whiteBg: true },
  { name: 'autorizante_domicilio_p3', x: 82, y: 587.4, width: 446, height: 11, whiteBg: true },
  { name: 'autorizante_caracter_p3', x: 140, y: 574.1, width: 174, height: 11, whiteBg: true },

  { name: 'menor_nombre_p3', x: 72, y: 560.8, width: 228, height: 11, whiteBg: true },
  { name: 'menor_nacionalidad_p3', x: 397, y: 560.8, width: 100, height: 11, whiteBg: true },
  { name: 'menor_nac_dia_p3', x: 71, y: 547.7, width: 42, height: 11, whiteBg: true, center: true },
  { name: 'menor_nac_mes_p3', x: 130, y: 547.7, width: 146, height: 11, whiteBg: true, center: true },
  { name: 'menor_nac_anio_p3', x: 294, y: 547.7, width: 52, height: 11, whiteBg: true, center: true },
  { name: 'menor_dni_p3', x: 382, y: 547.7, width: 102, height: 11, whiteBg: true },
  { name: 'menor_domicilio_p3', x: 72, y: 534.4, width: 404, height: 11, whiteBg: true },
  { name: 'aclaraciones_tenencia_guarda', x: 72, y: 379.5, width: 484, height: 12, whiteBg: true },
];

// ---------------- PÁGINA 4: AUTORIZACIÓN SALIDAS CERCANAS 07-21 (595.32 × 841.92) ----------------
const CAMPOS_SALIDAS_0721 = [
  { name: 'salidas_localidad', x: 158, y: 653.9, width: 122, height: 11, whiteBg: true },
  { name: 'salidas_departamento', x: 406, y: 653.9, width: 124, height: 11, whiteBg: true },
  { name: 'salidas_provincia', x: 127, y: 640.7, width: 162, height: 11, whiteBg: true },
  { name: 'salidas_dia', x: 318, y: 640.7, width: 21, height: 11, whiteBg: true, center: true },
  { name: 'salidas_mes', x: 416, y: 640.7, width: 78, height: 11, whiteBg: true, center: true },
  { name: 'salidas_anio', x: 528, y: 640.7, width: 26, height: 11, whiteBg: true, center: true },

  { name: 'autorizante_nombre_p4', x: 98, y: 627.5, width: 182, height: 11, whiteBg: true },
  { name: 'autorizante_nacionalidad_p4', x: 356, y: 627.5, width: 102, height: 11, whiteBg: true },
  { name: 'autorizante_nac_dia_p4', x: 525, y: 627.5, width: 18, height: 11, whiteBg: true, center: true },
  { name: 'autorizante_nac_mes_p4', x: 72, y: 614.3, width: 66, height: 11, whiteBg: true, center: true },
  { name: 'autorizante_nac_anio_p4', x: 160, y: 614.3, width: 34, height: 11, whiteBg: true, center: true },
  { name: 'autorizante_dni_p4', x: 217, y: 614.3, width: 78, height: 11, whiteBg: true },
  { name: 'autorizante_telefono_p4', x: 356, y: 614.3, width: 122, height: 11, whiteBg: true },
  { name: 'autorizante_domicilio_p4', x: 82, y: 601.1, width: 446, height: 11, whiteBg: true },
  { name: 'autorizante_caracter_p4', x: 148, y: 587.7, width: 168, height: 11, whiteBg: true },

  { name: 'menor_nombre_p4', x: 124, y: 574.5, width: 204, height: 11, whiteBg: true },
  { name: 'menor_nacionalidad_p4', x: 452, y: 574.5, width: 96, height: 11, whiteBg: true },
  { name: 'menor_nac_dia_p4', x: 118, y: 561.3, width: 38, height: 11, whiteBg: true, center: true },
  { name: 'menor_nac_mes_p4', x: 179, y: 561.3, width: 108, height: 11, whiteBg: true, center: true },
  { name: 'menor_nac_anio_p4', x: 312, y: 561.3, width: 48, height: 11, whiteBg: true, center: true },
  { name: 'menor_dni_p4', x: 398, y: 561.3, width: 88, height: 11, whiteBg: true },
  { name: 'menor_domicilio_p4', x: 72, y: 548.1, width: 398, height: 11, whiteBg: true },
  { name: 'salidas_ciclo_anio', x: 524, y: 521.6, width: 32, height: 11, whiteBg: true, center: true },
];

// ---------------- PÁGINA 5 (MEN) / PÁG 3 (MAY): NECESIDADES ESPECIALES (612 × 792) ----------------
const CAMPOS_NECESIDADES_ESPECIALES = [
  { name: 'ne_diagnostico', x: 123, y: 559.8, width: 410, height: 11.5, whiteBg: true },
  { name: 'ne_evolucion', x: 115, y: 541.1, width: 418, height: 11.5, whiteBg: true },
  { name: 'ne_medico_cabecera', x: 160, y: 521.8, width: 373, height: 11.5, whiteBg: true },
  { name: 'ne_medicacion', x: 122, y: 502.8, width: 411, height: 11.5, whiteBg: true },
  { name: 'ne_otros_antecedentes', x: 231, y: 483.9, width: 302, height: 11.5, whiteBg: true },
  { name: 'ne_medicamento_horarios', x: 196, y: 464.9, width: 337, height: 11.5, whiteBg: true },
  { name: 'ne_escolaridad', x: 122, y: 445.9, width: 411, height: 11.5, whiteBg: true },
  { name: 'ne_obra_social', x: 122, y: 426.9, width: 411, height: 11.5, whiteBg: true },
  { name: 'ne_cud_vencimiento_prestacion', x: 65, y: 369, width: 468, height: 31, whiteBg: true, multiline: true },
  { name: 'ne_grupo_acompanante', x: 64, y: 294, width: 478, height: 34, whiteBg: true, multiline: true },
  { name: 'ne_terapias_previas', x: 138, y: 271.1, width: 400, height: 11.5, whiteBg: true },
  { name: 'ne_situaciones_estres_abordaje', x: 68, y: 211, width: 474, height: 32, whiteBg: true, multiline: true },
  { name: 'ne_descripcion_hijo_gustos_miedos', x: 68, y: 141, width: 474, height: 32, whiteBg: true, multiline: true },
  { name: 'ne_expectativas_familia', x: 68, y: 63, width: 474, height: 50, whiteBg: true, multiline: true },
];

// ---------------- PÁGINA 6: AUTORIZACIÓN RETIRO DE MENORES (612 × 792) ----------------
const CAMPOS_RETIRO_MENORES = [
  { name: 'ret_autorizante_nombre', x: 68, y: 620.3, width: 184, height: 11, whiteBg: true },
  { name: 'ret_autorizante_nacionalidad', x: 350, y: 620.3, width: 82, height: 11, whiteBg: true },
  { name: 'ret_autorizante_nac', x: 55, y: 605.9, width: 96, height: 11, whiteBg: true, center: true },
  { name: 'ret_autorizante_dni', x: 176, y: 605.9, width: 80, height: 11, whiteBg: true },
  { name: 'ret_autorizante_telefono', x: 318, y: 605.9, width: 118, height: 11, whiteBg: true },
  { name: 'ret_autorizante_domicilio', x: 65, y: 591.5, width: 196, height: 11, whiteBg: true },

  { name: 'ret_menor_nombre', x: 50, y: 577.1, width: 174, height: 11, whiteBg: true },
  { name: 'ret_menor_nacionalidad', x: 306, y: 577.1, width: 92, height: 11, whiteBg: true },
  { name: 'ret_menor_nac_dia_mes', x: 478, y: 577.1, width: 70, height: 11, whiteBg: true, center: true },
  { name: 'ret_menor_nac_anio', x: 50, y: 562.7, width: 34, height: 11, whiteBg: true, center: true },
  { name: 'ret_menor_dni', x: 120, y: 562.7, width: 70, height: 11, whiteBg: true },
  { name: 'ret_menor_domicilio', x: 276, y: 562.7, width: 194, height: 11, whiteBg: true },

  { name: 'ret_persona1_nombre', x: 173, y: 503.8, width: 214, height: 11, whiteBg: true },
  { name: 'ret_persona1_dni', x: 428, y: 503.8, width: 90, height: 11, whiteBg: true },
  { name: 'ret_persona1_telefono', x: 128, y: 485.5, width: 84, height: 11, whiteBg: true },
  { name: 'ret_persona1_caracter', x: 294, y: 485.5, width: 184, height: 11, whiteBg: true },

  { name: 'ret_persona2_nombre', x: 173, y: 456.7, width: 214, height: 11, whiteBg: true },
  { name: 'ret_persona2_dni', x: 428, y: 456.7, width: 90, height: 11, whiteBg: true },
  { name: 'ret_persona2_telefono', x: 128, y: 442.3, width: 84, height: 11, whiteBg: true },
  { name: 'ret_persona2_caracter', x: 294, y: 442.3, width: 184, height: 11, whiteBg: true },

  { name: 'ret_persona3_nombre', x: 173, y: 413.5, width: 214, height: 11, whiteBg: true },
  { name: 'ret_persona3_dni', x: 428, y: 413.5, width: 90, height: 11, whiteBg: true },
  { name: 'ret_persona3_telefono', x: 128, y: 399.1, width: 84, height: 11, whiteBg: true },
  { name: 'ret_persona3_caracter', x: 294, y: 399.1, width: 184, height: 11, whiteBg: true },

  { name: 'ret_retiro_solo_texto', x: 218, y: 362.0, width: 326, height: 11.5, whiteBg: true },
  { name: 'ret_fecha_completa', x: 78, y: 306.8, width: 106, height: 11.5, whiteBg: true, center: true },
  { name: 'ret_provincia_ciudad', x: 134, y: 278.7, width: 160, height: 11.5, whiteBg: true },
  { name: 'ret_firmante_aclaracion', x: 326, y: 207.5, width: 218, height: 11.5, whiteBg: true },
];

// ---------------- PÁGINA 7 (MEN) / PÁG 4 (MAY): FICHA DE ADULTOS (612 × 792) ----------------
const CAMPOS_ADULTOS_TEXTO = [
  { name: 'adulto_nombre', x: 100, y: 595.5, width: 365, height: 11.5, whiteBg: true },
  { name: 'adulto_hijo_nombre', x: 145, y: 578.3, width: 400, height: 11.5, whiteBg: true },
  { name: 'adulto_direccion', x: 90, y: 561.0, width: 456, height: 11.5, whiteBg: true },
  { name: 'adulto_localidad', x: 97, y: 543.8, width: 210, height: 11.5, whiteBg: true },
  { name: 'adulto_codigo_postal', x: 375, y: 543.8, width: 168, height: 11.5, whiteBg: true },
  { name: 'adulto_profesion', x: 124, y: 526.6, width: 422, height: 11.5, whiteBg: true },
  { name: 'adulto_telefono', x: 93, y: 509.5, width: 128, height: 11.5, whiteBg: true },
  { name: 'adulto_preferencia_trabajo', x: 454, y: 509.5, width: 96, height: 11.5, whiteBg: true, center: true },
  { name: 'colab_otros_detalle', x: 82, y: 298.5, width: 466, height: 11.5, whiteBg: true },
  { name: 'adulto_observaciones', x: 54, y: 24, width: 468, height: 22, whiteBg: true, multiline: true },
];

const COLAB_IZQ_KEYS = [
  'colab_servicio_comunitario',
  'colab_fotocopias',
  'colab_mano_obra',
  'colab_administrativo',
  'colab_transporte',
  'colab_camion',
  'colab_camioneta',
  'colab_colectivo',
];
const COLAB_IZQ_Y = [457.5, 440.8, 424.2, 407.5, 390.9, 374.3, 357.6, 341.0];

const COLAB_DER_KEYS = [
  'colab_recaudacion_fondos',
  'colab_campamento',
  'colab_cocina_campamento',
  'colab_ensenando',
  'colab_mostrando_trabajo',
  'colab_alimentos_no_perecederos',
  'colab_tareas_especiales',
  'colab_otros',
];
const COLAB_DER_Y = [456.8, 440.1, 423.4, 406.6, 389.9, 373.2, 356.4, 339.7];

const MAT_CONSTRUCCION_KEYS = [
  'chapas',
  'puntales',
  'tablas',
  'paneles',
  'postes',
  'clavos',
  'alambrado',
  'alambre_fardo',
  'ladrillos',
  'cemento',
  'pala',
  'serrucho',
  'pinzas',
  'destornilladores',
];
const MAT_CONSTRUCCION_Y = [
  215.2, 204.5, 193.7, 183.0, 172.2, 161.4, 150.7, 140.0, 129.3, 118.5, 107.7, 97.0, 86.2, 75.6,
];

const MAT_CAMPAMENTO_KEYS = [
  'carpas',
  'tablones',
  'lonas',
  'media_sombras',
  'sogas',
  'estacas',
  'cajones',
  'tachos',
  'bidones',
  'bancos',
  'quemadores',
  'utensilios',
  'otros_camp',
];
const MAT_CAMPAMENTO_Y = [
  215.2, 204.5, 193.7, 183.0, 172.2, 161.4, 150.7, 140.0, 129.3, 118.5, 108.1, 97.3, 86.7,
];

const CAMPOS_ADULTOS_CHECKBOXES = [
  ...COLAB_IZQ_KEYS.map((name, i) => ({
    name,
    x: 263,
    y: COLAB_IZQ_Y[i],
    width: 9,
    height: 9,
  })),
  ...COLAB_DER_KEYS.map((name, i) => ({
    name,
    x: 481.5,
    y: COLAB_DER_Y[i],
    width: 9,
    height: 9,
  })),
  ...MAT_CONSTRUCCION_KEYS.flatMap((k, i) => [
    { name: `mat_${k}_prestamo`, x: 191, y: MAT_CONSTRUCCION_Y[i], width: 8.2, height: 8.2 },
    { name: `mat_${k}_donacion`, x: 245, y: MAT_CONSTRUCCION_Y[i], width: 8.2, height: 8.2 },
  ]),
  ...MAT_CAMPAMENTO_KEYS.flatMap((k, i) => [
    { name: `mat_${k}_prestamo`, x: 414, y: MAT_CAMPAMENTO_Y[i], width: 8.2, height: 8.2 },
    { name: `mat_${k}_donacion`, x: 468, y: MAT_CAMPAMENTO_Y[i], width: 8.2, height: 8.2 },
  ]),
];

function agregarCamposTexto(form, page, fontBold, specs) {
  for (const spec of specs) {
    const field = form.createTextField(spec.name);
    if (spec.multiline) field.enableMultiline();
    if (spec.center) field.setAlignment(TextAlignment.Center);

    field.addToPage(page, {
      x: spec.x,
      y: spec.y,
      width: spec.width,
      height: spec.height,
      font: fontBold,
      textColor: INK_BLUE,
      backgroundColor: spec.whiteBg ? WHITE : undefined,
      borderColor: undefined,
      borderWidth: 0,
    });
    field.setFontSize(spec.height <= 11 ? 7.8 : 8.5);
  }
}

function agregarCheckboxes(form, page, specs) {
  for (const cbSpec of specs) {
    const cb = form.createCheckBox(cbSpec.name);
    cb.addToPage(page, {
      x: cbSpec.x,
      y: cbSpec.y,
      width: cbSpec.width,
      height: cbSpec.height,
      textColor: INK_BLUE,
      backgroundColor: WHITE,
      borderColor: INK_BLUE,
      borderWidth: 0.7,
    });
  }
}

async function construirPdfDesdeEspecificacion({
  sourcePath,
  pageIndices,
  outputPath,
  title,
  subject,
  poblarPaginas,
}) {
  const sourceBytes = fs.readFileSync(sourcePath);
  const srcDoc = await PDFDocument.load(sourceBytes, { ignoreEncryption: true });
  const maxIndex = Math.max(...pageIndices);
  if (srcDoc.getPageCount() <= maxIndex) {
    throw new Error(
      `El PDF ${path.basename(sourcePath)} tiene ${srcDoc.getPageCount()} página(s); se esperaba índice ${maxIndex}.`,
    );
  }

  const outDoc = await PDFDocument.create();
  outDoc.setTitle(title);
  outDoc.setSubject(subject);

  const copiedPages = await outDoc.copyPages(srcDoc, pageIndices);
  const pages = copiedPages.map((p) => outDoc.addPage(p));
  const fontBold = await outDoc.embedFont(StandardFonts.HelveticaBold);
  const form = outDoc.getForm();

  poblarPaginas(form, pages, fontBold);

  form.updateFieldAppearances(fontBold);
  const outBytes = await outDoc.save();
  fs.writeFileSync(outputPath, outBytes);

  const verifyDoc = await PDFDocument.load(outBytes);
  const totalFields = verifyDoc.getForm().getFields().length;
  console.log(
    `✅ Generado ${path.relative(process.cwd(), outputPath)} (${outBytes.length} bytes, ${verifyDoc.getPageCount()} pág., ${totalFields} campos AcroForm)`,
  );
}

async function main() {
  // 1. Educadores / Adultos: solo Planilla 01-25 (1 página)
  await construirPdfDesdeEspecificacion({
    sourcePath: SOURCE_MENORES,
    pageIndices: [1],
    outputPath: OUT_SALUD,
    title: 'Declaración Jurada de Salud - Planilla 01-25 (AcroForm)',
    subject: 'Scouts de Argentina - Planilla 01-25 - Educadores y Adultos',
    poblarPaginas: (form, pages, fontBold) => {
      agregarCamposTexto(form, pages[0], fontBold, CAMPOS_SALUD_TEXTO);
      agregarCheckboxes(form, pages[0], CAMPOS_SALUD_CHECKBOXES);
    },
  });

  // 2. Protagonistas Menores (<18): 7 páginas completas
  await construirPdfDesdeEspecificacion({
    sourcePath: SOURCE_MENORES,
    pageIndices: [0, 1, 2, 3, 4, 5, 6],
    outputPath: OUT_MENORES,
    title: 'Legajo de Ingreso 2026 - Menores de 18 años (AcroForm)',
    subject: 'Grupo Scout Juan XXIII N° 196 - Legajo Menores 2026',
    poblarPaginas: (form, pages, fontBold) => {
      agregarCamposTexto(form, pages[0], fontBold, CAMPOS_INSCRIPCION);
      agregarCamposTexto(form, pages[1], fontBold, CAMPOS_SALUD_TEXTO);
      agregarCheckboxes(form, pages[1], CAMPOS_SALUD_CHECKBOXES);
      agregarCamposTexto(form, pages[2], fontBold, CAMPOS_INGRESO_0721);
      agregarCamposTexto(form, pages[3], fontBold, CAMPOS_SALIDAS_0721);
      agregarCamposTexto(form, pages[4], fontBold, CAMPOS_NECESIDADES_ESPECIALES);
      agregarCamposTexto(form, pages[5], fontBold, CAMPOS_RETIRO_MENORES);
      agregarCamposTexto(form, pages[6], fontBold, CAMPOS_ADULTOS_TEXTO);
      agregarCheckboxes(form, pages[6], CAMPOS_ADULTOS_CHECKBOXES);
    },
  });

  // 3. Protagonistas Mayores (+18 / Rovers): 4 páginas [0, 1, 3, 4] (excluye índice 2 de salidas)
  await construirPdfDesdeEspecificacion({
    sourcePath: SOURCE_MAYORES,
    pageIndices: [0, 1, 3, 4],
    outputPath: OUT_MAYORES,
    title: 'Legajo de Afiliación 2026 - Protagonistas Mayores +18 (AcroForm)',
    subject: 'Grupo Scout Juan XXIII N° 196 - Legajo Rovers 2026',
    poblarPaginas: (form, pages, fontBold) => {
      agregarCamposTexto(form, pages[0], fontBold, CAMPOS_INSCRIPCION);
      agregarCamposTexto(form, pages[1], fontBold, CAMPOS_SALUD_TEXTO);
      agregarCheckboxes(form, pages[1], CAMPOS_SALUD_CHECKBOXES);
      agregarCamposTexto(form, pages[2], fontBold, CAMPOS_NECESIDADES_ESPECIALES);
      agregarCamposTexto(form, pages[3], fontBold, CAMPOS_ADULTOS_TEXTO);
      agregarCheckboxes(form, pages[3], CAMPOS_ADULTOS_CHECKBOXES);
    },
  });
}

main().catch((err) => {
  console.error('❌ Error generando los moldes AcroForm 2026:', err);
  process.exitCode = 1;
});
