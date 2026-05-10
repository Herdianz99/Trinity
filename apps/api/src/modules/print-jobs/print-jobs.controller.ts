import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PrintJobsService } from './print-jobs.service';

@ApiTags('Print Jobs')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('print-jobs')
export class PrintJobsController {
  constructor(private readonly service: PrintJobsService) {}

  @Get('pending')
  findPending(@Query('printAreaId') printAreaId: string) {
    return this.service.findPending(printAreaId);
  }

  @Patch(':id/printed')
  markPrinted(@Param('id') id: string) {
    return this.service.markPrinted(id);
  }
}
