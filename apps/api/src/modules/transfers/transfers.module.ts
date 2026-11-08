import { Module } from '@nestjs/common';
import { TransfersController } from './transfers.controller';
import { TransfersService } from './transfers.service';
import { TransferPdfService } from './transfer-pdf.service';

@Module({
  controllers: [TransfersController],
  providers: [TransfersService, TransferPdfService],
  exports: [TransfersService],
})
export class TransfersModule {}
