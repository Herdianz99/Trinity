import {
  Injectable,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { UserRole } from '@prisma/client';

@Injectable()
export class StockService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filters: {
    warehouseId?: string;
    productId?: string;
    lowStock?: boolean;
  }) {
    const where: any = {};

    if (filters.warehouseId) {
      where.warehouseId = filters.warehouseId;
    }
    if (filters.productId) {
      where.productId = filters.productId;
    }

    const stocks = await this.prisma.stock.findMany({
      where,
      include: {
        product: true,
        warehouse: true,
      },
    });

    if (filters.lowStock) {
      return stocks.filter((s) => s.quantity <= s.product.minStock);
    }

    return stocks;
  }

  async getGlobalStock() {
    const stocks = await this.prisma.stock.findMany({
      include: {
        product: true,
      },
    });

    const globalMap = new Map<
      string,
      { product: any; totalStock: number; minStock: number }
    >();

    for (const stock of stocks) {
      const existing = globalMap.get(stock.productId);
      if (existing) {
        existing.totalStock += stock.quantity;
      } else {
        globalMap.set(stock.productId, {
          product: stock.product,
          totalStock: stock.quantity,
          minStock: stock.product.minStock,
        });
      }
    }

    return Array.from(globalMap.values());
  }

  async getLowStock() {
    const globalStock = await this.getGlobalStock();
    return globalStock.filter((item) => item.totalStock <= item.minStock);
  }

  async getValuation() {
    const stocks = await this.prisma.stock.findMany({
      include: {
        product: true,
        warehouse: true,
      },
    });

    const companyConfig = await this.prisma.companyConfig.findFirst();
    const exchangeRate = companyConfig?.exchangeRate ?? 1;

    return stocks.map((stock) => {
      const costUsd = stock.product.costUsd ?? 0;
      const valuationUsd = stock.quantity * costUsd;
      const valuationLocal = valuationUsd * exchangeRate;

      return {
        productId: stock.productId,
        productName: stock.product.name,
        productCode: stock.product.code,
        warehouseId: stock.warehouseId,
        warehouseName: stock.warehouse.name,
        quantity: stock.quantity,
        costUsd,
        valuationUsd,
        valuationLocal,
        exchangeRate,
      };
    });
  }

  async adjust(dto: AdjustStockDto, user: { id: string; role: UserRole }) {
    if (dto.type === 'ADJUSTMENT_OUT') {
      if (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPERVISOR) {
        throw new ForbiddenException(
          'Solo SUPERVISOR o ADMIN pueden realizar ajustes de salida',
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const quantityChange =
        dto.type === 'ADJUSTMENT_IN' ? dto.quantity : -dto.quantity;

      const stock = await tx.stock.upsert({
        where: {
          productId_warehouseId: {
            productId: dto.productId,
            warehouseId: dto.warehouseId,
          },
        },
        create: {
          productId: dto.productId,
          warehouseId: dto.warehouseId,
          quantity: dto.type === 'ADJUSTMENT_IN' ? dto.quantity : 0,
        },
        update: {
          quantity: { increment: quantityChange },
        },
      });

      if (stock.quantity < 0) {
        throw new BadRequestException('Stock insuficiente para el ajuste');
      }

      const movement = await tx.stockMovement.create({
        data: {
          productId: dto.productId,
          warehouseId: dto.warehouseId,
          type: dto.type,
          quantity: quantityChange,
          reason: dto.reason,
          createdById: user.id,
        },
      });

      return { stock, movement };
    });
  }
}
