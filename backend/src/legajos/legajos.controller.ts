import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseBoolPipe,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  Alcance,
  CurrentUser,
  Public,
  RequirePermission,
} from '../common/decorators/auth.decorators.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import type { AlcanceAcceso, AuthUser } from '../common/types/auth.types.js';
import {
  CrearPlantillaSchema,
  EditarPlantillaSchema,
  GuardarEntregaSchema,
  ListarEntregasQuerySchema,
  type CrearPlantillaDto,
  type EditarPlantillaDto,
  type GuardarEntregaDto,
  type ListarEntregasQueryDto,
} from './legajos.dto.js';
import { LegajosService } from './legajos.service.js';

const VER = 'legajos.ver';
const COMPLETAR = 'legajos.completar';
const VALIDAR_FISICO = 'legajos.validar_fisico';
const PLANTILLAS_GESTIONAR = 'legajos.plantillas_gestionar';

@Controller('legajos')
export class LegajosController {
  constructor(private readonly legajos: LegajosService) {}

  // ---------------- Plantillas ----------------
  @RequirePermission(VER)
  @Get('plantillas')
  listarPlantillas(
    @Query('incluirInactivas', new ParseBoolPipe({ optional: true })) inc?: boolean,
    @Query('cicloAnio', new ParseIntPipe({ optional: true })) cicloAnio?: number,
  ) {
    return this.legajos.listarPlantillas(inc ?? false, cicloAnio);
  }

  @RequirePermission(VER)
  @Get('plantillas/:id')
  obtenerPlantilla(@Param('id', ParseIntPipe) id: number) {
    return this.legajos.obtenerPlantilla(id);
  }

  @RequirePermission(PLANTILLAS_GESTIONAR)
  @Post('plantillas')
  crearPlantilla(
    @Alcance() a: AlcanceAcceso,
    @Body(new ZodValidationPipe(CrearPlantillaSchema)) dto: CrearPlantillaDto,
  ) {
    return this.legajos.crearPlantilla(a, dto);
  }

  @RequirePermission(PLANTILLAS_GESTIONAR)
  @Patch('plantillas/:id')
  editarPlantilla(
    @Alcance() a: AlcanceAcceso,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(EditarPlantillaSchema)) dto: EditarPlantillaDto,
  ) {
    return this.legajos.editarPlantilla(a, id, dto);
  }

  // ---------------- Precarga y Guardado ----------------
  @RequirePermission(COMPLETAR)
  @Get('miembro/:usuarioId/plantilla/:plantillaId/precarga')
  obtenerPrecarga(
    @Alcance() a: AlcanceAcceso,
    @Param('usuarioId', ParseIntPipe) usuarioId: number,
    @Param('plantillaId', ParseIntPipe) plantillaId: number,
    @Query('cicloAnio', ParseIntPipe) cicloAnio: number,
  ) {
    return this.legajos.obtenerDatosPrecarga(a, usuarioId, plantillaId, cicloAnio);
  }

  @RequirePermission(COMPLETAR)
  @Post('entregas')
  guardarEntrega(
    @CurrentUser() u: AuthUser,
    @Alcance() a: AlcanceAcceso,
    @Body(new ZodValidationPipe(GuardarEntregaSchema)) dto: GuardarEntregaDto,
  ) {
    return this.legajos.guardarEntrega(u, a, dto);
  }

  @RequirePermission(VER)
  @Get('entregas')
  listarEntregas(
    @Alcance() a: AlcanceAcceso,
    @Query(new ZodValidationPipe(ListarEntregasQuerySchema)) q: ListarEntregasQueryDto,
  ) {
    return this.legajos.listarEntregas(a, q);
  }

  @RequirePermission(VER)
  @Get('colaboradores-adultos')
  listarColaboradoresAdultos(
    @Alcance() a: AlcanceAcceso,
    @Query('cicloAnio', new ParseIntPipe({ optional: true })) cicloAnio?: number,
  ) {
    return this.legajos.listarColaboradoresAdultos(a, cicloAnio ?? 2026);
  }

  // ---------------- Verificación / Validación QR ----------------
  /**
   * Endpoint de lectura del QR escaneado por el educador o verificado en público
   */
  @Public()
  @Get('qr/verificar/:hash')
  verificarQr(@Param('hash') hash: string) {
    return this.legajos.verificarQr(hash);
  }

  /**
   * El educador valida físicamente la firma tras escanear el QR
   */
  @RequirePermission(VALIDAR_FISICO)
  @Post('qr/validar/:hash')
  @HttpCode(200)
  validarFisico(
    @CurrentUser() u: AuthUser,
    @Alcance() a: AlcanceAcceso,
    @Param('hash') hash: string,
  ) {
    return this.legajos.validarFisico(u, a, hash);
  }
}
