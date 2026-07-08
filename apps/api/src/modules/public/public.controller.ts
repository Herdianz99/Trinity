import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ApiTags } from '@nestjs/swagger';
import { PublicService } from './public.service';
import { CreateOrderDto } from './dto/create-order.dto';

@ApiTags('Public')
@Controller('public')
@UseGuards(ThrottlerGuard)
export class PublicController {
  constructor(private service: PublicService) {}

  // POST /public/orders — máx 10 pedidos/min por IP (sin auth, superficie pública)
  @Post('orders')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async createOrder(@Body() dto: CreateOrderDto) {
    return this.service.createOrder(dto);
  }
}
