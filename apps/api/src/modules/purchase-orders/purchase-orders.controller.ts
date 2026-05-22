import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PurchaseOrdersService } from './purchase-orders.service';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { ProcessPurchaseBillDto } from './dto/receive-purchase-order.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PurchaseStatus } from '@prisma/client';

@Controller('purchases')
@UseGuards(AuthGuard('jwt'))
export class PurchaseOrdersController {
  constructor(private readonly service: PurchaseOrdersService) {}

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
