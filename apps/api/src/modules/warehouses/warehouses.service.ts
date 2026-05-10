import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';

@Injectable()
export class WarehousesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateWarehouseDto) {
    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.warehouse.updateMany({
          where: { isDefault: true },
          data: { isDefault: false },
        });
      }

      return tx.warehouse.create({
        data: {
          name: dto.name,
          location: dto.location,
          isDefault: dto.isDefault ?? false,
        },
      });
    });
  }

  async findAll() {
    const warehouses = await this.prisma.warehouse.findMany({
      where: { isActive: true },
      include: {
        _count: {
          select: { stock: true },
        },
      },
    });

    return warehouses.map((w) => ({
      ...w,
      stockCount: w._count.stock,
      _count: undefined,
    }));
  }

  async findOne(id: string) {
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id },
      include: {
        _count: {
          select: { stock: true },
        },
      },
    });

    if (!warehouse) {
      throw new NotFoundException(`Warehouse with id ${id} not found`);
    }

    return {
      ...warehouse,
      stockCount: warehouse._count.stock,
      _count: undefined,
    };
  }

  async update(id: string, dto: UpdateWarehouseDto) {
    const warehouse = await this.prisma.warehouse.findUnique({ where: { id } });
    if (!warehouse) {
      throw new NotFoundException(`Warehouse with id ${id} not found`);
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.warehouse.updateMany({
          where: { isDefault: true, id: { not: id } },
          data: { isDefault: false },
        });
      }

      return tx.warehouse.update({
        where: { id },
        data: dto,
      });
    });
  }

  async remove(id: string) {
    const warehouse = await this.prisma.warehouse.findUnique({ where: { id } });
    if (!warehouse) {
      throw new NotFoundException(`Warehouse with id ${id} not found`);
    }

    return this.prisma.warehouse.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
