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

// Tasa de cambio con 4 decimales, estilo Venezuela (1.234,5600)
function fmtRate4(n: number): string {
  const fixed = Math.abs(n).toFixed(4);
  const [intPart, decPart] = fixed.split('.');
  const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${n < 0 ? '-' : ''}${withThousands},${decPart}`;
}

type Currency = 'BS' | 'USD';

interface ReceiptLine {
  name: string;
  qty: number;
  unit: number;   // precio unitario con IVA, en la moneda elegida
  gross: number;  // total de linea (sin descuento) — ajustado para cuadrar
  discountPct: number;
  disc: number;   // monto de descuento de la linea
}

interface ReceiptCalc {
  cur: Currency;
  rate: number;
  lines: ReceiptLine[];
  igtf: number;
  total: number;
}

// Formato segun moneda: Bs estilo VE (1.234,56) / USD plano (1234.56)
function curFmt(cur: Currency, n: number): string {
  return cur === 'BS' ? fmtBs(n) : fmt(n);
}

/**
 * Calcula el recibo en la moneda elegida, anclado a lo que REALMENTE se cobro.
 * - Serie NO fiscal: contado -> 'BS', credito -> 'USD' (decidido por el llamador).
 * - El total es SIEMPRE el campo guardado (`invoice.totalBs`/`invoice.totalUsd` = lo cobrado,
 *   lo que cubren los pagos). Nunca se reconstruye sumando lineas redondeadas.
 * - El residual de redondeo (1-2 centimos) se carga a la ULTIMA linea, de modo que la suma
 *   NETA de lineas impresas == (total - IGTF). Asi, si el cliente suma lo que ve, da el total.
 */
function computeReceipt(invoice: any, cur: Currency): ReceiptCalc {
  const items: any[] = invoice.items || [];
  const rate = invoice.exchangeRate || 0;
  const toCur = (usd: number) => (cur === 'BS' ? usd * rate : usd);

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

  const igtf = round2(cur === 'BS' ? (invoice.igtfBs ?? igtfUsd * rate) : igtfUsd);
  const total = round2(cur === 'BS' ? (invoice.totalBs ?? totalUsd * rate) : totalUsd);
  const goodsTarget = round2(total - igtf);

  const lines: ReceiptLine[] = items.map((item) => {
    const r = IVA_RATES[item.ivaType || 'GENERAL'] || 0;
    const unitWithIva = toCur(item.unitPrice * (1 + r));
    const discountPct = item.discountPct || 0;
    const gross = round2(item.quantity * unitWithIva);
    return {
      name: item.productName || item.name || 'Producto',
      qty: item.quantity,
      unit: round2(unitWithIva),
      gross,
      discountPct,
      disc: round2(gross * discountPct / 100),
    };
  });

  // Snap: que la suma NETA de las lineas cuadre EXACTO con (total - IGTF).
  if (lines.length > 0) {
    const sumNet = round2(lines.reduce((s, l) => s + (l.gross - l.disc), 0));
    const residual = round2(goodsTarget - sumNet);
    if (residual !== 0) {
      const last = lines[lines.length - 1];
      last.gross = round2(last.gross + residual);
    }
  }

  return { cur, rate, lines, igtf, total };
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

  // Serie no fiscal: contado -> Bs, credito -> USD. Anclado a lo cobrado (ver computeReceipt)
  const cur: Currency = isCredit ? 'USD' : 'BS';
  const sym = cur === 'BS' ? 'Bs' : 'USD';
  const calc = computeReceipt(invoice, cur);

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
  // nowrap + fuente ajustada: la dirección larga (ej. la grande) cabe en 1 línea como en la
  // térmica; en direcciones cortas no se nota. Evita que el visor de print() la parta en 2.
  if (company.address) html += `<div class="center" style="font-size:9px;white-space:nowrap;">${company.address}</div>`;
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

  // Items (precio incluye IVA), en la moneda elegida
  for (const l of calc.lines) {
    html += `<div class="item-name">${l.name}</div>`;
    html += `<div class="item-detail">
      <span>${l.qty} x ${curFmt(cur, l.unit)}</span>
      <span>${curFmt(cur, l.gross)}</span>
    </div>`;
    if (l.discountPct > 0) {
      html += `<div class="item-detail" style="font-size:10px;">
        <span>Desc. ${fmtPct(l.discountPct)}%</span>
        <span>-${curFmt(cur, l.disc)}</span>
      </div>`;
    }
  }

  html += `<div class="separator"></div>`;

  // Total (IVA incluido). IGTF aparte solo si aplica.
  if (calc.igtf > 0) {
    html += `<div class="row" style="font-size:12px;"><span>IGTF:</span><span>${curFmt(cur, calc.igtf)}</span></div>`;
  }
  html += `<div class="row bold" style="font-size:15px;"><span>TOTAL ${sym}:</span><span>${curFmt(cur, calc.total)}</span></div>`;

  if (exchangeRate > 0) {
    html += `<div class="center" style="font-size:11px;">Tasa: ${fmtRate4(exchangeRate)} Bs/USD</div>`;
  }

  html += `<div class="separator"></div>`;

  // Payments (en la moneda elegida)
  if (payments.length > 0) {
    html += `<div class="bold">Forma de pago:</div>`;
    for (const p of payments) {
      const label = p.method?.name || 'Metodo';
      // Los metodos en divisa (Zelle, efectivo $, etc.) SIEMPRE en USD, aunque el
      // resto del ticket vaya en Bs. El resto de metodos siguen la moneda del ticket.
      const amount = p.method?.isDivisa
        ? `${fmt(p.amountUsd)} USD`
        : cur === 'BS' ? `${fmtBs(p.amountBs)} Bs` : `${fmt(p.amountUsd)} USD`;
      html += `<div class="row"><span>${label}:</span><span>${amount}</span></div>`;
      if (p.reference) html += `<div style="font-size:10px;padding-left:8px;">Ref: ${p.reference}</div>`;
    }
  }

  // Change (vuelto) en la moneda elegida
  if (invoice.changeBs > 0) {
    const changeMethodName = payments.find((p: any) => p.changeAmountBs > 0)?.changeMethod?.name || 'Efectivo Bs';
    const changeStr = cur === 'BS'
      ? `${fmtBs(invoice.changeBs)} Bs`
      : `${fmt(exchangeRate > 0 ? invoice.changeBs / exchangeRate : 0)} USD`;
    html += `<div class="separator"></div>`;
    html += `<div class="row bold"><span>Vuelto:</span><span>${changeStr}</span></div>`;
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

  // Serie no fiscal: contado -> Bs, credito -> USD. Anclado a lo cobrado (ver computeReceipt)
  const cur: Currency = isCredit ? 'USD' : 'BS';
  const sym = cur === 'BS' ? 'Bs' : 'USD';
  const calc = computeReceipt(invoice, cur);

  const w = 42;
  const lines: string[] = [];

  const pad = (label: string, value: string) => {
    const space = Math.max(1, w - label.length - value.length);
    return `${label}${' '.repeat(space)}${value}`;
  };

  // Centrado por espacios: la tickera ignora el comando de alineacion ESC a ({{CENTER}}),
  // pero SI respeta los espacios (igual que pad() con los totales). Asi el encabezado
  // queda centrado en cualquier impresora, sin depender de ESC a.
  const center = (text: string) =>
    text.length >= w ? text : ' '.repeat(Math.floor((w - text.length) / 2)) + text;

  // Header — nombre en negrita tamaño normal (sin {{BIG}}) para que centre limpio y no se parta
  lines.push(`{{BOLD}}${center(company.companyName || 'EMPRESA')}{{/BOLD}}`);
  if (company.rif) lines.push(center(`RIF: ${company.rif}`));
  if (company.address) lines.push(center(company.address));
  if (company.phone) lines.push(center(`Telf: ${company.phone}`));
  lines.push('{{LINE}}');

  // Invoice info
  lines.push(`{{BOLD}}${center(`FACTURA: ${invoice.number || 'S/N'}`)}{{/BOLD}}`);
  lines.push(center(fmtDate(invoice.paidAt || invoice.createdAt)));
  if (cashRegister) lines.push(center(`Caja: ${cashRegister.name || cashRegister.code}`));
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

  // Items (precio incluye IVA, sin encabezado ni desglose), en la moneda elegida
  for (const l of calc.lines) {
    lines.push(`{{BOLD}}${l.name}{{/BOLD}}`);
    lines.push(pad(`  ${l.qty} x ${curFmt(cur, l.unit)}`, curFmt(cur, l.gross)));
    if (l.discountPct > 0) {
      lines.push(pad(`  Desc. ${fmtPct(l.discountPct)}%`, `-${curFmt(cur, l.disc)}`));
    }
  }
  lines.push('{{LINE}}');

  // Total (IVA incluido). IGTF aparte solo si aplica.
  if (calc.igtf > 0) lines.push(pad('IGTF:', `${curFmt(cur, calc.igtf)} ${sym}`));
  lines.push(`{{BOLD}}${pad(`TOTAL ${sym}:`, curFmt(cur, calc.total))}{{/BOLD}}`);
  if (exchangeRate > 0) lines.push(center(`Tasa: ${fmtRate4(exchangeRate)} Bs/USD`));
  lines.push('{{LINE}}');

  // Forma de pago (en la moneda elegida)
  if (payments.length > 0) {
    lines.push('{{BOLD}}Forma de pago:{{/BOLD}}');
    for (const p of payments) {
      const label = p.method?.name || 'Metodo';
      // Los metodos en divisa (Zelle, efectivo $, etc.) SIEMPRE en USD, aunque el
      // resto del ticket vaya en Bs. El resto de metodos siguen la moneda del ticket.
      const amount = p.method?.isDivisa
        ? `${fmt(p.amountUsd)} USD`
        : cur === 'BS' ? `${fmtBs(p.amountBs)} Bs` : `${fmt(p.amountUsd)} USD`;
      lines.push(pad(`${label}:`, amount));
      if (p.reference) lines.push(`  Ref: ${p.reference}`);
    }
  }

  // Vuelto (en la moneda elegida)
  if (invoice.changeBs > 0) {
    const changeMethodName = payments.find((p: any) => p.changeAmountBs > 0)?.changeMethod?.name || 'Efectivo Bs';
    const changeStr = cur === 'BS'
      ? `${fmtBs(invoice.changeBs)} Bs`
      : `${fmt(exchangeRate > 0 ? invoice.changeBs / exchangeRate : 0)} USD`;
    lines.push('{{LINE}}');
    lines.push(`{{BOLD}}${pad('Vuelto:', changeStr)}{{/BOLD}}`);
    lines.push(`  Metodo: ${changeMethodName}`);
  }

  // Credito
  if (isCredit) {
    lines.push('{{LINE}}');
    lines.push(`{{BOLD}}${center('*** VENTA A CREDITO ***')}{{/BOLD}}`);
    if (invoice.creditDays) lines.push(center(`Plazo: ${invoice.creditDays} dias`));
    if (invoice.dueDate) lines.push(center(`Vence: ${fmtDate(invoice.dueDate)}`));
  }

  lines.push('{{LINE}}');
  lines.push(center('Gracias por su compra'));
  lines.push(center('*** No constituye factura fiscal ***'));
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
    lines.push(`{{CENTER}}Tasa: ${fmtRate4(exchangeRate)} Bs/USD{{/CENTER}}`);
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
