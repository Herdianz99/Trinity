import { Module } from '@nestjs/common';
import { CashRegistersController } from './cash-registers.controller';
import { CashRegistersService } from './cash-registers.service';
import { CashSessionPdfService } from './cash-session-pdf.service';

@Module({
  controllers: [CashRegistersController],
  providers: [CashRegistersService, CashSessionPdfService],
  exports: [CashRegistersService],
})
export class CashRegistersModule {}
