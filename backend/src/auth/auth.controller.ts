import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post } from '@nestjs/common';
import {
  Alcance,
  CurrentUser,
  PermitirClavePendiente,
  Public,
  RequirePermission,
} from '../common/decorators/auth.decorators.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import type { AlcanceAcceso, AuthUser } from '../common/types/auth.types.js';
import { CambiarClaveSchema, LoginSchema, type CambiarClaveDto, type LoginDto } from './auth.dto.js';
import { AuthService } from './auth.service.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body(new ZodValidationPipe(LoginSchema)) dto: LoginDto) {
    return this.auth.login(dto);
  }

  @PermitirClavePendiente()
  @Post('cambiar-clave')
  @HttpCode(200)
  cambiarClave(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(CambiarClaveSchema)) dto: CambiarClaveDto) {
    return this.auth.cambiarClave(user, dto);
  }

  @PermitirClavePendiente()
  @Post('cambiar-password')
  @HttpCode(200)
  cambiarPassword(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(CambiarClaveSchema)) dto: CambiarClaveDto) {
    return this.auth.cambiarClave(user, dto);
  }

  @PermitirClavePendiente()
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.perfil(user);
  }

  @RequirePermission('auth.resetear_clave')
  @Post('usuarios/:id/resetear-clave')
  @HttpCode(200)
  resetearClave(
    @CurrentUser() user: AuthUser,
    @Alcance() alcance: AlcanceAcceso,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.auth.resetearClave(user, alcance, id);
  }
}
