import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { PurchaseAnalysisPdfService } from './purchase-analysis-pdf.service';
import { ProductsReportPdfService } from './products-report-pdf.service';
import { ProductsNoPhotoReportPdfService } from './products-no-photo-report-pdf.service';
import { ProductsCatalogReportService } from './products-catalog-report.service';
import { ProductsUtilidadReportService } from './products-utilidad-report.service';
import { StoreExportModule } from '../store-export/store-export.module';
import { IntegrationModule } from '../integration/integration.module';

@Module({
  imports: [StoreExportModule, IntegrationModule],
  controllers: [ProductsController],
  providers: [ProductsService, PurchaseAnalysisPdfService, ProductsReportPdfService, ProductsNoPhotoReportPdfService, ProductsCatalogReportService, ProductsUtilidadReportService],
  exports: [ProductsService],
})
export class ProductsModule {}
