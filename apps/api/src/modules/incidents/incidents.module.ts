import { Module } from '@nestjs/common';
import { IncidentsService } from './incidents.service';
import { IncidentsReportService } from './incidents-report.service';
import { IncidentsController } from './incidents.controller';

@Module({
  controllers: [IncidentsController],
  providers: [IncidentsService, IncidentsReportService],
})
export class IncidentsModule {}
