import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { ModuleGuard } from '../../common/guards/module.guard';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { PayrollParamsService } from './payroll-params.service';
import { UpdatePayrollParamDto } from './dto/update-payroll-param.dto';

@ApiTags('Payroll - Params')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), ModuleGuard)
@RequireModule('payroll')
@Controller('payroll-params')
export class PayrollParamsController {
  constructor(private service: PayrollParamsService) {}

  @Get()
  get() {
    return this.service.get();
  }

  @Patch()
  update(@Body() dto: UpdatePayrollParamDto) {
    return this.service.update(dto);
  }
}
