import { Module } from '@nestjs/common';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';
import { PayrollParamsController } from './payroll-params.controller';
import { PayrollParamsService } from './payroll-params.service';
import { PayrollRunsController } from './payroll-runs.controller';
import { PayrollRunsService } from './payroll-runs.service';
import { PayrollPdfService } from './payroll-pdf.service';

@Module({
  controllers: [EmployeesController, PayrollParamsController, PayrollRunsController],
  providers: [EmployeesService, PayrollParamsService, PayrollRunsService, PayrollPdfService],
  exports: [EmployeesService, PayrollParamsService, PayrollRunsService],
})
export class PayrollModule {}
