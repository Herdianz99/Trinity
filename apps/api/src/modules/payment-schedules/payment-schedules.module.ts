import { Module } from '@nestjs/common';
import { PaymentSchedulesController } from './payment-schedules.controller';
import { PaymentSchedulesService } from './payment-schedules.service';
import { PaymentSchedulePdfService } from './payment-schedule-pdf.service';

@Module({
  controllers: [PaymentSchedulesController],
  providers: [PaymentSchedulesService, PaymentSchedulePdfService],
})
export class PaymentSchedulesModule {}
