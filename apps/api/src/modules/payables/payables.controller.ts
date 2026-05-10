import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PayablesService } from './payables.service';
import { QueryPayablesDto } from './dto/query-payables.dto';
import { PayPayableDto } from './dto/pay-payable.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('payables')
@UseGuards(AuthGuard('jwt'))
export class PayablesController {
  constructor(private readonly service: PayablesService) {}

  @Get('summary')
  summary() {
    return this.service.summary();
  }

  @Get('supplier/:supplierId')
  findBySupplier(@Param('supplierId') supplierId: string) {
    return this.service.findBySupplier(supplierId);
  }

  @Get()
  findAll(@Query() query: QueryPayablesDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post(':id/pay')
  pay(
    @Param('id') id: string,
    @Body() dto: PayPayableDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.pay(id, dto, user.id);
  }
}
