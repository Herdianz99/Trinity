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
    @Query('customerId') customerId?: string,
    @Query('cashRegisterId') cashRegisterId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.service.findAll({ status, customerId, cashRegisterId, from, to, page, limit });
  }

  @Get('pending')
  findPending(@Query('today') today?: string) {
    return this.service.findPending(today === 'true');
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
