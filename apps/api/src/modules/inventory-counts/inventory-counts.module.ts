import { Module } from '@nestjs/common';
import { InventoryCountsController } from './inventory-counts.controller';
import { InventoryCountsService } from './inventory-counts.service';

@Module({
  controllers: [InventoryCountsController],
  providers: [InventoryCountsService],
  exports: [InventoryCountsService],
})
export class InventoryCountsModule {}
