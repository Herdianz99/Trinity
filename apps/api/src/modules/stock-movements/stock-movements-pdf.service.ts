import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as PDFDocument from 'pdfkit';

type Movement = {
  createdAt: Date;
  type: string;
  quantity: number;
  reason: string | null;
  reference: string | null;
  product: { code: string; name: string; priceDetal: number; category: { name: string } | null };
  warehouse: { name: string };
};

type Group = {
  category: string;
  items: Movement[];
  entradas: number;
  salidas: number;
  neto: number;
  count: number;
  entradasVenta: number;
  salidasVenta: number;
  netoVenta: number;
};

type SellerGroup = {
  seller: string;
  count: number;
  documents: number;
  units: number;
  amount: number;
  categories: {
    category: string;
    count: number;
    documents: number;
    units: number;
    amount: number;
    items: {
      createdAt: Date;
      quantity: number;
      reference: string | null;
      product: { code: string; name: string; priceDetal: number | null };
    }[];
  }[];
};

type Summary = {
  from: string | null;
  to: string | null;
  warehouseName: string | null;
  supplierName: string | null;
  type: string | null;
  serie?: string | null;
  product: string | null;
};

const TYPE_LABELS: Record<string, string> = {
  PURCHASE: 'Compra',
  SALE: 'Venta',
  ADJUSTMENT_IN: 'Ajuste +',
  ADJUSTMENT_OUT: 'Ajuste -',
  TRANSFER_IN: 'Transf. +',
  TRANSFER_OUT: 'Transf. -',
  COUNT_ADJUST: 'Conteo',
  RETURN_IN: 'Devol. +',
  RETURN_OUT: 'Devol. -',
  REPLACEMENT_IN: 'Reempl. +',
  REPLACEMENT_OUT: 'Reempl. -',
};

@Injectable()
export class StockMovementsPdfService {
  constructor(private readonly prisma: PrismaService) {}

  private async getCompanyName(): Promise<string> {
    const config = await this.prisma.companyConfig.findFirst();
    return config?.companyName || 'Trinity ERP';
  }

  private fmtDateTime(d: Date): string {
    return new Date(d).toLocaleString('es-VE', {
      timeZone: 'America/Caracas',
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }

  async generateCostReport(
    rows: {
      createdAt: Date;
      code: string;
      name: string;
      warehouse: string;
      type: string;
      quantity: number;
      unitCost: number;
      lineCost: number;
    }[],
    summary: Summary,
    totalCost: number,
    totalGroupCost = 0,
  ): Promise<Buffer> {
    const company = await this.getCompanyName();
    const doc = new PDFDocument({
      size: 'LETTER',
      layout: 'portrait',
      margins: { top: 40, bottom: 40, left: 30, right: 30 },
      bufferPages: true,
    });

    const pageRight = doc.page.width - 30;
    const m$ = (n: number) => (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    // ── Encabezado ──
    doc.fontSize(15).font('Helvetica-Bold').fillColor('#000').text(company, 30, 36);
    doc.fontSize(11).font('Helvetica-Bold').text('Costo de Movimientos de Stock', 30, 56);

    const parts: string[] = [];
    if (summary.from || summary.to) parts.push(`Periodo: ${summary.from || '...'} a ${summary.to || '...'}`);
    if (summary.warehouseName) parts.push(`Almacen: ${summary.warehouseName}`);
    if (summary.type) parts.push(`Tipo: ${TYPE_LABELS[summary.type] || summary.type}`);
    if (summary.serie) parts.push(summary.serie);
    if (summary.supplierName) parts.push(`Proveedor: ${summary.supplierName}`);
    if (summary.product) parts.push(`Producto: ${summary.product}`);
    doc.fontSize(8).font('Helvetica').fillColor('#475569');
    doc.text(parts.length ? parts.join('   |   ') : 'Sin filtros (todos los movimientos)', 30, 74, { width: pageRight - 30 });
    doc.text(`Generado: ${this.fmtDateTime(new Date())}   |   ${rows.length} movimientos`, 30, 86);
    doc.fillColor('#000');
    doc.moveTo(30, 100).lineTo(pageRight, 100).stroke('#94a3b8');

    // ── Columnas (carta vertical, x de 30 a 582) ──
    const columns = [
      { label: 'Fecha', x: 30, width: 66 },
      { label: 'Codigo', x: 96, width: 58 },
      { label: 'Producto', x: 154, width: 168 },
      { label: 'Tipo', x: 322, width: 54 },
      { label: 'Cantidad', x: 376, width: 52, align: 'right' as const },
      { label: 'Costo unit.', x: 428, width: 68, align: 'right' as const },
      { label: 'Costo total', x: 496, width: 86, align: 'right' as const },
    ];

    let y = 108;

    const drawColHeaders = () => {
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#334155');
      for (const c of columns) doc.text(c.label, c.x, y, { width: c.width, align: (c as any).align });
      doc.fillColor('#000');
      y += 13;
      doc.moveTo(30, y).lineTo(pageRight, y).stroke('#e2e8f0');
      y += 4;
    };

    const ensureSpace = (needed: number) => {
      if (y + needed > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
        y = 40;
        drawColHeaders();
        return true;
      }
      return false;
    };

    drawColHeaders();
    doc.fontSize(8).font('Helvetica');
    for (const r of rows) {
      const values = [
        this.fmtDateTime(r.createdAt),
        r.code,
        r.name,
        TYPE_LABELS[r.type] || r.type,
        `${r.quantity}`,
        `$${m$(r.unitCost)}`,
        `$${m$(r.lineCost)}`,
      ];

      let rowHeight = 11;
      for (let i = 0; i < columns.length; i++) {
        const h = doc.heightOfString(values[i] || '', { width: columns[i].width });
        if (h > rowHeight) rowHeight = h;
      }
      rowHeight += 3;

      ensureSpace(rowHeight);

      doc.fillColor('#1e293b');
      for (let i = 0; i < columns.length; i++) {
        doc.text(values[i] || '', columns[i].x, y, {
          width: columns[i].width,
          align: (columns[i] as any).align,
          lineBreak: true,
        });
      }
      doc.fillColor('#000');
      y += rowHeight;
    }

    // ── Total general + total del grupo (ventas/NC a clientes empresa del grupo) ──
    ensureSpace(46);
    doc.moveTo(30, y).lineTo(pageRight, y).stroke('#94a3b8');
    y += 5;
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#0f766e');
    doc.text(`COSTO TOTAL:  $${m$(totalCost)}`, 30, y, { width: pageRight - 30, align: 'right' });
    y += 15;
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#4338ca');
    doc.text(`Total del grupo:  $${m$(totalGroupCost)}`, 30, y, { width: pageRight - 30, align: 'right' });
    doc.fillColor('#000');

    if (rows.length === 0) {
      doc.fontSize(10).font('Helvetica').fillColor('#64748b');
      doc.text('No hay movimientos que coincidan con los filtros seleccionados.', 30, 120);
      doc.fillColor('#000');
    }

    // ── Paginacion ──
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      const oldBottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc
        .fontSize(8)
        .font('Helvetica')
        .fillColor('#64748b')
        .text(`Pagina ${i + 1} de ${range.count}`, 30, doc.page.height - 26, {
          align: 'center',
          width: doc.page.width - 60,
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

  /**
   * Reporte de ventas por vendedor: tabla resumen de vendedores y, por cada vendedor, sus
   * categorias (docs, movs, unidades, monto y % del vendedor). Con detail=true lista ademas
   * cada movimiento dentro de su categoria, con subtotales.
   */
  async generateBySeller(
    sellers: SellerGroup[],
    summary: Summary,
    totals: { count: number; documents: number; units: number; amount: number },
    detail: boolean,
  ): Promise<Buffer> {
    const company = await this.getCompanyName();
    const doc = new PDFDocument({
      size: 'LETTER',
      layout: 'portrait',
      margins: { top: 40, bottom: 40, left: 30, right: 30 },
      bufferPages: true,
    });

    const pageRight = doc.page.width - 30;
    const m$ = (n: number) => (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const q$ = (n: number) => (n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
    const pct = (part: number, whole: number) => `${whole ? ((part / whole) * 100).toFixed(1) : '0.0'}%`;

    // ── Encabezado ──
    doc.fontSize(15).font('Helvetica-Bold').fillColor('#000').text(company, 30, 36);
    doc
      .fontSize(11)
      .font('Helvetica-Bold')
      .text(`Ventas por Vendedor y Categoria${detail ? ' - Detalle' : ''}`, 30, 56);

    const parts: string[] = ['Solo movimientos de venta'];
    if (summary.from || summary.to) parts.unshift(`Periodo: ${summary.from || '...'} a ${summary.to || '...'}`);
    if (summary.warehouseName) parts.push(`Almacen: ${summary.warehouseName}`);
    if (summary.serie) parts.push(summary.serie);
    if (summary.supplierName) parts.push(`Proveedor: ${summary.supplierName}`);
    if (summary.product) parts.push(`Producto: ${summary.product}`);
    doc.fontSize(8).font('Helvetica').fillColor('#475569');
    doc.text(parts.join('   |   '), 30, 74, { width: pageRight - 30 });
    doc.text(
      `Generado: ${this.fmtDateTime(new Date())}   |   ${totals.count} movimientos en ${totals.documents} documentos   |   Monto = cantidad x precio detal`,
      30,
      86,
    );
    doc.fillColor('#000');
    doc.moveTo(30, 100).lineTo(pageRight, 100).stroke('#94a3b8');

    let y = 108;
    const ensureSpace = (needed: number) => {
      if (y + needed > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
        y = 40;
        return true;
      }
      return false;
    };
    type Col = { label: string; x: number; width: number; align?: 'right' };
    const drawHeaders = (columns: Col[], left: number, size = 8) => {
      doc.fontSize(size).font('Helvetica-Bold').fillColor('#334155');
      for (const c of columns) doc.text(c.label, c.x, y, { width: c.width, align: c.align });
      y += 12;
      doc.moveTo(left, y).lineTo(pageRight, y).stroke('#e2e8f0');
      y += 3;
      doc.font('Helvetica').fillColor('#1e293b');
    };
    const drawRow = (columns: Col[], values: string[]) => {
      columns.forEach((c, i) => doc.text(values[i], c.x, y, { width: c.width, align: c.align, lineBreak: false }));
    };

    // ── Resumen de vendedores (solo en la version resumen) ──
    if (!detail && sellers.length > 0) {
      const cols: Col[] = [
        { label: 'Vendedor', x: 30, width: 250 },
        { label: 'Docs', x: 280, width: 50, align: 'right' },
        { label: 'Movs', x: 330, width: 50, align: 'right' },
        { label: 'Unidades', x: 380, width: 70, align: 'right' },
        { label: 'Monto venta', x: 450, width: 80, align: 'right' },
        { label: '%', x: 530, width: 52, align: 'right' },
      ];
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#0f766e').text('Resumen por vendedor', 30, y);
      y += 16;
      drawHeaders(cols, 30);
      for (const s of sellers) {
        if (ensureSpace(12)) drawHeaders(cols, 30);
        drawRow(cols, [s.seller, q$(s.documents), q$(s.count), q$(s.units), `$${m$(s.amount)}`, pct(s.amount, totals.amount)]);
        y += 12;
      }
      doc.moveTo(30, y).lineTo(pageRight, y).stroke('#94a3b8');
      y += 4;
      doc.font('Helvetica-Bold');
      drawRow(cols, ['TOTAL', q$(totals.documents), q$(totals.count), q$(totals.units), `$${m$(totals.amount)}`, '100%']);
      y += 24;
    }

    const catCols: Col[] = [
      { label: 'Categoria', x: 40, width: 240 },
      { label: 'Docs', x: 280, width: 50, align: 'right' },
      { label: 'Movs', x: 330, width: 50, align: 'right' },
      { label: 'Unidades', x: 380, width: 70, align: 'right' },
      { label: 'Monto venta', x: 450, width: 80, align: 'right' },
      { label: '% vend.', x: 530, width: 52, align: 'right' },
    ];
    const detCols: Col[] = [
      { label: 'Fecha', x: 40, width: 62 },
      { label: 'Documento', x: 102, width: 78 },
      { label: 'Codigo', x: 180, width: 56 },
      { label: 'Producto', x: 236, width: 200 },
      { label: 'Cant.', x: 436, width: 46, align: 'right' },
      { label: 'Precio', x: 482, width: 46, align: 'right' },
      { label: 'Monto', x: 528, width: 54, align: 'right' },
    ];

    for (const s of sellers) {
      // Barra del vendedor
      ensureSpace(70);
      doc.rect(30, y, pageRight - 30, 20).fill('#0f766e');
      doc.fillColor('#fff').fontSize(10).font('Helvetica-Bold').text(s.seller, 36, y + 5, { width: 300, lineBreak: false });
      doc
        .fontSize(8)
        .text(`${s.documents} docs  |  ${q$(s.units)} unid.  |  $${m$(s.amount)}`, 330, y + 6, {
          width: pageRight - 336,
          align: 'right',
        });
      doc.fillColor('#000');
      y += 26;

      if (!detail) {
        drawHeaders(catCols, 40);
        s.categories.forEach((c, k) => {
          if (ensureSpace(12)) {
            doc.fontSize(9).font('Helvetica-Bold').fillColor('#0f766e').text(`${s.seller} (cont.)`, 30, y);
            y += 14;
            drawHeaders(catCols, 40);
          }
          if (k % 2) doc.rect(40, y - 1.5, pageRight - 40, 12).fill('#f1f5f9');
          doc.fillColor('#1e293b');
          drawRow(catCols, [c.category, q$(c.documents), q$(c.count), q$(c.units), `$${m$(c.amount)}`, pct(c.amount, s.amount)]);
          y += 12;
        });
        y += 14;
        continue;
      }

      for (const c of s.categories) {
        ensureSpace(40);
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#0f766e').text(`${c.category}  (${c.count})`, 36, y);
        y += 13;
        drawHeaders(detCols, 40, 7.5);
        for (const m of c.items) {
          const qty = Math.abs(m.quantity);
          const price = m.product.priceDetal || 0;
          const values = [
            this.fmtDateTime(m.createdAt),
            m.reference || '—',
            m.product.code,
            m.product.name,
            q$(qty),
            `$${m$(price)}`,
            `$${m$(qty * price)}`,
          ];
          let rowHeight = 10;
          values.forEach((v, i) => {
            rowHeight = Math.max(rowHeight, doc.heightOfString(v, { width: detCols[i].width }));
          });
          rowHeight += 2;
          if (ensureSpace(rowHeight)) {
            doc.fontSize(8).font('Helvetica-Bold').fillColor('#0f766e').text(`${s.seller} / ${c.category} (cont.)`, 36, y);
            y += 12;
            drawHeaders(detCols, 40, 7.5);
          }
          values.forEach((v, i) => doc.text(v, detCols[i].x, y, { width: detCols[i].width, align: detCols[i].align }));
          y += rowHeight;
        }
        ensureSpace(14);
        doc
          .font('Helvetica-Bold')
          .fillColor('#334155')
          .text(`Subtotal ${c.category}:  ${q$(c.units)} unid.   $${m$(c.amount)}`, 40, y, {
            width: pageRight - 40,
            align: 'right',
          });
        y += 16;
      }
      ensureSpace(16);
      doc
        .fontSize(9)
        .font('Helvetica-Bold')
        .fillColor('#000')
        .text(`TOTAL ${s.seller}:  ${q$(s.units)} unid.   $${m$(s.amount)}`, 30, y, { width: pageRight - 30, align: 'right' });
      y += 22;
    }

    // ── Total general ──
    ensureSpace(20);
    doc.moveTo(30, y).lineTo(pageRight, y).stroke('#94a3b8');
    y += 5;
    doc
      .fontSize(9)
      .font('Helvetica-Bold')
      .fillColor('#000')
      .text(
        `TOTAL GENERAL: ${totals.count} movimientos  |  ${totals.documents} documentos  |  ${q$(totals.units)} unidades  |  $${m$(totals.amount)}`,
        30,
        y,
        { width: pageRight - 30, align: 'right' },
      );

    if (sellers.length === 0) {
      doc.fontSize(10).font('Helvetica').fillColor('#64748b');
      doc.text('No hay ventas que coincidan con los filtros seleccionados.', 30, 120);
      doc.fillColor('#000');
    }

    // ── Paginacion ──
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      const oldBottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc
        .fontSize(8)
        .font('Helvetica')
        .fillColor('#64748b')
        .text(`Pagina ${i + 1} de ${range.count}`, 30, doc.page.height - 26, {
          align: 'center',
          width: doc.page.width - 60,
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

  async generateByCategory(
    groups: Group[],
    summary: Summary,
    totalCount: number,
    title = 'Movimientos de Stock por Categoria',
  ): Promise<Buffer> {
    const company = await this.getCompanyName();
    const doc = new PDFDocument({
      size: 'LETTER',
      layout: 'portrait',
      margins: { top: 40, bottom: 40, left: 30, right: 30 },
      bufferPages: true,
    });

    const pageRight = doc.page.width - 30;

    // ── Encabezado ──
    doc.fontSize(15).font('Helvetica-Bold').fillColor('#000').text(company, 30, 36);
    doc.fontSize(11).font('Helvetica-Bold').text(title, 30, 56);

    // Filtros aplicados
    const parts: string[] = [];
    if (summary.from || summary.to) parts.push(`Periodo: ${summary.from || '...'} a ${summary.to || '...'}`);
    if (summary.warehouseName) parts.push(`Almacen: ${summary.warehouseName}`);
    if (summary.type) parts.push(`Tipo: ${TYPE_LABELS[summary.type] || summary.type}`);
    if (summary.serie) parts.push(summary.serie);
    if (summary.supplierName) parts.push(`Proveedor: ${summary.supplierName}`);
    if (summary.product) parts.push(`Producto: ${summary.product}`);
    doc.fontSize(8).font('Helvetica').fillColor('#475569');
    doc.text(parts.length ? parts.join('   |   ') : 'Sin filtros (todos los movimientos)', 30, 74, { width: pageRight - 30 });
    doc.text(`Generado: ${this.fmtDateTime(new Date())}   |   ${totalCount} movimientos`, 30, 86);
    doc.fillColor('#000');
    doc.moveTo(30, 100).lineTo(pageRight, 100).stroke('#94a3b8');

    // ── Columnas (carta vertical, x de 30 a 582) ──
    const columns = [
      { label: 'Fecha', x: 30, width: 64 },
      { label: 'Codigo', x: 94, width: 56 },
      { label: 'Producto', x: 150, width: 150 },
      { label: 'Tipo', x: 300, width: 50 },
      { label: 'Cantidad', x: 350, width: 42, align: 'right' as const },
      { label: 'Monto venta', x: 392, width: 66, align: 'right' as const },
      { label: 'Motivo / Ref.', x: 458, width: 124 },
    ];
    const m$ = (n: number) => (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    let y = 108;

    const drawColHeaders = () => {
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#334155');
      for (const c of columns) doc.text(c.label, c.x, y, { width: c.width, align: (c as any).align });
      doc.fillColor('#000');
      y += 13;
      doc.moveTo(30, y).lineTo(pageRight, y).stroke('#e2e8f0');
      y += 4;
    };

    const ensureSpace = (needed: number) => {
      if (y + needed > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
        y = 40;
        return true;
      }
      return false;
    };

    for (const group of groups) {
      // Encabezado de categoria
      ensureSpace(40);
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#0f766e');
      doc.text(`${group.category}  (${group.count})`, 30, y, { width: pageRight - 30 });
      doc.fillColor('#000');
      y += 16;
      drawColHeaders();

      doc.fontSize(8).font('Helvetica');
      for (const m of group.items) {
        const motivo = m.reason || m.reference || '—';
        const montoV = m.quantity * (m.product.priceDetal || 0);
        const values = [
          this.fmtDateTime(m.createdAt),
          m.product.code,
          m.product.name,
          TYPE_LABELS[m.type] || m.type,
          `${m.quantity > 0 ? '+' : ''}${m.quantity}`,
          `${montoV >= 0 ? '+' : '-'}$${m$(Math.abs(montoV))}`,
          motivo,
        ];

        // Altura real de la fila = la celda mas alta
        let rowHeight = 11;
        for (let i = 0; i < columns.length; i++) {
          const h = doc.heightOfString(values[i] || '', { width: columns[i].width });
          if (h > rowHeight) rowHeight = h;
        }
        rowHeight += 3;

        if (ensureSpace(rowHeight)) {
          // Repetir cabecera de columnas al saltar de pagina dentro de una categoria
          doc.fontSize(9).font('Helvetica-Bold').fillColor('#0f766e');
          doc.text(`${group.category} (cont.)`, 30, y);
          doc.fillColor('#000');
          y += 14;
          drawColHeaders();
          doc.fontSize(8).font('Helvetica');
        }

        doc.fillColor('#1e293b');
        for (let i = 0; i < columns.length; i++) {
          const colored = i === 4 || i === 5;
          if (colored) doc.fillColor(m.quantity >= 0 ? '#15803d' : '#b91c1c');
          doc.text(values[i] || '', columns[i].x, y, {
            width: columns[i].width,
            align: (columns[i] as any).align,
            lineBreak: true,
          });
          if (colored) doc.fillColor('#1e293b');
        }
        doc.fillColor('#000');
        y += rowHeight;
      }

      // Subtotal de la categoria (cantidades + monto a precio de venta)
      ensureSpace(28);
      doc.moveTo(30, y).lineTo(pageRight, y).stroke('#e2e8f0');
      y += 3;
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#334155');
      doc.text(
        `Subtotal ${group.category}:  Entradas +${group.entradas}   Salidas -${group.salidas}   Neto ${group.neto >= 0 ? '+' : ''}${group.neto}`,
        30,
        y,
        { width: pageRight - 30, align: 'right' },
      );
      y += 11;
      doc.fillColor('#0f766e');
      doc.text(
        `Monto venta:  Entradas +$${m$(group.entradasVenta)}   Salidas -$${m$(group.salidasVenta)}   Neto ${group.netoVenta >= 0 ? '+' : '-'}$${m$(Math.abs(group.netoVenta))}`,
        30,
        y,
        { width: pageRight - 30, align: 'right' },
      );
      doc.fillColor('#000');
      y += 18;
    }

    // ── Total general ──
    const totEntradas = groups.reduce((s, g) => s + g.entradas, 0);
    const totSalidas = groups.reduce((s, g) => s + g.salidas, 0);
    const totNeto = totEntradas - totSalidas;
    const totEntradasV = groups.reduce((s, g) => s + g.entradasVenta, 0);
    const totSalidasV = groups.reduce((s, g) => s + g.salidasVenta, 0);
    const totNetoV = Math.round((totEntradasV - totSalidasV) * 100) / 100;
    ensureSpace(40);
    doc.moveTo(30, y).lineTo(pageRight, y).stroke('#94a3b8');
    y += 5;
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#000');
    doc.text(
      `TOTAL GENERAL:  ${totalCount} movimientos   |   Entradas +${totEntradas}   Salidas -${totSalidas}   Neto ${totNeto >= 0 ? '+' : ''}${totNeto}`,
      30,
      y,
      { width: pageRight - 30, align: 'right' },
    );
    y += 12;
    doc.fillColor('#0f766e');
    doc.text(
      `Monto venta:  Entradas +$${m$(totEntradasV)}   Salidas -$${m$(totSalidasV)}   Neto ${totNetoV >= 0 ? '+' : '-'}$${m$(Math.abs(totNetoV))}`,
      30,
      y,
      { width: pageRight - 30, align: 'right' },
    );
    doc.fillColor('#000');

    if (groups.length === 0) {
      doc.fontSize(10).font('Helvetica').fillColor('#64748b');
      doc.text('No hay movimientos que coincidan con los filtros seleccionados.', 30, 120);
      doc.fillColor('#000');
    }

    // ── Paginacion ──
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      const oldBottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc
        .fontSize(8)
        .font('Helvetica')
        .fillColor('#64748b')
        .text(`Pagina ${i + 1} de ${range.count}`, 30, doc.page.height - 26, {
          align: 'center',
          width: doc.page.width - 60,
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
