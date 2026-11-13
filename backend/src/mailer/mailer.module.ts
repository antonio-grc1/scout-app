import { Global, Module } from '@nestjs/common';
import { MailerController } from './mailer.controller.js';
import { MailerService } from './mailer.service.js';

@Global()
@Module({
  controllers: [MailerController],
  providers: [MailerService],
  exports: [MailerService],
})
export class MailerModule {}
