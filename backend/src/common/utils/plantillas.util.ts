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

/** Devuelve solo las claves permitidas de un objeto JSON. */
export function filtrarClaves(datos: unknown, claves: Set<string>): Record<string, unknown> {
  if (!datos || typeof datos !== 'object' || Array.isArray(datos)) return {};
  return Object.fromEntries(Object.entries(datos).filter(([k]) => claves.has(k)));
}
