import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as PDFDocument from 'pdfkit';

const IVA_LABELS: Record<string, string> = {
  EXEMPT: 'Exento',
  REDUCED: '8%',
  GENERAL: '16%',
  SPECIAL: '31%',
};

function fmtNum(n: number): string {
  const parts = Math.abs(n).toFixed(2).split('.');
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (n < 0 ? '-' : '') + intPart + ',' + parts[1];
}

function fmtDate(d: Date | string | null): string {
  if (!d) return '';
  const date = new Date(d);
  return `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}`;
}

function fmtDateTime(d: Date | string): string {
  const date = new Date(d);
  const dd = date.getDate().toString().padStart(2, '0');
  const mm = (date.getMonth() + 1).toString().padStart(2, '0');
  const yyyy = date.getFullYear();
  let h = date.getHours();
  const min = date.getMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'P.M.' : 'A.M.';
  h = h % 12 || 12;
  return `${dd}/${mm}/${yyyy} ${h.toString().padStart(2, '0')}:${min} ${ampm}`;
}

/** Helper: write bold label + normal value in a single text call */
function labelValue(doc: PDFKit.PDFDocument, label: string, value: string, x: number, y: number, w: number) {
  const labelW = doc.font('Helvetica-Bold').widthOfString(label);
  doc.font('Helvetica-Bold').text(label, x, y, { lineBreak: false });
  doc.font('Helvetica').text(value, x + labelW, y, { width: w - labelW, lineBreak: false });
}

@Injectable()
export class PurchaseOrdersPdfService {
  constructor(private readonly prisma: PrismaService) {}

  async generatePdf(id: string): Promise<Buffer> {
    const order = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        supplier: true,
        responsible: { select: { id: true, name: true } },
        warehouse: { select: { id: true, name: true } },
        serie: { select: { id: true, name: true, prefix: true, isFiscal: true } },
        items: {
          include: {
            product: {
              select: { id: true, code: true, name: true, ivaType: true, isService: true },
            },
          },
        },
      },
    });

    if (!order) throw new NotFoundException('Factura de compra no encontrada');

    const creator = await this.prisma.user.findUnique({
      where: { id: order.createdById },
      select: { name: true },
    });

    const config = await this.prisma.companyConfig.findFirst();

    const isBs = order.currency === 'BS';
    const currSymbol = isBs ? 'Bs' : '$';
    const altSymbol = isBs ? '$' : 'Bs';

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'LETTER', margins: { top: 40, left: 40, right: 40, bottom: 0 } });
      const buffers: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const pageWidth = doc.page.width - 80; // 532
      const L = 40;
      const R = L + pageWidth;
      let y = 40;
      let pageNum = 1;

      // ═══════════════════════════════════════════════════════════════════
      // HEADER — Logo (left) + Supplier info (right)
      // ═══════════════════════════════════════════════════════════════════

      let logoBottomY = y;
      if (config?.logo) {
        try {
          const base64Data = config.logo.replace(/^data:image\/\w+;base64,/, '');
          const logoBuffer = Buffer.from(base64Data, 'base64');
          doc.image(logoBuffer, L, y, { height: 45 });
          logoBottomY = y + 50;
        } catch {
          doc.fontSize(13).font('Helvetica-Bold').text(config?.companyName || 'Trinity ERP', L, y, { lineBreak: false });
          logoBottomY = y + 18;
        }
      } else {
        doc.fontSize(13).font('Helvetica-Bold').text(config?.companyName || 'Trinity ERP', L, y, { lineBreak: false });
        logoBottomY = y + 18;
        doc.fontSize(8).font('Helvetica');
        if (config?.rif) { doc.text(`RIF: ${config.rif}`, L, logoBottomY, { lineBreak: false }); logoBottomY += 11; }
        if (config?.address) { doc.text(config.address, L, logoBottomY, { lineBreak: false }); logoBottomY += 11; }
      }

      // Right: Supplier info box
      const supplierBoxW = 240;
      const supplierBoxX = R - supplierBoxW;
      const supplierBoxY = y;
      const supplierBoxH = 52;

      doc.rect(supplierBoxX, supplierBoxY, supplierBoxW, supplierBoxH)
        .lineWidth(0.5).stroke('#333333');

      const sbx = supplierBoxX + 6;
      const sbw = supplierBoxW - 12;
      doc.fontSize(8).font('Helvetica-Bold')
        .text('PROVEEDOR', sbx, supplierBoxY + 5, { lineBreak: false });
      doc.fontSize(7.5);
      let sy = supplierBoxY + 16;
      labelValue(doc, 'Nombre: ', order.supplier.name, sbx, sy, sbw);
      sy += 11;
      labelValue(doc, 'RIF: ', order.supplier.rif || 'N/A', sbx, sy, sbw);
      sy += 11;
      if (order.supplier.address) {
        labelValue(doc, 'Dir: ', order.supplier.address.substring(0, 55), sbx, sy, sbw);
      }

      y = Math.max(logoBottomY, supplierBoxY + supplierBoxH) + 8;

      // ═══════════════════════════════════════════════════════════════════
      // INFO BOX — 3 columns x 4 rows
      // ═══════════════════════════════════════════════════════════════════

      const infoBoxH = 52;
      doc.rect(L, y, pageWidth, infoBoxH).lineWidth(0.5).stroke('#333333');

      const colW = pageWidth / 3;
      const col1x = L + 6;
      const col2x = L + colW + 6;
      const col3x = L + colW * 2 + 6;
      const cw = colW - 12;
      doc.moveTo(L + colW, y).lineTo(L + colW, y + infoBoxH).lineWidth(0.3).stroke('#cccccc');
      doc.moveTo(L + colW * 2, y).lineTo(L + colW * 2, y + infoBoxH).lineWidth(0.3).stroke('#cccccc');

      let iy = y + 4;
      doc.fontSize(7).fillColor('#000000');

      // Row 1
      labelValue(doc, 'Nº Interno: ', order.number, col1x, iy, cw);
      labelValue(doc, 'Fecha: ', fmtDate(order.invoiceDate), col2x, iy, cw);
      labelValue(doc, 'Recepcion: ', fmtDate(order.receivedDate || order.receivedAt) || 'Pendiente', col3x, iy, cw);
      iy += 12;

      // Row 2
      labelValue(doc, 'Nº Fact. Prov.: ', order.supplierInvoiceNumber || 'S/N', col1x, iy, cw);
      labelValue(doc, 'Tasa: ', `Bs ${order.exchangeRate.toFixed(4)}`, col2x, iy, cw);
      labelValue(doc, 'Serie: ', order.serie?.name || 'N/A', col3x, iy, cw);
      iy += 12;

      // Row 3
      labelValue(doc, 'Nº Control: ', order.supplierControlNumber || 'N/A', col1x, iy, cw);
      labelValue(doc, 'Responsable: ', order.responsible?.name || 'N/A', col2x, iy, cw);
      labelValue(doc, 'Pago: ', order.isCredit ? `Credito ${order.creditDays} dias` : 'Contado', col3x, iy, cw);
      iy += 12;

      // Row 4
      labelValue(doc, 'Nº Serial: ', order.supplierSerialNumber || 'N/A', col1x, iy, cw);
      labelValue(doc, 'Almacen: ', order.warehouse?.name || 'N/A', col2x, iy, cw);

      y += infoBoxH + 8;

      // ═══════════════════════════════════════════════════════════════════
      // ITEMS TABLE
      // ═══════════════════════════════════════════════════════════════════

      const cols = [
        { label: 'Codigo',      x: L,         w: 55,  align: 'left' as const },
        { label: 'Descripcion', x: L + 55,    w: 185, align: 'left' as const },
        { label: 'Cant.',       x: L + 240,   w: 35,  align: 'right' as const },
        { label: `Precio ${currSymbol}`, x: L + 275, w: 60, align: 'right' as const },
        { label: '% Dto.',      x: L + 335,   w: 35,  align: 'right' as const },
        { label: `Importe ${currSymbol}`, x: L + 370, w: 65, align: 'right' as const },
        { label: '% IVA',       x: L + 435,   w: 40,  align: 'center' as const },
        { label: `Imp. ${altSymbol}`, x: L + 475, w: 57, align: 'right' as const },
      ];

      // Table header
      const headerH = 16;
      doc.rect(L, y, pageWidth, headerH).lineWidth(0.5).fillAndStroke('#e0e0e0', '#333333');
      doc.fillColor('#000000').fontSize(7).font('Helvetica-Bold');

      for (const col of cols) {
        doc.text(col.label, col.x + 2, y + 4, { width: col.w - 4, align: col.align, lineBreak: false });
      }

      y += headerH;

      // Table rows
      doc.font('Helvetica').fontSize(7).fillColor('#000000');
      const rowH = 14;

      for (let idx = 0; idx < order.items.length; idx++) {
        const item = order.items[idx];

        // Page break
        if (y + rowH > doc.page.height - 130) {
          doc.fontSize(6).font('Helvetica').fillColor('#888888');
          doc.text(`Pagina ${pageNum}`, L, doc.page.height - 40, { width: pageWidth, align: 'right', lineBreak: false });
          doc.fillColor('#000000');
          doc.addPage();
          pageNum++;
          y = 40;
        }

        // Alternate row background
        if (idx % 2 === 0) {
          doc.rect(L, y, pageWidth, rowH).fill('#f8f8f8');
          doc.fillColor('#000000');
        }

        // Row border
        doc.rect(L, y, pageWidth, rowH).lineWidth(0.2).stroke('#cccccc');

        const cellY = y + 3.5;
        const cost = isBs ? item.costBs : item.costUsd;
        const total = isBs ? item.totalBs : item.totalUsd;
        const altTotal = isBs ? item.totalUsd : item.totalBs;

        doc.font('Helvetica').fontSize(7);
        doc.text(item.product.code, cols[0].x + 2, cellY, { width: cols[0].w - 4, align: 'left', lineBreak: false });
        doc.text(item.product.name.substring(0, 40), cols[1].x + 2, cellY, { width: cols[1].w - 4, align: 'left', lineBreak: false });
        doc.text(String(item.quantity), cols[2].x + 2, cellY, { width: cols[2].w - 4, align: 'right', lineBreak: false });
        doc.text(fmtNum(cost), cols[3].x + 2, cellY, { width: cols[3].w - 4, align: 'right', lineBreak: false });
        doc.text(item.discountPct > 0 ? `${item.discountPct}%` : '', cols[4].x + 2, cellY, { width: cols[4].w - 4, align: 'right', lineBreak: false });
        doc.text(fmtNum(total), cols[5].x + 2, cellY, { width: cols[5].w - 4, align: 'right', lineBreak: false });
        doc.text(IVA_LABELS[item.product.ivaType] || '16%', cols[6].x + 2, cellY, { width: cols[6].w - 4, align: 'center', lineBreak: false });
        doc.text(fmtNum(altTotal), cols[7].x + 2, cellY, { width: cols[7].w - 4, align: 'right', lineBreak: false });

        y += rowH;
      }

      // Bottom border of table
      doc.moveTo(L, y).lineTo(R, y).lineWidth(0.5).stroke('#333333');
      y += 10;

      // ═══════════════════════════════════════════════════════════════════
      // TOTALS
      // ═══════════════════════════════════════════════════════════════════

      if (y + 120 > doc.page.height - 60) {
        doc.fontSize(6).font('Helvetica').fillColor('#888888');
        doc.text(`Pagina ${pageNum}`, L, doc.page.height - 40, { width: pageWidth, align: 'right', lineBreak: false });
        doc.fillColor('#000000');
        doc.addPage();
        pageNum++;
        y = 40;
      }

      const totalsX = L + pageWidth * 0.55;
      const totalsValX = R - 80;
      const totalsW = 80;

      const subtotal = isBs ? order.subtotalBs : order.subtotalUsd;
      const discountGlobal = isBs ? order.discountGlobalBs : order.discountGlobalUsd;
      const exemptAmount = isBs ? order.exemptAmountBs : order.exemptAmountUsd;
      const taxableBase = isBs ? order.taxableBaseBs : order.taxableBaseUsd;
      const totalIva = isBs ? order.totalIvaBs : order.totalIvaUsd;
      const totalSurcharge = isBs ? order.totalSurchargeBs : order.totalSurchargeUsd;
      const total = isBs ? order.totalBs : order.totalUsd;
      const altTotal = isBs ? order.totalUsd : order.totalBs;

      doc.fontSize(8).font('Helvetica').fillColor('#000000');

      doc.text(`Subtotal ${currSymbol}:`, totalsX, y, { lineBreak: false });
      doc.text(`${currSymbol} ${fmtNum(subtotal)}`, totalsValX, y, { width: totalsW, align: 'right', lineBreak: false });
      y += 13;

      if (order.discountGlobalPct > 0) {
        doc.text(`Dto. global (${order.discountGlobalPct}%):`, totalsX, y, { lineBreak: false });
        doc.text(`-${currSymbol} ${fmtNum(discountGlobal)}`, totalsValX, y, { width: totalsW, align: 'right', lineBreak: false });
        y += 13;
      }

      const subtotalWithDiscount = subtotal - discountGlobal;
      doc.text(`Sub-Total c/Dto ${currSymbol}:`, totalsX, y, { lineBreak: false });
      doc.text(`${currSymbol} ${fmtNum(subtotalWithDiscount)}`, totalsValX, y, { width: totalsW, align: 'right', lineBreak: false });
      y += 13;

      if (exemptAmount > 0) {
        doc.text(`Monto Exento ${currSymbol}:`, totalsX, y, { lineBreak: false });
        doc.text(`${currSymbol} ${fmtNum(exemptAmount)}`, totalsValX, y, { width: totalsW, align: 'right', lineBreak: false });
        y += 13;
      }

      doc.text(`Base IVA ${currSymbol}:`, totalsX, y, { lineBreak: false });
      doc.text(`${currSymbol} ${fmtNum(taxableBase)}`, totalsValX, y, { width: totalsW, align: 'right', lineBreak: false });
      y += 13;

      doc.text(`Total IVA ${currSymbol}:`, totalsX, y, { lineBreak: false });
      doc.text(`${currSymbol} ${fmtNum(totalIva)}`, totalsValX, y, { width: totalsW, align: 'right', lineBreak: false });
      y += 13;

      if (totalSurcharge > 0) {
        doc.text(`Recargo ${currSymbol}:`, totalsX, y, { lineBreak: false });
        doc.text(`${currSymbol} ${fmtNum(totalSurcharge)}`, totalsValX, y, { width: totalsW, align: 'right', lineBreak: false });
        y += 13;
      }

      // Separator
      doc.moveTo(totalsX, y).lineTo(R, y).lineWidth(0.5).stroke('#333333');
      y += 5;

      // Total primary
      doc.fontSize(11).font('Helvetica-Bold');
      doc.text(`TOTAL ${currSymbol}:`, totalsX, y, { lineBreak: false });
      doc.text(`${currSymbol} ${fmtNum(total)}`, totalsValX, y, { width: totalsW, align: 'right', lineBreak: false });
      y += 16;

      // Total secondary
      doc.fontSize(8).font('Helvetica');
      doc.text(`Total ${altSymbol}:`, totalsX, y, { lineBreak: false });
      doc.text(`${altSymbol} ${fmtNum(altTotal)}`, totalsValX, y, { width: totalsW, align: 'right', lineBreak: false });
      y += 18;

      // ═══════════════════════════════════════════════════════════════════
      // NOTES
      // ═══════════════════════════════════════════════════════════════════

      if (order.notes) {
        doc.fontSize(7).font('Helvetica-Bold').text('Observaciones:', L, y, { lineBreak: false });
        y += 10;
        doc.font('Helvetica').text(order.notes, L, y, { width: pageWidth, lineBreak: false });
        y += 16;
      }

      // ═══════════════════════════════════════════════════════════════════
      // FOOTER
      // ═══════════════════════════════════════════════════════════════════

      doc.moveTo(L, y).lineTo(R, y).lineWidth(0.3).stroke('#999999');
      y += 8;

      doc.fontSize(7).font('Helvetica').fillColor('#555555');
      doc.text(
        `Registrado en sistema por: ${creator?.name || 'N/A'} | ${fmtDateTime(order.createdAt)}`,
        L, y, { width: pageWidth, lineBreak: false },
      );

      // Page footer
      doc.fontSize(6).fillColor('#888888').font('Helvetica');
      doc.text('Documento emitido con Trinity ERP', L, doc.page.height - 40, { width: pageWidth / 2, lineBreak: false });
      doc.text(`Pagina ${pageNum}`, L, doc.page.height - 40, { width: pageWidth, align: 'right', lineBreak: false });

      doc.end();
    });
  }
}
