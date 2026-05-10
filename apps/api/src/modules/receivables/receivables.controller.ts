import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ReceivablesService } from './receivables.service';
import { QueryReceivablesDto } from './dto/query-receivables.dto';
import { PayReceivableDto } from './dto/pay-receivable.dto';

@ApiTags('Receivables')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('receivables')
export class ReceivablesController {
  constructor(private readonly receivablesService: ReceivablesService) {}

  @Get()
  findAll(@Query() query: QueryReceivablesDto) {
    return this.receivablesService.findAll(query);
  }

  @Get('summary')
  summary() {
    return this.receivablesService.summary();
  }

  @Get('customer/:customerId')
  findByCustomer(@Param('customerId') customerId: string) {
    return this.receivablesService.findByCustomer(customerId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.receivablesService.findOne(id);
  }

  @Post(':id/pay')
  pay(
    @Param('id') id: string,
    @Body() dto: PayReceivableDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.receivablesService.pay(id, dto, userId);
  }
}
