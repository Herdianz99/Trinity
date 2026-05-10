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
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { InventoryCountsService } from './inventory-counts.service';
import { CreateInventoryCountDto } from './dto/create-inventory-count.dto';
import { UpdateCountItemsDto } from './dto/update-count-items.dto';

@ApiTags('Inventory Counts')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('inventory-counts')
export class InventoryCountsController {
  constructor(
    private readonly inventoryCountsService: InventoryCountsService,
  ) {}

  @Post()
  create(
    @Body() dto: CreateInventoryCountDto,
    @CurrentUser() user: { id: string; email: string; role: UserRole },
  ) {
    return this.inventoryCountsService.create(dto, user.id);
  }

  @Get()
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'warehouseId', required: false })
  findAll(
    @Query('status') status?: string,
    @Query('warehouseId') warehouseId?: string,
  ) {
    return this.inventoryCountsService.findAll({ status, warehouseId });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.inventoryCountsService.findOne(id);
  }

  @Patch(':id/items')
  updateItems(@Param('id') id: string, @Body() dto: UpdateCountItemsDto) {
    return this.inventoryCountsService.updateItems(id, dto);
  }

  @Patch(':id/approve')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPERVISOR)
  approve(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; email: string; role: UserRole },
  ) {
    return this.inventoryCountsService.approve(id, user.id);
  }
}
