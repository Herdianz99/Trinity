import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Response } from 'express';
import { ReportsService } from './reports.service';
import { ReportsPdfService } from './reports-pdf.service';

@Controller('reports')
@UseGuards(AuthGuard('jwt'))
export class ReportsController {
  constructor(
    private readonly service: ReportsService,
    private readonly pdfService: ReportsPdfService,
  ) {}

  @Get('sales-by-period')
  salesByPeriod(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('groupBy') groupBy: string = 'day',
  ) {
    return this.service.salesByPeriod(from, to, groupBy);
  }

  @Get('sales-by-period/pdf')
  async salesByPeriodPdf(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('groupBy') groupBy: string = 'day',
    @Res() res: Response,
  ) {
    const data = await this.service.salesByPeriod(from, to, groupBy);
    const buffer = await this.pdfService.generateSalesByPeriodPdf(data, from, to, groupBy);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="ventas-por-periodo.pdf"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Get('sales-by-seller')
  salesBySeller(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('sellerId') sellerId?: string,
  ) {
    return this.service.salesBySeller(from, to, sellerId);
  }

  @Get('sales-by-seller/pdf')
  async salesBySellerPdf(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('sellerId') sellerId: string | undefined,
    @Res() res: Response,
  ) {
    const data = await this.service.salesBySeller(from, to, sellerId);
    const buffer = await this.pdfService.generateSalesBySellerPdf(data, from, to);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="ventas-por-vendedor.pdf"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Get('sales-by-customer')
  salesByCustomer(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('customerId') customerId?: string,
  ) {
    return this.service.salesByCustomer(from, to, customerId);
  }

  @Get('sales-by-customer/pdf')
  async salesByCustomerPdf(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('customerId') customerId: string | undefined,
    @Res() res: Response,
  ) {
    const data = await this.service.salesByCustomer(from, to, customerId);
    const buffer = await this.pdfService.generateSalesByCustomerPdf(data, from, to);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="ventas-por-cliente.pdf"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Get('sales-by-product')
  salesByProduct(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('categoryId') categoryId?: string,
  ) {
    return this.service.salesByProduct(from, to, categoryId);
  }

  @Get('sales-by-product/pdf')
  async salesByProductPdf(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('categoryId') categoryId: string | undefined,
    @Res() res: Response,
  ) {
    const data = await this.service.salesByProduct(from, to, categoryId);
    const buffer = await this.pdfService.generateSalesByProductPdf(data, from, to);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="ventas-por-producto.pdf"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Get('comparison')
  comparison(
    @Query('period1From') p1From: string,
    @Query('period1To') p1To: string,
    @Query('period2From') p2From: string,
    @Query('period2To') p2To: string,
  ) {
    return this.service.comparison(p1From, p1To, p2From, p2To);
  }

  @Get('profit-margin')
  profitMargin(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('categoryId') categoryId?: string,
  ) {
    return this.service.profitMargin(from, to, categoryId);
  }

  @Get('profit-margin/pdf')
  async profitMarginPdf(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('categoryId') categoryId: string | undefined,
    @Res() res: Response,
  ) {
    const data = await this.service.profitMargin(from, to, categoryId);
    const buffer = await this.pdfService.generateProfitMarginPdf(data, from, to);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="margen-ganancia.pdf"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Get('top-customers')
  topCustomers(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.topCustomers(from, to, limit ? parseInt(limit) : 20);
  }

  @Get('peak-hours')
  peakHours(
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.service.peakHours(from, to);
  }

  @Get('sales-by-cash-register')
  salesByCashRegister(
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.service.salesByCashRegister(from, to);
  }
}
