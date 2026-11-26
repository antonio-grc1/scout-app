import { z } from 'zod';

export const ListarCampamentosQuerySchema = z.object({
  unidadId: z.coerce.number().int().positive().optional(),
  cicloAnio: z.coerce.number().int().min(2020).max(2100).optional(),
  estado: z
    .enum(['BORRADOR', 'PUBLICADO', 'CERRADO', 'FINALIZADO', 'CANCELADO'])
    .optional(),
});
export type ListarCampamentosQueryDto = z.infer<typeof ListarCampamentosQuerySchema>;

export const CrearCampamentoSchema = z
  .object({
    titulo: z
      .string()
      .trim()
      .min(2, 'El título debe tener al menos 2 caracteres')
      .max(150, 'El título no puede superar los 150 caracteres'),
    descripcion: z.string().trim().max(4000).nullable().optional(),
    lugar: z
      .string()
      .trim()
      .min(2, 'El lugar debe tener al menos 2 caracteres')
      .max(200, 'El lugar no puede superar los 200 caracteres'),
    fechaInicio: z.iso.date(),
    fechaFin: z.iso.date(),
    fechaLimiteConfirmacion: z.iso.date().nullable().optional(),
    estado: z.enum(['BORRADOR', 'PUBLICADO']).default('PUBLICADO'),
    destinatarioTipo: z
      .enum(['TODOS', 'PROTAGONISTAS', 'EDUCADORES', 'USUARIOS'])
      .default('PROTAGONISTAS'),
    unidadId: z.number().int().positive().nullable().optional(),
    unidadesIds: z.array(z.number().int().positive()).max(100).optional(),
    usuariosIds: z.array(z.number().int().positive()).max(500).optional(),
    excepcionesIds: z.array(z.number().int().positive()).max(500).optional(),
    cicloAnio: z.number().int().min(2020).max(2100).optional(),
    costoBase: z.number().min(0).max(99999999).default(0),
    permiteDescuentoHermanos: z.boolean().default(true),
    porcentajeDescuentoHermanos: z.number().min(0).max(100).nullable().optional(),
    rubroId: z.number().int().positive().nullable().optional(),
    notificarAviso: z.boolean().default(false),
    notificarPush: z.boolean().default(true),
    notificarEmail: z.boolean().default(false),
  })
  .superRefine((data, ctx) => {
    if (data.fechaFin < data.fechaInicio) {
      ctx.addIssue({
        code: 'custom',
        path: ['fechaFin'],
        message: 'La fecha de fin debe ser igual o posterior a la fecha de inicio',
      });
    }
    if (
      data.destinatarioTipo === 'USUARIOS' &&
      (!data.usuariosIds || data.usuariosIds.length === 0)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['usuariosIds'],
        message: 'Debés seleccionar al menos una persona invitada',
      });
    }
  });
export type CrearCampamentoDto = z.infer<typeof CrearCampamentoSchema>;

export const EditarCampamentoSchema = z
  .object({
    titulo: z.string().trim().min(2).max(150).optional(),
    descripcion: z.string().trim().max(4000).nullable().optional(),
    lugar: z.string().trim().min(2).max(200).optional(),
    fechaInicio: z.iso.date().optional(),
    fechaFin: z.iso.date().optional(),
    fechaLimiteConfirmacion: z.iso.date().nullable().optional(),
    estado: z
      .enum(['BORRADOR', 'PUBLICADO', 'CERRADO', 'FINALIZADO', 'CANCELADO'])
      .optional(),
    destinatarioTipo: z
      .enum(['TODOS', 'PROTAGONISTAS', 'EDUCADORES', 'USUARIOS'])
      .optional(),
    unidadId: z.number().int().positive().nullable().optional(),
    unidadesIds: z.array(z.number().int().positive()).max(100).optional(),
    usuariosIds: z.array(z.number().int().positive()).max(500).optional(),
    excepcionesIds: z.array(z.number().int().positive()).max(500).optional(),
    costoBase: z.number().min(0).max(99999999).optional(),
    permiteDescuentoHermanos: z.boolean().optional(),
    porcentajeDescuentoHermanos: z.number().min(0).max(100).nullable().optional(),
    rubroId: z.number().int().positive().nullable().optional(),
    notificarAviso: z.boolean().optional(),
    notificarPush: z.boolean().optional(),
    notificarEmail: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.fechaInicio && data.fechaFin && data.fechaFin < data.fechaInicio) {
      ctx.addIssue({
        code: 'custom',
        path: ['fechaFin'],
        message: 'La fecha de fin debe ser igual o posterior a la fecha de inicio',
      });
    }
    if (
      data.destinatarioTipo === 'USUARIOS' &&
      data.usuariosIds !== undefined &&
      data.usuariosIds.length === 0
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['usuariosIds'],
        message: 'Debés seleccionar al menos una persona invitada',
      });
    }
  });
export type EditarCampamentoDto = z.infer<typeof EditarCampamentoSchema>;

export const ResponderCampamentoSchema = z.object({
  accion: z.enum(['CONFIRMAR', 'NO_ASISTE']),
  observaciones: z.string().trim().max(500).nullable().optional(),
});
export type ResponderCampamentoDto = z.infer<typeof ResponderCampamentoSchema>;

export const GestionarInscripcionSchema = z.object({
  estado: z.enum(['CONFIRMADO', 'NO_ASISTE', 'CANCELADO', 'PENDIENTE']),
  observaciones: z.string().trim().max(500).nullable().optional(),
});
export type GestionarInscripcionDto = z.infer<typeof GestionarInscripcionSchema>;
