import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as PDFDocument from 'pdfkit';

type Col = { label: string; x: number; width: number; align?: 'right' };

// PDF del Analisis de Inventario (pantalla /purchases/analysis). Documento landscape con
// una seccion por bloque: Resumen, Clasificacion ABC, Rotacion, Rentabilidad y Sugerencias.
// Los datos ya vienen calculados por InventoryAnalysisService (mismas fuentes que la UI).
@Injectable()
export class InventoryAnalysisExportPdfService {
  constructor(private readonly prisma: PrismaService) {}

  private async getCompanyName(): Promise<string> {
    const config = await this.prisma.companyConfig.findFirst().catch(() => null);
    return config?.companyName || 'Trinity ERP';
  }

  private fmt(n: number): string {
    return (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  private bottom(doc: any): number {
    return doc.page.height - doc.page.margins.bottom;
  }

  private drawTableHeader(doc: any, y: number, cols: Col[]): number {
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#334155');
    for (const c of cols) doc.text(c.label, c.x, y, { width: c.width, align: c.align });
    doc.fillColor('#000');
    y += 13;
    doc.moveTo(40, y).lineTo(doc.page.width - 40, y).stroke('#e2e8f0');
    return y + 4;
  }

  private drawRow(doc: any, y: number, cols: Col[], values: string[], bold = false): number {
    doc.fontSize(8).font(bold ? 'Helvetica-Bold' : 'Helvetica').fillColor('#1e293b');
    let rowH = 11;
    for (let i = 0; i < cols.length; i++) {
      if (cols[i].align === 'right') continue;
      const h = doc.heightOfString(values[i] || '', { width: cols[i].width });
      if (h > rowH) rowH = h;
    }
    for (let i = 0; i < cols.length; i++) {
      const opts: any = { width: cols[i].width };
      if (cols[i].align === 'right') { opts.align = 'right'; opts.lineBreak = false; }
      doc.text(values[i] || '', cols[i].x, y, opts);
    }
    doc.fillColor('#000');
    return y + Math.max(13, rowH + 2);
  }

  // Dibuja un titulo de seccion; si no cabe con al menos la cabecera de tabla, salta de pagina.
  private sectionTitle(doc: any, y: number, title: string): number {
    if (y + 40 > this.bottom(doc)) { doc.addPage(); y = 40; }
    else if (y > 114) y += 8;
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#0f172a').text(title, 40, y);
    doc.fillColor('#000');
    return y + 18;
  }

  // Renderiza una tabla generica con salto de pagina y re-dibujo de cabecera.
  private drawTable(doc: any, y: number, cols: Col[], rows: string[][]): number {
    y = this.drawTableHeader(doc, y, cols);
    for (const values of rows) {
      // Estimacion de alto para decidir salto de pagina antes de dibujar.
      let rowH = 11;
      for (let i = 0; i < cols.length; i++) {
        if (cols[i].align === 'right') continue;
        const h = doc.heightOfString(values[i] || '', { width: cols[i].width });
        if (h > rowH) rowH = h;
      }
      if (y + rowH + 2 > this.bottom(doc)) {
        doc.addPage();
        y = 40;
        y = this.drawTableHeader(doc, y, cols);
      }
      y = this.drawRow(doc, y, cols, values);
    }
    return y;
  }

  private rotationAlertLabel(p: any): string {
    const tags: string[] = [];
    if (p.reorderAlert) tags.push('Stock bajo');
    if (p.excessStockAlert) tags.push('Exceso');
    if (p.deadStockAlert) tags.push('Sin mov.');
    return tags.join(', ');
  }

  async generate(
    from: string,
    to: string,
    data: { summary: any; abc: any[]; rotation: any[]; profitability: any[]; suggestions: any },
  ): Promise<Buffer> {
    const company = await this.getCompanyName();
    const { summary, abc, rotation, profitability, suggestions } = data;
    const doc = new PDFDocument({
      size: 'LETTER', layout: 'landscape',
      margins: { top: 40, bottom: 40, left: 40, right: 40 }, bufferPages: true,
    });

    // ── Header ──
    doc.fontSize(16).font('Helvetica-Bold').text(company, 40, 40);
    doc.fontSize(12).font('Helvetica-Bold').text('Analisis de Inventario', 40, 60);
    doc.fontSize(9).font('Helvetica').text(`Periodo: ${from} a ${to}`, 40, 76);
    doc.text(`Generado: ${new Date().toLocaleDateString('es-VE')}`, 40, 88);
    doc.moveTo(40, 104).lineTo(doc.page.width - 40, 104).stroke('#94a3b8');
    let y = 114;

    // ── Resumen (KPIs) ──
    if (summary) {
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#0f172a');
      doc.text(`Productos: ${summary.totalProducts}`, 40, y);
      doc.text(`Valor inventario: $${this.fmt(summary.totalInventoryValueUsd)}`, 200, y);
      doc.text(`Con alerta: ${summary.productsWithAlert}`, 420, y);
      doc.text(`Stock muerto: ${summary.deadStockProducts}`, 560, y);
      y += 14;
      doc.font('Helvetica').fillColor('#475569');
      doc.text(
        `Clase A: ${summary.classA?.count ?? 0} (${(summary.classA?.salesPct ?? 0).toFixed(1)}%)   ` +
        `Clase B: ${summary.classB?.count ?? 0} (${(summary.classB?.salesPct ?? 0).toFixed(1)}%)   ` +
        `Clase C: ${summary.classC?.count ?? 0} (${(summary.classC?.salesPct ?? 0).toFixed(1)}%)`,
        40, y,
      );
      doc.fillColor('#000');
      y += 16;
    }

    // ── Clasificacion ABC ──
    y = this.sectionTitle(doc, y, 'Clasificacion ABC');
    const abcCols: Col[] = [
      { label: 'Clase', x: 40, width: 34 },
      { label: 'Codigo', x: 74, width: 70 },
      { label: 'Producto', x: 144, width: 180 },
      { label: 'Categoria', x: 324, width: 90 },
      { label: 'Ventas USD', x: 414, width: 70, align: 'right' },
      { label: 'Uds', x: 484, width: 40, align: 'right' },
      { label: '% tot', x: 524, width: 44, align: 'right' },
      { label: '% acum', x: 568, width: 44, align: 'right' },
      { label: 'Stock', x: 612, width: 40, align: 'right' },
      { label: 'Margen%', x: 652, width: 48, align: 'right' },
      { label: 'Valor inv', x: 700, width: 52, align: 'right' },
    ];
    y = this.drawTable(doc, y, abcCols, (abc || []).map((p) => [
      p.classification, p.productCode, p.productName, p.category,
      `$${this.fmt(p.totalSalesUsd)}`, String(p.totalUnitsSold),
      `${p.salesPct.toFixed(1)}%`, `${p.cumulativePct.toFixed(1)}%`,
      String(p.currentStock), `${p.grossMarginPct.toFixed(1)}%`, `$${this.fmt(p.inventoryValueUsd)}`,
    ]));

    // ── Rotacion ──
    y = this.sectionTitle(doc, y, 'Rotacion');
    const rotCols: Col[] = [
      { label: 'Codigo', x: 40, width: 70 },
      { label: 'Producto', x: 110, width: 200 },
      { label: 'Categoria', x: 310, width: 90 },
      { label: 'Stock', x: 400, width: 40, align: 'right' },
      { label: 'Min', x: 440, width: 34, align: 'right' },
      { label: 'Ventas', x: 474, width: 48, align: 'right' },
      { label: 'Rotac.', x: 522, width: 48, align: 'right' },
      { label: 'Dias inv', x: 570, width: 44, align: 'right' },
      { label: 'Vta/dia', x: 614, width: 44, align: 'right' },
      { label: 'Valor inv', x: 658, width: 50, align: 'right' },
      { label: 'Alerta', x: 708, width: 44 },
    ];
    y = this.drawTable(doc, y, rotCols, (rotation || []).map((p) => [
      p.productCode, p.productName, p.category, String(p.currentStock), String(p.minStock),
      String(p.unitsSold), `${p.rotationRate.toFixed(1)}x`,
      p.daysOfInventory > 9000 ? '∞' : String(p.daysOfInventory),
      p.dailySalesAvg.toFixed(1), `$${this.fmt(p.inventoryValueUsd)}`, this.rotationAlertLabel(p),
    ]));

    // ── Rentabilidad ──
    y = this.sectionTitle(doc, y, 'Rentabilidad');
    const profCols: Col[] = [
      { label: 'Codigo', x: 40, width: 70 },
      { label: 'Producto', x: 110, width: 220 },
      { label: 'Categoria', x: 330, width: 110 },
      { label: 'Ventas USD', x: 440, width: 70, align: 'right' },
      { label: 'Costo USD', x: 510, width: 66, align: 'right' },
      { label: 'Ganancia', x: 576, width: 66, align: 'right' },
      { label: 'Margen%', x: 642, width: 48, align: 'right' },
      { label: 'Uds', x: 690, width: 62, align: 'right' },
    ];
    y = this.drawTable(doc, y, profCols, (profitability || []).map((p) => [
      p.productCode, p.productName, p.category, `$${this.fmt(p.revenue)}`, `$${this.fmt(p.cost)}`,
      `$${this.fmt(p.grossProfit)}`, `${p.grossMarginPct.toFixed(1)}%`, String(p.unitsSold),
    ]));
    if ((profitability || []).length > 0) {
      const tRev = profitability.reduce((s: number, p: any) => s + p.revenue, 0);
      const tCost = profitability.reduce((s: number, p: any) => s + p.cost, 0);
      const tProfit = profitability.reduce((s: number, p: any) => s + p.grossProfit, 0);
      if (y + 16 > this.bottom(doc)) { doc.addPage(); y = 40; }
      y += 2;
      doc.moveTo(40, y).lineTo(doc.page.width - 40, y).stroke('#94a3b8');
      y += 4;
      y = this.drawRow(doc, y, profCols, [
        'TOTAL', '', '', `$${this.fmt(tRev)}`, `$${this.fmt(tCost)}`, `$${this.fmt(tProfit)}`, '', '',
      ], true);
    }

    // ── Sugerencias de compra ──
    y = this.sectionTitle(doc, y, 'Sugerencias de compra');
    const sugCols: Col[] = [
      { label: 'Codigo', x: 40, width: 70 },
      { label: 'Producto', x: 110, width: 250 },
      { label: 'Stock', x: 360, width: 50, align: 'right' },
      { label: 'Min', x: 410, width: 50, align: 'right' },
      { label: 'Sugerido', x: 460, width: 60, align: 'right' },
      { label: 'Costo unit', x: 520, width: 80, align: 'right' },
      { label: 'Costo total', x: 600, width: 90, align: 'right' },
    ];
    const suppliers = suggestions?.suppliers || [];
    if (suppliers.length === 0) {
      doc.fontSize(9).font('Helvetica').fillColor('#64748b')
        .text('No hay productos bajo stock minimo en este periodo.', 40, y);
      doc.fillColor('#000');
      y += 16;
    } else {
      for (const g of suppliers) {
        if (y + 46 > this.bottom(doc)) { doc.addPage(); y = 40; }
        y += 4;
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#0f766e')
          .text(`${g.supplierName}  —  $${this.fmt(g.totalEstimated)}  (${(g.items || []).length} prod.)`, 40, y);
        doc.fillColor('#000');
        y += 15;
        y = this.drawTable(doc, y, sugCols, (g.items || []).map((it: any) => [
          it.productCode, it.productName, String(it.currentStock), String(it.minStock),
          String(it.suggestedQty), `$${this.fmt(it.costUsd)}`, `$${this.fmt(it.estimatedCost)}`,
        ]));
      }
      if (y + 16 > this.bottom(doc)) { doc.addPage(); y = 40; }
      y += 2;
      doc.moveTo(40, y).lineTo(doc.page.width - 40, y).stroke('#94a3b8');
      y += 5;
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#0f766e')
        .text(`Inversion total estimada: $${this.fmt(suggestions.grandTotal)}`, 40, y, {
          width: doc.page.width - 80, align: 'right',
        });
      doc.fillColor('#000');
    }

    // ── Paginacion "Pagina X de Y" ──
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      const oldBottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc.fontSize(8).font('Helvetica').fillColor('#64748b')
        .text(`Pagina ${i + 1} de ${range.count}`, 40, doc.page.height - 28, {
          align: 'center', width: doc.page.width - 80,
        });
      doc.fillColor('#000');
      doc.page.margins.bottom = oldBottom;
    }

    doc.end();
    return new Promise((resolve) => {
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
    });
  }
}
