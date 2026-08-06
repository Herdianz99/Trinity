import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PayablesService } from './payables.service';
import { QueryPayablesDto } from './dto/query-payables.dto';
import { caracasDateKey } from '../../common/timezone';
import * as PDFDocument from 'pdfkit';
import * as XLSX from 'xlsx';

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendiente',
  PARTIAL: 'Parcial',
  PAID: 'Pagado',
  OVERDUE: 'Vencido',
};

// Carta vertical, area util 40..572. El PROVEEDOR va como encabezado de grupo (no columna),
// espejo del reporte de CxC (que agrupa por cliente), para ubicar las cuentas por proveedor.
const COLS = [
  { label: 'Documento', x: 40, width: 150 },
  { label: 'Vence', x: 196, width: 70 },
  { label: 'Neto USD', x: 272, width: 88, align: 'right' as const },
  { label: 'Saldo USD', x: 366, width: 88, align: 'right' as const },
  { label: 'Estado', x: 460, width: 112 },
];
const RIGHT = 572;

@Injectable()
export class PayablesPdfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payablesService: PayablesService,
  ) {}

  private fmt(n: number): string {
    return (n ?? 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  private dueDate(d: Date | string | null): string {
    if (!d) return '—';
    // dueDate es date-only (medianoche UTC): formatear en UTC para no correr el dia.
    return new Date(d).toLocaleDateString('es-VE', { timeZone: 'UTC' });
  }

  private drawHeaderRow(doc: any, y: number): number {
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#334155');
    for (const c of COLS) {
      const opts: any = { width: c.width };
      if (c.align === 'right') opts.align = 'right';
      doc.text(c.label, c.x, y, opts);
    }
    doc.fillColor('#000');
    y += 13;
    doc.moveTo(40, y).lineTo(RIGHT, y).stroke('#e2e8f0');
    return y + 4;
  }

  // Escribe "Saldo $X     Vencido $Y" alineado a la derecha, en el color base de la
  // barra. El "Vencido" se pinta en rojo si hay monto vencido, para que salte a la vista.
  private drawSaldoVencido(doc: any, y: number, saldo: number, vencido: number, baseColor: string) {
    doc.fillColor(baseColor);
    doc.text(`Saldo $${this.fmt(saldo)}`, RIGHT - 246, y, { width: 130, align: 'right', lineBreak: false });
    doc.fillColor(vencido > 0 ? '#dc2626' : baseColor);
    doc.text(`Vencido $${this.fmt(vencido)}`, RIGHT - 116, y, { width: 116, align: 'right', lineBreak: false });
  }

  // Barra de encabezado de un proveedor: nombre + RIF + (N docs) a la izquierda y
  // Saldo/Vencido a la derecha (subtotal del proveedor). El nombre puede ocupar hasta
  // 2 lineas: la barra crece en alto para que la 2da linea no se monte sobre la fila
  // de abajo (encabezado de columnas). saldo = total que se debe; vencido = parte vencida.
  private drawSupplierBar(
    doc: any, y: number, name: string, rif: string | null,
    count: number, saldo: number, vencido: number, cont = false,
  ): number {
    doc.fontSize(8.5).font('Helvetica-Bold');
    // Ancho disponible para el nombre a la izquierda (antes del bloque Saldo/Vencido).
    const titleW = RIGHT - 46 - 258;
    const tag = cont ? '  — cont.' : '';
    const title = `${name}${rif ? '  ·  ' + rif : ''}  (${count})${tag}`;
    const lineH = doc.currentLineHeight();
    // 1 linea si entra; si no, 2 lineas (con "…" si aun se pasa).
    const twoLines = doc.widthOfString(title) > titleW;
    const barH = twoLines ? Math.ceil(lineH * 2) + 5 : 15;
    doc.rect(40, y - 2, RIGHT - 40, barH).fill('#e2e8f0');
    doc.fillColor('#0f172a').fontSize(8.5).font('Helvetica-Bold');
    doc.text(title, 46, y + 1, { width: titleW, height: Math.ceil(lineH * 2) + 2, ellipsis: true });
    // Saldo/Vencido siempre en la 1ra linea de la barra.
    this.drawSaldoVencido(doc, y + 1, saldo, vencido, '#0f172a');
    doc.fillColor('#000');
    return y + barH + 3;
  }

  // Exporta la lista de CxP a Excel — plana (sin agrupar), tal como se ve en la
  // pantalla, respetando los mismos filtros del listado. Todas las filas del filtro
  // (sin paginacion). Los montos van como numeros (para poder sumar en Excel).
  async generateXlsx(query: QueryPayablesDto): Promise<Buffer> {
    const data = await this.payablesService.findAllForReport(query);

    const rows = (data as any[]).map((p) => ({
      'Proveedor': p.supplier?.name || '',
      'RIF': p.supplier?.rif || '',
      'Orden': p.number || p.purchaseOrder?.number || '',
      'Nro. documento': p.documentNumber || p.purchaseOrder?.supplierInvoiceNumber || '',
      'Monto USD': Math.round((p.amountUsd || 0) * 100) / 100,
      'Neto USD': Math.round((p.netPayableUsd || 0) * 100) / 100,
      'Pagado USD': Math.round((p.paidAmountUsd || 0) * 100) / 100,
      'Saldo USD': Math.round((p.balanceUsd || 0) * 100) / 100,
      'Vence': this.dueDate(p.dueDate),
      'Estado': STATUS_LABELS[p.status] || p.status,
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 34 }, { wch: 14 }, { wch: 16 }, { wch: 18 }, { wch: 13 },
      { wch: 13 }, { wch: 13 }, { wch: 13 }, { wch: 12 }, { wch: 12 },
    ];
    if (rows.length) ws['!autofilter'] = { ref: `A1:J${rows.length + 1}` };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'CxP');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  async generate(query: QueryPayablesDto): Promise<Buffer> {
    // Solo CxP "reales" = con saldo pendiente (>0). Las totalmente pagadas no se listan
    // (ya no son cuentas por pagar). Las parciales quedan (aun se debe el resto). Igual que CxC.
    const rows = (await this.payablesService.findAllForReport(query))
      .filter((p: any) => (p.balanceUsd || 0) > 0);
    const config = await this.prisma.companyConfig.findFirst();
    const company = config?.companyName || 'Trinity ERP';

    const doc = new PDFDocument({ size: 'LETTER', layout: 'portrait', margins: { top: 40, bottom: 40, left: 40, right: 40 }, bufferPages: true });

    // Encabezado
    doc.fontSize(15).font('Helvetica-Bold').fillColor('#000').text(company, 40, 40);
    doc.fontSize(12).font('Helvetica-Bold').text('Cuentas por Pagar', 40, 60);

    let modo = 'Todas';
    if (query.overdue) modo = 'Solo vencidas';
    else if (query.dueWithinDays !== undefined && query.dueWithinDays !== null && !Number.isNaN(query.dueWithinDays)) {
      modo = `Proximas a vencer (proximos ${query.dueWithinDays} dias)`;
    }
    const filtros: string[] = [modo];
    if (query.status) filtros.push(`Estado: ${STATUS_LABELS[query.status] || query.status}`);
    if (query.from || query.to) filtros.push(`Fechas: ${query.from || '...'} a ${query.to || '...'}`);
    filtros.push('Solo con saldo pendiente');
    doc.fontSize(9).font('Helvetica').fillColor('#334155');
    doc.text(filtros.join('     '), 40, 80, { width: RIGHT - 40 });
    doc.text(`Generado: ${new Date().toLocaleString('es-VE', { timeZone: 'America/Caracas' })}   |   ${rows.length} documentos`, 40, 94);
    doc.fillColor('#000');
    doc.moveTo(40, 110).lineTo(RIGHT, 110).stroke('#94a3b8');
    let y = 118;

    // Agrupar por proveedor. Los grupos se ordenan alfabeticamente por nombre; dentro de
    // cada proveedor, por vencimiento (ya viene ordenado por dueDate asc).
    const groups = new Map<string, { name: string; rif: string | null; rows: any[] }>();
    for (const p of rows as any[]) {
      const name = p.supplier?.name || 'Sin proveedor';
      const key = p.supplier?.id ? `s:${p.supplier.id}` : `n:${name}`;
      if (!groups.has(key)) groups.set(key, { name, rif: p.supplier?.rif || null, rows: [] });
      groups.get(key)!.rows.push(p);
    }
    const ordered = Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name, 'es'));

    // Vencido = dueDate ya pasada (igual criterio que el resumen/tarjetas de CxP).
    const todayKey = caracasDateKey();
    const isOverdue = (p: any) => p.dueDate && new Date(p.dueDate) < todayKey;

    let totalSaldo = 0;
    let totalVencido = 0;

    for (const g of ordered) {
      let gSaldo = 0, gVencido = 0;
      for (const p of g.rows) { gSaldo += p.balanceUsd || 0; if (isOverdue(p)) gVencido += p.balanceUsd || 0; }

      // Espacio para la barra del proveedor (hasta 2 lineas) + encabezado de columnas + 1 fila.
      if (y > doc.page.height - doc.page.margins.bottom - 75) {
        doc.addPage();
        y = 40;
      }
      y = this.drawSupplierBar(doc, y, g.name, g.rif, g.rows.length, gSaldo, gVencido);
      y = this.drawHeaderRow(doc, y);

      doc.fontSize(8).font('Helvetica');
      for (const p of g.rows) {
        if (y > doc.page.height - doc.page.margins.bottom - 24) {
          doc.addPage();
          y = 40;
          y = this.drawSupplierBar(doc, y, g.name, g.rif, g.rows.length, gSaldo, gVencido, true);
          y = this.drawHeaderRow(doc, y);
          doc.fontSize(8).font('Helvetica');
        }
        totalSaldo += p.balanceUsd || 0;
        if (isOverdue(p)) totalVencido += p.balanceUsd || 0;
        // Documento REAL que escribe el usuario (nro. de factura del proveedor), NO el
        // correlativo del sistema: documentNumber (CxP manual) o supplierInvoiceNumber (de compra).
        const documento = p.documentNumber || p.purchaseOrder?.supplierInvoiceNumber || '—';
        const values = [
          String(documento),
          this.dueDate(p.dueDate),
          `$${this.fmt(p.netPayableUsd)}`,
          `$${this.fmt(p.balanceUsd)}`,
          STATUS_LABELS[p.status] || p.status,
        ];
        doc.fillColor('#1e293b');
        for (let i = 0; i < COLS.length; i++) {
          const opts: any = { width: COLS[i].width, lineBreak: false, ellipsis: true };
          if (COLS[i].align === 'right') opts.align = 'right';
          doc.text(values[i] || '', COLS[i].x, y, opts);
        }
        doc.fillColor('#000');
        y += 13;
      }
      y += 5; // separacion entre proveedores
    }

    // Total global
    if (y > doc.page.height - doc.page.margins.bottom - 24) { doc.addPage(); y = 40; }
    doc.moveTo(40, y).lineTo(RIGHT, y).stroke('#cbd5e1');
    y += 4;
    doc.rect(40, y - 2, RIGHT - 40, 16).fill('#0f172a');
    doc.fillColor('#fff').fontSize(9).font('Helvetica-Bold');
    doc.text(`TOTAL  (${ordered.length} proveedores)`, 46, y + 1, { width: 200, lineBreak: false });
    doc.text(`Saldo: $${this.fmt(totalSaldo)}     Vencido: $${this.fmt(totalVencido)}`, 230, y + 1, { width: RIGHT - 230 - 6, align: 'right' });
    doc.fillColor('#000');

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
}
