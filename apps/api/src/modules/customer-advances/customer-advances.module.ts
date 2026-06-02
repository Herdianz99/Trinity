import { Module } from '@nestjs/common';
import { CustomerAdvancesController } from './customer-advances.controller';
import { CustomerAdvancesService } from './customer-advances.service';

@Module({
  controllers: [CustomerAdvancesController],
  providers: [CustomerAdvancesService],
  exports: [CustomerAdvancesService],
})
export class CustomerAdvancesModule {}
