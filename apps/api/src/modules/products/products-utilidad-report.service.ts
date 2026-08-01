import { Injectable } from '@nestjs/common';
import * as PDFDocument from 'pdfkit';
import * as XLSX from 'xlsx';
import { PrismaService } from '../../prisma/prisma.service';
import { ProductsService } from './products.service';
import { PriceAdjustmentQueryDto } from './dto/price-adjustment-query.dto';

// Reporte de UTILIDAD (pantalla /catalog/price-adjustment) en PDF y Excel.
// Respeta EXACTAMENTE los mismos filtros que la vista previa (categoria, subcategoria,
// marca, proveedor, brecha, costo min/max) via utilidadReportList.
@Injectable()
export class ProductsUtilidadReportService {
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

  // Bucket de utilidad — mismos rangos que el reporte manual usado hasta ahora.
  private rango(u: number): string {
    if (u <= 5) return '5% o menos';
    if (u <= 10) return '5% - 10%';
    if (u <= 15) return '10% - 15%';
    if (u <= 20) return '15% - 20%';
    if (u <= 25) return '20% - 25%';
    if (u <= 30) return '25% - 30%';
    if (u <= 40) return '30% - 40%';
    if (u <= 50) return '40% - 50%';
    if (u <= 75) return '50% - 75%';
    if (u <= 100) return '75% - 100%';
    return 'más de 100%';
  }

  // Descripcion de los filtros aplicados (resuelve nombres de marca/proveedor/categoria).
  private async filterText(query: PriceAdjustmentQueryDto): Promise<string> {
    const f: string[] = [];
    if (query.categoryId || query.subcategoryId) {
      const cat = await this.prisma.category.findUnique({
        where: { id: query.subcategoryId || query.categoryId },
        select: { name: true },
      });
      if (cat) f.push(`Categoria: ${cat.name}`);
    }
    if (query.brandId) {
      const b = await this.prisma.brand.findUnique({ where: { id: query.brandId }, select: { name: true } });
      if (b) f.push(`Marca: ${b.name}`);
    }
    if (query.supplierId) {
      const s = await this.prisma.supplier.findUnique({ where: { id: query.supplierId }, select: { name: true } });
      if (s) f.push(`Proveedor: ${s.name}`);
    }
    if (query.bregaApplies === 'true') f.push('Con brecha');
    else if (query.bregaApplies === 'false') f.push('Sin brecha');
    if (query.costMin !== undefined) f.push(`Costo >= $${this.fmtNum(query.costMin)}`);
    if (query.costMax !== undefined) f.push(`Costo <= $${this.fmtNum(query.costMax)}`);
    return f.length ? f.join('  |  ') : 'Todos los articulos';
  }

  async generateXlsx(query: PriceAdjustmentQueryDto): Promise<Buffer> {
    const { items } = await this.productsService.utilidadReportList(query);

    const rows = items.map((it) => ({
      'Codigo': it.code,
      'Articulo': it.name,
      'Marca': it.brand,
      'Proveedor': it.supplier,
      'Categoria': it.category,
      'Brecha': it.brega ? 'Si' : 'No',
      'Existencia': it.stock,
      'Costo $': it.cost,
      'Costo+Brecha $': it.costoBrecha,
      'Precio s/IVA $': it.precioSinIva,
      'Utilidad %': it.gananciaPct,
      'Utilidad Mayor %': it.gananciaMayorPct,
      'Rango': this.rango(it.gananciaPct),
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 12 }, { wch: 50 }, { wch: 16 }, { wch: 22 }, { wch: 20 }, { wch: 8 },
      { wch: 11 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 11 }, { wch: 15 }, { wch: 12 },
    ];
    if (rows.length) ws['!autofilter'] = { ref: `A1:M${rows.length + 1}` };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Utilidad');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  async generatePdf(query: PriceAdjustmentQueryDto): Promise<Buffer> {
    const [company, filterText, { items }] = await Promise.all([
      this.getCompanyName(),
      this.filterText(query),
      this.productsService.utilidadReportList(query),
    ]);

    const doc = new PDFDocument({
      size: 'LETTER',
      layout: 'landscape',
      margins: { top: 40, bottom: 40, left: 40, right: 40 },
      bufferPages: true,
    });

    // Header
    doc.fontSize(16).font('Helvetica-Bold').fillColor('#000').text(company, 40, 40);
    doc.fontSize(12).font('Helvetica-Bold').text('Reporte de utilidad', 40, 60);
    doc.fontSize(9).font('Helvetica').fillColor('#334155').text(filterText, 40, 78);
    doc.text(`Generado: ${new Date().toLocaleDateString('es-VE')}  |  ${items.length} articulos`, 40, 90);
    doc.fillColor('#000');
    doc.moveTo(40, 106).lineTo(doc.page.width - 40, 106).stroke('#94a3b8');

    // Landscape LETTER: ancho util 40..752 (712 px).
    const columns = [
      { key: 'code', label: 'Codigo', x: 40, width: 58 },
      { key: 'name', label: 'Articulo', x: 98, width: 215 },
      { key: 'brand', label: 'Marca', x: 313, width: 70 },
      { key: 'stock', label: 'Exist.', x: 383, width: 42, align: 'right' as const },
      { key: 'cost', label: 'Costo $', x: 425, width: 52, align: 'right' as const },
      { key: 'costoBrecha', label: 'Costo+Brecha $', x: 477, width: 70, align: 'right' as const },
      { key: 'precioSinIva', label: 'Precio s/IVA $', x: 547, width: 70, align: 'right' as const },
      { key: 'util', label: 'Utilidad %', x: 617, width: 48, align: 'right' as const },
      { key: 'rango', label: 'Rango', x: 665, width: 87 },
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
        name: it.name,
        brand: it.brand || '—',
        stock: this.fmtQty(it.stock),
        cost: `$${this.fmtNum(it.cost)}`,
        costoBrecha: `$${this.fmtNum(it.costoBrecha)}`,
        precioSinIva: `$${this.fmtNum(it.precioSinIva)}`,
        util: `${this.fmtNum(it.gananciaPct)}%`,
        rango: this.rango(it.gananciaPct),
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
}
