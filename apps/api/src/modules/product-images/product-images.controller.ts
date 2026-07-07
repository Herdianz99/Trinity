import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { ModuleGuard } from '../../common/guards/module.guard';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ProductImagesService } from './product-images.service';
import { UploadProductImageDto } from './dto/upload-product-image.dto';

@ApiTags('ProductImages')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), ModuleGuard)
@Controller('products/:productId/images')
export class ProductImagesController {
  constructor(private service: ProductImagesService) {}

  @Get()
  list(@Param('productId') productId: string) {
    return this.service.list(productId);
  }

  @Post()
  @RequireModule('catalog')
  upload(
    @Param('productId') productId: string,
    @Body() dto: UploadProductImageDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.upload(productId, dto.image, userId);
  }

  @Patch(':imageId/primary')
  @RequireModule('catalog')
  setPrimary(@Param('productId') productId: string, @Param('imageId') imageId: string) {
    return this.service.setPrimary(productId, imageId);
  }

  @Delete(':imageId')
  @RequireModule('catalog')
  remove(@Param('productId') productId: string, @Param('imageId') imageId: string) {
    return this.service.remove(productId, imageId);
  }
}
