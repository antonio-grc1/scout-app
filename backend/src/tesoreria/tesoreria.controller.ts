import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Alcance, CurrentUser, RequirePermission } from '../common/decorators/auth.decorators.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import type { AlcanceAcceso, AuthUser } from '../common/types/auth.types.js';
import {
  ActualizarDescuentoFamiliaSchema,
  AjustarSaldoAFavorSchema,
  AplicarSaldoAFavorSchema,
  CrearConceptoSchema,
  CrearPlanCuotaMensualSchema,
  DesvincularHermanoSchema,
  EditarCargoIndividualSchema,
  EditarConceptoSchema,
  EditarPagoSchema,
  EditarPlanCuotaMensualSchema,
  GenerarCargoIndividualSchema,
  GenerarCargosSchema,
  ListarCargosQuerySchema,
  RegistrarPagoSchema,
  SincronizarMesesPlanSchema,
  VincularHermanoSchema,
  type ActualizarDescuentoFamiliaDto,
  type AjustarSaldoAFavorDto,
  type AplicarSaldoAFavorDto,
  type CrearConceptoDto,
  type CrearPlanCuotaMensualDto,
  type DesvincularHermanoDto,
  type EditarCargoIndividualDto,
  type EditarConceptoDto,
  type EditarPagoDto,
  type EditarPlanCuotaMensualDto,
  type GenerarCargoIndividualDto,
  type GenerarCargosDto,
  type ListarCargosQueryDto,
  type RegistrarPagoDto,
  type SincronizarMesesPlanDto,
  type VincularHermanoDto,
} from './tesoreria.dto.js';
import { TesoreriaService } from './tesoreria.service.js';

const CUOTAS_VER = 'cuotas.ver';
const CUOTAS_COBRAR = 'cuotas.cobrar';
const TESORERIA_GESTIONAR = 'tesoreria.gestionar';

@Controller('tesoreria')
export class TesoreriaController {
  constructor(private readonly tesoreria: TesoreriaService) {}

  // ---------------- Conceptos ----------------
  @RequirePermission(CUOTAS_VER)
  @Get('conceptos')
  listarConceptos(
    @Alcance() a: AlcanceAcceso,
    @Query('cicloAnio', new ParseIntPipe({ optional: true })) cicloAnio?: number,
  ) {
    return this.tesoreria.listarConceptos(a, cicloAnio);
  }

  @RequirePermission(TESORERIA_GESTIONAR)
  @Post('conceptos')
  crearConcepto(
    @Alcance() a: AlcanceAcceso,
    @Body(new ZodValidationPipe(CrearConceptoSchema)) dto: CrearConceptoDto,
  ) {
    return this.tesoreria.crearConcepto(a, dto);
  }

  @RequirePermission(TESORERIA_GESTIONAR)
  @Patch('conceptos/:id')
  editarConcepto(
    @Alcance() a: AlcanceAcceso,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(EditarConceptoSchema)) dto: EditarConceptoDto,
  ) {
    return this.tesoreria.editarConcepto(a, id, dto);
  }

  @RequirePermission(TESORERIA_GESTIONAR)
  @Delete('conceptos/:id')
  eliminarConcepto(
    @Alcance() a: AlcanceAcceso,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.tesoreria.eliminarConcepto(a, id);
  }

  // ---------------- Grupos Familiares ----------------
  @RequirePermission(TESORERIA_GESTIONAR)
  @Get('familias')
  listarGruposFamiliares() {
    return this.tesoreria.listarGruposFamiliares();
  }

  @RequirePermission(TESORERIA_GESTIONAR)
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

  @RequirePermission('miembros.editar')
  @Post('familias/vincular-hermano')
  vincularHermano(
    @Body(new ZodValidationPipe(VincularHermanoSchema)) dto: VincularHermanoDto,
  ) {
    return this.tesoreria.vincularHermano(dto);
  }

  @RequirePermission('miembros.editar')
  @Post('familias/desvincular-hermano')
  desvincularHermano(
    @Body(new ZodValidationPipe(DesvincularHermanoSchema)) dto: DesvincularHermanoDto,
  ) {
    return this.tesoreria.desvincularHermano(dto);
  }

  // ---------------- Cargos ----------------
  @RequirePermission(TESORERIA_GESTIONAR)
  @Post('cargos/generar')
  generarCargos(
    @Alcance() a: AlcanceAcceso,
    @Body(new ZodValidationPipe(GenerarCargosSchema)) dto: GenerarCargosDto,
  ) {
    return this.tesoreria.generarCargos(a, dto);
  }

  @RequirePermission(CUOTAS_COBRAR)
  @Post('cargos/individual')
  generarCargoIndividual(
    @CurrentUser() u: AuthUser,
    @Alcance() a: AlcanceAcceso,
    @Body(new ZodValidationPipe(GenerarCargoIndividualSchema)) dto: GenerarCargoIndividualDto,
  ) {
    return this.tesoreria.generarCargoIndividual(u, a, dto);
  }

  @RequirePermission(CUOTAS_COBRAR)
  @Patch('cargos/:id')
  editarCargoIndividual(
    @Alcance() a: AlcanceAcceso,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(EditarCargoIndividualSchema)) dto: EditarCargoIndividualDto,
  ) {
    return this.tesoreria.editarCargoIndividual(a, id, dto);
  }

  @RequirePermission(CUOTAS_COBRAR)
  @Post('cargos/:id/anular')
  anularCargo(@Alcance() a: AlcanceAcceso, @Param('id', ParseIntPipe) id: number) {
    return this.tesoreria.anularCargo(a, id);
  }

  @RequirePermission(CUOTAS_COBRAR)
  @Post('cargos/:id/reactivar')
  reactivarCargo(@Alcance() a: AlcanceAcceso, @Param('id', ParseIntPipe) id: number) {
    return this.tesoreria.reactivarCargo(a, id);
  }

  @RequirePermission(CUOTAS_COBRAR)
  @Delete('cargos/:id')
  eliminarCargo(@Alcance() a: AlcanceAcceso, @Param('id', ParseIntPipe) id: number) {
    return this.tesoreria.eliminarCargo(a, id);
  }

  @RequirePermission(CUOTAS_VER)
  @Get('cargos')
  listarCargos(
    @Alcance() a: AlcanceAcceso,
    @Query(new ZodValidationPipe(ListarCargosQuerySchema)) q: ListarCargosQueryDto,
  ) {
    return this.tesoreria.listarCargos(a, q);
  }

  @RequirePermission(CUOTAS_VER)
  @Get('estado-cuenta/:usuarioId')
  obtenerEstadoCuenta(
    @Alcance() a: AlcanceAcceso,
    @Param('usuarioId', ParseIntPipe) usuarioId: number,
  ) {
    return this.tesoreria.obtenerEstadoCuenta(a, usuarioId);
  }

  // ---------------- Pagos e Imputaciones ----------------
  @RequirePermission(CUOTAS_COBRAR)
  @Post('pagos')
  registrarPago(
    @CurrentUser() u: AuthUser,
    @Alcance() a: AlcanceAcceso,
    @Body(new ZodValidationPipe(RegistrarPagoSchema)) dto: RegistrarPagoDto,
  ) {
    return this.tesoreria.registrarPago(u, a, dto);
  }

  @RequirePermission(CUOTAS_COBRAR)
  @Patch('pagos/:id')
  editarPago(
    @Alcance() a: AlcanceAcceso,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(EditarPagoSchema)) dto: EditarPagoDto,
  ) {
    return this.tesoreria.editarPago(a, id, dto);
  }

  @RequirePermission(CUOTAS_COBRAR)
  @Delete('pagos/:id')
  revertirPago(@Alcance() a: AlcanceAcceso, @Param('id', ParseIntPipe) id: number) {
    return this.tesoreria.revertirPago(a, id);
  }

  @RequirePermission(CUOTAS_VER)
  @Get('pagos')
  listarPagos(
    @Alcance() a: AlcanceAcceso,
    @Query('usuarioId', new ParseIntPipe({ optional: true })) usuarioId?: number,
  ) {
    return this.tesoreria.listarPagos(a, usuarioId);
  }

  // ---------------- Planes de Cuota Mensual ----------------
  @RequirePermission(CUOTAS_VER)
  @Get('planes-mensuales')
  listarPlanesCuotaMensual(
    @Alcance() a: AlcanceAcceso,
    @Query('cicloAnio', new ParseIntPipe({ optional: true })) cicloAnio?: number,
  ) {
    return this.tesoreria.listarPlanesCuotaMensual(a, cicloAnio);
  }

  @RequirePermission(TESORERIA_GESTIONAR)
  @Post('planes-mensuales')
  crearPlanCuotaMensual(
    @Alcance() a: AlcanceAcceso,
    @Body(new ZodValidationPipe(CrearPlanCuotaMensualSchema)) dto: CrearPlanCuotaMensualDto,
  ) {
    return this.tesoreria.crearPlanCuotaMensual(a, dto);
  }

  @RequirePermission(TESORERIA_GESTIONAR)
  @Patch('planes-mensuales/:id')
  editarPlanCuotaMensual(
    @Alcance() a: AlcanceAcceso,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(EditarPlanCuotaMensualSchema)) dto: EditarPlanCuotaMensualDto,
  ) {
    return this.tesoreria.editarPlanCuotaMensual(a, id, dto);
  }

  @RequirePermission(TESORERIA_GESTIONAR)
  @Delete('planes-mensuales/:id')
  eliminarPlanCuotaMensual(
    @Alcance() a: AlcanceAcceso,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.tesoreria.eliminarPlanCuotaMensual(a, id);
  }

  @RequirePermission(TESORERIA_GESTIONAR)
  @Post('planes-mensuales/:id/sincronizar-meses')
  sincronizarMesesPlan(
    @Alcance() a: AlcanceAcceso,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(SincronizarMesesPlanSchema)) dto: SincronizarMesesPlanDto,
  ) {
    return this.tesoreria.sincronizarMesesPlan(a, id, dto);
  }

  // ---------------- Saldo a Favor ----------------
  @RequirePermission(CUOTAS_COBRAR)
  @Post('saldo-a-favor/aplicar')
  aplicarSaldoAFavor(
    @CurrentUser() u: AuthUser,
    @Alcance() a: AlcanceAcceso,
    @Body(new ZodValidationPipe(AplicarSaldoAFavorSchema)) dto: AplicarSaldoAFavorDto,
  ) {
    return this.tesoreria.aplicarSaldoAFavor(u, a, dto);
  }

  @RequirePermission(CUOTAS_COBRAR)
  @Post('saldo-a-favor/ajustar')
  ajustarSaldoAFavor(
    @CurrentUser() u: AuthUser,
    @Alcance() a: AlcanceAcceso,
    @Body(new ZodValidationPipe(AjustarSaldoAFavorSchema)) dto: AjustarSaldoAFavorDto,
  ) {
    return this.tesoreria.ajustarSaldoAFavor(u, a, dto);
  }
}
