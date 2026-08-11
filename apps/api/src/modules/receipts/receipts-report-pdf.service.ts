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

  // Fecha del recibo en YYYY-MM-DD. documentDate es date-only (medianoche UTC de la
  // fecha-Caracas) -> se lee en UTC; si falta, se cae a createdAt en hora Caracas.
  private receiptDate(r: any): string {
    if (r.documentDate) return new Date(r.documentDate).toISOString().slice(0, 10);
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Caracas', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date(r.createdAt));
  }

  // Nombre del TIPO de documento de un item (columna "Tipo"), para saber si la linea es
  // una factura, nota de credito/debito, retencion o anticipo.
  private itemTypeName(itemType: string): string {
    switch (itemType) {
      case 'RECEIVABLE':
      case 'PAYABLE': return 'Factura';
      case 'CREDIT_NOTE': return 'Nota de Credito';
      case 'DEBIT_NOTE': return 'Nota de Debito';
      case 'IVA_RETENTION':
      case 'SALES_IVA_RETENTION':
      case 'PURCHASE_IVA_RETENTION': return 'Retencion IVA';
      case 'PURCHASE_ISLR_RETENTION': return 'Retencion ISLR';
      case 'CUSTOMER_ADVANCE':
      case 'SUPPLIER_ADVANCE': return 'Anticipo';
      case 'DIFFERENTIAL': return 'Diferencial';
      default: return '';
    }
  }

  // Reporte DETALLADO tipo "listado de recibo de ingreso": un bloque por recibo con los
  // documentos que se cobraron/pagaron en el (facturas -> HABER, notas/retenciones -> DEBE)
  // y una linea de totales DEBE / HABER / TOTAL (neto) por recibo. Respeta los mismos
  // filtros del listado (type, status, fechas, busqueda por cliente/N° recibo).
  async generateDetailed(query: QueryReceiptsDto): Promise<Buffer> {
    const isPayment = query.type === 'PAYMENT';
    const [company, receiptsRaw] = await Promise.all([
      this.getCompanyName(),
      this.receiptsService.reportListDetailed(query),
    ]);
    // Mas reciente primero (como el ejemplo del otro sistema).
    const receipts = [...receiptsRaw].sort((a: any, b: any) => {
      const da = new Date(a.documentDate ?? a.createdAt).getTime();
      const db = new Date(b.documentDate ?? b.createdAt).getTime();
      return db - da;
    });

    const STATUS_LABELS: Record<string, string> = {
      DRAFT: 'Borrador', POSTED: 'Procesado', CANCELLED: 'Cancelado',
    };
    const filtros: string[] = [];
    if (query.search) filtros.push(`Busqueda: "${query.search}"`);
    filtros.push(query.status ? `Estado: ${STATUS_LABELS[query.status] || query.status}` : 'Todos los estados');
    if (query.from || query.to) filtros.push(`Fechas: ${query.from || '...'} a ${query.to || '...'}`);
    const filtroText = filtros.join('   |   ');

    const title = isPayment ? 'Listado de Recibos de Pago' : 'Listado de Recibos de Cobro';
    const RIGHT = 572;

    const doc = new PDFDocument({ size: 'LETTER', layout: 'portrait', margins: { top: 40, bottom: 40, left: 40, right: 40 }, bufferPages: true });

    // Encabezado del reporte
    doc.fontSize(16).font('Helvetica-Bold').fillColor('#000').text(company, 40, 40);
    doc.fontSize(12).font('Helvetica-Bold').text(title, 40, 60);
    doc.fontSize(9).font('Helvetica').fillColor('#334155').text(filtroText, 40, 78);
    doc.text(`Generado: ${new Date().toLocaleString('es-VE', { timeZone: 'America/Caracas' })}   |   ${receipts.length} recibo${receipts.length !== 1 ? 's' : ''}`, 40, 90);
    doc.fillColor('#000');
    doc.moveTo(40, 106).lineTo(RIGHT, 106).stroke('#94a3b8');

    // Altura de UNA línea de texto. PDFKit, con `width` y `ellipsis`, ignora `lineBreak:false`
    // y parte el texto largo en varias líneas (los N° de documento de notas/retenciones —
    // "NE1-NC-26-00000021 (NE1-26-00000811)" — se montaban con la fila siguiente). Pasar
    // `height: LINE_H` fuerza UNA sola línea y recorta con "…" lo que sobra.
    const LINE_H = 9.5;

    // Columnas: Tipo + N° Documento (por item) y Debe/Haber/Total (dinero, a la derecha).
    const cTipo = { x: 150, w: 96 };
    const cDoc = { x: 248, w: 104 };
    const cDebe = { x: 356, w: 66 };
    const cHaber = { x: 424, w: 66 };
    const cTotal = { x: 492, w: 80 };

    let y = 116;
    const drawHeaderRow = () => {
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#334155');
      doc.text('FECHA', 40, y, { width: 56 });
      doc.text('N° RECIBO', 98, y, { width: 50 });
      doc.text('TIPO', cTipo.x, y, { width: cTipo.w });
      doc.text('N° DOCUMENTO', cDoc.x, y, { width: cDoc.w });
      doc.text('DEBE $', cDebe.x, y, { width: cDebe.w, align: 'right' });
      doc.text('HABER $', cHaber.x, y, { width: cHaber.w, align: 'right' });
      doc.text('TOTAL $', cTotal.x, y, { width: cTotal.w, align: 'right' });
      doc.fillColor('#000');
      y += 13;
      doc.moveTo(40, y).lineTo(RIGHT, y).stroke('#94a3b8');
      y += 5;
    };
    drawHeaderRow();

    if (receipts.length === 0) {
      doc.fontSize(9).font('Helvetica').fillColor('#64748b')
        .text('No se encontraron recibos con los filtros aplicados.', 40, y + 6, { width: RIGHT - 40, align: 'center' });
      doc.fillColor('#000');
    }

    const bottom = () => doc.page.height - doc.page.margins.bottom;
    let gDebe = 0, gHaber = 0, gNet = 0;
    let idx = 0;

    for (const r of receipts as any[]) {
      const entity = r.customer || r.supplier;
      // Items con monto (>0); facturas (sign +1) -> HABER, notas/retenciones (sign -1) -> DEBE.
      const items = (r.items || []).filter((it: any) => Math.abs(it.amountUsd || 0) > 0.0001)
        .sort((a: any, b: any) => (b.sign || 1) - (a.sign || 1));
      let rDebe = 0, rHaber = 0;
      for (const it of items) {
        if ((it.sign || 1) < 0) rDebe += Math.abs(it.amountUsd || 0);
        else rHaber += Math.abs(it.amountUsd || 0);
      }
      const rNet = Math.round((rHaber - rDebe) * 100) / 100;
      const pays = (r.payments || []).filter((p: any) => (p.amountUsd || 0) > 0.0001);
      const hasPay = pays.length > 0;

      // Alto estimado del bloque (para el salto de pagina y el fondo zebra).
      const blockH = 15 + Math.max(1, items.length) * 12 + (hasPay ? 12 : 0) + 20;
      if (y + Math.min(blockH, 110) > bottom()) { doc.addPage(); y = 40; drawHeaderRow(); }

      // Fondo alternado (zebra) para separar visualmente cada recibo.
      if (idx % 2 === 1) {
        const h = Math.min(blockH, bottom() - y + 3);
        doc.rect(40, y - 3, RIGHT - 40, h).fill('#f1f5f9');
      }
      idx++;

      // Cabecera del recibo (negrita): fecha, n° recibo, cliente + RIF + estado
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#0f172a');
      doc.text(this.receiptDate(r), 40, y, { width: 56, lineBreak: false });
      doc.text(r.number, 98, y, { width: 48, lineBreak: false });
      doc.text(entity?.name || r.platformName || '—', cTipo.x, y, { width: 206, height: LINE_H, lineBreak: false, ellipsis: true });
      const rif = entity?.rif ? `${entity.documentType ? entity.documentType + '-' : ''}${entity.rif}` : '';
      if (rif) doc.fontSize(7.5).font('Helvetica').fillColor('#475569').text(rif, 360, y + 0.5, { width: 130, lineBreak: false });
      const stColor = r.status === 'POSTED' ? '#16a34a' : r.status === 'CANCELLED' ? '#dc2626' : '#d97706';
      doc.fontSize(7.5).font('Helvetica-Bold').fillColor(stColor)
        .text((STATUS_LABELS[r.status] || r.status).toUpperCase(), cTotal.x, y + 0.5, { width: cTotal.w, align: 'right', lineBreak: false });
      doc.fillColor('#000');
      y += 12;
      doc.moveTo(40, y - 1).lineTo(RIGHT, y - 1).stroke('#cbd5e1');
      y += 2;

      // Items: Tipo | N° Documento | Debe/Haber
      doc.fontSize(8).font('Helvetica');
      for (const it of items) {
        if (y + 12 > bottom()) { doc.addPage(); y = 40; drawHeaderRow(); doc.fontSize(8).font('Helvetica'); }
        const neg = (it.sign || 1) < 0;
        doc.fillColor('#475569').text(this.itemTypeName(it.itemType), cTipo.x, y, { width: cTipo.w, height: LINE_H, lineBreak: false, ellipsis: true });
        doc.fillColor('#334155').text(it.description || '', cDoc.x, y, { width: cDoc.w, height: LINE_H, lineBreak: false, ellipsis: true });
        doc.fillColor('#1e293b');
        if (neg) doc.text(this.fmt(Math.abs(it.amountUsd || 0)), cDebe.x, y, { width: cDebe.w, align: 'right' });
        else doc.text(this.fmt(Math.abs(it.amountUsd || 0)), cHaber.x, y, { width: cHaber.w, align: 'right' });
        doc.fillColor('#000');
        y += 12;
      }

      // Linea de metodos de pago del recibo (como se cobro/pago).
      if (hasPay) {
        if (y + 12 > bottom()) { doc.addPage(); y = 40; drawHeaderRow(); }
        const payText = 'Pago: ' + pays.map((p: any) => `${p.method?.name || 'Pago'} $${this.fmt(p.amountUsd)}`).join('   ·   ');
        doc.fontSize(7.5).font('Helvetica-Oblique').fillColor('#64748b')
          .text(payText, cTipo.x, y, { width: cDebe.x - cTipo.x - 6, height: LINE_H, lineBreak: false, ellipsis: true });
        doc.fillColor('#000');
        y += 12;
      }

      // Linea de totales del recibo
      if (y + 14 > bottom()) { doc.addPage(); y = 40; drawHeaderRow(); }
      doc.moveTo(cDebe.x, y).lineTo(RIGHT, y).stroke('#94a3b8');
      y += 2;
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#0f172a');
      if (rDebe > 0) doc.text(this.fmt(rDebe), cDebe.x, y, { width: cDebe.w, align: 'right' });
      doc.text(this.fmt(rHaber), cHaber.x, y, { width: cHaber.w, align: 'right' });
      doc.text(this.fmt(rNet), cTotal.x, y, { width: cTotal.w, align: 'right' });
      doc.fillColor('#000');
      y += 18;

      gDebe += rDebe; gHaber += rHaber; gNet += rNet;
    }

    // Total general
    if (receipts.length > 0) {
      if (y + 20 > bottom()) { doc.addPage(); y = 40; }
      doc.moveTo(40, y).lineTo(RIGHT, y).stroke('#94a3b8');
      y += 4;
      doc.rect(40, y - 2, RIGHT - 40, 16).fill('#0f172a');
      doc.fillColor('#fff').fontSize(8.5).font('Helvetica-Bold');
      doc.text(`TOTAL GENERAL  (${receipts.length} recibos)`, 46, y + 1, { width: 260, lineBreak: false });
      doc.text(this.fmt(gDebe), cDebe.x, y + 1, { width: cDebe.w, align: 'right' });
      doc.text(this.fmt(gHaber), cHaber.x, y + 1, { width: cHaber.w, align: 'right' });
      doc.text(this.fmt(Math.round(gNet * 100) / 100), cTotal.x, y + 1, { width: cTotal.w, align: 'right' });
      doc.fillColor('#000');
    }

    // Paginacion
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      const oldBottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc.fontSize(8).font('Helvetica').fillColor('#64748b')
        .text(`Pagina ${i + 1} de ${range.count}`, 40, doc.page.height - 28, { align: 'center', width: doc.page.width - 80 });
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
        entity?.name || r.platformName || '—',
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
