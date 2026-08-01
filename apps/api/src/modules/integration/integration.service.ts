import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
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

@Injectable()
export class IntegrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly partner: PartnerClient,
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
}
