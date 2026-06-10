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
import { IslrRetentionTypesService } from './islr-retention-types.service';
import { CreateIslrTypeDto } from './dto/create-islr-type.dto';
import { UpdateIslrTypeDto } from './dto/update-islr-type.dto';

@Controller('islr-retention-types')
@UseGuards(AuthGuard('jwt'))
export class IslrRetentionTypesController {
  constructor(private readonly service: IslrRetentionTypesService) {}

  @Get()
  findAll(@Query() query: { active?: string; supplierType?: string }) {
    return this.service.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateIslrTypeDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateIslrTypeDto) {
    return this.service.update(id, dto);
  }

  @Patch(':id/toggle')
  toggle(@Param('id') id: string) {
    return this.service.toggle(id);
  }
}
