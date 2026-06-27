import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateLostSaleDto } from './dto/create-lost-sale.dto';
import { caracasDateKey, caracasDayStart, caracasDayEnd } from '../../common/timezone';

const round2 = (n: number) => Math.round(n * 100) / 100;

@Injectable()
export class LostSalesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateLostSaleDto, userId: string) {
    let productName = dto.productName?.trim() || '';
    let productCode: string | null = null;
    let unitPriceUsd = dto.unitPriceUsd ?? 0;
    let stockAtMoment: number | null = null;

    if (dto.productId) {
      const p = await this.prisma.product.findUnique({
        where: { id: dto.productId },
        include: { stock: true },
      });
      if (!p) throw new NotFoundException('Producto no encontrado');
      productName = p.name;
      productCode = p.code;
      unitPriceUsd = p.priceDetal;
      stockAtMoment = p.stock.reduce((s, x) => s + x.quantity, 0);
    }

    if (!productName) {
      throw new BadRequestException('Indica el producto (del catalogo o por nombre)');
    }

    const quantity = dto.quantity && dto.quantity > 0 ? dto.quantity : 1;

    // Tasa del dia (o la ultima disponible); no bloquea si no hay
    const today = caracasDateKey();
    let rateRow = await this.prisma.exchangeRate.findUnique({ where: { date: today } });
    if (!rateRow) {
      rateRow = await this.prisma.exchangeRate.findFirst({ orderBy: { date: 'desc' } });
    }
    const rate = rateRow?.rate ?? 0;

    const unitPriceBs = round2(unitPriceUsd * rate);
    const estimatedUsd = round2(quantity * unitPriceUsd);
    const estimatedBs = round2(quantity * unitPriceBs);

    return this.prisma.lostSale.create({
      data: {
        productId: dto.productId || null,
        productName,
        productCode,
        quantity,
        reason: dto.reason,
        unitPriceUsd,
        unitPriceBs,
        estimatedUsd,
        estimatedBs,
        stockAtMoment,
        customerId: dto.customerId || null,
        notes: dto.notes?.trim() || null,
        createdById: userId,
      },
    });
  }

  async findAll(filters: {
    from?: string;
    to?: string;
    reason?: string;
    productId?: string;
    createdById?: string;
  }) {
    const where: any = {};
    if (filters.from || filters.to) {
      where.createdAt = {};
      if (filters.from) where.createdAt.gte = caracasDayStart(filters.from);
      if (filters.to) where.createdAt.lte = caracasDayEnd(filters.to);
    }
    if (filters.reason) where.reason = filters.reason;
    if (filters.productId) where.productId = filters.productId;
    if (filters.createdById) where.createdById = filters.createdById;

    return this.prisma.lostSale.findMany({
      where,
      include: {
        product: { select: { id: true, code: true, name: true } },
        customer: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }

  /** Reporte agregado por producto + por motivo + totales. */
  async report(filters: { from?: string; to?: string }) {
    const where: any = {};
    if (filters.from || filters.to) {
      where.createdAt = {};
      if (filters.from) where.createdAt.gte = caracasDayStart(filters.from);
      if (filters.to) where.createdAt.lte = caracasDayEnd(filters.to);
    }

    const sales = await this.prisma.lostSale.findMany({
      where,
      select: {
        productId: true,
        productName: true,
        productCode: true,
        quantity: true,
        reason: true,
        estimatedUsd: true,
        estimatedBs: true,
      },
    });

    // Agregado por producto (agrupa por productId, o por nombre si es texto libre)
    const byProductMap = new Map<string, any>();
    const byReasonMap = new Map<string, { count: number; quantity: number; estimatedUsd: number }>();
    let totalCount = 0;
    let totalQuantity = 0;
    let totalEstimatedUsd = 0;
    let totalEstimatedBs = 0;

    for (const s of sales) {
      const key = s.productId || `free:${s.productName.toLowerCase()}`;
      const cur = byProductMap.get(key) || {
        productId: s.productId,
        productName: s.productName,
        productCode: s.productCode,
        count: 0,
        quantity: 0,
        estimatedUsd: 0,
        estimatedBs: 0,
      };
      cur.count += 1;
      cur.quantity += s.quantity;
      cur.estimatedUsd += s.estimatedUsd;
      cur.estimatedBs += s.estimatedBs;
      byProductMap.set(key, cur);

      const r = byReasonMap.get(s.reason) || { count: 0, quantity: 0, estimatedUsd: 0 };
      r.count += 1;
      r.quantity += s.quantity;
      r.estimatedUsd += s.estimatedUsd;
      byReasonMap.set(s.reason, r);

      totalCount += 1;
      totalQuantity += s.quantity;
      totalEstimatedUsd += s.estimatedUsd;
      totalEstimatedBs += s.estimatedBs;
    }

    const byProduct = Array.from(byProductMap.values())
      .map((p) => ({
        ...p,
        quantity: round2(p.quantity),
        estimatedUsd: round2(p.estimatedUsd),
        estimatedBs: round2(p.estimatedBs),
      }))
      .sort((a, b) => b.estimatedUsd - a.estimatedUsd);

    const byReason = Array.from(byReasonMap.entries()).map(([reason, v]) => ({
      reason,
      count: v.count,
      quantity: round2(v.quantity),
      estimatedUsd: round2(v.estimatedUsd),
    }));

    return {
      byProduct,
      byReason,
      totals: {
        count: totalCount,
        quantity: round2(totalQuantity),
        estimatedUsd: round2(totalEstimatedUsd),
        estimatedBs: round2(totalEstimatedBs),
      },
    };
  }

  async remove(id: string) {
    const ls = await this.prisma.lostSale.findUnique({ where: { id }, select: { id: true } });
    if (!ls) throw new NotFoundException('Registro no encontrado');
    await this.prisma.lostSale.delete({ where: { id } });
    return { message: 'Venta perdida eliminada' };
  }
}
