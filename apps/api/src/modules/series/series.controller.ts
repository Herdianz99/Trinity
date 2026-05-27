import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SeriesService } from './series.service';
import { CreateSerieDto } from './dto/create-serie.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '@prisma/client';

@Controller('series')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class SeriesController {
  constructor(private readonly seriesService: SeriesService) {}

  @Get()
  findAll(@Query('type') type?: string) {
    const validTypes = ['SALES', 'PURCHASES'] as const;
    const t = validTypes.includes(type as any) ? (type as 'SALES' | 'PURCHASES') : undefined;
    return this.seriesService.findAll(t);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.seriesService.findOne(id);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreateSerieDto) {
    return this.seriesService.create(dto);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  update(@Param('id') id: string, @Body() dto: CreateSerieDto) {
    return this.seriesService.update(id, dto);
  }

  @Patch(':id/toggle-active')
  @Roles(UserRole.ADMIN)
  toggleActive(@Param('id') id: string) {
    return this.seriesService.toggleActive(id);
  }
}
