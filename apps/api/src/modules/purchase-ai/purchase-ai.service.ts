import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SpacesService } from '../product-images/spaces.service';
import { LlmExtractionService, ExtractedLine } from './llm-extraction.service';
import { ExtractInvoiceDto } from './dto/extract-invoice.dto';

export type MatchStatus = 'matched' | 'suggested' | 'new';

export interface ProductLite {
  id: string;
  code: string;
  name: string;
  supplierRef: string | null;
  costUsd: number;
  priceDetal: number;
  priceMayor: number;
  ivaType: string;
  isService: boolean;
}

export interface ReviewLine extends ExtractedLine {
  matchStatus: MatchStatus;
  /** Producto emparejado (cuando matchStatus === 'matched'). */
  product: ProductLite | null;
  /** Sugerencias cuando no hay match exacto. */
  candidates: ProductLite[];
}

/** Modelo más preciso para facturas densas/baja calidad (más caro). */
const PRECISE_MODEL = 'google/gemini-2.5-pro';

const PRODUCT_SELECT = {
  id: true,
  code: true,
  name: true,
  supplierRef: true,
  costUsd: true,
  priceDetal: true,
  priceMayor: true,
  ivaType: true,
  isService: true,
} as const;

@Injectable()
export class PurchaseAiService {
  private readonly logger = new Logger(PurchaseAiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly spaces: SpacesService,
    private readonly llm: LlmExtractionService,
  ) {}

  async extractAndMatch(dto: ExtractInvoiceDto) {
    // 1. Leer la factura con la IA (modelo preciso opcional para facturas difíciles).
    const modelOverride = dto.preciseModel ? PRECISE_MODEL : undefined;
    const { data, usage, model } = await this.llm.extract(dto.file, dto.instructions, modelOverride);

    // 2. Guardar el archivo para auditoría (best-effort: no rompe si Spaces no está configurado).
    let fileUrl: string | null = null;
    try {
      fileUrl = await this.storeFile(dto.file);
    } catch (e) {
      this.logger.warn(`No se pudo guardar el archivo de la factura: ${(e as Error).message}`);
    }

    // 3. Emparejar cada línea contra el catálogo.
    const lines = await Promise.all(data.lines.map((l) => this.matchLine(l, dto.supplierId)));

    // 4. Sugerir proveedor (por RIF o nombre) si no venía seleccionado.
    const supplier = await this.matchSupplier(dto.supplierId, data.supplierRif, data.supplierName);

    const matchedCount = lines.filter((l) => l.matchStatus === 'matched').length;

    return {
      header: {
        supplierName: data.supplierName,
        supplierRif: data.supplierRif,
        invoiceNumber: data.invoiceNumber,
        controlNumber: data.controlNumber,
        date: data.date,
        currency: data.currency,
        exchangeRate: data.exchangeRate,
        subtotal: data.subtotal,
        discountGlobalAmount: data.discountGlobalAmount,
        tax: data.tax,
        exempt: data.exempt,
        total: data.total,
      },
      supplier,
      lines,
      summary: {
        totalLines: lines.length,
        matched: matchedCount,
        suggested: lines.filter((l) => l.matchStatus === 'suggested').length,
        new: lines.filter((l) => l.matchStatus === 'new').length,
      },
      fileUrl,
      model,
      usage,
    };
  }

  private async matchLine(line: ExtractedLine, supplierId?: string): Promise<ReviewLine> {
    const code = line.supplierCode?.trim();
    let product: ProductLite | null = null;
    let candidates: ProductLite[] = [];

    if (code) {
      // Match exacto por Ref. proveedor (o código), acotado al proveedor si se conoce.
      const byCode = await this.prisma.product.findMany({
        where: {
          OR: [{ supplierRef: code }, { code }],
          ...(supplierId ? { supplierId } : {}),
        },
        select: PRODUCT_SELECT,
        take: 3,
      });
      if (byCode.length === 1) {
        product = byCode[0];
      } else if (byCode.length > 1) {
        candidates = byCode;
      } else if (supplierId) {
        // Reintentar sin acotar el proveedor (el ref existe pero con otro supplierId).
        const anySupplier = await this.prisma.product.findMany({
          where: { OR: [{ supplierRef: code }, { code }] },
          select: PRODUCT_SELECT,
          take: 3,
        });
        if (anySupplier.length === 1) product = anySupplier[0];
        else candidates = anySupplier;
      }
    }

    // Sin match por código → sugerir por nombre.
    if (!product && candidates.length === 0) {
      candidates = await this.fuzzyByName(line.description);
    }

    const matchStatus: MatchStatus = product ? 'matched' : candidates.length ? 'suggested' : 'new';
    return { ...line, matchStatus, product, candidates };
  }

  private async fuzzyByName(description: string): Promise<ProductLite[]> {
    const words = description
      .split(/\s+/)
      .map((w) => w.trim())
      .filter((w) => w.length >= 3)
      .slice(0, 3);
    if (words.length === 0) return [];
    return this.prisma.product.findMany({
      where: { AND: words.map((w) => ({ name: { contains: w, mode: 'insensitive' as const } })) },
      select: PRODUCT_SELECT,
      take: 5,
    });
  }

  private async matchSupplier(
    supplierId: string | undefined,
    rif: string | null,
    name: string | null,
  ): Promise<{ id: string; name: string; rif: string | null } | null> {
    if (supplierId) {
      return this.prisma.supplier.findUnique({ where: { id: supplierId }, select: { id: true, name: true, rif: true } });
    }
    if (rif) {
      const cleaned = rif.replace(/[^0-9a-zA-Z]/g, '');
      const byRif = await this.prisma.supplier.findFirst({
        where: { rif: { contains: cleaned.length >= 6 ? cleaned.slice(1) : cleaned, mode: 'insensitive' } },
        select: { id: true, name: true, rif: true },
      });
      if (byRif) return byRif;
    }
    if (name && name.length >= 3) {
      const byName = await this.prisma.supplier.findFirst({
        where: { name: { contains: name.split(/\s+/)[0], mode: 'insensitive' } },
        select: { id: true, name: true, rif: true },
      });
      if (byName) return byName;
    }
    return null;
  }

  private async storeFile(dataUri: string): Promise<string | null> {
    const m = dataUri.match(/^data:([^;]+);base64,(.*)$/s);
    if (!m) return null;
    const mime = m[1];
    const buf = Buffer.from(m[2], 'base64');
    const ext = mime === 'application/pdf' ? 'pdf' : mime.split('/')[1] || 'bin';
    const stamp = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 8);
    const key = `purchase-imports/${stamp}-${rand}.${ext}`;
    return this.spaces.uploadPublic(key, buf, mime);
  }
}
