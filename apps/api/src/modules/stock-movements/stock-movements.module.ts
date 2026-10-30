import { Module } from '@nestjs/common';
import { StockMovementsController } from './stock-movements.controller';
import { StockMovementsService } from './stock-movements.service';
import { StockMovementsPdfService } from './stock-movements-pdf.service';
import { StockMovementsExcelService } from './stock-movements-excel.service';

@Module({
  controllers: [StockMovementsController],
  providers: [StockMovementsService, StockMovementsPdfService, StockMovementsExcelService],
  exports: [StockMovementsService],
})
export class StockMovementsModule {}
