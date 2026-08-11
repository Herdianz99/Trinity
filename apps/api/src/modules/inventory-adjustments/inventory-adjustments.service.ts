import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { productSearchTsQuery } from '../../common/product-search';
import { resolveBregaPct, effectiveCost as effCost } from '../../common/pricing';
import { buildCategoryBregaMap } from '../../common/category-brega';
import { CreateInventoryAdjustmentDto } from './dto/create-inventory-adjustment.dto';
import { UpdateAdjustmentItemsDto } from './dto/update-adjustment-items.dto';
import { AddItemsByFilterDto, AddItemsByIdsDto } from './dto/add-items.dto';
import { RemoveItemsDto } from './dto/remove-items.dto';
import { ProcessAdjustmentDto } from './dto/process-adjustment.dto';
import { caracasDateKey } from '../../common/timezone';
import { DynamicKeysService } from '../dynamic-keys/dynamic-keys.service';

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
    // Orden en que se agregaron (el id cuid es cronológico), no alfabético: así los ítems
    // quedan uno debajo del otro a medida que se agregan.
    orderBy: { id: 'asc' } as const,
  },
  warehouse: true,
  customer: { select: { id: true, name: true } },
  supplier: { select: { id: true, name: true } },
} as const;

@Injectable()
export class InventoryAdjustmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dynamicKeysService: DynamicKeysService,
  ) {}

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
      const tsq = productSearchTsQuery(dto.search);
      const like = `%${dto.search}%`;
      const searchResults = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Product"
        WHERE "isActive" = true
        AND (
          "searchVector" @@ to_tsquery('spanish', ${tsq})
          OR code ILIKE ${like}
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
          data: {
            quantity: item.quantity,
            // Costo editado a mano (si viene). undefined = no tocar el valor existente.
            ...(item.unitCostUsd !== undefined ? { unitCostUsd: item.unitCostUsd } : {}),
          },
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
      const catBregaMap = await buildCategoryBregaMap(this.prisma);
      // Costo efectivo por item: el editado a mano manda; si no, costo (+ brecha) del producto.
      const effectiveCost = (it: {
        unitCostUsd: number | null;
        product: { costUsd: number; bregaApplies: boolean; categoryId: string | null };
      }) => {
        if (it.unitCostUsd != null) return it.unitCostUsd;
        const bregaPct = useBrega
          ? resolveBregaPct({
              bregaApplies: it.product.bregaApplies,
              categoryBregaPct: it.product.categoryId ? (catBregaMap.get(it.product.categoryId) ?? 0) : 0,
              bregaGlobalPct,
            })
          : 0;
        return effCost(it.product.costUsd, bregaPct);
      };
      const totalUsd =
        Math.round(
          adjustment.items.reduce(
            (s, it) => s + it.quantity * effectiveCost(it),
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

  /**
   * Anula un ajuste YA PROCESADO: revierte el stock que movió (entrada o salida),
   * cancela la CxC/CxP que generó (conserva su número) y marca el ajuste CANCELLED.
   * Requiere clave dinámica con permiso "Ajuste inventario" (MANUAL_STOCK_ADJUSTMENT).
   * - Permite dejar el stock en negativo (si la mercancía ya se movió).
   * - BLOQUEA si la cuenta generada ya tiene pagos / está en un recibo o programación.
   */
  async voidAdjustment(id: string, userId: string, dynamicKey?: string) {
    const adjustment = await this.prisma.inventoryAdjustment.findUnique({
      where: { id },
      include: { items: { include: { product: { select: { id: true, costUsd: true } } } } },
    });
    if (!adjustment) {
      throw new NotFoundException(`Ajuste con id ${id} no encontrado`);
    }
    if (adjustment.status !== 'PROCESSED') {
      throw new BadRequestException('Solo se pueden anular ajustes procesados.');
    }

    // Correlativo visible del ajuste (mismo que usó process() para la descripción de la cuenta).
    const adjRef = adjustment.number || `ADJ-${adjustment.id.slice(0, 8)}`;

    // ── Localizar la CxC/CxP generada por este ajuste ──
    // No hay FK: process() la crea con description "Ajuste de inventario (...) - <adjRef>".
    const receivable =
      adjustment.type === 'OUT'
        ? await this.prisma.receivable.findFirst({
            where: {
              type: 'MANUAL',
              description: { endsWith: `- ${adjRef}` },
              status: { not: 'CANCELLED' },
            },
            select: { id: true, number: true, status: true },
          })
        : null;
    const payable =
      adjustment.type === 'IN'
        ? await this.prisma.payable.findFirst({
            where: {
              description: { endsWith: `- ${adjRef}` },
              status: { not: 'CANCELLED' },
            },
            select: { id: true, number: true, status: true },
          })
        : null;

    // ── Bloquear si la cuenta ya tiene pagos / movimientos ──
    if (receivable) {
      const [pays, receiptItems] = await Promise.all([
        this.prisma.receivablePayment.count({ where: { receivableId: receivable.id } }),
        this.prisma.receiptItem.count({ where: { receivableId: receivable.id } }),
      ]);
      if (pays > 0 || receiptItems > 0 || receivable.status === 'PAID' || receivable.status === 'PARTIAL') {
        throw new BadRequestException(
          `No se puede anular: la CxC ${receivable.number} ya tiene pagos o movimientos de cobro. Reversa esos pagos primero.`,
        );
      }
    }
    if (payable) {
      const [pays, receiptItems, scheduleItems] = await Promise.all([
        this.prisma.payablePayment.count({ where: { payableId: payable.id } }),
        this.prisma.receiptItem.count({ where: { payableId: payable.id } }),
        this.prisma.paymentScheduleItem.count({ where: { payableId: payable.id } }),
      ]);
      if (pays > 0 || receiptItems > 0 || scheduleItems > 0 || payable.status === 'PAID' || payable.status === 'PARTIAL') {
        throw new BadRequestException(
          `No se puede anular: la CxP ${payable.number} ya tiene pagos o está en un recibo/programación de pago. Reversa esos pagos primero.`,
        );
      }
    }

    // ── Clave dinámica (reutiliza el permiso "Ajuste inventario") ──
    await this.dynamicKeysService.validate({
      key: dynamicKey || '',
      permission: 'MANUAL_STOCK_ADJUSTMENT',
      action: `Anular ajuste procesado ${adjRef}`,
      entityType: 'InventoryAdjustment',
      entityId: id,
    });

    // ── Reversa atómica ──
    return this.prisma.$transaction(async (tx) => {
      for (const item of adjustment.items) {
        // Reversa el delta original: IN sumó (+qty) → resta; OUT restó (−qty) → suma.
        const reverseDelta = adjustment.type === 'IN' ? -item.quantity : item.quantity;
        const reverseType = adjustment.type === 'IN' ? 'ADJUSTMENT_OUT' : 'ADJUSTMENT_IN';

        await tx.stock.upsert({
          where: {
            productId_warehouseId: {
              productId: item.productId,
              warehouseId: adjustment.warehouseId,
            },
          },
          // Permite quedar en negativo (decisión de negocio): sin Math.max.
          update: { quantity: { increment: reverseDelta } },
          create: {
            productId: item.productId,
            warehouseId: adjustment.warehouseId,
            quantity: reverseDelta,
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

        // Movimiento compensatorio (no borro el original → se conserva la auditoría).
        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            warehouseId: adjustment.warehouseId,
            type: reverseType,
            quantity: reverseDelta,
            costUsd: item.product.costUsd,
            stockAfter: updatedStock?.quantity ?? 0,
            reason: `Anulación de ajuste ${adjRef}`,
            reference: adjRef,
            sourceType: 'INVENTORY_ADJUSTMENT',
            sourceId: adjustment.id,
            createdById: userId,
          },
        });
      }

      // ── Cancelar la cuenta generada (conserva el número) ──
      let cancelledAccount: { kind: 'CXC' | 'CXP'; number: string | null } | null = null;
      if (receivable) {
        await tx.receivable.update({ where: { id: receivable.id }, data: { status: 'CANCELLED' } });
        cancelledAccount = { kind: 'CXC', number: receivable.number };
      } else if (payable) {
        await tx.payable.update({ where: { id: payable.id }, data: { status: 'CANCELLED' } });
        cancelledAccount = { kind: 'CXP', number: payable.number };
      }

      const updated = await tx.inventoryAdjustment.update({
        where: { id },
        data: { status: 'CANCELLED' },
        include: INCLUDE_LIST,
      });

      return { ...updated, cancelledAccount };
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

    // Un ajuste ANULADO (fue procesado y luego cancelado) conserva su registro para
    // auditoría: no se puede borrar. Solo se elimina un borrador cancelado (sin procesar).
    if (adjustment.status === 'CANCELLED' && adjustment.processedAt) {
      throw new BadRequestException(
        'No se puede eliminar un ajuste anulado; el registro debe conservarse.',
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
