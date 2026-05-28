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
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RetentionVouchersService } from './retention-vouchers.service';
import { CreateRetentionVoucherDto } from './dto/create-retention-voucher.dto';
import { UpdateRetentionVoucherDto } from './dto/update-retention-voucher.dto';
import { IssueRetentionDto } from './dto/issue-retention.dto';

@Controller('retention-vouchers')
@UseGuards(AuthGuard('jwt'))
export class RetentionVouchersController {
  constructor(private readonly service: RetentionVouchersService) {}

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
  getPdf(@Param('id') id: string) {
    return this.service.getPdfData(id);
  }
}
