import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { ReceivePurchaseOrderDto } from './dto/receive-purchase-order.dto';
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

@Injectable()
export class PurchaseOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  private async generateNumber(): Promise<string> {
    const last = await this.prisma.purchaseOrder.findFirst({
      where: { number: { startsWith: 'PO-' } },
      orderBy: { number: 'desc' },
    });
    if (!last) return 'PO-0001';
    const num = parseInt(last.number.replace('PO-', ''), 10) + 1;
    return `PO-${num.toString().padStart(4, '0')}`;
  }

  private async getTodayRate() {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const rate = await this.prisma.exchangeRate.findUnique({ where: { date: today } });
    return rate?.rate || 0;
  }

  async create(dto: CreatePurchaseOrderDto, userId: string) {
    const number = await this.generateNumber();
    const exchangeRate = await this.getTodayRate();

    const items = dto.items.map((item) => {
      const totalUsd = Math.round(item.quantity * item.costUsd * 100) / 100;
      return {
        productId: item.productId,
        quantity: item.quantity,
        costUsd: item.costUsd,
        costBs: Math.round(item.costUsd * exchangeRate * 100) / 100,
        totalUsd,
        totalBs: Math.round(totalUsd * exchangeRate * 100) / 100,
      };
    });

    const totalUsd = items.reduce((sum, i) => sum + i.totalUsd, 0);
    const totalBs = Math.round(totalUsd * exchangeRate * 100) / 100;

    // Calculate ISLR if applicable
    let islrRetentionPct: number | null = null;
    let islrRetentionUsd: number | null = null;
    let islrRetentionBs: number | null = null;

    if (dto.applyIslr && dto.islrRetentionPct != null && dto.islrRetentionPct > 0) {
      islrRetentionPct = dto.islrRetentionPct;
      islrRetentionUsd = Math.round(totalUsd * (islrRetentionPct / 100) * 100) / 100;
      // Bs will be calculated at receive time with current rate
    }

    return this.prisma.purchaseOrder.create({
      data: {
        number,
        supplierId: dto.supplierId,
        notes: dto.notes,
        isCredit: dto.isCredit || false,
        creditDays: dto.creditDays || 0,
        supplierControlNumber: dto.supplierControlNumber || null,
        islrRetentionPct,
        islrRetentionUsd,
        islrRetentionBs,
        totalUsd: Math.round(totalUsd * 100) / 100,
        totalBs,
        exchangeRate,
        createdById: userId,
        items: { create: items },
      },
      include: {
        supplier: { select: { id: true, name: true } },
        items: { include: { product: { select: { id: true, code: true, name: true } } } },
      },
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
      where.createdAt = {};
      if (from) {
        const fromDate = new Date(from);
        fromDate.setUTCHours(0, 0, 0, 0);
        where.createdAt.gte = fromDate;
      }
      if (to) {
        const toDate = new Date(to);
        toDate.setUTCHours(23, 59, 59, 999);
        where.createdAt.lte = toDate;
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
          items: { include: { product: { select: { id: true, code: true, name: true } } } },
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
      include: {
        supplier: true,
        items: {
          include: {
            product: {
              select: { id: true, code: true, name: true, costUsd: true, priceDetal: true, priceMayor: true },
            },
          },
        },
      },
    });
    if (!order) throw new NotFoundException('Orden de compra no encontrada');
    return order;
  }

  async update(id: string, dto: Partial<CreatePurchaseOrderDto>) {
    const order = await this.findOne(id);
    if (order.status !== 'DRAFT') {
      throw new BadRequestException('Solo se pueden editar ordenes en estado DRAFT');
    }

    const updateData: any = {};
    if (dto.supplierId) updateData.supplierId = dto.supplierId;
    if (dto.notes !== undefined) updateData.notes = dto.notes;
    if (dto.supplierControlNumber !== undefined) updateData.supplierControlNumber = dto.supplierControlNumber || null;
    if (dto.isCredit !== undefined) updateData.isCredit = dto.isCredit;
    if (dto.creditDays !== undefined) updateData.creditDays = dto.creditDays;

    if (dto.items) {
      const exchangeRate = await this.getTodayRate();

      // Delete existing items and recreate
      await this.prisma.purchaseOrderItem.deleteMany({
        where: { purchaseOrderId: id },
      });

      const items = dto.items.map((item) => {
        const totalUsd = Math.round(item.quantity * item.costUsd * 100) / 100;
        return {
          purchaseOrderId: id,
          productId: item.productId,
          quantity: item.quantity,
          costUsd: item.costUsd,
          costBs: Math.round(item.costUsd * exchangeRate * 100) / 100,
          totalUsd,
          totalBs: Math.round(totalUsd * exchangeRate * 100) / 100,
        };
      });

      await this.prisma.purchaseOrderItem.createMany({ data: items });

      updateData.totalUsd = items.reduce((sum, i) => sum + i.totalUsd, 0);
      updateData.totalBs = Math.round(updateData.totalUsd * exchangeRate * 100) / 100;
      updateData.exchangeRate = exchangeRate;
    }

    // Recalculate ISLR if applicable
    if (dto.applyIslr !== undefined) {
      if (dto.applyIslr && dto.islrRetentionPct != null && dto.islrRetentionPct > 0) {
        const total = updateData.totalUsd ?? order.totalUsd;
        updateData.islrRetentionPct = dto.islrRetentionPct;
        updateData.islrRetentionUsd = Math.round(total * (dto.islrRetentionPct / 100) * 100) / 100;
        updateData.islrRetentionBs = null;
      } else {
        updateData.islrRetentionPct = null;
        updateData.islrRetentionUsd = null;
        updateData.islrRetentionBs = null;
      }
    }

    return this.prisma.purchaseOrder.update({
      where: { id },
      data: updateData,
      include: {
        supplier: { select: { id: true, name: true } },
        items: { include: { product: { select: { id: true, code: true, name: true } } } },
      },
    });
  }

  async changeStatus(id: string, status: 'SENT' | 'CANCELLED') {
    const order = await this.findOne(id);

    if (status === 'SENT' && order.status !== 'DRAFT') {
      throw new BadRequestException('Solo se pueden enviar ordenes en estado DRAFT');
    }
    if (status === 'CANCELLED' && !['DRAFT', 'SENT'].includes(order.status)) {
      throw new BadRequestException('Solo se pueden cancelar ordenes en estado DRAFT o SENT');
    }

    return this.prisma.purchaseOrder.update({
      where: { id },
      data: { status },
      include: {
        supplier: { select: { id: true, name: true } },
        items: { include: { product: { select: { id: true, code: true, name: true } } } },
      },
    });
  }

  async receive(id: string, dto: ReceivePurchaseOrderDto, userId: string) {
    const order = await this.findOne(id);

    if (!['SENT', 'PARTIAL'].includes(order.status)) {
      throw new BadRequestException('Solo se pueden recibir ordenes en estado SENT o PARTIAL');
    }

    const config = await this.prisma.companyConfig.findUnique({
      where: { id: 'singleton' },
    });
    const bregaGlobalPct = config?.bregaGlobalPct || 0;

    return this.prisma.$transaction(async (tx) => {
      for (const receiveItem of dto.items) {
        const poItem = order.items.find((i) => i.id === receiveItem.purchaseOrderItemId);
        if (!poItem) {
          throw new BadRequestException(`Item ${receiveItem.purchaseOrderItemId} no encontrado en la orden`);
        }

        const newReceivedQty = poItem.receivedQty + receiveItem.receivedQty;
        if (newReceivedQty > poItem.quantity) {
          throw new BadRequestException(
            `Cantidad recibida (${newReceivedQty}) excede cantidad pedida (${poItem.quantity}) para ${poItem.product.name}`,
          );
        }

        // Update receivedQty on PurchaseOrderItem
        await tx.purchaseOrderItem.update({
          where: { id: poItem.id },
          data: { receivedQty: newReceivedQty },
        });

        // Update stock
        await tx.stock.upsert({
          where: {
            productId_warehouseId: {
              productId: poItem.productId,
              warehouseId: dto.warehouseId,
            },
          },
          create: {
            productId: poItem.productId,
            warehouseId: dto.warehouseId,
            quantity: receiveItem.receivedQty,
          },
          update: {
            quantity: { increment: receiveItem.receivedQty },
          },
        });

        // Update product costUsd and recalculate prices
        const product = await tx.product.findUnique({ where: { id: poItem.productId } });
        if (product) {
          const bregaPct = product.bregaApplies ? bregaGlobalPct : 0;
          const ivaMultiplier = IVA_MULTIPLIERS[product.ivaType];
          const newCost = receiveItem.costUsd;

          const priceDetal = Math.round(
            newCost * (1 + bregaPct / 100) * (1 + product.gananciaPct / 100) * ivaMultiplier * 100,
          ) / 100;
          const priceMayor = Math.round(
            newCost * (1 + bregaPct / 100) * (1 + product.gananciaMayorPct / 100) * ivaMultiplier * 100,
          ) / 100;

          await tx.product.update({
            where: { id: poItem.productId },
            data: {
              costUsd: newCost,
              priceDetal,
              priceMayor,
            },
          });
        }

        // Create StockMovement
        await tx.stockMovement.create({
          data: {
            productId: poItem.productId,
            warehouseId: dto.warehouseId,
            type: 'PURCHASE',
            quantity: receiveItem.receivedQty,
            costUsd: receiveItem.costUsd,
            reference: order.number,
            createdById: userId,
          },
        });
      }

      // Determine new status
      const updatedItems = await tx.purchaseOrderItem.findMany({
        where: { purchaseOrderId: id },
      });

      const allReceived = updatedItems.every((i) => i.receivedQty >= i.quantity);
      const newStatus = allReceived ? 'RECEIVED' : 'PARTIAL';

      // Get today's exchange rate for Bs calculations
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const todayRate = await tx.exchangeRate.findUnique({ where: { date: today } });
      const receiveRate = todayRate?.rate || 0;
      const updatedTotalBs = Math.round(order.totalUsd * receiveRate * 100) / 100;

      const updatedOrder = await tx.purchaseOrder.update({
        where: { id },
        data: {
          status: newStatus,
          receivedAt: allReceived ? new Date() : undefined,
          totalBs: updatedTotalBs,
          exchangeRate: receiveRate,
        },
        include: {
          supplier: { select: { id: true, name: true, isRetentionAgent: true } },
          items: { include: { product: { select: { id: true, code: true, name: true, costUsd: true, priceDetal: true, priceMayor: true, ivaType: true } } } },
        },
      });

      // Create Payable if credit order and fully received
      if (order.isCredit && allReceived) {
        if (!todayRate) {
          throw new BadRequestException('No hay tasa BCV registrada para hoy. Necesaria para crear CxP.');
        }

        const amountUsd = updatedOrder.totalUsd;
        const amountBs = Math.round(amountUsd * receiveRate * 100) / 100;
        const exchangeRate = receiveRate;

        let retentionUsd = 0;
        let retentionBs = 0;

        // Calculate IVA retention if supplier is retention agent
        if (updatedOrder.supplier.isRetentionAgent) {
          const config = await tx.companyConfig.findUnique({ where: { id: 'singleton' } });
          const ivaRetentionPct = config?.ivaRetentionPct || 75;

          // Calculate total IVA from received items
          let totalIva = 0;
          for (const item of updatedItems) {
            const product = updatedOrder.items.find((i) => i.productId === item.productId);
            if (product) {
              const ivaRate = IVA_RATES[product.product.ivaType] || 0;
              totalIva += item.costUsd * item.quantity * ivaRate;
            }
          }

          retentionUsd = Math.round(totalIva * (ivaRetentionPct / 100) * 100) / 100;
          retentionBs = Math.round(retentionUsd * exchangeRate * 100) / 100;
        }

        // Also calculate ISLR retention from the order if set
        let islrRetentionUsd = 0;
        if (updatedOrder.islrRetentionPct && updatedOrder.islrRetentionPct > 0) {
          islrRetentionUsd = Math.round(amountUsd * (updatedOrder.islrRetentionPct / 100) * 100) / 100;
          const islrRetentionBs = Math.round(islrRetentionUsd * exchangeRate * 100) / 100;
          // Update the order with calculated ISLR amounts
          await tx.purchaseOrder.update({
            where: { id },
            data: {
              islrRetentionUsd,
              islrRetentionBs,
            },
          });
        }

        const netPayableUsd = Math.round((amountUsd - retentionUsd - islrRetentionUsd) * 100) / 100;
        const netPayableBs = Math.round(netPayableUsd * exchangeRate * 100) / 100;

        // Calculate due date
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
            notes: `CxP generada de orden ${order.number}`,
          },
        });
      }

      return updatedOrder;
    });
  }

  async getReorderSuggestions() {
    const suggestions = await this.prisma.$queryRaw<any[]>`
      SELECT
        p.id,
        p.code,
        p.name,
        p."categoryId",
        p."supplierId",
        p."minStock",
        p."costUsd",
        c.name as "categoryName",
        s2.name as "supplierName",
        COALESCE(stock_sum.total, 0) as "currentStock"
      FROM "Product" p
      LEFT JOIN (
        SELECT "productId", SUM(quantity) as total
        FROM "Stock"
        GROUP BY "productId"
      ) stock_sum ON stock_sum."productId" = p.id
      LEFT JOIN "Category" c ON c.id = p."categoryId"
      LEFT JOIN "Supplier" s2 ON s2.id = p."supplierId"
      WHERE p."isActive" = true
        AND p."minStock" > 0
        AND COALESCE(stock_sum.total, 0) <= p."minStock"
      ORDER BY
        CASE WHEN COALESCE(stock_sum.total, 0) = 0 THEN 0 ELSE 1 END ASC,
        (COALESCE(stock_sum.total, 0) / NULLIF(p."minStock", 0)) ASC
    `;

    return suggestions.map((s) => ({
      id: s.id,
      code: s.code,
      name: s.name,
      categoryName: s.categoryName,
      supplierId: s.supplierId,
      supplierName: s.supplierName,
      currentStock: Number(s.currentStock),
      minStock: Number(s.minStock),
      difference: Number(s.currentStock) - Number(s.minStock),
      lastCostUsd: Number(s.costUsd),
    }));
  }
}
