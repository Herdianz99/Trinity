import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class IvaRetentionService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: {
    supplierId?: string;
    purchaseOrderId?: string;
    from?: string;
    to?: string;
    search?: string;
    applied?: string;
    page?: string;
    limit?: string;
  }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.supplierId) where.supplierId = query.supplierId;
    if (query.purchaseOrderId) where.purchaseOrderId = query.purchaseOrderId;

    if (query.applied === 'true') {
      where.appliedAt = { not: null };
    } else if (query.applied === 'false') {
      where.appliedAt = null;
    }

    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) {
        const from = new Date(query.from);
        from.setUTCHours(0, 0, 0, 0);
        where.createdAt.gte = from;
      }
      if (query.to) {
        const to = new Date(query.to);
        to.setUTCHours(23, 59, 59, 999);
        where.createdAt.lte = to;
      }
    }

    if (query.search) {
      where.OR = [
        { number: { contains: query.search, mode: 'insensitive' } },
        { supplier: { name: { contains: query.search, mode: 'insensitive' } } },
        { purchaseOrder: { number: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.ivaRetention.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          supplier: { select: { id: true, name: true, rif: true } },
          purchaseOrder: { select: { id: true, number: true } },
        },
      }),
      this.prisma.ivaRetention.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string) {
    const retention = await this.prisma.ivaRetention.findUnique({
      where: { id },
      include: {
        supplier: { select: { id: true, name: true, rif: true } },
        purchaseOrder: { select: { id: true, number: true } },
        receiptItems: {
          include: {
            receipt: { select: { id: true, number: true, status: true } },
          },
        },
      },
    });
    if (!retention) throw new NotFoundException('Retencion IVA no encontrada');
    return retention;
  }
}
