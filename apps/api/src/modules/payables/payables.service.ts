import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { QueryPayablesDto } from './dto/query-payables.dto';
import { PayPayableDto } from './dto/pay-payable.dto';

@Injectable()
export class PayablesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryPayablesDto) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.supplierId) {
      where.supplierId = query.supplierId;
    }
    if (query.status) {
      where.status = query.status;
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
    if (query.overdue) {
      const now = new Date();
      now.setUTCHours(0, 0, 0, 0);
      where.dueDate = { lt: now };
      where.status = { in: ['PENDING', 'PARTIAL'] };
    }

    const [data, total] = await Promise.all([
      this.prisma.payable.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          supplier: { select: { id: true, name: true } },
          purchaseOrder: { select: { id: true, number: true } },
          payments: {
            orderBy: { createdAt: 'desc' },
            select: { id: true, amountUsd: true, createdAt: true, method: { select: { id: true, name: true } } },
          },
        },
      }),
      this.prisma.payable.count({ where }),
    ]);

    const enriched = data.map((p) => ({
      ...p,
      balanceUsd: Math.round((p.netPayableUsd - p.paidAmountUsd) * 100) / 100,
    }));

    return { data: enriched, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string) {
    const payable = await this.prisma.payable.findUnique({
      where: { id },
      include: {
        supplier: true,
        purchaseOrder: {
          select: { id: true, number: true, totalUsd: true, createdAt: true },
        },
        payments: {
          orderBy: { createdAt: 'desc' },
          include: { method: true },
        },
      },
    });
    if (!payable) throw new NotFoundException('Cuenta por pagar no encontrada');
    return {
      ...payable,
      balanceUsd: Math.round((payable.netPayableUsd - payable.paidAmountUsd) * 100) / 100,
    };
  }

  async summary() {
    const pending = await this.prisma.payable.findMany({
      where: { status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] } },
      include: {
        supplier: { select: { id: true, name: true } },
      },
    });

    let totalPendingUsd = 0;
    let totalOverdueUsd = 0;
    let totalRetentionUsd = 0;
    const supplierMap: Record<string, { supplierName: string; totalUsd: number; count: number }> = {};

    for (const p of pending) {
      const balance = p.netPayableUsd - p.paidAmountUsd;
      totalPendingUsd += balance;

      if (p.status === 'OVERDUE') {
        totalOverdueUsd += balance;
      }

      if (p.retentionUsd > 0) {
        totalRetentionUsd += p.retentionUsd;
      }

      if (!supplierMap[p.supplierId]) {
        supplierMap[p.supplierId] = {
          supplierName: p.supplier.name,
          totalUsd: 0,
          count: 0,
        };
      }
      supplierMap[p.supplierId].totalUsd += balance;
      supplierMap[p.supplierId].count += 1;
    }

    return {
      totalPendingUsd: Math.round(totalPendingUsd * 100) / 100,
      totalOverdueUsd: Math.round(totalOverdueUsd * 100) / 100,
      totalRetentionUsd: Math.round(totalRetentionUsd * 100) / 100,
      supplierCount: Object.keys(supplierMap).length,
      bySupplier: Object.values(supplierMap).map((s) => ({
        supplierName: s.supplierName,
        totalUsd: Math.round(s.totalUsd * 100) / 100,
        count: s.count,
      })),
    };
  }

  async pay(id: string, dto: PayPayableDto, userId: string) {
    const payable = await this.prisma.payable.findUnique({
      where: { id },
      include: { supplier: true },
    });
    if (!payable) throw new NotFoundException('Cuenta por pagar no encontrada');
    if (payable.status === 'PAID') {
      throw new BadRequestException('Esta cuenta ya esta completamente pagada');
    }

    const balance = payable.netPayableUsd - payable.paidAmountUsd;
    if (dto.amountUsd > balance + 0.01) {
      throw new BadRequestException(
        `El monto excede el saldo pendiente de $${balance.toFixed(2)}`,
      );
    }

    // Get today's exchange rate
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const rate = await this.prisma.exchangeRate.findUnique({ where: { date: today } });
    if (!rate) {
      throw new BadRequestException('No hay tasa BCV registrada para hoy');
    }

    const amountBs = Math.round(dto.amountUsd * rate.rate * 100) / 100;
    const newPaidAmountUsd = Math.round((payable.paidAmountUsd + dto.amountUsd) * 100) / 100;
    const newPaidAmountBs = Math.round((payable.paidAmountBs + amountBs) * 100) / 100;
    const isPaidInFull = newPaidAmountUsd >= payable.netPayableUsd - 0.01;

    return this.prisma.$transaction(async (tx) => {
      await tx.payablePayment.create({
        data: {
          payableId: id,
          amountUsd: dto.amountUsd,
          amountBs,
          exchangeRate: rate.rate,
          methodId: dto.methodId,
          reference: dto.reference,
          notes: dto.notes,
          createdById: userId,
        },
      });

      const updated = await tx.payable.update({
        where: { id },
        data: {
          paidAmountUsd: newPaidAmountUsd,
          paidAmountBs: newPaidAmountBs,
          status: isPaidInFull ? 'PAID' : 'PARTIAL',
          paidAt: isPaidInFull ? new Date() : null,
        },
        include: {
          supplier: true,
          purchaseOrder: { select: { id: true, number: true } },
          payments: { orderBy: { createdAt: 'desc' } },
        },
      });

      return {
        ...updated,
        balanceUsd: Math.round((updated.netPayableUsd - updated.paidAmountUsd) * 100) / 100,
      };
    });
  }

  async findBySupplier(supplierId: string) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id: supplierId },
    });
    if (!supplier) throw new NotFoundException('Proveedor no encontrado');

    const payables = await this.prisma.payable.findMany({
      where: { supplierId },
      orderBy: { createdAt: 'desc' },
      include: {
        purchaseOrder: { select: { id: true, number: true } },
        payments: {
          orderBy: { createdAt: 'desc' },
          select: { id: true, amountUsd: true, createdAt: true, method: { select: { id: true, name: true } } },
        },
      },
    });

    const pending = payables.filter((p) =>
      ['PENDING', 'PARTIAL', 'OVERDUE'].includes(p.status),
    );
    const totalDebt = pending.reduce((sum, p) => sum + (p.netPayableUsd - p.paidAmountUsd), 0);
    const totalOverdue = pending
      .filter((p) => p.status === 'OVERDUE')
      .reduce((sum, p) => sum + (p.netPayableUsd - p.paidAmountUsd), 0);
    const totalRetention = pending.reduce((sum, p) => sum + p.retentionUsd, 0);

    return {
      supplier: {
        id: supplier.id,
        name: supplier.name,
        rif: supplier.rif,
        isRetentionAgent: supplier.isRetentionAgent,
      },
      totalDebt: Math.round(totalDebt * 100) / 100,
      totalOverdue: Math.round(totalOverdue * 100) / 100,
      totalRetention: Math.round(totalRetention * 100) / 100,
      payables: payables.map((p) => ({
        ...p,
        balanceUsd: Math.round((p.netPayableUsd - p.paidAmountUsd) * 100) / 100,
      })),
    };
  }

  async markOverdue(): Promise<number> {
    const now = new Date();
    now.setUTCHours(0, 0, 0, 0);

    const result = await this.prisma.payable.updateMany({
      where: {
        dueDate: { lt: now },
        status: { in: ['PENDING', 'PARTIAL'] },
      },
      data: { status: 'OVERDUE' },
    });

    return result.count;
  }
}
