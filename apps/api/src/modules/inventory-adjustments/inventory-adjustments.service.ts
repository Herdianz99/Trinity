import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateInventoryAdjustmentDto } from './dto/create-inventory-adjustment.dto';
import { UpdateAdjustmentItemsDto } from './dto/update-adjustment-items.dto';
import { AddItemsByFilterDto, AddItemsByIdsDto } from './dto/add-items.dto';
import { RemoveItemsDto } from './dto/remove-items.dto';
import { ProcessAdjustmentDto } from './dto/process-adjustment.dto';
import { caracasDateKey } from '../../common/timezone';

const INCLUDE_LIST = {
  warehouse: true,
  customer: { select: { id: true, name: true } },
  supplier: { select: { id: true, name: true } },
  _count: { select: { items: true } },
} as const;

const INCLUDE_DETAIL = {
  items: {
    include: {
      product: {
        include: {
          category: true,
          brand: true,
          // Existencia por almacen (el front toma la del almacen del ajuste).
          stock: { select: { warehouseId: true, quantity: true } },
        },
      },
    },
    orderBy: { product: { name: 'asc' } } as const,
  },
  warehouse: true,
  customer: { select: { id: true, name: true } },
  supplier: { select: { id: true, name: true } },
} as const;

@Injectable()
export class InventoryAdjustmentsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Correlativo ADJ-0001 con SELECT FOR UPDATE (regla de correlativos). */
  private async generateNumber(tx: any): Promise<string> {
    const result = await tx.$queryRaw<{ max: number | null }[]>`
      SELECT MAX(CAST(SPLIT_PART("number", '-', 2) AS INTEGER)) as max FROM (
        SELECT "number" FROM "InventoryAdjustment" WHERE "number" IS NOT NULL FOR UPDATE
      ) sub
    `;
    const next = (result[0]?.max || 0) + 1;
    return `ADJ-${next.toString().padStart(4, '0')}`;
  }

  async create(dto: CreateInventoryAdjustmentDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const number = await this.generateNumber(tx);
      return tx.inventoryAdjustment.create({
        data: {
          number,
          warehouseId: dto.warehouseId,
          type: dto.type,
          costMode: dto.costMode || 'BREGA',
          description: dto.description,
          customerId: dto.customerId || null,
          supplierId: dto.supplierId || null,
          status: 'DRAFT',
          createdById: userId,
        },
        include: INCLUDE_LIST,
      });
    });
  }

  async findAll(filters?: {
    status?: string;
    warehouseId?: string;
    type?: string;
  }) {
    const where: any = {};

    if (filters?.status) {
      where.status = filters.status;
    }
    if (filters?.warehouseId) {
      where.warehouseId = filters.warehouseId;
    }
    if (filters?.type) {
      where.type = filters.type;
    }

    return this.prisma.inventoryAdjustment.findMany({
      where,
      include: INCLUDE_LIST,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const adjustment = await this.prisma.inventoryAdjustment.findUnique({
      where: { id },
      include: INCLUDE_DETAIL,
    });

    if (!adjustment) {
      throw new NotFoundException(`Ajuste con id ${id} no encontrado`);
    }

    return adjustment;
  }

  async addItemsByFilter(id: string, dto: AddItemsByFilterDto) {
    const adjustment = await this.prisma.inventoryAdjustment.findUnique({
      where: { id },
    });

    if (!adjustment) {
      throw new NotFoundException(`Ajuste con id ${id} no encontrado`);
    }

    if (adjustment.status !== 'DRAFT') {
      throw new BadRequestException(
        'Solo se pueden agregar productos a ajustes en estado DRAFT',
      );
    }

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

    const result = await this.prisma.inventoryAdjustmentItem.createMany({
      data: products.map((p) => ({
        inventoryAdjustmentId: id,
        productId: p.id,
        quantity: 0,
      })),
      skipDuplicates: true,
    });

    return { added: result.count };
  }

  async addItemsByIds(id: string, dto: AddItemsByIdsDto) {
    const adjustment = await this.prisma.inventoryAdjustment.findUnique({
      where: { id },
    });

    if (!adjustment) {
      throw new NotFoundException(`Ajuste con id ${id} no encontrado`);
    }

    if (adjustment.status !== 'DRAFT') {
      throw new BadRequestException(
        'Solo se pueden agregar productos a ajustes en estado DRAFT',
      );
    }

    const result = await this.prisma.inventoryAdjustmentItem.createMany({
      data: dto.productIds.map((productId) => ({
        inventoryAdjustmentId: id,
        productId,
        quantity: 0,
      })),
      skipDuplicates: true,
    });

    return { added: result.count };
  }

  async removeItems(id: string, dto: RemoveItemsDto) {
    const adjustment = await this.prisma.inventoryAdjustment.findUnique({
      where: { id },
    });

    if (!adjustment) {
      throw new NotFoundException(`Ajuste con id ${id} no encontrado`);
    }

    if (adjustment.status !== 'DRAFT') {
      throw new BadRequestException(
        'Solo se pueden eliminar productos de ajustes en estado DRAFT',
      );
    }

    const result = await this.prisma.inventoryAdjustmentItem.deleteMany({
      where: {
        inventoryAdjustmentId: id,
        productId: { in: dto.productIds },
      },
    });

    return { removed: result.count };
  }

  async updateItems(id: string, dto: UpdateAdjustmentItemsDto) {
    const adjustment = await this.prisma.inventoryAdjustment.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!adjustment) {
      throw new NotFoundException(`Ajuste con id ${id} no encontrado`);
    }

    if (adjustment.status !== 'DRAFT') {
      throw new BadRequestException(
        'Solo se pueden modificar items de ajustes en estado DRAFT',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      for (const item of dto.items) {
        const existingItem = adjustment.items.find(
          (i) => i.productId === item.productId,
        );

        if (!existingItem) {
          throw new BadRequestException(
            `Producto ${item.productId} no es parte de este ajuste`,
          );
        }

        await tx.inventoryAdjustmentItem.update({
          where: { id: existingItem.id },
          data: { quantity: item.quantity },
        });
      }

      return tx.inventoryAdjustment.findUnique({
        where: { id },
        include: INCLUDE_DETAIL,
      });
    });
  }

  async process(id: string, userId: string, dto?: ProcessAdjustmentDto) {
    const adjustment = await this.prisma.inventoryAdjustment.findUnique({
      where: { id },
      include: { items: { include: { product: true } } },
    });

    if (!adjustment) {
      throw new NotFoundException(`Ajuste con id ${id} no encontrado`);
    }

    if (adjustment.status !== 'DRAFT') {
      throw new BadRequestException('Solo se pueden procesar ajustes en estado DRAFT');
    }

    if (adjustment.items.length === 0) {
      throw new BadRequestException('El ajuste no tiene productos');
    }

    const itemsWithZero = adjustment.items.filter((i) => i.quantity <= 0);
    if (itemsWithZero.length > 0) {
      throw new BadRequestException(
        'Todos los productos deben tener cantidad mayor a 0',
      );
    }

    // ── Generacion de CxC (salida) / CxP (entrada) al costo total del ajuste ──
    // El monto es el mismo total del reporte PDF: cantidad * costo efectivo,
    // donde costo efectivo = costo + brecha global (solo productos con brecha) si
    // costMode='BREGA'. Se crea DENTRO de la misma transaccion del proceso (atomico).
    let accountPlan:
      | null
      | {
          kind: 'CXC' | 'CXP';
          customerId?: string;
          supplierId?: string;
          amountUsd: number;
          amountBs: number;
          rate: number;
          dueDate: Date | null;
        } = null;

    if (dto?.generateAccount) {
      const config = await this.prisma.companyConfig.findUnique({
        where: { id: 'singleton' },
        select: { bregaGlobalPct: true },
      });
      const bregaGlobalPct = config?.bregaGlobalPct ?? 0;
      const useBrega = adjustment.costMode !== 'COST';
      const effectiveCost = (p: { costUsd: number; bregaApplies: boolean }) =>
        p.costUsd * (1 + (useBrega && p.bregaApplies ? bregaGlobalPct : 0) / 100);
      const totalUsd =
        Math.round(
          adjustment.items.reduce(
            (s, it) => s + it.quantity * effectiveCost(it.product),
            0,
          ) * 100,
        ) / 100;

      if (totalUsd <= 0) {
        throw new BadRequestException(
          'El costo total del ajuste es 0; no se puede generar la cuenta. Verifica que los productos tengan costo.',
        );
      }

      const rateRow = await this.prisma.exchangeRate.findFirst({
        where: { date: caracasDateKey() },
      });
      if (!rateRow) {
        throw new BadRequestException(
          'No hay tasa de cambio registrada para hoy; registrala antes de generar la cuenta.',
        );
      }
      const rate = rateRow.rate;
      const amountBs = Math.round(totalUsd * rate * 100) / 100;
      const dueDate = dto.dueDate ? new Date(dto.dueDate) : null;

      if (adjustment.type === 'OUT') {
        const customerId = dto.customerId || adjustment.customerId;
        if (!customerId) {
          throw new BadRequestException('Selecciona un cliente para generar la CxC.');
        }
        accountPlan = { kind: 'CXC', customerId, amountUsd: totalUsd, amountBs, rate, dueDate };
      } else {
        const supplierId = dto.supplierId || adjustment.supplierId;
        if (!supplierId) {
          throw new BadRequestException('Selecciona un proveedor para generar la CxP.');
        }
        accountPlan = { kind: 'CXP', supplierId, amountUsd: totalUsd, amountBs, rate, dueDate };
      }
    }

    return this.prisma.$transaction(async (tx) => {
      for (const item of adjustment.items) {
        const movementType =
          adjustment.type === 'IN' ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT';
        const quantityDelta =
          adjustment.type === 'IN' ? item.quantity : -item.quantity;

        await tx.stock.upsert({
          where: {
            productId_warehouseId: {
              productId: item.productId,
              warehouseId: adjustment.warehouseId,
            },
          },
          update: {
            quantity: { increment: quantityDelta },
          },
          create: {
            productId: item.productId,
            warehouseId: adjustment.warehouseId,
            quantity: Math.max(0, quantityDelta),
          },
        });

        const updatedStock = await tx.stock.findUnique({
          where: {
            productId_warehouseId: {
              productId: item.productId,
              warehouseId: adjustment.warehouseId,
            },
          },
        });

        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            warehouseId: adjustment.warehouseId,
            type: movementType,
            quantity: quantityDelta,
            costUsd: item.product.costUsd,
            stockAfter: updatedStock?.quantity ?? 0,
            reason: adjustment.description || `Ajuste de inventario ${adjustment.number || '#' + adjustment.id.slice(0, 8)}`,
            reference: adjustment.number || `ADJ-${adjustment.id.slice(0, 8)}`,
            sourceType: 'INVENTORY_ADJUSTMENT',
            sourceId: adjustment.id,
            createdById: userId,
          },
        });
      }

      // Crear la CxC/CxP (si se pidio) con correlativo propio, dentro de la misma tx.
      let generatedAccount: { kind: 'CXC' | 'CXP'; id: string; number: string; amountUsd: number } | null = null;
      if (accountPlan) {
        const yy = new Date().getFullYear().toString().slice(-2);
        // Correlativo visible del ajuste (ADJ-0001). Fallback al id para ajustes viejos sin numero.
        const adjRef = adjustment.number || `ADJ-${adjustment.id.slice(0, 8)}`;
        const desc = `Ajuste de inventario (${adjustment.type === 'OUT' ? 'salida' : 'entrada'}) - ${adjRef}`;
        const cfg = await tx.companyConfig.findUnique({ where: { id: 'singleton' } });

        if (accountPlan.kind === 'CXC') {
          const next = ((cfg as any)?.receivableNextNumber as number) || 1;
          const number = `CXC/${yy}-${next.toString().padStart(6, '0')}`;
          await tx.companyConfig.update({
            where: { id: 'singleton' },
            data: { receivableNextNumber: next + 1 } as any,
          });
          const rec = await tx.receivable.create({
            data: {
              number,
              type: 'MANUAL',
              customerId: accountPlan.customerId!,
              amountUsd: accountPlan.amountUsd,
              amountBs: accountPlan.amountBs,
              exchangeRate: accountPlan.rate,
              dueDate: accountPlan.dueDate,
              description: desc,
              notes: adjustment.description || null,
              createdById: userId,
            },
          });
          generatedAccount = { kind: 'CXC', id: rec.id, number, amountUsd: accountPlan.amountUsd };
        } else {
          const next = ((cfg as any)?.payableNextNumber as number) || 1;
          const number = `CXP/${yy}-${next.toString().padStart(6, '0')}`;
          await tx.companyConfig.update({
            where: { id: 'singleton' },
            data: { payableNextNumber: next + 1 } as any,
          });
          const pay = await tx.payable.create({
            data: {
              number,
              supplierId: accountPlan.supplierId!,
              amountUsd: accountPlan.amountUsd,
              amountBs: accountPlan.amountBs,
              exchangeRate: accountPlan.rate,
              netPayableUsd: accountPlan.amountUsd,
              netPayableBs: accountPlan.amountBs,
              dueDate: accountPlan.dueDate,
              description: desc,
              notes: adjustment.description || null,
              createdById: userId,
            },
          });
          generatedAccount = { kind: 'CXP', id: pay.id, number, amountUsd: accountPlan.amountUsd };
        }
      }

      const updated = await tx.inventoryAdjustment.update({
        where: { id },
        data: {
          status: 'PROCESSED',
          processedById: userId,
          processedAt: new Date(),
          // Reflejar en el ajuste la entidad usada al procesar (por si la cambio/olvido)
          ...(accountPlan?.kind === 'CXC' ? { customerId: accountPlan.customerId } : {}),
          ...(accountPlan?.kind === 'CXP' ? { supplierId: accountPlan.supplierId } : {}),
        },
        include: INCLUDE_DETAIL,
      });

      return { ...updated, generatedAccount };
    });
  }

  async cancel(id: string) {
    const adjustment = await this.prisma.inventoryAdjustment.findUnique({
      where: { id },
    });

    if (!adjustment) {
      throw new NotFoundException(`Ajuste con id ${id} no encontrado`);
    }

    if (adjustment.status !== 'DRAFT') {
      throw new BadRequestException('Solo se pueden cancelar ajustes en estado DRAFT');
    }

    return this.prisma.inventoryAdjustment.update({
      where: { id },
      data: { status: 'CANCELLED' },
      include: INCLUDE_LIST,
    });
  }

  async remove(id: string) {
    const adjustment = await this.prisma.inventoryAdjustment.findUnique({
      where: { id },
    });

    if (!adjustment) {
      throw new NotFoundException(`Ajuste con id ${id} no encontrado`);
    }

    if (adjustment.status === 'PROCESSED') {
      throw new BadRequestException(
        'No se puede eliminar un ajuste ya procesado (afecto el stock)',
      );
    }

    // No hay cascade en el schema: borrar primero los items, luego el ajuste
    await this.prisma.$transaction([
      this.prisma.inventoryAdjustmentItem.deleteMany({
        where: { inventoryAdjustmentId: id },
      }),
      this.prisma.inventoryAdjustment.delete({ where: { id } }),
    ]);

    return { message: 'Ajuste eliminado' };
  }
}
