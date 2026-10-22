import { buildOfficialPdf, generarMoldeEnBlancoPdf } from './officialPdfBuilder';

export { buildOfficialPdf, generarMoldeEnBlancoPdf };

export interface CoordenadaCampo {
  page?: number;
  x: number;
  y: number;
  size?: number;
  type?: 'text' | 'checkbox_x';
  trueCoords?: { page?: number; x: number; y: number };
  falseCoords?: { page?: number; x: number; y: number };
}

export interface MapeoPdf {
  pdfBaseUrl: string;
  campos: Record<string, CoordenadaCampo>;
  qrVerificacion?: {
    page?: number;
    x: number;
    y: number;
    width?: number;
  };
}

/**
 * Normaliza y enriquece las respuestas brutas del formulario con textos legibles,
 * desglose de fechas, datos de usuario y prellenado de autorizaciones.
 */
export function prepararRespuestasParaImpresion(
  rawResp: Record<string, unknown>,
  usuario?: { nombre: string; apellido: string; dni: string; fechaNacimiento?: string | Date; ramaNombre?: string; telefonoContacto?: string },
): Record<string, unknown> {
  const resp: Record<string, unknown> = { ...rawResp };

  // 1. Datos básicos del protagonista
  if (usuario) {
    resp.protagonista_nombre_completo = `${usuario.apellido.toUpperCase()}, ${usuario.nombre}`;
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
    resp.adulto_hijo_nombre = `${usuario.nombre} ${usuario.apellido}`;

    if (usuario.fechaNacimiento) {
      const d = new Date(usuario.fechaNacimiento);
      if (!isNaN(d.getTime())) {
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = String(d.getFullYear());
        resp.protagonista_fecha_nac = `${dd} / ${mm} / ${yyyy}`;
        resp.salud_fecha_nac = `${dd} / ${mm} / ${yyyy}`;
        resp.menor_nac_dia_p3 = dd;
        resp.menor_nac_mes_p3 = mm;
        resp.menor_nac_anio_p3 = yyyy;
        resp.menor_nac_dia_p4 = dd;
        resp.menor_nac_mes_p4 = mm;
        resp.menor_nac_anio_p4 = yyyy;
        resp.ret_menor_nac = `${dd} / ${mm} / ${yyyy}`;
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
  resp.salidas_ciclo_anio = '2026';
  resp.ret_provincia_ciudad = 'Córdoba, Capital';

  // Fecha actual para autorizaciones
  const hoy = new Date();
  const meses = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ];
  resp.ingreso_dia = String(hoy.getDate());
  resp.ingreso_mes = meses[hoy.getMonth()];
  resp.ingreso_anio = String(hoy.getFullYear());
  resp.salidas_dia = String(hoy.getDate());
  resp.salidas_mes = meses[hoy.getMonth()];
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

  // Salud booleans y textos
  resp.salud_toma_medicacion = formatBool(resp.toma_medicacion);
  resp.toma_medicacion_texto = resp.salud_toma_medicacion;
  resp.salud_toma_medicacion_detalle = resp.toma_medicacion_detalle || '';

  resp.salud_enfermedad_cronica = formatBool(resp.enfermedad_cronica);
  resp.enfermedad_cronica_texto = resp.salud_enfermedad_cronica;
  resp.salud_enfermedad_cronica_detalle = resp.enfermedad_cronica_detalle || '';

  resp.salud_requiere_tratamiento = formatBool(resp.requiere_tratamiento);
  resp.requiere_tratamiento_texto = resp.salud_requiere_tratamiento;
  resp.salud_requiere_tratamiento_detalle = resp.requiere_tratamiento_detalle || '';

  resp.salud_tiene_cud = formatBool(resp.tiene_cud);
  resp.tiene_cud_texto = resp.salud_tiene_cud;

  resp.salud_sufre_alergia = formatBool(resp.sufre_alergia);
  resp.sufre_alergia_texto = resp.salud_sufre_alergia;
  resp.salud_sufre_alergia_detalle = resp.sufre_alergia_detalle || '';

  resp.salud_anticoagulado = formatBool(resp.esta_anticoagulado);
  resp.esta_anticoagulado_texto = resp.salud_anticoagulado;
  resp.salud_anticoagulado_droga = resp.anticoagulado_droga || '';

  resp.salud_regimen_dietario = formatBool(resp.regimen_dietario);
  resp.regimen_dietario_texto = resp.salud_regimen_dietario;
  resp.salud_regimen_dietario_detalle = resp.regimen_dietario_detalle || '';

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

  resp.autorizante_nombre_p3 = autNombre;
  resp.autorizante_nacionalidad_p3 = resp.autorizante_nacionalidad || 'Argentina';
  resp.autorizante_dni_p3 = autDni;
  resp.autorizante_telefono_p3 = autTel;
  resp.autorizante_domicilio_p3 = autDom;
  resp.autorizante_caracter_p3 = autCaracter;

  resp.autorizante_nombre_p4 = autNombre;
  resp.autorizante_nacionalidad_p4 = resp.autorizante_nacionalidad || 'Argentina';
  resp.autorizante_dni_p4 = autDni;
  resp.autorizante_telefono_p4 = autTel;
  resp.autorizante_domicilio_p4 = autDom;
  resp.autorizante_caracter_p4 = autCaracter;

  resp.ret_autorizante_nombre = autNombre;
  resp.ret_autorizante_nacionalidad = resp.autorizante_nacionalidad || 'Argentina';
  resp.ret_autorizante_dni = autDni;
  resp.ret_autorizante_telefono = autTel;
  resp.ret_autorizante_domicilio = autDom;
  resp.ret_firmante_aclaracion = autNombre;

  resp.salud_firmante_aclaracion = autNombre;
  resp.salud_firmante_dni = autDni;

  // Fecha de nacimiento del adulto
  if (resp.autorizante_fecha_nac) {
    const fnParts = String(resp.autorizante_fecha_nac).split(/[-/]/);
    if (fnParts.length === 3) {
      if (fnParts[0].length === 4) {
        resp.autorizante_nac_anio_p3 = fnParts[0];
        resp.autorizante_nac_mes_p3 = fnParts[1];
        resp.autorizante_nac_dia_p3 = fnParts[2];
        resp.autorizante_nac_anio_p4 = fnParts[0];
        resp.autorizante_nac_mes_p4 = fnParts[1];
        resp.autorizante_nac_dia_p4 = fnParts[2];
        resp.ret_autorizante_nac = `${fnParts[2]} / ${fnParts[1]} / ${fnParts[0]}`;
      } else {
        resp.autorizante_nac_dia_p3 = fnParts[0];
        resp.autorizante_nac_mes_p3 = fnParts[1];
        resp.autorizante_nac_anio_p3 = fnParts[2];
        resp.autorizante_nac_dia_p4 = fnParts[0];
        resp.autorizante_nac_mes_p4 = fnParts[1];
        resp.autorizante_nac_anio_p4 = fnParts[2];
        resp.ret_autorizante_nac = `${fnParts[0]} / ${fnParts[1]} / ${fnParts[2]}`;
      }
    }
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
      resp.adulto_nombre = autNombre;
    }
    if (!resp.adulto_telefono) {
      resp.adulto_telefono = autTel;
    }
    if (!resp.adulto_direccion) {
      resp.adulto_direccion = autDom;
    }
  }

  return resp;
}

/**
 * Genera el documento PDF final con las respuestas y el código QR de verificación
 * directamente en el navegador del cliente (Zero-File architecture).
 */
export async function generarFichaPdf(
  _mapeo: MapeoPdf,
  respuestas: Record<string, unknown>,
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
): Promise<Uint8Array> {
  const respuestasFormateadas = prepararRespuestasParaImpresion(respuestas, usuario);

  return await buildOfficialPdf(respuestasFormateadas, {
    hashVerificacion,
    usuario,
    versionImpresion,
  });
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
  URL.revokeObjectURL(url);
}
