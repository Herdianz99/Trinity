import { Module } from '@nestjs/common';
import { ExhibitionService } from './exhibition.service';
import { ExhibitionReportService } from './exhibition-report.service';
import { ExhibitionController } from './exhibition.controller';

@Module({
  controllers: [ExhibitionController],
  providers: [ExhibitionService, ExhibitionReportService],
})
export class ExhibitionModule {}
