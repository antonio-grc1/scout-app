import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  Alcance,
  CurrentUser,
  PermitirAutogestionPropia,
  RequirePermission,
} from '../common/decorators/auth.decorators.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import type { AlcanceAcceso, AuthUser } from '../common/types/auth.types.js';
import {
  BandejaQuerySchema,
  CrearAvisoSchema,
  DesuscripcionPushSchema,
  EnviadosQuerySchema,
  SuscripcionPushSchema,
  type BandejaQueryDto,
  type CrearAvisoDto,
  type DesuscripcionPushDto,
  type EnviadosQueryDto,
  type SuscripcionPushDto,
} from './avisos.dto.js';
import { AvisosService } from './avisos.service.js';

@Controller('avisos')
export class AvisosController {
  constructor(private readonly avisos: AvisosService) {}

  @RequirePermission('avisos.ver')
  @PermitirAutogestionPropia()
  @Get('canales-estado')
  obtenerEstadoCanales(@CurrentUser() u: AuthUser) {
    return this.avisos.obtenerEstadoCanales(u.sub);
  }

  @RequirePermission('avisos.ver')
  @PermitirAutogestionPropia()
  @Post('push/suscribir')
  suscribirPush(
    @CurrentUser() u: AuthUser,
    @Body(new ZodValidationPipe(SuscripcionPushSchema)) dto: SuscripcionPushDto,
    @Headers('user-agent') ua?: string,
  ) {
    return this.avisos.suscribirPush(u.sub, dto, ua);
  }

  @RequirePermission('avisos.ver')
  @PermitirAutogestionPropia()
  @Post('push/desuscribir')
  desuscribirPush(
    @CurrentUser() u: AuthUser,
    @Body(new ZodValidationPipe(DesuscripcionPushSchema)) dto: DesuscripcionPushDto,
  ) {
    return this.avisos.desuscribirPush(u.sub, dto.endpoint);
  }

  @RequirePermission('avisos.ver')
  @PermitirAutogestionPropia()
  @Get('bandeja')
  listarBandeja(
    @CurrentUser() u: AuthUser,
    @Query(new ZodValidationPipe(BandejaQuerySchema)) q: BandejaQueryDto,
  ) {
    return this.avisos.listarBandeja(u.sub, q);
  }

  @RequirePermission('avisos.ver')
  @PermitirAutogestionPropia()
  @Get('no-leidos/count')
  contarNoLeidos(@CurrentUser() u: AuthUser) {
    return this.avisos.contarNoLeidos(u.sub);
  }

  @RequirePermission('avisos.ver')
  @PermitirAutogestionPropia()
  @Post('leer-todos')
  marcarTodosLeidos(@CurrentUser() u: AuthUser) {
    return this.avisos.marcarTodosLeidos(u.sub);
  }

  @RequirePermission('avisos.ver')
  @Get('enviados')
  listarEnviados(
    @CurrentUser() u: AuthUser,
    @Alcance() a: AlcanceAcceso,
    @Query(new ZodValidationPipe(EnviadosQuerySchema)) q: EnviadosQueryDto,
  ) {
    return this.avisos.listarEnviados(a, u.sub, q);
  }

  @RequirePermission('avisos.ver')
  @PermitirAutogestionPropia()
  @Patch(':id/leer')
  marcarLeido(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.avisos.marcarLeido(u.sub, id);
  }

  @RequirePermission('avisos.ver')
  @Get(':id/lecturas')
  obtenerLecturas(
    @CurrentUser() u: AuthUser,
    @Alcance() a: AlcanceAcceso,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.avisos.obtenerLecturas(a, u.sub, id);
  }

  @RequirePermission('avisos.editar')
  @Post()
  crear(
    @CurrentUser() u: AuthUser,
    @Alcance() a: AlcanceAcceso,
    @Body(new ZodValidationPipe(CrearAvisoSchema)) dto: CrearAvisoDto,
  ) {
    return this.avisos.crear(a, u, dto);
  }

  @RequirePermission('avisos.editar')
  @Delete(':id')
  eliminar(
    @CurrentUser() u: AuthUser,
    @Alcance() a: AlcanceAcceso,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.avisos.eliminar(a, u.sub, id);
  }
}
