import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OpenSessionDto } from './dto/open-session.dto';
import { CloseSessionDto } from './dto/close-session.dto';
import { CreateCashRegisterDto } from './dto/create-cash-register.dto';

@Injectable()
export class CashRegistersService {
  constructor(private readonly prisma: PrismaService) {}

  /** GET /cash-registers — all registers with their active session if any */
  async findAll() {
    return this.prisma.cashRegister.findMany({
      include: {
        sessions: {
          where: { status: 'OPEN' },
          include: { openedBy: { select: { id: true, name: true } } },
        },
      },
      orderBy: { code: 'asc' },
    });
  }

  /** GET /cash-registers/available — registers available for a given user:
   *  - Registers with an OPEN session opened by this user
   *  - Registers with an OPEN session that are isShared = true
   */
  async findAvailable(userId: string) {
    return this.prisma.cashRegister.findMany({
      where: {
        isActive: true,
        OR: [
          { sessions: { some: { status: 'OPEN', openedById: userId } } },
          { isShared: true, sessions: { some: { status: 'OPEN' } } },
        ],
      },
      include: {
        sessions: {
          where: { status: 'OPEN' },
          include: { openedBy: { select: { id: true, name: true } } },
        },
      },
      orderBy: { code: 'asc' },
    });
  }

  /** GET /cash-registers/:id — detail with active session */
  async findOne(id: string) {
    const register = await this.prisma.cashRegister.findUnique({
      where: { id },
      include: {
        sessions: {
          where: { status: 'OPEN' },
          include: {
            openedBy: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!register) throw new NotFoundException('Caja no encontrada');
    return register;
  }

  /** POST /cash-registers — create (ADMIN) */
  async createRegister(dto: CreateCashRegisterDto) {
    const existing = await this.prisma.cashRegister.findUnique({
      where: { code: dto.code },
    });
    if (existing) {
      throw new BadRequestException(`El codigo "${dto.code}" ya esta en uso`);
    }

    return this.prisma.cashRegister.create({
      data: {
        code: dto.code,
        name: dto.name,
        isFiscal: dto.isFiscal ?? false,
        isShared: dto.isShared ?? false,
        comPort: dto.comPort,
      },
    });
  }

  /** PATCH /cash-registers/:id — edit (ADMIN) */
  async updateRegister(id: string, dto: CreateCashRegisterDto) {
    const register = await this.prisma.cashRegister.findUnique({ where: { id } });
    if (!register) throw new NotFoundException('Caja no encontrada');

    if (dto.code && dto.code !== register.code) {
      const existing = await this.prisma.cashRegister.findUnique({
        where: { code: dto.code },
      });
      if (existing) {
        throw new BadRequestException(`El codigo "${dto.code}" ya esta en uso`);
      }
    }

    return this.prisma.cashRegister.update({
      where: { id },
      data: {
        name: dto.name,
        code: dto.code,
        isFiscal: dto.isFiscal,
        isShared: dto.isShared,
        comPort: dto.comPort,
      },
    });
  }

  /** PATCH /cash-registers/:id/toggle-active */
  async toggleActiveRegister(id: string) {
    const register = await this.prisma.cashRegister.findUnique({
      where: { id },
      include: { sessions: { where: { status: 'OPEN' } } },
    });
    if (!register) throw new NotFoundException('Caja no encontrada');

    if (register.isActive && register.sessions.length > 0) {
      throw new BadRequestException('No se puede desactivar una caja con sesion activa');
    }

    return this.prisma.cashRegister.update({
      where: { id },
      data: { isActive: !register.isActive },
    });
  }

  /** POST /cash-registers/:id/open — open session */
  async openSession(cashRegisterId: string, dto: OpenSessionDto, userId: string) {
    const register = await this.prisma.cashRegister.findUnique({
      where: { id: cashRegisterId },
      include: { sessions: { where: { status: 'OPEN' } } },
    });
    if (!register) throw new NotFoundException('Caja no encontrada');
    if (!register.isActive) throw new BadRequestException('Esta caja esta desactivada');

    // Only one OPEN session per register at a time
    if (register.sessions.length > 0) {
      throw new BadRequestException('Esta caja ya tiene una sesion abierta');
    }

    return this.prisma.cashSession.create({
      data: {
        cashRegisterId,
        openedById: userId,
        openingBalanceUsd: dto.openingBalanceUsd,
        openingBalanceBs: dto.openingBalanceBs,
        notes: dto.notes,
      },
      include: {
        cashRegister: true,
        openedBy: { select: { id: true, name: true } },
      },
    });
  }

  /** POST /cash-sessions/:id/close — close session */
  async closeSession(sessionId: string, dto: CloseSessionDto, userId: string) {
    const session = await this.prisma.cashSession.findUnique({
      where: { id: sessionId },
      include: { cashRegister: true },
    });
    if (!session) throw new NotFoundException('Sesion no encontrada');
    if (session.status === 'CLOSED') throw new BadRequestException('Esta sesion ya esta cerrada');

    // Get sales summary for this session
    const summary = await this.getSessionSalesData(session.id, session.cashRegisterId, session.openedAt);

    const updatedSession = await this.prisma.cashSession.update({
      where: { id: sessionId },
      data: {
        closingBalanceUsd: dto.closingBalanceUsd,
        closingBalanceBs: dto.closingBalanceBs,
        status: 'CLOSED',
        closedAt: new Date(),
        closedById: userId,
        notes: dto.notes,
      },
      include: {
        cashRegister: true,
        openedBy: { select: { id: true, name: true } },
        closedBy: { select: { id: true, name: true } },
      },
    });

    const expectedUsd = session.openingBalanceUsd + summary.totalUsd;
    const expectedBs = session.openingBalanceBs + summary.totalBs;
    const differenceUsd = dto.closingBalanceUsd - expectedUsd;
    const differenceBs = dto.closingBalanceBs - expectedBs;

    return {
      session: updatedSession,
      summary: { ...summary, expectedUsd, expectedBs, differenceUsd, differenceBs },
    };
  }

  /** GET /cash-sessions/:id/summary — detailed session report */
  async getSessionSummary(sessionId: string) {
    const session = await this.prisma.cashSession.findUnique({
      where: { id: sessionId },
      include: {
        cashRegister: true,
        openedBy: { select: { id: true, name: true } },
        closedBy: { select: { id: true, name: true } },
      },
    });
    if (!session) throw new NotFoundException('Sesion no encontrada');

    const salesData = await this.getSessionSalesData(
      session.id,
      session.cashRegisterId,
      session.openedAt,
      session.closedAt || undefined,
    );

    const expectedUsd = session.openingBalanceUsd + salesData.totalUsd;
    const expectedBs = session.openingBalanceBs + salesData.totalBs;
    const differenceUsd = session.closingBalanceUsd != null
      ? session.closingBalanceUsd - expectedUsd
      : null;
    const differenceBs = session.closingBalanceBs != null
      ? session.closingBalanceBs - expectedBs
      : null;

    return {
      session,
      ...salesData,
      expectedUsd,
      expectedBs,
      differenceUsd,
      differenceBs,
    };
  }

  /** GET /cash-registers/:id/sessions — closed sessions history */
  async findRegisterSessions(cashRegisterId: string) {
    return this.prisma.cashSession.findMany({
      where: { cashRegisterId },
      include: {
        openedBy: { select: { id: true, name: true } },
        closedBy: { select: { id: true, name: true } },
      },
      orderBy: { openedAt: 'desc' },
      take: 100,
    });
  }

  /** GET /cash-sessions — global sessions with filters */
  async findAllSessions(filters: {
    cashRegisterId?: string;
    userId?: string;
    status?: string;
    from?: string;
    to?: string;
  }) {
    const where: any = {};
    if (filters.cashRegisterId) where.cashRegisterId = filters.cashRegisterId;
    if (filters.userId) {
      where.OR = [
        { openedById: filters.userId },
        { closedById: filters.userId },
      ];
    }
    if (filters.status) where.status = filters.status;
    if (filters.from || filters.to) {
      where.openedAt = {};
      if (filters.from) where.openedAt.gte = new Date(filters.from);
      if (filters.to) {
        const toDate = new Date(filters.to);
        toDate.setUTCHours(23, 59, 59, 999);
        where.openedAt.lte = toDate;
      }
    }

    return this.prisma.cashSession.findMany({
      where,
      include: {
        cashRegister: { select: { id: true, name: true, code: true } },
        openedBy: { select: { id: true, name: true } },
        closedBy: { select: { id: true, name: true } },
      },
      orderBy: { openedAt: 'desc' },
      take: 100,
    });
  }

  /** GET /cash-sessions/:sessionId/payments — paginated payments for a session */
  async findSessionPayments(
    sessionId: string,
    page: number = 1,
    methodId?: string,
  ) {
    const session = await this.prisma.cashSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) throw new NotFoundException('Sesion no encontrada');

    const invoiceWhere: any = {
      cashRegisterId: session.cashRegisterId,
      createdAt: { gte: session.openedAt },
      status: { in: ['PAID', 'CREDIT'] },
    };
    if (session.closedAt) {
      invoiceWhere.createdAt.lte = session.closedAt;
    }

    // Get invoice IDs for this session
    const invoices = await this.prisma.invoice.findMany({
      where: invoiceWhere,
      select: { id: true },
    });
    const invoiceIds = invoices.map(i => i.id);

    const paymentWhere: any = {
      invoiceId: { in: invoiceIds },
    };
    if (methodId) paymentWhere.methodId = methodId;

    const take = 20;
    const skip = (page - 1) * take;

    const [payments, total] = await Promise.all([
      this.prisma.payment.findMany({
        where: paymentWhere,
        include: {
          method: { select: { id: true, name: true } },
          invoice: {
            select: {
              id: true,
              number: true,
              customer: { select: { name: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
      this.prisma.payment.count({ where: paymentWhere }),
    ]);

    return {
      data: payments,
      total,
      page,
      totalPages: Math.ceil(total / take),
    };
  }

  /** Helper: aggregate sales data for a session period */
  private async getSessionSalesData(
    sessionId: string,
    cashRegisterId: string,
    openedAt: Date,
    closedAt?: Date,
  ) {
    const where: any = {
      cashRegisterId,
      createdAt: { gte: openedAt },
      status: { in: ['PAID', 'CREDIT'] },
    };
    if (closedAt) {
      where.createdAt.lte = closedAt;
    }

    const invoices = await this.prisma.invoice.findMany({
      where,
      include: { payments: { include: { method: true } } },
    });

    const byMethod: Record<string, { methodName: string; count: number; totalUsd: number; totalBs: number }> = {};

    for (const inv of invoices) {
      for (const p of inv.payments) {
        const methodName = (p as any).method?.name || p.methodId;
        if (!byMethod[methodName]) {
          byMethod[methodName] = { methodName, count: 0, totalUsd: 0, totalBs: 0 };
        }
        byMethod[methodName].count += 1;
        byMethod[methodName].totalUsd += p.amountUsd;
        byMethod[methodName].totalBs += p.amountBs;
      }
    }

    const session = await this.prisma.cashSession.findUnique({ where: { id: sessionId } });

    return {
      openingBalanceUsd: session?.openingBalanceUsd || 0,
      openingBalanceBs: session?.openingBalanceBs || 0,
      invoiceCount: invoices.length,
      totalUsd: invoices.reduce((s, i) => s + i.totalUsd, 0),
      totalBs: invoices.reduce((s, i) => s + i.totalBs, 0),
      paymentsByMethod: Object.values(byMethod),
    };
  }
}
