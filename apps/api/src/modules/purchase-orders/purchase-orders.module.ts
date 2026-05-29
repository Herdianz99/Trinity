import { Module } from '@nestjs/common';
import { PurchaseOrdersController } from './purchase-orders.controller';
import { PurchaseOrdersService } from './purchase-orders.service';
import { PurchaseOrdersPdfService } from './purchase-orders-pdf.service';

@Module({
  controllers: [PurchaseOrdersController],
  providers: [PurchaseOrdersService, PurchaseOrdersPdfService],
})
export class PurchaseOrdersModule {}
