import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OpenSessionDto } from './dto/open-session.dto';
import { CloseSessionDto } from './dto/close-session.dto';
import { CreateCashRegisterDto } from './dto/create-cash-register.dto';

@Injectable()
export class CashRegistersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.cashRegister.findMany({
      where: { isActive: true },
      include: {
        sessions: {
          where: { status: 'OPEN' },
          include: { openedBy: { select: { id: true, name: true } } },
        },
      },
      orderBy: { code: 'asc' },
    });
  }

  async findAllAdmin() {
    return this.prisma.cashRegister.findMany({
      include: {
        sessions: {
          where: { status: 'OPEN' },
          include: { openedBy: { select: { id: true, name: true } } },
        },
        _count: { select: { invoices: true } },
      },
      orderBy: { code: 'asc' },
    });
  }

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
        comPort: dto.comPort,
      },
    });
  }

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
        isFiscal: dto.isFiscal,
        comPort: dto.comPort,
      },
    });
  }

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

  async findAllSessions(cashRegisterId?: string, status?: string) {
    const where: any = {};
    if (cashRegisterId) where.cashRegisterId = cashRegisterId;
    if (status) where.status = status;

    return this.prisma.cashSession.findMany({
      where,
      include: {
        cashRegister: { select: { id: true, name: true, code: true } },
        openedBy: { select: { id: true, name: true } },
        closedBy: { select: { id: true, name: true } },
      },
      orderBy: { openedAt: 'desc' },
      take: 50,
    });
  }

  async findOpen() {
    return this.prisma.cashRegister.findMany({
      where: {
        isActive: true,
        sessions: { some: { status: 'OPEN' } },
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

  async findOne(id: string) {
    const register = await this.prisma.cashRegister.findUnique({
      where: { id },
      include: {
        sessions: {
          where: { status: 'OPEN' },
          include: { openedBy: { select: { id: true, name: true } } },
        },
      },
    });
    if (!register) throw new NotFoundException('Caja no encontrada');

    // Get today's sales summary
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

    const invoices = await this.prisma.invoice.findMany({
      where: {
        cashRegisterId: id,
        createdAt: { gte: today, lt: tomorrow },
        status: { in: ['PAID', 'CREDIT'] },
      },
      include: { payments: true },
    });

    const todaySummary = {
      invoiceCount: invoices.length,
      totalUsd: invoices.reduce((s, i) => s + i.totalUsd, 0),
      totalBs: invoices.reduce((s, i) => s + i.totalBs, 0),
    };

    return { ...register, todaySummary };
  }

  async openSession(cashRegisterId: string, dto: OpenSessionDto, userId: string) {
    const register = await this.prisma.cashRegister.findUnique({
      where: { id: cashRegisterId },
    });
    if (!register) throw new NotFoundException('Caja no encontrada');
    if (!register.isActive) throw new BadRequestException('Esta caja está desactivada');

    const session = await this.prisma.cashSession.create({
      data: {
        cashRegisterId,
        openedById: userId,
        openingBalance: dto.openingBalance,
        notes: dto.notes,
      },
      include: {
        cashRegister: true,
        openedBy: { select: { id: true, name: true } },
      },
    });

    return session;
  }

  async closeSession(sessionId: string, dto: CloseSessionDto, userId: string) {
    const session = await this.prisma.cashSession.findUnique({
      where: { id: sessionId },
      include: { cashRegister: true },
    });
    if (!session) throw new NotFoundException('Sesión no encontrada');
    if (session.status === 'CLOSED') throw new BadRequestException('Esta sesión ya está cerrada');

    // Get sales summary for this session period
    const summary = await this.getSessionSalesData(session.id, session.cashRegisterId, session.openedAt);

    const updatedSession = await this.prisma.cashSession.update({
      where: { id: sessionId },
      data: {
        closingBalance: dto.closingBalance,
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

    const expectedBalance = session.openingBalance + summary.totalUsd;
    const difference = dto.closingBalance - expectedBalance;

    return { session: updatedSession, summary: { ...summary, expectedBalance, difference } };
  }

  async getSessionSummary(sessionId: string) {
    const session = await this.prisma.cashSession.findUnique({
      where: { id: sessionId },
      include: {
        cashRegister: true,
        openedBy: { select: { id: true, name: true } },
        closedBy: { select: { id: true, name: true } },
      },
    });
    if (!session) throw new NotFoundException('Sesión no encontrada');

    const salesData = await this.getSessionSalesData(
      session.id,
      session.cashRegisterId,
      session.openedAt,
      session.closedAt || undefined,
    );

    const expectedBalance = session.openingBalance + salesData.totalUsd;
    const difference = session.closingBalance != null
      ? session.closingBalance - expectedBalance
      : null;

    return {
      session,
      ...salesData,
      expectedBalance,
      difference,
    };
  }

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

    const byMethod: Record<string, { method: string; count: number; totalUsd: number; totalBs: number }> = {};

    for (const inv of invoices) {
      for (const p of inv.payments) {
        const methodName = (p as any).method?.name || p.methodId;
        if (!byMethod[methodName]) {
          byMethod[methodName] = { method: methodName, count: 0, totalUsd: 0, totalBs: 0 };
        }
        byMethod[methodName].count += 1;
        byMethod[methodName].totalUsd += p.amountUsd;
        byMethod[methodName].totalBs += p.amountBs;
      }
    }

    return {
      openingBalance: (await this.prisma.cashSession.findUnique({ where: { id: sessionId } }))?.openingBalance || 0,
      invoiceCount: invoices.length,
      totalUsd: invoices.reduce((s, i) => s + i.totalUsd, 0),
      totalBs: invoices.reduce((s, i) => s + i.totalBs, 0),
      totalSalesByMethod: Object.values(byMethod),
    };
  }
}
