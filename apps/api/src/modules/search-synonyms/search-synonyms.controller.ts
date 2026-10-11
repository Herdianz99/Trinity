import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { ModuleGuard } from '../../common/guards/module.guard';
import { CreateSynonymDto, PreviewSynonymDto, SetActiveDto, UpdateSynonymDto } from './dto/search-synonym.dto';
import { SearchSynonymsService } from './search-synonyms.service';

// Catalogo -> Sinonimos de busqueda (mismo permiso que categorias/marcas).
@ApiTags('Sinonimos de busqueda')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), ModuleGuard)
@RequireModule('catalog')
@Controller('search-synonyms')
export class SearchSynonymsController {
  constructor(private service: SearchSynonymsService) {}

  @Get()
  findAll(@Query('status') status?: string, @Query('search') search?: string) {
    return this.service.findAll(status, search);
  }

  @Post('preview')
  preview(@Body() dto: PreviewSynonymDto) {
    return this.service.preview(dto);
  }

  @Post('activate')
  setActive(@Body() dto: SetActiveDto) {
    return this.service.setActive(dto.ids, dto.isActive);
  }

  @Post()
  create(@Body() dto: CreateSynonymDto, @CurrentUser('id') userId: string) {
    return this.service.create(dto, userId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSynonymDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
