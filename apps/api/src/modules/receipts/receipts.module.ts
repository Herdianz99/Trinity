import { Module } from '@nestjs/common';
import { ReceiptsController } from './receipts.controller';
import { ReceiptsService } from './receipts.service';
import { ReceiptPdfService } from './receipt-pdf.service';
import { ReceiptsReportPdfService } from './receipts-report-pdf.service';
import { ReceiptsReportExcelService } from './receipts-report-excel.service';
import { DynamicKeysModule } from '../dynamic-keys/dynamic-keys.module';

@Module({
  imports: [DynamicKeysModule],
  controllers: [ReceiptsController],
  providers: [ReceiptsService, ReceiptPdfService, ReceiptsReportPdfService, ReceiptsReportExcelService],
  exports: [ReceiptsService],
})
export class ReceiptsModule {}
