import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PayablesService } from './payables.service';
import { QueryPayablesDto } from './dto/query-payables.dto';

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
}
