import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PrintJobsService } from './print-jobs.service';
import { ListPrintJobsDto } from './dto/list-print-jobs.dto';

@ApiTags('Print Jobs')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('print-jobs')
export class PrintJobsController {
  constructor(private readonly service: PrintJobsService) {}

  @Get()
  findAll(@Query() query: ListPrintJobsDto) {
    return this.service.findAll(query);
  }

  @Get('pending')
  findPending(@Query('printAreaId') printAreaId: string) {
    return this.service.findPending(printAreaId);
  }

  @Patch(':id/printed')
  markPrinted(@Param('id') id: string) {
    return this.service.markPrinted(id);
  }

  @Patch(':id/failed')
  markFailed(@Param('id') id: string, @Body() body: { reason?: string }) {
    return this.service.markFailed(id, body?.reason);
  }

  @Patch(':id/claim')
  claim(@Param('id') id: string) {
    return this.service.claim(id);
  }

  @Post('reprint/:invoiceId')
  reprint(@Param('invoiceId') invoiceId: string) {
    return this.service.reprintByInvoice(invoiceId);
  }

  @Post('reprint-note/:noteId')
  reprintNote(@Param('noteId') noteId: string) {
    return this.service.reprintByNote(noteId);
  }
}
