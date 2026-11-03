import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { StoreThrottlerGuard } from './store-throttler.guard';
import { ApiTags } from '@nestjs/swagger';
import { PublicService } from './public.service';
import { CreateOrderDto } from './dto/create-order.dto';

@ApiTags('Public')
@Controller('public')
@UseGuards(StoreThrottlerGuard)
export class PublicController {
  constructor(private service: PublicService) {}

  // POST /public/orders — máx 10 pedidos/min por cliente (IP real si viene firmada por la tienda)
  @Post('orders')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async createOrder(@Body() dto: CreateOrderDto) {
    return this.service.createOrder(dto);
  }
}
