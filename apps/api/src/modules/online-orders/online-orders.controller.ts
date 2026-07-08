import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ModuleGuard } from '../../common/guards/module.guard';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { OnlineOrdersService } from './online-orders.service';
import { UpdateOnlineOrderDto } from './dto/update-online-order.dto';

@ApiTags('Online Orders')
@ApiBearerAuth()
@Controller('online-orders')
@UseGuards(AuthGuard('jwt'), ModuleGuard)
@RequireModule('store')
export class OnlineOrdersController {
  constructor(private service: OnlineOrdersService) {}

  @Get()
  findAll(@Query('status') status?: string) {
    return this.service.findAll(status);
  }

  @Get('pending-count')
  pendingCount() {
    return this.service.pendingCount();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateOnlineOrderDto) {
    return this.service.update(id, dto);
  }

  @Patch(':id/confirm')
  confirm(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.confirm(id, userId);
  }

  @Patch(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.service.cancel(id);
  }
}
