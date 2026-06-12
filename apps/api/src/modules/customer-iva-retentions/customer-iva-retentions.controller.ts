import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CustomerIvaRetentionsService } from './customer-iva-retentions.service';
import { CreateCustomerIvaRetentionDto } from './dto/create-customer-iva-retention.dto';
import { RegisterVoucherDto } from './dto/register-voucher.dto';

@Controller('customer-iva-retentions')
@UseGuards(AuthGuard('jwt'))
export class CustomerIvaRetentionsController {
  constructor(private readonly service: CustomerIvaRetentionsService) {}

  @Get()
  findAll(
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.findAll({ status, search, from, to });
  }

  @Get('pending-count')
  pendingCount() {
    return this.service.pendingCount();
  }

  @Post()
  create(@Body() dto: CreateCustomerIvaRetentionDto, @Request() req: any) {
    return this.service.create(dto, req.user.id);
  }

  @Patch(':id/voucher')
  registerVoucher(@Param('id') id: string, @Body() dto: RegisterVoucherDto, @Request() req: any) {
    return this.service.registerVoucher(id, dto, req.user.id);
  }

  @Patch(':id/cancel')
  cancel(@Param('id') id: string, @Request() req: any) {
    return this.service.cancel(id, req.user.role);
  }
}
