import { Module } from '@nestjs/common';
import { OrganizacionController } from './organizacion.controller.js';
import { OrganizacionService } from './organizacion.service.js';

@Module({
  controllers: [OrganizacionController],
  providers: [OrganizacionService],
  exports: [OrganizacionService],
})
export class OrganizacionModule {}
