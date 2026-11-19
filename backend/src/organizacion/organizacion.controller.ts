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
import { Alcance, CurrentUser, RequireAnyPermission, RequirePermission } from '../common/decorators/auth.decorators.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import type { AlcanceAcceso, AuthUser } from '../common/types/auth.types.js';
import {
  CrearRamaSchema,
  CrearRolSchema,
  CrearUnidadSchema,
  EditarRamaSchema,
  EditarRolSchema,
  EditarUnidadSchema,
  type CrearRamaDto,
  type CrearRolDto,
  type CrearUnidadDto,
  type EditarRamaDto,
  type EditarRolDto,
  type EditarUnidadDto,
} from './organizacion.dto.js';
import { OrganizacionService } from './organizacion.service.js';

const VER = 'organizacion.ver';
const GESTIONAR = 'organizacion.editar';
const GESTIONAR_ROLES = 'roles.editar';
const VER_ROLES = ['organizacion.ver', 'roles.ver', 'roles.editar', 'organizacion.editar'] as const;
const incluirInactivas = new ParseBoolPipe({ optional: true });

@Controller('organizacion')
export class OrganizacionController {
  constructor(private readonly org: OrganizacionService) {}

  // ---------------- Ramas ----------------
  @RequirePermission(VER)
  @Get('ramas')
  listarRamas(
    @Alcance() a: AlcanceAcceso,
    @Query('incluirInactivas', incluirInactivas) inc?: boolean,
  ) {
    return this.org.listarRamas(a, inc ?? false);
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
  eliminarRama(
    @Alcance() a: AlcanceAcceso,
    @Param('id', ParseIntPipe) id: number,
    @Query('definitivo', new ParseBoolPipe({ optional: true })) definitivo?: boolean,
  ) {
    return this.org.eliminarRama(a, id, definitivo ?? false);
  }

  // ---------------- Unidades ----------------
  @RequirePermission(VER)
  @Get('unidades')
  listarUnidades(
    @Alcance() a: AlcanceAcceso,
    @Query('incluirInactivas', incluirInactivas) inc?: boolean,
  ) {
    return this.org.listarUnidades(a, inc ?? false);
  }

  @RequirePermission(VER)
  @Get('unidades/:id/historial')
  obtenerHistorialUnidad(
    @Alcance() a: AlcanceAcceso,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.org.obtenerHistorialUnidad(a, id);
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
  eliminarUnidad(
    @Alcance() a: AlcanceAcceso,
    @Param('id', ParseIntPipe) id: number,
    @Query('definitivo', new ParseBoolPipe({ optional: true })) definitivo?: boolean,
  ) {
    return this.org.eliminarUnidad(a, id, definitivo ?? false);
  }

  // ---------------- Roles ----------------
  @RequireAnyPermission(...VER_ROLES)
  @Get('roles')
  listarRoles(
    @Alcance() a: AlcanceAcceso,
    @Query('incluirInactivos', incluirInactivas) inc?: boolean,
  ) {
    return this.org.listarRoles(a, inc ?? false);
  }

  @RequirePermission(GESTIONAR_ROLES)
  @Post('roles')
  crearRol(
    @CurrentUser() actor: AuthUser,
    @Alcance() a: AlcanceAcceso,
    @Body(new ZodValidationPipe(CrearRolSchema)) dto: CrearRolDto,
  ) {
    return this.org.crearRol(actor, a, dto);
  }

  @RequirePermission(GESTIONAR_ROLES)
  @Patch('roles/:id')
  editarRol(
    @CurrentUser() actor: AuthUser,
    @Alcance() a: AlcanceAcceso,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(EditarRolSchema)) dto: EditarRolDto,
  ) {
    return this.org.editarRol(actor, a, id, dto);
  }

  @RequirePermission(GESTIONAR_ROLES)
  @Delete('roles/:id')
  eliminarRol(@CurrentUser() actor: AuthUser, @Alcance() a: AlcanceAcceso, @Param('id', ParseIntPipe) id: number) {
    return this.org.eliminarRol(actor, a, id);
  }

  // ---------------- Permisos ----------------
  @RequireAnyPermission(...VER_ROLES)
  @Get('permisos')
  listarPermisos() {
    return this.org.listarPermisos();
  }
}
