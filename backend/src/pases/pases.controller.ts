import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { Alcance, CurrentUser, RequirePermission } from '../common/decorators/auth.decorators.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import type { AlcanceAcceso, AuthUser } from '../common/types/auth.types.js';
import {
  AprobarSolicitudPaseSchema,
  CandidatosQuerySchema,
  PaseSchema,
  PasesLoteSchema,
  RechazarSolicitudPaseSchema,
  type AprobarSolicitudPaseDto,
  type CandidatosQueryDto,
  type PaseDto,
  type PasesLoteDto,
  type RechazarSolicitudPaseDto,
} from './pases.dto.js';
import { PasesService } from './pases.service.js';

@Controller('pases')
export class PasesController {
  constructor(private readonly pases: PasesService) {}

  @RequirePermission('pases.ver')
  @Get('candidatos')
  candidatos(@Alcance() a: AlcanceAcceso, @Query(new ZodValidationPipe(CandidatosQuerySchema)) q: CandidatosQueryDto) {
    return this.pases.candidatos(a, q);
  }

  @RequirePermission('pases.ver')
  @Get('solicitudes')
  listarSolicitudes(@Alcance() a: AlcanceAcceso) {
    return this.pases.listarSolicitudes(a);
  }

  @RequirePermission('pases.ejecutar')
  @Post()
  ejecutar(
    @CurrentUser() u: AuthUser,
    @Alcance() a: AlcanceAcceso,
    @Body(new ZodValidationPipe(PaseSchema)) dto: PaseDto,
  ) {
    return this.pases.ejecutar(a, dto, u.sub);
  }

  @RequirePermission('pases.ejecutar')
  @Post('lote')
  ejecutarLote(
    @CurrentUser() u: AuthUser,
    @Alcance() a: AlcanceAcceso,
    @Body(new ZodValidationPipe(PasesLoteSchema)) dto: PasesLoteDto,
  ) {
    return this.pases.ejecutarLote(a, dto, u.sub);
  }

  @RequirePermission('pases.ejecutar')
  @Post('solicitudes/:id/aprobar')
  aprobarSolicitud(
    @CurrentUser() u: AuthUser,
    @Alcance() a: AlcanceAcceso,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(AprobarSolicitudPaseSchema)) dto: AprobarSolicitudPaseDto,
  ) {
    return this.pases.aprobarSolicitud(a, id, dto, u.sub);
  }

  @RequirePermission('pases.ejecutar')
  @Post('solicitudes/:id/rechazar')
  rechazarSolicitud(
    @CurrentUser() u: AuthUser,
    @Alcance() a: AlcanceAcceso,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(RechazarSolicitudPaseSchema)) dto: RechazarSolicitudPaseDto,
  ) {
    return this.pases.rechazarSolicitud(a, id, dto, u.sub);
  }
}
