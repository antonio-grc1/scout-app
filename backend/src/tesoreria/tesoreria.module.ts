import { Module } from '@nestjs/common';
import { TesoreriaController } from './tesoreria.controller.js';
import { TesoreriaService } from './tesoreria.service.js';

@Module({
  controllers: [TesoreriaController],
  providers: [TesoreriaService],
  exports: [TesoreriaService],
})
export class TesoreriaModule {}
