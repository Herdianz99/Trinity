import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ReceiptsService } from './receipts.service';
import { ReceiptPdfService } from './receipt-pdf.service';
import { ReceiptsReportPdfService } from './receipts-report-pdf.service';
import { ReceiptsReportExcelService } from './receipts-report-excel.service';
import { CreateReceiptDto } from './dto/create-receipt.dto';
import { PostReceiptDto } from './dto/post-receipt.dto';
import { QueryReceiptsDto } from './dto/query-receipts.dto';
import { QueryPendingDocumentsDto } from './dto/query-pending-documents.dto';

@ApiTags('Receipts')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('receipts')
export class ReceiptsController {
  constructor(
    private readonly receiptsService: ReceiptsService,
    private readonly pdfService: ReceiptPdfService,
    private readonly reportPdfService: ReceiptsReportPdfService,
    private readonly reportExcelService: ReceiptsReportExcelService,
  ) {}

  @Get()
  findAll(@Query() query: QueryReceiptsDto) {
    return this.receiptsService.findAll(query);
  }

  @Get('pending-documents')
  getPendingDocuments(@Query() query: QueryPendingDocumentsDto) {
    return this.receiptsService.getPendingDocuments(query);
  }

  // Reporte PDF de la lista completa (respeta los filtros de la pantalla). Debe ir ANTES
  // de las rutas con :id para que 'report' no se interprete como un id de recibo.
  @Get('report/pdf')
  async getReportPdf(@Query() query: QueryReceiptsDto, @Res() res: Response) {
    const buffer = await this.reportPdfService.generate(query);
    const kind = query.type === 'PAYMENT' ? 'pago' : 'cobro';
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="reporte-recibos-${kind}.pdf"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  // Reporte PDF DETALLADO: un bloque por recibo con los documentos cobrados/pagados
  // (facturas/notas) y totales DEBE/HABER/TOTAL. Respeta los filtros de la pantalla.
  @Get('report/detailed/pdf')
  async getDetailedReportPdf(@Query() query: QueryReceiptsDto, @Res() res: Response) {
    const buffer = await this.reportPdfService.generateDetailed(query);
    const kind = query.type === 'PAYMENT' ? 'pago' : 'cobro';
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="reporte-recibos-${kind}-detallado.pdf"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  // Reporte EXCEL (resumen): una fila por recibo, mismos filtros de la pantalla. Debe ir
  // ANTES de las rutas con :id para que 'report' no se interprete como un id de recibo.
  @Get('report/excel')
  async getReportExcel(@Query() query: QueryReceiptsDto, @Res() res: Response) {
    const buffer = await this.reportExcelService.generate(query);
    const kind = query.type === 'PAYMENT' ? 'pago' : 'cobro';
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="reporte-recibos-${kind}.xlsx"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  // Reporte EXCEL detallado: una fila por documento cobrado/pagado (mismos filtros). Debe ir
  // ANTES de las rutas con :id para que 'report' no se interprete como un id de recibo.
  @Get('report/detailed/excel')
  async getDetailedReportExcel(@Query() query: QueryReceiptsDto, @Res() res: Response) {
    const buffer = await this.reportExcelService.generateDetailed(query);
    const kind = query.type === 'PAYMENT' ? 'pago' : 'cobro';
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="reporte-recibos-${kind}-detallado.xlsx"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Get(':id/pdf')
  async getPdf(@Param('id') id: string, @Res() res: Response) {
    const buffer = await this.pdfService.generatePdf(id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="recibo-${id}.pdf"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.receiptsService.findOne(id);
  }

  @Post()
  create(
    @Body() dto: CreateReceiptDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.receiptsService.create(dto, userId);
  }

  @Post(':id/post')
  post(
    @Param('id') id: string,
    @Body() dto: PostReceiptDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.receiptsService.post(id, dto, userId);
  }

  @Patch(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.receiptsService.cancel(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Body('dynamicKey') dynamicKey?: string) {
    return this.receiptsService.remove(id, dynamicKey);
  }
}
