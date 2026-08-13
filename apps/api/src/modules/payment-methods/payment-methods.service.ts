import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePaymentMethodDto } from './dto/create-payment-method.dto';
import { caracasDayStart } from '../../common/timezone';

// Normaliza una referencia para comparar: sin espacios, en mayusculas. Asi "12 34" y
// "1234", o "abc" y "ABC", cuentan como la misma referencia.
function normalizeRef(s?: string | null): string {
  return (s ?? '').replace(/\s+/g, '').toUpperCase();
}

@Injectable()
export class PaymentMethodsService {
  constructor(private readonly prisma: PrismaService) {}

  /** List parent methods with children nested, ordered by sortOrder */
  async findAll() {
    return this.prisma.paymentMethod.findMany({
      where: { parentId: null },
      orderBy: { sortOrder: 'asc' },
      include: {
        children: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
  }

  /** Flat list of all active leaf methods (for select dropdowns) */
  async findFlat() {
    // Get all active methods
    const all = await this.prisma.paymentMethod.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: {
        children: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    // Return parents without children directly, children for parents that have them
    const result: any[] = [];
    for (const method of all) {
      if (method.parentId) continue; // skip children at top level
      if (method.children && method.children.length > 0) {
        // Parent with children — return children as selectable items
        for (const child of method.children) {
          result.push(child);
        }
      } else {
        // Parent without children — selectable directly
        result.push(method);
      }
    }
    return result;
  }

  async create(dto: CreatePaymentMethodDto) {
    // Check unique name
    const existing = await this.prisma.paymentMethod.findUnique({
      where: { name: dto.name },
    });
    if (existing) {
      throw new BadRequestException(`El nombre "${dto.name}" ya existe`);
    }

    // Validate parentId if provided
    if (dto.parentId) {
      const parent = await this.prisma.paymentMethod.findUnique({
        where: { id: dto.parentId },
      });
      if (!parent) {
        throw new NotFoundException('Metodo padre no encontrado');
      }
      if (parent.parentId) {
        throw new BadRequestException('No se permite mas de un nivel de anidamiento');
      }
    }

    return this.prisma.paymentMethod.create({
      data: {
        name: dto.name,
        isDivisa: dto.isDivisa ?? false,
        createsReceivable: dto.createsReceivable ?? false,
        checkDuplicateRef: dto.checkDuplicateRef ?? false,
        sortOrder: dto.sortOrder ?? 0,
        fiscalCode: dto.fiscalCode || null,
        parentId: dto.parentId || null,
      },
    });
  }

  async update(id: string, dto: CreatePaymentMethodDto) {
    const method = await this.prisma.paymentMethod.findUnique({
      where: { id },
    });
    if (!method) throw new NotFoundException('Metodo de pago no encontrado');

    // Check unique name if changing
    if (dto.name && dto.name !== method.name) {
      const existing = await this.prisma.paymentMethod.findUnique({
        where: { name: dto.name },
      });
      if (existing) {
        throw new BadRequestException(`El nombre "${dto.name}" ya existe`);
      }
    }

    return this.prisma.paymentMethod.update({
      where: { id },
      data: {
        name: dto.name ?? method.name,
        isDivisa: dto.isDivisa ?? method.isDivisa,
        createsReceivable: dto.createsReceivable ?? method.createsReceivable,
        checkDuplicateRef: dto.checkDuplicateRef ?? method.checkDuplicateRef,
        sortOrder: dto.sortOrder ?? method.sortOrder,
        fiscalCode: dto.fiscalCode !== undefined ? (dto.fiscalCode || null) : method.fiscalCode,
        parentId: dto.parentId !== undefined ? (dto.parentId || null) : method.parentId,
      },
    });
  }

  // Busca si una referencia ya fue registrada en un pago RECIENTE (ultimos 3 dias-calendario
  // Caracas) con el MISMO metodo. Solo aplica a metodos marcados con checkDuplicateRef.
  // Sirve para alertar al cajero de un posible cobro doble del mismo Pago Movil/transferencia.
  // Busca en las 3 tablas donde vive una referencia: Payment (facturas), ReceiptPayment
  // (recibos) y ReceivablePayment (abonos a CxC). Es informativo: NO bloquea.
  async checkReference(methodId: string, reference: string) {
    const norm = normalizeRef(reference);
    if (!methodId || !norm) return { duplicate: false, matches: [] };

    const method = await this.prisma.paymentMethod.findUnique({
      where: { id: methodId },
      select: { checkDuplicateRef: true, name: true },
    });
    if (!method?.checkDuplicateRef) return { duplicate: false, matches: [] };

    // Ventana: hoy + 2 dias anteriores (3 dias-calendario Caracas).
    const threeDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const from = caracasDayStart(threeDaysAgo);
    const baseWhere = { methodId, reference: { not: null }, createdAt: { gte: from } };

    const [invPays, recPays, cxcPays] = await Promise.all([
      this.prisma.payment.findMany({
        where: baseWhere,
        select: { reference: true, amountUsd: true, amountBs: true, createdAt: true, invoice: { select: { number: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.receiptPayment.findMany({
        where: baseWhere,
        select: { reference: true, amountUsd: true, amountBs: true, createdAt: true, receipt: { select: { number: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.receivablePayment.findMany({
        where: baseWhere,
        select: { reference: true, amountUsd: true, amountBs: true, createdAt: true, receipt: { select: { number: true } } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const matches: {
      source: string; docNumber: string | null; amountUsd: number; amountBs: number; createdAt: Date;
    }[] = [];
    for (const p of invPays) {
      if (normalizeRef(p.reference) === norm) {
        matches.push({ source: 'Factura', docNumber: p.invoice?.number ?? null, amountUsd: p.amountUsd, amountBs: p.amountBs, createdAt: p.createdAt });
      }
    }
    for (const p of recPays) {
      if (normalizeRef(p.reference) === norm) {
        matches.push({ source: 'Recibo', docNumber: p.receipt?.number ?? null, amountUsd: p.amountUsd, amountBs: p.amountBs, createdAt: p.createdAt });
      }
    }
    for (const p of cxcPays) {
      if (normalizeRef(p.reference) === norm) {
        matches.push({ source: 'Abono CxC', docNumber: p.receipt?.number ?? null, amountUsd: p.amountUsd, amountBs: p.amountBs, createdAt: p.createdAt });
      }
    }
    matches.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return { duplicate: matches.length > 0, methodName: method.name, matches };
  }

  async toggleActive(id: string) {
    const method = await this.prisma.paymentMethod.findUnique({
      where: { id },
    });
    if (!method) throw new NotFoundException('Metodo de pago no encontrado');

    return this.prisma.paymentMethod.update({
      where: { id },
      data: { isActive: !method.isActive },
    });
  }

  async remove(id: string) {
    const method = await this.prisma.paymentMethod.findUnique({
      where: { id },
      include: {
        children: { where: { isActive: true } },
        _count: {
          select: {
            payments: true,
            receivablePayments: true,
            payablePayments: true,
          },
        },
      },
    });
    if (!method) throw new NotFoundException('Metodo de pago no encontrado');

    const totalPayments =
      method._count.payments +
      method._count.receivablePayments +
      method._count.payablePayments;

    if (totalPayments > 0) {
      throw new BadRequestException(
        `No se puede eliminar: tiene ${totalPayments} pagos registrados. Desactivalo en su lugar.`,
      );
    }

    if (method.children && method.children.length > 0) {
      throw new BadRequestException(
        'No se puede eliminar: tiene sub-metodos activos. Eliminalos primero.',
      );
    }

    return this.prisma.paymentMethod.delete({ where: { id } });
  }
}
