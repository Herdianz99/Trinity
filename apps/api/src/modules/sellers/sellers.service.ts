import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSellerDto } from './dto/create-seller.dto';

@Injectable()
export class SellersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filters: { isActive?: string; search?: string }) {
    const where: any = {};

    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive === 'true';
    }

    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { code: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.seller.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
      },
      orderBy: { code: 'asc' },
    });
  }

  async findOne(id: string) {
    const seller = await this.prisma.seller.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
      },
    });
    if (!seller) throw new NotFoundException('Vendedor no encontrado');
    return seller;
  }

  async create(dto: CreateSellerDto) {
    const code = await this.generateCode();

    return this.prisma.seller.create({
      data: {
        code,
        name: dto.name,
        phone: dto.phone,
      },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
      },
    });
  }

  async update(id: string, dto: CreateSellerDto) {
    await this.findOne(id);

    return this.prisma.seller.update({
      where: { id },
      data: {
        name: dto.name,
        phone: dto.phone,
      },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
      },
    });
  }

  async toggleActive(id: string) {
    const seller = await this.findOne(id);

    return this.prisma.seller.update({
      where: { id },
      data: { isActive: !seller.isActive },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
      },
    });
  }

  async assignUser(id: string, userId: string | null) {
    await this.findOne(id);

    if (userId) {
      // Check user exists
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user) throw new NotFoundException('Usuario no encontrado');

      // Check user doesn't already have a seller assigned
      const existingSeller = await this.prisma.seller.findUnique({
        where: { userId },
      });
      if (existingSeller && existingSeller.id !== id) {
        throw new BadRequestException(
          `El usuario ya esta vinculado al vendedor ${existingSeller.code}`,
        );
      }
    }

    return this.prisma.seller.update({
      where: { id },
      data: { userId },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
      },
    });
  }

  async getCommissionReport(
    sellerId: string,
    from: string,
    to: string,
  ) {
    await this.findOne(sellerId);

    const fromDate = new Date(from);
    fromDate.setUTCHours(0, 0, 0, 0);
    const toDate = new Date(to);
    toDate.setUTCHours(23, 59, 59, 999);

    const invoices = await this.prisma.invoice.findMany({
      where: {
        sellerId,
        status: 'PAID',
        paidAt: { gte: fromDate, lte: toDate },
      },
      include: {
        items: {
          include: {
            invoice: false,
          },
        },
        customer: { select: { id: true, name: true } },
      },
      orderBy: { paidAt: 'asc' },
    });

    // Get product categories for commission calculation
    const productIds = [
      ...new Set(invoices.flatMap((inv) => inv.items.map((item) => item.productId))),
    ];
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      include: {
        category: { select: { id: true, name: true, commissionPct: true } },
      },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    // Build category breakdown
    const categoryBreakdown: Record<
      string,
      {
        categoryName: string;
        units: number;
        baseUsd: number;
        commissionPct: number;
        commissionUsd: number;
      }
    > = {};

    let totalSoldUsd = 0;
    let totalCommissionUsd = 0;

    for (const invoice of invoices) {
      for (const item of invoice.items) {
        const product = productMap.get(item.productId);
        const categoryId = product?.categoryId || 'sin-categoria';
        const categoryName = product?.category?.name || 'Sin categoria';
        const commissionPct = product?.category?.commissionPct || 0;

        const baseUsd = item.unitPriceWithoutIva * item.quantity;
        const commissionUsd = baseUsd * (commissionPct / 100);

        totalSoldUsd += item.totalUsd;
        totalCommissionUsd += commissionUsd;

        if (!categoryBreakdown[categoryId]) {
          categoryBreakdown[categoryId] = {
            categoryName,
            units: 0,
            baseUsd: 0,
            commissionPct,
            commissionUsd: 0,
          };
        }
        categoryBreakdown[categoryId].units += item.quantity;
        categoryBreakdown[categoryId].baseUsd += baseUsd;
        categoryBreakdown[categoryId].commissionUsd += commissionUsd;
      }
    }

    // Round values
    const categories = Object.values(categoryBreakdown).map((c) => ({
      ...c,
      baseUsd: Math.round(c.baseUsd * 100) / 100,
      commissionUsd: Math.round(c.commissionUsd * 100) / 100,
    }));

    return {
      sellerId,
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
      invoiceCount: invoices.length,
      totalSoldUsd: Math.round(totalSoldUsd * 100) / 100,
      totalCommissionUsd: Math.round(totalCommissionUsd * 100) / 100,
      categories,
      invoices: invoices.map((inv) => ({
        id: inv.id,
        number: inv.number,
        customer: inv.customer,
        totalUsd: inv.totalUsd,
        paidAt: inv.paidAt,
        itemCount: inv.items.length,
      })),
    };
  }

  private async generateCode(): Promise<string> {
    const lastSeller = await this.prisma.seller.findFirst({
      orderBy: { code: 'desc' },
    });

    let nextNumber = 1;
    if (lastSeller) {
      const match = lastSeller.code.match(/VEN-(\d+)/);
      if (match) {
        nextNumber = parseInt(match[1], 10) + 1;
      }
    }

    return `VEN-${nextNumber.toString().padStart(3, '0')}`;
  }
}
