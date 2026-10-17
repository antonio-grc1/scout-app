import { AlcanceRol } from '@prisma/client';
import { z } from 'zod';

const dni = z.string().trim().regex(/^[0-9A-Za-z]{6,20}$/, 'DNI inválido');
const fecha = z.iso.date('Fecha inválida (AAAA-MM-DD)');
const datosJson = z.record(z.string(), z.unknown());
const email = z.email('Email inválido').max(150);

export const CrearMiembroSchema = z.object({
  dni,
  nombre: z.string().trim().min(1).max(100),
  apellido: z.string().trim().min(1).max(100),
  fechaNacimiento: fecha,
  emailContacto: email.nullish(),
  telefonoContacto: z.string().trim().max(50).nullish(),
  datosFijosJson: datosJson.optional(),
  unidadId: z.number().int().positive(),
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

export const ListarMiembrosSchema = z
  .object({
    unidadId: z.coerce.number().int().positive().optional(),
    rolId: z.coerce.number().int().positive().optional(),
    q: z.string().trim().max(100).optional(),
    busqueda: z.string().trim().max(100).optional(),
    incluirInactivos: z
      .enum(['true', 'false'])
      .transform((v) => v === 'true')
      .optional(),
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
  unidadId: z.number().int().positive(),
  rolId: z.number().int().positive(),
  alcanceOverride: z.enum(AlcanceRol).nullish(),
  cicloAnio: z.number().int().min(2000).max(2100).optional(),
});
export type CrearAsignacionDto = z.infer<typeof CrearAsignacionSchema>;
