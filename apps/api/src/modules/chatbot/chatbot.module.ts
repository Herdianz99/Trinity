import { Module } from '@nestjs/common';
import { ChatbotController } from './chatbot.controller';
import { ChatbotService } from './chatbot.service';
import { ChatbotToolsService } from './chatbot-tools.service';
import { InvoicesModule } from '../invoices/invoices.module';
import { ProductImagesModule } from '../product-images/product-images.module';

@Module({
  imports: [InvoicesModule, ProductImagesModule], // apartado de facturas en espera + SpacesService (fotos del cliente)
  controllers: [ChatbotController],
  providers: [ChatbotService, ChatbotToolsService],
  exports: [ChatbotService],
})
export class ChatbotModule {}
