import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ReportsPdfService } from './reports-pdf.service';

@Module({
  controllers: [ReportsController],
  providers: [ReportsService, ReportsPdfService],
  exports: [ReportsPdfService],
})
export class ReportsModule {}
