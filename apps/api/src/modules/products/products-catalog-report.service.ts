import { Injectable } from '@nestjs/common';
import * as PDFDocument from 'pdfkit';
import * as XLSX from 'xlsx';
import { PrismaService } from '../../prisma/prisma.service';
import { ProductsService } from './products.service';
import { QueryProductsDto } from './dto/query-products.dto';

// Reporte del catalogo de productos (pantalla /catalog/products) en PDF y Excel.
// Respeta EXACTAMENTE los mismos filtros que la tabla (search, categoria, marca, proveedor,
// stock bajo, solo desactivados, solo bloqueados para la venta) via catalogReportList.
@Injectable()
export class ProductsCatalogReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly productsService: ProductsService,
  ) {}

  private async getCompanyName(): Promise<string> {
    const config = await this.prisma.companyConfig.findFirst();
    return config?.companyName || 'Trinity ERP';
  }

  private fmtNum(n: number, dec = 2): string {
    return n.toLocaleString('es-VE', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }

  private fmtQty(n: number): string {
    const rounded = Number.isInteger(n) ? n : Math.round(n * 100) / 100;
    return rounded.toLocaleString('es-VE', { maximumFractionDigits: 2 });
  }

  // Descripcion de los filtros aplicados, para el encabezado.
  private filterText(query: QueryProductsDto): string {
    const f: string[] = [];
    if (query.search) f.push(`Busqueda: "${query.search}"`);
    if (query.lowStock) f.push('Solo stock bajo');
    if (query.inStock) f.push('Solo con existencia');
    if (query.isActive === false) f.push('Solo desactivados');
    if (query.saleBlocked) f.push('Solo bloqueados para la venta');
    return f.length ? f.join('  |  ') : 'Todos los articulos';
  }

  async generatePdf(query: QueryProductsDto): Promise<Buffer> {
    const [company, { items }] = await Promise.all([
      this.getCompanyName(),
      this.productsService.catalogReportList(query),
    ]);

    const doc = new PDFDocument({
      size: 'LETTER',
      layout: 'portrait',
      margins: { top: 40, bottom: 40, left: 40, right: 40 },
      bufferPages: true,
    });

    // Header
    doc.fontSize(16).font('Helvetica-Bold').fillColor('#000').text(company, 40, 40);
    doc.fontSize(12).font('Helvetica-Bold').text('Reporte de catalogo de productos', 40, 60);
    doc.fontSize(9).font('Helvetica').fillColor('#334155').text(this.filterText(query), 40, 78);
    doc.text(
      `Generado: ${new Date().toLocaleDateString('es-VE')}  |  ${items.length} articulos`,
      40,
      90,
    );
    doc.fillColor('#000');
    doc.moveTo(40, 106).lineTo(doc.page.width - 40, 106).stroke('#94a3b8');

    // Carta vertical: ancho util 40..572 (532 px).
    const columns = [
      { key: 'code', label: 'Codigo', x: 40, width: 66 },
      { key: 'supplierRef', label: 'Ref. Prov.', x: 108, width: 66 },
      { key: 'name', label: 'Nombre', x: 176, width: 210 },
      { key: 'cost', label: 'Costo $', x: 388, width: 60, align: 'right' as const },
      { key: 'priceDetal', label: 'Precio USD', x: 450, width: 66, align: 'right' as const },
      { key: 'stock', label: 'Stock', x: 518, width: 54, align: 'right' as const },
    ];

    let y = 116;
    const drawHeaderRow = () => {
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#334155');
      for (const c of columns) doc.text(c.label, c.x, y, { width: c.width, align: (c as any).align });
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
      const cells: Record<string, string> = {
        code: it.code,
        supplierRef: it.supplierRef || '—',
        name: it.name,
        cost: `$${this.fmtNum(it.cost)}`,
        priceDetal: `$${this.fmtNum(it.priceDetal)}`,
        stock: this.fmtQty(it.stock),
      };

      let rowHeight = 12;
      for (const c of columns) {
        const h = doc.heightOfString(cells[c.key] || '', { width: c.width });
        if (h > rowHeight) rowHeight = h;
      }
      rowHeight += 4;

      if (y + rowHeight > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
        y = 40;
        drawHeaderRow();
        doc.fontSize(8).font('Helvetica');
      }

      doc.fillColor('#1e293b');
      for (const c of columns) {
        doc.text(cells[c.key] || '', c.x, y, { width: c.width, align: (c as any).align, lineBreak: true });
      }
      doc.fillColor('#000');
      y += rowHeight;
    }

    // Paginacion al pie.
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

  async generateXlsx(query: QueryProductsDto): Promise<Buffer> {
    const { items, rate } = await this.productsService.catalogReportList(query);

    const rows = items.map((it) => ({
      'Codigo': it.code,
      'Ref. Proveedor': it.supplierRef,
      'Nombre': it.name,
      'Categoria': it.category,
      'Marca': it.brand,
      'Proveedor': it.supplier,
      'Costo USD': it.cost,
      'Precio USD': it.priceDetal,
      'Precio Mayor USD': it.priceMayor,
      'Precio Bs': rate > 0 ? it.priceDetalBs : '',
      'Stock': it.stock,
      'Estado': it.status,
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 12 }, { wch: 14 }, { wch: 40 }, { wch: 20 }, { wch: 18 },
      { wch: 22 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 12 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Catalogo');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }
}
