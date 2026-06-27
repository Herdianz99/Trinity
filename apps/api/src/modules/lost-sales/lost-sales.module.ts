import { Module } from '@nestjs/common';
import { LostSalesController } from './lost-sales.controller';
import { LostSalesService } from './lost-sales.service';

@Module({
  controllers: [LostSalesController],
  providers: [LostSalesService],
})
export class LostSalesModule {}
