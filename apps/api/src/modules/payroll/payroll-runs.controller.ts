import { Controller, Get, Post, Body, Patch, Delete, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ModuleGuard } from '../../common/guards/module.guard';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { PayrollRunsService } from './payroll-runs.service';
import { CreatePayrollRunDto } from './dto/create-payroll-run.dto';
import { UpdatePayrollLinesDto } from './dto/update-payroll-lines.dto';

@ApiTags('Payroll - Runs')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), ModuleGuard)
@RequireModule('payroll')
@Controller('payroll-runs')
export class PayrollRunsController {
  constructor(private service: PayrollRunsService) {}

  @Post()
  create(@Body() dto: CreatePayrollRunDto, @CurrentUser() user: { id: string; email: string; role: UserRole }) {
    return this.service.create(dto, user.id);
  }

  @Get()
  findAll(@Query() query: { status?: string; type?: string }) {
    return this.service.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id/lines')
  updateLines(@Param('id') id: string, @Body() dto: UpdatePayrollLinesDto) {
    return this.service.updateLines(id, dto);
  }

  @Post(':id/sync-employees')
  syncEmployees(@Param('id') id: string) {
    return this.service.syncEmployees(id);
  }

  @Post(':id/close')
  close(@Param('id') id: string) {
    return this.service.close(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
