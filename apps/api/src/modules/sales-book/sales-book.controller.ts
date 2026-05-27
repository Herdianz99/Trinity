import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SalesBookService } from './sales-book.service';
import { CreateSalesBookEntryDto } from './dto/create-sales-book-entry.dto';
import { UpdateSalesBookEntryDto } from './dto/update-sales-book-entry.dto';
import { QueryFiscalDto } from '../fiscal/dto/query-fiscal.dto';

@Controller('sales-book')
@UseGuards(AuthGuard('jwt'))
export class SalesBookController {
  constructor(private readonly service: SalesBookService) {}

  @Get()
  findAll(@Query() query: QueryFiscalDto) {
    return this.service.findAll(query.from, query.to);
  }

  @Get('pdf')
  generatePdf(@Query() query: QueryFiscalDto) {
    return this.service.generatePdfData(query.from, query.to);
  }

  @Post()
  create(@Body() dto: CreateSalesBookEntryDto, @Request() req: any) {
    return this.service.create(dto, req.user.id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSalesBookEntryDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: any) {
    return this.service.remove(id, req.user.role);
  }
}
