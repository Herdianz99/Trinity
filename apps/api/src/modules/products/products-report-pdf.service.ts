import { Injectable } from '@nestjs/common';
import * as PDFDocument from 'pdfkit';
import { PrismaService } from '../../prisma/prisma.service';
import { ProductsService } from './products.service';
import { QueryProductsDto } from './dto/query-products.dto';

// Reporte vertical de existencias por articulo: Codigo, Ref. Proveedor, Nombre, Existencias.
// Respeta los mismos filtros que la pantalla /inventory/articulos (search, inStock, etc.).
@Injectable()
export class ProductsReportPdfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly productsService: ProductsService,
  ) {}

  private async getCompanyName(): Promise<string> {
    const config = await this.prisma.companyConfig.findFirst();
    return config?.companyName || 'Trinity ERP';
  }

  private fmtQty(n: number): string {
    const rounded = Number.isInteger(n) ? n : Math.round(n * 100) / 100;
    return rounded.toLocaleString('es-VE', { maximumFractionDigits: 2 });
  }

  async generate(query: QueryProductsDto): Promise<Buffer> {
    const [company, items] = await Promise.all([
      this.getCompanyName(),
      this.productsService.reportList(query),
    ]);

    // Descripcion de los filtros aplicados, para dejar constancia en el encabezado.
    const filtros: string[] = [];
    if (query.search) filtros.push(`Busqueda: "${query.search}"`);
    filtros.push(query.inStock ? 'Solo con existencia' : 'Todos los articulos');
    const filtroText = filtros.join('  |  ');

    const doc = new PDFDocument({
      size: 'LETTER',
      layout: 'portrait',
      margins: { top: 40, bottom: 40, left: 40, right: 40 },
      bufferPages: true,
    });

    // Header
    doc.fontSize(16).font('Helvetica-Bold').fillColor('#000').text(company, 40, 40);
    doc.fontSize(12).font('Helvetica-Bold').text('Reporte de existencias por articulo', 40, 60);
    doc.fontSize(9).font('Helvetica').fillColor('#334155').text(filtroText, 40, 78);
    doc
      .text(`Generado: ${new Date().toLocaleDateString('es-VE')}  |  ${items.length} articulos`, 40, 90);
    doc.fillColor('#000');
    doc.moveTo(40, 106).lineTo(doc.page.width - 40, 106).stroke('#94a3b8');

    // Carta vertical: ancho util 40..572 (532 px).
    const columns = [
      { label: 'Codigo', x: 40, width: 80 },
      { label: 'Ref. Proveedor', x: 124, width: 90 },
      { label: 'Nombre', x: 218, width: 270 },
      { label: 'Existencias', x: 492, width: 80, align: 'right' as const },
    ];

    let y = 116;
    const drawHeaderRow = () => {
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#334155');
      for (const c of columns) doc.text(c.label, c.x, y, { width: c.width, align: c.align });
      doc.fillColor('#000');
      y += 14;
      doc.moveTo(40, y).lineTo(doc.page.width - 40, y).stroke('#e2e8f0');
      y += 4;
    };
    drawHeaderRow();

    doc.fontSize(8).font('Helvetica');
    if (items.length === 0) {
      doc.fillColor('#64748b').text('No se encontraron articulos con los filtros aplicados.', 40, y + 6, {
        width: doc.page.width - 80,
        align: 'center',
      });
      doc.fillColor('#000');
    }

    for (const it of items) {
      const values = [
        it.code,
        it.supplierRef || '—',
        it.name,
        this.fmtQty(it.stock),
      ];

      // Altura de la fila = la celda mas alta (el nombre puede ocupar 2+ lineas)
      let rowHeight = 12;
      for (let i = 0; i < columns.length; i++) {
        const h = doc.heightOfString(values[i] || '', { width: columns[i].width });
        if (h > rowHeight) rowHeight = h;
      }
      rowHeight += 4; // padding inferior

      if (y + rowHeight > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
        y = 40;
        drawHeaderRow();
        doc.fontSize(8).font('Helvetica');
      }

      doc.fillColor('#1e293b');
      for (let i = 0; i < columns.length; i++) {
        doc.text(values[i] || '', columns[i].x, y, { width: columns[i].width, align: columns[i].align, lineBreak: true });
      }
      doc.fillColor('#000');
      y += rowHeight;
    }

    // Paginacion: "Pagina X de Y" centrada al pie de cada pagina.
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      const oldBottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc
        .fontSize(8)
        .font('Helvetica')
        .fillColor('#64748b')
        .text(`Pagina ${i + 1} de ${range.count}`, 40, doc.page.height - 28, {
          align: 'center',
          width: doc.page.width - 80,
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
