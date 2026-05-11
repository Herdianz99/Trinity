import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { UserRole } from '@prisma/client';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { QueryProductsDto } from './dto/query-products.dto';
import { PriceAdjustmentQueryDto } from './dto/price-adjustment-query.dto';
import { ApplyPriceAdjustmentDto } from './dto/apply-price-adjustment.dto';

@ApiTags('Products')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('products')
export class ProductsController {
  constructor(private productsService: ProductsService) {}

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
  findPurchaseHistory(@Param('id') id: string) {
    return this.productsService.findPurchaseHistory(id);
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
