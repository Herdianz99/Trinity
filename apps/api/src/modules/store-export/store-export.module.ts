import { Module } from '@nestjs/common';
import { ProductImagesModule } from '../product-images/product-images.module';
import { StoreExportService } from './store-export.service';
import { StoreExportController } from './store-export.controller';
import { StoreExportCron } from './store-export.cron';

@Module({
  imports: [ProductImagesModule], // provee SpacesService (exportado en Task A2)
  controllers: [StoreExportController],
  providers: [StoreExportService, StoreExportCron],
  exports: [StoreExportService],
})
export class StoreExportModule {}
