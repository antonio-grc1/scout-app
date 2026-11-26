import { Module } from '@nestjs/common';
import { AvisosController } from './avisos.controller.js';
import { AvisosService } from './avisos.service.js';
import { WebPushService } from './web-push.service.js';

@Module({
  controllers: [AvisosController],
  providers: [AvisosService, WebPushService],
  exports: [AvisosService, WebPushService],
})
export class AvisosModule {}
