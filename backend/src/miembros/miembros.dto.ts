import { AlcanceRol } from '@prisma/client';
import { z } from 'zod';
import { queryBooleanOptionalSchema } from '../common/utils/plantillas.util.js';

const dni = z.string().trim().regex(/^[0-9A-Za-z]{6,20}$/, 'DNI inválido');
const fecha = z.iso.date('Fecha inválida (AAAA-MM-DD)');
const datosJson = z
  .record(z.string().max(100), z.unknown())
  .refine((obj) => Object.keys(obj).length <= 100, 'Demasiadas claves en datosFijosJson');
const email = z.email('Email inválido').max(150);

export const CrearMiembroSchema = z.object({
  dni,
  nombre: z.string().trim().min(1).max(100),
  apellido: z.string().trim().min(1).max(100),
  fechaNacimiento: fecha,
  emailContacto: email.nullish(),
  telefonoContacto: z.string().trim().max(50).nullish(),
  datosFijosJson: datosJson.optional(),
  unidadId: z.number().int().positive().optional(),
  rolId: z.number().int().positive(),
  cicloAnio: z.number().int().min(2000).max(2100).optional(),
  /** DNI de un hermano ya registrado: vincula el grupo familiar y copia datos compartidos. */
  hermanoDni: dni.optional(),
  copiarDatosHermano: z.boolean().default(true),
});
export type CrearMiembroDto = z.infer<typeof CrearMiembroSchema>;

/** Campos que puede editar el propio miembro (alcance PROPIO). */
export const CAMPOS_EDITABLES_PROPIOS = ['emailContacto', 'telefonoContacto', 'datosFijosJson'] as const;

export const EditarMiembroSchema = z
  .object({
    dni,
    nombre: z.string().trim().min(1).max(100),
    apellido: z.string().trim().min(1).max(100),
    fechaNacimiento: fecha,
    emailContacto: email.nullable(),
    telefonoContacto: z.string().trim().max(50).nullable(),
    /** Se fusiona con el JSON existente; una clave con `null` la elimina. */
    datosFijosJson: datosJson,
    activo: z.boolean(),
  })
  .partial()
  .strict();
export type EditarMiembroDto = z.infer<typeof EditarMiembroSchema>;

export const ActualizarMiPerfilSchema = EditarMiembroSchema.pick({
  emailContacto: true,
  telefonoContacto: true,
  datosFijosJson: true,
}).strict();
export type ActualizarMiPerfilDto = z.infer<typeof ActualizarMiPerfilSchema>;

export const ListarMiembrosSchema = z
  .object({
    unidadId: z.coerce.number().int().positive().optional(),
    rolId: z.coerce.number().int().positive().optional(),
    q: z.string().trim().max(100).optional(),
    busqueda: z.string().trim().max(100).optional(),
    ids: z
      .union([z.string(), z.array(z.coerce.number().int().positive())])
      .optional()
      .transform((val) => {
        if (!val) return undefined;
        const arr = Array.isArray(val)
          ? val
          : val
              .split(',')
              .map((s) => Number(s.trim()))
              .filter((n) => Number.isInteger(n) && n > 0);
        const unicos = [...new Set(arr)].slice(0, 200);
        return unicos.length > 0 ? unicos : undefined;
      }),
    incluirInactivos: queryBooleanOptionalSchema,
    pagina: z.coerce.number().int().min(1).default(1),
    porPagina: z.coerce.number().int().min(1).max(200).default(50),
    limite: z.coerce.number().int().min(1).max(200).optional(),
  })
  .transform((data) => ({
    ...data,
    q: data.q || data.busqueda || undefined,
    porPagina: data.limite || data.porPagina,
  }));
export type ListarMiembrosDto = z.infer<typeof ListarMiembrosSchema>;

export const CrearAsignacionSchema = z.object({
  unidadId: z.number().int().positive().optional(),
  rolId: z.number().int().positive(),
  alcanceOverride: z.enum(AlcanceRol).nullish(),
  cicloAnio: z.number().int().min(2000).max(2100).optional(),
});
export type CrearAsignacionDto = z.infer<typeof CrearAsignacionSchema>;
