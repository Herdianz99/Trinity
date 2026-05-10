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
import { ReceivePurchaseOrderDto } from './dto/receive-purchase-order.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PurchaseStatus } from '@prisma/client';

@Controller('purchase-orders')
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

  @Patch(':id/status')
  changeStatus(
    @Param('id') id: string,
    @Body('status') status: 'SENT' | 'CANCELLED',
  ) {
    return this.service.changeStatus(id, status);
  }

  @Patch(':id/receive')
  receive(
    @Param('id') id: string,
    @Body() dto: ReceivePurchaseOrderDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.receive(id, dto, user.id);
  }
}
