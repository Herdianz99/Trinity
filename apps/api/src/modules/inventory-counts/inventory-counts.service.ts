import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateInventoryCountDto } from './dto/create-inventory-count.dto';
import { UpdateCountItemsDto } from './dto/update-count-items.dto';
import { AddItemsByFilterDto, AddItemsByIdsDto } from './dto/add-items.dto';
import { RemoveItemsDto } from './dto/remove-items.dto';

@Injectable()
export class InventoryCountsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateInventoryCountDto, userId: string) {
    return this.prisma.inventoryCount.create({
      data: {
        warehouseId: dto.warehouseId,
        notes: dto.notes,
        status: 'DRAFT',
        createdById: userId,
      },
      include: {
        warehouse: true,
        _count: { select: { items: true } },
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
          include: {
            product: {
              include: {
                category: true,
                brand: true,
              },
            },
          },
          orderBy: { product: { name: 'asc' } },
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

  async addItemsByFilter(id: string, dto: AddItemsByFilterDto) {
    const count = await this.prisma.inventoryCount.findUnique({
      where: { id },
    });

    if (!count) {
      throw new NotFoundException(`Conteo con id ${id} no encontrado`);
    }

    if (count.status !== 'DRAFT') {
      throw new BadRequestException(
        'Solo se pueden agregar productos a conteos en estado DRAFT',
      );
    }

    // Build product filter
    const where: any = { isActive: true };

    if (dto.categoryId) {
      where.categoryId = dto.categoryId;
    }
    if (dto.brandId) {
      where.brandId = dto.brandId;
    }
    if (dto.supplierId) {
      where.supplierId = dto.supplierId;
    }

    // Full-text search + ILIKE fallback
    if (dto.search) {
      const searchResults = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Product"
        WHERE "isActive" = true
        AND (
          "searchVector" @@ plainto_tsquery('spanish', ${dto.search})
          OR name ILIKE ${'%' + dto.search + '%'}
          OR code ILIKE ${'%' + dto.search + '%'}
        )
      `;
      const ids = searchResults.map((r) => r.id);
      if (ids.length === 0) {
        return { added: 0 };
      }
      where.id = { in: ids };
    }

    const products = await this.prisma.product.findMany({
      where,
      select: { id: true },
    });

    if (products.length === 0) {
      return { added: 0 };
    }

    // Get current stock for these products in this warehouse
    const stocks = await this.prisma.stock.findMany({
      where: {
        warehouseId: count.warehouseId,
        productId: { in: products.map((p) => p.id) },
      },
    });
    const stockMap = new Map(stocks.map((s) => [s.productId, s.quantity]));

    const result = await this.prisma.inventoryCountItem.createMany({
      data: products.map((p) => ({
        inventoryCountId: id,
        productId: p.id,
        systemQuantity: stockMap.get(p.id) ?? 0,
        countedQuantity: null,
        difference: null,
      })),
      skipDuplicates: true,
    });

    return { added: result.count };
  }

  async addItemsByIds(id: string, dto: AddItemsByIdsDto) {
    const count = await this.prisma.inventoryCount.findUnique({
      where: { id },
    });

    if (!count) {
      throw new NotFoundException(`Conteo con id ${id} no encontrado`);
    }

    if (count.status !== 'DRAFT') {
      throw new BadRequestException(
        'Solo se pueden agregar productos a conteos en estado DRAFT',
      );
    }

    // Get current stock for these products
    const stocks = await this.prisma.stock.findMany({
      where: {
        warehouseId: count.warehouseId,
        productId: { in: dto.productIds },
      },
    });
    const stockMap = new Map(stocks.map((s) => [s.productId, s.quantity]));

    const result = await this.prisma.inventoryCountItem.createMany({
      data: dto.productIds.map((productId) => ({
        inventoryCountId: id,
        productId,
        systemQuantity: stockMap.get(productId) ?? 0,
        countedQuantity: null,
        difference: null,
      })),
      skipDuplicates: true,
    });

    return { added: result.count };
  }

  async removeItems(id: string, dto: RemoveItemsDto) {
    const count = await this.prisma.inventoryCount.findUnique({
      where: { id },
    });

    if (!count) {
      throw new NotFoundException(`Conteo con id ${id} no encontrado`);
    }

    if (count.status !== 'DRAFT') {
      throw new BadRequestException(
        'Solo se pueden eliminar productos de conteos en estado DRAFT',
      );
    }

    const result = await this.prisma.inventoryCountItem.deleteMany({
      where: {
        inventoryCountId: id,
        productId: { in: dto.productIds },
      },
    });

    return { removed: result.count };
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
          items: {
            include: {
              product: {
                include: {
                  category: true,
                  brand: true,
                },
              },
            },
            orderBy: { product: { name: 'asc' } },
          },
          warehouse: true,
        },
      });
    });
  }

  // Eliminar un conteo no aprobado (borrador/en progreso/cancelado). Borra sus items.
  async remove(id: string) {
    const count = await this.prisma.inventoryCount.findUnique({ where: { id } });
    if (!count) throw new NotFoundException(`Conteo con id ${id} no encontrado`);
    if (count.status === 'APPROVED') {
      throw new BadRequestException('No se puede eliminar un conteo ya aprobado (ya ajusto el inventario)');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.inventoryCountItem.deleteMany({ where: { inventoryCountId: id } });
      await tx.inventoryCount.delete({ where: { id } });
    });
    return { message: 'Conteo eliminado' };
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

          await tx.stock.upsert({
            where: {
              productId_warehouseId: {
                productId: item.productId,
                warehouseId: count.warehouseId,
              },
            },
            update: {
              quantity: item.countedQuantity!,
            },
            create: {
              productId: item.productId,
              warehouseId: count.warehouseId,
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
          items: {
            include: {
              product: {
                include: {
                  category: true,
                  brand: true,
                },
              },
            },
            orderBy: { product: { name: 'asc' } },
          },
          warehouse: true,
        },
      });
    });
  }
}
