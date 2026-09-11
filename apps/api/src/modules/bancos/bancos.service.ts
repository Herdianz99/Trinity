import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { writeBankMovement } from '../../common/bank-ledger';
import { caracasDayStart, caracasDayEnd } from '../../common/timezone';
import { CreateBankAccountDto } from './dto/create-bank-account.dto';
import { CreateBankMovementDto, CreateTransferDto } from './dto/create-bank-movement.dto';
import { QueryMovementsDto } from './dto/query-movements.dto';
import { ReconcileDto } from './dto/reconcile.dto';

const r2 = (n: number) => Math.round((n || 0) * 100) / 100;

@Injectable()
export class BancosService {
  constructor(private prisma: PrismaService) {}

  // ---- Cuentas ----
  async listAccounts() {
    return this.prisma.bankAccount.findMany({
      orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      include: { paymentMethods: { select: { id: true, name: true } } },
    });
  }

  async createAccount(dto: CreateBankAccountDto) {
    const rate = dto.exchangeRate ?? 0;
    const opening = dto.openingBalance ?? 0;
    const openingBs = dto.currency === 'USD' ? r2(opening * rate) : r2(opening);
    const openingUsd = dto.currency === 'USD' ? r2(opening) : rate ? r2(opening / rate) : 0;
    return this.prisma.bankAccount.create({
      data: {
        name: dto.name.trim(),
        bankName: dto.bankName.trim(),
        accountNumber: dto.accountNumber?.trim() || null,
        accountType: dto.accountType,
        currency: dto.currency,
        openingBalance: r2(opening),
        openingBalanceBs: openingBs,
        openingBalanceUsd: openingUsd,
        openingDate: dto.openingDate ? new Date(dto.openingDate) : null,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async updateAccount(id: string, dto: Partial<CreateBankAccountDto>) {
    const acc = await this.prisma.bankAccount.findUnique({ where: { id } });
    if (!acc) throw new NotFoundException('Cuenta no encontrada');
    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.bankName !== undefined) data.bankName = dto.bankName.trim();
    if (dto.accountNumber !== undefined) data.accountNumber = dto.accountNumber?.trim() || null;
    if (dto.accountType !== undefined) data.accountType = dto.accountType;
    if (dto.currency !== undefined) data.currency = dto.currency;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.openingBalance !== undefined) {
      const rate = dto.exchangeRate ?? 0;
      const cur = dto.currency ?? acc.currency;
      data.openingBalance = r2(dto.openingBalance);
      data.openingBalanceBs = cur === 'USD' ? r2(dto.openingBalance * rate) : r2(dto.openingBalance);
      data.openingBalanceUsd = cur === 'USD' ? r2(dto.openingBalance) : rate ? r2(dto.openingBalance / rate) : 0;
    }
    if (dto.openingDate !== undefined) data.openingDate = dto.openingDate ? new Date(dto.openingDate) : null;
    return this.prisma.bankAccount.update({ where: { id }, data });
  }

  // Saldo actual de una cuenta = saldo inicial + Σ (IN - OUT) en la moneda de la cuenta
  private async computeBalance(accountId: string, opening: number) {
    const agg = await this.prisma.bankMovement.groupBy({
      by: ['direction'],
      where: { bankAccountId: accountId },
      _sum: { amount: true },
    });
    const inSum = agg.find((a) => a.direction === 'IN')?._sum.amount ?? 0;
    const outSum = agg.find((a) => a.direction === 'OUT')?._sum.amount ?? 0;
    return r2(opening + inSum - outSum);
  }

  private async reconciledBalance(accountId: string, opening: number) {
    const agg = await this.prisma.bankMovement.groupBy({
      by: ['direction'],
      where: { bankAccountId: accountId, reconciled: true },
      _sum: { amount: true },
    });
    const inSum = agg.find((a) => a.direction === 'IN')?._sum.amount ?? 0;
    const outSum = agg.find((a) => a.direction === 'OUT')?._sum.amount ?? 0;
    return r2(opening + inSum - outSum);
  }

  async summary() {
    const accounts = await this.prisma.bankAccount.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    const rows = [];
    for (const a of accounts) {
      const balance = await this.computeBalance(a.id, a.openingBalance);
      const pending = await this.prisma.bankMovement.count({
        where: { bankAccountId: a.id, reconciled: false },
      });
      rows.push({
        id: a.id,
        name: a.name,
        bankName: a.bankName,
        currency: a.currency,
        accountType: a.accountType,
        balance,
        pendingCount: pending,
      });
    }
    const totalBs = rows.filter((r) => r.currency === 'VES').reduce((s, r) => s + r.balance, 0);
    const totalUsd = rows.filter((r) => r.currency === 'USD').reduce((s, r) => s + r.balance, 0);
    const methodsSinCuenta = await this.prisma.paymentMethod.count({
      where: { isActive: true, isCash: false, bankAccountId: null },
    });
    return { accounts: rows, totalBs: r2(totalBs), totalUsd: r2(totalUsd), methodsSinCuenta };
  }

  // ---- Libro banco de una cuenta ----
  async ledger(accountId: string, q: QueryMovementsDto) {
    const acc = await this.prisma.bankAccount.findUnique({ where: { id: accountId } });
    if (!acc) throw new NotFoundException('Cuenta no encontrada');
    const where: any = { bankAccountId: accountId };
    if (q.from) where.date = { ...(where.date || {}), gte: caracasDayStart(q.from) };
    if (q.to) where.date = { ...(where.date || {}), lte: caracasDayEnd(q.to) };
    if (q.type) where.type = q.type;
    if (q.status === 'reconciled') where.reconciled = true;
    if (q.status === 'pending') where.reconciled = false;

    const movements = await this.prisma.bankMovement.findMany({
      where,
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    });
    // saldo corriente acumulado
    let running = acc.openingBalance;
    const rows = movements.map((m) => {
      running = r2(running + (m.direction === 'IN' ? m.amount : -m.amount));
      return { ...m, runningBalance: running };
    });
    const balance = await this.computeBalance(accountId, acc.openingBalance);
    const reconciledBalance = await this.reconciledBalance(accountId, acc.openingBalance);
    return { account: acc, movements: rows, balance, reconciledBalance };
  }

  // ---- Movimiento manual (comision, IGTF, interes, notas, ajuste) ----
  async createManualMovement(dto: CreateBankMovementDto, userId: string) {
    const acc = await this.prisma.bankAccount.findUnique({ where: { id: dto.bankAccountId } });
    if (!acc) throw new BadRequestException('Cuenta no valida');
    const rate = dto.exchangeRate ?? 0;
    const amountBs = acc.currency === 'USD' ? r2(dto.amount * rate) : r2(dto.amount);
    const amountUsd = acc.currency === 'USD' ? r2(dto.amount) : rate ? r2(dto.amount / rate) : 0;
    return this.prisma.bankMovement.create({
      data: {
        bankAccountId: dto.bankAccountId,
        date: new Date(dto.date),
        direction: dto.direction,
        amount: r2(dto.amount),
        amountBs,
        amountUsd,
        exchangeRate: rate,
        type: dto.type,
        reference: dto.reference?.trim() || null,
        description: dto.description?.trim() || null,
        sourceType: 'MANUAL',
        createdById: userId,
      },
    });
  }

  // ---- Traspaso entre cuentas propias (2 patas en 1 transaccion) ----
  async createTransfer(dto: CreateTransferDto, userId: string) {
    if (dto.fromAccountId === dto.toAccountId) throw new BadRequestException('Las cuentas deben ser distintas');
    const [from, to] = await Promise.all([
      this.prisma.bankAccount.findUnique({ where: { id: dto.fromAccountId } }),
      this.prisma.bankAccount.findUnique({ where: { id: dto.toAccountId } }),
    ]);
    if (!from || !to) throw new BadRequestException('Cuenta no valida');
    const rate = dto.exchangeRate ?? 0;
    const groupId = `TR-${userId}-${dto.date}-${r2(dto.amountFrom)}`;
    const date = new Date(dto.date);
    const bsOf = (amt: number, cur: string) => (cur === 'USD' ? r2(amt * rate) : r2(amt));
    const usdOf = (amt: number, cur: string) => (cur === 'USD' ? r2(amt) : rate ? r2(amt / rate) : 0);
    return this.prisma.$transaction(async (tx) => {
      await writeBankMovement(tx, {
        bankAccountId: from.id,
        date,
        direction: 'OUT',
        amount: r2(dto.amountFrom),
        amountBs: bsOf(dto.amountFrom, from.currency),
        amountUsd: usdOf(dto.amountFrom, from.currency),
        exchangeRate: rate,
        type: 'TRASPASO',
        reference: dto.reference ?? null,
        description: dto.description ?? `Traspaso a ${to.name}`,
        sourceType: 'MANUAL',
        transferGroupId: groupId,
        createdById: userId,
      });
      await writeBankMovement(tx, {
        bankAccountId: to.id,
        date,
        direction: 'IN',
        amount: r2(dto.amountTo),
        amountBs: bsOf(dto.amountTo, to.currency),
        amountUsd: usdOf(dto.amountTo, to.currency),
        exchangeRate: rate,
        type: 'TRASPASO',
        reference: dto.reference ?? null,
        description: dto.description ?? `Traspaso desde ${from.name}`,
        sourceType: 'MANUAL',
        transferGroupId: groupId,
        createdById: userId,
      });
      return { ok: true, transferGroupId: groupId };
    });
  }

  // Borrar un movimiento manual (solo si no esta conciliado)
  async deleteMovement(id: string) {
    const m = await this.prisma.bankMovement.findUnique({ where: { id } });
    if (!m) throw new NotFoundException('Movimiento no encontrado');
    if (m.reconciled) throw new BadRequestException('No se puede borrar un movimiento conciliado; desconcilialo primero');
    if (m.sourceType !== 'MANUAL') throw new BadRequestException('Solo se pueden borrar movimientos manuales');
    await this.prisma.bankMovement.delete({ where: { id } });
    return { ok: true };
  }

  // ---- Conciliacion (check-off) ----
  async reconcile(dto: ReconcileDto, userId: string) {
    const statementDate = dto.statementDate ? new Date(dto.statementDate) : null;
    await this.prisma.bankMovement.updateMany({
      where: { id: { in: dto.movementIds } },
      data: dto.reconciled
        ? { reconciled: true, reconciledAt: new Date(), reconciledById: userId, statementDate }
        : { reconciled: false, reconciledAt: null, reconciledById: null, statementDate: null },
    });
    return { ok: true, count: dto.movementIds.length };
  }
}
