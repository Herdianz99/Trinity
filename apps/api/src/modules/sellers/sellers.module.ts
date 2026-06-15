import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { SellersService } from './sellers.service';
import { SellersController } from './sellers.controller';
import { ReportsModule } from '../reports/reports.module';

@Module({
  imports: [PrismaModule, ReportsModule],
  controllers: [SellersController],
  providers: [SellersService],
  exports: [SellersService],
})
export class SellersModule {}
