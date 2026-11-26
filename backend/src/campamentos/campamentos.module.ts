import { Module } from '@nestjs/common';
import { AvisosModule } from '../avisos/avisos.module.js';
import { CampamentosController } from './campamentos.controller.js';
import { CampamentosService } from './campamentos.service.js';

@Module({
  imports: [AvisosModule],
  controllers: [CampamentosController],
  providers: [CampamentosService],
  exports: [CampamentosService],
})
export class CampamentosModule {}
