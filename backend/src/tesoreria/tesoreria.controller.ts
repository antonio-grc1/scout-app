import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseBoolPipe,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { TipoEvento } from '@prisma/client';
import {
  Alcance,
  CurrentUser,
  RequireAnyPermission,
  RequirePermission,
} from '../common/decorators/auth.decorators.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import type { AlcanceAcceso, AuthUser } from '../common/types/auth.types.js';
import {
  AcreditarGananciasEventoSchema,
  ActualizarCuentaFinancieraSchema,
  ActualizarDescuentoFamiliaSchema,
  ActualizarEventoSchema,
  ActualizarGastoSchema,
  ActualizarPedidoEventoSchema,
  ActualizarRubroContableSchema,
  AjustarSaldoAFavorSchema,
  AplicarSaldoAFavorSchema,
  ConsultaLibroDiarioQuerySchema,
  ConsultaCuadroResultadosQuerySchema,
  CrearConceptoSchema,
  CrearCuentaFinancieraSchema,
  CrearEventoSchema,
  CrearPedidoEventoSchema,
  CrearPlanCuotaMensualSchema,
  CrearRubroContableSchema,
  CrearTransferenciaSchema,
  DesvincularHermanoSchema,
  EditarCargoIndividualSchema,
  EditarConceptoSchema,
  EditarPagoSchema,
  EditarPlanCuotaMensualSchema,
  GenerarCargoIndividualSchema,
  GenerarCargosSchema,
  ListarCargosQuerySchema,
  ListarGastosQuerySchema,
  ListarIngresosQuerySchema,
  ListarRubrosQuerySchema,
  RegistrarGastoSchema,
  RegistrarIngresoSchema,
  ActualizarIngresoSchema,
  RegistrarPagoSchema,
  SincronizarMesesPlanSchema,
  ValidarTicketQrSchema,
  VincularHermanoSchema,
  type AcreditarGananciasEventoDto,
  type ActualizarCuentaFinancieraDto,
  type ActualizarDescuentoFamiliaDto,
  type ActualizarEventoDto,
  type ActualizarGastoDto,
  type ActualizarPedidoEventoDto,
  type ActualizarRubroContableDto,
  type AjustarSaldoAFavorDto,
  type AplicarSaldoAFavorDto,
  type ConsultaCuadroResultadosQueryDto,
  type ConsultaLibroDiarioQueryDto,
  type CrearConceptoDto,
  type CrearCuentaFinancieraDto,
  type CrearEventoDto,
  type CrearPedidoEventoDto,
  type CrearPlanCuotaMensualDto,
  type CrearRubroContableDto,
  type CrearTransferenciaDto,
  type DesvincularHermanoDto,
  type EditarCargoIndividualDto,
  type EditarConceptoDto,
  type EditarPagoDto,
  type EditarPlanCuotaMensualDto,
  type GenerarCargoIndividualDto,
  type GenerarCargosDto,
  type ListarCargosQueryDto,
  type ListarGastosQueryDto,
  type ListarIngresosQueryDto,
  type ListarRubrosQueryDto,
  type RegistrarGastoDto,
  type RegistrarIngresoDto,
  type ActualizarIngresoDto,
  type RegistrarPagoDto,
  type SincronizarMesesPlanDto,
  type ValidarTicketQrDto,
  type VincularHermanoDto,
} from './tesoreria.dto.js';
import { TesoreriaService } from './tesoreria.service.js';

const CUOTAS_VER = 'cuotas.ver';
const CUOTAS_COBRAR = 'cuotas.cobrar';
const CUOTAS_AJUSTAR = 'cuotas.ajustar';
const TESORERIA_CONCEPTOS = 'tesoreria.conceptos_planes';
const TESORERIA_CAJA = 'tesoreria.caja_ver';
const TESORERIA_GASTOS = 'tesoreria.gastos_registrar';
const TESORERIA_GESTIONAR = 'tesoreria.gestionar';
const EVENTOS_VER = 'eventos.ver';
const EVENTOS_VENDER = 'eventos.vender';
const EVENTOS_GESTIONAR = 'eventos.gestionar';

@Controller('tesoreria')
export class TesoreriaController {
  constructor(private readonly tesoreria: TesoreriaService) {}

  // ---------------- Conceptos ----------------
  @RequireAnyPermission(CUOTAS_VER, TESORERIA_CONCEPTOS, TESORERIA_GESTIONAR)
  @Get('conceptos')
  listarConceptos(
    @Alcance() a: AlcanceAcceso,
    @Query('cicloAnio', new ParseIntPipe({ optional: true })) cicloAnio?: number,
  ) {
    return this.tesoreria.listarConceptos(a, cicloAnio);
  }

  @RequireAnyPermission(TESORERIA_CONCEPTOS, TESORERIA_GESTIONAR)
  @Post('conceptos')
  crearConcepto(
    @Alcance() a: AlcanceAcceso,
    @Body(new ZodValidationPipe(CrearConceptoSchema)) dto: CrearConceptoDto,
  ) {
    return this.tesoreria.crearConcepto(a, dto);
  }

  @RequireAnyPermission(TESORERIA_CONCEPTOS, TESORERIA_GESTIONAR)
  @Patch('conceptos/:id')
  editarConcepto(
    @Alcance() a: AlcanceAcceso,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(EditarConceptoSchema)) dto: EditarConceptoDto,
  ) {
    return this.tesoreria.editarConcepto(a, id, dto);
  }

  @RequireAnyPermission(TESORERIA_CONCEPTOS, TESORERIA_GESTIONAR)
  @Delete('conceptos/:id')
  eliminarConcepto(
    @Alcance() a: AlcanceAcceso,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.tesoreria.eliminarConcepto(a, id);
  }

  // ---------------- Grupos Familiares ----------------
  @RequireAnyPermission(CUOTAS_VER, TESORERIA_GESTIONAR, 'miembros.ver')
  @Get('familias')
  listarGruposFamiliares() {
    return this.tesoreria.listarGruposFamiliares();
  }

  @RequireAnyPermission(CUOTAS_AJUSTAR, TESORERIA_GESTIONAR, TESORERIA_CONCEPTOS)
  @Patch('familias/:id')
  actualizarDescuentoFamilia(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(ActualizarDescuentoFamiliaSchema)) dto: ActualizarDescuentoFamiliaDto,
  ) {
    return this.tesoreria.actualizarDescuentoFamilia(id, dto);
  }

  @RequirePermission(TESORERIA_GESTIONAR)
  @Delete('familias/:id')
  eliminarGrupoFamiliar(@Param('id', ParseIntPipe) id: number) {
    return this.tesoreria.eliminarGrupoFamiliar(id);
  }

  @RequireAnyPermission('miembros.editar', CUOTAS_AJUSTAR, TESORERIA_GESTIONAR)
  @Post('familias/vincular-hermano')
  vincularHermano(
    @Body(new ZodValidationPipe(VincularHermanoSchema)) dto: VincularHermanoDto,
  ) {
    return this.tesoreria.vincularHermano(dto);
  }

  @RequireAnyPermission('miembros.editar', CUOTAS_AJUSTAR, TESORERIA_GESTIONAR)
  @Post('familias/desvincular-hermano')
  desvincularHermano(
    @Body(new ZodValidationPipe(DesvincularHermanoSchema)) dto: DesvincularHermanoDto,
  ) {
    return this.tesoreria.desvincularHermano(dto);
  }

  // ---------------- Cargos ----------------
  @RequireAnyPermission(TESORERIA_CONCEPTOS, TESORERIA_GESTIONAR)
  @Post('cargos/generar')
  generarCargos(
    @Alcance() a: AlcanceAcceso,
    @Body(new ZodValidationPipe(GenerarCargosSchema)) dto: GenerarCargosDto,
  ) {
    return this.tesoreria.generarCargos(a, dto);
  }

  @RequireAnyPermission(CUOTAS_COBRAR, CUOTAS_AJUSTAR, TESORERIA_CONCEPTOS, TESORERIA_GESTIONAR)
  @Post('cargos/individual')
  generarCargoIndividual(
    @CurrentUser() u: AuthUser,
    @Alcance() a: AlcanceAcceso,
    @Body(new ZodValidationPipe(GenerarCargoIndividualSchema)) dto: GenerarCargoIndividualDto,
  ) {
    return this.tesoreria.generarCargoIndividual(u, a, dto);
  }

  @RequireAnyPermission(CUOTAS_AJUSTAR, TESORERIA_GESTIONAR)
  @Patch('cargos/:id')
  editarCargoIndividual(
    @Alcance() a: AlcanceAcceso,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(EditarCargoIndividualSchema)) dto: EditarCargoIndividualDto,
  ) {
    return this.tesoreria.editarCargoIndividual(a, id, dto);
  }

  @RequireAnyPermission(CUOTAS_AJUSTAR, TESORERIA_GESTIONAR)
  @Post('cargos/:id/anular')
  anularCargo(@Alcance() a: AlcanceAcceso, @Param('id', ParseIntPipe) id: number) {
    return this.tesoreria.anularCargo(a, id);
  }

  @RequireAnyPermission(CUOTAS_AJUSTAR, TESORERIA_GESTIONAR)
  @Post('cargos/:id/reactivar')
  reactivarCargo(@Alcance() a: AlcanceAcceso, @Param('id', ParseIntPipe) id: number) {
    return this.tesoreria.reactivarCargo(a, id);
  }

  @RequireAnyPermission(CUOTAS_AJUSTAR, TESORERIA_GESTIONAR)
  @Delete('cargos/:id')
  eliminarCargo(@Alcance() a: AlcanceAcceso, @Param('id', ParseIntPipe) id: number) {
    return this.tesoreria.eliminarCargo(a, id);
  }

  @RequireAnyPermission(CUOTAS_VER, CUOTAS_COBRAR, TESORERIA_GESTIONAR)
  @Get('cargos')
  listarCargos(
    @Alcance() a: AlcanceAcceso,
    @Query(new ZodValidationPipe(ListarCargosQuerySchema)) q: ListarCargosQueryDto,
  ) {
    return this.tesoreria.listarCargos(a, q);
  }

  @RequireAnyPermission(CUOTAS_VER, CUOTAS_COBRAR, TESORERIA_GESTIONAR)
  @Get('estado-cuenta/:usuarioId')
  obtenerEstadoCuenta(
    @Alcance() a: AlcanceAcceso,
    @Param('usuarioId', ParseIntPipe) usuarioId: number,
  ) {
    return this.tesoreria.obtenerEstadoCuenta(a, usuarioId);
  }

  // ---------------- Pagos e Imputaciones ----------------
  @RequireAnyPermission(CUOTAS_COBRAR, TESORERIA_GESTIONAR)
  @Post('pagos')
  registrarPago(
    @CurrentUser() u: AuthUser,
    @Alcance() a: AlcanceAcceso,
    @Body(new ZodValidationPipe(RegistrarPagoSchema)) dto: RegistrarPagoDto,
  ) {
    return this.tesoreria.registrarPago(u, a, dto);
  }

  @RequireAnyPermission(CUOTAS_AJUSTAR, TESORERIA_GESTIONAR)
  @Patch('pagos/:id')
  editarPago(
    @Alcance() a: AlcanceAcceso,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(EditarPagoSchema)) dto: EditarPagoDto,
  ) {
    return this.tesoreria.editarPago(a, id, dto);
  }

  @RequireAnyPermission(CUOTAS_AJUSTAR, TESORERIA_GESTIONAR)
  @Delete('pagos/:id')
  revertirPago(@Alcance() a: AlcanceAcceso, @Param('id', ParseIntPipe) id: number) {
    return this.tesoreria.revertirPago(a, id);
  }

  @RequireAnyPermission(CUOTAS_VER, CUOTAS_COBRAR, TESORERIA_GESTIONAR)
  @Get('pagos')
  listarPagos(
    @Alcance() a: AlcanceAcceso,
    @Query('usuarioId', new ParseIntPipe({ optional: true })) usuarioId?: number,
  ) {
    return this.tesoreria.listarPagos(a, usuarioId);
  }

  // ---------------- Planes de Cuota Mensual ----------------
  @RequireAnyPermission(CUOTAS_VER, TESORERIA_CONCEPTOS, TESORERIA_GESTIONAR)
  @Get('planes-mensuales')
  listarPlanesCuotaMensual(
    @Alcance() a: AlcanceAcceso,
    @Query('cicloAnio', new ParseIntPipe({ optional: true })) cicloAnio?: number,
  ) {
    return this.tesoreria.listarPlanesCuotaMensual(a, cicloAnio);
  }

  @RequireAnyPermission(TESORERIA_CONCEPTOS, TESORERIA_GESTIONAR)
  @Post('planes-mensuales')
  crearPlanCuotaMensual(
    @Alcance() a: AlcanceAcceso,
    @Body(new ZodValidationPipe(CrearPlanCuotaMensualSchema)) dto: CrearPlanCuotaMensualDto,
  ) {
    return this.tesoreria.crearPlanCuotaMensual(a, dto);
  }

  @RequireAnyPermission(TESORERIA_CONCEPTOS, TESORERIA_GESTIONAR)
  @Patch('planes-mensuales/:id')
  editarPlanCuotaMensual(
    @Alcance() a: AlcanceAcceso,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(EditarPlanCuotaMensualSchema)) dto: EditarPlanCuotaMensualDto,
  ) {
    return this.tesoreria.editarPlanCuotaMensual(a, id, dto);
  }

  @RequireAnyPermission(TESORERIA_CONCEPTOS, TESORERIA_GESTIONAR)
  @Delete('planes-mensuales/:id')
  eliminarPlanCuotaMensual(
    @Alcance() a: AlcanceAcceso,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.tesoreria.eliminarPlanCuotaMensual(a, id);
  }

  @RequireAnyPermission(TESORERIA_CONCEPTOS, TESORERIA_GESTIONAR)
  @Post('planes-mensuales/:id/sincronizar-meses')
  sincronizarMesesPlan(
    @Alcance() a: AlcanceAcceso,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(SincronizarMesesPlanSchema)) dto: SincronizarMesesPlanDto,
  ) {
    return this.tesoreria.sincronizarMesesPlan(a, id, dto);
  }

  // ---------------- Saldo a Favor ----------------
  @RequireAnyPermission(CUOTAS_COBRAR, TESORERIA_GESTIONAR)
  @Post('saldo-a-favor/aplicar')
  aplicarSaldoAFavor(
    @CurrentUser() u: AuthUser,
    @Alcance() a: AlcanceAcceso,
    @Body(new ZodValidationPipe(AplicarSaldoAFavorSchema)) dto: AplicarSaldoAFavorDto,
  ) {
    return this.tesoreria.aplicarSaldoAFavor(u, a, dto);
  }

  @RequireAnyPermission(CUOTAS_AJUSTAR, TESORERIA_GESTIONAR)
  @Post('saldo-a-favor/ajustar')
  ajustarSaldoAFavor(
    @CurrentUser() u: AuthUser,
    @Alcance() a: AlcanceAcceso,
    @Body(new ZodValidationPipe(AjustarSaldoAFavorSchema)) dto: AjustarSaldoAFavorDto,
  ) {
    return this.tesoreria.ajustarSaldoAFavor(u, a, dto);
  }

  // ---------------- Cuentas Financieras, Libro Diario y Transferencias (Fase 1) ----------------
  @RequireAnyPermission(TESORERIA_CAJA, CUOTAS_COBRAR, TESORERIA_GESTIONAR)
  @Get('cuentas')
  listarCuentas(
    @Alcance() a: AlcanceAcceso,
    @Query('incluirInactivas', new ParseBoolPipe({ optional: true })) incluirInactivas?: boolean,
  ) {
    return this.tesoreria.listarCuentasFinancieras(a, incluirInactivas);
  }

  @RequirePermission(TESORERIA_GESTIONAR)
  @Post('cuentas')
  crearCuenta(
    @CurrentUser() u: AuthUser,
    @Alcance() a: AlcanceAcceso,
    @Body(new ZodValidationPipe(CrearCuentaFinancieraSchema)) dto: CrearCuentaFinancieraDto,
  ) {
    return this.tesoreria.crearCuentaFinanciera(u, a, dto);
  }

  @RequirePermission(TESORERIA_GESTIONAR)
  @Patch('cuentas/:id')
  actualizarCuenta(
    @CurrentUser() u: AuthUser,
    @Alcance() a: AlcanceAcceso,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(ActualizarCuentaFinancieraSchema)) dto: ActualizarCuentaFinancieraDto,
  ) {
    return this.tesoreria.actualizarCuentaFinanciera(u, a, id, dto);
  }

  @RequirePermission(TESORERIA_GESTIONAR)
  @Delete('cuentas/:id')
  eliminarCuenta(
    @CurrentUser() u: AuthUser,
    @Alcance() a: AlcanceAcceso,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.tesoreria.eliminarCuentaFinanciera(u, a, id);
  }

  @RequireAnyPermission(TESORERIA_CAJA, TESORERIA_GESTIONAR)
  @Get('cuentas/:id/libro-diario')
  obtenerLibroDiario(
    @Alcance() a: AlcanceAcceso,
    @Param('id', ParseIntPipe) id: number,
    @Query(new ZodValidationPipe(ConsultaLibroDiarioQuerySchema)) query: ConsultaLibroDiarioQueryDto,
  ) {
    return this.tesoreria.obtenerLibroDiario(a, id, query);
  }

  @RequirePermission(TESORERIA_GESTIONAR)
  @Post('transferencias')
  transferir(
    @CurrentUser() u: AuthUser,
    @Alcance() a: AlcanceAcceso,
    @Body(new ZodValidationPipe(CrearTransferenciaSchema)) dto: CrearTransferenciaDto,
  ) {
    return this.tesoreria.transferirEntreCuentas(u, a, dto);
  }

  // ---------------- Rubros Contables (Fase 2) ----------------
  @RequireAnyPermission(TESORERIA_CAJA, TESORERIA_GASTOS, TESORERIA_GESTIONAR)
  @Get('rubros')
  listarRubros(
    @Alcance() a: AlcanceAcceso,
    @Query(new ZodValidationPipe(ListarRubrosQuerySchema)) query: ListarRubrosQueryDto,
  ) {
    return this.tesoreria.listarRubrosContables(a, query);
  }

  @RequirePermission(TESORERIA_GESTIONAR)
  @Post('rubros')
  crearRubro(
    @Alcance() a: AlcanceAcceso,
    @Body(new ZodValidationPipe(CrearRubroContableSchema)) dto: CrearRubroContableDto,
  ) {
    return this.tesoreria.crearRubroContable(a, dto);
  }

  @RequirePermission(TESORERIA_GESTIONAR)
  @Patch('rubros/:id')
  actualizarRubro(
    @Alcance() a: AlcanceAcceso,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(ActualizarRubroContableSchema)) dto: ActualizarRubroContableDto,
  ) {
    return this.tesoreria.actualizarRubroContable(a, id, dto);
  }

  @RequirePermission(TESORERIA_GESTIONAR)
  @Delete('rubros/:id')
  eliminarRubro(
    @Alcance() a: AlcanceAcceso,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.tesoreria.eliminarRubroContable(a, id);
  }

  // ---------------- Gastos y Egresos Operativos (Fase 2) ----------------
  @RequireAnyPermission(TESORERIA_CAJA, TESORERIA_GASTOS, TESORERIA_GESTIONAR)
  @Get('gastos')
  listarGastos(
    @Alcance() a: AlcanceAcceso,
    @Query(new ZodValidationPipe(ListarGastosQuerySchema)) query: ListarGastosQueryDto,
  ) {
    return this.tesoreria.listarGastos(a, query);
  }

  @RequireAnyPermission(TESORERIA_GASTOS, TESORERIA_GESTIONAR)
  @Post('gastos')
  registrarGasto(
    @CurrentUser() u: AuthUser,
    @Alcance() a: AlcanceAcceso,
    @Body(new ZodValidationPipe(RegistrarGastoSchema)) dto: RegistrarGastoDto,
  ) {
    return this.tesoreria.registrarGasto(u, a, dto);
  }

  @RequireAnyPermission(TESORERIA_GASTOS, TESORERIA_GESTIONAR)
  @Patch('gastos/:id')
  actualizarGasto(
    @CurrentUser() u: AuthUser,
    @Alcance() a: AlcanceAcceso,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(ActualizarGastoSchema)) dto: ActualizarGastoDto,
  ) {
    return this.tesoreria.actualizarGasto(u, a, id, dto);
  }

  @RequireAnyPermission(TESORERIA_GASTOS, TESORERIA_GESTIONAR)
  @Post('gastos/:id/anular')
  anularGasto(
    @CurrentUser() u: AuthUser,
    @Alcance() a: AlcanceAcceso,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.tesoreria.anularGasto(u, a, id);
  }

  @RequireAnyPermission(TESORERIA_GASTOS, TESORERIA_GESTIONAR)
  @Post('gastos/:id/restaurar')
  restaurarGasto(
    @CurrentUser() u: AuthUser,
    @Alcance() a: AlcanceAcceso,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.tesoreria.restaurarGasto(u, a, id);
  }

  // ---------------- Ingresos Directos / Manuales ----------------
  @RequireAnyPermission(TESORERIA_CAJA, TESORERIA_GESTIONAR)
  @Get('ingresos')
  listarIngresos(
    @Alcance() a: AlcanceAcceso,
    @Query(new ZodValidationPipe(ListarIngresosQuerySchema)) query: ListarIngresosQueryDto,
  ) {
    return this.tesoreria.listarIngresos(a, query);
  }

  @RequirePermission(TESORERIA_GESTIONAR)
  @Post('ingresos')
  registrarIngreso(
    @CurrentUser() u: AuthUser,
    @Alcance() a: AlcanceAcceso,
    @Body(new ZodValidationPipe(RegistrarIngresoSchema)) dto: RegistrarIngresoDto,
  ) {
    return this.tesoreria.registrarIngreso(u, a, dto);
  }

  @RequirePermission(TESORERIA_GESTIONAR)
  @Patch('ingresos/:id')
  actualizarIngreso(
    @CurrentUser() u: AuthUser,
    @Alcance() a: AlcanceAcceso,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(ActualizarIngresoSchema)) dto: ActualizarIngresoDto,
  ) {
    return this.tesoreria.actualizarIngreso(u, a, id, dto);
  }

  @RequirePermission(TESORERIA_GESTIONAR)
  @Delete('ingresos/:id')
  eliminarIngreso(
    @CurrentUser() u: AuthUser,
    @Alcance() a: AlcanceAcceso,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.tesoreria.eliminarIngreso(u, a, id);
  }

  // ---------------- Cuadro de Resultados (Fase 3) ----------------
  @RequireAnyPermission(TESORERIA_CAJA, TESORERIA_GESTIONAR)
  @Get('cuadro-resultados')
  obtenerCuadroResultados(
    @Alcance() a: AlcanceAcceso,
    @Query(new ZodValidationPipe(ConsultaCuadroResultadosQuerySchema)) query: ConsultaCuadroResultadosQueryDto,
  ) {
    return this.tesoreria.obtenerCuadroResultados(a, query);
  }

  // ---------------- Eventos Económicos y Entradas QR (Fase 4) ----------------
  @RequireAnyPermission(EVENTOS_VER, EVENTOS_VENDER, EVENTOS_GESTIONAR, CUOTAS_VER, TESORERIA_GESTIONAR)
  @Get('eventos')
  listarEventos(
    @Alcance() a: AlcanceAcceso,
    @Query('tipo') tipo?: TipoEvento,
  ) {
    return this.tesoreria.listarEventos(a, tipo);
  }

  @RequireAnyPermission(EVENTOS_VER, EVENTOS_VENDER, EVENTOS_GESTIONAR, CUOTAS_VER, TESORERIA_GESTIONAR)
  @Get('eventos/:id')
  obtenerEventoPorId(
    @Alcance() a: AlcanceAcceso,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.tesoreria.obtenerEventoPorId(a, id);
  }

  @RequireAnyPermission(EVENTOS_GESTIONAR, TESORERIA_GESTIONAR)
  @Post('eventos')
  crearEvento(
    @CurrentUser() u: AuthUser,
    @Alcance() a: AlcanceAcceso,
    @Body(new ZodValidationPipe(CrearEventoSchema)) dto: CrearEventoDto,
  ) {
    return this.tesoreria.crearEvento(u, a, dto);
  }

  @RequireAnyPermission(EVENTOS_GESTIONAR, TESORERIA_GESTIONAR)
  @Patch('eventos/:id')
  actualizarEvento(
    @CurrentUser() u: AuthUser,
    @Alcance() a: AlcanceAcceso,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(ActualizarEventoSchema)) dto: ActualizarEventoDto,
  ) {
    return this.tesoreria.actualizarEvento(u, a, id, dto);
  }

  @RequireAnyPermission(EVENTOS_GESTIONAR, TESORERIA_GESTIONAR)
  @Delete('eventos/:id')
  eliminarEvento(
    @Alcance() a: AlcanceAcceso,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.tesoreria.eliminarEvento(a, id);
  }

  @RequireAnyPermission(EVENTOS_VENDER, EVENTOS_GESTIONAR, CUOTAS_COBRAR, TESORERIA_GESTIONAR)
  @Post('eventos/pedidos')
  crearPedidoEvento(
    @CurrentUser() u: AuthUser,
    @Alcance() a: AlcanceAcceso,
    @Body(new ZodValidationPipe(CrearPedidoEventoSchema)) dto: CrearPedidoEventoDto,
  ) {
    return this.tesoreria.crearPedidoEvento(u, a, dto);
  }

  @RequireAnyPermission(EVENTOS_VENDER, EVENTOS_GESTIONAR, CUOTAS_COBRAR, TESORERIA_GESTIONAR)
  @Patch('eventos/pedidos/:id')
  actualizarPedidoEvento(
    @CurrentUser() u: AuthUser,
    @Alcance() a: AlcanceAcceso,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(ActualizarPedidoEventoSchema)) dto: ActualizarPedidoEventoDto,
  ) {
    return this.tesoreria.actualizarPedidoEvento(u, a, id, dto);
  }

  @RequireAnyPermission(EVENTOS_VENDER, EVENTOS_GESTIONAR, CUOTAS_COBRAR, TESORERIA_GESTIONAR)
  @Delete('eventos/pedidos/:id')
  eliminarPedidoEvento(
    @CurrentUser() u: AuthUser,
    @Alcance() a: AlcanceAcceso,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.tesoreria.eliminarPedidoEvento(u, a, id);
  }

  @RequireAnyPermission(EVENTOS_VENDER, EVENTOS_GESTIONAR, CUOTAS_COBRAR, TESORERIA_GESTIONAR)
  @Post('eventos/validar-qr')
  validarTicketQr(
    @CurrentUser() u: AuthUser,
    @Alcance() a: AlcanceAcceso,
    @Body(new ZodValidationPipe(ValidarTicketQrSchema)) dto: ValidarTicketQrDto,
  ) {
    return this.tesoreria.validarTicketQr(u, a, dto);
  }

  @RequireAnyPermission(EVENTOS_GESTIONAR, TESORERIA_GESTIONAR)
  @Post('eventos/acreditar-ganancias')
  acreditarGananciasEvento(
    @CurrentUser() u: AuthUser,
    @Alcance() a: AlcanceAcceso,
    @Body(new ZodValidationPipe(AcreditarGananciasEventoSchema)) dto: AcreditarGananciasEventoDto,
  ) {
    return this.tesoreria.acreditarGananciasEvento(u, a, dto);
  }

  @RequirePermission(CUOTAS_VER)
  @Get('mis-tickets')
  obtenerMisTickets(@CurrentUser() u: AuthUser) {
    return this.tesoreria.obtenerMisTickets(u);
  }

  @RequirePermission(CUOTAS_VER)
  @Get('mis-pedidos')
  obtenerMisPedidos(@CurrentUser() u: AuthUser) {
    return this.tesoreria.obtenerMisPedidos(u);
  }
}
