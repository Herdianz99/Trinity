import { Module } from '@nestjs/common';
import { PayablesController } from './payables.controller';
import { PayablesService } from './payables.service';
import { PayablesCronService } from './payables-cron.service';
import { PayablesPdfService } from './payables-pdf.service';

@Module({
  controllers: [PayablesController],
  providers: [PayablesService, PayablesCronService, PayablesPdfService],
  exports: [PayablesService],
})
export class PayablesModule {}
