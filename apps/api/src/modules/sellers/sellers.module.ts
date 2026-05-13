import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { SellersService } from './sellers.service';
import { SellersController } from './sellers.controller';

@Module({
  imports: [PrismaModule],
  controllers: [SellersController],
  providers: [SellersService],
  exports: [SellersService],
})
export class SellersModule {}
