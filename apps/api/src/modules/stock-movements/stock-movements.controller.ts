import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Response } from 'express';
import { StockMovementsService } from './stock-movements.service';
import { StockMovementsPdfService } from './stock-movements-pdf.service';

@ApiTags('Stock Movements')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('stock-movements')
export class StockMovementsController {
  constructor(
    private readonly stockMovementsService: StockMovementsService,
    private readonly stockMovementsPdf: StockMovementsPdfService,
  ) {}

  @Get('kardex/:productId')
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getKardex(
    @Param('productId') productId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.stockMovementsService.getKardex(
      productId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  @Get()
  @ApiQuery({ name: 'productId', required: false })
  @ApiQuery({ name: 'warehouseId', required: false })
  @ApiQuery({ name: 'type', required: false })
  @ApiQuery({ name: 'supplierId', required: false, description: 'Proveedor de la ficha del producto' })
  @ApiQuery({ name: 'from', required: false, description: 'Date in ISO format (YYYY-MM-DD)' })
  @ApiQuery({ name: 'to', required: false, description: 'Date in ISO format (YYYY-MM-DD)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(
    @Query('productId') productId?: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('type') type?: string,
    @Query('supplierId') supplierId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.stockMovementsService.findAll({
      productId,
      warehouseId,
      type,
      supplierId,
      from,
      to,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('report/by-category')
  @ApiQuery({ name: 'productId', required: false })
  @ApiQuery({ name: 'warehouseId', required: false })
  @ApiQuery({ name: 'type', required: false })
  @ApiQuery({ name: 'supplierId', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  async reportByCategory(
    @Res() res: Response,
    @Query('productId') productId?: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('type') type?: string,
    @Query('supplierId') supplierId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const { groups, summary, totalCount } = await this.stockMovementsService.getGroupedByCategory({
      productId,
      warehouseId,
      type,
      supplierId,
      from,
      to,
    });
    const buffer = await this.stockMovementsPdf.generateByCategory(groups as any, summary, totalCount);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="movimientos-por-categoria.pdf"',
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }
}
