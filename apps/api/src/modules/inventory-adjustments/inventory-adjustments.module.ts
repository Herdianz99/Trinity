import { Module } from '@nestjs/common';
import { InventoryAdjustmentsController } from './inventory-adjustments.controller';
import { InventoryAdjustmentsService } from './inventory-adjustments.service';
import { InventoryAdjustmentsPdfService } from './inventory-adjustments-pdf.service';
import { DynamicKeysModule } from '../dynamic-keys/dynamic-keys.module';

@Module({
  imports: [DynamicKeysModule],
  controllers: [InventoryAdjustmentsController],
  providers: [InventoryAdjustmentsService, InventoryAdjustmentsPdfService],
  exports: [InventoryAdjustmentsService],
})
export class InventoryAdjustmentsModule {}
