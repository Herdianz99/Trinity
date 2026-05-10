import { Module } from '@nestjs/common';
import { PayablesController } from './payables.controller';
import { PayablesService } from './payables.service';
import { PayablesCronService } from './payables-cron.service';

@Module({
  controllers: [PayablesController],
  providers: [PayablesService, PayablesCronService],
  exports: [PayablesService],
})
export class PayablesModule {}
