import { Controller, Get, Post, Patch, Body, Param, Query, Res, UseGuards, ForbiddenException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ModuleGuard } from '../../common/guards/module.guard';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { IncidentsService } from './incidents.service';
import { IncidentsReportService } from './incidents-report.service';
import { CreateIncidentDto } from './dto/create-incident.dto';
import { CreateIncidentTypeDto } from './dto/create-incident-type.dto';
import { QueryIncidentsDto } from './dto/query-incidents.dto';
import { IncidentDepartmentDto } from './dto/incident-department.dto';
import { ScopeUser } from './incidents-scope';

function assertAdmin(user: ScopeUser) {
  if (user?.role !== 'ADMIN') throw new ForbiddenException('Solo un administrador puede gestionar departamentos');
}

@ApiTags('incidents')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), ModuleGuard)
@RequireModule('incidents')
@Controller('incidents')
export class IncidentsController {
  constructor(
    private readonly service: IncidentsService,
    private readonly reportService: IncidentsReportService,
  ) {}

  // ---- Mi alcance (departamentos donde crea / que ve) ----
  @Get('scope')
  myScope(@CurrentUser() user: ScopeUser) {
    return this.service.myScope(user);
  }

  // ---- Departamentos (solo ADMIN) ----
  @Get('departments')
  findAllDepartments(@CurrentUser() user: ScopeUser) {
    assertAdmin(user);
    return this.service.findAllDepartments();
  }

  @Get('departments/users')
  departmentUsers(@CurrentUser() user: ScopeUser) {
    assertAdmin(user);
    return this.service.departmentUserOptions();
  }

  @Post('departments')
  createDepartment(@Body() dto: IncidentDepartmentDto, @CurrentUser() user: ScopeUser) {
    assertAdmin(user);
    return this.service.createDepartment(dto);
  }

  @Patch('departments/:id')
  updateDepartment(@Param('id') id: string, @Body() dto: IncidentDepartmentDto, @CurrentUser() user: ScopeUser) {
    assertAdmin(user);
    return this.service.updateDepartment(id, dto);
  }

  // ---- Tipos (cada miembro los de su departamento; ADMIN todos) ----
  @Get('types')
  findAllTypes(@CurrentUser() user: ScopeUser) {
    return this.service.findAllTypes(user);
  }

  @Get('types/active')
  findActiveTypes(@CurrentUser() user: ScopeUser) {
    return this.service.findActiveTypes(user);
  }

  @Post('types')
  createType(@Body() dto: CreateIncidentTypeDto, @CurrentUser() user: ScopeUser) {
    return this.service.createType(dto, user);
  }

  @Patch('types/:id')
  updateType(@Param('id') id: string, @Body() dto: Partial<CreateIncidentTypeDto>, @CurrentUser() user: ScopeUser) {
    return this.service.updateType(id, dto, user);
  }

  @Patch('types/:id/toggle-active')
  toggleTypeActive(@Param('id') id: string, @CurrentUser() user: ScopeUser) {
    return this.service.toggleTypeActive(id, user);
  }

  // ---- Resumen (KPIs + gráfica) ----
  @Get('summary')
  summary(@Query() query: QueryIncidentsDto, @CurrentUser() user: ScopeUser) {
    return this.service.summary(query, user);
  }

  // ---- Reportes (deben ir antes de rutas con parámetros) ----
  @Get('report/pdf')
  async reportPdf(@Query() query: QueryIncidentsDto, @CurrentUser() user: ScopeUser, @Res() res: Response) {
    const buffer = await this.reportService.generatePdf(query, user);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="reporte-incidencias.pdf"',
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Get('report/xlsx')
  async reportXlsx(@Query() query: QueryIncidentsDto, @CurrentUser() user: ScopeUser, @Res() res: Response) {
    const buffer = await this.reportService.generateXlsx(query, user);
    res.set({
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': 'attachment; filename="incidencias.xlsx"',
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  // ---- Incidencias ----
  @Get()
  findAll(@Query() query: QueryIncidentsDto, @CurrentUser() user: ScopeUser) {
    return this.service.findAll(query, user);
  }

  @Post()
  create(@Body() dto: CreateIncidentDto, @CurrentUser() user: ScopeUser) {
    return this.service.create(dto, user);
  }
}
