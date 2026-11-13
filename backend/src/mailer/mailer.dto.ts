import { z } from 'zod';

const optionalTrimmed = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
  z.string().trim().max(255).nullable().optional(),
);

export const GuardarConfigCorreoSchema = z.object({
  habilitado: z.boolean().default(true),
  host: optionalTrimmed,
  port: z.coerce.number().int().min(1).max(65535).default(587),
  user: optionalTrimmed,
  /** Si se omite o viene undefined, mantiene la contraseña guardada; si viene null, la borra. */
  pass: z.preprocess(
    (v) => (typeof v === 'string' && v === '' ? undefined : v),
    z.string().max(500).nullable().optional(),
  ),
  from: optionalTrimmed,
  appUrl: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
    z
      .string()
      .trim()
      .max(255)
      .refine((v) => /^https?:\/\//i.test(v), 'APP_URL debe comenzar con http:// o https://')
      .nullable()
      .optional(),
  ),
});
export type GuardarConfigCorreoDto = z.infer<typeof GuardarConfigCorreoSchema>;

export const ProbarCorreoSchema = z.object({
  destinatario: z.email('Email destinatario inválido').max(150),
});
export type ProbarCorreoDto = z.infer<typeof ProbarCorreoSchema>;
