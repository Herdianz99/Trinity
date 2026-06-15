import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
  Res,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Response } from 'express';
import { RetentionVouchersService } from './retention-vouchers.service';
import { RetentionVouchersPdfService } from './retention-vouchers-pdf.service';
import { CreateRetentionVoucherDto } from './dto/create-retention-voucher.dto';
import { UpdateRetentionVoucherDto } from './dto/update-retention-voucher.dto';
import { IssueRetentionDto } from './dto/issue-retention.dto';

@Controller('retention-vouchers')
@UseGuards(AuthGuard('jwt'))
export class RetentionVouchersController {
  constructor(
    private readonly service: RetentionVouchersService,
    private readonly pdfService: RetentionVouchersPdfService,
  ) {}

  @Get()
  findAll(
    @Query()
    query: {
      status?: string;
      supplierId?: string;
      from?: string;
      to?: string;
      page?: string;
      limit?: string;
    },
  ) {
    return this.service.findAll(query);
  }

  @Get('available-orders/:supplierId')
  getAvailableOrders(@Param('supplierId') supplierId: string) {
    return this.service.getAvailablePurchaseOrders(supplierId);
  }

  @Get('txt')
  async exportTxt(
    @Query('from') from: string,
    @Query('to') to: string,
    @Res() res: Response,
  ) {
    const { content, filename } = await this.service.generateRetentionTxt(from, to);
    res.set({
      'Content-Type': 'text/plain; charset=windows-1252',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    res.send(Buffer.from(content, 'latin1'));
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateRetentionVoucherDto, @Request() req: any) {
    return this.service.create(dto, req.user.id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateRetentionVoucherDto,
    @Request() req: any,
  ) {
    return this.service.update(id, dto, req.user.id);
  }

  @Patch(':id/issue')
  issue(
    @Param('id') id: string,
    @Body() dto: IssueRetentionDto,
    @Request() req: any,
  ) {
    return this.service.issue(id, dto.issueDate, req.user.id);
  }

  @Patch(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.service.cancel(id);
  }

  @Get(':id/pdf')
  async getPdf(@Param('id') id: string, @Res() res: Response) {
    const buffer = await this.pdfService.generatePdf(id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="retencion-${id}.pdf"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }
}
