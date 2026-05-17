import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreditDebitNotesService } from './credit-debit-notes.service';
import { CreditDebitNotesPdfService } from './credit-debit-notes-pdf.service';
import { CreateNoteDto } from './dto/create-note.dto';
import { QueryNotesDto } from './dto/query-notes.dto';

@ApiTags('credit-debit-notes')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('credit-debit-notes')
export class CreditDebitNotesController {
  constructor(
    private readonly service: CreditDebitNotesService,
    private readonly pdfService: CreditDebitNotesPdfService,
  ) {}

  @Get()
  findAll(@Query() query: QueryNotesDto) {
    return this.service.findAll(query);
  }

  @Get('invoice-return-summary/:invoiceId')
  invoiceReturnSummary(@Param('invoiceId') invoiceId: string) {
    return this.service.getInvoiceReturnSummary(invoiceId);
  }

  @Get('purchase-return-summary/:purchaseOrderId')
  purchaseReturnSummary(@Param('purchaseOrderId') purchaseOrderId: string) {
    return this.service.getPurchaseReturnSummary(purchaseOrderId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateNoteDto, @CurrentUser('id') userId: string) {
    return this.service.create(dto, userId);
  }

  @Post(':id/post')
  post(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.post(id, userId);
  }

  @Patch(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.service.cancel(id);
  }

  @Patch(':id/fiscal-printed')
  markFiscalPrinted(
    @Param('id') id: string,
    @Body() body: { fiscalNumber?: string; machineSerial?: string },
  ) {
    return this.service.markFiscalPrinted(id, body);
  }

  @Get(':id/pdf')
  async pdf(@Param('id') id: string, @Res() res: Response) {
    const buffer = await this.pdfService.generate(id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="nota-${id}.pdf"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }
}
