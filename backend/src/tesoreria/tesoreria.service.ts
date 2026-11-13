import { Injectable, Optional } from '@nestjs/common';
import type { Prisma, TipoEvento } from '@prisma/client';
import type { AlcanceAcceso, AuthUser } from '../common/types/auth.types.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  AcreditarGananciasEventoDto,
  ActualizarCuentaFinancieraDto,
  ActualizarDescuentoFamiliaDto,
  ActualizarEventoDto,
  ActualizarGastoDto,
  ActualizarIngresoDto,
  ActualizarPedidoEventoDto,
  ActualizarRubroContableDto,
  AjustarSaldoAFavorDto,
  AplicarSaldoAFavorDto,
  ConsultaCuadroResultadosQueryDto,
  ConsultaLibroDiarioQueryDto,
  CrearConceptoDto,
  CrearCuentaFinancieraDto,
  CrearEventoDto,
  CrearPedidoEventoDto,
  CrearPlanCuotaMensualDto,
  CrearRubroContableDto,
  CrearTransferenciaDto,
  DesvincularHermanoDto,
  EditarCargoIndividualDto,
  EditarConceptoDto,
  EditarPagoDto,
  EditarPlanCuotaMensualDto,
  GenerarCargoIndividualDto,
  GenerarCargosDto,
  ListarCargosQueryDto,
  ListarGastosQueryDto,
  ListarIngresosQueryDto,
  ListarRubrosQueryDto,
  RegistrarGastoDto,
  RegistrarIngresoDto,
  RegistrarPagoDto,
  SincronizarMesesPlanDto,
  ValidarTicketQrDto,
  VincularHermanoDto,
} from './tesoreria.dto.js';
import { TesoreriaCajaService } from './tesoreria-caja.service.js';
import { TesoreriaCuotasService } from './tesoreria-cuotas.service.js';
import { TesoreriaEventosService } from './tesoreria-eventos.service.js';

/**
 * Fachada pública de Tesorería.
 * Delega cada subdominio en servicios cohesivos (`Cuotas`, `Caja`, `Eventos`)
 * manteniendo compatibilidad con callers externos y pruebas unitarias.
 */
@Injectable()
export class TesoreriaService {
  readonly cuotas: TesoreriaCuotasService;
  readonly caja: TesoreriaCajaService;
  readonly eventos: TesoreriaEventosService;

  constructor(
    prisma: PrismaService,
    @Optional() cuotas?: TesoreriaCuotasService,
    @Optional() caja?: TesoreriaCajaService,
    @Optional() eventos?: TesoreriaEventosService,
  ) {
    this.cuotas = cuotas ?? new TesoreriaCuotasService(prisma);
    this.caja = caja ?? new TesoreriaCajaService(prisma);
    this.eventos = eventos ?? new TesoreriaEventosService(prisma);
  }

  // ---------------- Cuotas, Planes, Conceptos, Familias y Pagos ----------------

  recalcularCargosPendientesDeUsuariosEnTx(tx: Prisma.TransactionClient, usuarioIds: number[]) {
    return this.cuotas.recalcularCargosPendientesDeUsuariosEnTx(tx, usuarioIds);
  }

  sincronizarCuotasMiembroActivoEnTx(
    tx: Prisma.TransactionClient,
    usuarioId: number,
    mesDesde?: number,
    cicloAnio?: number,
  ) {
    return this.cuotas.sincronizarCuotasMiembroActivoEnTx(tx, usuarioId, mesDesde, cicloAnio);
  }

  anularCargosImpagosDeMiembroEnTx(tx: Prisma.TransactionClient, usuarioId: number) {
    return this.cuotas.anularCargosImpagosDeMiembroEnTx(tx, usuarioId);
  }

  sincronizarCargosDeConceptoEnTx(tx: Prisma.TransactionClient, concepto: any) {
    return this.cuotas.sincronizarCargosDeConceptoEnTx(tx, concepto);
  }

  sincronizarMesDePlanEnTx(tx: Prisma.TransactionClient, plan: any, mesNum: number) {
    return this.cuotas.sincronizarMesDePlanEnTx(tx, plan, mesNum);
  }

  listarPlanesCuotaMensual(alcance: AlcanceAcceso, cicloAnio?: number) {
    return this.cuotas.listarPlanesCuotaMensual(alcance, cicloAnio);
  }

  crearPlanCuotaMensual(alcance: AlcanceAcceso, dto: CrearPlanCuotaMensualDto) {
    return this.cuotas.crearPlanCuotaMensual(alcance, dto);
  }

  sincronizarMesesPlan(alcance: AlcanceAcceso, planId: number, dto: SincronizarMesesPlanDto) {
    return this.cuotas.sincronizarMesesPlan(alcance, planId, dto);
  }

  editarPlanCuotaMensual(alcance: AlcanceAcceso, id: number, dto: EditarPlanCuotaMensualDto) {
    return this.cuotas.editarPlanCuotaMensual(alcance, id, dto);
  }

  eliminarPlanCuotaMensual(alcance: AlcanceAcceso, id: number) {
    return this.cuotas.eliminarPlanCuotaMensual(alcance, id);
  }

  listarConceptos(alcance: AlcanceAcceso, cicloAnio?: number) {
    return this.cuotas.listarConceptos(alcance, cicloAnio);
  }

  crearConcepto(alcance: AlcanceAcceso, dto: CrearConceptoDto) {
    return this.cuotas.crearConcepto(alcance, dto);
  }

  editarConcepto(alcance: AlcanceAcceso, id: number, dto: EditarConceptoDto) {
    return this.cuotas.editarConcepto(alcance, id, dto);
  }

  eliminarConcepto(alcance: AlcanceAcceso, id: number) {
    return this.cuotas.eliminarConcepto(alcance, id);
  }

  listarGruposFamiliares(alcance?: AlcanceAcceso) {
    return this.cuotas.listarGruposFamiliares(alcance);
  }

  actualizarDescuentoFamilia(alcance: AlcanceAcceso, id: number, dto: ActualizarDescuentoFamiliaDto) {
    return this.cuotas.actualizarDescuentoFamilia(alcance, id, dto);
  }

  vincularHermano(alcance: AlcanceAcceso, dto: VincularHermanoDto) {
    return this.cuotas.vincularHermano(alcance, dto);
  }

  desvincularHermano(alcance: AlcanceAcceso, dto: DesvincularHermanoDto) {
    return this.cuotas.desvincularHermano(alcance, dto);
  }

  eliminarGrupoFamiliar(alcance: AlcanceAcceso, id: number) {
    return this.cuotas.eliminarGrupoFamiliar(alcance, id);
  }

  generarCargos(alcance: AlcanceAcceso, dto: GenerarCargosDto) {
    return this.cuotas.generarCargos(alcance, dto);
  }

  generarCargoIndividual(actor: AuthUser, alcance: AlcanceAcceso, dto: GenerarCargoIndividualDto) {
    return this.cuotas.generarCargoIndividual(actor, alcance, dto);
  }

  editarCargoIndividual(alcance: AlcanceAcceso, id: number, dto: EditarCargoIndividualDto) {
    return this.cuotas.editarCargoIndividual(alcance, id, dto);
  }

  anularCargo(alcance: AlcanceAcceso, id: number) {
    return this.cuotas.anularCargo(alcance, id);
  }

  reactivarCargo(alcance: AlcanceAcceso, id: number) {
    return this.cuotas.reactivarCargo(alcance, id);
  }

  eliminarCargo(alcance: AlcanceAcceso, id: number) {
    return this.cuotas.eliminarCargo(alcance, id);
  }

  listarCargos(alcance: AlcanceAcceso, q: ListarCargosQueryDto) {
    return this.cuotas.listarCargos(alcance, q);
  }

  obtenerEstadoCuenta(alcance: AlcanceAcceso, usuarioId: number) {
    return this.cuotas.obtenerEstadoCuenta(alcance, usuarioId);
  }

  registrarPago(actor: AuthUser, alcance: AlcanceAcceso, dto: RegistrarPagoDto) {
    return this.cuotas.registrarPago(actor, alcance, dto);
  }

  editarPago(alcance: AlcanceAcceso, id: number, dto: EditarPagoDto) {
    return this.cuotas.editarPago(alcance, id, dto);
  }

  revertirPago(alcance: AlcanceAcceso, id: number) {
    return this.cuotas.revertirPago(alcance, id);
  }

  aplicarSaldoAFavor(actor: AuthUser, alcance: AlcanceAcceso, dto: AplicarSaldoAFavorDto) {
    return this.cuotas.aplicarSaldoAFavor(actor, alcance, dto);
  }

  ajustarSaldoAFavor(actor: AuthUser, alcance: AlcanceAcceso, dto: AjustarSaldoAFavorDto) {
    return this.cuotas.ajustarSaldoAFavor(actor, alcance, dto);
  }

  listarPagos(alcance: AlcanceAcceso, usuarioId?: number) {
    return this.cuotas.listarPagos(alcance, usuarioId);
  }

  // ---------------- Cuentas, Libro Diario, Rubros, Gastos, Ingresos y Balance ----------------

  listarCuentasFinancieras(alcance: AlcanceAcceso, incluirInactivas?: boolean) {
    return this.caja.listarCuentasFinancieras(alcance, incluirInactivas);
  }

  crearCuentaFinanciera(actor: AuthUser, alcance: AlcanceAcceso, dto: CrearCuentaFinancieraDto) {
    return this.caja.crearCuentaFinanciera(actor, alcance, dto);
  }

  actualizarCuentaFinanciera(
    actor: AuthUser,
    alcance: AlcanceAcceso,
    id: number,
    dto: ActualizarCuentaFinancieraDto,
  ) {
    return this.caja.actualizarCuentaFinanciera(actor, alcance, id, dto);
  }

  eliminarCuentaFinanciera(actor: AuthUser, alcance: AlcanceAcceso, id: number) {
    return this.caja.eliminarCuentaFinanciera(actor, alcance, id);
  }

  restaurarCuentaFinanciera(actor: AuthUser, alcance: AlcanceAcceso, id: number) {
    return this.caja.restaurarCuentaFinanciera(actor, alcance, id);
  }

  obtenerLibroDiario(alcance: AlcanceAcceso, cuentaId: number, query: ConsultaLibroDiarioQueryDto) {
    return this.caja.obtenerLibroDiario(alcance, cuentaId, query);
  }

  transferirEntreCuentas(actor: AuthUser, alcance: AlcanceAcceso, dto: CrearTransferenciaDto) {
    return this.caja.transferirEntreCuentas(actor, alcance, dto);
  }

  listarRubrosContables(alcance: AlcanceAcceso, query: ListarRubrosQueryDto) {
    return this.caja.listarRubrosContables(alcance, query);
  }

  crearRubroContable(alcance: AlcanceAcceso, dto: CrearRubroContableDto) {
    return this.caja.crearRubroContable(alcance, dto);
  }

  actualizarRubroContable(alcance: AlcanceAcceso, id: number, dto: ActualizarRubroContableDto) {
    return this.caja.actualizarRubroContable(alcance, id, dto);
  }

  eliminarRubroContable(alcance: AlcanceAcceso, id: number) {
    return this.caja.eliminarRubroContable(alcance, id);
  }

  restaurarRubroContable(alcance: AlcanceAcceso, id: number) {
    return this.caja.restaurarRubroContable(alcance, id);
  }

  listarGastos(alcance: AlcanceAcceso, query: ListarGastosQueryDto) {
    return this.caja.listarGastos(alcance, query);
  }

  registrarGasto(actor: AuthUser, alcance: AlcanceAcceso, dto: RegistrarGastoDto) {
    return this.caja.registrarGasto(actor, alcance, dto);
  }

  actualizarGasto(actor: AuthUser, alcance: AlcanceAcceso, id: number, dto: ActualizarGastoDto) {
    return this.caja.actualizarGasto(actor, alcance, id, dto);
  }

  anularGasto(actor: AuthUser, alcance: AlcanceAcceso, id: number) {
    return this.caja.anularGasto(actor, alcance, id);
  }

  restaurarGasto(actor: AuthUser, alcance: AlcanceAcceso, id: number) {
    return this.caja.restaurarGasto(actor, alcance, id);
  }

  registrarIngreso(actor: AuthUser, alcance: AlcanceAcceso, dto: RegistrarIngresoDto) {
    return this.caja.registrarIngreso(actor, alcance, dto);
  }

  actualizarIngreso(actor: AuthUser, alcance: AlcanceAcceso, id: number, dto: ActualizarIngresoDto) {
    return this.caja.actualizarIngreso(actor, alcance, id, dto);
  }

  eliminarIngreso(actor: AuthUser, alcance: AlcanceAcceso, id: number) {
    return this.caja.eliminarIngreso(actor, alcance, id);
  }

  listarIngresos(alcance: AlcanceAcceso, query: ListarIngresosQueryDto) {
    return this.caja.listarIngresos(alcance, query);
  }

  obtenerCuadroResultados(alcance: AlcanceAcceso, query: ConsultaCuadroResultadosQueryDto) {
    return this.caja.obtenerCuadroResultados(alcance, query);
  }

  // ---------------- Eventos Económicos, Pedidos y Tickets QR ----------------

  listarEventos(alcance: AlcanceAcceso, tipo?: TipoEvento) {
    return this.eventos.listarEventos(alcance, tipo);
  }

  obtenerEventoPorId(alcance: AlcanceAcceso, id: number) {
    return this.eventos.obtenerEventoPorId(alcance, id);
  }

  crearEvento(actor: AuthUser, alcance: AlcanceAcceso, dto: CrearEventoDto) {
    return this.eventos.crearEvento(actor, alcance, dto);
  }

  actualizarEvento(actor: AuthUser, alcance: AlcanceAcceso, id: number, dto: ActualizarEventoDto) {
    return this.eventos.actualizarEvento(actor, alcance, id, dto);
  }

  eliminarEvento(alcance: AlcanceAcceso, id: number) {
    return this.eventos.eliminarEvento(alcance, id);
  }

  crearPedidoEvento(actor: AuthUser, alcance: AlcanceAcceso, dto: CrearPedidoEventoDto) {
    return this.eventos.crearPedidoEvento(actor, alcance, dto);
  }

  actualizarPedidoEvento(
    actor: AuthUser,
    alcance: AlcanceAcceso,
    id: number,
    dto: ActualizarPedidoEventoDto,
  ) {
    return this.eventos.actualizarPedidoEvento(actor, alcance, id, dto);
  }

  eliminarPedidoEvento(actor: AuthUser, alcance: AlcanceAcceso, id: number) {
    return this.eventos.eliminarPedidoEvento(actor, alcance, id);
  }

  validarTicketQr(actor: AuthUser, alcance: AlcanceAcceso, dto: ValidarTicketQrDto) {
    return this.eventos.validarTicketQr(actor, alcance, dto);
  }

  acreditarGananciasEvento(actor: AuthUser, alcance: AlcanceAcceso, dto: AcreditarGananciasEventoDto) {
    return this.eventos.acreditarGananciasEvento(actor, alcance, dto);
  }

  obtenerMisTickets(actor: AuthUser) {
    return this.eventos.obtenerMisTickets(actor);
  }

  obtenerMisPedidos(actor: AuthUser) {
    return this.eventos.obtenerMisPedidos(actor);
  }
}
