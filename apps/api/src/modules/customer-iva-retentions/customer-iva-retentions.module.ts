import { Module } from '@nestjs/common';
import { CustomerIvaRetentionsController } from './customer-iva-retentions.controller';
import { CustomerIvaRetentionsService } from './customer-iva-retentions.service';

@Module({
  controllers: [CustomerIvaRetentionsController],
  providers: [CustomerIvaRetentionsService],
  exports: [CustomerIvaRetentionsService],
})
export class CustomerIvaRetentionsModule {}
