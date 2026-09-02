import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Response } from 'express';
import { InventoryAnalysisService } from './inventory-analysis.service';
import { InventoryAlertsPdfService } from './inventory-alerts-pdf.service';
import { InventoryAnalysisExportExcelService } from './inventory-analysis-export-excel.service';
import { InventoryAnalysisExportPdfService } from './inventory-analysis-export-pdf.service';

@ApiTags('Inventory Analysis')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('inventory-analysis')
export class InventoryAnalysisController {
  constructor(
    private readonly service: InventoryAnalysisService,
    private readonly alertsPdf: InventoryAlertsPdfService,
    private readonly exportExcel: InventoryAnalysisExportExcelService,
    private readonly exportPdf: InventoryAnalysisExportPdfService,
  ) {}

  // Junta las 5 secciones del analisis (mismas fuentes que la pantalla).
  private async gatherAnalysis(from: string, to: string) {
    const [summary, abc, rotation, profitability, suggestions] = await Promise.all([
      this.service.getSummary(from, to),
      this.service.getAbcClassification(from, to),
      this.service.getRotation(from, to),
      this.service.getProfitability(from, to),
      this.service.getPurchaseSuggestions(from, to),
    ]);
    return { summary, abc, rotation, profitability, suggestions };
  }

  @Get('export/excel')
  @ApiQuery({ name: 'from', required: true })
  @ApiQuery({ name: 'to', required: true })
  async exportExcelFile(
    @Query('from') from: string,
    @Query('to') to: string,
    @Res() res: Response,
  ) {
    const data = await this.gatherAnalysis(from, to);
    const buffer = await this.exportExcel.generate(from, to, data);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="analisis-inventario-${from}_${to}.xlsx"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Get('export/pdf')
  @ApiQuery({ name: 'from', required: true })
  @ApiQuery({ name: 'to', required: true })
  async exportPdfFile(
    @Query('from') from: string,
    @Query('to') to: string,
    @Res() res: Response,
  ) {
    const data = await this.gatherAnalysis(from, to);
    const buffer = await this.exportPdf.generate(from, to, data);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="analisis-inventario-${from}_${to}.pdf"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Get('abc')
  @ApiQuery({ name: 'from', required: true, description: 'Start date YYYY-MM-DD' })
  @ApiQuery({ name: 'to', required: true, description: 'End date YYYY-MM-DD' })
  getAbc(@Query('from') from: string, @Query('to') to: string) {
    return this.service.getAbcClassification(from, to);
  }

  @Get('rotation')
  @ApiQuery({ name: 'from', required: true })
  @ApiQuery({ name: 'to', required: true })
  getRotation(@Query('from') from: string, @Query('to') to: string) {
    return this.service.getRotation(from, to);
  }

  @Get('profitability')
  @ApiQuery({ name: 'from', required: true })
  @ApiQuery({ name: 'to', required: true })
  getProfitability(@Query('from') from: string, @Query('to') to: string) {
    return this.service.getProfitability(from, to);
  }

  @Get('summary')
  @ApiQuery({ name: 'from', required: true })
  @ApiQuery({ name: 'to', required: true })
  getSummary(@Query('from') from: string, @Query('to') to: string) {
    return this.service.getSummary(from, to);
  }

  @Get('manager-summary')
  @ApiQuery({ name: 'from', required: true })
  @ApiQuery({ name: 'to', required: true })
  getManagerSummary(@Query('from') from: string, @Query('to') to: string) {
    return this.service.getManagerSummary(from, to);
  }

  @Get('purchase-suggestions')
  @ApiQuery({ name: 'from', required: true })
  @ApiQuery({ name: 'to', required: true })
  getPurchaseSuggestions(@Query('from') from: string, @Query('to') to: string) {
    return this.service.getPurchaseSuggestions(from, to);
  }

  @Get('alerts')
  @ApiQuery({ name: 'from', required: true })
  @ApiQuery({ name: 'to', required: true })
  getAlerts(@Query('from') from: string, @Query('to') to: string) {
    return this.service.getInventoryAlerts(from, to);
  }

  @Get('alerts/pdf')
  @ApiQuery({ name: 'from', required: true })
  @ApiQuery({ name: 'to', required: true })
  @ApiQuery({ name: 'report', required: true, description: 'agotados | negativos | bajo-minimo | sin-rotacion | exceso | todos' })
  async getAlertsPdf(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('report') report: string,
    @Res() res: Response,
  ) {
    const { items } = await this.service.getInventoryAlerts(from, to);
    const filtered = this.filterByReport(items, report);
    const buffer = await this.alertsPdf.generate(report, filtered as any, `${from} a ${to}`);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="alertas-${report}.pdf"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  private filterByReport(items: any[], report: string): any[] {
    switch (report) {
      case 'agotados':
        return items.filter((i) => i.alerts.agotado);
      case 'negativos':
        return items.filter((i) => i.alerts.negativo);
      case 'bajo-minimo':
        return items.filter((i) => i.alerts.bajoMinimo);
      case 'sin-rotacion':
        return items.filter((i) => i.alerts.sinRotacion);
      case 'exceso':
        return items.filter((i) => i.alerts.exceso);
      default:
        return items.filter((i) => i.alerts.agotado || i.alerts.bajoMinimo || i.alerts.sinRotacion || i.alerts.exceso);
    }
  }
}
