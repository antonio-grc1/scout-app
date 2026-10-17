import { Module } from '@nestjs/common';
import { MiembrosController } from './miembros.controller.js';
import { MiembrosService } from './miembros.service.js';

@Module({
  controllers: [MiembrosController],
  providers: [MiembrosService],
  exports: [MiembrosService],
})
export class MiembrosModule {}
