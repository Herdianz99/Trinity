import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DynamicKeysService } from '../dynamic-keys/dynamic-keys.service';
import { CreateCashMovementDto } from './dto/create-cash-movement.dto';
import { caracasDateKey } from '../../common/timezone';
import { writeCashLedger } from '../../common/cash-ledger';

@Injectable()
export class CashMovementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dynamicKeysService: DynamicKeysService,
  ) {}

  async findBySession(cashSessionId: string) {
    return this.prisma.cashMovement.findMany({
      where: { cashSessionId },
      include: {
        createdBy: { select: { id: true, name: true } },
        expense: { select: { id: true, description: true, category: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(dto: CreateCashMovementDto, userId: string) {
    // 1. Validate dynamic key
    await this.dynamicKeysService.validate({
      key: dto.dynamicKey,
      permission: 'MANUAL_CASH_MOVEMENT',
      action: `Movimiento manual de caja: ${dto.type} ${dto.amount} ${dto.currency}`,
      entityType: 'CashMovement',
    });

    // 2. Verify cash session is OPEN
    const session = await this.prisma.cashSession.findUnique({
      where: { id: dto.cashSessionId },
    });
    if (!session) throw new BadRequestException('Sesion de caja no encontrada');
    if (session.status !== 'OPEN') throw new BadRequestException('La sesion de caja no esta abierta');

    // 3. Get today's exchange rate
    const today = caracasDateKey();
    const rate = await this.prisma.exchangeRate.findUnique({ where: { date: today } });
    if (!rate) throw new BadRequestException('No hay tasa de cambio registrada para hoy');

    // 4. Calculate amounts
    let amountUsd: number;
    let amountBs: number;
    if (dto.currency === 'USD') {
      amountUsd = dto.amount;
      amountBs = Math.round(dto.amount * rate.rate * 100) / 100;
    } else {
      amountBs = dto.amount;
      amountUsd = Math.round((dto.amount / rate.rate) * 100) / 100;
    }

    // 5. Create movement + fila del ledger (tabla madre) en la misma transaccion
    return this.prisma.$transaction(async (tx) => {
      const mov = await tx.cashMovement.create({
        data: {
          cashSessionId: dto.cashSessionId,
          type: dto.type,
          amountUsd,
          amountBs,
          exchangeRate: rate.rate,
          currency: dto.currency,
          reason: dto.reason,
          isManual: true,
          createdById: userId,
        },
        include: {
          createdBy: { select: { id: true, name: true } },
        },
      });
      await writeCashLedger(tx, {
        cashSessionId: dto.cashSessionId,
        direction: dto.type === 'INCOME' ? 'IN' : 'OUT',
        amountUsd, amountBs, currency: dto.currency as 'USD' | 'BS',
        exchangeRate: rate.rate,
        isCash: true, // movimiento manual = efectivo fisico de gaveta
        sourceType: 'MANUAL', sourceId: mov.id,
        reason: dto.reason, createdById: userId,
      });
      return mov;
    });
  }
}
