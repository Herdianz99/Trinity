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
        method: { select: { id: true, name: true } },
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

    // 3b. Resolver metodo de pago (si el cajero eligio uno). La moneda y si afecta la
    // gaveta (isCash) las MANDA el metodo, no el cliente: divisa->USD, resto->Bs.
    // Los metodos de credito/financiamiento (Cashea, Crediagro) no aplican a un
    // movimiento manual — crearian una cuenta por cobrar sin documento.
    let methodId: string | null = null;
    let isCash = true; // sin metodo => efectivo (comportamiento viejo)
    let currency: 'USD' | 'BS' = dto.currency;
    if (dto.methodId) {
      const method = await this.prisma.paymentMethod.findUnique({
        where: { id: dto.methodId },
      });
      if (!method || !method.isActive) {
        throw new BadRequestException('Metodo de pago invalido o inactivo');
      }
      if (method.createsReceivable) {
        throw new BadRequestException(
          `No se permite "${method.name}" en un movimiento manual: es un metodo de credito/financiamiento (cuenta por cobrar).`,
        );
      }
      methodId = method.id;
      isCash = method.isCash;
      currency = method.isDivisa ? 'USD' : 'BS';
    }

    // 4. Calculate amounts
    let amountUsd: number;
    let amountBs: number;
    if (currency === 'USD') {
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
          currency,
          reason: dto.reason,
          isManual: true,
          methodId,
          isCash, // derivado del metodo (efectivo si; electronico no)
          createdById: userId,
        },
        include: {
          createdBy: { select: { id: true, name: true } },
          method: { select: { id: true, name: true } },
        },
      });
      await writeCashLedger(tx, {
        cashSessionId: dto.cashSessionId,
        direction: dto.type === 'INCOME' ? 'IN' : 'OUT',
        amountUsd, amountBs, currency,
        exchangeRate: rate.rate,
        methodId, // el movimiento sale bajo su metodo real en el libro mayor
        isCash, // solo afecta la gaveta si el metodo es efectivo
        sourceType: 'MANUAL', sourceId: mov.id,
        reason: dto.reason, createdById: userId,
      });
      return mov;
    });
  }
}
