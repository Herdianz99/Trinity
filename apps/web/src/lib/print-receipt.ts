/**
 * Prints a thermal receipt (80mm) for a paid invoice using an isolated iframe
 * to avoid CSS conflicts with print-monitor.tsx.
 */

const IVA_RATES: Record<string, number> = {
  EXEMPT: 0,
  REDUCED: 0.08,
  GENERAL: 0.16,
  SPECIAL: 0.31,
};

// Payment method labels now come from payment.method.name (relation)

interface CompanyInfo {
  companyName?: string;
  rif?: string;
  address?: string;
  phone?: string;
  isIGTFContributor?: boolean;
  igtfPct?: number;
}

function fmt(n: number): string {
  return n.toFixed(2);
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// Formato Bs estilo Venezuela: separador de miles "." y decimal "," -> 1.234,56
function fmtBs(n: number): string {
  const fixed = Math.abs(round2(n)).toFixed(2);
  const [intPart, decPart] = fixed.split('.');
  const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${n < 0 ? '-' : ''}${withThousands},${decPart}`;
}

function fmtPct(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

interface BsLine {
  name: string;
  qty: number;
  unitBs: number;   // precio unitario con IVA, en Bs
  grossBs: number;  // total de linea (sin descuento), en Bs — ajustado para cuadrar
  discountPct: number;
  discBs: number;   // monto de descuento de la linea, en Bs
}

/**
 * Calcula el recibo en Bs anclado a lo que REALMENTE se cobro.
 * - El total es SIEMPRE `invoice.totalBs` (campo guardado = lo cobrado, lo que cubren los pagos).
 *   Nunca se reconstruye sumando lineas redondeadas.
 * - Las lineas se calculan en Bs y el residual de redondeo (1-2 centimos) se carga a la
 *   ULTIMA linea, de modo que la suma impresa de lineas netas == (totalBs - IGTF). Asi, si el
 *   cliente suma lo que ve en el ticket, le da exactamente el total.
 */
function computeReceiptBs(invoice: any): { rate: number; lines: BsLine[]; igtfBs: number; totalBs: number } {
  const items: any[] = invoice.items || [];
  const rate = invoice.exchangeRate || 0;

  // Fallback de totales solo si el registro no trae totalBs/totalUsd guardados
  let subtotalUsd = 0;
  const ivaGroups: Record<string, number> = {};
  for (const item of items) {
    const lineTotal = item.quantity * item.unitPrice;
    const discountPct = item.discountPct || 0;
    const discountedLine = lineTotal * (1 - discountPct / 100);
    subtotalUsd += discountedLine;
    const r = IVA_RATES[item.ivaType || 'GENERAL'] || 0;
    if (r > 0) {
      const t = item.ivaType || 'GENERAL';
      ivaGroups[t] = (ivaGroups[t] || 0) + discountedLine * r;
    }
  }
  const totalIva = Object.values(ivaGroups).reduce((s, v) => s + v, 0);
  const igtfUsd = invoice.igtfUsd || 0;
  const totalUsd = invoice.totalUsd ?? subtotalUsd + totalIva + igtfUsd;
  const igtfBs = round2(invoice.igtfBs ?? igtfUsd * rate);
  const totalBs = round2(invoice.totalBs ?? totalUsd * rate);
  const goodsTargetBs = round2(totalBs - igtfBs);

  const lines: BsLine[] = items.map((item) => {
    const r = IVA_RATES[item.ivaType || 'GENERAL'] || 0;
    const unitPriceWithIvaUsd = item.unitPrice * (1 + r);
    const discountPct = item.discountPct || 0;
    const grossBs = round2(item.quantity * unitPriceWithIvaUsd * rate);
    return {
      name: item.productName || item.name || 'Producto',
      qty: item.quantity,
      unitBs: round2(unitPriceWithIvaUsd * rate),
      grossBs,
      discountPct,
      discBs: round2(grossBs * discountPct / 100),
    };
  });

  // Snap: que la suma NETA de las lineas cuadre EXACTO con (totalBs - IGTF).
  // El residual (centimos de redondeo) se carga a la ultima linea.
  if (lines.length > 0) {
    const sumNet = round2(lines.reduce((s, l) => s + (l.grossBs - l.discBs), 0));
    const residual = round2(goodsTargetBs - sumNet);
    if (residual !== 0) {
      const last = lines[lines.length - 1];
      last.grossBs = round2(last.grossBs + residual);
    }
  }

  return { rate, lines, igtfBs, totalBs };
}

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

function buildReceiptHTML(invoice: any, company: CompanyInfo): string {
  const payments: any[] = invoice.payments || [];
  const customer = invoice.customer;
  const seller = invoice.seller;
  const cashier = invoice.cashier;
  const cashRegister = invoice.cashRegister;
  const exchangeRate = invoice.exchangeRate || 0;
  const isCredit = invoice.isCredit || false;

  // Montos en Bs anclados a lo cobrado (ver computeReceiptBs)
  const bs = computeReceiptBs(invoice);

  // --- Build HTML ---
  let html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @page { margin: 0; size: 80mm auto; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Courier New', Courier, monospace;
    font-size: 12px;
    width: 80mm;
    padding: 4mm;
    color: #000;
  }
  .center { text-align: center; }
  .bold { font-weight: bold; }
  .separator { border-top: 1px dashed #000; margin: 4px 0; }
  .row { display: flex; justify-content: space-between; }
  .item-name { font-weight: bold; }
  .item-detail { display: flex; justify-content: space-between; padding-left: 8px; font-size: 11px; }
  .credit-badge {
    border: 2px solid #000;
    padding: 4px;
    text-align: center;
    font-weight: bold;
    font-size: 14px;
    margin: 6px 0;
  }
  table { width: 100%; border-collapse: collapse; }
  td { vertical-align: top; }
  .right { text-align: right; }
</style>
</head>
<body>`;

  // Header
  html += `<div class="center bold" style="font-size:14px;">${company.companyName || 'EMPRESA'}</div>`;
  if (company.rif) html += `<div class="center">RIF: ${company.rif}</div>`;
  if (company.address) html += `<div class="center" style="font-size:11px;">${company.address}</div>`;
  if (company.phone) html += `<div class="center" style="font-size:11px;">Telf: ${company.phone}</div>`;

  html += `<div class="separator"></div>`;

  // Invoice info
  html += `<div class="bold center" style="font-size:13px;">FACTURA: ${invoice.number || 'S/N'}</div>`;
  html += `<div class="center" style="font-size:11px;">${fmtDate(invoice.paidAt || invoice.createdAt)}</div>`;
  if (cashRegister) html += `<div class="center" style="font-size:11px;">Caja: ${cashRegister.name || cashRegister.code}</div>`;

  html += `<div class="separator"></div>`;

  // Seller / Cashier
  if (seller) html += `<div>Vendedor: ${seller.name}</div>`;
  if (cashier) html += `<div>Cajero: ${cashier.name}</div>`;

  // Customer
  if (customer) {
    html += `<div>Cliente: ${customer.name}</div>`;
    if (customer.rif) html += `<div>RIF: ${customer.documentType ? customer.documentType + '-' : ''}${customer.rif}</div>`;
  } else {
    html += `<div>Cliente: Consumidor Final</div>`;
  }

  html += `<div class="separator"></div>`;

  // Items (montos en Bs, precio incluye IVA)
  for (const l of bs.lines) {
    html += `<div class="item-name">${l.name}</div>`;
    html += `<div class="item-detail">
      <span>${l.qty} x ${fmtBs(l.unitBs)}</span>
      <span>${fmtBs(l.grossBs)}</span>
    </div>`;
    if (l.discountPct > 0) {
      html += `<div class="item-detail" style="font-size:10px;">
        <span>Desc. ${fmtPct(l.discountPct)}%</span>
        <span>-${fmtBs(l.discBs)}</span>
      </div>`;
    }
  }

  html += `<div class="separator"></div>`;

  // Total en Bs (IVA incluido). IGTF aparte solo si aplica.
  if (bs.igtfBs > 0) {
    html += `<div class="row" style="font-size:12px;"><span>IGTF:</span><span>${fmtBs(bs.igtfBs)}</span></div>`;
  }
  html += `<div class="row bold" style="font-size:15px;"><span>TOTAL Bs:</span><span>${fmtBs(bs.totalBs)}</span></div>`;

  if (exchangeRate > 0) {
    html += `<div class="center" style="font-size:11px;">Tasa: ${fmtBs(exchangeRate)} Bs/USD</div>`;
  }

  html += `<div class="separator"></div>`;

  // Payments (en Bs)
  if (payments.length > 0) {
    html += `<div class="bold">Forma de pago:</div>`;
    for (const p of payments) {
      const label = p.method?.name || 'Metodo';
      html += `<div class="row"><span>${label}:</span><span>${fmtBs(p.amountBs)} Bs</span></div>`;
      if (p.reference) html += `<div style="font-size:10px;padding-left:8px;">Ref: ${p.reference}</div>`;
    }
  }

  // Change (vuelto) en Bs
  if (invoice.changeBs > 0) {
    const changeMethodName = payments.find((p: any) => p.changeAmountBs > 0)?.changeMethod?.name || 'Efectivo Bs';
    html += `<div class="separator"></div>`;
    html += `<div class="row bold"><span>Vuelto:</span><span>${fmtBs(invoice.changeBs)} Bs</span></div>`;
    html += `<div style="font-size:11px;padding-left:4px;">Metodo: ${changeMethodName}</div>`;
  }

  // Credit badge
  if (isCredit) {
    html += `<div class="credit-badge">*** VENTA A CREDITO ***</div>`;
    if (invoice.creditDays) html += `<div class="center">Plazo: ${invoice.creditDays} dias</div>`;
    if (invoice.dueDate) html += `<div class="center">Vence: ${fmtDate(invoice.dueDate)}</div>`;
  }

  html += `<div class="separator"></div>`;
  html += `<div class="center" style="margin-top:6px;">Gracias por su compra</div>`;
  html += `<div class="center" style="font-size:10px;margin-top:2px;">*** No constituye factura fiscal ***</div>`;

  html += `</body></html>`;
  return html;
}

function buildReceiptText(invoice: any, company: CompanyInfo): string {
  const payments: any[] = invoice.payments || [];
  const customer = invoice.customer;
  const seller = invoice.seller;
  const cashier = invoice.cashier;
  const cashRegister = invoice.cashRegister;
  const exchangeRate = invoice.exchangeRate || 0;
  const isCredit = invoice.isCredit || false;

  // Montos en Bs anclados a lo cobrado (ver computeReceiptBs)
  const bs = computeReceiptBs(invoice);

  const w = 42;
  const lines: string[] = [];

  const pad = (label: string, value: string) => {
    const space = Math.max(1, w - label.length - value.length);
    return `${label}${' '.repeat(space)}${value}`;
  };

  // Header
  lines.push(`{{CENTER}}{{BIG}}${company.companyName || 'EMPRESA'}{{/BIG}}{{/CENTER}}`);
  if (company.rif) lines.push(`{{CENTER}}RIF: ${company.rif}{{/CENTER}}`);
  if (company.address) lines.push(`{{CENTER}}${company.address}{{/CENTER}}`);
  if (company.phone) lines.push(`{{CENTER}}Telf: ${company.phone}{{/CENTER}}`);
  lines.push('{{LINE}}');

  // Invoice info
  lines.push(`{{CENTER}}{{BOLD}}FACTURA: ${invoice.number || 'S/N'}{{/BOLD}}{{/CENTER}}`);
  lines.push(`{{CENTER}}${fmtDate(invoice.paidAt || invoice.createdAt)}{{/CENTER}}`);
  if (cashRegister) lines.push(`{{CENTER}}Caja: ${cashRegister.name || cashRegister.code}{{/CENTER}}`);
  lines.push('{{LINE}}');

  // Seller / Cashier / Customer
  if (seller) lines.push(`Vendedor: ${seller.name}`);
  if (cashier) lines.push(`Cajero: ${cashier.name}`);
  if (customer) {
    lines.push(`Cliente: ${customer.name}`);
    if (customer.rif) lines.push(`RIF: ${customer.documentType ? customer.documentType + '-' : ''}${customer.rif}`);
  } else {
    lines.push('Cliente: Consumidor Final');
  }
  lines.push('{{LINE}}');

  // Items en Bs (precio incluye IVA, sin encabezado de columnas ni desglose)
  for (const l of bs.lines) {
    lines.push(`{{BOLD}}${l.name}{{/BOLD}}`);
    lines.push(pad(`  ${l.qty} x ${fmtBs(l.unitBs)}`, fmtBs(l.grossBs)));
    if (l.discountPct > 0) {
      lines.push(pad(`  Desc. ${fmtPct(l.discountPct)}%`, `-${fmtBs(l.discBs)}`));
    }
  }
  lines.push('{{LINE}}');

  // Total en Bs (IVA incluido). IGTF aparte solo si aplica.
  if (bs.igtfBs > 0) lines.push(pad('IGTF:', `${fmtBs(bs.igtfBs)} Bs`));
  lines.push(`{{BOLD}}${pad('TOTAL Bs:', fmtBs(bs.totalBs))}{{/BOLD}}`);
  if (exchangeRate > 0) lines.push(`{{CENTER}}Tasa: ${fmtBs(exchangeRate)} Bs/USD{{/CENTER}}`);
  lines.push('{{LINE}}');

  // Forma de pago (en Bs)
  if (payments.length > 0) {
    lines.push('{{BOLD}}Forma de pago:{{/BOLD}}');
    for (const p of payments) {
      const label = p.method?.name || 'Metodo';
      lines.push(pad(`${label}:`, `${fmtBs(p.amountBs)} Bs`));
      if (p.reference) lines.push(`  Ref: ${p.reference}`);
    }
  }

  // Vuelto en Bs
  if (invoice.changeBs > 0) {
    const changeMethodName = payments.find((p: any) => p.changeAmountBs > 0)?.changeMethod?.name || 'Efectivo Bs';
    lines.push('{{LINE}}');
    lines.push(`{{BOLD}}${pad('Vuelto:', `${fmtBs(invoice.changeBs)} Bs`)}{{/BOLD}}`);
    lines.push(`  Metodo: ${changeMethodName}`);
  }

  // Credito
  if (isCredit) {
    lines.push('{{LINE}}');
    lines.push('{{CENTER}}{{BOLD}}*** VENTA A CREDITO ***{{/BOLD}}{{/CENTER}}');
    if (invoice.creditDays) lines.push(`{{CENTER}}Plazo: ${invoice.creditDays} dias{{/CENTER}}`);
    if (invoice.dueDate) lines.push(`{{CENTER}}Vence: ${fmtDate(invoice.dueDate)}{{/CENTER}}`);
  }

  lines.push('{{LINE}}');
  lines.push('{{CENTER}}Gracias por su compra{{/CENTER}}');
  lines.push('{{CENTER}}*** No constituye factura fiscal ***{{/CENTER}}');
  lines.push('{{FEED:3}}');
  lines.push('{{CUT}}');

  return lines.join('\n');
}

export function buildReturnReceiptText(note: any, invoice: any, company: CompanyInfo): string {
  const items: any[] = note.items || [];
  const exchangeRate = note.exchangeRate || 0;
  const w = 42;

  const pad = (label: string, value: string) => {
    const space = Math.max(1, w - label.length - value.length);
    return `${label}${' '.repeat(space)}${value}`;
  };

  const lines: string[] = [];

  // Header
  lines.push(`{{CENTER}}{{BIG}}${company.companyName || 'EMPRESA'}{{/BIG}}{{/CENTER}}`);
  if (company.rif) lines.push(`{{CENTER}}RIF: ${company.rif}{{/CENTER}}`);
  if (company.address) lines.push(`{{CENTER}}${company.address}{{/CENTER}}`);
  if (company.phone) lines.push(`{{CENTER}}Telf: ${company.phone}{{/CENTER}}`);
  lines.push('{{LINE}}');

  // Note info
  lines.push('{{CENTER}}{{BOLD}}NOTA DE DEVOLUCION{{/BOLD}}{{/CENTER}}');
  lines.push(`{{CENTER}}${note.number || 'S/N'}{{/CENTER}}`);
  lines.push(`Fecha: ${fmtDate(note.createdAt)}`);
  if (invoice) {
    lines.push(`Factura origen: ${invoice.number || 'S/N'}`);
  }
  lines.push('{{LINE}}');

  // Customer
  const customer = invoice?.customer || note.invoice?.customer;
  if (customer) {
    lines.push(`Cliente: ${customer.name}`);
    if (customer.rif) lines.push(`RIF: ${customer.documentType ? customer.documentType + '-' : ''}${customer.rif}`);
  }
  lines.push('{{LINE}}');

  // Items header
  lines.push(`{{BOLD}}${pad('ARTICULO', 'TOTAL')}{{/BOLD}}`);

  // Items
  for (const item of items) {
    const name = item.productName || item.name || 'Producto';
    const total = item.totalUsd || (item.unitPriceUsd * item.quantity);
    lines.push(`{{BOLD}}${name}{{/BOLD}}`);
    lines.push(`  ${item.quantity} x $${fmt(item.unitPriceUsd)}${' '.repeat(Math.max(1, w - 4 - String(item.quantity).length - fmt(item.unitPriceUsd).length - fmt(total).length - 4))}$${fmt(total)}`);
  }
  lines.push('{{LINE}}');

  // Totals
  lines.push(`{{BOLD}}${pad('Total devuelto:', `$${fmt(note.totalUsd)}`)}{{/BOLD}}`);
  if (exchangeRate > 0) {
    const totalBs = note.totalBs || (note.totalUsd * exchangeRate);
    lines.push(pad('Total Bs:', `Bs ${fmt(totalBs)}`));
    lines.push(`{{CENTER}}Tasa: ${fmt(exchangeRate)} Bs/USD{{/CENTER}}`);
  }
  lines.push('{{LINE}}');

  lines.push('{{CENTER}}Documento no fiscal{{/CENTER}}');
  lines.push('{{CENTER}}Devolucion procesada{{/CENTER}}');
  lines.push('{{FEED:3}}');
  lines.push('{{CUT}}');

  return lines.join('\n');
}

export async function printReturnReceipt(note: any, invoice: any, company: CompanyInfo): Promise<void> {
  // Try Trinity Agent first
  try {
    const { isAgentRunning, printTicket } = await import('@/lib/trinity-agent');
    const agentUp = await isAgentRunning();
    if (agentUp) {
      const text = buildReturnReceiptText(note, invoice, company);
      const printed = await printTicket(text);
      if (printed) return;
    }
  } catch {}

  // Fallback: browser print not supported for return receipts (use PDF)
}

export async function printReceipt(invoice: any, company: CompanyInfo): Promise<void> {
  // Try Trinity Agent first
  try {
    const { isAgentRunning, printTicket } = await import('@/lib/trinity-agent');
    const agentUp = await isAgentRunning();
    if (agentUp) {
      const text = buildReceiptText(invoice, company);
      const printed = await printTicket(text);
      if (printed) return;
    }
  } catch {}

  // Fallback: iframe + window.print()
  const receiptHTML = buildReceiptHTML(invoice, company);

  return new Promise<void>((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.top = '-10000px';
    iframe.style.left = '-10000px';
    iframe.style.width = '80mm';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) {
      document.body.removeChild(iframe);
      resolve();
      return;
    }

    doc.open();
    doc.write(receiptHTML);
    doc.close();

    // Wait for content to render, then print
    setTimeout(() => {
      try {
        iframe.contentWindow?.print();
      } catch {
        // Silently fail if print is blocked
      }
      // Clean up after a delay to allow print dialog
      setTimeout(() => {
        try { document.body.removeChild(iframe); } catch {}
        resolve();
      }, 2000);
    }, 300);
  });
}
