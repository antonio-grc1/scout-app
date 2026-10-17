import { Module } from '@nestjs/common';
import { LegajosController } from './legajos.controller.js';
import { LegajosService } from './legajos.service.js';

@Module({
  controllers: [LegajosController],
  providers: [LegajosService],
  exports: [LegajosService],
})
export class LegajosModule {}
