import { Module } from '@nestjs/common';
import { StockController } from './stock.controller';
import { StockService } from './stock.service';
import { StockCountPdfService } from './stock-count-pdf.service';

@Module({
  controllers: [StockController],
  providers: [StockService, StockCountPdfService],
  exports: [StockService],
})
export class StockModule {}
