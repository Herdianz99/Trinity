import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service';

// Global: cualquier módulo puede inyectar MailService sin re-importar (correo es infra compartida).
@Global()
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
