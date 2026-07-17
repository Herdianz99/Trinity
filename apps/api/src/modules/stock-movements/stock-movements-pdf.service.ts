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

type Summary = {
  from: string | null;
  to: string | null;
  warehouseName: string | null;
  supplierName: string | null;
  type: string | null;
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

  async generateByCategory(
    groups: Group[],
    summary: Summary,
    totalCount: number,
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
    doc.fontSize(11).font('Helvetica-Bold').text('Movimientos de Stock por Categoria', 30, 56);

    // Filtros aplicados
    const parts: string[] = [];
    if (summary.from || summary.to) parts.push(`Periodo: ${summary.from || '...'} a ${summary.to || '...'}`);
    if (summary.warehouseName) parts.push(`Almacen: ${summary.warehouseName}`);
    if (summary.type) parts.push(`Tipo: ${TYPE_LABELS[summary.type] || summary.type}`);
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
