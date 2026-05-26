import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSerieDto } from './dto/create-serie.dto';

@Injectable()
export class SeriesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.serie.findMany({
      include: {
        cashRegister: { select: { id: true, code: true, name: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const serie = await this.prisma.serie.findUnique({
      where: { id },
      include: {
        cashRegister: { select: { id: true, code: true, name: true } },
      },
    });
    if (!serie) throw new NotFoundException('Serie no encontrada');
    return serie;
  }

  async create(dto: CreateSerieDto) {
    const existing = await this.prisma.serie.findUnique({
      where: { name: dto.name },
    });
    if (existing) {
      throw new BadRequestException(`Ya existe una serie con el nombre "${dto.name}"`);
    }

    if (dto.cashRegisterId) {
      const linked = await this.prisma.serie.findUnique({
        where: { cashRegisterId: dto.cashRegisterId },
      });
      if (linked) {
        throw new BadRequestException('Esta caja ya tiene una serie asignada');
      }
    }

    return this.prisma.serie.create({
      data: {
        name: dto.name,
        prefix: dto.prefix.toUpperCase(),
        isFiscal: dto.isFiscal ?? false,
        isVatExempt: dto.isVatExempt ?? false,
        cashRegisterId: dto.cashRegisterId || null,
      },
      include: {
        cashRegister: { select: { id: true, code: true, name: true } },
      },
    });
  }

  async update(id: string, dto: CreateSerieDto) {
    const serie = await this.prisma.serie.findUnique({ where: { id } });
    if (!serie) throw new NotFoundException('Serie no encontrada');

    if (dto.name && dto.name !== serie.name) {
      const existing = await this.prisma.serie.findUnique({
        where: { name: dto.name },
      });
      if (existing) {
        throw new BadRequestException(`Ya existe una serie con el nombre "${dto.name}"`);
      }
    }

    if (dto.cashRegisterId && dto.cashRegisterId !== serie.cashRegisterId) {
      const linked = await this.prisma.serie.findUnique({
        where: { cashRegisterId: dto.cashRegisterId },
      });
      if (linked) {
        throw new BadRequestException('Esta caja ya tiene una serie asignada');
      }
    }

    return this.prisma.serie.update({
      where: { id },
      data: {
        name: dto.name,
        prefix: dto.prefix?.toUpperCase(),
        isFiscal: dto.isFiscal,
        isVatExempt: dto.isVatExempt,
        cashRegisterId: dto.cashRegisterId !== undefined ? (dto.cashRegisterId || null) : undefined,
      },
      include: {
        cashRegister: { select: { id: true, code: true, name: true } },
      },
    });
  }

  async toggleActive(id: string) {
    const serie = await this.prisma.serie.findUnique({ where: { id } });
    if (!serie) throw new NotFoundException('Serie no encontrada');

    return this.prisma.serie.update({
      where: { id },
      data: { isActive: !serie.isActive },
      include: {
        cashRegister: { select: { id: true, code: true, name: true } },
      },
    });
  }
}
