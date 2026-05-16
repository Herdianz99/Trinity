import { Module } from '@nestjs/common';
import { CreditDebitNotesController } from './credit-debit-notes.controller';
import { CreditDebitNotesService } from './credit-debit-notes.service';
import { CreditDebitNotesPdfService } from './credit-debit-notes-pdf.service';

@Module({
  controllers: [CreditDebitNotesController],
  providers: [CreditDebitNotesService, CreditDebitNotesPdfService],
  exports: [CreditDebitNotesService],
})
export class CreditDebitNotesModule {}
