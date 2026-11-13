import { z } from 'zod';

/** Contrato de `esquemaCamposJson` (AGENTS.md §6.2). Se aceptan propiedades extra. */
export const CampoFormularioSchema = z.looseObject({
  key: z.string().min(1),
  label: z.string(),
  type: z.string(),
  required: z.boolean().optional(),
});

export const SeccionFormularioSchema = z.looseObject({
  id: z.string().min(1),
  titulo: z.string(),
  permiteCopiarHermano: z.boolean().optional(),
  campos: z.array(CampoFormularioSchema),
});

export const EsquemaCamposSchema = z.looseObject({
  secciones: z.array(SeccionFormularioSchema),
});
export type EsquemaCampos = z.infer<typeof EsquemaCamposSchema>;

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
  'madre_telefono',
  'madre_profesion',
  'padre_nombres',
  'padre_telefono',
  'padre_profesion',
  'tutor_nombres',
  'tutor_telefono',
  'tutor_vinculo',
  'emergencia_nombre',
  'emergencia_vinculo',
  'emergencia_telefono',
] as const;

/** Catálogo ampliado de claves familiares/contacto compartibles al crear o vincular hermanos. */
export const CLAVES_FAMILIARES_ESTANDAR = [
  ...CLAVES_FAMILIARES_CONTACTO_COMPARTIBLES,
  'domicilio',
  'obra_social',
  'madre_dni',
  'madre_domicilio',
  'madre_email',
  'padre_dni',
  'padre_domicilio',
  'padre_email',
  'tutor_dni',
  'tutor_domicilio',
  'tutor_email',
  'tutor_profesion',
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
