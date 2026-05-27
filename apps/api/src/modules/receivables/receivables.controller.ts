import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { ReceivablesService } from './receivables.service';
import { QueryReceivablesDto } from './dto/query-receivables.dto';

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
}
