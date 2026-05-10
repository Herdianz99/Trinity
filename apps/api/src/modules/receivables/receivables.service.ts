import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { QueryReceivablesDto } from './dto/query-receivables.dto';
import { PayReceivableDto } from './dto/pay-receivable.dto';

@Injectable()
export class ReceivablesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryReceivablesDto) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.type) {
      where.type = query.type;
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.customerId) {
      where.customerId = query.customerId;
    }
    if (query.platformName) {
      where.platformName = query.platformName;
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
      this.prisma.receivable.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: { select: { id: true, name: true, documentType: true, rif: true } },
          invoice: { select: { id: true, number: true } },
          payments: {
            orderBy: { createdAt: 'desc' },
            select: { id: true, amountUsd: true, createdAt: true, method: true },
          },
        },
      }),
      this.prisma.receivable.count({ where }),
    ]);

    const enriched = data.map((r) => ({
      ...r,
      balanceUsd: Math.round((r.amountUsd - r.paidAmountUsd) * 100) / 100,
    }));

    return { data: enriched, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string) {
    const receivable = await this.prisma.receivable.findUnique({
      where: { id },
      include: {
        customer: true,
        invoice: { select: { id: true, number: true, totalUsd: true, createdAt: true } },
        payments: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!receivable) throw new NotFoundException('Cuenta por cobrar no encontrada');
    return {
      ...receivable,
      balanceUsd: Math.round((receivable.amountUsd - receivable.paidAmountUsd) * 100) / 100,
    };
  }

  async summary() {
    const pending = await this.prisma.receivable.findMany({
      where: { status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] } },
    });

    let totalPendingUsd = 0;
    let totalOverdueUsd = 0;
    const platformMap: Record<string, { totalUsd: number; count: number }> = {};
    const statusMap: Record<string, { count: number; totalUsd: number }> = {};

    for (const r of pending) {
      const balance = r.amountUsd - r.paidAmountUsd;
      totalPendingUsd += balance;

      if (r.status === 'OVERDUE') {
        totalOverdueUsd += balance;
      }

      if (r.platformName) {
        if (!platformMap[r.platformName]) {
          platformMap[r.platformName] = { totalUsd: 0, count: 0 };
        }
        platformMap[r.platformName].totalUsd += balance;
        platformMap[r.platformName].count += 1;
      }

      if (!statusMap[r.status]) {
        statusMap[r.status] = { count: 0, totalUsd: 0 };
      }
      statusMap[r.status].count += 1;
      statusMap[r.status].totalUsd += balance;
    }

    // Also include PAID in status breakdown
    const paidCount = await this.prisma.receivable.count({ where: { status: 'PAID' } });
    const paidSum = await this.prisma.receivable.aggregate({
      where: { status: 'PAID' },
      _sum: { amountUsd: true },
    });

    return {
      totalPendingUsd: Math.round(totalPendingUsd * 100) / 100,
      totalOverdueUsd: Math.round(totalOverdueUsd * 100) / 100,
      byPlatform: Object.entries(platformMap).map(([platformName, data]) => ({
        platformName,
        totalUsd: Math.round(data.totalUsd * 100) / 100,
        count: data.count,
      })),
      byStatus: [
        ...Object.entries(statusMap).map(([status, data]) => ({
          status,
          count: data.count,
          totalUsd: Math.round(data.totalUsd * 100) / 100,
        })),
        ...(paidCount > 0
          ? [{ status: 'PAID', count: paidCount, totalUsd: Math.round((paidSum._sum.amountUsd || 0) * 100) / 100 }]
          : []),
      ],
    };
  }

  async pay(id: string, dto: PayReceivableDto, userId: string) {
    const receivable = await this.prisma.receivable.findUnique({
      where: { id },
      include: { customer: true },
    });
    if (!receivable) throw new NotFoundException('Cuenta por cobrar no encontrada');
    if (receivable.status === 'PAID') {
      throw new BadRequestException('Esta cuenta ya está completamente pagada');
    }

    const balance = receivable.amountUsd - receivable.paidAmountUsd;
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

    const amountBs = dto.amountUsd * rate.rate;
    const newPaidAmount = receivable.paidAmountUsd + dto.amountUsd;
    const isPaidInFull = newPaidAmount >= receivable.amountUsd - 0.01;

    return this.prisma.$transaction(async (tx) => {
      // Create payment record
      await tx.receivablePayment.create({
        data: {
          receivableId: id,
          amountUsd: dto.amountUsd,
          amountBs: Math.round(amountBs * 100) / 100,
          exchangeRate: rate.rate,
          method: dto.method as any,
          reference: dto.reference,
          cashSessionId: dto.cashSessionId,
          notes: dto.notes,
          createdById: userId,
        },
      });

      // Update receivable
      const updated = await tx.receivable.update({
        where: { id },
        data: {
          paidAmountUsd: Math.round(newPaidAmount * 100) / 100,
          status: isPaidInFull ? 'PAID' : 'PARTIAL',
          paidAt: isPaidInFull ? new Date() : null,
        },
        include: {
          customer: true,
          invoice: { select: { id: true, number: true } },
          payments: { orderBy: { createdAt: 'desc' } },
        },
      });

      return {
        ...updated,
        balanceUsd: Math.round((updated.amountUsd - updated.paidAmountUsd) * 100) / 100,
      };
    });
  }

  async findByCustomer(customerId: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
    });
    if (!customer) throw new NotFoundException('Cliente no encontrado');

    const receivables = await this.prisma.receivable.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      include: {
        invoice: { select: { id: true, number: true } },
        payments: {
          orderBy: { createdAt: 'desc' },
          select: { id: true, amountUsd: true, createdAt: true, method: true },
        },
      },
    });

    const pending = receivables.filter((r) =>
      ['PENDING', 'PARTIAL', 'OVERDUE'].includes(r.status),
    );
    const totalDebt = pending.reduce((sum, r) => sum + (r.amountUsd - r.paidAmountUsd), 0);
    const totalOverdue = pending
      .filter((r) => r.status === 'OVERDUE')
      .reduce((sum, r) => sum + (r.amountUsd - r.paidAmountUsd), 0);

    return {
      customer: {
        id: customer.id,
        name: customer.name,
        documentType: customer.documentType,
        rif: customer.rif,
        creditLimit: customer.creditLimit,
        creditDays: customer.creditDays,
      },
      totalDebt: Math.round(totalDebt * 100) / 100,
      totalOverdue: Math.round(totalOverdue * 100) / 100,
      availableCredit: Math.round((customer.creditLimit - totalDebt) * 100) / 100,
      receivables: receivables.map((r) => ({
        ...r,
        balanceUsd: Math.round((r.amountUsd - r.paidAmountUsd) * 100) / 100,
      })),
    };
  }

  async markOverdue(): Promise<number> {
    const now = new Date();
    now.setUTCHours(0, 0, 0, 0);

    const result = await this.prisma.receivable.updateMany({
      where: {
        dueDate: { lt: now },
        status: { in: ['PENDING', 'PARTIAL'] },
      },
      data: { status: 'OVERDUE' },
    });

    return result.count;
  }
}
