import { Module, forwardRef } from '@nestjs/common';
import { PasesController } from './pases.controller.js';
import { PasesService } from './pases.service.js';
import { TesoreriaModule } from '../tesoreria/tesoreria.module.js';

@Module({
  imports: [forwardRef(() => TesoreriaModule)],
  controllers: [PasesController],
  providers: [PasesService],
  exports: [PasesService],
})
export class PasesModule {}
