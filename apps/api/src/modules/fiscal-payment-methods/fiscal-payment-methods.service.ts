import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateFiscalPaymentMethodDto } from './dto/create-fiscal-payment-method.dto';

@Injectable()
export class FiscalPaymentMethodsService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.fiscalPaymentMethod.findMany({
      orderBy: { fiscalCode: 'asc' },
    });
  }

  findActive() {
    return this.prisma.fiscalPaymentMethod.findMany({
      where: { isActive: true },
      orderBy: { fiscalCode: 'asc' },
    });
  }

  async create(dto: CreateFiscalPaymentMethodDto) {
    const existingName = await this.prisma.fiscalPaymentMethod.findUnique({
      where: { name: dto.name },
    });
    if (existingName) {
      throw new BadRequestException(`El nombre "${dto.name}" ya existe`);
    }

    const existingCode = await this.prisma.fiscalPaymentMethod.findUnique({
      where: { fiscalCode: dto.fiscalCode },
    });
    if (existingCode) {
      throw new BadRequestException(
        `El codigo fiscal "${dto.fiscalCode}" ya esta en uso`,
      );
    }

    return this.prisma.fiscalPaymentMethod.create({
      data: {
        name: dto.name,
        fiscalCode: dto.fiscalCode,
        isDivisa: dto.isDivisa ?? false,
      },
    });
  }

  async update(id: string, dto: CreateFiscalPaymentMethodDto) {
    const method = await this.prisma.fiscalPaymentMethod.findUnique({
      where: { id },
    });
    if (!method) throw new NotFoundException('Metodo de pago no encontrado');

    if (dto.name && dto.name !== method.name) {
      const existing = await this.prisma.fiscalPaymentMethod.findUnique({
        where: { name: dto.name },
      });
      if (existing) {
        throw new BadRequestException(`El nombre "${dto.name}" ya existe`);
      }
    }

    if (dto.fiscalCode && dto.fiscalCode !== method.fiscalCode) {
      const existing = await this.prisma.fiscalPaymentMethod.findUnique({
        where: { fiscalCode: dto.fiscalCode },
      });
      if (existing) {
        throw new BadRequestException(
          `El codigo fiscal "${dto.fiscalCode}" ya esta en uso`,
        );
      }
    }

    return this.prisma.fiscalPaymentMethod.update({
      where: { id },
      data: {
        name: dto.name,
        fiscalCode: dto.fiscalCode,
        isDivisa: dto.isDivisa,
      },
    });
  }

  async toggleActive(id: string) {
    const method = await this.prisma.fiscalPaymentMethod.findUnique({
      where: { id },
    });
    if (!method) throw new NotFoundException('Metodo de pago no encontrado');

    return this.prisma.fiscalPaymentMethod.update({
      where: { id },
      data: { isActive: !method.isActive },
    });
  }
}
