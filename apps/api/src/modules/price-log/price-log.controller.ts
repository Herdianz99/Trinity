import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Response } from 'express';
import { PriceLogService, PriceLogQuery } from './price-log.service';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { ModuleGuard } from '../../common/guards/module.guard';

// Bitacora de costos y precios: solo lectura, permiso 'bitacora-precios' (muestra costos).
@Controller('price-log')
@UseGuards(AuthGuard('jwt'), ModuleGuard)
@RequireModule('bitacora-precios')
export class PriceLogController {
  constructor(private readonly service: PriceLogService) {}

  @Get()
  findAll(@Query() q: PriceLogQuery) {
    return this.service.findAll(q);
  }

  @Get('users')
  users() {
    return this.service.users();
  }

  @Get('export')
  async export(@Query() q: PriceLogQuery, @Res() res: Response) {
    const buffer = await this.service.exportExcel(q);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="bitacora-precios.xlsx"',
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Get('product/:productId')
  findByProduct(@Param('productId') productId: string, @Query() q: PriceLogQuery) {
    return this.service.findByProduct(productId, q);
  }
}
