import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { writeCashLedger } from '../../common/cash-ledger';
import { CreateCustomerAdvanceDto } from './dto/create-customer-advance.dto';
import { caracasDateKey } from '../../common/timezone';
import { DynamicKeysService } from '../dynamic-keys/dynamic-keys.service';

@Injectable()
export class CustomerAdvancesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dynamicKeysService: DynamicKeysService,
  ) {}

  // Eliminar un anticipo NO usado (saldo intacto), con clave dinamica. Revierte caja + ledger.
  async remove(id: string, dynamicKey: string) {
    const advance = await this.prisma.customerAdvance.findUnique({
      where: { id },
      include: { customer: { select: { name: true } } },
    });
    if (!advance) throw new NotFoundException('Anticipo no encontrado');
    if (advance.paidAmountUsd > 0.01 || advance.status !== 'AVAILABLE') {
      throw new BadRequestException(
        'No se puede eliminar: el anticipo ya fue usado (cruzado en un recibo o factura). Reversa primero ese documento.',
      );
    }

    await this.dynamicKeysService.validate({
      key: dynamicKey,
      permission: 'DELETE_CUSTOMER_ADVANCE',
      action: `Eliminar anticipo de ${advance.customer?.name || 'cliente'} ($${advance.amountUsd.toFixed(2)})`,
      entityType: 'CustomerAdvance',
      entityId: id,
    });

    await this.prisma.$transaction(async (tx) => {
      // Revertir la fila del libro mayor (linkeada por sourceType/sourceId)
      await tx.cashLedgerEntry.deleteMany({ where: { sourceType: 'CUSTOMER_ADVANCE', sourceId: id } });
      // Revertir el CashMovement del arqueo (match por sesion + tipo + monto + razon)
      const mv = await tx.cashMovement.findFirst({
        where: {
          cashSessionId: advance.cashSessionId,
          type: 'INCOME',
          amountUsd: advance.amountUsd,
          reason: `Anticipo cliente: ${advance.customer?.name || ''}`,
        },
        orderBy: { createdAt: 'desc' },
      });
      if (mv) await tx.cashMovement.delete({ where: { id: mv.id } });
      await tx.customerAdvance.delete({ where: { id } });
    });
    return { message: 'Anticipo eliminado' };
  }

  async create(dto: CreateCustomerAdvanceDto, userId: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id: dto.customerId } });
    if (!customer) throw new NotFoundException('Cliente no encontrado');

    const method = await this.prisma.paymentMethod.findUnique({ where: { id: dto.methodId } });
    if (!method) throw new NotFoundException('Metodo de pago no encontrado');

    const session = await this.prisma.cashSession.findUnique({ where: { id: dto.cashSessionId } });
    if (!session) throw new NotFoundException('Sesion de caja no encontrada');
    if (session.status !== 'OPEN') throw new BadRequestException('La sesion de caja no esta abierta');

    const today = caracasDateKey();
    const rate = await this.prisma.exchangeRate.findUnique({ where: { date: today } });
    if (!rate) throw new BadRequestException('No hay tasa de cambio registrada para hoy');

    const amountBs = Math.round(dto.amountUsd * rate.rate * 100) / 100;

    return this.prisma.$transaction(async (tx) => {
      const advance = await tx.customerAdvance.create({
        data: {
          customerId: dto.customerId,
          amountUsd: dto.amountUsd,
          amountBs,
          exchangeRate: rate.rate,
          methodId: dto.methodId,
          cashSessionId: dto.cashSessionId,
          reference: dto.reference || null,
          notes: dto.notes || null,
          createdById: userId,
        },
        include: {
          customer: { select: { id: true, name: true } },
          method: { select: { id: true, name: true } },
        },
      });

      await tx.cashMovement.create({
        data: {
          cashSessionId: dto.cashSessionId,
          type: 'INCOME',
          amountUsd: dto.amountUsd,
          amountBs,
          exchangeRate: rate.rate,
          currency: method.isDivisa ? 'USD' : 'BS',
          isCash: method.isCash, // Zelle/transferencia NO entra a la gaveta física
          reason: `Anticipo cliente: ${customer.name}`,
          isManual: false,
          createdById: userId,
        },
      });

      await writeCashLedger(tx, {
        cashSessionId: dto.cashSessionId,
        direction: 'IN',
        amountUsd: dto.amountUsd, amountBs, currency: method.isDivisa ? 'USD' : 'BS',
        exchangeRate: rate.rate,
        methodId: dto.methodId, isCash: method.isCash,
        sourceType: 'CUSTOMER_ADVANCE', sourceId: advance.id,
        reason: `Anticipo cliente: ${customer.name}`, createdById: userId,
      });

      return advance;
    });
  }

  async findAll(query: { customerId?: string; status?: string; page?: number; limit?: number }) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.customerId) where.customerId = query.customerId;
    if (query.status) where.status = query.status;

    const [data, total] = await Promise.all([
      this.prisma.customerAdvance.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: { select: { id: true, name: true } },
          method: { select: { id: true, name: true } },
          createdBy: { select: { id: true, name: true } },
        },
      }),
      this.prisma.customerAdvance.count({ where }),
    ]);

    const enriched = data.map((a) => ({
      ...a,
      remainingUsd: Math.round((a.amountUsd - a.paidAmountUsd) * 100) / 100,
      remainingBs: Math.round((a.amountBs - a.paidAmountBs) * 100) / 100,
    }));

    return { data: enriched, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findByCustomer(customerId: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new NotFoundException('Cliente no encontrado');

    const advances = await this.prisma.customerAdvance.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      include: {
        method: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });

    return advances.map((a) => ({
      ...a,
      remainingUsd: Math.round((a.amountUsd - a.paidAmountUsd) * 100) / 100,
      remainingBs: Math.round((a.amountBs - a.paidAmountBs) * 100) / 100,
    }));
  }
}
