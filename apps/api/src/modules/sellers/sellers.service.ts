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
        // Include returned invoices so the seller keeps commission on what the
        // customer DID keep; returned quantities are netted out below.
        status: { in: ['PAID', 'PARTIAL_RETURN', 'RETURNED'] },
        paidAt: { gte: fromDate, lte: toDate },
      },
      include: {
        items: {
          include: {
            invoice: false,
          },
        },
        customer: { select: { id: true, name: true, isGroupCompany: true } },
        serie: { select: { isFiscal: true } },
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
        ivaNotasUsd: number;
      }
    > = {};

    let totalSoldUsd = 0;
    let totalCommissionUsd = 0;
    let totalIvaNotasUsd = 0;
    let totalGroupSoldUsd = 0;
    let groupInvoiceCount = 0;
    let commissionableCount = 0;

    for (const invoice of invoices) {
      // Facturas a empresas del grupo: se reflejan en la lista pero NO comisionan
      const isGroup = invoice.customer?.isGroupCompany === true;
      if (isGroup) {
        groupInvoiceCount += 1;
        for (const item of invoice.items) {
          const netQty = item.quantity - (item.returnedQty || 0);
          const netRatio = item.quantity > 0 ? netQty / item.quantity : 0;
          totalGroupSoldUsd += item.totalUsd * netRatio;
        }
        continue;
      }

      // Serie no fiscal => el IVA de las notas se le suma al vendedor
      const isNonFiscal = invoice.serie != null && !invoice.serie.isFiscal;

      let invoiceHasNetSale = false;
      for (const item of invoice.items) {
        // Net out returned units so commission reflects what the customer kept.
        // returnedQty == quantity (factura RETURNED) => netQty 0 => no comisiona.
        const netQty = item.quantity - (item.returnedQty || 0);
        if (netQty <= 0) continue;
        invoiceHasNetSale = true;
        const netRatio = item.quantity > 0 ? netQty / item.quantity : 0;

        const product = productMap.get(item.productId);
        const categoryId = product?.categoryId || 'sin-categoria';
        const categoryName = product?.category?.name || 'Sin categoria';
        const commissionPct = product?.category?.commissionPct || 0;

        const baseUsd = item.unitPriceWithoutIva * netQty;
        // En series no fiscales el IVA es parte de la ganancia: se suma a la base
        // de comision. La comision se calcula sobre (base + IVA notas) x %.
        const ivaNotasUsd = isNonFiscal ? item.ivaAmount * netRatio : 0;
        const commissionUsd = (baseUsd + ivaNotasUsd) * (commissionPct / 100);

        totalSoldUsd += item.totalUsd * netRatio;
        totalCommissionUsd += commissionUsd;
        totalIvaNotasUsd += ivaNotasUsd;

        if (!categoryBreakdown[categoryId]) {
          categoryBreakdown[categoryId] = {
            categoryName,
            units: 0,
            baseUsd: 0,
            commissionPct,
            commissionUsd: 0,
            ivaNotasUsd: 0,
          };
        }
        categoryBreakdown[categoryId].units += netQty;
        categoryBreakdown[categoryId].baseUsd += baseUsd;
        categoryBreakdown[categoryId].commissionUsd += commissionUsd;
        categoryBreakdown[categoryId].ivaNotasUsd += ivaNotasUsd;
      }
      // Solo cuenta la factura si quedo algo vendido (no totalmente devuelta).
      if (invoiceHasNetSale) commissionableCount += 1;
    }

    // Round values
    const categories = Object.values(categoryBreakdown).map((c) => ({
      ...c,
      baseUsd: Math.round(c.baseUsd * 100) / 100,
      commissionUsd: Math.round(c.commissionUsd * 100) / 100,
      ivaNotasUsd: Math.round(c.ivaNotasUsd * 100) / 100,
    }));

    return {
      sellerId,
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
      invoiceCount: commissionableCount,
      totalSoldUsd: Math.round(totalSoldUsd * 100) / 100,
      totalCommissionUsd: Math.round(totalCommissionUsd * 100) / 100,
      totalIvaNotasUsd: Math.round(totalIvaNotasUsd * 100) / 100,
      totalGroupSoldUsd: Math.round(totalGroupSoldUsd * 100) / 100,
      groupInvoiceCount,
      categories,
      invoices: invoices
        // Ocultar facturas totalmente devueltas (sin venta neta) del listado.
        .filter((inv) => inv.items.some((it) => it.quantity - (it.returnedQty || 0) > 0))
        .map((inv) => ({
          id: inv.id,
          number: inv.number,
          customer: inv.customer,
          totalUsd: inv.totalUsd,
          paidAt: inv.paidAt,
          itemCount: inv.items.length,
          isGroup: inv.customer?.isGroupCompany === true,
        })),
    };
  }

  // Reporte de comisiones de TODOS los vendedores con ventas en el periodo
  async getAllCommissionReports(from: string, to: string) {
    const sellers = await this.prisma.seller.findMany({
      orderBy: { code: 'asc' },
    });

    const reports: any[] = [];
    for (const seller of sellers) {
      const report = await this.getCommissionReport(seller.id, from, to);
      // Solo vendedores con ventas en el periodo (comisionables o del grupo)
      if (report.invoiceCount === 0 && report.groupInvoiceCount === 0) continue;
      reports.push({
        sellerCode: seller.code,
        sellerName: seller.name,
        ...report,
      });
    }

    const r2 = (n: number) => Math.round(n * 100) / 100;
    const grandTotals = {
      totalSoldUsd: r2(reports.reduce((s, r) => s + r.totalSoldUsd, 0)),
      totalCommissionUsd: r2(reports.reduce((s, r) => s + r.totalCommissionUsd, 0)),
      totalIvaNotasUsd: r2(reports.reduce((s, r) => s + r.totalIvaNotasUsd, 0)),
      totalGroupSoldUsd: r2(reports.reduce((s, r) => s + r.totalGroupSoldUsd, 0)),
      invoiceCount: reports.reduce((s, r) => s + r.invoiceCount, 0),
      groupInvoiceCount: reports.reduce((s, r) => s + r.groupInvoiceCount, 0),
      sellerCount: reports.length,
    };

    const fromDate = new Date(from);
    fromDate.setUTCHours(0, 0, 0, 0);
    const toDate = new Date(to);
    toDate.setUTCHours(23, 59, 59, 999);

    return {
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
      sellers: reports,
      grandTotals,
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
