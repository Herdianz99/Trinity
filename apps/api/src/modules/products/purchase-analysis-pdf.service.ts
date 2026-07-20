import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ProductsService } from './products.service';
import { PurchaseAnalysisDto } from './dto/purchase-analysis.dto';
import * as PDFDocument from 'pdfkit';

// Carta vertical, area util 40..572 (ancho 532).
const COLS = [
  { label: 'Código', x: 40, width: 90 },
  { label: 'Producto', x: 130, width: 300 },
  { label: 'Existencia', x: 430, width: 70, align: 'right' as const },
  { label: 'Vendidas', x: 500, width: 72, align: 'right' as const },
];
const RIGHT = 572;

@Injectable()
export class PurchaseAnalysisPdfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductsService,
  ) {}

  private fmt(n: number): string {
    return (n ?? 0).toLocaleString('es-VE', { maximumFractionDigits: 2 });
  }

  // Trunca el texto al ancho de la columna (con "…"), midiendo con la fuente actual.
  private clip(doc: any, text: string, width: number): string {
    if (!text) return '';
    if (doc.widthOfString(text) <= width) return text;
    const ell = '…';
    let t = text;
    while (t.length > 0 && doc.widthOfString(t + ell) > width) t = t.slice(0, -1);
    return t + ell;
  }

  private headerRow(doc: any, y: number): number {
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#334155');
    for (const c of COLS) {
      const opts: any = { width: c.width };
      if (c.align === 'right') opts.align = 'right';
      doc.text(c.label, c.x, y, opts);
    }
    doc.fillColor('#000');
    y += 13;
    doc.moveTo(40, y).lineTo(RIGHT, y).stroke('#e2e8f0');
    return y + 4;
  }

  async generate(dto: PurchaseAnalysisDto): Promise<Buffer> {
    const analysis = await this.products.purchaseAnalysis(dto);
    const config = await this.prisma.companyConfig.findFirst();
    const company = config?.companyName || 'Trinity ERP';

    // Nombres de los filtros aplicados (para el encabezado).
    const [cat, brand, sup] = await Promise.all([
      dto.categoryId ? this.prisma.category.findUnique({ where: { id: dto.categoryId }, select: { name: true } }) : null,
      dto.brandId ? this.prisma.brand.findUnique({ where: { id: dto.brandId }, select: { name: true } }) : null,
      dto.supplierId ? this.prisma.supplier.findUnique({ where: { id: dto.supplierId }, select: { name: true } }) : null,
    ]);
    const filtros: string[] = [];
    filtros.push(`Categoría: ${cat?.name || 'Todas'}`);
    filtros.push(`Marca: ${brand?.name || 'Todas'}`);
    filtros.push(`Proveedor: ${sup?.name || 'Todos'}`);

    const doc = new PDFDocument({ size: 'LETTER', margins: { top: 40, bottom: 40, left: 40, right: 40 }, bufferPages: true });

    doc.fontSize(15).font('Helvetica-Bold').fillColor('#000').text(company, 40, 40);
    doc.fontSize(12).font('Helvetica-Bold').text('Análisis de compra', 40, 60);
    doc.fontSize(9).font('Helvetica').fillColor('#334155');
    doc.text(filtros.join('     '), 40, 80, { width: RIGHT - 40 });
    doc.text(`Período: ${analysis.from} a ${analysis.to}   |   ${analysis.onlyWithSales ? 'Solo con ventas' : 'Todos los artículos'}   |   ${analysis.totalProducts} artículos`, 40, 94, { width: RIGHT - 40 });
    doc.text(`Generado: ${new Date().toLocaleString('es-VE', { timeZone: 'America/Caracas' })}`, 40, 108);
    doc.fillColor('#000');
    doc.moveTo(40, 124).lineTo(RIGHT, 124).stroke('#94a3b8');
    let y = 132;

    y = this.headerRow(doc, y);

    doc.fontSize(8).font('Helvetica');
    for (const r of analysis.rows) {
      if (y > doc.page.height - doc.page.margins.bottom - 24) {
        doc.addPage();
        y = 40;
        y = this.headerRow(doc, y);
        doc.fontSize(8).font('Helvetica');
      }
      const values = [r.code || '—', r.name, this.fmt(r.stock), this.fmt(r.sold)];
      doc.fillColor('#1e293b');
      for (let i = 0; i < COLS.length; i++) {
        const opts: any = { width: COLS[i].width, lineBreak: false };
        let text = values[i] || '';
        if (COLS[i].align === 'right') opts.align = 'right';
        else text = this.clip(doc, text, COLS[i].width);
        doc.text(text, COLS[i].x, y, opts);
      }
      doc.fillColor('#000');
      y += 12;
    }

    // Totales
    doc.moveTo(40, y).lineTo(RIGHT, y).stroke('#cbd5e1');
    y += 4;
    doc.rect(40, y - 2, RIGHT - 40, 16).fill('#0f172a');
    doc.fillColor('#fff').fontSize(9).font('Helvetica-Bold');
    doc.text(`TOTAL (${analysis.totalProducts} artículos)`, 46, y + 1, { width: 300, lineBreak: false });
    doc.text(`Vendidas: ${this.fmt(analysis.totalSold)}`, COLS[2].x, y + 1, { width: RIGHT - COLS[2].x - 6, align: 'right' });
    doc.fillColor('#000');

    // Paginación
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      const oldBottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc.fontSize(8).font('Helvetica').fillColor('#64748b')
        .text(`Página ${i + 1} de ${range.count}`, 40, doc.page.height - 28, { align: 'center', width: doc.page.width - 80 });
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
