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
import {
  Alcance,
  CurrentUser,
  PermitirAutogestionPropia,
  RequirePermission,
} from '../common/decorators/auth.decorators.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import type { AlcanceAcceso, AuthUser } from '../common/types/auth.types.js';
import {
  CrearCampamentoSchema,
  EditarCampamentoSchema,
  GestionarInscripcionSchema,
  ListarCampamentosQuerySchema,
  ResponderCampamentoSchema,
  type CrearCampamentoDto,
  type EditarCampamentoDto,
  type GestionarInscripcionDto,
  type ListarCampamentosQueryDto,
  type ResponderCampamentoDto,
} from './campamentos.dto.js';
import { CampamentosService } from './campamentos.service.js';

@Controller('campamentos')
export class CampamentosController {
  constructor(private readonly campamentos: CampamentosService) {}

  @RequirePermission('campamentos.ver')
  @PermitirAutogestionPropia()
  @Get('mios')
  listarMios(@CurrentUser() u: AuthUser) {
    return this.campamentos.listarMios(u.sub);
  }

  @RequirePermission('campamentos.ver')
  @Get()
  listarGestion(
    @CurrentUser() u: AuthUser,
    @Alcance() a: AlcanceAcceso,
    @Query(new ZodValidationPipe(ListarCampamentosQuerySchema)) q: ListarCampamentosQueryDto,
  ) {
    return this.campamentos.listarGestion(a, u.sub, q);
  }

  @RequirePermission('campamentos.editar')
  @Post()
  crear(
    @CurrentUser() u: AuthUser,
    @Alcance() a: AlcanceAcceso,
    @Body(new ZodValidationPipe(CrearCampamentoSchema)) dto: CrearCampamentoDto,
  ) {
    return this.campamentos.crear(a, u, dto);
  }

  @RequirePermission('campamentos.ver')
  @Get(':id')
  obtenerDetalle(
    @CurrentUser() u: AuthUser,
    @Alcance() a: AlcanceAcceso,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.campamentos.obtenerDetalle(a, u.sub, id);
  }

  @RequirePermission('campamentos.ver')
  @PermitirAutogestionPropia()
  @Post(':id/responder')
  responder(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(ResponderCampamentoSchema)) dto: ResponderCampamentoDto,
  ) {
    return this.campamentos.responder(u.sub, id, dto);
  }

  @RequirePermission('campamentos.editar')
  @Patch(':id')
  editar(
    @CurrentUser() u: AuthUser,
    @Alcance() a: AlcanceAcceso,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(EditarCampamentoSchema)) dto: EditarCampamentoDto,
  ) {
    return this.campamentos.editar(a, u, id, dto);
  }

  @RequirePermission('campamentos.editar')
  @Patch(':id/inscripciones/:usuarioId')
  gestionarInscripcion(
    @CurrentUser() u: AuthUser,
    @Alcance() a: AlcanceAcceso,
    @Param('id', ParseIntPipe) id: number,
    @Param('usuarioId', ParseIntPipe) usuarioId: number,
    @Body(new ZodValidationPipe(GestionarInscripcionSchema)) dto: GestionarInscripcionDto,
  ) {
    return this.campamentos.gestionarInscripcion(a, u, id, usuarioId, dto);
  }

  @RequirePermission('campamentos.editar')
  @Delete(':id')
  eliminar(
    @CurrentUser() u: AuthUser,
    @Alcance() a: AlcanceAcceso,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.campamentos.eliminar(a, u.sub, id);
  }
}
