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
import { ApiTags, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { LostSalesService } from './lost-sales.service';
import { CreateLostSaleDto } from './dto/create-lost-sale.dto';

@ApiTags('Lost Sales')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('lost-sales')
export class LostSalesController {
  constructor(private readonly service: LostSalesService) {}

  @Post()
  create(
    @Body() dto: CreateLostSaleDto,
    @CurrentUser() user: { id: string; email: string; role: UserRole },
  ) {
    return this.service.create(dto, user.id);
  }

  @Get()
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'reason', required: false })
  @ApiQuery({ name: 'productId', required: false })
  @ApiQuery({ name: 'createdById', required: false })
  findAll(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('reason') reason?: string,
    @Query('productId') productId?: string,
    @Query('createdById') createdById?: string,
  ) {
    return this.service.findAll({ from, to, reason, productId, createdById });
  }

  @Get('report')
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  report(@Query('from') from?: string, @Query('to') to?: string) {
    return this.service.report({ from, to });
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
