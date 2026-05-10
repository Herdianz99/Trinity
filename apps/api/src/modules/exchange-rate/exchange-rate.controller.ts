import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ExchangeRateService } from './exchange-rate.service';
import { CreateExchangeRateDto } from './dto/create-exchange-rate.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

@Controller('exchange-rate')
@UseGuards(AuthGuard('jwt'))
export class ExchangeRateController {
  constructor(private readonly service: ExchangeRateService) {}

  @Get('today')
  getToday() {
    return this.service.getToday();
  }

  @Get('by-date')
  getByDate(@Query('date') date: string) {
    return this.service.getByDate(date);
  }

  @Get('fetch-bcv')
  async fetchBcv() {
    const rate = await this.service.fetchFromBcv();
    return { rate };
  }

  @Get()
  getHistory(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.getHistory({ from, to });
  }

  @Post()
  create(
    @Body() dto: CreateExchangeRateDto,
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    return this.service.create(dto, user);
  }
}
