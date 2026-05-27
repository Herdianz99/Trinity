import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class StockMovementsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filters: {
    productId?: string;
    warehouseId?: string;
    type?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }) {
    const where: any = {};
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    if (filters.productId) {
      where.productId = filters.productId;
    }

    if (filters.warehouseId) {
      where.warehouseId = filters.warehouseId;
    }

    if (filters.type) {
      where.type = filters.type;
    }

    if (filters.from || filters.to) {
      where.createdAt = {};
      if (filters.from) {
        const fromDate = new Date(filters.from);
        fromDate.setUTCHours(0, 0, 0, 0);
        where.createdAt.gte = fromDate;
      }
      if (filters.to) {
        const toDate = new Date(filters.to);
        toDate.setUTCHours(23, 59, 59, 999);
        where.createdAt.lte = toDate;
      }
    }

    const [data, total] = await Promise.all([
      this.prisma.stockMovement.findMany({
        where,
        include: {
          product: { select: { id: true, code: true, name: true } },
          warehouse: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: filters.productId ? 'asc' : 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.stockMovement.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Kardex: returns ALL movements for a product ordered ASC with computed running balance.
   * Groups all warehouses into a single running total.
   */
  async getKardex(productId: string, page: number = 1, limit: number = 50) {
    const skip = (page - 1) * limit;

    // Get total count
    const total = await this.prisma.stockMovement.count({
      where: { productId },
    });

    // Total balance = sum of ALL movements for this product
    const totalAgg = await this.prisma.stockMovement.aggregate({
      where: { productId },
      _sum: { quantity: true },
    });
    const totalBalance = totalAgg._sum.quantity || 0;

    // Sum of skipped (more recent) movements for pagination
    let sumOfSkipped = 0;
    if (skip > 0) {
      const skipped = await this.prisma.stockMovement.findMany({
        where: { productId },
        orderBy: { createdAt: 'desc' },
        take: skip,
        select: { quantity: true },
      });
      sumOfSkipped = skipped.reduce((sum, m) => sum + m.quantity, 0);
    }

    // Fetch the page's movements (newest first)
    const movements = await this.prisma.stockMovement.findMany({
      where: { productId },
      include: {
        warehouse: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    });

    // Compute running balance for each row (descending order)
    let runningBalance = totalBalance - sumOfSkipped;
    const data = movements.map((m) => {
      const stockAfter = runningBalance;
      runningBalance -= m.quantity;
      return {
        ...m,
        stockAfter,
      };
    });

    // Compute totals for this page
    const totalEntries = movements
      .filter((m) => m.quantity > 0)
      .reduce((s, m) => s + m.quantity, 0);
    const totalExits = movements
      .filter((m) => m.quantity < 0)
      .reduce((s, m) => s + Math.abs(m.quantity), 0);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        balanceBefore: totalBalance - sumOfSkipped,
        totalEntries,
        totalExits,
      },
    };
  }
}
