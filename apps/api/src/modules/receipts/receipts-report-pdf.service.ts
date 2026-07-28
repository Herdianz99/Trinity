import { Injectable } from '@nestjs/common';
import * as PDFDocument from 'pdfkit';
import { PrismaService } from '../../prisma/prisma.service';
import { ReceiptsService } from './receipts.service';
import { QueryReceiptsDto } from './dto/query-receipts.dto';

// Reporte de recibos (pantallas /receipts/collection y /receipts/payment) en PDF.
// Respeta EXACTAMENTE los mismos filtros que la lista (type, status, fechas, busqueda)
// via receiptsService.reportList, y agrega una fila de TOTALES al final.
@Injectable()
export class ReceiptsReportPdfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly receiptsService: ReceiptsService,
  ) {}

  private async getCompanyName(): Promise<string> {
    const config = await this.prisma.companyConfig.findFirst();
    return config?.companyName || 'Trinity ERP';
  }

  private fmt(n: number): string {
    return (n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  private fmtRate(n: number): string {
    if (!n) return '—';
    return n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  }

  private fmtDate(iso: Date | string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('es-VE');
  }

  async generate(query: QueryReceiptsDto): Promise<Buffer> {
    const isPayment = query.type === 'PAYMENT';
    const [company, receipts] = await Promise.all([
      this.getCompanyName(),
      this.receiptsService.reportList(query),
    ]);

    const STATUS_LABELS: Record<string, string> = {
      DRAFT: 'Borrador',
      POSTED: 'Procesado',
      CANCELLED: 'Cancelado',
    };

    // Descripcion de los filtros aplicados, para dejar constancia en el encabezado.
    const filtros: string[] = [];
    if (query.search) filtros.push(`Busqueda: "${query.search}"`);
    filtros.push(query.status ? `Estado: ${STATUS_LABELS[query.status] || query.status}` : 'Todos los estados');
    if (query.from || query.to) {
      filtros.push(`Fechas: ${query.from || '...'} a ${query.to || '...'}`);
    }
    const filtroText = filtros.join('   |   ');

    const title = isPayment ? 'Reporte de Recibos de Pago' : 'Reporte de Recibos de Cobro';
    const entityHeader = isPayment ? 'Proveedor' : 'Cliente';

    const doc = new PDFDocument({
      size: 'LETTER',
      layout: 'portrait',
      margins: { top: 40, bottom: 40, left: 40, right: 40 },
      bufferPages: true,
    });

    // Header
    doc.fontSize(16).font('Helvetica-Bold').fillColor('#000').text(company, 40, 40);
    doc.fontSize(12).font('Helvetica-Bold').text(title, 40, 60);
    doc.fontSize(9).font('Helvetica').fillColor('#334155').text(filtroText, 40, 78);
    doc.text(`Generado: ${new Date().toLocaleDateString('es-VE')}   |   ${receipts.length} recibo${receipts.length !== 1 ? 's' : ''}`, 40, 90);
    doc.fillColor('#000');
    doc.moveTo(40, 106).lineTo(doc.page.width - 40, 106).stroke('#94a3b8');

    // Carta vertical: ancho util 40..572 (532 px). Cada columna se dimensiona segun la
    // longitud tipica de su contenido; el nombre (variable) toma el espacio restante.
    const columns = [
      { label: 'N° Recibo', x: 40, width: 72 },
      { label: entityHeader, x: 112, width: 190 },
      { label: 'Fecha', x: 302, width: 46 },
      { label: 'Estado', x: 348, width: 52 },
      { label: 'Tasa', x: 400, width: 50, align: 'right' as const },
      { label: 'Total USD', x: 450, width: 56, align: 'right' as const },
      { label: 'Bs hist.', x: 506, width: 66, align: 'right' as const },
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
    if (receipts.length === 0) {
      doc.fillColor('#64748b').text('No se encontraron recibos con los filtros aplicados.', 40, y + 6, {
        width: doc.page.width - 80,
        align: 'center',
      });
      doc.fillColor('#000');
    }

    let totalUsd = 0;
    let totalBsHistoric = 0;

    for (const r of receipts) {
      totalUsd += r.totalUsd;
      totalBsHistoric += r.totalBsHistoric;

      const entity = (isPayment ? r.supplier : r.customer) || r.customer || r.supplier;
      const values = [
        r.number,
        entity?.name || '—',
        this.fmtDate(r.createdAt),
        STATUS_LABELS[r.status] || r.status,
        this.fmtRate(r.exchangeRate),
        `$${this.fmt(r.totalUsd)}`,
        this.fmt(r.totalBsHistoric),
      ];

      // Altura de la fila = la celda mas alta (el nombre puede ocupar 2+ lineas)
      let rowHeight = 12;
      for (let i = 0; i < columns.length; i++) {
        const h = doc.heightOfString(values[i] || '', { width: columns[i].width });
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
      for (let i = 0; i < columns.length; i++) {
        doc.text(values[i] || '', columns[i].x, y, { width: columns[i].width, align: columns[i].align, lineBreak: true });
      }
      doc.fillColor('#000');
      y += rowHeight;
    }

    // Fila de TOTALES
    if (receipts.length > 0) {
      if (y + 20 > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
        y = 40;
        drawHeaderRow();
      }
      doc.moveTo(40, y).lineTo(doc.page.width - 40, y).stroke('#94a3b8');
      y += 5;
      doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#000');
      doc.text('TOTALES', columns[0].x, y, { width: columns[4].x + columns[4].width - columns[0].x, align: 'right' });
      doc.text(`$${this.fmt(totalUsd)}`, columns[5].x, y, { width: columns[5].width, align: 'right' });
      doc.text(this.fmt(totalBsHistoric), columns[6].x, y, { width: columns[6].width, align: 'right' });
    }

    // Paginacion: "Pagina X de Y" centrada al pie de cada pagina.
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      const oldBottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc.fontSize(8).font('Helvetica').fillColor('#64748b')
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
