import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePaymentMethodDto } from './dto/create-payment-method.dto';

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
        sortOrder: dto.sortOrder ?? method.sortOrder,
        fiscalCode: dto.fiscalCode !== undefined ? (dto.fiscalCode || null) : method.fiscalCode,
        parentId: dto.parentId !== undefined ? (dto.parentId || null) : method.parentId,
      },
    });
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
