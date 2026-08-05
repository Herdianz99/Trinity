import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as PDFDocument from 'pdfkit';

const TYPE_LABELS: Record<string, string> = {
  NCV: 'NOTA DE CREDITO - VENTA',
  NDV: 'NOTA DE DEBITO - VENTA',
  NCC: 'NOTA DE CREDITO - COMPRA',
  NDC: 'NOTA DE DEBITO - COMPRA',
};

const MOTIVO_LABELS: Record<string, string> = {
  PRODUCTO_DEFECTUOSO: 'Prod. defectuoso',
  ASESORIA: 'Asesoria',
  CLIENTE: 'Cliente',
  FALTANTE_ALMACEN: 'Faltante almacen',
  DEVOLUCION: 'Devolucion',
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Borrador',
  POSTED: 'Confirmada',
  CANCELLED: 'Anulada',
};

// Estructura que produce CreditDebitNotesService.reportBySellerDetailed
interface SellerReportData {
  filters: { from: string | null; to: string | null; status: string | null };
  groups: {
    sellerCode: string | null;
    sellerName: string;
    subtotalUsd: number;
    subtotalBs: number;
    notes: {
      number: string;
      date: Date;
      invoiceNumber: string | null;
      customerName: string;
      motivo: string | null;
      status: string;
      totalUsd: number;
      totalBs: number;
    }[];
  }[];
  grandTotal: { count: number; totalUsd: number; totalBs: number };
}

@Injectable()
export class CreditDebitNotesPdfService {
  constructor(private readonly prisma: PrismaService) {}

  private fmt(n: number): string {
    return n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  private fmtDate(d: Date): string {
    // documentDate se guarda a medianoche de Caracas (04:00 UTC); formatear en UTC
    // evita que se corra un día.
    return new Date(d).toLocaleDateString('es-VE', {
      day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC',
    });
  }

  // Reporte PDF de DEVOLUCIONES (NCV) agrupadas por vendedor. Cada grupo lista sus
  // devoluciones con montos y datos, subtotal por vendedor, y gran total al final.
  async generateBySellerReport(data: SellerReportData): Promise<Buffer> {
    const config = await this.prisma.companyConfig.findFirst();

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'LETTER', margin: 40 });
      const buffers: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const left = 40;
      const pageWidth = doc.page.width - 80; // 532
      const bottom = 740;

      // Columnas de la tabla de devoluciones (x, ancho). Sin "Total Bs" → el espacio
      // liberado se le da al Cliente (nombres largos).
      const COL = {
        nota: { x: 40, w: 110 },
        fecha: { x: 152, w: 52 },
        factura: { x: 206, w: 76 },
        cliente: { x: 284, w: 150 },
        motivo: { x: 436, w: 76 },
        usd: { x: 512, w: 60 },
      };

      let y = 40;

      // Encabezado de empresa
      doc.fontSize(14).font('Helvetica-Bold').text(config?.companyName || 'Trinity ERP', left, y);
      y += 18;
      if (config?.rif) {
        doc.fontSize(9).font('Helvetica').text(`RIF: ${config.rif}`, left, y);
        y += 12;
      }

      // Título
      y += 6;
      doc.fontSize(13).font('Helvetica-Bold')
        .text('DEVOLUCIONES POR VENDEDOR', left, y, { align: 'center', width: pageWidth });
      y += 18;

      // Subtítulo: período y estado
      const periodo = data.filters.from || data.filters.to
        ? `Periodo: ${data.filters.from ? this.fmtDate(new Date(data.filters.from)) : '...'} al ${data.filters.to ? this.fmtDate(new Date(data.filters.to)) : '...'}`
        : 'Periodo: todas las fechas';
      const estado = data.filters.status
        ? `Estado: ${STATUS_LABELS[data.filters.status] || data.filters.status}`
        : 'Estado: todas';
      doc.fontSize(8).font('Helvetica').fillColor('#555')
        .text(`${periodo}   ·   ${estado}   ·   Solo notas de credito de venta (devoluciones)`, left, y, { align: 'center', width: pageWidth });
      doc.fillColor('#000');
      y += 20;

      const drawColHeader = () => {
        doc.fontSize(8).font('Helvetica-Bold').fillColor('#000');
        doc.text('N Nota', COL.nota.x, y, { width: COL.nota.w });
        doc.text('Fecha', COL.fecha.x, y, { width: COL.fecha.w });
        doc.text('Factura', COL.factura.x, y, { width: COL.factura.w });
        doc.text('Cliente', COL.cliente.x, y, { width: COL.cliente.w });
        doc.text('Motivo', COL.motivo.x, y, { width: COL.motivo.w });
        doc.text('Total $', COL.usd.x, y, { width: COL.usd.w, align: 'right' });
        y += 11;
        doc.moveTo(left, y).lineTo(left + pageWidth, y).strokeColor('#ccc').lineWidth(0.3).stroke();
        y += 4;
      };

      const ensureSpace = (needed: number) => {
        if (y + needed > bottom) {
          doc.addPage();
          y = 40;
        }
      };

      if (data.groups.length === 0) {
        doc.fontSize(10).font('Helvetica').text('No hay devoluciones para los filtros seleccionados.', left, y);
        doc.end();
        return;
      }

      for (const g of data.groups) {
        // Encabezado del vendedor (barra). Reservar espacio para barra + header + 1 fila.
        ensureSpace(60);
        doc.rect(left, y, pageWidth, 16).fill('#eef2ff');
        doc.fillColor('#1e293b').fontSize(9.5).font('Helvetica-Bold');
        const sellerLabel = g.sellerCode ? `${g.sellerCode}  ${g.sellerName}` : g.sellerName;
        doc.text(sellerLabel, left + 6, y + 4, { width: pageWidth - 180 });
        doc.text(`${g.notes.length} devolucion${g.notes.length !== 1 ? 'es' : ''}`, left + pageWidth - 174, y + 4, { width: 168, align: 'right' });
        doc.fillColor('#000');
        y += 22;

        drawColHeader();

        // Filas de devoluciones del vendedor
        doc.font('Helvetica').fontSize(8);
        for (const n of g.notes) {
          const cliente = n.customerName || '—';
          const motivo = n.motivo ? (MOTIVO_LABELS[n.motivo] || n.motivo) : '—';
          const clienteH = doc.heightOfString(cliente, { width: COL.cliente.w });
          const notaH = doc.heightOfString(n.number, { width: COL.nota.w });
          const rowH = Math.max(12, clienteH, notaH) + 3;
          ensureSpace(rowH + 2);

          doc.font('Helvetica').fontSize(8).fillColor('#000');
          doc.text(n.number, COL.nota.x, y, { width: COL.nota.w });
          doc.text(this.fmtDate(n.date), COL.fecha.x, y, { width: COL.fecha.w, lineBreak: false });
          doc.text(n.invoiceNumber || '—', COL.factura.x, y, { width: COL.factura.w, lineBreak: false });
          doc.text(cliente, COL.cliente.x, y, { width: COL.cliente.w });
          // Motivo; si la nota no está confirmada, marcarlo en gris
          const motivoTxt = n.status !== 'POSTED' ? `${motivo} (${STATUS_LABELS[n.status] || n.status})` : motivo;
          doc.fillColor(n.status !== 'POSTED' ? '#b45309' : '#000').text(motivoTxt, COL.motivo.x, y, { width: COL.motivo.w });
          doc.fillColor('#000');
          doc.text(this.fmt(n.totalUsd), COL.usd.x, y, { width: COL.usd.w, align: 'right', lineBreak: false });
          y += rowH;
        }

        // Subtotal del vendedor
        y += 2;
        doc.moveTo(left, y).lineTo(left + pageWidth, y).strokeColor('#999').lineWidth(0.5).stroke();
        y += 4;
        doc.font('Helvetica-Bold').fontSize(8.5);
        doc.text(`Subtotal ${g.sellerName}`, COL.nota.x, y, { width: COL.motivo.x + COL.motivo.w - COL.nota.x, align: 'right' });
        doc.text(this.fmt(g.subtotalUsd), COL.usd.x, y, { width: COL.usd.w, align: 'right', lineBreak: false });
        y += 20;
      }

      // Gran total
      ensureSpace(40);
      doc.moveTo(left, y).lineTo(left + pageWidth, y).strokeColor('#000').lineWidth(1).stroke();
      y += 6;
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#000');
      doc.text(`TOTAL GENERAL  (${data.grandTotal.count} devoluciones)`, left, y, { width: COL.motivo.x + COL.motivo.w - left, align: 'right' });
      doc.text(this.fmt(data.grandTotal.totalUsd), COL.usd.x, y, { width: COL.usd.w, align: 'right', lineBreak: false });

      doc.end();
    });
  }

  async generate(noteId: string): Promise<Buffer> {
    const note = await this.prisma.creditDebitNote.findUnique({
      where: { id: noteId },
      include: {
        invoice: {
          select: {
            number: true,
            customer: { select: { name: true, rif: true, phone: true, address: true } },
          },
        },
        purchaseOrder: {
          select: {
            number: true,
            supplier: { select: { name: true, rif: true, phone: true, address: true } },
          },
        },
        items: true,
      },
    });

    if (!note) throw new NotFoundException('Nota no encontrada');

    const config = await this.prisma.companyConfig.findFirst();
    const isSale = ['NCV', 'NDV'].includes(note.type);
    const entity = isSale ? note.invoice?.customer : note.purchaseOrder?.supplier;
    const parentNumber = isSale ? note.invoice?.number : note.purchaseOrder?.number;

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'LETTER', margin: 40 });
      const buffers: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const pageWidth = doc.page.width - 80;
      let y = 40;

      // Header - Company logo or text
      if (config?.logo) {
        try {
          const base64Data = config.logo.replace(/^data:image\/\w+;base64,/, '');
          const logoBuffer = Buffer.from(base64Data, 'base64');
          doc.image(logoBuffer, 40, y, { height: 50 });
          y += 55;
        } catch {
          doc.fontSize(14).font('Helvetica-Bold').text(config?.companyName || 'Trinity ERP', 40, y);
          y += 18;
        }
      } else {
        doc.fontSize(14).font('Helvetica-Bold').text(config?.companyName || 'Trinity ERP', 40, y);
        y += 18;
        if (config?.rif) {
          doc.fontSize(9).font('Helvetica').text(`RIF: ${config.rif}`, 40, y);
          y += 12;
        }
        if (config?.address) {
          doc.fontSize(8).font('Helvetica').text(config.address, 40, y);
          y += 12;
        }
      }

      // Title
      y += 10;
      doc.fontSize(13).font('Helvetica-Bold').text(TYPE_LABELS[note.type] || 'NOTA', 40, y, { align: 'center', width: pageWidth });
      y += 22;

      // Note info
      doc.fontSize(9).font('Helvetica-Bold').text('Numero:', 40, y);
      doc.font('Helvetica').text(note.number, 110, y);
      doc.font('Helvetica-Bold').text('Fecha:', 300, y);
      doc.font('Helvetica').text(new Date(note.createdAt).toLocaleDateString('es-VE'), 345, y);
      y += 14;
      doc.font('Helvetica-Bold').text('Documento ref.:', 40, y);
      doc.font('Helvetica').text(parentNumber || '—', 130, y);
      doc.font('Helvetica-Bold').text('Tasa:', 300, y);
      doc.font('Helvetica').text(`Bs ${this.fmt(note.exchangeRate)}`, 335, y);
      y += 14;
      doc.font('Helvetica-Bold').text('Origen:', 40, y);
      doc.font('Helvetica').text(note.origin === 'MERCHANDISE' ? 'Devolución de mercancía' : 'Ajuste manual', 100, y);
      y += 20;

      // Separator
      doc.moveTo(40, y).lineTo(40 + pageWidth, y).strokeColor('#999').lineWidth(0.5).stroke();
      y += 10;

      // Entity info
      if (entity) {
        doc.fontSize(9).font('Helvetica-Bold').text(isSale ? 'Cliente:' : 'Proveedor:', 40, y);
        doc.font('Helvetica').text(entity.name || '—', 110, y);
        y += 13;
        doc.font('Helvetica-Bold').text('RIF:', 40, y);
        doc.font('Helvetica').text(entity.rif || '—', 110, y);
        y += 18;
      }

      if (note.origin === 'MERCHANDISE' && note.items.length > 0) {
        // Items table header
        doc.fontSize(8).font('Helvetica-Bold');
        doc.text('Producto', 40, y, { width: 180 });
        doc.text('Cant.', 220, y, { width: 40, align: 'right' });
        doc.text('P.Unit $', 265, y, { width: 60, align: 'right' });
        doc.text('IVA $', 330, y, { width: 55, align: 'right' });
        doc.text('Total $', 390, y, { width: 60, align: 'right' });
        doc.text('Total Bs', 455, y, { width: 70, align: 'right' });
        y += 12;
        doc.moveTo(40, y).lineTo(40 + pageWidth, y).strokeColor('#ccc').lineWidth(0.3).stroke();
        y += 5;

        // Items
        doc.font('Helvetica').fontSize(8);
        for (const item of note.items) {
          // Altura dinamica: el nombre del producto puede ocupar 2 lineas.
          doc.font('Helvetica').fontSize(8);
          // Muestra el descuento junto al nombre (como la factura): P.Unit es el precio BASE
          // pre-descuento, y el Total ya es neto → así se lee coherente (precio − desc = total).
          const dsc = (item.discountPct || 0) > 0 ? `  (-${item.discountPct}% desc.)` : '';
          const displayName = `${item.productName}${dsc}`;
          const nameH = doc.heightOfString(displayName, { width: 180 });
          const rowH = Math.max(13, nameH + 2);
          if (y + rowH > 720) {
            doc.addPage();
            y = 40;
          }
          doc.text(displayName, 40, y, { width: 180 });
          doc.text(String(item.quantity), 220, y, { width: 40, align: 'right', lineBreak: false });
          doc.text(this.fmt(item.unitPriceUsd), 265, y, { width: 60, align: 'right', lineBreak: false });
          doc.text(this.fmt(item.ivaAmount), 330, y, { width: 55, align: 'right', lineBreak: false });
          doc.text(this.fmt(item.totalUsd), 390, y, { width: 60, align: 'right', lineBreak: false });
          doc.text(this.fmt(item.totalBs), 455, y, { width: 70, align: 'right', lineBreak: false });
          y += rowH;
        }
        y += 5;
      } else if (note.origin === 'MANUAL') {
        doc.fontSize(9).font('Helvetica');
        if (note.manualPct) {
          doc.text(`Porcentaje aplicado: ${note.manualPct}% sobre documento ${parentNumber}`, 40, y);
        } else {
          doc.text(`Monto manual: $ ${this.fmt(note.manualAmountUsd || 0)}`, 40, y);
        }
        y += 20;
      }

      // Separator
      y += 5;
      doc.moveTo(40, y).lineTo(40 + pageWidth, y).strokeColor('#999').lineWidth(0.5).stroke();
      y += 12;

      // Totals
      const totalsX = 350;
      doc.fontSize(9).font('Helvetica-Bold');
      doc.text('Subtotal USD:', totalsX, y); doc.font('Helvetica').text(`$ ${this.fmt(note.subtotalUsd)}`, totalsX + 100, y); y += 14;
      doc.font('Helvetica-Bold').text('IVA USD:', totalsX, y); doc.font('Helvetica').text(`$ ${this.fmt(note.ivaUsd)}`, totalsX + 100, y); y += 14;
      doc.font('Helvetica-Bold').text('Total USD:', totalsX, y); doc.font('Helvetica').text(`$ ${this.fmt(note.totalUsd)}`, totalsX + 100, y); y += 14;
      doc.font('Helvetica-Bold').text('Total Bs:', totalsX, y); doc.font('Helvetica').text(`Bs ${this.fmt(note.totalBs)}`, totalsX + 100, y); y += 20;

      // Notes
      if (note.notes) {
        doc.fontSize(8).font('Helvetica-Bold').text('Observaciones:', 40, y);
        y += 12;
        doc.font('Helvetica').text(note.notes, 40, y, { width: pageWidth });
      }

      doc.end();
    });
  }
}
