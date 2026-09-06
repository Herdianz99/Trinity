import { Module } from '@nestjs/common';
import { PurchaseOrdersController } from './purchase-orders.controller';
import { PurchaseOrdersService } from './purchase-orders.service';
import { PurchaseOrdersPdfService } from './purchase-orders-pdf.service';
import { PurchaseAttachmentsService } from './purchase-attachments.service';
import { ProductImagesModule } from '../product-images/product-images.module';
import { PurchaseRequestsModule } from '../purchase-requests/purchase-requests.module';

@Module({
  imports: [ProductImagesModule, PurchaseRequestsModule], // PurchaseRequests: hook de "recibido" al procesar la compra
  controllers: [PurchaseOrdersController],
  providers: [PurchaseOrdersService, PurchaseOrdersPdfService, PurchaseAttachmentsService],
})
export class PurchaseOrdersModule {}
