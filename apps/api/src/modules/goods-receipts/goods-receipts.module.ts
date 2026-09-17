import { Module } from '@nestjs/common';
import { GoodsReceiptsService } from './goods-receipts.service';
import { GoodsReceiptsController } from './goods-receipts.controller';
import { ProductImagesModule } from '../product-images/product-images.module';

@Module({
  imports: [ProductImagesModule], // reutiliza SpacesService para las fotos
  controllers: [GoodsReceiptsController],
  providers: [GoodsReceiptsService],
})
export class GoodsReceiptsModule {}
