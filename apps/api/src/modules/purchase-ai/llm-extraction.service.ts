import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ExtractedLine {
  /** Código / referencia del producto según el proveedor (para el match). */
  supplierCode: string | null;
  description: string;
  quantity: number;
  unitCost: number;
  /** % de descuento de la línea, solo si aparece en la factura. */
  lineDiscountPct: number;
  /** Total de la línea tal cual lo muestra la factura (para cuadrar). */
  lineTotal: number | null;
}

export interface ExtractedInvoice {
  supplierName: string | null;
  supplierRif: string | null;
  invoiceNumber: string | null;
  controlNumber: string | null;
  /** Fecha de la factura en formato YYYY-MM-DD. */
  date: string | null;
  currency: 'USD' | 'BS' | null;
  exchangeRate: number | null;
  subtotal: number | null;
  discountGlobalAmount: number | null;
  tax: number | null;
  exempt: number | null;
  total: number | null;
  lines: ExtractedLine[];
}

const SYSTEM_PROMPT = `Eres un asistente experto en leer FACTURAS DE COMPRA de proveedores (Venezuela) y devolver SOLO sus datos en JSON estricto.

Devuelve EXCLUSIVAMENTE un objeto JSON con esta forma exacta (sin texto adicional, sin markdown):
{
  "supplierName": string|null,        // nombre/razón social del proveedor emisor
  "supplierRif": string|null,         // RIF del proveedor (ej "J-12345678-9")
  "invoiceNumber": string|null,       // número de factura
  "controlNumber": string|null,       // número de control (si aparece)
  "date": string|null,                // fecha de la factura en formato YYYY-MM-DD
  "currency": "USD"|"BS"|null,        // moneda de los montos: USD si es en dólares, BS si es en bolívares
  "exchangeRate": number|null,        // tasa Bs/USD si aparece en la factura
  "subtotal": number|null,            // subtotal antes de IVA
  "discountGlobalAmount": number|null,// monto de descuento global (no por línea), si aparece
  "tax": number|null,                 // monto de IVA
  "exempt": number|null,              // monto exento, si aplica
  "total": number|null,               // total a pagar de la factura
  "lines": [
    {
      "supplierCode": string|null,    // código/referencia del artículo según el proveedor
      "description": string,          // descripción del artículo
      "quantity": number,             // cantidad
      "unitCost": number,             // costo unitario (precio de compra por unidad)
      "lineDiscountPct": number,      // % de descuento de la línea (0 si no hay)
      "lineTotal": number|null        // total de la línea tal como aparece
    }
  ]
}

REGLAS:
- Extrae SOLO lo que está en el documento. NO inventes datos. Si algo no aparece, usa null (o 0 para lineDiscountPct).
- Los números van como número puro: sin separador de miles, con punto decimal (ej 1234.56). Convierte "1.234,56" a 1234.56.
- Si la tabla tiene una columna de código/referencia del proveedor (título "Código", "Cód", "Ref"), cópiala en "supplierCode" exacto como aparece.
- "unitCost" es el costo unitario del producto. Si la factura tiene varias columnas de precio, elige la del PRECIO DE COMPRA unitario; si dudas, la que multiplicada por la cantidad da el total de la línea.
- Las instrucciones del usuario (si las hay) TIENEN PRIORIDAD: pueden indicarte qué columna usar, que apliques un descuento no reflejado, que los precios traen IVA incluido, etc. Acátalas.
- Responde SIEMPRE en JSON válido y nada más.`;

/** Normaliza fechas comunes (DD/MM/AAAA, DD-M-AA, etc.) a YYYY-MM-DD; null si no se puede. */
function normalizeDate(input: string | null): string | null {
  if (!input) return null;
  const s = input.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) {
    const dd = m[1].padStart(2, '0');
    const mm = m[2].padStart(2, '0');
    let yyyy = m[3];
    if (yyyy.length === 2) yyyy = `20${yyyy}`;
    if (+mm >= 1 && +mm <= 12 && +dd >= 1 && +dd <= 31) return `${yyyy}-${mm}-${dd}`;
  }
  return null;
}

@Injectable()
export class LlmExtractionService {
  private readonly logger = new Logger(LlmExtractionService.name);

  constructor(private readonly config: ConfigService) {}

  async extract(
    fileDataUri: string,
    instructions?: string,
    modelOverride?: string,
  ): Promise<{ data: ExtractedInvoice; usage?: unknown; model: string }> {
    const key = this.config.get<string>('OPENROUTER_API_KEY');
    const base = (this.config.get<string>('OPENROUTER_BASE_URL') || 'https://openrouter.ai/api/v1').replace(/\/$/, '');
    const model = modelOverride?.trim() || this.config.get<string>('OPENROUTER_MODEL') || 'google/gemini-2.5-flash';
    if (!key) throw new BadRequestException('OPENROUTER_API_KEY no está configurada en el servidor.');

    const isPdf = fileDataUri.startsWith('data:application/pdf');
    const filePart = isPdf
      ? { type: 'file', file: { filename: 'factura.pdf', file_data: fileDataUri } }
      : { type: 'image_url', image_url: { url: fileDataUri } };

    const userText =
      'Extrae los datos de esta factura de compra y devuélvelos en el JSON indicado.' +
      (instructions?.trim()
        ? `\n\nINSTRUCCIONES ADICIONALES DEL USUARIO (tienen prioridad):\n${instructions.trim()}`
        : '');

    const body = {
      model,
      temperature: 0,
      max_tokens: 8000, // facturas con muchas líneas generan JSON largo; sin esto la salida se trunca
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: [{ type: 'text', text: userText }, filePart] },
      ],
    };

    // OpenRouter a veces devuelve la respuesta truncada (JSON incompleto): reintentamos.
    const MAX_ATTEMPTS = 3;
    let lastError = '';
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      let res: Response;
      try {
        res = await fetch(`${base}/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://trinity.erp',
            'X-Title': 'Trinity ERP',
          },
          body: JSON.stringify(body),
        });
      } catch (e) {
        lastError = `conexión: ${(e as Error).message}`;
        continue;
      }

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        lastError = `OpenRouter ${res.status}: ${errText.slice(0, 300)}`;
        this.logger.warn(`Intento ${attempt}/${MAX_ATTEMPTS} — ${lastError}`);
        // 4xx (salvo 429) no se arregla reintentando.
        if (res.status >= 400 && res.status < 500 && res.status !== 429) {
          throw new BadRequestException(lastError);
        }
        continue;
      }

      const json = (await res.json()) as {
        choices?: { message?: { content?: string }; finish_reason?: string }[];
        usage?: unknown;
        error?: { message?: string };
      };
      if (json.error) {
        lastError = `OpenRouter: ${json.error.message || 'error'}`;
        continue;
      }

      const content = json.choices?.[0]?.message?.content ?? '';
      const parsed = this.tryParse(content);
      if (parsed) return { data: parsed, usage: json.usage, model };

      lastError = `respuesta no-JSON o truncada (finish_reason=${json.choices?.[0]?.finish_reason})`;
      this.logger.warn(`Intento ${attempt}/${MAX_ATTEMPTS} — ${lastError}`);
    }

    throw new BadRequestException(`La IA no devolvió un JSON válido tras ${MAX_ATTEMPTS} intentos (${lastError}).`);
  }

  /** Parsea el contenido; devuelve null si no es JSON válido (para reintentar). */
  private tryParse(content: string): ExtractedInvoice | null {
    let txt = content.trim();
    if (!txt) return null;
    const fence = txt.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) txt = fence[1].trim();

    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(txt) as Record<string, unknown>;
    } catch {
      return null;
    }

    const num = (v: unknown): number | null => {
      if (v === null || v === undefined || v === '') return null;
      if (typeof v === 'number') return isNaN(v) ? null : v;
      const n = parseFloat(String(v).replace(/[^0-9.-]/g, ''));
      return isNaN(n) ? null : n;
    };
    const str = (v: unknown): string | null => {
      if (v === null || v === undefined) return null;
      const s = String(v).trim();
      return s === '' ? null : s;
    };

    const rawLines = Array.isArray(obj.lines) ? (obj.lines as Record<string, unknown>[]) : [];
    const lines: ExtractedLine[] = rawLines.map((l) => ({
      supplierCode: str(l.supplierCode),
      description: str(l.description) ?? '',
      quantity: num(l.quantity) ?? 0,
      unitCost: num(l.unitCost) ?? 0,
      lineDiscountPct: num(l.lineDiscountPct) ?? 0,
      lineTotal: num(l.lineTotal),
    }));

    const currency = obj.currency === 'USD' || obj.currency === 'BS' ? obj.currency : null;

    return {
      supplierName: str(obj.supplierName),
      supplierRif: str(obj.supplierRif),
      invoiceNumber: str(obj.invoiceNumber),
      controlNumber: str(obj.controlNumber),
      date: normalizeDate(str(obj.date)),
      currency,
      exchangeRate: num(obj.exchangeRate),
      subtotal: num(obj.subtotal),
      discountGlobalAmount: num(obj.discountGlobalAmount),
      tax: num(obj.tax),
      exempt: num(obj.exempt),
      total: num(obj.total),
      lines,
    };
  }
}
