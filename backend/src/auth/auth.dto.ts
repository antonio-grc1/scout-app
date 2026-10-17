import { z } from 'zod';

const dni = z.string().trim().min(1, 'DNI obligatorio').max(20);

export const LoginSchema = z.object({
  dni,
  password: z.string().min(1, 'Contraseña obligatoria').max(200),
});
export type LoginDto = z.infer<typeof LoginSchema>;

export const CambiarClaveSchema = z
  .object({
    claveActual: z.string().min(1, 'Clave actual obligatoria').max(200),
    claveNueva: z.string().min(8, 'La nueva clave debe tener al menos 8 caracteres').max(200),
  })
  .refine((d) => d.claveActual !== d.claveNueva, {
    path: ['claveNueva'],
    message: 'La nueva clave debe ser distinta de la actual',
  });
export type CambiarClaveDto = z.infer<typeof CambiarClaveSchema>;
