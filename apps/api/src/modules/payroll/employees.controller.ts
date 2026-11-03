import { Controller, Get, Post, Body, Patch, Param, Query, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Response } from 'express';
import { ModuleGuard } from '../../common/guards/module.guard';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { EmployeesService } from './employees.service';
import { EmployeesReportService } from './employees-report.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { SetEmployeeStatusDto, QueryEmployeesDto } from './dto/set-employee-status.dto';

@ApiTags('Payroll - Employees')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), ModuleGuard)
@RequireModule('payroll')
@Controller('employees')
export class EmployeesController {
  constructor(
    private employeesService: EmployeesService,
    private reportService: EmployeesReportService,
  ) {}

  @Post()
  create(@Body() dto: CreateEmployeeDto) {
    return this.employeesService.create(dto);
  }

  @Get()
  findAll(@Query() query: QueryEmployeesDto) {
    return this.employeesService.findAll(query);
  }

  // Reportes con los mismos filtros del listado (antes de ':id' para que no lo capture).
  @Get('report/pdf')
  async reportPdf(@Query() query: QueryEmployeesDto, @Res() res: Response) {
    const buffer = await this.reportService.generatePdf(query);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="reporte-empleados.pdf"', 'Content-Length': buffer.length });
    res.end(buffer);
  }

  @Get('report/xlsx')
  async reportXlsx(@Query() query: QueryEmployeesDto, @Res() res: Response) {
    const buffer = await this.reportService.generateXlsx(query);
    res.set({ 'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment; filename="empleados.xlsx"', 'Content-Length': buffer.length });
    res.end(buffer);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.employeesService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateEmployeeDto) {
    return this.employeesService.update(id, dto);
  }

  @Patch(':id/status')
  setStatus(@Param('id') id: string, @Body() dto: SetEmployeeStatusDto) {
    return this.employeesService.setStatus(id, dto);
  }

  @Patch(':id/toggle-active')
  toggleActive(@Param('id') id: string) {
    return this.employeesService.toggleActive(id);
  }
}
