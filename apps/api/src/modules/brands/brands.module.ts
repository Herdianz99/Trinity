import { Module } from '@nestjs/common';
import { BrandsController } from './brands.controller';
import { BrandsService } from './brands.service';
import { ProductImagesModule } from '../product-images/product-images.module';
import { StoreExportModule } from '../store-export/store-export.module';

@Module({
  imports: [ProductImagesModule, StoreExportModule], // SpacesService + re-export tienda (logo)
  controllers: [BrandsController],
  providers: [BrandsService],
  exports: [BrandsService],
})
export class BrandsModule {}
