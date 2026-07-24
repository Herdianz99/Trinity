import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { PurchaseAnalysisPdfService } from './purchase-analysis-pdf.service';
import { ProductsReportPdfService } from './products-report-pdf.service';
import { StoreExportModule } from '../store-export/store-export.module';

@Module({
  imports: [StoreExportModule],
  controllers: [ProductsController],
  providers: [ProductsService, PurchaseAnalysisPdfService, ProductsReportPdfService],
  exports: [ProductsService],
})
export class ProductsModule {}
