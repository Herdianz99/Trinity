import { Module } from '@nestjs/common';
import { ProductImagesModule } from '../product-images/product-images.module';
import { StoreExportModule } from '../store-export/store-export.module';
import { StoreCustomizationController } from './store-customization.controller';
import { StoreCustomizationService } from './store-customization.service';

@Module({
  imports: [ProductImagesModule, StoreExportModule], // SpacesService + StoreExportService
  controllers: [StoreCustomizationController],
  providers: [StoreCustomizationService],
})
export class StoreCustomizationModule {}
