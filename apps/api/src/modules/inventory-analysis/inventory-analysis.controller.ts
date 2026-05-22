import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { InventoryAnalysisService } from './inventory-analysis.service';

@ApiTags('Inventory Analysis')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('inventory-analysis')
export class InventoryAnalysisController {
  constructor(private readonly service: InventoryAnalysisService) {}

  @Get('abc')
  @ApiQuery({ name: 'from', required: true, description: 'Start date YYYY-MM-DD' })
  @ApiQuery({ name: 'to', required: true, description: 'End date YYYY-MM-DD' })
  getAbc(@Query('from') from: string, @Query('to') to: string) {
    return this.service.getAbcClassification(from, to);
  }

  @Get('rotation')
  @ApiQuery({ name: 'from', required: true })
  @ApiQuery({ name: 'to', required: true })
  getRotation(@Query('from') from: string, @Query('to') to: string) {
    return this.service.getRotation(from, to);
  }

  @Get('profitability')
  @ApiQuery({ name: 'from', required: true })
  @ApiQuery({ name: 'to', required: true })
  getProfitability(@Query('from') from: string, @Query('to') to: string) {
    return this.service.getProfitability(from, to);
  }

  @Get('summary')
  @ApiQuery({ name: 'from', required: true })
  @ApiQuery({ name: 'to', required: true })
  getSummary(@Query('from') from: string, @Query('to') to: string) {
    return this.service.getSummary(from, to);
  }

  @Get('purchase-suggestions')
  @ApiQuery({ name: 'from', required: true })
  @ApiQuery({ name: 'to', required: true })
  getPurchaseSuggestions(@Query('from') from: string, @Query('to') to: string) {
    return this.service.getPurchaseSuggestions(from, to);
  }
}
