import { Controller, Get, Post, Body, Patch, Delete, Param, Query, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { UserRole } from '@prisma/client';
import { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ModuleGuard } from '../../common/guards/module.guard';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { PayrollRunsService } from './payroll-runs.service';
import { PayrollPdfService } from './payroll-pdf.service';
import { CreatePayrollRunDto } from './dto/create-payroll-run.dto';
import { UpdatePayrollLinesDto } from './dto/update-payroll-lines.dto';
import { UpdatePayrollRunDto } from './dto/update-payroll-run.dto';
import { SendReceiptsDto } from './dto/send-receipts.dto';

@ApiTags('Payroll - Runs')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), ModuleGuard)
@RequireModule('payroll')
@Controller('payroll-runs')
export class PayrollRunsController {
  constructor(
    private service: PayrollRunsService,
    private pdf: PayrollPdfService,
  ) {}

  @Post()
  create(@Body() dto: CreatePayrollRunDto, @CurrentUser() user: { id: string; email: string; role: UserRole }) {
    return this.service.create(dto, user.id);
  }

  @Get()
  findAll(@Query() query: { status?: string; type?: string }) {
    return this.service.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id/lines')
  updateLines(@Param('id') id: string, @Body() dto: UpdatePayrollLinesDto) {
    return this.service.updateLines(id, dto);
  }

  // Editar cabecera: fecha de la tasa y/o la tasa. Recalcula todos los Bs de la corrida.
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePayrollRunDto) {
    return this.service.update(id, dto);
  }

  @Post(':id/sync-employees')
  syncEmployees(@Param('id') id: string) {
    return this.service.syncEmployees(id);
  }

  @Post(':id/close')
  close(@Param('id') id: string, @CurrentUser() user: { id: string; email: string; role: UserRole }) {
    return this.service.close(id, user.id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  // Envía por correo el recibo PDF individual de cada empleado con email (o solo lineIds si se indican).
  @Post(':id/send-receipts')
  sendReceipts(@Param('id') id: string, @Body() dto: SendReceiptsDto) {
    return this.service.sendReceipts(id, dto);
  }

  // ------- PDFs -------

  @Get(':id/relation/pdf')
  async relationPdf(@Param('id') id: string, @Res() res: Response) {
    const buffer = await this.pdf.generateRelation(id);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="relacion-nomina-${id}.pdf"`, 'Content-Length': buffer.length });
    res.end(buffer);
  }

  // overtime=false genera los recibos SIN horas extra (total/neto solo salario + deducciones).
  @Get(':id/receipts/pdf')
  async receiptsPdf(@Param('id') id: string, @Query('overtime') overtime: string, @Res() res: Response) {
    const buffer = await this.pdf.generateAllReceipts(id, overtime !== 'false');
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="recibos-nomina-${id}.pdf"`, 'Content-Length': buffer.length });
    res.end(buffer);
  }

  @Get(':id/receipt/:lineId/pdf')
  async receiptPdf(@Param('id') id: string, @Param('lineId') lineId: string, @Query('overtime') overtime: string, @Res() res: Response) {
    const buffer = await this.pdf.generateReceipt(id, lineId, overtime !== 'false');
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="recibo-${lineId}.pdf"`, 'Content-Length': buffer.length });
    res.end(buffer);
  }
}
