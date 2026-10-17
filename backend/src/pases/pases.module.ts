import { Module } from '@nestjs/common';
import { PasesController } from './pases.controller.js';
import { PasesService } from './pases.service.js';

@Module({
  controllers: [PasesController],
  providers: [PasesService],
})
export class PasesModule {}
