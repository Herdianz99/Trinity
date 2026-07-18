import { Module } from '@nestjs/common';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';
import { PayrollParamsController } from './payroll-params.controller';
import { PayrollParamsService } from './payroll-params.service';

@Module({
  controllers: [EmployeesController, PayrollParamsController],
  providers: [EmployeesService, PayrollParamsService],
  exports: [EmployeesService, PayrollParamsService],
})
export class PayrollModule {}
