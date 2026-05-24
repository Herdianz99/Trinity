import { Module } from '@nestjs/common';
import { RetentionVouchersController } from './retention-vouchers.controller';
import { RetentionVouchersService } from './retention-vouchers.service';

@Module({
  controllers: [RetentionVouchersController],
  providers: [RetentionVouchersService],
  exports: [RetentionVouchersService],
})
export class RetentionVouchersModule {}
