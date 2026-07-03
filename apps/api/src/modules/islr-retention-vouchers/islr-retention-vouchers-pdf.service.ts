import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as PDFDocument from 'pdfkit';

function fmtBs(n: number): string {
  const parts = Math.abs(n).toFixed(2).split('.');
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (n < 0 ? '-' : '') + intPart + ',' + parts[1];
}

function fmtPct(n: number): string {
  return n.toFixed(2).replace('.', ',');
}

function fmtDate(d: Date | string | null): string {
  if (!d) return '';
  const date = new Date(d);
  return `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}`;
}

function fmtHora(d: Date): string {
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'P. M.' : 'A. M.';
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
            islrRetentionType: { select: { codigo: true, descripcion: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
        createdBy: { select: { id: true, name: true } },
      },
    });

    if (!voucher) throw new NotFoundException('Comprobante no encontrado');

    const config = (await this.prisma.companyConfig.findFirst()) as any;

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

      // ── TITULO (arriba, centrado, todo el ancho) ────────────────────────
      doc.fillColor('#000000').fontSize(10).font('Helvetica-Bold')
        .text('Comprobante de retención de impuesto', L, y, { width: pageWidth, align: 'center', lineBreak: false });
      doc.text('sobre la renta Artículo 87 de la ley', L, y + 12, { width: pageWidth, align: 'center', lineBreak: false });
      y += 30;

      // ── Logo (izq) + caja de datos del comprobante (der) ────────────────
      const headerTop = y;
      let logoBottomY = y;
      if (config?.logo) {
        try {
          const base64Data = config.logo.replace(/^data:image\/\w+;base64,/, '');
          doc.image(Buffer.from(base64Data, 'base64'), L, y, { height: 45 });
          logoBottomY = y + 48;
        } catch {
          doc.fontSize(12).font('Helvetica-Bold').text(config?.companyName || 'Trinity ERP', L, y, { lineBreak: false });
          logoBottomY = y + 16;
        }
      } else {
        doc.fontSize(12).font('Helvetica-Bold').text(config?.companyName || 'Trinity ERP', L, y, { lineBreak: false });
        logoBottomY = y + 16;
      }

      const infoBoxW = 180;
      const infoBoxH = 46;
      const infoBoxX = R - infoBoxW;
      doc.rect(infoBoxX, headerTop, infoBoxW, infoBoxH).lineWidth(0.5).stroke('#333333');
      doc.fontSize(7.5).fillColor('#000000');
      const lblX = infoBoxX + 6;
      const valX = infoBoxX + 92;
      let iy = headerTop + 6;
      doc.font('Helvetica-Bold').text('Nº de Comprobante:', lblX, iy, { lineBreak: false });
      doc.font('Helvetica').text(voucher.number, valX, iy, { lineBreak: false });
      iy += 13;
      doc.font('Helvetica-Bold').text('Fecha:', lblX, iy, { lineBreak: false });
      doc.font('Helvetica').text(fmtDate(issueDate), valX, iy, { lineBreak: false });
      iy += 13;
      doc.font('Helvetica-Bold').text('Hora:', lblX, iy, { lineBreak: false });
      doc.font('Helvetica').text(fmtHora(now), valX, iy, { lineBreak: false });

      y = Math.max(logoBottomY, headerTop + infoBoxH) + 8;

      // ── Datos del agente de retención ───────────────────────────────────
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#000000')
        .text('Datos del agente de retención', L, y, { lineBreak: false });
      y += 12;
      doc.fontSize(7.5);
      labelValue(doc, 'Nombre:  ', config?.companyName || '', L, y, pageWidth); y += 11;
      labelValue(doc, 'Nº de Rif:  ', config?.rif || '', L, y, pageWidth); y += 11;
      doc.font('Helvetica-Bold').text('Dirección:  ', L, y, { lineBreak: false });
      const dirLabelW = doc.font('Helvetica-Bold').widthOfString('Dirección:  ');
      doc.font('Helvetica').text(
        `${config?.address || ''}${config?.phone ? `   Teléfono: ${config.phone}` : ''}`,
        L + dirLabelW, y, { width: pageWidth - dirLabelW },
      );
      y = doc.y + 8;

      // ── Datos del sujeto retenido ───────────────────────────────────────
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#000000')
        .text('Datos del sujeto retenido', L, y, { lineBreak: false });
      y += 12;
      doc.fontSize(7.5);
      labelValue(doc, 'Nombre:  ', voucher.supplier.name, L, y, pageWidth); y += 11;
      labelValue(doc, 'Nº de Rif:  ', voucher.supplier.rif || '', L, y, pageWidth); y += 11;
      doc.font('Helvetica-Bold').text('Dirección:  ', L, y, { lineBreak: false });
      doc.font('Helvetica').text(
        `${voucher.supplier.address || ''}${voucher.supplier.phone ? `   Teléfono: ${voucher.supplier.phone}` : ''}`,
        L + dirLabelW, y, { width: pageWidth - dirLabelW },
      );
      y = doc.y + 10;

      // ── TABLA (columnas en Bs, sin $ ni UT) ─────────────────────────────
      const cols = {
        fecha:    { x: 40,  w: 48,  align: 'center' as const },
        factura:  { x: 88,  w: 52,  align: 'center' as const },
        control:  { x: 140, w: 58,  align: 'center' as const },
        monto:    { x: 198, w: 56,  align: 'right' as const },
        concepto: { x: 254, w: 132, align: 'left' as const },
        base:     { x: 386, w: 54,  align: 'right' as const },
        pct:      { x: 440, w: 34,  align: 'center' as const },
        sust:     { x: 474, w: 46,  align: 'right' as const },
        retenido: { x: 520, w: 52,  align: 'right' as const },
      };

      const drawTableHeader = (): number => {
        const hTop = y;
        const hH = 26;
        doc.rect(L, hTop, pageWidth, hH).lineWidth(0.5).fillAndStroke('#e8e8e8', '#333333');
        doc.fillColor('#000000').fontSize(6).font('Helvetica-Bold');
        // Grupo "Datos factura" sobre Nº factura + Cont. fiscal
        const grpX = cols.factura.x;
        const grpW = cols.control.x + cols.control.w - cols.factura.x;
        doc.text('Datos factura', grpX, hTop + 3, { width: grpW, align: 'center', lineBreak: false });
        // Etiquetas de columna (banda inferior)
        const lblY = hTop + 12;
        const put = (c: { x: number; w: number; align: 'center' | 'right' | 'left' }, text: string) => {
          const parts = text.split('\n');
          parts.forEach((p, i) => doc.text(p, c.x + 2, lblY + i * 6.5, { width: c.w - 4, align: c.align, lineBreak: false }));
        };
        put(cols.fecha, 'Fecha');
        put(cols.factura, 'Nº factura');
        put(cols.control, 'Cont. fiscal');
        put(cols.monto, 'Monto');
        put(cols.concepto, 'Concepto del pago');
        put(cols.base, 'Base\nimponible');
        put(cols.pct, '%\nReten.');
        put(cols.sust, 'Sustraendo');
        put(cols.retenido, 'Monto\nretenido');
        return hTop + hH;
      };

      y = drawTableHeader();

      doc.font('Helvetica').fontSize(6.5).fillColor('#000000');
      let totalRetentionBs = 0;

      voucher.lines.forEach((line) => {
        const concepto = line.islrRetentionType.descripcion;
        doc.fontSize(6.5).font('Helvetica');
        const conceptoH = doc.heightOfString(concepto, { width: cols.concepto.w - 4 });
        const rowH = Math.max(14, conceptoH + 6);

        if (y + rowH > doc.page.height - 130) {
          doc.fontSize(6).font('Helvetica').fillColor('#888888')
            .text(`Pagina ${pageNum}`, L, doc.page.height - 30, { width: pageWidth, align: 'right', lineBreak: false });
          doc.addPage();
          pageNum++;
          y = 40;
          y = drawTableHeader();
          doc.font('Helvetica').fontSize(6.5).fillColor('#000000');
        }

        doc.rect(L, y, pageWidth, rowH).lineWidth(0.3).stroke('#bbbbbb');
        totalRetentionBs += line.retentionAmountBs;

        const cy = y + 3.5;
        doc.fillColor('#000000').fontSize(6.5).font('Helvetica');
        doc.text(fmtDate(line.invoiceDate), cols.fecha.x + 2, cy, { width: cols.fecha.w - 4, align: 'center', lineBreak: false });
        doc.text(line.supplierInvoiceNumber || '', cols.factura.x + 2, cy, { width: cols.factura.w - 4, align: 'center', lineBreak: false });
        doc.text(line.supplierControlNumber || '', cols.control.x + 2, cy, { width: cols.control.w - 4, align: 'center', lineBreak: false });
        doc.text(fmtBs(line.invoiceTotalBs), cols.monto.x + 2, cy, { width: cols.monto.w - 4, align: 'right', lineBreak: false });
        doc.text(concepto, cols.concepto.x + 2, cy, { width: cols.concepto.w - 4, align: 'left' });
        doc.text(fmtBs(line.taxableBaseBs), cols.base.x + 2, cy, { width: cols.base.w - 4, align: 'right', lineBreak: false });
        doc.text(fmtPct(line.retentionPct), cols.pct.x + 2, cy, { width: cols.pct.w - 4, align: 'center', lineBreak: false });
        doc.text(line.sustraendoBs > 0 ? fmtBs(line.sustraendoBs) : '', cols.sust.x + 2, cy, { width: cols.sust.w - 4, align: 'right', lineBreak: false });
        doc.text(fmtBs(line.retentionAmountBs), cols.retenido.x + 2, cy, { width: cols.retenido.w - 4, align: 'right', lineBreak: false });

        y += rowH;
      });

      // ── TOTAL retenido (solo Bs, bajo la columna Monto retenido) ─────────
      y += 6;
      doc.moveTo(cols.sust.x, y).lineTo(R, y).lineWidth(0.5).stroke('#333333');
      y += 5;
      doc.fillColor('#000000').fontSize(8).font('Helvetica-Bold');
      doc.text('Total retenido:', cols.concepto.x, y, { width: cols.sust.x + cols.sust.w - cols.concepto.x - 4, align: 'right', lineBreak: false });
      doc.text(fmtBs(totalRetentionBs), cols.retenido.x, y, { width: cols.retenido.w - 4, align: 'right', lineBreak: false });
      y += 12;
      doc.moveTo(cols.sust.x, y).lineTo(R, y).lineWidth(0.5).stroke('#333333');
      doc.moveTo(cols.sust.x, y + 1.5).lineTo(R, y + 1.5).lineWidth(0.5).stroke('#333333');
      y += 24;

      // ── FOOTER: firma agente (izq) + recibido por (der) ─────────────────
      const footerH = config?.stampImage ? 110 : 70;
      if (y + footerH > doc.page.height - 40) {
        doc.fontSize(6).font('Helvetica').fillColor('#888888')
          .text(`Pagina ${pageNum}`, L, doc.page.height - 30, { width: pageWidth, align: 'right', lineBreak: false });
        doc.addPage();
        pageNum++;
        y = 40;
      }

      const footerCol2X = L + pageWidth / 2 + 20;
      const firmaTop = y;

      if (config?.stampImage) {
        try {
          const stampData = config.stampImage.replace(/^data:image\/\w+;base64,/, '');
          doc.image(Buffer.from(stampData, 'base64'), L, y, { height: 55, width: 170 });
        } catch { /* ignore */ }
      }
      const lineY = firmaTop + (config?.stampImage ? 58 : 32);
      doc.moveTo(L, lineY).lineTo(L + 220, lineY).lineWidth(0.4).stroke('#666666');
      doc.fillColor('#000000').fontSize(7.5).font('Helvetica-Bold')
        .text('Firma y sello agente de retención', L, lineY + 4, { width: 220, align: 'center', lineBreak: false });

      // Recibido por (derecha)
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#000000');
      const recLineY = lineY;
      doc.text('Recibido por:', footerCol2X, recLineY - 4, { lineBreak: false });
      doc.moveTo(footerCol2X + 62, recLineY).lineTo(R - 5, recLineY).lineWidth(0.4).stroke('#666666');
      doc.fontSize(8).font('Helvetica-Bold')
        .text('Fecha de recepción:', footerCol2X, recLineY + 12, { lineBreak: false });
      doc.font('Helvetica').text('___/___/______', footerCol2X + 92, recLineY + 12, { lineBreak: false });

      // ── Pie de página ───────────────────────────────────────────────────
      doc.fontSize(6).fillColor('#888888').font('Helvetica');
      doc.text('Documento emitido con Trinity ERP', L, doc.page.height - 30, { width: pageWidth / 2, lineBreak: false });
      doc.text(`Pagina ${pageNum} De ${pageNum}`, L, doc.page.height - 30, { width: pageWidth, align: 'right', lineBreak: false });

      doc.end();
    });
  }
}
