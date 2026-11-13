import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { Alcance, CurrentUser, RequireAnyPermission, RequirePermission } from '../common/decorators/auth.decorators.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import type { AlcanceAcceso, AuthUser } from '../common/types/auth.types.js';
import {
  ActualizarMiPerfilSchema,
  CrearAsignacionSchema,
  CrearMiembroSchema,
  EditarMiembroSchema,
  ListarMiembrosSchema,
  type ActualizarMiPerfilDto,
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

  /** Perfil propio del usuario autenticado (cualquier rol). */
  @Get('mi-perfil')
  obtenerMiPerfil(@CurrentUser() u: AuthUser) {
    return this.miembros.obtenerMiPerfil(u.sub);
  }

  /** Actualización de datos de contacto propios del usuario autenticado. */
  @Patch('mi-perfil')
  actualizarMiPerfil(
    @CurrentUser() u: AuthUser,
    @Body(new ZodValidationPipe(ActualizarMiPerfilSchema)) dto: ActualizarMiPerfilDto,
  ) {
    return this.miembros.actualizarMiPerfil(u.sub, dto);
  }

  /** Búsqueda flexible de hermanos por DNI, Apellido o Nombre en todo el padrón activo. */
  @RequireAnyPermission('miembros.editar', 'cuotas.ajustar', 'tesoreria.gestionar')
  @Get('hermanos/buscar')
  buscarHermanosPorCriterio(@Alcance() a: AlcanceAcceso, @Query('q') q?: string) {
    return this.miembros.buscarHermanosPorCriterio(a, q ?? '');
  }

  /** Autocompletado de datos familiares a partir del DNI de un hermano. */
  @RequirePermission('miembros.crear')
  @Get('hermano/:dni')
  buscarHermano(@Alcance() a: AlcanceAcceso, @Param('dni') dni: string) {
    return this.miembros.buscarHermano(a, dni.trim());
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

  @RequirePermission(['miembros.editar', 'miembros.editar_identidad', 'miembros.baja'])
  @Patch(':id')
  editar(
    @CurrentUser() u: AuthUser,
    @Alcance() a: AlcanceAcceso,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(EditarMiembroSchema)) dto: EditarMiembroDto,
  ) {
    return this.miembros.editar(u, a, id, dto);
  }

  /** Elimina definitivamente un miembro dado de baja sin historial asociado (solo alcance GLOBAL). */
  @RequirePermission('miembros.baja')
  @Delete(':id')
  eliminarDefinitivo(
    @CurrentUser() u: AuthUser,
    @Alcance() a: AlcanceAcceso,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.miembros.eliminarDefinitivo(u, a, id);
  }

  @RequireAnyPermission('pases.ejecutar', 'miembros.editar')
  @Post(':id/asignaciones')
  agregarAsignacion(
    @Alcance() a: AlcanceAcceso,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(CrearAsignacionSchema)) dto: CrearAsignacionDto,
  ) {
    return this.miembros.agregarAsignacion(a, id, dto);
  }

  /** Cierra la asignación (activo=false, fechaFin=hoy). Nunca borra el registro. */
  @RequireAnyPermission('pases.ejecutar', 'miembros.editar')
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
