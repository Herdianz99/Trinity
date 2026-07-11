import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ModuleGuard } from '../../common/guards/module.guard';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { DispatchService } from './dispatch.service';
import { CreateDispatchDto } from './dto/create-dispatch.dto';
import { UpdateDispatchDto } from './dto/update-dispatch.dto';
import { DeliverDispatchDto } from './dto/deliver-dispatch.dto';

@ApiTags('Dispatch')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), ModuleGuard)
@RequireModule('commands', 'inventory', 'inventory-consult')
@Controller('dispatches')
export class DispatchController {
  constructor(private readonly service: DispatchService) {}

  @Post()
  create(@Body() dto: CreateDispatchDto, @CurrentUser() user: { id: string }) {
    return this.service.create(dto, user.id);
  }

  @Get()
  findAll(@Query('status') status?: string, @Query('search') search?: string) {
    return this.service.findAll({ status, search });
  }

  // Vista por artículos de una zona (tabs). Antes de :id para no ser capturada.
  @Get('items')
  getItems(@Query('printAreaId') printAreaId?: string, @Query('search') search?: string) {
    return this.service.getItems({ printAreaId, search });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateDispatchDto) {
    return this.service.update(id, dto);
  }

  @Post(':id/deliver')
  deliver(@Param('id') id: string, @Body() dto: DeliverDispatchDto, @CurrentUser() user: { id: string }) {
    return this.service.deliver(id, dto, user.id);
  }

  @Patch(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.service.cancel(id);
  }
}
