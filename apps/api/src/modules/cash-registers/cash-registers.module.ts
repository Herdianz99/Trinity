import { Module } from '@nestjs/common';
import { CashRegistersController } from './cash-registers.controller';
import { CashRegistersService } from './cash-registers.service';
import { CashSessionPdfService } from './cash-session-pdf.service';
import { CashLedgerExcelService } from './cash-ledger-excel.service';
import { DynamicKeysModule } from '../dynamic-keys/dynamic-keys.module';

@Module({
  imports: [DynamicKeysModule],
  controllers: [CashRegistersController],
  providers: [CashRegistersService, CashSessionPdfService, CashLedgerExcelService],
  exports: [CashRegistersService],
})
export class CashRegistersModule {}
