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
    const changeOutflows: Array<{ invoiceNumber: string; changeBs: number; changeMethodName: string; isCash: boolean }> = [];
    let totalChangeBs = 0;   // todos los vueltos (para mostrar el detalle)
    let cashChangeBs = 0;    // solo los vueltos que salieron de la gaveta (metodo de vuelto en efectivo)
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

        // Vuelto: solo descuenta de la gaveta si el metodo de vuelto es efectivo (isCash).
        // Si se dio por un canal no-efectivo (ej. pago movil), reduce ESE canal, no la gaveta.
        if ((p as any).changeAmountBs > 0) {
          const changeMethod = (p as any).changeMethod;
          // changeMethod null (datos viejos) se asume efectivo Bs, como antes.
          const isCashChange = changeMethod ? !!changeMethod.isCash : true;
          const changeName = changeMethod?.name || 'Efectivo Bs';
          changeOutflows.push({
            invoiceNumber: inv.number || 'S/N',
            changeBs: (p as any).changeAmountBs,
            changeMethodName: changeName,
            isCash: isCashChange,
          });
          totalChangeBs += (p as any).changeAmountBs;
          if (isCashChange) {
            cashChangeBs += (p as any).changeAmountBs;
          } else {
            // Egreso por canal electronico: reduce el esperado de ese canal
            if (!electronicByMethod[changeName]) {
              electronicByMethod[changeName] = { methodName: changeName, isDivisa: !!changeMethod?.isDivisa, count: 0, expectedUsd: 0, expectedBs: 0 };
            }
            electronicByMethod[changeName].expectedBs -= (p as any).changeAmountBs;
          }
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
    const cashExpectedBs = Math.round((openingBs + cashSalesBs - cashChangeBs + movInCashBs - movOutCashBs) * 100) / 100;

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
      cashChangeBs: Math.round(cashChangeBs * 100) / 100,
      cashMovements,
      movementsIncomeUsd: Math.round(movementsIncomeUsd * 100) / 100,
      movementsIncomeBs: Math.round(movementsIncomeBs * 100) / 100,
      movementsExpenseUsd: Math.round(movementsExpenseUsd * 100) / 100,
      movementsExpenseBs: Math.round(movementsExpenseBs * 100) / 100,
    };
  }

  /**
   * Vista GLOBAL de movimientos de caja (cruza cajas y sesiones).
   * Solo lee y refleja lo que YA toca la caja hoy: pagos de ventas (Payment de
   * Invoice cobrada dentro de la ventana de una sesion) + movimientos manuales
   * de gaveta (CashMovement: ingresos/egresos/gastos/anticipos). NO incluye
   * cobros CxC / pagos CxP / compras porque hoy esos no generan CashMovement
   * (ver pendiente en PROGRESS.md). El "cajero" es el dueno de la sesion.
   */
  async getGlobalMovementsData(filters: {
    cashRegisterId?: string;
    userId?: string;
    from?: string;
    to?: string;
    methodIds?: string[];
  }) {
    // Rango por timestamp del propio movimiento (no por ventana de sesion)
    let fromDate: Date | undefined;
    let toDate: Date | undefined;
    if (filters.from) {
      fromDate = new Date(filters.from);
      fromDate.setUTCHours(0, 0, 0, 0);
    }
    if (filters.to) {
      toDate = new Date(filters.to);
      toDate.setUTCHours(23, 59, 59, 999);
    }

    const methodSet =
      filters.methodIds && filters.methodIds.length ? new Set(filters.methodIds) : null;

    // Sesiones candidatas: por caja, cajero (dueno) y solapamiento con el rango
    const sessionWhere: any = {};
    if (filters.cashRegisterId) sessionWhere.cashRegisterId = filters.cashRegisterId;
    if (filters.userId) sessionWhere.openedById = filters.userId;
    if (fromDate || toDate) {
      const and: any[] = [];
      if (toDate) and.push({ openedAt: { lte: toDate } });
      if (fromDate) and.push({ OR: [{ closedAt: null }, { closedAt: { gte: fromDate } }] });
      if (and.length) sessionWhere.AND = and;
    }

    const sessions = await this.prisma.cashSession.findMany({
      where: sessionWhere,
      include: {
        cashRegister: { select: { id: true, name: true, code: true } },
        openedBy: { select: { id: true, name: true } },
      },
      orderBy: { openedAt: 'desc' },
    });

    const meta = await this.buildGlobalMeta(filters);
    const emptySummary = {
      paymentCount: 0, paymentUsd: 0, paymentBs: 0,
      incomeUsd: 0, incomeBs: 0, expenseUsd: 0, expenseBs: 0,
      movementCount: 0, byMethod: [] as any[],
    };
    if (sessions.length === 0) {
      return { rows: [] as any[], summary: emptySummary, meta };
    }

    const sessionIds = sessions.map((s) => s.id);
    const registerIds = Array.from(new Set(sessions.map((s) => s.cashRegisterId)));

    // Ventana global acotada por las sesiones seleccionadas
    const minOpened = sessions.reduce(
      (min, s) => (s.openedAt < min ? s.openedAt : min),
      sessions[0].openedAt,
    );
    const maxClosed = new Date(); // las abiertas llegan hasta ahora

    // Index de sesiones por caja para mapear pago -> sesion (no se solapan por caja)
    const sessionsByRegister = new Map<string, typeof sessions>();
    for (const s of sessions) {
      const arr = sessionsByRegister.get(s.cashRegisterId) || ([] as typeof sessions);
      arr.push(s);
      sessionsByRegister.set(s.cashRegisterId, arr);
    }
    const findSession = (registerId: string, when: Date) => {
      const arr = sessionsByRegister.get(registerId);
      if (!arr) return null;
      return (
        arr.find((s) => s.openedAt <= when && (s.closedAt ? when <= s.closedAt : true)) || null
      );
    };

    const rows: any[] = [];

    // 1) Pagos de ventas (mismo criterio que el arqueo: por paidAt en la ventana)
    const invoices = await this.prisma.invoice.findMany({
      where: {
        cashRegisterId: { in: registerIds },
        status: 'PAID',
        paidAt: { gte: minOpened, lte: maxClosed },
      },
      select: {
        id: true,
        number: true,
        cashRegisterId: true,
        paidAt: true,
        customer: { select: { name: true } },
        payments: {
          select: {
            id: true,
            methodId: true,
            reference: true,
            amountUsd: true,
            amountBs: true,
            createdAt: true,
            method: { select: { id: true, name: true, isDivisa: true, isCash: true } },
          },
        },
      },
    });

    for (const inv of invoices) {
      if (!inv.paidAt) continue;
      const session = findSession(inv.cashRegisterId, inv.paidAt);
      if (!session) continue; // pago de una sesion no seleccionada (otro cajero/caja)
      for (const p of inv.payments) {
        if (methodSet && !methodSet.has(p.methodId)) continue;
        const when = p.createdAt;
        if (fromDate && when < fromDate) continue;
        if (toDate && when > toDate) continue;
        rows.push({
          kind: 'PAYMENT',
          date: when,
          sessionId: session.id,
          cashRegisterId: session.cashRegisterId,
          cashRegisterName: session.cashRegister?.name || '',
          cashierName: session.openedBy?.name || '',
          methodId: p.methodId,
          methodName: p.method?.name || p.methodId,
          isDivisa: !!p.method?.isDivisa,
          isCash: !!p.method?.isCash,
          invoiceNumber: inv.number || 'S/N',
          customerName: inv.customer?.name || 'Sin cliente',
          reference: p.reference || null,
          amountUsd: p.amountUsd,
          amountBs: p.amountBs,
        });
      }
    }

    // 2) Movimientos manuales de gaveta (solo si NO se filtra por metodo de pago)
    if (!methodSet) {
      const movements = await this.prisma.cashMovement.findMany({
        where: { cashSessionId: { in: sessionIds } },
        include: {
          createdBy: { select: { name: true } },
          expense: { select: { description: true, category: { select: { name: true } } } },
          cashSession: {
            select: {
              cashRegisterId: true,
              cashRegister: { select: { name: true } },
              openedBy: { select: { name: true } },
            },
          },
        },
      });
      for (const m of movements) {
        const when = m.createdAt;
        if (fromDate && when < fromDate) continue;
        if (toDate && when > toDate) continue;
        const concept =
          m.reason || m.expense?.description || m.expense?.category?.name || '—';
        rows.push({
          kind: 'MOVEMENT',
          date: when,
          sessionId: m.cashSessionId,
          cashRegisterId: m.cashSession?.cashRegisterId,
          cashRegisterName: m.cashSession?.cashRegister?.name || '',
          cashierName: m.cashSession?.openedBy?.name || '',
          movementType: m.type, // INCOME | EXPENSE
          concept,
          userName: m.createdBy?.name || '',
          currency: m.currency,
          amountUsd: m.amountUsd,
          amountBs: m.amountBs,
        });
      }
    }

    rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Resumen del set filtrado completo
    const round = (n: number) => Math.round(n * 100) / 100;
    const byMethod: Record<string, { methodName: string; count: number; totalUsd: number; totalBs: number }> = {};
    const summary = { ...emptySummary, byMethod: [] as any[] };
    let paymentUsd = 0, paymentBs = 0, incomeUsd = 0, incomeBs = 0, expenseUsd = 0, expenseBs = 0;
    for (const r of rows) {
      if (r.kind === 'PAYMENT') {
        summary.paymentCount += 1;
        paymentUsd += r.amountUsd;
        paymentBs += r.amountBs;
        if (!byMethod[r.methodName]) byMethod[r.methodName] = { methodName: r.methodName, count: 0, totalUsd: 0, totalBs: 0 };
        byMethod[r.methodName].count += 1;
        byMethod[r.methodName].totalUsd += r.amountUsd;
        byMethod[r.methodName].totalBs += r.amountBs;
      } else {
        summary.movementCount += 1;
        if (r.movementType === 'INCOME') { incomeUsd += r.amountUsd; incomeBs += r.amountBs; }
        else { expenseUsd += r.amountUsd; expenseBs += r.amountBs; }
      }
    }
    summary.paymentUsd = round(paymentUsd);
    summary.paymentBs = round(paymentBs);
    summary.incomeUsd = round(incomeUsd);
    summary.incomeBs = round(incomeBs);
    summary.expenseUsd = round(expenseUsd);
    summary.expenseBs = round(expenseBs);
    summary.byMethod = Object.values(byMethod)
      .map((m) => ({ ...m, totalUsd: round(m.totalUsd), totalBs: round(m.totalBs) }))
      .sort((a, b) => a.methodName.localeCompare(b.methodName));

    return { rows, summary, meta };
  }

  /** Etiquetas legibles de los filtros activos (para el encabezado del PDF/UI) */
  private async buildGlobalMeta(filters: {
    cashRegisterId?: string;
    userId?: string;
    from?: string;
    to?: string;
    methodIds?: string[];
  }) {
    let registerName: string | null = null;
    if (filters.cashRegisterId) {
      const r = await this.prisma.cashRegister.findUnique({
        where: { id: filters.cashRegisterId },
        select: { name: true },
      });
      registerName = r?.name || null;
    }
    let cashierName: string | null = null;
    if (filters.userId) {
      const u = await this.prisma.user.findUnique({
        where: { id: filters.userId },
        select: { name: true },
      });
      cashierName = u?.name || null;
    }
    let methodNames: string[] = [];
    if (filters.methodIds && filters.methodIds.length) {
      const ms = await this.prisma.paymentMethod.findMany({
        where: { id: { in: filters.methodIds } },
        select: { name: true },
      });
      methodNames = ms.map((m) => m.name);
    }
    return { registerName, cashierName, methodNames, from: filters.from || null, to: filters.to || null };
  }

  /** GET /cash/movements — vista global paginada */
  async findGlobalMovements(
    filters: {
      cashRegisterId?: string;
      userId?: string;
      from?: string;
      to?: string;
      methodIds?: string[];
    },
    page: number = 1,
  ) {
    const { rows, summary, meta } = await this.getGlobalMovementsData(filters);
    const take = 50;
    const total = rows.length;
    const safePage = page < 1 ? 1 : page;
    const start = (safePage - 1) * take;
    return {
      data: rows.slice(start, start + take),
      total,
      page: safePage,
      totalPages: Math.max(1, Math.ceil(total / take)),
      summary,
      meta,
    };
  }
}
