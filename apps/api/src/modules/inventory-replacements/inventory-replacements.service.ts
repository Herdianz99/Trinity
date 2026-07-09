import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateReplacementDto } from './dto/create-replacement.dto';
import { AddReplacementLineDto } from './dto/add-replacement-line.dto';
import {
  UpdateReplacementLinesDto,
  RemoveReplacementLinesDto,
} from './dto/update-replacement-lines.dto';
import { IvaType } from '@prisma/client';

const IVA_MULTIPLIERS: Record<IvaType, number> = {
  EXEMPT: 1,
  REDUCED: 1.08,
  GENERAL: 1.16,
  SPECIAL: 1.31,
};
const round2 = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10000) / 10000;

const PRODUCT_SELECT = {
  select: { id: true, code: true, name: true, supplierRef: true, costUsd: true },
} as const;

const INCLUDE_LIST = {
  warehouse: { select: { id: true, name: true } },
  _count: { select: { items: true } },
} as const;

const INCLUDE_DETAIL = {
  warehouse: { select: { id: true, name: true } },
  items: {
    include: { outProduct: PRODUCT_SELECT, inProduct: PRODUCT_SELECT },
    orderBy: { id: 'asc' } as const,
  },
} as const;

@Injectable()
export class InventoryReplacementsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Correlativo REP-0001 con SELECT FOR UPDATE (regla de correlativos). */
  private async generateNumber(tx: any): Promise<string> {
    const result = await tx.$queryRaw<{ max: number | null }[]>`
      SELECT MAX(CAST(SPLIT_PART("number", '-', 2) AS INTEGER)) as max FROM (
        SELECT "number" FROM "InventoryReplacement" FOR UPDATE
      ) sub
    `;
    const next = (result[0]?.max || 0) + 1;
    return `REP-${next.toString().padStart(4, '0')}`;
  }

  async create(dto: CreateReplacementDto, userId: string) {
    // Fecha-calendario elegida por el usuario, anclada a medianoche UTC (date-only).
    const date = dto.date ? new Date(`${dto.date}T00:00:00.000Z`) : new Date();

    return this.prisma.$transaction(async (tx) => {
      const number = await this.generateNumber(tx);
      return tx.inventoryReplacement.create({
        data: {
          number,
          warehouseId: dto.warehouseId,
          date,
          notes: dto.notes || null,
          status: 'DRAFT',
          createdById: userId,
        },
        include: INCLUDE_LIST,
      });
    });
  }

  async findAll(filters?: { status?: string; warehouseId?: string }) {
    const where: any = {};
    if (filters?.status) where.status = filters.status;
    if (filters?.warehouseId) where.warehouseId = filters.warehouseId;

    return this.prisma.inventoryReplacement.findMany({
      where,
      include: INCLUDE_LIST,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const replacement = await this.prisma.inventoryReplacement.findUnique({
      where: { id },
      include: INCLUDE_DETAIL,
    });
    if (!replacement) {
      throw new NotFoundException(`Reemplazo con id ${id} no encontrado`);
    }
    return replacement;
  }

  private async assertDraft(id: string) {
    const replacement = await this.prisma.inventoryReplacement.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!replacement) {
      throw new NotFoundException(`Reemplazo con id ${id} no encontrado`);
    }
    if (replacement.status !== 'DRAFT') {
      throw new BadRequestException(
        'Solo se pueden modificar reemplazos en estado borrador',
      );
    }
  }

  async addLine(id: string, dto: AddReplacementLineDto) {
    await this.assertDraft(id);

    if (dto.outProductId === dto.inProductId) {
      throw new BadRequestException(
        'El articulo que sale y el que entra no pueden ser el mismo',
      );
    }

    await this.prisma.inventoryReplacementItem.create({
      data: {
        replacementId: id,
        outProductId: dto.outProductId,
        outQuantity: dto.outQuantity,
        inProductId: dto.inProductId,
        inQuantity: dto.inQuantity,
      },
    });

    return this.findOne(id);
  }

  async updateLines(id: string, dto: UpdateReplacementLinesDto) {
    await this.assertDraft(id);

    return this.prisma.$transaction(async (tx) => {
      for (const line of dto.items) {
        const existing = await tx.inventoryReplacementItem.findFirst({
          where: { id: line.id, replacementId: id },
          select: { id: true },
        });
        if (!existing) {
          throw new BadRequestException(
            `La linea ${line.id} no pertenece a este reemplazo`,
          );
        }
        await tx.inventoryReplacementItem.update({
          where: { id: line.id },
          data: { outQuantity: line.outQuantity, inQuantity: line.inQuantity },
        });
      }
      return tx.inventoryReplacement.findUnique({
        where: { id },
        include: INCLUDE_DETAIL,
      });
    });
  }

  async removeLines(id: string, dto: RemoveReplacementLinesDto) {
    await this.assertDraft(id);
    const result = await this.prisma.inventoryReplacementItem.deleteMany({
      where: { id: { in: dto.itemIds }, replacementId: id },
    });
    return { removed: result.count };
  }

  async process(id: string, userId: string) {
    const replacement = await this.prisma.inventoryReplacement.findUnique({
      where: { id },
      include: {
        items: { include: { outProduct: true, inProduct: true } },
      },
    });

    if (!replacement) {
      throw new NotFoundException(`Reemplazo con id ${id} no encontrado`);
    }
    if (replacement.status !== 'DRAFT') {
      throw new BadRequestException(
        'Solo se pueden procesar reemplazos en estado borrador',
      );
    }
    if (replacement.items.length === 0) {
      throw new BadRequestException('El reemplazo no tiene lineas');
    }

    // Todas las cantidades deben ser > 0
    const invalidQty = replacement.items.some(
      (i) => i.outQuantity <= 0 || i.inQuantity <= 0,
    );
    if (invalidQty) {
      throw new BadRequestException(
        'Todas las lineas deben tener cantidad mayor a 0 en ambos lados',
      );
    }

    const warehouseId = replacement.warehouseId;

    // Validar stock suficiente del articulo que SALE (no se puede sacar lo que no hay).
    // Se agrupa por producto por si un mismo articulo sale en varias lineas.
    const outNeeded = new Map<string, number>();
    for (const item of replacement.items) {
      outNeeded.set(
        item.outProductId,
        (outNeeded.get(item.outProductId) || 0) + item.outQuantity,
      );
    }
    for (const [productId, needed] of outNeeded) {
      const stock = await this.prisma.stock.findUnique({
        where: { productId_warehouseId: { productId, warehouseId } },
        select: { quantity: true },
      });
      const available = stock?.quantity ?? 0;
      if (available < needed) {
        const prod = replacement.items.find((i) => i.outProductId === productId)
          ?.outProduct;
        throw new BadRequestException(
          `Stock insuficiente de "${prod?.name ?? productId}": disponible ${available}, requiere ${needed}`,
        );
      }
    }

    // Costo del que ENTRA = valor del que SALE / cantidad que entra.
    // Los "metros" no se compran: heredan el costo de los "rollos" que se consumen,
    // asi su utilidad es real. Si un mismo producto entra en varias lineas, se agrega
    // (valor total que entra / cantidad total que entra).
    const enterAgg = new Map<string, { value: number; qty: number }>();
    for (const item of replacement.items) {
      const valueLeaving = item.outQuantity * item.outProduct.costUsd;
      const agg = enterAgg.get(item.inProductId) || { value: 0, qty: 0 };
      agg.value += valueLeaving;
      agg.qty += item.inQuantity;
      enterAgg.set(item.inProductId, agg);
    }
    const derivedCostOf = (inProductId: string): number => {
      const agg = enterAgg.get(inProductId);
      if (!agg || agg.qty <= 0) return 0;
      return round4(agg.value / agg.qty);
    };

    const config = await this.prisma.companyConfig.findUnique({
      where: { id: 'singleton' },
    });
    const bregaGlobalPct = config?.bregaGlobalPct || 0;

    return this.prisma.$transaction(async (tx) => {
      for (const item of replacement.items) {
        const inCost = derivedCostOf(item.inProductId);

        // SALIDA del articulo que sale
        await tx.stock.update({
          where: {
            productId_warehouseId: { productId: item.outProductId, warehouseId },
          },
          data: { quantity: { decrement: item.outQuantity } },
        });
        const outStock = await tx.stock.findUnique({
          where: {
            productId_warehouseId: { productId: item.outProductId, warehouseId },
          },
        });
        await tx.stockMovement.create({
          data: {
            productId: item.outProductId,
            warehouseId,
            type: 'REPLACEMENT_OUT',
            quantity: -item.outQuantity,
            costUsd: item.outProduct.costUsd,
            stockAfter: outStock?.quantity ?? 0,
            reason: `Reemplazo ${replacement.number} (salida)`,
            reference: replacement.number,
            sourceType: 'REPLACEMENT',
            sourceId: replacement.id,
            createdById: userId,
          },
        });

        // ENTRADA del articulo que entra
        await tx.stock.upsert({
          where: {
            productId_warehouseId: { productId: item.inProductId, warehouseId },
          },
          update: { quantity: { increment: item.inQuantity } },
          create: {
            productId: item.inProductId,
            warehouseId,
            quantity: item.inQuantity,
          },
        });
        const inStock = await tx.stock.findUnique({
          where: {
            productId_warehouseId: { productId: item.inProductId, warehouseId },
          },
        });
        await tx.stockMovement.create({
          data: {
            productId: item.inProductId,
            warehouseId,
            type: 'REPLACEMENT_IN',
            quantity: item.inQuantity,
            costUsd: inCost,
            stockAfter: inStock?.quantity ?? 0,
            reason: `Reemplazo ${replacement.number} (entrada)`,
            reference: replacement.number,
            sourceType: 'REPLACEMENT',
            sourceId: replacement.id,
            createdById: userId,
          },
        });

        // Congelar costos en la linea (para el reporte historico)
        await tx.inventoryReplacementItem.update({
          where: { id: item.id },
          data: { outCostUsd: item.outProduct.costUsd, inCostUsd: inCost },
        });
      }

      // Actualizar costo y recalcular precio de cada articulo que ENTRA
      // (mismo criterio que una compra: costo + brega + ganancia% + IVA)
      for (const [inProductId] of enterAgg) {
        const product = await tx.product.findUnique({ where: { id: inProductId } });
        if (!product) continue;
        // Costo manual: se congela, el reemplazo no le cambia el costUsd (ni el precio derivado).
        const inCost = product.manualCost ? product.costUsd : derivedCostOf(inProductId);
        const bregaPct = product.bregaApplies ? bregaGlobalPct : 0;
        const ivaMult = IVA_MULTIPLIERS[product.ivaType];
        const priceDetal = round2(
          inCost * (1 + bregaPct / 100) * (1 + product.gananciaPct / 100) * ivaMult,
        );
        const priceMayor = round2(
          inCost * (1 + bregaPct / 100) * (1 + product.gananciaMayorPct / 100) * ivaMult,
        );
        await tx.product.update({
          where: { id: inProductId },
          data: { costUsd: inCost, priceDetal, priceMayor },
        });
      }

      return tx.inventoryReplacement.update({
        where: { id },
        data: {
          status: 'PROCESSED',
          processedById: userId,
          processedAt: new Date(),
        },
        include: INCLUDE_DETAIL,
      });
    });
  }

  async cancel(id: string) {
    await this.assertDraft(id);
    return this.prisma.inventoryReplacement.update({
      where: { id },
      data: { status: 'CANCELLED' },
      include: INCLUDE_LIST,
    });
  }

  async remove(id: string) {
    const replacement = await this.prisma.inventoryReplacement.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!replacement) {
      throw new NotFoundException(`Reemplazo con id ${id} no encontrado`);
    }
    if (replacement.status === 'PROCESSED') {
      throw new BadRequestException(
        'No se puede eliminar un reemplazo ya procesado (afecto el stock)',
      );
    }
    await this.prisma.$transaction([
      this.prisma.inventoryReplacementItem.deleteMany({
        where: { replacementId: id },
      }),
      this.prisma.inventoryReplacement.delete({ where: { id } }),
    ]);
    return { message: 'Reemplazo eliminado' };
  }
}
