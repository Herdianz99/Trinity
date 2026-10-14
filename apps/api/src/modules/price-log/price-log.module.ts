import { Module } from '@nestjs/common';
import { PriceLogController } from './price-log.controller';
import { PriceLogService } from './price-log.service';

@Module({
  controllers: [PriceLogController],
  providers: [PriceLogService],
})
export class PriceLogModule {}
