import { EstadoCargo, MetodoPago } from '@prisma/client';
import { z } from 'zod';

const montoDecimal = z.number().positive().max(99999999.99);
const montoNoNegativo = z.number().min(0).max(99999999.99);

// ---------------- Conceptos de Cuota ----------------
export const CrearConceptoSchema = z.object({
  nombre: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres').max(120),
  tipo: z.string().trim().min(1).max(50).default('CAMPAMENTO'),
  montoBase: montoDecimal,
  cicloAnio: z.number().int().min(2000).max(2100),
  fechaVencimiento: z.iso.date().nullable().optional(),
  permiteDescuentoHermanos: z.boolean().default(true).optional(),
  porcentajeDescuentoHermanos: z.number().min(0).max(100).nullable().optional(),
  esParaEducadores: z.boolean().default(false).optional(),
  destinatarioTipo: z.enum(['TODOS', 'PROTAGONISTAS', 'EDUCADORES', 'INDIVIDUAL']).default('TODOS').optional(),
  excepcionesIds: z.array(z.number().int().positive()).default([]).optional(),
  mes: z.number().int().min(1).max(12).nullable().optional(),
  planCuotaMensualId: z.number().int().positive().nullable().optional(),
  /** Si se especifica, el concepto es exclusivo para miembros de esa unidad; si no, es para todo el grupo */
  unidadId: z.number().int().positive().nullable().optional(),
  /** Si es true, genera automáticamente los cargos a los destinatarios al crear el concepto */
  generarCargosInmediatos: z.boolean().default(true).optional(),
});
export type CrearConceptoDto = z.infer<typeof CrearConceptoSchema>;

export const EditarConceptoSchema = z.object({
  nombre: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres').max(120).optional(),
  tipo: z.string().trim().min(1).max(50).optional(),
  montoBase: montoDecimal.optional(),
  cicloAnio: z.number().int().min(2000).max(2100).optional(),
  fechaVencimiento: z.iso.date().nullable().optional(),
  permiteDescuentoHermanos: z.boolean().optional(),
  porcentajeDescuentoHermanos: z.number().min(0).max(100).nullable().optional(),
  esParaEducadores: z.boolean().optional(),
  destinatarioTipo: z.enum(['TODOS', 'PROTAGONISTAS', 'EDUCADORES', 'INDIVIDUAL']).optional(),
  excepcionesIds: z.array(z.number().int().positive()).optional(),
  mes: z.number().int().min(1).max(12).nullable().optional(),
  planCuotaMensualId: z.number().int().positive().nullable().optional(),
  unidadId: z.number().int().positive().nullable().optional(),
  sincronizarCargos: z.boolean().default(true).optional(),
});
export type EditarConceptoDto = z.infer<typeof EditarConceptoSchema>;

// ---------------- Planes de Cuota Mensual (Cuadros Anuales) ----------------
export const CrearPlanCuotaMensualSchema = z.object({
  nombre: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres').max(150),
  cicloAnio: z.number().int().min(2000).max(2100),
  montoMensual: montoDecimal,
  diaVencimiento: z.number().int().min(1).max(31).default(10),
  mesesHabilitados: z.array(z.number().int().min(1).max(12)).default([]),
  destinatarioTipo: z.enum(['TODOS', 'PROTAGONISTAS', 'EDUCADORES']).default('PROTAGONISTAS'),
  unidadId: z.number().int().positive().nullable().optional(),
  permiteDescuentoHermanos: z.boolean().default(true).optional(),
  porcentajeDescuentoHermanos: z.number().min(0).max(100).nullable().optional(),
  excepcionesIds: z.array(z.number().int().positive()).default([]).optional(),
});
export type CrearPlanCuotaMensualDto = z.infer<typeof CrearPlanCuotaMensualSchema>;

export const EditarPlanCuotaMensualSchema = CrearPlanCuotaMensualSchema.partial();
export type EditarPlanCuotaMensualDto = z.infer<typeof EditarPlanCuotaMensualSchema>;

export const SincronizarMesesPlanSchema = z.object({
  mesesHabilitados: z.array(z.number().int().min(1).max(12)),
});
export type SincronizarMesesPlanDto = z.infer<typeof SincronizarMesesPlanSchema>;

// ---------------- Generación de Cargos Colectivos ----------------
export const GenerarCargosSchema = z.object({
  conceptoId: z.number().int().positive(),
  /** Opcional: si se pasa unidadId, se generan cargos a todos los miembros activos de esa unidad */
  unidadId: z.number().int().positive().optional(),
  /** Opcional: lista explícita de usuarios a quienes generar el cargo */
  usuarioIds: z.array(z.number().int().positive()).optional(),
  /** Opcional: lista de miembros a excluir */
  excluirUsuarioIds: z.array(z.number().int().positive()).optional(),
  /** Si se omite, se toma el porcentaje del grupo familiar. Si se define, sobreescribe para esta generación */
  aplicarDescuentoFamiliar: z.boolean().default(true),
});
export type GenerarCargosDto = z.infer<typeof GenerarCargosSchema>;

// ---------------- Generación y Edición de Cargo Individual ----------------
export const GenerarCargoIndividualSchema = z.object({
  usuarioId: z.number().int().positive(),
  conceptoId: z.number().int().positive().optional(),
  nombreConcepto: z.string().trim().min(2).max(120).optional(),
  tipo: z.string().trim().min(1).max(50).default('OTRO').optional(),
  cicloAnio: z.number().int().min(2000).max(2100).default(new Date().getFullYear()).optional(),
  monto: montoDecimal,
  montoDescuento: montoNoNegativo.default(0).optional(),
  fechaVencimiento: z.iso.date().nullable().optional(),
  observaciones: z.string().trim().max(300).optional(),
});
export type GenerarCargoIndividualDto = z.infer<typeof GenerarCargoIndividualSchema>;

export const EditarCargoIndividualSchema = z.object({
  nombreConcepto: z.string().trim().min(2).max(120).optional(),
  montoOriginal: montoDecimal,
  montoDescuento: montoNoNegativo.default(0),
  fechaVencimiento: z.iso.date().nullable().optional(),
});
export type EditarCargoIndividualDto = z.infer<typeof EditarCargoIndividualSchema>;

// ---------------- Consultas de Cargos ----------------
export const ListarCargosQuerySchema = z.object({
  usuarioId: z.coerce.number().int().positive().optional(),
  unidadId: z.coerce.number().int().positive().optional(),
  conceptoId: z.coerce.number().int().positive().optional(),
  planCuotaMensualId: z.coerce.number().int().positive().optional(),
  estado: z.enum(EstadoCargo).optional(),
  cicloAnio: z.coerce.number().int().min(2000).max(2100).optional(),
});
export type ListarCargosQueryDto = z.infer<typeof ListarCargosQuerySchema>;

// ---------------- Registro y Edición de Pagos e Imputaciones ----------------
export const ImputacionItemSchema = z.object({
  cargoId: z.number().int().positive(),
  monto: montoDecimal,
});

export const RegistrarPagoSchema = z.object({
  usuarioId: z.number().int().positive().optional(),
  montoTotal: montoNoNegativo,
  usarSaldoAFavor: z.boolean().default(false).optional(),
  montoSaldoAFavor: montoNoNegativo.optional(),
  metodoPago: z.enum(MetodoPago),
  referenciaComprobante: z.string().trim().max(100).optional(),
  observaciones: z.string().trim().max(500).optional(),
  imputaciones: z.array(ImputacionItemSchema).default([]),
});
export type RegistrarPagoDto = z.infer<typeof RegistrarPagoSchema>;

export const EditarPagoSchema = z.object({
  metodoPago: z.enum(MetodoPago).optional(),
  referenciaComprobante: z.string().trim().max(100).nullable().optional(),
  observaciones: z.string().trim().max(500).nullable().optional(),
  fechaPago: z.iso.date().optional(),
});
export type EditarPagoDto = z.infer<typeof EditarPagoSchema>;

// ---------------- Saldo a Favor ----------------
export const AplicarSaldoAFavorSchema = z.object({
  usuarioId: z.number().int().positive(),
  imputaciones: z.array(ImputacionItemSchema).min(1, 'Debe seleccionar al menos un cargo para imputar saldo'),
});
export type AplicarSaldoAFavorDto = z.infer<typeof AplicarSaldoAFavorSchema>;

export const AjustarSaldoAFavorSchema = z.object({
  usuarioId: z.number().int().positive(),
  tipoAjuste: z.enum(['CARGAR', 'DESCONTAR', 'FIJAR']),
  monto: montoNoNegativo,
  motivo: z.string().trim().max(300).optional(),
});
export type AjustarSaldoAFavorDto = z.infer<typeof AjustarSaldoAFavorSchema>;

// ---------------- Grupo Familiar (Descuento) ----------------
export const ActualizarDescuentoFamiliaSchema = z.object({
  nombreFamilia: z.string().trim().min(1).max(150).optional(),
  porcentajeDescuentoHermanos: z.number().min(0).max(100),
});
export type ActualizarDescuentoFamiliaDto = z.infer<typeof ActualizarDescuentoFamiliaSchema>;

export const VincularHermanoSchema = z.object({
  usuarioId: z.number().int().positive(),
  hermanoDni: z.string().trim().min(5).max(20),
});
export type VincularHermanoDto = z.infer<typeof VincularHermanoSchema>;

export const DesvincularHermanoSchema = z.object({
  usuarioId: z.number().int().positive(),
});
export type DesvincularHermanoDto = z.infer<typeof DesvincularHermanoSchema>;


