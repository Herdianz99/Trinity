import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { PrintAreasService } from './print-areas.service';
import { CreatePrintAreaDto } from './dto/create-print-area.dto';
import { UpdatePrintAreaDto } from './dto/update-print-area.dto';

@ApiTags('Print Areas')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('print-areas')
export class PrintAreasController {
  constructor(private printAreasService: PrintAreasService) {}

  @Post()
  create(@Body() dto: CreatePrintAreaDto) {
    return this.printAreasService.create(dto);
  }

  @Get()
  findAll() {
    return this.printAreasService.findAll();
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePrintAreaDto) {
    return this.printAreasService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.printAreasService.remove(id);
  }
}
