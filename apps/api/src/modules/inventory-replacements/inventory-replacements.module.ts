import { Module } from '@nestjs/common';
import { InventoryReplacementsController } from './inventory-replacements.controller';
import { InventoryReplacementsService } from './inventory-replacements.service';
import { InventoryReplacementsPdfService } from './inventory-replacements-pdf.service';

@Module({
  controllers: [InventoryReplacementsController],
  providers: [InventoryReplacementsService, InventoryReplacementsPdfService],
  exports: [InventoryReplacementsService],
})
export class InventoryReplacementsModule {}
