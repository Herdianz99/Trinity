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
import { AuthGuard } from '@nestjs/passport';
import { PayablesService } from './payables.service';
import { PayablesPdfService } from './payables-pdf.service';
import { QueryPayablesDto } from './dto/query-payables.dto';
import { CreatePayableDto } from './dto/create-payable.dto';

@Controller('payables')
@UseGuards(AuthGuard('jwt'))
export class PayablesController {
  constructor(
    private readonly service: PayablesService,
    private readonly pdfService: PayablesPdfService,
  ) {}

  @Post()
  create(@Body() dto: CreatePayableDto, @Request() req: any) {
    return this.service.create(dto, req.user?.id);
  }

  @Get('next-number')
  getNextNumber() {
    return this.service.getNextNumber();
  }

  @Get('summary')
  summary() {
    return this.service.summary();
  }

  @Get('supplier/:supplierId')
  findBySupplier(@Param('supplierId') supplierId: string) {
    return this.service.findBySupplier(supplierId);
  }

  @Get()
  findAll(@Query() query: QueryPayablesDto) {
    return this.service.findAll(query);
  }

  // Reporte PDF con TODOS los registros del filtro actual (sin paginacion)
  @Get('report/pdf')
  async report(@Query() query: QueryPayablesDto, @Res() res: Response) {
    const buffer = await this.pdfService.generate(query);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="cuentas-por-pagar.pdf"',
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
