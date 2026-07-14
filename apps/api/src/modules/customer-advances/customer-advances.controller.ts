import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CustomerAdvancesService } from './customer-advances.service';
import { CreateCustomerAdvanceDto } from './dto/create-customer-advance.dto';

@Controller('customer-advances')
@UseGuards(AuthGuard('jwt'))
export class CustomerAdvancesController {
  constructor(private readonly service: CustomerAdvancesService) {}

  @Post()
  create(
    @Body() dto: CreateCustomerAdvanceDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.create(dto, userId);
  }

  @Get()
  findAll(
    @Query('customerId') customerId?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.findAll({
      customerId,
      status,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('customer/:customerId')
  findByCustomer(@Param('customerId') customerId: string) {
    return this.service.findByCustomer(customerId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Body('dynamicKey') dynamicKey: string) {
    return this.service.remove(id, dynamicKey);
  }
}
