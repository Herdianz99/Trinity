import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ZReportsService } from './z-reports.service';
import { CreateZReportDto } from './dto/create-z-report.dto';
import { UpdateZReportDto } from './dto/update-z-report.dto';
import { QueryFiscalDto } from '../fiscal/dto/query-fiscal.dto';

@Controller('z-reports')
@UseGuards(AuthGuard('jwt'))
export class ZReportsController {
  constructor(private readonly service: ZReportsService) {}

  @Get()
  findAll(@Query() query: QueryFiscalDto) {
    return this.service.findAll(query.from, query.to);
  }

  @Get('pdf')
  generatePdf(@Query() query: QueryFiscalDto) {
    return this.service.generatePdfData(query.from, query.to);
  }

  @Post()
  create(@Body() dto: CreateZReportDto, @Request() req: any) {
    return this.service.create(dto, req.user.id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateZReportDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: any) {
    return this.service.remove(id, req.user.role);
  }
}
