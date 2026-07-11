import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSupplierAdvanceDto } from './dto/create-supplier-advance.dto';
import { caracasDateKey } from '../../common/timezone';

@Injectable()
export class SupplierAdvancesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateSupplierAdvanceDto, userId: string) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id: dto.supplierId } });
    if (!supplier) throw new NotFoundException('Proveedor no encontrado');

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
      const advance = await tx.supplierAdvance.create({
        data: {
          supplierId: dto.supplierId,
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
          supplier: { select: { id: true, name: true } },
          method: { select: { id: true, name: true } },
        },
      });

      await tx.cashMovement.create({
        data: {
          cashSessionId: dto.cashSessionId,
          type: 'EXPENSE',
          amountUsd: dto.amountUsd,
          amountBs,
          exchangeRate: rate.rate,
          currency: method.isDivisa ? 'USD' : 'BS',
          isCash: method.isCash, // transferencia/Zelle NO sale de la gaveta física
          reason: `Anticipo proveedor: ${supplier.name}`,
          isManual: false,
          createdById: userId,
        },
      });

      return advance;
    });
  }

  async findAll(query: { supplierId?: string; status?: string; page?: number; limit?: number }) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.supplierId) where.supplierId = query.supplierId;
    if (query.status) where.status = query.status;

    const [data, total] = await Promise.all([
      this.prisma.supplierAdvance.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          supplier: { select: { id: true, name: true } },
          method: { select: { id: true, name: true } },
          createdBy: { select: { id: true, name: true } },
        },
      }),
      this.prisma.supplierAdvance.count({ where }),
    ]);

    const enriched = data.map((a) => ({
      ...a,
      remainingUsd: Math.round((a.amountUsd - a.paidAmountUsd) * 100) / 100,
      remainingBs: Math.round((a.amountBs - a.paidAmountBs) * 100) / 100,
    }));

    return { data: enriched, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findBySupplier(supplierId: string) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id: supplierId } });
    if (!supplier) throw new NotFoundException('Proveedor no encontrado');

    const advances = await this.prisma.supplierAdvance.findMany({
      where: { supplierId },
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
