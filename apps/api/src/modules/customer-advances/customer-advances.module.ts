import { Module } from '@nestjs/common';
import { CustomerAdvancesController } from './customer-advances.controller';
import { CustomerAdvancesService } from './customer-advances.service';
import { DynamicKeysModule } from '../dynamic-keys/dynamic-keys.module';

@Module({
  imports: [DynamicKeysModule],
  controllers: [CustomerAdvancesController],
  providers: [CustomerAdvancesService],
  exports: [CustomerAdvancesService],
})
export class CustomerAdvancesModule {}
