import { Module } from '@nestjs/common';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';
import { ExpenseReportPdfService } from './expense-report-pdf.service';

@Module({
  controllers: [ExpensesController],
  providers: [ExpensesService, ExpenseReportPdfService],
})
export class ExpensesModule {}
