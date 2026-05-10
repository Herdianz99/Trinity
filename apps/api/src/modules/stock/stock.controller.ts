import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { StockService } from './stock.service';
import { AdjustStockDto } from './dto/adjust-stock.dto';

@ApiTags('Stock')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('stock')
export class StockController {
  constructor(private readonly stockService: StockService) {}

  @Get()
  @ApiQuery({ name: 'warehouseId', required: false })
  @ApiQuery({ name: 'productId', required: false })
  @ApiQuery({ name: 'lowStock', required: false, type: Boolean })
  findAll(
    @Query('warehouseId') warehouseId?: string,
    @Query('productId') productId?: string,
    @Query('lowStock') lowStock?: string,
  ) {
    return this.stockService.findAll({
      warehouseId,
      productId,
      lowStock: lowStock === 'true',
    });
  }

  @Get('global')
  getGlobalStock() {
    return this.stockService.getGlobalStock();
  }

  @Get('low')
  getLowStock() {
    return this.stockService.getLowStock();
  }

  @Get('valuation')
  getValuation() {
    return this.stockService.getValuation();
  }

  @Post('adjust')
  adjust(
    @Body() dto: AdjustStockDto,
    @CurrentUser() user: { id: string; email: string; role: UserRole },
  ) {
    return this.stockService.adjust(dto, user);
  }
}
