import { Module } from '@nestjs/common';
import { IncidentsService } from './incidents.service';
import { IncidentsReportService } from './incidents-report.service';
import { IncidentsController } from './incidents.controller';
import { ProductImagesModule } from '../product-images/product-images.module';

@Module({
  imports: [ProductImagesModule], // reutiliza SpacesService para la foto de la incidencia
  controllers: [IncidentsController],
  providers: [IncidentsService, IncidentsReportService],
})
export class IncidentsModule {}
