import { Module } from '@nestjs/common';
import { IslrRetentionVouchersController } from './islr-retention-vouchers.controller';
import { IslrRetentionVouchersService } from './islr-retention-vouchers.service';
import { IslrRetentionVouchersPdfService } from './islr-retention-vouchers-pdf.service';

@Module({
  controllers: [IslrRetentionVouchersController],
  providers: [IslrRetentionVouchersService, IslrRetentionVouchersPdfService],
  exports: [IslrRetentionVouchersService],
})
export class IslrRetentionVouchersModule {}
