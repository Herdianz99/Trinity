import { Module } from '@nestjs/common';
import { FiscalPaymentMethodsController } from './fiscal-payment-methods.controller';
import { FiscalPaymentMethodsService } from './fiscal-payment-methods.service';

@Module({
  controllers: [FiscalPaymentMethodsController],
  providers: [FiscalPaymentMethodsService],
  exports: [FiscalPaymentMethodsService],
})
export class FiscalPaymentMethodsModule {}
