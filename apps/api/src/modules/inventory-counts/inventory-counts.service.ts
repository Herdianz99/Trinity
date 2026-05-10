import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateInventoryCountDto } from './dto/create-inventory-count.dto';
import { UpdateCountItemsDto } from './dto/update-count-items.dto';

@Injectable()
export class InventoryCountsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateInventoryCountDto, userId: string) {
    const stocks = await this.prisma.stock.findMany({
      where: { warehouseId: dto.warehouseId },
      include: { product: true },
    });

    return this.prisma.inventoryCount.create({
      data: {
        warehouseId: dto.warehouseId,
        notes: dto.notes,
        status: 'DRAFT',
        createdById: userId,
        items: {
          create: stocks.map((stock) => ({
            productId: stock.productId,
            systemQuantity: stock.quantity,
            countedQuantity: null,
            difference: null,
          })),
        },
      },
      include: {
        items: { include: { product: true } },
        warehouse: true,
      },
    });
  }

  async findAll(filters?: { status?: string; warehouseId?: string }) {
    const where: any = {};

    if (filters?.status) {
      where.status = filters.status;
    }
    if (filters?.warehouseId) {
      where.warehouseId = filters.warehouseId;
    }

    return this.prisma.inventoryCount.findMany({
      where,
      include: {
        warehouse: true,
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const count = await this.prisma.inventoryCount.findUnique({
      where: { id },
      include: {
        items: {
          include: { product: true },
        },
        warehouse: true,
      },
    });

    if (!count) {
      throw new NotFoundException(`Conteo con id ${id} no encontrado`);
    }

    const itemsWithDifference = count.items.map((item) => ({
      ...item,
      difference:
        item.countedQuantity !== null
          ? item.countedQuantity - item.systemQuantity
          : null,
    }));

    return {
      ...count,
      items: itemsWithDifference,
    };
  }

  async updateItems(id: string, dto: UpdateCountItemsDto) {
    const count = await this.prisma.inventoryCount.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!count) {
      throw new NotFoundException(`Conteo con id ${id} no encontrado`);
    }

    if (count.status === 'APPROVED') {
      throw new BadRequestException('No se puede modificar un conteo aprobado');
    }

    return this.prisma.$transaction(async (tx) => {
      for (const item of dto.items) {
        const existingItem = count.items.find(
          (i) => i.productId === item.productId,
        );

        if (!existingItem) {
          throw new BadRequestException(
            `Producto ${item.productId} no es parte de este conteo`,
          );
        }

        const difference = item.countedQuantity - existingItem.systemQuantity;

        await tx.inventoryCountItem.update({
          where: { id: existingItem.id },
          data: {
            countedQuantity: item.countedQuantity,
            difference,
          },
        });
      }

      return tx.inventoryCount.update({
        where: { id },
        data: { status: 'IN_PROGRESS' },
        include: {
          items: { include: { product: true } },
          warehouse: true,
        },
      });
    });
  }

  async approve(id: string, userId: string) {
    const count = await this.prisma.inventoryCount.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!count) {
      throw new NotFoundException(`Conteo con id ${id} no encontrado`);
    }

    if (count.status === 'APPROVED') {
      throw new BadRequestException('El conteo ya fue aprobado');
    }

    return this.prisma.$transaction(async (tx) => {
      for (const item of count.items) {
        if (item.difference !== null && item.difference !== 0) {
          await tx.stockMovement.create({
            data: {
              productId: item.productId,
              warehouseId: count.warehouseId,
              type: 'COUNT_ADJUST',
              quantity: item.difference,
              reason: `Ajuste por conteo fisico #${count.id.slice(0, 8)}`,
              createdById: userId,
            },
          });

          await tx.stock.update({
            where: {
              productId_warehouseId: {
                productId: item.productId,
                warehouseId: count.warehouseId,
              },
            },
            data: {
              quantity: item.countedQuantity!,
            },
          });
        }
      }

      return tx.inventoryCount.update({
        where: { id },
        data: {
          status: 'APPROVED',
          approvedById: userId,
        },
        include: {
          items: { include: { product: true } },
          warehouse: true,
        },
      });
    });
  }
}
