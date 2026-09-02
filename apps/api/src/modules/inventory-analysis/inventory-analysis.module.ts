import { Module } from '@nestjs/common';
import { InventoryAnalysisController } from './inventory-analysis.controller';
import { InventoryAnalysisService } from './inventory-analysis.service';
import { InventoryAlertsPdfService } from './inventory-alerts-pdf.service';
import { InventoryAnalysisExportExcelService } from './inventory-analysis-export-excel.service';
import { InventoryAnalysisExportPdfService } from './inventory-analysis-export-pdf.service';

@Module({
  controllers: [InventoryAnalysisController],
  providers: [
    InventoryAnalysisService,
    InventoryAlertsPdfService,
    InventoryAnalysisExportExcelService,
    InventoryAnalysisExportPdfService,
  ],
})
export class InventoryAnalysisModule {}
