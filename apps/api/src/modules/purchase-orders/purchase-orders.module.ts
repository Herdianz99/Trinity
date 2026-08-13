import { Module } from '@nestjs/common';
import { PurchaseOrdersController } from './purchase-orders.controller';
import { PurchaseOrdersService } from './purchase-orders.service';
import { PurchaseOrdersPdfService } from './purchase-orders-pdf.service';
import { PurchaseAttachmentsService } from './purchase-attachments.service';
import { ProductImagesModule } from '../product-images/product-images.module';

@Module({
  imports: [ProductImagesModule], // reutiliza SpacesService para los adjuntos de la compra
  controllers: [PurchaseOrdersController],
  providers: [PurchaseOrdersService, PurchaseOrdersPdfService, PurchaseAttachmentsService],
})
export class PurchaseOrdersModule {}
