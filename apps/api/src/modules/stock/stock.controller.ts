import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ModuleGuard } from '../../common/guards/module.guard';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { StockService } from './stock.service';
import { StockCountPdfService } from './stock-count-pdf.service';
import { AdjustStockDto } from './dto/adjust-stock.dto';

@ApiTags('Stock')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('stock')
export class StockController {
  constructor(
    private readonly stockService: StockService,
    private readonly countPdfService: StockCountPdfService,
  ) {}

  // Hoja de inventario físico (PDF) de un almacén específico, para imprimir y contar a mano.
  // Por defecto solo incluye productos con existencia (quantity != 0); con includeZero=true
  // se listan todos (incluidos los que están en 0).
  @Get('count-sheet/pdf')
  @ApiQuery({ name: 'warehouseId', required: true })
  @ApiQuery({ name: 'includeZero', required: false, type: Boolean })
  async getCountSheetPdf(
    @Query('warehouseId') warehouseId: string,
    @Query('includeZero') includeZero: string | undefined,
    @Res() res: Response,
  ) {
    const buffer = await this.countPdfService.generateCountSheet(warehouseId, includeZero === 'true');
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="inventario-almacen.pdf"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Get()
  @ApiQuery({ name: 'warehouseId', required: false })
  @ApiQuery({ name: 'productId', required: false })
  @ApiQuery({ name: 'lowStock', required: false, type: Boolean })
  findAll(
    @Query('warehouseId') warehouseId?: string,
    @Query('productId') productId?: string,
    @Query('lowStock') lowStock?: string,
  ) {
    return this.stockService.findAll({
      warehouseId,
      productId,
      lowStock: lowStock === 'true',
    });
  }

  // Stock global agregado por producto, paginado + busqueda (para ~10k productos).
  @Get('global')
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'brega', required: false, enum: ['all', 'yes', 'no'] })
  getGlobalStock(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('brega') brega?: 'all' | 'yes' | 'no',
  ) {
    return this.stockService.getGlobalStockPaged({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      search,
      brega,
    });
  }

  // Stock de un almacen especifico, paginado + busqueda.
  @Get('by-warehouse')
  @ApiQuery({ name: 'warehouseId', required: true })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'brega', required: false, enum: ['all', 'yes', 'no'] })
  getStockByWarehouse(
    @Query('warehouseId') warehouseId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('brega') brega?: 'all' | 'yes' | 'no',
  ) {
    return this.stockService.getStockByWarehousePaged({
      warehouseId,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      search,
      brega,
    });
  }

  // Resumen valorizado (SUM en SQL) para los KPIs, sin traer todas las filas.
  @Get('valuation-summary')
  @ApiQuery({ name: 'brega', required: false, enum: ['all', 'yes', 'no'] })
  @ApiQuery({ name: 'warehouseId', required: false })
  getValuationSummary(
    @Query('brega') brega?: 'all' | 'yes' | 'no',
    @Query('warehouseId') warehouseId?: string,
  ) {
    return this.stockService.getValuationSummary({ brega, warehouseId });
  }

  @Get('low-count')
  getLowStockCount() {
    return this.stockService.getLowStockCount();
  }

  @Get('low')
  getLowStock() {
    return this.stockService.getLowStock();
  }

  @Get('valuation')
  getValuation() {
    return this.stockService.getValuation();
  }

  @Post('adjust')
  @UseGuards(AuthGuard('jwt'), ModuleGuard)
  @RequireModule('inventory')
  adjust(
    @Body() dto: AdjustStockDto,
    @CurrentUser() user: { id: string; email: string; role: UserRole },
  ) {
    return this.stockService.adjust(dto, user);
  }
}
