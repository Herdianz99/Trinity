import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RetentionVouchersService } from './retention-vouchers.service';
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

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
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
