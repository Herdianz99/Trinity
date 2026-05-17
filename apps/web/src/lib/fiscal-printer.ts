/**
 * Generates fiscal printer commands for "The Factory" protocol.
 * Used when a cash register is marked as isFiscal.
 */

/** IVA sign characters per The Factory protocol */
const IVA_SIGNS: Record<string, string> = {
  GENERAL: '!',   // 16%
  REDUCED: '"',   // 8%
  SPECIAL: '#',   // 31%
  EXEMPT: ' ',    // 0%
};

interface FiscalCompanyConfig {
  isIGTFContributor?: boolean;
  igtfPct?: number;
  fiscalCreditCode?: string;
}

/**
 * Formats a number into a fixed-width string with the given total digits
 * (intDigits + decDigits), zero-padded on the left, no decimal separator.
 * Example: formatFixed(12.5, 8, 2) => "0000001250"
 */
function formatFixed(value: number, intDigits: number, decDigits: number): string {
  const multiplied = Math.round(value * Math.pow(10, decDigits));
  const totalDigits = intDigits + decDigits;
  return String(multiplied).padStart(totalDigits, '0');
}

function fmtDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/**
 * Builds the full array of fiscal commands for an invoice.
 */
export function buildFiscalCommands(
  invoice: any,
  companyConfig: FiscalCompanyConfig,
): string[] {
  const commands: string[] = [];
  const customer = invoice.customer;
  const items: any[] = invoice.items || [];
  const payments: any[] = invoice.payments || [];
  const exchangeRate = invoice.exchangeRate || 0;
  const isCredit = invoice.isCredit || false;
  // --- Customer header ---
  // iR* = RIF (cannot be empty — printer hangs)
  if (customer && customer.rif) {
    const docType = customer.documentType || '';
    const rif = docType ? `${docType}${customer.rif}` : customer.rif;
    commands.push(`iR*${rif}`);
  } else {
    commands.push('iR*V12345678');
  }

  commands.push(`iS*${customer ? customer.name : 'CONSUMIDOR FINAL'}`);

  // i01..i04 — comment lines for client and document info
  commands.push('i01DIRECCION CLIENTE');
  commands.push(`i02${customer?.address || ''}`);
  commands.push(`i03Telefono:${customer?.phone || ''}`);

  // i04: document number + payment type
  const invoiceNumber = invoice.number || 'S/N';
  const seller = invoice.seller;
  const cashier = invoice.cashier;
  if (isCredit) {
    const creditDays = invoice.creditDays || 30;
    const dueDate = invoice.dueDate ? fmtDate(new Date(invoice.dueDate)) : '';
    commands.push(`i04Doc. Nro: ${invoiceNumber} CREDITO`);
    commands.push(`i05${creditDays} dias - Vence: ${dueDate}`);
  } else {
    commands.push(`i04Doc. Nro: ${invoiceNumber} CONTADO`);
  }
  if (seller) {
    commands.push(`i06Vendedor: ${seller.name}`);
  }
  if (cashier) {
    commands.push(`i07Cajero: ${cashier.name}`);
  }

  // --- Items ---
  // Backend already stores unitPrice and unitPriceBs WITHOUT IVA.
  // Use unitPriceBs directly — no need to strip IVA again.
  for (const item of items) {
    const ivaType = item.ivaType || 'GENERAL';
    const ivaSign = IVA_SIGNS[ivaType] || '!';

    // unitPriceBs is already base price in Bs (without IVA), calculated at invoice creation
    const unitPriceBs = item.unitPriceBs || (item.unitPrice * exchangeRate);

    // Price: 8 integer + 2 decimal digits = 10 chars
    const priceStr = formatFixed(unitPriceBs, 8, 2);
    // Quantity: 5 integer + 3 decimal digits = 8 chars
    const qtyStr = formatFixed(item.quantity, 5, 3);

    const code = item.productCode || item.code || '';
    const name = item.productName || item.name || 'Producto';

    commands.push(`${ivaSign}${priceStr}${qtyStr}|${code}|${name}`);

    // Line discount: p-XXXX (2 int + 2 dec, e.g. 10.50% = p-1050)
    const discountPct = item.discountPct || 0;
    if (discountPct > 0) {
      commands.push(`p-${formatFixed(discountPct, 2, 2)}`);
    }
  }

  // --- Subtotal ---
  commands.push('3');

  // --- Payment methods ---
  if (isCredit) {
    // Credit: send only 1 + fiscalCreditCode
    const creditCode = (companyConfig.fiscalCreditCode || '01').padStart(2, '0');
    commands.push(`1${creditCode}`);
  } else {
    // Process each payment — fiscal code comes from payment.method.fiscalCode (relation)
    for (let i = 0; i < payments.length; i++) {
      const payment = payments[i];
      const isLast = i === payments.length - 1;

      // Fiscal code from the PaymentMethod relation included in payment
      const fiscalCode = (payment.method?.fiscalCode || '01').padStart(2, '0');

      // All amounts in Bs
      const amountBs = payment.amountBs || (payment.amountUsd * exchangeRate);

      if (isLast) {
        // Last payment: send as type 1 (last), no amount — machine calculates remainder
        commands.push(`1${fiscalCode}`);
      } else {
        // Not last: send as type 2 (more payments follow) with amount
        // Amount: 10 integer + 2 decimal digits = 12 chars
        const amountStr = formatFixed(amountBs, 10, 2);
        commands.push(`2${fiscalCode}${amountStr}`);
      }
    }

    // If no payments at all (shouldn't happen for non-credit), send default
    if (payments.length === 0) {
      commands.push('101');
    }
  }

  // --- IGTF ---
  if (companyConfig.isIGTFContributor) {
    commands.push('199');
  }

  return commands;
}

/**
 * IVA devolution prefixes per The Factory protocol.
 * Credit notes use d0-d3 instead of IVA sign characters.
 */
const IVA_DEVOLUTION: Record<string, string> = {
  EXEMPT: 'd0',
  GENERAL: 'd1',
  REDUCED: 'd2',
  SPECIAL: 'd3',
};

/**
 * Builds fiscal commands for a credit note (Nota de Crédito de Venta).
 * Protocol: The Factory HKA — same as invoice but with mandatory
 * affected-document header and d0-d3 item prefixes.
 */
export function buildFiscalCreditNoteCommands(
  note: any,
  invoice: any,
  customer: any,
  companyConfig: FiscalCompanyConfig,
): string[] {
  const commands: string[] = [];
  const items: any[] = note.items || [];
  const payments: any[] = note.payments || [];
  const exchangeRate = note.exchangeRate || 0;

  // ── 1. Affected document header (mandatory for credit notes) ──
  // iF* — Fiscal number returned by the printer for the original invoice
  commands.push(`iF*${invoice.fiscalNumber || ''}`);

  // iD* — Original invoice date DD/MM/YYYY
  if (invoice.createdAt) {
    const d = new Date(invoice.createdAt);
    commands.push(`iD*${fmtDate(d)}`);
  }

  // iI* — Serial/registration number of the fiscal machine that printed the invoice
  commands.push(`iI*${invoice.fiscalMachineSerial || ''}`);

  // iR* — Customer RIF: {documentType}-{rif}
  if (customer && customer.rif) {
    const docType = customer.documentType || '';
    const rif = docType ? `${docType}-${customer.rif}` : customer.rif;
    commands.push(`iR*${rif}`);
  } else {
    commands.push('iR*V-12345678');
  }

  // iS* — Customer name
  commands.push(`iS*${customer ? customer.name : 'CONSUMIDOR FINAL'}`);

  // ── 2. Devolution items ──
  // Format: d{0-3}{price 8int+2dec}{qty 5int+3dec}|{code}|{name}
  for (const item of items) {
    const ivaType = item.ivaType || 'GENERAL';
    const prefix = IVA_DEVOLUTION[ivaType] || 'd1';

    // unitPriceBs is base price in Bs (without IVA)
    const unitPriceBs = item.unitPriceBs || (item.unitPriceUsd * exchangeRate);

    const priceStr = formatFixed(unitPriceBs, 8, 2);
    const qtyStr = formatFixed(item.quantity, 5, 3);
    const code = item.productCode || '';
    const name = item.productName || 'Producto';

    commands.push(`${prefix}${priceStr}${qtyStr}|${code}|${name}`);
  }

  // ── 3. Subtotal ──
  commands.push('3');

  // ── 4. Payments ──
  // If invoice has IGTF → replicate exact same payment methods from the invoice
  // If no IGTF → close with default 101
  const invoicePayments: any[] = invoice.payments || [];
  const hasIgtf = (invoice.igtfUsd || 0) > 0;

  if (hasIgtf && invoicePayments.length > 0) {
    for (let i = 0; i < invoicePayments.length; i++) {
      const payment = invoicePayments[i];
      const isLast = i === invoicePayments.length - 1;
      const fiscalCode = (payment.method?.fiscalCode || '01').padStart(2, '0');
      const amountBs = payment.amountBs || (payment.amountUsd * exchangeRate);

      if (isLast) {
        commands.push(`1${fiscalCode}`);
      } else {
        const amountStr = formatFixed(amountBs, 10, 2);
        commands.push(`2${fiscalCode}${amountStr}`);
      }
    }
  } else {
    commands.push('101');
  }

  // ── 5. IGTF ──
  if (companyConfig.isIGTFContributor) {
    commands.push('199');
  }

  return commands;
}

/**
 * Shows all fiscal commands in an alert for visual validation (fallback).
 */
export function showFiscalCommands(commands: string[]): void {
  const numbered = commands.map((cmd, i) => `${String(i + 1).padStart(3, ' ')}:  ${cmd}`).join('\n');
  alert(`=== COMANDOS FISCALES ===\n\n${numbered}\n\n=== FIN (${commands.length} comandos) ===`);
}

// ═══════════════════════════════════════════════════════════════════
// Serial communication with The Factory HKA fiscal printers
// Protocol: RS232, 9600 baud, 8 data bits, even parity, 1 stop bit
// Frame: STX(0x02) + DATA + ETX(0x03) + LRC
// LRC = XOR of all bytes from DATA through ETX (inclusive)
// ═══════════════════════════════════════════════════════════════════

const STX = 0x02;
const ETX = 0x03;
const ENQ = 0x05;
const ACK = 0x06;
const NAK = 0x15;

const SERIAL_CONFIG = {
  baudRate: 9600,
  dataBits: 8 as const,
  parity: 'even' as const,
  stopBits: 1 as const,
  flowControl: 'hardware' as const,
};

/** Timeout for waiting printer response (ms) */
const RESPONSE_TIMEOUT = 5000;
/** Max retries per command on NAK */
const MAX_RETRIES = 3;

/**
 * Builds the serial frame: STX + DATA + ETX + LRC
 */
function buildFrame(data: string): Uint8Array {
  const encoder = new TextEncoder();
  const dataBytes = encoder.encode(data);

  // LRC = XOR of all data bytes and ETX
  let lrc = 0;
  for (let i = 0; i < dataBytes.length; i++) {
    lrc ^= dataBytes[i];
  }
  lrc ^= ETX;

  const frame = new Uint8Array(dataBytes.length + 3); // STX + data + ETX + LRC
  frame[0] = STX;
  frame.set(dataBytes, 1);
  frame[dataBytes.length + 1] = ETX;
  frame[dataBytes.length + 2] = lrc;

  return frame;
}

/**
 * Reads bytes from the serial reader with timeout.
 */
async function readWithTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  timeoutMs: number,
): Promise<Uint8Array | null> {
  const timeoutPromise = new Promise<null>((resolve) =>
    setTimeout(() => resolve(null), timeoutMs),
  );

  const readPromise = reader.read().then(({ value }) => value || null);

  return Promise.race([readPromise, timeoutPromise]);
}

/**
 * Checks printer status by sending ENQ and reading the response.
 * Returns true if printer is ready (status byte indicates "en espera").
 */
async function checkPrinterStatus(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<{ ready: boolean; status: number; error: number }> {
  await writer.write(new Uint8Array([ENQ]));

  const response = await readWithTimeout(reader, RESPONSE_TIMEOUT);
  if (!response || response.length < 4) {
    return { ready: false, status: 0, error: 0 };
  }

  // Response: STX + STS1 + STS2 + ETX + LRC
  const sts1 = response[1];
  const sts2 = response[2];

  // Printer ready: 0x60 (fiscal, en espera) or 0x40 (entrenamiento, en espera)
  const isReady = sts1 === 0x60 || sts1 === 0x40;
  const hasError = sts2 !== 0x40;

  return { ready: isReady && !hasError, status: sts1, error: sts2 };
}

/**
 * Sends a single command to the printer and waits for ACK/NAK.
 * Retries on NAK up to MAX_RETRIES times.
 */
async function sendCommand(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  reader: ReadableStreamDefaultReader<Uint8Array>,
  command: string,
): Promise<boolean> {
  const frame = buildFrame(command);

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    await writer.write(frame);

    const response = await readWithTimeout(reader, RESPONSE_TIMEOUT);
    if (!response || response.length === 0) {
      throw new Error(`Sin respuesta de la impresora fiscal (comando: ${command.substring(0, 20)})`);
    }

    // Check first byte for ACK or NAK
    if (response[0] === ACK) {
      return true;
    }

    if (response[0] === NAK) {
      if (attempt < MAX_RETRIES - 1) {
        // Wait briefly before retry
        await new Promise((r) => setTimeout(r, 200));
        continue;
      }
      throw new Error(`Impresora rechazo el comando (NAK) despues de ${MAX_RETRIES} intentos: ${command.substring(0, 20)}`);
    }

    // Unexpected response — could be status frame, try to continue
    if (attempt < MAX_RETRIES - 1) {
      await new Promise((r) => setTimeout(r, 200));
      continue;
    }
  }

  return false;
}

/**
 * Sends all fiscal commands to the printer via Web Serial API.
 * Falls back to showFiscalCommands (alert) if serial is unavailable.
 */
export async function sendToFiscalPrinter(commands: string[], comPort?: string): Promise<void> {
  // Check Web Serial API availability
  if (!('serial' in navigator)) {
    showFiscalCommands(commands);
    alert('Web Serial API no disponible. Use Chrome o Edge para conectar la impresora fiscal.');
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let port: any = null;
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let writer: WritableStreamDefaultWriter<Uint8Array> | null = null;

  try {
    // Try to find existing paired port or request one
    const ports = await (navigator as any).serial.getPorts();
    if (ports.length > 0) {
      port = ports[0];
    } else {
      port = await (navigator as any).serial.requestPort();
    }

    if (!port) {
      throw new Error('No se selecciono ningun puerto serial');
    }

    await port.open(SERIAL_CONFIG);

    if (!port.readable || !port.writable) {
      throw new Error('No se pudo abrir el puerto serial');
    }

    reader = port.readable.getReader();
    writer = port.writable.getWriter();

    // Check printer status
    const status = await checkPrinterStatus(writer!, reader!);
    if (!status.ready) {
      throw new Error(
        `Impresora fiscal no esta lista. Status: 0x${status.status.toString(16)}, Error: 0x${status.error.toString(16)}`,
      );
    }

    // Send each command sequentially
    for (let i = 0; i < commands.length; i++) {
      await sendCommand(writer!, reader!, commands[i]);
      // Small delay between commands to let the printer process
      await new Promise((r) => setTimeout(r, 50));
    }

  } catch (err: any) {
    // Show commands in alert as fallback so the user can see what was attempted
    showFiscalCommands(commands);
    throw new Error(`Error de impresora fiscal: ${err.message}`);
  } finally {
    try { reader?.releaseLock(); } catch {}
    try { writer?.releaseLock(); } catch {}
    try { await port?.close(); } catch {}
  }
}
