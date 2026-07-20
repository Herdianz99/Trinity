import { Controller, Get, Post, Body, Patch, Param, Delete, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { UserRole } from '@prisma/client';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ModuleGuard } from '../../common/guards/module.guard';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { QueryProductsDto } from './dto/query-products.dto';
import { PurchaseAnalysisDto } from './dto/purchase-analysis.dto';
import { PurchaseAnalysisPdfService } from './purchase-analysis-pdf.service';
import { PriceAdjustmentQueryDto } from './dto/price-adjustment-query.dto';
import { ApplyPriceAdjustmentDto } from './dto/apply-price-adjustment.dto';
import { SetBarcodeDto } from './dto/set-barcode.dto';

@ApiTags('Products')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('products')
export class ProductsController {
  constructor(
    private productsService: ProductsService,
    private purchaseAnalysisPdf: PurchaseAnalysisPdfService,
  ) {}

  @Post()
  create(@Body() dto: CreateProductDto) {
    return this.productsService.create(dto);
  }

  @Get()
  findAll(@Query() query: QueryProductsDto) {
    return this.productsService.findAll(query);
  }

  @Get('search')
  search(@Query('q') q: string) {
    return this.productsService.search(q);
  }

  @Get('purchase-analysis')
  purchaseAnalysis(@Query() query: PurchaseAnalysisDto) {
    return this.productsService.purchaseAnalysis(query);
  }

  @Get('purchase-analysis/pdf')
  async purchaseAnalysisPdfReport(@Query() query: PurchaseAnalysisDto, @Res() res: Response) {
    const buffer = await this.purchaseAnalysisPdf.generate(query);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="analisis-de-compra.pdf"',
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Get('price-adjustment')
  findForPriceAdjustment(@Query() query: PriceAdjustmentQueryDto) {
    return this.productsService.findForPriceAdjustment(query);
  }

  @Post('price-adjustment')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  applyPriceAdjustment(
    @Body() dto: ApplyPriceAdjustmentDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.productsService.applyPriceAdjustment(dto, userId);
  }

  @Get('price-adjustment/history')
  getPriceAdjustmentHistory() {
    return this.productsService.getPriceAdjustmentHistory();
  }

  @Get('by-code/:code')
  findByCode(@Param('code') code: string) {
    return this.productsService.findByCode(code);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.productsService.findOne(id);
  }

  @Get(':id/purchases')
  findPurchaseHistory(
    @Param('id') id: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.productsService.findPurchaseHistory(id, Number(page) || 1, Number(limit) || 20);
  }

  @Patch(':id/barcode')
  @UseGuards(AuthGuard('jwt'), ModuleGuard)
  @RequireModule('catalog')
  setBarcode(@Param('id') id: string, @Body() dto: SetBarcodeDto) {
    return this.productsService.setBarcode(id, dto.barcode);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.productsService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.productsService.remove(id);
  }

  @Post('import')
  importProducts(@Body() products: CreateProductDto[]) {
    return this.productsService.importProducts(products);
  }
}
