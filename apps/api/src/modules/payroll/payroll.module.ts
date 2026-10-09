import { Module } from '@nestjs/common';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';
import { PayrollParamsController } from './payroll-params.controller';
import { PayrollParamsService } from './payroll-params.service';
import { PayrollRunsController } from './payroll-runs.controller';
import { PayrollRunsService } from './payroll-runs.service';
import { PayrollPdfService } from './payroll-pdf.service';
import { ExpensesModule } from '../expenses/expenses.module';

@Module({
  imports: [ExpensesModule], // cierre de nomina -> gasto (ExpensesService.createInTx)
  controllers: [EmployeesController, PayrollParamsController, PayrollRunsController],
  providers: [EmployeesService, PayrollParamsService, PayrollRunsService, PayrollPdfService],
  exports: [EmployeesService, PayrollParamsService, PayrollRunsService, PayrollPdfService],
})
export class PayrollModule {}
