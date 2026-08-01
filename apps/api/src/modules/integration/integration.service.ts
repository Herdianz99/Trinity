import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StoreExportService } from '../store-export/store-export.service';
import { PartnerClient } from './partner-client.service';
import { getIntegrationConfig } from './integration.config';

export interface ProductLookup {
  code: string;
  exists: boolean;
  isActive?: boolean;
  name?: string;
  stock?: number;
  priceDetal?: number;
  priceMayor?: number;
}

export interface PartnerPrice {
  code: string;
  priceDetal: number;
  priceMayor: number;
}

export interface PartnerPriceRow {
  code: string;
  name: string;
  myPriceDetal: number;
  myPriceMayor: number;
  partnerPriceDetal: number;
  partnerPriceMayor: number;
  differs: boolean;
}

@Injectable()
export class IntegrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly partner: PartnerClient,
    private readonly storeExport: StoreExportService,
  ) {}

  // Responde al SOCIO: datos de un code en MI base.
  async lookupLocal(code: string): Promise<ProductLookup> {
    const p = await this.prisma.product.findUnique({
      where: { code },
      select: {
        code: true,
        name: true,
        isActive: true,
        priceDetal: true,
        priceMayor: true,
        stock: { select: { quantity: true } },
      },
    });
    if (!p) return { code, exists: false };
    return {
      code: p.code,
      exists: true,
      isActive: p.isActive,
      name: p.name,
      stock: Math.round(p.stock.reduce((s, x) => s + x.quantity, 0) * 1000) / 1000,
      priceDetal: p.priceDetal,
      priceMayor: p.priceMayor,
    };
  }

  // Para MI frontend: consulta el mismo code en la empresa SOCIA.
  // `enabled` = hay integracion configurada (si es false, el frontend no muestra el panel).
  async lookupPartner(
    code: string,
  ): Promise<{ enabled: boolean; available: boolean; partnerName: string; product?: ProductLookup }> {
    const cfg = getIntegrationConfig();
    const enabled = this.partner.isConfigured();
    if (!enabled) return { enabled: false, available: false, partnerName: cfg.partnerName };
    const r = await this.partner.get<ProductLookup>(
      `/integration/products/lookup?code=${encodeURIComponent(code)}`,
    );
    if (!r.ok || !r.data) return { enabled: true, available: false, partnerName: cfg.partnerName };
    return { enabled: true, available: true, partnerName: cfg.partnerName, product: r.data };
  }

  // ── Entrante: mis precios para el socio ──
  async localPrices(): Promise<PartnerPrice[]> {
    const products = await this.prisma.product.findMany({
      where: { isActive: true },
      select: { code: true, priceDetal: true, priceMayor: true },
    });
    return products.map((p) => ({ code: p.code, priceDetal: p.priceDetal, priceMayor: p.priceMayor }));
  }

  // ── Estado de la integracion (para el frontend) ──
  status(): { enabled: boolean; partnerName: string } {
    return { enabled: this.partner.isConfigured(), partnerName: getIntegrationConfig().partnerName };
  }

  // ── Preview: mis precios vs los del socio, cruzando por code ──
  async partnerPricesPreview(): Promise<{
    enabled: boolean;
    available: boolean;
    partnerName: string;
    rows: PartnerPriceRow[];
    noMatchCount: number;
  }> {
    const cfg = getIntegrationConfig();
    if (!this.partner.isConfigured()) {
      return { enabled: false, available: false, partnerName: cfg.partnerName, rows: [], noMatchCount: 0 };
    }
    const r = await this.partner.get<PartnerPrice[]>('/integration/products/prices');
    if (!r.ok || !r.data) {
      return { enabled: true, available: false, partnerName: cfg.partnerName, rows: [], noMatchCount: 0 };
    }
    const partnerMap = new Map(r.data.map((x) => [x.code, x]));
    const mine = await this.prisma.product.findMany({
      where: { isActive: true },
      select: { code: true, name: true, priceDetal: true, priceMayor: true },
    });
    const rows: PartnerPriceRow[] = [];
    for (const p of mine) {
      const pp = partnerMap.get(p.code);
      if (!pp) continue;
      rows.push({
        code: p.code,
        name: p.name,
        myPriceDetal: p.priceDetal,
        myPriceMayor: p.priceMayor,
        partnerPriceDetal: pp.priceDetal,
        partnerPriceMayor: pp.priceMayor,
        differs:
          Math.abs(p.priceDetal - pp.priceDetal) > 0.001 ||
          Math.abs(p.priceMayor - pp.priceMayor) > 0.001,
      });
    }
    const noMatchCount = mine.length - rows.length;
    return { enabled: true, available: true, partnerName: cfg.partnerName, rows, noMatchCount };
  }

  // ── Aplicar: pone el precio del socio como PRECIO MANUAL en mis productos ──
  async applyPartnerPrices(codes: string[], userId: string): Promise<{ applied: number }> {
    if (!this.partner.isConfigured() || codes.length === 0) return { applied: 0 };
    const r = await this.partner.get<PartnerPrice[]>('/integration/products/prices');
    if (!r.ok || !r.data) return { applied: 0 };
    const partnerMap = new Map(r.data.map((x) => [x.code, x]));
    const wanted = new Set(codes);
    const targets = (
      await this.prisma.product.findMany({
        where: { isActive: true, code: { in: codes } },
        select: { id: true, code: true },
      })
    ).filter((p) => wanted.has(p.code) && partnerMap.has(p.code));

    let applied = 0;
    await this.prisma.$transaction(
      async (tx) => {
        for (const t of targets) {
          const pp = partnerMap.get(t.code)!;
          await tx.product.update({
            where: { id: t.id },
            data: {
              priceDetal: Math.round(pp.priceDetal * 100) / 100,
              priceMayor: Math.round(pp.priceMayor * 100) / 100,
              manualPrice: true,
            },
          });
          applied++;
        }
        await tx.priceAdjustmentLog.create({
          data: {
            filters: { source: 'partner-prices', partner: getIntegrationConfig().partnerName } as any,
            adjustmentType: 'PARTNER_PRICES',
            gananciaPct: null,
            gananciaMayorPct: null,
            productsAffected: applied,
            createdById: userId,
          },
        });
      },
      { timeout: 60000 },
    );
    this.storeExport.scheduleExport();
    return { applied };
  }
}
