import { Module } from '@nestjs/common';
import { TesoreriaModule } from '../tesoreria/tesoreria.module.js';
import { MiembrosController } from './miembros.controller.js';
import { MiembrosService } from './miembros.service.js';

@Module({
  imports: [TesoreriaModule],
  controllers: [MiembrosController],
  providers: [MiembrosService],
  exports: [MiembrosService],
})
export class MiembrosModule {}

