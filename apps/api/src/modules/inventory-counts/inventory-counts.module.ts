import { Module } from '@nestjs/common';
import { InventoryCountsController } from './inventory-counts.controller';
import { InventoryCountsService } from './inventory-counts.service';
import { InventoryCountsPdfService } from './inventory-counts-pdf.service';

@Module({
  controllers: [InventoryCountsController],
  providers: [InventoryCountsService, InventoryCountsPdfService],
  exports: [InventoryCountsService],
})
export class InventoryCountsModule {}
