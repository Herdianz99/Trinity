import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { QueryProductsDto } from './dto/query-products.dto';
import { PriceAdjustmentQueryDto } from './dto/price-adjustment-query.dto';
import { ApplyPriceAdjustmentDto } from './dto/apply-price-adjustment.dto';
import { IvaType, Prisma } from '@prisma/client';

const IVA_MULTIPLIERS: Record<IvaType, number> = {
  EXEMPT: 1,
  REDUCED: 1.08,
  GENERAL: 1.16,
  SPECIAL: 1.31,
};

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  private async calculatePrices(
    costUsd: number,
    gananciaPct: number,
    gananciaMayorPct: number,
    ivaType: IvaType,
    bregaApplies: boolean,
  ) {
    const config = await this.prisma.companyConfig.findUnique({
      where: { id: 'singleton' },
    });
    const bregaPct = bregaApplies ? (config?.bregaGlobalPct || 0) : 0;
    const ivaMultiplier = IVA_MULTIPLIERS[ivaType];

    const priceDetal = costUsd * (1 + bregaPct / 100) * (1 + gananciaPct / 100) * ivaMultiplier;
    const priceMayor = costUsd * (1 + bregaPct / 100) * (1 + gananciaMayorPct / 100) * ivaMultiplier;

    return {
      priceDetal: Math.round(priceDetal * 100) / 100,
      priceMayor: Math.round(priceMayor * 100) / 100,
    };
  }

  private async generateCodeFromCategory(categoryId: string): Promise<string> {
    // Use SELECT FOR UPDATE to safely increment correlative
    const result = await this.prisma.$queryRaw<any[]>`
      UPDATE "Category"
      SET "lastProductNumber" = "lastProductNumber" + 1
      WHERE id = ${categoryId}
      RETURNING code, "lastProductNumber"
    `;
    if (!result[0]?.code) {
      throw new ConflictException('La categoria no tiene codigo asignado');
    }
    return `${result[0].code}${String(result[0].lastProductNumber).padStart(5, '0')}`;
  }

  async create(dto: CreateProductDto) {
    if (dto.barcode) {
      const existing = await this.prisma.product.findUnique({ where: { barcode: dto.barcode } });
      if (existing) throw new ConflictException('El codigo de barras ya existe');
    }

    let code = dto.code;
    if (!code) {
      if (!dto.categoryId) {
        throw new BadRequestException('Se requiere categoria para generar el codigo automaticamente');
      }
      code = await this.generateCodeFromCategory(dto.categoryId);
    } else {
      const existingCode = await this.prisma.product.findUnique({ where: { code } });
      if (existingCode) throw new ConflictException('El codigo de producto ya existe');
    }

    // Use company defaults if ganancia not specified
    const config = await this.prisma.companyConfig.findUnique({ where: { id: 'singleton' } });
    const gananciaPct = dto.gananciaPct ?? config?.defaultGananciaPct ?? 0;
    const gananciaMayorPct = dto.gananciaMayorPct ?? config?.defaultGananciaMayorPct ?? 0;

    const prices = await this.calculatePrices(
      dto.costUsd || 0,
      gananciaPct,
      gananciaMayorPct,
      dto.ivaType || IvaType.GENERAL,
      dto.bregaApplies !== false,
    );

    return this.prisma.product.create({
      data: {
        ...dto,
        code,
        gananciaPct,
        gananciaMayorPct,
        priceDetal: prices.priceDetal,
        priceMayor: prices.priceMayor,
      },
      include: {
        category: true,
        brand: true,
        supplier: true,
        stock: { include: { warehouse: true } },
      },
    });
  }

  async findAll(query: QueryProductsDto) {
    const { categoryId, brandId, supplierId, search, lowStock, isActive, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.ProductWhereInput = {};

    if (categoryId) where.categoryId = categoryId;
    if (brandId) where.brandId = brandId;
    if (supplierId) where.supplierId = supplierId;
    if (isActive !== undefined) where.isActive = isActive;

    if (lowStock) {
      where.stock = {
        every: {
          quantity: { lte: 0 },
        },
      };
      // Use raw query approach for low stock filter
      where.AND = [
        {
          OR: [
            { stock: { none: {} } },
            {
              minStock: { gt: 0 },
            },
          ],
        },
      ];
    }

    // Full-text search using raw SQL if search term provided
    if (search) {
      const searchResults = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Product"
        WHERE "searchVector" @@ plainto_tsquery('spanish', ${search})
        OR name ILIKE ${'%' + search + '%'}
        OR code ILIKE ${'%' + search + '%'}
        OR barcode ILIKE ${'%' + search + '%'}
        OR "supplierRef" ILIKE ${'%' + search + '%'}
      `;
      const ids = searchResults.map((r) => r.id);
      if (ids.length === 0) {
        return { data: [], total: 0, page, limit, totalPages: 0 };
      }
      where.id = { in: ids };
    }

    // For low stock, use a different approach
    if (lowStock && !search) {
      delete where.stock;
      delete where.AND;
      // Get products where total stock < minStock
      const lowStockProducts = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT p.id FROM "Product" p
        LEFT JOIN (
          SELECT "productId", COALESCE(SUM(quantity), 0) as total_stock
          FROM "Stock"
          GROUP BY "productId"
        ) s ON s."productId" = p.id
        WHERE COALESCE(s.total_stock, 0) < p."minStock"
        AND p."isActive" = true
      `;
      const ids = lowStockProducts.map((r) => r.id);
      if (ids.length === 0) {
        return { data: [], total: 0, page, limit, totalPages: 0 };
      }
      where.id = where.id ? { in: [...new Set([...(where.id as any).in || [], ...ids])] } : { in: ids };
    }

    const [data, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
        include: {
          category: { include: { printArea: { select: { id: true, name: true } } } },
          brand: true,
          supplier: { select: { id: true, name: true } },
          stock: { include: { warehouse: { select: { id: true, name: true } } } },
        },
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async search(q: string) {
    if (!q || q.trim().length === 0) return [];

    const results = await this.prisma.$queryRaw<any[]>`
      SELECT p.id, p.code, p.name, p."priceDetal", p."priceMayor",
        COALESCE((SELECT SUM(s.quantity) FROM "Stock" s WHERE s."productId" = p.id), 0) as "totalStock"
      FROM "Product" p
      WHERE p."isActive" = true
      AND (
        p."searchVector" @@ plainto_tsquery('spanish', ${q})
        OR p.name ILIKE ${'%' + q + '%'}
        OR p.code ILIKE ${'%' + q + '%'}
        OR p.barcode ILIKE ${'%' + q + '%'}
        OR p."supplierRef" ILIKE ${'%' + q + '%'}
      )
      ORDER BY
        CASE WHEN p.code ILIKE ${'%' + q + '%'} THEN 0
             WHEN p.barcode = ${q} THEN 0
             ELSE 1
        END,
        p.name ASC
      LIMIT 20
    `;

    return results.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      priceDetal: Number(r.priceDetal),
      priceMayor: Number(r.priceMayor),
      totalStock: Number(r.totalStock),
    }));
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        brand: true,
        supplier: true,
        stock: { include: { warehouse: true } },
      },
    });
    if (!product) throw new NotFoundException('Producto no encontrado');
    return product;
  }

  async findByCode(code: string) {
    const product = await this.prisma.product.findUnique({
      where: { code },
      include: {
        category: true,
        brand: true,
        supplier: true,
        stock: { include: { warehouse: true } },
      },
    });
    if (!product) throw new NotFoundException('Producto no encontrado');
    return product;
  }

  async findPurchaseHistory(productId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const where = { productId };
    const [items, total] = await Promise.all([
      this.prisma.purchaseOrderItem.findMany({
        where,
        include: {
          purchaseOrder: {
            include: {
              supplier: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { purchaseOrder: { createdAt: 'desc' } },
        skip,
        take: limit,
      }),
      this.prisma.purchaseOrderItem.count({ where }),
    ]);
    return {
      data: items.map((item) => ({
        id: item.id,
        date: item.purchaseOrder.createdAt,
        orderNumber: item.purchaseOrder.number,
        orderId: item.purchaseOrder.id,
        status: item.purchaseOrder.status,
        supplier: item.purchaseOrder.supplier.name,
        quantity: item.receivedQty,
        costUsd: item.costUsd,
        totalUsd: item.totalUsd,
      })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async update(id: string, dto: UpdateProductDto) {
    const existing = await this.findOne(id);

    if (dto.barcode && dto.barcode !== existing.barcode) {
      const dup = await this.prisma.product.findUnique({ where: { barcode: dto.barcode } });
      if (dup && dup.id !== id) throw new ConflictException('El codigo de barras ya existe');
    }

    // Recalculate prices
    const costUsd = dto.costUsd ?? existing.costUsd;
    const gananciaPct = dto.gananciaPct ?? existing.gananciaPct;
    const gananciaMayorPct = dto.gananciaMayorPct ?? existing.gananciaMayorPct;
    const ivaType = dto.ivaType ?? existing.ivaType;
    const bregaApplies = dto.bregaApplies ?? existing.bregaApplies;

    const prices = await this.calculatePrices(costUsd, gananciaPct, gananciaMayorPct, ivaType, bregaApplies);

    const { code, ...updateData } = dto;

    return this.prisma.product.update({
      where: { id },
      data: {
        ...updateData,
        priceDetal: prices.priceDetal,
        priceMayor: prices.priceMayor,
      },
      include: {
        category: true,
        brand: true,
        supplier: true,
        stock: { include: { warehouse: true } },
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.product.update({
      where: { id },
      data: { isActive: false },
    });
    return { message: 'Producto desactivado' };
  }

  async importProducts(products: CreateProductDto[]) {
    const results = { created: 0, errors: [] as string[] };

    for (const dto of products) {
      try {
        await this.create(dto);
        results.created++;
      } catch (err: any) {
        results.errors.push(`${dto.name || dto.code}: ${err.message}`);
      }
    }

    return results;
  }

  private buildPriceAdjustmentWhere(query: PriceAdjustmentQueryDto): Prisma.ProductWhereInput {
    const where: Prisma.ProductWhereInput = { isActive: true };

    if (query.categoryId) {
      where.OR = [
        { categoryId: query.categoryId },
        { category: { parentId: query.categoryId } },
      ];
    }
    if (query.subcategoryId) {
      where.categoryId = query.subcategoryId;
      delete where.OR;
    }
    if (query.brandId) where.brandId = query.brandId;
    if (query.supplierId) where.supplierId = query.supplierId;
    if (query.costMin !== undefined || query.costMax !== undefined) {
      where.costUsd = {};
      if (query.costMin !== undefined) (where.costUsd as any).gte = query.costMin;
      if (query.costMax !== undefined) (where.costUsd as any).lte = query.costMax;
    }

    return where;
  }

  async findForPriceAdjustment(query: PriceAdjustmentQueryDto) {
    const where = this.buildPriceAdjustmentWhere(query);

    const products = await this.prisma.product.findMany({
      where,
      take: 500,
      orderBy: { name: 'asc' },
      select: {
        id: true,
        code: true,
        name: true,
        costUsd: true,
        gananciaPct: true,
        gananciaMayorPct: true,
        priceDetal: true,
        priceMayor: true,
        ivaType: true,
        bregaApplies: true,
        category: { select: { id: true, name: true } },
        brand: { select: { id: true, name: true } },
        supplier: { select: { id: true, name: true } },
      },
    });

    return products;
  }

  async applyPriceAdjustment(dto: ApplyPriceAdjustmentDto, userId: string) {
    const where = this.buildPriceAdjustmentWhere(dto.filters);

    return this.prisma.$transaction(async (tx) => {
      const products = await tx.product.findMany({ where });

      if (products.length === 0) {
        throw new BadRequestException('No hay productos que coincidan con los filtros');
      }

      const config = await tx.companyConfig.findUnique({
        where: { id: 'singleton' },
      });

      for (const product of products) {
        let newGananciaPct = product.gananciaPct;
        let newGananciaMayorPct = product.gananciaMayorPct;

        if (dto.gananciaPct !== undefined) {
          newGananciaPct = dto.adjustmentType === 'REPLACE'
            ? dto.gananciaPct
            : product.gananciaPct + dto.gananciaPct;
        }
        if (dto.gananciaMayorPct !== undefined) {
          newGananciaMayorPct = dto.adjustmentType === 'REPLACE'
            ? dto.gananciaMayorPct
            : product.gananciaMayorPct + dto.gananciaMayorPct;
        }

        // Ensure percentages don't go below 0
        if (newGananciaPct < 0) newGananciaPct = 0;
        if (newGananciaMayorPct < 0) newGananciaMayorPct = 0;

        const bregaPct = product.bregaApplies ? (config?.bregaGlobalPct || 0) : 0;
        const ivaMultiplier = IVA_MULTIPLIERS[product.ivaType];

        const priceDetal = product.costUsd * (1 + bregaPct / 100) * (1 + newGananciaPct / 100) * ivaMultiplier;
        const priceMayor = product.costUsd * (1 + bregaPct / 100) * (1 + newGananciaMayorPct / 100) * ivaMultiplier;

        await tx.product.update({
          where: { id: product.id },
          data: {
            gananciaPct: newGananciaPct,
            gananciaMayorPct: newGananciaMayorPct,
            priceDetal: Math.round(priceDetal * 100) / 100,
            priceMayor: Math.round(priceMayor * 100) / 100,
          },
        });
      }

      const log = await tx.priceAdjustmentLog.create({
        data: {
          filters: dto.filters as any,
          adjustmentType: dto.adjustmentType,
          gananciaPct: dto.gananciaPct,
          gananciaMayorPct: dto.gananciaMayorPct,
          productsAffected: products.length,
          createdById: userId,
        },
      });

      return { productsAffected: products.length, log };
    }, { timeout: 60000 });
  }

  async getPriceAdjustmentHistory() {
    const logs = await this.prisma.priceAdjustmentLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    // Enrich with user names
    const userIds = [...new Set(logs.map((l) => l.createdById))];
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u.name]));

    return logs.map((log) => ({
      ...log,
      createdByName: userMap.get(log.createdById) || 'Desconocido',
    }));
  }
}
