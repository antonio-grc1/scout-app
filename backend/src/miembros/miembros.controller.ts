import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { Alcance, CurrentUser, RequirePermission } from '../common/decorators/auth.decorators.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import type { AlcanceAcceso, AuthUser } from '../common/types/auth.types.js';
import {
  CrearAsignacionSchema,
  CrearMiembroSchema,
  EditarMiembroSchema,
  ListarMiembrosSchema,
  type CrearAsignacionDto,
  type CrearMiembroDto,
  type EditarMiembroDto,
  type ListarMiembrosDto,
} from './miembros.dto.js';
import { MiembrosService } from './miembros.service.js';

@Controller('miembros')
export class MiembrosController {
  constructor(private readonly miembros: MiembrosService) {}

  @RequirePermission('miembros.ver')
  @Get()
  listar(@Alcance() a: AlcanceAcceso, @Query(new ZodValidationPipe(ListarMiembrosSchema)) q: ListarMiembrosDto) {
    return this.miembros.listar(a, q);
  }

  /** Autocompletado de datos familiares a partir del DNI de un hermano. */
  @RequirePermission('miembros.crear')
  @Get('hermano/:dni')
  buscarHermano(@Param('dni') dni: string) {
    return this.miembros.buscarHermano(dni.trim());
  }

  @RequirePermission('miembros.ver')
  @Get(':id')
  obtener(@Alcance() a: AlcanceAcceso, @Param('id', ParseIntPipe) id: number) {
    return this.miembros.obtener(a, id);
  }

  @RequirePermission('miembros.crear')
  @Post()
  crear(@Alcance() a: AlcanceAcceso, @Body(new ZodValidationPipe(CrearMiembroSchema)) dto: CrearMiembroDto) {
    return this.miembros.crear(a, dto);
  }

  @RequirePermission('miembros.editar')
  @Patch(':id')
  editar(
    @CurrentUser() u: AuthUser,
    @Alcance() a: AlcanceAcceso,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(EditarMiembroSchema)) dto: EditarMiembroDto,
  ) {
    return this.miembros.editar(u, a, id, dto);
  }

  @RequirePermission('miembros.editar')
  @Post(':id/asignaciones')
  agregarAsignacion(
    @Alcance() a: AlcanceAcceso,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(CrearAsignacionSchema)) dto: CrearAsignacionDto,
  ) {
    return this.miembros.agregarAsignacion(a, id, dto);
  }

  /** Cierra la asignación (activo=false, fechaFin=hoy). Nunca borra el registro. */
  @RequirePermission('miembros.editar')
  @Delete(':id/asignaciones/:asignacionId')
  cerrarAsignacion(
    @CurrentUser() u: AuthUser,
    @Alcance() a: AlcanceAcceso,
    @Param('id', ParseIntPipe) id: number,
    @Param('asignacionId', ParseIntPipe) asignacionId: number,
  ) {
    return this.miembros.cerrarAsignacion(u, a, id, asignacionId);
  }
}
