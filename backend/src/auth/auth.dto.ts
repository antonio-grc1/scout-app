import { z } from 'zod';

const dni = z.string().trim().min(1, 'DNI obligatorio').max(20);

export const LoginSchema = z.object({
  dni,
  password: z.string().min(1, 'Contraseña obligatoria').max(200),
});
export type LoginDto = z.infer<typeof LoginSchema>;

export const CambiarClaveSchema = z
  .object({
    claveActual: z.string().max(200).optional(),
    passwordActual: z.string().max(200).optional(),
    claveNueva: z.string().max(200).optional(),
    passwordNueva: z.string().max(200).optional(),
  })
  .transform((d) => ({
    claveActual: d.claveActual ?? d.passwordActual ?? '',
    claveNueva: d.claveNueva ?? d.passwordNueva ?? '',
  }))
  .refine((d) => d.claveNueva.length >= 8, {
    path: ['claveNueva'],
    message: 'La nueva clave debe tener al menos 8 caracteres',
  })
  .refine((d) => d.claveActual.length === 0 || d.claveActual !== d.claveNueva, {
    path: ['claveNueva'],
    message: 'La nueva clave debe ser distinta de la actual',
  });
export type CambiarClaveDto = z.infer<typeof CambiarClaveSchema>;

export const RecuperarClaveSchema = z.object({
  dni,
});
export type RecuperarClaveDto = z.infer<typeof RecuperarClaveSchema>;

export const ResetearClaveSchema = z
  .object({
    soloPorCorreo: z.boolean().optional().default(false),
  })
  .optional()
  .default({ soloPorCorreo: false });
export type ResetearClaveDto = z.infer<typeof ResetearClaveSchema>;
