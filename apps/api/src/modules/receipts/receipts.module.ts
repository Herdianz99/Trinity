import { Module } from '@nestjs/common';
import { ReceiptsController } from './receipts.controller';
import { ReceiptsService } from './receipts.service';
import { ReceiptPdfService } from './receipt-pdf.service';
import { DynamicKeysModule } from '../dynamic-keys/dynamic-keys.module';

@Module({
  imports: [DynamicKeysModule],
  controllers: [ReceiptsController],
  providers: [ReceiptsService, ReceiptPdfService],
  exports: [ReceiptsService],
})
export class ReceiptsModule {}
