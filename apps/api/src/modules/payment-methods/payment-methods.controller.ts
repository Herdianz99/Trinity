import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { PaymentMethodsService } from './payment-methods.service';
import { CreatePaymentMethodDto } from './dto/create-payment-method.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('Payment Methods')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller()
export class PaymentMethodsController {
  constructor(private readonly service: PaymentMethodsService) {}

  @Get('payment-methods')
  findAll() {
    return this.service.findAll();
  }

  @Get('payment-methods/flat')
  findFlat() {
    return this.service.findFlat();
  }

  @Roles(UserRole.ADMIN)
  @Post('payment-methods')
  create(@Body() dto: CreatePaymentMethodDto) {
    return this.service.create(dto);
  }

  @Roles(UserRole.ADMIN)
  @Patch('payment-methods/:id')
  update(@Param('id') id: string, @Body() dto: CreatePaymentMethodDto) {
    return this.service.update(id, dto);
  }

  @Roles(UserRole.ADMIN)
  @Patch('payment-methods/:id/toggle-active')
  toggleActive(@Param('id') id: string) {
    return this.service.toggleActive(id);
  }

  @Roles(UserRole.ADMIN)
  @Delete('payment-methods/:id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
