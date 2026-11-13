import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Res, UseGuards } from '@nestjs/common';
import type { CookieOptions, Response } from 'express';
import {
  Alcance,
  CurrentUser,
  PermitirClavePendiente,
  Public,
  RequirePermission,
} from '../common/decorators/auth.decorators.js';
import { AUTH_COOKIE_NAME } from '../common/guards/jwt-auth.guard.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import type { AlcanceAcceso, AuthUser } from '../common/types/auth.types.js';
import {
  CambiarClaveSchema,
  LoginSchema,
  RecuperarClaveSchema,
  ResetearClaveSchema,
  type CambiarClaveDto,
  type LoginDto,
  type RecuperarClaveDto,
  type ResetearClaveDto,
} from './auth.dto.js';
import { AuthService } from './auth.service.js';
import { LoginRateLimitGuard } from './login-rate-limit.guard.js';

const AUTH_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

function setAuthCookie(res: Response | undefined, token: string): void {
  if (token && typeof res?.cookie === 'function') {
    res.cookie(AUTH_COOKIE_NAME, token, AUTH_COOKIE_OPTIONS);
  }
}

function clearAuthCookie(res: Response | undefined): void {
  if (typeof res?.clearCookie === 'function') {
    res.clearCookie(AUTH_COOKIE_NAME, {
      httpOnly: AUTH_COOKIE_OPTIONS.httpOnly,
      sameSite: AUTH_COOKIE_OPTIONS.sameSite,
      secure: AUTH_COOKIE_OPTIONS.secure,
      path: AUTH_COOKIE_OPTIONS.path,
    });
  }
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @UseGuards(LoginRateLimitGuard)
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodValidationPipe(LoginSchema)) dto: LoginDto,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const sesion = await this.auth.login(dto);
    setAuthCookie(res, sesion.accessToken);
    return sesion;
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  logout(@Res({ passthrough: true }) res?: Response) {
    clearAuthCookie(res);
    return { ok: true };
  }

  @PermitirClavePendiente()
  @Post('cambiar-clave')
  @HttpCode(200)
  async cambiarClave(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(CambiarClaveSchema)) dto: CambiarClaveDto,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const sesion = await this.auth.cambiarClave(user, dto);
    setAuthCookie(res, sesion.accessToken);
    return sesion;
  }

  @PermitirClavePendiente()
  @Post('cambiar-password')
  @HttpCode(200)
  async cambiarPassword(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(CambiarClaveSchema)) dto: CambiarClaveDto,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const sesion = await this.auth.cambiarClave(user, dto);
    setAuthCookie(res, sesion.accessToken);
    return sesion;
  }

  @PermitirClavePendiente()
  @Get('me')
  async me(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const sesion = await this.auth.perfil(user);
    setAuthCookie(res, sesion.accessToken);
    return sesion;
  }

  @PermitirClavePendiente()
  @Get('perfil')
  async perfil(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const sesion = await this.auth.perfil(user);
    setAuthCookie(res, sesion.accessToken);
    return sesion;
  }

  @Public()
  @UseGuards(LoginRateLimitGuard)
  @Post('recuperar-clave')
  @HttpCode(200)
  recuperarClave(@Body(new ZodValidationPipe(RecuperarClaveSchema)) dto: RecuperarClaveDto) {
    return this.auth.recuperarClave(dto);
  }

  @RequirePermission('auth.resetear_clave')
  @Post('usuarios/:id/resetear-clave')
  @HttpCode(200)
  resetearClave(
    @CurrentUser() user: AuthUser,
    @Alcance() alcance: AlcanceAcceso,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(ResetearClaveSchema)) dto?: ResetearClaveDto,
  ) {
    return this.auth.resetearClave(user, alcance, id, dto);
  }
}
