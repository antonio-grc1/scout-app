import { z } from 'zod';

const parseOptionalBool = (v: unknown): boolean | undefined => {
  if (v === true || v === 'true') return true;
  if (v === false || v === 'false') return false;
  return undefined;
};

export const BandejaQuerySchema = z.object({
  soloNoLeidos: z.preprocess(parseOptionalBool, z.boolean().optional()),
  incluirExpirados: z.preprocess(parseOptionalBool, z.boolean().optional()),
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(100).default(30),
});
export type BandejaQueryDto = z.infer<typeof BandejaQuerySchema>;

export const EnviadosQuerySchema = z.object({
  unidadId: z.coerce.number().int().positive().optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(100).default(30),
});
export type EnviadosQueryDto = z.infer<typeof EnviadosQuerySchema>;

export const CrearAvisoSchema = z
  .object({
    titulo: z
      .string()
      .trim()
      .min(2, 'El título debe tener al menos 2 caracteres')
      .max(150, 'El título no puede superar los 150 caracteres'),
    mensaje: z
      .string()
      .trim()
      .min(2, 'El mensaje debe tener al menos 2 caracteres')
      .max(4000, 'El mensaje no puede superar los 4000 caracteres'),
    prioridad: z.enum(['NORMAL', 'IMPORTANTE', 'URGENTE']).default('NORMAL'),
    destinatarioTipo: z.enum(['TODOS', 'PROTAGONISTAS', 'EDUCADORES', 'USUARIOS']),
    unidadId: z.number().int().positive().nullable().optional(),
    usuariosIds: z.array(z.number().int().positive()).max(500).optional(),
    excepcionesIds: z.array(z.number().int().positive()).max(500).optional(),
    fechaExpiracion: z.iso.date().nullable().optional(),
    enviarPush: z.boolean().default(true),
    enviarEmail: z.boolean().default(false),
  })
  .superRefine((data, ctx) => {
    if (data.destinatarioTipo === 'USUARIOS' && (!data.usuariosIds || data.usuariosIds.length === 0)) {
      ctx.addIssue({
        code: 'custom',
        path: ['usuariosIds'],
        message: 'Debés seleccionar al menos una persona destinataria',
      });
    }
  });
export type CrearAvisoDto = z.infer<typeof CrearAvisoSchema>;

export const SuscripcionPushSchema = z.object({
  endpoint: z.string().trim().url('Endpoint push inválido').max(2000),
  keys: z.object({
    p256dh: z.string().trim().min(10).max(500),
    auth: z.string().trim().min(6).max(200),
  }),
});
export type SuscripcionPushDto = z.infer<typeof SuscripcionPushSchema>;

export const DesuscripcionPushSchema = z.object({
  endpoint: z.string().trim().url('Endpoint push inválido').max(2000),
});
export type DesuscripcionPushDto = z.infer<typeof DesuscripcionPushSchema>;
