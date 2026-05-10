import { Module } from '@nestjs/common';
import { QuotationsController } from './quotations.controller';
import { QuotationsService } from './quotations.service';
import { QuotationPdfService } from './quotation-pdf.service';
import { QuotationsCronService } from './quotations-cron.service';

@Module({
  controllers: [QuotationsController],
  providers: [QuotationsService, QuotationPdfService, QuotationsCronService],
  exports: [QuotationsService],
})
export class QuotationsModule {}
