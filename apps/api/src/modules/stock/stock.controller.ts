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

  @Get('global')
  getGlobalStock() {
    return this.stockService.getGlobalStock();
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
