import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as PDFDocument from 'pdfkit';

type AlertItem = {
  productCode: string;
  productName: string;
  supplierRef: string;
  currentStock: number;
  minStock: number;
  periodSales: number;
  daysSinceEntry: number;
  daysOfInventory: number;
  lastEntryDate: string;
  alerts: { agotado: boolean; bajoMinimo: boolean; sinRotacion: string | null; exceso: boolean };
};

const REPORT_TITLES: Record<string, string> = {
  agotados: 'Articulos Agotados',
  'bajo-minimo': 'Articulos Bajo Minimo',
  'sin-rotacion': 'Articulos Sin Rotacion',
  exceso: 'Exceso de Stock',
  todos: 'Alertas de Inventario',
};

const NIVEL_LABEL: Record<string, string> = {
  RECIEN_INGRESADO: 'Recien ingresado',
  NUEVO_SIN_ROTACION: 'Nuevo sin rotacion',
  STOCK_MUERTO: 'Stock muerto',
};

@Injectable()
export class InventoryAlertsPdfService {
  constructor(private readonly prisma: PrismaService) {}

  private async getCompanyName(): Promise<string> {
    const config = await this.prisma.companyConfig.findFirst();
    return config?.companyName || 'Trinity ERP';
  }

  private fmtDate(iso: string): string {
    return new Date(iso).toLocaleDateString('es-VE');
  }

  async generate(report: string, items: AlertItem[], period: string): Promise<Buffer> {
    const company = await this.getCompanyName();
    const title = REPORT_TITLES[report] || 'Alertas de Inventario';
    const doc = new PDFDocument({ size: 'LETTER', layout: 'portrait', margins: { top: 40, bottom: 40, left: 40, right: 40 }, bufferPages: true });

    // Header
    doc.fontSize(16).font('Helvetica-Bold').text(company, 40, 40);
    doc.fontSize(12).font('Helvetica-Bold').text(title, 40, 60);
    doc.fontSize(9).font('Helvetica').text(period ? `Periodo (ventas / exceso): ${period}` : '', 40, 76);
    doc.text(`Generado: ${new Date().toLocaleDateString('es-VE')}  |  ${items.length} articulos`, 40, 88);
    doc.moveTo(40, 104).lineTo(doc.page.width - 40, 104).stroke('#94a3b8');

    // Carta vertical: ancho util ~532 (x de 40 a 572). Sin columna Proveedor;
    // el codigo del articulo + Ref. Proveedor van juntos en la primera columna.
    const columns = [
      { label: 'Codigo / Ref.', x: 40, width: 90 },
      { label: 'Producto', x: 132, width: 146 },
      { label: 'Stock', x: 280, width: 36, align: 'right' as const },
      { label: 'Min', x: 318, width: 30, align: 'right' as const },
      { label: 'Ventas', x: 350, width: 40, align: 'right' as const },
      { label: 'Ult. entrada', x: 392, width: 66 },
      { label: 'Dias', x: 460, width: 26, align: 'right' as const },
      { label: 'Estado', x: 488, width: 84 },
    ];

    let y = 114;
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#334155');
    for (const c of columns) doc.text(c.label, c.x, y, { width: c.width, align: c.align });
    doc.fillColor('#000');
    y += 14;
    doc.moveTo(40, y).lineTo(doc.page.width - 40, y).stroke('#e2e8f0');
    y += 4;

    doc.fontSize(8).font('Helvetica');
    for (const it of items) {
      let estado = '';
      if (it.alerts.agotado) estado = 'Agotado';
      else if (it.alerts.sinRotacion) estado = NIVEL_LABEL[it.alerts.sinRotacion] || '';
      else if (it.alerts.exceso) estado = `Exceso (${it.daysOfInventory} d)`;
      else if (it.alerts.bajoMinimo) estado = 'Bajo minimo';

      const codigoCell = it.supplierRef ? `${it.productCode}\nRef: ${it.supplierRef}` : it.productCode;
      const values = [
        codigoCell,
        it.productName,
        String(it.currentStock),
        String(it.minStock),
        String(it.periodSales),
        this.fmtDate(it.lastEntryDate),
        String(it.daysSinceEntry),
        estado,
      ];

      // Altura real de la fila = la celda mas alta (el nombre/proveedor pueden ocupar 2+ lineas)
      let rowHeight = 12;
      for (let i = 0; i < columns.length; i++) {
        const h = doc.heightOfString(values[i] || '', { width: columns[i].width });
        if (h > rowHeight) rowHeight = h;
      }
      rowHeight += 4; // padding inferior

      if (y + rowHeight > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
        y = 40;
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
      doc.page.margins.bottom = 0; // evita que pdfkit agregue una pagina al escribir en el margen inferior
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
