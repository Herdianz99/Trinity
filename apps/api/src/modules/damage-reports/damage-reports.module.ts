import { Module } from '@nestjs/common';
import { DamageReportsService } from './damage-reports.service';
import { DamageReportPdfService } from './damage-report-pdf.service';
import { DamageReportsController } from './damage-reports.controller';
import { ProductImagesModule } from '../product-images/product-images.module';

@Module({
  imports: [ProductImagesModule], // reutiliza SpacesService para las fotos de evidencia
  controllers: [DamageReportsController],
  providers: [DamageReportsService, DamageReportPdfService],
})
export class DamageReportsModule {}
