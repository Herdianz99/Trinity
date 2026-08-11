import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateCompanyConfigDto } from './dto/update-company-config.dto';
import { IvaType } from '@prisma/client';
import { resolveBregaPct, computeSellingPrices } from '../../common/pricing';
import { buildCategoryBregaMap } from '../../common/category-brega';

const IVA_MULTIPLIERS: Record<IvaType, number> = {
  EXEMPT: 1,
  REDUCED: 1.08,
  GENERAL: 1.16,
  SPECIAL: 1.31,
};

@Injectable()
export class CompanyConfigService {
  constructor(private prisma: PrismaService) {}

  async get() {
    let config = await this.prisma.companyConfig.findUnique({
      where: { id: 'singleton' },
    });
    if (!config) {
      config = await this.prisma.companyConfig.create({
        data: { id: 'singleton' },
      });
    }
    return config;
  }

  async update(dto: UpdateCompanyConfigDto) {
    const data: any = { ...dto };

    const bregaChanged = dto.bregaGlobalPct !== undefined;

    const config = await this.prisma.companyConfig.upsert({
      where: { id: 'singleton' },
      update: data,
      create: { id: 'singleton', ...data },
    });

    // Recalculate all product prices when brega changes
    if (bregaChanged) {
      await this.recalculateAllPrices(config.bregaGlobalPct);
    }

    return config;
  }

  private async recalculateAllPrices(bregaGlobalPct: number) {
    const catMap = await buildCategoryBregaMap(this.prisma);
    const products = await this.prisma.product.findMany({
      where: { isActive: true, manualPrice: false },
      select: {
        id: true,
        costUsd: true,
        gananciaPct: true,
        gananciaMayorPct: true,
        ivaType: true,
        bregaApplies: true,
        categoryId: true,
      },
    });

    for (const p of products) {
      const bregaPct = resolveBregaPct({
        bregaApplies: p.bregaApplies,
        categoryBregaPct: p.categoryId ? (catMap.get(p.categoryId) ?? 0) : 0,
        bregaGlobalPct,
      });
      const { priceDetal, priceMayor } = computeSellingPrices({
        costUsd: p.costUsd,
        gananciaPct: p.gananciaPct,
        gananciaMayorPct: p.gananciaMayorPct,
        ivaMultiplier: IVA_MULTIPLIERS[p.ivaType],
        bregaPct,
      });

      await this.prisma.product.update({
        where: { id: p.id },
        data: { priceDetal, priceMayor },
      });
    }
  }

  /** Recalcula precios de los productos de una categoría RAÍZ y todas sus subcategorías (manualPrice:false). */
  async recalculateCategoryPrices(rootCategoryId: string) {
    const config = await this.prisma.companyConfig.findUnique({ where: { id: 'singleton' } });
    const bregaGlobalPct = config?.bregaGlobalPct || 0;
    const catMap = await buildCategoryBregaMap(this.prisma);

    // Ids de la raíz + descendientes: todas las categorías cuya raíz es rootCategoryId.
    const allCats = await this.prisma.category.findMany({ select: { id: true, parentId: true } });
    const byId = new Map(allCats.map((c) => [c.id, c]));
    const rootOf = (id: string | null): string | null => {
      let cur = id;
      const seen = new Set<string>();
      while (cur && byId.get(cur)?.parentId && !seen.has(cur)) {
        seen.add(cur);
        cur = byId.get(cur)!.parentId!;
      }
      return cur;
    };
    const targetIds = allCats.filter((c) => rootOf(c.id) === rootCategoryId).map((c) => c.id);

    const products = await this.prisma.product.findMany({
      where: { isActive: true, manualPrice: false, categoryId: { in: targetIds } },
      select: {
        id: true,
        costUsd: true,
        gananciaPct: true,
        gananciaMayorPct: true,
        ivaType: true,
        bregaApplies: true,
        categoryId: true,
      },
    });

    for (const p of products) {
      const bregaPct = resolveBregaPct({
        bregaApplies: p.bregaApplies,
        categoryBregaPct: p.categoryId ? (catMap.get(p.categoryId) ?? 0) : 0,
        bregaGlobalPct,
      });
      const { priceDetal, priceMayor } = computeSellingPrices({
        costUsd: p.costUsd,
        gananciaPct: p.gananciaPct,
        gananciaMayorPct: p.gananciaMayorPct,
        ivaMultiplier: IVA_MULTIPLIERS[p.ivaType],
        bregaPct,
      });
      await this.prisma.product.update({
        where: { id: p.id },
        data: { priceDetal, priceMayor },
      });
    }
    return { updated: products.length };
  }
}
