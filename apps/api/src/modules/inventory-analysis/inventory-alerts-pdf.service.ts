import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as PDFDocument from 'pdfkit';

type AlertItem = {
  productCode: string;
  productName: string;
  supplierName: string;
  currentStock: number;
  minStock: number;
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
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margins: { top: 40, bottom: 40, left: 40, right: 40 } });

    // Header
    doc.fontSize(16).font('Helvetica-Bold').text(company, 40, 40);
    doc.fontSize(12).font('Helvetica-Bold').text(title, 40, 60);
    doc.fontSize(9).font('Helvetica').text(period ? `Periodo (exceso): ${period}` : '', 40, 76);
    doc.text(`Generado: ${new Date().toLocaleDateString('es-VE')}  |  ${items.length} articulos`, 40, 88);
    doc.moveTo(40, 104).lineTo(doc.page.width - 40, 104).stroke('#94a3b8');

    const columns = [
      { label: 'Codigo', x: 40, width: 70 },
      { label: 'Producto', x: 115, width: 200 },
      { label: 'Proveedor', x: 320, width: 130 },
      { label: 'Stock', x: 455, width: 45, align: 'right' as const },
      { label: 'Min', x: 505, width: 40, align: 'right' as const },
      { label: 'Ult. entrada', x: 550, width: 70 },
      { label: 'Dias', x: 625, width: 35, align: 'right' as const },
      { label: 'Estado', x: 665, width: 130 },
    ];

    let y = 114;
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#334155');
    for (const c of columns) doc.text(c.label, c.x, y, { width: c.width, align: c.align });
    doc.fillColor('#000');
    y += 14;
    doc.moveTo(40, y).lineTo(doc.page.width - 40, y).stroke('#e2e8f0');
    y += 4;

    for (const it of items) {
      if (y > doc.page.height - doc.page.margins.bottom - 20) {
        doc.addPage();
        y = 40;
      }
      let estado = '';
      if (it.alerts.agotado) estado = 'Agotado';
      else if (it.alerts.sinRotacion) estado = NIVEL_LABEL[it.alerts.sinRotacion] || '';
      else if (it.alerts.exceso) estado = `Exceso (${it.daysOfInventory} d)`;
      else if (it.alerts.bajoMinimo) estado = 'Bajo minimo';

      const values = [
        it.productCode,
        it.productName,
        it.supplierName,
        String(it.currentStock),
        String(it.minStock),
        this.fmtDate(it.lastEntryDate),
        String(it.daysSinceEntry),
        estado,
      ];
      doc.fontSize(8).font('Helvetica').fillColor('#1e293b');
      for (let i = 0; i < columns.length; i++) {
        doc.text(values[i] || '', columns[i].x, y, { width: columns[i].width, align: columns[i].align });
      }
      doc.fillColor('#000');
      y += 14;
    }

    doc.end();
    return new Promise((resolve) => {
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
    });
  }
}
