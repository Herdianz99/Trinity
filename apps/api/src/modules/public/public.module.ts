import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { PublicController } from './public.controller';
import { PublicService } from './public.service';
import { ProductImagesModule } from '../product-images/product-images.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 60 }]),
    ProductImagesModule, // reusa SpacesService para subir la captura del pago
  ],
  controllers: [PublicController],
  providers: [PublicService],
})
export class PublicModule {}
