import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { FiscalPaymentMethodsService } from './fiscal-payment-methods.service';
import { CreateFiscalPaymentMethodDto } from './dto/create-fiscal-payment-method.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('Fiscal Payment Methods')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller()
export class FiscalPaymentMethodsController {
  constructor(private readonly service: FiscalPaymentMethodsService) {}

  @Get('fiscal-payment-methods')
  findAll() {
    return this.service.findAll();
  }

  @Get('fiscal-payment-methods/active')
  findActive() {
    return this.service.findActive();
  }

  @Roles(UserRole.ADMIN)
  @Post('fiscal-payment-methods')
  create(@Body() dto: CreateFiscalPaymentMethodDto) {
    return this.service.create(dto);
  }

  @Roles(UserRole.ADMIN)
  @Patch('fiscal-payment-methods/:id')
  update(@Param('id') id: string, @Body() dto: CreateFiscalPaymentMethodDto) {
    return this.service.update(id, dto);
  }

  @Roles(UserRole.ADMIN)
  @Patch('fiscal-payment-methods/:id/toggle-active')
  toggleActive(@Param('id') id: string) {
    return this.service.toggleActive(id);
  }
}
