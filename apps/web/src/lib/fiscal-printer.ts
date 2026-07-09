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
    const rif = docType ? `${docType}-${customer.rif}` : customer.rif;
    commands.push(`iR*${rif}`);
  } else {
    commands.push('iR*V-00000000');
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
    // Credit: always use fiscal position 10 (Credito)
    commands.push('110');
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
        // Payment amount: 10 integer + 2 decimal = 12 chars (per protocol manual)
        // NOTE: item prices use 8+2=10 chars, but payment amounts use 10+2=12 chars
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
    commands.push('iR*V-00000000');
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
        // Payment amount: 10 integer + 2 decimal = 12 chars (per protocol manual)
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
// Confirmed protocol (tested with HKA80/Z7C):
//   ENQ (0x05) → 5-byte status: STX+STS1+STS2+ETX+LRC
//
//   SIMPLE commands (invoice items, payments, etc.):
//     PC: STX+DATA+ETX+LRC → Printer: ACK|NAK or 5-byte status frame
//
//   READ commands (S1, S2, SV, etc.):
//     PC: STX+CMD+ETX+LRC → Printer: data frame directly
//     OR: Printer: status frame → PC: ENQ → Printer: data frame
//     PC: ACK after receiving data
//
// Response format: librería (fields separated by 0x0A, command echo prefix)
// Frame: STX(0x02) + DATA + ETX(0x03) + LRC
// LRC = XOR of all bytes from DATA through ETX (inclusive)
// ═══════════════════════════════════════════════════════════════════

const STX = 0x02;
const ETX = 0x03;
const ENQ = 0x05;
const ACK = 0x06;
const NAK = 0x15;
// Lectura de reportes (manual §10.3, Tabla 11): la impresora responde con varios
// paquetes STX-DATA-ETB-LRC (cada uno ACK-eado) y cierra con EOT. Distinto de la
// lectura simple (Tabla 10), que es una sola trama terminada en ETX.
const ETB = 0x17;
const EOT = 0x04;

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

    // Discard any bytes before STX (noise/garbage on the line)
    while (this.pending.length > 0 && this.pending[0] !== STX) {
      this.pending.shift();
    }

    // Accumulate until we find ETX after STX
    while (true) {
      // Ensure first byte is STX; discard garbage if needed
      while (this.pending.length > 0 && this.pending[0] !== STX) {
        this.pending.shift();
      }

      // Look for ETX in pending buffer (skip position 0 which is STX)
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

  /**
   * Lee una respuesta de reporte multi-paquete (manual §10.3, Tabla 11):
   * la impresora envia varios paquetes STX-DATA-ETB-LRC; el PC hace ACK por cada
   * uno; la secuencia termina con EOT. Devuelve la concatenacion del DATA de todos.
   * Es lo que faltaba: los comandos de extraccion (U0X/U0Z) usan ESTE protocolo,
   * no la trama simple terminada en ETX que entiende readFrame().
   */
  async readReportData(idleTimeoutMs: number): Promise<string> {
    // idleTimeoutMs = maximo tiempo SIN recibir bytes (se reinicia con cada chunk), no un
    // tope total fijo: asi un volcado lento desde memoria fiscal (U0Z) no falla mientras
    // siga llegando data. Tope duro de seguridad de 60 s.
    const hardDeadline = Date.now() + 60000;
    let idleDeadline = Date.now() + idleTimeoutMs;
    const decoder = new TextDecoder();
    let data = '';
    let packets = 0;
    const rawAll: number[] = []; // diagnostico: todo lo que envio la impresora
    const hex = (arr: number[]) => arr.map((b) => b.toString(16).padStart(2, '0')).join(' ');
    const timeoutErr = () =>
      new Error(
        `Timeout leyendo datos del reporte fiscal (recibidos ${rawAll.length} bytes, ${packets} paquete(s)). RAW: ${hex(rawAll) || '(nada)'}`,
      );

    const pump = async () => {
      const remaining = Math.min(idleDeadline, hardDeadline) - Date.now();
      if (remaining <= 0) throw timeoutErr();
      const result = await Promise.race([
        this.reader.read(),
        new Promise<null>((r) => setTimeout(() => r(null), remaining)),
      ]);
      if (result === null) throw timeoutErr();
      if ((result as ReadableStreamReadResult<Uint8Array>).done) {
        throw new Error('Puerto serial cerrado');
      }
      const value = (result as ReadableStreamReadResult<Uint8Array>).value;
      if (value && value.length) {
        idleDeadline = Date.now() + idleTimeoutMs; // llego data -> reinicia inactividad
        for (let j = 0; j < value.length; j++) {
          this.pending.push(value[j]);
          rawAll.push(value[j]);
        }
        console.log(`[FISCAL] reporte chunk +${value.length}B:`, hex(Array.from(value)));
      }
    };

    while (true) {
      while (this.pending.length === 0) await pump();

      // Fin de la secuencia
      if (this.pending[0] === EOT) {
        this.pending.shift();
        break;
      }
      // La impresora pide "adelante" con ENQ antes de volcar el reporte -> responder ACK
      // para completar el handshake (los comandos de lectura S1/SV usan el mismo ENQ/ACK).
      if (this.pending[0] === ENQ) {
        this.pending.shift();
        await this.write(new Uint8Array([ACK]));
        continue;
      }
      // NAK = la impresora rechazo el comando -> abortar con mensaje claro (no esperar timeout)
      if (this.pending[0] === NAK) {
        this.pending.shift();
        throw new Error(
          `La impresora rechazó el comando de lectura de reporte (NAK). RAW hasta aqui: ${hex(rawAll)}`,
        );
      }
      // Descarta ruido / bytes sueltos hasta encontrar un STX
      if (this.pending[0] !== STX) {
        this.pending.shift();
        continue;
      }

      // Cierre de paquete: ETB (multi-paquete, Tabla 11) o ETX (trama simple). Aceptamos
      // ambos por si la HKA80 responde U0Z con trama unica en vez de la secuencia ETB/EOT.
      const findTerm = () => {
        const iEtb = this.pending.indexOf(ETB, 1);
        const iEtx = this.pending.indexOf(ETX, 1);
        if (iEtb < 0) return { idx: iEtx, term: ETX };
        if (iEtx < 0) return { idx: iEtb, term: ETB };
        return iEtb < iEtx ? { idx: iEtb, term: ETB } : { idx: iEtx, term: ETX };
      };
      let t = findTerm();
      while (t.idx < 0) {
        await pump();
        t = findTerm();
      }
      // Necesita el terminador + 1 byte de LRC
      const frameLen = t.idx + 2;
      while (this.pending.length < frameLen) await pump();
      const frame = this.pending.splice(0, frameLen);
      const dataBytes = frame.slice(1, t.idx);
      data += decoder.decode(new Uint8Array(dataBytes));
      packets++;
      await this.write(new Uint8Array([ACK]));
      if (t.term === ETX) break; // trama simple: un solo paquete terminado en ETX
    }

    console.log(`[FISCAL] readReportData: ${packets} paquete(s), ${data.length} chars. RAW(${rawAll.length}B): ${hex(rawAll)}`);
    return data;
  }

  /**
   * Flush pending state: send ACK+ENQ repeatedly until we get stable
   * 5-byte status responses, discarding any leftover data frames.
   */
  async flush(): Promise<void> {
    let stableCount = 0;

    for (let round = 0; round < 15 && stableCount < 3; round++) {
      // ACK any pending frame, then ENQ for status
      await this.write(new Uint8Array([ACK]));
      await new Promise((r) => setTimeout(r, 100));
      await this.write(new Uint8Array([ENQ]));

      try {
        const frame = await this.readFrame(800);
        if (frame.length === 5 && frame[0] === STX && frame[3] === ETX) {
          stableCount++;
        } else {
          // Got a data frame — pending state being drained
          stableCount = 0;
          await this.write(new Uint8Array([ACK]));
        }
      } catch {
        // Timeout — no response, try again
        stableCount = 0;
      }
    }

    // Final silence check — discard any remaining bytes
    this.pending = [];
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

    // Validate LRC on ENQ response: XOR of STS1 + STS2 + ETX
    const enqLrc = response[1] ^ response[2] ^ ETX;
    if (enqLrc !== response[4]) {
      // LRC mismatch — skip this response and retry
      await new Promise((resolve) => setTimeout(resolve, 200));
      continue;
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

    // Printer is ready to accept commands in ANY of these states:
    // 0x40 = training idle, 0x42 = training non-fiscal doc
    // 0x44 = training fiscal doc, 0x60 = fiscal idle
    // 0x61 = fiscal doc header phase, 0x62 = fiscal non-fiscal doc
    // 0x64 = fiscal doc with items, 0x66 = fiscal doc + non-fiscal
    // All are valid "ready for next command" as long as STS2 has no errors
    if ((sts2 & 0x04) === 0) {
      // No command error in STS2 — printer is ready
      return;
    }

    // STS2 has error flag — wait and retry
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error('Timeout: la impresora no respondió en estado de espera tras 30 segundos');
}

// ─── Simple command (type 1 — ACK or status frame) ──────────────

async function sendSimpleCommand(io: SerialIO, command: string, timeoutMs = 5000): Promise<void> {
  const frame = buildFrame(command);

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    await io.write(frame);

    const firstByte = await io.read(1, timeoutMs);

    if (firstByte[0] === ACK) {
      return;
    }

    // Printer may respond with a 5-byte status frame (STX STS1 STS2 ETX LRC)
    // instead of a single ACK byte
    if (firstByte[0] === STX) {
      const rest = await io.read(4, timeoutMs);
      // rest = [STS1, STS2, ETX, LRC]
      const sts2 = rest[1];
      // Check for error in STS2 (bit 2 = command error)
      if ((sts2 & 0x04) !== 0) {
        throw new Error(
          `Impresora reportó error (STS2=0x${sts2.toString(16)}) al comando: ${command.substring(0, 20)}`,
        );
      }
      // Status frame without error = command accepted
      return;
    }

    if (firstByte[0] === NAK) {
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
      `Respuesta inesperada 0x${firstByte[0].toString(16)} al comando: ${command.substring(0, 20)}`,
    );
  }
}

// ─── Read command (type 2 — data frame or status+ENQ+data) ──────

/**
 * Sends a read command (S1, SV, S2, etc.) and returns the DATA portion
 * of the response as a string (librería format: fields separated by \n).
 *
 * Confirmed protocol (HKA80/Z7C):
 *   PC: STX+cmd+ETX+LRC
 *   Printer responds with EITHER:
 *     a) Data frame directly (normal after clean state)
 *     b) 5-byte status frame → PC sends ENQ → Printer sends data frame
 *   PC: ACK to confirm
 */
async function sendReadCommand(io: SerialIO, cmd: string): Promise<string> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const frame = buildFrame(cmd);
      await io.write(frame);

      // Read response frame
      const responseFrame = await io.readFrame(5000);

      // Check if it's a 5-byte status frame (STX STS1 STS2 ETX LRC)
      if (responseFrame.length === 5 && responseFrame[3] === ETX) {
        const sts2 = responseFrame[2];
        if ((sts2 & 0x04) !== 0) {
          throw new Error(`Error en comando ${cmd}: STS2=0x${sts2.toString(16)}`);
        }

        // Status frame received — send ENQ to request data frame
        await io.write(new Uint8Array([ENQ]));
        const dataFrame = await io.readFrame(5000);
        validateLRC(dataFrame);
        await io.write(new Uint8Array([ACK]));

        const decoder = new TextDecoder();
        return decoder.decode(dataFrame.slice(1, dataFrame.length - 2));
      }

      // Data frame received directly
      validateLRC(responseFrame);
      await io.write(new Uint8Array([ACK]));

      const decoder = new TextDecoder();
      return decoder.decode(responseFrame.slice(1, responseFrame.length - 2));
    } catch (err) {
      try { await io.write(new Uint8Array([NAK])); } catch {}
      if (attempt === MAX_RETRIES - 1) throw err;
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  throw new Error(`Falló la lectura del comando ${cmd} tras ${MAX_RETRIES} reintentos`);
}

/**
 * Envia un comando de EXTRACCION de reporte (U0X/U0Z) y lee la respuesta como
 * secuencia multi-paquete (ETB por paquete + EOT al final, manual §10.3 Tabla 11).
 * A diferencia de sendReadCommand, no espera una trama unica terminada en ETX.
 */
async function sendReportReadCommand(io: SerialIO, cmd: string): Promise<string> {
  const frame = buildFrame(cmd);
  await io.write(frame);
  return io.readReportData(15000);
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
  const text = await sendReadCommand(io, 'SV');

  // Librería format: "SV\nZ7C\nVE" → fields[0]=echo, fields[1]=model, fields[2]=country
  const fields = text.split('\n');
  const modelCode = fields.length >= 2 ? fields[1] : text.substring(0, 3);

  const info = PRINTER_MODELS[modelCode];
  if (!info) {
    return { modelCode, modelName: `Desconocido (${modelCode})`, family: 'A' };
  }
  return { modelCode, modelName: info.name, family: info.family };
}

// ─── Read S1 status (MEJORA 1) ──────────────────────────────────

/**
 * Reads S1 status from the printer.
 *
 * Confirmed librería format (HKA80/Z7C, Family A):
 *   f[0]  = echo+status (e.g., "S100" = echo "S1" + status "00")
 *   f[1]  = subtotal ventas
 *   f[2]  = ultima factura
 *   f[3]  = cant. facturas
 *   f[4]  = ult. nota debito
 *   f[5]  = cant. notas debito
 *   f[6]  = ult. nota credito
 *   f[7]  = cant. notas credito
 *   f[8]  = ultimo DNF
 *   f[9]  = cant. DNF
 *   f[10] = cierres Z
 *   f[11] = reportes MF
 *   f[12] = RIF
 *   f[13] = serial maquina
 *   f[14] = hora (HHMMSS)
 *   f[15] = fecha (DDMMYY)
 */
async function readStatusS1(
  io: SerialIO,
  _family: 'A' | 'B',
): Promise<FiscalStatusResult> {
  await waitForReady(io);
  const text = await sendReadCommand(io, 'S1');
  const f = text.split('\n');

  // Require minimum fields for reliable parsing
  if (f.length < 14) {
    throw new Error(`Respuesta S1 incompleta: ${f.length} campos (esperados >= 14)`);
  }

  return {
    invoiceFiscalNumber:    f[2]?.trim() || '',
    debitNoteFiscalNumber:  f[4]?.trim() || '',
    creditNoteFiscalNumber: f[6]?.trim() || '',
    rif:                    f[12]?.trim() || '',
    machineSerial:          f[13]?.trim() || '',
  };
}

// ─── Connection helper ───────────────────────────────────────────

/**
 * Opens the serial port (trying saved ports first, then prompting the user),
 * flushes any pending state, detects the printer model, and calls `fn`
 * with the SerialIO and model info. Cleans up (release locks, close port)
 * in all cases.
 */
async function withFiscalPrinter<T>(
  fn: (io: SerialIO, model: PrinterModelInfo) => Promise<T>,
): Promise<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let port: any = null;
  let io: SerialIO | null = null;

  try {
    // Try saved port first; if ENQ fails, forget it and ask the user to pick
    const savedPorts = await (navigator as any).serial.getPorts();

    for (const saved of savedPorts) {
      try {
        await saved.open(SERIAL_CONFIG);
        if (saved.readable && saved.writable) {
          const testIO = new SerialIO(saved.readable.getReader(), saved.writable.getWriter());
          try {
            // Quick ENQ to verify the printer is actually on this port
            await testIO.write(new Uint8Array([ENQ]));
            const resp = await testIO.read(5, 2000);
            if (resp[0] === STX && resp[3] === ETX) {
              // Printer responded — use this port
              port = saved;
              io = testIO;
              console.log('[FISCAL] Puerto guardado OK — impresora respondió');
              break;
            }
          } catch {
            // No response — wrong port
          }
          testIO.releaseLocks();
        }
        await saved.close();
      } catch {
        // Port busy or can't open — skip
      }

      // Forget this non-working port so it doesn't get reused
      try { await saved.forget(); } catch {}
    }

    // No saved port worked — ask the user to pick
    if (!port) {
      port = await (navigator as any).serial.requestPort();
      if (!port) {
        throw new Error('No se seleccionó ningún puerto serial');
      }
      await port.open(SERIAL_CONFIG);
      if (!port.readable || !port.writable) {
        throw new Error('No se pudo abrir el puerto serial');
      }
      io = new SerialIO(port.readable.getReader(), port.writable.getWriter());
    }

    // Flush pending state from previous interrupted sessions
    await io!.flush();

    // Detect printer model
    const model = await detectPrinterModel(io!);
    console.log(`[FISCAL] Impresora detectada: ${model.modelName} (${model.modelCode}) — Familia ${model.family}`);

    if (model.family === 'B') {
      console.warn('[FISCAL] Esta impresora es Familia B y no soporta Notas de Débito.');
    }

    // Wait for printer ready
    await waitForReady(io!);

    return await fn(io!, model);
  } finally {
    io?.releaseLocks();
    try { await port?.close(); } catch {}
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
  guard?: {
    expectedMachineSerial?: string | null;
    onMismatch?: (info: { expected: string; actual: string }) => boolean | Promise<boolean>;
  },
): Promise<FiscalStatusResult | null> {
  // Check Web Serial API availability
  const support = isFiscalPrinterSupported();
  if (!support.supported) {
    showFiscalCommands(commands);
    alert(support.reason || 'Web Serial API no disponible.');
    return null;
  }

  try {
    return await withFiscalPrinter(async (io, model) => {
      // Candado fiscal: la NC debe imprimirse en la MISMA maquina que emitio la
      // factura. Se lee el serial de la maquina conectada (S1) y, si no coincide con
      // el esperado, se avisa; el usuario decide si continua (por si fue un error de
      // configuracion). No bloquea si el serial no se puede leer.
      if (guard?.expectedMachineSerial) {
        const expected = (guard.expectedMachineSerial || '').trim();
        if (expected) {
          let actual = '';
          try {
            const pre = await readStatusS1(io, model.family);
            actual = (pre.machineSerial || '').trim();
          } catch {
            // No se pudo leer el serial: no bloquear por esto.
          }
          if (actual && actual !== expected) {
            const proceed = guard.onMismatch
              ? await guard.onMismatch({ expected, actual })
              : false;
            if (!proceed) {
              const cancel: any = new Error('MACHINE_MISMATCH_CANCELLED');
              cancel.code = 'MACHINE_MISMATCH_CANCELLED';
              throw cancel;
            }
          }
          // Se leyo el S1 (aunque coincida o el usuario decida continuar): re-asegurar
          // que la impresora quede lista antes de enviar los comandos de impresion.
          await waitForReady(io);
        }
      }

      // Send each command sequentially
      for (let i = 0; i < commands.length; i++) {
        const cmd = commands[i];

        // Reports (I0Z, I0X) need longer timeout — manual says ~20s for Z
        const isReport = cmd.startsWith('I0');
        const cmdTimeout = isReport ? 25000 : 5000;

        await sendSimpleCommand(io, cmd, cmdTimeout);

        // Poll ENQ until printer is ready before sending next command
        if (i < commands.length - 1) {
          await waitForReady(io, isReport ? 30000 : 10000);
        }
      }

      // Read S1 status if requested
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
    });
  } catch (err: any) {
    // Cancelacion por maquina incorrecta: propagar limpio (sin mostrar comandos ni
    // envolver el mensaje) para que la pantalla lo distinga de un error real.
    if (err?.code === 'MACHINE_MISMATCH_CANCELLED') throw err;
    showFiscalCommands(commands);
    throw new Error(`Error de impresora fiscal: ${err.message}`);
  }
}

// ─── Printer tools (settings page) ──────────────────────────────

/**
 * Connects to the printer, detects model, reads S1 status.
 * Returns model info and status (serial, RIF, last invoice/NC numbers).
 */
export async function readPrinterStatus(): Promise<{
  model: PrinterModelInfo;
  status: FiscalStatusResult;
}> {
  return withFiscalPrinter(async (io, model) => {
    const status = await readStatusS1(io, model.family);
    return { model, status };
  });
}

/**
 * Connects to the printer and sends a single raw command.
 * Useful for diagnostics: "D" (print config), "7" (void document),
 * "I0X" (X report), "I0Z" (Z close), etc.
 */
export async function sendRawFiscalCommand(
  command: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await withFiscalPrinter(async (io) => {
      const isReport = command.startsWith('I0');
      const cmdTimeout = isReport ? 25000 : 5000;
      await sendSimpleCommand(io, command, cmdTimeout);
    });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Sends multiple raw commands in a single printer connection.
 * Calls onProgress(index, total) after each command succeeds.
 * Returns the number of successfully sent commands.
 */
export async function sendMultipleFiscalCommands(
  commands: string[],
  onProgress?: (sent: number, total: number) => void,
): Promise<{ success: boolean; sent: number; total: number; error?: string }> {
  const total = commands.length;
  try {
    const sent = await withFiscalPrinter(async (io) => {
      let count = 0;
      for (const cmd of commands) {
        await sendSimpleCommand(io, cmd, 5000);
        count++;
        onProgress?.(count, total);
        if (count < total) {
          await waitForReady(io, 10000);
        }
      }
      return count;
    });
    return { success: true, sent, total };
  } catch (err: any) {
    return { success: false, sent: 0, total, error: err.message };
  }
}

// ─── Z Report Data Extraction ────────────────────────────────────

export interface ZReportData {
  zNumber: number;
  reportDate: string;
  machineSerial: string;
  printerFamily: 'A' | 'B';

  // Ventas
  salesExemptBs: number;
  salesTaxBase1Bs: number;
  salesTax1Bs: number;
  salesTaxBase2Bs: number;
  salesTax2Bs: number;
  salesTaxBase3Bs: number;
  salesTax3Bs: number;

  // NC
  ncExemptBs: number;
  ncTaxBase1Bs: number;
  ncTax1Bs: number;
  ncTaxBase2Bs: number;
  ncTax2Bs: number;
  ncTaxBase3Bs: number;
  ncTax3Bs: number;

  // ND (solo Family A)
  ndExemptBs: number;
  ndTaxBase1Bs: number;
  ndTax1Bs: number;
  ndTaxBase2Bs: number;
  ndTax2Bs: number;
  ndTaxBase3Bs: number;
  ndTax3Bs: number;

  // IGTF
  igtfSalesBaseBs: number;
  igtfSalesTaxBs: number;
  igtfNcBaseBs: number;
  igtfNcTaxBs: number;
  igtfNdBaseBs: number;
  igtfNdTaxBs: number;

  // Rangos de documentos
  lastInvoiceNumber: string;
  lastCreditNoteNumber: string;
  lastDebitNoteNumber: string;
  invoiceCount: number;
  creditNoteCount: number;
  debitNoteCount: number;

  rawResponse: string;
}

/**
 * Helper: parse an integer from a field, default to 0.
 */
function pInt(s: string | undefined): number {
  if (!s) return 0;
  const n = parseInt(s.trim(), 10);
  return isNaN(n) ? 0 : n;
}

/**
 * Helper: parse a monetary value from The Factory protocol.
 * Values come as integers representing cents (multiply by 100).
 * E.g., "12345" = 123.45 Bs.
 */
function pMoney(s: string | undefined): number {
  if (!s) return 0;
  const n = parseInt(s.trim(), 10);
  return isNaN(n) ? 0 : n / 100;
}

/**
 * Extracts Z report data from the fiscal printer using U0X (read accumulators),
 * then prints the Z report using I0Z (which also clears accumulators).
 *
 * Protocol flow:
 *   1. Read S1 to get machineSerial
 *   2. Send U0X (read command) → capture accumulated data WITHOUT clearing
 *   3. Parse response fields based on printer family (A or B)
 *   4. Send I0Z (simple command) → prints Z report and clears accumulators
 *   5. Return parsed ZReportData
 *
 * Field layout (campos separados por \n). OJO: la respuesta U0X NO trae eco
 * del comando -> f[0] YA es el primer dato (esto causaba el desfase +1 que
 * guardaba fechas en zNumber y montos corridos un campo; corregido Sesion 68).
 *
 * Family A (~40 fields) — CALIBRADO con HKA80 real (coincide con Tabla 65/U0Z):
 *   f[0]=nextZ, f[1]=fechaUltZ(DDMMYY), f[2]=horaUltZ,
 *   f[3]=ultFactura, f[4]=fechaUltFactura, f[5]=horaUltFactura,
 *   f[6]=ultNC, f[7]=ultND, f[8]=ultDNF
 *   f[9..15]=ventas(exento,base1,tax1,base2,tax2,base3,tax3)
 *   f[16..22]=ND(exento,base1,tax1,base2,tax2,base3,tax3)
 *   f[23..29]=NC(exento,base1,tax1,base2,tax2,base3,tax3)
 *   f[30..35]=IGTF(salesBase,salesTax,ncBase,ncTax,ndBase,ndTax)
 *
 * Family B (~21 fields) — mismo desfase -1 por ausencia de eco; SIN VERIFICAR
 * con printer B real (las tiendas usan HKA80/Family A). Ajustar si aparece una.
 */
export async function extractAndPrintZReport(): Promise<ZReportData> {
  return withFiscalPrinter(async (io, model) => {
    // 1. Read S1 to get machine serial
    const s1 = await readStatusS1(io, model.family);
    const machineSerial = s1.machineSerial;

    // 2. Send U0X to read Z accumulators without clearing.
    // U0X usa el protocolo de lectura multi-paquete (ETB/EOT), NO la trama simple
    // terminada en ETX -> por eso sendReadCommand daba "Timeout esperando ETX".
    await waitForReady(io);
    const rawResponse = await sendReportReadCommand(io, 'U0X');
    console.log('[FISCAL] U0X raw:', JSON.stringify(rawResponse));
    const f = rawResponse.split('\n');

    console.log(`[FISCAL] U0X response: ${f.length} fields, family ${model.family}`);
    console.log('[FISCAL] Raw fields:', f.map((v, i) => `[${i}]=${v}`).join(', '));

    let data: ZReportData;

    if (model.family === 'A') {
      // Family A (~40 campos). CALIBRADO con raw real de HKA80 (Z7C), Sesion 68.
      // La respuesta U0X NO trae eco del comando: f[0] YA es el primer dato.
      // El orden coincide con la Tabla 65 (U0Z):
      //   f[0]=nroProximoZ  f[1]=fechaUltZ  f[2]=horaUltZ
      //   f[3]=nroUltFactura  f[4]=fechaUltFactura  f[5]=horaUltFactura
      //   f[6]=nroUltNC  f[7]=nroUltND  f[8]=nroUltDNF
      //   f[9..15]=ventas  f[16..22]=ND  f[23..29]=NC  f[30..35]=IGTF
      data = {
        zNumber: pInt(f[0]),
        reportDate: new Date().toISOString(),
        machineSerial,
        printerFamily: 'A',

        // Ventas: f[9..15]
        salesExemptBs: pMoney(f[9]),
        salesTaxBase1Bs: pMoney(f[10]),
        salesTax1Bs: pMoney(f[11]),
        salesTaxBase2Bs: pMoney(f[12]),
        salesTax2Bs: pMoney(f[13]),
        salesTaxBase3Bs: pMoney(f[14]),
        salesTax3Bs: pMoney(f[15]),

        // ND: f[16..22]
        ndExemptBs: pMoney(f[16]),
        ndTaxBase1Bs: pMoney(f[17]),
        ndTax1Bs: pMoney(f[18]),
        ndTaxBase2Bs: pMoney(f[19]),
        ndTax2Bs: pMoney(f[20]),
        ndTaxBase3Bs: pMoney(f[21]),
        ndTax3Bs: pMoney(f[22]),

        // NC: f[23..29]
        ncExemptBs: pMoney(f[23]),
        ncTaxBase1Bs: pMoney(f[24]),
        ncTax1Bs: pMoney(f[25]),
        ncTaxBase2Bs: pMoney(f[26]),
        ncTax2Bs: pMoney(f[27]),
        ncTaxBase3Bs: pMoney(f[28]),
        ncTax3Bs: pMoney(f[29]),

        // IGTF: f[30..35]
        igtfSalesBaseBs: pMoney(f[30]),
        igtfSalesTaxBs: pMoney(f[31]),
        igtfNcBaseBs: pMoney(f[32]),
        igtfNcTaxBs: pMoney(f[33]),
        igtfNdBaseBs: pMoney(f[34]),
        igtfNdTaxBs: pMoney(f[35]),

        // Numeros de ultimo comprobante (U0X no trae "primer" numero ni conteos)
        lastInvoiceNumber: f[3]?.trim() || '',
        lastCreditNoteNumber: f[6]?.trim() || '',
        lastDebitNoteNumber: f[7]?.trim() || '',
        invoiceCount: 0,
        creditNoteCount: 0,
        debitNoteCount: 0,

        rawResponse,
      };
    } else {
      // Family B: ~21 fields (no ND, no IGTF). Sin eco -> f[0] es el primer dato.
      data = {
        zNumber: pInt(f[0]),
        reportDate: new Date().toISOString(),
        machineSerial,
        printerFamily: 'B',

        // Ventas: f[5..11]
        salesExemptBs: pMoney(f[5]),
        salesTaxBase1Bs: pMoney(f[6]),
        salesTax1Bs: pMoney(f[7]),
        salesTaxBase2Bs: pMoney(f[8]),
        salesTax2Bs: pMoney(f[9]),
        salesTaxBase3Bs: pMoney(f[10]),
        salesTax3Bs: pMoney(f[11]),

        // NC: f[12..18]
        ncExemptBs: pMoney(f[12]),
        ncTaxBase1Bs: pMoney(f[13]),
        ncTax1Bs: pMoney(f[14]),
        ncTaxBase2Bs: pMoney(f[15]),
        ncTax2Bs: pMoney(f[16]),
        ncTaxBase3Bs: pMoney(f[17]),
        ncTax3Bs: pMoney(f[18]),

        // Family B: no ND
        ndExemptBs: 0,
        ndTaxBase1Bs: 0,
        ndTax1Bs: 0,
        ndTaxBase2Bs: 0,
        ndTax2Bs: 0,
        ndTaxBase3Bs: 0,
        ndTax3Bs: 0,

        // Family B: no IGTF
        igtfSalesBaseBs: 0,
        igtfSalesTaxBs: 0,
        igtfNcBaseBs: 0,
        igtfNcTaxBs: 0,
        igtfNdBaseBs: 0,
        igtfNdTaxBs: 0,

        // Numeros de ultimo comprobante
        lastInvoiceNumber: f[2]?.trim() || '',
        lastCreditNoteNumber: f[19]?.trim() || '',
        lastDebitNoteNumber: '',
        invoiceCount: 0,
        creditNoteCount: 0,
        debitNoteCount: 0,

        rawResponse,
      };
    }

    // 3. Print Z report (clears accumulators)
    await waitForReady(io, 10000);
    await sendSimpleCommand(io, 'I0Z', 25000);

    console.log(`[FISCAL] Z Report #${data.zNumber} extracted and printed`);
    return data;
  });
}

// ═══════════════════════════════════════════════════════════════════
// U0Z — lectura del ULTIMO reporte Z ya cerrado (solo lectura, no cierra)
//
// Manual The Factory HKA V8.5.0 §21, Tabla 65 (impresoras SRP812, DT230,
// HKA80, P3100DL, PP9, PP9-PLUS, TD1140 → todas Familia A en este codigo).
// Se usa el layout "Protocolo Directo": campos de ANCHO FIJO contiguos
// (sin separadores), montos de 18 chars. Longitud total ~595.
//
// A diferencia de U0X (acumuladores VIVOS antes de cerrar), U0Z devuelve el
// Z ANTERIOR ya consolidado en memoria — ideal para calibrar sin imprimir.
// ═══════════════════════════════════════════════════════════════════

/** Layout "Protocolo Directo" de U0Z para Familia A (Tabla 65). from = offset 0-indexado, len = ancho. */
const U0Z_FAMILY_A_LAYOUT: { label: string; from: number; len: number; kind: 'num' | 'date' | 'money' }[] = [
  // --- Cabecera (numeros de documento / fechas) ---
  { label: 'nroProximoZ',        from: 0,   len: 4,  kind: 'num'  },
  { label: 'fechaUltimoZ',       from: 4,   len: 6,  kind: 'date' },
  { label: 'horaUltimoZ',        from: 10,  len: 4,  kind: 'num'  },
  { label: 'nroUltimaFactura',   from: 14,  len: 8,  kind: 'num'  },
  { label: 'fechaUltimaFactura', from: 22,  len: 6,  kind: 'date' },
  { label: 'horaUltimaFactura',  from: 28,  len: 4,  kind: 'num'  },
  { label: 'nroUltimaNC',        from: 32,  len: 8,  kind: 'num'  },
  { label: 'nroUltimaND',        from: 40,  len: 8,  kind: 'num'  },
  { label: 'nroUltimoDNF',       from: 48,  len: 8,  kind: 'num'  },
  // --- Acumulados de Ventas ---
  { label: 'ventasExento',       from: 56,  len: 18, kind: 'money' },
  { label: 'ventasBaseTasa1',    from: 74,  len: 18, kind: 'money' },
  { label: 'ventasImpuestoTasa1',from: 92,  len: 18, kind: 'money' },
  { label: 'ventasBaseTasa2',    from: 110, len: 18, kind: 'money' },
  { label: 'ventasImpuestoTasa2',from: 128, len: 18, kind: 'money' },
  { label: 'ventasBaseTasa3',    from: 146, len: 18, kind: 'money' },
  { label: 'ventasImpuestoTasa3',from: 164, len: 18, kind: 'money' },
  // --- Acumulados Nota de Debito ---
  { label: 'ndExento',           from: 182, len: 18, kind: 'money' },
  { label: 'ndBaseTasa1',        from: 200, len: 18, kind: 'money' },
  { label: 'ndImpuestoTasa1',    from: 218, len: 18, kind: 'money' },
  { label: 'ndBaseTasa2',        from: 236, len: 18, kind: 'money' },
  { label: 'ndImpuestoTasa2',    from: 254, len: 18, kind: 'money' },
  { label: 'ndBaseTasa3',        from: 272, len: 18, kind: 'money' },
  { label: 'ndImpuestoTasa3',    from: 290, len: 18, kind: 'money' },
  // --- Acumulados Nota de Credito ---
  { label: 'ncExento',           from: 308, len: 18, kind: 'money' },
  { label: 'ncBaseTasa1',        from: 326, len: 18, kind: 'money' },
  { label: 'ncImpuestoTasa1',    from: 344, len: 18, kind: 'money' },
  { label: 'ncBaseTasa2',        from: 362, len: 18, kind: 'money' },
  { label: 'ncImpuestoTasa2',    from: 380, len: 18, kind: 'money' },
  { label: 'ncBaseTasa3',        from: 398, len: 18, kind: 'money' },
  { label: 'ncImpuestoTasa3',    from: 416, len: 18, kind: 'money' },
  // --- IGTF ---
  { label: 'igtfBaseVentas',     from: 434, len: 18, kind: 'money' },
  { label: 'igtfImpPercibVentas',from: 452, len: 18, kind: 'money' },
  { label: 'igtfImpPercibDebito',from: 470, len: 18, kind: 'money' },
  { label: 'igtfImpPercibCredito',from: 488,len: 18, kind: 'money' },
  { label: 'igtfValorVentas',    from: 506, len: 18, kind: 'money' },
  { label: 'igtfBaseNC',         from: 524, len: 18, kind: 'money' },
  { label: 'igtfValorNC',        from: 542, len: 18, kind: 'money' },
  { label: 'igtfBaseND',         from: 560, len: 18, kind: 'money' },
  { label: 'igtfValorND',        from: 578, len: 18, kind: 'money' },
];

export interface ZReportRawSlice {
  label: string;
  from: number;
  len: number;
  kind: 'num' | 'date' | 'money';
  raw: string;       // substring crudo en esas posiciones
  asInt: number;     // parseado como entero
  asMoney: number;   // parseado como monto (entero / 100)
}

export interface ZReportRawResult {
  modelCode: string;
  modelName: string;
  family: 'A' | 'B';
  machineSerial: string;
  raw: string;                 // respuesta cruda completa de U0Z
  rawLength: number;
  rawEscaped: string;          // JSON.stringify(raw) — deja ver \n y control chars
  fieldsByNewline: string[];   // interpretacion alternativa: split por \n
  slicedFields: ZReportRawSlice[]; // interpretacion por posiciones del manual (Tabla 65)
}

/**
 * Lee el ULTIMO reporte Z ya cerrado con U0Z (solo lectura — NO cierra ni imprime).
 * Devuelve la respuesta cruda + dos interpretaciones (por posiciones fijas del
 * manual y por split de \n) para poder calibrar los offsets con una impresora real.
 */
export async function readLastZReport(): Promise<ZReportRawResult> {
  return withFiscalPrinter(async (io, model) => {
    // Serial de la maquina (opcional, para referencia)
    let machineSerial = '';
    try {
      const s1 = await readStatusS1(io, model.family);
      machineSerial = s1.machineSerial;
    } catch (err: any) {
      console.warn('[FISCAL] No se pudo leer S1 antes de U0Z:', err.message);
    }

    // Lectura multi-paquete (ETB/EOT) — mismo protocolo que U0X
    await waitForReady(io);
    const raw = await sendReportReadCommand(io, 'U0Z');
    console.log('[FISCAL] U0Z raw:', JSON.stringify(raw));
    console.log(`[FISCAL] U0Z length=${raw.length}, family=${model.family}`);

    const slicedFields: ZReportRawSlice[] = U0Z_FAMILY_A_LAYOUT.map((f) => {
      const rawSlice = raw.substr(f.from, f.len);
      return {
        label: f.label,
        from: f.from,
        len: f.len,
        kind: f.kind,
        raw: rawSlice,
        asInt: pInt(rawSlice),
        asMoney: pMoney(rawSlice),
      };
    });

    return {
      modelCode: model.modelCode,
      modelName: model.modelName,
      family: model.family,
      machineSerial,
      raw,
      rawLength: raw.length,
      rawEscaped: JSON.stringify(raw),
      fieldsByNewline: raw.split('\n'),
      slicedFields,
    };
  });
}
