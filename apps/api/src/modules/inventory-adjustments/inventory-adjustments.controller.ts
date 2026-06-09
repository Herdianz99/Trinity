import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { InventoryAdjustmentsService } from './inventory-adjustments.service';
import { CreateInventoryAdjustmentDto } from './dto/create-inventory-adjustment.dto';
import { UpdateAdjustmentItemsDto } from './dto/update-adjustment-items.dto';
import { AddItemsByFilterDto, AddItemsByIdsDto } from './dto/add-items.dto';
import { RemoveItemsDto } from './dto/remove-items.dto';

@ApiTags('Inventory Adjustments')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('inventory-adjustments')
export class InventoryAdjustmentsController {
  constructor(
    private readonly inventoryAdjustmentsService: InventoryAdjustmentsService,
  ) {}

  @Post()
  create(
    @Body() dto: CreateInventoryAdjustmentDto,
    @CurrentUser() user: { id: string; email: string; role: UserRole },
  ) {
    return this.inventoryAdjustmentsService.create(dto, user.id);
  }

  @Get()
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'warehouseId', required: false })
  @ApiQuery({ name: 'type', required: false })
  findAll(
    @Query('status') status?: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('type') type?: string,
  ) {
    return this.inventoryAdjustmentsService.findAll({
      status,
      warehouseId,
      type,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.inventoryAdjustmentsService.findOne(id);
  }

  @Post(':id/items/by-filter')
  addItemsByFilter(
    @Param('id') id: string,
    @Body() dto: AddItemsByFilterDto,
  ) {
    return this.inventoryAdjustmentsService.addItemsByFilter(id, dto);
  }

  @Post(':id/items/by-ids')
  addItemsByIds(@Param('id') id: string, @Body() dto: AddItemsByIdsDto) {
    return this.inventoryAdjustmentsService.addItemsByIds(id, dto);
  }

  @Post(':id/items/remove')
  removeItems(@Param('id') id: string, @Body() dto: RemoveItemsDto) {
    return this.inventoryAdjustmentsService.removeItems(id, dto);
  }

  @Patch(':id/items')
  updateItems(
    @Param('id') id: string,
    @Body() dto: UpdateAdjustmentItemsDto,
  ) {
    return this.inventoryAdjustmentsService.updateItems(id, dto);
  }

  @Patch(':id/process')
  process(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; email: string; role: UserRole },
  ) {
    return this.inventoryAdjustmentsService.process(id, user.id);
  }

  @Patch(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.inventoryAdjustmentsService.cancel(id);
  }
}
