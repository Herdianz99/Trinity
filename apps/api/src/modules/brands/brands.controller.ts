import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { BrandsService } from './brands.service';
import { CreateBrandDto } from './dto/create-brand.dto';
import { UpdateBrandDto } from './dto/update-brand.dto';
import { UploadLogoDto } from './dto/upload-logo.dto';

@ApiTags('Brands')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('brands')
export class BrandsController {
  constructor(private brandsService: BrandsService) {}

  @Post()
  create(@Body() dto: CreateBrandDto) {
    return this.brandsService.create(dto);
  }

  @Get()
  findAll() {
    return this.brandsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.brandsService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateBrandDto) {
    return this.brandsService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.brandsService.remove(id);
  }

  @Post(':id/logo')
  uploadLogo(@Param('id') id: string, @Body() dto: UploadLogoDto) {
    return this.brandsService.uploadLogo(id, dto.image);
  }

  @Delete(':id/logo')
  removeLogo(@Param('id') id: string) {
    return this.brandsService.removeLogo(id);
  }
}
