import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { DashboardService } from './dashboard.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('dashboard')
@UseGuards(AuthGuard('jwt'))
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get('gerencial')
  getGerencial(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.getGerencial(from, to);
  }

  @Get('vendedor')
  getVendedor(
    @CurrentUser() user: { id: string },
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.getVendedor(user.id, from, to);
  }
}
