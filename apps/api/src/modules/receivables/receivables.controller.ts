import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { ReceivablesService } from './receivables.service';
import { ReceivablesPdfService } from './receivables-pdf.service';
import { QueryReceivablesDto } from './dto/query-receivables.dto';
import { CreateReceivableDto } from './dto/create-receivable.dto';

@ApiTags('Receivables')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('receivables')
export class ReceivablesController {
  constructor(
    private readonly receivablesService: ReceivablesService,
    private readonly pdfService: ReceivablesPdfService,
  ) {}

  @Post()
  create(@Body() dto: CreateReceivableDto, @Request() req: any) {
    return this.receivablesService.create(dto, req.user?.id);
  }

  @Get('next-number')
  getNextNumber() {
    return this.receivablesService.getNextNumber();
  }

  @Get()
  findAll(@Query() query: QueryReceivablesDto) {
    return this.receivablesService.findAll(query);
  }

  // Reporte PDF con TODOS los registros del filtro actual (sin paginacion)
  @Get('report/pdf')
  async report(@Query() query: QueryReceivablesDto, @Res() res: Response) {
    const buffer = await this.pdfService.generate(query);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="cuentas-por-cobrar.pdf"',
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  // Reporte PDF agrupado por vendedor y luego por cliente (mismos filtros)
  @Get('report/by-seller/pdf')
  async reportBySeller(@Query() query: QueryReceivablesDto, @Res() res: Response) {
    const buffer = await this.pdfService.generateBySeller(query);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="cuentas-por-cobrar-por-vendedor.pdf"',
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  // Exportar la lista a Excel (plana, mismos filtros, sin paginacion)
  @Get('report/xlsx')
  async reportXlsx(@Query() query: QueryReceivablesDto, @Res() res: Response) {
    const buffer = await this.pdfService.generateXlsx(query);
    res.set({
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': 'attachment; filename="cuentas-por-cobrar.xlsx"',
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Get('summary')
  summary() {
    return this.receivablesService.summary();
  }

  // Saldo + vencido de varios clientes (ids separados por coma). Para el buscador de
  // clientes al crear un recibo de cobro.
  @Get('balances')
  balancesByCustomers(@Query('ids') ids?: string) {
    return this.receivablesService.balancesByCustomers((ids || '').split(',').map((s) => s.trim()).filter(Boolean));
  }

  // Análisis de plataformas de financiamiento (Cashea/Crediagro). Rango opcional from/to.
  @Get('platforms/analytics')
  platformAnalytics(@Query('from') from?: string, @Query('to') to?: string) {
    return this.receivablesService.platformAnalytics(from, to);
  }

  @Get('customer/:customerId')
  findByCustomer(@Param('customerId') customerId: string) {
    return this.receivablesService.findByCustomer(customerId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.receivablesService.findOne(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.receivablesService.remove(id);
  }
}
