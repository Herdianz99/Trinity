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

const IVA_LABELS: Record<string, string> = {
  EXEMPT: 'Exento',
  REDUCED: 'IVA 8%',
  GENERAL: 'IVA 16%',
  SPECIAL: 'IVA 31%',
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
  const items: any[] = invoice.items || [];
  const payments: any[] = invoice.payments || [];
  const customer = invoice.customer;
  const seller = invoice.seller;
  const cashier = invoice.cashier;
  const cashRegister = invoice.cashRegister;
  const exchangeRate = invoice.exchangeRate || 0;
  const isCredit = invoice.isCredit || false;

  // Calculate subtotal (sum of items without IVA)
  let subtotalUsd = 0;
  const ivaGroups: Record<string, number> = {};

  for (const item of items) {
    const lineTotal = item.quantity * item.unitPrice;
    subtotalUsd += lineTotal;
    const ivaType = item.ivaType || 'GENERAL';
    const rate = IVA_RATES[ivaType] || 0;
    const ivaAmount = lineTotal * rate;
    if (rate > 0) {
      ivaGroups[ivaType] = (ivaGroups[ivaType] || 0) + ivaAmount;
    }
  }

  const totalIva = Object.values(ivaGroups).reduce((s, v) => s + v, 0);
  const subtotalWithIva = subtotalUsd + totalIva;
  const igtfUsd = invoice.igtfUsd || 0;
  const totalUsd = invoice.totalUsd ?? subtotalWithIva + igtfUsd;
  const totalBs = invoice.totalBs ?? totalUsd * exchangeRate;

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

  // Items
  for (const item of items) {
    const lineTotal = item.quantity * item.unitPrice;
    html += `<div class="item-name">${item.productName || item.name || 'Producto'}</div>`;
    html += `<div class="item-detail">
      <span>${item.quantity} x ${fmt(item.unitPrice)}</span>
      <span>${fmt(lineTotal)}</span>
    </div>`;
  }

  html += `<div class="separator"></div>`;

  // Totals
  html += `<div class="row"><span>Subtotal:</span><span>${fmt(subtotalUsd)}</span></div>`;

  for (const [type, amount] of Object.entries(ivaGroups)) {
    html += `<div class="row"><span>${IVA_LABELS[type] || type}:</span><span>${fmt(amount)}</span></div>`;
  }

  if (igtfUsd > 0) {
    html += `<div class="row"><span>IGTF (${company.igtfPct ?? 3}%):</span><span>${fmt(igtfUsd)}</span></div>`;
  }

  html += `<div class="separator"></div>`;
  html += `<div class="row bold" style="font-size:14px;"><span>TOTAL USD:</span><span>${fmt(totalUsd)}</span></div>`;
  html += `<div class="row bold" style="font-size:14px;"><span>TOTAL Bs:</span><span>${fmt(totalBs)}</span></div>`;

  if (exchangeRate > 0) {
    html += `<div class="center" style="font-size:11px;">Tasa: ${fmt(exchangeRate)} Bs/USD</div>`;
  }

  html += `<div class="separator"></div>`;

  // Payments
  if (payments.length > 0) {
    html += `<div class="bold">Forma de pago:</div>`;
    for (const p of payments) {
      const label = p.method?.name || 'Metodo';
      const isBs = !(p.method?.isDivisa ?? true);
      const amount = isBs ? `${fmt(p.amountBs)} Bs` : `${fmt(p.amountUsd)} USD`;
      html += `<div class="row"><span>${label}:</span><span>${amount}</span></div>`;
      if (p.reference) html += `<div style="font-size:10px;padding-left:8px;">Ref: ${p.reference}</div>`;
    }
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

export async function printReceipt(invoice: any, company: CompanyInfo): Promise<void> {
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
