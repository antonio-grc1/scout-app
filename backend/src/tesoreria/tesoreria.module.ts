import { Module } from '@nestjs/common';
import { TesoreriaController } from './tesoreria.controller.js';
import { TesoreriaCajaService } from './tesoreria-caja.service.js';
import { TesoreriaCuotasService } from './tesoreria-cuotas.service.js';
import { TesoreriaEventosService } from './tesoreria-eventos.service.js';
import { TesoreriaService } from './tesoreria.service.js';

@Module({
  controllers: [TesoreriaController],
  providers: [
    TesoreriaCuotasService,
    TesoreriaCajaService,
    TesoreriaEventosService,
    TesoreriaService,
  ],
  exports: [
    TesoreriaService,
    TesoreriaCuotasService,
    TesoreriaCajaService,
    TesoreriaEventosService,
  ],
})
export class TesoreriaModule {}
