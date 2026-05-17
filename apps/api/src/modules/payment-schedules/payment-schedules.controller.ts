import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
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
import { PaymentSchedulesService } from './payment-schedules.service';
import { PaymentSchedulePdfService } from './payment-schedule-pdf.service';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { AddItemDto } from './dto/add-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Payment Schedules')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('payment-schedules')
export class PaymentSchedulesController {
  constructor(
    private readonly service: PaymentSchedulesService,
    private readonly pdfService: PaymentSchedulePdfService,
  ) {}

  @Get()
  findAll(
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('search') search?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.service.findAll({ status, from, to, search, page, limit });
  }

  @Get('pending-payables')
  getPendingPayables(
    @Query('supplierId') supplierId?: string,
    @Query('dueBefore') dueBefore?: string,
    @Query('search') search?: string,
  ) {
    return this.service.getPendingPayables({ supplierId, dueBefore, search });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(
    @Body() dto: CreateScheduleDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.create(dto, userId);
  }

  @Post(':id/items')
  addItem(
    @Param('id') id: string,
    @Body() dto: AddItemDto,
  ) {
    return this.service.addItem(id, dto);
  }

  @Delete(':id/items/:itemId')
  removeItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ) {
    return this.service.removeItem(id, itemId);
  }

  @Patch(':id/items/:itemId')
  updateItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateItemDto,
  ) {
    return this.service.updateItem(id, itemId, dto);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateStatusDto,
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    return this.service.updateStatus(id, dto.status, user);
  }

  @Get(':id/pdf')
  async pdf(@Param('id') id: string, @Res() res: Response) {
    const buffer = await this.pdfService.generate(id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="programacion-${id}.pdf"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }
}
