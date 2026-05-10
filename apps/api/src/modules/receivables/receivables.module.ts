import { Module } from '@nestjs/common';
import { ReceivablesController } from './receivables.controller';
import { ReceivablesService } from './receivables.service';
import { ReceivablesCronService } from './receivables-cron.service';

@Module({
  controllers: [ReceivablesController],
  providers: [ReceivablesService, ReceivablesCronService],
  exports: [ReceivablesService],
})
export class ReceivablesModule {}
