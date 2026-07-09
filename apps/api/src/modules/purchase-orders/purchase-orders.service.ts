import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { ProcessPurchaseBillDto } from './dto/receive-purchase-order.dto';
import { IvaType, PurchaseStatus } from '@prisma/client';
import { caracasDateKey } from '../../common/timezone';

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
// Costos UNITARIOS: 6 decimales (para articulos de costo muy bajo, ej. 0.0233 por unidad).
// Los TOTALES de linea/factura siguen en round2 (dinero real).
const round6 = (n: number) => Math.round(n * 1000000) / 1000000;

@Injectable()
export class PurchaseOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  private async generatePurchaseNumber(tx: any): Promise<{ purchaseNumber: number; number: string }> {
    const result = await tx.$queryRaw<{ max: number | null }[]>`
      SELECT MAX("purchaseNumber") as max FROM (
        SELECT "purchaseNumber" FROM "PurchaseOrder" FOR UPDATE
      ) sub
    `;
    const next = (result[0]?.max || 0) + 1;
    const number = `FC-${next.toString().padStart(5, '0')}`;
    return { purchaseNumber: next, number };
  }

  private async getTodayRate() {
    const today = caracasDateKey();
    const rate = await this.prisma.exchangeRate.findUnique({ where: { date: today } });
    return rate?.rate || 0;
  }

  private async getRateForDate(date: Date) {
    const rateDate = caracasDateKey(date);
    const rate = await this.prisma.exchangeRate.findUnique({ where: { date: rateDate } });
    return rate?.rate || 0;
  }

  private calculateItemValues(costInput: number, quantity: number, discountPct: number, exchangeRate: number, currency: 'USD' | 'BS' = 'USD') {
    if (currency === 'BS') {
      const costBs = round6(costInput);
      const costUsd = round6(costBs / exchangeRate);
      const discountBs = round6(costBs * (discountPct / 100));
      const discountUsd = round6(discountBs / exchangeRate);
      const netCostBs = round6(costBs - discountBs);
      const netCostUsd = round6(netCostBs / exchangeRate);
      const totalBs = round2(netCostBs * quantity);
      const totalUsd = round2(totalBs / exchangeRate);
      return { costUsd, costBs, discountUsd, discountBs, netCostUsd, netCostBs, totalUsd, totalBs };
    }
    const costUsd = round6(costInput);
    const discountUsd = round6(costUsd * (discountPct / 100));
    const discountBs = round6(discountUsd * exchangeRate);
    const netCostUsd = round6(costUsd - discountUsd);
    const netCostBs = round6(netCostUsd * exchangeRate);
    const totalUsd = round2(netCostUsd * quantity);
    const totalBs = round2(totalUsd * exchangeRate);
    const costBs = round6(costUsd * exchangeRate);
    return { costUsd, costBs, discountUsd, discountBs, netCostUsd, netCostBs, totalUsd, totalBs };
  }

  /**
   * Calcula el costo aterrizado (costo de factura + recargo repartido) por item.
   * NO modifica los totales de la factura (totalUsd/netCostUsd quedan intactos).
   * Los items de servicio nunca reciben recargo. Muta item.landedCostUsd/landedCostBs.
   */
  private applySurchargeLandedCost(
    items: Array<{
      productId: string;
      quantity: number;
      netCostUsd: number;
      netCostBs: number;
      totalUsd: number;
      totalBs: number;
      landedCostUsd: number;
      landedCostBs: number;
    }>,
    serviceIds: Set<string>,
    surchargeInput: number,
    surchargeDistribution: string,
    currency: 'USD' | 'BS',
    exchangeRate: number,
  ) {
    // Por defecto el costo aterrizado = costo neto (sin recargo)
    for (const item of items) {
      item.landedCostUsd = item.netCostUsd;
      item.landedCostBs = item.netCostBs;
    }
    if (!surchargeInput || surchargeInput <= 0) return;

    const nonServiceItems = items.filter((i) => !serviceIds.has(i.productId));
    if (nonServiceItems.length === 0) return;

    if (currency === 'BS') {
      const totalNonServiceBs = nonServiceItems.reduce((sum, i) => sum + i.totalBs, 0);
      for (const item of nonServiceItems) {
        const share = surchargeDistribution === 'PROPORTIONAL'
          ? (totalNonServiceBs > 0 ? (item.totalBs / totalNonServiceBs) * surchargeInput : 0)
          : surchargeInput / nonServiceItems.length;
        const perUnitBs = round6(share / item.quantity);
        item.landedCostBs = round6(item.netCostBs + perUnitBs);
        item.landedCostUsd = round6(item.landedCostBs / exchangeRate);
      }
    } else {
      const totalNonServiceUsd = nonServiceItems.reduce((sum, i) => sum + i.totalUsd, 0);
      for (const item of nonServiceItems) {
        const share = surchargeDistribution === 'PROPORTIONAL'
          ? (totalNonServiceUsd > 0 ? (item.totalUsd / totalNonServiceUsd) * surchargeInput : 0)
          : surchargeInput / nonServiceItems.length;
        const perUnitUsd = round6(share / item.quantity);
        item.landedCostUsd = round6(item.netCostUsd + perUnitUsd);
        item.landedCostBs = round6(item.landedCostUsd * exchangeRate);
      }
    }
  }

  private async calculateFiscalTotals(
    items: Array<{ productId: string; quantity: number; netCostUsd: number; totalUsd: number; totalBs: number }>,
    discountGlobalPct: number,
    surchargeInput: number,
    exchangeRate: number,
    prismaClient: any,
    currency: 'USD' | 'BS' = 'USD',
    serieIsVatExempt = false,
  ) {
    const productIds = items.map((i) => i.productId);
    const products = await prismaClient.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, ivaType: true },
    });
    const ivaMap = new Map<string, IvaType>(products.map((p: any) => [p.id, serieIsVatExempt ? ('EXEMPT' as IvaType) : (p.ivaType as IvaType)]));

    if (currency === 'BS') {
      // Bs is source of truth
      const surchargeUsd = round2(surchargeInput / exchangeRate);
      const surchargeBs = surchargeInput;

      const subtotalBs = round2(items.reduce((sum, i) => sum + i.totalBs, 0));
      const discountGlobalBs = round2(subtotalBs * (discountGlobalPct / 100));
      const subtotalAfterDiscountBs = round2(subtotalBs - discountGlobalBs);

      let exemptAmountBs = 0;
      let taxableBaseBs = 0;
      let totalIvaBs = 0;

      for (const item of items) {
        const ivaType: IvaType = ivaMap.get(item.productId) || 'GENERAL';
        const ivaRate = IVA_RATES[ivaType] || 0;
        const proportion = subtotalBs > 0 ? item.totalBs / subtotalBs : 0;
        const itemDiscountedTotal = round2(item.totalBs - discountGlobalBs * proportion);

        if (ivaType === 'EXEMPT') {
          exemptAmountBs += itemDiscountedTotal;
        } else {
          taxableBaseBs += itemDiscountedTotal;
          totalIvaBs += round2(itemDiscountedTotal * ivaRate);
        }
      }

      // El recargo NO afecta el total de la factura (solo el costo aterrizado de los items)
      const totalBs = round2(subtotalAfterDiscountBs + totalIvaBs);

      return {
        subtotalUsd: round2(subtotalBs / exchangeRate),
        subtotalBs: round2(subtotalBs),
        discountGlobalUsd: round2(discountGlobalBs / exchangeRate),
        discountGlobalBs: round2(discountGlobalBs),
        exemptAmountUsd: round2(exemptAmountBs / exchangeRate),
        exemptAmountBs: round2(exemptAmountBs),
        taxableBaseUsd: round2(taxableBaseBs / exchangeRate),
        taxableBaseBs: round2(taxableBaseBs),
        totalIvaUsd: round2(totalIvaBs / exchangeRate),
        totalIvaBs: round2(totalIvaBs),
        totalSurchargeUsd: round2(surchargeUsd),
        totalSurchargeBs: round2(surchargeBs),
        totalUsd: round2(totalBs / exchangeRate),
        totalBs: round2(totalBs),
      };
    }

    // USD is source of truth (original logic)
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

    const totalSurchargeUsd = surchargeInput;
    // El recargo NO afecta el total de la factura (solo el costo aterrizado de los items)
    const totalUsd = round2(subtotalAfterDiscountUsd + totalIvaUsd);

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
    serie: { select: { id: true, name: true, prefix: true, isFiscal: true } },
    items: {
      include: {
        product: {
          select: { id: true, code: true, name: true, costUsd: true, priceDetal: true, priceMayor: true, isService: true, gananciaPct: true, gananciaMayorPct: true, ivaType: true, bregaApplies: true },
        },
      },
    },
    retentionVoucherLines: {
      include: {
        retentionVoucher: {
          select: {
            id: true,
            number: true,
            status: true,
            issueDate: true,
            retentionPct: true,
            retentionAmountUsd: true,
            retentionAmountBs: true,
            exchangeRate: true,
            notes: true,
            createdAt: true,
          },
        },
      },
    },
    payables: {
      select: {
        id: true,
        amountUsd: true,
        amountBs: true,
        exchangeRate: true,
        retentionUsd: true,
        retentionBs: true,
        netPayableUsd: true,
        netPayableBs: true,
        paidAmountUsd: true,
        paidAmountBs: true,
        dueDate: true,
        status: true,
        notes: true,
        payments: {
          select: {
            id: true,
            amountUsd: true,
            amountBs: true,
            method: { select: { id: true, name: true } },
            reference: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'asc' as const },
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
        const discountPct = item.discountPct || 0;
        const calc = this.calculateItemValues(item.costUsd, item.quantity, discountPct, rate, currency as 'USD' | 'BS');
        return {
          productId: item.productId,
          quantity: item.quantity,
          costUsd: calc.costUsd,
          costBs: calc.costBs,
          discountPct,
          discountUsd: calc.discountUsd,
          discountBs: calc.discountBs,
          netCostUsd: calc.netCostUsd,
          netCostBs: calc.netCostBs,
          totalUsd: calc.totalUsd,
          totalBs: calc.totalBs,
          landedCostUsd: calc.netCostUsd,
          landedCostBs: calc.netCostBs,
        };
      });

      // Repartir el recargo en el costo aterrizado (NO toca los totales de la factura)
      if (surchargeUsd > 0) {
        const products = await tx.product.findMany({
          where: { id: { in: items.map((i) => i.productId) } },
          select: { id: true, isService: true },
        });
        const serviceIds = new Set(products.filter((p: any) => p.isService).map((p: any) => p.id));
        this.applySurchargeLandedCost(items, serviceIds, surchargeUsd, surchargeDistribution, currency as 'USD' | 'BS', rate);
      }

      // Check if serie is VAT exempt
      let serieIsVatExempt = false;
      if (dto.serieId) {
        const serie = await tx.serie.findUnique({ where: { id: dto.serieId }, select: { isVatExempt: true } });
        serieIsVatExempt = serie?.isVatExempt === true;
      }

      // Calculate fiscal totals
      const fiscal = await this.calculateFiscalTotals(
        items.map((i) => ({ productId: i.productId, quantity: i.quantity, netCostUsd: i.netCostUsd, totalUsd: i.totalUsd, totalBs: i.totalBs })),
        discountGlobalPct,
        surchargeUsd,
        rate,
        tx,
        currency as 'USD' | 'BS',
        serieIsVatExempt,
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
          isFiscal: dto.isFiscal !== undefined ? dto.isFiscal : true,
          serieId: dto.serieId || null,
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
    if (dto.isFiscal !== undefined) updateData.isFiscal = dto.isFiscal;
    if (dto.serieId !== undefined) updateData.serieId = dto.serieId || null;
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
        const discountPct = item.discountPct || 0;
        const calc = this.calculateItemValues(item.costUsd, item.quantity, discountPct, rate, currency as 'USD' | 'BS');
        return {
          purchaseOrderId: id,
          productId: item.productId,
          quantity: item.quantity,
          costUsd: calc.costUsd,
          costBs: calc.costBs,
          discountPct,
          discountUsd: calc.discountUsd,
          discountBs: calc.discountBs,
          netCostUsd: calc.netCostUsd,
          netCostBs: calc.netCostBs,
          totalUsd: calc.totalUsd,
          totalBs: calc.totalBs,
          landedCostUsd: calc.netCostUsd,
          landedCostBs: calc.netCostBs,
        };
      });

      // Repartir el recargo en el costo aterrizado (NO toca los totales de la factura)
      if (surchargeUsd > 0) {
        const products = await this.prisma.product.findMany({
          where: { id: { in: items.map((i) => i.productId) } },
          select: { id: true, isService: true },
        });
        const serviceIds = new Set(products.filter((p) => p.isService).map((p) => p.id));
        this.applySurchargeLandedCost(items, serviceIds, surchargeUsd, surchargeDistribution, currency as 'USD' | 'BS', rate);
      }

      await this.prisma.purchaseOrderItem.createMany({ data: items });

      // Check if serie is VAT exempt (use dto.serieId if provided, else existing order.serieId)
      let updateSerieIsVatExempt = false;
      const effectiveSerieId = dto.serieId !== undefined ? dto.serieId : order.serieId;
      if (effectiveSerieId) {
        const serie = await this.prisma.serie.findUnique({ where: { id: effectiveSerieId }, select: { isVatExempt: true } });
        updateSerieIsVatExempt = serie?.isVatExempt === true;
      }

      const fiscal = await this.calculateFiscalTotals(
        items.map((i) => ({ productId: i.productId, quantity: i.quantity, netCostUsd: i.netCostUsd, totalUsd: i.totalUsd, totalBs: i.totalBs })),
        discountGlobalPct,
        surchargeUsd,
        rate,
        this.prisma,
        currency as 'USD' | 'BS',
        updateSerieIsVatExempt,
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

  async remove(id: string) {
    const order = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      select: { id: true, status: true, number: true },
    });
    if (!order) throw new NotFoundException('Factura de compra no encontrada');
    // Solo PENDIENTE: aún no tocó inventario, cuentas por pagar ni libros fiscales
    if (order.status !== 'PENDING') {
      throw new BadRequestException('Solo se pueden eliminar facturas en estado PENDIENTE');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: id } });
      await tx.purchaseOrder.delete({ where: { id } });
    });

    return { id, number: order.number, deleted: true };
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

    // Validate payments for cash purchases
    if (!order.isCredit) {
      if (!dto.payments || dto.payments.length === 0) {
        throw new BadRequestException(
          'Las compras de contado requieren al menos un método de pago',
        );
      }

      // Validate payment methods exist
      const methodIds = dto.payments.map((p) => p.methodId);
      const methods = await this.prisma.paymentMethod.findMany({
        where: { id: { in: methodIds } },
      });
      if (methods.length !== methodIds.length) {
        const found = new Set(methods.map((m) => m.id));
        const missing = methodIds.find((mid) => !found.has(mid));
        throw new BadRequestException(
          `Método de pago "${missing}" no encontrado`,
        );
      }

      // Validate total paid >= invoice total
      const totalPaidUsd = dto.payments.reduce((s, p) => s + p.amountUsd, 0);
      if (totalPaidUsd < order.totalUsd - 0.01) {
        throw new BadRequestException(
          `El monto pagado ($${totalPaidUsd.toFixed(2)}) es menor al total de la factura ($${order.totalUsd.toFixed(2)})`,
        );
      }
    }

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
          // Costo aterrizado = costo de factura + recargo repartido (define el precio de venta).
          // Si el producto tiene costo manual, se congela: la compra NO le cambia el costUsd
          // (el StockMovement de abajo sí guarda el costo real de la factura para el histórico).
          const newCost = product.manualCost ? product.costUsd : (item.landedCostUsd || item.netCostUsd);
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
            costUsd: item.landedCostUsd || item.netCostUsd,
            stockAfter,
            reference: order.number,
            sourceType: 'PURCHASE_ORDER',
            sourceId: order.id,
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

      // Create Payable — always create for accounting trail
      {
        const exchangeRate = order.exchangeRate;
        const amountUsd = order.totalUsd;
        const amountBs = round2(amountUsd * exchangeRate);

        // IVA retention is now a separate document (IvaRetention), not embedded in Payable
        const retentionUsd = 0;
        const retentionBs = 0;

        let islrRetUsd = 0;
        if (order.islrRetentionPct && order.islrRetentionPct > 0) {
          islrRetUsd = round2(amountUsd * (order.islrRetentionPct / 100));
          const islrRetBs = round2(islrRetUsd * exchangeRate);
          await tx.purchaseOrder.update({
            where: { id },
            data: { islrRetentionUsd: islrRetUsd, islrRetentionBs: islrRetBs },
          });
        }

        const netPayableUsd = round2(amountUsd - islrRetUsd);
        const netPayableBs = round2(netPayableUsd * exchangeRate);

        const dueDate = new Date();
        if (order.isCredit && order.creditDays > 0) {
          dueDate.setDate(dueDate.getDate() + order.creditDays);
        }

        const payable = await tx.payable.create({
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
            dueDate: order.isCredit && order.creditDays > 0 ? dueDate : null,
            status: order.isCredit ? 'PENDING' : 'PAID',
            paidAmountUsd: order.isCredit ? 0 : netPayableUsd,
            paidAmountBs: order.isCredit ? 0 : netPayableBs,
            paidAt: order.isCredit ? null : processedAt,
            notes: `CxP generada de factura ${order.number}`,
          },
        });

        // Record immediate payments for cash purchases
        if (!order.isCredit && dto.payments && dto.payments.length > 0) {
          for (const payment of dto.payments) {
            await tx.payablePayment.create({
              data: {
                payableId: payable.id,
                amountUsd: payment.amountUsd,
                amountBs: payment.amountBs,
                exchangeRate,
                methodId: payment.methodId,
                reference: payment.reference || null,
                createdById: userId,
              },
            });
          }
        }
      }

      // Create IvaRetention document if applicable
      if (config?.isIGTFContributor && order.isFiscal && order.totalIvaUsd > 0) {
        const exchangeRate = order.exchangeRate;
        const ivaRetPct = config.ivaRetentionPct || 75;
        const retUsd = round2(order.totalIvaUsd * (ivaRetPct / 100));
        const retBs = round2(retUsd * exchangeRate);

        // Generate number: YYYYMM + 8-digit sequence
        const now = new Date();
        const prefix = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
        const seq = config.retentionNextNumber || 1;
        const number = `${prefix}${String(seq).padStart(8, '0')}`;

        await tx.ivaRetention.create({
          data: {
            number,
            purchaseOrderId: order.id,
            supplierId: order.supplierId,
            ivaBaseUsd: order.totalIvaUsd,
            ivaBaseBs: order.totalIvaBs,
            retentionPct: ivaRetPct,
            retentionUsd: retUsd,
            retentionBs: retBs,
            exchangeRate,
            createdById: userId,
          },
        });

        // Increment sequence
        await tx.companyConfig.update({
          where: { id: 'singleton' },
          data: { retentionNextNumber: seq + 1 },
        });
      }

      // Create RetentionVoucher (header + line) if supplier is retention agent
      if (order.supplier.isRetentionAgent && order.serie?.isFiscal && order.totalIvaUsd > 0) {
        const exchangeRate = order.exchangeRate;
        const ivaRetPct = config?.ivaRetentionPct || 75;
        const retUsd = round2(order.totalIvaUsd * (ivaRetPct / 100));
        const retBs = round2(retUsd * exchangeRate);
        const taxBaseUsd = round2(order.totalUsd - order.totalIvaUsd);
        const taxBaseBs = round2(order.totalBs - order.totalIvaBs);

        // Generate YYYYMM + 8-digit global sequence from CompanyConfig.retentionNextNumber
        const now = new Date();
        const retPrefix = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
        const cfgRow = await tx.companyConfig.findUnique({ where: { id: 'singleton' } });
        const retSeq = cfgRow?.retentionNextNumber || 1;
        const retNumber = `${retPrefix}${String(retSeq).padStart(8, '0')}`;

        await tx.retentionVoucher.create({
          data: {
            number: retNumber,
            supplierId: order.supplierId,
            serieId: order.serieId,
            status: 'PENDING',
            retentionPct: ivaRetPct,
            retentionAmountUsd: retUsd,
            retentionAmountBs: retBs,
            exchangeRate,
            createdById: userId,
            lines: {
              create: {
                purchaseOrderId: order.id,
                supplierInvoiceNumber: order.supplierInvoiceNumber,
                supplierControlNumber: order.supplierControlNumber,
                invoiceDate: order.invoiceDate,
                invoiceTotalUsd: order.totalUsd,
                invoiceTotalBs: order.totalBs,
                taxableBaseUsd: taxBaseUsd,
                taxableBaseBs: taxBaseBs,
                ivaAmountUsd: order.totalIvaUsd,
                ivaAmountBs: order.totalIvaBs,
                retentionPct: ivaRetPct,
                retentionAmountUsd: retUsd,
                retentionAmountBs: retBs,
                exchangeRate,
              },
            },
          },
        });

        // Increment global retention sequence
        await tx.companyConfig.update({
          where: { id: 'singleton' },
          data: { retentionNextNumber: retSeq + 1 },
        });
      }

      // Create PurchaseBookEntry automatically (invoice line — without retention, retention comes separately when issued)
      if (order.serie?.isFiscal) {
        await tx.purchaseBookEntry.create({
          data: {
            purchaseOrderId: order.id,
            entryDate: order.invoiceDate || processedAt,
            supplierControlNumber: order.supplierControlNumber || null,
            supplierInvoiceNumber: order.supplierInvoiceNumber || null,
            supplierSerie: order.supplierSerialNumber || null,
            supplierName: order.supplier.name,
            supplierRif: order.supplier.rif || 'S/R',
            exemptAmountBs: order.exemptAmountBs,
            taxableBaseBs: order.taxableBaseBs,
            ivaAmountBs: order.totalIvaBs,
            totalBs: order.totalBs,
            isManual: false,
            isRetentionLine: false,
            documentType: 'FACTURA',
            createdById: userId,
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
        // Costo aterrizado (costo de factura + recargo repartido) — igual que en process()
        const newCost = item.landedCostUsd || item.netCostUsd;

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
