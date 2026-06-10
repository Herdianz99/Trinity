import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as PDFDocument from 'pdfkit';

function fmtBs(n: number): string {
  const parts = Math.abs(n).toFixed(2).split('.');
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (n < 0 ? '-' : '') + intPart + ',' + parts[1];
}

function fmtDate(d: Date | string | null): string {
  if (!d) return '';
  const date = new Date(d);
  return `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}`;
}

function fmtPeriodo(d: Date | null): string {
  if (!d) return '';
  const date = new Date(d);
  return `${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getFullYear()}`;
}

function fmtHora(d: Date): string {
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'P.M.' : 'A.M.';
  h = h % 12 || 12;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')} ${ampm}`;
}

function labelValue(doc: PDFKit.PDFDocument, label: string, value: string, x: number, y: number, w: number) {
  const labelW = doc.font('Helvetica-Bold').widthOfString(label);
  doc.font('Helvetica-Bold').text(label, x, y, { lineBreak: false });
  doc.font('Helvetica').text(value, x + labelW, y, { width: w - labelW, lineBreak: false });
}

@Injectable()
export class IslrRetentionVouchersPdfService {
  constructor(private readonly prisma: PrismaService) {}

  async generatePdf(id: string): Promise<Buffer> {
    const voucher = await this.prisma.islrRetentionVoucher.findUnique({
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
                subtotalUsd: true,
                subtotalBs: true,
                totalUsd: true,
                totalBs: true,
                exchangeRate: true,
                supplierControlNumber: true,
                supplierInvoiceNumber: true,
              },
            },
            islrRetentionType: {
              select: {
                codigo: true,
                descripcion: true,
                baseImponiblePct: true,
                retentionPct: true,
                sustraendoUt: true,
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

      const pageWidth = doc.page.width - 80;
      const L = 40;
      const R = L + pageWidth;
      let y = 40;
      let pageNum = 1;

      const issueDate = voucher.issueDate ? new Date(voucher.issueDate) : new Date(voucher.createdAt);
      const now = new Date();

      // ═══════════════════════════════════════════════════════════════════
      // HEADER
      // ═══════════════════════════════════════════════════════════════════

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

      // Title centered
      const centerX = L + logoW + 5;
      const centerW = infoBoxX - centerX - 5;
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#000000')
        .text('Comprobante de Retención del ISLR', centerX, y, { width: centerW, align: 'center', lineBreak: false });
      doc.fontSize(6.5).font('Helvetica')
        .text('Decreto 1.808 - Gaceta Oficial Nº 36.203', centerX, y + 14, { width: centerW, align: 'center', lineBreak: false });

      y = Math.max(logoBottomY, infoBoxY + infoBoxH) + 4;

      // Legal text
      doc.fontSize(5.5).font('Helvetica').fillColor('#333333');
      doc.text(
        'Decreto 1.808 - Los deudores de los enriquecimientos netos o ingresos brutos a los que se contrae el artículo 9 del Reglamento Parcial de la Ley de ISLR en materia de Retenciones, '
        + 'deberán practicar la retención del impuesto en el momento del pago o abono en cuenta.',
        L, y, { width: pageWidth, align: 'center', lineBreak: true },
      );
      y += 18;

      // ═══════════════════════════════════════════════════════════════════
      // TWO COLUMNS
      // ═══════════════════════════════════════════════════════════════════

      const colWidth = pageWidth / 2;
      const col1X = L;
      const col2X = L + colWidth;
      const boxH = 52;
      const boxTop = y;

      // Agent de retención (company)
      doc.rect(col1X, boxTop, colWidth, boxH).lineWidth(0.5).stroke('#333333');
      doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#000000')
        .text('Datos del agente de retención', col1X + 5, boxTop + 4, { lineBreak: false });
      doc.fontSize(7);
      let ay = boxTop + 15;
      const bw = colWidth - 12;
      labelValue(doc, 'Nombre: ', config?.companyName || '', col1X + 5, ay, bw);
      ay += 10;
      labelValue(doc, 'RIF: ', config?.rif || '', col1X + 5, ay, bw);
      ay += 10;
      labelValue(doc, 'Dirección: ', (config?.address || '').substring(0, 50), col1X + 5, ay, bw);
      ay += 10;
      if (config?.phone) {
        labelValue(doc, 'Teléfono: ', config.phone, col1X + 5, ay, bw);
      }

      // Sujeto retenido (supplier)
      doc.rect(col2X, boxTop, colWidth, boxH).lineWidth(0.5).stroke('#333333');
      doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#000000')
        .text('Datos del sujeto retenido', col2X + 5, boxTop + 4, { lineBreak: false });
      doc.fontSize(7);
      let sy = boxTop + 15;
      labelValue(doc, 'Nombre: ', voucher.supplier.name, col2X + 5, sy, bw);
      sy += 10;
      labelValue(doc, 'RIF: ', voucher.supplier.rif || '', col2X + 5, sy, bw);
      sy += 10;
      if (voucher.supplier.address) {
        labelValue(doc, 'Dirección: ', (voucher.supplier.address).substring(0, 50), col2X + 5, sy, bw);
        sy += 10;
      }
      if (voucher.supplier.phone) {
        labelValue(doc, 'Teléfono: ', voucher.supplier.phone, col2X + 5, sy, bw);
      }

      y = boxTop + boxH + 8;

      // ═══════════════════════════════════════════════════════════════════
      // LINES TABLE — ISLR specific columns
      // ═══════════════════════════════════════════════════════════════════

      const cols = [
        { label: 'Oper\nNº',                x: L,         w: 22,  align: 'center' as const },
        { label: 'Fecha\nfact.',             x: L + 22,    w: 42,  align: 'center' as const },
        { label: 'Nº Factura',              x: L + 64,    w: 50,  align: 'center' as const },
        { label: 'Nº Control',              x: L + 114,   w: 48,  align: 'center' as const },
        { label: 'Concepto',                x: L + 162,   w: 30,  align: 'center' as const },
        { label: 'Base\nimponible',          x: L + 192,   w: 55,  align: 'right' as const },
        { label: '%\nBase',                  x: L + 247,   w: 25,  align: 'center' as const },
        { label: '%\nRet.',                  x: L + 272,   w: 25,  align: 'center' as const },
        { label: 'Sustraendo\nBs',           x: L + 297,   w: 55,  align: 'right' as const },
        { label: 'ISLR\nRetenido Bs',        x: L + 352,   w: 60,  align: 'right' as const },
        { label: 'ISLR\nRetenido $',         x: L + 412,   w: 60,  align: 'right' as const },
        { label: 'Total fact.\ninc. IVA Bs', x: L + 472,   w: 60,  align: 'right' as const },
      ];

      // Table header
      const headerH = 24;
      doc.rect(L, y, pageWidth, headerH).lineWidth(0.5).fillAndStroke('#e0e0e0', '#333333');

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

      let totalTaxableBaseBs = 0;
      let totalSustraendoBs = 0;
      let totalRetentionBs = 0;
      let totalRetentionUsd = 0;
      let totalInvoiceBs = 0;

      voucher.lines.forEach((line, idx) => {
        if (y + rowH > doc.page.height - 110) {
          doc.fontSize(6).font('Helvetica').fillColor('#666666');
          doc.text(`Pagina ${pageNum}`, L, doc.page.height - 45, { width: pageWidth, align: 'right', lineBreak: false });
          doc.fillColor('#000000');
          doc.addPage();
          pageNum++;
          y = 40;
        }

        if (idx % 2 === 0) {
          doc.rect(L, y, pageWidth, rowH).fill('#f5f5f5');
          doc.fillColor('#000000');
        }

        doc.rect(L, y, pageWidth, rowH).lineWidth(0.3).stroke('#bbbbbb');

        totalTaxableBaseBs += line.taxableBaseBs;
        totalSustraendoBs += line.sustraendoBs;
        totalRetentionBs += line.retentionAmountBs;
        totalRetentionUsd += line.retentionAmountUsd;
        totalInvoiceBs += line.invoiceTotalBs;

        const cellY = y + 3.5;
        doc.font('Helvetica').fontSize(6);

        doc.text(String(idx + 1), cols[0].x + 2, cellY, { width: cols[0].w - 4, align: 'center', lineBreak: false });

        const invDate = line.invoiceDate ? fmtDate(line.invoiceDate) : '';
        doc.text(invDate, cols[1].x + 2, cellY, { width: cols[1].w - 4, align: 'center', lineBreak: false });
        doc.text(line.supplierInvoiceNumber || '', cols[2].x + 2, cellY, { width: cols[2].w - 4, align: 'center', lineBreak: false });
        doc.text(line.supplierControlNumber || '', cols[3].x + 2, cellY, { width: cols[3].w - 4, align: 'center', lineBreak: false });
        doc.text(String(line.islrRetentionType.codigo), cols[4].x + 2, cellY, { width: cols[4].w - 4, align: 'center', lineBreak: false });
        doc.text(fmtBs(line.taxableBaseBs), cols[5].x + 2, cellY, { width: cols[5].w - 4, align: 'right', lineBreak: false });
        doc.text(String(line.baseImponiblePct), cols[6].x + 2, cellY, { width: cols[6].w - 4, align: 'center', lineBreak: false });
        doc.text(String(line.retentionPct), cols[7].x + 2, cellY, { width: cols[7].w - 4, align: 'center', lineBreak: false });
        doc.text(fmtBs(line.sustraendoBs), cols[8].x + 2, cellY, { width: cols[8].w - 4, align: 'right', lineBreak: false });
        doc.text(fmtBs(line.retentionAmountBs), cols[9].x + 2, cellY, { width: cols[9].w - 4, align: 'right', lineBreak: false });
        doc.text(fmtBs(line.retentionAmountUsd), cols[10].x + 2, cellY, { width: cols[10].w - 4, align: 'right', lineBreak: false });
        doc.text(fmtBs(line.invoiceTotalBs), cols[11].x + 2, cellY, { width: cols[11].w - 4, align: 'right', lineBreak: false });

        y += rowH;
      });

      // ═══════════════════════════════════════════════════════════════════
      // TOTALS ROW
      // ═══════════════════════════════════════════════════════════════════

      y += 1;
      doc.rect(L, y, pageWidth, 15).lineWidth(0.5).fillAndStroke('#e0e0e0', '#333333');
      doc.fillColor('#000000').fontSize(6).font('Helvetica-Bold');

      const totY = y + 4;
      doc.text('TOTALES', cols[0].x + 2, totY, { width: cols[4].x + cols[4].w - cols[0].x - 4, align: 'right', lineBreak: false });
      doc.text(fmtBs(totalTaxableBaseBs), cols[5].x + 2, totY, { width: cols[5].w - 4, align: 'right', lineBreak: false });
      doc.text('', cols[6].x + 2, totY, { width: cols[6].w - 4, lineBreak: false });
      doc.text('', cols[7].x + 2, totY, { width: cols[7].w - 4, lineBreak: false });
      doc.text(fmtBs(totalSustraendoBs), cols[8].x + 2, totY, { width: cols[8].w - 4, align: 'right', lineBreak: false });
      doc.text(fmtBs(totalRetentionBs), cols[9].x + 2, totY, { width: cols[9].w - 4, align: 'right', lineBreak: false });
      doc.text(fmtBs(totalRetentionUsd), cols[10].x + 2, totY, { width: cols[10].w - 4, align: 'right', lineBreak: false });
      doc.text(fmtBs(totalInvoiceBs), cols[11].x + 2, totY, { width: cols[11].w - 4, align: 'right', lineBreak: false });

      y += 22;

      // Total ISLR highlight
      doc.fontSize(9).font('Helvetica-Bold');
      doc.text(`Total ISLR retenido:  Bs ${fmtBs(totalRetentionBs)}  /  $ ${fmtBs(totalRetentionUsd)}`, L, y, { width: pageWidth, align: 'right', lineBreak: false });
      y += 14;

      // UT info
      doc.fontSize(7).font('Helvetica');
      doc.text(`Valor Unidad Tributaria: Bs ${fmtBs(voucher.unidadTributaria)}`, L, y, { width: pageWidth, align: 'right', lineBreak: false });
      y += 16;

      // ═══════════════════════════════════════════════════════════════════
      // FOOTER
      // ═══════════════════════════════════════════════════════════════════

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

      const footerCol2X = L + pageWidth / 2 + 20;

      doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#000000');
      doc.text('Firma y sello del agente de retención', L, y, { lineBreak: false });
      y += 6;

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

      const recStartY = y - (config?.stampImage ? 70 : 40);
      doc.fontSize(7.5).font('Helvetica-Bold');
      doc.text('Recibido por:', footerCol2X, recStartY, { lineBreak: false });
      const recLineY = recStartY + 30;
      doc.moveTo(footerCol2X, recLineY).lineTo(R - 10, recLineY).lineWidth(0.3).stroke('#666666');
      doc.fontSize(7).font('Helvetica');
      doc.text('Fecha de recepción: ___/___/______', footerCol2X, recLineY + 8, { lineBreak: false });

      y += 16;

      // Page footer
      doc.fontSize(6).fillColor('#888888').font('Helvetica');
      doc.text('Documento emitido con Trinity ERP', L, doc.page.height - 45, { width: pageWidth / 2, lineBreak: false });
      doc.text(`Pagina ${pageNum} De ${pageNum}`, L, doc.page.height - 45, { width: pageWidth, align: 'right', lineBreak: false });

      doc.end();
    });
  }
}
