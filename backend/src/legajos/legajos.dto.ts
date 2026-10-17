import { EstadoEntrega } from '@prisma/client';
import { z } from 'zod';

const jsonRecord = z.record(z.string(), z.unknown());

// ---------------- Plantillas ----------------
export const CrearPlantillaSchema = z.object({
  codigo: z.string().trim().min(2).max(50),
  titulo: z.string().trim().min(2).max(150),
  version: z.string().trim().min(1).max(20),
  cicloAnio: z.number().int().min(2000).max(2100),
  esquemaCamposJson: jsonRecord,
  mapeoPdfJson: jsonRecord,
  activa: z.boolean().default(true),
});
export type CrearPlantillaDto = z.infer<typeof CrearPlantillaSchema>;

export const EditarPlantillaSchema = CrearPlantillaSchema.partial();
export type EditarPlantillaDto = z.infer<typeof EditarPlantillaSchema>;

// ---------------- Entregas / Formularios ----------------
export const GuardarEntregaSchema = z.object({
  usuarioId: z.number().int().positive(),
  plantillaId: z.number().int().positive(),
  cicloAnio: z.number().int().min(2000).max(2100),
  respuestas: jsonRecord,
  /** Si es true, finaliza el borrador y genera el hash para impresión física */
  finalizarParaFirma: z.boolean().default(false),
  /** Si es true, actualiza también los datosFijosJson del usuario con las respuestas de campos coincidentes */
  actualizarDatosFijos: z.boolean().default(true),
});
export type GuardarEntregaDto = z.infer<typeof GuardarEntregaSchema>;

export const ListarEntregasQuerySchema = z.object({
  usuarioId: z.coerce.number().int().positive().optional(),
  unidadId: z.coerce.number().int().positive().optional(),
  plantillaId: z.coerce.number().int().positive().optional(),
  cicloAnio: z.coerce.number().int().min(2000).max(2100).optional(),
  estado: z.enum(EstadoEntrega).optional(),
});
export type ListarEntregasQueryDto = z.infer<typeof ListarEntregasQuerySchema>;
