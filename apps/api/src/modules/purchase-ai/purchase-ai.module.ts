import { Module } from '@nestjs/common';
import { ProductImagesModule } from '../product-images/product-images.module';
import { PurchaseAiController } from './purchase-ai.controller';
import { PurchaseAiService } from './purchase-ai.service';
import { LlmExtractionService } from './llm-extraction.service';

@Module({
  imports: [ProductImagesModule], // reusa SpacesService para guardar la factura
  controllers: [PurchaseAiController],
  providers: [PurchaseAiService, LlmExtractionService],
})
export class PurchaseAiModule {}
