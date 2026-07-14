import { Module } from '@nestjs/common';
import { SupplierAdvancesController } from './supplier-advances.controller';
import { SupplierAdvancesService } from './supplier-advances.service';
import { DynamicKeysModule } from '../dynamic-keys/dynamic-keys.module';

@Module({
  imports: [DynamicKeysModule],
  controllers: [SupplierAdvancesController],
  providers: [SupplierAdvancesService],
  exports: [SupplierAdvancesService],
})
export class SupplierAdvancesModule {}
