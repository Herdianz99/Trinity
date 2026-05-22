import { Module } from '@nestjs/common';
import { InventoryAnalysisController } from './inventory-analysis.controller';
import { InventoryAnalysisService } from './inventory-analysis.service';

@Module({
  controllers: [InventoryAnalysisController],
  providers: [InventoryAnalysisService],
})
export class InventoryAnalysisModule {}
