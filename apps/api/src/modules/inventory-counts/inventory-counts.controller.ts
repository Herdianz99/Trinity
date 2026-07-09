import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Response } from 'express';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ModuleGuard } from '../../common/guards/module.guard';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { InventoryCountsService } from './inventory-counts.service';
import { InventoryCountsPdfService } from './inventory-counts-pdf.service';
import { CreateInventoryCountDto } from './dto/create-inventory-count.dto';
import { UpdateCountItemsDto } from './dto/update-count-items.dto';
import { AddItemsByFilterDto, AddItemsByIdsDto } from './dto/add-items.dto';
import { RemoveItemsDto } from './dto/remove-items.dto';

@ApiTags('Inventory Counts')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), ModuleGuard)
@RequireModule('inventory')
@Controller('inventory-counts')
export class InventoryCountsController {
  constructor(
    private readonly inventoryCountsService: InventoryCountsService,
    private readonly pdfService: InventoryCountsPdfService,
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

  @Get(':id/pdf-count-sheet')
  @ApiQuery({ name: 'stock', required: false })
  async getPdfCountSheet(
    @Param('id') id: string,
    @Res() res: Response,
    @Query('stock') stock?: string,
  ) {
    const includeStock = stock === '1' || stock === 'true';
    const buffer = await this.pdfService.generateCountSheet(id, includeStock);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="conteo-${id}.pdf"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Get(':id/pdf-differences')
  async getPdfDifferences(@Param('id') id: string, @Res() res: Response) {
    const buffer = await this.pdfService.generateDifferencesReport(id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="diferencias-${id}.pdf"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.inventoryCountsService.findOne(id);
  }

  @Post(':id/items/by-filter')
  addItemsByFilter(
    @Param('id') id: string,
    @Body() dto: AddItemsByFilterDto,
  ) {
    return this.inventoryCountsService.addItemsByFilter(id, dto);
  }

  @Post(':id/items/by-ids')
  addItemsByIds(@Param('id') id: string, @Body() dto: AddItemsByIdsDto) {
    return this.inventoryCountsService.addItemsByIds(id, dto);
  }

  @Post(':id/items/remove')
  removeItems(@Param('id') id: string, @Body() dto: RemoveItemsDto) {
    return this.inventoryCountsService.removeItems(id, dto);
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

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPERVISOR)
  remove(@Param('id') id: string) {
    return this.inventoryCountsService.remove(id);
  }
}
