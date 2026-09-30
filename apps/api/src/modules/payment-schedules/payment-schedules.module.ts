import { Module } from '@nestjs/common';
import { PaymentSchedulesController } from './payment-schedules.controller';
import { PaymentSchedulesService } from './payment-schedules.service';
import { PaymentSchedulePdfService } from './payment-schedule-pdf.service';
import { PaymentScheduleBankExportService } from './payment-schedule-bank-export.service';

@Module({
  controllers: [PaymentSchedulesController],
  providers: [PaymentSchedulesService, PaymentSchedulePdfService, PaymentScheduleBankExportService],
})
export class PaymentSchedulesModule {}
