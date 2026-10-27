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
import { Alcance, RequirePermission } from '../common/decorators/auth.decorators.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import type { AlcanceAcceso } from '../common/types/auth.types.js';
import {
  CrearPermisoSchema,
  CrearRamaSchema,
  CrearRolSchema,
  CrearUnidadSchema,
  EditarPermisoSchema,
  EditarRamaSchema,
  EditarRolSchema,
  EditarUnidadSchema,
  type CrearPermisoDto,
  type CrearRamaDto,
  type CrearRolDto,
  type CrearUnidadDto,
  type EditarPermisoDto,
  type EditarRamaDto,
  type EditarRolDto,
  type EditarUnidadDto,
} from './organizacion.dto.js';
import { OrganizacionService } from './organizacion.service.js';

const VER = 'organizacion.ver';
const GESTIONAR = 'organizacion.gestionar';
const incluirInactivas = new ParseBoolPipe({ optional: true });

@Controller('organizacion')
export class OrganizacionController {
  constructor(private readonly org: OrganizacionService) {}

  // ---------------- Ramas ----------------
  @RequirePermission(VER)
  @Get('ramas')
  listarRamas(@Query('incluirInactivas', incluirInactivas) inc?: boolean) {
    return this.org.listarRamas(inc ?? false);
  }

  @RequirePermission(GESTIONAR)
  @Post('ramas')
  crearRama(@Alcance() a: AlcanceAcceso, @Body(new ZodValidationPipe(CrearRamaSchema)) dto: CrearRamaDto) {
    return this.org.crearRama(a, dto);
  }

  @RequirePermission(GESTIONAR)
  @Patch('ramas/:id')
  editarRama(
    @Alcance() a: AlcanceAcceso,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(EditarRamaSchema)) dto: EditarRamaDto,
  ) {
    return this.org.editarRama(a, id, dto);
  }

  @RequirePermission(GESTIONAR)
  @Delete('ramas/:id')
  eliminarRama(@Alcance() a: AlcanceAcceso, @Param('id', ParseIntPipe) id: number) {
    return this.org.eliminarRama(a, id);
  }

  // ---------------- Unidades ----------------
  @RequirePermission(VER)
  @Get('unidades')
  listarUnidades(@Query('incluirInactivas', incluirInactivas) inc?: boolean) {
    return this.org.listarUnidades(inc ?? false);
  }

  @RequirePermission(GESTIONAR)
  @Post('unidades')
  crearUnidad(@Alcance() a: AlcanceAcceso, @Body(new ZodValidationPipe(CrearUnidadSchema)) dto: CrearUnidadDto) {
    return this.org.crearUnidad(a, dto);
  }

  @RequirePermission(GESTIONAR)
  @Patch('unidades/:id')
  editarUnidad(
    @Alcance() a: AlcanceAcceso,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(EditarUnidadSchema)) dto: EditarUnidadDto,
  ) {
    return this.org.editarUnidad(a, id, dto);
  }

  @RequirePermission(GESTIONAR)
  @Delete('unidades/:id')
  eliminarUnidad(@Alcance() a: AlcanceAcceso, @Param('id', ParseIntPipe) id: number) {
    return this.org.eliminarUnidad(a, id);
  }

  // ---------------- Roles ----------------
  @RequirePermission(VER)
  @Get('roles')
  listarRoles() {
    return this.org.listarRoles();
  }

  @RequirePermission(GESTIONAR)
  @Post('roles')
  crearRol(@Alcance() a: AlcanceAcceso, @Body(new ZodValidationPipe(CrearRolSchema)) dto: CrearRolDto) {
    return this.org.crearRol(a, dto);
  }

  @RequirePermission(GESTIONAR)
  @Patch('roles/:id')
  editarRol(
    @Alcance() a: AlcanceAcceso,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(EditarRolSchema)) dto: EditarRolDto,
  ) {
    return this.org.editarRol(a, id, dto);
  }

  @RequirePermission(GESTIONAR)
  @Delete('roles/:id')
  eliminarRol(@Alcance() a: AlcanceAcceso, @Param('id', ParseIntPipe) id: number) {
    return this.org.eliminarRol(a, id);
  }

  // ---------------- Permisos ----------------
  @RequirePermission(VER)
  @Get('permisos')
  listarPermisos() {
    return this.org.listarPermisos();
  }

  @RequirePermission(GESTIONAR)
  @Post('permisos')
  crearPermiso(@Alcance() a: AlcanceAcceso, @Body(new ZodValidationPipe(CrearPermisoSchema)) dto: CrearPermisoDto) {
    return this.org.crearPermiso(a, dto);
  }

  @RequirePermission(GESTIONAR)
  @Patch('permisos/:id')
  editarPermiso(
    @Alcance() a: AlcanceAcceso,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(EditarPermisoSchema)) dto: EditarPermisoDto,
  ) {
    return this.org.editarPermiso(a, id, dto);
  }
}
