import { Module } from '@nestjs/common';
import { InvoicesModule } from '../invoices/invoices.module';
import { ProductImagesModule } from '../product-images/product-images.module';
import { ChatbotModule } from '../chatbot/chatbot.module';
import { TotemAdminController, TotemController } from './totem.controller';
import { TotemService } from './totem.service';
import { TotemMediaService } from './totem-media.service';
import { TotemTtsService } from './totem-tts.service';

// Totem Clover del piso de venta: conversaciones KIOSK del rol TOTEM + publicidad en espera (Sesion 189).
@Module({
  imports: [InvoicesModule, ProductImagesModule, ChatbotModule],
  controllers: [TotemController, TotemAdminController],
  providers: [TotemService, TotemMediaService, TotemTtsService],
})
export class TotemModule {}
