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
//
// Command types:
//   1) SIMPLE (invoice, NC, ND, etc.):  PC→STX+DATA+ETX+LRC  Printer→ACK|NAK
//   2) READ SIMPLE (S1, S2, SV, etc.):  PC→STX+DATA+ETX+LRC  Printer→ACK
//                                        Printer→STX+RESPONSE+ETX+LRC  PC→ACK
//   3) READ INFO (reports, U4F, etc.):  multi-block with ETB + EOT
//
// Frame: STX(0x02) + DATA + ETX(0x03) + LRC
// LRC = XOR of all bytes from DATA through ETX (inclusive)
// ENQ (0x05) = independent status query, response: STX+STS1+STS2+ETX+LRC
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

/** Max retries per command on NAK or LRC failure */
const MAX_RETRIES = 3;

// ─── Types ───────────────────────────────────────────────────────

export interface FiscalStatusResult {
  invoiceFiscalNumber: string;
  debitNoteFiscalNumber?: string;
  creditNoteFiscalNumber: string;
  machineSerial: string;
  rif: string;
}

export interface PrinterModelInfo {
  modelCode: string;
  modelName: string;
  family: 'A' | 'B';
}

// ─── Browser compatibility check (MEJORA 5) ─────────────────────

export function isFiscalPrinterSupported(): {
  supported: boolean;
  reason?: string;
} {
  if (!('serial' in navigator)) {
    return {
      supported: false,
      reason: 'Web Serial API no disponible. Por favor usa Google Chrome o Microsoft Edge.',
    };
  }
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    return {
      supported: false,
      reason: 'La impresora fiscal requiere conexión segura (HTTPS) o acceso por localhost.',
    };
  }
  return { supported: true };
}

// ─── Buffered Serial I/O ─────────────────────────────────────────

class SerialIO {
  private pending: number[] = [];

  constructor(
    private reader: ReadableStreamDefaultReader<Uint8Array>,
    private writer: WritableStreamDefaultWriter<Uint8Array>,
  ) {}

  async write(data: Uint8Array): Promise<void> {
    await this.writer.write(data);
  }

  /** Read exactly `count` bytes, accumulating from the serial stream. */
  async read(count: number, timeoutMs: number): Promise<Uint8Array> {
    const deadline = Date.now() + timeoutMs;

    while (this.pending.length < count) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error('Timeout esperando datos del puerto serial');

      const result = await Promise.race([
        this.reader.read(),
        new Promise<null>((r) => setTimeout(() => r(null), remaining)),
      ]);
      if (result === null) throw new Error('Timeout esperando datos del puerto serial');
      if ((result as ReadableStreamReadResult<Uint8Array>).done) {
        throw new Error('Puerto serial cerrado inesperadamente');
      }
      const value = (result as ReadableStreamReadResult<Uint8Array>).value;
      if (value) for (let j = 0; j < value.length; j++) this.pending.push(value[j]);
    }

    return new Uint8Array(this.pending.splice(0, count));
  }

  /** Read a complete frame: STX...ETX + LRC. Returns the full frame including STX and LRC. */
  async readFrame(timeoutMs: number): Promise<Uint8Array> {
    const deadline = Date.now() + timeoutMs;

    // Accumulate until we find ETX after STX
    while (true) {
      // Look for ETX in pending buffer (skip position 0 which should be STX)
      const etxIdx = this.pending.indexOf(ETX, 1);
      if (etxIdx >= 0) {
        // Need everything up to ETX + 1 byte for LRC
        const frameLen = etxIdx + 2;
        while (this.pending.length < frameLen) {
          const remaining = deadline - Date.now();
          if (remaining <= 0) throw new Error('Timeout leyendo LRC de trama');
          const result = await Promise.race([
            this.reader.read(),
            new Promise<null>((r) => setTimeout(() => r(null), remaining)),
          ]);
          if (result === null) throw new Error('Timeout leyendo LRC de trama');
          if ((result as ReadableStreamReadResult<Uint8Array>).done) {
            throw new Error('Puerto serial cerrado');
          }
          const value = (result as ReadableStreamReadResult<Uint8Array>).value;
          if (value) for (let j = 0; j < value.length; j++) this.pending.push(value[j]);
        }
        return new Uint8Array(this.pending.splice(0, frameLen));
      }

      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error('Timeout esperando ETX en trama de respuesta');

      const result = await Promise.race([
        this.reader.read(),
        new Promise<null>((r) => setTimeout(() => r(null), remaining)),
      ]);
      if (result === null) throw new Error('Timeout esperando ETX en trama de respuesta');
      if ((result as ReadableStreamReadResult<Uint8Array>).done) {
        throw new Error('Puerto serial cerrado');
      }
      const value = (result as ReadableStreamReadResult<Uint8Array>).value;
      if (value) for (let j = 0; j < value.length; j++) this.pending.push(value[j]);
    }
  }

  releaseLocks(): void {
    try { this.reader.releaseLock(); } catch {}
    try { this.writer.releaseLock(); } catch {}
  }
}

// ─── Frame building ──────────────────────────────────────────────

/** Builds the serial frame: STX + DATA + ETX + LRC */
function buildFrame(data: string): Uint8Array {
  const encoder = new TextEncoder();
  const dataBytes = encoder.encode(data);

  let lrc = 0;
  for (let i = 0; i < dataBytes.length; i++) {
    lrc ^= dataBytes[i];
  }
  lrc ^= ETX;

  const frame = new Uint8Array(dataBytes.length + 3);
  frame[0] = STX;
  frame.set(dataBytes, 1);
  frame[dataBytes.length + 1] = ETX;
  frame[dataBytes.length + 2] = lrc;

  return frame;
}

// ─── LRC validation (MEJORA 3) ──────────────────────────────────

/**
 * Validates the LRC of a received frame.
 * Structure: [STX][DATA...][ETX][LRC]
 * LRC = XOR of all bytes between STX (exclusive) and LRC (exclusive),
 * i.e. XOR of DATA + ETX.
 */
function validateLRC(frame: Uint8Array): void {
  if (frame.length < 4) {
    throw new Error('Trama demasiado corta para validar LRC');
  }

  let lrc = 0;
  for (let i = 1; i < frame.length - 1; i++) {
    lrc ^= frame[i];
  }

  const receivedLRC = frame[frame.length - 1];
  if (lrc !== receivedLRC) {
    throw new Error(
      `LRC inválido — trama corrupta. Calculado: 0x${lrc.toString(16)}, ` +
      `recibido: 0x${receivedLRC.toString(16)}`,
    );
  }
}

// ─── ENQ polling — waitForReady (MEJORA 4) ──────────────────────

const STS2_ERRORS: Record<number, string> = {
  0x41: 'Sin papel — por favor cambia el rollo de papel',
  0x42: 'Error mecánico de impresora — contacta al técnico',
  0x43: 'Error mecánico y sin papel — contacta al técnico',
  0x48: 'Error de gaveta de dinero',
  0x60: 'Error fiscal — contacta al distribuidor autorizado',
  0x64: 'Error en memoria fiscal — contacta al distribuidor',
  0x6C: 'Memoria fiscal llena — contacta al distribuidor URGENTE',
};

async function waitForReady(io: SerialIO, timeoutMs = 30000): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    await io.write(new Uint8Array([ENQ]));

    // ENQ response: exactly 5 bytes — STX + STS1 + STS2 + ETX + LRC
    const response = await io.read(5, 2000);

    if (response[0] !== STX || response[3] !== ETX) {
      throw new Error('Respuesta a ENQ malformada');
    }

    const sts1 = response[1];
    const sts2 = response[2];

    // Check STS2 for critical errors
    const errMsg = STS2_ERRORS[sts2];
    if (errMsg) {
      throw new Error(errMsg);
    }

    // STS1: memory full states are fatal
    if (sts1 === 0x68 || sts1 === 0x69 || sts1 === 0x6A) {
      throw new Error('Memoria fiscal llena — la impresora no acepta más operaciones');
    }

    // STS1: ready states (fiscal or training, idle)
    if (sts1 === 0x60 || sts1 === 0x40) {
      return;
    }

    // Busy (in transaction) — wait and retry
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error('Timeout: la impresora no respondió en estado de espera tras 30 segundos');
}

// ─── Simple command (type 1 — ACK only) ─────────────────────────

async function sendSimpleCommand(io: SerialIO, command: string): Promise<void> {
  const frame = buildFrame(command);

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    await io.write(frame);

    const response = await io.read(1, 5000);

    if (response[0] === ACK) {
      return;
    }

    if (response[0] === NAK) {
      if (attempt < MAX_RETRIES - 1) {
        await new Promise((r) => setTimeout(r, 200));
        continue;
      }
      throw new Error(
        `Impresora rechazó el comando (NAK) después de ${MAX_RETRIES} intentos: ${command.substring(0, 20)}`,
      );
    }

    // Unexpected byte — retry
    if (attempt < MAX_RETRIES - 1) {
      await new Promise((r) => setTimeout(r, 200));
      continue;
    }

    throw new Error(
      `Respuesta inesperada 0x${response[0].toString(16)} al comando: ${command.substring(0, 20)}`,
    );
  }
}

// ─── Read command (type 2 — ACK + response frame) ───────────────

/**
 * Sends a read command (S1, SV, S2, etc.) and returns the DATA portion
 * of the response (without STX, ETX, LRC).
 *
 * Flow:  PC: STX+cmd+ETX+LRC → Printer: ACK
 *        Printer: STX+DATA+ETX+LRC → PC: ACK
 */
async function sendReadCommand(io: SerialIO, cmd: string): Promise<Uint8Array> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const frame = buildFrame(cmd);
      await io.write(frame);

      // Wait for initial ACK
      const ackByte = await io.read(1, 2000);
      if (ackByte[0] === NAK) throw new Error('NAK recibido — comando rechazado');
      if (ackByte[0] !== ACK) throw new Error(`Esperaba ACK, recibí 0x${ackByte[0].toString(16)}`);

      // Read response frame: STX + DATA + ETX + LRC
      const responseFrame = await io.readFrame(5000);

      // Validate LRC
      validateLRC(responseFrame);

      // Send ACK to confirm reception
      await io.write(new Uint8Array([ACK]));

      // Return DATA only (strip STX at start, ETX+LRC at end)
      return responseFrame.slice(1, responseFrame.length - 2);
    } catch (err) {
      // On LRC failure or read error, send NAK and retry
      try { await io.write(new Uint8Array([NAK])); } catch {}
      if (attempt === MAX_RETRIES - 1) throw err;
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  throw new Error(`Falló la lectura del comando ${cmd} tras ${MAX_RETRIES} reintentos`);
}

// ─── Printer model detection — SV (MEJORA 2) ────────────────────

const PRINTER_MODELS: Record<string, { name: string; family: 'A' | 'B' }> = {
  'Z7C': { name: 'HKA80', family: 'A' },
  'Z7A': { name: 'HKA112', family: 'B' },
  'Z1A': { name: 'SRP-270', family: 'B' },
  'Z1B': { name: 'SRP-350', family: 'B' },
  'Z1E': { name: 'SRP-280', family: 'B' },
  'Z1F': { name: 'SRP-812', family: 'A' },
  'ZPA': { name: 'HSP7000', family: 'B' },
  'Z6A': { name: 'TALLY1125', family: 'B' },
  'Z6B': { name: 'DT-230', family: 'A' },
  'Z6C': { name: 'TALLY1140', family: 'A' },
  'ZYA': { name: 'P3100DL', family: 'A' },
  'ZZH': { name: 'PP9', family: 'A' },
  'ZZP': { name: 'PP9-PLUS', family: 'A' },
};

async function detectPrinterModel(io: SerialIO): Promise<PrinterModelInfo> {
  await waitForReady(io);
  const data = await sendReadCommand(io, 'SV');
  const decoder = new TextDecoder();
  const text = decoder.decode(data);
  const modelCode = text.substring(0, 3);

  const info = PRINTER_MODELS[modelCode];
  if (!info) {
    return { modelCode, modelName: `Desconocido (${modelCode})`, family: 'A' };
  }
  return { modelCode, modelName: info.name, family: info.family };
}

// ─── Read S1 status (MEJORA 1) ──────────────────────────────────

async function readStatusS1(
  io: SerialIO,
  family: 'A' | 'B',
): Promise<FiscalStatusResult> {
  await waitForReady(io);
  const data = await sendReadCommand(io, 'S1');
  const decoder = new TextDecoder();
  const text = decoder.decode(data);

  if (family === 'A') {
    return {
      invoiceFiscalNumber:    text.substring(21, 29).trim(),
      debitNoteFiscalNumber:  text.substring(34, 42).trim(),
      creditNoteFiscalNumber: text.substring(47, 55).trim(),
      rif:                    text.substring(81, 92).trim(),
      machineSerial:          text.substring(92, 102).trim(),
    };
  } else {
    return {
      invoiceFiscalNumber:    text.substring(21, 29).trim(),
      creditNoteFiscalNumber: text.substring(88, 96).trim(),
      rif:                    text.substring(55, 66).trim(),
      machineSerial:          text.substring(66, 76).trim(),
    };
  }
}

// ─── Main entry point ────────────────────────────────────────────

/**
 * Sends all fiscal commands to the printer via Web Serial API.
 * When readStatusAfter=true, reads S1 status after printing and returns
 * the fiscal numbers directly (no need for Status.txt or trinity-agent).
 * Falls back to showFiscalCommands (alert) if serial is unavailable.
 */
export async function sendToFiscalPrinter(
  commands: string[],
  comPort?: string,
  readStatusAfter: boolean = false,
): Promise<FiscalStatusResult | null> {
  // Check Web Serial API availability
  const support = isFiscalPrinterSupported();
  if (!support.supported) {
    showFiscalCommands(commands);
    alert(support.reason || 'Web Serial API no disponible.');
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let port: any = null;
  let io: SerialIO | null = null;

  try {
    // Try to find existing paired port or request one
    const ports = await (navigator as any).serial.getPorts();
    if (ports.length > 0) {
      port = ports[0];
    } else {
      port = await (navigator as any).serial.requestPort();
    }

    if (!port) {
      throw new Error('No se seleccionó ningún puerto serial');
    }

    await port.open(SERIAL_CONFIG);

    if (!port.readable || !port.writable) {
      throw new Error('No se pudo abrir el puerto serial');
    }

    io = new SerialIO(port.readable.getReader(), port.writable.getWriter());

    // Detect printer model (MEJORA 2)
    const model = await detectPrinterModel(io);
    console.log(`[FISCAL] Impresora detectada: ${model.modelName} (${model.modelCode}) — Familia ${model.family}`);

    if (model.family === 'B') {
      console.warn('[FISCAL] Esta impresora es Familia B y no soporta Notas de Débito.');
    }

    // Wait for printer ready before sending commands (MEJORA 4)
    await waitForReady(io);

    // Send each command sequentially (type 1 — simple commands)
    for (let i = 0; i < commands.length; i++) {
      await sendSimpleCommand(io, commands[i]);
      // Small delay between commands to let the printer process
      await new Promise((r) => setTimeout(r, 50));
    }

    // Read S1 status if requested (MEJORA 1)
    let fiscalStatus: FiscalStatusResult | null = null;
    if (readStatusAfter) {
      try {
        fiscalStatus = await readStatusS1(io, model.family);
        console.log('[FISCAL] S1 leído:', fiscalStatus);
      } catch (err: any) {
        console.error('[FISCAL] Error leyendo S1:', err.message);
      }
    }

    return fiscalStatus;
  } catch (err: any) {
    showFiscalCommands(commands);
    throw new Error(`Error de impresora fiscal: ${err.message}`);
  } finally {
    io?.releaseLocks();
    try { await port?.close(); } catch {}
  }
}
