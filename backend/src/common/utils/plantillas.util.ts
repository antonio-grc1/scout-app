import { z } from 'zod';

export const OpcionCampoSchema = z.looseObject({
  label: z.string(),
  value: z.string(),
});

/** Contrato de `esquemaCamposJson` (AGENTS.md §6.2). Se aceptan propiedades extra. */
export const CampoFormularioSchema = z.looseObject({
  key: z.string().min(1),
  label: z.string(),
  type: z.string(),
  required: z.boolean().optional(),
  options: z.array(OpcionCampoSchema).optional(),
  detalleKey: z.string().optional(),
  esDetalleDe: z.string().optional(),
  categoriaMedica: z.string().optional(),
  critico: z.boolean().optional(),
  persistirEnPerfil: z.boolean().optional(),
  visibleSi: z
    .looseObject({
      campo: z.string(),
      valor: z.unknown().optional(),
    })
    .optional(),
});

export const SeccionFormularioSchema = z.looseObject({
  id: z.string().min(1),
  titulo: z.string(),
  nombreCorto: z.string().optional(),
  icono: z.string().optional(),
  descripcion: z.string().optional(),
  textoLegal: z.string().optional(),
  saltoPaginaAntes: z.boolean().optional(),
  ocultarTablaCamposEnPdf: z.boolean().optional(),
  firmasSeccion: z.array(z.string()).optional(),
  permiteCopiarHermano: z.boolean().optional(),
  campos: z.array(CampoFormularioSchema),
});

export const DestinatarioPlantillaSchema = z.enum(['TODOS', 'MENORES', 'MAYORES', 'EDUCADORES']);
export type DestinatarioPlantilla = z.infer<typeof DestinatarioPlantillaSchema>;

export const MembreteDocumentoSchema = z.enum([
  'GRUPO_JUAN_XXIII',
  'SALUD_NACIONAL',
  'AUTORIZACION_OFICIAL',
  'SIMPLE',
]);
export type MembreteDocumento = z.infer<typeof MembreteDocumentoSchema>;

export const EsquemaCamposSchema = z.looseObject({
  destinatario: DestinatarioPlantillaSchema.optional(),
  edadMinima: z.number().int().optional(),
  edadMaxima: z.number().int().optional(),
  tipoMiembro: z.enum(['TODOS', 'PROTAGONISTA', 'EDUCADOR']).optional(),
  esPrincipal: z.boolean().optional(),
  orden: z.number().int().optional(),
  tituloDocumento: z.string().optional(),
  subtituloDocumento: z.string().optional(),
  membrete: MembreteDocumentoSchema.optional(),
  mostrarResumenMiembro: z.boolean().optional(),
  textoIntroduccion: z.string().optional(),
  textoCierre: z.string().optional(),
  firmas: z.array(z.string()).optional(),
  secciones: z.array(SeccionFormularioSchema),
});
export type EsquemaCampos = z.infer<typeof EsquemaCamposSchema>;

/**
 * Valida si una plantilla aplica al destinatario según los metadatos de `esquemaCamposJson`
 * (con fallback legacy por prefijo de `codigo` cuando no hay metadato `destinatario`).
 * Devuelve `null` si es válida o el mensaje de error amigable si no corresponde.
 */
export function validarDestinatarioPlantilla(
  plantilla: { codigo: string; esquemaCamposJson: unknown },
  ctx: { edad: number; esEducador: boolean },
): string | null {
  const parsed = EsquemaCamposSchema.safeParse(plantilla.esquemaCamposJson);
  const esquema = parsed.success ? parsed.data : undefined;

  let destinatario = esquema?.destinatario;
  if (!destinatario) {
    if (plantilla.codigo.startsWith('LEGAJO_MENORES_')) destinatario = 'MENORES';
    else if (plantilla.codigo.startsWith('LEGAJO_ROVERS_')) destinatario = 'MAYORES';
    else if (plantilla.codigo.startsWith('LEGAJO_EDUCADORES_')) destinatario = 'EDUCADORES';
  }

  if (destinatario === 'MENORES' && ctx.edad >= 18) {
    return 'La plantilla de Menores es exclusiva para menores de 18 años. Debe completar la plantilla de Rovers o Educadores.';
  }
  if (destinatario === 'MAYORES' && ctx.edad < 18) {
    return 'La plantilla para Mayores / Rovers es exclusivamente para miembros mayores de edad.';
  }
  if (destinatario === 'EDUCADORES' && ctx.edad < 18) {
    return 'La plantilla de Educadores es para dirigentes y educadores adultos.';
  }

  if (esquema?.tipoMiembro === 'EDUCADOR' && !ctx.esEducador) {
    return 'Esta plantilla está reservada exclusivamente para educadores o dirigentes.';
  }
  if (esquema?.tipoMiembro === 'PROTAGONISTA' && ctx.esEducador) {
    return 'Esta plantilla está reservada exclusivamente para protagonistas.';
  }

  if (esquema?.edadMinima !== undefined && ctx.edad < esquema.edadMinima) {
    return `Esta plantilla requiere tener al menos ${esquema.edadMinima} años.`;
  }
  if (esquema?.edadMaxima !== undefined && ctx.edad > esquema.edadMaxima) {
    return `Esta plantilla admite miembros de hasta ${esquema.edadMaxima} años.`;
  }

  return null;
}

/**
 * Construye el conjunto de claves persistibles en `datosFijosJson` combinando el catálogo
 * base permitido con los campos definidos en `esquemaCamposJson` (salvo `persistirEnPerfil: false`).
 */
export function extraerClavesPersistiblesEsquema(
  esquemaRaw: unknown,
  basePermitidas: Set<string>,
): Set<string> {
  const claves = new Set<string>(basePermitidas);
  const parsed = EsquemaCamposSchema.safeParse(esquemaRaw);
  if (!parsed.success) return claves;

  for (const seccion of parsed.data.secciones) {
    for (const campo of seccion.campos) {
      if (campo.persistirEnPerfil === false) continue;
      if (!CLAVES_PROTOTIPO_PROHIBIDAS.has(campo.key)) {
        claves.add(campo.key);
      }
    }
  }
  return claves;
}

/**
 * Claves de campos que pueden copiarse entre hermanos: las de las secciones con
 * `permiteCopiarHermano: true` en las plantillas recibidas. Esquemas inválidos se ignoran.
 */
export function clavesCopiablesEntreHermanos(esquemas: unknown[]): Set<string> {
  const claves = new Set<string>();
  for (const raw of esquemas) {
    const parsed = EsquemaCamposSchema.safeParse(raw);
    if (!parsed.success) continue;
    for (const s of parsed.data.secciones) {
      if (s.permiteCopiarHermano) s.campos.forEach((c) => claves.add(c.key));
    }
  }
  return claves;
}

/** Claves de contacto/familia permitidas al sugerir datos compartidos en legajos (sin datos médicos). */
export const CLAVES_FAMILIARES_CONTACTO_COMPARTIBLES = [
  'protagonista_domicilio',
  'madre_nombres',
  'madre_dni',
  'madre_domicilio',
  'madre_convive',
  'madre_email',
  'madre_telefono',
  'madre_profesion',
  'madre_estado_civil',
  'padre_nombres',
  'padre_dni',
  'padre_domicilio',
  'padre_convive',
  'padre_email',
  'padre_telefono',
  'padre_profesion',
  'padre_estado_civil',
  'tutor_nombres',
  'tutor_dni',
  'tutor_domicilio',
  'tutor_convive',
  'tutor_email',
  'tutor_telefono',
  'tutor_profesion',
  'tutor_estado_civil',
  'tutor_vinculo',
  'tel_emergencia_1',
  'tel_emergencia_2',
  'emergencia_nombre',
  'emergencia_vinculo',
  'emergencia_telefono',
] as const;

/** Catálogo ampliado de claves familiares/contacto compartibles al crear o vincular hermanos. */
export const CLAVES_FAMILIARES_ESTANDAR = [
  ...CLAVES_FAMILIARES_CONTACTO_COMPARTIBLES,
  'domicilio',
  'obra_social',
  'telefono_urgencias',
] as const;

const CLAVES_PROTOTIPO_PROHIBIDAS = new Set(['__proto__', 'constructor', 'prototype']);

/** Elimina recursivamente claves de contaminación de prototipos y valida límites básicos. */
export function sanitizarValorJson(valor: unknown, profundidad = 0): unknown {
  if (profundidad > 10) return null;
  if (Array.isArray(valor)) {
    return valor.map((item) => sanitizarValorJson(item, profundidad + 1));
  }
  if (valor && typeof valor === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(valor)) {
      if (CLAVES_PROTOTIPO_PROHIBIDAS.has(k)) continue;
      out[k] = sanitizarValorJson(v, profundidad + 1);
    }
    return out;
  }
  return valor;
}

/** Devuelve un diccionario JSON plano libre de claves de prototipo (`__proto__`, `constructor`, `prototype`). */
export function sanitizarJsonPlano(datos: unknown): Record<string, unknown> {
  if (!datos || typeof datos !== 'object' || Array.isArray(datos)) return {};
  return sanitizarValorJson(datos, 0) as Record<string, unknown>;
}

/** Schema reutilizable para parámetros booleanos opcionales en query strings (`true` | `false`). */
export const queryBooleanOptionalSchema = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true')
  .optional();

/** Devuelve solo las claves permitidas de un objeto JSON. */
export function filtrarClaves(datos: unknown, claves: Set<string>): Record<string, unknown> {
  if (!datos || typeof datos !== 'object' || Array.isArray(datos)) return {};
  return Object.fromEntries(
    Object.entries(datos).filter(([k]) => !CLAVES_PROTOTIPO_PROHIBIDAS.has(k) && claves.has(k)),
  );
}
