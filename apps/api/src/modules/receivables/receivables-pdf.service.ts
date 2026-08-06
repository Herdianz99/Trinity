import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ReceivablesService } from './receivables.service';
import { QueryReceivablesDto } from './dto/query-receivables.dto';
import { caracasDateKey } from '../../common/timezone';
import * as PDFDocument from 'pdfkit';
import * as XLSX from 'xlsx';

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendiente',
  PARTIAL: 'Parcial',
  PAID: 'Pagado',
  OVERDUE: 'Vencido',
};

const TYPE_LABELS: Record<string, string> = {
  CUSTOMER_CREDIT: 'Credito',
  FINANCING_PLATFORM: 'Plataforma',
  MANUAL: 'Manual',
};

// Carta vertical, area util 40..572. El CLIENTE va como encabezado de grupo (no columna),
// para ubicar las cuentas por cliente mas facil.
const COLS = [
  { label: 'Documento', x: 40, width: 150 },
  { label: 'Vence', x: 196, width: 70 },
  { label: 'Monto USD', x: 272, width: 88, align: 'right' as const },
  { label: 'Saldo USD', x: 366, width: 88, align: 'right' as const },
  { label: 'Estado', x: 460, width: 112 },
];
const RIGHT = 572;

@Injectable()
export class ReceivablesPdfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly receivablesService: ReceivablesService,
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

  // Barra de encabezado de un cliente: nombre + RIF + (N docs) y Saldo/Vencido.
  // saldo = total que debe (pendiente); vencido = parte del saldo ya vencida.
  // isGroup=true (empresa del grupo) se pinta en ROJO para identificarla facil.
  private drawClientBar(
    doc: any, y: number, name: string, rif: string | null,
    count: number, saldo: number, vencido: number, cont = false, isGroup = false,
  ): number {
    doc.rect(40, y - 2, RIGHT - 40, 15).fill(isGroup ? '#fee2e2' : '#e2e8f0');
    doc.fillColor(isGroup ? '#b91c1c' : '#0f172a').fontSize(8.5).font('Helvetica-Bold');
    const tag = isGroup ? '  [EMPRESA DEL GRUPO]' : '';
    const title = `${name}${rif ? '  ·  ' + rif : ''}  (${count})${tag}${cont ? '  — cont.' : ''}`;
    doc.text(title, 46, y + 1, { width: 300, lineBreak: false, ellipsis: true });
    this.drawSaldoVencido(doc, y + 1, saldo, vencido, isGroup ? '#b91c1c' : '#0f172a');
    doc.fillColor('#000');
    return y + 18;
  }

  // Barra de encabezado de un VENDEDOR (nivel superior del reporte por vendedor).
  private drawSellerBar(
    doc: any, y: number, label: string, count: number,
    saldo: number, vencido: number, cont = false,
  ): number {
    doc.rect(40, y - 2, RIGHT - 40, 16).fill('#334155');
    doc.fillColor('#fff').fontSize(9).font('Helvetica-Bold');
    const title = `VENDEDOR: ${label}  (${count})${cont ? '  — cont.' : ''}`;
    doc.text(title, 46, y + 1, { width: 300, lineBreak: false, ellipsis: true });
    this.drawSaldoVencido(doc, y + 1, saldo, vencido, '#ffffff');
    doc.fillColor('#000');
    return y + 20;
  }

  // Linea de subtotal (por cliente = suave; por vendedor = strong con fondo).
  private drawSubtotal(
    doc: any, y: number, label: string, saldo: number, vencido: number, strong: boolean,
  ): number {
    if (strong) {
      doc.rect(40, y - 1, RIGHT - 40, 14).fill('#cbd5e1');
    }
    const base = strong ? '#0f172a' : '#475569';
    doc.fillColor(base).fontSize(8).font('Helvetica-Bold');
    doc.text(label, 46, y + 1, { width: 240, lineBreak: false, ellipsis: true });
    this.drawSaldoVencido(doc, y + 1, saldo, vencido, base);
    doc.fillColor('#000');
    return y + (strong ? 18 : 14);
  }

  // Escribe "Saldo $X     Vencido $Y" alineado a la derecha, en el color base de la
  // barra. El "Vencido" se pinta en rojo si hay monto vencido, para que salte a la vista.
  private drawSaldoVencido(doc: any, y: number, saldo: number, vencido: number, baseColor: string) {
    doc.fillColor(baseColor);
    doc.text(`Saldo $${this.fmt(saldo)}`, RIGHT - 246, y, { width: 130, align: 'right', lineBreak: false });
    doc.fillColor(vencido > 0 ? '#dc2626' : baseColor);
    doc.text(`Vencido $${this.fmt(vencido)}`, RIGHT - 116, y, { width: 116, align: 'right', lineBreak: false });
  }

  async generate(query: QueryReceivablesDto): Promise<Buffer> {
    // Solo CxC "reales" = con saldo pendiente (>0). Las totalmente pagadas no se listan
    // (ya no son cuentas por cobrar). Las parciales quedan (aún deben el resto).
    const rows = (await this.receivablesService.findAllForReport(query))
      .filter((r: any) => (r.balanceUsd || 0) > 0);
    const config = await this.prisma.companyConfig.findFirst();
    const company = config?.companyName || 'Trinity ERP';

    const doc = new PDFDocument({ size: 'LETTER', layout: 'portrait', margins: { top: 40, bottom: 40, left: 40, right: 40 }, bufferPages: true });

    // Encabezado
    doc.fontSize(15).font('Helvetica-Bold').fillColor('#000').text(company, 40, 40);
    doc.fontSize(12).font('Helvetica-Bold').text('Cuentas por Cobrar', 40, 60);

    let modo = 'Todas';
    if (query.overdue) modo = 'Solo vencidas';
    else if (query.dueWithinDays !== undefined && query.dueWithinDays !== null && !Number.isNaN(query.dueWithinDays)) {
      modo = `Proximas a vencer (proximos ${query.dueWithinDays} dias)`;
    }
    const filtros: string[] = [modo];
    if (query.status) filtros.push(`Estado: ${STATUS_LABELS[query.status] || query.status}`);
    if (query.type) filtros.push(`Tipo: ${query.type}`);
    if (query.from || query.to) filtros.push(`Fechas: ${query.from || '...'} a ${query.to || '...'}`);
    filtros.push('Solo con saldo pendiente');
    doc.fontSize(9).font('Helvetica').fillColor('#334155');
    doc.text(filtros.join('     '), 40, 80, { width: RIGHT - 40 });
    doc.text(`Generado: ${new Date().toLocaleString('es-VE', { timeZone: 'America/Caracas' })}   |   ${rows.length} documentos`, 40, 94);
    doc.fillColor('#000');
    doc.moveTo(40, 110).lineTo(RIGHT, 110).stroke('#94a3b8');
    let y = 118;

    // Agrupar por cliente (o plataforma si no tiene cliente). Los grupos se ordenan
    // alfabeticamente por nombre; dentro de cada cliente, por vencimiento (ya viene ordenado).
    const groups = new Map<string, { name: string; rif: string | null; rows: any[] }>();
    for (const r of rows as any[]) {
      const name = r.customer?.name || r.platformName || 'Sin cliente';
      const key = r.customer?.id ? `c:${r.customer.id}` : `p:${name}`;
      if (!groups.has(key)) groups.set(key, { name, rif: r.customer?.rif || null, rows: [] });
      groups.get(key)!.rows.push(r);
    }
    const ordered = Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name, 'es'));

    // Vencido = dueDate ya pasada (igual criterio que el resumen/tarjetas de CxC).
    const todayKey = caracasDateKey();
    const isOverdue = (r: any) => r.dueDate && new Date(r.dueDate) < todayKey;

    let totalSaldo = 0;
    let totalVencido = 0;

    for (const g of ordered) {
      let gSaldo = 0, gVencido = 0;
      for (const r of g.rows) { gSaldo += r.balanceUsd || 0; if (isOverdue(r)) gVencido += r.balanceUsd || 0; }

      // Espacio para la barra del cliente + encabezado de columnas + al menos 1 fila.
      if (y > doc.page.height - doc.page.margins.bottom - 60) {
        doc.addPage();
        y = 40;
      }
      y = this.drawClientBar(doc, y, g.name, g.rif, g.rows.length, gSaldo, gVencido);
      y = this.drawHeaderRow(doc, y);

      doc.fontSize(8).font('Helvetica');
      for (const r of g.rows) {
        if (y > doc.page.height - doc.page.margins.bottom - 24) {
          doc.addPage();
          y = 40;
          y = this.drawClientBar(doc, y, g.name, g.rif, g.rows.length, gSaldo, gVencido, true);
          y = this.drawHeaderRow(doc, y);
          doc.fontSize(8).font('Helvetica');
        }
        totalSaldo += r.balanceUsd || 0;
        if (isOverdue(r)) totalVencido += r.balanceUsd || 0;
        const documento = r.number || r.invoice?.number || r.documentNumber || '—';
        const values = [
          String(documento),
          this.dueDate(r.dueDate),
          `$${this.fmt(r.amountUsd)}`,
          `$${this.fmt(r.balanceUsd)}`,
          STATUS_LABELS[r.status] || r.status,
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
      y += 5; // separacion entre clientes
    }

    // Total global
    if (y > doc.page.height - doc.page.margins.bottom - 24) { doc.addPage(); y = 40; }
    doc.moveTo(40, y).lineTo(RIGHT, y).stroke('#cbd5e1');
    y += 4;
    doc.rect(40, y - 2, RIGHT - 40, 16).fill('#0f172a');
    doc.fillColor('#fff').fontSize(9).font('Helvetica-Bold');
    doc.text(`TOTAL  (${ordered.length} clientes)`, 46, y + 1, { width: 180, lineBreak: false });
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

  // Exporta la lista de CxC a Excel — plana (sin agrupar), tal como se ve en la
  // pantalla, respetando los mismos filtros del listado. Todas las filas del filtro
  // (sin paginacion). Los montos van como numeros (para poder sumar en Excel).
  async generateXlsx(query: QueryReceivablesDto): Promise<Buffer> {
    const data = await this.receivablesService.findAllForReport(query);

    const rows = (data as any[]).map((r) => {
      const c = r.customer || r.invoice?.customer;
      return {
        'Tipo': r.platformName || TYPE_LABELS[r.type] || r.type,
        'Cliente': r.customer?.name || r.invoice?.customer?.name || r.platformName || '',
        'Cedula/RIF': c?.rif ? `${c.documentType || ''}-${c.rif}` : '',
        'Factura': r.number || r.invoice?.number || r.documentNumber || '',
        'Ref / Orden': r.reference || '',
        'Vendedor': r.invoice?.seller
          ? (r.invoice.seller.code ? `${r.invoice.seller.code} ${r.invoice.seller.name}` : r.invoice.seller.name)
          : '',
        'Monto USD': Math.round((r.amountUsd || 0) * 100) / 100,
        'Cobrado USD': Math.round((r.paidAmountUsd || 0) * 100) / 100,
        'Saldo USD': Math.round((r.balanceUsd || 0) * 100) / 100,
        'Vence': this.dueDate(r.dueDate),
        'Estado': STATUS_LABELS[r.status] || r.status,
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 12 }, { wch: 34 }, { wch: 16 }, { wch: 20 }, { wch: 16 }, { wch: 22 },
      { wch: 13 }, { wch: 13 }, { wch: 13 }, { wch: 12 }, { wch: 12 },
    ];
    if (rows.length) ws['!autofilter'] = { ref: `A1:K${rows.length + 1}` };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'CxC');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  // Reporte de CxC agrupado en DOS niveles: primero por VENDEDOR (de la factura),
  // luego por CLIENTE. Ordena vendedores y clientes por mayor saldo. Subtotal por
  // cliente, por vendedor, y total general. Respeta los mismos filtros del listado.
  async generateBySeller(query: QueryReceivablesDto): Promise<Buffer> {
    // Filtra a las CxC "reales" para este reporte:
    //  - excluye las de plataformas de financiamiento (Cashea/Crediagro): es
    //    financiamiento de la plataforma, no cobranza atribuible al vendedor;
    //  - excluye las ya pagadas (saldo 0). Las parciales se mantienen (aún deben el resto).
    // Quedan las de credito a cliente (CUSTOMER_CREDIT) y las manuales (MANUAL → "Sin vendedor").
    const rows = (await this.receivablesService.findAllForReport(query))
      .filter((r: any) => r.type !== 'FINANCING_PLATFORM' && (r.balanceUsd || 0) > 0);
    const config = await this.prisma.companyConfig.findFirst();
    const company = config?.companyName || 'Trinity ERP';

    const doc = new PDFDocument({ size: 'LETTER', layout: 'portrait', margins: { top: 40, bottom: 40, left: 40, right: 40 }, bufferPages: true });

    // Encabezado
    doc.fontSize(15).font('Helvetica-Bold').fillColor('#000').text(company, 40, 40);
    doc.fontSize(12).font('Helvetica-Bold').text('Cuentas por Cobrar por Vendedor', 40, 60);

    let modo = 'Todas';
    if (query.overdue) modo = 'Solo vencidas';
    else if (query.dueWithinDays !== undefined && query.dueWithinDays !== null && !Number.isNaN(query.dueWithinDays)) {
      modo = `Proximas a vencer (proximos ${query.dueWithinDays} dias)`;
    }
    const filtros: string[] = [modo];
    if (query.status) filtros.push(`Estado: ${STATUS_LABELS[query.status] || query.status}`);
    if (query.type) filtros.push(`Tipo: ${query.type}`);
    if (query.from || query.to) filtros.push(`Fechas: ${query.from || '...'} a ${query.to || '...'}`);
    filtros.push('Solo con saldo pendiente (sin pagadas ni plataformas Cashea/Crediagro)');
    doc.fontSize(9).font('Helvetica').fillColor('#334155');
    doc.text(filtros.join('     '), 40, 80, { width: RIGHT - 40 });
    doc.text(`Generado: ${new Date().toLocaleString('es-VE', { timeZone: 'America/Caracas' })}   |   ${rows.length} documentos`, 40, 94);
    doc.fillColor('#000');
    doc.moveTo(40, 110).lineTo(RIGHT, 110).stroke('#94a3b8');
    let y = 118;

    // Vencido = dueDate ya pasada (igual criterio que el resumen/tarjetas de CxC).
    const todayKey = caracasDateKey();
    const isOverdue = (r: any) => r.dueDate && new Date(r.dueDate) < todayKey;

    // Agrupar vendedor -> cliente
    type ClientG = { name: string; rif: string | null; isGroup: boolean; rows: any[]; saldo: number; vencido: number };
    type SellerG = { sellerId: string | null; label: string; clients: Map<string, ClientG>; saldo: number; vencido: number; count: number };
    const sellers = new Map<string, SellerG>();
    for (const r of rows as any[]) {
      const s = r.invoice?.seller || null;
      const sKey = s?.id || '__none__';
      if (!sellers.has(sKey)) {
        sellers.set(sKey, {
          sellerId: s?.id || null,
          label: s ? (s.code ? `${s.code}  ${s.name}` : s.name) : 'Sin vendedor',
          clients: new Map(), saldo: 0, vencido: 0, count: 0,
        });
      }
      const sg = sellers.get(sKey)!;
      const cName = r.customer?.name || r.platformName || 'Sin cliente';
      const cKey = r.customer?.id ? `c:${r.customer.id}` : `p:${cName}`;
      if (!sg.clients.has(cKey)) sg.clients.set(cKey, { name: cName, rif: r.customer?.rif || null, isGroup: !!r.customer?.isGroupCompany, rows: [], saldo: 0, vencido: 0 });
      const cg = sg.clients.get(cKey)!;
      const bal = r.balanceUsd || 0;
      const ven = isOverdue(r) ? bal : 0;
      cg.rows.push(r); cg.saldo += bal; cg.vencido += ven;
      sg.saldo += bal; sg.vencido += ven; sg.count += 1;
    }
    // Vendedores por mayor saldo (Sin vendedor al final); clientes por mayor saldo.
    const orderedSellers = Array.from(sellers.values()).sort((a, b) => {
      if (!a.sellerId && b.sellerId) return 1;
      if (a.sellerId && !b.sellerId) return -1;
      return b.saldo - a.saldo;
    });

    const bottomLimit = () => doc.page.height - doc.page.margins.bottom;
    let totalSaldo = 0, totalVencido = 0, totalClients = 0;

    for (const sg of orderedSellers) {
      if (y > bottomLimit() - 80) { doc.addPage(); y = 40; }
      y = this.drawSellerBar(doc, y, sg.label, sg.count, sg.saldo, sg.vencido, false);

      const orderedClients = Array.from(sg.clients.values()).sort((a, b) => b.saldo - a.saldo);
      totalClients += orderedClients.length;

      for (const cg of orderedClients) {
        if (y > bottomLimit() - 60) {
          doc.addPage(); y = 40;
          y = this.drawSellerBar(doc, y, sg.label, sg.count, sg.saldo, sg.vencido, true);
        }
        y = this.drawClientBar(doc, y, cg.name, cg.rif, cg.rows.length, cg.saldo, cg.vencido, false, cg.isGroup);
        y = this.drawHeaderRow(doc, y);

        doc.fontSize(8).font('Helvetica');
        for (const r of cg.rows) {
          if (y > bottomLimit() - 24) {
            doc.addPage(); y = 40;
            y = this.drawSellerBar(doc, y, sg.label, sg.count, sg.saldo, sg.vencido, true);
            y = this.drawClientBar(doc, y, cg.name, cg.rif, cg.rows.length, cg.saldo, cg.vencido, true, cg.isGroup);
            y = this.drawHeaderRow(doc, y);
            doc.fontSize(8).font('Helvetica');
          }
          totalSaldo += r.balanceUsd || 0;
          if (isOverdue(r)) totalVencido += r.balanceUsd || 0;
          const documento = r.number || r.invoice?.number || r.documentNumber || '—';
          const values = [
            String(documento),
            this.dueDate(r.dueDate),
            `$${this.fmt(r.amountUsd)}`,
            `$${this.fmt(r.balanceUsd)}`,
            STATUS_LABELS[r.status] || r.status,
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
        // Subtotal cliente (suave)
        if (y > bottomLimit() - 18) { doc.addPage(); y = 40; y = this.drawSellerBar(doc, y, sg.label, sg.count, sg.saldo, sg.vencido, true); }
        y = this.drawSubtotal(doc, y, `Subtotal ${cg.name}`, cg.saldo, cg.vencido, false);
        y += 2;
      }

      // Subtotal vendedor (strong)
      if (y > bottomLimit() - 20) { doc.addPage(); y = 40; }
      y = this.drawSubtotal(doc, y, `SUBTOTAL VENDEDOR — ${sg.label}`, sg.saldo, sg.vencido, true);
      y += 8;
    }

    // Total general
    if (y > bottomLimit() - 24) { doc.addPage(); y = 40; }
    doc.moveTo(40, y).lineTo(RIGHT, y).stroke('#cbd5e1');
    y += 4;
    doc.rect(40, y - 2, RIGHT - 40, 16).fill('#0f172a');
    doc.fillColor('#fff').fontSize(9).font('Helvetica-Bold');
    doc.text(`TOTAL GENERAL  (${orderedSellers.length} vendedores · ${totalClients} clientes)`, 46, y + 1, { width: 300, lineBreak: false });
    doc.text(`Saldo: $${this.fmt(totalSaldo)}     Vencido: $${this.fmt(totalVencido)}`, RIGHT - 246, y + 1, { width: 240, align: 'right' });
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
