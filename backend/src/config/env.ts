import 'dotenv/config';
import { z } from 'zod';

const optionalNonEmpty = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  z.string().trim().min(1).optional(),
);

/** Variables de entorno validadas al arrancar. Si falta algo, la app no inicia. */
const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatoria'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres'),
  JWT_EXPIRES_IN: z.string().min(1).default('8h'),
  QR_HMAC_SECRET: z.string().min(32, 'QR_HMAC_SECRET debe tener al menos 32 caracteres'),
  PORT: z.coerce.number().int().positive().default(3000),
  CORS_ORIGIN: z.string().optional(),
  APP_URL: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z
      .string()
      .trim()
      .refine((v) => /^https?:\/\//i.test(v), 'APP_URL debe comenzar con http:// o https://')
      .default('http://localhost:5173'),
  ),
  SMTP_HOST: optionalNonEmpty,
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_USER: optionalNonEmpty,
  SMTP_PASS: z.preprocess(
    (v) => (typeof v === 'string' && v === '' ? undefined : v),
    z.string().min(1).optional(),
  ),
  SMTP_FROM: optionalNonEmpty,
});

export const env = EnvSchema.parse(process.env);
export type Env = z.infer<typeof EnvSchema>;
