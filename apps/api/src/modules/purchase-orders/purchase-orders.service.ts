import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { ProcessPurchaseBillDto } from './dto/receive-purchase-order.dto';
import { IvaType, PurchaseStatus } from '@prisma/client';

const IVA_MULTIPLIERS: Record<IvaType, number> = {
  EXEMPT: 1,
  REDUCED: 1.08,
  GENERAL: 1.16,
  SPECIAL: 1.31,
};

const IVA_RATES: Record<IvaType, number> = {
  EXEMPT: 0,
  REDUCED: 0.08,
  GENERAL: 0.16,
  SPECIAL: 0.31,
};

const round2 = (n: number) => Math.round(n * 100) / 100;

@Injectable()
export class PurchaseOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  private async generatePurchaseNumber(tx: any): Promise<{ purchaseNumber: number; number: string }> {
    const result = await tx.$queryRaw<{ max: number | null }[]>`
      SELECT MAX("purchaseNumber") as max FROM "PurchaseOrder" FOR UPDATE
    `;
    const next = (result[0]?.max || 0) + 1;
    const number = `FC-${next.toString().padStart(5, '0')}`;
    return { purchaseNumber: next, number };
  }

  private async getTodayRate() {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const rate = await this.prisma.exchangeRate.findUnique({ where: { date: today } });
    return rate?.rate || 0;
  }

  private async getRateForDate(date: Date) {
    const rateDate = new Date(date);
    rateDate.setUTCHours(0, 0, 0, 0);
    const rate = await this.prisma.exchangeRate.findUnique({ where: { date: rateDate } });
    return rate?.rate || 0;
  }

  private calculateItemValues(costUsd: number, quantity: number, discountPct: number, exchangeRate: number) {
    const discountUsd = round2(costUsd * (discountPct / 100));
    const discountBs = round2(discountUsd * exchangeRate);
    const netCostUsd = round2(costUsd - discountUsd);
    const netCostBs = round2(netCostUsd * exchangeRate);
    const totalUsd = round2(netCostUsd * quantity);
    const totalBs = round2(totalUsd * exchangeRate);
    const costBs = round2(costUsd * exchangeRate);
    return { costBs, discountUsd, discountBs, netCostUsd, netCostBs, totalUsd, totalBs };
  }

  private async calculateFiscalTotals(
    items: Array<{ productId: string; quantity: number; netCostUsd: number; totalUsd: number }>,
    discountGlobalPct: number,
    surchargeUsd: number,
    exchangeRate: number,
    prismaClient: any,
  ) {
    const productIds = items.map((i) => i.productId);
    const products = await prismaClient.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, ivaType: true },
    });
    const ivaMap = new Map<string, IvaType>(products.map((p: any) => [p.id, p.ivaType as IvaType]));

    const subtotalUsd = round2(items.reduce((sum, i) => sum + i.totalUsd, 0));
    const discountGlobalUsd = round2(subtotalUsd * (discountGlobalPct / 100));
    const subtotalAfterDiscountUsd = round2(subtotalUsd - discountGlobalUsd);

    let exemptAmountUsd = 0;
    let taxableBaseUsd = 0;
    let totalIvaUsd = 0;

    for (const item of items) {
      const ivaType: IvaType = ivaMap.get(item.productId) || 'GENERAL';
      const ivaRate = IVA_RATES[ivaType] || 0;
      const proportion = subtotalUsd > 0 ? item.totalUsd / subtotalUsd : 0;
      const itemDiscountedTotal = round2(item.totalUsd - discountGlobalUsd * proportion);

      if (ivaType === 'EXEMPT') {
        exemptAmountUsd += itemDiscountedTotal;
      } else {
        taxableBaseUsd += itemDiscountedTotal;
        totalIvaUsd += round2(itemDiscountedTotal * ivaRate);
      }
    }

    const totalSurchargeUsd = surchargeUsd;
    const totalUsd = round2(subtotalAfterDiscountUsd + totalIvaUsd + totalSurchargeUsd);

    return {
      subtotalUsd: round2(subtotalUsd),
      subtotalBs: round2(subtotalUsd * exchangeRate),
      discountGlobalUsd: round2(discountGlobalUsd),
      discountGlobalBs: round2(discountGlobalUsd * exchangeRate),
      exemptAmountUsd: round2(exemptAmountUsd),
      exemptAmountBs: round2(exemptAmountUsd * exchangeRate),
      taxableBaseUsd: round2(taxableBaseUsd),
      taxableBaseBs: round2(taxableBaseUsd * exchangeRate),
      totalIvaUsd: round2(totalIvaUsd),
      totalIvaBs: round2(totalIvaUsd * exchangeRate),
      totalSurchargeUsd: round2(totalSurchargeUsd),
      totalSurchargeBs: round2(totalSurchargeUsd * exchangeRate),
      totalUsd: round2(totalUsd),
      totalBs: round2(totalUsd * exchangeRate),
    };
  }

  private readonly includeDetail = {
    supplier: true,
    responsible: { select: { id: true, name: true } },
    warehouse: { select: { id: true, name: true } },
    items: {
      include: {
        product: {
          select: { id: true, code: true, name: true, costUsd: true, priceDetal: true, priceMayor: true, isService: true, gananciaPct: true, gananciaMayorPct: true, ivaType: true, bregaApplies: true },
        },
      },
    },
  };

  async create(dto: CreatePurchaseOrderDto, userId: string) {
    const currency = dto.currency || 'USD';
    const rate = dto.exchangeRate || (await this.getTodayRate()) || 1;
    const surchargeUsd = dto.surchargeUsd || 0;
    const surchargeDistribution = dto.surchargeDistribution || 'PROPORTIONAL';
    const discountGlobalPct = dto.discountGlobalPct || 0;

    return this.prisma.$transaction(async (tx) => {
      const { purchaseNumber, number } = await this.generatePurchaseNumber(tx);

      // Build items with discount calculations
      const items = dto.items.map((item) => {
        let costUsd = currency === 'BS' ? round2(item.costUsd / rate) : item.costUsd;
        const discountPct = item.discountPct || 0;
        const calc = this.calculateItemValues(costUsd, item.quantity, discountPct, rate);
        return {
          productId: item.productId,
          quantity: item.quantity,
          costUsd,
          costBs: calc.costBs,
          discountPct,
          discountUsd: calc.discountUsd,
          discountBs: calc.discountBs,
          netCostUsd: calc.netCostUsd,
          netCostBs: calc.netCostBs,
          totalUsd: calc.totalUsd,
          totalBs: calc.totalBs,
        };
      });

      // Distribute surcharge among non-service items
      if (surchargeUsd > 0) {
        const products = await tx.product.findMany({
          where: { id: { in: items.map((i) => i.productId) } },
          select: { id: true, isService: true },
        });
        const serviceIds = new Set(products.filter((p: any) => p.isService).map((p: any) => p.id));
        const nonServiceItems = items.filter((i) => !serviceIds.has(i.productId));
        const totalNonServiceUsd = nonServiceItems.reduce((sum, i) => sum + i.totalUsd, 0);

        for (const item of nonServiceItems) {
          const share = surchargeDistribution === 'PROPORTIONAL'
            ? totalNonServiceUsd > 0 ? (item.totalUsd / totalNonServiceUsd) * surchargeUsd : 0
            : surchargeUsd / nonServiceItems.length;
          const perUnit = round2(share / item.quantity);
          item.costUsd = round2(item.costUsd + perUnit);
          item.costBs = round2(item.costUsd * rate);
          const calc = this.calculateItemValues(item.costUsd, item.quantity, item.discountPct, rate);
          item.netCostUsd = calc.netCostUsd;
          item.netCostBs = calc.netCostBs;
          item.totalUsd = calc.totalUsd;
          item.totalBs = calc.totalBs;
        }
      }

      // Calculate fiscal totals
      const fiscal = await this.calculateFiscalTotals(
        items.map((i) => ({ productId: i.productId, quantity: i.quantity, netCostUsd: i.netCostUsd, totalUsd: i.totalUsd })),
        discountGlobalPct,
        surchargeUsd,
        rate,
        tx,
      );

      // Calculate ISLR if applicable
      let islrRetentionPct: number | null = null;
      let islrRetentionUsd: number | null = null;
      let islrRetentionBs: number | null = null;

      if (dto.applyIslr && dto.islrRetentionPct != null && dto.islrRetentionPct > 0) {
        islrRetentionPct = dto.islrRetentionPct;
        islrRetentionUsd = round2(fiscal.subtotalUsd * (islrRetentionPct / 100));
        islrRetentionBs = round2(islrRetentionUsd * rate);
      }

      return tx.purchaseOrder.create({
        data: {
          number,
          purchaseNumber,
          supplierId: dto.supplierId,
          supplierSerialNumber: dto.supplierSerialNumber || null,
          supplierControlNumber: dto.supplierControlNumber || null,
          supplierInvoiceNumber: dto.supplierInvoiceNumber || null,
          invoiceDate: dto.invoiceDate ? new Date(dto.invoiceDate) : new Date(),
          receivedDate: dto.receivedDate ? new Date(dto.receivedDate) : null,
          currency,
          exchangeRate: rate,
          warehouseId: dto.warehouseId || null,
          isCredit: dto.isCredit || false,
          creditDays: dto.creditDays || 0,
          discountGlobalPct,
          discountGlobalUsd: fiscal.discountGlobalUsd,
          discountGlobalBs: fiscal.discountGlobalBs,
          surchargeUsd,
          surchargeDistribution,
          totalSurchargeUsd: fiscal.totalSurchargeUsd,
          totalSurchargeBs: fiscal.totalSurchargeBs,
          subtotalUsd: fiscal.subtotalUsd,
          subtotalBs: fiscal.subtotalBs,
          exemptAmountUsd: fiscal.exemptAmountUsd,
          exemptAmountBs: fiscal.exemptAmountBs,
          taxableBaseUsd: fiscal.taxableBaseUsd,
          taxableBaseBs: fiscal.taxableBaseBs,
          totalIvaUsd: fiscal.totalIvaUsd,
          totalIvaBs: fiscal.totalIvaBs,
          totalUsd: fiscal.totalUsd,
          totalBs: fiscal.totalBs,
          totalWithSurchargeUsd: fiscal.totalUsd,
          islrRetentionPct,
          islrRetentionUsd,
          islrRetentionBs,
          retentionVoucherNumber: dto.retentionVoucherNumber || null,
          notes: dto.notes || null,
          responsibleId: userId,
          createdById: userId,
          items: { create: items },
        },
        include: this.includeDetail,
      });
    });
  }

  async findAll(filters: {
    supplierId?: string;
    status?: PurchaseStatus;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }) {
    const { supplierId, status, from, to, page = 1, limit = 20 } = filters;
    const skip = (page - 1) * limit;
    const where: any = {};

    if (supplierId) where.supplierId = supplierId;
    if (status) where.status = status;

    if (from || to) {
      where.invoiceDate = {};
      if (from) {
        const fromDate = new Date(from);
        fromDate.setUTCHours(0, 0, 0, 0);
        where.invoiceDate.gte = fromDate;
      }
      if (to) {
        const toDate = new Date(to);
        toDate.setUTCHours(23, 59, 59, 999);
        where.invoiceDate.lte = toDate;
      }
    }

    const [data, total] = await Promise.all([
      this.prisma.purchaseOrder.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          supplier: { select: { id: true, name: true } },
          responsible: { select: { id: true, name: true } },
          items: { include: { product: { select: { id: true, code: true, name: true, isService: true } } } },
          payables: { select: { retentionUsd: true } },
        },
      }),
      this.prisma.purchaseOrder.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    const order = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: this.includeDetail,
    });
    if (!order) throw new NotFoundException('Factura de compra no encontrada');
    return order;
  }

  async update(id: string, dto: Partial<CreatePurchaseOrderDto>) {
    const order = await this.findOne(id);
    if (order.status !== 'PENDING') {
      throw new BadRequestException('Solo se pueden editar facturas en estado PENDIENTE');
    }

    const updateData: any = {};
    if (dto.supplierId) updateData.supplierId = dto.supplierId;
    if (dto.notes !== undefined) updateData.notes = dto.notes;
    if (dto.supplierControlNumber !== undefined) updateData.supplierControlNumber = dto.supplierControlNumber || null;
    if (dto.supplierSerialNumber !== undefined) updateData.supplierSerialNumber = dto.supplierSerialNumber || null;
    if (dto.supplierInvoiceNumber !== undefined) updateData.supplierInvoiceNumber = dto.supplierInvoiceNumber || null;
    if (dto.isCredit !== undefined) updateData.isCredit = dto.isCredit;
    if (dto.creditDays !== undefined) updateData.creditDays = dto.creditDays;
    if (dto.invoiceDate !== undefined) updateData.invoiceDate = dto.invoiceDate ? new Date(dto.invoiceDate) : null;
    if (dto.receivedDate !== undefined) updateData.receivedDate = dto.receivedDate ? new Date(dto.receivedDate) : null;
    if (dto.currency !== undefined) updateData.currency = dto.currency;
    if (dto.warehouseId !== undefined) updateData.warehouseId = dto.warehouseId || null;
    if (dto.surchargeUsd !== undefined) updateData.surchargeUsd = dto.surchargeUsd;
    if (dto.surchargeDistribution !== undefined) updateData.surchargeDistribution = dto.surchargeDistribution;
    if (dto.discountGlobalPct !== undefined) updateData.discountGlobalPct = dto.discountGlobalPct;
    if (dto.retentionVoucherNumber !== undefined) updateData.retentionVoucherNumber = dto.retentionVoucherNumber || null;

    if (dto.items) {
      const currency = dto.currency || order.currency || 'USD';
      const rate = dto.exchangeRate || order.exchangeRate || (await this.getTodayRate()) || 1;
      const surchargeUsd = dto.surchargeUsd ?? order.surchargeUsd ?? 0;
      const surchargeDistribution = dto.surchargeDistribution || order.surchargeDistribution || 'PROPORTIONAL';
      const discountGlobalPct = dto.discountGlobalPct ?? order.discountGlobalPct ?? 0;

      await this.prisma.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: id } });

      const items = dto.items.map((item) => {
        const costUsd = currency === 'BS' ? round2(item.costUsd / rate) : item.costUsd;
        const discountPct = item.discountPct || 0;
        const calc = this.calculateItemValues(costUsd, item.quantity, discountPct, rate);
        return {
          purchaseOrderId: id,
          productId: item.productId,
          quantity: item.quantity,
          costUsd,
          costBs: calc.costBs,
          discountPct,
          discountUsd: calc.discountUsd,
          discountBs: calc.discountBs,
          netCostUsd: calc.netCostUsd,
          netCostBs: calc.netCostBs,
          totalUsd: calc.totalUsd,
          totalBs: calc.totalBs,
        };
      });

      // Distribute surcharge
      if (surchargeUsd > 0) {
        const products = await this.prisma.product.findMany({
          where: { id: { in: items.map((i) => i.productId) } },
          select: { id: true, isService: true },
        });
        const serviceIds = new Set(products.filter((p) => p.isService).map((p) => p.id));
        const nonServiceItems = items.filter((i) => !serviceIds.has(i.productId));
        const totalNonServiceUsd = nonServiceItems.reduce((sum, i) => sum + i.totalUsd, 0);

        for (const item of nonServiceItems) {
          const share = surchargeDistribution === 'PROPORTIONAL'
            ? totalNonServiceUsd > 0 ? (item.totalUsd / totalNonServiceUsd) * surchargeUsd : 0
            : surchargeUsd / nonServiceItems.length;
          const perUnit = round2(share / item.quantity);
          item.costUsd = round2(item.costUsd + perUnit);
          item.costBs = round2(item.costUsd * rate);
          const calc = this.calculateItemValues(item.costUsd, item.quantity, item.discountPct, rate);
          item.netCostUsd = calc.netCostUsd;
          item.netCostBs = calc.netCostBs;
          item.totalUsd = calc.totalUsd;
          item.totalBs = calc.totalBs;
        }
      }

      await this.prisma.purchaseOrderItem.createMany({ data: items });

      const fiscal = await this.calculateFiscalTotals(
        items.map((i) => ({ productId: i.productId, quantity: i.quantity, netCostUsd: i.netCostUsd, totalUsd: i.totalUsd })),
        discountGlobalPct,
        surchargeUsd,
        rate,
        this.prisma,
      );

      Object.assign(updateData, {
        subtotalUsd: fiscal.subtotalUsd,
        subtotalBs: fiscal.subtotalBs,
        discountGlobalUsd: fiscal.discountGlobalUsd,
        discountGlobalBs: fiscal.discountGlobalBs,
        exemptAmountUsd: fiscal.exemptAmountUsd,
        exemptAmountBs: fiscal.exemptAmountBs,
        taxableBaseUsd: fiscal.taxableBaseUsd,
        taxableBaseBs: fiscal.taxableBaseBs,
        totalIvaUsd: fiscal.totalIvaUsd,
        totalIvaBs: fiscal.totalIvaBs,
        totalSurchargeUsd: fiscal.totalSurchargeUsd,
        totalSurchargeBs: fiscal.totalSurchargeBs,
        totalUsd: fiscal.totalUsd,
        totalBs: fiscal.totalBs,
        totalWithSurchargeUsd: fiscal.totalUsd,
        exchangeRate: rate,
      });
    }

    if (dto.exchangeRate !== undefined) updateData.exchangeRate = dto.exchangeRate;

    // Recalculate ISLR if applicable
    if (dto.applyIslr !== undefined) {
      if (dto.applyIslr && dto.islrRetentionPct != null && dto.islrRetentionPct > 0) {
        const total = updateData.subtotalUsd ?? order.subtotalUsd;
        updateData.islrRetentionPct = dto.islrRetentionPct;
        updateData.islrRetentionUsd = round2(total * (dto.islrRetentionPct / 100));
        updateData.islrRetentionBs = round2(updateData.islrRetentionUsd * (updateData.exchangeRate || order.exchangeRate));
      } else {
        updateData.islrRetentionPct = null;
        updateData.islrRetentionUsd = null;
        updateData.islrRetentionBs = null;
      }
    }

    return this.prisma.purchaseOrder.update({
      where: { id },
      data: updateData,
      include: this.includeDetail,
    });
  }

  async cancel(id: string) {
    const order = await this.findOne(id);
    if (order.status !== 'PENDING') {
      throw new BadRequestException('Solo se pueden cancelar facturas en estado PENDIENTE');
    }

    return this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: 'CANCELLED' },
      include: this.includeDetail,
    });
  }

  async process(id: string, dto: ProcessPurchaseBillDto, userId: string) {
    const order = await this.findOne(id);
    if (order.status !== 'PENDING') {
      throw new BadRequestException('Solo se pueden procesar facturas en estado PENDIENTE');
    }

    const config = await this.prisma.companyConfig.findUnique({ where: { id: 'singleton' } });
    const bregaGlobalPct = config?.bregaGlobalPct || 0;

    const warehouseId = order.warehouseId;
    if (!warehouseId) {
      throw new BadRequestException('La factura no tiene almacén asignado. Edite la factura y seleccione un almacén.');
    }

    const processedAt = new Date();

    return this.prisma.$transaction(async (tx) => {
      // Process inventory for non-service items
      for (const item of order.items) {
        if (item.product.isService) continue;

        // Update stock
        await tx.stock.upsert({
          where: {
            productId_warehouseId: {
              productId: item.productId,
              warehouseId,
            },
          },
          create: { productId: item.productId, warehouseId, quantity: item.quantity },
          update: { quantity: { increment: item.quantity } },
        });

        // Calculate stockAfter
        const allStock = await tx.stock.findMany({ where: { productId: item.productId } });
        const stockAfter = allStock.reduce((sum, s) => sum + s.quantity, 0);

        // Update product cost and prices
        const product = await tx.product.findUnique({ where: { id: item.productId } });
        if (product) {
          const newCost = item.netCostUsd;
          const bregaPct = product.bregaApplies ? bregaGlobalPct : 0;
          const ivaMultiplier = IVA_MULTIPLIERS[product.ivaType];

          const priceDetal = round2(newCost * (1 + bregaPct / 100) * (1 + product.gananciaPct / 100) * ivaMultiplier);
          const priceMayor = round2(newCost * (1 + bregaPct / 100) * (1 + product.gananciaMayorPct / 100) * ivaMultiplier);

          await tx.product.update({
            where: { id: item.productId },
            data: { costUsd: newCost, priceDetal, priceMayor },
          });
        }

        // Create StockMovement
        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            warehouseId,
            type: 'PURCHASE',
            quantity: item.quantity,
            costUsd: item.netCostUsd,
            stockAfter,
            reference: order.number,
            createdById: userId,
            createdAt: processedAt,
          },
        });
      }

      // Apply custom price updates if provided
      if (dto.priceUpdates && dto.priceUpdates.length > 0) {
        for (const pu of dto.priceUpdates) {
          const product = await tx.product.findUnique({ where: { id: pu.productId } });
          if (!product) continue;
          const bregaPct = product.bregaApplies ? bregaGlobalPct : 0;
          const ivaMultiplier = IVA_MULTIPLIERS[product.ivaType];
          const priceDetal = round2(product.costUsd * (1 + bregaPct / 100) * (1 + pu.gananciaPct / 100) * ivaMultiplier);
          const priceMayor = round2(product.costUsd * (1 + bregaPct / 100) * (1 + pu.gananciaMayorPct / 100) * ivaMultiplier);
          await tx.product.update({
            where: { id: pu.productId },
            data: { gananciaPct: pu.gananciaPct, gananciaMayorPct: pu.gananciaMayorPct, priceDetal, priceMayor },
          });
        }
      }

      // Create Payable if credit
      if (order.isCredit) {
        const exchangeRate = order.exchangeRate;
        const amountUsd = order.totalUsd;
        const amountBs = round2(amountUsd * exchangeRate);

        let retentionUsd = 0;
        let retentionBs = 0;

        // Calculate IVA retention if supplier is retention agent
        if (order.supplier.isRetentionAgent) {
          const ivaRetentionPct = config?.ivaRetentionPct || 75;
          retentionUsd = round2(order.totalIvaUsd * (ivaRetentionPct / 100));
          retentionBs = round2(retentionUsd * exchangeRate);
        }

        let islrRetUsd = 0;
        if (order.islrRetentionPct && order.islrRetentionPct > 0) {
          islrRetUsd = round2(amountUsd * (order.islrRetentionPct / 100));
          const islrRetBs = round2(islrRetUsd * exchangeRate);
          await tx.purchaseOrder.update({
            where: { id },
            data: { islrRetentionUsd: islrRetUsd, islrRetentionBs: islrRetBs },
          });
        }

        const netPayableUsd = round2(amountUsd - retentionUsd - islrRetUsd);
        const netPayableBs = round2(netPayableUsd * exchangeRate);

        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + (order.creditDays || 0));

        await tx.payable.create({
          data: {
            supplierId: order.supplierId,
            purchaseOrderId: order.id,
            amountUsd,
            amountBs,
            exchangeRate,
            retentionUsd,
            retentionBs,
            netPayableUsd,
            netPayableBs,
            dueDate: order.creditDays > 0 ? dueDate : null,
            notes: `CxP generada de factura ${order.number}`,
          },
        });
      }

      // Update order status
      const updatedOrder = await tx.purchaseOrder.update({
        where: { id },
        data: {
          status: 'PROCESSED',
          processedAt,
          receivedAt: processedAt,
          responsibleId: userId,
        },
        include: this.includeDetail,
      });

      return updatedOrder;
    });
  }

  async getSuggestedPrices(id: string) {
    const order = await this.findOne(id);
    const config = await this.prisma.companyConfig.findUnique({ where: { id: 'singleton' } });
    const bregaGlobalPct = config?.bregaGlobalPct || 0;

    return order.items
      .filter((item) => !item.product.isService)
      .map((item) => {
        const product = item.product;
        const bregaPct = product.bregaApplies ? bregaGlobalPct : 0;
        const ivaMultiplier = IVA_MULTIPLIERS[product.ivaType];
        const newCost = item.netCostUsd;

        const suggestedPriceDetal = round2(newCost * (1 + bregaPct / 100) * (1 + product.gananciaPct / 100) * ivaMultiplier);
        const suggestedPriceMayor = round2(newCost * (1 + bregaPct / 100) * (1 + product.gananciaMayorPct / 100) * ivaMultiplier);

        return {
          productId: product.id,
          productCode: product.code,
          productName: product.name,
          currentCostUsd: product.costUsd,
          newCostUsd: newCost,
          currentGananciaPct: product.gananciaPct,
          currentGananciaMayorPct: product.gananciaMayorPct,
          currentPriceDetal: product.priceDetal,
          suggestedPriceDetal,
          currentPriceMayor: product.priceMayor,
          suggestedPriceMayor,
          bregaPct,
          ivaMultiplier,
          ivaType: product.ivaType,
        };
      });
  }

  async updatePrices(id: string, items: { productId: string; gananciaPct: number; gananciaMayorPct: number }[]) {
    const order = await this.findOne(id);
    if (order.status !== 'PROCESSED') {
      throw new BadRequestException('Solo se pueden actualizar precios de facturas PROCESADAS');
    }

    const config = await this.prisma.companyConfig.findUnique({ where: { id: 'singleton' } });
    const bregaGlobalPct = config?.bregaGlobalPct || 0;

    return this.prisma.$transaction(async (tx) => {
      const results: any[] = [];

      for (const item of items) {
        const product = await tx.product.findUnique({ where: { id: item.productId } });
        if (!product) continue;

        const bregaPct = product.bregaApplies ? bregaGlobalPct : 0;
        const ivaMultiplier = IVA_MULTIPLIERS[product.ivaType];

        const priceDetal = round2(product.costUsd * (1 + bregaPct / 100) * (1 + item.gananciaPct / 100) * ivaMultiplier);
        const priceMayor = round2(product.costUsd * (1 + bregaPct / 100) * (1 + item.gananciaMayorPct / 100) * ivaMultiplier);

        const updated = await tx.product.update({
          where: { id: item.productId },
          data: { gananciaPct: item.gananciaPct, gananciaMayorPct: item.gananciaMayorPct, priceDetal, priceMayor },
        });

        results.push({
          productId: updated.id, code: updated.code, name: updated.name,
          gananciaPct: updated.gananciaPct, gananciaMayorPct: updated.gananciaMayorPct,
          priceDetal: updated.priceDetal, priceMayor: updated.priceMayor,
        });
      }
      return results;
    });
  }

  async getReorderSuggestions() {
    const suggestions = await this.prisma.$queryRaw<any[]>`
      SELECT
        p.id, p.code, p.name, p."categoryId", p."supplierId", p."minStock", p."costUsd",
        c.name as "categoryName", s2.name as "supplierName",
        COALESCE(stock_sum.total, 0) as "currentStock"
      FROM "Product" p
      LEFT JOIN (SELECT "productId", SUM(quantity) as total FROM "Stock" GROUP BY "productId") stock_sum ON stock_sum."productId" = p.id
      LEFT JOIN "Category" c ON c.id = p."categoryId"
      LEFT JOIN "Supplier" s2 ON s2.id = p."supplierId"
      WHERE p."isActive" = true AND p."minStock" > 0 AND COALESCE(stock_sum.total, 0) <= p."minStock"
      ORDER BY CASE WHEN COALESCE(stock_sum.total, 0) = 0 THEN 0 ELSE 1 END ASC,
        (COALESCE(stock_sum.total, 0) / NULLIF(p."minStock", 0)) ASC
    `;

    return suggestions.map((s) => ({
      id: s.id, code: s.code, name: s.name, categoryName: s.categoryName,
      supplierId: s.supplierId, supplierName: s.supplierName,
      currentStock: Number(s.currentStock), minStock: Number(s.minStock),
      difference: Number(s.currentStock) - Number(s.minStock), lastCostUsd: Number(s.costUsd),
    }));
  }
}
