import { Module } from '@nestjs/common';
import { ChatbotController } from './chatbot.controller';
import { ChatbotService } from './chatbot.service';
import { ChatbotToolsService } from './chatbot-tools.service';
import { ChatbotCrossSellService } from './chatbot-cross-sell.service';
import { ChatbotCrossSellAnalysisService } from './chatbot-cross-sell-analysis.service';
import { TotemCallsService } from './totem-calls.service';
import { TotemCallsController } from './totem-calls.controller';
import { InvoicesModule } from '../invoices/invoices.module';
import { ProductImagesModule } from '../product-images/product-images.module';

@Module({
  imports: [InvoicesModule, ProductImagesModule], // apartado de facturas en espera + SpacesService (fotos del cliente)
  controllers: [ChatbotController, TotemCallsController],
  providers: [ChatbotService, ChatbotToolsService, ChatbotCrossSellService, ChatbotCrossSellAnalysisService, TotemCallsService],
  exports: [ChatbotService, TotemCallsService],
})
export class ChatbotModule {}
