export interface OpcionMedica {
  value: string;
  label: string;
}

export const OPCIONES_DIETA_ESTANDAR: readonly OpcionMedica[] = [
  { value: 'VEGETARIANO', label: 'Vegetariano' },
  { value: 'VEGANO', label: 'Vegano' },
  { value: 'CELIACO', label: 'Celíaco / Sin TACC' },
  { value: 'SIN_LACTOSA', label: 'Sin Lactosa' },
  { value: 'DIABETICO', label: 'Diabético' },
  { value: 'HIPOSODICO', label: 'Hiposódico / Sin sal' },
  { value: 'OTRO', label: 'Otro régimen' },
];

export const OPCIONES_ALERGIA_ESTANDAR: readonly OpcionMedica[] = [
  { value: 'ALIMENTOS', label: 'Alimentos' },
  { value: 'MEDICAMENTOS', label: 'Medicamentos' },
  { value: 'PICADURAS', label: 'Picaduras / Insectos' },
  { value: 'AMBIENTALES', label: 'Ambientales / Respiratorias' },
  { value: 'OTRAS', label: 'Otras alergias' },
];

export const OPCIONES_MEDICACION_ESTANDAR: readonly OpcionMedica[] = [
  { value: 'DIARIA', label: 'Uso diario / Permanente' },
  { value: 'RESCATE', label: 'Rescate / SOS' },
  { value: 'ANALGESICOS', label: 'Analgésicos autorizados' },
  { value: 'TEMPORAL', label: 'Tratamiento temporal' },
];

export const OPCIONES_CONDICION_ESTANDAR: readonly OpcionMedica[] = [
  { value: 'ASMA', label: 'Asma / Broncoespasmo' },
  { value: 'DIABETES', label: 'Diabetes' },
  { value: 'EPILEPSIA', label: 'Epilepsia / Convulsiones' },
  { value: 'CARDIOPATIA', label: 'Cardiopatía' },
  { value: 'HIPERTENSION', label: 'Hipertensión' },
  { value: 'HIPOTENSION', label: 'Hipotensión' },
  { value: 'OTRA', label: 'Otra condición' },
];

export interface CatalogosMedicosDinamicos {
  dietas: OpcionMedica[];
  alergias: OpcionMedica[];
  medicaciones: OpcionMedica[];
  condiciones: OpcionMedica[];
}

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
  dietas: string[];
  dietasLabels: string[];
  dietaDetalle: string | null;
  tieneDieta: boolean;
  alergiasTipos: string[];
  alergiasLabels: string[];
  alergiasDetalle: string | null;
  tieneAlergia: boolean;
  medicacionTipos: string[];
  medicacionLabels: string[];
  medicacionDetalle: string | null;
  tomaMedicacion: boolean;
  condicionesTipos: string[];
  condicionesLabels: string[];
  condicionesDetalle: string | null;
  tieneCondicionCronica: boolean;
  restriccionFisica: string | null;
  tieneRestriccionFisica: boolean;
  tieneCud: boolean;
  situacionesClinicas: string[];
  telEmergencia1: string | null;
  telEmergencia2: string | null;
  pesoKg: string | null;
  tallaM: string | null;
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

export function esVerdadero(val: unknown): boolean {
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
  if (val === undefined || val === null || typeof val === 'boolean' || Array.isArray(val)) {
    return null;
  }
  const texto = String(val).trim();
  if (!texto) return null;
  if (FRASES_NEGATIVAS.has(normalizarFrase(texto))) return null;
  return texto;
}

function textoValorLimpio(val: unknown): string | null {
  if (val === undefined || val === null || typeof val === 'boolean' || Array.isArray(val)) {
    return null;
  }
  const texto = String(val).trim();
  if (!texto) return null;
  const norm = normalizarFrase(texto);
  if (norm === '-' || norm === '--' || norm === 'sin especificar' || norm === 'n/a' || norm === 'na') {
    return null;
  }
  return texto;
}

function combinarOpciones(
  base: readonly OpcionMedica[],
  extras: OpcionMedica[],
): OpcionMedica[] {
  const mapa = new Map<string, OpcionMedica>();
  for (const op of base) {
    mapa.set(op.value, { ...op });
  }
  for (const op of extras) {
    if (!op.value) continue;
    if (!mapa.has(op.value)) {
      mapa.set(op.value, { value: op.value, label: op.label || op.value });
    }
  }
  return Array.from(mapa.values());
}

/**
 * Combina los catálogos estándar con opciones personalizadas declaradas en `esquemaCamposJson`
 * para campos con `categoriaMedica` ('DIETA', 'ALERGIA', 'MEDICACION', 'ENFERMEDAD_CRONICA').
 */
export function extraerCatalogosMedicosDinamicos(plantillas?: any[]): CatalogosMedicosDinamicos {
  const extrasDietas: OpcionMedica[] = [];
  const extrasAlergias: OpcionMedica[] = [];
  const extrasMedicaciones: OpcionMedica[] = [];
  const extrasCondiciones: OpcionMedica[] = [];

  for (const p of plantillas || []) {
    const secciones = Array.isArray(p?.esquemaCamposJson?.secciones)
      ? p.esquemaCamposJson.secciones
      : [];
    for (const sec of secciones) {
      const campos = Array.isArray(sec?.campos) ? sec.campos : [];
      for (const c of campos) {
        const cat = String(c?.categoriaMedica || '').toUpperCase();
        const opts = Array.isArray(c?.options)
          ? c.options
              .filter((o: any) => o && typeof o.value === 'string')
              .map((o: any) => ({ value: String(o.value), label: String(o.label || o.value) }))
          : [];
        if (opts.length === 0) continue;
        if (cat === 'DIETA') extrasDietas.push(...opts);
        else if (cat === 'ALERGIA') extrasAlergias.push(...opts);
        else if (cat === 'MEDICACION') extrasMedicaciones.push(...opts);
        else if (cat === 'ENFERMEDAD_CRONICA' || cat === 'CONDICION') {
          extrasCondiciones.push(...opts);
        }
      }
    }
  }

  return {
    dietas: combinarOpciones(OPCIONES_DIETA_ESTANDAR, extrasDietas),
    alergias: combinarOpciones(OPCIONES_ALERGIA_ESTANDAR, extrasAlergias),
    medicaciones: combinarOpciones(OPCIONES_MEDICACION_ESTANDAR, extrasMedicaciones),
    condiciones: combinarOpciones(OPCIONES_CONDICION_ESTANDAR, extrasCondiciones),
  };
}

function extraerCodigosDesdeValor(val: unknown): string[] {
  if (Array.isArray(val)) {
    return val.map((x) => String(x).trim()).filter(Boolean);
  }
  if (typeof val === 'string') {
    const limpio = val.trim();
    if (!limpio || FRASES_NEGATIVAS.has(normalizarFrase(limpio))) return [];
    return [limpio];
  }
  return [];
}

function mapearLabels(codigos: string[], catalogo: OpcionMedica[]): string[] {
  const mapa = new Map(catalogo.map((o) => [o.value, o.label]));
  return codigos.map((c) => mapa.get(c) || c);
}

function combinarResumenChipsYDetalle(
  labels: string[],
  detalle: string | null,
  fallback = 'Sí',
): string {
  if (labels.length > 0 && detalle) {
    return `${labels.join(', ')} — ${detalle}`;
  }
  if (labels.length > 0) return labels.join(', ');
  if (detalle) return detalle;
  return fallback;
}

function inferirDietasDesdeTexto(texto: string, target: Set<string>): void {
  const norm = normalizarFrase(texto);
  if (!norm) return;
  if (/vegetarian/.test(norm)) target.add('VEGETARIANO');
  if (/vegan/.test(norm)) target.add('VEGANO');
  if (/celiac|tacc|gluten/.test(norm)) target.add('CELIACO');
  if (/lactos|lacte/.test(norm)) target.add('SIN_LACTOSA');
  if (/diabet/.test(norm)) target.add('DIABETICO');
  if (/hiposodic|sin sal|baja en sodio/.test(norm)) target.add('HIPOSODICO');
}

function inferirAlergiasDesdeTexto(texto: string, target: Set<string>): void {
  const norm = normalizarFrase(texto);
  if (!norm) return;
  if (
    /mani|nuez|almendra|huevo|leche|trigo|marisco|chocolate|tomate|frutilla|alimento|comida|pescado|soja|gluten/.test(
      norm,
    )
  ) {
    target.add('ALIMENTOS');
  }
  if (
    /penicilina|amoxicilina|ibuprofeno|aspirina|paracetamol|dipirona|antibiotico|medicamento|droga|remedio|sulfa|aines/.test(
      norm,
    )
  ) {
    target.add('MEDICAMENTOS');
  }
  if (/abeja|avispa|hormiga|mosquito|insecto|picadura/.test(norm)) {
    target.add('PICADURAS');
  }
  if (/polen|acaro|polvo|humedad|pelo|gato|perro|ambiental|rinitis|graminea/.test(norm)) {
    target.add('AMBIENTALES');
  }
}

function inferirCondicionesDesdeTexto(texto: string, target: Set<string>): void {
  const norm = normalizarFrase(texto);
  if (!norm) return;
  if (/asma|bronco/.test(norm)) target.add('ASMA');
  if (/diabet/.test(norm)) target.add('DIABETES');
  if (/epilep|convulsion/.test(norm)) target.add('EPILEPSIA');
  if (/cardio|corazon|soplo|arritmia/.test(norm)) target.add('CARDIOPATIA');
  if (/hipertens|presion alta/.test(norm)) target.add('HIPERTENSION');
  if (/hipotens|presion baja/.test(norm)) target.add('HIPOTENSION');
}

function combinarRespuestas(miembro: any, entregaOEntregas?: any): Record<string, any> {
  const datos: Record<string, any> = {
    ...(miembro?.datosFijosJson && typeof miembro.datosFijosJson === 'object'
      ? miembro.datosFijosJson
      : {}),
  };

  if (Array.isArray(entregaOEntregas)) {
    // Mezclar desde la más antigua a la más reciente (o respetar snapshot)
    const ordenadas = [...entregaOEntregas].sort((a, b) => Number(a?.id ?? 0) - Number(b?.id ?? 0));
    for (const ent of ordenadas) {
      if (ent?.respuestasSnapshotJson && typeof ent.respuestasSnapshotJson === 'object') {
        Object.assign(datos, ent.respuestasSnapshotJson);
      }
    }
  } else if (
    entregaOEntregas?.respuestasSnapshotJson &&
    typeof entregaOEntregas.respuestasSnapshotJson === 'object'
  ) {
    Object.assign(datos, entregaOEntregas.respuestasSnapshotJson);
  }

  return datos;
}

export function extraerInfoMedicaMiembro(
  miembro: any,
  entregaOEntregas?: any,
  plantillas?: any[],
): InfoMedicaMiembro {
  const datos = combinarRespuestas(miembro, entregaOEntregas);
  const catalogos = extraerCatalogosMedicosDinamicos(plantillas);

  const dietasSet = new Set<string>();
  const alergiasSet = new Set<string>();
  const medicacionSet = new Set<string>();
  const condicionesSet = new Set<string>();
  const alertasExtraPersonalizadas: AlertaMedicaItem[] = [];

  // 1. Valores estructurados desde selectores conocidos
  for (const code of extraerCodigosDesdeValor(datos.regimen_dietario_tipos)) {
    dietasSet.add(code);
  }
  for (const code of extraerCodigosDesdeValor(datos.alergias_tipos)) {
    alergiasSet.add(code);
  }
  for (const code of extraerCodigosDesdeValor(datos.medicacion_tipos)) {
    medicacionSet.add(code);
  }
  for (const code of extraerCodigosDesdeValor(datos.condiciones_medicas_tipos)) {
    condicionesSet.add(code);
  }

  // 2. Escanear campos con `categoriaMedica` definidos dinámicamente en plantillas
  const clavesEstandarYaMapeadas = new Set([
    'regimen_dietario_tipos',
    'alergias_tipos',
    'medicacion_tipos',
    'condiciones_medicas_tipos',
  ]);

  for (const p of plantillas || []) {
    const secciones = Array.isArray(p?.esquemaCamposJson?.secciones)
      ? p.esquemaCamposJson.secciones
      : [];
    for (const sec of secciones) {
      for (const c of Array.isArray(sec?.campos) ? sec.campos : []) {
        const cat = String(c?.categoriaMedica || '').toUpperCase();
        if (!cat || clavesEstandarYaMapeadas.has(c.key)) continue;
        const val = datos[c.key];
        if (val === undefined || val === null || val === false) continue;

        if (Array.isArray(val)) {
          for (const item of val.map((x) => String(x).trim()).filter(Boolean)) {
            if (cat === 'DIETA') dietasSet.add(item);
            else if (cat === 'ALERGIA') alergiasSet.add(item);
            else if (cat === 'MEDICACION') medicacionSet.add(item);
            else if (cat === 'ENFERMEDAD_CRONICA' || cat === 'CONDICION') condicionesSet.add(item);
          }
        } else if (typeof val === 'string') {
          const limpio = limpiarDetallePositivo(val);
          if (!limpio) continue;
          const coincideOpcion =
            Array.isArray(c.options) && c.options.some((o: any) => o.value === limpio);
          if (cat === 'DIETA') {
            if (coincideOpcion) dietasSet.add(limpio);
            else inferirDietasDesdeTexto(limpio, dietasSet);
          } else if (cat === 'ALERGIA') {
            if (coincideOpcion) alergiasSet.add(limpio);
            else inferirAlergiasDesdeTexto(limpio, alergiasSet);
          } else if (cat === 'MEDICACION' && coincideOpcion) {
            medicacionSet.add(limpio);
          } else if ((cat === 'ENFERMEDAD_CRONICA' || cat === 'CONDICION') && coincideOpcion) {
            condicionesSet.add(limpio);
          } else {
            alertasExtraPersonalizadas.push({
              id: `custom_${c.key}`,
              titulo: c.label || c.key,
              detalle: limpio,
              critico: Boolean(c.critico),
            });
          }
        } else if (esVerdadero(val)) {
          alertasExtraPersonalizadas.push({
            id: `custom_${c.key}`,
            titulo: c.label || c.key,
            detalle: 'Sí',
            critico: Boolean(c.critico),
          });
        }
      }
    }
  }

  // 3. Detalles libres + inferencia retrocompatible sobre campos legacy
  const alergiasDetalle =
    [datos.sufre_alergia_detalle, datos.alergias_detalle, datos.alergias]
      .map(limpiarDetallePositivo)
      .find(Boolean) ?? null;
  if (alergiasDetalle) inferirAlergiasDesdeTexto(alergiasDetalle, alergiasSet);

  const medicacionDetalle =
    [datos.toma_medicacion_detalle, datos.medicacion_habitual_detalle, datos.medicacion_habitual]
      .map(limpiarDetallePositivo)
      .find(Boolean) ?? null;

  const condicionesDetalle =
    [
      datos.enfermedad_cronica_detalle,
      datos.enfermedades_cronicas_detalle,
      datos.enfermedades_cronicas,
    ]
      .map(limpiarDetallePositivo)
      .find(Boolean) ?? null;
  if (condicionesDetalle) inferirCondicionesDesdeTexto(condicionesDetalle, condicionesSet);

  const dietaDetalle =
    [
      datos.regimen_dietario_detalle,
      datos.regimen_dietario,
      datos.dieta_especial_detalle,
      datos.dieta_especial,
    ]
      .map(limpiarDetallePositivo)
      .find(Boolean) ?? null;
  if (dietaDetalle) inferirDietasDesdeTexto(dietaDetalle, dietasSet);

  const tieneDieta =
    dietasSet.size > 0 ||
    esVerdadero(datos.regimen_dietario) ||
    esVerdadero(datos.dieta_especial) ||
    Boolean(dietaDetalle);
  if (tieneDieta && dietasSet.size === 0) {
    dietasSet.add('OTRO');
  }

  const tieneAlergia =
    alergiasSet.size > 0 ||
    esVerdadero(datos.sufre_alergia) ||
    esVerdadero(datos.alergias) ||
    Boolean(alergiasDetalle);
  if (tieneAlergia && alergiasSet.size === 0) {
    alergiasSet.add('OTRAS');
  }

  const tomaMedicacion =
    medicacionSet.size > 0 ||
    esVerdadero(datos.toma_medicacion) ||
    esVerdadero(datos.medicacion_habitual) ||
    Boolean(medicacionDetalle);

  const tieneCondicionCronica =
    condicionesSet.size > 0 ||
    esVerdadero(datos.enfermedad_cronica) ||
    esVerdadero(datos.enfermedades_cronicas) ||
    Boolean(condicionesDetalle);

  const dietas = Array.from(dietasSet);
  const dietasLabels = mapearLabels(dietas, catalogos.dietas);

  const alergiasTipos = Array.from(alergiasSet);
  const alergiasLabels = mapearLabels(alergiasTipos, catalogos.alergias);

  const medicacionTipos = Array.from(medicacionSet);
  const medicacionLabels = mapearLabels(medicacionTipos, catalogos.medicaciones);

  const condicionesTipos = Array.from(condicionesSet);
  const condicionesLabels = mapearLabels(condicionesTipos, catalogos.condiciones);

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
    const banderaActiva =
      banderas.some(esVerdadero) || banderas.some((b) => Boolean(limpiarDetallePositivo(b)));
    if (!banderaActiva && !detalleValido) return;
    alertas.push({
      id,
      titulo,
      detalle: detalleValido || fallbackDetalle,
      critico,
    });
  };

  // 1. Alergias (crítico)
  if (tieneAlergia) {
    alertas.push({
      id: 'alergias',
      titulo: 'Alergias',
      detalle: combinarResumenChipsYDetalle(
        alergiasLabels,
        alergiasDetalle,
        'Sí (sin detalle especificado)',
      ),
      critico: true,
    });
  }

  // 2. Medicación habitual (crítico)
  if (tomaMedicacion) {
    alertas.push({
      id: 'medicacion',
      titulo: 'Toma medicación',
      detalle: combinarResumenChipsYDetalle(medicacionLabels, medicacionDetalle, 'Sí'),
      critico: true,
    });
  }

  // 3. Enfermedad crónica (crítico)
  if (tieneCondicionCronica) {
    alertas.push({
      id: 'enfermedad_cronica',
      titulo: 'Enfermedad crónica',
      detalle: combinarResumenChipsYDetalle(condicionesLabels, condicionesDetalle, 'Sí'),
      critico: true,
    });
  }

  // 4. Tratamiento médico activo (crítico)
  agregarAlerta(
    'tratamiento',
    'Tratamiento médico activo',
    true,
    [datos.requiere_tratamiento, datos.requiere_tratamiento_detalle, datos.tratamientos_actuales],
    [datos.requiere_tratamiento_detalle, datos.tratamientos_actuales],
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
  const tieneRestriccionFisica =
    esFalsoExplicito(datos.sit_cualquier_actividad_fisica) || Boolean(detalleRestriccionFisica);
  const restriccionFisica = tieneRestriccionFisica
    ? detalleRestriccionFisica || 'No puede realizar cualquier actividad'
    : null;
  if (tieneRestriccionFisica && restriccionFisica) {
    alertas.push({
      id: 'restriccion_fisica',
      titulo: 'Restricción actividad física',
      detalle: restriccionFisica,
      critico: true,
    });
  }

  // 7. Situaciones clínicas puntuales (crítico cuando están presentes)
  const situacionesClinicas: string[] = [];
  if (esVerdadero(datos.sit_hemorragias_nasales)) situacionesClinicas.push('Hemorragias nasales');
  if (esVerdadero(datos.sit_sangrado_encias)) situacionesClinicas.push('Sangrado de encías');
  if (esVerdadero(datos.sit_dolor_cabeza)) situacionesClinicas.push('Dolor de cabeza frecuente');
  if (esVerdadero(datos.sit_presion_alta)) situacionesClinicas.push('Presión alta');
  if (esVerdadero(datos.sit_presion_baja)) situacionesClinicas.push('Presión baja');
  if (esVerdadero(datos.sit_transfusiones)) situacionesClinicas.push('Recibió transfusiones');
  if (esVerdadero(datos.sit_convulsiones)) situacionesClinicas.push('Antecedente de convulsiones');
  if (esVerdadero(datos.sit_cirugias_ultimo_anio)) situacionesClinicas.push('Cirugía último año');
  if (esVerdadero(datos.sit_internaciones_ultimo_anio))
    situacionesClinicas.push('Internación último año');

  if (situacionesClinicas.length > 0) {
    alertas.push({
      id: 'situaciones_clinicas',
      titulo: 'Antecedentes clínicos',
      detalle: situacionesClinicas.join(' · '),
      critico: true,
    });
  }

  // 8. Dieta / Régimen alimentario
  if (tieneDieta) {
    alertas.push({
      id: 'dieta',
      titulo: 'Dieta / Régimen',
      detalle: combinarResumenChipsYDetalle(dietasLabels, dietaDetalle, 'Sí'),
      critico: false,
    });
  }

  // 9. CUD
  const tieneCud = esVerdadero(datos.tiene_cud);
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

  // 13. Alertas de campos personalizados declarados en plantillas
  for (const extra of alertasExtraPersonalizadas) {
    if (!alertas.some((a) => a.id === extra.id)) {
      alertas.push(extra);
    }
  }

  const grupoRaw = textoValorLimpio(datos.grupo_sanguineo);
  const factorRaw = textoValorLimpio(datos.factor_rh);
  const grupoSanguineo = grupoRaw ? `${grupoRaw}${factorRaw ? ` ${factorRaw}` : ''}`.trim() : null;

  const obraSocial = textoValorLimpio(datos.obra_social);
  const afiliadoObraSocial = textoValorLimpio(datos.obra_social_afiliado);

  const telEmergencia1 =
    textoValorLimpio(datos.tel_emergencia_1) ||
    textoValorLimpio(datos.emergencia_telefono) ||
    textoValorLimpio(datos.telefono_urgencias) ||
    textoValorLimpio(datos.madre_telefono) ||
    textoValorLimpio(miembro?.telefonoContacto);
  const telEmergencia2 =
    textoValorLimpio(datos.tel_emergencia_2) || textoValorLimpio(datos.padre_telefono);

  const pesoKg = textoValorLimpio(datos.peso_kg);
  const tallaM = textoValorLimpio(datos.talla_m);

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
    dietas,
    dietasLabels,
    dietaDetalle,
    tieneDieta,
    alergiasTipos,
    alergiasLabels,
    alergiasDetalle,
    tieneAlergia,
    medicacionTipos,
    medicacionLabels,
    medicacionDetalle,
    tomaMedicacion,
    condicionesTipos,
    condicionesLabels,
    condicionesDetalle,
    tieneCondicionCronica,
    restriccionFisica,
    tieneRestriccionFisica,
    tieneCud,
    situacionesClinicas,
    telEmergencia1,
    telEmergencia2,
    pesoKg,
    tallaM,
  };
}
