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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ModuleGuard } from '../../common/guards/module.guard';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { InventoryAdjustmentsService } from './inventory-adjustments.service';
import { InventoryAdjustmentsPdfService } from './inventory-adjustments-pdf.service';
import { CreateInventoryAdjustmentDto } from './dto/create-inventory-adjustment.dto';
import { UpdateAdjustmentItemsDto } from './dto/update-adjustment-items.dto';
import { AddItemsByFilterDto, AddItemsByIdsDto } from './dto/add-items.dto';
import { RemoveItemsDto } from './dto/remove-items.dto';
import { ProcessAdjustmentDto } from './dto/process-adjustment.dto';

@ApiTags('Inventory Adjustments')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), ModuleGuard)
@RequireModule('inventory')
@Controller('inventory-adjustments')
export class InventoryAdjustmentsController {
  constructor(
    private readonly inventoryAdjustmentsService: InventoryAdjustmentsService,
    private readonly pdfService: InventoryAdjustmentsPdfService,
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
  @ApiQuery({ name: 'search', required: false, description: 'Correlativo (ADJ-…) o destinatario (cliente/proveedor)' })
  @ApiQuery({ name: 'from', required: false, description: 'Desde (YYYY-MM-DD)' })
  @ApiQuery({ name: 'to', required: false, description: 'Hasta (YYYY-MM-DD)' })
  findAll(
    @Query('status') status?: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('type') type?: string,
    @Query('search') search?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.inventoryAdjustmentsService.findAll({
      status,
      warehouseId,
      type,
      search,
      from,
      to,
    });
  }

  @Get('report/grouped')
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'warehouseId', required: false })
  @ApiQuery({ name: 'type', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  async getGroupedReport(
    @Res() res: Response,
    @Query('status') status?: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('type') type?: string,
    @Query('search') search?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const buffer = await this.pdfService.generateGroupedReport({ status, warehouseId, type, search, from, to });
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="reporte-ajustes-por-destinataria.pdf"',
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.inventoryAdjustmentsService.findOne(id);
  }

  @Get(':id/pdf')
  async getPdf(@Param('id') id: string, @Res() res: Response) {
    const buffer = await this.pdfService.generateReport(id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="ajuste-${id}.pdf"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
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
    @Body() dto: ProcessAdjustmentDto,
    @CurrentUser() user: { id: string; email: string; role: UserRole },
  ) {
    return this.inventoryAdjustmentsService.process(id, user.id, dto);
  }

  @Patch(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.inventoryAdjustmentsService.cancel(id);
  }

  @Patch(':id/void')
  voidAdjustment(
    @Param('id') id: string,
    @Body('dynamicKey') dynamicKey: string | undefined,
    @CurrentUser() user: { id: string; email: string; role: UserRole },
  ) {
    return this.inventoryAdjustmentsService.voidAdjustment(id, user.id, dynamicKey);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.inventoryAdjustmentsService.remove(id);
  }
}
