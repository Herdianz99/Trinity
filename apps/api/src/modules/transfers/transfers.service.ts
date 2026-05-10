import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTransferDto } from './dto/create-transfer.dto';

@Injectable()
export class TransfersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateTransferDto, userId: string) {
    for (const item of dto.items) {
      const stock = await this.prisma.stock.findUnique({
        where: {
          productId_warehouseId: {
            productId: item.productId,
            warehouseId: dto.fromWarehouseId,
          },
        },
      });

      if (!stock || stock.quantity < item.quantity) {
        throw new BadRequestException(
          `Stock insuficiente para el producto ${item.productId} en almacen origen`,
        );
      }
    }

    return this.prisma.transfer.create({
      data: {
        fromWarehouseId: dto.fromWarehouseId,
        toWarehouseId: dto.toWarehouseId,
        notes: dto.notes,
        status: 'PENDING',
        createdById: userId,
        items: {
          create: dto.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
          })),
        },
      },
      include: {
        items: { include: { product: true } },
        fromWarehouse: true,
        toWarehouse: true,
      },
    });
  }

  async findAll(filters: { status?: string; warehouseId?: string }) {
    const where: any = {};

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.warehouseId) {
      where.OR = [
        { fromWarehouseId: filters.warehouseId },
        { toWarehouseId: filters.warehouseId },
      ];
    }

    return this.prisma.transfer.findMany({
      where,
      include: {
        items: { include: { product: true } },
        fromWarehouse: true,
        toWarehouse: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const transfer = await this.prisma.transfer.findUnique({
      where: { id },
      include: {
        items: { include: { product: true } },
        fromWarehouse: true,
        toWarehouse: true,
      },
    });

    if (!transfer) {
      throw new NotFoundException(`Transferencia con id ${id} no encontrada`);
    }

    return transfer;
  }

  async approve(id: string, userId: string) {
    const transfer = await this.prisma.transfer.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!transfer) {
      throw new NotFoundException(`Transferencia con id ${id} no encontrada`);
    }

    if (transfer.status !== 'PENDING') {
      throw new BadRequestException('Solo se pueden aprobar transferencias PENDING');
    }

    return this.prisma.$transaction(async (tx) => {
      for (const item of transfer.items) {
        // Deduct from source
        const sourceStock = await tx.stock.update({
          where: {
            productId_warehouseId: {
              productId: item.productId,
              warehouseId: transfer.fromWarehouseId,
            },
          },
          data: {
            quantity: { decrement: item.quantity },
          },
        });

        if (sourceStock.quantity < 0) {
          throw new BadRequestException(
            `Stock insuficiente para el producto ${item.productId} en almacen origen`,
          );
        }

        // Add to destination
        await tx.stock.upsert({
          where: {
            productId_warehouseId: {
              productId: item.productId,
              warehouseId: transfer.toWarehouseId,
            },
          },
          create: {
            productId: item.productId,
            warehouseId: transfer.toWarehouseId,
            quantity: item.quantity,
          },
          update: {
            quantity: { increment: item.quantity },
          },
        });

        // TRANSFER_OUT movement
        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            warehouseId: transfer.fromWarehouseId,
            type: 'TRANSFER_OUT',
            quantity: -item.quantity,
            reason: `Transferencia ${transfer.id}`,
            reference: `TRF-${transfer.id.slice(0, 8)}`,
            createdById: userId,
          },
        });

        // TRANSFER_IN movement
        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            warehouseId: transfer.toWarehouseId,
            type: 'TRANSFER_IN',
            quantity: item.quantity,
            reason: `Transferencia ${transfer.id}`,
            reference: `TRF-${transfer.id.slice(0, 8)}`,
            createdById: userId,
          },
        });
      }

      return tx.transfer.update({
        where: { id },
        data: {
          status: 'APPROVED',
          approvedById: userId,
        },
        include: {
          items: { include: { product: true } },
          fromWarehouse: true,
          toWarehouse: true,
        },
      });
    });
  }

  async cancel(id: string) {
    const transfer = await this.prisma.transfer.findUnique({
      where: { id },
    });

    if (!transfer) {
      throw new NotFoundException(`Transferencia con id ${id} no encontrada`);
    }

    if (transfer.status !== 'PENDING') {
      throw new BadRequestException('Solo se pueden cancelar transferencias PENDING');
    }

    return this.prisma.transfer.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
  }
}
