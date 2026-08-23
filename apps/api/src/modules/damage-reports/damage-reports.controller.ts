import { Controller, Get, Post, Body, Param, Query, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ModuleGuard } from '../../common/guards/module.guard';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { DamageReportsService } from './damage-reports.service';
import { DamageReportPdfService } from './damage-report-pdf.service';
import { CreateDamageReportDto } from './dto/create-damage-report.dto';
import { QueryDamageReportsDto } from './dto/query-damage-reports.dto';

@ApiTags('damage-reports')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), ModuleGuard)
@RequireModule('almacen')
@Controller('damage-reports')
export class DamageReportsController {
  constructor(
    private readonly service: DamageReportsService,
    private readonly pdfService: DamageReportPdfService,
  ) {}

  @Get()
  findAll(@Query() query: QueryDamageReportsDto) {
    return this.service.findAll(query);
  }

  @Get(':id/pdf')
  async pdf(@Param('id') id: string, @Res() res: Response) {
    const buffer = await this.pdfService.generateReport(id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="reporte-danos.pdf"',
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateDamageReportDto, @CurrentUser() user: { id: string }) {
    return this.service.create(dto, user.id);
  }

  @Post(':id/replacement')
  generateReplacement(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.service.generateReplacement(id, user.id);
  }

  @Post(':id/replacement/cancel')
  cancelReplacement(@Param('id') id: string) {
    return this.service.cancelReplacement(id);
  }

  @Post(':id/merma')
  processMerma(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.service.processMerma(id, user.id);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.service.cancel(id);
  }
}
