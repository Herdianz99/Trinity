import { Module } from '@nestjs/common';
import { RetentionVouchersController } from './retention-vouchers.controller';
import { RetentionVouchersService } from './retention-vouchers.service';
import { RetentionVouchersPdfService } from './retention-vouchers-pdf.service';

@Module({
  controllers: [RetentionVouchersController],
  providers: [RetentionVouchersService, RetentionVouchersPdfService],
  exports: [RetentionVouchersService],
})
export class RetentionVouchersModule {}
