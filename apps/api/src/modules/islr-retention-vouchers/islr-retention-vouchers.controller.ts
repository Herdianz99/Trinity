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
import { IslrRetentionVouchersService } from './islr-retention-vouchers.service';
import { IslrRetentionVouchersPdfService } from './islr-retention-vouchers-pdf.service';
import { CreateIslrRetentionVoucherDto } from './dto/create-islr-retention-voucher.dto';
import { UpdateIslrRetentionVoucherDto } from './dto/update-islr-retention-voucher.dto';
import { IssueIslrRetentionDto } from './dto/issue-islr-retention.dto';

@Controller('islr-retention-vouchers')
@UseGuards(AuthGuard('jwt'))
export class IslrRetentionVouchersController {
  constructor(
    private readonly service: IslrRetentionVouchersService,
    private readonly pdfService: IslrRetentionVouchersPdfService,
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

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateIslrRetentionVoucherDto, @Request() req: any) {
    return this.service.create(dto, req.user.id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateIslrRetentionVoucherDto,
    @Request() req: any,
  ) {
    return this.service.update(id, dto, req.user.id);
  }

  @Patch(':id/issue')
  issue(
    @Param('id') id: string,
    @Body() dto: IssueIslrRetentionDto,
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
      'Content-Disposition': `inline; filename="retencion-islr-${id}.pdf"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }
}
