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
import { SupplierAdvancesService } from './supplier-advances.service';
import { SupplierAdvancePdfService } from './supplier-advance-pdf.service';
import { CreateSupplierAdvanceDto } from './dto/create-supplier-advance.dto';

@Controller('supplier-advances')
@UseGuards(AuthGuard('jwt'))
export class SupplierAdvancesController {
  constructor(
    private readonly service: SupplierAdvancesService,
    private readonly pdfService: SupplierAdvancePdfService,
  ) {}

  @Post()
  create(
    @Body() dto: CreateSupplierAdvanceDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.create(dto, userId);
  }

  @Get()
  findAll(
    @Query('supplierId') supplierId?: string,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('reference') reference?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.findAll({
      supplierId,
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
    @Query('supplierId') supplierId?: string,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('reference') reference?: string,
  ) {
    const buffer = await this.pdfService.generateReport({ supplierId, status, from, to, reference });
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="anticipos-cxp.pdf"`,
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

  @Get('supplier/:supplierId')
  findBySupplier(@Param('supplierId') supplierId: string) {
    return this.service.findBySupplier(supplierId);
  }

  // Detalle JSON de un anticipo (con historial de consumo) para la pagina de detalle.
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Body('dynamicKey') dynamicKey: string) {
    return this.service.remove(id, dynamicKey);
  }
}
