import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateCompanyConfigDto } from './dto/update-company-config.dto';
import { IvaType } from '@prisma/client';
import * as bcrypt from 'bcrypt';

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

    // Hash creditAuthPassword before saving
    if (data.creditAuthPassword) {
      data.creditAuthPassword = await bcrypt.hash(data.creditAuthPassword, 10);
    }

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
    const products = await this.prisma.product.findMany({
      where: { isActive: true, manualPrice: false },
      select: {
        id: true,
        costUsd: true,
        gananciaPct: true,
        gananciaMayorPct: true,
        ivaType: true,
        bregaApplies: true,
      },
    });

    for (const p of products) {
      const bregaPct = p.bregaApplies ? bregaGlobalPct : 0;
      const ivaMultiplier = IVA_MULTIPLIERS[p.ivaType];
      const priceDetal = Math.round(
        p.costUsd * (1 + bregaPct / 100) * (1 + p.gananciaPct / 100) * ivaMultiplier * 100,
      ) / 100;
      const priceMayor = Math.round(
        p.costUsd * (1 + bregaPct / 100) * (1 + p.gananciaMayorPct / 100) * ivaMultiplier * 100,
      ) / 100;

      await this.prisma.product.update({
        where: { id: p.id },
        data: { priceDetal, priceMayor },
      });
    }
  }
}
