import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PurchaseBookService } from './purchase-book.service';
import { CreatePurchaseBookEntryDto } from './dto/create-purchase-book-entry.dto';
import { UpdatePurchaseBookEntryDto } from './dto/update-purchase-book-entry.dto';
import { QueryFiscalDto } from '../fiscal/dto/query-fiscal.dto';

@Controller('purchase-book')
@UseGuards(AuthGuard('jwt'))
export class PurchaseBookController {
  constructor(private readonly service: PurchaseBookService) {}

  @Get()
  findAll(@Query() query: QueryFiscalDto) {
    return this.service.findAll(query.from, query.to);
  }

  @Get('pdf')
  generatePdf(@Query() query: QueryFiscalDto) {
    return this.service.generatePdfData(query.from, query.to);
  }

  @Post()
  create(@Body() dto: CreatePurchaseBookEntryDto, @Request() req: any) {
    return this.service.create(dto, req.user.id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePurchaseBookEntryDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: any) {
    return this.service.remove(id, req.user.role);
  }
}
