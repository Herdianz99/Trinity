import { Controller, Get, Post, Patch, Body, Param, Query, Res, UseGuards } from '@nestjs/common';
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

  // ---- Tipos (abiertos a cualquiera con el módulo, no solo ADMIN) ----
  @Get('types')
  findAllTypes() {
    return this.service.findAllTypes();
  }

  @Get('types/active')
  findActiveTypes() {
    return this.service.findActiveTypes();
  }

  @Post('types')
  createType(@Body() dto: CreateIncidentTypeDto) {
    return this.service.createType(dto);
  }

  @Patch('types/:id')
  updateType(@Param('id') id: string, @Body() dto: Partial<CreateIncidentTypeDto>) {
    return this.service.updateType(id, dto);
  }

  @Patch('types/:id/toggle-active')
  toggleTypeActive(@Param('id') id: string) {
    return this.service.toggleTypeActive(id);
  }

  // ---- Resumen (KPIs + gráfica) ----
  @Get('summary')
  summary(@Query() query: QueryIncidentsDto) {
    return this.service.summary(query);
  }

  // ---- Reportes (deben ir antes de rutas con parámetros) ----
  @Get('report/pdf')
  async reportPdf(@Query() query: QueryIncidentsDto, @Res() res: Response) {
    const buffer = await this.reportService.generatePdf(query);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="reporte-incidencias.pdf"',
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Get('report/xlsx')
  async reportXlsx(@Query() query: QueryIncidentsDto, @Res() res: Response) {
    const buffer = await this.reportService.generateXlsx(query);
    res.set({
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': 'attachment; filename="incidencias.xlsx"',
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  // ---- Incidencias ----
  @Get()
  findAll(@Query() query: QueryIncidentsDto) {
    return this.service.findAll(query);
  }

  @Post()
  create(@Body() dto: CreateIncidentDto, @CurrentUser() user: { id: string }) {
    return this.service.create(dto, user.id);
  }
}
