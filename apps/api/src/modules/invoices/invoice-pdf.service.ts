import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as PDFDocument from 'pdfkit';
import { caracasDayStart, caracasDayEnd } from '../../common/timezone';

const IVA_LABELS: Record<string, string> = {
  EXEMPT: 'Exento',
  REDUCED: 'Reducido 8%',
  GENERAL: 'General 16%',
  SPECIAL: 'Especial 31%',
};

// Payment method labels now come from the PaymentMethod table via relation

@Injectable()
export class InvoicePdfService {
  constructor(private readonly prisma: PrismaService) {}

  // Reporte de ventas agrupado por vendedor: por factura (correlativo - cliente)
  // y debajo los items (descripcion, cantidad, precio, descuento). Respeta los
  // mismos filtros que el listado de facturas.
  async generateSellerReport(filters: {
    status?: string;
    paymentType?: string;
    sellerId?: string;
    search?: string;
    from?: string;
    to?: string;
  }): Promise<Buffer> {
    const where: any = { type: 'SALE' };
    // Si no se filtra por estado, incluir solo ventas concretadas (no PENDING/CANCELLED).
    if (filters.status) where.status = filters.status;
    else where.status = { in: ['PAID', 'PARTIAL_RETURN', 'RETURNED'] };
    if (filters.paymentType) where.paymentType = filters.paymentType;
    if (filters.sellerId) where.sellerId = filters.sellerId;
    if (filters.search) {
      where.OR = [
        { number: { contains: filters.search, mode: 'insensitive' } },
        { customer: { name: { contains: filters.search, mode: 'insensitive' } } },
        { customer: { rif: { contains: filters.search, mode: 'insensitive' } } },
      ];
    }
    if (filters.from || filters.to) {
      where.createdAt = {};
      if (filters.from) { where.createdAt.gte = caracasDayStart(filters.from); }
      if (filters.to) { where.createdAt.lte = caracasDayEnd(filters.to); }
    }

    const invoices = await this.prisma.invoice.findMany({
      where,
      include: {
        customer: { select: { name: true } },
        seller: { select: { name: true } },
        items: { select: { productId: true, productName: true, quantity: true, totalUsd: true, discountPct: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Codigos de producto (InvoiceItem no tiene relacion a Product; se mapea aparte)
    const productIds = [...new Set(invoices.flatMap((inv) => inv.items.map((it) => it.productId)))];
    const products = productIds.length
      ? await this.prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, code: true } })
      : [];
    const codeMap = new Map(products.map((p) => [p.id, p.code]));

    // Agrupar por vendedor
    const groups = new Map<string, typeof invoices>();
    for (const inv of invoices) {
      const key = inv.seller?.name || 'SIN VENDEDOR';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(inv);
    }
    const sortedGroups = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));

    const config = await this.prisma.companyConfig.findFirst();

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'LETTER', margin: 40 });
      const buffers: Buffer[] = [];
      doc.on('data', (c: Buffer) => buffers.push(c));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const left = 40;
      const right = doc.page.width - 40;
      const bottom = doc.page.height - 40;
      const fmt = (n: number) => n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const C = { art: 40, cant: 350, precio: 408, desc: 478, total: 522 };
      const W = { art: 300, cant: 52, precio: 62, desc: 40, total: 50 };

      let y = 40;
      doc.fontSize(15).font('Helvetica-Bold').fillColor('#000').text(config?.companyName || 'Trinity ERP', left, y);
      y += 19;
      doc.fontSize(12).font('Helvetica-Bold').text('Reporte de Ventas por Vendedor', left, y);
      y += 15;
      const period = (filters.from || filters.to) ? `${filters.from || '…'} al ${filters.to || '…'}` : 'Todas las fechas';
      doc.fontSize(8).font('Helvetica').fillColor('#555')
        .text(`Periodo: ${period}     Generado: ${new Date().toLocaleDateString('es-VE')}`, left, y);
      y += 13;
      doc.moveTo(left, y).lineTo(right, y).strokeColor('#94a3b8').stroke();
      y += 10;

      const ensure = (need: number) => { if (y + need > bottom) { doc.addPage(); y = 40; } };
      const itemHeader = () => {
        doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#64748b');
        doc.text('Articulo', C.art, y, { width: W.art });
        doc.text('Cant', C.cant, y, { width: W.cant, align: 'right' });
        doc.text('Precio', C.precio, y, { width: W.precio, align: 'right' });
        doc.text('Desc%', C.desc, y, { width: W.desc, align: 'right' });
        doc.text('Total', C.total, y, { width: W.total, align: 'right' });
        y += 11;
      };

      if (sortedGroups.length === 0) {
        doc.fontSize(10).font('Helvetica').fillColor('#555')
          .text('No hay facturas para los filtros seleccionados.', left, y);
        doc.end();
        return;
      }

      let grandTotal = 0;
      for (const [sellerName, sellerInvoices] of sortedGroups) {
        ensure(46);
        doc.rect(left, y, right - left, 16).fill('#1e293b');
        doc.fontSize(9.5).font('Helvetica-Bold').fillColor('#fff')
          .text(`VENDEDOR: ${sellerName}   (${sellerInvoices.length} factura${sellerInvoices.length === 1 ? '' : 's'})`, left + 6, y + 4);
        y += 22;
        doc.fillColor('#000');

        let sellerTotal = 0;
        for (const inv of sellerInvoices) {
          ensure(40);
          sellerTotal += inv.totalUsd;
          doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#0f766e')
            .text(`${inv.number || 'S/N'}  —  ${inv.customer?.name || 'Cliente Final'}`, C.art, y, { width: 360 });
          doc.fontSize(7.5).font('Helvetica').fillColor('#555')
            .text(`${new Date(inv.createdAt).toLocaleDateString('es-VE')}    Total: $${fmt(inv.totalUsd)}`, 400, y + 1, { width: right - 400, align: 'right' });
          y += 13;
          doc.fillColor('#000');
          itemHeader();
          for (const it of inv.items) {
            ensure(14);
            const disc = it.discountPct || 0;
            const denom = it.quantity * (1 - disc / 100);
            const precio = denom > 0 ? it.totalUsd / denom : it.totalUsd;
            const code = codeMap.get(it.productId);
            let label = code ? `${code} - ${it.productName}` : it.productName;
            if (label.length > 58) label = label.slice(0, 57) + '…';
            doc.fontSize(8).font('Helvetica').fillColor('#1e293b');
            doc.text(label, C.art, y, { width: W.art, lineBreak: false });
            doc.text(String(it.quantity), C.cant, y, { width: W.cant, align: 'right' });
            doc.text(`$${fmt(precio)}`, C.precio, y, { width: W.precio, align: 'right' });
            doc.text(disc ? fmt(disc) : '—', C.desc, y, { width: W.desc, align: 'right' });
            doc.text(`$${fmt(it.totalUsd)}`, C.total, y, { width: W.total, align: 'right' });
            y += 12;
          }
          y += 5;
        }

        ensure(20);
        doc.moveTo(left, y).lineTo(right, y).strokeColor('#cbd5e1').stroke();
        y += 3;
        doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#000')
          .text(`Total ${sellerName}: $${fmt(sellerTotal)}`, left, y, { width: right - left, align: 'right' });
        y += 18;
        grandTotal += sellerTotal;
      }

      ensure(24);
      doc.moveTo(left, y).lineTo(right, y).strokeColor('#94a3b8').stroke();
      y += 4;
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#000')
        .text(`TOTAL GENERAL: $${fmt(grandTotal)}`, left, y, { width: right - left, align: 'right' });

      doc.end();
    });
  }

  async generatePdf(invoiceId: string): Promise<Buffer> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        customer: true,
        cashRegister: true,
        items: true,
        payments: { include: { method: true } },
      },
    });

    if (!invoice) throw new NotFoundException('Factura no encontrada');

    const config = await this.prisma.companyConfig.findFirst();

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
          doc.fontSize(16).font('Helvetica-Bold').text(config?.companyName || 'Trinity ERP', 40, y);
          y += 20;
        }
      } else {
        doc.fontSize(16).font('Helvetica-Bold').text(config?.companyName || 'Trinity ERP', 40, y);
        y += 20;
        doc.fontSize(9).font('Helvetica');
        if (config?.rif) { doc.text(`RIF: ${config.rif}`, 40, y); y += 12; }
        if (config?.address) { doc.text(config.address, 40, y); y += 12; }
        if (config?.phone) { doc.text(`Tel: ${config.phone}`, 40, y); y += 12; }
      }

      // Invoice info (right side)
      const rightX = 350;
      let ry = 40;
      doc.fontSize(12).font('Helvetica-Bold').text('FACTURA', rightX, ry, { width: pageWidth - rightX + 40, align: 'right' });
      ry += 18;
      doc.fontSize(9).font('Helvetica');
      doc.text(`No: ${invoice.number || 'S/N'}`, rightX, ry, { width: pageWidth - rightX + 40, align: 'right' }); ry += 12;
      if (invoice.controlNumber) { doc.text(`Control: ${invoice.controlNumber}`, rightX, ry, { width: pageWidth - rightX + 40, align: 'right' }); ry += 12; }
      doc.text(`Fecha: ${new Date(invoice.createdAt).toLocaleDateString('es-VE')}`, rightX, ry, { width: pageWidth - rightX + 40, align: 'right' }); ry += 12;
      doc.text(`Tasa: Bs ${invoice.exchangeRate.toFixed(2)}`, rightX, ry, { width: pageWidth - rightX + 40, align: 'right' }); ry += 12;
      doc.text(`Estado: ${invoice.status}`, rightX, ry, { width: pageWidth - rightX + 40, align: 'right' });

      y = Math.max(y, ry) + 20;

      // Separator
      doc.moveTo(40, y).lineTo(40 + pageWidth, y).stroke('#cccccc');
      y += 10;

      // Customer info
      doc.fontSize(10).font('Helvetica-Bold').text('CLIENTE', 40, y);
      y += 14;
      doc.fontSize(9).font('Helvetica');
      if (invoice.customer) {
        doc.text(`Nombre: ${invoice.customer.name}`, 40, y); y += 12;
        if (invoice.customer.rif) { doc.text(`RIF: ${invoice.customer.rif}`, 40, y); y += 12; }
        if (invoice.customer.address) { doc.text(`Direccion: ${invoice.customer.address}`, 40, y); y += 12; }
      } else {
        doc.text('Cliente: General / Consumidor Final', 40, y); y += 12;
      }

      y += 10;

      // Items table header
      const colX = { code: 40, desc: 100, qty: 320, price: 370, iva: 430, total: 490 };
      doc.moveTo(40, y).lineTo(40 + pageWidth, y).stroke('#cccccc');
      y += 5;
      doc.fontSize(8).font('Helvetica-Bold');
      doc.text('Codigo', colX.code, y);
      doc.text('Descripcion', colX.desc, y);
      doc.text('Cant.', colX.qty, y, { width: 40, align: 'right' });
      doc.text('P. Unit.', colX.price, y, { width: 50, align: 'right' });
      doc.text('% IVA', colX.iva, y, { width: 50, align: 'right' });
      doc.text('Total USD', colX.total, y, { width: 70, align: 'right' });
      y += 14;
      doc.moveTo(40, y).lineTo(40 + pageWidth, y).stroke('#cccccc');
      y += 5;

      // Items
      doc.fontSize(8).font('Helvetica');
      for (const item of invoice.items) {
        // Altura dinamica: la descripcion puede ocupar 2 lineas.
        doc.fontSize(8).font('Helvetica');
        const descH = doc.heightOfString(item.productName, { width: 215 });
        const rowH = Math.max(14, descH + 2);
        if (y + rowH > 720) {
          doc.addPage();
          y = 40;
        }
        doc.text(item.productId.slice(0, 8), colX.code, y, { width: 55 });
        doc.text(item.productName, colX.desc, y, { width: 215 });
        doc.text(item.quantity.toString(), colX.qty, y, { width: 40, align: 'right', lineBreak: false });
        doc.text(`$${item.unitPrice.toFixed(2)}`, colX.price, y, { width: 50, align: 'right', lineBreak: false });
        doc.text(IVA_LABELS[item.ivaType] || item.ivaType, colX.iva, y, { width: 50, align: 'right', lineBreak: false });
        doc.text(`$${item.totalUsd.toFixed(2)}`, colX.total, y, { width: 70, align: 'right', lineBreak: false });
        y += rowH;
      }

      y += 5;
      doc.moveTo(40, y).lineTo(40 + pageWidth, y).stroke('#cccccc');
      y += 10;

      // IVA breakdown
      const ivaByType: Record<string, number> = {};
      for (const item of invoice.items) {
        ivaByType[item.ivaType] = (ivaByType[item.ivaType] || 0) + item.ivaAmount;
      }

      const totalsX = 380;
      doc.fontSize(9).font('Helvetica');
      doc.text('Subtotal:', totalsX, y); doc.text(`$${invoice.subtotalUsd.toFixed(2)}`, colX.total, y, { width: 70, align: 'right' }); y += 14;

      for (const [type, amount] of Object.entries(ivaByType)) {
        if (amount > 0) {
          doc.text(`IVA ${IVA_LABELS[type] || type}:`, totalsX, y); doc.text(`$${amount.toFixed(2)}`, colX.total, y, { width: 70, align: 'right' }); y += 14;
        }
      }

      // IGTF line (if applicable)
      if (invoice.igtfUsd > 0) {
        doc.text(`IGTF (3%):`, totalsX, y); doc.text(`$${invoice.igtfUsd.toFixed(2)}`, colX.total, y, { width: 70, align: 'right' }); y += 14;
      }

      y += 2;
      doc.moveTo(totalsX, y).lineTo(40 + pageWidth, y).stroke('#333333');
      y += 5;
      doc.fontSize(11).font('Helvetica-Bold');
      doc.text('TOTAL USD:', totalsX, y); doc.text(`$${invoice.totalUsd.toFixed(2)}`, colX.total, y, { width: 70, align: 'right' }); y += 16;
      doc.fontSize(9).font('Helvetica');
      doc.text('TOTAL Bs:', totalsX, y); doc.text(`Bs ${invoice.totalBs.toFixed(2)}`, colX.total, y, { width: 70, align: 'right' }); y += 20;

      // Payments
      if (invoice.payments.length > 0) {
        doc.fontSize(10).font('Helvetica-Bold').text('METODOS DE PAGO', 40, y);
        y += 14;
        doc.fontSize(9).font('Helvetica');
        for (const p of invoice.payments) {
          const label = (p as any).method?.name || 'Metodo';
          doc.text(`${label}: $${p.amountUsd.toFixed(2)} / Bs ${p.amountBs.toFixed(2)}${p.reference ? ` (Ref: ${p.reference})` : ''}`, 40, y);
          y += 12;
        }
      }

      // Footer
      y += 20;
      doc.moveTo(40, y).lineTo(40 + pageWidth, y).stroke('#cccccc');
      y += 8;
      doc.fontSize(7).font('Helvetica').fillColor('#888888');
      doc.text(`${config?.companyName || 'Trinity ERP'} - Generado el ${new Date().toLocaleString('es-VE')}`, 40, y, { width: pageWidth, align: 'center' });

      doc.end();
    });
  }
}
