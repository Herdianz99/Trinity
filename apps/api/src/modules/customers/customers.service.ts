import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filters: { search?: string; isActive?: string; page?: number; limit?: number }) {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const where: any = {};

    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive === 'true';
    }

    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { rif: { contains: filters.search, mode: 'insensitive' } },
        { phone: { contains: filters.search, mode: 'insensitive' } },
        { email: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.customer.count({ where }),
    ]);

    return { data, total, page, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        invoices: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            number: true,
            status: true,
            totalUsd: true,
            totalBs: true,
            createdAt: true,
          },
        },
        receivables: {
          where: { status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] } },
          select: {
            id: true,
            amountUsd: true,
            status: true,
            dueDate: true,
            type: true,
          },
        },
      },
    });

    if (!customer) throw new NotFoundException('Cliente no encontrado');

    const pendingDebt = customer.receivables.reduce((sum, r) => sum + r.amountUsd, 0);
    const availableCredit = customer.creditLimit - pendingDebt;

    return { ...customer, pendingDebt, availableCredit };
  }

  async create(dto: CreateCustomerDto) {
    return this.prisma.customer.create({ data: dto });
  }

  async update(id: string, dto: UpdateCustomerDto) {
    const exists = await this.prisma.customer.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('Cliente no encontrado');
    return this.prisma.customer.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        invoices: {
          where: { status: { in: ['DRAFT', 'PENDING', 'PAID', 'PARTIAL', 'CREDIT'] } },
          take: 1,
        },
      },
    });

    if (!customer) throw new NotFoundException('Cliente no encontrado');

    if (customer.invoices.length > 0) {
      throw new BadRequestException('No se puede eliminar un cliente con facturas activas');
    }

    return this.prisma.customer.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
