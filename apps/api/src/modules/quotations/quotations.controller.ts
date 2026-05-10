import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Response } from 'express';
import { QuotationsService } from './quotations.service';
import { QuotationPdfService } from './quotation-pdf.service';
import { CreateQuotationDto } from './dto/create-quotation.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Quotations')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('quotations')
export class QuotationsController {
  constructor(
    private readonly service: QuotationsService,
    private readonly pdfService: QuotationPdfService,
  ) {}

  @Get()
  findAll(
    @Query('status') status?: string,
    @Query('customerId') customerId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.service.findAll({ status, customerId, from, to, page, limit });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(
    @Body() dto: CreateQuotationDto,
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    return this.service.create(dto, user);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: CreateQuotationDto,
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    return this.service.update(id, dto, user);
  }

  @Patch(':id/status')
  changeStatus(
    @Param('id') id: string,
    @Body('status') status: string,
  ) {
    return this.service.changeStatus(id, status);
  }

  @Post(':id/convert')
  convert(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    return this.service.convertToInvoice(id, user);
  }

  @Get(':id/pdf')
  async getPdf(@Param('id') id: string, @Res() res: Response) {
    const buffer = await this.pdfService.generatePdf(id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="cotizacion-${id}.pdf"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }
}
