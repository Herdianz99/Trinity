import { Module } from '@nestjs/common';
import { MeService } from './me.service';
import { MeController } from './me.controller';
import { PayrollModule } from '../payroll/payroll.module';
import { InvoicesModule } from '../invoices/invoices.module';

@Module({
  imports: [PayrollModule, InvoicesModule],
  controllers: [MeController],
  providers: [MeService],
  exports: [MeService],
})
export class MeModule {}
