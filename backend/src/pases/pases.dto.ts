import { AlcanceRol } from '@prisma/client';
import { z } from 'zod';

export const CandidatosQuerySchema = z.object({
  /** Fecha a la que se calcula la edad (ej. inicio del próximo ciclo). Por defecto hoy. */
  fechaReferencia: z.iso.date().optional(),
  unidadId: z.coerce.number().int().positive().optional(),
});
export type CandidatosQueryDto = z.infer<typeof CandidatosQuerySchema>;

export const PaseSchema = z.object({
  asignacionOrigenId: z.number().int().positive(),
  unidadDestinoId: z.number().int().positive(),
  /** Si se omite, conserva el rol de la asignación de origen. */
  rolDestinoId: z.number().int().positive().optional(),
  alcanceOverride: z.enum(AlcanceRol).nullish(),
  cicloAnio: z.number().int().min(2000).max(2100).optional(),
});
export type PaseDto = z.infer<typeof PaseSchema>;

export const PasesLoteSchema = z.object({
  pases: z
    .array(PaseSchema)
    .min(1)
    .max(200)
    .refine((p) => new Set(p.map((x) => x.asignacionOrigenId)).size === p.length, {
      message: 'Hay asignaciones de origen repetidas',
    }),
});
export type PasesLoteDto = z.infer<typeof PasesLoteSchema>;
