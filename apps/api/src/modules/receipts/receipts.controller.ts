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
import { ReceiptsService } from './receipts.service';
import { ReceiptPdfService } from './receipt-pdf.service';
import { CreateReceiptDto } from './dto/create-receipt.dto';
import { PostReceiptDto } from './dto/post-receipt.dto';
import { QueryReceiptsDto } from './dto/query-receipts.dto';

@ApiTags('Receipts')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('receipts')
export class ReceiptsController {
  constructor(
    private readonly receiptsService: ReceiptsService,
    private readonly pdfService: ReceiptPdfService,
  ) {}

  @Get()
  findAll(@Query() query: QueryReceiptsDto) {
    return this.receiptsService.findAll(query);
  }

  @Get('pending-documents')
  getPendingDocuments(
    @Query('type') type: 'COLLECTION' | 'PAYMENT',
    @Query('entityId') entityId: string,
  ) {
    return this.receiptsService.getPendingDocuments(type, entityId);
  }

  @Get(':id/pdf')
  async getPdf(@Param('id') id: string, @Res() res: Response) {
    const buffer = await this.pdfService.generatePdf(id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="recibo-${id}.pdf"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.receiptsService.findOne(id);
  }

  @Post()
  create(
    @Body() dto: CreateReceiptDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.receiptsService.create(dto, userId);
  }

  @Post(':id/post')
  post(
    @Param('id') id: string,
    @Body() dto: PostReceiptDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.receiptsService.post(id, dto, userId);
  }

  @Patch(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.receiptsService.cancel(id);
  }
}
