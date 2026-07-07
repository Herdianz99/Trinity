import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { UserRole } from '@prisma/client';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ProductImagesService } from './product-images.service';
import { UploadProductImageDto } from './dto/upload-product-image.dto';

@ApiTags('ProductImages')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('products/:productId/images')
export class ProductImagesController {
  constructor(private service: ProductImagesService) {}

  @Get()
  list(@Param('productId') productId: string) {
    return this.service.list(productId);
  }

  @Post()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.WAREHOUSE)
  upload(
    @Param('productId') productId: string,
    @Body() dto: UploadProductImageDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.upload(productId, dto.image, userId);
  }

  @Patch(':imageId/primary')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.WAREHOUSE)
  setPrimary(@Param('productId') productId: string, @Param('imageId') imageId: string) {
    return this.service.setPrimary(productId, imageId);
  }

  @Delete(':imageId')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.WAREHOUSE)
  remove(@Param('productId') productId: string, @Param('imageId') imageId: string) {
    return this.service.remove(productId, imageId);
  }
}
