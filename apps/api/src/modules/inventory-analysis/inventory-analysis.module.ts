import { Module } from '@nestjs/common';
import { InventoryAnalysisController } from './inventory-analysis.controller';
import { InventoryAnalysisService } from './inventory-analysis.service';
import { InventoryAlertsPdfService } from './inventory-alerts-pdf.service';

@Module({
  controllers: [InventoryAnalysisController],
  providers: [InventoryAnalysisService, InventoryAlertsPdfService],
})
export class InventoryAnalysisModule {}
