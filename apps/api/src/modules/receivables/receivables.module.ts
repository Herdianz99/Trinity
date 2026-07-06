import { Module } from '@nestjs/common';
import { ReceivablesController } from './receivables.controller';
import { ReceivablesService } from './receivables.service';
import { ReceivablesCronService } from './receivables-cron.service';
import { ReceivablesPdfService } from './receivables-pdf.service';

@Module({
  controllers: [ReceivablesController],
  providers: [ReceivablesService, ReceivablesCronService, ReceivablesPdfService],
  exports: [ReceivablesService],
})
export class ReceivablesModule {}
