import { Module } from '@nestjs/common';
import { SupplierAdvancesController } from './supplier-advances.controller';
import { SupplierAdvancesService } from './supplier-advances.service';

@Module({
  controllers: [SupplierAdvancesController],
  providers: [SupplierAdvancesService],
  exports: [SupplierAdvancesService],
})
export class SupplierAdvancesModule {}
