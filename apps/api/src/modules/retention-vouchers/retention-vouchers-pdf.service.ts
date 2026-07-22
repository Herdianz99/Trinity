import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as PDFDocument from 'pdfkit';

function fmtBs(n: number): string {
  const parts = Math.abs(n).toFixed(2).split('.');
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (n < 0 ? '-' : '') + intPart + ',' + parts[1];
}

// Fechas fiscales date-only (issueDate/invoiceDate) guardadas a medianoche UTC: formatear en UTC
// para que la fecha salga tal como se eligio, sin depender del timezone del proceso.
function fmtDate(d: Date | string | null): string {
  if (!d) return '';
  const date = new Date(d);
  return `${date.getUTCDate().toString().padStart(2, '0')}/${(date.getUTCMonth() + 1).toString().padStart(2, '0')}/${date.getUTCFullYear()}`;
}

function fmtPeriodo(d: Date | null): string {
  if (!d) return '';
  const date = new Date(d);
  return `${(date.getUTCMonth() + 1).toString().padStart(2, '0')}-${date.getUTCFullYear()}`;
}

function fmtHora(d: Date): string {
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'P.M.' : 'A.M.';
  h = h % 12 || 12;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')} ${ampm}`;
}

/** Helper: write bold label + normal value in a single line without continued */
function labelValue(doc: PDFKit.PDFDocument, label: string, value: string, x: number, y: number, w: number): number {
  const labelW = doc.font('Helvetica-Bold').widthOfString(label);
  doc.font('Helvetica-Bold').text(label, x, y, { lineBreak: false });
  const valueW = w - labelW;
  // El valor SE AJUSTA en varias lineas si es largo (ej. nombres de entes publicos),
  // en vez de montarse sobre el campo de abajo. Devuelve la Y despues del campo.
  doc.font('Helvetica').text(value || '', x + labelW, y, { width: valueW });
  const h = doc.heightOfString(value || '', { width: valueW });
  return y + Math.max(10, h + 2);
}

@Injectable()
export class RetentionVouchersPdfService {
  constructor(private readonly prisma: PrismaService) {}

  async generatePdf(id: string): Promise<Buffer> {
    const voucher = await this.prisma.retentionVoucher.findUnique({
      where: { id },
      include: {
        supplier: true,
        serie: true,
        lines: {
          include: {
            purchaseOrder: {
              select: {
                id: true,
                number: true,
                purchaseNumber: true,
                invoiceDate: true,
                totalIvaUsd: true,
                totalIvaBs: true,
                totalUsd: true,
                totalBs: true,
                exchangeRate: true,
                supplierControlNumber: true,
                supplierInvoiceNumber: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        createdBy: { select: { id: true, name: true } },
      },
    });

    if (!voucher) throw new NotFoundException('Comprobante no encontrado');

    const config = await this.prisma.companyConfig.findFirst() as any;

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'LETTER', margins: { top: 40, left: 40, right: 40, bottom: 0 } });
      const buffers: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const pageWidth = doc.page.width - 80; // 532
      const L = 40; // left margin
      const R = L + pageWidth; // right edge
      let y = 40;
      let pageNum = 1;

      const issueDate = voucher.issueDate ? new Date(voucher.issueDate) : new Date(voucher.createdAt);
      const now = new Date();

      // ═══════════════════════════════════════════════════════════════════
      // HEADER — Logo (left) + Title (center) + Info box (right)
      // ═══════════════════════════════════════════════════════════════════

      // Logo left
      const logoW = 80;
      let logoBottomY = y;

      if (config?.logo) {
        try {
          const base64Data = config.logo.replace(/^data:image\/\w+;base64,/, '');
          const logoBuffer = Buffer.from(base64Data, 'base64');
          doc.image(logoBuffer, L, y, { height: 45 });
          logoBottomY = y + 50;
        } catch {
          doc.fontSize(12).font('Helvetica-Bold').text(config?.companyName || 'Trinity ERP', L, y, { lineBreak: false });
          logoBottomY = y + 16;
        }
      } else {
        doc.fontSize(12).font('Helvetica-Bold').text(config?.companyName || 'Trinity ERP', L, y, { lineBreak: false });
        logoBottomY = y + 16;
      }

      // Info box right
      const infoBoxW = 170;
      const infoBoxH = 50;
      const infoBoxX = R - infoBoxW;
      const infoBoxY = y;

      doc.rect(infoBoxX, infoBoxY, infoBoxW, infoBoxH).lineWidth(0.5).stroke('#333333');

      doc.fontSize(7).fillColor('#000000');
      const lblX = infoBoxX + 6;
      const valX = infoBoxX + 90;
      let iy = infoBoxY + 5;
      doc.font('Helvetica-Bold').text('Nº de Comprobante:', lblX, iy, { lineBreak: false });
      doc.font('Helvetica').text(voucher.number, valX, iy, { lineBreak: false });
      iy += 11;
      doc.font('Helvetica-Bold').text('Fecha:', lblX, iy, { lineBreak: false });
      doc.font('Helvetica').text(fmtDate(issueDate), valX, iy, { lineBreak: false });
      iy += 11;
      doc.font('Helvetica-Bold').text('Período fiscal:', lblX, iy, { lineBreak: false });
      doc.font('Helvetica').text(fmtPeriodo(issueDate), valX, iy, { lineBreak: false });
      iy += 11;
      doc.font('Helvetica-Bold').text('Hora:', lblX, iy, { lineBreak: false });
      doc.font('Helvetica').text(fmtHora(now), valX, iy, { lineBreak: false });

      // Title centered between logo and info box
      const centerX = L + logoW + 5;
      const centerW = infoBoxX - centerX - 5;
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#000000')
        .text('Comprobante de Retención del IVA', centerX, y, { width: centerW, align: 'center', lineBreak: false });
      const providencia = config?.retentionProvidencia || 'SNAT/2025/000054';
      doc.fontSize(6.5).font('Helvetica')
        .text(`Providencia Administrativa Nº ${providencia}`, centerX, y + 14, { width: centerW, align: 'center', lineBreak: false });

      // Row 1 after logo/infobox
      y = Math.max(logoBottomY, infoBoxY + infoBoxH) + 4;

      // Legal text full width
      doc.fontSize(5.5).font('Helvetica').fillColor('#333333');
      doc.text(
        'Ley de IVA Art. 11 - La administración tributaria podrá designar como responsables de pago del impuesto, en calidad de agentes de retención, '
        + 'a quienes por sus funciones públicas o por razón de sus actividades privadas intervengan en operaciones gravadas con el impuesto establecido en esta Ley.',
        L, y, { width: pageWidth, align: 'center', lineBreak: true },
      );
      y += 18;

      // ═══════════════════════════════════════════════════════════════════
      // TWO COLUMNS — Agente de retención | Sujeto retenido
      // ═══════════════════════════════════════════════════════════════════

      const colWidth = pageWidth / 2;
      const col1X = L;
      const col2X = L + colWidth;
      const boxTop = y;
      const bw = colWidth - 12;

      // Encabezados de cada recuadro
      doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#000000')
        .text('Datos del agente de retención', col1X + 5, boxTop + 4, { lineBreak: false });
      doc.fontSize(7.5).font('Helvetica-Bold')
        .text('Datos del sujeto retenido', col2X + 5, boxTop + 4, { lineBreak: false });
      doc.fontSize(7);

      // Agente de retención (company) — columna izquierda. Cada campo devuelve la Y
      // siguiente, así los largos empujan a los de abajo (sin montarse).
      let ay = boxTop + 15;
      ay = labelValue(doc, 'Nombre: ', config?.companyName || '', col1X + 5, ay, bw);
      ay = labelValue(doc, 'RIF: ', config?.rif || '', col1X + 5, ay, bw);
      ay = labelValue(doc, 'Dirección: ', (config?.address || '').substring(0, 60), col1X + 5, ay, bw);
      if (config?.phone) ay = labelValue(doc, 'Teléfono: ', config.phone, col1X + 5, ay, bw);

      // Sujeto retenido (supplier) — columna derecha
      let sy = boxTop + 15;
      sy = labelValue(doc, 'Nombre: ', voucher.supplier.name, col2X + 5, sy, bw);
      sy = labelValue(doc, 'RIF: ', voucher.supplier.rif || '', col2X + 5, sy, bw);
      if (voucher.supplier.address) sy = labelValue(doc, 'Dirección: ', voucher.supplier.address.substring(0, 60), col2X + 5, sy, bw);
      if (voucher.supplier.phone) sy = labelValue(doc, 'Teléfono: ', voucher.supplier.phone, col2X + 5, sy, bw);

      // Recuadros dibujados AL FINAL con la altura del más alto (para que ninguno corte texto).
      const boxH = Math.max(ay, sy) - boxTop + 4;
      doc.lineWidth(0.5).strokeColor('#333333');
      doc.rect(col1X, boxTop, colWidth, boxH).stroke();
      doc.rect(col2X, boxTop, colWidth, boxH).stroke();

      y = boxTop + boxH + 8;

      // ═══════════════════════════════════════════════════════════════════
      // LINES TABLE — Matching Wensoft columns (sin "Bs" redundante)
      // ═══════════════════════════════════════════════════════════════════

      const cols = [
        { label: 'Oper\nNº',              x: L,         w: 22,  align: 'center' as const },
        { label: 'Fecha\nfact.',           x: L + 22,    w: 42,  align: 'center' as const },
        { label: 'Nº Factura',            x: L + 64,    w: 52,  align: 'center' as const },
        { label: 'Nº Control\nFiscal',     x: L + 116,   w: 52,  align: 'center' as const },
        { label: 'Nº Nota\nCrédito',       x: L + 168,   w: 38,  align: 'center' as const },
        { label: 'Nº Nota\nDébito',        x: L + 206,   w: 38,  align: 'center' as const },
        { label: 'Total fact.\ninc. IVA',  x: L + 244,   w: 52,  align: 'right' as const },
        { label: 'Compras\nsin der.',      x: L + 296,   w: 38,  align: 'right' as const },
        { label: 'Base\nimponible',        x: L + 334,   w: 50,  align: 'right' as const },
        { label: '%\nIVA',                 x: L + 384,   w: 22,  align: 'center' as const },
        { label: 'Impuesto\nIVA',          x: L + 406,   w: 45,  align: 'right' as const },
        { label: '%\nRet.',                x: L + 451,   w: 22,  align: 'center' as const },
        { label: 'IVA\nRetenido',          x: L + 473,   w: 59,  align: 'right' as const },
      ];

      // Table header background
      const headerH = 24;
      doc.rect(L, y, pageWidth, headerH).lineWidth(0.5).fillAndStroke('#e0e0e0', '#333333');

      // Header text
      doc.fillColor('#000000').fontSize(5.5).font('Helvetica-Bold');
      for (const col of cols) {
        const lines = col.label.split('\n');
        const lineH = 7;
        const startY = y + (headerH - lines.length * lineH) / 2;
        lines.forEach((line, i) => {
          doc.text(line, col.x + 2, startY + i * lineH, {
            width: col.w - 4,
            align: col.align,
            lineBreak: false,
          });
        });
      }

      y += headerH;

      // Table rows
      doc.font('Helvetica').fontSize(6).fillColor('#000000');
      const rowH = 13;

      let totalInvoiceBs = 0;
      let totalExemptBs = 0;
      let totalTaxableBaseBs = 0;
      let totalIvaBs = 0;
      let totalRetentionBs = 0;

      voucher.lines.forEach((line, idx) => {
        // Page break if needed
        if (y + rowH > doc.page.height - 110) {
          doc.fontSize(6).font('Helvetica').fillColor('#666666');
          doc.text(`Pagina ${pageNum}`, L, doc.page.height - 45, { width: pageWidth, align: 'right', lineBreak: false });
          doc.fillColor('#000000');
          doc.addPage();
          pageNum++;
          y = 40;
        }

        // Alternate row background
        if (idx % 2 === 0) {
          doc.rect(L, y, pageWidth, rowH).fill('#f5f5f5');
          doc.fillColor('#000000');
        }

        // Row border
        doc.rect(L, y, pageWidth, rowH).lineWidth(0.3).stroke('#bbbbbb');

        const invoiceBs = line.invoiceTotalBs;
        const taxableBaseBs = line.taxableBaseBs;
        const ivaBs = line.ivaAmountBs;
        const retentionBs = line.retentionAmountBs;
        const exemptBs = Math.max(0, invoiceBs - taxableBaseBs - ivaBs);

        totalInvoiceBs += invoiceBs;
        totalExemptBs += exemptBs;
        totalTaxableBaseBs += taxableBaseBs;
        totalIvaBs += ivaBs;
        totalRetentionBs += retentionBs;

        const cellY = y + 3.5;
        doc.font('Helvetica').fontSize(6);

        doc.text(String(idx + 1), cols[0].x + 2, cellY, { width: cols[0].w - 4, align: 'center', lineBreak: false });

        const invDate = line.invoiceDate ? fmtDate(line.invoiceDate) : line.purchaseOrder?.invoiceDate ? fmtDate(line.purchaseOrder.invoiceDate) : '';
        doc.text(invDate, cols[1].x + 2, cellY, { width: cols[1].w - 4, align: 'center', lineBreak: false });

        doc.text(line.supplierInvoiceNumber || '', cols[2].x + 2, cellY, { width: cols[2].w - 4, align: 'center', lineBreak: false });
        doc.text(line.supplierControlNumber || '', cols[3].x + 2, cellY, { width: cols[3].w - 4, align: 'center', lineBreak: false });
        doc.text('', cols[4].x + 2, cellY, { width: cols[4].w - 4, align: 'center', lineBreak: false });
        doc.text('', cols[5].x + 2, cellY, { width: cols[5].w - 4, align: 'center', lineBreak: false });
        doc.text(fmtBs(invoiceBs), cols[6].x + 2, cellY, { width: cols[6].w - 4, align: 'right', lineBreak: false });
        doc.text(fmtBs(exemptBs), cols[7].x + 2, cellY, { width: cols[7].w - 4, align: 'right', lineBreak: false });
        doc.text(fmtBs(taxableBaseBs), cols[8].x + 2, cellY, { width: cols[8].w - 4, align: 'right', lineBreak: false });

        const ivaRate = taxableBaseBs > 0 ? Math.round((ivaBs / taxableBaseBs) * 100) : 16;
        doc.text(String(ivaRate), cols[9].x + 2, cellY, { width: cols[9].w - 4, align: 'center', lineBreak: false });

        doc.text(fmtBs(ivaBs), cols[10].x + 2, cellY, { width: cols[10].w - 4, align: 'right', lineBreak: false });
        doc.text(String(line.retentionPct), cols[11].x + 2, cellY, { width: cols[11].w - 4, align: 'center', lineBreak: false });
        doc.text(fmtBs(retentionBs), cols[12].x + 2, cellY, { width: cols[12].w - 4, align: 'right', lineBreak: false });

        y += rowH;
      });

      // ═══════════════════════════════════════════════════════════════════
      // TOTALS ROW
      // ═══════════════════════════════════════════════════════════════════

      y += 1;
      doc.rect(L, y, pageWidth, 15).lineWidth(0.5).fillAndStroke('#e0e0e0', '#333333');
      doc.fillColor('#000000').fontSize(6).font('Helvetica-Bold');

      const totY = y + 4;
      doc.text('TOTALES', cols[0].x + 2, totY, { width: cols[5].x + cols[5].w - cols[0].x - 4, align: 'right', lineBreak: false });
      doc.text(fmtBs(totalInvoiceBs), cols[6].x + 2, totY, { width: cols[6].w - 4, align: 'right', lineBreak: false });
      doc.text(fmtBs(totalExemptBs), cols[7].x + 2, totY, { width: cols[7].w - 4, align: 'right', lineBreak: false });
      doc.text(fmtBs(totalTaxableBaseBs), cols[8].x + 2, totY, { width: cols[8].w - 4, align: 'right', lineBreak: false });
      doc.text('', cols[9].x + 2, totY, { width: cols[9].w - 4, lineBreak: false });
      doc.text(fmtBs(totalIvaBs), cols[10].x + 2, totY, { width: cols[10].w - 4, align: 'right', lineBreak: false });
      doc.text('', cols[11].x + 2, totY, { width: cols[11].w - 4, lineBreak: false });
      doc.text(fmtBs(totalRetentionBs), cols[12].x + 2, totY, { width: cols[12].w - 4, align: 'right', lineBreak: false });

      y += 22;

      // Total IVA retenido highlight
      doc.fontSize(9).font('Helvetica-Bold');
      doc.text(`Total IVA retenido:  ${fmtBs(totalRetentionBs)}`, L, y, { width: pageWidth, align: 'right', lineBreak: false });
      y += 20;

      // ═══════════════════════════════════════════════════════════════════
      // FOOTER — Firma/sello + Recibido
      // ═══════════════════════════════════════════════════════════════════

      // Check if we need a new page for footer
      const footerH = config?.stampImage ? 120 : 80;
      if (y + footerH > doc.page.height - 50) {
        doc.fontSize(6).font('Helvetica').fillColor('#666666');
        doc.text(`Pagina ${pageNum}`, L, doc.page.height - 45, { width: pageWidth, align: 'right', lineBreak: false });
        doc.fillColor('#000000');
        doc.addPage();
        pageNum++;
        y = 40;
      }

      doc.moveTo(L, y).lineTo(R, y).lineWidth(0.5).stroke('#333333');
      y += 10;

      // Two columns for footer
      const footerCol2X = L + pageWidth / 2 + 20;

      // Left: Firma y sello
      doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#000000');
      doc.text('Firma y sello del agente de retención', L, y, { lineBreak: false });
      y += 6;

      // Stamp image if available
      if (config?.stampImage) {
        try {
          const stampData = config.stampImage.replace(/^data:image\/\w+;base64,/, '');
          const stampBuffer = Buffer.from(stampData, 'base64');
          doc.image(stampBuffer, L, y, { height: 60, width: 180 });
          y += 65;
        } catch {
          y += 30;
        }
      } else {
        y += 30;
      }

      doc.moveTo(L, y).lineTo(L + 200, y).lineWidth(0.3).stroke('#666666');
      y += 4;
      doc.fontSize(6).font('Helvetica').text(config?.rif || '', L, y, { lineBreak: false });

      // Right: Recibido por
      const recStartY = y - (config?.stampImage ? 70 : 40);
      doc.fontSize(7.5).font('Helvetica-Bold');
      doc.text('Recibido por:', footerCol2X, recStartY, { lineBreak: false });
      const recLineY = recStartY + 30;
      doc.moveTo(footerCol2X, recLineY).lineTo(R - 10, recLineY).lineWidth(0.3).stroke('#666666');
      doc.fontSize(7).font('Helvetica');
      doc.text('Fecha de recepción: ___/___/______', footerCol2X, recLineY + 8, { lineBreak: false });

      y += 16;

      // ═══════════════════════════════════════════════════════════════════
      // PAGE FOOTER
      // ═══════════════════════════════════════════════════════════════════

      doc.fontSize(6).fillColor('#888888').font('Helvetica');
      doc.text('Documento emitido con Trinity ERP', L, doc.page.height - 45, { width: pageWidth / 2, lineBreak: false });
      doc.text(`Pagina ${pageNum} De ${pageNum}`, L, doc.page.height - 45, { width: pageWidth, align: 'right', lineBreak: false });

      doc.end();
    });
  }

  /**
   * Reporte de listado de comprobantes de retención de IVA (compras), en PDF vertical.
   * Filtra por fecha de EMISIÓN (issueDate), que es fecha fiscal date-only a medianoche UTC
   * (NO anclar a Caracas — ver regla de fechas en CLAUDE.md). Muestra total retenido y conteos.
   */
  async generateListReport(params: { from?: string; to?: string; status?: string }): Promise<Buffer> {
    const { from, to, status } = params;

    const where: any = {};
    if (status) where.status = status;
    if (from || to) {
      where.issueDate = {};
      if (from) where.issueDate.gte = new Date(`${from}T00:00:00.000Z`);
      if (to) {
        // rango inclusivo: < (día siguiente a 'to')
        const lt = new Date(`${to}T00:00:00.000Z`);
        lt.setUTCDate(lt.getUTCDate() + 1);
        where.issueDate.lt = lt;
      }
    }

    const [config, vouchers] = await Promise.all([
      this.prisma.companyConfig.findFirst({ select: { companyName: true, rif: true } }),
      this.prisma.retentionVoucher.findMany({
        where,
        orderBy: { number: 'asc' },
        select: {
          number: true,
          status: true,
          issueDate: true,
          retentionPct: true,
          retentionAmountUsd: true,
          retentionAmountBs: true,
          supplier: { select: { name: true, rif: true } },
          _count: { select: { lines: true } },
        },
      }),
    ]);

    const COMPANY = config?.companyName || 'Trinity ERP';
    const RIF = config?.rif || '';
    const periodLabel =
      from && to
        ? `Del ${fmtDate(new Date(`${from}T00:00:00.000Z`))} al ${fmtDate(new Date(`${to}T00:00:00.000Z`))} (por fecha de emisión)`
        : 'Todas las retenciones';

    const STATUS: Record<string, string> = { PENDING: 'Pendiente', ISSUED: 'Emitida', CANCELLED: 'Anulada' };
    const STATUS_COLOR: Record<string, string> = { PENDING: '#b45309', ISSUED: '#047857', CANCELLED: '#b91c1c' };
    const fmtUsd = (n: number) => `$ ${fmtBs(n)}`; // mismo separador es/VE

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', layout: 'portrait', margins: { top: 40, bottom: 40, left: 40, right: 40 } });
      const buffers: Buffer[] = [];
      doc.on('data', (c: Buffer) => buffers.push(c));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const W = doc.page.width;
      const RIGHT = W - 40;
      const BOTTOM = doc.page.height - 45;

      const COLS = [
        { label: 'Nº Retención', x: 40, w: 76, align: 'left' as const },
        { label: 'Proveedor', x: 118, w: 134, align: 'left' as const },
        { label: 'Fact.', x: 253, w: 24, align: 'right' as const },
        { label: '%', x: 279, w: 24, align: 'right' as const },
        { label: 'Ret. USD', x: 305, w: 70, align: 'right' as const },
        { label: 'Ret. Bs', x: 377, w: 92, align: 'right' as const },
        { label: 'Emisión', x: 471, w: 46, align: 'right' as const },
        { label: 'Estado', x: 519, w: 36, align: 'right' as const },
      ];

      const header = (): number => {
        doc.fontSize(13).font('Helvetica-Bold').fillColor('#111827').text(COMPANY, 40, 38, { width: RIGHT - 40 });
        doc.fontSize(9).font('Helvetica').fillColor('#374151').text(`RIF: ${RIF}`, 40, 55);
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#4c1d95').text('Retenciones de IVA (Compras)', 40, 69, { width: RIGHT - 40 });
        doc.fontSize(8).font('Helvetica').fillColor('#6b7280')
          .text(`${periodLabel} · ${vouchers.length} comprobantes`, 40, 85)
          .text(`Generado: ${new Date().toLocaleString('es-VE')}`, 40, 95);
        doc.moveTo(40, 108).lineTo(RIGHT, 108).strokeColor('#9ca3af').lineWidth(1).stroke();
        return 116;
      };

      const tableHead = (y: number): number => {
        doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#1f2937');
        for (const c of COLS) doc.text(c.label, c.x, y, { width: c.w, align: c.align, lineBreak: false });
        y += 12;
        doc.moveTo(40, y).lineTo(RIGHT, y).strokeColor('#d1d5db').lineWidth(0.8).stroke();
        return y + 4;
      };

      let y = header();
      y = tableHead(y);

      let zebra = 0;
      for (const v of vouchers) {
        doc.font('Helvetica').fontSize(7.5);
        const name = v.supplier?.name || '--';
        const rif = v.supplier?.rif || 'S/R';
        const nameH = doc.heightOfString(name, { width: COLS[1].w });
        const rifH = doc.heightOfString(rif, { width: COLS[1].w });
        const rowH = Math.max(15, nameH + rifH + 5);

        if (y + rowH > BOTTOM) { doc.addPage(); y = header(); y = tableHead(y); }
        if (zebra % 2 === 1) doc.rect(40, y - 2, RIGHT - 40, rowH).fill('#f8fafc');
        zebra++;

        doc.font('Helvetica').fontSize(7.5).fillColor('#111827');
        doc.text(name, COLS[1].x, y, { width: COLS[1].w });
        doc.fillColor('#6b7280').fontSize(7);
        doc.text(rif, COLS[1].x, y + nameH + 1, { width: COLS[1].w, lineBreak: false });

        doc.font('Helvetica').fontSize(7.5).fillColor('#111827');
        doc.text(v.number, COLS[0].x, y, { width: COLS[0].w, lineBreak: false });
        doc.text(String(v._count.lines), COLS[2].x, y, { width: COLS[2].w, align: 'right', lineBreak: false });
        doc.text(`${v.retentionPct}%`, COLS[3].x, y, { width: COLS[3].w, align: 'right', lineBreak: false });
        doc.text(fmtUsd(v.retentionAmountUsd), COLS[4].x, y, { width: COLS[4].w, align: 'right', lineBreak: false });
        doc.text(`Bs ${fmtBs(v.retentionAmountBs)}`, COLS[5].x, y, { width: COLS[5].w, align: 'right', lineBreak: false });
        doc.text(fmtDate(v.issueDate), COLS[6].x, y, { width: COLS[6].w, align: 'right', lineBreak: false });
        doc.fillColor(STATUS_COLOR[v.status] || '#111827').font('Helvetica-Bold');
        doc.text(STATUS[v.status] || v.status, COLS[7].x, y, { width: COLS[7].w, align: 'right', lineBreak: false });

        y += rowH;
        doc.moveTo(40, y - 2).lineTo(RIGHT, y - 2).strokeColor('#eef2f7').lineWidth(0.5).stroke();
      }

      const valid = vouchers.filter((v) => v.status !== 'CANCELLED');
      const totUsd = valid.reduce((s, v) => s + (v.retentionAmountUsd || 0), 0);
      const totBs = valid.reduce((s, v) => s + (v.retentionAmountBs || 0), 0);
      const nIssued = vouchers.filter((v) => v.status === 'ISSUED').length;
      const nPending = vouchers.filter((v) => v.status === 'PENDING').length;
      const nCancelled = vouchers.filter((v) => v.status === 'CANCELLED').length;

      if (y + 60 > BOTTOM) { doc.addPage(); y = header(); }
      y += 6;
      doc.moveTo(40, y).lineTo(RIGHT, y).strokeColor('#9ca3af').lineWidth(1).stroke();
      y += 8;
      doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#111827');
      doc.text('TOTAL RETENIDO (sin anuladas):', 40, y, { width: COLS[4].x - 43, align: 'right', lineBreak: false });
      doc.fillColor('#4c1d95');
      doc.text(fmtUsd(totUsd), COLS[4].x, y, { width: COLS[4].w, align: 'right', lineBreak: false });
      doc.text(`Bs ${fmtBs(totBs)}`, COLS[5].x, y, { width: COLS[5].w, align: 'right', lineBreak: false });
      y += 16;
      doc.fontSize(8).font('Helvetica').fillColor('#374151');
      doc.text(
        `Comprobantes: ${vouchers.length}   ·   Emitidas: ${nIssued}   ·   Pendientes: ${nPending}   ·   Anuladas: ${nCancelled}`,
        40, y, { lineBreak: false },
      );

      doc.end();
    });
  }
}
