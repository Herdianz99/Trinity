import { Module } from '@nestjs/common';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';
import { ExpenseReportPdfService } from './expense-report-pdf.service';
import { ExpenseReportExcelService } from './expense-report-excel.service';
import { ExpensePdfService } from './expense-pdf.service';

@Module({
  controllers: [ExpensesController],
  providers: [ExpensesService, ExpenseReportPdfService, ExpenseReportExcelService, ExpensePdfService],
})
export class ExpensesModule {}
