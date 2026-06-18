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
        serie: { select: { id: true, name: true, prefix: true, isFiscal: true, isVatExempt: true, comPort: true, fiscalMachineSerial: true } },
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
        serie: { select: { id: true, name: true, prefix: true, isFiscal: true, isVatExempt: true, comPort: true, fiscalMachineSerial: true } },
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
        serie: { select: { id: true, name: true, prefix: true, isFiscal: true, isVatExempt: true, comPort: true, fiscalMachineSerial: true } },
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
        isShared: dto.isShared ?? false,
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
        isShared: dto.isShared,
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

    // El esperado del arqueo es SOLO el efectivo fisico (gaveta), por moneda.
    const expectedUsd = summary.cashExpectedUsd;
    const expectedBs = summary.cashExpectedBs;
    const differenceUsd = Math.round((dto.closingBalanceUsd - expectedUsd) * 100) / 100;
    const differenceBs = Math.round((dto.closingBalanceBs - expectedBs) * 100) / 100;

    const updatedSession = await this.prisma.cashSession.update({
      where: { id: sessionId },
      data: {
        closingBalanceUsd: dto.closingBalanceUsd,
        closingBalanceBs: dto.closingBalanceBs,
        expectedUsd,
        expectedBs,
        differenceUsd,
        differenceBs,
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

    // Para sesiones cerradas, preferir el snapshot persistido al cierre (auditoria inmutable).
    // Para sesiones abiertas, calcular el efectivo esperado en vivo.
    const expectedUsd = session.expectedUsd ?? salesData.cashExpectedUsd;
    const expectedBs = session.expectedBs ?? salesData.cashExpectedBs;
    const differenceUsd = session.differenceUsd ?? (
      session.closingBalanceUsd != null ? Math.round((session.closingBalanceUsd - expectedUsd) * 100) / 100 : null
    );
    const differenceBs = session.differenceBs ?? (
      session.closingBalanceBs != null ? Math.round((session.closingBalanceBs - expectedBs) * 100) / 100 : null
    );

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

    // Count sales by payment date (paidAt): a seller may create a parked invoice
    // before this session opened, and the cashier cobra it inside this session.
    const invoiceWhere: any = {
      cashRegisterId: session.cashRegisterId,
      paidAt: { gte: session.openedAt },
      status: 'PAID',
    };
    if (session.closedAt) {
      invoiceWhere.paidAt.lte = session.closedAt;
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
    // Count sales by payment date (paidAt): a seller may create a parked invoice
    // before this session opened, and the cashier cobra it inside this session.
    const where: any = {
      cashRegisterId,
      paidAt: { gte: openedAt },
      status: 'PAID',
    };
    if (closedAt) {
      where.paidAt.lte = closedAt;
    }

    const invoices = await this.prisma.invoice.findMany({
      where,
      include: { payments: { include: { method: true, changeMethod: true } } },
    });

    const byMethod: Record<string, { methodName: string; isDivisa: boolean; isCash: boolean; count: number; totalUsd: number; totalBs: number }> = {};
    const electronicByMethod: Record<string, { methodName: string; isDivisa: boolean; count: number; expectedUsd: number; expectedBs: number }> = {};
    const changeOutflows: Array<{ invoiceNumber: string; changeBs: number; changeMethodName: string }> = [];
    let totalChangeBs = 0;
    let cashSalesUsd = 0; // Efectivo USD recibido (metodo isCash && isDivisa)
    let cashSalesBs = 0;  // Efectivo Bs recibido  (metodo isCash && !isDivisa)

    for (const inv of invoices) {
      for (const p of inv.payments) {
        const method = (p as any).method;
        const methodName = method?.name || p.methodId;

        // Desglose total por metodo (display) — con moneda para mostrar cada uno en su divisa
        if (!byMethod[methodName]) {
          byMethod[methodName] = { methodName, isDivisa: !!method?.isDivisa, isCash: !!method?.isCash, count: 0, totalUsd: 0, totalBs: 0 };
        }
        byMethod[methodName].count += 1;
        byMethod[methodName].totalUsd += p.amountUsd;
        byMethod[methodName].totalBs += p.amountBs;

        // Segregar efectivo de gaveta vs canales electronicos
        if (method?.isCash) {
          if (method.isDivisa) cashSalesUsd += p.amountUsd;
          else cashSalesBs += p.amountBs;
        } else {
          if (!electronicByMethod[methodName]) {
            electronicByMethod[methodName] = { methodName, isDivisa: !!method?.isDivisa, count: 0, expectedUsd: 0, expectedBs: 0 };
          }
          electronicByMethod[methodName].count += 1;
          electronicByMethod[methodName].expectedUsd += p.amountUsd;
          electronicByMethod[methodName].expectedBs += p.amountBs;
        }

        // Vuelto (sale de la gaveta en Bs)
        if ((p as any).changeAmountBs > 0) {
          changeOutflows.push({
            invoiceNumber: inv.number || 'S/N',
            changeBs: (p as any).changeAmountBs,
            changeMethodName: (p as any).changeMethod?.name || 'Efectivo Bs',
          });
          totalChangeBs += (p as any).changeAmountBs;
        }
      }
    }

    const session = await this.prisma.cashSession.findUnique({ where: { id: sessionId } });

    // Get cash movements for this session
    const cashMovements = await this.prisma.cashMovement.findMany({
      where: { cashSessionId: sessionId },
      include: {
        createdBy: { select: { id: true, name: true } },
        expense: { select: { id: true, description: true, category: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });

    let movementsIncomeUsd = 0;
    let movementsIncomeBs = 0;
    let movementsExpenseUsd = 0;
    let movementsExpenseBs = 0;
    // Segregados por moneda real del movimiento (para el efectivo esperado en gaveta)
    let movInCashUsd = 0, movInCashBs = 0, movOutCashUsd = 0, movOutCashBs = 0;

    for (const mov of cashMovements) {
      const isUsd = mov.currency === 'USD';
      if (mov.type === 'INCOME') {
        movementsIncomeUsd += mov.amountUsd;
        movementsIncomeBs += mov.amountBs;
        if (isUsd) movInCashUsd += mov.amountUsd; else movInCashBs += mov.amountBs;
      } else {
        movementsExpenseUsd += mov.amountUsd;
        movementsExpenseBs += mov.amountBs;
        if (isUsd) movOutCashUsd += mov.amountUsd; else movOutCashBs += mov.amountBs;
      }
    }

    const salesTotalUsd = invoices.reduce((s, i) => s + i.totalUsd, 0);
    const salesTotalBs = invoices.reduce((s, i) => s + i.totalBs, 0);

    const openingUsd = session?.openingBalanceUsd || 0;
    const openingBs = session?.openingBalanceBs || 0;

    // Efectivo fisico esperado en gaveta (lo que de verdad se arquea)
    const cashExpectedUsd = Math.round((openingUsd + cashSalesUsd + movInCashUsd - movOutCashUsd) * 100) / 100;
    const cashExpectedBs = Math.round((openingBs + cashSalesBs - totalChangeBs + movInCashBs - movOutCashBs) * 100) / 100;

    return {
      openingBalanceUsd: openingUsd,
      openingBalanceBs: openingBs,
      invoiceCount: invoices.length,
      totalUsd: salesTotalUsd + movementsIncomeUsd - movementsExpenseUsd,
      totalBs: salesTotalBs + movementsIncomeBs - movementsExpenseBs,
      salesTotalUsd: salesTotalUsd,
      salesTotalBs: salesTotalBs,
      paymentsByMethod: Object.values(byMethod),
      // Efectivo de gaveta (esperado por moneda) y canales electronicos (informativo)
      cashSalesUsd: Math.round(cashSalesUsd * 100) / 100,
      cashSalesBs: Math.round(cashSalesBs * 100) / 100,
      cashExpectedUsd,
      cashExpectedBs,
      electronicByMethod: Object.values(electronicByMethod),
      changeOutflows,
      totalChangeBs,
      cashMovements,
      movementsIncomeUsd: Math.round(movementsIncomeUsd * 100) / 100,
      movementsIncomeBs: Math.round(movementsIncomeBs * 100) / 100,
      movementsExpenseUsd: Math.round(movementsExpenseUsd * 100) / 100,
      movementsExpenseBs: Math.round(movementsExpenseBs * 100) / 100,
    };
  }
}
