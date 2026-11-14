export interface AlertaMedicaItem {
  id: string;
  titulo: string;
  detalle?: string;
  critico: boolean;
}

export interface InfoMedicaMiembro {
  grupoSanguineo: string | null;
  obraSocial: string | null;
  afiliadoObraSocial: string | null;
  alertas: AlertaMedicaItem[];
  criticasCount: number;
  tieneAlertas: boolean;
  resumenAlertas: string;
}

const FRASES_NEGATIVAS = new Set([
  'no',
  'no posee',
  'no tiene',
  'ninguna',
  'ninguno',
  '-',
  '--',
  'n/a',
  'na',
  'sin',
  'sin alergias',
  'sin datos',
  'false',
  '0',
]);

function normalizarFrase(val: unknown): string {
  return String(val ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function esVerdadero(val: unknown): boolean {
  if (val === true) return true;
  const s = normalizarFrase(val);
  return s === 'true' || s === 'si' || s === '1';
}

function esFalsoExplicito(val: unknown): boolean {
  if (val === false) return true;
  const s = normalizarFrase(val);
  return s === 'false' || s === 'no' || s === '0';
}

function limpiarDetallePositivo(val: unknown): string | null {
  if (val === undefined || val === null || typeof val === 'boolean') return null;
  const texto = String(val).trim();
  if (!texto) return null;
  if (FRASES_NEGATIVAS.has(normalizarFrase(texto))) return null;
  return texto;
}

function textoValorLimpio(val: unknown): string | null {
  if (val === undefined || val === null || typeof val === 'boolean') return null;
  const texto = String(val).trim();
  if (!texto) return null;
  const norm = normalizarFrase(texto);
  if (norm === '-' || norm === '--' || norm === 'sin especificar' || norm === 'n/a' || norm === 'na') {
    return null;
  }
  return texto;
}

export function extraerInfoMedicaMiembro(miembro: any, entrega?: any): InfoMedicaMiembro {
  const datos: Record<string, any> = {
    ...(miembro?.datosFijosJson && typeof miembro.datosFijosJson === 'object' ? miembro.datosFijosJson : {}),
    ...(entrega?.respuestasSnapshotJson && typeof entrega.respuestasSnapshotJson === 'object'
      ? entrega.respuestasSnapshotJson
      : {}),
  };

  const alertas: AlertaMedicaItem[] = [];

  const agregarAlerta = (
    id: string,
    titulo: string,
    critico: boolean,
    banderas: unknown[],
    detalles: unknown[],
    fallbackDetalle = 'Sí',
  ) => {
    const detalleValido = detalles.map(limpiarDetallePositivo).find(Boolean) ?? null;
    const banderaActiva = banderas.some(esVerdadero) || banderas.some((b) => Boolean(limpiarDetallePositivo(b)));
    if (!banderaActiva && !detalleValido) return;
    alertas.push({
      id,
      titulo,
      detalle: detalleValido || fallbackDetalle,
      critico,
    });
  };

  // 1. Alergias (crítico)
  agregarAlerta(
    'alergias',
    'Alergias',
    true,
    [datos.sufre_alergia, datos.alergias, datos.sufre_alergia_detalle],
    [datos.sufre_alergia_detalle, datos.alergias],
    'Sí (sin detalle especificado)',
  );

  // 2. Medicación habitual (crítico)
  agregarAlerta(
    'medicacion',
    'Toma medicación',
    true,
    [datos.toma_medicacion, datos.toma_medicacion_detalle],
    [datos.toma_medicacion_detalle],
  );

  // 3. Enfermedad crónica (crítico)
  agregarAlerta(
    'enfermedad_cronica',
    'Enfermedad crónica',
    true,
    [datos.enfermedad_cronica, datos.enfermedad_cronica_detalle],
    [datos.enfermedad_cronica_detalle],
  );

  // 4. Tratamiento médico activo (crítico)
  agregarAlerta(
    'tratamiento',
    'Tratamiento médico activo',
    true,
    [datos.requiere_tratamiento, datos.requiere_tratamiento_detalle],
    [datos.requiere_tratamiento_detalle],
  );

  // 5. Anticoagulado (crítico)
  agregarAlerta(
    'anticoagulado',
    'Anticoagulado/a',
    true,
    [datos.esta_anticoagulado, datos.anticoagulado_droga],
    [datos.anticoagulado_droga],
  );

  // 6. Restricción actividad física (crítico)
  const detalleRestriccionFisica = limpiarDetallePositivo(datos.sit_actividad_fisica_no_especifique);
  if (esFalsoExplicito(datos.sit_cualquier_actividad_fisica) || detalleRestriccionFisica) {
    alertas.push({
      id: 'restriccion_fisica',
      titulo: 'Restricción actividad física',
      detalle: detalleRestriccionFisica || 'No puede realizar cualquier actividad',
      critico: true,
    });
  }

  // 7. Situaciones clínicas puntuales (crítico cuando están presentes)
  const situacionesPuntuales: string[] = [];
  if (esVerdadero(datos.sit_hemorragias_nasales)) situacionesPuntuales.push('Hemorragias nasales');
  if (esVerdadero(datos.sit_sangrado_encias)) situacionesPuntuales.push('Sangrado de encías');
  if (esVerdadero(datos.sit_dolor_cabeza)) situacionesPuntuales.push('Dolor de cabeza frecuente');
  if (esVerdadero(datos.sit_presion_alta)) situacionesPuntuales.push('Presión alta');
  if (esVerdadero(datos.sit_presion_baja)) situacionesPuntuales.push('Presión baja');
  if (esVerdadero(datos.sit_transfusiones)) situacionesPuntuales.push('Recibió transfusiones');
  if (esVerdadero(datos.sit_convulsiones)) situacionesPuntuales.push('Antecedente de convulsiones');
  if (esVerdadero(datos.sit_cirugias_ultimo_anio)) situacionesPuntuales.push('Cirugía último año');
  if (esVerdadero(datos.sit_internaciones_ultimo_anio)) situacionesPuntuales.push('Internación último año');

  if (situacionesPuntuales.length > 0) {
    alertas.push({
      id: 'situaciones_clinicas',
      titulo: 'Antecedentes clínicos',
      detalle: situacionesPuntuales.join(' · '),
      critico: true,
    });
  }

  // 8. Dieta / Régimen alimentario
  agregarAlerta(
    'dieta',
    'Dieta / Régimen',
    false,
    [datos.regimen_dietario, datos.regimen_dietario_detalle],
    [datos.regimen_dietario_detalle],
  );

  // 9. CUD
  agregarAlerta(
    'cud',
    'Posee CUD',
    false,
    [datos.tiene_cud],
    [datos.ne_diagnostico, datos.ne_cud_vencimiento_prestacion],
  );

  // 10. Ataques de pánico / ansiedad
  agregarAlerta(
    'panico',
    'Pánico / ansiedad',
    false,
    [datos.ataques_panico_ansiedad, datos.ataques_panico_frecuencia],
    [datos.ataques_panico_frecuencia],
  );

  // 11. Diagnóstico y tratamiento de salud mental
  agregarAlerta(
    'salud_mental',
    'Salud mental',
    false,
    [datos.diagnostico_salud_mental, datos.diagnostico_salud_mental_detalle],
    [datos.diagnostico_salud_mental_detalle],
  );

  agregarAlerta(
    'tratamiento_salud_mental',
    'Tratamiento salud mental',
    false,
    [datos.recibe_tratamiento_salud_mental, datos.recibe_tratamiento_salud_mental_detalle],
    [datos.recibe_tratamiento_salud_mental_detalle],
  );

  // 12. Miedo / fobia puntual
  agregarAlerta(
    'fobia',
    'Miedo / fobia puntual',
    false,
    [datos.miedo_fobia_excesivo, datos.miedo_fobia_detalle],
    [datos.miedo_fobia_detalle],
  );

  const grupoRaw = textoValorLimpio(datos.grupo_sanguineo);
  const factorRaw = textoValorLimpio(datos.factor_rh);
  const grupoSanguineo = grupoRaw ? `${grupoRaw}${factorRaw ? ` ${factorRaw}` : ''}`.trim() : null;

  const obraSocial = textoValorLimpio(datos.obra_social);
  const afiliadoObraSocial = textoValorLimpio(datos.obra_social_afiliado);

  const criticasCount = alertas.filter((a) => a.critico).length;
  const tieneAlertas = alertas.length > 0;
  const resumenAlertas = alertas
    .slice(0, 2)
    .map((a) => (a.detalle && a.detalle !== 'Sí' ? `${a.titulo}: ${a.detalle}` : a.titulo))
    .join(' · ');

  return {
    grupoSanguineo,
    obraSocial,
    afiliadoObraSocial,
    alertas,
    criticasCount,
    tieneAlertas,
    resumenAlertas,
  };
}
