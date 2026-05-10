import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OpenSessionDto } from './dto/open-session.dto';
import { CloseSessionDto } from './dto/close-session.dto';

@Injectable()
export class CashRegistersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.cashRegister.findMany({
      where: { isActive: true },
      include: {
        sessions: {
          where: { status: 'OPEN' },
          take: 1,
        },
      },
      orderBy: { code: 'asc' },
    });
  }

  async getActiveSession(userId: string) {
    const session = await this.prisma.cashSession.findFirst({
      where: { userId, status: 'OPEN' },
      include: { cashRegister: true },
    });
    return session;
  }

  async openSession(cashRegisterId: string, dto: OpenSessionDto, userId: string) {
    const register = await this.prisma.cashRegister.findUnique({
      where: { id: cashRegisterId },
    });
    if (!register) throw new NotFoundException('Caja no encontrada');
    if (!register.isActive) throw new BadRequestException('Esta caja está desactivada');

    const existingSession = await this.prisma.cashSession.findFirst({
      where: { cashRegisterId, status: 'OPEN' },
    });
    if (existingSession) {
      throw new BadRequestException('Ya hay una sesión activa en esta caja');
    }

    const userSession = await this.prisma.cashSession.findFirst({
      where: { userId, status: 'OPEN' },
    });
    if (userSession) {
      throw new BadRequestException('Ya tienes una sesión activa en otra caja');
    }

    const [session] = await this.prisma.$transaction([
      this.prisma.cashSession.create({
        data: {
          cashRegisterId,
          userId,
          openingBalance: dto.openingBalance,
          notes: dto.notes,
        },
        include: { cashRegister: true },
      }),
      this.prisma.cashRegister.update({
        where: { id: cashRegisterId },
        data: { currentUserId: userId, openedAt: new Date() },
      }),
    ]);

    return session;
  }

  async closeSession(cashRegisterId: string, dto: CloseSessionDto, userId: string) {
    const session = await this.prisma.cashSession.findFirst({
      where: { cashRegisterId, userId, status: 'OPEN' },
    });
    if (!session) {
      throw new BadRequestException('No tienes una sesión activa en esta caja');
    }

    // Get sales summary for this session
    const invoices = await this.prisma.invoice.findMany({
      where: {
        cashRegisterId,
        createdAt: { gte: session.openedAt },
        status: { in: ['PAID', 'CREDIT'] },
      },
      include: { payments: true },
    });

    const summary = {
      totalInvoices: invoices.length,
      totalUsd: invoices.reduce((s, i) => s + i.totalUsd, 0),
      totalBs: invoices.reduce((s, i) => s + i.totalBs, 0),
      byMethod: {} as Record<string, { usd: number; bs: number; count: number }>,
    };

    for (const inv of invoices) {
      for (const p of inv.payments) {
        if (!summary.byMethod[p.method]) {
          summary.byMethod[p.method] = { usd: 0, bs: 0, count: 0 };
        }
        summary.byMethod[p.method].usd += p.amountUsd;
        summary.byMethod[p.method].bs += p.amountBs;
        summary.byMethod[p.method].count += 1;
      }
    }

    const [updatedSession] = await this.prisma.$transaction([
      this.prisma.cashSession.update({
        where: { id: session.id },
        data: {
          closingBalance: dto.closingBalance,
          status: 'CLOSED',
          closedAt: new Date(),
          notes: dto.notes,
        },
        include: { cashRegister: true },
      }),
      this.prisma.cashRegister.update({
        where: { id: cashRegisterId },
        data: { currentUserId: null, openedAt: null },
      }),
    ]);

    return { session: updatedSession, summary };
  }
}
