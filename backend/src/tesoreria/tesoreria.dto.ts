import { EstadoCargo, MetodoPago, TipoCuenta, TipoRubro } from '@prisma/client';
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
  rubroId: z.number().int().positive().nullable().optional(),
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
  rubroId: z.number().int().positive().nullable().optional(),
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
  rubroId: z.number().int().positive().nullable().optional(),
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

export const RegistrarPagoSchema = z
  .object({
    usuarioId: z.number().int().positive().optional(),
    cuentaId: z.number().int().positive().optional(),
    montoTotal: montoNoNegativo,
    usarSaldoAFavor: z.boolean().default(false).optional(),
    montoSaldoAFavor: montoNoNegativo.optional(),
    metodoPago: z.enum(MetodoPago),
    referenciaComprobante: z.string().trim().max(100).optional(),
    observaciones: z.string().trim().max(500).optional(),
    imputaciones: z.array(ImputacionItemSchema).default([]),
  })
  .refine(
    (data) => {
      const ids = data.imputaciones.map((i) => i.cargoId);
      return new Set(ids).size === ids.length;
    },
    { message: 'No se permiten cargos duplicados en las imputaciones', path: ['imputaciones'] },
  );
export type RegistrarPagoDto = z.infer<typeof RegistrarPagoSchema>;

export const EditarPagoSchema = z.object({
  metodoPago: z.enum(MetodoPago).optional(),
  referenciaComprobante: z.string().trim().max(100).nullable().optional(),
  observaciones: z.string().trim().max(500).nullable().optional(),
  fechaPago: z.iso.date().optional(),
});
export type EditarPagoDto = z.infer<typeof EditarPagoSchema>;

// ---------------- Saldo a Favor ----------------
export const AplicarSaldoAFavorSchema = z
  .object({
    usuarioId: z.number().int().positive(),
    imputaciones: z.array(ImputacionItemSchema).min(1, 'Debe seleccionar al menos un cargo para imputar saldo'),
  })
  .refine(
    (data) => {
      const ids = data.imputaciones.map((i) => i.cargoId);
      return new Set(ids).size === ids.length;
    },
    { message: 'No se permiten cargos duplicados en las imputaciones', path: ['imputaciones'] },
  );
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

// ---------------- Cuentas Financieras, Transferencias y Libro Diario (Fase 1) ----------------
export const CrearCuentaFinancieraSchema = z.object({
  nombre: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres').max(100),
  tipo: z.enum(TipoCuenta),
});
export type CrearCuentaFinancieraDto = z.infer<typeof CrearCuentaFinancieraSchema>;

export const ActualizarCuentaFinancieraSchema = z.object({
  nombre: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres').max(100).optional(),
  tipo: z.enum(TipoCuenta).optional(),
  activa: z.boolean().optional(),
});
export type ActualizarCuentaFinancieraDto = z.infer<typeof ActualizarCuentaFinancieraSchema>;

export const CrearTransferenciaSchema = z.object({
  origenCuentaId: z.number().int().positive('La cuenta de origen es obligatoria'),
  destinoCuentaId: z.number().int().positive('La cuenta de destino es obligatoria'),
  monto: montoDecimal,
  concepto: z.string().trim().min(3, 'El concepto debe tener al menos 3 caracteres').max(300),
  fecha: z.string().optional(),
});
export type CrearTransferenciaDto = z.infer<typeof CrearTransferenciaSchema>;

export const ConsultaLibroDiarioQuerySchema = z.object({
  desde: z.string().optional(),
  hasta: z.string().optional(),
  fecha: z.string().optional(),
});
export type ConsultaLibroDiarioQueryDto = z.infer<typeof ConsultaLibroDiarioQuerySchema>;

// ---------------- Rubros Contables (Fase 2) ----------------
export const CrearRubroContableSchema = z.object({
  nombre: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres').max(100),
  tipo: z.enum(TipoRubro),
  unidadId: z.number().int().positive().nullable().optional(),
  permiteDescuentoDefault: z.boolean().default(false).optional(),
  activo: z.boolean().default(true).optional(),
});
export type CrearRubroContableDto = z.infer<typeof CrearRubroContableSchema>;

export const ActualizarRubroContableSchema = z.object({
  nombre: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres').max(100).optional(),
  unidadId: z.number().int().positive().nullable().optional(),
  permiteDescuentoDefault: z.boolean().optional(),
  activo: z.boolean().optional(),
});
export type ActualizarRubroContableDto = z.infer<typeof ActualizarRubroContableSchema>;

export const ListarRubrosQuerySchema = z.object({
  tipo: z.enum(TipoRubro).optional(),
  incluirInactivos: z
    .preprocess((val) => (val === 'true' || val === true ? true : false), z.boolean())
    .optional(),
});
export type ListarRubrosQueryDto = z.infer<typeof ListarRubrosQuerySchema>;

// ---------------- Gastos / Egresos Operativos (Fase 2) ----------------
export const RegistrarGastoSchema = z.object({
  fecha: z.string().optional(),
  monto: montoDecimal,
  descripcion: z.string().trim().min(2, 'La descripción debe tener al menos 2 caracteres').max(300),
  rubroId: z.number().int().positive('Debe seleccionar un rubro de egreso'),
  cuentaId: z.number().int().positive('Debe seleccionar la cuenta de pago (Caja o Banco)'),
  comprobanteNro: z.string().trim().max(100).optional(),
  comprobanteUrl: z.string().trim().max(500).optional(),
});
export type RegistrarGastoDto = z.infer<typeof RegistrarGastoSchema>;

export const ActualizarGastoSchema = z.object({
  fecha: z.string().optional(),
  monto: montoDecimal.optional(),
  descripcion: z.string().trim().min(2, 'La descripción debe tener al menos 2 caracteres').max(300).optional(),
  rubroId: z.number().int().positive('Debe seleccionar un rubro de egreso').optional(),
  cuentaId: z.number().int().positive('Debe seleccionar la cuenta de pago (Caja o Banco)').optional(),
  comprobanteNro: z.string().trim().max(100).nullable().optional(),
  comprobanteUrl: z.string().trim().max(500).nullable().optional(),
});
export type ActualizarGastoDto = z.infer<typeof ActualizarGastoSchema>;

export const ListarGastosQuerySchema = z.object({
  cuentaId: z.preprocess((val) => (val ? Number(val) : undefined), z.number().int().positive().optional()),
  rubroId: z.preprocess((val) => (val ? Number(val) : undefined), z.number().int().positive().optional()),
  desde: z.string().optional(),
  hasta: z.string().optional(),
  incluirAnulados: z
    .preprocess((val) => (val === 'true' || val === true ? true : false), z.boolean())
    .optional(),
});
export type ListarGastosQueryDto = z.infer<typeof ListarGastosQuerySchema>;

// ---------------- Ingresos Directos / Manuales ----------------
export const RegistrarIngresoSchema = z.object({
  fecha: z.string().optional(),
  monto: montoDecimal,
  descripcion: z.string().trim().min(2, 'La descripción debe tener al menos 2 caracteres').max(300),
  rubroId: z.number().int().positive('Debe seleccionar un rubro de ingreso'),
  cuentaId: z.number().int().positive('Debe seleccionar la cuenta donde ingresa el dinero (Caja o Banco)'),
  comprobanteNro: z.string().trim().max(100).nullable().optional(),
});
export type RegistrarIngresoDto = z.infer<typeof RegistrarIngresoSchema>;

export const ActualizarIngresoSchema = z.object({
  fecha: z.string().optional(),
  monto: montoDecimal.optional(),
  descripcion: z.string().trim().min(2, 'La descripción debe tener al menos 2 caracteres').max(300).optional(),
  rubroId: z.number().int().positive('Debe seleccionar un rubro de ingreso').optional(),
  cuentaId: z.number().int().positive('Debe seleccionar la cuenta donde ingresa el dinero (Caja o Banco)').optional(),
  comprobanteNro: z.string().trim().max(100).nullable().optional(),
});
export type ActualizarIngresoDto = z.infer<typeof ActualizarIngresoSchema>;

export const ListarIngresosQuerySchema = z.object({
  cuentaId: z.preprocess((val) => (val ? Number(val) : undefined), z.number().int().positive().optional()),
  rubroId: z.preprocess((val) => (val ? Number(val) : undefined), z.number().int().positive().optional()),
  desde: z.string().optional(),
  hasta: z.string().optional(),
});
export type ListarIngresosQueryDto = z.infer<typeof ListarIngresosQuerySchema>;

// ---------------- Cuadro de Resultados (Fase 3) ----------------
export const ConsultaCuadroResultadosQuerySchema = z.object({
  anio: z
    .preprocess((val) => (val ? Number(val) : new Date().getFullYear()), z.number().int().min(2020).max(2100))
    .optional(),
  mes: z
    .preprocess((val) => (val ? Number(val) : undefined), z.number().int().min(1).max(12).optional()),
});
export type ConsultaCuadroResultadosQueryDto = z.infer<typeof ConsultaCuadroResultadosQuerySchema>;

// ---------------- Eventos Económicos y Entradas con QR (Fase 4) ----------------
export const CrearItemEventoSchema = z.object({
  nombre: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres').max(100),
  descripcion: z.string().trim().max(300).optional(),
  precioVenta: montoDecimal,
  costoUnitario: montoNoNegativo.default(0).optional(),
  gananciaUnitaria: montoNoNegativo.optional(),
  stockTotal: z.number().int().positive().nullable().optional(),
});
export type CrearItemEventoDto = z.infer<typeof CrearItemEventoSchema>;

export const CrearEventoSchema = z.object({
  titulo: z.string().trim().min(3, 'El título debe tener al menos 3 caracteres').max(150),
  descripcion: z.string().trim().max(1000).optional(),
  tipo: z.enum(['RECAUDACION_PEDIDOS', 'FESTIVAL_ENTRADAS']).default('RECAUDACION_PEDIDOS'),
  estado: z.enum(['BORRADOR', 'PUBLICADO', 'FINALIZADO', 'CANCELADO']).default('PUBLICADO').optional(),
  fechaEvento: z.string().min(1, 'Debe especificar la fecha del evento o retiro'),
  fechaFin: z.string().optional(),
  lugarEntrega: z.string().trim().max(200).optional(),
  rubroId: z.number().int().positive().nullable().optional(),
  cuentaId: z.number().int().positive().nullable().optional(),
  items: z.array(CrearItemEventoSchema).min(1, 'Debe incluir al menos un producto o tipo de entrada'),
});
export type CrearEventoDto = z.infer<typeof CrearEventoSchema>;

export const ActualizarEventoSchema = z.object({
  titulo: z.string().trim().min(3).max(150).optional(),
  descripcion: z.string().trim().max(1000).optional(),
  tipo: z.enum(['RECAUDACION_PEDIDOS', 'FESTIVAL_ENTRADAS']).optional(),
  estado: z.enum(['BORRADOR', 'PUBLICADO', 'FINALIZADO', 'CANCELADO']).optional(),
  fechaEvento: z.string().optional(),
  fechaFin: z.string().optional(),
  lugarEntrega: z.string().trim().max(200).optional(),
  rubroId: z.number().int().positive().nullable().optional(),
  cuentaId: z.number().int().positive().nullable().optional(),
  items: z.array(CrearItemEventoSchema).optional(),
});
export type ActualizarEventoDto = z.infer<typeof ActualizarEventoSchema>;

export const ItemPedidoSchema = z.object({
  itemId: z.number().int().positive(),
  cantidad: z.number().int().min(1, 'La cantidad debe ser al menos 1'),
});

export const CrearPedidoEventoSchema = z
  .object({
    eventoId: z.number().int().positive(),
    compradorNombre: z.string().trim().min(2, 'Indique el nombre del comprador o cliente').max(120),
    compradorContacto: z.string().trim().max(100).optional(),
    vendedorUsuarioId: z.number().int().positive().nullable().optional(),
    metodoPago: z.enum(['EFECTIVO', 'TRANSFERENCIA', 'OTRO']).optional(),
    cuentaId: z.number().int().positive().nullable().optional(),
    observaciones: z.string().trim().max(300).optional(),
    items: z.array(ItemPedidoSchema).min(1, 'Debe pedir al menos un producto'),
  })
  .refine(
    (data) => {
      const ids = data.items.map((i) => i.itemId);
      return new Set(ids).size === ids.length;
    },
    { message: 'No se permiten productos duplicados en el mismo pedido', path: ['items'] },
  );
export type CrearPedidoEventoDto = z.infer<typeof CrearPedidoEventoSchema>;

export const ActualizarPedidoEventoSchema = z
  .object({
    compradorNombre: z.string().trim().min(2, 'Indique el nombre del comprador o cliente').max(120).optional(),
    compradorContacto: z.string().trim().max(100).optional(),
    vendedorUsuarioId: z.number().int().positive().nullable().optional(),
    metodoPago: z.enum(['EFECTIVO', 'TRANSFERENCIA', 'OTRO']).optional(),
    cuentaId: z.number().int().positive().nullable().optional(),
    observaciones: z.string().trim().max(300).optional(),
    items: z.array(ItemPedidoSchema).min(1, 'Debe pedir al menos un producto').optional(),
  })
  .refine(
    (data) => {
      if (!data.items) return true;
      const ids = data.items.map((i) => i.itemId);
      return new Set(ids).size === ids.length;
    },
    { message: 'No se permiten productos duplicados en el mismo pedido', path: ['items'] },
  );
export type ActualizarPedidoEventoDto = z.infer<typeof ActualizarPedidoEventoSchema>;

export const ValidarTicketQrSchema = z.object({
  tokenQr: z.string().trim().min(10, 'Código QR no válido'),
});
export type ValidarTicketQrDto = z.infer<typeof ValidarTicketQrSchema>;

export const AcreditarGananciasEventoSchema = z.object({
  eventoId: z.number().int().positive(),
  soloRetirados: z.boolean().default(true).optional(),
});
export type AcreditarGananciasEventoDto = z.infer<typeof AcreditarGananciasEventoSchema>;



