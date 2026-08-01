import { Injectable } from '@nestjs/common';
import { IvaType } from '@prisma/client';
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

export interface ProductSyncPayload {
  code: string;
  name: string;
  description?: string | null;
  barcode?: string | null;
  supplierRef?: string | null;
  purchaseUnit?: string;
  saleUnit?: string;
  conversionFactor?: number;
  ivaType?: IvaType;
  costUsd: number;
  gananciaPct: number;
  gananciaMayorPct: number;
  priceDetal: number;
  priceMayor: number;
  manualPrice: boolean;
  bregaApplies: boolean;
  brandName?: string | null;
  categoryName?: string | null;
  categoryCode?: string | null;
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

  // ── Construye el payload de un producto para enviar al socio ──
  private async buildPayload(productId: string): Promise<ProductSyncPayload | null> {
    const p = await this.prisma.product.findUnique({
      where: { id: productId },
      include: { brand: true, category: true },
    });
    if (!p) return null;
    return {
      code: p.code,
      name: p.name,
      description: p.description,
      barcode: p.barcode,
      supplierRef: p.supplierRef,
      purchaseUnit: p.purchaseUnit,
      saleUnit: p.saleUnit,
      conversionFactor: p.conversionFactor,
      ivaType: p.ivaType,
      costUsd: p.costUsd,
      gananciaPct: p.gananciaPct,
      gananciaMayorPct: p.gananciaMayorPct,
      priceDetal: p.priceDetal,
      priceMayor: p.priceMayor,
      manualPrice: p.manualPrice,
      bregaApplies: p.bregaApplies,
      brandName: p.brand?.name ?? null,
      categoryName: p.category?.name ?? null,
      categoryCode: p.category?.code ?? null,
    };
  }

  // ── Entrante: crear si no existe (idempotente por code) ──
  async receiveUpsert(
    payload: ProductSyncPayload,
  ): Promise<{ created: boolean; code: string; reason?: string }> {
    if (!payload?.code) return { created: false, code: '', reason: 'no-code' };
    const exists = await this.prisma.product.findUnique({
      where: { code: payload.code },
      select: { id: true },
    });
    if (exists) return { created: false, code: payload.code, reason: 'exists' };

    // Marca: por nombre, crear si falta
    let brandId: string | undefined;
    if (payload.brandName) {
      const b =
        (await this.prisma.brand.findFirst({ where: { name: payload.brandName } })) ??
        (await this.prisma.brand.create({ data: { name: payload.brandName } }));
      brandId = b.id;
    }
    // Categoria: por code (unico) o nombre, crear si falta
    let categoryId: string | undefined;
    if (payload.categoryCode || payload.categoryName) {
      let cat = payload.categoryCode
        ? await this.prisma.category.findUnique({ where: { code: payload.categoryCode } })
        : await this.prisma.category.findFirst({ where: { name: payload.categoryName ?? '' } });
      if (!cat) {
        cat = await this.prisma.category.create({
          data: {
            name: payload.categoryName ?? payload.categoryCode ?? 'Sin categoria',
            code: payload.categoryCode ?? undefined,
          },
        });
      }
      categoryId = cat.id;
    }
    // Barcode: evitar choque de unicidad
    let barcode: string | null = payload.barcode ?? null;
    if (barcode) {
      const used = await this.prisma.product.findUnique({
        where: { barcode },
        select: { id: true },
      });
      if (used) barcode = null;
    }

    await this.prisma.product.create({
      data: {
        code: payload.code,
        name: payload.name,
        description: payload.description ?? null,
        barcode,
        supplierRef: payload.supplierRef ?? null,
        purchaseUnit: payload.purchaseUnit ?? 'UNIT',
        saleUnit: payload.saleUnit ?? 'UNIT',
        conversionFactor: payload.conversionFactor ?? 1,
        ivaType: payload.ivaType ?? IvaType.GENERAL,
        costUsd: payload.costUsd ?? 0,
        gananciaPct: payload.gananciaPct ?? 0,
        gananciaMayorPct: payload.gananciaMayorPct ?? 0,
        priceDetal: payload.priceDetal ?? 0,
        priceMayor: payload.priceMayor ?? 0,
        manualPrice: payload.manualPrice ?? false,
        bregaApplies: payload.bregaApplies ?? true,
        brandId,
        categoryId,
      },
    });
    this.storeExport.scheduleExport();
    return { created: true, code: payload.code };
  }

  // ── Entrante: catalogo completo para reconciliacion ──
  async localCatalog(): Promise<ProductSyncPayload[]> {
    const products = await this.prisma.product.findMany({
      where: { isActive: true },
      include: { brand: true, category: true },
    });
    return products.map((p) => ({
      code: p.code,
      name: p.name,
      description: p.description,
      barcode: p.barcode,
      supplierRef: p.supplierRef,
      purchaseUnit: p.purchaseUnit,
      saleUnit: p.saleUnit,
      conversionFactor: p.conversionFactor,
      ivaType: p.ivaType,
      costUsd: p.costUsd,
      gananciaPct: p.gananciaPct,
      gananciaMayorPct: p.gananciaMayorPct,
      priceDetal: p.priceDetal,
      priceMayor: p.priceMayor,
      manualPrice: p.manualPrice,
      bregaApplies: p.bregaApplies,
      brandName: p.brand?.name ?? null,
      categoryName: p.category?.name ?? null,
      categoryCode: p.category?.code ?? null,
    }));
  }

  // ── Saliente: empujar un alta al socio (fire-and-forget, nunca lanza) ──
  async pushNewProduct(productId: string): Promise<void> {
    try {
      if (!this.partner.isConfigured()) return;
      const payload = await this.buildPayload(productId);
      if (!payload) return;
      await this.partner.post('/integration/products/upsert', payload);
    } catch {
      // nunca romper el alta local
    }
  }

  // ── Reconciliacion: crear localmente los codes que el socio tiene y yo no ──
  async reconcileFromPartner(): Promise<{ created: number; checked: number }> {
    if (!this.partner.isConfigured()) return { created: 0, checked: 0 };
    const r = await this.partner.get<ProductSyncPayload[]>('/integration/products/catalog', 15000);
    if (!r.ok || !r.data) return { created: 0, checked: 0 };
    const myCodes = new Set(
      (await this.prisma.product.findMany({ select: { code: true } })).map((p) => p.code),
    );
    let created = 0;
    for (const payload of r.data) {
      if (myCodes.has(payload.code)) continue;
      const res = await this.receiveUpsert(payload);
      if (res.created) created++;
    }
    return { created, checked: r.data.length };
  }
}
