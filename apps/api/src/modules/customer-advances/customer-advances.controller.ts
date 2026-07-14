import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CustomerAdvancesService } from './customer-advances.service';
import { CustomerAdvancePdfService } from './customer-advance-pdf.service';
import { CreateCustomerAdvanceDto } from './dto/create-customer-advance.dto';

@Controller('customer-advances')
@UseGuards(AuthGuard('jwt'))
export class CustomerAdvancesController {
  constructor(
    private readonly service: CustomerAdvancesService,
    private readonly pdfService: CustomerAdvancePdfService,
  ) {}

  @Post()
  create(
    @Body() dto: CreateCustomerAdvanceDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.create(dto, userId);
  }

  @Get()
  findAll(
    @Query('customerId') customerId?: string,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('reference') reference?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.findAll({
      customerId,
      status,
      from,
      to,
      reference,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  // Reporte PDF de la lista filtrada (declarar antes de :id/pdf para que no lo capture el param).
  @Get('report/pdf')
  async reportPdf(
    @Res() res: Response,
    @Query('customerId') customerId?: string,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('reference') reference?: string,
  ) {
    const buffer = await this.pdfService.generateReport({ customerId, status, from, to, reference });
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="anticipos-cxc.pdf"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  // PDF individual de un anticipo (comprobante + historial de consumo).
  @Get(':id/pdf')
  async onePdf(@Param('id') id: string, @Res() res: Response) {
    const buffer = await this.pdfService.generateOne(id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="anticipo-${id}.pdf"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Get('customer/:customerId')
  findByCustomer(@Param('customerId') customerId: string) {
    return this.service.findByCustomer(customerId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Body('dynamicKey') dynamicKey: string) {
    return this.service.remove(id, dynamicKey);
  }
}
