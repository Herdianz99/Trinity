import { Module } from '@nestjs/common';
import { ProductImagesController } from './product-images.controller';
import { ProductImagesService } from './product-images.service';
import { SpacesService } from './spaces.service';

@Module({
  controllers: [ProductImagesController],
  providers: [ProductImagesService, SpacesService],
  exports: [ProductImagesService, SpacesService],
})
export class ProductImagesModule {}
