import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Response } from 'express';
import { InvoicesService } from './invoices.service';
import { InvoicePdfService } from './invoice-pdf.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { PayInvoiceDto } from './dto/pay-invoice.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Invoices')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('invoices')
export class InvoicesController {
  constructor(
    private readonly service: InvoicesService,
    private readonly pdfService: InvoicePdfService,
  ) {}

  @Get()
  findAll(
    @Query('status') status?: string,
    @Query('paymentType') paymentType?: string,
    @Query('customerId') customerId?: string,
    @Query('sellerId') sellerId?: string,
    @Query('cashRegisterId') cashRegisterId?: string,
    @Query('search') search?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('fiscalPrinted') fiscalPrinted?: string,
  ) {
    return this.service.findAll({ status, paymentType, customerId, sellerId, cashRegisterId, search, from, to, page, limit, fiscalPrinted });
  }

  @Get('pending')
  findPending(@Query('today') today?: string) {
    return this.service.findPending(today === 'true');
  }

  // Cantidad comprometida por producto en facturas en espera (PENDING), para
  // mostrar "Disponible" = stock real - reservado en el POS.
  @Get('reserved-stock')
  getReservedStock() {
    return this.service.getReservedStock();
  }

  @Get('report/by-seller')
  async getSellerReport(
    @Query('status') status: string,
    @Query('paymentType') paymentType: string,
    @Query('sellerId') sellerId: string,
    @Query('search') search: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Res() res: Response,
  ) {
    const buffer = await this.pdfService.generateSellerReport({
      status, paymentType, sellerId, search, from, to,
    });
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="ventas-por-vendedor.pdf"',
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Get(':id/pdf')
  async getPdf(@Param('id') id: string, @Res() res: Response) {
    const buffer = await this.pdfService.generatePdf(id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="factura-${id}.pdf"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(
    @Body() dto: CreateInvoiceDto,
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    return this.service.create(dto, user);
  }

  @Patch(':id/pay')
  pay(
    @Param('id') id: string,
    @Body() dto: PayInvoiceDto,
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    return this.service.pay(id, dto, user);
  }

  @Patch(':id/retake')
  retake(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    return this.service.retake(id, user);
  }

  @Patch(':id/update-items')
  updateItems(
    @Param('id') id: string,
    @Body() dto: CreateInvoiceDto,
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    return this.service.updateItems(id, dto, user);
  }

  @Patch(':id/control-number')
  updateControlNumber(
    @Param('id') id: string,
    @Body('controlNumber') controlNumber: string,
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    return this.service.updateControlNumber(id, controlNumber, user);
  }

  @Patch(':id/fiscal-info')
  updateFiscalInfo(
    @Param('id') id: string,
    @Body() body: { fiscalNumber: string; machineSerial: string },
  ) {
    return this.service.updateFiscalInfo(id, body);
  }

  @Patch(':id/fiscal-status')
  updateFiscalStatus(
    @Param('id') id: string,
    @Body()
    body: {
      fiscalPrinted?: boolean;
      fiscalNumber?: string | null;
      fiscalMachineSerial?: string | null;
    },
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    return this.service.updateFiscalStatus(id, body, user);
  }

  @Patch(':id/cancel')
  cancel(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    return this.service.cancel(id, user);
  }

  @Delete(':id')
  delete(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    return this.service.delete(id, user);
  }
}
