import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { Alcance, RequirePermission } from '../common/decorators/auth.decorators.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import type { AlcanceAcceso } from '../common/types/auth.types.js';
import {
  CandidatosQuerySchema,
  PaseSchema,
  PasesLoteSchema,
  type CandidatosQueryDto,
  type PaseDto,
  type PasesLoteDto,
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

  @RequirePermission('pases.ejecutar')
  @Post()
  ejecutar(@Alcance() a: AlcanceAcceso, @Body(new ZodValidationPipe(PaseSchema)) dto: PaseDto) {
    return this.pases.ejecutar(a, dto);
  }

  @RequirePermission('pases.ejecutar')
  @Post('lote')
  ejecutarLote(@Alcance() a: AlcanceAcceso, @Body(new ZodValidationPipe(PasesLoteSchema)) dto: PasesLoteDto) {
    return this.pases.ejecutarLote(a, dto);
  }
}
