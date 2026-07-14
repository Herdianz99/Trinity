import { Module } from '@nestjs/common';
import { SupplierAdvancesController } from './supplier-advances.controller';
import { SupplierAdvancesService } from './supplier-advances.service';
import { SupplierAdvancePdfService } from './supplier-advance-pdf.service';
import { DynamicKeysModule } from '../dynamic-keys/dynamic-keys.module';

@Module({
  imports: [DynamicKeysModule],
  controllers: [SupplierAdvancesController],
  providers: [SupplierAdvancesService, SupplierAdvancePdfService],
  exports: [SupplierAdvancesService],
})
export class SupplierAdvancesModule {}
