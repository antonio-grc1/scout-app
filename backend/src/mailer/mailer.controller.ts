import { Body, Controller, ForbiddenException, Get, HttpCode, Post, Put } from '@nestjs/common';
import { Alcance, RequireAnyPermission } from '../common/decorators/auth.decorators.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import type { AlcanceAcceso } from '../common/types/auth.types.js';
import {
  GuardarConfigCorreoSchema,
  ProbarCorreoSchema,
  type GuardarConfigCorreoDto,
  type ProbarCorreoDto,
} from './mailer.dto.js';
import { MailerService } from './mailer.service.js';

@Controller('configuracion/correo')
export class MailerController {
  constructor(private readonly mailer: MailerService) {}

  private assertAlcanceGlobal(alcance: AlcanceAcceso): void {
    if (alcance.tipo !== 'GLOBAL') {
      throw new ForbiddenException('Solo un usuario con alcance global puede gestionar la configuración de correo');
    }
  }

  @RequireAnyPermission('organizacion.editar')
  @Get()
  obtener(@Alcance() alcance: AlcanceAcceso) {
    this.assertAlcanceGlobal(alcance);
    return this.mailer.obtenerConfiguracionPublica();
  }

  @RequireAnyPermission('organizacion.editar')
  @Put()
  guardar(
    @Alcance() alcance: AlcanceAcceso,
    @Body(new ZodValidationPipe(GuardarConfigCorreoSchema)) dto: GuardarConfigCorreoDto,
  ) {
    this.assertAlcanceGlobal(alcance);
    return this.mailer.guardarConfiguracion(dto);
  }

  @RequireAnyPermission('organizacion.editar')
  @Post('probar')
  @HttpCode(200)
  probar(
    @Alcance() alcance: AlcanceAcceso,
    @Body(new ZodValidationPipe(ProbarCorreoSchema)) dto: ProbarCorreoDto,
  ) {
    this.assertAlcanceGlobal(alcance);
    return this.mailer.enviarCorreoPrueba(dto.destinatario);
  }
}
