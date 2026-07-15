import { Module } from '@nestjs/common';
import { StockMovementsController } from './stock-movements.controller';
import { StockMovementsService } from './stock-movements.service';
import { StockMovementsPdfService } from './stock-movements-pdf.service';

@Module({
  controllers: [StockMovementsController],
  providers: [StockMovementsService, StockMovementsPdfService],
  exports: [StockMovementsService],
})
export class StockMovementsModule {}
