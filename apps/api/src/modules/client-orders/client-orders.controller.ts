import { Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { ModuleGuard } from '../../common/guards/module.guard';
import { ClientOrdersService } from './client-orders.service';

// Pedidos que los clientes montan en el portal, vistos desde la empresa.
@ApiTags('Pedidos de clientes')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), ModuleGuard)
@RequireModule('pedidos-clientes')
@Controller('client-orders')
export class ClientOrdersController {
  constructor(private service: ClientOrdersService) {}

  @Get('unseen-count')
  unseenCount(@CurrentUser() user: { id: string; role: UserRole }) {
    return this.service.unseenCount(user);
  }

  @Get()
  list(
    @CurrentUser('id') userId: string,
    @Query('sellerId') sellerId?: string,
    @Query('mine') mine?: string,
  ) {
    return this.service.list({ sellerId, mine: mine === 'true' }, userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id/seen')
  markSeen(@Param('id') id: string) {
    return this.service.markSeen(id);
  }
}
