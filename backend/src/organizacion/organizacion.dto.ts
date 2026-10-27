import { AlcanceRol, TipoUnidad } from '@prisma/client';
import { z } from 'zod';

const nombre = (max: number) => z.string().trim().min(1, 'Nombre obligatorio').max(max);

// ---------------- Ramas ----------------
const RamaBase = z.object({
  nombre: nombre(100),
  edadMinima: z.number().int().min(0).max(120),
  edadMaxima: z.number().int().min(0).max(120),
  ordenProgresion: z.number().int().min(1),
  activa: z.boolean().optional(),
});
const rangoValido = (d: { edadMinima?: number; edadMaxima?: number }) =>
  d.edadMinima === undefined || d.edadMaxima === undefined || d.edadMinima <= d.edadMaxima;
const rangoMsg = { path: ['edadMaxima'], message: 'edadMaxima debe ser >= edadMinima' };

export const CrearRamaSchema = RamaBase.refine(rangoValido, rangoMsg);
export const EditarRamaSchema = RamaBase.partial().refine(rangoValido, rangoMsg);
export type CrearRamaDto = z.infer<typeof CrearRamaSchema>;
export type EditarRamaDto = z.infer<typeof EditarRamaSchema>;

// ---------------- Unidades ----------------
const UnidadBase = z.object({
  nombre: nombre(120),
  tipo: z.enum(TipoUnidad),
  ramaId: z.number().int().positive().nullable().optional(),
  activa: z.boolean().optional(),
});
export const CrearUnidadSchema = UnidadBase.refine(
  (d) => (d.tipo === TipoUnidad.SECCION_RAMA ? d.ramaId != null : d.ramaId == null),
  { path: ['ramaId'], message: 'SECCION_RAMA requiere ramaId; JEFATURA y SIN_RAMA_APOYO no llevan rama' },
);
export const EditarUnidadSchema = UnidadBase.partial();
export type CrearUnidadDto = z.infer<typeof CrearUnidadSchema>;
export type EditarUnidadDto = z.infer<typeof EditarUnidadSchema>;

// ---------------- Roles ----------------
const permisosClaves = z.array(z.string().trim().min(1)).max(200);
export const TipoMiembroRolSchema = z.enum(['PROTAGONISTA', 'EDUCADOR']);

export const CrearRolSchema = z.object({
  nombre: nombre(80),
  alcancePorDefecto: z.enum(AlcanceRol),
  tipoMiembro: TipoMiembroRolSchema.optional(),
  requiereRama: z.boolean().optional(),
  permisos: permisosClaves.default([]),
});
export const EditarRolSchema = z.object({
  nombre: nombre(80).optional(),
  alcancePorDefecto: z.enum(AlcanceRol).optional(),
  tipoMiembro: TipoMiembroRolSchema.optional(),
  requiereRama: z.boolean().optional(),
  permisos: permisosClaves.optional(),
});
export type CrearRolDto = z.infer<typeof CrearRolSchema>;
export type EditarRolDto = z.infer<typeof EditarRolSchema>;

// ---------------- Permisos ----------------
export const CrearPermisoSchema = z.object({
  clave: z
    .string()
    .trim()
    .regex(/^[a-z0-9_]+(\.[a-z0-9_]+)+$/, 'Formato esperado: modulo.accion (minúsculas)')
    .max(100),
  descripcion: z.string().trim().max(255).optional(),
});
export const EditarPermisoSchema = z.object({ descripcion: z.string().trim().max(255).nullable() });
export type CrearPermisoDto = z.infer<typeof CrearPermisoSchema>;
export type EditarPermisoDto = z.infer<typeof EditarPermisoSchema>;
