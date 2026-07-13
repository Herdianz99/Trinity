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
import { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { PurchaseOrdersService } from './purchase-orders.service';
import { PurchaseOrdersPdfService } from './purchase-orders-pdf.service';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { ProcessPurchaseBillDto } from './dto/receive-purchase-order.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PurchaseStatus } from '@prisma/client';

@Controller('purchases')
@UseGuards(AuthGuard('jwt'))
export class PurchaseOrdersController {
  constructor(
    private readonly service: PurchaseOrdersService,
    private readonly pdfService: PurchaseOrdersPdfService,
  ) {}

  @Post()
  create(
    @Body() dto: CreatePurchaseOrderDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.create(dto, user.id);
  }

  @Get('reorder-suggestions')
  getReorderSuggestions() {
    return this.service.getReorderSuggestions();
  }

  @Get('check-duplicate')
  checkDuplicate(
    @Query('supplierId') supplierId: string,
    @Query('invoiceNumber') invoiceNumber: string,
    @Query('excludeId') excludeId?: string,
  ) {
    return this.service.checkDuplicateInvoice(supplierId, invoiceNumber, excludeId);
  }

  @Get()
  findAll(
    @Query('supplierId') supplierId?: string,
    @Query('status') status?: PurchaseStatus,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.findAll({
      supplierId,
      status,
      from,
      to,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }

  @Get(':id/pdf')
  async getPdf(@Param('id') id: string, @Res() res: Response) {
    const buffer = await this.pdfService.generatePdf(id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="compra-${id}.pdf"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: Partial<CreatePurchaseOrderDto>) {
    return this.service.update(id, dto);
  }

  @Post(':id/process')
  process(
    @Param('id') id: string,
    @Body() dto: ProcessPurchaseBillDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.process(id, dto, user.id);
  }

  @Patch(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.service.cancel(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Get(':id/suggested-prices')
  getSuggestedPrices(@Param('id') id: string) {
    return this.service.getSuggestedPrices(id);
  }

  @Patch(':id/update-prices')
  updatePrices(
    @Param('id') id: string,
    @Body('items') items: { productId: string; gananciaPct: number; gananciaMayorPct: number }[],
  ) {
    return this.service.updatePrices(id, items);
  }
}
